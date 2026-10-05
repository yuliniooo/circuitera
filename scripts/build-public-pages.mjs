import { build } from 'esbuild';
import { loadEnv } from 'vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { pageMetadata, publicRoutes, informationRoutes } from '../src/site/routes.js';
import { applicationSchema } from '../src/site/seo.js';

// Prerender public reading content; the proven IDE still mounts normally at root.
const bundle = '.public-render.mjs';
await build({ stdin: { contents: "export * from './src/site/PublicPages.jsx'; export { default as HomeGuide } from './src/site/HomeGuide.jsx';", resolveDir: process.cwd(), sourcefile: 'public-render.jsx' }, bundle: true, platform: 'node', format: 'esm', outfile: bundle, packages: 'external', jsx: 'automatic' });
const { PublicPage, SiteHeader, SiteFooter, HomeGuide } = await import('../' + bundle + '?t=' + Date.now());
const template = await readFile('dist/index.html', 'utf8');
const catalog = JSON.parse(await readFile('dist/avr/curated/manifest.json','utf8'));
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const origin = new URL(env.VITE_SITE_URL || 'https://circuitera.netlify.app').origin;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
try {
  for (const pathname of publicRoutes) {
    const [title, description] = pageMetadata[pathname];
    let html = template;
    if (pathname === '/') {
      const markup = renderToString(React.createElement('main', { className: 'ide-homepage', id: 'circuitera-editor' },
        React.createElement('div', { className: 'ide-static-placeholder' }, React.createElement('noscript', null,
          React.createElement('p', null, 'Circuitera’s editor requires JavaScript in Chrome. The guide below explains the browser and USB requirements.'))),
        React.createElement(HomeGuide)));
      html = html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${markup}</div>`);
    }
    if (informationRoutes.includes(pathname)) {
      const markup = renderToString(React.createElement('div', { className: 'site-shell' },
        React.createElement(SiteHeader, { path: pathname }),
        React.createElement('main', { id: 'site-main', className: 'site-page', tabIndex: -1 }, React.createElement(PublicPage, { path: pathname, catalog })),
        React.createElement(SiteFooter)));
      html = html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${markup}</div>`);
    }
    html = html.replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`);
    for (const attr of ['name="description"', 'property="og:description"', 'name="twitter:description"']) html = html.replace(new RegExp(`(<meta ${attr} content=")[^"]*`), `$1${escape(description)}`);
    for (const attr of ['property="og:title"', 'name="twitter:title"']) html = html.replace(new RegExp(`(<meta ${attr} content=")[^"]*`), `$1${escape(title)}`);
    html = html.replace(/(<link rel="canonical" href=")[^"]*/, `$1${origin}${pathname}`);
    html = html.replace(/(<meta property="og:url" content=")[^"]*/, `$1${origin}${pathname}`);
    html = html.replaceAll('https://circuitera.netlify.app/brand/', origin + '/brand/');
    const schema = JSON.stringify(applicationSchema(origin)).replaceAll('<', '\\u003c');
    html = html.replace('</head>', `    <script type="application/ld+json">${schema}</script>\n  </head>`);
    const dir = pathname === '/' ? 'dist' : 'dist' + pathname;
    await mkdir(dir, { recursive: true });
    await writeFile(dir + '/index.html', html);
  }
} finally { await rm(bundle, { force: true }); }
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicRoutes.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>\n`);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /reports/\nSitemap: ${origin}/sitemap.xml\n`);
console.log('Prepared the direct IDE, static homepage guide, factual WebApplication JSON-LD and public help pages.');
