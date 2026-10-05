import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin='https://circuitera.netlify.app';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const checks=[];
async function get(path) {
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,path);
  assert.ok(!/noindex/i.test(response.headers.get('x-robots-tag')||''),path);
  return {response,bytes:Buffer.from(await response.arrayBuffer())};
}
for (const path of ['/','/about','/features','/how-it-works','/examples']) {
  const {response,bytes}=await get(path); const html=bytes.toString();
  assert.ok(!/noindex|Sign In|Register|supabase/i.test(html));
  assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`));
  const csp=response.headers.get('content-security-policy');assert.ok(csp?.includes("connect-src 'self';"));
  assert.ok(response.headers.get('permissions-policy')?.includes('serial=(self)'));
  checks.push({path,status:'PASS',http:200,url:response.url});
}
for (const path of ['/signin','/register','/forgot-password','/reset-password','/auth/callback','/ide']) {
  const {response}=await get(path);assert.equal(response.url,origin+'/');
  checks.push({path,status:'PASS',redirect:response.url});
}
for (const file of ['googleb22ad35e0875e1ed.html','robots.txt','sitemap.xml','favicon.png','avr/curated/manifest.json',...(await readdir('dist/assets')).filter(n=>n.endsWith('.js')).map(n=>'assets/'+n)]) {
  const {response,bytes}=await get('/'+file);const local=await readFile('dist/'+file);
  assert.ok(bytes.equals(local),'Live file mismatch: '+file);
  if (file.startsWith('google')) assert.equal(response.url,origin+'/'+file,'Verification file must not redirect');
  checks.push({path:'/'+file,status:'PASS',http:200,bytes:bytes.length,sha256:sha(bytes),matchesProductionBuild:true});
}
const report={testedAt:new Date().toISOString(),origin,httpChecks:checks,physicalUnoConnected:false};
await writeFile('reports/instant-access-production.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS — ${checks.length} live checks: direct routes, retired URL redirects, exact Google file, SEO, favicon and deployed worker/application assets.`);
