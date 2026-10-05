import { DEFAULT_BOARD, getBoard } from './boards.js';
import { useState } from 'react';
import { BookOpen, ChevronRight, Cpu } from 'lucide-react';

export default function LibrarySidebar({ libraries, error, onExample, boardId=DEFAULT_BOARD }) {
  const [selectedId, setSelectedId] = useState('servo');
  const [query, setQuery] = useState('');
  const visible = libraries.filter(lib => [lib.name, lib.description, ...lib.examples, ...lib.headers].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  const selected = libraries.find(l => l.id === selectedId);
  const passed = libraries.filter(l => l.status === 'PASS').length;
  return (
    <aside className="library-sidebar" aria-label="Library manager">
      <div className="library-heading"><BookOpen size={15} /><h2>LIBRARIES</h2><span>{passed}/{libraries.length || '—'}</span></div>
      <input className="library-search" aria-label="Search libraries" placeholder="Search Servo, OLED, DHT…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="library-list" aria-label="Curated libraries">
        {error && <p className="library-error" role="alert">{error} Reload to try again.</p>}
        {!libraries.length && !error && <p className="library-loading">Loading catalog…</p>}
        {query && !visible.length && <p className="library-loading">No matching preinstalled library.</p>}
        {visible.map(lib => (
          <button key={lib.id} className={`library-item ${selectedId === lib.id ? 'selected' : ''}`} aria-pressed={selectedId === lib.id} onClick={() => setSelectedId(lib.id)} title={`${lib.name} ${lib.version}: ${lib.status}`}>
            <span className={`library-proof ${lib.status.toLowerCase()}`} aria-label={lib.status === 'PASS' ? 'Compile and link tested' : lib.status === 'FAIL' ? 'Not supported' : 'Not tested'}>{lib.status === 'PASS' ? '✓' : lib.status === 'FAIL' ? '!' : '·'}</span>
            <span>{lib.name}</span><ChevronRight size={12} />
          </button>
        ))}
      </div>
      {selected && <section className="library-detail" aria-label={`${selected.name} details`}>
        <div className="library-type"><Cpu size={13} />{selected.status === 'PASS' ? '✓ PREINSTALLED' : 'NOT VERIFIED'}<span>{getBoard(boardId).shortName.toUpperCase()}</span></div>
        <h3>{selected.name} <small>v{selected.version}</small></h3>
        <p>{selected.description}</p>
        <p className={`library-result ${selected.status.toLowerCase()}`}>{selected.status === 'PASS' ? '✓ Compile + link tested' : selected.status === 'FAIL' ? 'Not supported — compilation failed' : 'Not verified for this build'}</p>
        <dl><dt>Dependencies</dt><dd>{selected.dependencies.length ? selected.dependencies.map(id => libraries.find(l => l.id === id)?.name || id).join(', ') : 'None'}</dd></dl>
        {selected.test?.error && <details><summary>Actual compiler error</summary><pre>{selected.test.error}</pre></details>}
        <h4>OPEN AS NEW SKETCH</h4>
        {selected.examples.map(name => <button key={name} className="library-example" onClick={() => onExample(name)} title="OPEN AS NEW SKETCH" disabled={selected.status !== 'PASS'}><ChevronRight size={12} />{name}</button>)}
        <p className="library-footnote">Ready to use with #include.<br />Loaded only when your sketch needs it.</p>
      </section>}
    </aside>
  );
}
