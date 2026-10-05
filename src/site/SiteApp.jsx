import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import IDE from '../App.jsx';
import { PublicPage, SiteHeader, SiteFooter } from './PublicPages.jsx';
import { normalizePath, pageMetadata, routeHref } from './routes.js';
import './site.css';
import HomeGuide from './HomeGuide.jsx';
import './home-guide.css';

function Metadata({ path }) {
  useEffect(() => {
    const [title, description] = pageMetadata[path];
    document.title = title;
    for (const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']) document.querySelector(selector)?.setAttribute('content', description);
    for (const selector of ['meta[property="og:title"]','meta[name="twitter:title"]']) document.querySelector(selector)?.setAttribute('content', title);
    const canonical = document.querySelector('link[rel="canonical"]');
    const origin = canonical ? new URL(canonical.href).origin : window.location.origin;
    canonical?.setAttribute('href', origin + path);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', origin + path);
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'index,follow');
  }, [path]);
  return null;
}

export default function SiteApp() {
  const [href, setHref] = useState(() => routeHref(location.href, location.origin));
  const currentHref = useRef(href);
  const leaveGuard = useRef(null);
  const navigating = useRef(false);
  const [notice, setNotice] = useState('');
  const url = new URL(href, window.location.origin), path = normalizePath(url.pathname);
  const registerLeaveGuard = useCallback(fn => { leaveGuard.current = fn; return () => { if (leaveGuard.current === fn) leaveGuard.current = null; }; }, []);
  const navigate = useCallback(async (target, { replace = false, pop = false } = {}) => {
    const next = new URL(target, window.location.origin);
    if (next.origin !== window.location.origin || navigating.current) return false;
    const dest = routeHref(next.href, window.location.origin);
    if (dest === currentHref.current) {
      if (location.pathname + location.search + location.hash !== dest) history.replaceState({}, '', dest);
      return true;
    }
    navigating.current = true;
    try {
      if (leaveGuard.current) await leaveGuard.current();
      setNotice('');
      if (!pop) history[replace ? 'replaceState' : 'pushState']({}, '', dest);
      else if (location.pathname + location.search + location.hash !== dest) history.replaceState({}, '', dest);
      currentHref.current = dest; setHref(dest);
      window.scrollTo(0, 0);
      return true;
    } catch (error) {
      setNotice(error.message);
      if (pop) history.pushState({}, '', currentHref.current);
      return false;
    } finally { navigating.current = false; }
  }, []);
  useEffect(() => {
    if (location.pathname + location.search + location.hash !== currentHref.current) history.replaceState({}, '', currentHref.current);
    const click = event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[data-route]');
      if (!link || link.target || link.hasAttribute('download')) return;
      event.preventDefault(); void navigate(link.href);
    };
    const pop = () => { void navigate(location.href, { pop: true }); };
    document.addEventListener('click', click); window.addEventListener('popstate', pop);
    return () => { document.removeEventListener('click', click); window.removeEventListener('popstate', pop); };
  }, [navigate]);
  useEffect(() => {
    if (path !== '/') document.documentElement.dataset.theme = 'light';
    document.querySelector('#site-main')?.focus({ preventScroll: true });
  }, [path]);
  const consumeExample = useCallback(() => {
    history.replaceState({}, '', '/'); currentHref.current = '/'; setHref('/');
  }, []);
  const banner = notice && <div className="site-notice" role="alert">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>;
  const links = <nav className="ide-help-links" aria-label="Circuitera information"><a href="/about" data-route>About</a><a href="/features" data-route>Features</a><a href="/getting-started" data-route>Help</a></nav>;
  if (path === '/') return <><Metadata path={path} />{banner}<main className="ide-homepage" id="circuitera-editor"><IDE siteControls={links} registerLeaveGuard={registerLeaveGuard} initialExample={url.searchParams.get('example') || ''} onExampleOpened={consumeExample} /><HomeGuide /></main></>;
  return <div className="site-shell"><Metadata path={path} /><a className="site-skip" href="#site-main">Skip to content</a><SiteHeader path={path} />{banner}<main id="site-main" tabIndex={-1} className="site-page" key={path}><PublicPage path={path} /></main><SiteFooter /></div>;
}
