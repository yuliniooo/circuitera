import { useMemo } from 'react';
import { plotWindow, downloadPlotCsv } from './plotData.js';
const colors = ['#008aa6', '#7850db', '#e37716', '#258638', '#db4763', '#2474d5', '#af8a00', '#ba55a3'];
export default function SerialPlotter({ points: allPoints, paused = false, onTogglePause, windowSeconds = 30, onWindow, timestamps = false, onTimestamps, onClear }) {
  const points = useMemo(()=>plotWindow(allPoints, windowSeconds),[allPoints,windowSeconds]);
  const series = useMemo(() => [...new Set(points.flatMap(p => Object.keys(p.values)))].slice(0, 8), [points]);
  const values = points.flatMap(p => series.map(key => p.values[key]).filter(Number.isFinite));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const padding = Math.max((maximum - minimum) * .08, Math.abs(maximum) * .01, .01);
  const low = minimum - padding, high = maximum + padding;
  const firstTime = points[0]?.timeMs, lastTime = points.at(-1)?.timeMs;
  const x = i => 64 + (Number.isFinite(firstTime) && lastTime > firstTime ? (points[i].timeMs-firstTime)/(lastTime-firstTime) : i/Math.max(points.length-1,1))*896;
  const y = value => 170 - (value - low) / (high - low) * 145;
  return <div className="serial-plotter" aria-label="Live serial plot">
    <div className="plot-controls"><button onClick={onTogglePause} aria-pressed={paused}>{paused?'Resume plot':'Pause plot'}</button><button onClick={onClear}>Clear plot</button><label>Window <select aria-label="Plot time window" value={windowSeconds} onChange={e=>onWindow?.(Number(e.target.value))}>{[5,15,30,60,120].map(s=><option key={s} value={s}>{s} s</option>)}</select></label><label><input type="checkbox" checked={timestamps} onChange={e=>onTimestamps?.(e.target.checked)}/>Plot timestamps</label><button disabled={!points.length} onClick={()=>downloadPlotCsv(points)} title="Export samples in the displayed time window">Export CSV</button></div>
    <div className="plot-legend">{series.map((name, i) => <span key={name}><i style={{ background: colors[i] }} />{name}: {points.at(-1)?.values[name] ?? '—'}</span>)}<small>{paused?'PAUSED · ':''}{points.length}/300 samples · up to {windowSeconds}s</small></div>
    {!points.length ? <div className="plot-empty">Waiting for numerical serial data.<code>23.5 &nbsp; or &nbsp; temperature:23.5 humidity:51</code><span>One sample per line · up to 8 series · latest 300 samples</span></div> :
      <svg viewBox="0 0 980 200" role="img" aria-label={`Serial plot: ${series.join(', ')}. Range ${minimum.toPrecision(3)} to ${maximum.toPrecision(3)}`} preserveAspectRatio="none">
        {[0, .5, 1].map(t => <g key={t}><line x1="64" x2="960" y1={25 + t * 145} y2={25 + t * 145} stroke="var(--border)" /><text x="54" y={29 + t * 145} textAnchor="end" fill="var(--muted)">{(high - t * (high - low)).toPrecision(3)}</text></g>)}
        {series.map((name, index) => {
          let open = false;
          const d = points.map((p, i) => { if (!Number.isFinite(p.values[name])) { open = false; return ''; } const command = open ? 'L' : 'M'; open = true; return `${command}${x(i)},${y(p.values[name])}`; }).join(' ');
          return <path key={name} d={d} stroke={colors[index]} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />;
        })}
        <text x="64" y="192" fill="var(--muted)">{timestamps&&Number.isFinite(firstTime)?new Date(firstTime).toLocaleTimeString():'Older'}</text><text x="960" y="192" textAnchor="end" fill="var(--muted)">{timestamps&&Number.isFinite(lastTime)?new Date(lastTime).toLocaleTimeString():'Latest'}</text>
      </svg>}
  </div>;
}
