import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { uploadUno, parseIntelHex } from '../src/serial.js';
import { UnoPortFixture } from './uno-port-fixture.js';

test('STK500v1 programs and reads back every page of real WASM-generated firmware', async () => {
  const hex = await readFile('reports/firmware/servo.hex', 'utf8');
  const port = new UnoPortFixture();
  const progress = [];
  const logs = [];
  await uploadUno(port, hex, { onProgress: p => progress.push(p), onLog: s => logs.push(s) });
  const firmware = parseIntelHex(hex);
  assert.deepEqual(port.memory.slice(0, firmware.length), firmware);
  assert.equal(port.commands.filter(c => c === 0x74).length, firmware.length / 128);
  assert.equal(port.commands.filter(c => c === 0x64).length, firmware.length / 128);
  assert.equal(port.commands.at(-1), 0x51);
  assert.equal(progress.at(-1), 100);
  assert.equal(port.closed, true);
  assert.deepEqual(port.signals.map(s => s.dataTerminalReady), [false, true]);
  assert.ok(logs.some(s => s.startsWith('Upload verified.')));
});

test('flash verification rejects corrupted readback and never reports success', async () => {
  const hex = await readFile('reports/firmware/servo.hex', 'utf8');
  const port = new UnoPortFixture({ corruptRead: true });
  const progress = [];
  const logs = [];
  await assert.rejects(uploadUno(port, hex, { onProgress: p => progress.push(p), onLog: s => logs.push(s) }), /Flash verification failed at address 0x0/);
  assert.ok(!progress.includes(100));
  assert.ok(!logs.some(s => s.startsWith('Upload verified.')));
  assert.equal(port.closed, true);
});
