import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { assetsBase } from './wasm-harness.mjs';
import { compileUno, loadLibraryManifest, COMPILER_FLAGS } from '../src/compiler-engine.js';
import { libraryExamples } from '../src/libraryExamples.js';
import { parseIntelHex } from '../src/serial.js';

const manifest = await loadLibraryManifest(assetsBase);
const cases = {
  servo: 'Servo sweep', wire: 'I2C scanner', spi: 'SPI transfer', eeprom: 'EEPROM read-write',
  softwareserial: 'SoftwareSerial', liquidcrystal: 'LCD Hello World', dht: 'DHT temperature-humidity',
  'unified-sensor': 'Unified sensor', gfx: 'GFX canvas', ssd1306: 'OLED Hello World',
  busio: 'BusIO register', neopixel: 'NeoPixel', newping: 'Ultrasonic distance',
  irremote: 'IR remote', keypad: 'Keypad', accelstepper: 'Stepper motor', 'liquidcrystal-i2c': 'I2C LCD Hello World',
};
const sha = data => createHash('sha256').update(data).digest('hex');
const report = {
  testedAt: new Date().toISOString(), buildId: manifest.buildId, toolchain: manifest.toolchain,
  runtime: `Actual shipped WASM binaries on ${process.version}; filesystem transport replaces HTTP only`,
  target: 'ATmega328P / avr5 / F_CPU=16000000L', flags: COMPILER_FLAGS,
  scope: 'Compile, assemble, link, AVR ELF validation, Intel HEX checksum and flash-size validation. No physical device is attached; electrical behavior is not tested.',
  libraries: [], additional: [],
};
await mkdir('reports/firmware', { recursive: true });
await mkdir('reports/sketches', { recursive: true });
const hashes = new Set();
for (const lib of manifest.libraries) {
  assert.ok(cases[lib.id], `No test for ${lib.id}`);
  const example = cases[lib.id];
  const source = libraryExamples[example];
  assert.ok(source, `Missing actual sketch: ${example}`);
  await writeFile(`reports/sketches/${lib.id}.ino`, source);
  const start = performance.now();
  const result = await compileUno(source, { assetsBase });
  let error = result.ok ? '' : result.output;
  if (result.ok) {
    try {
      assert.ok(result.stats.libraries.includes(lib.id), `${lib.id} not actually selected`);
      assert.ok(result.flashBytes > 0 && result.flashBytes <= 32256);
      assert.ok(result.ramBytes <= 2048);
      assert.ok(parseIntelHex(result.hex).length > 0);
      assert.ok(result.hex.includes(':00000001FF'));
      assert.ok(!hashes.has(sha(result.hex)), 'Unexpected duplicate firmware');
      assert.deepEqual(result.stages.map(s => s.stage), ['PREPARING', 'COMPILING SKETCH', 'COMPILING LIBRARIES', 'LINKING', 'GENERATING HEX', 'COMPILED']);
      hashes.add(sha(result.hex));
    } catch (failure) { error = failure.message; }
  }
  const status = error ? 'FAIL' : 'PASS';
  if (status === 'PASS') await writeFile(`reports/firmware/${lib.id}.hex`, result.hex);
  const entry = {
    id: lib.id, name: lib.name, version: lib.version, hash: lib.hash, status, example,
    sourceSha256: sha(source), hexSha256: result.ok ? sha(result.hex) : null,
    flashBytes: result.flashBytes || null, ramBytes: result.ramBytes ?? null,
    durationMs: Math.round(performance.now() - start), dependencies: lib.dependencies,
    selectedLibraries: result.stats.libraries, objects: result.stats, output: result.output, error,
  };
  report.libraries.push(entry);
  console.log(`${lib.name} ${lib.version} — ${status}${error ? '\n' + error : ` — ${result.flashBytes} flash / ${result.ramBytes} SRAM bytes`}`);
  // Checkpoint real results, including failures; never infer a pass from headers.
  await writeFile('reports/compatibility.json', JSON.stringify(report, null, 2) + '\n');
}
for (const name of ['OLED sensor display']) {
  const result = await compileUno(libraryExamples[name], { assetsBase });
  report.additional.push({ name, status: result.ok ? 'PASS' : 'FAIL', output: result.output, flashBytes: result.flashBytes, ramBytes: result.ramBytes });
  console.log(`${name} — ${result.ok ? 'PASS' : 'FAIL'}\n${result.output}`);
}
const first = await compileUno(libraryExamples['Servo sweep'], { assetsBase });
const cached = await compileUno(libraryExamples['Servo sweep'], { assetsBase });
const cachePass = first.ok && cached.ok && first.hex === cached.hex && cached.stats.cachedObjects > 0 && cached.stats.compiledObjects === 0;
report.additional.push({ name: 'Safe object-cache reuse produces identical firmware', status: cachePass ? 'PASS' : 'FAIL', output: cached.output });
console.log(`Safe object cache — ${cachePass ? 'PASS' : 'FAIL'}`);
await writeFile('reports/compatibility.json', JSON.stringify(report, null, 2) + '\n');
const rows = report.libraries.map(l => `| ${l.name} | ${l.version} | ${l.status} | ${l.flashBytes ?? '—'} | ${l.ramBytes ?? '—'} | ${l.example} |`).join('\n');
const failures = report.libraries.filter(l => l.status === 'FAIL').map(l => `### ${l.name}\n\nActual toolchain output (no substitute firmware):\n\n\`\`\`text\n${l.error}\n\`\`\`\n`).join('\n');
const md = `# Circuitera library compatibility\n\nTested: ${report.testedAt}\n\nBuild: \`${report.buildId}\`\n\n${report.scope}\n\nEvery PASS uses a real sketch, upstream library sources, the shipped AVR-GCC WebAssembly compiler/assembler/linker and objcopy. The generated ELF identifies AVR5; Intel HEX records have valid checksums and nonempty data. These are compile/link compatibility results, not a claim that every library API or library combination has been physically tested.\n\n| Library | Version | Result | Flash bytes | Static SRAM bytes | Test sketch |\n|---|---|---|---:|---:|---|\n${rows}\n\n${failures || 'No library compilation failures in this pinned test set.\n'}\n## Additional checks\n\n${report.additional.map(t => `- ${t.name}: ${t.status}`).join('\n')}\n\n## Constraints\n\n- The original package provides cc1plus, not a separate C frontend. Bundled C-compatible files (Wire twi.c and GFX glcdfont.c) are compiled through AVR C++ with C linkage, using unmodified source contents. Arbitrary C libraries are not promised.\n- The existing Uno core and avr-libc are pinned prebuilt toolchain runtime objects; all selected library translation units and the current sketch are compiled from source. Core objects are in a standard indexed archive so unused interrupt handlers are not linked.\n- IRremote and the EEPROM C++ interface compile as part of the real sketch translation unit. EEPROM additionally compiles all 12 matching upstream avr-libc 2.0.0 EEPROM assembly files; the missing runtime functions are not mocked.\n- Libraries are fetched only when selected by includes or transitive dependencies. Compiled objects have bounded in-Worker caching keyed by exact build, source/dependency hashes and flags.\n- Servo uses Timer1; IRremote receive, NewPing timer mode and tone can compete for Timer2. Pin, interrupt and timing conflicts remain real hardware constraints.\n- SSD1306 128×64 allocates another 1024 SRAM bytes at runtime. Static SRAM figures exclude heap, stack and sensor buffers.\n- LiquidCrystal_I2C is the johnrickman 1.1.2 variant, not every similarly named API.\n- Uno R3 is the default. Nano V3 new/old bootloader compile results are recorded separately in nano-compatibility.json. Upload, flash verification and Serial Monitor require a real matching board and permission from Chrome/school IT. No physical Uno or Nano is connected in this environment. Browser checks, when performed, are recorded separately in the release report; these results certify compilation and linking only.\n\nSee compatibility.json for exact outputs, hashes, dependency selections and test timings, and sketches/ for every test source. Firmware fixtures are evidence only, not shipped as compiler substitutes.\n`;
await writeFile('reports/compatibility.md', md);
if (report.libraries.some(l => l.status !== 'PASS') || report.additional.some(l => l.status !== 'PASS')) process.exitCode = 1;
