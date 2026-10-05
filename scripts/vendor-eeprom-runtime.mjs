import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const archive = process.argv[2];
const extracted = process.argv[3];
const expected = '717d31f0e8d0a46e444156fbf322d63776aaa6da91a94d738830424717badb3d';
if (createHash('sha256').update(await readFile(archive)).digest('hex') !== expected) throw new Error('avr-libc source checksum mismatch');
const destination = 'vendor/libraries/eeprom/src/avr-libc';
await mkdir(destination, { recursive: true });
for (const file of ['eerd_byte.S', 'eerd_word.S', 'eerd_dword.S', 'eerd_block.S', 'eewr_byte.S', 'eewr_word.S', 'eewr_dword.S', 'eewr_block.S', 'eeupd_byte.S', 'eeupd_word.S', 'eeupd_dword.S', 'eeupd_block.S', 'eedef.h']) {
  await cp(path.join(extracted, 'libc/misc', file), path.join(destination, file));
}
for (const file of ['asmdef.h', 'sectionname.h']) await cp(path.join(extracted, 'common', file), path.join(destination, file));
await writeFile(`${destination}/SOURCE.json`, JSON.stringify({
  name: 'avr-libc EEPROM assembly', version: '2.0.0',
  source: 'https://github.com/avrdudes/avr-libc/tree/avr-libc-2_0_0-release',
  archive: 'https://codeload.github.com/avrdudes/avr-libc/tar.gz/refs/tags/avr-libc-2_0_0-release',
  sha256: expected, license: 'BSD-style; complete notices retained in every source file',
  changes: 'No upstream source changes. Preprocessed and assembled on demand by the existing AVR WASM toolchain.',
}, null, 2));
console.log('Vendored matching avr-libc 2.0.0 EEPROM assembly and source notices.');
