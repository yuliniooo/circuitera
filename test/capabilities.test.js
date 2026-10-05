import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { SketchWorkspace } from '../src/sketchStore.js';
import { compilationSource, sourceIdentity, validateFiles, editorSource } from '../src/projectFiles.js';
import { artifactMatches } from '../src/sketchBuilds.js';
import { pinReferenceAt } from '../src/pinHover.js';
import { findUnoPin } from '../src/unoPins.js';
import { parsePlotLine, serialFailure } from '../src/workspaceSupport.js';
import { plotCsv, plotWindow } from '../src/plotData.js';
import { exportSketchZip } from '../src/sketchZip.js';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Project conversion preserves identity and all files restore atomically without losing other sketches',async()=>{
  const factory=new IDBFactory(),options={factory,starterCode:'void setup(){} void loop(){}'};
  const ws=new SketchWorkspace(options);await ws.initialize();const original=structuredClone(ws.active());
  const other=ws.create('Other','void setup(){} void loop(){delay(777);}');ws.open(original.id);
  ws.convertToProject(original.id);ws.addFile(original.id,'motor.h','#pragma once\nint speed();');ws.addFile(original.id,'motor.cpp','#include "motor.h"\nint speed(){return 23;}');
  ws.editFile(original.id,'main.ino',original.code+'\n// latest main');ws.selectFile(original.id,'motor.h');
  const before=structuredClone(ws.active());assert.equal(before.id,original.id);assert.equal(before.project.files.length,3);
  const copy=ws.duplicate(original.id);ws.editFile(copy.id,'motor.cpp','int speed(){return 27;}');
  assert.notEqual(ws.active().project.files[2].code,before.project.files[2].code);
  ws.open(original.id);await ws.flush();ws.db.close();
  const restored=new SketchWorkspace(options);await restored.initialize();
  assert.deepEqual(restored.active(),before);assert.equal(editorSource(restored.active()),'#pragma once\nint speed();');
  assert.equal(restored.state.sketches.find(s=>s.id===other.id).code,other.code);assert.equal(restored.state.openIds.length,3);
  restored.close(original.id);await restored.flush();assert.ok(restored.state.sketches.some(s=>s.id===original.id));restored.db.close();
});
test('File selection never changes firmware identity, but header edits do; compile snapshots are independent',async()=>{
  const ws=new SketchWorkspace({factory:new IDBFactory(),starterCode:'void setup(){} void loop(){}'});await ws.initialize();const id=ws.active().id;
  ws.convertToProject(id);ws.addFile(id,'pins.h','#define PIN 9');
  const identity=sourceIdentity(ws.active()),snapshot=compilationSource(ws.active());
  const artifact={sketchId:id,source:identity,board:'arduino:avr:uno',hex:':valid-for-identity-test'};
  ws.selectFile(id,'main.ino');assert.equal(sourceIdentity(ws.active()),identity);assert.ok(artifactMatches(artifact,ws.active()));
  ws.editFile(id,'pins.h','#define PIN 10');assert.ok(!artifactMatches(artifact,ws.active()));assert.equal(snapshot.files[1].code,'#define PIN 9');
  assert.throws(()=>ws.renameFile(id,'main.ino','main.cpp'),/main file/);assert.throws(()=>ws.removeFile(id,'main.ino'),/cannot be deleted/);
  ws.renameFile(id,'pins.h','outputs.h');assert.equal(ws.active().project.files[1].name,'outputs.h');ws.removeFile(id,'outputs.h');assert.equal(ws.active().project.files.length,1);
  await ws.flush();ws.db.close();
});
test('Project validation rejects traversal, duplicate names, missing .ino and oversized sources',()=>{
  const entry={name:'main.ino',code:''};
  for(const name of ['../evil.cpp','folder/file.h','/file.c','test.js','main.INO'])assert.throws(()=>validateFiles([entry,{name,code:''}],'main.ino'));
  assert.throws(()=>validateFiles([entry,{name:'MAIN.ino',code:''}],'main.ino'),/Duplicate/);
  assert.throws(()=>validateFiles([{name:'part.cpp',code:''}],'main.ino'),/main .ino/);
  assert.throws(()=>validateFiles([{...entry,code:'x'.repeat(512001)}],'main.ino'),/500 KB/);
});
test('Export All keeps genuine project files and duplicate projects in independent folders',async()=>{
  const files=[{name:'main.ino',code:'void setup(){} void loop(){}'},{name:'motor.cpp',code:'int speed(){return 7;}'},{name:'motor.h',code:'int speed();'}];
  const entries=[{name:'Robot',code:files[0].code,project:{files}},{name:'robot',code:files[0].code,project:{files}},{name:'Robot',code:'// separate normal sketch'}];
  const dir=await mkdtemp(path.join(tmpdir(),'circuitera-project-'));
  try{const zip=path.join(dir,'all.zip');await writeFile(zip,Buffer.from(await exportSketchZip(entries).arrayBuffer()));execFileSync('python',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==7; assert z.read("Robot/motor.cpp")==b"int speed(){return 7;}"; assert z.read("robot_2/motor.h")==b"int speed();"; assert z.read("Robot.ino")==b"// separate normal sketch"',zip]);}finally{await rm(dir,{recursive:true});}
});
test('Pin hover distinguishes digital pins and analogRead channel numbers and ignores comments',()=>{
  const hover=marked=>{const pos=marked.indexOf('|'),state=EditorState.create({doc:marked.replace('|',''),extensions:[cpp()]});return pinReferenceAt(state,pos);};
  assert.equal(hover('digitalWrite(|9,HIGH)').pin.name,'D9');assert.ok(hover('digitalWrite(|9,HIGH)').pin.capabilities.includes('PWM'));
  assert.equal(hover('analogRead(|0)').pin.name,'A0');assert.equal(hover('analogRead(|A5)').pin.name,'A5');assert.equal(hover('digitalRead(|0)').pin.name,'D0');
  for(const value of ['// digitalWrite(|9,HIGH)','const char*s="digitalWrite(|9,HIGH)";','digitalWrite(|35,HIGH)','int x=|9;'])assert.equal(hover(value),null);
  assert.equal(findUnoPin('SDA').number,18);assert.equal(findUnoPin('SCL').number,19);assert.deepEqual([3,5,6,9,10,11].map(n=>findUnoPin(n).capabilities.includes('PWM')),[true,true,true,true,true,true]);
});
test('Plotter parses numeric/labeled series, keeps time windows and exports exact timestamped CSV',()=>{
  assert.deepEqual(parsePlotLine('23.7'),{value:23.7});assert.deepEqual(parsePlotLine('temperature:23.7 humidity:51'),{temperature:23.7,humidity:51});
  const points=[{timeMs:1000,values:{temperature:23.7,humidity:51}},{timeMs:3000,values:{temperature:24.1}},{timeMs:7000,values:{humidity:53}}];
  assert.deepEqual(plotWindow(points,5),points.slice(1));
  assert.equal(plotCsv(points),'"timestamp_ms","timestamp","temperature","humidity"\r\n1000,"1970-01-01T00:00:01.000Z",23.7,51\r\n3000,"1970-01-01T00:00:03.000Z",24.1,\r\n7000,"1970-01-01T00:00:07.000Z",,53\r\n');
});
test('Upload explanations always retain the actual error and stack',()=>{
  for(const [message,category]of [['Unable to sync with Uno','UNABLE TO SYNC'],['Flash verification failed at 128','FLASH VERIFICATION FAILED'],['Board disconnected during upload','DEVICE DISCONNECTED']]){const error=new Error(message),output=serialFailure(error);assert.ok(output.includes(category));assert.ok(output.includes(message));assert.ok(output.includes(error.stack));}
  assert.match(serialFailure(new DOMException('User rejected permission','NotAllowedError')),/SERIAL PERMISSION DENIED/);
  assert.match(serialFailure(new DOMException('No selected device','NotFoundError')),/NO BOARD FOUND/);
});
