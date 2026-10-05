import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assetsBase} from './wasm-harness.mjs';
import {compileUno,loadLibraryManifest} from '../src/compiler-engine.js';
import {DEFAULT_BOARD,PB_BOARD} from '../src/boards.js';
import {libraryExamples} from '../src/libraryExamples.js';
const cases={
 Blink:'void setup(){pinMode(LED_BUILTIN,OUTPUT);}\nvoid loop(){digitalWrite(LED_BUILTIN,HIGH);delay(500);digitalWrite(LED_BUILTIN,LOW);delay(500);}',
 Serial:'void setup(){Serial.begin(9600);}\nvoid loop(){Serial.println("Circuitera");delay(1000);}',
 Analog:'void setup(){Serial.begin(9600);}\nvoid loop(){Serial.println(analogRead(A0));delay(100);}',
 PWM:'void setup(){pinMode(9,OUTPUT);}\nvoid loop(){analogWrite(9,128);}',
 Interrupts:'volatile unsigned long pulses;\nvoid tick(){pulses++;}\nvoid setup(){pinMode(2,INPUT_PULLUP);attachInterrupt(digitalPinToInterrupt(2),tick,FALLING);}\nvoid loop(){unsigned long t=micros()+millis();digitalWrite(13,digitalRead(2));}',
 Pins:'static_assert(LED_BUILTIN==13 && SDA==18 && SCL==19 && MOSI==11 && MISO==12 && SCK==13 && SS==10 && NUM_ANALOG_INPUTS==6,"pin mapping");\nvoid setup(){}\nvoid loop(){}',
};
const mapping={servo:'Servo sweep',wire:'I2C scanner',spi:'SPI transfer',eeprom:'EEPROM read-write',softwareserial:'SoftwareSerial'};
const manifest=await loadLibraryManifest(assetsBase);
const report={buildId:manifest.buildId,scope:'Actual AVR-GCC WASM compile/link/HEX via filesystem transport. Physical upload unverified.',boards:[]};
for(const boardId of [DEFAULT_BOARD,PB_BOARD]){
 const entry={id:boardId,sketches:[],libraries:[]};report.boards.push(entry);
 for(const [name,source] of Object.entries({...cases,...Object.fromEntries(Object.entries(mapping).map(([k,v])=>[k,libraryExamples[v]]))})){
  const r=await compileUno(source,{assetsBase,boardId});assert.equal(r.ok,true,r.output);
  const proof={name,status:'PASS',flashBytes:r.flashBytes,ramBytes:r.ramBytes,hexSha256:createHash('sha256').update(r.hex).digest('hex')};
  if(mapping[name]){const lib=manifest.libraries.find(l=>l.id===name);entry.libraries.push({...proof,id:name,hash:lib.hash});}else entry.sketches.push(proof);
  console.log('PASS',boardId,name,r.flashBytes,r.ramBytes);
 }
 const guard=boardId===PB_BOARD?'#if !defined(__AVR_ATmega328PB__) || defined(__AVR_ATmega328P__)\n#error Incorrect MCU\n#endif\nstatic_assert(_VECTORS_SIZE==180,"PB vectors");\nvolatile unsigned char *extra=&UCSR1A;':'#if !defined(__AVR_ATmega328P__) || defined(__AVR_ATmega328PB__)\n#error Incorrect MCU\n#endif';
 const r=await compileUno(guard+'\nvoid setup(){}\nvoid loop(){}',{assetsBase,boardId});assert.equal(r.ok,true,r.output);
 const project={kind:'project',entry:'main.ino',files:[{name:'main.ino',code:'#include "sensor.h"\nvoid setup(){Serial.begin(9600);}\nvoid loop(){Serial.println(readSensor());}'},{name:'sensor.h',code:'int readSensor();'},{name:'sensor.cpp',code:'#include <Arduino.h>\n#include "sensor.h"\nint readSensor(){return analogRead(A0);}'}]};
 const p=await compileUno(project,{assetsBase,boardId});assert.equal(p.ok,true,p.output);assert.equal(p.stats.projectObjects,2);
 const cache=await compileUno(libraryExamples['Servo sweep'],{assetsBase,boardId});assert.equal(cache.ok,true,cache.output);assert.ok(cache.stats.cachedObjects>0);
 entry.sketches.push({name:'MCU macro/vector guard, multifile project, Servo cache',status:'PASS'});
}
await writeFile('reports/pb-compatibility.json',JSON.stringify(report,null,2)+'\n');
