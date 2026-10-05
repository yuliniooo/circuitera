import { getBoard, DEFAULT_BOARD, librariesForBoard } from './boards.js';
import { useEffect, useState } from 'react';
import { Code2, Play, BookOpen, Flag, ChevronRight, Copy, Pencil, FolderOpen, X, Cpu, Trash2, Plus, CircuitBoard } from 'lucide-react';
import LibrarySidebar from './LibrarySidebar.jsx';
import { exampleGroups, challenges } from './workspaceExamples.js';
import { StarterProjects } from './ReliabilityPanels.jsx';

export function WorkspaceSidebar({ section, onSection, name, activeId, savedSketches, pending, failedIds, onOpen, onRename, onDuplicate, onDelete, onNew, ready, libraries, libraryError, availableExamples, onExample, projectTools, pinPanel, boardId=DEFAULT_BOARD }) {
  const [challenge, setChallenge] = useState(0);
  const [query, setQuery] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [sketchQuery, setSketchQuery] = useState('');
  useEffect(() => { setEditingName(false); }, [activeId]);
  return <aside className="workspace-sidebar" aria-label="Workspace sidebar">
    <nav className="sidebar-sections" aria-label="Workspace sections">
      {[["sketch", Code2, "My Sketches"], ["examples", Play, "Examples"], ["projects", Cpu, "Projects"], ["libraries", BookOpen, "Libraries"], ["challenges", Flag, "Challenges"], ["pinout", CircuitBoard, "Pinout"]].map(([id, Icon, label]) =>
        <button key={id} className={id} aria-label={`Show ${label.toLowerCase()}`} aria-pressed={section === id} onClick={() => onSection(id)} title={label}><Icon size={17} /><span>{label}</span></button>)}
    </nav>
    {section === 'pinout' ? pinPanel : section === 'libraries' ? <LibrarySidebar boardId={boardId} libraries={libraries} error={libraryError} onExample={onExample} /> :
      <div className={`sidebar-content ${section}`}>
        <h2>{section === 'sketch' ? 'MY SKETCHES' : section.toUpperCase()} <span>{section === 'sketch' ? 'LOCAL' : section === 'challenges' ? 'OPTIONAL' : ''}</span></h2>
        {section === 'projects' && <StarterProjects availableExamples={availableExamples} onExample={onExample}/>}
        {section === 'sketch' && <>
          <div className="current-file"><Code2 size={17} /><strong>{activeId ? savedSketches.find(s=>s.id===activeId)?.project ? name : `${name}.ino` : 'No open sketch'}</strong></div>
          <div className="sketch-actions">
            <button disabled={!activeId} onClick={() => { setDraftName(name); setEditingName(true); }}><Pencil size={13} />Rename</button>
            <button disabled={!activeId} onClick={onDuplicate}><Copy size={13} />Duplicate</button>
          </div>
          {editingName && <form className="rename-form" onSubmit={event => { event.preventDefault(); if (draftName.trim()) { onRename(draftName.trim().replace(/\.ino$/i, '')); setEditingName(false); } }}>
            <input aria-label="Sketch name" value={draftName} maxLength={80} onChange={event => setDraftName(event.target.value)} autoFocus />
            <button type="submit">Rename sketch</button><button type="button" aria-label="Cancel rename" onClick={() => setEditingName(false)}><X size={14} /></button>
          </form>}
          {projectTools}
          <p className="sidebar-note">Autosaved on this device.<br />Export All for a portable ZIP backup.</p>
          <div className="sketch-list-heading"><h3>{savedSketches.length} SKETCHES</h3><button onClick={onNew} disabled={!ready} aria-label="Create local sketch"><Plus size={15} /></button></div>
          <input className="library-search" aria-label="Search My Sketches" placeholder="Find a sketch…" value={sketchQuery} onChange={event => setSketchQuery(event.target.value)} />
          <div className="saved-sketches">{savedSketches.filter(s => s.name.toLowerCase().includes(sketchQuery.toLowerCase())).map(sketch => <div className={`saved-sketch-row ${activeId === sketch.id ? 'active' : ''}`} key={sketch.id}><button onClick={() => onOpen(sketch)} aria-label={`Open ${sketch.name}`}><FolderOpen size={14} /><span>{sketch.name}{sketch.project ? ' / project' : '.ino'}</span>{(pending.has(sketch.id) || failedIds.has(sketch.id)) && <span className="dirty-dot" title="Not yet saved" />}</button><button className="delete-sketch-button" onClick={() => onDelete(sketch)} aria-label={`Delete ${sketch.name}`} title="Delete sketch"><Trash2 size={13} /></button></div>)}</div>
          <p className="sidebar-note shortcut-note">Ctrl/⌘+S saves. Alt+N creates; Alt+W closes a sketch tab. Chrome may reserve Ctrl/⌘+N and Ctrl/⌘+W for its own windows and tabs.</p>
          <div className="board-spec"><Cpu size={22} /><strong>{getBoard(boardId).shortName.toUpperCase()}</strong><span>{getBoard(boardId).mcu==='atmega328pb'?'ATmega328PB':'ATmega328P'} · 16 MHz</span><span>32 KB FLASH · 2 KB SRAM</span><small>// build something cool</small><a className="about-circuitera" href="/about/" target="_blank" rel="noopener" title="About Circuitera (opens in a new tab)">About Circuitera ↗</a></div>
        </>}
        {section === 'examples' && <>
          <input className="library-search" aria-label="Search examples" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a sketch…" />
          {Object.entries(exampleGroups).map(([group, names]) => {
            const matches = names.filter(n => availableExamples.includes(n) && n.toLowerCase().includes(query.toLowerCase()));
            return matches.length > 0 && <div key={group} className="example-group"><h3>{group}</h3>{matches.map(n => <button key={n} onClick={() => onExample(n)}><ChevronRight size={12} />{n}</button>)}</div>;
          })}
        </>}
        {section === 'challenges' && <>
          <p className="sidebar-note">Eight starting points. Go at your own pace.</p>
          {challenges.map(([title], i) => <button className={`challenge-choice ${challenge === i ? 'selected' : ''}`} key={title} onClick={() => setChallenge(i)}><span>{String(i + 1).padStart(2, '0')}</span>{title}</button>)}
          <div className="challenge-detail"><h3>LEVEL {challenge + 1}</h3><p>{challenges[challenge][2]}</p>{challenges[challenge][1] && <button onClick={() => onExample(challenges[challenge][1])}><Play size={13} />Open starting sketch</button>}<small>Test your changes on your board. These prompts do not grade your hardware.</small></div>
        </>}
      </div>}
  </aside>;
}

