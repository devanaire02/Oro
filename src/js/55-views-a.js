const VIEWS = {};

/* Plain-English observations used by the Simple view and Money date. */
function insights(mk = thisMonth(), opts = {}) {
  const out = [];
  const isCur = mk === thisMonth();
  const now = new Date();
  const dim = +monthEnd(mk).slice(8), dayN = isCur ? now.getDate() : dim, dayShare = dayN / dim;
  const billCats = new Set(state.recurring.map(r => r.categoryId));
  const fixed = c => billCats.has(c.id) || c.rental === 'debt' || [1, 2, 3].every(i => txInMonth(addMonths(mk, -i)).filter(t => txHasCat(t, c.id)).length <= 1);
  for (const c of state.categories.filter(c => c.kind === 'expense' && c.budget > 0)) {
    const v = budgetView(c, mk);
    if (fixed(c) && v.period !== 'year' && v.available >= -1) continue;
    if (v.period === 'year') { if (v.actual > v.budget) out.push({ tone: 'bad', w: v.actual - v.budget, text: `${c.name} is ${money(v.actual - v.budget, { cents: false })} over its yearly budget.` }); continue; }
    if (v.available < -1) out.push({ tone: 'bad', w: -v.available, text: `${c.name} is ${money(-v.available, { cents: false })} over budget${isCur ? ' this month' : ''}.` });
    else if (isCur && dayShare < 0.85 && v.actual > 100 && v.actual > (v.budget + (v.carry || 0)) * dayShare * 1.3) out.push({ tone: 'warn', w: v.actual - v.budget * dayShare, text: `${c.name} is ahead of pace: ${money(v.actual, { cents: false })} of ${money(v.budget + (v.carry || 0), { cents: false })} with ${dim - dayN} days to go.` });
  }
  const acts = monthActuals(mk);
  for (const c of state.categories.filter(c => c.kind === 'expense' && !c.rental)) {
    const a = acts[c.id] || 0, avg = trailingAvg(c.id, mk, 3);
    if (!isCur && a > 150 && avg > 0 && a > avg * 1.4 && !out.some(o => o.text.startsWith(c.name))) out.push({ tone: 'info', w: (a - avg) / 2, text: `${c.name} came to ${money(a, { cents: false })}, versus a usual ${money(avg, { cents: false })}.` });
  }
  if (isCur) for (const u of upcoming(35).filter(u => u.amount <= -1000 && !/mortgage|rent\b|card payment/i.test(u.name))) out.push({ tone: 'info', w: -u.amount / 3, text: `${u.name} of ${money(-u.amount, { cents: false })} is due ${dateLabel(u.date)}.` });
  for (const g of state.goals) { const p = goalProgress(g); if (p.status === 'behind') out.push({ tone: 'warn', w: 400, text: `${g.name} needs ${money(p.needed, { cents: false })} a month to hit ${dateLabel(g.targetDate, true)}; you’re putting in ${money(g.monthly, { cents: false })}.` }); else if (p.status === 'done') out.push({ tone: 'good', w: 300, text: `${g.name} is fully funded. Nice work.` }); }
  for (const d of detectRepeating().filter(d => d.isNew)) out.push({ tone: 'info', w: d.monthly * 6, text: `New subscription: ${d.payee}, ${money(d.monthly)} a month (${money(d.monthly * 12, { cents: false })} a year).` });
  const f = flowSummary(txInMonth(mk)), avgRate = (() => { const xs = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i)))); const inc = sum(xs.map(x => x.income)), sp = sum(xs.map(x => x.spending)); return inc ? (inc - sp) / inc : NaN; })();
  if (!isCur && isFinite(f.rate) && isFinite(avgRate) && Math.abs(f.rate - avgRate) > 0.05) out.push({ tone: f.rate > avgRate ? 'good' : 'warn', w: 500, text: `You kept ${pct(f.rate, 0)} of income, ${f.rate > avgRate ? 'better than' : 'below'} the recent ${pct(avgRate, 0)}.` });
  return out.sort((a, b) => b.w - a.w).slice(0, opts.limit || 5);
}

/* ================= Overview ================= */
VIEWS.overview = () => {
  const d = new Date();
  const sub = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!state.accounts.length) {
    if (isCompanion()) return pageHead('Welcome to Ọrọ̀', sub) + `<div class="welcome">
      <div class="welcome-copy"><p class="welcome-kicker"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}.</p><h2>${ORO_TAGLINE}</h2>
        <p>On this ${deviceLabel()}, Ọrọ̀ works from the data your Mac keeps in iCloud Drive, so it stays on your devices and in your iCloud. Nothing is uploaded anywhere else.</p>
        <ol class="steps"><li><strong>Open your Mac’s data:</strong> choose <strong>iCloud Drive › Ọrọ̀ › data › oro.json</strong>.</li>
        <li><strong>Review, import or add transactions</strong> here as you go.</li>
        <li><strong>Send your changes</strong> back to your Mac. They’re added the next time Ọrọ̀ is open there.</li></ol>
        <div class="actions"><button class="btn primary" data-act="sync-open">Open from iCloud Drive</button><button class="btn ghost" data-act="load-sample">Explore with sample data</button></div></div></div>`;
    return pageHead('Welcome to Ọrọ̀', sub) + `<div class="welcome">
      <div class="welcome-copy"><p class="welcome-kicker"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}.</p><h2>${ORO_TAGLINE}</h2>
        <p>Your budget, net worth, investments, property and plans in one place that never leaves your own devices. Nothing is uploaded, and there’s no subscription.</p>
        <ol class="steps"><li><strong>Choose your Ọrọ̀ folder</strong> so everything is saved as files with daily backups. <button class="linklike" data-act="connect-folder">Choose folder</button></li>
        <li><strong>Add your accounts</strong>, or import a statement from your bank, card or brokerage.</li>
        <li><strong>Set a few budgets and goals</strong>, then use Money date to go over the month together.</li></ol>
        <div class="actions"><button class="btn primary" data-act="add-account">Add an account</button><button class="btn" data-act="import">Import a file</button><button class="btn ghost" data-act="load-sample">Explore with sample data</button></div></div></div>`;
  }
  return (UI.mode === 'simple' ? overviewSimple(sub) : overviewDetailed(sub)) + colophon();
};

