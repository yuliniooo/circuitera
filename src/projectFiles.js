// Project metadata extends the original sketch record; its ID and main .ino
// source remain stable so old IndexedDB sketches never need destructive migration.
export const FILE_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*\.(ino|cpp|c|h)$/;
export function validateFiles(files, entry) {
  if (!Array.isArray(files) || !files.length || files.length > 64) throw new Error('A project needs 1–64 source files.');
  const names = new Set(); let size = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !FILE_PATTERN.test(file.name) || typeof file.code !== 'string') throw new Error('Use a simple filename ending in .ino, .cpp, .c or .h. Folders and paths are not supported.');
    const key = file.name.toLowerCase();
    if (names.has(key)) throw new Error(`Duplicate project filename: ${file.name}`);
    names.add(key); size += file.code.length;
  }
  if (size > 512000) throw new Error('Combined project sources must be smaller than 500 KB.');
  if (!files.some(f => f.name === entry && f.name.endsWith('.ino'))) throw new Error('The project must keep its main .ino file.');
  return files;
}
export const projectFiles = sketch => sketch?.project?.files || [];
export const activeFile = sketch => projectFiles(sketch).find(f => f.name === sketch.project.activeFile) || projectFiles(sketch).find(f => f.name === sketch.project.entry);
export const editorSource = sketch => sketch?.project ? activeFile(sketch)?.code || '' : sketch?.code || '';
export const editorKey = sketch => sketch?.project ? `${sketch.id}/${activeFile(sketch)?.name}` : sketch?.id;
export function compilationSource(sketch) {
  if (!sketch?.project) return sketch?.code || '';
  const { entry, files } = sketch.project;
  validateFiles(files, entry);
  return { kind: 'project', entry, files: files.map(({name, code}) => ({name, code})) };
}
// Content identity excludes selected file, tab order, names and timestamps.
// Any source/header change invalidates the old firmware; switching files doesn't.
export function sourceIdentity(sketch) {
  const source = compilationSource(sketch);
  return typeof source === 'string' ? source : JSON.stringify({entry:source.entry,files:[...source.files].sort((a,b)=>a.name.localeCompare(b.name))});
}
export function convertRecord(sketch) {
  if (sketch.project) return sketch;
  return { ...sketch, project: { entry: 'main.ino', activeFile: 'main.ino', files: [{name:'main.ino',code:sketch.code}] } };
}
export function editProjectFile(sketch, name, code) {
  const project = {...sketch.project, files:projectFiles(sketch).map(f=>f.name === name ? {...f, code} : f)};
  validateFiles(project.files, project.entry);
  return {...sketch, project, code:project.files.find(f=>f.name===project.entry).code};
}
