from pathlib import Path
import urllib.request,json,hashlib,concurrent.futures,time
root=Path(__file__).resolve().parent.parent
origin='https://circuitera.netlify.app'
manifest=json.loads((root/'dist/avr/curated/manifest.json').read_text())
paths=['googleb22ad35e0875e1ed.html','robots.txt','sitemap.xml','favicon.png','sw.js','avr/curated/manifest.json','avr/'+manifest['variants']['eightanaloginputs']['file']]+['assets/'+p.name for p in (root/'dist/assets').glob('*.js')]
def check(file):
 with urllib.request.urlopen(origin+'/'+file,timeout=30) as response:
  data=response.read(); local=(root/'dist'/file).read_bytes()
  assert response.status==200,file
  assert data==local,'Live/local byte mismatch: '+file
  assert 'noindex' not in response.headers.get('X-Robots-Tag','').lower()
  if file.startswith('google'): assert response.url==origin+'/'+file
  return {'path':'/'+file,'http':response.status,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'matchesProductionBuild':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: checks=list(pool.map(check,paths))
with urllib.request.urlopen(origin,timeout=30) as response:
 html=response.read().decode()
 for part in ['Circuitera – Arduino IDE for Chromebook','Arduino Uno and Nano IDE','rel="canonical"','og:title']:
  assert part in html,part
 assert 'noindex' not in html.lower()
 assert "connect-src 'self'" in response.headers.get('Content-Security-Policy','')
 assert 'serial=(self)' in response.headers.get('Permissions-Policy','')
 checks.append({'path':'/','http':200,'seoAndSerialPolicy':'PASS'})
(root/'reports/nano-production-http.json').write_text(json.dumps({'origin':origin,'deployId':'6a9cafe7f05889f617937e98','buildId':manifest['buildId'],'checks':checks,'physicalHardwareTested':False},indent=2)+'\n')
print('PASS —',len(checks),'production HTTP/byte checks including Nano variant, Worker, manifest, Google verification, SEO, and serial policy')
