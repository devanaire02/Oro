/* ================= shared UI: router, shell, modal, toast, visual helpers ================= */
const UI = { nwRange: '12', lens: '', mode: 'detailed' };
try { UI.mode = localStorage.getItem('keel.mode') || 'detailed'; UI.lens = sessionStorage.getItem('keel.lens') || ''; } catch (e) { /* storage blocked */ }

const PAGES = [
  ['overview', 'Overview', ''], ['transactions', 'Transactions', ''], ['budget', 'Budget', ''], ['cashflow', 'Cash flow', ''],
  ['accounts', 'Accounts', 'Wealth'], ['investments', 'Investments', 'Wealth'], ['property', 'Property', 'Wealth'],
  ['reports', 'Reports', 'Plan'], ['planning', 'Planning', 'Plan'], ['taxes', 'Taxes', 'Plan'], ['review', 'Monthly review', 'Plan'],
  ['data', 'Settings', 'end'],
];
const LENS_PAGES = new Set(['overview', 'transactions', 'reports']);
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'overview';
  const [page, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { page: PAGES.some(p => p[0] === page) ? page : 'overview', params };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function setParam(k, v) {
  const { page, params } = route();
  if (v === '' || v == null) delete params[k]; else params[k] = v;
  const qs = new URLSearchParams(params).toString();
  history.replaceState(null, '', `#/${page}${qs ? '?' + qs : ''}`);
  render();
}

/* ---------- household members ---------- */
const members = () => state.settings.members || [{ id: 'joint', name: 'Joint' }];
const memberName = id => members().find(m => m.id === id)?.name || 'Joint';
const memberColor = id => { const i = members().findIndex(m => m.id === id); return `var(--c${((i < 0 ? 0 : i) % 8) + 1})`; };
function personOf(t) { return t.person || acctById(t.accountId)?.owner || 'joint'; }
function lensed(txs) { return UI.lens ? txs.filter(t => personOf(t) === UI.lens) : txs; }
function memberOptions(sel, inherit) {
  return (inherit ? `<option value="">${esc(inherit)}</option>` : '') + members().map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function render() {
  if (!$('#main')) return;
  invalidate();
  const ae = document.activeElement;
  let focusSel = null;
  if (ae && ae !== document.body && $('#main')?.contains(ae)) {
    if (ae.id) focusSel = '#' + CSS.escape(ae.id);
    else { const k = Object.keys(ae.dataset)[0]; if (k) focusSel = `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(ae.dataset[k])}"]`; }
  }
  const { page, params } = route();
  for (const k in ChartSpecs) delete ChartSpecs[k];
  document.body.classList.toggle('simple', UI.mode === 'simple');
  document.body.classList.toggle('privacy', !!state.settings.privacy);
  let html;
  try { html = VIEWS[page](params); }
  catch (e) { console.error(e); html = `<div class="notice bad">This page hit an error: ${esc(e.message)}. Your data is safe; try another page or reload.</div>`; }
  $('#main').innerHTML = html;
  for (const t of $$('#main table.ledger')) {
    if (t.parentElement.classList.contains('scroll-table')) continue;
    const w = document.createElement('div'); w.className = 'scroll-table'; t.replaceWith(w); w.appendChild(t);
  }
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.title = `${PAGES.find(p => p[0] === page)[1]} · Ọrọ̀`;
  paintTopbar(page);
  drawCharts($('#main'));
  if (focusSel) {
    const el = $(focusSel, $('#main'));
    if (el && el.focus) { el.focus(); if (el.setSelectionRange && /text|search/.test(el.type)) { const n = el.value.length; el.setSelectionRange(n, n); } }
  }
  paintStatus();
  if (page === 'data') paintBackups();
}

function buildShell() {
  let html = '', group = null;
  for (const [id, label, g] of PAGES) {
    if (g !== group) { if (g && g !== 'end') html += `<span class="nav-group">${esc(g)}</span>`; if (g === 'end') html += '<span class="nav-spacer"></span>'; group = g; }
    html += `<a href="#/${id}" data-page="${id}">${label}</a>`;
  }
  $('#nav').innerHTML = html;
}
function paintTopbar(page) {
  const tb = $('#topbar'); if (!tb) return;
  const lensOn = LENS_PAGES.has(page) || page === 'overview';
  tb.innerHTML = `
    <button class="search-btn" data-act="palette" aria-label="Search or jump to (Command K)"><span>Search or jump to…</span><kbd>⌘K</kbd></button>
    <div class="tb-right">
      ${members().length > 1 ? `<label class="lens ${UI.lens ? 'on' : ''} ${lensOn ? '' : 'dim'}" title="${lensOn ? 'Show spending for one person' : 'The household lens applies to Overview, Transactions and Reports'}">
        <span class="sr">Household lens</span>
        <select id="lens-select" aria-label="Whose spending">${`<option value="">Everyone</option>` + members().map(m => `<option value="${m.id}" ${UI.lens === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}
      <div class="seg mode" role="group" aria-label="Detail level">
        <button class="${UI.mode === 'simple' ? 'on' : ''}" data-mode="simple">Simple</button><button class="${UI.mode === 'detailed' ? 'on' : ''}" data-mode="detailed">Detailed</button>
      </div>
      <button class="btn small money-date-btn" data-act="money-date" title="Walk through a month together, one screen at a time">Money date</button>
      <button class="icon-btn eye" data-act="privacy" aria-pressed="${state.settings.privacy ? 'true' : 'false'}" title="${state.settings.privacy ? 'Show amounts' : 'Hide amounts'} (⇧P)">${state.settings.privacy ? EYE_OFF : EYE}</button>
    </div>`;
}
const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.1 6.1C3.6 7.8 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

/* ---------- status in the sidebar ---------- */
function paintStatus() {
  const el = $('#save-status'); if (!el) return;
  let text, tone = 'ok', action = '';
  if (Store.status === 'saving') text = 'Saving…';
  else if (Store.status === 'error') { text = 'Couldn’t save'; tone = 'bad'; }
  else if ((Store.dir || Store.handle) && Store.perm !== 'granted') { text = `Reconnect ${Store.fileName}`; tone = 'warn'; action = 'reconnect'; }
  else if (Store.dir) text = `Saved to ${Store.fileName} folder`;
  else if (Store.handle) text = `Saved to ${Store.fileName}`;
  else { text = 'Saved in this browser only'; tone = 'warn'; }
  el.className = 'save-status ' + tone;
  el.innerHTML = `<span class="dot"></span><span>${esc(text)}${Store.key ? ' <span class="lock" title="Encrypted with your passphrase">encrypted</span>' : ''}</span>`;
  el.dataset.action = action;
  el.title = action ? 'Click to give Ọrọ̀ permission to keep saving' : (Store.savedAt ? `Last saved ${Store.savedAt.toLocaleTimeString()}` : '');
}

/* ---------- modal ---------- */
let _modalResolve = null;
function openModal({ title, body, actions, wide, id }) {
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" ${id ? `data-id="${id}"` : ''}>
      <header class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></header>
      <div class="modal-body">${body}</div>
      <footer class="modal-foot">${actions || ''}</footer></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeModal(); });
  setTimeout(() => { const f = wrap.querySelector('[autofocus], input:not([type=checkbox]):not([type=file]), select, textarea'); if (f) f.focus(); }, 30);
  return wrap;
}
function setModalActions(html) { const f = $('#modal .modal-foot'); if (f) f.innerHTML = html; }
function closeModal(silent) {
  const m = $('#modal'); if (m) m.remove();
  if (!silent && _modalResolve) { const r = _modalResolve; _modalResolve = null; r(null); }
}
function confirmBox(title, text, okLabel = 'Continue', danger) {
  return new Promise(res => {
    openModal({ title, body: `<p>${text}</p>`, actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="confirm-ok">${esc(okLabel)}</button>` });
    _modalResolve = res;
    $('#confirm-ok').onclick = () => { _modalResolve = null; closeModal(true); res(true); };
  });
}
function promptPass(title, text, opts = {}) {
  return new Promise(res => {
    openModal({ title, body: `<p>${text}</p><label class="field"><span>Passphrase</span><input type="password" id="pp1" autocomplete="${opts.confirm ? 'new-password' : 'current-password'}" autofocus></label>${opts.confirm ? `<label class="field"><span>Type it again</span><input type="password" id="pp2" autocomplete="new-password"></label>` : ''}<p class="notice small" id="pp-err" hidden></p>`,
      actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="pp-ok">${esc(opts.ok || 'Unlock')}</button>` });
    _modalResolve = res;
    const ok = () => {
      const a = $('#pp1').value, b = opts.confirm ? $('#pp2').value : a;
      const err = $('#pp-err');
      if (!a) { err.hidden = false; err.textContent = 'Enter a passphrase.'; return; }
      if (opts.confirm && a.length < 8) { err.hidden = false; err.textContent = 'Use at least 8 characters.'; return; }
      if (a !== b) { err.hidden = false; err.textContent = 'Those don’t match.'; return; }
      _modalResolve = null; closeModal(true); res(a);
    };
    $('#pp-ok').onclick = ok;
    $$('#modal input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') ok(); });
  });
}

