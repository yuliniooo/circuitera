import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { assetsBase } from './wasm-harness.mjs';
import { compileUno } from '../src/compiler-engine.js';
import { examples } from '../src/examples.js';
import { parseIntelHex } from '../src/serial.js';

const hashes = new Set();
const records = [];
for (const [name, source] of Object.entries(examples)) {
  const result = await compileUno(source, { assetsBase });
  assert.equal(result.ok, true, result.output);
  const firmware = parseIntelHex(result.hex);
  const hash = createHash('sha256').update(result.hex).digest('hex');
  assert.ok(!hashes.has(hash), name + ' unexpectedly produced duplicate firmware.');
  hashes.add(hash);
  records.push({ name, status: 'PASS', flashBytes: result.flashBytes, paddedBytes: firmware.length, sha256: hash });
  console.log(name + ': PASS — ' + result.flashBytes + ' flash bytes, ' + hash.slice(0, 12));
}
const first = await compileUno(examples.Blink, { assetsBase });
const changed = await compileUno(examples.Blink.replaceAll('delay(1000)', 'delay(137)'), { assetsBase });
assert.ok(changed.ok, changed.output);
assert.notEqual(first.hex, changed.hex, 'Changing the current sketch must change firmware');
assert.deepEqual(first.stats.libraries, [], 'Blink must not load unrequested libraries');
records.push({ name: 'Changed current source changes firmware; Blink loads no libraries', status: 'PASS' });

const broken = await compileUno('void setup() {\n  notARealFunction();\n}\nvoid loop() {}\n', { assetsBase });
assert.equal(broken.ok, false);
assert.ok(broken.diagnostics.some(d => d.line === 2 && d.severity === 'error'), broken.output);
assert.equal(broken.hex, undefined);
records.push({ name: 'Compiler error maps to line 2 and produces no firmware', status: 'PASS' });

const missing = await compileUno('#include <LibraryThatIsNotInstalled.h>\nvoid setup() {}\nvoid loop() {}\n', { assetsBase });
assert.equal(missing.ok, false);
assert.match(missing.output, /LIBRARY NOT AVAILABLE/);
assert.match(missing.output, /LibraryThatIsNotInstalled.h is not currently included in Circuitera/);
assert.match(missing.output, /fatal error: LibraryThatIsNotInstalled.h: No such file or directory/);
assert.ok(missing.diagnostics.some(d => d.line === 1));
records.push({ name: 'Friendly missing-library message retains real GCC error and line 1', status: 'PASS' });
await mkdir('reports', { recursive: true });
await writeFile('reports/regressions.json', JSON.stringify({ testedAt: new Date().toISOString(), checks: records }, null, 2));
console.log('Current-source, selective-loading and error-line regressions: PASS');
