// Service Worker event/cache harness, not a claim of Chrome network emulation.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { compileUno } from '../src/compiler-engine.js';
import { parseIntelHex } from '../src/serial.js';
const source=await readFile('dist/sw.js','utf8'),manifest=JSON.parse(await readFile('reports/pwa-assets.json','utf8'));
const checks=[],pass=(name,extra={})=>{checks.push({name,status:'PASS',...extra});console.log('PASS — '+name);};
const origin='https://circuitera.test',handlers=new Map(),stores=new Map();let online=true,corrupt='',networkCount=0;
const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async match(key){return store.get(String(key))?.clone();},async put(key,response){store.set(String(key),response.clone());}};},async keys(){return [...stores.keys()];},async delete(key){return stores.delete(key);}};
const context=vm.createContext({URL,Response,Uint8Array,TextEncoder,crypto:webcrypto,caches,self:{location:{origin},addEventListener:(name,fn)=>handlers.set(name,fn)},fetch:async url=>{
  networkCount++;if(!online)throw new TypeError('Network unavailable in offline test');
  const pathname=new URL(String(url),origin).pathname;
  if(pathname===corrupt)return new Response('corrupt',{status:200});
  try{return new Response(await readFile('dist'+pathname),{status:200});}catch{return new Response('Missing',{status:404});}
}});vm.runInContext(source,context);
async function lifecycle(type){let task;handlers.get(type)({waitUntil(value){task=value;}});await task;}
async function message(type){let task;const messages=[];handlers.get('message')({data:{type},ports:[{postMessage(value){messages.push(value);}}],waitUntil(value){task=value;}});await task;return messages;}
async function request(pathname,mode='cors'){let response;handlers.get('fetch')({request:{method:'GET',mode,url:origin+pathname},respondWith(value){response=value;}});return response?await response:undefined;}
await lifecycle('install');assert.ok((await message('STATUS')).at(-1).shellReady);assert.equal((await message('STATUS')).at(-1).compilerReady,false);
pass('Install caches the complete static shell without requiring compiler downloads');
online=false;const home=await request('/','navigate');assert.equal(home.status,200);assert.match(await home.text(),/Circuitera/);assert.equal((await request('/getting-started','navigate')).status,200);
const unavailable=await request(manifest.compiler[0].path);assert.equal(unavailable.status,503);assert.match(await unavailable.text(),/Connect to the internet/);
pass('Offline shell and public help open; missing compiler assets fail honestly with their path');
assert.equal(await request('/googleb22ad35e0875e1ed.html'),undefined);assert.equal(await request('/robots.txt'),undefined);assert.equal(await request('/sitemap.xml'),undefined);
pass('Google verification, robots and sitemap bypass the service worker');
online=true;corrupt=manifest.compiler[0].path;const bad=(await message('PREPARE_COMPILER')).at(-1);assert.match(bad.error,/checksum mismatch/);assert.equal(bad.compilerReady,false);corrupt='';
pass('Corrupt downloaded compiler assets are rejected rather than cached as ready');
const prepared=await message('PREPARE_COMPILER');assert.ok(prepared.at(-1).compilerReady);assert.equal(prepared.filter(p=>p.progress).length,manifest.compiler.length);
online=false;const beforeNetwork=networkCount;
for(const asset of [...manifest.shell,...manifest.compiler]){const response=await request(asset.path);assert.equal(response.status,200);if(asset.hash)assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),asset.hash);}
assert.equal(networkCount,beforeNetwork);pass('Every prepared shell/tool/core/library asset is available offline with exact bytes and no network access');
const priorFetch=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input instanceof Request?input.url:input);if(!url.startsWith('file:'))throw new Error('Unexpected nonlocal compiler request');const local=fileURLToPath(url),relative=path.relative(path.resolve('dist'),local);assert.ok(!relative.startsWith('..'));return request('/'+relative);};
try{for(const boardId of ['arduino:avr:uno','circuitera:avr:atmega328pb']){const result=await compileUno('#include <Servo.h>\nServo arm;\nvoid setup(){arm.attach(9);}\nvoid loop(){arm.write(37);delay(189);}',{boardId,assetsBase:pathToFileURL(path.resolve('dist/avr')+'/').href});assert.ok(result.ok,result.output);assert.ok(parseIntelHex(result.hex).length);assert.equal(networkCount,beforeNetwork);pass(boardId+': Real Servo sketch links and produces HEX using offline cached WASM/core/library bytes',{flashBytes:result.flashBytes,hexSha256:createHash('sha256').update(result.hex).digest('hex'),moduleTransport:'Node imports the identical verified .mjs files from disk; all fetches pass through the offline Service Worker harness.'});}}finally{globalThis.fetch=priorFetch;}
await caches.open('unrelated-cache');await caches.open('circuitera-static-old');await lifecycle('activate');assert.ok(stores.has('unrelated-cache'));assert.ok(!stores.has('circuitera-static-old'));assert.ok(!source.includes('skipWaiting(')&&!source.includes('clients.claim('));pass('Updates cannot force activation/reload during upload and cleanup only owns Circuitera static caches');
await writeFile('reports/offline-tests.json',JSON.stringify({testedAt:new Date().toISOString(),scope:'Actual generated service worker in Node VM with Cache API fixture, network-disabled fetch transport, and genuine AVR WASM. Not a physical Chromebook offline test.',checks},null,2)+'\n');
