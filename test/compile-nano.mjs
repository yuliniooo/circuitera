import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assetsBase } from './wasm-harness.mjs';
import { compileUno, loadLibraryManifest } from '../src/compiler-engine.js';
import { BOARD_PROFILES } from '../src/boards.js';
import { examples } from '../src/examples.js';
import { libraryExamples } from '../src/libraryExamples.js';
import { workspaceExamples } from '../src/workspaceExamples.js';
import { parseIntelHex } from '../src/serial.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=await loadLibraryManifest(assetsBase);
const mapping={servo:'Servo sweep',wire:'I2C scanner',spi:'SPI transfer',eeprom:'EEPROM read-write',softwareserial:'SoftwareSerial',liquidcrystal:'LCD Hello World',dht:'DHT temperature-humidity','unified-sensor':'Unified sensor',gfx:'GFX canvas',ssd1306:'OLED Hello World',busio:'BusIO register',neopixel:'NeoPixel',newping:'Ultrasonic distance',irremote:'IR remote',keypad:'Keypad',accelstepper:'Stepper motor','liquidcrystal-i2c':'I2C LCD Hello World'};
const report={testedAt:new Date().toISOString(),buildId:manifest.buildId,scope:'Actual shipped AVR-GCC WASM, real assembler/linker/HEX. Filesystem transport only. No physical board attached.',boards:[],checks:[]};
async function checked(name,source,board){const r=await compileUno(source,{assetsBase,boardId:board.id});assert.equal(r.ok,true,r.output);assert.equal(r.board,board.id);assert.ok(parseIntelHex(r.hex).length>0&&parseIntelHex(r.hex).length<=board.flashLimit);assert.equal(r.flashLimit,board.flashLimit);console.log(`PASS — ${board.label}: ${name} — ${r.flashBytes} bytes`);return r;}
const macroSource='#if defined(ARDUINO_AVR_NANO)\nstatic_assert(NUM_ANALOG_INPUTS==8,"Nano variant missing");\nconst int outputPin=8;\n#else\nstatic_assert(NUM_ANALOG_INPUTS==6,"Uno variant changed");\nconst int outputPin=13;\n#endif\nvoid setup(){pinMode(outputPin,OUTPUT);}\nvoid loop(){digitalWrite(outputPin,HIGH);delay(137);}\n';
let unoMacroHex;
for(const board of BOARD_PROFILES.filter(b=>b.family!=='pb')){
  const macro=await checked('Selected board macro and actual analog-input variant',macroSource,board);
  if(board.family==='uno')unoMacroHex=macro.hex;else assert.notEqual(macro.hex,unoMacroHex);
  report.checks.push({name:board.label+' real macros and variant',status:'PASS',hexSha256:sha(macro.hex)});
  if(board.family==='uno')continue;
  const entry={id:board.id,label:board.label,baudRate:board.baudRate,flashLimit:board.flashLimit,libraries:[],sketches:[]};report.boards.push(entry);
  const cases={...examples,Serial:workspaceExamples.Serial,'Nano pins':'void setup(){pinMode(2,INPUT_PULLUP);pinMode(9,OUTPUT);Serial.begin(9600);}\nvoid loop(){int reading=analogRead(A6)+analogRead(A7);digitalWrite(13,digitalRead(2));analogWrite(9,reading/8);Serial.println(reading);delay(10);}\n'};
  for(const [name,source]of Object.entries(cases)){assert.ok(source,name);const r=await checked(name,source,board);entry.sketches.push({name,status:'PASS',source,hexSha256:sha(r.hex),flashBytes:r.flashBytes,ramBytes:r.ramBytes});}
  const changed=await checked('Meaningfully changed Blink',examples.Blink.replaceAll('1000','319'),board);assert.notEqual(sha(changed.hex),entry.sketches.find(s=>s.name==='Blink').hexSha256);
  entry.sketches.push({name:'Different source produces different firmware',status:'PASS',hexSha256:sha(changed.hex)});
  for(const lib of manifest.libraries){const source=libraryExamples[mapping[lib.id]];assert.ok(source,lib.id);const r=await checked(lib.name,source,board);assert.ok(r.stats.libraries.includes(lib.id));entry.libraries.push({id:lib.id,name:lib.name,version:lib.version,hash:lib.hash,status:'PASS',sourceSha256:sha(source),hexSha256:sha(r.hex),flashBytes:r.flashBytes,ramBytes:r.ramBytes,output:r.output});await writeFile('reports/nano-compatibility.json',JSON.stringify(report,null,2)+'\n');}
  const project={kind:'project',entry:'main.ino',files:[{name:'main.ino',code:'#include "sensor.h"\nvoid setup(){Serial.begin(9600);}\nvoid loop(){Serial.println(readSensor());delay(39);}'},{name:'sensor.h',code:'int readSensor();'},{name:'sensor.cpp',code:'#include <Arduino.h>\n#include "sensor.h"\nstatic_assert(NUM_ANALOG_INPUTS==8,"Nano header missing from CPP");\nint readSensor(){return analogRead(A7);}'}]};
  const p=await checked('Independent project objects use Nano variant',project,board);assert.equal(p.stats.projectObjects,2);entry.sketches.push({name:'Multi-file Nano project',status:'PASS',hexSha256:sha(p.hex)});
}
const nearLimit='#include <avr/pgmspace.h>\nconst unsigned char payload[30500] PROGMEM = {7};\nvolatile unsigned char sample;\nvoid setup(){}\nvoid loop(){sample=pgm_read_byte(payload+(millis()%30500));}\n';
const nearUno=await checked('Uno flash space above Nano reservation remains usable',nearLimit,BOARD_PROFILES[0]);assert.ok(nearUno.flashBytes>30720);
for(const board of BOARD_PROFILES.filter(b=>b.family==='nano')){
 const limited=await compileUno(nearLimit,{assetsBase,boardId:board.id});assert.equal(limited.ok,false);assert.equal(limited.hex,undefined);assert.match(limited.output,/maximum is 30720/);
 const bad=await compileUno('void setup(){\nmissingSensor();\n}\nvoid loop(){}',{assetsBase,boardId:board.id});assert.equal(bad.ok,false);assert.ok(bad.diagnostics.some(d=>d.line===2));assert.ok(bad.output.includes(board.bootloader));
 report.checks.push({name:board.label+' real flash-limit rejection and GCC line-2 error',status:'PASS',output:limited.output,diagnostics:bad.diagnostics});
}
const prior=JSON.parse(await readFile('test/fixtures/pre-nano/regressions.json','utf8'));
for(const [name,source]of Object.entries(examples)){const r=await checked(name+' unchanged Uno firmware',source,BOARD_PROFILES[0]);assert.equal(sha(r.hex),prior.checks.find(c=>c.name===name).sha256);report.checks.push({name:name+' previous Uno HEX byte-identical',status:'PASS',hexSha256:sha(r.hex)});}
await writeFile('reports/nano-compatibility.json',JSON.stringify(report,null,2)+'\n');
