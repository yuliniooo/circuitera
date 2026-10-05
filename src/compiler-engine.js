// The original AVR-GCC WASM binaries, with real on-demand library compilation.
import { prepareArduinoSource, diagnosticsFromCompiler } from './arduino-source.js';
import { validateFiles } from './projectFiles.js';
import { getBoard, DEFAULT_BOARD, boardDetails } from './boards.js';
import { inspectElf } from './avr-format.js';
import { parseIntelHex } from './serial.js';

export const COMPILER_FLAGS = [
  '-quiet', '-imultilib', 'avr5', '-D__AVR_ATmega328P__', '-D__AVR_DEVICE_NAME__=atmega328p',
  '-DF_CPU=16000000L', '-DARDUINO=10819', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR',
  '-isystem', '/sysroot/gcc/include', '-isystem', '/sysroot/avr/include',
  '-I', '/arduino/core', '-I', '/arduino/variant',
  '-mn-flash=1', '-mno-skip-bug', '-mmcu=avr5', '-Os', '-std=gnu++11',
  '-fpermissive', '-fno-exceptions', '-fno-threadsafe-statics', '-fno-rtti',
  '-fno-enforce-eh-specs', '-ffunction-sections', '-fdata-sections',
];
const bundles = new Map();
const tools = new Map();
const objectCache = new Map();
let cacheBytes = 0;
const MAX_OBJECT_CACHE_BYTES = 8 * 1024 * 1024;
const textDecoder = new TextDecoder();

export const compilerFlagsForBoard = board => board.family==='pb' ? [...COMPILER_FLAGS.map(flag=>flag.replace('__AVR_ATmega328P__','__AVR_ATmega328PB__').replace('__AVR_DEVICE_NAME__=atmega328p','__AVR_DEVICE_NAME__=atmega328pb').replace('ARDUINO_AVR_UNO',board.macro)), '-include', '/arduino/pb-compat.h'] : board.family==='uno' ? COMPILER_FLAGS : COMPILER_FLAGS.map(flag=>flag==='-DARDUINO_AVR_UNO'?'-DARDUINO_AVR_NANO':flag);

