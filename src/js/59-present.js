/* ================= Money date: the month, one page at a time, for the two of you =================
   It has an evening look of its own (deep forest, with the àdìrẹ field), a strip of cloth that is woven as you go, the few
   things that matter up front, and every chart and figure opens into what's behind it without leaving the date. */
const MD = { i: 0, mk: null, slides: [], dir: 1, lens: '' };
/* A Yoruba proverb for the first page: it is with the hands gathered together that we beat the chest. */
const MD_PROVERB = ['Àgbájọ ọwọ́ la fi ń sọ̀yà.', 'We are strongest with our hands together.'];
function startMoneyDate(mk) {
  const lm = addMonths(thisMonth(), -1);
  MD.mk = mk || (state.transactions.some(t => t.date.startsWith(lm)) ? lm : thisMonth());
  MD.i = 0; MD.dir = 1;
  if (!$('#present')) { MD.lens = UI.lens; UI.lens = ''; }   // a Money date is about the whole household
  MD.slides = buildSlides(MD.mk);
  let el = $('#present');
  if (!el) { el = document.createElement('div'); el.id = 'present'; el.className = 'present'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Money date'); document.body.appendChild(el); }
  document.body.classList.add('presenting');
  paintSlide();
}
/* Swipe left or right between pages on a phone or iPad (a finger on a chart reads the chart instead) */
document.addEventListener('touchstart', e => {
  const el = e.target.closest?.('#present .slide'); if (!el || e.touches.length !== 1 || e.target.closest('textarea, input, select, button, .chart-host')) { MD.swipe = null; return; }
  MD.swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  const s = MD.swipe; MD.swipe = null; if (!s || !$('#present') || $('#modal')) return;
  const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 700) { if (dx > 0) mdAction('prev'); else if (MD.i < MD.slides.length - 1) mdAction('next'); }
}, { passive: true });
function endMoneyDate() {
  if (!$('#present')) return;
  $('#present').remove(); document.body.classList.remove('presenting');
  if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  UI.lens = MD.lens || '';
  render();
}
function paintSlide() {
  const el = $('#present'); if (!el) return;
  for (const k in ChartSpecs) delete ChartSpecs[k];
  const n = MD.slides.length, s = MD.slides[MD.i], last = MD.i === n - 1;
  el.dataset.kind = s.kind || '';
  el.innerHTML = `
    <header class="present-top"><span class="brand" title="Ọrọ̀ is Yoruba for wealth">${BRAND_MARK}</span><span class="present-title">Money date · ${monthLabel(MD.mk)}</span>
      <div class="present-prog" role="group" aria-label="Pages">${MD.slides.map((x, k) => `<button type="button" class="${k === MD.i ? 'on' : k < MD.i ? 'done' : ''}" data-md="go:${k}" aria-label="Page ${k + 1}: ${esc(x.title)}"${k === MD.i ? ' aria-current="step"' : ''}></button>`).join('')}</div>
      ${document.fullscreenEnabled && !isTouch() ? '<button class="icon-btn present-full" data-md="full" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' : ''}
      <button class="icon-btn" data-md="close" aria-label="Exit Money date">×</button></header>
    <section class="slide ${MD.dir < 0 ? 'back' : MD.dir > 0 ? 'fwd' : 'still'}" aria-live="polite"><div class="slide-in">${s.html()}</div></section>
    <footer class="present-nav"><button class="btn ghost" data-md="prev" ${MD.i ? '' : 'disabled'}>Back</button><span class="muted">${MD.i + 1} of ${n} · ${esc(s.title)}</span><button class="btn primary" data-md="next">${last ? 'Finish' : MD.i === 0 ? 'Begin' : 'Next'}</button></footer>`;
  if (MD.dir) CHART.page = null;   // a new page's charts draw themselves in
  drawCharts(el);
}
/* Something changed underneath (a transaction filed from a page of the date): work the pages out again, in place. */
function mdRefresh() {
  const el = $('#present'); if (!el || el.querySelector('textarea:focus')) return;
  MD.slides = buildSlides(MD.mk); MD.i = Math.min(MD.i, MD.slides.length - 1); MD.dir = 0;
  const y = el.querySelector('.slide')?.scrollTop || 0;
  paintSlide();
  if (y) el.querySelector('.slide').scrollTop = y;
}
function buildSlides(mk) {
  const prev = addMonths(mk, -1), cur = mk === thisMonth(), sm = n => money(n, { cents: false });
  const txs = txInMonth(mk), f = flowSummary(txs);
  const avg = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i))));
  const avgSpend = sum(avg.map(x => x.spending)) / 3;
  const endNW = cur ? totals().netWorth : snapshotNW(mk), startNW = snapshotNW(prev);
  const nwChange = endNW != null && startNW != null ? endNW - startNW : null;
  const M = MONTHS[+mk.slice(5) - 1], P = MONTHS[+prev.slice(5) - 1];
  const groups = spendByGroup(txs), items = donutItems(groups, 6), spendTotal = sum(groups.map(g => g.value));
  const exp = state.categories.filter(c => c.kind === 'expense' && c.period !== 'year' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) }));
  // under or over counts what a rollover category carried, as Budget, Overview and Check-in do
  const wins = exp.filter(x => x.v.available > 0.005).sort((a, b) => b.v.available - a.v.available).slice(0, 4);
  const misses = exp.filter(x => x.v.available < -0.005).sort((a, b) => a.v.available - b.v.available).slice(0, 4);
  const notes = insights(mk, { limit: 4 });
  const adults = people().filter(m => roleOf(m.id) === 'adult').map(m => m.name);
  const who = adults.length === 2 ? `${adults[0]} and ${adults[1]}` : adults.length === 1 ? adults[0] : '';
  const slides = [];
  slides.push({ title: 'Welcome', kind: 'cover', html: () => `<div class="md-cover">
      <p class="md-kicker">Money date</p>
      <h1 class="md-month">${M} <span>${mk.slice(0, 4)}</span></h1>
      <div class="md-band" aria-hidden="true"></div>
      <p class="slide-lede">${who ? `${esc(who)}: the` : 'The'} month in ${slides.length} short pages. Tap any chart or figure to see what’s behind it.</p>
      <p class="md-proverb"><span lang="yo">${MD_PROVERB[0]}</span> ${MD_PROVERB[1]}</p></div>` });
  slides.push({ title: 'The big picture', kind: 'big', html: () => `<div class="slide-center">
      <p class="eyebrow-plain">${monthLabel(mk)}</p>
      <h1 class="slide-h">${f.net >= 0 ? `We kept <span class="num pos">${sm(f.net)}</span> ${cur ? 'so far this month' : 'this month'}.` : `We spent <span class="num neg">${sm(-f.net)}</span> more than came in.`}</h1>
      <p class="slide-lede">${sm(f.income)} came in and ${sm(f.spending)} went out${nwChange != null ? `, and our net worth ${nwChange >= 0 ? 'grew' : 'fell'} by ${sm(Math.abs(nwChange))}` : ''}.</p>
      <div class="md-trio">
        <button class="md-fig" data-drill="in|${mk}"><span>Came in</span><strong class="num">${sm(f.income)}</strong></button>
        <button class="md-fig" data-drill="out|${mk}"><span>Went out</span><strong class="num">${sm(f.spending)}</strong></button>
        <button class="md-fig" data-drill="kept|${mk}"><span>Kept</span><strong class="num ${signClass(f.net)}">${sm(f.net)}</strong></button></div></div>` });
  slides.push({ title: 'What matters', kind: 'matters', html: () => `<h2 class="slide-h2">What matters ${cur ? 'now' : `from ${M}`}</h2>${briefPanel(mk, { head: false, big: true, inert: true, max: 3 })}` });
  if (endNW != null) {
    const series = netWorthSeries().filter(p => p.x <= mk).slice(-13);
    const bk = BUCKETS.map(b => { const s = cur ? null : state.snapshots[mk] || {}; const v = s ? sum(Object.entries(s).filter(([id]) => ACCOUNT_TYPES[acctById(id)?.type]?.bucket === b.id && acctInEstate(acctById(id))).map(([, x]) => x)) : (b.id === 'debt' ? -totals().debt : totals()[b.id]); return { b, v }; });
    const moves = startNW != null ? netWorthMoves(mk).slice(0, 3) : [];
    slides.push({ title: 'Net worth', kind: 'nw', html: () => `<div class="slide-split">
      <div><p class="eyebrow-plain">What we own, minus what we owe</p><p class="slide-num num">${sm(endNW)}</p>${startNW != null ? `<p class="slide-lede">${deltaChip(endNW, startNW, { pct: true })} since the end of ${P}</p>` : ''}
        <ul class="slide-bars">${bk.map(({ b, v }) => `<li><span>${esc(b.label)}</span><span class="num ${v < 0 ? 'neg' : ''}">${sm(v)}</span></li>`).join('')}</ul></div>
      <div>${chartHost({ h: 280, label: 'Net worth by month', series: [{ points: series, color: 'var(--ink-accent)', area: true }], xFmt: x => MON[+x.slice(5) - 1], pick: i => drillNetWorth(series[i].x), pickLabel: 'See what changed', tip: i => `<strong>${monthLabel(series[i].x)}</strong><br>${sm(series[i].y)}` })}
        ${moves.length ? `<div class="md-moves"><h3>What moved it most</h3><ul class="simple-list">${moves.map(r => `<li><span>${esc(r.name)}</span><span></span><span class="num ${signClass(r.d)}">${money(r.d, { cents: false, sign: true })}</span></li>`).join('')}</ul><button class="linklike md-more" data-drill="nw|${mk}">See every account</button></div>` : ''}</div></div>` });
  }
  slides.push({ title: 'Money in and out', kind: 'io', html: () => {
    const mx = Math.max(f.income, f.spending, 1), ms = Array.from({ length: 6 }, (_, i) => addMonths(mk, i - 5)), kept = ms.map(m => flowSummary(txInMonth(m)).net);
    return `<div class="slide-split">
      <div><h2 class="slide-h2">In and out</h2>
        <div class="io-bars"><button class="io-row" data-drill="in|${mk}"><span>Came in</span><div class="io-track"><span style="width:${f.income / mx * 100}%;background:var(--pos)"></span></div><strong class="num">${sm(f.income)}</strong></button>
        <button class="io-row" data-drill="out|${mk}"><span>Went out</span><div class="io-track"><span style="width:${f.spending / mx * 100}%;background:var(--c4)"></span></div><strong class="num">${sm(f.spending)}</strong></button></div>
        <p class="slide-lede">Spending was ${avgSpend ? `${sm(Math.abs(f.spending - avgSpend))} ${f.spending > avgSpend ? 'more' : 'less'} than` : 'compared with'} our usual month.</p>
        <div class="md-mini"><h3>Kept, the last six months</h3>${chartHost({ type: 'bars', h: 150, label: 'Kept by month', labels: ms.map(m => MON[+m.slice(5) - 1]), series: [{ name: 'Kept', values: kept, color: 'var(--ink-accent)' }], pick: i => drillMonth(ms[i]), pickLabel: 'Open the month', tip: i => `<strong>${monthLabel(ms[i])}</strong><br>Kept ${money(kept[i], { cents: false })}` })}</div></div>
      <div class="slide-center">${ring(isFinite(f.rate) ? Math.max(0, f.rate) : 0, { size: 220, width: 20, label: isFinite(f.rate) ? pct(f.rate, 0) : '—', color: f.rate >= 0.2 ? 'var(--pos)' : f.rate >= 0 ? 'var(--ink-accent)' : 'var(--neg)' })}<p class="slide-lede">of what came in, we kept</p></div></div>`;
  } });
  if (items.length) slides.push({ title: 'Where it went', kind: 'where', html: () => `<div class="slide-split">
      <div>${chartHost({ type: 'donut', h: 330, label: 'Where the money went', items, center: { value: sm(spendTotal), label: 'spent' }, pick: it => drillGroup(it.label, mk) })}</div>
      <div><h2 class="slide-h2">Where it went</h2>${legendList(items, spendTotal)}
      <p class="slide-lede">${groups[0] ? `${esc(groups[0].label)} was the biggest piece at ${pct(groups[0].value / spendTotal, 0)}.` : ''}</p></div></div>` });
  if (wins.length || misses.length) slides.push({ title: 'Budget', kind: 'budget', html: () => `<h2 class="slide-h2 center">How the budget did</h2><div class="slide-split top">
      <div class="wins"><h3>Under budget</h3>${wins.length ? wins.map(x => `<button class="wm good" data-drill="cat|${x.c.id}|${mk}"><span>${esc(x.c.name)}</span><strong class="num">${sm(x.v.available)} under</strong>${bar(x.v.actual, x.v.budget + (x.v.carry || 0))}</button>`).join('') : '<p class="muted">Nothing came in under.</p>'}</div>
      <div class="misses"><h3>Over budget</h3>${misses.length ? misses.map(x => `<button class="wm bad" data-drill="cat|${x.c.id}|${mk}"><span>${esc(x.c.name)}</span><strong class="num">${sm(-x.v.available)} over</strong>${bar(x.v.actual, x.v.budget + (x.v.carry || 0))}</button>`).join('') : '<p class="slide-lede pos">Every category stayed within budget.</p>'}</div></div>` });
  if (people().length > 1) {
    const per = people().map(m => ({ m, f: flowSummary(txs.filter(t => personOf(t) === m.id)), a: categoryActuals(txs.filter(t => personOf(t) === m.id)) })).filter(x => x.f.spending > 0);
    const tot = sum(per.map(x => x.f.spending)) || 1;
    if (per.length > 1) slides.push({ title: 'Who spent what', kind: 'who', html: () => `<h2 class="slide-h2 center">Who spent what</h2>
      <div class="stack huge">${per.map(x => `<span style="width:${x.f.spending / tot * 100}%;background:${memberColor(x.m.id)}"></span>`).join('')}</div>
      <div class="people-cards">${per.map(x => `<div class="person-card" style="--pc:${memberColor(x.m.id)}"><span class="person-name">${esc(x.m.name)}</span><span class="s-value num">${sm(x.f.spending)}</span><span class="muted">${pct(x.f.spending / tot, 0)}</span><ul>${Object.entries(x.a).filter(([id, v]) => v > 0 && catById(id)?.kind === 'expense').sort((p, q) => q[1] - p[1]).slice(0, 3).map(([id, v]) => `<li><span>${esc(catName(id))}</span><span class="num">${sm(v)}</span></li>`).join('')}</ul></div>`).join('')}</div>` });
  }
  if (state.goals.length) slides.push({ title: 'Goals', kind: 'goals', html: () => `<h2 class="slide-h2 center">Our goals</h2><div class="goal-strip big">${state.goals.map(goalTile).join('')}</div>` });
  const nextFrom = cur ? today() : `${addMonths(mk, 1)}-01`;
  const ahead = []; for (const r of state.recurring) for (const d of occurrences(r, nextFrom, addDays(nextFrom, 40))) ahead.push({ d, r });
  ahead.sort((a, b) => a.d.localeCompare(b.d));
  slides.push({ title: 'Looking ahead', kind: 'ahead', html: () => `<div class="slide-split top">
      <div><h2 class="slide-h2">Looking ahead</h2>
        ${notes.length ? `<ul class="insights big">${notes.map(n => `<li class="${n.tone}">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="slide-lede">Nothing unusual to flag.</p>'}</div>
      <div><h3>Bills in the next few weeks</h3><ul class="simple-list">${ahead.filter(x => Math.abs(x.r.amount) >= 50).slice(0, 8).map(x => `<li><span class="date-chip">${dateLabel(x.d)}</span><span>${esc(x.r.name)}</span><span class="num ${signClass(x.r.amount)}">${sm(x.r.amount)}</span></li>`).join('') || '<li class="muted">None scheduled.</li>'}</ul></div></div>` });
  slides.push({ title: 'Decisions', kind: 'decide', html: () => { const open = whatMatters(mk).decide.slice(0, 4); return `<div class="slide-narrow"><h2 class="slide-h2">What we decided</h2>
      ${open.length ? `<div class="md-settle"><h3>Still to settle</h3><ul>${open.map(o => `<li>${esc(o.text)}</li>`).join('')}</ul></div>` : ''}
      <p class="slide-lede">Write down anything you agreed to change. It’s saved with ${M}’s review.</p>
      <textarea data-review-notes="${mk}" rows="6" placeholder="e.g. Move $300 a month from dining out to the roof fund">${esc(state.reviews[mk]?.notes || '')}</textarea>
      <div class="actions"><button class="btn primary" data-md="done">Mark ${M} as reviewed</button></div>
      <p class="slide-sign"><span class="wordmark">Ọrọ̀</span> · ${ORO_TAGLINE}</p></div>`; } });
  return slides;
}
function mdAction(a) {
  if (a === 'close') return endMoneyDate();
  if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); return; }
  if (a.startsWith('go:')) { const k = clamp(+a.slice(3), 0, MD.slides.length - 1); if (k !== MD.i) { MD.dir = k > MD.i ? 1 : -1; MD.i = k; paintSlide(); } return; }
  if (a === 'prev' && MD.i > 0) { MD.i--; MD.dir = -1; return paintSlide(); }
  if (a === 'next') { if (MD.i < MD.slides.length - 1) { MD.i++; MD.dir = 1; return paintSlide(); } return endMoneyDate(); }
  if (a === 'done') { (state.reviews[MD.mk] = state.reviews[MD.mk] || {}).completedAt = today(); commit({ silent: true }); toast(`${monthLabel(MD.mk)} marked as reviewed.`); return endMoneyDate(); }
}

