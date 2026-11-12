/* Charts are drawn at the host's real pixel width after each render, so text stays legible on any screen.
   They answer the hand: move over one (or drag a finger along it) for the values, tap to hold a point, use the arrow
   keys when it has focus, click a point, bar, slice, tile or day to open what's behind it (spec.pick), and switch the
   range where one is offered (spec.ranges). Nothing here loads anything: it is all inline SVG. */
const ChartSpecs = {};
const CHART = { page: null, ranges: {}, unpin: null };   // page: the address the charts last drew in for; ranges: the last choice per chart
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
function chartHost(spec) {
  const id = 'ch-' + uid();
  ChartSpecs[id] = spec;
  const auto = spec.type === 'sankey' || spec.type === 'heatmap';
  const host = `<div class="chart-host${spec.pick ? ' pickable' : ''}" id="${id}" ${auto ? '' : `style="height:${spec.h || 220}px"`} tabindex="0" role="group" aria-label="${esc(spec.label || 'Chart')}. Use the arrow keys to read the values."></div>`;
  if (!spec.ranges) return host;
  const cur = chartRange(spec);
  return `<div class="chart-wrap"><div class="seg small chart-ranges" role="group" aria-label="Range">${spec.ranges.map(([label, n]) => `<button type="button" class="${+n === cur ? 'on' : ''}" data-chart-range="${n}" data-chart="${id}">${esc(label)}</button>`).join('')}</div>${host}</div>`;
}
/* The range a chart is showing: how many points (0 = all of them). */
function chartRange(spec) { const v = CHART.ranges[spec.rangeKey || spec.label]; return +(v ?? spec.range ?? spec.ranges[spec.ranges.length - 1][1]); }
/* The part of a chart its range shows, with indexes handed back to the page as it knows them. */
function chartView(spec) {
  if (!spec.ranges || spec.type === 'donut' || spec.type === 'sankey' || spec.type === 'treemap' || spec.type === 'heatmap') return spec;
  const n = chartRange(spec), len = spec.labels ? spec.labels.length : Math.max(0, ...spec.series.map(s => s.points.length));
  if (!n || n >= len) return spec;
  const off = spec.rangeFrom === 'start' ? 0 : len - n, cut = a => a.slice(off, off + n);
  const s = { ...spec, series: spec.series.map(x => ({ ...x, ...(x.points ? { points: cut(x.points) } : {}), ...(x.values ? { values: cut(x.values) } : {}) })) };
  if (spec.labels) s.labels = cut(spec.labels);
  if (spec.line) s.line = { ...spec.line, values: cut(spec.line.values) };
  if (spec.bands) s.bands = spec.bands.map(b => ({ ...b, lo: cut(b.lo), hi: cut(b.hi) }));
  for (const k of ['vlines', 'markers']) if (spec[k]) s[k] = spec[k].filter(v => v.i >= off && v.i < off + n).map(v => ({ ...v, i: v.i - off }));
  if (spec.tip) s.tip = i => spec.tip(i + off);
  if (spec.pick) s.pick = i => spec.pick(i + off);
  return s;
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-chart-range]'); if (!b) return;
  const spec = ChartSpecs[b.dataset.chart]; if (!spec) return;
  CHART.ranges[spec.rangeKey || spec.label] = +b.dataset.chartRange;
  for (const x of b.parentNode.children) x.classList.toggle('on', x === b);
  const host = document.getElementById(b.dataset.chart); if (host) drawChart(host, true);
});
/* A tap or click anywhere else lets go of a held point. */
document.addEventListener('pointerdown', e => { if (CHART.unpin && !e.target.closest?.('.chart-host.held')) CHART.unpin(); }, true);
function niceTicks(min, max, count = 4) {
  if (min === max) { const p = Math.abs(min) * 0.1 || 1; min -= p; max += p; }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count + 0.5) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round2(v));
  return ticks;
}
/* A chart is drawn again whenever its own width changes: Talk opening beside the page, a window resized, an iPad turned. */
const chartRO = typeof ResizeObserver === 'function' ? new ResizeObserver(debounce(() => {
  for (const host of $$('.chart-host')) if (host._w && Math.abs(host.clientWidth - host._w) > 1) drawChart(host, false);
}, 120)) : null;
function drawChart(host, fresh) {
  const full = ChartSpecs[host.id]; if (!full) return;
  const spec = chartView(full), w = Math.max(240, host.clientWidth);
  if (!host._w && chartRO) chartRO.observe(host);
  host._w = host.clientWidth;
  host.innerHTML = spec.type === 'bars' ? svgBars(spec, w) : spec.type === 'stack' ? svgStack(spec, w) : spec.type === 'sankey' ? svgSankey(spec, w) : spec.type === 'donut' ? svgDonut(spec, w) : spec.type === 'treemap' ? svgTreemap(spec, w) : spec.type === 'heatmap' ? svgHeatmap(spec, w) : svgLine(spec, w);
  host.classList.toggle('anim', !!fresh && !reduceMotion());
  host.classList.remove('hot', 'held');
  if (spec.type === 'donut') wireDonut(host, spec);
  else if (spec.type === 'sankey' || spec.type === 'treemap' || spec.type === 'heatmap') wireMarks(host, spec, w);
  else wireSeries(host, spec, w);
}
/* Charts draw themselves in once when you arrive on a page (or a Money date slide), not on every redraw after that. */
function drawCharts(root = document) {
  const fresh = CHART.page !== location.hash;
  const hosts = $$('.chart-host', root);
  for (const host of hosts) drawChart(host, fresh);
  if (hosts.length && (root === document || root.id === 'main' || root.id === 'present')) CHART.page = location.hash;
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
  for (const b of spec.bands || []) ys.push(...b.lo, ...b.hi);
  const lo = Math.min(...ys);
  const thr = spec.threshold != null && lo < spec.threshold * 4 ? spec.threshold : null;
  if (thr != null) ys.push(thr);
  if (spec.zero && lo < 0) ys.push(0);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  spec._geom = { X, Y, n, P, iw, ih, H, ys: series.map(s => s.points.map(p => Y(p.y))) };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc((spec.yFmt || moneyCompact)(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const pts0 = series[0].points;
  for (let i = 0; i < n; i += every) if (pts0[i]) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc((spec.xFmt || (x => x))(pts0[i].x))}</text>`;
  if (thr != null) g += `<line class="threshold" x1="${P.l}" x2="${P.l + iw}" y1="${Y(thr)}" y2="${Y(thr)}"/><text class="tick threshold-label" x="${P.l + iw}" y="${Y(thr) - 6}" text-anchor="end">${esc(spec.thresholdLabel || '')}</text>`;
  if (spec.zero && y0 < 0) g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  for (const b of spec.bands || []) {
    const up = b.hi.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const down = b.lo.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    g += `<path class="band" style="fill:${b.color};opacity:${b.opacity ?? 0.18}" d="${up}${down}Z"/>`;
  }
  for (const v of spec.vlines || []) g += `<line class="vline" x1="${X(v.i)}" x2="${X(v.i)}" y1="${P.t}" y2="${P.t + ih}"/><text class="tick vline-label" x="${X(v.i) + 5}" y="${P.t + 10}">${esc(v.label)}</text>`;
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    if (s.area) { const gid = 'g' + uid(); g += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.30"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient></defs><path class="area" fill="url(#${gid})" d="${d}L${X(s.points.length - 1)},${Y(Math.max(y0, 0))}L${X(0)},${Y(Math.max(y0, 0))}Z"/>`; }
    g += `<path class="line${s.dash ? ' dash' : ' draw'}" ${s.dash ? '' : 'pathLength="1"'} style="stroke:${s.color}" d="${d}"/>`;
    if (s.points.length < 30 && !s.nodots) s.points.forEach((p, i) => { g += `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="${i === s.points.length - 1 ? 3.5 : 2}" style="fill:${s.color}"/>`; });
  }
  for (let m of spec.markers || []) {
    const x = X(m.i), y = Y(m.y), right = x > P.l + iw * 0.7;
    m = { ...m, below: m.below && y + 20 < P.t + ih };
    g += `<circle class="marker" cx="${x}" cy="${y}" r="4.5"/><text class="marker-label" x="${x + (right ? -8 : 8)}" y="${y + (m.below ? 16 : -9)}" text-anchor="${right ? 'end' : 'start'}">${esc(m.label)}</text>`;
  }
  g += `<line class="guide" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="opacity:0"/>`;
  for (const s of series) g += `<circle class="hover-dot" r="5" cx="0" cy="0" style="stroke:${s.color};opacity:0"/>`;
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
  const band = iw / n, k = spec.series.length, bw = Math.max(3, Math.min(26, (band * 0.72) / k));
  const X = i => P.l + band * i + band / 2;
  spec._geom = { X, Y, n, P, iw, ih, H, band, ys: [spec.labels.map((_, i) => Y(Math.max(0, ...spec.series.map(s => s.values[i] || 0))))] };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(moneyCompact(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 46))));
  spec.labels.forEach((l, i) => { if (i % every === 0) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  g += `<rect class="guide-band" x="0" y="${P.t}" width="${band}" height="${ih}" rx="4" style="opacity:0"/>`;
  spec.series.forEach((s, j) => s.values.forEach((v, i) => {
    const x = X(i) - (bw * k) / 2 + j * bw, y = Y(Math.max(0, v)), h = Math.abs(Y(v) - Y(0));
    g += `<rect class="bar${v < 0 ? ' down' : ''}" data-g="${i}" x="${x + 0.5}" y="${y}" width="${bw - 1}" height="${Math.max(0.5, h)}" rx="${Math.min(3, (bw - 1) / 2)}" style="fill:${s.color};--i:${i}"/>`;
  }));
  g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}
/* What a chart says about one point when the page didn't write its own words. */
function defaultTip(spec, i) {
  const label = spec.labels ? spec.labels[i] : (spec.xFmt || (x => x))(spec.series[0].points[i]?.x);
  return `<strong>${esc(label ?? '')}</strong>` + spec.series.map(s => { const v = s.values ? s.values[i] : s.points[i]?.y; return v == null ? '' : `<br>${s.name ? `<i class="tip-key" style="background:${s.color}"></i>${esc(s.name)} ` : ''}${money(v, { cents: false })}`; }).join('');
}
/* Lines, bars and stacked areas: a guide follows the pointer or finger and the nearest point speaks; a tap holds it; a
   click (or the button on a held point) opens what's behind it; the arrow keys walk the points. */
function wireSeries(host, spec, W) {
  const svg = host.querySelector('svg'), tip = host.querySelector('.chart-tip'), G = spec._geom;
  if (!svg || !tip || !G) return;
  const { X, n, P, iw, band } = G;
  const guide = svg.querySelector('.guide, .guide-band'), dots = [...svg.querySelectorAll('.hover-dot')], bars = [...svg.querySelectorAll('.bar')];
  let cur = -1, held = false, touched = 0;
  const say = i => (spec.tip ? spec.tip(i) : defaultTip(spec, i));
  const at = clientX => { const r = svg.getBoundingClientRect(), x = clientX - r.left; return clamp(band ? Math.floor((x - P.l) / band) : Math.round(((x - P.l) / (iw || 1)) * (n - 1)), 0, n - 1); };
  const hide = () => {
    tip.hidden = true; held = false; cur = -1; guide.style.opacity = 0; dots.forEach(d => { d.style.opacity = 0; });
    bars.forEach(b => b.classList.remove('dim')); host.classList.remove('hot', 'held');
    if (CHART.unpin === hide) CHART.unpin = null;
  };
  const show = (i, hold) => {
    i = clamp(i, 0, n - 1);
    const html = say(i); if (!html) return;
    cur = i; held = !!hold;
    tip.innerHTML = html + (held && spec.pick ? `<button type="button" class="tip-go">${esc(spec.pickLabel || 'See what’s behind it')}</button>` : '');
    tip.hidden = false;
    const gx = X(i);
    if (band) guide.setAttribute('x', gx - band / 2); else { guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); }
    guide.style.opacity = 1;
    dots.forEach((d, k) => { const y = G.ys[k]?.[i]; if (y == null) { d.style.opacity = 0; return; } d.setAttribute('cx', gx); d.setAttribute('cy', y); d.style.opacity = 1; });
    bars.forEach(b => b.classList.toggle('dim', +b.dataset.g !== i));
    const tw = tip.offsetWidth, th = tip.offsetHeight, top = Math.min(P.t + G.ih, ...G.ys.map(a => a[i]).filter(v => v != null));
    tip.style.left = clamp(gx - tw / 2, 0, Math.max(0, W - tw)) + 'px';
    tip.style.top = Math.max(-th - 4, top - th - 14) + 'px';
    host.classList.add('hot'); host.classList.toggle('held', held);
    if (held) CHART.unpin = hide;
  };
  host.onpointermove = e => { if (e.pointerType === 'mouse' && !held) show(at(e.clientX)); };
  host.onpointerleave = e => { if (e.pointerType === 'mouse' && !held) hide(); };
  host.ontouchstart = host.ontouchmove = e => { if (e.touches[0] && !e.target.closest('.tip-go')) { touched = Date.now(); show(at(e.touches[0].clientX), true); } };
  host.onclick = e => {
    if (e.target.closest('.tip-go')) { const i = cur; hide(); return spec.pick(i); }
    if (Date.now() - touched < 700) return;   // a finger already held this point; its button opens it
    const i = at(e.clientX);
    if (spec.pick) { hide(); return spec.pick(i); }
    if (held && i === cur) hide(); else show(i, true);
  };
  host.onkeydown = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { show(cur < 0 ? n - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1), true); e.preventDefault(); }
    else if (e.key === 'Enter' && cur >= 0 && spec.pick) { const i = cur; hide(); spec.pick(i); e.preventDefault(); }
    else if (e.key === 'Escape' && cur >= 0) { hide(); e.stopPropagation(); }
  };
  host.onblur = e => { if (held && !host.contains(e.relatedTarget)) hide(); };
}

