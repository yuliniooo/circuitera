import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PB_BOARD,DEFAULT_BOARD} from '../src/boards.js';
import {assessSignature,diagnoseBoard} from '../src/boardDiagnostic.js';
import {uploadForBoard} from '../src/boardUpload.js';
import {UnoPortFixture} from './uno-port-fixture.js';
const hex=await readFile('reports/firmware/servo.hex','utf8');
for(const signature of [[0x1e,0x95,0x16],[0x1e,0x95,0x0f]])test(`PB upload accepts reported ${signature.at(-1).toString(16)} with accurate identification`,async()=>{
 const port=new UnoPortFixture({signature}),logs=[];
 await uploadForBoard(port,hex,{onLog:s=>logs.push(s)},PB_BOARD);
 assert.ok(logs.some(l=>l.includes(signature[2]===0x0f?'Uncertain':'matches selected target')));
 assert.ok(logs.some(l=>l.startsWith('Upload verified.')));assert.ok(port.commands.includes(0x64));assert.equal(port.closed,true);
});
test('Unexpected signature blocks programming and releases port',async()=>{
 const port=new UnoPortFixture({signature:[0x1e,0x98,0x01]});
 await assert.rejects(uploadForBoard(port,hex,{},PB_BOARD),e=>e.code==='UNEXPECTED_SIGNATURE');
 assert.ok(!port.commands.includes(0x64));assert.equal(port.closed,true);
});
test('Diagnostic never writes flash and survives a lost sync reply',async()=>{
 const port=new UnoPortFixture({ignoreSync:1});const r=await diagnoseBoard(port,DEFAULT_BOARD);
 assert.equal(r.synchronized,true);assert.equal(r.reported,'1E 95 0F');assert.ok(port.commands.every(c=>[0x30,0x75,0x51].includes(c)));assert.equal(port.closed,true);
});
test('PB flash readback mismatch cannot report success',async()=>{
 const port=new UnoPortFixture({signature:[0x1e,0x95,0x16],corruptRead:true}),logs=[];
 await assert.rejects(uploadForBoard(port,hex,{onLog:l=>logs.push(l)},PB_BOARD),/verification failed/);
 assert.ok(!logs.some(l=>l.startsWith('Upload verified.')));assert.equal(port.closed,true);
});
test('PB oversize firmware rejected before opening port',async()=>{
 const port=new UnoPortFixture();await assert.rejects(uploadForBoard(port,':017800002A5D\n:00000001FF',{},PB_BOARD),/28672/);assert.equal(port.options,undefined);
});
test('Missing signature remains explicitly uncertain',()=>{assert.equal(assessSignature(null,PB_BOARD).identification,'Uncertain');});
test('Permission failure preserved',async()=>{const e=Object.assign(new Error('denied'),{name:'NotAllowedError'});await assert.rejects(diagnoseBoard({open:async()=>{throw e}},PB_BOARD),e);});

test('PB probes 57600 only after 115200 fails, then uploads at the working baud',async()=>{
 const port=new UnoPortFixture({ignoreSync:6,signature:[0x1e,0x95,0x16]});
 const close=port.close.bind(port);port.close=async()=>{await close();port.uploadBaud=57600;};
 await uploadForBoard(port,hex,{},PB_BOARD);assert.equal(port.options.baudRate,57600);assert.ok(port.commands.includes(0x64));
});
test('No response is distinguished and port released',async()=>{
 const port=new UnoPortFixture({ignoreSync:99});
 await assert.rejects(diagnoseBoard(port,DEFAULT_BOARD),e=>e.code==='NO_BOOTLOADER_RESPONSE');assert.equal(port.closed,true);
});
test('Unsupported signature query allows compatible bootloader with uncertainty',async()=>{
 const port=new UnoPortFixture({signature:[]}),logs=[];
 await uploadForBoard(port,hex,{onLog:l=>logs.push(l)},PB_BOARD);
 assert.ok(logs.some(l=>l.includes('Uncertain')));assert.ok(port.commands.includes(0x64));assert.equal(port.closed,true);
});
