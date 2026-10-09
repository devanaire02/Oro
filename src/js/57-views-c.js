/* ================= Reports ================= */
const PERIODS = [['m', 'This month'], ['lm', 'Last month'], ['ytd', 'This year'], ['12m', 'Last 12 months'], ['ly', 'Last year'], ['custom', 'Custom']];
VIEWS.reports = p => {
  const tab = p.r || 'flow';
  const per = p.p || (tab === 'statement' || tab === 'networth' ? '12m' : 'm');
  const R = periodRange(per, p.from, p.to);
  const head = pageHead('Reports', `${R.label}${lensActive() ? ` · ${esc(lensLabel())}` : ''}`,
    `<label class="field inline"><span class="sr">Period</span><select data-filter="p">${PERIODS.map(([id, l]) => `<option value="${id}" ${id === per ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
     ${per === 'custom' ? `<input type="date" data-date="from" value="${p.from || R.from}" aria-label="From"><input type="date" data-date="to" value="${p.to || R.to}" aria-label="To">` : ''}`) +
    tabs('r', tab, [['flow', 'Cash flow'], ['spending', 'Spending'], ['statement', 'Income statement'], ['yoy', 'Year over year'], ...(people().length > 1 ? [['people', 'By person']] : []), ['networth', 'Net worth']]);
  const txs = lensed(txInRange(R.from, R.to));
  const acts = categoryActuals(txs);
  const months = monthsIn(R.from, R.to);

  if (tab === 'flow') {
    const sk = lensActive() ? (() => { const all = sankeyFromActs(acts); return all; })() : sankeyData(R.from, R.to);
    const f = flowSummary(txs);
    return head + `
    <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th><th class="num">Savings rate</th></tr></thead>
      <tbody><tr><th scope="row">${esc(R.label)}</th><td class="num">${money(f.income, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td><td class="num ${signClass(f.net)}">${money(f.net, { cents: false })}</td><td class="num">${pct(f.rate, 0)}</td></tr></tbody></table></section>
    <section class="panel"><header class="panel-head"><h2>Where the money came from and went</h2><span class="muted small">${isTouch() ? 'Tap' : 'Hover over'} a band for the amount</span></header>
      ${chartHost({ type: 'sankey', left: sk.left, right: sk.right, total: Math.max(sk.income, sk.spending), empty: 'No income or spending in this period.' })}</section>`;
  }

  if (tab === 'spending') {
    const groupIdx = {}; let gi = 0;
    const rows = Object.entries(acts).filter(([id, v]) => v > 0 && (id === '_none' || catById(id)?.kind === 'expense')).map(([id, v]) => {
      const c = catById(id), g = c ? c.group : 'Uncategorized';
      if (!(g in groupIdx)) groupIdx[g] = gi++;
      return { id, name: c ? c.name : 'Uncategorized', group: g, value: v };
    }).sort((a, b) => b.value - a.value);
    const total = sum(rows.map(r => r.value)) || 1;
    const nM = Math.max(1, months.length);
    const trendMonths = Array.from({ length: 12 }, (_, i) => addMonths(R.to.slice(0, 7), i - 11));
    const groups = Object.keys(groupIdx);
    const stackMonths = months.length >= 3 ? months : trendMonths;
    const topGroups = groups.slice(0, 7);
    return head + `
    <div class="cols wide-left">
      <section class="panel"><header class="panel-head"><h2>Spending map</h2><span class="muted small">${money(total, { cents: false })} across ${rows.length} categories</span></header>
        ${chartHost({ type: 'treemap', h: 340, items: rows.map(r => ({ label: r.name, value: r.value, color: `var(--c${(groupIdx[r.group] % 8) + 1})`, href: `#/transactions?m=${months.length === 1 ? months[0] : 'all'}&cat=${r.id}` })) })}
        <p class="legend">${groups.map(g => `<span><i style="background:var(--c${(groupIdx[g] % 8) + 1})"></i>${esc(g)}</span>`).join('')}</p></section>
      <section class="panel"><header class="panel-head"><h2>By month</h2></header>
        ${chartHost({ type: 'stack', h: 300, labels: stackMonths.map(m => MON[+m.slice(5) - 1]), series: topGroups.map(g => ({ name: g, color: `var(--c${(groupIdx[g] % 8) + 1})`, values: stackMonths.map(m => sum(Object.entries(categoryActuals(lensed(txInMonth(m)))).filter(([id, v]) => v > 0 && (catById(id)?.group || 'Uncategorized') === g && (id === '_none' || catById(id)?.kind === 'expense')).map(([, v]) => v))) })),
          tip: i => `<strong>${monthLabel(stackMonths[i])}</strong>${topGroups.map(g => { const v = sum(Object.entries(categoryActuals(lensed(txInMonth(stackMonths[i])))).filter(([id, v]) => v > 0 && (catById(id)?.group || 'Uncategorized') === g && (id === '_none' || catById(id)?.kind === 'expense')).map(([, v]) => v)); return v ? `<br>${esc(g)} ${money(v, { cents: false })}` : ''; }).join('')}` })}
        <p class="legend">${topGroups.map(g => `<span><i style="background:var(--c${(groupIdx[g] % 8) + 1})"></i>${esc(g)}</span>`).join('')}</p></section>
    </div>
    <table class="ledger" data-sort-id="rep-spending"><thead><tr><th>Category</th><th class="hide-sm">Group</th><th class="num">Total</th><th class="num hide-sm">Per month</th><th class="num">Share</th><th class="spark-cell hide-sm" data-nosort>12 months</th></tr></thead>
      <tbody>${rows.map(r => `<tr><th scope="row"><a href="#/transactions?m=all&cat=${r.id}">${esc(r.name)}</a></th><td class="hide-sm muted">${esc(r.group)}</td><td class="num">${money(r.value, { cents: false })}</td><td class="num hide-sm">${money(r.value / nM, { cents: false })}</td><td class="num">${pct(r.value / total, 1)}</td><td class="spark-cell hide-sm">${sparkline(trendMonths.map(m => categoryActuals(lensed(txInMonth(m)))[r.id] || 0), { w: 90, h: 22, color: `var(--c${(groupIdx[r.group] % 8) + 1})` })}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="hide-sm"></td><td class="num total">${money(total, { cents: false })}</td><td class="num hide-sm">${money(total / nM, { cents: false })}</td><td></td><td class="hide-sm"></td></tr></tfoot></table>`;
  }

  if (tab === 'statement') {
    const ms = months.slice(-12);
    const per = ms.map(m => categoryActuals(lensed(txInMonth(m))));
    const cats = state.categories.filter(c => c.kind !== 'transfer' && per.some(a => a[c.id]));
    const inc = cats.filter(c => c.kind === 'income'), exp = groupBy(cats.filter(c => c.kind === 'expense'), c => c.group);
    const hasUnc = per.some(a => a._none);
    const row = (label, vals, cls = '') => `<tr class="${cls}"><th scope="row">${label}</th>${vals.map(v => `<td class="num">${v ? money(v, { cents: false }) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num total-col">${money(sum(vals), { cents: false })}</td></tr>`;
    const incT = ms.map((_, i) => sum(inc.map(c => per[i][c.id] || 0)));
    const expT = ms.map((_, i) => sum(cats.filter(c => c.kind === 'expense').map(c => per[i][c.id] || 0)) + (per[i]._none || 0));
    return head + `<div class="toolbar"><button class="btn small" data-act="export-statement" data-from="${R.from}" data-to="${R.to}">Export CSV</button><span class="muted small">Showing ${ms.length} month${ms.length > 1 ? 's' : ''}. Transfers are left out.</span></div>
    <div class="scroll-table"><table class="ledger statement"><thead><tr><th>Category</th>${ms.map(m => `<th class="num">${monthLabel(m, true)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      <tr class="sect"><th colspan="${ms.length + 2}">Income</th></tr>
      ${inc.map(c => row(`<span class="indent-in">${esc(c.name)}</span>`, ms.map((_, i) => per[i][c.id] || 0))).join('')}
      ${row('Total income', incT, 'subtotal')}
      <tr class="sect"><th colspan="${ms.length + 2}">Spending</th></tr>
      ${Object.entries(exp).map(([g, cs]) => row(`<strong>${esc(g)}</strong>`, ms.map((_, i) => sum(cs.map(c => per[i][c.id] || 0))), 'grp') + cs.map(c => row(`<span class="indent-in">${esc(c.name)}</span>`, ms.map((_, i) => per[i][c.id] || 0), 'detail-only')).join('')).join('')}
      ${hasUnc ? row('<strong>Uncategorized</strong>', ms.map((_, i) => per[i]._none || 0), 'grp') : ''}
      ${row('Total spending', expT, 'subtotal')}
      ${row('Net', ms.map((_, i) => incT[i] - expT[i]), 'net')}
      <tr class="rate"><th scope="row">Savings rate</th>${ms.map((_, i) => `<td class="num">${incT[i] ? pct((incT[i] - expT[i]) / incT[i], 0) : '—'}</td>`).join('')}<td class="num total-col">${sum(incT) ? pct((sum(incT) - sum(expT)) / sum(incT), 0) : '—'}</td></tr>
    </tbody></table></div>`;
  }

  if (tab === 'yoy') {
    const shift = d => `${+d.slice(0, 4) - 1}${d.slice(4)}`;
    const lyFrom = shift(R.from), lyTo = shift(R.to) === `${+R.to.slice(0, 4) - 1}-02-29` ? `${+R.to.slice(0, 4) - 1}-02-28` : shift(R.to);
    const a1 = categoryActuals(lensed(txInRange(lyFrom, lyTo)));
    const ids = [...new Set([...Object.keys(acts), ...Object.keys(a1)])].filter(id => id !== '_none' && catById(id) && catById(id).kind !== 'transfer');
    const rows = ids.map(id => ({ c: catById(id), now: acts[id] || 0, then: a1[id] || 0 })).filter(r => r.now || r.then).sort((x, y) => Math.abs(y.now - y.then) - Math.abs(x.now - x.then));
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.now - r.then)));
    const f0 = flowSummary(lensed(txInRange(lyFrom, lyTo))), f1 = flowSummary(txs);
    return head + `
    <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th></tr></thead><tbody>
      <tr><th scope="row">${dateLabel(R.from, true)} to ${dateLabel(R.to, true)}</th><td class="num">${money(f1.income, { cents: false })}</td><td class="num">${money(f1.spending, { cents: false })}</td><td class="num">${money(f1.net, { cents: false })}</td></tr>
      <tr><th scope="row">Same period a year earlier</th><td class="num muted">${money(f0.income, { cents: false })}</td><td class="num muted">${money(f0.spending, { cents: false })}</td><td class="num muted">${money(f0.net, { cents: false })}</td></tr></tbody></table></section>
    ${rows.length ? `<table class="ledger yoy" data-sort-id="rep-yoy"><thead><tr><th>Category</th><th class="num">A year earlier</th><th class="num">Now</th><th class="num">Change</th><th class="diverge-cell hide-sm"></th></tr></thead><tbody>
      ${rows.map(r => { const d = r.now - r.then, bad = r.c.kind === 'income' ? d < 0 : d > 0; return `<tr><th scope="row">${esc(r.c.name)} <span class="muted small">${esc(r.c.group)}</span></th><td class="num muted">${money(r.then, { cents: false })}</td><td class="num">${money(r.now, { cents: false })}</td><td class="num ${bad ? 'neg' : 'pos'}">${money(d, { cents: false, sign: true })}${r.then ? `<div class="small">${pct(d / r.then, 0)}</div>` : ''}</td><td class="diverge-cell hide-sm"><div class="diverge"><span class="${bad ? 'bad' : 'good'}" style="${d >= 0 ? 'left:50%' : `right:50%`};width:${Math.abs(d) / maxAbs * 50}%"></span></div></td></tr>`; }).join('')}
    </tbody></table>` : emptyState('No history to compare yet', 'Year-over-year needs transactions from the same period last year.')}`;
  }

  if (tab === 'people') {
    const ms = months.length >= 2 ? months.slice(-12) : Array.from({ length: 12 }, (_, i) => addMonths(thisMonth(), i - 11));
    const all = txInRange(R.from, R.to);
    const per = people().map(m => { const t = all.filter(x => personOf(x) === m.id); return { m, f: flowSummary(t), acts: categoryActuals(t) }; });
    const tot = sum(per.map(x => x.f.spending)) || 1;
    const cats = state.categories.filter(c => c.kind === 'expense' && per.some(x => (x.acts[c.id] || 0) > 0)).sort((a, b) => sum(per.map(x => x.acts[b.id] || 0)) - sum(per.map(x => x.acts[a.id] || 0)));
    return head + `
    <div class="people-cards">${per.map(x => `<div class="person-card" style="--pc:${memberColor(x.m.id)}"><span class="person-name">${esc(x.m.name)}</span><span class="s-value num">${money(x.f.spending, { cents: false })}</span><span class="muted">${pct(x.f.spending / tot, 0)} of household spending</span>
      <ul>${Object.entries(x.acts).filter(([id, v]) => v > 0 && catById(id)?.kind === 'expense').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => `<li><span>${esc(catName(id))}</span><span class="num">${money(v, { cents: false })}</span></li>`).join('')}</ul></div>`).join('')}</div>
    <section class="panel"><header class="panel-head"><h2>Spending by person, by month</h2></header>
      ${chartHost({ type: 'stack', h: 240, labels: ms.map(m => MON[+m.slice(5) - 1]), series: people().map(m => ({ name: m.name, color: memberColor(m.id), values: ms.map(mm => flowSummary(txInMonth(mm).filter(t => personOf(t) === m.id)).spending) })),
        tip: i => `<strong>${monthLabel(ms[i])}</strong>${people().map(m => `<br>${esc(m.name)} ${money(flowSummary(txInMonth(ms[i]).filter(t => personOf(t) === m.id)).spending, { cents: false })}`).join('')}` })}
      <p class="legend">${people().map(m => `<span><i style="background:${memberColor(m.id)}"></i>${esc(m.name)}</span>`).join('')}</p></section>
    <table class="ledger" data-sort-id="rep-person"><thead><tr><th>Category</th>${per.map(x => `<th class="num">${esc(x.m.name)}</th>`).join('')}<th class="num">Household</th></tr></thead><tbody>
      ${cats.map(c => `<tr><th scope="row">${esc(c.name)}</th>${per.map(x => `<td class="num">${x.acts[c.id] > 0 ? money(x.acts[c.id], { cents: false }) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num">${money(sum(per.map(x => Math.max(0, x.acts[c.id] || 0))), { cents: false })}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small">A transaction belongs to its account’s owner unless you set a person on it. Set owners in each account and people in Settings.</p>`;
  }

  // net worth
  const ms = Object.keys(state.snapshots).sort();
  const inNW = id => { const a = acctById(id); return a ? nwIncludes(a, true) : !lensActive(); };   // the estate's, and the menu's people
  const bucketVals = b => ms.map(m => sum(Object.entries(state.snapshots[m]).filter(([id]) => inNW(id) && (ACCOUNT_TYPES[acctById(id)?.type]?.bucket || 'illiquid') === b).map(([, v]) => v)));
  const nw = ms.map(m => snapshotNW(m, true));
  const ago = ms[Math.max(0, ms.length - 13)];
  return head + `
  <section class="panel"><header class="panel-head"><h2>Net worth over time</h2><span class="muted small">Areas show what you own by type; debt sits below zero. The line is net worth.</span></header>
    ${chartHost({ type: 'stack', h: 300, labels: ms.map(m => monthLabel(m, true)), series: [['cash', 'Cash', 'var(--c2)'], ['invest', 'Investments', 'var(--c1)'], ['illiquid', 'Property and private', 'var(--c4)'], ['debt', 'Debt', 'var(--neg)']].map(([b, name, color]) => ({ name, color, values: bucketVals(b) })), line: { values: nw, color: 'var(--ink)' },
      tip: i => `<strong>${monthLabel(ms[i])}</strong><br>Net worth ${money(nw[i], { cents: false })}` })}
    <p class="legend"><span><i style="background:var(--c2)"></i>Cash</span><span><i style="background:var(--c1)"></i>Investments</span><span><i style="background:var(--c4)"></i>Property and private</span><span><i style="background:var(--neg)"></i>Debt</span><span><i style="background:var(--ink);height:2px"></i>Net worth</span></p></section>
  <table class="ledger" data-sort-id="rep-nw"><thead><tr><th>Account</th><th class="num">${ago ? monthLabel(ago, true) : ''}</th><th class="num">Now</th><th class="num">Change</th><th class="spark-cell hide-sm" data-nosort>Trend</th></tr></thead><tbody>
    ${lensAccounts().filter(a => nwIncludes(a, true)).map(a => { const then = ago ? state.snapshots[ago][a.id] : null, now = signedValue(a); return `<tr><th scope="row">${esc(a.name)}</th><td class="num muted">${then == null ? '—' : money(then, { cents: false })}</td><td class="num">${money(now, { cents: false })}</td><td class="num ${then == null ? '' : signClass(now - then)}">${then == null ? '' : money(now - then, { cents: false, sign: true })}</td><td class="spark-cell hide-sm">${sparkline(ms.slice(-13).map(m => state.snapshots[m][a.id] || 0), { w: 90, h: 22, color: isLiability(a) ? 'var(--neg)' : 'var(--ink-accent)' })}</td></tr>`; }).join('')}
  </tbody><tfoot><tr><th scope="row">${esc(nwLabel())}</th><td class="num total">${ago ? money(snapshotNW(ago, true), { cents: false }) : ''}</td><td class="num total">${money(totals(true).netWorth, { cents: false })}</td><td class="num total ${ago ? signClass(totals(true).netWorth - snapshotNW(ago, true)) : ''}">${ago ? money(totals(true).netWorth - snapshotNW(ago, true), { cents: false, sign: true }) : ''}</td><td class="hide-sm"></td></tr></tfoot></table>`;
};
function sankeyFromActs(acts) {
  const inc = [], groups = {};
  for (const [id, v] of Object.entries(acts)) { const c = catById(id); if (!c) { if (v > 0) groups.Uncategorized = (groups.Uncategorized || 0) + v; continue; } if (c.kind === 'income' && v > 0) inc.push({ name: c.name, value: v }); else if (c.kind === 'expense' && v > 0) groups[c.group] = (groups[c.group] || 0) + v; }
  const income = sum(inc.map(x => x.value)), spending = sum(Object.values(groups));
  const right = Object.entries(groups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (income > spending) right.push({ name: 'Saved', value: income - spending, saved: true }); else if (spending > income) inc.push({ name: 'From savings or shared income', value: spending - income, drawn: true });
  return { left: inc.sort((a, b) => (a.drawn ? 1 : 0) - (b.drawn ? 1 : 0) || b.value - a.value), right, income, spending };
}

/* ================= Planning ================= */
VIEWS.planning = p => {
  const tab = p.t || 'goals';
  const head = pageHead('Planning', tab === 'retire' ? 'A Monte Carlo projection in today’s dollars. It’s a planning tool, not a promise.' : tab === 'debt' ? 'Pay debt off faster and see what it saves.' : 'What you’re saving toward, and whether you’re on pace.',
    tab === 'goals' ? '<button class="btn primary" data-act="add-goal">Add a goal</button>' : '') + tabs('t', tab, [['goals', 'Goals'], ['retire', 'Retirement'], ['debt', 'Debt payoff']]);
  if (tab === 'goals') {
    if (!state.goals.length) return head + emptyState('No goals yet', 'Create a goal for an emergency fund, a trip, a down payment or college. Link it to an account or a rollover budget and Ọrọ̀ tracks progress automatically.', '<button class="btn primary" data-act="add-goal">Add a goal</button>');
    return head + `<div class="goal-grid">${state.goals.map(g => {
      const pr = goalProgress(g);
      return `<article class="goal-card ${pr.status}">
        ${ring(pr.share, { size: 108, width: 11, label: pct(pr.share, 0), color: pr.status === 'behind' ? 'var(--warn)' : pr.status === 'done' ? 'var(--pos)' : 'var(--ink-accent)' })}
        <div><h3><button class="linklike" data-edit-goal="${g.id}">${esc(g.name)}</button></h3>
        <p class="s-value num">${money(pr.current, { cents: false })} <span class="muted">of ${money(pr.target, { cents: false })}</span></p>
        <dl class="goal-facts">
          ${g.targetDate ? `<div><dt>Target date</dt><dd>${dateLabel(g.targetDate, true)}</dd></div>` : ''}
          ${pr.needed != null && pr.status !== 'done' ? `<div><dt>Needed each month</dt><dd class="num">${money(pr.needed, { cents: false })}</dd></div>` : ''}
          ${g.monthly ? `<div><dt>Planned each month</dt><dd class="num">${money(g.monthly, { cents: false })}</dd></div>` : ''}
          <div><dt>Tracks</dt><dd>${esc(pr.source)}</dd></div></dl>
        <span class="goal-status ${pr.status}">${pr.status === 'done' ? 'Funded' : pr.status === 'behind' ? 'Behind pace' : 'On track'}</span></div></article>`;
    }).join('')}</div>`;
  }
  if (tab === 'debt') {
    const P = state.plan, debts = debtList();
    if (!debts.length) return head + emptyState('No debt to pay off', P.includeMortgages ? 'There are no liabilities with a balance.' : 'No cards or loans have a balance. Mortgages are left out unless you include them.', `<label class="check"><input type="checkbox" data-plan="includeMortgages" ${P.includeMortgages ? 'checked' : ''}> Include mortgages</label>`);
    const plan = payoffPlan(debts, P.debtExtra, P.debtMethod), other = payoffPlan(debts, P.debtExtra, P.debtMethod === 'avalanche' ? 'snowball' : 'avalanche'), min = payoffPlan(debts, 0, 'avalanche');
    const dateAt = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
    const len = Math.max(plan.series.length, min.series.length);
    const pad = (s) => Array.from({ length: len }, (_, i) => ({ x: i, y: s[i] ? s[i].y : 0 }));
    return head + `
    <div class="form-grid four">
      <label class="field"><span>Extra each month</span><input data-plan="debtExtra" inputmode="decimal" value="${P.debtExtra}"></label>
      <label class="field"><span>Strategy</span><select data-plan="debtMethod"><option value="avalanche" ${P.debtMethod === 'avalanche' ? 'selected' : ''}>Highest rate first (avalanche)</option><option value="snowball" ${P.debtMethod === 'snowball' ? 'selected' : ''}>Smallest balance first (snowball)</option></select></label>
      <label class="check"><input type="checkbox" data-plan="includeMortgages" ${P.includeMortgages ? 'checked' : ''}> Include mortgages</label>
    </div>
    <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Debt-free</th><th class="num">Months</th><th class="num">Interest paid</th></tr></thead><tbody>
      <tr><th scope="row">Your plan (${P.debtMethod})</th><td class="num">${plan.capped ? 'Over 50 years' : dateAt(plan.months)}</td><td class="num">${plan.months}</td><td class="num">${money(plan.interest, { cents: false })}</td></tr>
      <tr><th scope="row">${P.debtMethod === 'avalanche' ? 'Snowball instead' : 'Avalanche instead'}</th><td class="num muted">${dateAt(other.months)}</td><td class="num muted">${other.months}</td><td class="num muted">${money(other.interest, { cents: false })}</td></tr>
      <tr><th scope="row">Minimums only</th><td class="num muted">${min.capped ? 'Over 50 years' : dateAt(min.months)}</td><td class="num muted">${min.months}</td><td class="num muted">${money(min.interest, { cents: false })}</td></tr></tbody></table>
      <p class="callout">${P.debtExtra > 0 ? `Paying ${money(P.debtExtra, { cents: false })} extra a month saves <strong>${money(min.interest - plan.interest, { cents: false })}</strong> in interest and finishes <strong>${min.months - plan.months} months</strong> sooner.` : 'Add an extra monthly amount to see what it saves.'}</p></section>
    <section class="panel"><header class="panel-head"><h2>Balance remaining</h2></header>
      ${chartHost({ h: 230, label: 'Debt balance over time', series: [{ points: pad(min.series), color: 'var(--muted-2)', dash: true, nodots: true }, { points: pad(plan.series), color: 'var(--ink-accent)', area: true, nodots: true }], xFmt: i => i % 12 === 0 ? `${new Date().getFullYear() + i / 12}` : `+${i}m`, tip: i => `<strong>${dateAt(i)}</strong><br>Your plan ${money(plan.series[i]?.y || 0, { cents: false })}<br><span class="muted">Minimums ${money(min.series[i]?.y || 0, { cents: false })}</span>` })}
      <p class="legend"><span><i style="background:var(--ink-accent)"></i>Your plan</span><span><i style="background:var(--muted-2)"></i>Minimums only</span></p></section>
    <table class="ledger" data-sort-id="debts"><thead><tr><th>Debt</th><th class="num">Balance</th><th class="num">Rate</th><th class="num">Minimum</th><th class="num" data-sort-first="asc">Paid off</th></tr></thead><tbody>
      ${plan.debts.sort((a, b) => (a.paidMonth || 999) - (b.paidMonth || 999)).map(d => `<tr><th scope="row"><button class="linklike" data-edit-acct="${d.id}">${esc(d.name)}</button></th><td class="num">${money(d.balance, { cents: false })}</td><td class="num" data-v="${d.rate || ''}">${d.rate ? d.rate + '%' : '<span class="muted">add rate</span>'}</td><td class="num">${money(d.min, { cents: false })}</td><td class="num" data-v="${d.paidMonth || ''}">${d.paidMonth ? dateAt(d.paidMonth) : '—'}</td></tr>`).join('')}
    </tbody></table><p class="muted small">Rates and minimum payments come from each account. Missing minimums assume 2% of the balance.</p>`;
  }
  // retirement
  const P = state.plan, D = planDefaults();
  if (!P.age) return head + `<section class="panel narrow"><h2>Start with your age</h2><p class="muted">Ọrọ̀ fills in the rest from your accounts and spending, and you can adjust any of it.</p>
    <div class="form-grid"><label class="field"><span>Your age</span><input data-plan="age" inputmode="numeric" autofocus placeholder="e.g. 42"></label><label class="field"><span>Retire at</span><input data-plan="retireAge" inputmode="numeric" value="${P.retireAge}"></label></div></section>`;
  const stats = portfolioStats(D.alloc);
  const inp = {
    age: +P.age, retireAge: +P.retireAge, endAge: +P.endAge,
    start: P.start != null && P.start !== '' ? +P.start : D.start,
    savings: (P.savings != null && P.savings !== '' ? +P.savings : D.savings) + (+P.payrollSavings || 0),
    spending: P.spending != null && P.spending !== '' ? +P.spending : D.spending,
    otherIncome: +P.otherIncome || 0, otherIncomeAge: +P.otherIncomeAge || 67,
    rentalNet: P.includeRental ? D.rentalNet : 0, inflation: +P.inflation,
    mean: P.mean != null && P.mean !== '' ? P.mean / 100 : stats.mean, sd: P.sd != null && P.sd !== '' ? P.sd / 100 : stats.sd,
  };
  const res = runRetirement(inp, { sims: +P.sims || 2000 });
  const target = (+P.target || 90) / 100;
  const safe = safeSpending(inp, target), early = earliestRetirement(inp, target);
  const xs = res.bands.map((_, i) => inp.age + i);
  const ri = inp.retireAge - inp.age;
  const tone = res.success >= 0.85 ? 'var(--pos)' : res.success >= 0.7 ? 'var(--warn)' : 'var(--neg)';
  const field = (k, label, val, ph, help) => `<label class="field"><span>${label}</span><input data-plan="${k}" inputmode="decimal" value="${val ?? ''}" placeholder="${ph ?? ''}">${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  return head + `
  <div class="plan-layout">
    <section class="panel plan-inputs">
      <h2>Assumptions</h2>
      <div class="form-grid">
        ${field('age', 'Your age', P.age)}${field('retireAge', 'Retire at', P.retireAge)}
        ${field('endAge', 'Plan through age', P.endAge)}${field('inflation', 'Inflation (%)', P.inflation)}
      </div>
      <div class="form-grid">
        ${field('start', 'Invested today', P.start, money(D.start, { cents: false }), 'Cash, investments' + (P.includePrivate ? ' and private' : ''))}
        ${field('savings', 'Saved per year from cash flow', P.savings, money(D.savings, { cents: false }), 'Last 12 months, after spending')}
        ${field('payrollSavings', '401(k) and payroll savings per year', P.payrollSavings, '0', 'Taken out before your paycheck')}
        ${field('spending', 'Spending in retirement per year', P.spending, money(D.spending, { cents: false }), 'Today’s dollars; defaults to the last 12 months')}
        ${field('otherIncome', 'Social Security or pension per year', P.otherIncome, '0', 'Today’s dollars')}
        ${field('otherIncomeAge', 'Starting at age', P.otherIncomeAge)}
      </div>
      <div class="form-grid">
        ${field('mean', 'Expected return (%)', P.mean, (stats.mean * 100).toFixed(1), 'From your allocation')}
        ${field('sd', 'Volatility (%)', P.sd, (stats.sd * 100).toFixed(1))}
        ${field('target', 'Confidence target (%)', P.target)}
        ${field('sims', 'Simulations', P.sims)}
      </div>
      <label class="check"><input type="checkbox" data-plan="includePrivate" ${P.includePrivate ? 'checked' : ''}> Count private investments</label>
      <label class="check"><input type="checkbox" data-plan="includeRental" ${P.includeRental ? 'checked' : ''}> Keep rental cash flow in retirement (${money(D.rentalNet, { cents: false })} a year)</label>
      <p class="muted small">Leave a field blank to use the value Ọrọ̀ works out from your data. Returns are drawn from a lognormal distribution each year; everything is in today’s dollars.</p>
    </section>
    <div class="plan-results">
      <section class="panel result-hero">
        ${ring(res.success, { size: 132, width: 13, label: pct(res.success, 0), color: tone })}
        <div><h2>Chance your money lasts to ${inp.endAge}</h2>
          <p>Retiring at <strong>${inp.retireAge}</strong> and spending <strong>${money(inp.spending, { cents: false })}</strong> a year, the plan works in ${pct(res.success, 0)} of ${(+P.sims || 2000).toLocaleString()} simulated markets.${res.depletedMedianAge ? ` When it doesn’t, money typically runs out around ${Math.round(res.depletedMedianAge)}.` : ''}</p>
          <dl class="kpis three"><div><dt>Spend up to</dt><dd class="num">${money(safe, { cents: false })}</dd><span class="muted small">a year at ${pct(target, 0)} confidence</span></div>
          <div><dt>Earliest retirement</dt><dd>${early ? `Age ${early}` : 'After 80'}</dd><span class="muted small">at today’s spending</span></div>
          <div><dt>Median at ${inp.retireAge}</dt><dd class="num">${money(res.bands[Math.min(ri, res.bands.length - 1)][2], { cents: false })}</dd><span class="muted small">in today’s dollars</span></div></dl></div>
      </section>
      <section class="panel"><header class="panel-head"><h2>Range of outcomes</h2><span class="muted small">Today’s dollars</span></header>
        ${chartHost({ h: 280, label: 'Projected portfolio range', series: [{ points: res.bands.map((b, i) => ({ x: xs[i], y: b[2] })), color: 'var(--ink-accent)', nodots: true }],
          bands: [{ lo: res.bands.map(b => b[0]), hi: res.bands.map(b => b[4]), color: 'var(--ink-accent)', opacity: 0.12 }, { lo: res.bands.map(b => b[1]), hi: res.bands.map(b => b[3]), color: 'var(--ink-accent)', opacity: 0.2 }],
          vlines: ri > 0 && ri < xs.length ? [{ i: ri, label: 'Retire' }] : [], xFmt: x => `${x}`,
          tip: i => `<strong>Age ${xs[i]}</strong><br>Strong markets ${money(res.bands[i][4], { cents: false })}<br>Median ${money(res.bands[i][2], { cents: false })}<br>Weak markets ${money(res.bands[i][0], { cents: false })}` })}
        <p class="legend"><span><i style="background:var(--ink-accent)"></i>Median</span><span><i style="background:var(--ink-accent);opacity:.35"></i>Middle half of outcomes</span><span><i style="background:var(--ink-accent);opacity:.15"></i>80% of outcomes</span></p></section>
    </div>
  </div>`;
};

/* ================= Taxes ================= */
VIEWS.taxes = p => {
  const year = +(p.y || new Date().getFullYear());
  const years = [...new Set([new Date().getFullYear(), new Date().getFullYear() - 1, ...state.transactions.map(t => yearOf(t.date))])].sort((a, b) => b - a);
  const rentals = activeAccounts().filter(a => a.type === 'realestate' && a.rental);
  const ded = deductionSummary(year);
  return pageHead('Taxes', `${year} tax year. Organized for your CPA; not tax advice.`, `<label class="field inline"><span class="sr">Year</span><select data-filter="y">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label><button class="btn" data-act="export-tax" data-year="${year}">Export for your CPA</button>`) + `
  ${rentals.length ? rentals.map(a => {
    const E = scheduleE(a, year), g = a.rentalGroup || 'Rental property';
    const rentalCats = state.categories.filter(c => c.group === g);
    return `<section class="panel"><header class="panel-head"><h2>Schedule E: ${esc(a.name)}</h2><span class="muted small">Part I, rental real estate</span></header>
      <div class="cols tight">
        <table class="ledger compact sched"><tbody>
          ${Object.keys(SCHED_E).filter(k => E.lines[k] || k === '3' || k === '12' || k === '18').map(k => `<tr class="${k === '3' ? 'income-line' : ''}"><td class="lineno">${k}</td><th scope="row">${SCHED_E[k]}</th><td class="num">${money(E.lines[k] || 0)}</td></tr>`).join('')}
          <tr class="subtotal"><td class="lineno">20</td><th scope="row">Total expenses</th><td class="num total">${money(E.expenses)}</td></tr>
          <tr class="net"><td class="lineno">21</td><th scope="row">Income or (loss)</th><td class="num total double ${signClass(E.net)}">${money(E.net, { paren: true })}</td></tr>
        </tbody></table>
        <div class="tax-side">
          <label class="field"><span>Mortgage interest from Form 1098, ${year}</span><input data-taxint="${a.id}" data-year="${year}" inputmode="decimal" value="${state.tax?.[a.id]?.[year]?.interest ?? ''}" placeholder="0.00"><small class="muted">Recorded mortgage payments this year: ${money(E.debtPaid, { cents: false })} (principal and interest). Only the interest goes on line 12.</small></label>
          <p class="small">${a.buildingBasis && a.placedInService ? `Depreciation: ${money(a.buildingBasis, { cents: false })} building basis over 27.5 years from ${dateLabel(a.placedInService, true)} (mid-month convention).` : `<button class="linklike" data-edit-acct="${a.id}">Add the building basis and in-service date</button> to calculate depreciation.`}</p>
          <details><summary>Which line each category goes on</summary>
            <table class="ledger compact"><tbody>${rentalCats.map(c => `<tr><th scope="row">${esc(c.name)}</th><td>${c.rental === 'debt' ? '<span class="muted">Debt service (use 1098 interest)</span>' : `<select data-schede="${c.id}">${Object.entries(SCHED_E).filter(([k]) => k !== '18' && k !== '12').map(([k, l]) => `<option value="${k}" ${(c.schedE || (c.rental === 'income' ? '3' : '19')) === k ? 'selected' : ''}>Line ${k}: ${l}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table></details>
        </div>
      </div></section>`;
  }).join('') : `<section class="panel"><h2>Rental property</h2><p class="muted">Mark a real-estate account as a rental to build its Schedule E here.</p></section>`}
  <section class="panel"><header class="panel-head"><h2>Possible deductions and credits</h2><span class="muted small">From categories with a tax tag</span></header>
    ${Object.keys(ded.by).length ? `<table class="ledger compact"><tbody>${Object.entries(ded.by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="muted small">${state.categories.filter(c => c.taxTag === k).map(c => esc(c.name)).join(', ')}</td><td class="num">${money(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No spending in tax-tagged categories this year. Tag categories (charitable, medical, dependent care) in Settings.</p>'}
    ${ded.tagged.length ? `<h3>Transactions tagged #tax</h3><table class="ledger compact"><tbody>${ded.tagged.map(t => `<tr><td class="nowrap muted">${dateLabel(t.date, true)}</td><td>${esc(t.payee)}</td><td class="num">${money(t.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Tag any transaction #tax to collect it here.</p>'}
  </section>`;
};

/* ================= Settings ================= */
VIEWS.data = () => {
  const n = state.transactions.length;
  const groups = groupBy(state.categories, c => c.group);
  let where;
  if (Store.dir) where = Store.perm === 'granted' ? `Saving to your <strong>${esc(Store.fileName)}</strong> folder: <code>data/oro.json</code> (each save is numbered at the bottom of the sidebar; your iPhone shows the same number once it has that copy), with a dated copy in <code>backups/</code> each day and receipts in <code>receipts/</code>.` : `Your <strong>${esc(Store.fileName)}</strong> folder is connected, but this browser needs your permission again.`;
  else if (Store.handle) where = `Saving to <strong>${esc(Store.fileName)}</strong>. Switch to a Ọrọ̀ folder to get daily backups and receipts.`;
  else where = 'Only saved in this browser’s private storage. Choose your Ọrọ̀ folder so your data lives as files you can see and back up.';
  const lm = state.meta.lastMerge;
  const phoneLine = !isCompanion() && Store.dir ? `<p class="muted small"><strong>iPhone:</strong> changes you send from Ọrọ̀ on your iPhone are saved into <code>inbox/</code> in this folder and added here automatically while Ọrọ̀ is open.${lm ? ` Last added ${esc(whenLabel(lm.at))}: ${changesWord(lm.applied)} from your ${esc(lm.device)}${lm.conflicts ? `, ${lm.conflicts} kept as this Mac’s version${lm.kept?.length ? ` (${lm.kept.slice(0, 6).map(esc).join(', ')}${lm.kept.length > 6 ? '…' : ''})` : ''}` : ''}.` : ''}</p>` : '';
  if (isCompanion()) {
    const dev = deviceLabel(), rec = SYNC.rec, n = rec && !rec.replaced ? syncPending().length : 0;
    where = rec ? (rec.replaced ? `The data on this ${dev} was replaced, so it no longer matches your Mac’s. Get the latest from iCloud Drive to start fresh.` : `This ${dev} has your Mac’s <strong>${esc(saveLabel(rec.macSaveNo, rec.macSaved))}</strong>.${mergeNote(rec.base?.meta?.lastMerge, dev)} ${n ? `${changesWord(n)} made here ${n === 1 ? 'isn’t' : 'aren’t'} on your Mac yet.` : 'Everything you’ve changed here has been sent.'}`)
      : `Saved on this ${dev} only. Open your Mac’s data from iCloud Drive to work with the same numbers in both places.`;
  }
  return pageHead('Settings', '') + `
  <section class="panel">
    <header class="panel-head"><h2>Where your data lives</h2><span class="muted small">${isCompanion() ? 'Only on your devices and in your iCloud' : 'Nothing ever leaves this Mac'}</span></header>
    <p>${where}</p>
    <div class="actions wrap">
      ${Store.canPickFolder ? (Store.dir && Store.perm !== 'granted' ? `<button class="btn primary" data-act="reconnect">Reconnect ${esc(Store.fileName)}</button>` : `<button class="btn ${Store.dir ? '' : 'primary'}" data-act="connect-folder">${Store.dir ? 'Choose a different folder…' : 'Choose your Ọrọ̀ folder…'}</button>`) : ''}
      ${isCompanion() ? `<button class="btn primary" data-act="sync">${SYNC.rec ? 'Sync with your Mac…' : 'Open from iCloud Drive…'}</button>` : `<button class="btn" data-act="open-file">Open a data file…</button>`}
      <button class="btn" data-act="backup">Download a backup</button>
      <button class="btn ghost" data-act="export-csv">Export transactions as CSV</button>
      ${Store.dir || Store.handle ? `<button class="btn ghost" data-act="disconnect-file">Disconnect</button>` : ''}
    </div>
    ${isCompanion() ? `<p class="muted small">Your Mac’s data is in <strong>iCloud Drive › Ọrọ̀ › data › oro.json</strong>. Changes you send go to <strong>iCloud Drive › Ọrọ̀ › inbox</strong>, and your Mac adds them the next time Ọrọ̀ is open there. If both places change the same item, your Mac’s version is kept.</p>` : `<p class="muted small">Tip: choose the Ọrọ̀ folder this app lives in (iCloud Drive › Ọrọ̀). Because that folder syncs through iCloud Drive, turn on a passphrase so the copy Apple stores is encrypted.</p>${phoneLine}`}
    <div id="backup-list" class="backup-list"></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Security</h2><span class="muted small">${Store.key ? 'Encrypted' : 'Not encrypted'}</span></header>
    <p>${Store.key ? 'Your data, backups and receipts are encrypted with AES-256 using your passphrase.' : 'Add a passphrase to encrypt your data, backups and receipts. Anyone who gets the files can’t read them without it.'} There’s no way to recover a forgotten passphrase, so store it in your password manager.</p>
    <div class="form-grid">
      <div class="actions">${Vault.available() ? (Store.key ? `<button class="btn" data-act="change-pass">Change passphrase</button><button class="btn ghost danger-text" data-act="remove-pass">Remove</button>` : `<button class="btn primary" data-act="set-pass">Add a passphrase</button>`) : '<span class="muted">Encryption isn’t available in this browser.</span>'}</div>
      <label class="field"><span>Lock after inactivity</span><select data-setting="autoLock" ${Store.key ? '' : 'disabled'}>${[[0, 'Never'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']].map(([v, l]) => `<option value="${v}" ${+state.settings.autoLock === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${Store.key ? '' : '<small class="muted">Needs a passphrase</small>'}</label>
    </div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Household</h2></header>
    <p class="muted">People in the household, and anyone else who owns accounts you track. Each account has an owner, and each transaction belongs to its account’s owner unless you choose someone else. Use Joint for shared spending.</p>
    <div class="member-list">${members().map((m, i) => `<div class="member-row"><span class="person-dot big" style="background:${memberColor(m.id)}"></span><input data-member="${m.id}" value="${esc(m.name)}" aria-label="Name">${m.id !== 'joint' ? `<select class="member-role" data-member-role="${m.id}" aria-label="${esc(m.name)}: who they are">${roleOptions(roleOf(m.id))}</select><button class="icon-btn" data-member-del="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>` : '<span class="muted small">shared</span>'}</div>`).join('')}</div>
    <p class="muted small">Children’s accounts, irrevocable trusts, charities and anyone else’s are outside your estate: they’re listed on <a href="#/balance?t=out">Balance sheet › Out of estate</a> and left out of your net worth. A revocable trust counts as yours. Marking children also adds “Without the kids” to the menu at the top.</p>
    <div class="actions"><button class="btn" data-act="add-member">Add a person</button><button class="btn ghost" data-act="add-entity">Add a trust, charity or other owner</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Appearance and privacy</h2></header>
    <div class="form-grid">
      <label class="field"><span>Theme</span><select data-setting="look">${[['ng', 'Ọrọ̀: forest, ivory and brass'], ['classic', 'Classic: blue ledger']].map(([v, l]) => `<option value="${v}" ${(state.settings.look === 'classic' ? 'classic' : 'ng') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Light or dark</span><select data-setting="theme">${[['auto', isTouch() ? 'Match this device' : 'Match my Mac'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${(state.settings.theme || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-setting-bool="privacy" ${state.settings.privacy ? 'checked' : ''}> ${isTouch() ? 'Hide amounts until I tap them' : 'Hide amounts until I hover (⇧P)'}</label>
      <label class="field"><span>Flag balances older than (days)</span><input data-setting="staleDays" inputmode="numeric" value="${state.settings.staleDays}"></label>
      <label class="field"><span>Warn when cash may dip below</span><input data-setting="lowCash" inputmode="decimal" value="${state.settings.lowCash}"></label>
      <label class="field"><span>Daily backups to keep</span><input data-setting="keepBackups" inputmode="numeric" value="${state.settings.keepBackups}"><small class="muted">Plus one per month for a year</small></label>
    </div>
  </section>

  ${checkinSettings()}

  <section class="panel">
    <header class="panel-head"><h2>Categorization rules</h2><span class="muted small">${state.rules.length} rule${state.rules.length === 1 ? '' : 's'}</span></header>
    <p class="muted">When a payee contains the text, and the amount, money in or out, and account match if you set them, it gets that category (and optionally a person), on import and when you auto-categorize. When more than one rule fits, the more specific one wins. Your rules always win. After them Ọrọ̀ uses how you categorized the same merchant before, a built-in list of about 2,000 merchants, the merchant code some banks include, the bank’s own category, and finally words in the name like GRILL, PHARMACY or DENTAL. All of it runs on your device.</p>
    ${state.rules.length ? `<div class="scroll-table short"><table class="ledger compact" data-sort-id="rules"><thead><tr><th>Payee contains</th><th>Category</th><th class="hide-sm">Person</th><th class="hide-sm">Rename to</th><th></th></tr></thead><tbody>
    ${state.rules.map(r => `<tr><td>${r.text ? `<code>${esc(r.text)}</code>` : '<span class="muted">Any payee</span>'}${ruleHasConds(r) ? `<div class="muted small">${esc(ruleCondText(r))}</div>` : ''}</td><td>${esc(catName(r.categoryId))}</td><td class="hide-sm muted">${r.person ? esc(memberName(r.person)) : ''}</td><td class="hide-sm muted">${esc(r.rename || '')}</td><td class="acts"><button class="linklike small" data-edit-rule="${r.id}">Edit</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="actions"><button class="btn" data-act="add-rule">Add a rule</button><button class="btn ghost" data-act="run-rules">Auto-categorize uncategorized</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Categories</h2><span class="muted small">${state.categories.length}</span></header>
    <div class="cat-groups">${Object.entries(groups).map(([g, cs]) => `<div><h3>${esc(g)}</h3><ul class="plain">${cs.map(c => `<li><button class="linklike" data-edit-cat="${c.id}">${esc(c.name)}</button> <span class="muted small">${[c.kind === 'transfer' ? 'transfer' : c.kind === 'income' && !c.rental ? 'income' : '', c.period === 'year' ? 'yearly' : '', c.rollover ? 'rolls over' : '', c.taxTag ? c.taxTag.toLowerCase() : '', c.schedE ? `Sch. E line ${c.schedE}` : ''].filter(Boolean).join(', ')}</span></li>`).join('')}</ul></div>`).join('')}</div>
    <div class="actions"><button class="btn" data-act="add-cat">Add a category</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Moving from another app</h2></header>
    <p class="muted">Export your history from YNAB, Monarch, Mint, Copilot, Tiller or Quicken (CSV or QIF), then use Import. Ọrọ̀ reads the account and category columns, creates any categories you don’t have, and keeps tags and notes.</p>
    <div class="actions"><button class="btn" data-act="import">Import a file</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Keyboard shortcuts</h2></header>
    <dl class="shortcuts">${[['⌘K', 'Search or jump anywhere'], ['N', 'New transaction'], ['I', 'Import'], ['/', 'Search transactions'], ['G then O, T, B, C, A, I, P, R, L, X, M, S', 'Go to a page'], ['⇧P', 'Hide or show amounts'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['?', 'Show shortcuts']].map(([k, l]) => `<div><dt><kbd>${k}</kbd></dt><dd>${l}</dd></div>`).join('')}</dl>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Start over</h2></header>
    <p class="muted">${state.accounts.length} accounts, ${n.toLocaleString()} transactions, ${state.holdings.length} holdings, ${state.goals.length} goals${state.meta.sample ? '. This is sample data.' : '.'}</p>
    <div class="actions"><button class="btn" data-act="load-sample">Load sample data</button><button class="btn ghost danger-text" data-act="erase">Erase everything</button></div>
  </section>
  <p class="muted small center about-line"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}. <em>${ORO_TAGLINE}</em><br>Version 2.2 · build ${typeof ORO_BUILD === 'string' ? ORO_BUILD : ''} · Runs on your own devices. No accounts, servers or tracking.</p>`;
};
async function paintBackups() {
  const box = $('#backup-list'); if (!box) return;
  const list = await listBackups();
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<details><summary>${list.length} backup${list.length > 1 ? 's' : ''} in your folder</summary><ul class="plain">${list.slice(0, 40).map(b => `<li><span>${dateLabel(b.date, true)}</span> <button class="linklike small" data-restore="${esc(b.name)}">Restore</button></li>`).join('')}</ul></details>`;
}

function roleOptions(sel) {
  const o = id => `<option value="${id}" ${sel === id ? 'selected' : ''}>${OWNER_ROLES[id]}${id === 'revocable' ? ' (in your estate)' : ''}</option>`;
  return `<optgroup label="People">${o('adult')}${o('kid')}</optgroup><optgroup label="Others">${o('revocable')}${o('irrevocable')}${o('charity')}${o('other')}</optgroup>`;
}
