export { prepareArduinoSource, generateArduinoPrototypes, diagnosticsFromCompiler } from './arduino-source.js';

let worker;
let active;
let sequence = 0;
// Reset on real progress. Slow Chromebooks get five minutes per compiler step.
const INACTIVITY_MS = 5 * 60 * 1000;
function failWorker(error, runner) {
  if (runner !== worker) return;
  const pending = active;
  active = null;
  clearTimeout(pending?.timer);
  runner.terminate(); worker = null;
  if (pending) pending.reject(new Error([
    error.message || String(error), error.stack || '',
    `Target: ${pending.boardId}`, `Compiler assets: ${pending.assetsBase}`,
    pending.lastProgress ? `Last worker stage: ${pending.lastProgress.stage} — ${pending.lastProgress.detail || ''}` : 'Worker did not report a stage.',
  ].filter(Boolean).join('\n')));
}
function armWatchdog(runner) {
  clearTimeout(active?.timer);
  if (active) active.timer = setTimeout(() => failWorker(new Error('Compiler worker stopped responding for five minutes. No firmware was accepted. Retry compilation; check System Check and the compiler assets below.'), runner), INACTIVITY_MS);
}
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./compiler.worker.js', import.meta.url), { type: 'module', name: 'uno-avr-gcc' });
    const runner = worker;
    worker.onmessage = ({ data }) => {
      if (runner !== worker || !active || data?.id !== active.id) return;
      if (data.type === 'progress') {
        active.lastProgress = data.progress;
        armWatchdog(runner);
        try { active.onProgress?.(data.progress); } catch (error) { failWorker(error, runner); }
      }
      else if (data.type === 'result') {
        clearTimeout(active.timer);
        const { resolve } = active;
        active = null;
        resolve(data.result);
      }
    };
    worker.onerror = event => {
      failWorker(new Error([event.message || 'Compiler Worker could not start.', event.filename ? `Worker asset: ${event.filename}:${event.lineno || 0}:${event.colno || 0}` : '', event.error?.stack || ''].filter(Boolean).join('\n')), runner);
    };
    worker.onmessageerror = () => failWorker(new Error('Could not deserialize the compiler worker response. No firmware was accepted. Retry compilation.'), runner);
  }
  return worker;
}
export function compileSketchInBrowser(source, onProgress, boardId = 'arduino:avr:uno') {
  if (active) return Promise.reject(new Error('A compilation is already running.'));
  const runner = getWorker();
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const assetsBase = new URL('avr/', document.baseURI).href;
    active = { id, resolve, reject, onProgress, boardId, assetsBase };
    armWatchdog(runner);
    try { runner.postMessage({ id, source, boardId, assetsBase }); }
    catch (error) { failWorker(error, runner); }
  });
}