function spendByGroup(txs) {
  const acts = categoryActuals(txs), g = {};
  for (const [id, v] of Object.entries(acts)) { if (v <= 0) continue; const c = catById(id); if (id === '_none') g.Uncategorized = (g.Uncategorized || 0) + v; else if (c && c.kind === 'expense') g[c.group] = (g[c.group] || 0) + v; }
  return Object.entries(g).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
function donutItems(groups, max = 7) {
  const top = groups.slice(0, max), rest = sum(groups.slice(max).map(x => x.value));
  const items = top.map((x, i) => ({ ...x, color: `var(--c${(i % 8) + 1})` }));
  if (rest > 0) items.push({ label: 'Everything else', value: rest, color: 'var(--muted-2)' });
  return items;
}
function legendList(items, total) {
  return `<ul class="legend-list">${items.map(i => `<li><i style="background:${i.color}"></i><span>${esc(i.label)}</span><span class="num">${money(i.value, { cents: false })}</span><span class="num muted">${pct(i.value / total, 0)}</span></li>`).join('')}</ul>`;
}
function monthlySeries(fn, n = 12) { return Array.from({ length: n }, (_, i) => fn(addMonths(thisMonth(), i - n + 1))); }

function overviewDetailed(sub) {
  const t = totals(), mk = thisMonth(), prev = addMonths(mk, -1);
  const prevNW = snapshotNW(prev);
  const series = netWorthSeries();
  const shown = UI.nwRange === 'all' ? series : series.slice(-13);
  const txs = lensed(txInMonth(mk));
  const f = flowSummary(txs);
  const groups = spendByGroup(txs), items = donutItems(groups), spendTotal = sum(groups.map(g => g.value));
  const billCats = new Set(state.recurring.map(r => r.categoryId));
  const dim = +monthEnd(mk).slice(8), dayShare = new Date().getDate() / dim;
  const budgeted = state.categories.filter(c => c.kind === 'expense' && c.budget > 0 && c.period !== 'year' && !c.rental && !billCats.has(c.id))
    .map(c => ({ c, v: budgetView(c, mk) })).sort((a, b) => (b.v.actual / (b.v.budget + (b.v.carry || 0) || 1)) - (a.v.actual / (a.v.budget + (a.v.carry || 0) || 1))).slice(0, 6);
  const up = upcoming(14), att = attentionItems();
  const planned = sum(state.categories.filter(c => c.kind === 'expense').map(c => c.period === 'year' ? (c.budget || 0) / 12 : (c.budget || 0)));
  const spendSeries = monthlySeries(m => flowSummary(lensed(txInMonth(m))).spending);
  const keptSeries = monthlySeries(m => flowSummary(lensed(txInMonth(m))).net);
  const cashSeries = monthlySeries(m => { const s = state.snapshots[m] || {}; return sum(Object.entries(s).filter(([id]) => ACCOUNT_TYPES[acctById(id)?.type]?.bucket === 'cash').map(([, v]) => v)); });
  const invSeries = monthlySeries(m => { const s = state.snapshots[m] || {}; return sum(Object.entries(s).filter(([id]) => ['invest'].includes(ACCOUNT_TYPES[acctById(id)?.type]?.bucket)).map(([, v]) => v)); });
  const fc = forecast(60);
  const days = {};
  for (const tx of lensed(txInRange(addDays(today(), -53 * 7), today()))) for (const l of txLines(tx)) { const c = catById(l.categoryId); if ((c && c.kind === 'expense' && !c.rental && !/Mortgage|Auto payment|Childcare/.test(c.name)) || (!c && l.amount < 0)) days[tx.date] = (days[tx.date] || 0) - l.amount; }
  const goals = state.goals.slice(0, 4);

  return pageHead('Overview', sub, `${ciButton()}<button class="btn" data-act="import">Import</button><button class="btn primary" data-act="add-txn">Add transaction</button>`) + lensNote() + `
  <section class="hero">
    <div class="hero-figure">
      <span class="hero-label">Net worth</span>
      <span class="hero-num num">${money(t.netWorth, { cents: false })}</span>
      <span class="hero-delta">${prevNW == null ? '<span class="muted">History builds month by month. Add past balances from each account’s History.</span>' : `${deltaChip(t.netWorth, prevNW, { pct: true })} <span class="muted">since the end of ${MONTHS[+prev.slice(5) - 1]}</span>`}</span>
      <dl class="hero-split">
        <div><dt>Assets</dt><dd class="num">${money(t.assets, { cents: false })}</dd></div>
        <div><dt>Liabilities</dt><dd class="num">${money(t.liabilities, { cents: false })}</dd></div>
        <div><dt>Cash and investments</dt><dd class="num">${money(t.liquid, { cents: false })}</dd></div>
      </dl>
    </div>
    <div class="hero-chart">
      <div class="seg small" role="group" aria-label="Range"><button class="${UI.nwRange === '12' ? 'on' : ''}" data-nwrange="12">1Y</button><button class="${UI.nwRange === 'all' ? 'on' : ''}" data-nwrange="all">All</button></div>
      ${chartHost({ h: 220, label: 'Net worth by month', series: [{ points: shown, color: 'var(--ink-accent)', area: true }], xFmt: x => monthLabel(x, true),
        tip: i => { const p = shown[i], q = shown[i - 1]; return `<strong>${monthLabel(p.x)}</strong><br>${money(p.y, { cents: false })}${q ? `<br><span class="${signClass(p.y - q.y)}">${money(p.y - q.y, { cents: false, sign: true })}</span>` : ''}`; } })}
    </div>
  </section>

  <section class="kpis-row">
    <div class="kpi"><span class="kpi-label">Spent in ${MONTHS[new Date().getMonth()]}</span><span class="kpi-value num">${money(f.spending, { cents: false })}</span><span class="kpi-sub">${planned ? `of ${money(planned, { cents: false })} planned · ${pct(f.spending / planned, 0)}` : 'No budget set'}</span>${sparkline(spendSeries, { color: 'var(--c4)' })}</div>
    <div class="kpi"><span class="kpi-label">Kept this month</span><span class="kpi-value num ${signClass(f.net)}">${money(f.net, { cents: false })}</span><span class="kpi-sub">${isFinite(f.rate) ? `${pct(f.rate, 0)} of income` : 'No income yet'}</span>${sparkline(keptSeries, { color: 'var(--pos)' })}</div>
    <div class="kpi"><span class="kpi-label">Cash on hand</span><span class="kpi-value num">${money(t.cash, { cents: false })}</span><span class="kpi-sub">${state.recurring.length ? `Low of ${money(fc.low.y, { cents: false })} on ${dateLabel(fc.low.x)}` : 'Add bills to forecast'}</span>${sparkline(cashSeries, { color: 'var(--c2)' })}</div>
    <div class="kpi"><span class="kpi-label">Investments</span><span class="kpi-value num">${money(t.invest, { cents: false })}</span><span class="kpi-sub">${(() => { const p = invSeries[invSeries.length - 2]; return p ? `${money(t.invest - p, { cents: false, sign: true })} this month` : '&nbsp;'; })()}</span>${sparkline(invSeries, { color: 'var(--c1)' })}</div>
  </section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Where it went</h2><a href="#/reports?r=spending&p=m">Breakdown</a></header>
      ${items.length ? `<div class="donut-wrap">${chartHost({ type: 'donut', h: 200, items, center: { value: money(spendTotal, { cents: false }), label: 'spent so far' } })}${legendList(items, spendTotal)}</div>` : '<p class="muted">No spending recorded this month yet.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Flexible spending</h2><a href="#/budget">Budget</a></header>
      ${budgeted.length ? `<ul class="meters">${budgeted.map(({ c, v }) => `
        <li><div class="meter-row"><span>${esc(c.name)}${c.rollover ? ' <span class="tag soft">rolls over</span>' : ''}</span><span class="num ${v.available < 0 ? 'neg' : ''}">${money(v.actual, { cents: false })} <span class="muted">of ${money(v.budget + (v.carry || 0), { cents: false })}</span></span></div>${bar(v.actual, v.budget + (v.carry || 0), { pace: (v.budget + (v.carry || 0)) * dayShare })}</li>`).join('')}</ul>
        <p class="muted small">The tick marks an even pace for this point in the month.</p>` : `<p class="muted">No budgets yet. <a href="#/budget">Set targets</a> for the categories you care about.</p>`}
    </section>
  </div>

  <section class="panel">
    <header class="panel-head"><h2>Daily spending</h2><span class="muted small">Darker days mean more spending. Mortgage, rent and other fixed bills are left out.</span></header>
    ${chartHost({ type: 'heatmap', days, weeks: 52 })}
  </section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Coming up</h2><a href="#/cashflow">Calendar</a></header>
      ${up.length ? `<table class="ledger compact"><tbody>${up.slice(0, 8).map(u => `<tr><td class="nowrap muted">${dateLabel(u.date)}</td><td>${esc(u.name)}</td><td class="num ${signClass(u.amount)}">${money(u.amount)}</td></tr>`).join('')}</tbody></table>`
        : `<p class="muted">Nothing scheduled in the next two weeks. Add paychecks and bills on the <a href="#/cashflow">Cash flow</a> page.</p>`}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Needs attention</h2>${checkinOn() && att.length ? '<a href="#/checkin">Go through it</a>' : ''}</header>
      ${att.length ? `<ul class="attention">${att.map(a => `<li class="${a.tone}">${a.act ? `<button class="linklike" data-act="${a.act}">${esc(a.text)}</button>` : `<a href="${a.go}">${esc(a.text)}</a>`}</li>`).join('')}</ul>` : '<p class="muted">Everything is categorized, current and on budget.</p>'}
    </section>
  </div>
  ${goals.length ? `<section class="panel"><header class="panel-head"><h2>Goals</h2><a href="#/planning">All goals</a></header><div class="goal-strip">${goals.map(goalTile).join('')}</div></section>` : ''}`;
}

function goalTile(g) {
  const p = goalProgress(g);
  return `<button class="goal-tile" data-edit-goal="${g.id}">${ring(p.share, { size: 74, width: 8, label: pct(p.share, 0), color: p.status === 'behind' ? 'var(--warn)' : p.status === 'done' ? 'var(--pos)' : 'var(--ink-accent)' })}
    <span class="goal-name">${esc(g.name)}</span><span class="goal-sub num">${money(p.current, { cents: false })} of ${money(p.target, { cents: false })}</span>
    <span class="goal-status ${p.status}">${p.status === 'done' ? 'Funded' : p.status === 'behind' ? `Needs ${money(p.needed, { cents: false })}/mo` : p.needed != null ? `${money(p.needed, { cents: false })}/mo to finish` : 'On track'}</span></button>`;
}

function overviewSimple(sub) {
  const t = totals(), mk = thisMonth(), prev = addMonths(mk, -1), prevNW = snapshotNW(prev);
  const who = UI.lens ? memberName(UI.lens) + ' has' : 'We’ve';
  const txs = lensed(txInMonth(mk)), f = flowSummary(txs);
  const planned = sum(state.categories.filter(c => c.kind === 'expense').map(c => c.period === 'year' ? (c.budget || 0) / 12 : (c.budget || 0)));
  const groups = spendByGroup(txs), items = donutItems(groups, 5), total = sum(groups.map(g => g.value));
  const notes = insights(mk, { limit: 4 });
  const up = upcoming(21).filter(u => Math.abs(u.amount) >= 100).slice(0, 5);
  const series = netWorthSeries().slice(-13);
  return `<header class="page-head simple-head"><div><p class="sub">${sub}</p><h1 class="big-sentence">${who} spent <span class="num">${money(f.spending, { cents: false })}</span>${!UI.lens && planned ? ` of the <span class="num">${money(planned, { cents: false })}</span> we planned` : ''} this month.</h1></div>${checkinOn() ? `<div class="actions">${ciButton()}</div>` : ''}</header>
  <section class="simple-cards">
    <div class="s-card"><span class="s-label">Came in</span><span class="s-value num">${money(f.income, { cents: false })}</span><span class="s-sub">${MONTHS[+mk.slice(5) - 1]} so far</span></div>
    <div class="s-card"><span class="s-label">Went out</span><span class="s-value num">${money(f.spending, { cents: false })}</span><span class="s-sub">${planned ? `${pct(Math.min(9.99, f.spending / planned), 0)} of the plan` : '&nbsp;'}</span></div>
    <div class="s-card accent"><span class="s-label">Kept</span><span class="s-value num ${signClass(f.net)}">${money(f.net, { cents: false })}</span><span class="s-sub">${isFinite(f.rate) ? `${pct(f.rate, 0)} of what came in` : '&nbsp;'}</span></div>
  </section>
  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Where it went</h2></header>
      ${items.length ? `<div class="donut-wrap big">${chartHost({ type: 'donut', h: 230, items, center: { value: money(total, { cents: false }), label: 'this month' } })}${legendList(items, total)}</div>` : '<p class="muted">Nothing spent yet this month.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Worth a look</h2></header>
      ${notes.length ? `<ul class="insights">${notes.map(n => `<li class="${n.tone}">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted">Nothing stands out. Everything is on track.</p>'}
    </section>
  </div>
  <div class="cols">
    <section class="panel nw-simple">
      <header class="panel-head"><h2>What we own, minus what we owe</h2></header>
      <span class="s-value num">${money(t.netWorth, { cents: false })}</span>
      <p class="muted">${prevNW == null ? 'History builds month by month.' : `${t.netWorth >= prevNW ? 'Up' : 'Down'} ${money(Math.abs(t.netWorth - prevNW), { cents: false })} since the end of ${MONTHS[+prev.slice(5) - 1]}.`}</p>
      ${chartHost({ h: 150, padL: 50, label: 'Net worth', series: [{ points: series, color: 'var(--ink-accent)', area: true, nodots: true }], xFmt: x => MON[+x.slice(5) - 1], tip: i => `<strong>${monthLabel(series[i].x)}</strong><br>${money(series[i].y, { cents: false })}` })}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Coming up</h2></header>
      ${up.length ? `<ul class="simple-list">${up.map(u => `<li><span class="date-chip">${dateLabel(u.date)}</span><span>${esc(u.name)}</span><span class="num ${signClass(u.amount)}">${money(u.amount, { cents: false })}</span></li>`).join('')}</ul>` : '<p class="muted">No big bills in the next three weeks.</p>'}
    </section>
  </div>
  ${state.goals.length ? `<section class="panel"><header class="panel-head"><h2>Our goals</h2></header><div class="goal-strip">${state.goals.map(goalTile).join('')}</div></section>` : ''}`;
}

/* ================= Transactions ================= */
function parseSearch(q) {
  const out = { text: [], tags: [], min: null, max: null };
  for (const tok of String(q || '').toLowerCase().split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^(?:tag:|#)(.+)$/))) out.tags.push(m[1]);
    else if ((m = tok.match(/^>(\d+(\.\d+)?)$/))) out.min = +m[1];
    else if ((m = tok.match(/^<(\d+(\.\d+)?)$/))) out.max = +m[1];
    else out.text.push(tok);
  }
  return out;
}
/* A memo that only repeats the bank's description isn't worth a second line */
function memoWorthShowing(t) {
  if (!t.memo) return false;
  const m = normPayee(t.memo), r = normPayee(t.rawPayee || t.payee), q = normPayee(t.payee);
  return !!m && m !== r && m !== q && !r.startsWith(m) && !m.startsWith(r);
}
VIEWS.transactions = p => {
  const month = p.m || thisMonth();
  const S = parseSearch(p.q);
  let list = lensed(state.transactions);
  if (month !== 'all') list = list.filter(t => t.date.startsWith(month));
  if (p.acct) list = list.filter(t => t.accountId === p.acct);
  if (p.cat === '_none') list = list.filter(isUncat);
  else if (p.cat) list = list.filter(t => txHasCat(t, p.cat));
  if (p.flag) list = list.filter(t => t.flag);
  if (p.who) list = list.filter(t => personOf(t) === p.who);
  if (p.tag) list = list.filter(t => (t.tags || []).includes(p.tag));
  if (S.tags.length) list = list.filter(t => S.tags.every(x => (t.tags || []).some(y => y.includes(x))));
  if (S.min != null) list = list.filter(t => Math.abs(t.amount) >= S.min);
  if (S.max != null) list = list.filter(t => Math.abs(t.amount) <= S.max);
  if (S.text.length) list = list.filter(t => { const hay = (t.payee + ' ' + (t.memo || '') + ' ' + (t.rawPayee || '') + ' ' + catName(t.categoryId) + ' ' + (t.tags || []).join(' ') + ' ' + Math.abs(t.amount).toFixed(2)).toLowerCase(); return S.text.every(x => hay.includes(x)); });
  const sort = txSortParse(p.sort);
  list = txSorted(list, sort);
  const limit = +p.limit || 250;
  const shown = list.slice(0, limit);
  UI.txVisible = list.map(t => t.id);   // what "the Jewel Osco one" means to Talk while this list is on screen
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  if (!months.includes(thisMonth())) months.unshift(thisMonth());
  // Totals leave out transfers (credit card payments, moves between your own accounts), like Overview and Cash flow do
  let inflow = 0, outflow = 0, moved = 0, nMoved = 0;
  for (const t of list) for (const l of txLines(t)) {
    if (isTransferCat(l.categoryId)) { moved += l.amount; nMoved++; } else if (l.amount > 0) inflow += l.amount; else outflow += l.amount;
  }
  inflow = round2(inflow); outflow = round2(outflow); moved = round2(moved);
  const opts = catOptions(null, true);
  const unc = state.transactions.filter(isUncat).length, nFlag = state.transactions.filter(t => t.flag).length;
  const tags = allTags();
  const multi = members().length > 1;
  const nFilters = ['acct', 'cat', 'who', 'tag', 'flag'].filter(k => p[k]).length;
  const fOpen = UI.txFilters === undefined ? nFilters - (p.flag ? 1 : 0) > 0 : UI.txFilters;   // the flagged list keeps the filters folded
  // One click back to everything: all months, every account, category, person, flag and tag, no search, everyone's spending
  const narrowed = month !== 'all' || nFilters > 0 || !!p.q || !!UI.lens;
  const clearBtn = cls => narrowed ? `<button class="btn small ghost tx-clear ${cls}" data-act="tx-clear" title="Show every transaction: all months, accounts and categories${multi ? ', everyone' : ''}, no search">${CLEAR_ICON}Clear filters</button>` : '';

  return pageHead('Transactions', `${list.length.toLocaleString()} shown${unc ? ` · <a href="#/transactions?cat=_none&m=all">${unc} uncategorized</a>` : ''}${nFlag ? ` · <a href="#/transactions?flag=1&m=all" class="flag-link">${FLAG_ICON}${nFlag} flagged</a>` : ''}`,
    `${unc ? `<button class="btn ghost" data-act="run-rules" title="Fill in uncategorized transactions using your rules, your past choices and Ọrọ̀’s merchant list">Auto-categorize</button>` : ''}<button class="btn" data-act="import">Import</button><button class="btn primary" data-act="add-txn">Add transaction</button>`) + lensNote() + `
  <div class="filters ${fOpen ? 'open' : ''}">
    <label class="field inline"><span>Month</span><select data-filter="m"><option value="all" ${month === 'all' ? 'selected' : ''}>All months</option>${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
    <label class="field inline more"><span>Account</span><select data-filter="acct">${acctOptions(p.acct, null, 'All accounts')}</select></label>
    <label class="field inline more"><span>Category</span><select data-filter="cat"><option value="">All categories</option><option value="_none" ${p.cat === '_none' ? 'selected' : ''}>Uncategorized</option>${catOptions(p.cat, false)}</select></label>
    ${multi && !UI.lens ? `<label class="field inline more"><span>Person</span><select data-filter="who"><option value="">Everyone</option>${memberOptions(p.who)}</select></label>` : ''}
    <label class="field inline more"><span>Flag</span><select data-filter="flag"><option value="">Any</option><option value="1" ${p.flag ? 'selected' : ''}>Flagged only</option></select></label>
    ${tags.length ? `<label class="field inline more"><span>Tag</span><select data-filter="tag"><option value="">Any tag</option>${tags.map(t => `<option ${t === p.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
    ${txSortSelect(sort, multi)}
    <label class="field inline grow"><span>Search</span><input type="search" id="tx-search" data-filter="q" value="${esc(p.q || '')}" placeholder="Payee, memo, #tag, >100"></label>
    ${clearBtn('tx-clear-wide')}
    <div class="filters-sm"><button class="btn small ghost" data-act="tx-filters" aria-expanded="${fOpen ? 'true' : 'false'}">${fOpen ? 'Fewer filters' : 'More filters'}${nFilters ? ` · ${nFilters} on` : ''}</button>${clearBtn('')}${shown.length ? `<button class="btn small ghost" data-act="tx-select" aria-pressed="${UI.txSelect ? 'true' : 'false'}">${UI.txSelect ? 'Done selecting' : 'Select'}</button>` : ''}</div>
  </div>
  ${p.flag && shown.length ? `<p class="lens-note flag-note">${FLAG_ICON} Showing flagged transactions. Pick the right category and each one drops off this list. <button class="linklike" data-act="tx-clear">Show all</button></p>` : ''}
  <div class="bulk" id="bulk" hidden>
    <span id="bulk-count"></span>
    <select id="bulk-cat" aria-label="Category">${catOptions(null, true)}</select><button class="btn small" data-act="bulk-cat">Set category</button>
    ${multi ? `<select id="bulk-who" aria-label="Person">${memberOptions('', 'Account owner')}</select><button class="btn small" data-act="bulk-who">Set person</button>` : ''}
    <input id="bulk-tag" placeholder="tag" list="tag-list" style="width:8em"><datalist id="tag-list">${tags.map(t => `<option value="${esc(t)}">`).join('')}</datalist><button class="btn small" data-act="bulk-tag">Add tag</button>
    <button class="btn small" data-act="bulk-flag">Flag</button><button class="btn small ghost" data-act="bulk-unflag">Clear flag</button>
    <button class="btn small ghost danger-text" data-act="bulk-del">Delete</button>
  </div>
  ${shown.length ? `<div class="scroll-table"><table class="ledger tx-table ${UI.txSelect ? 'selecting' : ''}" id="tx-table">
    <thead><tr><th class="cb"><input type="checkbox" id="tx-all" aria-label="Select all shown"></th>${txSortHead('date', sort)}${txSortHead('payee', sort)}${txSortHead('cat', sort)}${multi ? txSortHead('who', sort, 'hide-sm detail-only') : ''}${txSortHead('acct', sort, 'hide-sm')}${txSortHead('amount', sort, 'num')}</tr></thead>
    <tbody>${shown.map(t => {
      const who = personOf(t);
      return `<tr data-id="${t.id}" class="${isUncat(t) ? 'needs' : ''}">
      <td class="cb"><input type="checkbox" class="tx-cb" value="${t.id}" aria-label="Select"></td>
      <td class="nowrap muted tx-date">${dateLabel(t.date)}${t.reconciled ? ' <span class="rec" title="Reconciled">✓</span>' : ''}<span class="tx-acct-sm"> · ${esc(acctById(t.accountId)?.name || '—')}</span></td>
      <td class="tx-payee"><span class="payee-line"><button class="linklike" data-edit-txn="${t.id}">${esc(t.payee || '(no description)')}</button>${t.attachments?.length ? ' <span class="clip" title="Has a receipt">⎘</span>' : ''}<button class="flag-btn ${t.flag ? 'on' : ''}" data-act="tx-flag" data-id="${t.id}" aria-pressed="${t.flag ? 'true' : 'false'}" aria-label="${t.flag ? 'Flagged. Clear the flag' : 'Flag to come back to'}" title="${t.flag ? 'Flagged. Click to clear' : 'Not sure what this was? Flag it to come back to'}">${FLAG_ICON}</button></span>
        ${memoWorthShowing(t) || t.tags?.length ? `<div class="tx-meta">${(t.tags || []).map(x => `<button class="tagchip" data-tagfilter="${esc(x)}">#${esc(x)}</button>`).join('')}${memoWorthShowing(t) ? `<span class="muted small">${esc(t.memo)}</span>` : ''}</div>` : ''}</td>
      <td class="tx-cat">${isSplit(t) ? `<button class="split-btn" data-edit-txn="${t.id}">Split · ${t.splits.length}</button>` : `<span class="cat-pill"><span class="cat-pill-text" aria-hidden="true">${esc(catName(t.categoryId))}</span><select class="cat-select" data-txcat="${t.id}" aria-label="Category">${t.categoryId ? opts.replace(`value="${t.categoryId}"`, `value="${t.categoryId}" selected`) : opts}</select></span>`}</td>
      ${multi ? `<td class="hide-sm detail-only nowrap"><span class="person-dot" style="background:${memberColor(who)}"></span>${esc(memberName(who))}</td>` : ''}
      <td class="hide-sm muted">${esc(acctById(t.accountId)?.name || '—')}</td>
      <td class="num tx-amt ${signClass(t.amount)}">${money(t.amount)}</td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="${multi ? 4 : 3}" class="tx-foot-pad"></td><td class="hide-sm"></td><td class="muted">Money in<br>Money out<br><strong>Net</strong>${nMoved ? '<br><span class="small">Transfers (not counted)</span>' : ''}</td><td class="num total">${money(inflow)}<br>${money(outflow)}<br><strong class="${signClass(inflow + outflow)}">${money(round2(inflow + outflow))}</strong>${nMoved ? `<br><span class="small muted">${money(moved, { sign: true })}</span>` : ''}</td></tr></tfoot>
  </table></div>
  ${list.length > limit ? `<p class="center"><button class="btn ghost" data-more="${limit + 250}">Show ${Math.min(250, list.length - limit)} more</button></p>` : ''}`
  : p.flag ? emptyState('Nothing flagged', 'When you’re not sure what a transaction was for, tap its flag (or check “Flag it” when you open it). Flagged ones collect here until you pick a category.', `<a class="btn" href="#/transactions">Back to transactions</a>`)
  : emptyState(state.transactions.length ? 'Nothing matches these filters' : 'No transactions yet',
    state.transactions.length ? 'Try another month, or clear the filters to see everything.' : 'Import an OFX, QFX, CSV, QIF or PDF from your bank or card, or bring your history over from YNAB, Monarch, Mint or Copilot.',
    state.transactions.length ? `<button class="btn" data-act="tx-clear">${CLEAR_ICON}Clear filters</button>` : `<button class="btn primary" data-act="import">Import a file</button>`)}`;
};

/* ================= Budget ================= */
VIEWS.budget = p => {
  const mk = p.m || thisMonth();
  const isCurrent = mk === thisMonth();
  const now = new Date();
  const dayShare = isCurrent ? now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() : 1;
  const cats = state.categories.filter(c => c.kind !== 'transfer');
  const monthly = c => c.period === 'year' ? (c.budget || 0) / 12 : (c.budget || 0);
  const expIncome = sum(cats.filter(c => c.kind === 'income').map(monthly));
  const planned = sum(cats.filter(c => c.kind === 'expense').map(monthly));
  const f = flowSummary(txInMonth(mk));
  const groups = groupBy(cats, c => c.group);
  const order = Object.keys(groups).sort((a, b) => (groups[a][0].kind === 'income' && !groups[a][0].rental ? -1 : 0) - (groups[b][0].kind === 'income' && !groups[b][0].rental ? -1 : 0));
  const head = pageHead('Budget', UI.mode === 'simple' ? 'How each part of the budget is doing.' : 'Targets repeat every month. Yearly categories compare with spending so far this year; rollover categories carry what’s left forward.', monthNav(mk) +
    `<button class="btn ghost detail-only" data-act="budget-avg">Fill from averages</button>`);
  const summary = `<section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Expected income</th><th class="num">Planned spending</th><th class="num">Unplanned</th><th class="num">Spent in ${MONTHS[+mk.slice(5) - 1]}</th></tr></thead>
    <tbody><tr><th scope="row">Per month</th><td class="num">${money(expIncome, { cents: false })}</td><td class="num">${money(planned, { cents: false })}</td><td class="num ${signClass(expIncome - planned)}">${money(expIncome - planned, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td></tr></tbody></table>
    <p class="muted small">Planned spending includes one-twelfth of each yearly budget. Unplanned is what’s left for saving and investing.</p></section>`;

  if (UI.mode === 'simple') {
    const cards = order.filter(g => groups[g].some(c => c.kind === 'expense' && c.budget > 0)).map(g => {
      const cs = groups[g].filter(c => c.kind === 'expense' && c.budget > 0);
      const b = sum(cs.map(c => monthly(c))), a = sum(cs.map(c => { const v = budgetView(c, mk); return v.period === 'year' ? v.actual / (+mk.slice(5)) : v.actual; }));
      const share = b ? a / b : 0;
      return `<div class="b-card">${ring(share, { size: 84, width: 9, label: pct(share, 0), color: share > 1.0001 ? 'var(--neg)' : share > dayShare * 1.15 && isCurrent ? 'var(--warn)' : 'var(--ink-accent)' })}
        <div class="b-card-body"><h3>${esc(g)}</h3><p class="num">${money(a, { cents: false })} <span class="muted">of ${money(b, { cents: false })}</span></p>
        <ul>${cs.slice(0, 4).map(c => { const v = budgetView(c, mk); const bb = v.period === 'year' ? v.budget : v.budget + (v.carry || 0); return `<li><span>${esc(c.name)}</span>${bar(v.actual, bb)}</li>`; }).join('')}</ul></div></div>`;
    }).join('');
    return head + summary + `<div class="b-cards">${cards || '<p class="muted">No budgets set yet. Switch to Detailed to set targets.</p>'}</div>`;
  }

  const rowsFor = cs => cs.map(c => {
    const v = budgetView(c, mk), inc = c.kind === 'income';
    const avail = v.period === 'year' ? v.budget - v.actual : v.available;
    const cap = v.period === 'year' ? v.budget : v.budget + (v.carry || 0);
    const pace = v.period === 'year' ? v.monthShare : cap * dayShare;
    const trend = Array.from({ length: 6 }, (_, i) => monthActuals(addMonths(mk, i - 5))[c.id] || 0);
    return `<tr>
      <th scope="row"><button class="linklike" data-edit-cat="${c.id}">${esc(c.name)}</button>${v.period === 'year' ? '<span class="tag soft">yearly</span>' : ''}${c.rollover ? `<span class="tag soft" title="Carried from earlier months: ${money(v.carry || 0)}">rolls over</span>` : ''}</th>
      <td class="num budget-cell" data-v="${c.budget ? round2(c.budget) : 0}"><span class="cur">$</span><input class="budget-input" id="b-${c.id}" data-budget="${c.id}" inputmode="decimal" value="${c.budget ? round2(c.budget) : ''}" placeholder="0" aria-label="Budget for ${esc(c.name)}"></td>
      <td class="num">${money(v.actual, { cents: false })}</td>
      <td class="num ${inc ? (v.actual > v.budget ? 'pos' : 'muted') : (avail < 0 ? 'neg' : '')}">${!v.budget && !c.rollover ? '<span class="muted">—</span>' : inc ? (v.budget - v.actual > 0 ? `${money(v.budget - v.actual, { cents: false })} to come` : money(v.actual - v.budget, { cents: false, sign: true })) : money(avail, { cents: false })}</td>
      <td class="meter-cell">${v.budget ? bar(v.actual, cap, { pace: inc ? null : pace }) : ''}</td>
      <td class="spark-cell hide-sm">${sparkline(trend, { w: 70, h: 20, color: inc ? 'var(--pos)' : 'var(--muted)' })}</td></tr>`;
  }).join('');
  const groupTotal = cs => { const m = cs.filter(c => c.period !== 'year'); return { b: sum(m.map(c => c.budget || 0)), a: sum(m.map(c => budgetView(c, mk).actual)) }; };
  return head + summary + order.map(g => {
    const cs = groups[g], tt = groupTotal(cs.filter(c => c.kind === 'expense'));
    const isRental = cs.some(c => c.rental);
    const pnl = isRental ? rentalPnL(g, `${mk}-01`, monthEnd(mk)) : null;
    return `<section class="budget-group"><table class="ledger budget-table" data-sort-id="budget">
      <thead><tr><th scope="col">${esc(g)}</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">${cs[0].kind === 'income' && !isRental ? 'Difference' : 'Available'}</th><th class="meter-cell"></th><th class="spark-cell hide-sm" data-nosort>6 months</th></tr></thead>
      <tbody>${rowsFor(cs)}</tbody>
      ${isRental ? `<tfoot><tr><th scope="row">Cash flow after debt service</th><td></td><td class="num total ${signClass(pnl.cashFlow)}">${money(pnl.cashFlow, { cents: false })}</td><td colspan="3" class="muted small">NOI ${money(pnl.noi, { cents: false })} this month</td></tr></tfoot>`
      : cs[0].kind === 'expense' && cs.length > 1 ? `<tfoot><tr><th scope="row">Monthly total</th><td class="num total">${money(tt.b, { cents: false })}</td><td class="num total">${money(tt.a, { cents: false })}</td><td class="num total ${tt.b - tt.a < 0 ? 'neg' : ''}">${money(tt.b - tt.a, { cents: false })}</td><td></td><td class="hide-sm"></td></tr></tfoot>` : ''}
    </table></section>`;
  }).join('') + `<p class="center"><button class="btn ghost" data-act="add-cat">Add a category</button></p>`;
};

/* ================= Accounts ================= */
VIEWS.accounts = p => {
  const updating = p.update === '1', byOwner = p.by === 'owner';
  if (!state.accounts.length) return pageHead('Accounts') + emptyState('Add your first account', 'Checking, cards, brokerage, retirement, property, loans: list everything you own and owe to see your full balance sheet.', `<button class="btn primary" data-act="add-account">Add an account</button><button class="btn" data-act="import">Import a file</button>`);
  const t = totals();
  const groups = byOwner
    ? members().map(m => ({ label: m.name, accts: activeAccounts().filter(a => (a.owner || 'joint') === m.id), signed: true })).filter(g => g.accts.length)
    : BUCKETS.map(b => ({ label: b.label, debt: b.id === 'debt', accts: activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === b.id) })).filter(g => g.accts.length);
  const archived = state.accounts.filter(a => a.archived);
  const multi = members().length > 1;
  return pageHead('Accounts', updating ? `Type in current balances from your statements, then save.${cryptoHeld().length ? ' Crypto accounts follow their coin prices: update those on Investments › Crypto prices.' : ''}` : 'Everything you own and owe.',
    updating ? `<a class="btn ghost" href="#/accounts">Cancel</a><button class="btn primary" data-act="save-balances">Save balances</button>`
      : `${multi ? `<div class="seg small" role="group" aria-label="Group by"><button class="${byOwner ? '' : 'on'}" data-by="">By type</button><button class="${byOwner ? 'on' : ''}" data-by="owner">By owner</button></div>` : ''}<a class="btn" href="#/accounts?update=1">Update balances</a>${checkinOn() ? '<a class="btn" href="#/checkin?talk=1">Add or update by talking</a>' : ''}<button class="btn primary" data-act="add-account">Add account</button>`) + `
  <section class="alloc-bar-wrap detail-only">${(() => { const segs = [['Cash', t.cash, 'var(--c2)'], ['Investments', t.invest, 'var(--c1)'], ['Property and private', t.illiquid, 'var(--c4)']]; const tot = t.assets || 1; return `<div class="stack tall" role="img" aria-label="Assets by type">${segs.map(([l, v, c]) => v > 0 ? `<span style="width:${v / tot * 100}%;background:${c}" title="${l} ${pct(v / tot, 0)}"></span>` : '').join('')}</div><p class="legend">${segs.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} ${pct(v / tot, 0)}</span>`).join('')}<span><i style="background:var(--neg)"></i>Debt is ${pct(t.liabilities / tot, 0)} of assets</span></p>`; })()}</section>
  ${groups.map(g => {
    const subtotal = sum(g.accts.map(a => g.signed ? signedValue(a) : accountValue(a)));
    return `<section class="acct-group"><table class="ledger acct-table" data-sort-id="accounts">
      <thead><tr><th scope="col">${esc(g.label)}</th><th class="hide-sm">${byOwner ? 'Type' : multi ? 'Owner' : 'Type'}</th><th>As of</th><th class="num">${g.debt ? 'Owed' : byOwner ? 'Net' : 'Value'}</th><th class="acts"></th></tr></thead>
      <tbody>${g.accts.map(a => {
        const hs = holdingsFor(a.id).length, v = byOwner ? signedValue(a) : accountValue(a);
        return `<tr>
          <th scope="row" class="acct-name"><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button>${a.institution ? `<div class="muted small">${esc(a.institution)}${a.last4 ? ` ending ${esc(a.last4)}` : ''}</div>` : ''}</th>
          <td class="hide-sm muted">${byOwner || !multi ? `${esc(ACCOUNT_TYPES[a.type]?.label)}${a.rental ? ', rental' : ''}${hs ? `, ${hs} holding${hs > 1 ? 's' : ''}` : ''}` : `<span class="person-dot" style="background:${memberColor(a.owner || 'joint')}"></span>${esc(memberName(a.owner || 'joint'))}`}</td>
          <td class="acct-asof" data-v="${esc(accountAsOf(a) || '')}">${staleTag(accountAsOf(a))}${a.reconciledThrough ? `<div class="muted small">Reconciled ${dateLabel(a.reconciledThrough)}</div>` : ''}</td>
          <td class="num acct-val" data-v="${round2(v)}">${updating && !hs ? `<input class="bal-input" data-bal="${a.id}" inputmode="decimal" value="${round2(accountValue(a))}" aria-label="Balance for ${esc(a.name)}">` : `<span class="${byOwner ? signClass(v) : ''}">${money(v)}</span>`}</td>
          <td class="acts"><button class="linklike small" data-history="${a.id}">History</button>${a.ledger ? ` <button class="linklike small" data-reconcile="${a.id}">Reconcile</button>` : ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="hide-sm"></td><td class="acct-pad"></td><td class="num total">${money(subtotal)}</td><td class="acct-pad"></td></tr></tfoot>
    </table></section>`;
  }).join('')}
  <section class="acct-group"><table class="ledger acct-table grand">
    <tbody>
      <tr><th scope="row">Total assets</th><td class="num">${money(t.assets)}</td></tr>
      <tr><th scope="row">Total liabilities</th><td class="num">${money(-t.liabilities)}</td></tr>
      <tr class="grand-total"><th scope="row">Net worth</th><td class="num total double">${money(t.netWorth)}</td></tr>
    </tbody></table></section>
  ${archived.length ? `<details class="archived"><summary>${archived.length} archived account${archived.length > 1 ? 's' : ''}</summary><ul>${archived.map(a => `<li><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button> <span class="muted">${money(accountValue(a))}</span></li>`).join('')}</ul></details>` : ''}`;
};
