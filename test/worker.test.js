import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { assetsBase } from './wasm-harness.mjs';
import { examples } from '../src/examples.js';
import { parseIntelHex } from '../src/serial.js';

test('production Worker sends real stages, compiles source, and survives a GCC failure', async () => {
  const worker = new Worker(new URL('./worker-adapter.mjs', import.meta.url));
  const compile = (id, source) => new Promise((resolve, reject) => {
    const stages = [];
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out')); }, 45000);
    const onMessage = data => {
      if (data.id !== id) return;
      if (data.type === 'progress') stages.push(data.progress.stage);
      if (data.type === 'result') { clearTimeout(timeout); worker.off('message', onMessage); resolve({ ...data.result, stages }); }
    };
    worker.on('message', onMessage);
    worker.once('error', reject);
    worker.postMessage({ id, source, assetsBase });
  });
  try {
    const first = await compile(1, examples.Blink);
    assert.equal(first.ok, true, first.output);
    assert.ok(parseIntelHex(first.hex).length);
    assert.deepEqual(first.stages, ['PREPARING', 'COMPILING SKETCH', 'COMPILING LIBRARIES', 'LINKING', 'GENERATING HEX', 'COMPILED']);
    const broken = await compile(2, 'void setup() {\n missing();\n}\nvoid loop(){}');
    assert.equal(broken.ok, false);
    assert.equal(broken.hex, undefined);
    assert.ok(broken.diagnostics.some(d => d.line === 2));
    const changed = await compile(3, examples.Blink.replaceAll('1000', '123'));
    assert.equal(changed.ok, true, changed.output);
    assert.notEqual(first.hex, changed.hex);
  } finally { await worker.terminate(); }
});
