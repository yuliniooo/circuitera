import {getBoard,DEFAULT_BOARD} from './boards.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assessSignature(signature,boardId=DEFAULT_BOARD) {
 const board=getBoard(boardId),reported=signature?.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')||'Unavailable';
 const chip=reported==='1E 95 0F'?'ATmega328P':reported==='1E 95 16'?'ATmega328PB':null;
 const expected=board.mcu==='atmega328pb'?'ATmega328PB':'ATmega328P';
 if(signature&&!chip){const error=new Error(`Unexpected signature ${reported}. Selected ${expected}; no flash was written.`);error.code='UNEXPECTED_SIGNATURE';throw error;}
 return {reported,expected,reportedTarget:chip,identification:chip===expected?'Reported signature matches selected target':'Uncertain',note:chip===expected?'A serial bootloader signature is not independent hardware identification.':`Selected board: ${expected}. Some compatible bootloaders report a compiled signature${chip?' ('+chip+')':''}; the physical MCU is not confirmed. Confirm the chip marking before uploading.`};
}
async function probe(port,board,baudRate,onLog) {
 let reader,writer,opened=false,pending=null,buffer=[],received=0;
 async function byte(ms){
  if(buffer.length)return buffer.shift();
  if(!pending)pending=reader.read();
  let timer;
  try {
   const result=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Bootloader response timed out')),ms);})]);
   pending=null;if(result.done)throw new Error('Serial connection closed unexpectedly');
   buffer.push(...result.value);received+=result.value.length;
   return buffer.length?buffer.shift():byte(ms);
  } finally {clearTimeout(timer);}
 }
 const write=bytes=>writer.write(Uint8Array.from([...bytes,0x20]));
 try {
  await port.open({baudRate,bufferSize:1024});opened=true;
  reader=port.readable.getReader();writer=port.writable.getWriter();
  onLog(`Serial connection: OK (${baudRate} baud)`);
  try{await port.setSignals({dataTerminalReady:false,requestToSend:false});await pause(80);await port.setSignals({dataTerminalReady:true,requestToSend:true});await pause(280);}catch{await pause(350);}
  let synced=false;
  for(let attempt=0;attempt<6&&!synced;attempt++){
   buffer=[];await write([0x30]);const deadline=Date.now()+450;let last=-1;
   try{while(Date.now()<deadline){const b=await byte(Math.max(1,deadline-Date.now()));if(last===0x14&&b===0x10){synced=true;break;}last=b;}}catch{}
  }
  if(!synced){const e=new Error(received?'STK500 synchronization failure: serial bytes received, but no valid reply.':'No bootloader response. Check reset, USB cable, UART0 and bootloader baud rate.');e.code=received?'SYNC_FAILURE':'NO_BOOTLOADER_RESPONSE';throw e;}
  onLog('STK500 synchronization: OK');
  let signature=null;
  try{
   await write([0x75]);
   if(await byte(600)!==0x14)throw Error('Unsupported signature response');
   const bytes=[await byte(600),await byte(600),await byte(600)];
   if(await byte(600)!==0x10)throw Error('Incomplete signature response');
   signature=bytes;
  }catch{onLog('Signature query unavailable; bootloader synchronized, physical identity uncertain.');}
  const assessment=assessSignature(signature,board.id);
  onLog(`Reported signature: ${assessment.reported}\nSelected target: ${assessment.expected}\nIdentification: ${assessment.identification}\n${assessment.note}\nBootloader communication: compatible`);
  // Diagnostic is read-only with respect to flash. Leaving programming mode
  // lets the old sketch resume; upload will reset and re-synchronize normally.
  await write([0x51]);
  return {serial:true,synchronized:true,compatible:true,baudRate,...assessment};
 }finally{
  if(reader){try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
  try{writer?.releaseLock();}catch{}
  if(opened)await port.close();
 }
}
export async function diagnoseBoard(port,boardId=DEFAULT_BOARD,{onLog=()=>{}}={}) {
 const board=getBoard(boardId);
 for(const baud of board.family==='pb'?[115200,57600]:[board.baudRate]){
  try{return await probe(port,board,baud,onLog);}catch(e){
   if(board.family==='pb'&&baud===115200&&['NO_BOOTLOADER_RESPONSE','SYNC_FAILURE'].includes(e.code)){onLog('Retrying compatible bootloader at 57600 baud…');continue;}
   throw e;
  }
 }
}
