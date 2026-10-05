import { DEFAULT_BOARD } from './boards.js';
import { sourceIdentity } from './projectFiles.js';
import { useMemo, useState } from 'react';
const initial = { output: 'Ready. Compile runs locally in a Web Worker for the selected board.', diagnostics: [], compiled: null, compileState: 'idle', compileProgress: null, compileResult: null, uploadProgress: 0, uploadStage: '', lastUpload: '' };
export function artifactMatches(artifact, sketch, boardId=DEFAULT_BOARD) {
  return Boolean(sketch && artifact?.sketchId === sketch.id && artifact.source === sourceIdentity(sketch) && artifact.board === boardId && artifact.hex);
}
// Setters are bound to the sketch ID at operation start. A late Worker result
// cannot change another tab's diagnostics or firmware.
export function useSketchBuilds(sketchId, boardId=DEFAULT_BOARD) {
  const id=sketchId+':'+boardId;
  const [builds, setBuilds] = useState({});
  const setters = useMemo(() => Object.fromEntries(Object.keys(initial).map(key => [
    'set' + key[0].toUpperCase() + key.slice(1), value => setBuilds(all => {
      const before = all[id] || initial;
      return { ...all, [id]: { ...before, [key]: typeof value === 'function' ? value(before[key]) : value } };
    }),
  ])), [id]);
  return { ...(builds[id] || initial), ...setters };
}