/* ================= command palette ================= */
const PAL = { items: [], sel: 0 };
function paletteItems(q) {
  q = q.trim().toLowerCase();
  const out = [];
  for (const [id, label] of shownPages()) out.push({ group: 'Go to', label, run: () => go(`#/${id}`) });
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
  holdPage(true); fitModal();
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
  openModal({ title: 'Keyboard shortcuts', body: `<dl class="shortcuts">${[['⌘K', 'Search or jump anywhere'], ['T', 'Talk: change things by saying them'], ['N', 'New transaction'], ['I', 'Import'], ['/', 'Search transactions'], ['G, O', 'Overview'], ['G, T', 'Transactions'], ['G, B', 'Budget'], ['G, C', 'Cash flow'], ['G, A', 'Accounts'], ['G, I', 'Investments'], ['G, P', 'Property'], ['G, R', 'Reports'], ['G, L', 'Planning'], ['G, X', 'Taxes'], ['G, M', 'Monthly review'], ['G, S', 'Settings'], ['⇧P', 'Hide or show amounts'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['← →', 'Move through a Money date']].map(([k, l]) => `<div><dt><kbd>${k}</kbd></dt><dd>${l}</dd></div>`).join('')}</dl>` });
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
  UI.sticky = {}; UI.sorts = {}; UI.txSel = null;   // filters, column sorts and ticked rows start fresh after a lock
  ciReset();        // and so does a check-in
  closeTalk(); Object.assign(TALK, { draft: null, heard: '', last: null, ai: null, queue: [], aiThread: null }); UI.talkCtx = null; aiCancel(); aiThreadForget(); BANKS.key = null;
  if ($('#present')) { $('#present').remove(); document.body.classList.remove('presenting'); }
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'lock-screen';
  wrap.innerHTML = `<form class="lock-card" id="relock"><div class="brand big">${BRAND_MARK}</div><p class="brand-tag">${ORO_MEANING} · ${ORO_TAGLINE}</p><p>Ọrọ̀ locked after a period of inactivity.</p>
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
