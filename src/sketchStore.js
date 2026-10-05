import { convertRecord, editProjectFile, validateFiles } from './projectFiles.js';
// Sketches and workspace metadata stay on this origin, in IndexedDB.
export const DATABASE_NAME = 'uno-web-ide';
const validSketch = value => value && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.code === 'string';
export function legacySketches(storage, starterCode) {
  let collection = [], recovery;
  try { collection = JSON.parse(storage?.getItem('uno-web-ide:sketches') || '[]'); } catch {}
  try { recovery = JSON.parse(storage?.getItem('uno-web-ide:v1') || 'null'); } catch {}
  if (!Array.isArray(collection)) collection = [];
  const sketches = new Map(collection.filter(validSketch).map(s => [s.id, { id: s.id, name: s.name, code: s.code }]));
  if (recovery && typeof recovery.code === 'string') {
    recovery = { ...recovery, id: typeof recovery.id === 'string' && recovery.id ? recovery.id : 'first-sketch', name: typeof recovery.name === 'string' && recovery.name ? recovery.name : 'Recovered sketch' };
    sketches.set(recovery.id, { id: recovery.id, name: recovery.name, code: recovery.code });
  }
  if (!sketches.size) sketches.set('first-sketch', { id: 'first-sketch', name: 'Blink', code: starterCode });
  const activeId = recovery?.id || sketches.keys().next().value;
  return { sketches: [...sketches.values()], meta: { key: 'workspace', initialized: true, activeId, openIds: [activeId], theme: recovery?.theme === 'dark' ? 'dark' : 'light' } };
}
export function openSketchDatabase(factory = globalThis.indexedDB, name = DATABASE_NAME) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('IndexedDB is unavailable. Enable site storage to save sketches.')); return; }
    const request = factory.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sketches', { keyPath: 'id' });
      request.result.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Sketch storage is blocked by another browser tab. Close the older IDE tab and reload.')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function transaction(db, mode) {
  return db.transaction(['sketches', 'meta'], mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
}
// Initialization/migration is atomic, including when two browser tabs first open together.
export function loadSketchWorkspace(db, legacy) {
  return new Promise((resolve, reject) => {
    const tx = transaction(db, 'readwrite');
    const metaRequest = tx.objectStore('meta').get('workspace');
    let result;
    metaRequest.onsuccess = () => {
      if (!metaRequest.result?.initialized) {
        for (const sketch of legacy.sketches) tx.objectStore('sketches').put(sketch);
        tx.objectStore('meta').put(legacy.meta);
        result = legacy;
      } else {
        const request = tx.objectStore('sketches').getAll();
        request.onsuccess = () => { result = { sketches: request.result.filter(validSketch), meta: metaRequest.result }; };
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Workspace restore was interrupted.'));
    tx.onerror = () => {};
  });
}
export function writeSketchChanges(db, { put = [], remove = [], meta } = {}) {
  return new Promise((resolve, reject) => {
    const tx = transaction(db, 'readwrite');
    // Queue all requests synchronously; never await in an active transaction.
    for (const sketch of put) tx.objectStore('sketches').put(sketch);
    for (const id of remove) tx.objectStore('sketches').delete(id);
    if (meta) tx.objectStore('meta').put(meta);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Local save was interrupted.'));
    tx.onerror = () => {};
  });
}

export class SketchWorkspace {
  constructor({ starterCode, storage, factory, databaseName } = {}) {
    this.options = { starterCode, storage, factory, databaseName };
    this.state = { sketches: [], openIds: [], activeId: null, theme: 'light', ready: false, pending: new Set(), error: '', failedIds: new Set() };
    this.listeners = new Set(); this.inflight = new Set(); this.revisions = new Map(); this.deletingIds = new Set();
    this.subscribe = callback => { this.listeners.add(callback); return () => this.listeners.delete(callback); };
    this.getSnapshot = () => this.state;
  }
  emit(patch) { this.state = { ...this.state, ...patch }; for (const callback of this.listeners) callback(); }
  initialize() {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        const { factory, databaseName, storage, starterCode } = this.options;
        this.db = await openSketchDatabase(factory, databaseName);
        const result = await loadSketchWorkspace(this.db, legacySketches(storage, starterCode));
        const ids = new Set(result.sketches.map(s => s.id));
        const openIds = [...new Set((result.meta.openIds || []).filter(id => ids.has(id)))];
        this.emit({ sketches: result.sketches, openIds, activeId: openIds.includes(result.meta.activeId) ? result.meta.activeId : openIds[0] || null, theme: result.meta.theme === 'dark' ? 'dark' : 'light', ready: true });
      } catch (error) { this.emit({ error: `Unable to restore sketches: ${error.message}`, ready: false }); }
    })();
    return this.initializing;
  }
  metadata() { const { openIds, activeId, theme } = this.state; return { key: 'workspace', initialized: true, openIds, activeId, theme }; }
  active() { return this.state.sketches.find(s => s.id === this.state.activeId) || null; }
  persist(put = [], remove = [], includeMeta = false) {
    if (!this.db) return Promise.resolve(false);
    const affected = [...put.map(s => s.id), ...remove];
    if (includeMeta) affected.push('$workspace');
    const versions = affected.map(id => { const rev = (this.revisions.get(id) || 0) + 1; this.revisions.set(id, rev); return [id, rev]; });
    this.emit({ pending: new Set([...this.state.pending, ...affected]) });
    // Open the transaction in the edit event itself, not an unload handler or delayed timer.
    const task = writeSketchChanges(this.db, { put, remove, meta: includeMeta ? this.metadata() : undefined }).then(() => {
      const pending = new Set(this.state.pending), failedIds = new Set(this.state.failedIds);
      for (const [id, rev] of versions) if (this.revisions.get(id) === rev) { pending.delete(id); failedIds.delete(id); }
      this.emit({ pending, failedIds, error: failedIds.size ? this.state.error : '' }); return true;
    }).catch(error => {
      const pending = new Set(this.state.pending), failedIds = new Set(this.state.failedIds);
      for (const [id, rev] of versions) if (this.revisions.get(id) === rev) { pending.delete(id); failedIds.add(id); }
      this.emit({ pending, failedIds, error: failedIds.size ? `Local save failed: ${error.message}. Your edits remain in this tab. Retry saving or Export All to keep a backup.` : '' }); return false;
    }).finally(() => this.inflight.delete(task));
    this.inflight.add(task); return task;
  }
  uniqueName(name) {
    const base = (name || 'Untitled').trim().replace(/\.ino$/i, '') || 'Untitled';
    const names = new Set(this.state.sketches.map(s => s.name));
    let next = base, number = 2; while (names.has(next)) next = `${base} ${number++}`; return next;
  }
  create(name = 'Untitled', code = 'void setup() {\n  \n}\n\nvoid loop() {\n  \n}\n', project) {
    if (!this.state.ready) return null;
    if (project) validateFiles(project.files, project.entry);
    const sketch = { id: crypto.randomUUID(), name: this.uniqueName(name), code, ...(project ? {project:structuredClone(project)} : {}), updatedAt: Date.now() };
    this.emit({ sketches: [...this.state.sketches, sketch], openIds: [...this.state.openIds, sketch.id], activeId: sketch.id });
    void this.persist([sketch], [], true); return sketch;
  }
  edit(id, patch) {
    if (this.deletingIds.has(id)) return;
    const original = this.state.sketches.find(s => s.id === id);
    if (!original) return;
    const sketch = { ...original, ...patch, id, updatedAt: Date.now() };
    this.emit({ sketches: this.state.sketches.map(s => s.id === id ? sketch : s) });
    void this.persist([sketch]);
  }
  rename(id, name) { if (name.trim()) this.edit(id, { name: name.trim().replace(/\.ino$/i, '') || 'Untitled' }); }
  duplicate(id) { const original = this.state.sketches.find(s => s.id === id); return original && this.create(`${original.name} copy`, original.code, original.project); }
  convertToProject(id) {
    const sketch = this.state.sketches.find(s=>s.id===id);
    if (sketch && !sketch.project) this.edit(id, convertRecord(sketch));
  }
  selectFile(id, name) {
    const sketch = this.state.sketches.find(s=>s.id===id);
    if (sketch?.project?.files.some(f=>f.name===name)) this.edit(id, {project:{...sketch.project,activeFile:name}});
  }
  editFile(id, name, code) {
    const sketch = this.state.sketches.find(s=>s.id===id);
    if (sketch?.project) this.edit(id, editProjectFile(sketch, name, code));
  }
  addFile(id, name, code = '') {
    const sketch = this.state.sketches.find(s=>s.id===id);
    if (!sketch?.project) return;
    const project = {...sketch.project, files:[...sketch.project.files,{name,code}],activeFile:name};
    validateFiles(project.files, project.entry); this.edit(id,{project});
  }
  renameFile(id, before, name) {
    const sketch = this.state.sketches.find(s=>s.id===id);
    if (!sketch?.project) return;
    if (before===sketch.project.entry && !name.endsWith('.ino')) throw new Error('Keep the main file as .ino.');
    const project = {...sketch.project, files:sketch.project.files.map(f=>f.name===before?{...f,name}:f), entry:sketch.project.entry===before?name:sketch.project.entry, activeFile:sketch.project.activeFile===before?name:sketch.project.activeFile};
    validateFiles(project.files,project.entry);this.edit(id,{project});
  }
  removeFile(id, name) {
    const sketch = this.state.sketches.find(s=>s.id===id);
    if (!sketch?.project) return;
    if (name===sketch.project.entry) throw new Error('The main .ino file cannot be deleted.');
    const project = {...sketch.project,files:sketch.project.files.filter(f=>f.name!==name),activeFile:sketch.project.activeFile===name?sketch.project.entry:sketch.project.activeFile};
    validateFiles(project.files,project.entry);this.edit(id,{project});
  }
  open(id) {
    if (!this.state.sketches.some(s => s.id === id)) return;
    this.emit({ openIds: this.state.openIds.includes(id) ? this.state.openIds : [...this.state.openIds, id], activeId: id });
    void this.persist([], [], true);
  }
  close(id) {
    const index = this.state.openIds.indexOf(id);
    const openIds = this.state.openIds.filter(value => value !== id);
    this.emit({ openIds, activeId: this.state.activeId === id ? openIds[Math.min(index, openIds.length - 1)] || null : this.state.activeId });
    void this.persist([], [], true);
  }
  async remove(id) {
    if (!this.state.sketches.some(s => s.id === id)) return true;
    if (this.deletingIds.has(id)) return false;
    this.deletingIds.add(id);
    const before = this.state;
    const openIds = before.openIds.filter(value => value !== id);
    const activeId = before.activeId === id ? openIds[0] || null : before.activeId;
    // Do not remove the visible sketch unless its delete transaction actually commits.
    const result = await writeSketchChanges(this.db, { remove: [id], meta: { ...this.metadata(), openIds, activeId } }).then(() => true).catch(error => { this.emit({ error: `Delete failed: ${error.message}. The sketch was kept.` }); return false; });
    if (result) {
      const nowOpen = this.state.openIds.filter(value => value !== id), failedIds = new Set(this.state.failedIds), pending = new Set(this.state.pending);
      failedIds.delete(id); pending.delete(id);
      this.emit({ sketches: this.state.sketches.filter(s => s.id !== id), openIds: nowOpen, activeId: this.state.activeId === id ? nowOpen[0] || null : this.state.activeId, failedIds, pending });
      await this.persist([], [], true);
    }
    this.deletingIds.delete(id);
    return result;
  }
  setTheme(theme) { this.emit({ theme }); void this.persist([], [], true); }
  save(id) { if (this.deletingIds.has(id)) return Promise.resolve(false); const sketch = this.state.sketches.find(s => s.id === id); return this.persist(sketch ? [sketch] : [], [], true); }
  async flush() { while (this.inflight.size) await Promise.all([...this.inflight]); return !this.state.error; }
}
