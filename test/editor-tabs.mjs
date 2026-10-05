// Actual CodeMirror + React in a DOM emulator, not a browser or hardware claim.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import 'fake-indexeddb/auto';
import { assetsBase } from './wasm-harness.mjs';
import { mkdir } from 'node:fs/promises';
await mkdir('test/generated', { recursive: true });
await build({ stdin: { contents: "export {default as App} from './src/App.jsx'; export {EditorView} from '@codemirror/view'; export {undo, undoDepth} from '@codemirror/commands';", resolveDir: process.cwd(), sourcefile: 'editor-entry.js' }, bundle: true, jsx: 'automatic', external: ['react', 'react-dom'], format: 'esm', platform: 'browser', outfile: 'test/generated/editor-app.mjs' });
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: new URL('../', assetsBase).href, pretendToBeVisual: true });
for (const key of ['window', 'document', 'MutationObserver', 'HTMLElement', 'Element', 'Node', 'Document', 'Window', 'DOMRect', 'Range']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const { App, EditorView, undo, undoDepth } = await import('./generated/editor-app.mjs');
const root = createRoot(document.getElementById('root'));
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
const current = () => EditorView.findFromDOM(document.querySelector('.cm-editor'));
async function click(label) { const button = [...document.querySelectorAll('button')].find(n => n.getAttribute('aria-label') === label || n.textContent.trim() === label); assert.ok(button, label); await act(async () => button.click()); await settle(); }
try {
  await act(async () => root.render(React.createElement(App)));
  for (let i=0; i<50 && !document.querySelector('.cm-editor'); i++) await settle();
  const before = current().state.doc.toString();
  await act(async () => current().dispatch({ changes: { from: current().state.doc.length, insert: '// history marker' }, userEvent: 'input.type' }));
  assert.equal(undoDepth(current().state), 1);
  await click('New');
  const sourceB = current().state.doc.toString();
  await click('Blink.ino');
  assert.equal(current().state.doc.toString(), before + '// history marker');
  console.log('Restored history depth', undoDepth(current().state));
  await act(async () => { assert.equal(undo(current()), true); });
  await settle();
  assert.equal(current().state.doc.toString(), before);
  await click('Untitled.ino'); assert.equal(current().state.doc.toString(), sourceB);
  console.log('PASS — real CodeMirror retains per-tab source and undo history without cross-tab edits');
} finally { await act(async () => root.unmount()); dom.window.close(); }
