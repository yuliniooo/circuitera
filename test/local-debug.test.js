import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSketch, clampFontSize, compilerFailureSummary } from '../src/localDebug.js';
const hints=(code,options={})=>inspectSketch({files:[{name:'main.ino',code}],baudRate:9600,boardId:'arduino:avr:uno',...options});
test('debug hints ignore comments, quoted text and raw strings',()=>{
  const source='// analogRead(9);\n/* Servo arm; arm.attach(25); */\nconst char *x="Serial.begin(115200);"; const char *y=R"tag(digitalWrite(8,HIGH);)tag";';
  assert.deepEqual(hints(source),[]);
});
test('board-aware analog and Servo hints respect Nano analog-only pins',()=>{
  assert.equal(hints('analogRead(A5); analogRead(0); analogRead(19);').length,0);
  assert.ok(hints('analogRead(9);').some(n=>n.title==='CHECK ANALOG INPUT'));
  assert.equal(hints('analogRead(A7);',{boardId:'arduino:avr:nano:cpu=atmega328'}).length,0);
  assert.ok(hints('Servo arm; arm.attach(A7);',{boardId:'arduino:avr:nano:cpu=atmega328'}).some(n=>n.title==='CHECK SERVO PIN'));
  assert.equal(hints('Servo arm; arm.attach(4); Other obj; obj.attach(30);').length,0);
});
test('missing pinMode is a suggestion; baud mismatch and real errors retain location',()=>{
  const source='const int LED_PIN = 9;\nvoid setup(){Serial.begin(115200);}\nvoid loop(){digitalWrite(LED_PIN,HIGH);}';
  assert.ok(hints(source).some(n=>n.level==='WARNING'&&n.line===2));
  assert.ok(hints(source).some(n=>n.level==='SUGGESTION'&&n.line===3));
  assert.ok(!hints(source+'\nvoid initPin(){pinMode(9,OUTPUT);}').some(n=>n.title==='CHECK OUTPUT MODE'));
  const options={diagnostics:[{severity:'error',line:4,column:3,message:"'thing' was not declared in this scope",file:'main.ino'}]};
  assert.equal(hints('',options).length,0);
  assert.equal(hints('',{...options,currentBuild:true})[0].level,'ERROR');
  const repeated=hints('',{...options,diagnostics:[...options.diagnostics,...options.diagnostics],currentBuild:true});
  assert.equal(repeated.length,1);assert.equal(repeated[0].file,'main.ino');
});
test('unknown headers are tentative until GCC supplies a real error; local headers are recognized',()=>{
  const libraries=[{headers:['Servo.h']}];
  const code='#include <Servo.h>\n#include "motor.h"\n#include <Maybe.h>\n';
  const notices=hints(code,{libraries,files:[{name:'main.ino',code},{name:'motor.h',code:'#pragma once'}]});
  assert.equal(notices.length,1);assert.equal(notices[0].level,'SUGGESTION');assert.match(notices[0].text,/Maybe.h/);
  assert.equal(hints('',{currentBuild:true,result:{flashBytes:33000,ramBytes:2200}}).filter(n=>n.level==='ERROR').length,2);
});
test('presentation settings stay bounded and compiler failures keep actionable explanations',()=>{
  assert.equal(clampFontSize(500),24);assert.equal(clampFontSize(-1),12);assert.equal(clampFontSize('bad'),15);
  assert.match(compilerFailureSummary('Compiler asset fetch failed: /avr/tools/cc1plus.wasm'),/failed path/);
});
