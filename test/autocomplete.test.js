import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { CompletionContext } from '@codemirror/autocomplete';
import { createArduinoCompletionSource, applyFunction } from '../src/autocomplete.js';
const catalog = JSON.parse(await readFile('dist/avr/curated/manifest.json', 'utf8'));
const source = createArduinoCompletionSource(catalog.libraries);
function complete(marked, explicit = false, extensions = []) {
  const pos = marked.indexOf('|');
  const doc = marked.replace('|', '');
  const state = EditorState.create({ doc, selection: { anchor: pos }, extensions: [cpp(), ...extensions] });
  return { state, result: source(new CompletionContext(state, pos, explicit)) };
}
const options = marked => complete(marked).result?.options || [];
const includes = (marked, name) => options(marked).find(o => o.label === name);

test('Arduino functions/constants carry signatures and descriptions without snippets', () => {
  for (const label of ['pinMode', 'digitalWrite', 'analogRead', 'pulseIn', 'attachInterrupt']) {
    const item = includes('void loop(){ di| }', label);
    assert.ok(item.detail.includes(label)); assert.ok(item.info.length > 15);
  }
  assert.ok(includes('void loop(){ IN| }', 'INPUT_PULLUP'));
  assert.ok(includes('void loop(){ A| }', 'A5'));
  assert.equal(options('void loop(){ | }').length, 0);
  assert.ok(complete('void loop(){ | }', true).result.options.length > 20);
});
test('Serial member context shows serial signatures and no unrelated globals', () => {
  for (const label of ['begin', 'println', 'available', 'read', 'readStringUntil']) assert.ok(includes('void loop(){ Serial.| }', label));
  assert.ok(!includes('void loop(){ Serial.pr| }', 'pinMode'));
  assert.equal(options('void loop(){ unknown.| }').length, 0);
});
test('Only actual declarations are suggested; locals and parameters respect scope', () => {
  const sketch = 'const int sensorPin=2; int readSensor(int pin) { int reading=1; return rea|; } void other(){int hidden;}';
  for (const label of ['sensorPin', 'readSensor', 'reading', 'pin']) assert.ok(includes(sketch, label), label);
  assert.ok(includes(sketch, 'readSensor').detail.includes('int pin'));
  assert.ok(!includes(sketch, 'hidden'));
  assert.ok(!includes('void setup(){ int hidden; } void loop(){ hid| }', 'hidden'));
  assert.ok(!includes('void loop(){ for(int i=0;i<4;i++){int inner;} in| }', 'inner'));
  assert.ok(!includes('void loop(){ for(int i=0;i<4;i++){} i| }', 'i'));
  assert.ok(!includes('void loop(){ unknownCall(); un| }', 'unknownCall'));
  assert.ok(!includes('// int fakeName;\nvoid loop(){ fa| }', 'fakeName'));
  assert.ok(includes('int a, second; int *pointer; float readings[4]; void loop(){ se| }', 'second'));
  assert.ok(includes('int a, second; int *pointer; float readings[4]; void loop(){ po| }', 'pointer'));
});
test('Declarations refresh after editing or deleting source', () => {
  let state = EditorState.create({ doc: 'int original; void loop(){ori}', extensions: [cpp()] });
  let pos = state.doc.length - 1;
  assert.ok(source(new CompletionContext(state, pos, false)).options.some(o => o.label === 'original'));
  state = state.update({ changes: { from: 4, to: 12, insert: 'renamed' } }).state;
  pos = state.doc.length - 1;
  const updated = source(new CompletionContext(state, pos, false)).options;
  assert.ok(updated.some(o => o.label === 'renamed')); assert.ok(!updated.some(o => o.label === 'original'));
});
test('Suggestions are suppressed in comments, strings, character literals and read-only mode', () => {
  for (const s of ['// digi|', '/* multi\n digi| */', 'void loop(){ Serial.print("digi|"); }', "char c = 'd|';", 'const char *s=R"(digi|)";', '/*\n#include <Se|\n*/']) assert.equal(complete(s, true).result, null, s);
  assert.equal(complete('void loop(){ digi| }', true, [EditorState.readOnly.of(true)]).result, null);
});
test('All 17 tested libraries offer their public include headers; failed libraries are excluded', () => {
  const result = options('#include <|');
  for (const lib of catalog.libraries) assert.ok(result.some(o => o.detail.startsWith(lib.name + ' ·')), lib.name);
  assert.ok(!result.some(o => o.label === 'avr/ServoTimers.h'));
  assert.ok(includes('#include "Ser|"', 'Servo.h'));
  const failed = createArduinoCompletionSource(catalog.libraries.map(l => ({ ...l, status: 'FAIL' })));
  const state = EditorState.create({ doc: '#include <Ser', extensions: [cpp()] });
  assert.equal(failed(new CompletionContext(state, state.doc.length, true)).options.length, 0);
});
test('Library instance methods use declared types and included headers', () => {
  assert.ok(includes('#include <Servo.h>\nServo motor; void loop(){motor.wr|}', 'write'));
  assert.ok(includes('#include <Wire.h>\nvoid loop(){Wire.re|}', 'requestFrom'));
  assert.ok(includes('#include <DHT.h>\nDHT sensor(2,DHT11); void loop(){sensor.re|}', 'readTemperature'));
  assert.ok(!includes('Servo motor; void loop(){motor.wr|}', 'write'));
  assert.ok(!includes('struct Thing {}; Thing Serial; void loop(){Serial.pr|}', 'println'));
});
test('Applying a function inserts only a call, reuses existing parentheses, and is undoable', () => {
  for (const [doc, expected] of [['digi', 'digitalWrite()'], ['digi(9,HIGH)', 'digitalWrite(9,HIGH)']]) {
    let state = EditorState.create({ doc }); let change;
    applyFunction({ state, dispatch(spec) { change = spec; state = state.update(spec).state; } }, { label: 'digitalWrite' }, 0, 4);
    assert.equal(state.doc.toString(), expected);
    assert.equal(change.userEvent, 'input.complete');
    assert.equal(state.selection.main.head, doc.endsWith(')') ? 12 : 13);
  }
});
test('Cached include completion uses current document and does not duplicate closing delimiters', () => {
  let { state, result } = complete('#include <Se|');
  const option = result.options.find(o => o.label === 'Servo.h');
  state = state.update({ changes: { from: state.doc.length, insert: 'rv' } }).state;
  option.apply({ state, dispatch(spec) { state = state.update(spec).state; } }, option, result.from, state.doc.length);
  assert.equal(state.doc.toString(), '#include <Servo.h>');
  ({ state, result } = complete('#include "Se|"'));
  result.options.find(o => o.label === 'Servo.h').apply({ state, dispatch(spec) { state = state.update(spec).state; } }, option, result.from, state.doc.length - 1);
  assert.equal(state.doc.toString(), '#include "Servo.h"');
});
test('Completion has no network or worker code path and stays bounded on a large sketch', async () => {
  for (const file of ['src/autocomplete.js', 'src/arduinoCompletions.js']) assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|Worker)\s*\(/.test(await readFile(file, 'utf8')));
  const sketch = Array.from({ length: 2000 }, (_, i) => `int sensor${i} = ${i};`).join('\n') + '\nvoid loop(){ digi| }';
  const start = performance.now(); const result = complete(sketch).result;
  assert.ok(result.options.some(o => o.label === 'digitalWrite'));
  assert.ok(result.options.length < 1800);
  console.log(`Large-sketch completion (2000 declarations): ${(performance.now() - start).toFixed(1)} ms including EditorState creation; not a Chromebook benchmark.`);
});
