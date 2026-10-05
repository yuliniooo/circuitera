import {readFile,readdir} from 'node:fs/promises';
import {runTool} from './compile-core-extension.mjs';
import {compilerFlagsForBoard} from '../src/compiler-engine.js';
import {getBoard,PB_BOARD} from '../src/boards.js';
import {createArchive,inspectElf} from '../src/avr-format.js';
export async function preparePbCore(packageRoot,unoHeaders,unoBinary) {
 const headers={...unoHeaders};
 headers['/sysroot/avr/include/avr/iom328pb.h']=await readFile(`${packageRoot}/assets/fs/sysroot/avr/include/avr/iom328pb.h`,'utf8');
 headers['/arduino/pb-compat.h']=await readFile('vendor/atmega328pb/pb-compat.h','utf8');
 const coreDir='vendor/arduino-core/cores/arduino';
 for(const f of await readdir(coreDir))if(/\.(h|hpp)$/.test(f)||f==='new')headers['/arduino/core/'+f]=await readFile(coreDir+'/'+f,'utf8');
 // Expose only the verified Uno-style mapping. Extra clone pins are unknown.
 headers['/arduino/variant/pins_arduino.h']=headers['/arduino/variant/pins_arduino.h'].replace(/^#define PIN_A[67].*\n/gm,'').replace(/^static const uint8_t A[67].*\n/gm,'').replaceAll('(p) <= 21','(p) <= 19').replace(/const (uint(?:8|16)_t PROGMEM)/g,'extern const $1');
 const flags=compilerFlagsForBoard(getBoard(PB_BOARD));
 const objects=[];
 for(const name of (await readdir(coreDir)).filter(f=>/\.(cpp|c|S)$/.test(f)).sort()){
  const source=await readFile(coreDir+'/'+name,'utf8'),input='/build/'+name;
  const code=name.endsWith('.c')?`${name==='wiring_digital.c'?'#define ARDUINO_MAIN\n':''}#include <Arduino.h>\nextern "C" {\n${source}\n}`:source;
  const assembly=await runTool(packageRoot,'cc1plus',[...flags,...(name.endsWith('.S')?['-E','-P','-D__ASSEMBLER__']:[]),input,'-o','/build/unit.s'],{...headers,[input]:code},'/build/unit.s');
  const object=await runTool(packageRoot,'avr-as',['-mmcu=avr5','-o','/build/unit.o','/build/unit.s'],{'/build/unit.s':assembly},'/build/unit.o');
  objects.push([name+'.o',object]);
 }
 const binary={...unoBinary,'/libs/arduino-core.a':Buffer.from(createArchive(objects)).toString('base64')};
 delete binary['/libs/crtatmega328p.o'];
 for(const f of ['crtatmega328pb.o','libatmega328pb.a'])binary['/libs/'+f]=(await readFile('vendor/atmega328pb/'+f)).toString('base64');
 const crt=inspectElf(Buffer.from(binary['/libs/crtatmega328pb.o'],'base64'));
 if(!crt.symbols.includes('__vector_44'))throw Error('PB startup does not include the PB interrupt vector table');
 return {headers,binary,objectNames:objects.map(o=>o[0]),mcu:'atmega328pb'};
}
