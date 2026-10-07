/* Charts are drawn at the host's real pixel width after each render, so text stays legible on any screen. */
const ChartSpecs = {};
function chartHost(spec) {
  const id = 'ch-' + uid();
  ChartSpecs[id] = spec;
  const auto = spec.type === 'sankey' || spec.type === 'heatmap';
  return `<div class="chart-host" id="${id}" ${auto ? '' : `style="height:${spec.h || 220}px"`} role="img" aria-label="${esc(spec.label || 'Chart')}"></div>`;
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
    host.innerHTML = spec.type === 'bars' ? svgBars(spec, w) : spec.type === 'stack' ? svgStack(spec, w) : spec.type === 'sankey' ? svgSankey(spec, w) : spec.type === 'donut' ? svgDonut(spec, w) : spec.type === 'treemap' ? svgTreemap(spec, w) : spec.type === 'heatmap' ? svgHeatmap(spec, w) : svgLine(spec, w);
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
  for (const b of spec.bands || []) ys.push(...b.lo, ...b.hi);
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
  for (const b of spec.bands || []) {
    const up = b.hi.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const down = b.lo.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    g += `<path class="band" style="fill:${b.color};opacity:${b.opacity ?? 0.18}" d="${up}${down}Z"/>`;
  }
  for (const v of spec.vlines || []) g += `<line class="vline" x1="${X(v.i)}" x2="${X(v.i)}" y1="${P.t}" y2="${P.t + ih}"/><text class="tick vline-label" x="${X(v.i) + 5}" y="${P.t + 10}">${esc(v.label)}</text>`;
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    if (s.area) { const gid = 'g' + uid(); g += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.30"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient></defs><path class="area" fill="url(#${gid})" d="${d}L${X(s.points.length - 1)},${Y(Math.max(y0, 0))}L${X(0)},${Y(Math.max(y0, 0))}Z"/>`; }
    g += `<path class="line${s.dash ? ' dash' : ''}" style="stroke:${s.color}" d="${d}"/>`;
    if (s.points.length < 30 && !s.nodots) s.points.forEach((p, i) => { g += `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="${i === s.points.length - 1 ? 3.5 : 2}" style="fill:${s.color}"/>`; });
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
  spec._geom = { X, Y, n, P, iw, ih, H };
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
  if (spec.line) g += `<path class="line" style="stroke:${spec.line.color}" d="${spec.line.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}"/>`;
  g += `<line class="guide" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="opacity:0"/>`;
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
  const band = (x1, y1, x2, y2, h1, h2, color, title) => {
    const mx = (x1 + x2) / 2;
    return `<path class="sk-band" style="fill:${color}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + h2} C${mx},${y2 + h2} ${mx},${y1 + h1} ${x1},${y1 + h1} Z"><title>${esc(title)}</title></path>`;
  };
  let g = '', cy = cY;
  L.forEach((n, i) => {
    const y = lo + n.y, color = n.drawn ? 'var(--neg)' : `var(--c${(i % 8) + 1})`;
    g += band(xL + nodeW, y, xC, cy, n.h, n.h, color, n.title || `${n.name}: ${money(n.value, { cents: false })}`);
    g += `<rect class="sk-node" x="${xL}" y="${y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${color}"/>`;
    g += `<text class="sk-label" x="${xL - 10}" y="${y + n.h / 2 - 2}" text-anchor="end">${esc(trunc(n.name))}</text><text class="sk-value num" x="${xL - 10}" y="${y + n.h / 2 + 12}" text-anchor="end">${fmt(n.value)}</text>`;
    cy += n.h;
  });
  g += `<rect class="sk-node center" x="${xC}" y="${cY}" width="${nodeW}" height="${centerH}" rx="2"/>`;
  if (!narrow) g += `<text class="sk-value" x="${xC + nodeW / 2}" y="${cY - 6}" text-anchor="middle">${money(total, { cents: false })}</text>`;
  cy = cY;
  R.forEach((n, i) => {
    const y = ro + n.y, color = n.saved ? 'var(--pos)' : `var(--c${((i + 3) % 8) + 1})`;
    g += band(xC + nodeW, cy, xR, y, n.h, n.h, color, n.title || `${n.name}: ${money(n.value, { cents: false })}`);
    g += `<rect class="sk-node" x="${xR}" y="${y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${color}"/>`;
    g += `<text class="sk-label${n.saved ? ' saved' : ''}" x="${xR + nodeW + 10}" y="${y + n.h / 2 - 2}">${esc(trunc(n.name))}</text><text class="sk-value num" x="${xR + nodeW + 10}" y="${y + n.h / 2 + 12}" text-anchor="start">${fmt(n.value)} · ${pct(n.value / total, 0)}</text>`;
    cy += n.h;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="sankey">${g}</svg>`;
}

/* Donut with a center figure. */
function svgDonut(spec, W) {
  const items = spec.items.filter(i => i.value > 0), total = sum(items.map(i => i.value));
  const H = spec.h || 220, size = Math.min(W, H), r = size / 2 - 4, inner = r * (spec.thin ? 0.78 : 0.64), cx = W / 2, cy = H / 2;
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  let a0 = -Math.PI / 2, g = '';
  const gapA = items.length > 1 ? 0.012 : 0;
  const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  for (const it of items) {
    const a = (it.value / total) * Math.PI * 2, a1 = a0 + a, s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a1 - gapA / 2), large = s1 - s0 > Math.PI ? 1 : 0;
    const path = items.length === 1
      ? `M${pt(r, -Math.PI / 2)} A${r},${r} 0 1 1 ${pt(r, Math.PI * 1.5 - 0.0001)} L${pt(inner, Math.PI * 1.5 - 0.0001)} A${inner},${inner} 0 1 0 ${pt(inner, -Math.PI / 2)} Z`
      : `M${pt(r, s0)} A${r},${r} 0 ${large} 1 ${pt(r, s1)} L${pt(inner, s1)} A${inner},${inner} 0 ${large} 0 ${pt(inner, s0)} Z`;
    g += `<path class="donut-seg" d="${path}" style="fill:${it.color}"><title>${esc(it.label)}: ${money(it.value, { cents: false })} (${pct(it.value / total, 0)})</title></path>`;
    a0 = a1;
  }
  if (spec.center) g += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-value">${esc(spec.center.value)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-label">${esc(spec.center.label)}</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
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
  for (const r of rects) {
    const big = r.w > 78 && r.h > 40, mid = r.w > 54 && r.h > 22;
    const inner = `<rect class="tm-tile" x="${r.x + 1}" y="${r.y + 1}" width="${Math.max(0, r.w - 2)}" height="${Math.max(0, r.h - 2)}" rx="4" style="fill:${r.color}"><title>${esc(r.label)}: ${money(r.value, { cents: false })} (${pct(r.value / total, 0)})</title></rect>` +
      (mid ? `<text class="tm-label" x="${r.x + 9}" y="${r.y + 18}">${esc(r.label.length * 7 > r.w - 14 ? r.label.slice(0, Math.max(3, Math.floor((r.w - 14) / 7) - 1)) + '…' : r.label)}</text>` : '') +
      (big ? `<text class="tm-value" x="${r.x + 9}" y="${r.y + 35}">${money(r.value, { cents: false })}</text>` : '');
    g += r.href ? `<a href="${r.href}">${inner}</a>` : inner;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="treemap">${g}</svg>`;
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
  ['M', 'W', 'F'].forEach((l, i) => { g += `<text class="tick" x="0" y="${top + (i * 2 + 1) * (cell + gap) + cell - 2}">${l}</text>`; });
  const d = new Date(start);
  for (let w = 0; w <= weeks; w++) {
    for (let day = 0; day < 7; day++) {
      if (d > end) break;
      const iso = toISO(d), v = spec.days[iso] || 0, x = left + w * (cell + gap), y = top + day * (cell + gap);
      if (day === 0 && d.getMonth() !== lastMonth && d.getDate() <= 7) { g += `<text class="tick" x="${x}" y="11">${MON[d.getMonth()]}</text>`; lastMonth = d.getMonth(); }
      g += `<rect class="hm l${level(v)}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2"><title>${dateLabel(iso, true)}: ${v ? money(v, { cents: false }) + ' spent' : 'no spending'}</title></rect>`;
      d.setDate(d.getDate() + 1);
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="heatmap">${g}</svg>`;
}
window.addEventListener('resize', debounce(() => drawCharts(), 150));
