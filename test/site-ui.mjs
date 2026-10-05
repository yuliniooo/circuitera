// Direct-entry routing with real CodeMirror and the unchanged IndexedDB implementation.
// IndexedDB uses fake-indexeddb in JSDOM; actual WASM compilation is tested separately.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { SketchWorkspace } from '../src/sketchStore.js';
import { examples } from '../src/examples.js';
import { libraryExamples } from '../src/libraryExamples.js';
import { homeTitle } from '../src/site/seo.js';

await mkdir('test/generated', { recursive: true });
await build({ stdin: { contents: "export {default as SiteApp} from './src/site/SiteApp.jsx'; export {EditorView} from '@codemirror/view';", resolveDir: process.cwd(), sourcefile:'site-entry.jsx' }, bundle:true, jsx:'automatic', external:['react','react-dom'], format:'esm', platform:'browser', loader:{'.css':'empty'}, outfile:'test/generated/site-app.mjs' });
const dom = new JSDOM('<!doctype html><html data-theme="light"><head><base href="/"><link rel="canonical" href="https://circuitera.example/"><meta name="robots" content="index,follow"></head><body><div id="root"></div></body></html>', { url:'https://circuitera.example/', pretendToBeVisual:true });
for (const key of ['window','document','location','history','localStorage','MutationObserver','HTMLElement','Element','Node','Document','Window','DOMRect','Range']) globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
globalThis.getComputedStyle=dom.window.getComputedStyle;
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.Range.prototype.getClientRects=()=>[];
dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect();
dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
dom.window.scrollTo=()=>{};
const {createRoot}=await import('react-dom/client');
const requests=[];
globalThis.fetch=async input=>{
  const url=new URL(input,location.href); requests.push(url.href);
  assert.equal(url.pathname,'/avr/curated/manifest.json');
  return new Response(await readFile('dist/avr/curated/manifest.json'));
};
const saved=new SketchWorkspace({starterCode:examples.Blink,storage:localStorage});
await saved.initialize(); const existingId=saved.state.activeId;
saved.edit(existingId,{code:examples.Blink.replaceAll('delay(1000)','delay(219)')}); await saved.flush();
const original=saved.state.sketches[0].code;
const {SiteApp,EditorView}=await import('./generated/site-app.mjs');
let root=createRoot(document.getElementById('root'));
const records=[];
const pass=name=>{records.push({name,status:'PASS'});console.log('PASS — '+name);};
const pause=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
const until=async check=>{for(let i=0;i<80&&!check();i++)await pause();assert.ok(check(),'UI condition not reached: '+check);};
const mount=async()=>{await act(async()=>root.render(React.createElement(SiteApp)));await pause();};
const link=async(selector)=>{const n=document.querySelector(selector);assert.ok(n,selector);await act(async()=>n.click());await pause();};
const freshStorage=async()=>{const next=new SketchWorkspace({starterCode:examples.Blink,storage:localStorage});await next.initialize();return next.state;};
try {
  await mount(); await until(()=>Boolean(document.querySelector('.cm-editor')));
  const editor=()=>EditorView.findFromDOM(document.querySelector('.cm-editor'));
  assert.equal(location.pathname,'/'); assert.equal(editor().state.doc.toString(),original);
  assert.equal(document.querySelector('input[type="password"], input[type="email"], .account-menu, .auth-layout'),null);
  assert.doesNotMatch(document.body.textContent,/Sign In|Sign Out|Register|Checking your sign-in/);
  pass('Root immediately mounts the full IDE and restores an existing local sketch without any account');
  assert.equal(document.title, homeTitle);
  assert.equal(document.querySelectorAll('h1').length,1);
  assert.equal(document.querySelector('h1').textContent,'Arduino IDE for Chromebook — Compile & Upload in Your Browser');
  assert.equal(document.querySelectorAll('main').length,1);
  assert.ok(document.querySelector('.app-shell + .ide-guide'));
  const faq=document.querySelector('.ide-guide-faq details');
  await act(async()=>faq.querySelector('summary').click());assert.equal(faq.open,true);
  assert.equal(editor().state.doc.toString(),original);
  pass('Static guide remains below the working IDE; one H1, one main and native FAQ interaction preserve editor state');
  const marker='\n// persisted across optional help navigation';
  await act(async()=>editor().dispatch({changes:{from:editor().state.doc.length,insert:marker}}));
  await link('.ide-help-links a[href="/about"]'); assert.equal(location.pathname,'/about');
  assert.equal((await freshStorage()).sketches.find(s=>s.id===existingId).code,original+marker);
  pass('Opening About flushes pending edits in the original IndexedDB database');
  for(const [href,heading] of [['/features','Everything between'],['/how-it-works','A direct path'],['/examples','Small projects']]){
    await link(`nav a[href="${href}"]`); assert.equal(location.pathname,href);
    assert.match(document.querySelector('h1').textContent,new RegExp(heading));
    assert.equal(document.querySelector('meta[name="robots"]').content,'index,follow');
  }
  pass('Optional information pages navigate normally and remain indexable');
  await link('a[href="/?example=Servo%20sweep"]'); await until(()=>Boolean(document.querySelector('.cm-editor')));
  await until(()=>Boolean(document.querySelector('#example-password')));
  assert.equal(editor().state.doc.toString(),original+marker);
  assert.equal((await freshStorage()).sketches.filter(s=>s.name==='Servo sweep').length,0);
  const password=document.querySelector('#example-password');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(password,'trading');
    password.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  });
  await act(async()=>document.querySelector('.example-unlock').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await until(()=>editor().state.doc.toString()===libraryExamples['Servo sweep']);
  assert.equal(location.pathname,'/'); assert.equal(location.search,'');
  assert.equal((await freshStorage()).sketches.filter(s=>s.name==='Servo sweep').length,1);
  assert.equal((await freshStorage()).sketches.find(s=>s.id===existingId).code,original+marker);
  pass('Public example link requires the local password, then creates a separate sketch without replacing prior work');
  await act(async()=>editor().dispatch({changes:{from:editor().state.doc.length,insert:marker}}));
  const save=document.querySelector('button[title^="Save"]'); assert.ok(save); await act(async()=>save.click()); await pause();
  const count=(await freshStorage()).sketches.length;
  await act(async()=>root.unmount()); root=createRoot(document.getElementById('root')); await mount();
  await until(()=>Boolean(document.querySelector('.cm-editor')));
  assert.equal(editor().state.doc.toString(),libraryExamples['Servo sweep']+marker);
  assert.equal((await freshStorage()).sketches.length,count);
  const select=document.querySelector('select[aria-label="Open example"]');
  await act(async()=>{select.value='Blink';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await until(()=>Boolean(document.querySelector('#example-password')));
  assert.equal(editor().state.doc.toString(),libraryExamples['Servo sweep']+marker);
  await act(async()=>document.querySelector('[aria-label="Close Unlock examples"]').click());
  assert.equal((await freshStorage()).sketches.length,count);
  pass('Reload relocks example opening while saved sketches remain available; cancel creates nothing');
  assert.equal(new URL('avr/',document.baseURI).pathname,'/avr/');
  pass('Fresh page mount restores all sketches, the active tab and independent edits; compiler assets resolve from root');
  assert.equal(document.title,homeTitle);
  assert.equal(document.querySelectorAll('h1').length,1);
  assert.equal(document.querySelectorAll('.ide-guide').length,1);
  pass('Returning from help restores the requested homepage title and single guide without duplicating content');
  for (const obsolete of ['/signin','/register/','/forgot-password','/reset-password','/auth/callback?code=old#token','/ide/']) {
    await act(async()=>root.unmount()); history.replaceState({},'',obsolete);
    root=createRoot(document.getElementById('root')); await mount(); await until(()=>Boolean(document.querySelector('.cm-editor')));
    assert.equal(location.pathname+location.search+location.hash,'/');
    assert.equal(editor().state.doc.toString(),libraryExamples['Servo sweep']+marker);
    assert.equal(document.querySelector('input[type="password"],input[type="email"]'),null);
  }
  pass('All retired account URLs and /ide open the same saved IDE, remove obsolete URL parameters and expose no forms');
  await act(async()=>{history.pushState({},'', '/?example=constructor');window.dispatchEvent(new dom.window.PopStateEvent('popstate'));});
  await pause(); assert.equal((await freshStorage()).sketches.length,count);
  assert.match(document.querySelector('[aria-label="Compiler and upload output"]').textContent,/Example not available: constructor/);
  pass('Unknown example names cannot replace or create sketches');
  assert.ok(requests.length>0);
  assert.ok(requests.every(url=>url==='https://circuitera.example/avr/curated/manifest.json'));
  pass('The entire route and editor session requests only the local compiler catalog; no authentication or external requests');
} finally {
  await act(async()=>root.unmount());dom.window.close();
  await writeFile('reports/site-ui-tests.json',JSON.stringify({testedAt:new Date().toISOString(),scope:'Real React + CodeMirror in JSDOM; fake-indexeddb exercises the production sketch persistence implementation. No auth provider or simulated session.',checks:records,requests},null,2));
}
