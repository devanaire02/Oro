/* Charts are drawn at the host's real pixel width after each render, so text stays legible on any screen. */
const ChartSpecs = {};
function chartHost(spec) {
  const id = 'ch-' + uid();
  ChartSpecs[id] = spec;
  return `<div class="chart-host" id="${id}" style="height:${spec.h || 220}px" role="img" aria-label="${esc(spec.label || 'Chart')}"></div>`;
}
function niceTicks(min, max, count = 4) {
  if (min === max) { const p = Math.abs(min) * 0.1 || 1; min -= p; max += p; }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count + 0.5) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round2(v));
  return ticks;
}
function drawCharts(root = document) {
  for (const host of $$('.chart-host', root)) {
    const spec = ChartSpecs[host.id]; if (!spec) continue;
    const w = Math.max(240, host.clientWidth);
    host.innerHTML = spec.type === 'bars' ? svgBars(spec, w) : svgLine(spec, w);
    wireTooltip(host, spec, w);
  }
}
function layout(spec, W) {
  const H = spec.h || 220, P = { l: spec.padL ?? 58, r: 14, t: 14, b: 28 };
  return { H, P, iw: W - P.l - P.r, ih: H - P.t - P.b };
}
function svgLine(spec, W) {
  const { H, P, iw, ih } = layout(spec, W);
  const series = spec.series.filter(s => s.points.length);
  if (!series.length) return `<div class="chart-empty">${esc(spec.empty || 'Not enough history yet.')}</div>`;
  const n = Math.max(...series.map(s => s.points.length));
  let ys = series.flatMap(s => s.points.map(p => p.y));
  const lo = Math.min(...ys);
  const thr = spec.threshold != null && lo < spec.threshold * 4 ? spec.threshold : null;
  if (thr != null) ys.push(thr);
  if (spec.zero && lo < 0) ys.push(0);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  spec._geom = { X, Y, n, P, iw, ih, H };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc((spec.yFmt || moneyCompact)(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const pts0 = series[0].points;
  for (let i = 0; i < n; i += every) if (pts0[i]) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc((spec.xFmt || (x => x))(pts0[i].x))}</text>`;
  if (thr != null) g += `<line class="threshold" x1="${P.l}" x2="${P.l + iw}" y1="${Y(thr)}" y2="${Y(thr)}"/><text class="tick threshold-label" x="${P.l + iw}" y="${Y(thr) - 6}" text-anchor="end">${esc(spec.thresholdLabel || '')}</text>`;
  if (spec.zero && y0 < 0) g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    if (s.area) g += `<path class="area" style="fill:${s.color}" d="${d}L${X(s.points.length - 1)},${Y(Math.max(y0, 0))}L${X(0)},${Y(Math.max(y0, 0))}Z"/>`;
    g += `<path class="line${s.dash ? ' dash' : ''}" style="stroke:${s.color}" d="${d}"/>`;
    if (s.points.length < 30) s.points.forEach((p, i) => { g += `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="${i === s.points.length - 1 ? 3.5 : 2}" style="fill:${s.color}"/>`; });
  }
  for (let m of spec.markers || []) {
    const x = X(m.i), y = Y(m.y), right = x > P.l + iw * 0.7;
    m = { ...m, below: m.below && y + 20 < P.t + ih };
    g += `<circle class="marker" cx="${x}" cy="${y}" r="4.5"/><text class="marker-label" x="${x + (right ? -8 : 8)}" y="${y + (m.below ? 16 : -9)}" text-anchor="${right ? 'end' : 'start'}">${esc(m.label)}</text>`;
  }
  g += `<line class="guide" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="opacity:0"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}
function svgBars(spec, W) {
  const { H, P, iw, ih } = layout(spec, W);
  const n = spec.labels.length;
  if (!n) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  const all = spec.series.flatMap(s => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const band = iw / n, k = spec.series.length, bw = Math.max(3, Math.min(22, (band * 0.72) / k));
  const X = i => P.l + band * i + band / 2;
  spec._geom = { X, Y, n, P, iw, ih, H, band };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(moneyCompact(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 46))));
  spec.labels.forEach((l, i) => { if (i % every === 0) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  spec.series.forEach((s, j) => s.values.forEach((v, i) => {
    const x = X(i) - (bw * k) / 2 + j * bw, y = Y(Math.max(0, v)), h = Math.abs(Y(v) - Y(0));
    g += `<rect class="bar" x="${x + 0.5}" y="${y}" width="${bw - 1}" height="${Math.max(0.5, h)}" rx="1.5" style="fill:${s.color}"/>`;
  }));
  g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  g += `<rect class="guide-band" x="0" y="${P.t}" width="${band}" height="${ih}" style="opacity:0"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}
function wireTooltip(host, spec, W) {
  const svg = host.querySelector('svg'), tip = host.querySelector('.chart-tip');
  if (!svg || !tip || !spec.tip || !spec._geom) return;
  const { X, n, P, iw, band } = spec._geom;
  const guide = svg.querySelector('.guide, .guide-band');
  const show = clientX => {
    const r = svg.getBoundingClientRect(), x = clientX - r.left;
    let i = band ? Math.floor((x - P.l) / band) : Math.round(((x - P.l) / (iw || 1)) * (n - 1));
    i = clamp(i, 0, n - 1);
    const html = spec.tip(i); if (!html) return;
    tip.innerHTML = html; tip.hidden = false;
    const gx = X(i);
    if (band) { guide.setAttribute('x', gx - band / 2); } else { guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); }
    guide.style.opacity = 1;
    const tw = tip.offsetWidth;
    tip.style.left = clamp(gx - tw / 2, 0, W - tw) + 'px';
    tip.style.top = '0px';
  };
  const hide = () => { tip.hidden = true; guide.style.opacity = 0; };
  host.onmousemove = e => show(e.clientX);
  host.onmouseleave = hide;
  host.ontouchstart = host.ontouchmove = e => { if (e.touches[0]) show(e.touches[0].clientX); };
  host.ontouchend = () => setTimeout(hide, 1600);
}
window.addEventListener('resize', debounce(() => drawCharts(), 150));
