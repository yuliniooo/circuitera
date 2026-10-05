// Isolated React handler tests, not a Chrome/DOM or physical-device substitute.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Worker as NodeWorker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BOARD_PROFILES, DEFAULT_BOARD, BOARD_STORAGE_KEY } from '../src/boards.js';
import { UnoPortFixture } from './uno-port-fixture.js';
import { examples } from '../src/examples.js';
import { assetsBase } from './wasm-harness.mjs';
import 'fake-indexeddb/auto';
import { openSketchDatabase } from '../src/sketchStore.js';
import { parseIntelHex } from '../src/serial.js';
import { createHash } from 'node:crypto';

await mkdir('test/generated', { recursive: true });
await build({
  entryPoints: ['src/App.jsx'], bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic',
  outfile: 'test/generated/App.mjs',
  plugins: [{ name: 'test-editor-host', setup(builder) {
    builder.onResolve({ filter: /^(react|@codemirror\/view)$/, namespace: 'test-editor' }, args => ({ path: args.path, external: true }));
    builder.onResolve({ filter: /^@uiw\/react-codemirror$/ }, () => ({ path: 'editor', namespace: 'test-editor' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-editor' }, () => ({ contents: "import React from 'react'; export {EditorView} from '@codemirror/view'; export default function Editor(props){ return React.createElement('test-editor', props); }", loader: 'js' }));
  } }],
});
const storage = new Map();
const listeners = new Map();
const downloads = [];
const workers = [];
const firmwares = [];
const serialListeners = new Map();
let rejectPort = false;
let portPicker;
let port = new UnoPortFixture();
globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
globalThis.window = { confirm: () => true, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
globalThis.document = {
  baseURI: pathToFileURL(path.resolve('dist') + '/').href, documentElement: { dataset: {}, style: {} },
  createElement: tag => { assert.equal(tag, 'a'); const link = { click() { downloads.push({ href: link.href, name: link.download }); } }; return link; },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serial: {
  addEventListener: (type, fn) => serialListeners.set(type, fn), removeEventListener: type => serialListeners.delete(type),
  async getPorts() { return []; },
  async requestPort() { if (rejectPort) throw new DOMException('School policy', 'SecurityError'); return portPicker ? portPicker() : port; },
} } });
globalThis.Worker = class {
  constructor(url) {
    assert.ok(String(url).endsWith('/compiler.worker.js'));
    this.worker = new NodeWorker(new URL('./worker-adapter.mjs', import.meta.url)); workers.push(this.worker);
    this.worker.on('message', data => { if (data.result?.ok) firmwares.push({ source: this.source, ...data.result }); this.onmessage?.({ data }); });
    this.worker.on('error', error => this.onerror?.({ message: error.message }));
  }
  postMessage(value) { assert.equal(value.assetsBase, assetsBase); this.source = value.source; this.worker.postMessage(value); }
  terminate() { return this.worker.terminate(); }
};
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
const blobs = new Map();
URL.createObjectURL = blob => { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; };
URL.revokeObjectURL = () => {};
const { default: App } = await import('./generated/App.mjs');
let renderer;
const records = [];
const pass = name => { records.push({ name, status: 'PASS' }); console.log('PASS — ' + name); };
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => renderer.root.findAllByType('button').find(n => text(n) === label);
const editor = () => renderer.root.findByType('test-editor');
async function click(label) { const item = button(label); assert.ok(item, 'Missing button ' + label); await act(async () => { await item.props.onClick(); }); }
async function mount(props = {}) {
  await act(async () => { renderer = TestRenderer.create(React.createElement(App, props)); });
  for (let tries = 0; tries < 100 && !renderer.root.findAllByType('test-editor').length; tries++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  assert.ok(renderer.root.findAllByType('test-editor').length, 'Workspace loads from IndexedDB');
}
async function stored() {
  const db = await openSketchDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['sketches', 'meta'], 'readonly');
    const sketches = tx.objectStore('sketches').getAll(), meta = tx.objectStore('meta').get('workspace');
    tx.oncomplete = () => resolve({ sketches: sketches.result, meta: meta.result, active: sketches.result.find(s => s.id === meta.result.activeId) });
    tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function byLabel(label) { await act(async () => { await renderer.root.findByProps({ 'aria-label': label }).props.onClick(); }); }
try {
  await mount();
  assert.equal(renderer.root.findByProps({'aria-label':'Target board'}).props.value,DEFAULT_BOARD);
  assert.equal(editor().props.value, examples.Blink);
  assert.equal(document.documentElement.dataset.theme, 'light');
  const completionToggle = () => renderer.root.findByProps({ 'aria-label': 'Autocomplete' });
  assert.equal(completionToggle().props['aria-pressed'], true);
  const enabledExtensionCount=editor().props.extensions.length;
  await act(async () => completionToggle().props.onClick());
  assert.equal(storage.get('uno-web-ide:autocomplete'), 'off');
  assert.equal(editor().props.extensions.length, 2); // C++ language and pin hover remain.
  await act(async () => renderer.unmount());
  await mount();
  assert.equal(completionToggle().props['aria-pressed'], false);
  assert.equal(editor().props.basicSetup.autocompletion, false);
  await act(async () => completionToggle().props.onClick());
  assert.equal(editor().props.extensions.length, enabledExtensionCount);
  pass('Autocomplete is optional, persists locally, and removes its extension when disabled');
  const source = examples.Blink.replaceAll('1000', '137');
  await act(async () => editor().props.onChange(source));
  assert.equal((await stored()).active.code, source);
  pass('Autosave writes current source without pressing Save; default theme is light');
  await click('Save locally');
  assert.equal((await stored()).active.code, source);
  await act(async () => renderer.unmount());
  await mount();
  assert.equal(editor().props.value, source);
  pass('Local save restores exact source after remount');
  await click('Export .ino');
  assert.equal(downloads.at(-1).name, 'Blink.ino');
  assert.equal(await blobs.get(downloads.at(-1).href).text(), source);
  pass('Export .ino contains the current source');
  const imported = examples.Button;
  const fileInput = renderer.root.findAllByType('input').find(n => n.props.type === 'file');
  await act(async () => fileInput.props.onChange({ target: { files: [{ name: 'Button.ino', text: async () => imported }], value: 'Button.ino' } }));
  assert.equal(editor().props.value, imported);
  pass('Import .ino updates the editor with actual file contents');
  await click('Verify');
  assert.ok(renderer.root.findAllByType('pre').some(n => text(n).includes('✓ COMPILED')));
  pass('Compile handler uses current imported code through the real Worker');
  const beforeCheck=firmwares.at(-1), beforeSource=editor().props.value, beforeSketch=(await stored()).active.id;
  await click('System Check'); await click('Run System Check');
  assert.ok(text(renderer.toJSON()).includes('Real AVR compile/link succeeded'));
  assert.ok(text(renderer.toJSON()).includes('IndexedDB restored; current edits saved'));
  assert.equal(editor().props.value,beforeSource);assert.equal((await stored()).active.id,beforeSketch);
  assert.notEqual(firmwares.at(-1).hex,beforeCheck.hex);
  await byLabel('Close System Check');
  await click('Upload');
  const activeBytes=parseIntelHex(beforeCheck.hex);
  assert.deepEqual(port.memory.slice(0,activeBytes.length),activeBytes);
  pass('System Check uses real WASM but cannot replace the active sketch or its upload artifact');
  await byLabel('Editor settings');
  await act(async()=>renderer.root.findByProps({'aria-label':'Editor font size'}).props.onChange({target:{value:'21'}}));
  assert.equal(storage.get('circuitera:editor-font-size'),'21');
  await click('Reset editor layout');assert.equal(storage.get('circuitera:editor-font-size'),'15');
  assert.equal(editor().props.value,beforeSource);assert.ok(text(renderer.toJSON()).includes('Compiles attempted'));
  await byLabel('Close Editor settings');
  pass('Font size and layout controls preserve source and record only local session statistics');

  await act(async () => editor().props.onChange('void setup() {\n missingThing();\n}\nvoid loop() {}'));
  await click('Verify');
  assert.ok(renderer.root.findAllByType('button').some(n => text(n).includes('Line 2:')));
  assert.ok(renderer.root.findAllByType('button').some(n => text(n).includes('UNKNOWN NAME')));
  let jumped, focused = false;
  editor().props.onCreateEditor({ state: { doc: { lines: 4, line: n => { assert.equal(n, 2); return { from: 15, to: 32 }; } } }, dispatch: value => { jumped = value; }, focus: () => { focused = true; } });
  await act(async () => renderer.root.findAllByType('button').find(n => text(n).includes('UNKNOWN NAME')).props.onClick());
  assert.ok(jumped.scrollIntoView && focused);
  pass('Compiler line-number diagnostics remain visible after real GCC failure');
  await act(async () => editor().props.onChange(source));
  await click('Upload');
  assert.ok(port.commands.includes(0x64) && port.commands.includes(0x74));
  assert.ok(renderer.root.findAllByType('pre').some(n => text(n).includes('Upload verified.')));
  pass('Upload handler recompiles changed source and calls unchanged STK500v1 with readback');
  await click('Serial Monitor');
  let runningMonitor;
  await act(async () => { runningMonitor = button('Connect').props.onClick(); await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(port.options.baudRate, 9600);
  await act(async () => { port.receive('Sensor value: 42\n'); await new Promise(resolve => setTimeout(resolve, 80)); });
  assert.ok(renderer.root.findAllByType('pre').some(n => text(n).includes('Sensor value: 42')));
  const serialInput = renderer.root.findAllByType('input').find(n => n.props['aria-label'] === 'Serial message');
  await act(async () => serialInput.props.onChange({ target: { value: 'hello' } }));
  await click('Send');
  assert.deepEqual(port.writtenSerial, ['hello\n']);
  for (const [ending, suffix] of [['none',''],['cr','\r'],['crlf','\r\n']]) {
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Serial line ending' }).props.onChange({ target: { value: ending } }));
    await act(async () => serialInput.props.onChange({ target: { value: 'ping' } }));
    await click('Send'); assert.equal(port.writtenSerial.at(-1), 'ping' + suffix);
  }
  await act(async () => { port.receive('temperature:23.5\r'); await new Promise(resolve => setTimeout(resolve, 70)); port.receive('\ntemperature:24.1\n'); await new Promise(resolve => setTimeout(resolve, 70)); });
  await click('Serial Plotter');
  assert.ok(renderer.root.findByProps({ 'aria-label': 'Live serial plot' }));
  assert.ok(renderer.root.findAllByType('path').some(n => n.props.d?.startsWith('M') && n.props.d.includes('L')));
  pass('Serial line endings and numeric plotter handle real stream chunks');
  await click('Serial Monitor');await click('Pause output');
  const frozen=text(renderer.root.findByProps({className:'serial-output'}));
  await act(async()=>{port.receive('temperature:44 humidity:56\n');await new Promise(resolve=>setTimeout(resolve,90));});
  assert.equal(text(renderer.root.findByProps({className:'serial-output'})),frozen);
  await click('Serial Plotter');assert.ok(text(renderer.root.findByProps({'aria-label':'Live serial plot'})).includes('humidity: 56'));
  await click('Serial Monitor');await click('Resume output');assert.ok(text(renderer.root.findByProps({className:'serial-output'})).includes('humidity:56'));
  await click('Serial Plotter');
  pass('Paused monitor freezes display while the port drains and the plotter keeps receiving real samples');

  await click('Pause plot');
  await act(async()=>{port.receive('temperature:99 humidity:71\n');await new Promise(resolve=>setTimeout(resolve,90));});
  assert.ok(!text(renderer.root.findByProps({'aria-label':'Live serial plot'})).includes('temperature: 99'));
  await click('Resume plot');
  await act(async()=>{port.receive('temperature:29 humidity:52\n');await new Promise(resolve=>setTimeout(resolve,90));});
  assert.ok(text(renderer.root.findByProps({'aria-label':'Live serial plot'})).includes('humidity: 52'));
  await click('Export CSV');
  assert.equal(downloads.at(-1).name,'circuitera-serial.csv');
  const csv=await blobs.get(downloads.at(-1).href).text();assert.ok(csv.includes('"temperature","humidity"'));assert.ok(!csv.includes(',99,71'));assert.ok(csv.includes(',29,52'));
  await click('Clear plot');assert.ok(text(renderer.root.findByProps({'aria-label':'Live serial plot'})).includes('Waiting for numerical'));
  pass('Plot pause keeps Serial Monitor reading, resume adds multiple series, CSV exports real samples, and Clear empties the chart');

  await click('Upload');
  await runningMonitor;
  assert.equal(port.isOpen, false);
  assert.ok(text(renderer.toJSON()).includes('UPLOAD COMPLETE'));
  pass('Monitor closes and releases its port before firmware upload');
  await click('Serial Monitor');
  await act(async () => { runningMonitor = button('Connect').props.onClick(); await new Promise(resolve => setImmediate(resolve)); });
  await click('Disconnect');
  await runningMonitor;
  pass('Serial Monitor receives text, sends newline-terminated text, and disconnects');
  await act(async () => serialListeners.get('disconnect')({ target: port }));
  assert.ok(text(renderer.toJSON()).includes('CONNECTION LOST'));
  pass('Physical-disconnect event clears selected-port state immediately');
  const darkButton = renderer.root.findByProps({ 'aria-label': 'Use dark theme' });
  await act(async () => darkButton.props.onClick());
  assert.equal((await stored()).meta.theme, 'dark');
  await act(async () => renderer.unmount());
  await mount();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  await click('Duplicate');
  assert.ok((await stored()).sketches.some(s => s.name.endsWith('copy') && s.code === source));
  await click('Rename');
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Sketch name' }).props.onChange({ target: { value: 'My project' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal((await stored()).active.name, 'My project');
  pass('Theme persists; duplicate preserves source; rename is saved locally');
  await act(async () => renderer.unmount());
  rejectPort = true;
  await mount();
  await click('Upload');
  assert.ok(renderer.root.findAllByType('pre').some(n => text(n).includes('school IT administrator to allow serial-device access')));
  pass('School-policy rejection produces clear IT guidance');
  const catalog = JSON.parse(await readFile('dist/avr/curated/manifest.json', 'utf8'));
  await click('Libraries');
  const uiChecks = renderer.root.findAll(n => n.props.className === 'library-proof pass');
  assert.equal(uiChecks.length, catalog.libraries.filter(l => l.status === 'PASS').length);
  pass('Library checkmarks agree with exact-build compile/link evidence');
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Search libraries' }).props.onChange({ target: { value: 'OLED' } }));
  assert.ok(text(renderer.toJSON()).includes('Adafruit SSD1306'));
  assert.ok(renderer.root.findAll(n => n.props.className?.includes?.('library-item')).length < catalog.libraries.length);
  pass('Library search finds OLED by description and examples');
  rejectPort = false;
  await byLabel('Show my sketches');
  await byLabel('Open Blink');
  const sourceA = examples.Blink.replaceAll('1000', '173');
  const sourceB = 'void setup() { Serial.begin(9600); pinMode(8, OUTPUT); }\nvoid loop() { Serial.println(427); digitalWrite(8, HIGH); delay(53); }\n';
  await act(async () => editor().props.onChange(sourceA));
  let firstCompile;
  await act(async () => { firstCompile = button('Verify').props.onClick(); });
  await byLabel('Open Button');
  assert.ok(!text(renderer.root.findByProps({ 'aria-label': 'Compiler and upload output' })).includes('Loading AVR-GCC'));
  await act(async () => { await firstCompile; });
  const hexA = firmwares.at(-1);
  assert.equal(hexA.source, sourceA);
  await act(async () => editor().props.onChange(sourceB));
  await click('Verify');
  const hexB = firmwares.at(-1);
  assert.equal(hexB.source, sourceB);
  assert.notEqual(hexA.hex, hexB.hex);
  assert.ok(parseIntelHex(hexA.hex).length && parseIntelHex(hexB.hex).length);
  assert.equal(renderer.root.findAll(n => n.props.role === 'tab' && n.props['aria-controls'] === 'sketch-editor-pane').length, 3);
  pass('Two simultaneous tabs compile their exact source into different real HEX; late results stay with the initiating sketch');
  await click('Upload');
  const bytesB = parseIntelHex(hexB.hex);
  assert.deepEqual(port.memory.slice(0, bytesB.length), bytesB);
  await byLabel('Open Blink');
  assert.equal(editor().props.value, sourceA);
  await click('Upload');
  const bytesA = parseIntelHex(hexA.hex);
  assert.deepEqual(port.memory.slice(0, bytesA.length), bytesA);
  pass('Each tab uploads only its own real HEX through unchanged STK500v1 and readback verification (software port fixture)');
  await byLabel('Disconnect board');
  const commandsBefore = port.commands.length;
  let resolvePicker, waitingUpload;
  portPicker = () => new Promise(resolve => { resolvePicker = resolve; });
  await act(async () => { waitingUpload = button('Upload').props.onClick(); await new Promise(resolve => setImmediate(resolve)); });
  assert.ok(resolvePicker);
  await byLabel('Open Button');
  await act(async () => { resolvePicker(port); await waitingUpload; });
  assert.equal(port.commands.length, commandsBefore);
  await byLabel('Open Blink');
  assert.ok(text(renderer.root.findByProps({ 'aria-label': 'Compiler and upload output' })).includes('Active sketch changed'));
  portPicker = null;
  pass('Switching sketches while USB selection is pending cancels before any flash commands');
  await byLabel('Open Button');
  const beforeRefresh = await stored();
  await act(async () => renderer.unmount());
  await mount();
  const afterRefresh = await stored();
  assert.deepEqual(afterRefresh, beforeRefresh);
  assert.equal(editor().props.value, sourceB);
  await byLabel('Open Blink'); assert.equal(editor().props.value, sourceA);
  await byLabel('Open Button');
  pass('All sketches, open tabs, tab order, and active sketch survive remount from IndexedDB');
  await click('Export All');
  const zipDownload = downloads.at(-1);
  assert.equal(zipDownload.name, 'uno-sketches.zip');
  await writeFile('test/generated/exported-sketches.zip', Buffer.from(await blobs.get(zipDownload.href).arrayBuffer()));
  await writeFile('test/generated/exported-sketches.json', JSON.stringify((await stored()).sketches));
  assert.ok(!storage.has('uno-web-ide:v1') && !storage.has('uno-web-ide:sketches'));
  pass('Export All downloads ZIP with current sketches; sketch content is stored only in IndexedDB');
  await byLabel('Close Button tab');
  assert.ok((await stored()).sketches.some(s => s.name === 'Button' && s.code === sourceB));
  await byLabel('Open Button');
  assert.equal(editor().props.value, sourceB);
  pass('Closing a tab keeps its saved sketch and reopening restores its exact code');
  await byLabel('Delete My project');
  assert.ok(renderer.root.findByProps({ role: 'alertdialog' }));
  await click('Cancel');
  assert.ok((await stored()).sketches.some(s => s.name === 'My project'));
  await byLabel('Delete My project');
  await click('Delete sketch');
  assert.ok(!(await stored()).sketches.some(s => s.name === 'My project'));
  pass('Delete requires confirmation; Cancel keeps data and confirmation removes only that sketch');
  let prevented = 0;
  const key = async (key, modifiers) => act(async () => { listeners.get('keydown')({ key, ...modifiers, preventDefault() { prevented++; } }); });
  const count = (await stored()).sketches.length;
  await key('n', { ctrlKey: true });
  assert.equal((await stored()).sketches.length, count + 1);
  await key('s', { metaKey: true });
  await key('w', { metaKey: true });
  assert.equal((await stored()).sketches.length, count + 1);
  assert.equal((await stored()).meta.openIds.length, 2);
  await key('n', { altKey: true });
  await key('w', { altKey: true });
  assert.equal(prevented, 5);
  pass('Save/New/Close handlers and Alt fallbacks work when the browser delivers the keyboard event');
  // New public-site integration: use the unchanged worker and real port owner.
  await act(async () => renderer.unmount());
  let leaveGuard, consumed = 0;
  const previousCount = (await stored()).sketches.length;
  await mount({ initialExample: 'Servo sweep', onExampleOpened: () => { consumed++; }, registerLeaveGuard: guard => { leaveGuard = guard; return () => { if (leaveGuard === guard) leaveGuard = null; }; } });
  for (let i = 0; i < 50 && !consumed; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  assert.equal(consumed, 1);
  const lockedSource = editor().props.value;
  assert.equal((await stored()).sketches.length, previousCount);
  const passwordInput = () => renderer.root.findByProps({id:'example-password'});
  const submitPassword = async value => {
    await act(async()=>passwordInput().props.onChange({target:{value}}));
    await act(async()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}}));
  };
  for (const wrong of ['', 'Trading', 'trading ', 'wrong']) {
    await submitPassword(wrong);
    assert.match(text(renderer.root.findByProps({id:'example-password-error'})),/Incorrect password/);
    assert.equal(editor().props.value,lockedSource);
    assert.equal((await stored()).sketches.length,previousCount);
  }
  await click('Cancel');
  assert.equal(renderer.root.findAllByProps({id:'example-password'}).length,0);
  assert.equal(editor().props.value,lockedSource);
  const chooseExample = async value => act(async()=>renderer.root.findByProps({'aria-label':'Open example'}).props.onChange({target:{value}}));
  await chooseExample('Servo sweep');
  await submitPassword('trading');
  assert.equal(renderer.root.findAllByProps({id:'example-password'}).length,0);
  assert.equal((await stored()).sketches.length, previousCount + 1);
  pass('Examples reject incorrect/case/space variants, cancel preserves work, and exact password opens a new sketch');
  let siteCompile;
  await act(async () => { siteCompile = button('Verify').props.onClick(); });
  await assert.rejects(leaveGuard(), /Wait for compilation/);
  await act(async () => siteCompile);
  assert.ok(firmwares.at(-1).hex.startsWith(':'));
  pass('Public example opens once as a new sketch; navigation waits for the real WASM compile to finish');
  port = new UnoPortFixture();
  await click('Serial Monitor');
  let siteMonitor;
  await act(async () => { siteMonitor = button('Connect').props.onClick(); await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(port.isOpen, true);
  await act(async () => leaveGuard());
  await act(async () => siteMonitor);
  assert.equal(port.isOpen, false);
  assert.equal(port.closed, true);
  assert.equal((await stored()).active.code, editor().props.value);
  pass('Leaving the IDE commits pending local edits and releases the Serial Monitor port before navigation');

  await byLabel('Show my sketches');
  await click('Convert to Project');
  const projectId=(await stored()).active.id;
  const projectMain='#include "motor.h"\nvoid setup(){pinMode(9,OUTPUT);}\nvoid loop(){digitalWrite(9,motorState());delay(100);}\n';
  await act(async()=>editor().props.onChange(projectMain));
  const addProjectFile=async(name,code)=>{
    await byLabel('Add project file');
    await act(async()=>renderer.root.findByProps({'aria-label':'Project filename'}).props.onChange({target:{value:name}}));
    await act(async()=>renderer.root.findByProps({className:'file-form'}).props.onSubmit({preventDefault(){}}));
    await act(async()=>editor().props.onChange(code));
  };
  await addProjectFile('motor.h','#pragma once\nint motorState();\n');
  await addProjectFile('motor.cpp','#include "motor.h"\nint motorState(){return 1;}\n');
  await click('Verify');
  const projectFirmware=firmwares.at(-1);assert.equal(projectFirmware.source.kind,'project');assert.equal(projectFirmware.stats.projectObjects,2);
  await byLabel('Edit main.ino');await click('Upload');assert.deepEqual(port.memory.slice(0,parseIntelHex(projectFirmware.hex).length),parseIntelHex(projectFirmware.hex));
  await byLabel('Edit motor.cpp');await act(async()=>editor().props.onChange('#include "motor.h"\nint motorState(){return 0;}\n'));
  await click('Upload');const changedProject=firmwares.at(-1);assert.notEqual(changedProject.hex,projectFirmware.hex);assert.deepEqual(port.memory.slice(0,parseIntelHex(changedProject.hex).length),parseIntelHex(changedProject.hex));
  pass('Project UI compiles separate C++ objects; switching files retains firmware and secondary-file edits force genuine recompilation before upload');
  const projectBefore=await stored();await act(async()=>renderer.unmount());await mount();assert.deepEqual(await stored(),projectBefore);assert.equal(editor().props.value,'#include "motor.h"\nint motorState(){return 0;}\n');
  await click('Export project ZIP');assert.ok(downloads.at(-1).name.endsWith('.zip'));assert.ok((await blobs.get(downloads.at(-1).href).arrayBuffer()).byteLength>200);
  pass('Project records, selected file, independent source contents and open tabs survive IndexedDB remount; project ZIP downloads');
  const beforeWizard=await stored(),beforeTestFirmware=firmwares.length;
  await click('Test My Uno');assert.equal(firmwares.length,beforeTestFirmware);assert.ok(button('Select Uno').props.disabled);
  await click('Check browser');await click('Select Uno');await click('Compile test');assert.ok(firmwares.at(-1).source.includes('onboard LED only'));
  port.corruptRead=true;await click('Upload test firmware');assert.ok(text(renderer.root.findByProps({'aria-label':'Hardware test output'})).includes('FLASH VERIFICATION FAILED'));assert.ok(!text(renderer.toJSON()).includes('✓ Bootloader communication'));
  port.corruptRead=false;await click('Upload test firmware');assert.ok(text(renderer.toJSON()).includes('✓ Bootloader communication'));
  assert.deepEqual(await stored(),beforeWizard);await byLabel('Close Test My Uno');
  assert.equal((await stored()).active.id,projectId);await click('Upload');assert.deepEqual(port.memory.slice(0,parseIntelHex(changedProject.hex).length),parseIntelHex(changedProject.hex));
  pass('Optional Test My Uno requires explicit actions, uses real WASM + unchanged STK500v1, rejects bad readback, and never replaces student sketches or their firmware (software port only)');
  // Nano profiles use the actual Worker and real uploader code with software USB streams.
  await click('New');
  const macroSource='#if defined(ARDUINO_AVR_NANO)\nconst int outputPin=8;\nstatic_assert(NUM_ANALOG_INPUTS==8,"Nano needs eight analog inputs");\n#else\nconst int outputPin=13;\n#endif\nvoid setup(){pinMode(outputPin,OUTPUT);Serial.begin(9600); }\nvoid loop(){digitalWrite(outputPin,HIGH);Serial.println(outputPin);delay(173); }\n';
  await act(async()=>editor().props.onChange(macroSource));await click('Verify');const unoMacro=firmwares.at(-1);
  const chooseBoard=async id=>act(async()=>renderer.root.findByProps({'aria-label':'Target board'}).props.onChange({target:{value:id}}));
  for(const target of [...BOARD_PROFILES.filter(b=>b.family==='pb'),...BOARD_PROFILES.filter(b=>b.family==='nano')]){
    await click('Output');
    await chooseBoard(target.id);assert.equal(renderer.root.findByProps({'aria-label':'Target board'}).props.value,target.id);
    assert.ok(!text(renderer.root.findByProps({'aria-label':'Compiler and upload output'})).includes('✓ COMPILED'));
    // Reconnect intentionally, to select the fixture configured for this real baud.
    if(button('Reconnect'))await byLabel('Disconnect board');
    port=new UnoPortFixture({uploadBaud:target.baudRate,usbVendorId:0x1A86,usbProductId:0x7523});
    await click('Upload');const nanoBuild=firmwares.at(-1);
    assert.equal(nanoBuild.board,target.id);assert.equal(nanoBuild.source,macroSource);assert.notEqual(nanoBuild.hex,unoMacro.hex);
    assert.equal(nanoBuild.flashLimit,target.flashLimit);assert.equal(port.options.baudRate,target.baudRate);
    assert.deepEqual(port.memory.slice(0,parseIntelHex(nanoBuild.hex).length),parseIntelHex(nanoBuild.hex));assert.equal(port.closed,true);
    assert.ok(text(renderer.toJSON()).includes('UPLOAD COMPLETE'));
    if(target.family==='pb'){await click('Check board');assert.ok(text(renderer.root.findByProps({'aria-label':'Compiler and upload output'})).includes('Uncertain'));}
    const lastBuildCount=firmwares.length;await click('Upload');assert.equal(firmwares.length,lastBuildCount,'Reuse allowed only for matching active board and source');
    await click('Serial Monitor');let nanoMonitor;
    await act(async()=>{nanoMonitor=button('Connect').props.onClick();await new Promise(resolve=>setImmediate(resolve));});
    await act(async()=>{port.receive('Nano serial 23.7\n');await new Promise(resolve=>setTimeout(resolve,80));});
    assert.ok(text(renderer.toJSON()).includes('Nano serial 23.7'));await click('Disconnect');await nanoMonitor;assert.equal(port.closed,true);
    pass(target.label+': UI compiles its own board macro and current source; actual baud reaches uploader; flash readback and Serial Monitor reopen pass (software port)');
  }
  await click('Output');
  const nanoWorkspace=await stored();await act(async()=>renderer.unmount());await mount();
  assert.equal(renderer.root.findByProps({'aria-label':'Target board'}).props.value,BOARD_PROFILES[2].id);
  assert.deepEqual(await stored(),nanoWorkspace);assert.equal(storage.get(BOARD_STORAGE_KEY),BOARD_PROFILES[2].id);
  pass('Nano selection survives remount without modifying IndexedDB sketches or project records');
  let resolveNanoPicker,waitingNano;
  portPicker=()=>new Promise(resolve=>{resolveNanoPicker=resolve;});
  await act(async()=>{waitingNano=button('Upload').props.onClick();await new Promise(resolve=>setImmediate(resolve));});
  assert.equal(renderer.root.findByProps({'aria-label':'Target board'}).props.disabled,true);
  await chooseBoard(DEFAULT_BOARD);assert.equal(renderer.root.findByProps({'aria-label':'Target board'}).props.value,BOARD_PROFILES[2].id);
  await act(async()=>{resolveNanoPicker(port);await waitingNano;});portPicker=null;
  pass('Target selector is locked during pending USB selection and cannot retarget an in-flight upload');
  await chooseBoard(DEFAULT_BOARD);assert.equal(renderer.root.findByProps({'aria-label':'Target board'}).props.value,DEFAULT_BOARD);assert.ok(text(renderer.toJSON()).includes('NO BOARD'));
  await click('Verify');assert.equal(firmwares.at(-1).board,DEFAULT_BOARD);assert.equal(firmwares.at(-1).hex,unoMacro.hex);
  pass('Switching back to Uno restores original compilation behavior and clears a Nano device selection');

  await writeFile('reports/multisketch-firmware.json', JSON.stringify({ scope: 'Genuine WASM Worker outputs, with software STK500v1 port verification; no physical board attached.', sketches: [hexA, hexB].map(v => ({ source: v.source, sha256: createHash('sha256').update(v.hex).digest('hex'), firmwareBytes: parseIntelHex(v.hex).length })) }, null, 2));
} finally {
  if (renderer) await act(async () => renderer.unmount());
  await Promise.all(workers.map(w => w.terminate()));
  URL.createObjectURL = originalCreateURL; URL.revokeObjectURL = originalRevokeURL;
  await writeFile('reports/ui-regressions.json', JSON.stringify({ testedAt: new Date().toISOString(), scope: 'Isolated React handler tests with a test editor host, actual production Worker on Node transport, and software serial-port fixture. Not Chrome DOM or physical USB tests.', checks: records }, null, 2));
}
