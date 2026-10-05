import assert from "node:assert/strict";
import test from "node:test";
import { parseIntelHex } from "../src/serial.js";
import { diagnosticsFromCompiler, generateArduinoPrototypes, prepareArduinoSource } from "../src/compiler.js";

test("parses Intel HEX and pads to an Uno flash page", () => {
  const result = parseIntelHex(":100000000C945C000C946E000C946E000C946E00CA\n:00000001FF\n");
  assert.equal(result.length, 128);
  assert.deepEqual([...result.slice(0, 4)], [0x0c, 0x94, 0x5c, 0x00]);
  assert.equal(result[127], 0xff);
});

test("rejects a bad Intel HEX checksum", () => {
  assert.throws(() => parseIntelHex(":040000000102030400\n:00000001FF"), /checksum/i);
});

test("rejects data in the Uno bootloader area", () => {
  assert.throws(() => parseIntelHex(":020000040000FA\n:017E00000081\n:00000001FF"), /exceeds/i);
});

test("prepares an Arduino sketch with Arduino.h and source line mapping", () => {
  const source = "void setup() { later(); }\nvoid loop() {}\nvoid later() {}";
  const prepared = prepareArduinoSource(source);
  assert.match(prepared, /^#include <Arduino\.h>/);
  assert.match(prepared, /void later\(\);/);
  assert.match(prepared, /#line 1 "sketch\.ino"/);
});

test("does not generate prototypes from comments, strings, or control statements", () => {
  const source = '// void fake() {}\nconst char* text = "void nope() {}";\nvoid setup(){ if (true) {} }\nvoid loop(){}';
  const prototypes = generateArduinoPrototypes(source);
  assert.equal(prototypes.some((line) => line.includes("fake")), false);
  assert.equal(prototypes.some((line) => line.includes("nope")), false);
  assert.equal(prototypes.some((line) => line.includes("if")), false);
});

test("extracts clickable compiler diagnostics", () => {
  const output = "sketch.ino:7:3: error: 'missingThing' was not declared in this scope";
  assert.deepEqual(diagnosticsFromCompiler(output), [{
    line: 7,
    column: 3,
    severity: "error",
    message: "'missingThing' was not declared in this scope",
  }]);
});
