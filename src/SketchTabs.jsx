import { useEffect, useRef, useState } from 'react';
import { Code2, Plus, X, FolderOpen, FilePlus2 } from 'lucide-react';

export default function SketchTabs({ sketches, openIds, activeId, pending, failedIds, onOpen, onClose, onNew, onBrowse, ready }) {
  const [menu, setMenu] = useState(false);
  const selected = useRef(null);
  useEffect(() => { selected.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [activeId]);
  const records = new Map(sketches.map(s => [s.id, s]));
  return <div className="sketch-tabs-group">
    <div className="sketch-tabs" role="tablist" aria-label="Open sketches">
      {openIds.map((id, index) => {
        const sketch = records.get(id); if (!sketch) return null;
        const dirty = pending.has(id) || failedIds.has(id);
        return <div key={id} className={`sketch-tab-wrap ${id === activeId ? 'selected' : ''}`} ref={id === activeId ? selected : undefined}>
          <button role="tab" aria-selected={id === activeId} aria-controls="sketch-editor-pane" tabIndex={id === activeId ? 0 : -1} title={`${sketch.name}.ino${dirty ? ' · Not yet saved' : ''}`} onClick={() => onOpen(sketch)} onKeyDown={event => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? openIds.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + openIds.length) % openIds.length;
              onOpen(records.get(openIds[next]));
            }
          }}><Code2 size={14} /><span>{sketch.name}{sketch.project ? ' / project' : '.ino'}</span>{dirty && <span className="dirty-dot" aria-label={`Unsaved changes in ${sketch.name}`} />}</button>
          <button className="close-sketch-tab" onClick={() => onClose(id)} aria-label={`Close ${sketch.name} tab`} title="Close tab; keep saved sketch · Alt+W"><X size={13} /></button>
        </div>;
      })}
    </div>
    <div className="new-tab-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false); }}>
      <button className="new-tab-button" aria-label="New or open sketch" aria-expanded={menu} onClick={() => setMenu(value => !value)} disabled={!ready} title="New or open sketch"><Plus size={17} /></button>
      {menu && <div className="tab-menu-options"><button onClick={() => { setMenu(false); onNew(); }}><FilePlus2 size={14} />New sketch</button><button onClick={() => { setMenu(false); onBrowse(); }}><FolderOpen size={14} />Open My Sketches</button></div>}
    </div>
  </div>;
}
