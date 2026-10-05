import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile('dist/avr/curated/manifest.json', 'utf8'));
const report = JSON.parse(await readFile('reports/compatibility.json', 'utf8'));
assert.equal(manifest.buildId, report.buildId, 'Test evidence does not match this release');
assert.equal(manifest.libraries.length, 17);
assert.equal(report.libraries.length, 17);
for (const record of [manifest.core, ...Object.values(manifest.variants||{}), ...manifest.libraries]) {
  const bytes = await readFile('dist/avr/' + record.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.hash);
}
for (const library of manifest.libraries) {
  const result = report.libraries.find(l => l.id === library.id);
  assert.equal(library.status, result.status, 'UI proof does not match tests');
  if (library.status === 'PASS') {
    assert.ok(result.flashBytes > 0 && result.hexSha256 && !result.error);
    assert.equal(library.hash, result.hash);
  } else console.warn(`UNSUPPORTED: ${library.name}: ${result.error}`);
}
for (const name of ['cc1plus', 'avr-as', 'avr-ld', 'avr-objcopy']) {
  const bytes = await readFile(`dist/avr/tools/${name}.wasm`);
  assert.deepEqual([...bytes.subarray(0, 4)], [0, 97, 115, 109]);
  await readFile(`dist/avr/tools/${name}.mjs`);
}
const workerFile = (await readdir('dist/assets')).find(p => /^compiler.worker-.*\.js$/.test(p));
assert.ok(workerFile, 'Missing production Worker');
const worker = await readFile('dist/assets/' + workerFile, 'utf8');
assert.ok(worker.includes('cc1plus') && worker.includes('GENERATING HEX'));
assert.ok(!worker.includes('/reports/firmware/'), 'Test HEX must never be a runtime input');
for (const file of ['reports/regressions.json', 'reports/ui-regressions.json', 'reports/workspace-tests.json']) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(data.checks.length >= 7);
  assert.ok(data.checks.every(check => check.status === 'PASS'));
}
const serial = await readFile('src/serial.js');
assert.equal(createHash('sha256').update(serial).digest('hex'), 'd33474919b9f1a711a53c31bcab854c5ce6339a68c771e10785312737e331baa', 'Uploader changed unexpectedly');
console.log(`Static release validated: ${manifest.libraries.filter(l => l.status === 'PASS').length}/17 libraries, real WASM assets, exact-build proof, unchanged uploader.`);

await import('./check-nano-release.mjs');
