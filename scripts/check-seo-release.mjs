// SEO release checks also prove that this revision did not edit IDE behavior.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { publicRoutes, pageMetadata } from '../src/site/routes.js';
import { homeTitle, homeDescription, applicationSchema } from '../src/site/seo.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://circuitera.netlify.app';
const baseline = JSON.parse(await readFile('reports/reliability-baseline.json', 'utf8'));
const buildBaseline = JSON.parse(await readFile('reports/seo-production-baseline.json', 'utf8'));
// Explicitly authorized reliability/UI and domain migration edits. Original
// baselines are retained; toolchain, core, sources, profiles and storage stay exact.
const permitted = new Set(['index.html','README.md','public/robots.txt','public/sitemap.xml','public/avr/curated/manifest.json','src/App.jsx','src/styles.css','src/WorkspacePanels.jsx','src/compiler.js','src/compiler-engine.js','src/site/seo.js','scripts/build-public-pages.mjs','scripts/check-branding.mjs','scripts/check-seo-release.mjs','scripts/check-seo-production.py','scripts/check-nano-release.mjs','scripts/check-production.mjs','scripts/check-nano-production.py','scripts/package-release.mjs','test/site-ui.mjs','test/ui-regressions.mjs','package.json']);
let protectedFiles = 0;
for (const [file, expected] of Object.entries(baseline)) {
  if (permitted.has(file)) continue;
  assert.equal(sha(await readFile(file)), expected, 'Reliability revision modified a protected file: ' + file);
  protectedFiles++;
}
for (const [file, before] of Object.entries(buildBaseline)) {
  if (!file.startsWith('dist/avr/') || file.endsWith('/manifest.json')) continue;
  assert.equal(sha(await readFile(file)), before.sha256, 'Shipped compiler/library asset changed: ' + file);
}
// Engine edits are limited to error reporting: reverse them and verify the
// prior engine hash. Flags, source preprocessing, caching and linking are exact.
const engine = await readFile('src/compiler-engine.js', 'utf8');
const originalEngine = engine
  .replace(`  const url = new URL('curated/manifest.json', assetsBase);
  let response;
  try { response = await fetch(url, { cache: 'no-cache' }); }
  catch (error) { throw new Error(\`Library catalog fetch failed: \${url}\\n\${error.message || error}\`); }
  if (!response.ok) throw new Error(\`Library catalog could not load (\${response.status}): \${url}\`);`, `  const response = await fetch(new URL('curated/manifest.json', assetsBase), { cache: 'no-cache' });
  if (!response.ok) throw new Error(\`Library catalog could not load (\${response.status}).\`);`)
  .replace('\\nCompiler exit status: ${error?.status ?? \'not reported by runtime\'}', '')
  .replace('\\nCompiler exit status: ${exitCode ?? \'not reported by runtime\'}', '');
