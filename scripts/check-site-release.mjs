import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const name = 'googleb22ad35e0875e1ed.html';
const expected = '972b00d6171c5d708d436db7ceb05a24f942744c78e898f29e678ee3fb0d8f46';
for (const dir of ['public', 'dist']) assert.equal(sha(await readFile(dir + '/' + name)), expected, 'Original Google verification bytes changed');
const protectedFiles = JSON.parse(await readFile('reports/capability-baseline.json', 'utf8'));
// Explicitly requested extensions: these are covered by new project/UI/offline
// regressions. All other baseline source, vendor, core, icons and lockfile bytes
// remain protected. Never silently refresh a baseline to accept changes.
const extendedFiles = new Set(['src/compiler.js','src/compiler.worker.js','src/autocomplete.js','src/SketchTabs.jsx','src/App.jsx','src/styles.css','src/sketchBuilds.js','src/compiler-engine.js','src/workspaceSupport.js','src/main.jsx','src/arduino-source.js','src/SerialPlotter.jsx','src/sketchStore.js','src/WorkspacePanels.jsx','src/LibrarySidebar.jsx','src/sketchZip.js','src/site/SiteApp.jsx','src/site/PublicPages.jsx','src/site/routes.js','src/site/site.css']);
for (const [file, hash] of Object.entries(protectedFiles)) {
  if (extendedFiles.has(file)) continue;
  if (file === 'public/avr/curated/manifest.json') continue; // Updated compile-test timestamps only; exact bundle hashes checked by check-release.
  assert.equal(sha(await readFile(file)), hash, 'Protected implementation changed: ' + file);
}
const dependencyText = await readFile('package-lock.json','utf8');
assert.ok(!/@supabase\//i.test(dependencyText), 'Unused authentication dependency remains');
const walk = async dir => {
  const files = [];
  for (const name of await readdir(dir)) {
    const file = dir + '/' + name;
    if ((await stat(file)).isDirectory()) files.push(...await walk(file)); else files.push(file);
  }
  return files;
};
for (const file of [...await walk('src'), ...await walk('dist/assets')]) {
  if (!/\.(jsx?|css)$/.test(file)) continue;
  assert.ok(!/supabase|AuthProvider|onAuthStateChange|signInWith|signOut\(|getSession\(|auth-config|VITE_SUPABASE|auth-session-overlay/i.test(await readFile(file,'utf8')), 'Retired authentication code in ' + file);
}
for (const path of ['auth-config.json','signin/index.html','register/index.html','forgot-password/index.html','reset-password/index.html','auth/callback/index.html','ide/index.html']) await assert.rejects(stat('dist/' + path), {code:'ENOENT'});
const headers=await readFile('dist/_headers','utf8');
assert.ok(headers.includes("connect-src 'self';"));
assert.ok(headers.includes('Permissions-Policy: serial=(self)'));
for (const file of ['index.html','about/index.html','features/index.html','how-it-works/index.html','examples/index.html']) {
  const html=await readFile('dist/' + file, 'utf8');
  assert.ok(!/noindex|Sign In|Register|Sign Out|supabase/i.test(html), file);
  assert.ok(html.includes('<base href="/"')); assert.ok(html.includes('Circuitera'));
}
const robots=await readFile('dist/robots.txt','utf8');
assert.match(robots,/Allow: \/\n/); assert.ok(!/Disallow:\s*\/\s*\n/.test(robots));
const routing=JSON.parse(await readFile('reports/site-ui-tests.json','utf8'));
assert.ok(routing.checks.length>=8 && routing.checks.every(check=>check.status==='PASS'));
for (const file of ['project-compilation.json','offline-tests.json']) {
  const evidence=JSON.parse(await readFile('reports/'+file,'utf8'));
  assert.ok(evidence.checks.length>=7&&evidence.checks.every(check=>check.status==='PASS'),file);
}
const pwa=JSON.parse(await readFile('reports/pwa-assets.json','utf8'));
for(const asset of [...pwa.shell,...pwa.compiler])if(asset.hash)assert.equal(sha(await readFile('dist'+asset.path)),asset.hash,'PWA cache manifest is stale: '+asset.path);
assert.ok(!pwa.shell.some(asset=>asset.path==='/'+name));
const appManifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));assert.equal(appManifest.start_url,'/');
const report={testedAt:new Date().toISOString(),status:'PASS',protectedFileCount:Object.keys(protectedFiles).length-extendedFiles.size,googleVerification:{path:'/'+name,sha256:expected,unchanged:true},checks:['Direct IDE and obsolete routes tested with real React/CodeMirror','No authentication modules, dependency, configuration, forms or session checks','Original IndexedDB identity retained; atomic project extension and restoration tested','WASM binaries, core, library sources and Uno uploader unchanged; board-aware worker, autocomplete and project extensions regression-tested','Google verification source and production bytes match original','Self-only connections and Web Serial permissions','Indexable homepage and static information pages']};
await writeFile('reports/capability-release.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS — instant access, protected runtime, no authentication, unchanged Google verification, indexable static pages');