export function CompileSummary({ result, current, boardId=DEFAULT_BOARD }) {
  if (!result?.ok) return null;
  return <div className={`compile-summary ${!current ? 'outdated' : ''}`} aria-label="Compilation statistics">
    {[['Program storage', result.flashBytes, getBoard(boardId).flashLimit, 'flash'], ['RAM (static)', result.ramBytes, 2048, 'ram']].map(([label, used, max, cls]) => <div className={`memory-meter ${cls}`} key={cls}>
      <span>{label}<strong>{Math.round(used / max * 100)}%</strong></span><progress aria-label={label} max={max} value={used} /><small>{used.toLocaleString()} / {max.toLocaleString()} bytes</small>
    </div>)}
    <div className="compile-facts"><strong>{result.seconds.toFixed(1)} s</strong><span>{getBoard(boardId).name} / {getBoard(boardId).mcu==='atmega328pb'?'ATmega328PB':'ATmega328P'}</span><small>{current ? 'Current sketch verified' : 'Last build · source has changed'}</small></div>
  </div>;
}

export function DiagnosticsPanel({ onClose, serialSupported, serialBlocked, catalog, libraryError, compileResult, compileState, selectedPort, lastUpload, boardId=DEFAULT_BOARD }) {
  const rows = [
    ['Selected Target', getBoard(boardId).label],
    ['Bootloader / upload', `${getBoard(boardId).bootloader} · ${getBoard(boardId).baudRate} baud`],
    ['WebAssembly', typeof WebAssembly === 'object' ? '✓ Available' : 'Unavailable'],
    ['Web Serial', serialBlocked ? 'Access unavailable' : serialSupported ? '✓ Available' : 'Unavailable'],
    ['Compiler', compileResult?.ok ? '✓ Tested by last successful compile' : compileState === 'error' ? 'Last compile failed — see Output' : 'Not yet run this session'],
    ['Arduino Core', compileResult?.ok ? `✓ Linked for ${getBoard(boardId).mcu==='atmega328pb'?'ATmega328PB':'ATmega328P'}` : catalog?.core ? 'Bundled · compile to verify' : 'Catalog not loaded'],
    ['Library System', libraryError || (catalog ? `✓ ${librariesForBoard(catalog.libraries, boardId).filter(l => l.status === 'PASS').length} compile/link tested · preinstalled` : 'Loading catalog…')],
    ['Connected Board', selectedPort ? `${getBoard(boardId).shortName} target · USB port selected` : 'None'],
    ['Last Compile', compileState === 'ok' ? 'Success' : compileState === 'error' ? 'Failed' : compileState === 'running' ? 'Compiling' : 'Not run'],
    ['Firmware Size', compileResult?.ok ? `${compileResult.flashBytes} bytes · ${compileResult.ramBytes} bytes static SRAM` : '—'],
    ['Last Upload', lastUpload || 'Not run'],
  ];
  return <section className="diagnostics-screen" role="dialog" aria-label="IDE diagnostics">
    <header><h2>DIAGNOSTICS</h2><button onClick={onClose} aria-label="Close diagnostics"><X size={16} /></button></header>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <small>Build {catalog?.buildId?.slice(0, 12) || '—'} · USB selection does not identify the processor. Check that your board matches the selected target.</small>
  </section>;
}
