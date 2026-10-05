import { readFile, writeFile, mkdir, mkdtemp, cp, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

await import('./check-release.mjs');
await import('./check-branding.mjs');
await import('./check-site-release.mjs');
const project = process.cwd();
const output = path.resolve('..');
const staging = await mkdtemp(path.join(output, 'circuitera-release-'));
await mkdir('dist/reports', { recursive: true });
for (const file of ['nano-production-http.json', 'nano-unit-tests.txt', 'nano-compatibility.json', 'nano-validation.json', 'nano-protocol-final.txt', 'compatibility.md', 'compatibility.json', 'regressions.json', 'ui-regressions.json', 'workspace-tests.json', 'multisketch-firmware.json', 'editor-tabs.txt', 'branding-validation.json', 'site-ui-tests.json', 'capability-release.json', 'project-compilation.json', 'offline-tests.json', 'pwa-assets.json', 'capability-unit-tests.txt', 'capability-editor-tests.txt']) await cp(`reports/${file}`, `dist/reports/${file}`);
try { await cp('reports/nano-production.json', 'dist/reports/nano-production.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const file of ['seo-validation.json','seo-unit-tests.txt','seo-site-tests.txt','seo-ui-tests.txt','seo-example-tests.txt','seo-library-tests.txt','seo-nano-tests.txt','seo-production.json']) {
  try { await cp('reports/' + file, 'dist/reports/' + file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const file of ['reliability-unit-tests.txt','reliability-local-tests.txt','reliability-client-tests.txt','reliability-library-tests.txt','reliability-nano-tests.txt','reliability-ui-tests.txt','reliability-site-tests.txt','reliability-workspace-tests.txt','reliability-project-tests.txt','reliability-example-tests.txt','reliability-editor-tests.txt','reliability-offline-tests.txt','reliability-release-checks.txt','reliability-report.md','reliability-production.json']) {
  try { await cp('reports/'+file, 'dist/reports/'+file); } catch(error) { if(error.code!=='ENOENT') throw error; }
}
await cp('reports/example-access-report.md', 'dist/reports/example-access-report.md');
await cp('README.md', 'dist/RELEASE.md');
const staticName = 'circuitera-netlify.zip';
const sourceName = 'circuitera-source.zip';
execFileSync('zip', ['-qr', path.join(staging, staticName), '.'], { cwd: path.join(project, 'dist') });
execFileSync('zip', ['-qr', path.join(staging, sourceName),
  'src', 'test', 'scripts', 'public', 'vendor/libraries',
  'vendor/arduino-core',
  'vendor/sources.lock.json', 'reports', 'README.md', 'package.json', 'package-lock.json',
  'index.html', 'vite.config.js', 'netlify.toml', '-x', 'test/generated/*',
], { cwd: project });
const verification = 'googleb22ad35e0875e1ed.html';
const original = await readFile('public/' + verification);
const zipped = execFileSync('unzip', ['-p', path.join(staging, staticName), verification]);
if (!original.equals(zipped)) throw new Error('Verification ZIP bytes do not match original public file');
console.log('Verified Google verification file at exact ZIP root, unchanged.');
for (const file of [staticName, sourceName]) {
  execFileSync('unzip', ['-tq', path.join(staging, file)]);
  await rename(path.join(staging, file), path.join(output, file));
}
await cp('reports/compatibility.md', path.join(output, 'circuitera-library-compatibility.md'));
const sums = [];
for (const file of [staticName, sourceName, 'circuitera-library-compatibility.md']) {
  const bytes = await readFile(path.join(output, file));
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);
  console.log(`${file}: ${bytes.length} bytes`);
}
await writeFile(path.join(output, 'circuitera-release-sha256.txt'), sums.join('\n') + '\n');
console.log('Packaged direct-access static deployment, source release and compatibility report; no test HEX shipped.');
