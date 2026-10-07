/* ================= Money date: a month, one screen at a time ================= */
const MD = { i: 0, mk: null, slides: [] };
function startMoneyDate(mk) {
  const lm = addMonths(thisMonth(), -1);
  MD.mk = mk || (state.transactions.some(t => t.date.startsWith(lm)) ? lm : thisMonth());
  MD.i = 0;
  MD.slides = buildSlides(MD.mk);
  let el = $('#present');
  if (!el) { el = document.createElement('div'); el.id = 'present'; el.className = 'present'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Money date'); document.body.appendChild(el); }
  document.body.classList.add('presenting');
  paintSlide();
}
function endMoneyDate() { $('#present')?.remove(); document.body.classList.remove('presenting'); render(); }
function paintSlide() {
  const el = $('#present'); if (!el) return;
  for (const k in ChartSpecs) delete ChartSpecs[k];
  const n = MD.slides.length, s = MD.slides[MD.i];
  el.innerHTML = `
    <header class="present-top"><span class="brand">Ọrọ̀</span><span class="present-title">Money date · ${monthLabel(MD.mk)}</span>
      <span class="present-prog">${MD.slides.map((_, k) => `<i class="${k === MD.i ? 'on' : k < MD.i ? 'done' : ''}"></i>`).join('')}</span>
      <button class="icon-btn" data-md="close" aria-label="Exit Money date">×</button></header>
    <section class="slide" aria-live="polite">${s.html()}</section>
    <footer class="present-nav"><button class="btn ghost" data-md="prev" ${MD.i ? '' : 'disabled'}>Back</button><span class="muted">${MD.i + 1} of ${n} · ${esc(s.title)}</span><button class="btn primary" data-md="next">${MD.i === n - 1 ? 'Finish' : 'Next'}</button></footer>`;
  drawCharts(el);
}
function buildSlides(mk) {
  const prev = addMonths(mk, -1);
  const txs = txInMonth(mk), f = flowSummary(txs);
  const avg = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i))));
  const avgSpend = sum(avg.map(x => x.spending)) / 3;
  const endNW = mk === thisMonth() ? totals().netWorth : snapshotNW(mk), startNW = snapshotNW(prev);
  const nwChange = endNW != null && startNW != null ? endNW - startNW : null;
  const M = MONTHS[+mk.slice(5) - 1];
  const groups = spendByGroup(txs), items = donutItems(groups, 6), spendTotal = sum(groups.map(g => g.value));
  const acts = monthActuals(mk);
  const exp = state.categories.filter(c => c.kind === 'expense' && c.period !== 'year' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) }));
  const wins = exp.filter(x => x.v.actual < x.v.budget).sort((a, b) => (b.v.budget - b.v.actual) - (a.v.budget - a.v.actual)).slice(0, 4);
  const misses = exp.filter(x => x.v.actual > x.v.budget).sort((a, b) => (b.v.actual - b.v.budget) - (a.v.actual - a.v.budget)).slice(0, 4);
  const notes = insights(mk, { limit: 4 });
  const slides = [];
  slides.push({ title: 'The big picture', html: () => `<div class="slide-center">
      <p class="eyebrow-plain">${monthLabel(mk)}</p>
      <h1 class="slide-h">${f.net >= 0 ? `We kept <span class="num pos">${money(f.net, { cents: false })}</span> this month.` : `We spent <span class="num neg">${money(-f.net, { cents: false })}</span> more than came in.`}</h1>
      <p class="slide-lede">${money(f.income, { cents: false })} came in and ${money(f.spending, { cents: false })} went out${nwChange != null ? `, and our net worth ${nwChange >= 0 ? 'grew' : 'fell'} by ${money(Math.abs(nwChange), { cents: false })}` : ''}.</p></div>` });
  if (endNW != null) {
    const series = netWorthSeries().filter(p => p.x <= mk).slice(-13);
    const bk = BUCKETS.map(b => { const s = mk === thisMonth() ? null : state.snapshots[mk] || {}; const v = s ? sum(Object.entries(s).filter(([id]) => ACCOUNT_TYPES[acctById(id)?.type]?.bucket === b.id).map(([, x]) => x)) : (b.id === 'debt' ? -totals().debt : totals()[b.id]); return { b, v }; });
    slides.push({ title: 'Net worth', html: () => `<div class="slide-split">
      <div><p class="eyebrow-plain">What we own, minus what we owe</p><p class="slide-num num">${money(endNW, { cents: false })}</p>${startNW != null ? `<p class="slide-lede">${deltaChip(endNW, startNW, { pct: true })} since the end of ${MONTHS[+prev.slice(5) - 1]}</p>` : ''}
        <ul class="slide-bars">${bk.map(({ b, v }) => `<li><span>${esc(b.label)}</span><span class="num ${v < 0 ? 'neg' : ''}">${money(v, { cents: false })}</span></li>`).join('')}</ul></div>
      <div>${chartHost({ h: 300, series: [{ points: series, color: 'var(--ink-accent)', area: true }], xFmt: x => MON[+x.slice(5) - 1], tip: i => `<strong>${monthLabel(series[i].x)}</strong><br>${money(series[i].y, { cents: false })}` })}</div></div>` });
  }
  slides.push({ title: 'Money in and out', html: () => {
    const mx = Math.max(f.income, f.spending, 1);
    return `<div class="slide-split">
      <div><h2 class="slide-h2">In and out</h2>
        <div class="io-bars"><div><span>Came in</span><div class="io-track"><span style="width:${f.income / mx * 100}%;background:var(--pos)"></span></div><strong class="num">${money(f.income, { cents: false })}</strong></div>
        <div><span>Went out</span><div class="io-track"><span style="width:${f.spending / mx * 100}%;background:var(--c4)"></span></div><strong class="num">${money(f.spending, { cents: false })}</strong></div></div>
        <p class="slide-lede">Spending was ${avgSpend ? `${money(Math.abs(f.spending - avgSpend), { cents: false })} ${f.spending > avgSpend ? 'more' : 'less'} than` : 'compared with'} our usual month.</p></div>
      <div class="slide-center">${ring(isFinite(f.rate) ? Math.max(0, f.rate) : 0, { size: 220, width: 20, label: isFinite(f.rate) ? pct(f.rate, 0) : '—', color: f.rate >= 0.2 ? 'var(--pos)' : f.rate >= 0 ? 'var(--ink-accent)' : 'var(--neg)' })}<p class="slide-lede">of what came in, we kept</p></div></div>`;
  } });
  if (items.length) slides.push({ title: 'Where it went', html: () => `<div class="slide-split">
      <div>${chartHost({ type: 'donut', h: 330, items, center: { value: money(spendTotal, { cents: false }), label: 'spent' } })}</div>
      <div><h2 class="slide-h2">Where it went</h2>${legendList(items, spendTotal)}
      <p class="slide-lede">${groups[0] ? `${esc(groups[0].label)} was the biggest piece at ${pct(groups[0].value / spendTotal, 0)}.` : ''}</p></div></div>` });
  if (wins.length || misses.length) slides.push({ title: 'Budget', html: () => `<h2 class="slide-h2 center">How the budget did</h2><div class="slide-split">
      <div class="wins"><h3>Under budget</h3>${wins.length ? wins.map(x => `<div class="wm good"><span>${esc(x.c.name)}</span><strong class="num">${money(x.v.budget - x.v.actual, { cents: false })} under</strong>${bar(x.v.actual, x.v.budget)}</div>`).join('') : '<p class="muted">Nothing came in under.</p>'}</div>
      <div class="misses"><h3>Over budget</h3>${misses.length ? misses.map(x => `<div class="wm bad"><span>${esc(x.c.name)}</span><strong class="num">${money(x.v.actual - x.v.budget, { cents: false })} over</strong>${bar(x.v.actual, x.v.budget)}</div>`).join('') : '<p class="slide-lede pos">Every category stayed within budget.</p>'}</div></div>` });
  if (members().length > 1) {
    const per = members().map(m => ({ m, f: flowSummary(txs.filter(t => personOf(t) === m.id)), a: categoryActuals(txs.filter(t => personOf(t) === m.id)) })).filter(x => x.f.spending > 0);
    const tot = sum(per.map(x => x.f.spending)) || 1;
    if (per.length > 1) slides.push({ title: 'Who spent what', html: () => `<h2 class="slide-h2 center">Who spent what</h2>
      <div class="stack huge">${per.map(x => `<span style="width:${x.f.spending / tot * 100}%;background:${memberColor(x.m.id)}"></span>`).join('')}</div>
      <div class="people-cards">${per.map(x => `<div class="person-card" style="--pc:${memberColor(x.m.id)}"><span class="person-name">${esc(x.m.name)}</span><span class="s-value num">${money(x.f.spending, { cents: false })}</span><span class="muted">${pct(x.f.spending / tot, 0)}</span><ul>${Object.entries(x.a).filter(([id, v]) => v > 0 && catById(id)?.kind === 'expense').sort((p, q) => q[1] - p[1]).slice(0, 3).map(([id, v]) => `<li><span>${esc(catName(id))}</span><span class="num">${money(v, { cents: false })}</span></li>`).join('')}</ul></div>`).join('')}</div>` });
  }
  if (state.goals.length) slides.push({ title: 'Goals', html: () => `<h2 class="slide-h2 center">Our goals</h2><div class="goal-strip big">${state.goals.map(goalTile).join('')}</div>` });
  const nextFrom = mk === thisMonth() ? today() : `${addMonths(mk, 1)}-01`;
  const ahead = []; for (const r of state.recurring) for (const d of occurrences(r, nextFrom, addDays(nextFrom, 40))) ahead.push({ d, r });
  ahead.sort((a, b) => a.d.localeCompare(b.d));
  slides.push({ title: 'Looking ahead', html: () => `<div class="slide-split">
      <div><h2 class="slide-h2">Looking ahead</h2>
        ${notes.length ? `<ul class="insights big">${notes.map(n => `<li class="${n.tone}">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="slide-lede">Nothing unusual to flag.</p>'}</div>
      <div><h3>Bills in the next few weeks</h3><ul class="simple-list">${ahead.filter(x => Math.abs(x.r.amount) >= 50).slice(0, 8).map(x => `<li><span class="date-chip">${dateLabel(x.d)}</span><span>${esc(x.r.name)}</span><span class="num ${signClass(x.r.amount)}">${money(x.r.amount, { cents: false })}</span></li>`).join('') || '<li class="muted">None scheduled.</li>'}</ul></div></div>` });
  slides.push({ title: 'Decisions', html: () => `<div class="slide-narrow"><h2 class="slide-h2">What we decided</h2>
      <p class="slide-lede">Write down anything you agreed to change. It’s saved with ${M}’s review.</p>
      <textarea data-review-notes="${mk}" rows="7" placeholder="e.g. Move $300 a month from dining out to the roof fund">${esc(state.reviews[mk]?.notes || '')}</textarea>
      <div class="actions"><button class="btn primary" data-md="done">Mark ${M} as reviewed</button></div></div>` });
  return slides;
}
function mdAction(a) {
  if (a === 'close') return endMoneyDate();
  if (a === 'prev' && MD.i > 0) { MD.i--; return paintSlide(); }
  if (a === 'next') { if (MD.i < MD.slides.length - 1) { MD.i++; return paintSlide(); } return endMoneyDate(); }
  if (a === 'done') { (state.reviews[MD.mk] = state.reviews[MD.mk] || {}).completedAt = today(); commit({ silent: true }); toast(`${monthLabel(MD.mk)} marked as reviewed.`); return endMoneyDate(); }
}

/* ================= command palette ================= */
const PAL = { items: [], sel: 0 };
function paletteItems(q) {
  q = q.trim().toLowerCase();
  const out = [];
  for (const [id, label] of PAGES) out.push({ group: 'Go to', label, run: () => go(`#/${id}`) });
  const acts = [['Add a transaction', () => txnModal()], ['Import a file', () => startImport()], ['Add an account', () => acctModal()], ['Add a goal', () => goalModal()], ['Start a Money date', () => startMoneyDate()],
    [state.settings.privacy ? 'Show amounts' : 'Hide amounts', () => ACTIONS.privacy()], [UI.mode === 'simple' ? 'Switch to Detailed view' : 'Switch to Simple view', () => { setMode(UI.mode === 'simple' ? 'detailed' : 'simple'); }],
    ['Undo', undo], ['Redo', redo], ['Download a backup', () => ACTIONS.backup()], ['Update balances', () => go('#/accounts?update=1')], ['Monthly review', () => go('#/review')]];
  if (Store.key) acts.push(['Lock Ọrọ̀ now', () => lockNow()]);
  for (const [label, run] of acts) out.push({ group: 'Actions', label, run });
  for (const a of activeAccounts()) out.push({ group: 'Accounts', label: a.name, hint: money(accountValue(a), { cents: false }), run: () => acctModal(a.id) });
  for (const c of state.categories) out.push({ group: 'Categories', label: c.name, hint: c.group, run: () => go(`#/transactions?m=all&cat=${c.id}`) });
  let list = q ? out.filter(i => (i.label + ' ' + (i.hint || '') + ' ' + i.group).toLowerCase().includes(q)) : out.filter(i => i.group !== 'Categories').slice(0, 14);
  if (q.length >= 2) {
    const tx = state.transactions.filter(t => (t.payee + ' ' + (t.memo || '')).toLowerCase().includes(q)).slice(0, 8);
    list = list.slice(0, 10).concat(tx.map(t => ({ group: 'Transactions', label: t.payee, hint: `${dateLabel(t.date, true)} · ${money(t.amount)}`, run: () => txnModal(t.id) })));
    if (state.transactions.some(t => (t.payee || '').toLowerCase().includes(q))) list.push({ group: 'Transactions', label: `Show all transactions matching “${q}”`, run: () => go(`#/transactions?m=all&q=${encodeURIComponent(q)}`) });
  }
  return list;
}
function openPalette() {
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap palette-wrap'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="palette" role="dialog" aria-label="Search or jump to"><input id="pal-q" placeholder="Search pages, actions, accounts, transactions…" autocomplete="off" aria-label="Search"><ul id="pal-list" role="listbox"></ul><p class="pal-foot muted small">↑↓ to move · Enter to open · Esc to close</p></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeModal(); });
  const inp = $('#pal-q');
  const paint = () => {
    PAL.items = paletteItems(inp.value); PAL.sel = clamp(PAL.sel, 0, Math.max(0, PAL.items.length - 1));
    let lastG = '';
    $('#pal-list').innerHTML = PAL.items.map((it, i) => { const g = it.group !== lastG ? `<li class="pal-group">${esc(it.group)}</li>` : ''; lastG = it.group; return g + `<li role="option" aria-selected="${i === PAL.sel}" class="${i === PAL.sel ? 'sel' : ''}" data-pal="${i}"><span>${esc(it.label)}</span>${it.hint ? `<span class="muted small">${esc(it.hint)}</span>` : ''}</li>`; }).join('') || '<li class="muted pal-empty">No matches</li>';
    $('#pal-list .sel')?.scrollIntoView({ block: 'nearest' });
  };
  inp.oninput = () => { PAL.sel = 0; paint(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { PAL.sel++; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { PAL.sel--; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = PAL.items[PAL.sel]; if (it) { closeModal(true); it.run(); } e.preventDefault(); }
  };
  $('#pal-list').onclick = e => { const li = e.target.closest('[data-pal]'); if (li) { const it = PAL.items[+li.dataset.pal]; closeModal(true); it.run(); } };
  PAL.sel = 0; paint(); inp.focus();
}
function showShortcuts() {
  openModal({ title: 'Keyboard shortcuts', body: `<dl class="shortcuts">${[['⌘K', 'Search or jump anywhere'], ['N', 'New transaction'], ['I', 'Import'], ['/', 'Search transactions'], ['G, O', 'Overview'], ['G, T', 'Transactions'], ['G, B', 'Budget'], ['G, C', 'Cash flow'], ['G, A', 'Accounts'], ['G, I', 'Investments'], ['G, P', 'Property'], ['G, R', 'Reports'], ['G, L', 'Planning'], ['G, X', 'Taxes'], ['G, M', 'Monthly review'], ['G, S', 'Settings'], ['⇧P', 'Hide or show amounts'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['← →', 'Move through a Money date']].map(([k, l]) => `<div><dt><kbd>${k}</kbd></dt><dd>${l}</dd></div>`).join('')}</dl>` });
}
function setMode(m) { UI.mode = m; try { localStorage.setItem('keel.mode', m); } catch (e) { /* ignore */ } render(); }

/* ================= auto-lock ================= */
let _idleTimer = null;
function armAutoLock() {
  clearTimeout(_idleTimer);
  const mins = +state.settings.autoLock || 0;
  if (!Store.key || !mins || $('.lock-screen')) return;
  _idleTimer = setTimeout(lockNow, mins * 60000);
}
['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, debounce(armAutoLock, 1000), { passive: true }));
function lockNow() {
  if (!Store.key || $('.lock-screen')) return;
  if ($('#present')) { $('#present').remove(); document.body.classList.remove('presenting'); }
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'lock-screen';
  wrap.innerHTML = `<form class="lock-card" id="relock"><div class="brand big">Ọrọ̀</div><p>Ọrọ̀ locked after a period of inactivity.</p>
    <label class="field"><span>Passphrase</span><input type="password" id="relock-pass" autocomplete="current-password" autofocus></label>
    <p class="notice bad small" id="relock-err" hidden>That passphrase didn’t work.</p><button class="btn primary" type="submit">Unlock</button></form>`;
  document.body.appendChild(wrap);
  document.body.classList.add('locked');
  setTimeout(() => $('#relock-pass')?.focus(), 30);
  $('#relock').onsubmit = e => {
    e.preventDefault();
    if ($('#relock-pass').value === Store.pass) { wrap.remove(); document.body.classList.remove('locked'); armAutoLock(); }
    else $('#relock-err').hidden = false;
  };
}
