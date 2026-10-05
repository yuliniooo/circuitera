import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const dir=process.cwd()+'/node_modules/@horang-corp/avr-gcc-wasm/tools/';
for(const [tool,args] of [['cc1plus',['-quiet','-mmcu=atmega328pb','/probe.cpp','-o','/probe.s']],['avr-as',['-mmcu=atmega328pb','/probe.s','-o','/probe.o']]]){
 const {default:create}=await import(pathToFileURL(dir+tool+'.mjs'));
 const module=await WebAssembly.compile(await readFile(dir+tool+'.wasm'));
 const logs=[];const r=await create({noInitialRun:true,instantiateWasm(i,recv){const inst=new WebAssembly.Instance(module,i);recv(inst,module);return inst.exports},print:console.log,printErr:l=>logs.push(l)});
 r.FS.writeFile('/probe.cpp','int main(){return 0;}');r.FS.writeFile('/probe.s','.text\n.global main\nmain: ret\n');
 try{console.log(tool,'exit',r.callMain(args),logs)}catch(e){console.log(tool,String(e),logs)}
}
