// Generated release-specific cache. Never force activation during a compile/upload.
const RELEASE = __RELEASE__;
const SHELL = __SHELL__;
const COMPILER = __COMPILER__;
const ROUTES = __ROUTES__;
const CACHE = 'circuitera-static-' + RELEASE;
const ALL = new Map([...SHELL,...COMPILER].map(asset=>[asset.path,asset]));
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function checkedFetch(asset) {
  const response=await fetch(asset.path,{cache:'no-cache'});
  if(!response.ok)throw new Error(`Offline asset failed (${response.status}): ${asset.path}`);
  if(asset.hash){if(await sha(await response.clone().arrayBuffer())!==asset.hash)throw new Error('Offline asset checksum mismatch: '+asset.path);}
  else if(asset.path.endsWith('.html')&&!(await response.clone().text()).includes(`name="circuitera-release" content="${RELEASE}"`))throw new Error('The site updated during download. Reopen Circuitera and try again.');
  return response;
}
async function cacheAsset(cache,asset) {
  if(await cache.match(asset.path))return;
  const response=await checkedFetch(asset);await cache.put(asset.path,response);
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Atomically install a complete shell. Compiler downloads are optional.
  for(const asset of SHELL)await cacheAsset(cache,asset);
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Activation happens only after the previous worker's clients close.
  for(const key of await caches.keys())if(key.startsWith('circuitera-static-')&&key!==CACHE)await caches.delete(key);
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  // Verification HTML, robots and sitemap deliberately use ordinary network serving.
  const path=request.mode==='navigate'&&ROUTES[url.pathname.replace(/\/+$/,'')||'/'] || url.pathname;
  const asset=ALL.get(path);if(!asset)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(path);
    if(cached)return cached;
    try{const response=await checkedFetch(asset);try{await cache.put(path,response.clone());}catch{}return response;}
    catch(error){return new Response(`Circuitera could not load ${path}. ${error.message}. Connect to the internet and prepare offline assets.`,{status:503,headers:{'Content-Type':'text/plain'}});}
  })());
});
async function status() {
  const cache=await caches.open(CACHE);
  let shell=0,compiler=0;
  for(const asset of SHELL)if(await cache.match(asset.path))shell++;
  for(const asset of COMPILER)if(await cache.match(asset.path))compiler++;
  return {release:RELEASE,shellReady:shell===SHELL.length,compilerReady:compiler===COMPILER.length,compilerCached:compiler,compilerTotal:COMPILER.length};
}
let preparing;
self.addEventListener('message',event=>{
  const reply=event.ports?.[0];if(!reply||!['STATUS','PREPARE_COMPILER'].includes(event.data?.type))return;
  event.waitUntil((async()=>{
    try{
      if(event.data.type==='PREPARE_COMPILER'){
        if(!preparing)preparing=(async()=>{const cache=await caches.open(CACHE);for(const [i,asset]of COMPILER.entries()){await cacheAsset(cache,asset);reply.postMessage({progress:i+1,total:COMPILER.length,path:asset.path});}})().finally(()=>{preparing=null;});
        await preparing;
      }
      reply.postMessage({done:true,...await status()});
    }catch(error){reply.postMessage({done:true,error:error.message,...await status()});}
  })());
});
