// Node transport adapter for the actual production Web Worker entry point.
import { parentPort } from 'node:worker_threads';
import './wasm-harness.mjs';
globalThis.self = globalThis;
self.postMessage = message => parentPort.postMessage(message);
await import('../src/compiler.worker.js');
parentPort.on('message', data => self.onmessage({ data }));