async function bytesFrom(url) {
  let response;
  try { response = await fetch(url); } catch(error) { throw new Error(`Compiler asset fetch failed: ${url}\n${error.message || error}\n${error.stack || ''}`); }
  if (!response.ok) throw new Error(`Compiler asset could not load (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
async function getBundle(base, record) {
  const key = new URL(record.file, base).href;
  if (!bundles.has(key)) bundles.set(key, (async () => {
    const bytes = await bytesFrom(key);
    if (await digest(bytes) !== record.hash) throw new Error(`Source asset checksum mismatch: ${record.file}. Reload the site.`);
    return JSON.parse(textDecoder.decode(bytes));
  })().catch(error => { bundles.delete(key); throw error; }));
  return bundles.get(key);
}
export async function loadLibraryManifest(assetsBase) {
  const url = new URL('curated/manifest.json', assetsBase);
  let response;
  try { response = await fetch(url, { cache: 'no-cache' }); }
  catch (error) { throw new Error(`Library catalog fetch failed: ${url}\n${error.message || error}`); }
  if (!response.ok) throw new Error(`Library catalog could not load (${response.status}): ${url}`);
  const manifest = await response.json();
  if (manifest.target !== 'atmega328p' || manifest.format !== 1) throw new Error('Unsupported compiler catalog. Expected ATmega328P assets for Uno R3 or classic Nano V3.');
  return manifest;
}
export function findIncludes(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    text => text.startsWith('/') ? text.replace(/[^\n]/g, ' ') : text);
  return [...clean.matchAll(/^\s*#\s*include\s*[<"]([^>"\n]+)[>"]/gm)].map(m => m[1]);
}
export function resolveLibraries(source, catalog) {
  const byId = new Map(catalog.map(l => [l.id, l]));
  const selected = new Map();
  function add(id) {
    if (selected.has(id)) return;
    const lib = byId.get(id);
    if (!lib) throw new Error(`Bundled dependency ${id} is missing from the catalog.`);
    selected.set(id, lib);
    for (const dependency of lib.dependencies) add(dependency);
  }
  for (const header of findIncludes(source)) {
    const lib = catalog.find(l => l.headers.includes(header));
    if (lib) add(lib.id);
  }
  return [...selected.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function writeVirtual(fs, path, data) {
  const parts = path.split('/').filter(Boolean);
  let dir = '';
  for (const part of parts.slice(0, -1)) {
    dir += '/' + part;
    if (!fs.analyzePath(dir).exists) fs.mkdir(dir);
  }
  fs.writeFile(path, data);
}
async function getTool(base, name) {
  const key = `${base}:${name}`;
  if (!tools.has(key)) tools.set(key, (async () => {
    const moduleUrl = new URL(`tools/${name}.mjs`, base).href;
    const [{ default: factory }, binary] = await Promise.all([
      import(/* @vite-ignore */ moduleUrl).catch(error=>{throw new Error(`Compiler module failed to load: ${moduleUrl}\n${error.message || error}\n${error.stack || ''}`);}), bytesFrom(new URL(`tools/${name}.wasm`, base)),
    ]);
    return { factory, module: await WebAssembly.compile(binary) };
  })().catch(error => { tools.delete(key); throw error; }));
  return tools.get(key);
}
async function runTool(base, name, args, files, outputPath, log) {
  const { factory, module } = await getTool(base, name);
  const stderr = [];
  const runtime = await factory({
    noInitialRun: true,
    locateFile: p => new URL(`tools/${p}`, base).href,
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(module, imports);
      receive(instance, module);
      return instance.exports;
    },
    print() {}, printErr(line) { if (line) stderr.push(String(line)); },
  });
  runtime.FS.mkdir('/build');
  for (const [path, data] of Object.entries(files)) writeVirtual(runtime.FS, path, data);
  let exitCode;
  try { exitCode = runtime.callMain(args); }
  catch (error) {
    if (error?.status !== 0 && !String(error?.message).includes('Program terminated with exit(0)')) {
      throw new Error(`${name} failed: ${error.message || error}\nCompiler exit status: ${error?.status ?? 'not reported by runtime'}\n${stderr.join('\n')}`);
    }
  }
  log.push(...stderr);
  if ((typeof exitCode === 'number' && exitCode !== 0) || stderr.some(line => /: (?:fatal )?error:/.test(line))) throw new Error(`${name} failed\nCompiler exit status: ${exitCode ?? 'not reported by runtime'}\n${stderr.join('\n')}`);
  try { return new Uint8Array(runtime.FS.readFile(outputPath)); }
  catch { throw new Error(`${name} did not produce ${outputPath}\n${stderr.join('\n')}`); }
}
function cacheGet(key) {
  const value = objectCache.get(key);
  if (value) { objectCache.delete(key); objectCache.set(key, value); }
  return value;
}
function cacheSet(key, value) {
  if (value.bytes.length > MAX_OBJECT_CACHE_BYTES) return;
  while (cacheBytes + value.bytes.length > MAX_OBJECT_CACHE_BYTES && objectCache.size) {
    const oldest = objectCache.keys().next().value;
    cacheBytes -= objectCache.get(oldest).bytes.length;
    objectCache.delete(oldest);
  }
  objectCache.set(key, value);
  cacheBytes += value.bytes.length;
}
function decodeBase64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function explainCompilerError(error, catalog = []) {
  const raw = String(error?.message || error).replaceAll('/build/sketch.cpp', 'sketch.ino');
  const missing = raw.match(/fatal error:\s*([^\n:]+): No such file or directory/);
  if (!missing || !/^[\w./-]+$/.test(missing[1].trim())) return raw;
  const header = missing[1].trim();
  const known = catalog.find(l => l.headers.includes(header));
  return `LIBRARY NOT AVAILABLE\n\n${header} is not currently included${known ? ' in the loaded compiler assets' : ' in Circuitera'}.\n${known ? 'Reload the page; a bundled asset may be missing.' : 'Choose a tested library from LIBRARIES. Arbitrary library installation is not supported yet.'}\n\nOriginal compiler error:\n${raw}`;
}
export async function compileUno(source, { assetsBase, onProgress = () => {}, boardId = DEFAULT_BOARD } = {}) {
  const started = performance.now();
  let manifest, board;
  const stages = [];
  const log = [];
  const stats = { compiledObjects: 0, cachedObjects: 0, libraries: [] };
  const stage = (name, detail = '') => { stages.push({ stage: name, detail }); onProgress({ stage: name, detail }); };
  try {
    board = getBoard(boardId);
    stage('PREPARING', `Loading the ${board.shortName} core and required source bundles`);
    const project = typeof source === 'object' && source?.kind === 'project' ? source : null;
    if (project) validateFiles(project.files, project.entry);
    else if (typeof source !== 'string' || source.length > 512000) throw new Error('Sketch must be text smaller than 500 KB.');
    const projectSources = project ? Object.fromEntries(project.files.map(f => ['/project/' + f.name, f.code])) : {};
    const includeSource = project ? project.files.map(f => f.code).join('\n') : source;
    manifest = await loadLibraryManifest(assetsBase);
    const selected = resolveLibraries(includeSource, manifest.libraries);
    stats.libraries = selected.map(l => l.id);
    const [core, ...libraries] = await Promise.all([getBundle(assetsBase, board.family==='pb' ? manifest.pbCore : manifest.core), ...selected.map(l => getBundle(assetsBase, l))]);
    const variant = board.family==='nano' ? await getBundle(assetsBase,manifest.variants?.eightanaloginputs || (()=>{throw new Error('Nano variant asset is missing from the compiler catalog.');})()) : null;
    const sourceFiles = Object.assign({}, core.headers, variant?.headers, ...libraries.map(l => l.files), projectSources);
    const flags = compilerFlagsForBoard(board);
    const includeDirs = [...(project ? ['/project'] : []), ...libraries.flatMap(l => l.includeDirs)];
    const includes = includeDirs.flatMap(p => ['-I', p]);
    async function compileUnit(path, text, out) {
      const files = { ...sourceFiles, [path]: text };
      const assemblyFlags = path.endsWith('.S') ? ['-E', '-P', '-D__ASSEMBLER__'] : [];
      const assembly = await runTool(assetsBase, 'cc1plus', [...flags, ...includes, ...assemblyFlags, path, '-o', '/build/unit.s'], files, '/build/unit.s', log);
      const bytes = await runTool(assetsBase, 'avr-as', [board.family==='pb' ? '-mmcu=avr5' : '-mmcu=atmega328p', '-o', out, '/build/unit.s'], { '/build/unit.s': assembly }, out, log);
      inspectElf(bytes);
      return bytes;
    }
    stage('COMPILING SKETCH', 'Compiling the current editor source');
    const objectFiles = {};
    if (!project) {
      objectFiles['/build/sketch.o'] = await compileUnit('/build/sketch.cpp', prepareArduinoSource(source), '/build/sketch.o');
    } else {
      const inoFiles = [project.files.find(f => f.name === project.entry), ...project.files.filter(f => f.name.endsWith('.ino') && f.name !== project.entry).sort((a,b)=>a.name.localeCompare(b.name))];
      // Arduino .ino tabs share one real translation unit; .cpp/.c files below
      // are separate AVR object files with normal linker symbol resolution.
      const combined = inoFiles.map(f => `#line 1 "${f.name}"\n${f.code}`).join('\n');
      objectFiles['/build/sketch.o'] = await compileUnit('/project/main-sketch.cpp', prepareArduinoSource(combined), '/build/sketch.o');
      for (const [index, file] of project.files.filter(f => /\.(cpp|c)$/.test(f.name)).entries()) {
        onProgress({ stage:'COMPILING SKETCH', detail:`Compiling ${file.name}` });
        const text = file.name.endsWith('.c') ? `#include <Arduino.h>\nextern "C" {\n#line 1 "${file.name}"\n${file.code}\n}\n` : `#line 1 "${file.name}"\n${file.code}`;
        const out = `/build/project_${index}.o`;
        objectFiles[out] = await compileUnit('/project/' + file.name, text, out);
      }
      stats.projectObjects = Object.keys(objectFiles).length;
      stats.projectFiles = project.files.map(f=>f.name);
      if (project.files.some(f=>f.name.endsWith('.c'))) log.push('C source note: this toolchain compiles C-compatible syntax through AVR C++ with C linkage. Full C99/C11 support is not available.');
    }
    stage('COMPILING LIBRARIES', selected.length ? selected.map(l => l.name).join(', ') : 'No libraries required');
    const cacheContext = await digest(new TextEncoder().encode(JSON.stringify({ build: manifest.buildId, flags, board:board.id, variant:variant?manifest.variants.eightanaloginputs.hash:null, includes, hashes: selected.map(l => l.hash), projectHeaders: project ? await digest(new TextEncoder().encode(JSON.stringify(projectSources))) : undefined })));
    const cacheSafe = !Object.values(sourceFiles).some(text => /__DATE__|__TIME__|__TIMESTAMP__/.test(text));
    for (let i = 0; i < libraries.length; i++) {
      const lib = libraries[i];
      for (const path of lib.sources) {
        const key = `${cacheContext}:${path}`;
        const out = `/build/lib_${i}_${Object.keys(objectFiles).length}.o`;
        const cached = cacheSafe && cacheGet(key);
        if (cached) {
          objectFiles[out] = cached.bytes;
          log.push(...cached.warnings);
          stats.cachedObjects++;
          onProgress({ stage: 'COMPILING LIBRARIES', detail: `${selected[i].name}: reused ${path.split('/').pop()}` });
          continue;
        }
        onProgress({ stage: 'COMPILING LIBRARIES', detail: `${selected[i].name}: ${path.split('/').pop()}` });
        const startLog = log.length;
        // This distribution contains cc1plus, not cc1. Compile compatible C
        // through the actual C++ frontend with C linkage; never substitute stubs.
        const text = path.endsWith('.c') ? `#include <Arduino.h>\nextern "C" {\n#line 1 "${path}"\n${lib.files[path]}\n}\n` : lib.files[path];
        const bytes = await compileUnit(path, text, out);
        objectFiles[out] = bytes;
        stats.compiledObjects++;
        if (cacheSafe) cacheSet(key, { bytes, warnings: log.slice(startLog) });
      }
    }
    stage('LINKING', `${board.shortName} · ${board.mcu.toUpperCase()} · ${board.flashLimit} application flash bytes / 2 KB SRAM`);
    const runtimeFiles = Object.fromEntries(Object.entries(core.binary).map(([p, data]) => [p, decodeBase64(data)]));
    const elf = await runTool(assetsBase, 'avr-ld', [
      '-m', 'avr5', '-Tdata=0x800100', '--gc-sections', '-o', '/build/sketch.elf',
      `/libs/crt${board.mcu}.o`, ...Object.keys(objectFiles), '-L/libs',
      '--start-group', '/libs/arduino-core.a', '-lm', '-lc', '-lgcc', ...(board.family==='pb'?['-latmega328pb']:[]), '--end-group',
    ], { ...runtimeFiles, ...objectFiles }, '/build/sketch.elf', log);
    const elfInfo = inspectElf(elf);
    if ((elfInfo.flags & 0x7f) !== 5) throw new Error('Linker returned an unexpected AVR architecture, not avr5.');
    if (elfInfo.ramBytes > board.ramLimit) throw new Error(`Global variables use ${elfInfo.ramBytes} bytes of SRAM. ${board.shortName} has only ${board.ramLimit} bytes.`);
    stage('GENERATING HEX', 'Converting the linked AVR ELF to Intel HEX');
    const hex = textDecoder.decode(await runTool(assetsBase, 'avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', '/build/sketch.elf', '/build/sketch.hex'], { '/build/sketch.elf': elf }, '/build/sketch.hex', log));
    const firmware = parseIntelHex(hex);
    if (!firmware.length || !hex.includes(':00000001FF')) throw new Error('Compiler did not produce a complete Intel HEX artifact.');
    const flashBytes = hex.trim().split(/\r?\n/).reduce((n, line) => line.slice(7, 9) === '00' ? n + parseInt(line.slice(1, 3), 16) : n, 0);
    if (flashBytes > board.flashLimit || firmware.length > board.flashLimit) throw new Error(`Sketch uses ${flashBytes} flash bytes; ${board.shortName} maximum is ${board.flashLimit}.`);
    stage('COMPILED', `${flashBytes} flash bytes · ${elfInfo.ramBytes} SRAM bytes`);
    const output = [
      '✓ COMPILED',
      `Sketch uses ${flashBytes} bytes (${Math.round(flashBytes / board.flashLimit * 100)}%) of program storage space. Maximum is ${board.flashLimit} bytes.`,
      `Global variables use ${elfInfo.ramBytes} of 2048 SRAM bytes (stack and runtime allocations need additional space).`,
      `Compiled locally in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
      `Target: ${board.name} / ${board.mcu.toUpperCase()}.`,
      ...(board.family==='nano' ? [boardDetails(board)] : []),
      `Libraries: ${selected.map(l => `${l.name} ${l.version}`).join(', ') || 'none'}.`,
      `Library objects: ${stats.compiledObjects} compiled, ${stats.cachedObjects} reused.`, ...log,
    ].join('\n');
    return { ok: true, board: board.id, flashLimit:board.flashLimit, ramLimit:board.ramLimit, hex, flashBytes, ramBytes: elfInfo.ramBytes, output, diagnostics: diagnosticsFromCompiler(output), stats, stages, buildId: manifest.buildId };
  } catch (error) {
    const explanation = explainCompilerError(error, manifest?.libraries);
    const output = [...log.filter(line=>!explanation.includes(line)), explanation, error?.stack ? `Exception detail:\n${error.stack}` : ''].filter(Boolean).join('\n');
    return { ok: false, board:board?.id || boardId, output:board?.family==='nano'?boardDetails(board)+'\n\n'+output:output, diagnostics: diagnosticsFromCompiler(output), stats, stages, buildId: manifest?.buildId };
  }
}
