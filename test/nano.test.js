import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {UnoPortFixture} from './uno-port-fixture.js';
import {uploadForBoard} from '../src/boardUpload.js';
import {BOARD_PROFILES,DEFAULT_BOARD,getBoard,readBoardSetting,BOARD_STORAGE_KEY} from '../src/boards.js';
import {parseIntelHex} from '../src/serial.js';
import {boardSerialFailure} from '../src/workspaceSupport.js';
import {findBoardPin} from '../src/boardPins.js';
import {EditorState} from '@codemirror/state';
import {cpp} from '@codemirror/lang-cpp';
import {CompletionContext} from '@codemirror/autocomplete';
import {createArduinoCompletionSource} from '../src/autocomplete.js';
import {pinReferenceAt} from '../src/pinHover.js';
const hex=await readFile('reports/firmware/servo.hex','utf8');
const bytes=parseIntelHex(hex);
test('Uno uploader remains byte-identical to physically proven source',async()=>{
 assert.equal(createHash('sha256').update(await readFile('src/serial.js')).digest('hex'),'d33474919b9f1a711a53c31bcab854c5ce6339a68c771e10785312737e331baa');
 assert.deepEqual(await readFile('src/serial.js'),await readFile('test/fixtures/pre-nano/serial.js'));
});
test('Unknown target rejected; new and invalid preferences default safely to Uno',()=>{
 assert.throws(()=>getBoard('nano-every'),/Unsupported board/);
 globalThis.localStorage={getItem:()=>null};assert.equal(readBoardSetting(),DEFAULT_BOARD);
 globalThis.localStorage={getItem:()=> 'invalid'};assert.equal(readBoardSetting(),DEFAULT_BOARD);
});
for(const board of BOARD_PROFILES.filter(b=>b.family!=='pb')) for(const [usbVendorId,usbProductId] of board.family==='uno'?[[0x2341,0x0043]]:[[0x1A86,0x7523],[0x0403,0x6001],[0x10C4,0xEA60]]){
 test(`${board.label}: STK500v1 flash/readback/release, USB ${usbVendorId.toString(16)}:${usbProductId.toString(16)} (software port)`,async()=>{
  const port=new UnoPortFixture({uploadBaud:board.baudRate,usbVendorId,usbProductId}),logs=[],progress=[];
  await uploadForBoard(port,hex,{onLog:s=>logs.push(s),onProgress:p=>progress.push(p)},board.id);
  assert.equal(port.options.baudRate,board.baudRate);assert.equal(port.closed,true);
  assert.deepEqual(port.memory.slice(0,bytes.length),bytes);
  assert.equal(port.commands.filter(c=>c===0x74).length,bytes.length/128);
  assert.equal(port.commands.at(-1),0x51);assert.equal(progress.at(-1),100);
  assert.deepEqual(port.signals,[{dataTerminalReady:false,requestToSend:false},{dataTerminalReady:true,requestToSend:true}]);
  assert.ok(logs.some(line=>line.startsWith('Upload verified.')));
  await port.open({baudRate:9600});port.receive('temperature:23.7\n');
  const reader=port.readable.getReader();assert.equal(new TextDecoder().decode((await reader.read()).value),'temperature:23.7\n');
  await reader.cancel();reader.releaseLock();await port.close();
 });
}
for(const board of BOARD_PROFILES.filter(b=>b.family==='nano')){
 test(`${board.label}: timeout retry preserves next ACK; monitor port can reopen`,async()=>{
  const port=new UnoPortFixture({uploadBaud:board.baudRate,ignoreSync:1});
  await uploadForBoard(port,hex,{},board.id);assert.equal(port.commands.filter(c=>c===0x30).length,2);assert.equal(port.closed,true);
 });
 for(const failure of ['corruptRead','disconnectOnRead'])test(`${board.label}: ${failure} cannot report success`,async()=>{
  const port=new UnoPortFixture({uploadBaud:board.baudRate,[failure]:true}),logs=[];
  await assert.rejects(uploadForBoard(port,hex,{onLog:s=>logs.push(s)},board.id),failure==='corruptRead'?/Flash verification failed/:/device has been lost/);
  assert.equal(port.closed,true);assert.ok(!logs.some(s=>s.startsWith('Upload verified.')));
 });
 test(`${board.label}: failed sync shows selected bootloader, baud, connection and original exception`,async()=>{
  const port=new UnoPortFixture({uploadBaud:board.baudRate,ignoreSync:99});let failure;
  try{await uploadForBoard(port,hex,{},board.id);}catch(error){failure=error;}
  assert.ok(failure);assert.equal(port.commands.filter(c=>c===0x30).length,12);assert.equal(port.closed,true);
  const message=boardSerialFailure(failure,board.id,'USB 1A86:7523 selected');
  for(const expected of [board.bootloader,String(board.baudRate),'USB 1A86:7523','UNABLE TO SYNC WITH NANO','Original error:',failure.message,'try'])assert.ok(message.includes(expected),expected);
 });
 test(`${board.label}: rejects firmware above Nano application boundary before serial open`,async()=>{
  const data=[1,0x78,0,0,42];data.push((-data.reduce((a,b)=>a+b,0))&255);
  const large=':'+data.map(n=>n.toString(16).padStart(2,'0')).join('')+'\n:00000001FF\n';
  const port=new UnoPortFixture({uploadBaud:board.baudRate});
  await assert.rejects(uploadForBoard(port,large,{},board.id),/30720 bytes/);assert.equal(port.options,undefined);
 });
}
test('Nano A6/A7 are analog-only in helper, hover and local autocomplete; Uno stays unchanged',()=>{
 const nano=BOARD_PROFILES[1].id;
 for(const pin of ['A6','A7']){
  assert.deepEqual(findBoardPin(pin,nano).capabilities,['ANALOG']);assert.equal(findBoardPin(pin,DEFAULT_BOARD),undefined);
  const state=EditorState.create({doc:`void loop(){analogRead(${pin});}`,extensions:[cpp()]});
  assert.equal(pinReferenceAt(state,state.doc.toString().indexOf(pin)+1,nano).pin.name,pin);
  assert.equal(pinReferenceAt(state,state.doc.toString().indexOf(pin)+1),null);
 }
 const state=EditorState.create({doc:'void loop(){ A',extensions:[cpp()]});
 for(const board of BOARD_PROFILES.filter(b=>b.family!=='pb')){const result=createArduinoCompletionSource([],board.id)(new CompletionContext(state,state.doc.length,true));assert.equal(result.options.some(o=>o.label==='A7'),board.family==='nano');}
});
