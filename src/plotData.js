export function plotWindow(points, seconds = 30) {
  if (!points.length) return [];
  const latest=points.at(-1).timeMs;
  if (!Number.isFinite(latest)) return points;
  return points.filter(p=>Number.isFinite(p.timeMs)&&p.timeMs>=latest-seconds*1000);
}
export function plotCsv(points) {
  const names=[...new Set(points.flatMap(p=>Object.keys(p.values)))].slice(0,8);
  const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
  const lines=[['timestamp_ms','timestamp',...names].map(quote).join(',')];
  for(const point of points)lines.push([Number.isFinite(point.timeMs)?point.timeMs:'',Number.isFinite(point.timeMs)?quote(new Date(point.timeMs).toISOString()):'',...names.map(n=>Number.isFinite(point.values[n])?point.values[n]:'')].join(','));
  return lines.join('\r\n')+'\r\n';
}
export function downloadPlotCsv(points) {
  const url=URL.createObjectURL(new Blob([plotCsv(points)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='circuitera-serial.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
