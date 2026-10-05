// ELF inspection and a standard GNU ar container. No machine code is generated here.
const decoder = new TextDecoder();
const encoder = new TextEncoder();
function cstring(bytes, offset) {
  let end = offset;
  while (end < bytes.length && bytes[end]) end++;
  return decoder.decode(bytes.subarray(offset, end));
}
export function inspectElf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x7f || decoder.decode(bytes.subarray(1, 4)) !== 'ELF' || bytes[4] !== 1 || bytes[5] !== 1 || view.getUint16(18, true) !== 83) throw new Error('Expected a genuine ELF32 AVR artifact.');
  const sectionOffset = view.getUint32(32, true);
  const entrySize = view.getUint16(46, true);
  const count = view.getUint16(48, true);
  const sections = Array.from({ length: count }, (_, i) => {
    const p = sectionOffset + i * entrySize;
    return { nameOffset: view.getUint32(p, true), type: view.getUint32(p + 4, true), address: view.getUint32(p + 12, true), offset: view.getUint32(p + 16, true), size: view.getUint32(p + 20, true), link: view.getUint32(p + 24, true), entrySize: view.getUint32(p + 36, true) };
  });
  const names = sections[view.getUint16(50, true)];
  for (const section of sections) section.name = cstring(bytes, names.offset + section.nameOffset);
  const symbols = [];
  for (const section of sections.filter(s => s.type === 2)) {
    const strings = sections[section.link];
    for (let p = section.offset; p < section.offset + section.size; p += section.entrySize) {
      const binding = bytes[p + 12] >> 4;
      const defined = view.getUint16(p + 14, true) !== 0;
      if ((binding === 1 || binding === 2) && defined) {
        const name = cstring(bytes, strings.offset + view.getUint32(p, true));
        if (name) symbols.push(name);
      }
    }
  }
  const ramBytes = sections.filter(s => ['.data', '.bss', '.noinit'].includes(s.name)).reduce((n, s) => n + s.size, 0);
  return { sections, symbols, ramBytes, machine: 'AVR', flags: view.getUint32(36, true) };
}

export function createArchive(objects) {
  const members = objects.map(([name, bytes], i) => ({ name: `core${i}.o`, bytes, symbols: inspectElf(bytes).symbols }));
  const symbols = members.flatMap(m => m.symbols.map(name => ({ name, member: m })));
  const names = encoder.encode(symbols.map(s => s.name + '\0').join(''));
  const indexSize = 4 + 4 * symbols.length + names.length;
  let offset = 8 + 60 + indexSize + (indexSize % 2);
  for (const member of members) { member.offset = offset; offset += 60 + member.bytes.length + (member.bytes.length % 2); }
  const result = new Uint8Array(offset);
  result.set(encoder.encode('!<arch>\n'));
  function header(at, name, size) {
    const value = name.padEnd(16) + '0'.padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(size).padEnd(10) + '`\n';
    result.set(encoder.encode(value), at);
  }
  header(8, '/', indexSize);
  const view = new DataView(result.buffer);
  view.setUint32(68, symbols.length, false);
  symbols.forEach((s, i) => view.setUint32(72 + i * 4, s.member.offset, false));
  result.set(names, 72 + symbols.length * 4);
  if (indexSize % 2) result[68 + indexSize] = 10;
  for (const m of members) {
    header(m.offset, m.name + '/', m.bytes.length);
    result.set(m.bytes, m.offset + 60);
    if (m.bytes.length % 2) result[m.offset + 60 + m.bytes.length] = 10;
  }
  return result;
}
