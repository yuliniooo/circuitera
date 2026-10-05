import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { assetsBase } from './wasm-harness.mjs';
import { compileUno } from '../src/compiler-engine.js';
import { parseIntelHex } from '../src/serial.js';
import { examples } from '../src/examples.js';
import { libraryExamples } from '../src/libraryExamples.js';
import { workspaceExamples, exampleGroups } from '../src/workspaceExamples.js';
import { explainDiagnostics } from '../src/workspaceSupport.js';
const all = { ...examples, ...libraryExamples, ...workspaceExamples };
const records = [];
for (const name of new Set(Object.values(exampleGroups).flat())) {
  const result = await compileUno(all[name], { assetsBase });
  assert.ok(result.ok, `${name}: ${result.output}`);
  assert.ok(parseIntelHex(result.hex).length && result.hex.includes(':00000001FF'));
  records.push({ name, status: 'PASS', sourceSha256: createHash('sha256').update(all[name]).digest('hex'), hexSha256: createHash('sha256').update(result.hex).digest('hex'), flashBytes: result.flashBytes, ramBytes: result.ramBytes, output: result.output });
  console.log(`PASS — ${name}: ${result.flashBytes} flash / ${result.ramBytes} SRAM bytes`);
}
const coreSource = `
volatile unsigned long edges = 0;
void changed() { edges++; }
class Reading { public: int value; Reading(int n): value(n) {} int scaled() { return constrain(map(value, 0, 1023, 0, 255), 0, 255); } };
void setup() { pinMode(9, OUTPUT); pinMode(2, INPUT_PULLUP); Serial.begin(9600); attachInterrupt(digitalPinToInterrupt(2), changed, CHANGE); }
void loop() {
 Reading sample(analogRead(A0)); analogWrite(9, sample.scaled());
 digitalWrite(LED_BUILTIN, digitalRead(2)); delayMicroseconds(5);
 Serial.println(millis()); Serial.println(micros()); Serial.println(pulseIn(3, HIGH, 50));
 Serial.println(random(100)); noInterrupts(); unsigned long count = edges; interrupts();
 Serial.println(count); detachInterrupt(digitalPinToInterrupt(2)); delay(20);
}`;
const core = await compileUno(coreSource, { assetsBase });
assert.ok(core.ok, core.output); assert.deepEqual(core.stats.libraries, []); assert.ok(parseIntelHex(core.hex).length);
records.push({ name: 'Default Arduino core APIs, interrupts, C++ class; no libraries selected', status: 'PASS', sourceSha256: createHash('sha256').update(coreSource).digest('hex'), hexSha256: createHash('sha256').update(core.hex).digest('hex'), flashBytes: core.flashBytes, output: core.output });
const invalid = [
 ['MISSING SEMICOLON', 'void setup() {\n pinMode(13, OUTPUT)\n}\nvoid loop() {}'],
 ['UNKNOWN NAME', 'void setup() {\n distanceSensor();\n}\nvoid loop() {}'],
 ['BRACKET ERROR', 'void setup() {}\nvoid loop() {\n delay(10);'],
 ['LIBRARY NOT AVAILABLE', '#include <ExampleLibrary.h>\nvoid setup() {}\nvoid loop() {}'],
];
for (const [title, source] of invalid) {
 const result = await compileUno(source, { assetsBase });
 assert.equal(result.ok, false); assert.equal(result.hex, undefined);
 assert.ok(explainDiagnostics(result.diagnostics).some(d => d.title === title), result.output);
 records.push({ name: `Explanation from real GCC output: ${title}`, status: 'PASS', output: result.output });
}
await writeFile('reports/workspace-tests.json', JSON.stringify({ testedAt: new Date().toISOString(), scope: 'Real AVR-GCC WASM, linking and HEX checks. No physical board.', checks: records }, null, 2));
console.log('PASS — all workspace examples, Arduino core APIs, and actual-error explanations.');