/* Stacked areas (positive series stack up, negative stack down) with an optional overlay line. */
function svgStack(spec, W) {
  const { H, P, iw, ih } = layout(spec, W);
  const n = spec.labels.length;
  if (n < 2) return `<div class="chart-empty">${esc(spec.empty || 'Not enough history yet.')}</div>`;
  const pos = new Array(n).fill(0), neg = new Array(n).fill(0), layers = [];
  for (const s of spec.series) {
    const base = [], top = [];
    s.values.forEach((v, i) => { if (v >= 0) { base.push(pos[i]); pos[i] += v; top.push(pos[i]); } else { base.push(neg[i]); neg[i] += v; top.push(neg[i]); } });
    layers.push({ s, base, top });
  }
  const ys = [...pos, ...neg, 0, ...(spec.line ? spec.line.values : [])];
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => P.l + (i / (n - 1)) * iw, Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  spec._geom = { X, Y, n, P, iw, ih, H, ys: spec.line ? [spec.line.values.map(Y)] : [pos.map(Y)] };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(moneyCompact(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  spec.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  for (const { s, base, top } of layers) {
    const up = top.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const down = base.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    g += `<path class="stack-area" style="fill:${s.color}" d="${up}${down}Z"/>`;
  }
  g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  if (spec.line) g += `<path class="line draw" pathLength="1" style="stroke:${spec.line.color}" d="${spec.line.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}"/>`;
  g += `<line class="guide" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="opacity:0"/>`;
  if (spec.line) g += `<circle class="hover-dot" r="5" cx="0" cy="0" style="stroke:${spec.line.color};opacity:0"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}

/* Sankey: left nodes → one center node → right nodes. Small nodes get a minimum label slot so text never collides. */
function svgSankey(spec, W) {
  const { total } = spec;
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'No income or spending in this period.')}</div>`;
  const merge = list => {
    const big = list.filter(n => n.saved || n.drawn || n.value / total >= 0.025), small = list.filter(n => !(n.saved || n.drawn || n.value / total >= 0.025));
    const at = big.findIndex(n => n.saved || n.drawn) >= 0 ? big.findIndex(n => n.saved || n.drawn) : big.length;
    if (small.length > 1) big.splice(at, 0, { name: `${small.length} smaller`, value: sum(small.map(n => n.value)), title: small.map(n => `${n.name} ${money(n.value, { cents: false })}`).join(', ') });
    else big.splice(at, 0, ...small);
    return big;
  };
  const left = merge(spec.left), right = merge(spec.right);
  const narrow = W < 640;
  const labelW = narrow ? 104 : 200, nodeW = 12, gap = 6, slot = 32, top = 12;
  const centerH = narrow ? 240 : 320, scale = centerH / total;
  const lay = list => { let y = 0; return list.map(n => { const h = Math.max(1.5, n.value * scale); const box = Math.max(h, slot); const o = { ...n, h, y: y + (box - h) / 2 }; y += box + gap; return o; }); };
  const L = lay(left), R = lay(right);
  const colH = l => l.length ? l[l.length - 1].y + l[l.length - 1].h + gap : 0;
  const inner = Math.max(centerH, colH(L), colH(R));
  const H = inner + top * 2;
  const off = (h) => top + (inner - h) / 2;
  const lo = off(colH(L)), ro = off(colH(R)), cY = off(centerH);
  const xL = labelW, xC = W / 2 - nodeW / 2, xR = W - labelW - nodeW;
  const fmt = v => (narrow ? moneyCompact(v) : money(v, { cents: false }));
  const trunc = n => n.length > (narrow ? 13 : 26) ? n.slice(0, narrow ? 12 : 25) + '…' : n;
  const marks = spec._marks = [];
  const mark = (n, side) => marks.push({ tip: n.title ? `<strong>${esc(n.name)}</strong><br>${esc(n.title)}` : `<strong>${esc(n.name)}</strong><br>${money(n.value, { cents: false })}, ${pct(n.value / total, 0)} of ${side === 'l' ? 'what came in' : 'the total'}`, pick: spec.pick && !n.title ? () => spec.pick(n, side) : null }) - 1;
  const band = (x1, y1, x2, y2, h1, h2, color, i) => {
    const mx = (x1 + x2) / 2;
    return `<path class="sk-band" data-i="${i}" style="fill:${color}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + h2} C${mx},${y2 + h2} ${mx},${y1 + h1} ${x1},${y1 + h1} Z"/>`;
  };
  let g = '', cy = cY;
  L.forEach((n, i) => {
    const y = lo + n.y, color = n.drawn ? 'var(--neg)' : `var(--c${(i % 8) + 1})`, m = mark(n, 'l');
    g += band(xL + nodeW, y, xC, cy, n.h, n.h, color, m);
    g += `<rect class="sk-node" data-i="${m}" x="${xL}" y="${y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${color}"/>`;
    g += `<text class="sk-label" x="${xL - 10}" y="${y + n.h / 2 - 2}" text-anchor="end">${esc(trunc(n.name))}</text><text class="sk-value num" x="${xL - 10}" y="${y + n.h / 2 + 12}" text-anchor="end">${fmt(n.value)}</text>`;
    cy += n.h;
  });
  g += `<rect class="sk-node center" x="${xC}" y="${cY}" width="${nodeW}" height="${centerH}" rx="2"/>`;
  if (!narrow) g += `<text class="sk-value" x="${xC + nodeW / 2}" y="${cY - 6}" text-anchor="middle">${money(total, { cents: false })}</text>`;
  cy = cY;
  R.forEach((n, i) => {
    const y = ro + n.y, color = n.saved ? 'var(--pos)' : `var(--c${((i + 3) % 8) + 1})`, m = mark(n, 'r');
    g += band(xC + nodeW, cy, xR, y, n.h, n.h, color, m);
    g += `<rect class="sk-node" data-i="${m}" x="${xR}" y="${y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${color}"/>`;
    g += `<text class="sk-label${n.saved ? ' saved' : ''}" x="${xR + nodeW + 10}" y="${y + n.h / 2 - 2}">${esc(trunc(n.name))}</text><text class="sk-value num" x="${xR + nodeW + 10}" y="${y + n.h / 2 + 12}" text-anchor="start">${fmt(n.value)} · ${pct(n.value / total, 0)}</text>`;
    cy += n.h;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="sankey">${g}</svg><div class="chart-tip" hidden></div>`;
}

/* Donut with a center figure. Pointing at a slice (or its row in the list beside it) puts that slice in the center. */
function svgDonut(spec, W) {
  const items = spec.items.filter(i => i.value > 0), total = sum(items.map(i => i.value));
  const H = spec.h || 220, size = Math.min(W, H), r = size / 2 - 6, inner = r * (spec.thin ? 0.78 : 0.64), cx = W / 2, cy = H / 2;
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  spec._items = items; spec._total = total;
  let a0 = -Math.PI / 2, g = '';
  const gapA = items.length > 1 ? 0.012 : 0;
  const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  items.forEach((it, k) => {
    const a = (it.value / total) * Math.PI * 2, a1 = a0 + a, s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a1 - gapA / 2), large = s1 - s0 > Math.PI ? 1 : 0;
    const path = items.length === 1
      ? `M${pt(r, -Math.PI / 2)} A${r},${r} 0 1 1 ${pt(r, Math.PI * 1.5 - 0.0001)} L${pt(inner, Math.PI * 1.5 - 0.0001)} A${inner},${inner} 0 1 0 ${pt(inner, -Math.PI / 2)} Z`
      : `M${pt(r, s0)} A${r},${r} 0 ${large} 1 ${pt(r, s1)} L${pt(inner, s1)} A${inner},${inner} 0 ${large} 0 ${pt(inner, s0)} Z`;
    g += `<path class="donut-seg" data-i="${k}" d="${path}" style="fill:${it.color};transform-origin:${cx}px ${cy}px;--i:${k}"><title>${esc(it.label)}: ${money(it.value, { cents: false })} (${pct(it.value / total, 0)})</title></path>`;
    a0 = a1;
  });
  if (spec.center) g += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-value">${esc(spec.center.value)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-label">${esc(spec.center.label)}</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
function wireDonut(host, spec) {
  const svg = host.querySelector('svg'); if (!svg) return;
  const segs = [...svg.querySelectorAll('.donut-seg')], items = spec._items, total = spec._total;
  const cv = svg.querySelector('.donut-value'), cl = svg.querySelector('.donut-label');
  const legend = host.closest('.donut-wrap, .slide-split, .panel')?.querySelector('.legend-list');
  const rows = legend ? [...legend.children].slice(0, items.length) : [];
  const short = s => (s.length > 16 ? s.slice(0, 15) + '…' : s);
  let cur = -1, touched = 0, again = false;
  const set = i => {
    cur = i;
    segs.forEach((s, k) => s.classList.toggle('on', k === i)); svg.classList.toggle('picking', i >= 0);
    rows.forEach((r, k) => r.classList.toggle('on', k === i));
    if (cv && cl && spec.center) { cv.textContent = i >= 0 ? money(items[i].value, { cents: false }) : spec.center.value; cl.textContent = i >= 0 ? `${short(items[i].label)}, ${pct(items[i].value / total, 0)}` : spec.center.label; }
  };
  const open = i => { if (spec.pick) spec.pick(items[i], i); };
  segs.forEach((s, i) => {
    s.onpointerenter = e => { if (e.pointerType === 'mouse') set(i); };
    // a second tap on the same slice opens it, on the click that follows the touch (opening on the touch itself let the same tap close the window again)
    s.ontouchstart = () => { touched = Date.now(); again = cur === i; if (!again) set(i); };
    s.onclick = () => { if (Date.now() - touched < 700) { if (again && spec.pick) open(i); return; } if (spec.pick) open(i); else set(cur === i ? -1 : i); };
  });
  svg.onpointerleave = e => { if (e.pointerType === 'mouse') set(-1); };
  rows.forEach((r, i) => {
    r.onpointerenter = e => { if (e.pointerType === 'mouse') set(i); };
    r.onpointerleave = e => { if (e.pointerType === 'mouse') set(-1); };
    if (spec.pick) { r.classList.add('pickable'); r.tabIndex = 0; r.setAttribute('role', 'button'); r.onclick = () => open(i); r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } }; }
  });
  host.onkeydown = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { set((cur + (e.key === 'ArrowRight' ? 1 : -1) + items.length + (cur < 0 && e.key === 'ArrowLeft' ? 1 : 0)) % items.length); e.preventDefault(); }
    else if (e.key === 'Enter' && cur >= 0 && spec.pick) { open(cur); e.preventDefault(); }
    else if (e.key === 'Escape' && cur >= 0) { set(-1); e.stopPropagation(); }
  };
}

/* Squarified treemap. */
function svgTreemap(spec, W) {
  const H = spec.h || 320;
  const items = spec.items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sum(items.map(i => i.value));
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  const rects = [];
  const area = items.map(i => ({ ...i, a: (i.value / total) * W * H }));
  (function squarify(list, x, y, w, h) {
    if (!list.length) return;
    if (list.length === 1) { rects.push({ ...list[0], x, y, w, h }); return; }
    const short = Math.min(w, h);
    let row = [], best = Infinity, i = 0;
    const worst = r => { const s = sum(r.map(o => o.a)), mx = Math.max(...r.map(o => o.a)), mn = Math.min(...r.map(o => o.a)); return Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn)); };
    while (i < list.length) { const next = [...row, list[i]], wv = worst(next); if (wv <= best) { row = next; best = wv; i++; } else break; }
    const s = sum(row.map(o => o.a));
    if (w >= h) { const cw = s / h; let yy = y; for (const o of row) { const ch = o.a / cw; rects.push({ ...o, x, y: yy, w: cw, h: ch }); yy += ch; } squarify(list.slice(row.length), x + cw, y, w - cw, h); }
    else { const ch = s / w; let xx = x; for (const o of row) { const cw = o.a / ch; rects.push({ ...o, x: xx, y, w: cw, h: ch }); xx += cw; } squarify(list.slice(row.length), x, y + ch, w, h - ch); }
  })(area, 0, 0, W, H);
  let g = '';
  const marks = spec._marks = [];
  for (const r of rects) {
    const big = r.w > 78 && r.h > 40, mid = r.w > 54 && r.h > 22;
    const m = marks.push({ tip: `<strong>${esc(r.label)}</strong><br>${money(r.value, { cents: false })}, ${pct(r.value / total, 0)} of the total`, pick: r.href ? () => go(r.href) : null }) - 1;
    const inner = `<rect class="tm-tile" data-i="${m}" x="${r.x + 1}" y="${r.y + 1}" width="${Math.max(0, r.w - 2)}" height="${Math.max(0, r.h - 2)}" rx="5" style="fill:${r.color}"/>` +
      (mid ? `<text class="tm-label" x="${r.x + 9}" y="${r.y + 18}">${esc(r.label.length * 7 > r.w - 14 ? r.label.slice(0, Math.max(3, Math.floor((r.w - 14) / 7) - 1)) + '…' : r.label)}</text>` : '') +
      (big ? `<text class="tm-value" x="${r.x + 9}" y="${r.y + 35}">${money(r.value, { cents: false })}</text>` : '');
    g += r.href ? `<a href="${r.href}" aria-label="${esc(r.label)}: ${money(r.value, { cents: false })}">${inner}</a>` : inner;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="treemap">${g}</svg><div class="chart-tip" hidden></div>`;
}

/* Calendar heatmap of daily spending (weeks as columns), sized to fill the width. */
function svgHeatmap(spec, W) {
  const top = 18, left = 26, gap = 3;
  const weeks = Math.max(8, Math.min(spec.weeks || 52, Math.floor((W - left) / (15 + gap)) - 1));
  const cell = Math.max(8, Math.min(22, Math.floor((W - left - 4) / (weeks + 1)) - gap));
  const end = fromISO(today());
  const start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1) - start.getDay());
  const H = top + 7 * (cell + gap);
  const vals = Object.values(spec.days).filter(v => v > 0).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75, 0.92].map(x => quantile(vals, x));
  const level = v => !v ? 0 : v <= q[0] ? 1 : v <= q[1] ? 2 : v <= q[2] ? 3 : v <= q[3] ? 4 : 5;
  let g = '', lastMonth = -1;
  const marks = spec._marks = [], DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  ['M', 'W', 'F'].forEach((l, i) => { g += `<text class="tick" x="0" y="${top + (i * 2 + 1) * (cell + gap) + cell - 2}">${l}</text>`; });
  const d = new Date(start);
  for (let w = 0; w <= weeks; w++) {
    for (let day = 0; day < 7; day++) {
      if (d > end) break;
      const iso = toISO(d), v = spec.days[iso] || 0, x = left + w * (cell + gap), y = top + day * (cell + gap);
      if (day === 0 && d.getMonth() !== lastMonth && d.getDate() <= 7) { g += `<text class="tick" x="${x}" y="11">${MON[d.getMonth()]}</text>`; lastMonth = d.getMonth(); }
      const m = marks.push({ tip: `<strong>${DOW[d.getDay()]}, ${dateLabel(iso, true)}</strong><br>${v ? money(v, { cents: false }) + ' spent' : 'Nothing spent'}`, pick: v && spec.pick ? () => spec.pick(iso) : null }) - 1;
      g += `<rect class="hm l${level(v)}" data-i="${m}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.min(4, cell / 4)}"/>`;
      d.setDate(d.getDate() + 1);
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="heatmap">${g}</svg><div class="chart-tip" hidden></div>`;
}
/* Tiles, days and bands: point at one (or tap it) and it says what it is; click, or the button on a held one, opens it. */
function wireMarks(host, spec, W) {
  const svg = host.querySelector('svg'), tip = host.querySelector('.chart-tip'), marks = spec._marks;
  if (!svg || !tip || !marks) return;
  const els = [...svg.querySelectorAll('[data-i]')];
  let cur = -1, held = false, touched = 0;
  const hide = () => { tip.hidden = true; cur = -1; held = false; els.forEach(e => e.classList.remove('on')); svg.classList.remove('picking'); host.classList.remove('hot', 'held'); if (CHART.unpin === hide) CHART.unpin = null; };
  const show = (el, hold) => {
    const i = +el.dataset.i, m = marks[i]; if (!m) return;
    cur = i; held = !!hold;
    els.forEach(e => e.classList.toggle('on', +e.dataset.i === i)); svg.classList.add('picking');
    tip.innerHTML = m.tip + (held && m.pick ? `<button type="button" class="tip-go">${esc(spec.pickLabel || 'See what’s behind it')}</button>` : '');
    tip.hidden = false;
    const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    const midY = spec.type === 'sankey' ? r.top + r.height / 2 - th / 2 : r.top - th - 8;
    tip.style.left = clamp(r.left + r.width / 2 - hr.left - tw / 2, 0, Math.max(0, W - tw)) + 'px';
    tip.style.top = Math.max(-th - 4, midY - hr.top) + 'px';
    host.classList.add('hot'); host.classList.toggle('held', held);
    if (held) CHART.unpin = hide;
  };
  host.onpointermove = e => { if (e.pointerType !== 'mouse' || held) return; const el = e.target.closest('[data-i]'); if (el) { if (+el.dataset.i !== cur) show(el); } else if (cur >= 0) hide(); };
  host.onpointerleave = e => { if (e.pointerType === 'mouse' && !held) hide(); };
  host.ontouchstart = host.ontouchmove = e => {
    if (!e.touches[0] || e.target.closest('.tip-go')) return;
    const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest?.('[data-i]');
    if (el && host.contains(el)) { touched = Date.now(); show(el, true); }
  };
  host.onclick = e => {
    if (e.target.closest('.tip-go')) { const m = marks[cur]; hide(); e.preventDefault(); return m?.pick?.(); }
    if (Date.now() - touched < 700) { e.preventDefault(); return; }   // a finger held this one; its button opens it
    const el = e.target.closest('[data-i]'); if (!el) return;
    const m = marks[+el.dataset.i];
    if (m?.pick) { e.preventDefault(); hide(); m.pick(); }
  };
  host.onkeydown = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const k = clamp(cur < 0 ? (e.key === 'ArrowRight' ? 0 : marks.length - 1) : cur + (e.key === 'ArrowRight' ? 1 : -1), 0, marks.length - 1), el = els.find(x => +x.dataset.i === k); if (el) show(el, true); e.preventDefault(); }
    else if (e.key === 'Enter' && cur >= 0 && marks[cur].pick) { const m = marks[cur]; hide(); m.pick(); e.preventDefault(); }
    else if (e.key === 'Escape' && cur >= 0) { hide(); e.stopPropagation(); }
  };
}
if (!chartRO) window.addEventListener('resize', debounce(() => { for (const host of $$('.chart-host')) drawChart(host, false); }, 150));
