// Production metadata and brand invariants. Does not execute or modify firmware.
import assert from 'node:assert/strict';
import { publicRoutes } from '../src/site/routes.js';
import { homeTitle, homeDescription } from '../src/site/seo.js';
import { JSDOM } from 'jsdom';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const read = file => readFile('dist/' + file, 'utf8');
const html = await read('index.html');
const origin = 'https://circuitera.netlify.app';
const homeDocument = new JSDOM(html).window.document;
assert.equal(homeDocument.title, homeTitle);
assert.equal(homeDocument.querySelector('meta[name="description"]').content, homeDescription);
for (const pathname of publicRoutes) {
  const page = pathname === '/' ? html : await read(pathname.slice(1) + '/index.html');
  assert.ok(page.includes(`rel="canonical" href="${origin}${pathname}"`));
  for (const tag of ['og:title','og:description','og:image','og:url','twitter:card','twitter:title','twitter:description','twitter:image']) assert.ok(page.includes(`"${tag}"`), tag);
  assert.ok(page.includes('/favicon.png?v=circuitera-1'));
  assert.ok(page.includes('/favicon.svg?v=circuitera-1'));
  assert.ok(!/Uno Web IDE/i.test(page));
}
assert.ok(html.includes('Circuitera is an independent project and is not affiliated with Arduino. Arduino is a trademark of Arduino SA.'));
assert.ok((await read('robots.txt')).includes(`${origin}/sitemap.xml`));
const sitemap = await read('sitemap.xml');
for (const pathname of publicRoutes) assert.ok(sitemap.includes(`<loc>${origin}${pathname}</loc>`));
for (const asset of ['favicon.png','favicon-16.png','favicon-32.png','favicon-192.png','apple-touch-icon.png','brand/circuitera-favicon-source-512.png','brand/circuitera-social.png','brand/circuitera-wordmark-light.png','brand/circuitera-wordmark-dark.png']) {
  const bytes = await readFile('dist/' + asset); assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
}
for (const [asset,width,height] of [['favicon-16.png',16,16],['favicon.png',32,32],['brand/circuitera-favicon-source-512.png',512,512],['brand/circuitera-social.png',1200,630]]) {
  const bytes = await readFile('dist/'+asset); assert.equal(bytes.readUInt32BE(16),width); assert.equal(bytes.readUInt32BE(20),height);
}
for (const name of await readdir('dist/assets')) if (name.endsWith('.js')) assert.ok(!/Uno Web IDE|UNO WEB IDE/.test(await read('assets/' + name)), 'Old visible branding in ' + name);
// Internal names are intentionally stable: rebranding must not orphan local work.
const store = await readFile('src/sketchStore.js','utf8');
assert.ok(store.includes("DATABASE_NAME = 'uno-web-ide'"));
const result = { testedAt: new Date().toISOString(), status: 'PASS', checks: ['Exact title and description', 'Canonical and social tags on IDE and About', 'Robots and sitemap use current production origin', 'PNG signatures and favicon/social dimensions', 'No old visible brand in production UI or worker', 'Independent-project notice', 'Original IndexedDB identity retained'] };
await writeFile('reports/branding-validation.json',JSON.stringify(result,null,2));
console.log('PASS — Circuitera production branding, metadata, favicon assets, and stable storage identity');
