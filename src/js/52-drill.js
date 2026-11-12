/* ================= What's behind a number =================
   A headline figure opens into the transactions (or accounts) that add up to it, with the same total at the bottom as
   the check. Anything with data-drill="kind|a|b" opens one: a tile, a row, a link; charts call these from spec.pick. */
function drill({ title, sub, head, rows, total, href, hrefLabel, note, empty }) {
  const shown = rows.slice(0, 150);
  const body = `${sub ? `<p class="drill-sub">${sub}</p>` : ''}${head || ''}
    ${rows.length ? `<div class="scroll-table tall"><table class="ledger compact drill-table"><thead><tr><th>Date</th><th>What</th><th class="num">Amount</th></tr></thead>
      <tbody>${shown.map(r => `<tr class="drill-row" data-edit-txn="${esc(r.t.id)}" tabindex="0"><td class="nowrap muted">${dateLabel(r.t.date)}</td><th scope="row">${esc(r.t.payee)}<span class="drill-meta muted small">${esc(r.categoryId ? catName(r.categoryId) : 'Uncategorized')}, ${esc(acctById(r.t.accountId)?.name || 'an account that was removed')}</span></th><td class="num ${r.amount < 0 ? 'drill-back' : ''}">${money(r.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="2" scope="row">${rows.length > shown.length ? `The ${shown.length} largest of ${rows.length}. All ${rows.length} add up to` : `${rows.length === 1 ? 'One transaction' : `${rows.length} transactions`}, adding up to`}</th><td class="num total">${money(total)}</td></tr></tfoot></table></div>` : `<p class="muted">${empty || 'Nothing here yet.'}</p>`}
    ${note ? `<p class="muted small drill-note">${note}</p>` : ''}`;
  const wrap = openModal({ title, body, wide: true, id: 'drill', actions: `${href ? `<a class="btn" href="${href}" data-close>${hrefLabel || 'Open in Transactions'}</a>` : ''}<button class="btn primary" data-close>Done</button>` });
  drawCharts(wrap);
}
/* The lines flowSummary counts as money in ('in') or as spending ('out'), each with what it adds to the figure. */
function flowLines(txs, kind) {
  const out = [];
  for (const t of txs) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (c?.kind === 'transfer') continue;
    const isIn = c ? c.kind === 'income' : l.amount >= 0;
    if ((kind === 'in') === isIn) out.push({ t, categoryId: l.categoryId, amount: round2(isIn ? l.amount : -l.amount) });
  }
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
const TRANSFER_NOTE = 'Card payments and moves between your own accounts are left out.';
function drillFlow(kind, mk = thisMonth()) {
  if (kind === 'kept') return drillKept(mk);
  const txs = lensed(txInMonth(mk)), rows = flowLines(txs, kind), total = round2(sum(rows.map(r => r.amount))), M = monthLabel(mk);
  drill({ title: kind === 'in' ? `Money in, ${M}` : `Spent in ${M}`, rows, total, href: `#/transactions?m=${mk}`, head: kind === 'out' && rows.length ? paceChart(mk, true, 170) : '',
    sub: kind === 'in' ? `Everything that came in${lensActive() ? ` for ${esc(lensLabel())}` : ''}: paychecks, rent, interest and anything else filed as money in.` : `Everything that went out${lensActive() ? ` for ${esc(lensLabel())}` : ''}. Money back shows with a minus and comes off the total.`,
    note: TRANSFER_NOTE, empty: kind === 'in' ? 'No money in recorded this month yet.' : 'No spending recorded this month yet.' });
}
/* Kept = money in − spent, each of which opens in turn. */
function drillKept(mk = thisMonth()) {
  const f = flowSummary(lensed(txInMonth(mk))), M = monthLabel(mk), K = keptWithPayroll(mk), pay = K.savedThroughPay > 0;
  const row = (label, v, d, cls = '') => `<tr class="${cls}"><th scope="row">${d ? `<button class="linklike" data-drill="${d}|${mk}">${label}</button>` : label}</th><td class="num">${money(v)}</td></tr>`;
  openModal({ title: `Kept in ${M}`, id: 'drill', body: `<p class="drill-sub">What came in, less what went out${pay ? ', plus what was saved through pay before it reached the bank' : ''}.</p>
    <table class="ledger compact sched drill-sum"><tbody>${row('Money in', f.income, 'in')}${row('Spent', -f.spending, 'out')}${pay ? `<tr class="drill-pay"><th scope="row"><a href="#/taxes" data-close>Saved through pay</a> <span class="muted small">${esc(payrollKindsText(K.byKind))}</span></th><td class="num">${money(K.savedThroughPay)}</td></tr>` : ''}${row('Kept', K.kept, '', 'net')}</tbody></table>
    <p class="muted small drill-note">${isFinite(K.rate) ? `That is ${pct(K.rate, 0)} of what came in${pay ? ' (counting what was saved through pay)' : ''}. ` : ''}${TRANSFER_NOTE}</p>`, actions: '<button class="btn primary" data-close>Done</button>' });
}
/* One slice of "Where it went": the categories of a group that have spending this month. */
function drillGroup(label, mk = thisMonth()) {
  if (label === 'Everything else') return go(`#/reports?r=spending&p=${mk === thisMonth() ? 'm' : 'lm'}`);
  const txs = lensed(txInMonth(mk)), acts = categoryActuals(txs), rows = [];
  const inGroup = id => id === '_none' ? label === 'Uncategorized' : (c => !!c && c.kind === 'expense' && c.group === label)(catById(id));
  for (const t of txs) for (const l of txLines(t)) {
    const c = catById(l.categoryId); if (c?.kind === 'transfer' || (!c && l.amount > 0)) continue;   // uncategorized money in is income, not part of this slice
    const id = c ? c.id : '_none';
    if ((acts[id] || 0) > 0 && inGroup(id)) rows.push({ t, categoryId: c ? c.id : null, amount: round2(-l.amount) });
  }
  rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const cats = [...new Set(rows.map(r => r.categoryId || '_none'))].map(id => ({ id, v: acts[id] })).sort((a, b) => b.v - a.v);
  const top = cats[0]?.v || 1;
  drill({ title: `${label}, ${monthLabel(mk)}`, rows, total: round2(sum(rows.map(r => r.amount))), href: label === 'Uncategorized' ? `#/transactions?m=${mk}&cat=_none` : `#/transactions?m=${mk}`,
    head: cats.length > 1 ? `<ul class="drill-bars">${cats.slice(0, 6).map(c => `<li><span>${esc(c.id === '_none' ? 'Uncategorized' : catName(c.id))}</span><div class="meter"><span style="width:${(c.v / top * 100).toFixed(1)}%"></span></div><strong class="num">${money(c.v, { cents: false })}</strong></li>`).join('')}</ul>` : '' });
}
function drillCat(catId, mk = thisMonth()) {
  const c = catById(catId), txs = lensed(txInMonth(mk)), rows = [];
  for (const t of txs) for (const l of txLines(t)) {
    const lc = catById(l.categoryId);
    if (c ? lc === c : !lc && l.amount <= 0) rows.push({ t, categoryId: c ? c.id : null, amount: round2(c?.kind === 'income' ? l.amount : -l.amount) });
  }
  rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const v = c && c.kind === 'expense' && c.budget > 0 ? budgetView(c, mk) : null;
  drill({ title: `${c ? c.name : 'Uncategorized'}, ${monthLabel(mk)}`, rows, total: round2(sum(rows.map(r => r.amount))), href: `#/transactions?m=${mk}&cat=${encodeURIComponent(catId)}`,
    sub: v ? (v.period === 'year' ? `${money(v.actual, { cents: false })} of ${money(v.budget, { cents: false })} for the year so far.` : `Budget ${money(v.budget + (v.carry || 0), { cents: false })}${v.carry ? ` (${money(v.budget, { cents: false })} plus ${money(v.carry, { cents: false })} carried over)` : ''}: ${v.available >= 0 ? `${money(v.available, { cents: false })} left` : `${money(-v.available, { cents: false })} over`}.`) : '' });
}
/* What counts as a day's spending on the Daily spending calendar: flexible spending, not the fixed bills. */
function isDailySpend(l) { const c = catById(l.categoryId); return c ? c.kind === 'expense' && !c.rental && !/Mortgage|Auto payment|Childcare/.test(c.name) : l.amount < 0; }
function drillDay(iso) {
  const rows = [];
  for (const t of lensed(state.transactions.filter(x => x.date === iso))) for (const l of txLines(t)) if (isDailySpend(l)) rows.push({ t, categoryId: l.categoryId, amount: round2(-l.amount) });
  rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  drill({ title: `Spent on ${dateLabel(iso, true)}`, rows, total: round2(sum(rows.map(r => r.amount))), href: `#/transactions?m=${iso.slice(0, 7)}`, hrefLabel: `Open ${MONTHS[+iso.slice(5, 7) - 1]} in Transactions`, note: 'Mortgage, rent and other fixed bills are left out of the daily picture.' });
}
/* A month in one window: in, out, kept, and where the spending went. */
function drillMonth(mk) {
  const txs = lensed(txInMonth(mk)), f = flowSummary(txs), groups = spendByGroup(txs), top = groups[0]?.value || 1;
  openModal({ title: monthLabel(mk), id: 'drill', wide: true, body: `
    <dl class="kpis three drill-kpis"><div><dt>Money in</dt><dd class="num pos">${money(f.income, { cents: false })}</dd><button class="linklike small" data-drill="in|${mk}">See each one</button></div>
      <div><dt>Spent</dt><dd class="num">${money(f.spending, { cents: false })}</dd><button class="linklike small" data-drill="out|${mk}">See each one</button></div>
      <div><dt>Kept</dt><dd class="num ${signClass(f.net)}">${money(f.net, { cents: false })}</dd><span class="muted small">${isFinite(f.rate) ? `${pct(f.rate, 0)} of what came in` : ''}</span></div></dl>
    ${groups.length ? `<h3>Where it went</h3><ul class="drill-bars">${groups.slice(0, 8).map(g => `<li><button class="linklike" data-drill="group|${esc(g.label)}|${mk}">${esc(g.label)}</button><div class="meter"><span style="width:${(g.value / top * 100).toFixed(1)}%"></span></div><strong class="num">${money(g.value, { cents: false })}</strong></li>`).join('')}</ul>` : '<p class="muted">No spending recorded that month.</p>'}`,
    actions: `<a class="btn" href="#/transactions?m=${mk}" data-close>Open in Transactions</a><button class="btn primary" data-close>Done</button>` });
}
/* Net worth from one month's end to the next, account by account (the same accounts the figure counts). */
function netWorthMoves(mk) {
  const prev = addMonths(mk, -1), a0 = state.snapshots[prev] || {}, cur = mk === thisMonth();
  const a1 = cur ? Object.fromEntries(activeAccounts().map(a => [a.id, signedValue(a)])) : state.snapshots[mk] || {};
  const rows = [];
  for (const id of new Set([...Object.keys(a0), ...Object.keys(a1)])) {
    const a = acctById(id);
    if (a ? !nwIncludes(a, true) : lensActive()) continue;
    const was = a0[id] || 0, now = a1[id] || 0;
    if (Math.abs(now - was) >= 0.5) rows.push({ id, name: a ? a.name : 'An account since removed', was, now, d: round2(now - was), isNew: !(id in a0) });
  }
  return rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
}
function drillNetWorth(mk = thisMonth()) {
  const prev = addMonths(mk, -1), rows = netWorthMoves(mk), total = round2(sum(rows.map(r => r.d))), P = MONTHS[+prev.slice(5) - 1];
  if (!state.snapshots[prev]) return openModal({ title: `Net worth, ${monthLabel(mk)}`, id: 'drill', body: `<p class="muted">There’s no record of ${monthLabel(prev)} to compare with. History builds month by month; you can add past balances from each account’s History.</p>`, actions: '<button class="btn primary" data-close>Done</button>' });
  openModal({ title: `What changed in ${monthLabel(mk)}`, id: 'drill', wide: true, body: `<p class="drill-sub">Each account from the end of ${P} to ${mk === thisMonth() ? 'today' : `the end of ${MONTHS[+mk.slice(5) - 1]}`}. What you owe counts as a minus, so paying a loan down shows as a plus.</p>
    ${rows.length ? `<div class="scroll-table tall"><table class="ledger compact drill-table"><thead><tr><th>Account</th><th class="num">End of ${P}</th><th class="num">${mk === thisMonth() ? 'Now' : `End of ${MON[+mk.slice(5) - 1]}`}</th><th class="num">Change</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="drill-row" ${acctById(r.id) ? `data-edit-acct="${esc(r.id)}" tabindex="0"` : ''}><th scope="row">${esc(r.name)}${r.isNew ? ' <span class="tag soft">new</span>' : ''}</th><td class="num muted">${money(r.was, { cents: false })}</td><td class="num">${money(r.now, { cents: false })}</td><td class="num ${signClass(r.d)}">${money(r.d, { cents: false, sign: true })}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3" scope="row">Change in ${esc(nwLabel().toLowerCase())}</th><td class="num total ${signClass(total)}">${money(total, { cents: false, sign: true })}</td></tr></tfoot></table></div>` : '<p class="muted">No account changed.</p>'}`,
    actions: `<a class="btn" href="#/reports?r=networth" data-close>Net worth report</a><button class="btn primary" data-close>Done</button>` });
}
const DRILLS = { in: mk => drillFlow('in', mk), out: mk => drillFlow('out', mk), kept: mk => drillKept(mk), group: (label, mk) => drillGroup(label, mk), cat: (id, mk) => drillCat(id, mk), day: iso => drillDay(iso), month: mk => drillMonth(mk), nw: mk => drillNetWorth(mk) };
function runDrill(s) { const [k, a, b] = String(s).split('|'); DRILLS[k]?.(a || undefined, b || undefined); }
document.addEventListener('click', e => { const el = e.target.closest?.('[data-drill]'); if (!el || e.target.closest('a[href], input, select') ) return; e.preventDefault(); runDrill(el.dataset.drill); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if (el?.matches?.('[data-drill]:not(button), tr.drill-row[tabindex]')) { e.preventDefault(); el.click(); }
});

