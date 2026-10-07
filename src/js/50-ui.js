/* ================= shared UI: router, modal, toast, form helpers ================= */
const UI = { month: thisMonth(), nwRange: '12' };
const PAGES = [
  ['overview', 'Overview'], ['transactions', 'Transactions'], ['budget', 'Budget'], ['accounts', 'Accounts'],
  ['investments', 'Investments'], ['property', 'Property'], ['cashflow', 'Cash flow'], ['review', 'Monthly review'], ['data', 'Data and settings'],
];
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

function render() {
  if (!$('#main')) return;
  const ae = document.activeElement;
  let focusSel = null;
  if (ae && ae !== document.body && $('#main')?.contains(ae)) {
    if (ae.id) focusSel = '#' + CSS.escape(ae.id);
    else { const k = Object.keys(ae.dataset)[0]; if (k) focusSel = `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(ae.dataset[k])}"]`; }
  }
  const { page, params } = route();
  for (const k in ChartSpecs) delete ChartSpecs[k];
  let html;
  try { html = VIEWS[page](params); }
  catch (e) { console.error(e); html = `<div class="notice bad">This page hit an error: ${esc(e.message)}. Your data is safe; try another page or reload.</div>`; }
  $('#main').innerHTML = html;
  for (const t of $$('#main table.ledger')) {
    if (t.parentElement.classList.contains('scroll-table')) continue;
    const w = document.createElement('div'); w.className = 'scroll-table'; t.replaceWith(w); w.appendChild(t);
  }
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.title = `${PAGES.find(p => p[0] === page)[1]} · Keel`;
  drawCharts($('#main'));
  if (focusSel) {
    const el = $(focusSel, $('#main'));
    if (el && el.focus) { el.focus(); if (el.setSelectionRange && /text|search/.test(el.type)) { const n = el.value.length; el.setSelectionRange(n, n); } }
  }
  paintStatus();
}

/* ---------- status pill in the sidebar ---------- */
function paintStatus() {
  const el = $('#save-status'); if (!el) return;
  let text, tone = 'ok', action = '';
  if (Store.status === 'saving') text = 'Saving…';
  else if (Store.status === 'error') { text = 'Couldn’t save in this browser'; tone = 'bad'; }
  else if (Store.handle && Store.perm !== 'granted') { text = `Reconnect ${Store.fileName}`; tone = 'warn'; action = 'reconnect'; }
  else if (Store.handle) text = `Saved to ${Store.fileName}`;
  else text = 'Saved in this browser';
  el.className = 'save-status ' + tone;
  el.innerHTML = `<span class="dot"></span><span>${esc(text)}${Store.key ? ' <span class="lock" title="Encrypted with your passphrase">locked</span>' : ''}</span>`;
  el.dataset.action = action;
  el.title = action ? 'Click to give Keel permission to keep saving to your data file' : (Store.savedAt ? `Last saved ${Store.savedAt.toLocaleTimeString()}` : '');
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
  return `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions}</div></header>`;
}
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
