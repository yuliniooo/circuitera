import { getBoard, DEFAULT_BOARD, boardDetails } from './boards.js';
// Presentation helpers only. These never generate or modify firmware.
export const serialPolicyMessage = 'USB serial access is unavailable on this Chromebook. Ask your teacher or school IT administrator to allow serial-device access for this site.';

export function explainDiagnostics(diagnostics) {
  return diagnostics.filter(d => d.severity === 'error' || d.severity === 'fatal error').map(d => {
    const message = d.message;
    let title = 'COMPILER ERROR', explanation = message;
    const missing = message.match(/(?:fatal error:\s*)?([^\s:]+\.h(?:pp)?): No such file or directory/);
    const unknown = message.match(/['‘]([^'’]+)['’] was not declared/);
    if (missing) { title = 'LIBRARY NOT AVAILABLE'; explanation = `${missing[1]} is not available in the loaded Circuitera libraries.`; }
    else if (/expected ['‘];['’]/.test(message)) { title = 'MISSING SEMICOLON'; explanation = `Line ${d.line} or the line just before it may need a ;`; }
    else if (unknown) { title = 'UNKNOWN NAME'; explanation = `${unknown[1]} has not been declared. Check its spelling and where it is defined.`; }
    else if (/expected ['‘][{}()\[\]][’']|expected.*at end of input/.test(message)) { title = 'BRACKET ERROR'; explanation = `Check your brackets near line ${d.line}. A matching bracket may be missing earlier in the sketch.`; }
    else if (/missing terminating/.test(message)) { title = 'UNCLOSED QUOTE'; explanation = `Check the quotation marks near line ${d.line}.`; }
    return { ...d, title, explanation };
  });
}

export function serialFailure(error, boardId=DEFAULT_BOARD) {
  const raw = error?.message || String(error);
  let title = 'SERIAL ERROR', explanation = 'The serial operation could not finish. Check the original error below.';
  if (error?.name === 'NotFoundError') { title = 'NO BOARD FOUND / SELECTED'; explanation = 'Connect an Arduino Uno R3 with a USB data cable, then select it in Chrome’s device picker. Cancelling the picker also leaves no board selected.'; }
  else if (error?.name === 'SecurityError') { title = 'SERIAL ACCESS DENIED'; explanation = serialPolicyMessage; }
  else if (error?.name === 'NotAllowedError') { title = 'SERIAL PERMISSION DENIED'; explanation = 'Circuitera needs permission to communicate with the selected USB serial device. '+serialPolicyMessage; }
  else if (error?.code === 'UNEXPECTED_SIGNATURE') { title='UNEXPECTED SIGNATURE'; explanation='The bootloader reported an unsupported device. No flash was written.'; }
  else if (error?.code === 'NO_BOOTLOADER_RESPONSE') { title='NO BOOTLOADER RESPONSE'; explanation='No STK500 reply arrived. Check USB, reset, UART0 and the installed bootloader.'; }
  else if (error?.code === 'SYNC_FAILURE') { title='SYNCHRONIZATION FAILED'; explanation='Serial data arrived but no valid STK500 synchronization reply was received.'; }
  else if (/verification|verify/i.test(raw)) { title = 'FLASH VERIFICATION FAILED'; explanation = 'Transferred bytes did not match the flash readback. Reconnect the USB cable and retry. This upload was not successful.'; }
  else if (error?.code === 'FLASH_WRITE_FAILURE') { title='FLASH / WRITE FAILED'; explanation='The bootloader synchronized, but programming or readback did not complete. This upload was not successful.'; }
  else if (/bootloader|synchroniz|\bsync\b/i.test(raw)) { title = 'UNABLE TO SYNC WITH UNO'; explanation = 'The serial device was selected, but the Uno bootloader did not respond correctly.\n• Reconnect USB and try again.\n• Press Reset, then retry Upload.\n• Check that the selected device is an Uno R3.\n• Close other apps using the port and disconnect anything from D0/D1.'; }
  else if (/disconnected|closed unexpectedly|device has been lost/i.test(raw)) { title = 'DEVICE DISCONNECTED / BOARD DISCONNECTED'; explanation = 'The Arduino was disconnected or its serial stream closed during the operation. Reconnect it and select the Uno again.'; }
  else if (/already open|already in use|Failed to open/i.test(raw)) { title = 'SERIAL PORT BUSY'; explanation = 'Close other serial monitors or apps using this port, then reconnect.'; }
  if (getBoard(boardId).family==='nano') { title=title.replace('UNO','NANO'); explanation=explanation.replaceAll('Uno R3','Nano V3').replaceAll('Uno','Nano'); }
  if(getBoard(boardId).family==='pb'){title=title.replace('UNO','ATMEGA328PB');explanation=explanation.replaceAll('Uno R3','ATmega328PB board').replaceAll('Uno','ATmega328PB board');}
  return `${title}\n${explanation}\n\nOriginal error: ${error?.name || 'Error'}: ${raw}${error?.stack ? '\n'+error.stack : ''}`;
}

// A line is accepted only if all its fields are finite numbers or label:number.
export function parsePlotLine(line) {
  const clean = line.trim();
  if (!clean || clean.length > 1024) return null;
  const fields = clean.split(/[,\t ]+/);
  if (fields.length > 8) return null;
  const values = {};
  for (let i = 0; i < fields.length; i++) {
    const match = fields[i].match(/^(?:([A-Za-z_][\w.-]*):)?([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$/);
    if (!match) return null;
    const value = Number(match[2]);
    if (!Number.isFinite(value)) return null;
    values[match[1] || `value${fields.length === 1 ? '' : i + 1}`] = value;
  }
  return values;
}

export const lineEndings = { none: '', nl: '\n', cr: '\r', crlf: '\r\n' };

export function boardSerialFailure(error, boardId=DEFAULT_BOARD, connection='No USB port selected') {
  const board=getBoard(boardId);
  const base=serialFailure(error,boardId);
  const sync=/bootloader|synchroniz|\bsync\b/i.test(error?.message||'');
  const nanoHint=board.family==='nano'&&sync ? (board.baudRate===115200?'Could not synchronize with the Nano. If this is a compatible/clone Nano, try selecting Nano V3 (Old Bootloader).':'Could not synchronize with the Nano using the old bootloader. If it has Optiboot, try Nano V3 (New Bootloader).') : '';
  return boardDetails(board)+'\nSerial connection: '+connection+'\n\n'+(nanoHint?nanoHint+'\n\n':'')+base;
}
