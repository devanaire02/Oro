/* ================= What matters now =================
   The few things worth seeing first, in four plain groups: what needs a decision, what's off track, what's going well
   and what changed. Each line opens the page or the numbers behind it. It leads Overview and the Money date, so the
   important things are in front of you without hunting. Everything is worked out on the device from your own data. */
const BRIEF_GROUPS = [['decide', 'Needs a decision', 'Nothing is waiting on you.'], ['off', 'Off track', 'Nothing is off track.'], ['well', 'Going well', 'Nothing to call out yet.'], ['changed', 'What changed', 'No big changes.']];
/* Spending through the same day of the month, averaged over the three months before: "usual by now". */
function usualSpendByDay(mk, day) {
  const xs = [1, 2, 3].map(i => { const m = addMonths(mk, -i), cut = `${m}-${pad2(Math.min(day, +monthEnd(m).slice(8)))}`; return flowSummary(lensed(txInMonth(m)).filter(t => t.date <= cut)); });
  return xs.some(x => x.spending > 0) ? sum(xs.map(x => x.spending)) / 3 : null;
}
function whatMatters(mk = thisMonth()) {
  const cur = mk === thisMonth(), prev = addMonths(mk, -1), M = MONTHS[+mk.slice(5) - 1], P = MONTHS[+prev.slice(5) - 1], sm = n => money(n, { cents: false });
  const txs = lensed(txInMonth(mk)), f = flowSummary(txs);
  const G = { decide: [], off: [], well: [], changed: [] };
  const add = (k, w, text, to = {}) => G[k].push({ w, text, ...to });

  // ---- needs a decision: the things only you can settle (the same list as Needs attention)
  attentionItems().forEach((a, i) => { if (a.k !== 'off') add('decide', (a.tone === 'warn' ? 900 : 500) - i, a.text, a.act ? { act: a.act } : { go: a.go }); });

  // ---- off track: budgets, goals, cash
  const notes = insights(mk, { limit: 12 });
  for (const n of notes) if (n.tone === 'bad' || n.tone === 'warn') add('off', (n.tone === 'bad' ? 1000 : 400) + n.w, n.text, n.drill ? { drill: n.drill } : { go: n.go || '#/budget' });
  if (cur) for (const a of attentionItems()) if (a.k === 'off' && /Cash is projected/.test(a.text)) add('off', 5000, a.text + '.', { go: a.go });

  // ---- going well
  const K = keptWithPayroll(mk);   // counts what was saved through pay, when there are pay stubs in the month
  if (K.moneyIn + K.savedThroughPay > 0 && K.kept > 0) {
    const xs = [1, 2, 3].map(i => keptWithPayroll(addMonths(mk, -i))), base = sum(xs.map(x => x.moneyIn + x.savedThroughPay)), usual = base > 0 ? sum(xs.map(x => x.kept)) / base : NaN;
    add('well', 900, `Kept ${sm(K.kept)} ${cur ? 'so far this month' : `in ${M}`}${K.savedThroughPay > 0 ? `, counting ${sm(K.savedThroughPay)} saved through pay:` : ','} ${pct(K.rate, 0)} of what came in${!cur && isFinite(usual) && K.rate > usual + 0.03 ? `, better than the usual ${pct(usual, 0)}` : ''}.`, { drill: `kept|${mk}` });
  }
  const billCats = new Set(state.recurring.map(r => r.categoryId));
  const flex = state.categories.filter(c => c.kind === 'expense' && c.budget > 0 && c.period !== 'year' && !c.rental && !billCats.has(c.id)).map(c => budgetView(c, mk));
  if (flex.length >= 3) {
    const dim = +monthEnd(mk).slice(8), share = cur ? new Date().getDate() / dim : 1;
    const ok = flex.filter(v => v.actual <= (v.budget + (v.carry || 0)) * Math.min(1, share * 1.15) + 0.5).length;
    if (ok / flex.length >= 0.6) add('well', 600, cur ? `${ok} of ${flex.length} flexible budgets are on pace.` : `${ok} of ${flex.length} flexible budgets came in at or under.`, { go: `#/budget${cur ? '' : `?m=${mk}`}` });
  }
  const gp = state.goals.map(g => ({ g, p: goalProgress(g) }));
  for (const { g } of gp.filter(x => x.p.status === 'done')) add('well', 700, `${g.name} is fully funded.`, { go: '#/planning' });
  const onTrack = gp.filter(x => x.p.status === 'on' && x.g.monthly != null && x.g.monthly !== '');
  if (onTrack.length) add('well', 500, onTrack.length === 1 ? `${onTrack[0].g.name} is on track.` : `${onTrack.length} goals are on track: ${onTrack.slice(0, 2).map(x => x.g.name).join(', ')}${onTrack.length > 2 ? '…' : ''}.`, { go: '#/planning' });
  if (cur && state.recurring.length && forecastAccounts(true).length) {
    const fc = forecast(60, true);
    if (fc.low.y > 0 && fc.low.y >= (state.settings.lowCash || 0)) add('well', 300, `Cash on hand stays above ${sm(Math.floor(fc.low.y / 100) * 100)} for the next 60 days.`, { go: '#/cashflow' });
  }
  if (cur) {   // how long the cash on hand would cover the usual month's spending
    const usual = sum([1, 2, 3].map(i => flowSummary(lensed(txInMonth(addMonths(mk, -i)))).spending)) / 3, cash = totals(true).cash;
    if (usual > 0 && cash > 0) {
      const n = cash / usual;
      if (n >= 3) add('well', 250, `Cash on hand would cover about ${n >= 10 ? Math.round(n) : Math.round(n * 2) / 2} months of usual spending.`, { go: '#/accounts' });
      else if (n < 1) add('off', 800, `Cash on hand covers less than a month of usual spending.`, { go: '#/cashflow' });
    }
  }
  for (const n of notes) if (n.tone === 'good' && !/fully funded|^You kept/.test(n.text)) add('well', n.w, n.text, { go: n.go || '#/reports' });

  // ---- what changed
  const endNW = cur ? totals(true).netWorth : snapshotNW(mk, true), startNW = snapshotNW(prev, true);
  if (endNW != null && startNW != null && Math.abs(endNW - startNW) >= 1) {
    const d = endNW - startNW, top = netWorthMoves(mk).find(r => Math.sign(r.d) === Math.sign(d));
    add('changed', 900, `${nwLabel()} is ${d > 0 ? 'up' : 'down'} ${sm(Math.abs(d))} since the end of ${P}${top && Math.abs(top.d) >= Math.abs(d) * 0.25 ? `, mostly ${top.name} (${money(top.d, { cents: false, sign: true })})` : ''}.`, { drill: `nw|${mk}` });
  }
  if (cur) {
    const day = new Date().getDate(), usual = usualSpendByDay(mk, day);
    if (usual != null && day >= 5 && Math.abs(f.spending - usual) >= Math.max(150, usual * 0.08)) add('changed', 700, `Spent ${sm(f.spending)} so far, ${sm(Math.abs(f.spending - usual))} ${f.spending > usual ? 'more' : 'less'} than usual by the ${ordinal(day)}.`, { drill: `out|${mk}` });
  } else {
    const avg = sum([1, 2, 3].map(i => flowSummary(lensed(txInMonth(addMonths(mk, -i)))).spending)) / 3;
    if (avg > 0 && Math.abs(f.spending - avg) >= Math.max(150, avg * 0.08)) add('changed', 700, `Spending was ${sm(Math.abs(f.spending - avg))} ${f.spending > avg ? 'more' : 'less'} than a usual month.`, { drill: `out|${mk}` });
  }
  for (const n of notes) if (n.tone === 'info') add('changed', n.w, n.text, n.drill ? { drill: n.drill } : { go: n.go || '#/reports' });
  if (cur) for (const c of priceChanges().slice(0, 3)) add('changed', 600 + Math.abs(c.now - c.was) * 12, `${prettyPayee(c.payee) || c.payee} went from ${money(c.was)} to ${money(c.now)} a month, ${sm(Math.abs(c.now - c.was) * 12)} ${c.now > c.was ? 'more' : 'less'} a year.`, { drill: `tx|${c.id}` });

  for (const k in G) G[k].sort((a, b) => b.w - a.w);
  return G;
}
/* One line of the brief, as a link, an action or a way into the numbers. */
function briefLine(it, inert) {
  const t = esc(it.text);
  if (inert && !it.drill) return `<li><span class="brief-line still">${t}</span></li>`;
  return `<li>${it.drill ? `<button class="brief-line" data-drill="${esc(it.drill)}">${t}</button>` : it.act ? `<button class="brief-line" data-act="${esc(it.act)}">${t}</button>` : `<a class="brief-line" href="${esc(it.go || '#/overview')}">${t}</a>`}</li>`;
}
const BRIEF_MORE = { decide: () => (checkinOn() ? '#/checkin' : '#/transactions?cat=_none&m=all'), off: () => '#/budget', well: () => '#/planning', changed: () => '#/reports' };
function briefPanel(mk = thisMonth(), opts = {}) {
  const G = whatMatters(mk), max = opts.max || 3;
  return `<section class="brief${opts.big ? ' big' : ''}" aria-label="What matters now">
    ${opts.head === false ? '' : `<header class="brief-head"><h2>What matters now</h2><span class="muted small">${mk === thisMonth() ? 'Worked out from your own numbers, as of today' : monthLabel(mk)}</span></header>`}
    <div class="brief-cols">${BRIEF_GROUPS.map(([k, label, none]) => `<div class="brief-col ${k}${G[k].length ? '' : ' none'}"><h3><i class="brief-mark" aria-hidden="true"></i>${label}${G[k].length ? ` <span class="brief-n">${G[k].length}</span>` : ''}</h3>
      ${G[k].length ? `<ul>${G[k].slice(0, max).map(it => briefLine(it, opts.inert)).join('')}</ul>${G[k].length > max && !opts.big ? `<a class="brief-more" href="${BRIEF_MORE[k]()}">and ${G[k].length - max} more</a>` : ''}` : `<p class="brief-none">${none}</p>`}</div>`).join('')}</div></section>`;
}
