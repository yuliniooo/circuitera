import assert from 'node:assert/strict';
import test from 'node:test';

test('a failed postMessage must release the compiler for the next attempt', async () => {
  const instances = [];
  globalThis.document = { baseURI: 'https://circuitera.netlify.app/' };
  globalThis.Worker = class {
    constructor() { instances.push(this); }
    postMessage(data) {
      if (instances.length === 1) throw new DOMException('Source cannot be cloned', 'DataCloneError');
      queueMicrotask(() => this.onmessage({ data: { id: data.id, type: 'result', result: { ok: true } } }));
    }
    terminate() { this.terminated = true; }
  };
  const { compileSketchInBrowser } = await import('../src/compiler.js?clone-test');
  await assert.rejects(compileSketchInBrowser('void setup(){}'), /Source cannot be cloned/);
  assert.equal((await compileSketchInBrowser('void loop(){}')).ok, true);
  assert.equal(instances[0].terminated, true);
});

test('worker errors retain the real exception, asset and last stage, then allow retry', async () => {
  const instances = [];
  globalThis.document = { baseURI: 'https://circuitera.netlify.app/' };
  globalThis.Worker = class {
    constructor() { instances.push(this); }
    postMessage(data) { this.id = data.id; }
    terminate() { this.terminated = true; }
  };
  const { compileSketchInBrowser } = await import('../src/compiler.js?error-test');
  const first = compileSketchInBrowser('void setup(){}');
  const rejection = assert.rejects(first, error => /Servo.cpp/.test(error.message) && /worker.js:4:2/.test(error.message) && /out of memory/.test(error.message));
  instances[0].onmessage({ data: { id: 1, type: 'progress', progress: { stage: 'COMPILING LIBRARIES', detail: 'Servo.cpp' } } });
  instances[0].onerror({ message: 'out of memory', filename: '/assets/worker.js', lineno: 4, colno: 2, error: new Error('out of memory') });
  await rejection;
  const second = compileSketchInBrowser('void loop(){}');
  const secondRejection = assert.rejects(second, /deserialize/i);
  instances[1].onmessageerror({});
  await secondRejection;
  const third = compileSketchInBrowser('void setup(){} void loop(){}');
  instances[2].onmessage({ data: { id: instances[2].id, type: 'result', result: { ok: true, output: 'fixture protocol response' } } });
  assert.equal((await third).ok, true);
});
