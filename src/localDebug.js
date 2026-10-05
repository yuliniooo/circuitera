import { getBoard } from './boards.js';
import { explainDiagnostics } from './workspaceSupport.js';

// On-demand hints only: no network, code execution, firmware changes or wiring claims.
// Preserve offsets so hints point at the original file and line.
const mask = (source, strings = true) => source.replace(/R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
  text => strings || text.startsWith('/') ? text.replace(/[^\n]/g, ' ') : text);
const commonHeaders = new Set(['Arduino.h','WProgram.h','math.h','stdint.h','stdlib.h','stdio.h','string.h','ctype.h','stddef.h','stdbool.h','limits.h','float.h','inttypes.h','Print.h','Stream.h','WString.h','HardwareSerial.h','pins_arduino.h','new','new.h']);
export function uniqueDiagnostics(diagnostics) {
  const seen=new Set();
  return diagnostics.filter(d=>{const key=JSON.stringify([d.file,d.line,d.column,d.severity,d.message]);if(seen.has(key))return false;seen.add(key);return true;});
}
export function inspectSketch({ files, boardId, baudRate, libraries = [], diagnostics = [], result, currentBuild = false }) {
  const board = getBoard(boardId), analogCount = board.family === 'nano' ? 8 : 6;
  // Exception stacks may repeat GCC's text. Keep the raw output intact, but
  // present each diagnostic once and use the editor filename for a lone .ino.
  const uniqueErrors = new Map();
  if(currentBuild) for(const d of explainDiagnostics(diagnostics)) {
    const item={...d,file:d.file || files[0]?.name || 'sketch.ino',level:'ERROR',text:d.explanation};
    uniqueErrors.set([item.file,item.line,item.column,item.message].join(':'),item);
  }
  const notices = [...uniqueErrors.values()];
  const cleanFiles = files.map(file => ({ ...file, clean: mask(file.code) }));
  const combined = cleanFiles.map(f => f.clean).join('\n');
  const constants = new Map([['LED_BUILTIN',13], ...Array.from({length:analogCount},(_,i)=>['A'+i,14+i])]);
  for (const m of combined.matchAll(/\b(?:const(?:expr)?\s+(?:unsigned\s+)?(?:int|byte|uint8_t)|#define)\s+(\w+)\s*(?:=\s*)?(-?\d+|A[0-7]|LED_BUILTIN)\b/g)) constants.set(m[1], /^-?\d+$/.test(m[2]) ? Number(m[2]) : constants.get(m[2]));
  const valueOf = expression => /^-?\d+$/.test(expression.trim()) ? Number(expression) : constants.get(expression.trim());
  const outputPins = new Set([...combined.matchAll(/\bpinMode\s*\(\s*(\w+)\s*,\s*OUTPUT\s*\)/g)].map(m=>valueOf(m[1])).filter(Number.isFinite));
  const servoNames = new Set([...combined.matchAll(/\bServo\s+(\w+)\s*[;({]/g)].map(m=>m[1]));
  const localHeaders = new Set(files.map(f=>f.name));
  const headers = new Set(libraries.flatMap(l=>l.headers || []));
  for (const file of cleanFiles) {
    const add = (m, level, title, text) => { if (notices.length < 40) notices.push({ level, title, text, file:file.name, line:file.code.slice(0,m.index).split('\n').length, column:1 }); };
    for (const m of file.clean.matchAll(/\bSerial\s*\.\s*begin\s*\(\s*(\d+)\s*\)/g)) {
      if (+m[1] !== Number(baudRate)) add(m,'WARNING','MONITOR BAUD DIFFERS',`This Serial.begin uses ${m[1]} baud; the monitor is set to ${baudRate}. Match them before reading output.`);
    }
    for (const m of file.clean.matchAll(/\banalogRead\s*\(\s*([\w-]+)\s*\)/g)) {
      const pin = valueOf(m[1]);
      if (Number.isFinite(pin) && !((pin>=0 && pin<analogCount) || (pin>=14 && pin<14+analogCount))) add(m,'WARNING','CHECK ANALOG INPUT',`${m[1]} is not a normal analog channel for ${board.shortName}. Use A0–A${analogCount-1}. Numeric 0–${analogCount-1} mean ADC channels, not digital pins.`);
    }
    for (const m of file.clean.matchAll(/\bdigitalWrite\s*\(\s*([\w-]+)\s*,/g)) {
      const pin=valueOf(m[1]);
      if (Number.isFinite(pin) && !outputPins.has(pin)) add(m,'SUGGESTION','CHECK OUTPUT MODE',`No literal pinMode(${m[1]}, OUTPUT) was found. If this pin drives an output, configure it first. digitalWrite may instead intentionally control an input pull-up; helpers and runtime pin choices are not evaluated.`);
    }
    for (const m of file.clean.matchAll(/\b(\w+)\s*\.\s*attach\s*\(\s*([\w-]+)\s*[,)]/g)) {
      const pin=valueOf(m[2]);
      if (servoNames.has(m[1]) && Number.isFinite(pin) && (pin<0 || pin>19)) add(m,'WARNING','CHECK SERVO PIN',`${m[2]} is not a digital output on ${board.shortName}. Use D0–D13 or A0–A5; Nano A6/A7 are analog-input only. Servo does not require a PWM pin.`);
    }
    for (const m of mask(file.code,false).matchAll(/^\s*#\s*include\s*[<"]([^>"\n]+)[>"]/gm)) {
      const header=m[1];
      if (libraries.length && !headers.has(header) && !localHeaders.has(header) && !commonHeaders.has(header) && !/^(avr|util)\//.test(header) && !diagnostics.some(d=>d.message.includes(header))) add(m,'SUGGESTION','CHECK INCLUDE',`${header} is not in the preinstalled public-header list or this project. It may be a transitive/toolchain header. Verify to get the actual compiler result; open Libraries to see supported packages.`);
    }
  }
  if (currentBuild && result) {
    if (result.flashBytes > board.flashLimit) notices.push({level:'ERROR',title:'PROGRAM STORAGE EXCEEDED',text:`${result.flashBytes} bytes exceeds the ${board.flashLimit}-byte application limit.`});
    if (result.ramBytes > board.ramLimit) notices.push({level:'ERROR',title:'STATIC RAM EXCEEDED',text:`${result.ramBytes} bytes exceeds the ${board.ramLimit}-byte SRAM limit.`});
  }
  return notices;
}

export function compilerFailureSummary(output) {
  if (/No such file|not available|LIBRARY NOT AVAILABLE/i.test(output)) return 'A required header or library could not be found. See the exact file and compiler error below.';
  if (/fetch|asset|module failed to load|catalog/i.test(output)) return 'A compiler asset could not load. Check your connection or offline cache, then retry. The failed path is in Technical details.';
  if (/worker|deserialize|out of memory/i.test(output)) return 'The compiler worker could not finish. Your source is still saved locally. Retry compilation or run System Check; the original exception follows.';
  return 'The compiler did not produce firmware. Follow the line diagnostics when available and inspect the complete output below.';
}

export const QUICKSTART_KEY = 'circuitera:quickstart-dismissed';
export const FONT_SIZE_KEY = 'circuitera:editor-font-size';
export function readLocalPreference(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
export const clampFontSize = value => Math.max(12,Math.min(24,Number(value)||15));
