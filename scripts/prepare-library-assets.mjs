import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { libraryDefinitions } from '../src/libraryDefinitions.js';
import { createArchive } from '../src/avr-format.js';
import { compileInterruptRuntime } from './compile-core-extension.mjs';

import {preparePbCore} from './prepare-pb-core.mjs';
const packageRoot = 'node_modules/@horang-corp/avr-gcc-wasm';
const destination = 'public/avr/curated';
// Generated, reproducible build assets only: remove superseded hashed bundles.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const sha = data => createHash('sha256').update(data).digest('hex');
async function bundle(prefix, value) {
  const bytes = JSON.stringify(value);
  const hash = sha(bytes);
  const file = `${prefix}-${hash.slice(0, 16)}.json`;
  await writeFile(path.join(destination, file), bytes);
  return { file: `curated/${file}`, hash };
}
async function walk(dir) {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || ['examples', 'extras', 'docs', 'test', 'tests'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
const locks = JSON.parse(await readFile('vendor/sources.lock.json', 'utf8'));
const libraries = [];
for (const definition of libraryDefinitions) {
  const dir = `vendor/libraries/${definition.id}`;
  const props = Object.fromEntries((await readFile(`${dir}/library.properties`, 'utf8')).split(/\r?\n/).filter(s => s.includes('=')).map(s => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
  const files = {};
  for (const full of await walk(path.join(dir, definition.root))) {
    const relative = full.slice(dir.length + 1);
    if (!/\.(h|hpp|hxx|inc|c|cpp|cc|S)$/.test(relative)) continue;
    if (definition.id === 'servo' && relative !== 'src/Servo.h' && !relative.startsWith('src/avr/')) continue;
    files[`/libraries/${definition.id}/${relative}`] = await readFile(full, 'utf8');
  }
  const sources = definition.sources.map(s => `/libraries/${definition.id}/${s}`);
  for (const source of sources) if (!(source in files)) throw new Error(`Required library source is missing: ${source}`);
  const includeDirs = [`/libraries/${definition.id}${definition.root ? '/' + definition.root : ''}`];
  const packed = await bundle(definition.id, { files, sources, includeDirs });
  const version = props.version;
  const provenance = locks.find(l => l.id === definition.id) || locks.find(l => l.id === 'arduino-core');
  // Resolve subpath includes too (for example GFX Fonts/FreeMono9pt7b.h).
  const headers = [...new Set([...definition.headers, ...Object.keys(files).filter(p => /\.(h|hpp)$/.test(p)).map(p => p.slice(includeDirs[0].length + 1))])];
  libraries.push({ ...definition, version, headers, dependencies: definition.dependencies || [], ...packed, provenance });
}
const original = JSON.parse(await readFile(`${packageRoot}/assets/manifest.json`, 'utf8'));
const headers = {};
for (const p of original.headerFiles) {
  if (!(p.startsWith('/arduino/core/') || p.startsWith('/arduino/variant/') || p.startsWith('/sysroot/'))) continue;
  if (/\/avr\/io[^/]+\.h$/.test(p) && !p.endsWith('/iom328p.h')) continue;
  headers[p] = await readFile(`${packageRoot}/assets/fs${p}`, 'utf8');
}
const coreObjects = (await readdir(`${packageRoot}/assets/objects`)).filter(p => p.startsWith('core_') && p.endsWith('.o')).sort();
const objects = await Promise.all(coreObjects.map(async p => [p, new Uint8Array(await readFile(`${packageRoot}/assets/objects/${p}`))]));
// The pinned package omits WInterrupts.o. Add the genuine upstream implementation
// as an archive member: it is linked only when external interrupts are used.
objects.push(['core_WInterrupts.o', await compileInterruptRuntime(packageRoot, headers)]);
coreObjects.push('core_WInterrupts.o');
const binary = { '/libs/arduino-core.a': Buffer.from(createArchive(objects)).toString('base64') };
for (const p of original.libs) binary[p] = (await readFile(`${packageRoot}/assets${p}`)).toString('base64');
for (const full of await walk(`${packageRoot}/assets/ldscripts`)) binary[`/ldscripts/${path.basename(full)}`] = (await readFile(full)).toString('base64');
const core = await bundle('uno-core', { headers, binary, objectNames: coreObjects });
// Nano's upstream variant only changes NUM_ANALOG_INPUTS; the digital tables,
// MCU, clock and precompiled core routines are identical to the proven Uno core.
const standardPins = await readFile('vendor/arduino-core/variants/standard/pins_arduino.h','utf8');
if (standardPins !== headers['/arduino/variant/pins_arduino.h']) throw new Error('Review core/variant compatibility before adding Nano.');
const nanoPins = await readFile('vendor/arduino-core/variants/eightanaloginputs/pins_arduino.h','utf8');
const nanoVariant = await bundle('nano-variant',{headers:{'/arduino/variant/pins_arduino.h':nanoPins,'/arduino/standard/pins_arduino.h':standardPins}});
const pbCore = await bundle('pb-core', await preparePbCore(packageRoot,headers,binary));
const variants = {eightanaloginputs:nanoVariant};
const engineFiles = ['src/boards.js', 'test/compile-nano.mjs', 'vendor/arduino-core/variants/eightanaloginputs/pins_arduino.h', 'src/projectFiles.js', 'src/compiler-engine.js', 'src/avr-format.js', 'src/compiler.js', 'src/compiler.worker.js', 'src/arduino-source.js', 'src/libraryDefinitions.js', 'src/libraryExamples.js', 'test/compile-libraries.mjs', 'scripts/prepare-library-assets.mjs', 'scripts/compile-core-extension.mjs', 'vendor/arduino-core/cores/arduino/WInterrupts.c'];
const engineHash = sha(Buffer.concat(await Promise.all(engineFiles.map(p => readFile(p)))));
const buildId = sha(JSON.stringify({ toolchain: 'avr-gcc-wasm@0.2.0', core: core.hash, pbCore:pbCore.hash, nanoVariant:nanoVariant.hash, libraries: libraries.map(l => [l.id, l.hash]), engineHash }));
let compatibility = { libraries: [] };
try { compatibility = JSON.parse(await readFile('reports/compatibility.json', 'utf8')); } catch {}
let nanoCompatibility={boards:[]};
try{nanoCompatibility=JSON.parse(await readFile('reports/nano-compatibility.json','utf8'));}catch{}
let pbCompatibility={boards:[]};
try{pbCompatibility=JSON.parse(await readFile('reports/pb-compatibility.json','utf8'));}catch{}
const proofMatches = compatibility.buildId === buildId;
for (const lib of libraries) {
  const proof = proofMatches && compatibility.libraries.find(l => l.id === lib.id && l.hash === lib.hash && l.version === lib.version);
  lib.status = proof?.status || 'UNTESTED';
  lib.boardTests = Object.fromEntries([...(nanoCompatibility.buildId===buildId?nanoCompatibility.boards:[]),...(pbCompatibility.buildId===buildId?pbCompatibility.boards.filter(b=>b.id==='circuitera:avr:atmega328pb'):[])].map(board=>{const test=board.libraries.find(l=>l.id===lib.id && l.hash===lib.hash);return [board.id,test?{status:test.status,flashBytes:test.flashBytes,ramBytes:test.ramBytes,hexSha256:test.hexSha256,error:test.error||''}:null];}).filter(([,test])=>test));
  lib.test = proof ? { flashBytes: proof.flashBytes, ramBytes: proof.ramBytes, hexSha256: proof.hexSha256, error: proof.error || '' } : null;
}
await writeFile(`${destination}/manifest.json`, JSON.stringify({ format: 1, target: 'atmega328p', toolchain: 'avr-gcc-wasm@0.2.0', buildId, engineHash, core, pbCore, variants, libraries }, null, 2));
console.log(`Prepared ${libraries.length} pinned source bundles; ${libraries.filter(l => l.status === 'PASS').length} verified for this exact build.`);