/* ---------- the pace of a month's spending ----------
   Spending added up day by day: this month so far, last month, and the usual (the three months before, averaged).
   The same lines Spent counts (transfers left out, money back taken off). */
function spendCumulative(mk, useLens) {
  const txs = useLens ? lensed(txInMonth(mk)) : txInMonth(mk), dim = +monthEnd(mk).slice(8), day = new Array(dim + 1).fill(0);
  for (const r of flowLines(txs, 'out')) day[+r.t.date.slice(8)] += r.amount;
  const out = []; let run = 0;
  for (let d = 1; d <= dim; d++) { run += day[d]; out.push(round2(run)); }
  return out;
}
function spendPace(mk = thisMonth(), useLens = false) {
  const cur = mk === thisMonth(), dim = +monthEnd(mk).slice(8), upto = cur ? new Date().getDate() : dim;
  const at = (arr, d) => arr[Math.min(d, arr.length) - 1];   // a shorter month holds its last day's total
  const prior = [1, 2, 3].map(i => addMonths(mk, -i)).filter(m => m >= firstTxMonth()).map(m => spendCumulative(m, useLens));
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  return { dim, upto, days, now: spendCumulative(mk, useLens).slice(0, upto), last: prior[0] ? days.map(d => at(prior[0], d)) : [],
    usual: prior.length ? days.map(d => round2(sum(prior.map(a => at(a, d))) / prior.length)) : [], months: prior.length };
}
function paceChart(mk = thisMonth(), useLens = false, h = 190) {
  const P = spendPace(mk, useLens), M = MONTHS[+mk.slice(5) - 1], L = MONTHS[+addMonths(mk, -1).slice(5) - 1], sm = n => money(n, { cents: false });
  if (!P.usual.length) return '';
  const pts = arr => arr.map((y, i) => ({ x: i + 1, y }));
  return chartHost({ h, padL: 52, label: `Spending day by day in ${M}, against ${L} and the usual`, xFmt: x => `${x}`,
    series: [{ name: 'The usual', points: pts(P.usual), color: 'var(--muted-2)', dash: true, nodots: true }, { name: L, points: pts(P.last), color: 'var(--c3)', nodots: true }, { name: M, points: pts(P.now), color: 'var(--ink-accent)', area: true, nodots: true }],
    tip: i => `<strong>${M} ${i + 1}</strong>${P.now[i] != null ? `<br><i class="tip-key" style="background:var(--ink-accent)"></i>${sm(P.now[i])} so far` : ''}<br><i class="tip-key" style="background:var(--muted-2)"></i>${sm(P.usual[i])} usual by now${P.last[i] != null ? `<br><i class="tip-key" style="background:var(--c3)"></i>${sm(P.last[i])} in ${L}` : ''}` }) +
    `<p class="legend"><span><i style="background:var(--ink-accent)"></i>${M}</span><span><i style="background:var(--c3)"></i>${L}</span><span><i style="background:var(--muted-2)"></i>The usual (the ${P.months === 1 ? 'month' : `${P.months} months`} before, averaged)</span></p>`;
}
DRILLS.tx = id => txnModal(id);
