"""Verify real production HTML, crawlability and immutable runtime assets."""
from pathlib import Path
from html.parser import HTMLParser
import urllib.request, json, hashlib, concurrent.futures, datetime, os

root = Path(__file__).resolve().parent.parent
origin = 'https://circuitera.netlify.app'

class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(); self.meta={}; self.canonical=[]; self.h1=[]; self.schema=[]
        self.capture=None; self.title=''; self.feed(html)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='meta': self.meta[a.get('name',a.get('property',''))]=a.get('content','')
        if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a['href'])
        if tag in ['title','h1']: self.capture=tag; self.text=''
        if tag=='script' and a.get('type')=='application/ld+json': self.capture='schema'; self.text=''
    def handle_data(self,data):
        if self.capture: self.text+=data
    def handle_endtag(self,tag):
        if tag==self.capture or (tag=='script' and self.capture=='schema'):
            if self.capture=='title': self.title=self.text
            elif self.capture=='h1': self.h1.append(self.text)
            else: self.schema.append(json.loads(self.text))
            self.capture=None

def get(path):
    with urllib.request.urlopen(origin+path,timeout=30) as r:
        assert r.status==200,(path,r.status)
        assert 'noindex' not in r.headers.get('X-Robots-Tag','').lower()
        return r.read(),dict(r.headers),r.url

manifest=json.loads((root/'dist/avr/curated/manifest.json').read_text())
records=[manifest['core'],*manifest['variants'].values(),*manifest['libraries']]
assets=['/googleb22ad35e0875e1ed.html','/robots.txt','/sitemap.xml','/favicon.png','/sw.js','/avr/curated/manifest.json']
assets+=['/avr/'+r['file'] for r in records]
assets+=['/assets/'+p.name for p in (root/'dist/assets').glob('*') if p.suffix in ['.js','.css']]

def check_asset(path):
    data,_,url=get(path)
    assert data==(root/'dist'/path.lstrip('/')).read_bytes(),'Live/build mismatch: '+path
    if path.startswith('/google'): assert url==origin+path
    return {'path':path,'http':200,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'matchesBuild':True}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    checks=list(pool.map(check_asset,assets))

from xml.etree import ElementTree as ET
sitemap=ET.fromstring((root/'dist/sitemap.xml').read_text())
urls=[n.text for n in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
def check_page(url):
    path=url.removeprefix(origin)
    data,headers,_=get(path)
    live=Page(data.decode())
    filename=root/'dist'/path.lstrip('/')/'index.html'
    local=Page(filename.read_text())
    assert live.title==local.title
    assert live.h1==local.h1 and len(live.h1)==1
    assert live.canonical==[url]
    assert live.schema==local.schema and len(live.schema)==1
    for key in ['description','robots','og:title','og:description','og:type','og:url','og:image','twitter:card','twitter:title','twitter:description']:
        assert live.meta[key]==local.meta[key],(url,key)
    assert 'noindex' not in live.meta['robots']
    assert "connect-src 'self'" in headers.get('Content-Security-Policy','')
    assert 'serial=(self)' in headers.get('Permissions-Policy','')
    if path=='/':
        assert 'Program Arduino Directly From Your Chromebook' in data.decode()
        assert 'How to Program an Arduino From a Chromebook' in data.decode()
    return {'path':path,'http':200,'metadata':'PASS','h1':live.h1[0],'structuredData':'PASS','serialPolicy':'PASS'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    checks+=list(pool.map(check_page,urls))
report={'testedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'origin':origin,'deployId':os.environ.get('CIRCUITERA_DEPLOY_ID','not supplied'),'buildId':manifest['buildId'],'checks':checks,'physicalHardwareTested':False}
(root/'reports/seo-production.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS —',len(checks),'production checks: static pages, metadata, schema, Google verification, compiler and library assets')
