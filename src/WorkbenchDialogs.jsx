import { getBoard, DEFAULT_BOARD } from './boards.js';
import { useEffect, useRef, useState } from 'react';
import { X, Check, Usb, Cpu } from 'lucide-react';
import { boardSerialFailure, serialPolicyMessage } from './workspaceSupport.js';
export const HARDWARE_TEST_SOURCE = `// Circuitera Uno hardware test — onboard LED only.\nvoid setup() { pinMode(LED_BUILTIN, OUTPUT); }\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH); delay(250);\n  digitalWrite(LED_BUILTIN, LOW); delay(750);\n}\n`;
export function WorkbenchDialog({title,onClose,busy=false,children}) {
  const box=useRef(null);
  useEffect(()=>{const prior=document.activeElement;box.current?.focus();return()=>prior?.isConnected&&prior.focus?.();},[]);
  return <div className="dialog-backdrop"><section ref={box} tabIndex={-1} className="workbench-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e=>{
    if(e.key==='Escape'&&!busy){e.preventDefault();onClose();}
    if(e.key==='Tab'){const elements=[...e.currentTarget.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),details>summary')];if(elements.length){const i=elements.indexOf(document.activeElement);e.preventDefault();elements[(i+(e.shiftKey?-1:1)+elements.length)%elements.length].focus();}}
  }}><header><h2>{title}</h2><button disabled={busy} onClick={onClose} aria-label={`Close ${title}`}><X size={17}/></button></header>{children}</section></div>;
}
export function Shortcuts({onClose}) {
  return <WorkbenchDialog title="Keyboard shortcuts" onClose={onClose}><dl className="shortcut-reference">{[['Save','Ctrl / ⌘ + S'],['Verify','Ctrl / ⌘ + Enter'],['Upload','Ctrl / ⌘ + Shift + Enter'],['New sketch','Alt + N'],['Close sketch tab','Alt + W'],['Autocomplete','Ctrl + Space'],['Choose suggestion','↑ / ↓'],['Insert suggestion','Enter / Tab'],['Dismiss','Escape']].map(([action,key])=><div key={action}><dt>{action}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl><p className="dialog-note">Ctrl/⌘+N and Ctrl/⌘+W also work when Chrome delivers them to the page. Chrome normally reserves those keys for browser windows and tabs; use Alt+N / Alt+W or the toolbar.</p></WorkbenchDialog>;
}
export function TestMyUno({onClose,onConnect,onCompile,onUpload,selectedPort,boardId=DEFAULT_BOARD}) {
  const board=getBoard(boardId), family=board.family==='pb'?'ATmega328PB':board.family==='nano'?'Nano':'Uno';
  const [checked,setChecked]=useState(false),[port,setPort]=useState(null),[result,setResult]=useState(null),[done,setDone]=useState(false),[busy,setBusy]=useState(''),[progress,setProgress]=useState(''),[log,setLog]=useState('');
  const connected=port&&port===selectedPort;
  const browserOK=typeof WebAssembly==='object'&&typeof WebAssembly.compile==='function'&&typeof navigator.serial?.requestPort==='function';
  const append=line=>setLog(text=>(text+'\n'+line).trim());
  const run=async(stage,operation)=>{if(busy)return;setBusy(stage);setDone(false);try{await operation();}catch(e){append(stage==='compile'?'COMPILER ERROR\n'+e.message+'\n'+(e.stack||''):boardSerialFailure(e,boardId,connected?'USB port selected':'No USB port selected'));}finally{setBusy('');}};
  useEffect(()=>{if(port&&!connected){setDone(false);setResult(null);}},[connected,port]);
  return <WorkbenchDialog title={`Test My ${family}`} onClose={onClose} busy={Boolean(busy)}><p className="dialog-note">A real compiler and USB upload check for an {board.shortName}. This optional test uses the onboard LED.</p>
    <ol className="hardware-steps">
      <li><strong>1 — Browser</strong><span>{checked?(browserOK?'WebAssembly and Web Serial available':serialPolicyMessage):'Check browser capabilities.'}</span><button disabled={Boolean(busy)} onClick={()=>{setChecked(true);if(!browserOK)append(serialPolicyMessage);}}>Check browser</button></li>
      <li><strong>2 — Connect</strong><span>{connected?`USB port selected · use a ${board.shortName}`:`Plug in a ${board.shortName} with a USB data cable.`}</span><button disabled={!checked||!browserOK||Boolean(busy)} onClick={()=>run('connect',async()=>{setResult(null);const selected=await onConnect();setPort(selected);append('USB serial port selected. The bootloader is checked during upload.');})}><Usb size={14}/>Select {family}</button></li>
      <li><strong>3 — Compiler</strong><span>{result?.ok?`${result.flashBytes} flash bytes · real Intel HEX generated`:busy==='compile'?progress:'Compile the test source locally.'}</span><button disabled={!connected||Boolean(busy)} onClick={()=>run('compile',async()=>{setResult(null);const compiled=await onCompile(HARDWARE_TEST_SOURCE,p=>setProgress(p.stage+(p.detail?' · '+p.detail:'')));append(compiled.output);if(compiled.ok&&compiled.hex)setResult(compiled);})}><Cpu size={14}/>Compile test</button></li>
      <li><strong>4 — Upload</strong><span>This replaces the program on your {family} with the blink test. Your saved sketches stay untouched.</span><button disabled={!connected||!result?.ok||Boolean(busy)} onClick={()=>run('upload',async()=>{await onUpload(port,result.hex,{onLog:append,onProgress:p=>setProgress(`${p}% · flashed and read back`)});setDone(true);append('UPLOAD VERIFIED — the real bootloader transfer and flash readback completed.');})}>Upload test firmware</button>{busy==='upload'&&<small>{progress}</small>}</li>
      <li><strong>5 — Result</strong><span role="status">{done?'✓ Bootloader communication and flash verification succeeded. Check that the onboard L LED blinks.':'No successful hardware test yet.'}</span>{done&&<Check size={18}/>}</li>
    </ol>
    <details><summary>Test source</summary><pre>{HARDWARE_TEST_SOURCE}</pre></details><pre className="hardware-output" aria-label="Hardware test output">{log||'Nothing has been sent to a board.'}</pre>
  </WorkbenchDialog>;
}
