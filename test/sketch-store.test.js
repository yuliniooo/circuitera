import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { SketchWorkspace, legacySketches, openSketchDatabase, writeSketchChanges } from '../src/sketchStore.js';
import { artifactMatches } from '../src/sketchBuilds.js';
import { exportSketchZip } from '../src/sketchZip.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const starterCode = 'void setup() {}\nvoid loop() {}';
const legacy = new Map([
  ['uno-web-ide:v1', JSON.stringify({ id: 'old', name: 'Recovered', code: 'newest recovery', theme: 'dark' })],
  ['uno-web-ide:sketches', JSON.stringify([{ id: 'old', name: 'Older', code: 'older save' }, { id: 'second', name: 'Other', code: 'other source' }])],
]);
const storage = { getItem: key => legacy.get(key) };
async function workspace(options = {}) { const ws = new SketchWorkspace({ starterCode, factory: new IDBFactory(), ...options }); await ws.initialize(); assert.equal(ws.state.ready, true); return ws; }

test('migration keeps newest recovery and all legacy sketches; deleted data is never remigrated', async () => {
  const factory = new IDBFactory();
  const a = await workspace({ factory, storage }), b = await workspace({ factory, storage });
  assert.equal(a.active().code, 'newest recovery'); assert.equal(a.state.theme, 'dark'); assert.equal(a.state.sketches.length, 2);
  assert.deepEqual(b.state.sketches, a.state.sketches); b.db.close();
  assert.equal(await a.remove('old'), true); assert.equal(await a.remove('second'), true); a.db.close();
  const restored = await workspace({ factory, storage });
  assert.equal(restored.state.sketches.length, 0); assert.equal(restored.state.activeId, null); restored.db.close();
  assert.equal(JSON.parse(legacy.get('uno-web-ide:v1')).code, 'newest recovery');
  assert.equal(legacySketches({ getItem: () => 'broken JSON' }, starterCode).sketches[0].code, starterCode);
});

test('pending save indicator waits for transaction completion; rapid edits and closed tabs restore independently', async () => {
  const factory = new IDBFactory(), ws = await workspace({ factory });
  const first = ws.active().id, second = ws.create('Sensor', 'sensor source').id;
  ws.edit(first, { code: 'revision 1' }); ws.edit(first, { code: 'revision 2' }); ws.edit(second, { code: 'sensor latest' });
  assert.ok(ws.state.pending.has(first)); assert.ok(ws.state.pending.has(second));
  ws.close(first); await ws.flush(); assert.equal(ws.state.pending.size, 0);
  const reopened = await workspace({ factory });
  assert.equal(reopened.state.sketches.find(s => s.id === first).code, 'revision 2');
  assert.equal(reopened.active().code, 'sensor latest'); assert.deepEqual(reopened.state.openIds, [second]);
  reopened.open(first); assert.equal(reopened.active().code, 'revision 2');
  await reopened.flush(); ws.db.close(); reopened.db.close();
});

test('quota failure retains edits and unsaved state; retry commits; failed deletion retains the sketch', async () => {
  const ws = await workspace(), id = ws.active().id;
  const tx = ws.db.transaction.bind(ws.db);
  ws.db.transaction = () => { throw new DOMException('Storage quota exceeded', 'QuotaExceededError'); };
  ws.edit(id, { code: 'valuable unsaved code' }); await ws.flush();
  assert.ok(ws.state.failedIds.has(id)); assert.match(ws.state.error, /Storage quota exceeded/); assert.equal(ws.active().code, 'valuable unsaved code');
  assert.equal(await ws.remove(id), false); assert.equal(ws.active().id, id);
  ws.db.transaction = tx;
  assert.equal(await ws.save(id), true); assert.equal(ws.state.error, ''); assert.equal(ws.state.failedIds.size, 0);
  ws.db.close();
});

test('aborted transactions reject rather than reporting a successful save', async () => {
  const db = await openSketchDatabase(new IDBFactory()), real = db.transaction.bind(db);
  db.transaction = (...args) => { const tx = real(...args); queueMicrotask(() => tx.abort()); return tx; };
  await assert.rejects(writeSketchChanges(db, { put: [{ id: 'abort', name: 'A', code: 'not committed' }] }), /interrupted/);
  db.transaction = real;
  const values = await new Promise(resolve => { const tx = db.transaction('sketches'); const request = tx.objectStore('sketches').getAll(); tx.oncomplete = () => resolve(request.result); });
  assert.equal(values.length, 0); db.close();
});

test('firmware identity guard rejects different tab, changed source, wrong board and empty firmware', () => {
  const sketch = { id: 'a', code: starterCode }, artifact = { sketchId: 'a', source: starterCode, board: 'arduino:avr:uno', hex: ':test' };
  assert.equal(artifactMatches(artifact, sketch), true);
  for (const bad of [{ ...artifact, sketchId: 'b' }, { ...artifact, source: 'changed' }, { ...artifact, board: 'other' }, { ...artifact, hex: '' }]) assert.equal(artifactMatches(bad, sketch), false);
});

test('Export All ZIP passes independent Python CRC checks and preserves Unicode, duplicate names and exact sources', async () => {
  const sketches = [{ name: 'Blink', code: starterCode }, { name: 'blink', code: 'different source\n' }, { name: '../ température', code: '// λ\n' }, { name: 'Blink', code: '' }];
  const dir = mkdtempSync(path.join(tmpdir(), 'uno-zip-'));
  try {
    writeFileSync(path.join(dir, 'sketches.zip'), Buffer.from(await exportSketchZip(sketches).arrayBuffer()));
    writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(sketches.map(s => s.code)));
    execFileSync('python', ['-c', 'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); names=z.namelist(); assert z.testzip() is None; assert len(set(n.lower() for n in names))==4; assert all("/" not in n and n.endswith(".ino") for n in names); assert [z.read(n).decode("utf-8") for n in names]==json.load(open(sys.argv[2]))', path.join(dir, 'sketches.zip'), path.join(dir, 'expected.json')]);
  } finally { rmSync(dir, { recursive: true }); }
});
