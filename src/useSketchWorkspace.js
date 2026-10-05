import { useEffect, useState, useSyncExternalStore } from 'react';
import { SketchWorkspace } from './sketchStore.js';
import { starterSketch } from './examples.js';

export function useSketchWorkspace() {
  const [workspace] = useState(() => {
    let storage; try { storage = localStorage; } catch {}
    return new SketchWorkspace({ starterCode: starterSketch, storage });
  });
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  useEffect(() => { void workspace.initialize(); }, [workspace]);
  useEffect(() => {
    const unload = event => {
      if (workspace.state.pending.size || workspace.state.failedIds.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [workspace]);
  return { workspace, ...state };
}
