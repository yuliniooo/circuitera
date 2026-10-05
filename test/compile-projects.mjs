import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assetsBase } from './wasm-harness.mjs';
import { compileUno } from '../src/compiler-engine.js';
import { parseIntelHex } from '../src/serial.js';
import { examples } from '../src/examples.js';
const checks=[];
const sha=text=>createHash('sha256').update(text).digest('hex');
const project={kind:'project',entry:'main.ino',files:[
  {name:'main.ino',code:'#include "motor.h"\n#include "sensors.h"\nvoid setup(){motorBegin();}\nvoid loop(){motorMove(sensorRead()); delay(100);}\n'},
  {name:'motor.h',code:'#pragma once\n#include <Servo.h>\nvoid motorBegin();\nvoid motorMove(int value);\n'},
  {name:'motor.cpp',code:'#include <Arduino.h>\n#include "motor.h"\nServo arm;\nvoid motorBegin(){arm.attach(9);}\nvoid motorMove(int value){arm.write(value);}\n'},
  {name:'sensors.h',code:'#pragma once\n#ifdef __cplusplus\nextern "C" {\n#endif\nint sensorRead(void);\n#ifdef __cplusplus\n}\n#endif\n'},
  {name:'sensors.c',code:'#include <Arduino.h>\n#include "sensors.h"\nint sensorRead(void){return analogRead(A0)/6;}\n'},
]};
async function success(name,source){const result=await compileUno(source,{assetsBase});assert.equal(result.ok,true,result.output);assert.ok(parseIntelHex(result.hex).length>0);checks.push({name,status:'PASS',flashBytes:result.flashBytes,ramBytes:result.ramBytes,hexSha256:sha(result.hex),stats:result.stats});console.log('PASS — '+name);return result;}
const first=await success('Independent main.ino + motor.cpp + sensors.c + headers compile and link with actual Servo library',project);
assert.equal(first.stats.projectObjects,3);assert.deepEqual(first.stats.libraries,['servo']);
const repeat=await success('Unchanged library objects are reused while project translation units are rebuilt',project);
assert.equal(first.hex,repeat.hex);assert.ok(repeat.stats.cachedObjects>0);assert.equal(repeat.stats.projectObjects,3);
const changed=structuredClone(project);changed.files.find(f=>f.name==='motor.cpp').code=changed.files.find(f=>f.name==='motor.cpp').code.replace('arm.attach(9)','arm.attach(10)');
assert.notEqual((await success('Changed secondary .cpp source changes generated firmware',changed)).hex,first.hex);
const headerChange=structuredClone(project);headerChange.files.find(f=>f.name==='motor.h').code+='#define TEST_OFFSET 11\n';headerChange.files.find(f=>f.name==='motor.cpp').code=headerChange.files.find(f=>f.name==='motor.cpp').code.replace('arm.write(value)','arm.write(value+TEST_OFFSET)');
const headerFirst=await success('Project header is visible to separate translation units',headerChange);
headerChange.files.find(f=>f.name==='motor.h').code=headerChange.files.find(f=>f.name==='motor.h').code.replace('OFFSET 11','OFFSET 27');
const headerSecond=await success('Changing only a header recompiles necessary code and invalidates library cache context',headerChange);assert.notEqual(headerFirst.hex,headerSecond.hex);assert.equal(headerSecond.stats.cachedObjects,0);
const missing=structuredClone(project);missing.files=missing.files.filter(f=>f.name!=='motor.cpp');const absent=await compileUno(missing,{assetsBase});assert.equal(absent.ok,false);assert.match(absent.output,/undefined reference/);assert.ok(!absent.hex);checks.push({name:'Missing implementation fails at the real linker',status:'PASS',output:absent.output});
const broken=structuredClone(project);broken.files.find(f=>f.name==='motor.cpp').code='#include "motor.h"\nvoid motorBegin(){}\nvoid motorMove(int value){\n  missingFunction(value);\n}\n';const failure=await compileUno(broken,{assetsBase});assert.equal(failure.ok,false);assert.ok(failure.diagnostics.some(d=>d.file==='motor.cpp'&&d.line===4),failure.output);checks.push({name:'Project compiler diagnostics retain secondary filename and exact line',status:'PASS',output:failure.output});
const extra={kind:'project',entry:'main.ino',files:[{name:'main.ino',code:'void setup(){pinMode(13,OUTPUT);}\nvoid loop(){changeLed();}\n'},{name:'extra.ino',code:'void changeLed(){digitalWrite(13,HIGH);delay(123);digitalWrite(13,LOW);delay(321);}\n'}]};await success('Multiple .ino tabs share Arduino declarations and genuinely compile',extra);
const c99={kind:'project',entry:'main.ino',files:[{name:'main.ino',code:'void setup(){}\nvoid loop(){}'},{name:'strict.c',code:'int values[5]={[3]=42};\n'}]};const strict=await compileUno(c99,{assetsBase});assert.equal(strict.ok,false);checks.push({name:'Unsupported C99 constructs are reported with the real compiler failure',status:'PASS',limitation:true,output:strict.output});
const baseline=JSON.parse(await readFile('test/fixtures/previous-release-regressions.json','utf8'));
for(const [name,source]of Object.entries(examples)){const result=await success(name+' preserves previous single-sketch firmware exactly',source);const prior=baseline.checks.find(r=>r.name===name);assert.ok(prior?.sha256,`Missing prior firmware evidence for ${name}`);assert.equal(sha(result.hex),prior.sha256);}
await mkdir('reports',{recursive:true});await writeFile('reports/project-compilation.json',JSON.stringify({testedAt:new Date().toISOString(),runtime:'Actual shipped AVR-GCC WASM, assembler, linker, objcopy. Filesystem transport only; no precompiled student HEX.',checks},null,2)+'\n');