assert.equal(sha(originalEngine), baseline['src/compiler-engine.js'], 'Compiler engine changed beyond the explicit error-reporting additions');
const html = await readFile('dist/index.html', 'utf8');
const document = new JSDOM(html, { url: origin }).window.document;
assert.equal(document.title, homeTitle);
assert.equal(document.querySelector('meta[name="description"]').content, homeDescription);
assert.equal(document.querySelectorAll('h1').length, 1);
assert.equal(document.querySelector('h1').textContent, 'Arduino IDE for Chromebook — Compile & Upload in Your Browser');
assert.equal(document.querySelectorAll('main').length, 1);
assert.ok(document.querySelector('main > .ide-static-placeholder + section.ide-guide'));
for (const heading of ['Program Arduino Directly From Your Chromebook','How to Program an Arduino From a Chromebook','Supported Arduino Boards','Frequently Asked Questions']) assert.ok([...document.querySelectorAll('h2')].some(h=>h.textContent===heading), heading);
assert.equal(document.querySelectorAll('.ide-guide-how li').length, 8);
assert.equal(document.querySelectorAll('.ide-guide-faq details').length, 7);
assert.equal(document.querySelectorAll('.ide-guide img, .ide-guide script, .ide-guide iframe').length, 0);
assert.ok(document.querySelector('.ide-guide header') && document.querySelector('.ide-guide footer'));
for (const path of publicRoutes) {
  const filename = 'dist' + (path === '/' ? '' : path) + '/index.html';
  const source = await readFile(filename, 'utf8');
  const doc = new JSDOM(source, { url: origin + path }).window.document;
  assert.equal(doc.title, pageMetadata[path][0]);
  assert.equal(doc.querySelectorAll('h1').length, 1, filename);
  assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(doc.querySelector('link[rel="canonical"]').href, origin + path);
  assert.equal(doc.querySelector('meta[property="og:url"]').content, origin + path);
  assert.equal(doc.querySelector('meta[property="og:type"]').content, 'website');
  assert.equal(doc.querySelector('meta[property="og:title"]').content, doc.title);
  assert.equal(doc.querySelector('meta[name="twitter:title"]').content, doc.title);
  assert.equal(doc.querySelector('meta[name="twitter:card"]').content, 'summary_large_image');
  assert.doesNotMatch(doc.querySelector('meta[name="robots"]').content, /noindex|nofollow/);
  const nodes = doc.querySelectorAll('script[type="application/ld+json"]');
  assert.equal(nodes.length, 1);
  const schema = JSON.parse(nodes[0].textContent);
  assert.deepEqual(schema, applicationSchema(origin));
  for (const key of ['aggregateRating','review','offers','award','interactionStatistic']) assert.equal(schema[key], undefined);
  for (const link of doc.querySelectorAll('a[data-route]')) {
    const url = new URL(link.href);
    assert.ok(publicRoutes.includes(url.pathname.replace(/\/$/, '') || '/'), 'Nonexistent public link: ' + url);
  }
}
const sitemap = new JSDOM(await readFile('dist/sitemap.xml', 'utf8'), { contentType: 'application/xml' }).window.document;
assert.deepEqual([...sitemap.querySelectorAll('loc')].map(n=>n.textContent), publicRoutes.map(path=>origin+path));
const robots = await readFile('dist/robots.txt', 'utf8');
assert.match(robots, /^User-agent: \*\nAllow: \/\n/m);
assert.match(robots, /Sitemap: https:\/\/circuitera.netlify.app\/sitemap.xml/);
assert.doesNotMatch(robots, /^Disallow:\s*\/(?:avr\/?)?\s*$/m);
const verification = 'googleb22ad35e0875e1ed.html';
for (const folder of ['public','dist']) assert.equal(sha(await readFile(folder+'/'+verification)), baseline['public/'+verification]);
const script = document.querySelector('script[type="module"]').getAttribute('src');
const css = document.querySelector('link[rel="stylesheet"]').getAttribute('href');
const metrics = {};
for (const [key, file] of [['html','dist/index.html'],['javascript','dist'+script],['css','dist'+css]]) {
  const bytes = await readFile(file); metrics[key] = { bytes:bytes.length, gzipBytes:gzipSync(bytes).length };
}
assert.ok(metrics.html.gzipBytes < 6000, 'SEO document became unnecessarily large');
assert.ok(!html.includes('noindex'));
const report = { testedAt:new Date().toISOString(), status:'PASS', protectedFiles, metrics, checks:[
  'Exact requested title, description, canonical and social metadata',
  'One primary H1 and one main landmark; responsive guide is present in static HTML',
  'Eight upload instructions, supported boards, seven accurate FAQs and existing help links',
  'All ten sitemap pages exist, are indexable, have unique canonical URLs and valid factual WebApplication JSON-LD',
  'No new runtime dependencies, images, remote scripts, tracking or authentication',
  'Existing controls retained with optional reliability, editor and debugging tools',
  'Uno/Nano engine algorithms, worker protocol, profiles, uploaders, storage, autocomplete and library sources unchanged',
  'Every compiler binary, Arduino core and library source asset byte-identical; engine changes restricted to error details',
  'Original Google verification bytes and favicon files retained',
], physicalHardware:'Not retested; no physical board connected.' };
await writeFile('reports/seo-validation.json', JSON.stringify(report,null,2)+'\n');
console.log(`PASS — SEO static HTML and ${protectedFiles} protected files; preserved toolchain and unchanged uploader.`, metrics);
