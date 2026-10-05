import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { publicRoutes } from '../src/site/routes.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function walk(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await walk(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
const files = await walk('dist');
assert.ok(files.length < 20000, 'Pages Free file count limit exceeded');
let largest = { path: '', bytes: 0 };
for (const path of files) {
  const { size } = await stat(path);
  assert.ok(size <= 25 * 1024 * 1024, `Pages asset exceeds 25 MiB: ${path}`);
  if (size > largest.bytes) largest = { path, bytes: size };
}
assert.ok(!files.includes('dist/404.html'), 'A root 404.html disables Pages SPA fallback');
for (const name of ['_headers', '_redirects']) {
  assert.equal(await readFile(`dist/${name}`, 'utf8'), await readFile(`public/${name}`, 'utf8'));
}
const redirects = await readFile('dist/_redirects', 'utf8');
assert.ok(!redirects.split('\n').some(line => /^\/\*\s/.test(line)), 'Catch-all rewrites intercept real assets on Pages');
const headers = await readFile('dist/_headers', 'utf8');
for (const required of ['serial=(self)', "'wasm-unsafe-eval'", "worker-src 'self' blob:", "connect-src 'self'", 'nosniff']) {
  assert.ok(headers.includes(required), `Missing required header policy: ${required}`);
}
const catalog = JSON.parse(await readFile('dist/avr/curated/manifest.json', 'utf8'));
for (const record of [catalog.core, catalog.pbCore, ...Object.values(catalog.variants || {}), ...catalog.libraries].filter(Boolean)) {
  assert.equal(hash(await readFile(`dist/avr/${record.file}`)), record.hash, `Asset hash mismatch: ${record.file}`);
}
for (const tool of ['cc1plus', 'avr-as', 'avr-ld', 'avr-objcopy']) {
  const wasm = await readFile(`dist/avr/tools/${tool}.wasm`);
  assert.deepEqual([...wasm.subarray(0, 4)], [0, 97, 115, 109]);
  assert.equal(hash(wasm), hash(await readFile(`node_modules/@horang-corp/avr-gcc-wasm/tools/${tool}.wasm`)));
  await readFile(`dist/avr/tools/${tool}.mjs`);
}
assert.ok(files.some(path => /\/compiler\.worker-.*\.js$/.test(path)), 'Missing production compiler worker');
for (const route of publicRoutes) {
  const html = await readFile(`dist${route === '/' ? '' : route}/index.html`, 'utf8');
  assert.ok(html.includes('<base href="/"'), 'Root base URL required for nested routes');
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)) {
    const path = url.split('?')[0];
    if (path === '/' || publicRoutes.includes(path)) continue;
    await stat(`dist${path}`);
  }
}
const pwa = JSON.parse(await readFile('reports/pwa-assets.json', 'utf8'));
for (const asset of [...pwa.shell, ...pwa.compiler]) {
  const bytes = await readFile(`dist${asset.path}`);
  if (asset.hash) assert.equal(hash(bytes), asset.hash, `PWA asset mismatch: ${asset.path}`);
}
for (const path of ['avr/sources/arduino-core/Arduino.h', 'avr/sources/libraries/servo/src/Servo.h', 'avr/sources/atmega328pb', 'sw.js', 'manifest.webmanifest', 'googleb22ad35e0875e1ed.html']) await stat(`dist/${path}`);
console.log(JSON.stringify({ status: 'PASS', files: files.length, largest, libraries: catalog.libraries.length, publicRoutes: publicRoutes.length, compilerAssets: pwa.compiler.length }, null, 2));
