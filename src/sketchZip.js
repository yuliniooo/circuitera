// Standard ZIP STORE records: no compression worker or runtime dependency needed
// for small text sketches. UTF-8 filenames, CRC32, and collision-safe names.
const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; };
export const sketchFilename = name => `${(name.trim() || 'sketch').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '') || 'sketch'}.ino`;
export function exportSketchZip(sketches) {
  const usedFolders = new Set();
  const entries = sketches.flatMap(sketch => {
    if (!sketch.project) return [{name:sketchFilename(sketch.name),code:sketch.code}];
    const base=sketchFilename(sketch.name).slice(0,-4); let folder=base, i=2;
    while(usedFolders.has(folder.toLowerCase())) folder=base+'_'+i++;
    usedFolders.add(folder.toLowerCase());
    return sketch.project.files.map(file=>({name:folder+'/'+file.name,code:file.code}));
  });
  return exportTextZip(entries);
}
export function exportTextZip(entries) {
  if (entries.length > 65535) throw new Error('This ZIP export supports up to 65,535 files. Export smaller groups or individual sketches.');
  const local = [], central = [], used = new Set(); let offset = 0, directorySize = 0;
  for (const sketch of entries) {
    const base = sketch.name; let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = base.replace(/(\.[^./]+)$/, `_${n++}$1`);
    used.add(name.toLowerCase());
    const filename = encoder.encode(name), data = encoder.encode(sketch.code), crc = crc32(data);
    if (filename.length > 65535 || offset + data.length + filename.length + 100 > 0xffffffff) throw new Error('ZIP is too large; export individual sketches instead.');
    const head = new Uint8Array(30), h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, filename.length, true);
    local.push(head, filename, data);
    const entry = new Uint8Array(46), e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x800, true);
    e.setUint16(14, 33, true); e.setUint32(16, crc, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, filename.length, true); e.setUint32(42, offset, true);
    central.push(entry, filename); directorySize += entry.length + filename.length; offset += head.length + filename.length + data.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
