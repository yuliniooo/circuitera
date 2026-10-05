// Maintainer-only reproducible source acquisition. Never runs on the student's device.
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const downloadDir = process.argv[2];
if (!downloadDir) throw new Error('Pass a directory containing the official Arduino library_index.json.gz and package_index.json.');
const pins = [
  ['servo', 'Servo', '1.3.0'],
  ['liquidcrystal', 'LiquidCrystal', '1.0.7'],
  ['dht', 'DHT sensor library', '1.4.7'],
  ['unified-sensor', 'Adafruit Unified Sensor', '1.1.15'],
  ['gfx', 'Adafruit GFX Library', '1.12.6'],
  ['ssd1306', 'Adafruit SSD1306', '2.5.17'],
  ['busio', 'Adafruit BusIO', '1.17.4'],
  ['neopixel', 'Adafruit NeoPixel', '1.15.5'],
  ['newping', 'NewPing', '1.9.7'],
  ['irremote', 'IRremote', '4.7.1'],
  ['keypad', 'Keypad', '3.1.1'],
  ['accelstepper', 'AccelStepper', '1.64.0'],
  ['liquidcrystal-i2c', 'LiquidCrystal I2C', '1.1.2'],
];
const index = JSON.parse(gunzipSync(await readFile(path.join(downloadDir, 'library_index.json.gz'))));
const packageIndex = JSON.parse(await readFile(path.join(downloadDir, 'package_index.json'), 'utf8'));
const core = packageIndex.packages.find(p => p.name === 'arduino').platforms.find(p => p.architecture === 'avr' && p.version === '1.8.6');
const lockedPath = 'vendor/sources.lock.json';
let oldLock;
try { oldLock = JSON.parse(await readFile(lockedPath, 'utf8')); } catch {}
await mkdir('vendor/libraries', { recursive: true });
const records = [];
for (const [id, name, version] of [...pins, ['arduino-core', 'Arduino AVR Boards', '1.8.6']]) {
  const entry = id === 'arduino-core' ? core : index.libraries.find(l => l.name === name && l.version === version);
  if (!entry) throw new Error(`Missing pinned registry entry: ${name} ${version}`);
  const hash = entry.checksum.replace(/^SHA-256:/, '').toLowerCase();
  const previous = oldLock?.find(l => l.id === id);
  if (previous && previous.sha256 !== hash) throw new Error(`Registry checksum changed for ${id}; review required.`);
  const archive = path.join(downloadDir, entry.archiveFileName);
  try { await readFile(archive); } catch {
    execFileSync('curl', ['-fsSL', '--retry', '2', entry.url, '-o', archive], { stdio: 'inherit' });
  }
  const bytes = await readFile(archive);
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Checksum mismatch: ${id}`);
  const extracted = path.join(downloadDir, `extract-${id}`);
  await mkdir(extracted, { recursive: true });
  if (archive.endsWith('.zip')) execFileSync('unzip', ['-oq', archive, '-d', extracted]);
  else execFileSync('tar', ['--no-same-owner', '-xf', archive, '-C', extracted]);
  const [root] = await readdir(extracted);
  const dest = id === 'arduino-core' ? 'vendor/arduino-core' : `vendor/libraries/${id}`;
  await cp(path.join(extracted, root), dest, { recursive: true });
  records.push({ id, name, version, url: entry.url, sha256: hash, upstream: entry.repository || entry.website || 'https://github.com/arduino/ArduinoCore-avr', license: entry.license || 'See included upstream notices' });
  console.log(`Verified source: ${name} ${version}`);
}
await writeFile(lockedPath, JSON.stringify(records, null, 2) + '\n');
for (const [id, folder] of [['wire', 'Wire'], ['spi', 'SPI'], ['eeprom', 'EEPROM'], ['softwareserial', 'SoftwareSerial']]) {
  await cp(`vendor/arduino-core/libraries/${folder}`, `vendor/libraries/${id}`, { recursive: true });
}