/* ---------- toast ---------- */
function toast(text, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(text)}</span>${action ? `<button class="btn small">${esc(action.label)}</button>` : ''}<button class="icon-btn" aria-label="Dismiss">×</button>`;
  $('#toasts').appendChild(t);
  while ($$('#toasts .toast').length > 3) $('#toasts .toast').remove();
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  if (action) t.querySelector('.btn').onclick = () => { action.fn(); kill(); };
  t.querySelector('.icon-btn').onclick = kill;
  setTimeout(kill, action ? 9000 : 4500);
}

/* ---------- small builders ---------- */
function catOptions(sel, includeNone = true, filter) {
  const groups = groupBy(state.categories.filter(c => !filter || filter(c)), c => c.group);
  return (includeNone ? `<option value="" ${!sel ? 'selected' : ''}>Uncategorized</option>` : '') +
    Object.entries(groups).map(([g, cs]) => `<optgroup label="${esc(g)}">${cs.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}
function acctOptions(sel, filter, emptyLabel) {
  return (emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : '') +
    activeAccounts().filter(a => !filter || filter(a)).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}
const amt = (n, opts) => `<span class="num ${signClass(n)}">${money(n, opts)}</span>`;
function pageHead(title, sub, actions = '') {
  return `<header class="page-head"><div><h1>${esc(title).replace(/Ọrọ̀/g, '<span class="wordmark">Ọrọ̀</span>')}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions}</div></header>`;
}
function lensNote() { return UI.lens ? `<p class="lens-note">Showing ${esc(memberName(UI.lens))}’s spending only. <button class="linklike" data-lens="">Show everyone</button></p>` : ''; }
function monthNav(mk, param = 'm') {
  return `<div class="month-nav" role="group" aria-label="Month">
    <button class="icon-btn" data-month="${addMonths(mk, -1)}" data-param="${param}" aria-label="Previous month">‹</button>
    <span class="month-label">${monthLabel(mk)}</span>
    <button class="icon-btn" data-month="${addMonths(mk, 1)}" data-param="${param}" aria-label="Next month" ${mk >= thisMonth() ? 'disabled' : ''}>›</button></div>`;
}
function bar(actual, budget, opts = {}) {
  const share = budget > 0 ? actual / budget : (actual > 0 ? 1 : 0);
  const over = budget > 0 && actual > budget * 1.0001;
  const pace = opts.pace != null && budget > 0 ? clamp(opts.pace / budget, 0, 1) : null;
  return `<div class="meter ${over ? 'over' : ''}" title="${pct(share, 0)} of budget"><span style="width:${clamp(share, 0, 1) * 100}%"></span>${pace != null ? `<i style="left:${pace * 100}%" title="Where you’d be on an even pace"></i>` : ''}</div>`;
}
/* Progress ring (inline SVG). */
function ring(share, opts = {}) {
  const s = opts.size || 64, w = opts.width || 7, r = (s - w) / 2, c = 2 * Math.PI * r, p = clamp(share, 0, 1);
  const color = opts.color || (share > 1.0001 ? 'var(--neg)' : 'var(--ink-accent)');
  return `<svg class="ring" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${pct(share, 0)}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="var(--rule)" stroke-width="${w}"/>
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${s / 2} ${s / 2})"/>
    ${opts.label != null ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-label">${esc(opts.label)}</text>` : ''}</svg>`;
}
/* Sparkline (inline SVG). */
function sparkline(values, opts = {}) {
  const w = opts.w || 90, h = opts.h || 24, n = values.length;
  if (n < 2 || values.every(v => !v)) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  const lo = Math.min(0, ...values), hi = Math.max(...values) || 1;
  const X = i => 1 + (i / (n - 1)) * (w - 2), Y = v => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${X(n - 1)},${h}L${X(0)},${h}Z" class="spark-area" style="fill:${opts.color || 'var(--ink-accent)'}"/><path d="${d}" fill="none" stroke="${opts.color || 'var(--ink-accent)'}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${X(n - 1)}" cy="${Y(values[n - 1])}" r="2" fill="${opts.color || 'var(--ink-accent)'}"/></svg>`;
}
function deltaChip(now, then, opts = {}) {
  if (then == null || !isFinite(then)) return '';
  const d = now - then, good = opts.inverse ? d < 0 : d > 0;
  if (Math.abs(d) < 0.5) return '<span class="chip flat">no change</span>';
  return `<span class="chip ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${money(Math.abs(d), { cents: false })}${opts.pct && then ? ` · ${pct(Math.abs(d / then), 0)}` : ''}</span>`;
}
function formData(root) {
  const o = {};
  $$('[name]', root).forEach(el => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}
function emptyState(title, text, actions) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${text}</p><div class="actions">${actions || ''}</div></div>`;
}
function staleTag(date, days = state.settings.staleDays || 35) {
  if (!date) return '<span class="tag">No date</span>';
  const d = daysBetween(date, today());
  return d > days ? `<span class="tag warn" title="Updated ${d} days ago">${dateLabel(date)}</span>` : `<span class="muted">${dateLabel(date)}</span>`;
}
function tabs(param, current, list) {
  return `<nav class="tabs" role="tablist">${list.map(([id, label]) => `<button role="tab" aria-selected="${id === current}" class="${id === current ? 'on' : ''}" data-tab="${id}" data-param="${param}">${esc(label)}</button>`).join('')}</nav>`;
}
