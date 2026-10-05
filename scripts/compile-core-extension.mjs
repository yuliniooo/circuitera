// Build the missing upstream Arduino interrupt runtime object, using the same
// pinned AVR WASM compiler/assembler. No native compiler or firmware fixture.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { COMPILER_FLAGS } from '../src/compiler-engine.js';
import { inspectElf } from '../src/avr-format.js';

export async function runTool(packageRoot, tool, args, files, output) {
  const dir = path.resolve(packageRoot, 'tools');
  const { default: create } = await import(pathToFileURL(path.join(dir, `${tool}.mjs`)).href);
  const binary = await readFile(path.join(dir, `${tool}.wasm`));
  const stderr = [];
  const module = await WebAssembly.compile(binary);
  const runtime = await create({ noInitialRun: true,
    instantiateWasm(imports, receive) { const instance = new WebAssembly.Instance(module, imports); receive(instance, module); return instance.exports; },
    print() {}, printErr: line => stderr.push(String(line)),
  });
  for (const [filename, bytes] of Object.entries(files)) {
    let dir = '';
    for (const segment of filename.split('/').slice(1, -1)) {
      dir += '/' + segment;
      if (!runtime.FS.analyzePath(dir).exists) runtime.FS.mkdir(dir);
    }
    runtime.FS.writeFile(filename, bytes);
  }
  let status;
  try { status = runtime.callMain(args); }
  catch (error) { if (error?.status !== 0) throw new Error(`${tool}: ${error.message}\n${stderr.join('\n')}`); }
  if (status || stderr.some(s => /: (fatal )?error:/.test(s))) throw new Error(`${tool} failed\n${stderr.join('\n')}`);
  return new Uint8Array(runtime.FS.readFile(output));
}

export async function compileInterruptRuntime(packageRoot, headers) {
  const source = await readFile('vendor/arduino-core/cores/arduino/WInterrupts.c', 'utf8');
  const input = '/build/WInterrupts.cpp';
  const wrapped = `#include <Arduino.h>\nextern "C" {\n#line 1 "WInterrupts.c"\n${source}\n}\n`;
  const assembly = await runTool(packageRoot, 'cc1plus', [...COMPILER_FLAGS, input, '-o', '/build/WInterrupts.s'], { ...headers, [input]: wrapped }, '/build/WInterrupts.s');
  const object = await runTool(packageRoot, 'avr-as', ['-mmcu=atmega328p', '-o', '/build/WInterrupts.o', '/build/WInterrupts.s'], { '/build/WInterrupts.s': assembly }, '/build/WInterrupts.o');
  const { symbols } = inspectElf(object);
  for (const name of ['attachInterrupt', 'detachInterrupt', '__vector_1', '__vector_2']) {
    if (!symbols.includes(name)) throw new Error(`Actual Arduino interrupt object lacks ${name}`);
  }
  return object;
}
