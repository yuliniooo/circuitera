import { uploadUno, parseIntelHex, describePort } from './serial.js';
import { diagnoseBoard } from './boardDiagnostic.js';
import { getBoard, DEFAULT_BOARD, boardDetails } from './boards.js';

// A real Web Serial port adapter, not a protocol simulation. The proven uploader
// continues to send the original STK500v1 commands and verify every flash page.
// Uno calls go straight to uploadUno with no adapter or changed timing.
function nanoPort(port,board,onLog) {
  let reader, writer, pendingUSBRead, waiting, cancelling, releaseRequested=false, opened=false;
  let syncAttempts=0, syncDeadline=0, syncPhase=true, queued=[];
  const settle=(error,result)=>{const request=waiting;if(!request)return false;waiting=null;clearTimeout(request.timer);error?request.reject(error):request.resolve(result);return true;};
  const pull=()=>{
    if(pendingUSBRead)return;
    pendingUSBRead=reader.read().then(result=>{pendingUSBRead=null;if(!settle(null,result))queued.push(result);},error=>{pendingUSBRead=null;if(!settle(error))queued.push({error});});
  };
  return {
    async open(options){await port.open({...options,baudRate:board.baudRate});opened=true;},
    get writable(){return {getWriter(){writer=port.writable.getWriter();return {
      write(packet){
        if(packet[0]===0x30){
          // Retire a timed-out sync consumer before another request is sent.
          // Keep the one actual USB read; any late bytes enter the queue.
          settle(new Error('STK500 synchronization read superseded.'));queued=[];
          syncDeadline=Date.now()+400;
          onLog?.(`STK500 synchronization attempt ${++syncAttempts}/12 · ${board.baudRate} baud`);
        }else syncPhase=false;
        return writer.write(packet);
      },
      releaseLock(){writer.releaseLock();},
    };}};},
    get readable(){return {getReader(){
      reader=port.readable.getReader();
      return {
        read(){
          const ready=queued.shift();if(ready)return ready.error?Promise.reject(ready.error):Promise.resolve(ready);
          return new Promise((resolve,reject)=>{
            waiting={resolve,reject};
            // Expire before the existing transport's 450 ms sync deadline, so
            // abandoned Promise.race reads cannot consume the next attempt's ACK.
            if(syncPhase)waiting.timer=setTimeout(()=>settle(new Error('Nano STK500 synchronization timeout.')),Math.max(1,syncDeadline-Date.now()));
            pull();
          });
        },
        cancel(){settle(null,{done:true});if(!cancelling)cancelling=reader.cancel().catch(()=>{}).finally(()=>{if(releaseRequested)reader.releaseLock();});return cancelling;},
        releaseLock(){if(cancelling)releaseRequested=true;else reader.releaseLock();},
      };
    }};},
    async setSignals(signals){try{await port.setSignals(signals);}catch(error){onLog?.(`Automatic DTR/RTS reset failed: ${error.message}. Try pressing Reset just before synchronization.`);throw error;}},
    async close(){try{await cancelling;}finally{if(opened){await port.close();opened=false;}}},
  };
}
export async function uploadForBoard(port,hex,callbacks={},boardId=DEFAULT_BOARD) {
  let board=getBoard(boardId);
  if(board.family==='uno')return uploadUno(port,hex,callbacks);
  const firmware=parseIntelHex(hex);
  if(firmware.length>board.flashLimit)throw new Error(`Firmware exceeds the selected board application flash area (${board.flashLimit} bytes). No upload was started.`);
  if(board.family==='pb'){const diagnostic=await diagnoseBoard(port,boardId,callbacks);board={...board,baudRate:diagnostic.baudRate};}
  callbacks.onLog?.(boardDetails(board));
  callbacks.onLog?.(`Serial device: ${describePort(port)}. USB bridge IDs do not identify the target microcontroller.`);
  const translatedLog=line=>line.replaceAll('Uno R3',board.shortName).replaceAll('Uno',board.shortName).replace('115200 baud',`${board.baudRate} baud`);
  let synchronized=false;
  try {
    return await uploadUno(nanoPort(port,board,callbacks.onLog),hex,{...callbacks,onLog:line=>{
      if(line.includes('bootloader synchronized'))synchronized=true;
      callbacks.onLog?.(translatedLog(line));
    }});
  } catch(error) {
    if(board.family==='pb'&&synchronized)error.code='FLASH_WRITE_FAILURE';
    throw error;
  }
}
