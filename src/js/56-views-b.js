/* ================= Investments ================= */
VIEWS.investments = () => {
  const accts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  if (!accts.length) return pageHead('Investments') + emptyState('No investment accounts yet', 'Add a brokerage, retirement, 529 or private account, then import a positions file from your brokerage or enter holdings by hand.', `<button class="btn primary" data-act="add-account" data-type="brokerage">Add an investment account</button><button class="btn" data-act="import">Import positions</button>`);
  const total = sum(accts.map(accountValue));
  const hs = state.holdings.filter(h => accts.some(a => a.id === h.accountId));
  const withCost = hs.filter(h => h.costBasis != null && h.costBasis !== '' && h.assetClass !== 'Cash');
  const cost = sum(withCost.map(h => +h.costBasis)), mval = sum(withCost.map(holdingValue));
  const alloc = investableAllocation();
  const allocTotal = sum(Object.values(alloc));
  const classes = [...ASSET_CLASSES, 'Unclassified'].filter(c => alloc[c] || state.settings.targets[c]);
  const targetSum = sum(Object.values(state.settings.targets || {}));
  const all = allocation();
  const re = all.rows.find(r => r.cls === 'Real estate');

  return pageHead('Investments', `${accts.length} account${accts.length > 1 ? 's' : ''}, ${hs.length} holding${hs.length === 1 ? '' : 's'}`,
    `<button class="btn" data-act="import">Import positions</button><button class="btn primary" data-act="add-holding">Add holding</button>`) + `
  <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Market value</th><th class="num">Cost basis</th><th class="num">Unrealized gain</th><th class="num">Return on cost</th></tr></thead>
    <tbody><tr><th scope="row">All investments</th><td class="num">${money(total, { cents: false })}</td><td class="num">${cost ? money(cost, { cents: false }) : '—'}</td><td class="num ${signClass(mval - cost)}">${cost ? money(mval - cost, { cents: false, sign: true }) : '—'}</td><td class="num ${signClass(mval - cost)}">${cost ? pct((mval - cost) / cost) : '—'}</td></tr></tbody></table>
    <p class="muted small">Gains count only holdings with a cost basis. Cash positions are left out.</p></section>

  <section class="panel">
    <header class="panel-head"><h2>Allocation</h2><span class="muted small">Targets ${targetSum ? `add to ${targetSum}%` : 'are optional'}</span></header>
    <div class="stack" role="img" aria-label="Investment allocation">${classes.filter(c => alloc[c]).map(c => `<span style="width:${(alloc[c] / allocTotal) * 100}%;background:${CLASS_COLORS[c]}" title="${esc(c)} ${pct(alloc[c] / allocTotal)}"></span>`).join('')}</div>
    <table class="ledger compact alloc-table"><thead><tr><th>Asset class</th><th class="num">Value</th><th class="num">Actual</th><th class="num">Target</th><th class="num">Drift</th><th class="num hide-sm">To rebalance</th></tr></thead><tbody>
    ${classes.map(c => {
      const v = alloc[c] || 0, share = allocTotal ? v / allocTotal : 0, tgt = state.settings.targets[c];
      const drift = tgt != null && tgt !== '' ? share - tgt / 100 : null;
      return `<tr><th scope="row"><span class="swatch" style="background:${CLASS_COLORS[c]}"></span>${esc(c)}</th><td class="num">${money(v, { cents: false })}</td><td class="num">${pct(share)}</td>
        <td class="num budget-cell"><input class="budget-input" id="tg-${slug(c)}" data-target="${esc(c)}" inputmode="decimal" value="${tgt ?? ''}" placeholder="—" aria-label="Target for ${esc(c)}"><span class="cur">%</span></td>
        <td class="num ${drift == null ? '' : Math.abs(drift) >= 0.05 ? 'neg' : 'muted'}">${drift == null ? '—' : (drift >= 0 ? '+' : '−') + Math.abs(drift * 100).toFixed(1) + ' pts'}</td>
        <td class="num hide-sm">${drift == null ? '' : money(-drift * allocTotal, { cents: false, sign: true })}</td></tr>`;
    }).join('')}</tbody></table>
    ${re ? `<p class="muted small">Counting your property too, real estate is ${pct(re.share, 0)} of everything you own.</p>` : ''}
  </section>

  ${accts.map(a => {
    const list = holdingsFor(a.id).sort((x, y) => holdingValue(y) - holdingValue(x));
    const v = accountValue(a);
    return `<section class="acct-group"><table class="ledger holdings-table"><colgroup><col style="width:10%"><col style="width:24%"><col class="hide-sm" style="width:17%"><col class="hide-sm" style="width:9%"><col class="hide-sm" style="width:10%"><col style="width:11%"><col class="hide-sm" style="width:10%"><col style="width:9%"></colgroup>
      <thead><tr><th scope="col" colspan="2"><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button> <span class="muted small">${esc(ACCOUNT_TYPES[a.type].label)}${a.institution ? `, ${esc(a.institution)}` : ''}</span></th><th class="hide-sm">Class</th><th class="num hide-sm">Shares</th><th class="num hide-sm">Price</th><th class="num">Value</th><th class="num hide-sm">Cost basis</th><th class="num">Gain</th></tr></thead>
      <tbody>${list.length ? list.map(h => {
        const hv = holdingValue(h), g = h.costBasis != null && h.costBasis !== '' ? hv - h.costBasis : null;
        const old = h.private && daysBetween(h.priceDate || '2000-01-01', today()) > 90;
        return `<tr><th scope="row"><button class="linklike" data-edit-holding="${h.id}"><strong>${esc(h.symbol)}</strong></button></th>
          <td class="muted">${esc(h.name || '')}${h.private ? `<div class="small">Private. ${old ? `<span class="tag warn">Marked ${dateLabel(h.priceDate, true)}</span>` : `Marked ${dateLabel(h.priceDate, true)}`}</div>` : ''}</td>
          <td class="hide-sm"><span class="swatch" style="background:${CLASS_COLORS[h.assetClass] || CLASS_COLORS.Unclassified}"></span>${esc(h.assetClass || 'Unclassified')}</td>
          <td class="num hide-sm">${(+h.shares).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td><td class="num hide-sm">${money(h.price)}</td>
          <td class="num">${money(hv, { cents: false })}</td><td class="num hide-sm">${g == null ? '<span class="muted">—</span>' : money(h.costBasis, { cents: false })}</td>
          <td class="num ${g == null ? '' : signClass(g)}">${g == null ? '' : `${money(g, { cents: false, sign: true })}<div class="small">${h.costBasis ? pct(g / h.costBasis, 0) : ''}</div>`}</td></tr>`;
      }).join('') : `<tr><td colspan="8" class="muted">No holdings listed. The account counts at its balance of ${money(v, { cents: false })}${a.assetClass ? `, as ${esc(a.assetClass)}` : ''}. <button class="linklike" data-act="add-holding" data-acct="${a.id}">Add holdings</button></td></tr>`}</tbody>
      ${list.length ? `<tfoot><tr><th scope="row" colspan="2">Account total${a.cash ? ` (includes ${money(a.cash, { cents: false })} cash)` : ''}</th><td class="hide-sm" colspan="3"></td><td class="num total">${money(v, { cents: false })}</td><td class="hide-sm"></td><td></td></tr></tfoot>` : ''}
    </table></section>`;
  }).join('')}`;
};

/* ================= Property ================= */
VIEWS.property = () => {
  const props = activeAccounts().filter(a => a.type === 'realestate');
  if (!props.length) return pageHead('Property') + emptyState('No properties yet', 'Add your home or a rental. For rentals, Keel tracks rent, operating costs, NOI, cap rate and cash-on-cash return from your categorized transactions.', `<button class="btn primary" data-act="add-account" data-type="realestate">Add a property</button>`);
  const mk = thisMonth(), yr = mk.slice(0, 4);
  const ttmFrom = `${addMonths(mk, -12)}-01`, ttmTo = monthEnd(addMonths(mk, -1));
  return pageHead('Property', 'Equity, leverage and, for rentals, operating returns.', `<button class="btn primary" data-act="add-account" data-type="realestate">Add a property</button>`) +
    props.map(a => {
      const value = accountValue(a);
      const loan = a.mortgageId ? acctById(a.mortgageId) : null;
      const debt = loan ? accountValue(loan) : 0;
      const equity = value - debt;
      let rental = '';
      if (a.rental) {
        const g = a.rentalGroup || 'Rental property';
        const ytd = rentalPnL(g, `${yr}-01-01`, today());
        const ttm = rentalPnL(g, ttmFrom, ttmTo);
        const months = Array.from({ length: 12 }, (_, i) => addMonths(mk, i - 11));
        const per = months.map(m => rentalPnL(g, `${m}-01`, monthEnd(m)));
        const cap = value ? ttm.noi / value : NaN;
        const coc = a.cashInvested ? ttm.cashFlow / a.cashInvested : NaN;
        const dscr = ttm.debt ? ttm.noi / ttm.debt : NaN;
        rental = `
        <table class="ledger flows-table"><thead><tr><th></th><th class="num">Rent</th><th class="num">Operating costs</th><th class="num">NOI</th><th class="num">Debt service</th><th class="num">Cash flow</th></tr></thead>
          <tbody>
            <tr><th scope="row">This year</th><td class="num">${money(ytd.income, { cents: false })}</td><td class="num">${money(ytd.opex, { cents: false })}</td><td class="num">${money(ytd.noi, { cents: false })}</td><td class="num">${money(ytd.debt, { cents: false })}</td><td class="num ${signClass(ytd.cashFlow)}">${money(ytd.cashFlow, { cents: false })}</td></tr>
            <tr><th scope="row">Last 12 full months</th><td class="num">${money(ttm.income, { cents: false })}</td><td class="num">${money(ttm.opex, { cents: false })}</td><td class="num">${money(ttm.noi, { cents: false })}</td><td class="num">${money(ttm.debt, { cents: false })}</td><td class="num ${signClass(ttm.cashFlow)}">${money(ttm.cashFlow, { cents: false })}</td></tr>
          </tbody></table>
        <dl class="kpis">
          <div><dt>Cap rate</dt><dd>${pct(cap)}</dd><span class="muted small">NOI over value</span></div>
          <div><dt>Cash-on-cash</dt><dd>${a.cashInvested ? pct(coc) : '—'}</dd><span class="muted small">${a.cashInvested ? `On ${money(a.cashInvested, { cents: false })} invested` : 'Add cash invested to see this'}</span></div>
          <div><dt>Debt coverage</dt><dd>${isFinite(dscr) ? dscr.toFixed(2) + '×' : '—'}</dd><span class="muted small">NOI over debt service</span></div>
          <div><dt>Expense ratio</dt><dd>${ttm.income ? pct(ttm.opex / ttm.income, 0) : '—'}</dd><span class="muted small">Operating costs over rent</span></div>
        </dl>
        ${chartHost({ type: 'bars', h: 180, label: 'Monthly rental cash flow', labels: months.map(m => MON[+m.slice(5) - 1]),
          series: [{ values: per.map(x => x.income), color: 'var(--c1)' }, { values: per.map(x => x.opex + x.debt), color: 'var(--c4)' }],
          tip: i => `<strong>${monthLabel(months[i])}</strong><br>Rent ${money(per[i].income, { cents: false })}<br>Costs ${money(per[i].opex + per[i].debt, { cents: false })}<br>Cash flow <span class="${signClass(per[i].cashFlow)}">${money(per[i].cashFlow, { cents: false })}</span>` })}
        <p class="legend"><span><i style="background:var(--c1)"></i>Rent collected</span><span><i style="background:var(--c4)"></i>Operating costs and debt service</span></p>
        <p class="muted small">Figures come from transactions in the “${esc(g)}” category group. Mortgage payments count as debt service; give operating categories the “Operating expense” role in Data and settings.</p>`;
      }
      return `<section class="panel property">
        <header class="panel-head"><h2><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button></h2><span class="muted small">${a.rental ? `Rental${a.units ? `, ${a.units} units` : ''}` : 'Residence'}. Value as of ${dateLabel(a.balanceDate, true)}</span></header>
        <dl class="kpis">
          <div><dt>Value</dt><dd>${money(value, { cents: false })}</dd></div>
          <div><dt>Mortgage</dt><dd>${loan ? money(debt, { cents: false }) : '—'}</dd>${loan ? `<span class="muted small">${esc(loan.name)}${loan.rate ? ` at ${loan.rate}%` : ''}</span>` : `<span class="muted small"><button class="linklike" data-edit-acct="${a.id}">Link a mortgage</button></span>`}</div>
          <div><dt>Equity</dt><dd>${money(equity, { cents: false })}</dd></div>
          <div><dt>Loan to value</dt><dd>${loan && value ? pct(debt / value, 0) : '—'}</dd></div>
        </dl>
        ${rental}
      </section>`;
    }).join('');
};

/* ================= Cash flow ================= */
VIEWS.cashflow = () => {
  const fa = forecastAccounts();
  const days = 90;
  const f = forecast(days);
  const rep = detectRepeating();
  const repNew = rep.filter(r => !r.tracked);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth(), i - 11));
  const flows = months.map(m => flowSummary(txInMonth(m)));
  const low = state.settings.lowCash || 0;
  const lowIdx = f.series.findIndex(p => p.x === f.low.x);
  return pageHead('Cash flow', fa.length ? `${money(f.startBal, { cents: false })} on hand across ${fa.map(a => esc(a.name)).join(', ')}` : 'Mark checking or savings accounts to include in the forecast.',
    `<button class="btn primary" data-act="add-recurring">Add a bill or paycheck</button>`) + `
  <section class="panel">
    <header class="panel-head"><h2>Next ${days} days</h2><span class="muted small">Lowest point ${money(f.low.y, { cents: false })} on ${dateLabel(f.low.x)}. ${money(f.end, { cents: false })} on ${dateLabel(addDays(today(), days))}.</span></header>
    ${state.recurring.length ? chartHost({ h: 230, label: 'Projected cash balance', series: [{ points: f.series, color: 'var(--ink-accent)', area: true }], threshold: low || null, thresholdLabel: low ? `Cushion ${moneyCompact(low)}` : '', zero: true,
      xFmt: x => dateLabel(x), markers: lowIdx > 0 ? [{ i: lowIdx, y: f.low.y, label: `Low ${moneyCompact(f.low.y)}`, below: true }] : [],
      tip: i => { const p = f.series[i]; const ev = f.events.filter(e => e.date === p.x); return `<strong>${dateLabel(p.x)}</strong><br>${money(p.y, { cents: false })}${ev.map(e => `<br><span class="muted">${esc(e.name)} ${money(e.amount, { cents: false, sign: true })}</span>`).join('')}`; } })
      : `<p class="muted">Add your paychecks, mortgage or rent, and other regular bills to project your cash balance day by day.</p>`}
    <label class="field inline"><span>Warn me below</span><input id="low-cash" data-setting="lowCash" inputmode="decimal" value="${low}" style="width:8em"></label>
  </section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Bills and income</h2><span class="muted small">${state.recurring.length} scheduled</span></header>
      ${state.recurring.length ? `<table class="ledger compact"><thead><tr><th>Name</th><th class="hide-sm">How often</th><th>Next</th><th class="num">Amount</th></tr></thead><tbody>
      ${[...state.recurring].sort((a, b) => occurrences(a, today(), '9999-12-31')[0]?.localeCompare(occurrences(b, today(), '9999-12-31')[0] || '') || 0).map(r => `<tr><th scope="row"><button class="linklike" data-edit-rec="${r.id}">${esc(r.name)}</button></th><td class="hide-sm muted">${FREQS[r.freq]}</td><td class="nowrap">${dateLabel(occurrences(r, today(), '9999-12-31')[0])}</td><td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('')}
      </tbody><tfoot><tr><th scope="row" colspan="3">Net per month (approximate)</th><td class="num total">${money(sum(state.recurring.map(r => r.amount * ({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[r.freq] || 12) / 12)), { cents: false })}</td></tr></tfoot></table>`
      : '<p class="muted">Nothing scheduled yet.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Repeating charges</h2><span class="muted small">${repNew.length ? `${money(sum(repNew.map(r => r.monthly)))} a month, ${money(sum(repNew.map(r => r.monthly)) * 12, { cents: false })} a year` : ''}</span></header>
      ${repNew.length ? `<table class="ledger compact"><thead><tr><th>Payee</th><th class="hide-sm">Since</th><th class="num">Monthly</th><th></th></tr></thead><tbody>
      ${repNew.map(r => `<tr><th scope="row">${esc(r.payee)}${r.isNew ? ' <span class="tag">New</span>' : ''}<div class="muted small">${esc(catName(r.categoryId))}, ${esc(acctById(r.accountId)?.name || '')}</div></th><td class="hide-sm muted nowrap">${dateLabel(r.firstSeen, true)}</td><td class="num">${money(r.monthly)}</td>
        <td class="acts">${r.fromCash ? `<button class="btn small ghost" data-add-rep="${rep.indexOf(r)}">Add to forecast</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <p class="muted small">${rep.length ? `Keel found ${rep.length} charges that repeat at a steady amount${rep.length - repNew.length ? `; ${rep.length - repNew.length} are already scheduled and hidden here` : ''}. Card charges are covered by your card-payment estimate, so only bills paid straight from checking need adding.` : 'Keel looks for charges that repeat at a steady amount. Import a few months of history to see them.'}</p>
    </section>
  </div>

  <section class="panel">
    <header class="panel-head"><h2>Money in and out, by month</h2></header>
    ${chartHost({ type: 'bars', h: 200, label: 'Income and spending by month', labels: months.map(m => MON[+m.slice(5) - 1]), series: [{ values: flows.map(x => x.income), color: 'var(--c1)' }, { values: flows.map(x => x.spending), color: 'var(--c4)' }],
      tip: i => `<strong>${monthLabel(months[i])}</strong><br>In ${money(flows[i].income, { cents: false })}<br>Out ${money(flows[i].spending, { cents: false })}<br>Left over <span class="${signClass(flows[i].net)}">${money(flows[i].net, { cents: false })}</span>` })}
    <p class="legend"><span><i style="background:var(--c1)"></i>Money in</span><span><i style="background:var(--c4)"></i>Money out</span></p>
  </section>`;
};

/* ================= Monthly review ================= */
VIEWS.review = p => {
  const lm = addMonths(thisMonth(), -1);
  const mk = p.m || (state.transactions.some(t => t.date.startsWith(lm)) ? lm : thisMonth());
  const prev = addMonths(mk, -1);
  const rv = state.reviews[mk] || {};
  const txs = txInMonth(mk);
  const f = flowSummary(txs), fp = flowSummary(txInMonth(prev));
  const avg3 = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i))));
  const avgSpend = sum(avg3.map(x => x.spending)) / 3, avgIncome = sum(avg3.map(x => x.income)) / 3;
  const acts = categoryActuals(txs);
  const exp = state.categories.filter(c => c.kind === 'expense');
  const over = exp.filter(c => c.period !== 'year' && c.budget > 0 && (acts[c.id] || 0) > c.budget).map(c => ({ c, a: acts[c.id] || 0, d: (acts[c.id] || 0) - c.budget })).sort((a, b) => b.d - a.d);
  const under = exp.filter(c => c.period !== 'year' && c.budget > 0 && (acts[c.id] || 0) < c.budget).map(c => ({ c, a: acts[c.id] || 0, d: c.budget - (acts[c.id] || 0) })).sort((a, b) => b.d - a.d).slice(0, 4);
  const yearly = exp.filter(c => c.period === 'year' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) }));
  const unusual = exp.map(c => ({ c, a: acts[c.id] || 0, avg: trailingAvg(c.id, mk, 3) })).filter(x => x.a > 60 && x.a > x.avg * 1.3 && x.a - x.avg > 50).sort((a, b) => (b.a - b.avg) - (a.a - a.avg)).slice(0, 5);
  const largest = txs.filter(t => t.amount < 0 && !isTransferCat(t.categoryId)).sort((a, b) => a.amount - b.amount).slice(0, 8);
  const endNW = snapshotNW(mk), startNW = snapshotNW(prev);
  const bucketOf = id => { const a = acctById(id); return a ? ACCOUNT_TYPES[a.type]?.bucket : 'illiquid'; };
  const bucketChange = BUCKETS.map(b => {
    const e = state.snapshots[mk] || {}, s = state.snapshots[prev] || {};
    const val = snap => sum(Object.entries(snap).filter(([id]) => bucketOf(id) === b.id).map(([, v]) => v));
    return { b, change: val(e) - val(s) };
  });
  const unc = txs.filter(t => !t.categoryId).length;
  const stale = activeAccounts().filter(a => !holdingsFor(a.id).length && (!a.balanceDate || a.balanceDate < `${mk}-${pad2(Math.min(25, +monthEnd(mk).slice(8)))}`)).length;
  const marks = state.holdings.filter(h => h.private && daysBetween(h.priceDate || '2000-01-01', monthEnd(mk)) > 90).length;
  const newRep = detectRepeating().filter(r => r.firstSeen.startsWith(mk) || (r.isNew && mk === lm));
  const rentals = activeAccounts().filter(a => a.type === 'realestate' && a.rental);
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  const cmp = (now, then) => then ? `<span class="small ${signClass(now - then)}">${money(now - then, { cents: false, sign: true })}</span>` : '';

  return pageHead(`${monthLabel(mk)} review`, rv.completedAt ? `Reviewed ${dateLabel(rv.completedAt, true)}` : 'Not reviewed yet',
    `<label class="field inline"><span class="sr">Month</span><select data-filter="m">${months.map(m => `<option value="${m}" ${m === mk ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label><button class="btn ghost" data-act="print">Print</button>`) + `
  <section class="flows"><table class="ledger flows-table">
    <thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th><th class="num">Savings rate</th></tr></thead>
    <tbody>
      <tr><th scope="row">${MONTHS[+mk.slice(5) - 1]}</th><td class="num">${money(f.income, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td><td class="num ${signClass(f.net)}">${money(f.net, { cents: false })}</td><td class="num">${pct(f.rate, 0)}</td></tr>
      <tr><th scope="row">${MONTHS[+prev.slice(5) - 1]}</th><td class="num muted">${money(fp.income, { cents: false })}</td><td class="num muted">${money(fp.spending, { cents: false })}</td><td class="num muted">${money(fp.net, { cents: false })}</td><td class="num muted">${pct(fp.rate, 0)}</td></tr>
      <tr><th scope="row">Prior 3-month average</th><td class="num muted">${money(avgIncome, { cents: false })}</td><td class="num muted">${money(avgSpend, { cents: false })}</td><td class="num muted">${money(avgIncome - avgSpend, { cents: false })}</td><td class="num muted">${avgIncome ? pct((avgIncome - avgSpend) / avgIncome, 0) : '—'}</td></tr>
    </tbody></table></section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Net worth</h2></header>
      ${endNW != null && startNW != null ? `<table class="ledger compact"><tbody>
        <tr><th scope="row">End of ${MONTHS[+prev.slice(5) - 1]}</th><td class="num">${money(startNW, { cents: false })}</td></tr>
        ${bucketChange.filter(x => Math.abs(x.change) >= 1).map(x => `<tr><td class="indent">${esc(x.b.label)}</td><td class="num ${signClass(x.change)}">${money(x.change, { cents: false, sign: true })}</td></tr>`).join('')}
        <tr><th scope="row">${mk === thisMonth() ? 'Today' : `End of ${MONTHS[+mk.slice(5) - 1]}`}</th><td class="num total double">${money(endNW, { cents: false })}</td></tr></tbody></table>
        <p class="muted small">Each line is its effect on net worth. Of the ${money(endNW - startNW, { cents: false, sign: true })} change, ${money(f.net, { cents: false, sign: true })} came from income left over after spending; the rest is market moves, loan paydown and revaluations.</p>`
        : '<p class="muted">Net worth history starts once two months of balances exist. You can add past balances from each account’s History.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Over budget</h2></header>
      ${over.length ? `<table class="ledger compact"><tbody>${over.map(x => `<tr><th scope="row">${esc(x.c.name)}</th><td class="num muted">${money(x.a, { cents: false })} of ${money(x.c.budget, { cents: false })}</td><td class="num neg">${money(x.d, { cents: false })} over</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Every monthly category stayed within budget.</p>'}
      ${under.length ? `<h3>Most room left</h3><table class="ledger compact"><tbody>${under.map(x => `<tr><th scope="row">${esc(x.c.name)}</th><td class="num muted">${money(x.a, { cents: false })} of ${money(x.c.budget, { cents: false })}</td><td class="num pos">${money(x.d, { cents: false })} under</td></tr>`).join('')}</tbody></table>` : ''}
      ${yearly.length ? `<h3>Yearly budgets</h3><table class="ledger compact"><tbody>${yearly.map(({ c, v }) => `<tr><th scope="row">${esc(c.name)}</th><td class="num muted">${money(v.actual, { cents: false })} of ${money(v.budget, { cents: false })}</td><td class="meter-cell">${bar(v.actual, v.budget, { pace: v.monthShare })}</td></tr>`).join('')}</tbody></table>` : ''}
    </section>
  </div>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Unusual spending</h2></header>
      ${unusual.length ? `<table class="ledger compact"><tbody>${unusual.map(x => `<tr><th scope="row"><a href="#/transactions?m=${mk}&cat=${x.c.id}">${esc(x.c.name)}</a></th><td class="num">${money(x.a, { cents: false })}</td><td class="num muted">usually ${money(x.avg, { cents: false })}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No category ran more than 30% above its recent average.</p>'}
      ${newRep.length ? `<h3>New repeating charges</h3><ul class="plain">${newRep.map(r => `<li>${esc(r.payee)}, ${money(r.monthly)} a month</li>`).join('')}</ul>` : ''}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Largest purchases</h2></header>
      ${largest.length ? `<table class="ledger compact"><tbody>${largest.map(t => `<tr><td class="nowrap muted">${dateLabel(t.date)}</td><td>${esc(t.payee)}<div class="muted small">${esc(catName(t.categoryId))}</div></td><td class="num neg">${money(t.amount, { cents: false })}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No spending this month.</p>'}
    </section>
  </div>

  ${rentals.length ? `<section class="panel"><header class="panel-head"><h2>Rental property</h2></header><table class="ledger compact"><thead><tr><th></th><th class="num">Rent</th><th class="num">Operating costs</th><th class="num">NOI</th><th class="num">Cash flow</th></tr></thead><tbody>
    ${rentals.map(a => { const r = rentalPnL(a.rentalGroup || 'Rental property', `${mk}-01`, monthEnd(mk)); return `<tr><th scope="row">${esc(a.name)}</th><td class="num">${money(r.income, { cents: false })}</td><td class="num">${money(r.opex, { cents: false })}</td><td class="num">${money(r.noi, { cents: false })}</td><td class="num ${signClass(r.cashFlow)}">${money(r.cashFlow, { cents: false })}</td></tr>`; }).join('')}
  </tbody></table></section>` : ''}

  <section class="panel checklist">
    <header class="panel-head"><h2>Close the month</h2></header>
    <ol class="steps">
      <li class="${unc ? '' : 'done'}"><strong>Categorize every transaction.</strong> ${unc ? `<a href="#/transactions?m=${mk}&cat=_none">${unc} left</a>` : 'Done.'}</li>
      <li class="${stale ? '' : 'done'}"><strong>Update account balances.</strong> ${stale ? `<a href="#/accounts?update=1">${stale} account${stale > 1 ? 's' : ''} not updated since late ${MONTHS[+mk.slice(5) - 1]}</a>` : 'Done.'}</li>
      <li class="${marks ? '' : 'done'}"><strong>Re-mark private holdings.</strong> ${marks ? `<a href="#/investments">${marks} mark${marks > 1 ? 's are' : ' is'} over 90 days old</a>` : 'Nothing stale.'}</li>
      <li class="${rv.notes ? 'done' : ''}"><strong>Write down what changed and what to do next.</strong>
        <textarea id="review-notes" data-review-notes="${mk}" rows="4" placeholder="Decisions, surprises, things to follow up on">${esc(rv.notes || '')}</textarea></li>
    </ol>
    <div class="actions">${rv.completedAt ? `<button class="btn ghost" data-review-done="${mk}" data-undo="1">Mark as not reviewed</button>` : `<button class="btn primary" data-review-done="${mk}">Mark ${MONTHS[+mk.slice(5) - 1]} as reviewed</button>`}</div>
  </section>`;
};

/* ================= Data and settings ================= */
VIEWS.data = () => {
  const n = state.transactions.length;
  const groups = groupBy(state.categories, c => c.group);
  const fileLine = Store.handle
    ? (Store.perm === 'granted' ? `Every change is also written to <strong>${esc(Store.fileName)}</strong>.` : `Connected to <strong>${esc(Store.fileName)}</strong>, but this browser needs your permission again before it can write to it.`)
    : 'Not connected to a file yet.';
  return pageHead('Data and settings', '') + `
  <section class="panel">
    <header class="panel-head"><h2>Where your data lives</h2></header>
    <p>Keel runs entirely in this browser and never sends your data anywhere. Changes are saved automatically in this browser’s private storage on this computer. ${fileLine}</p>
    <p class="muted">For safety, keep a data file somewhere you back up, such as Documents or an encrypted drive. If you put it in a synced folder (iCloud Drive, OneDrive, Dropbox), that company stores a copy; turn on a passphrase first.</p>
    <div class="actions wrap">
      ${Store.canPickFiles ? (Store.handle
        ? (Store.perm === 'granted' ? `<button class="btn" data-act="disconnect-file">Stop saving to ${esc(Store.fileName)}</button>` : `<button class="btn primary" data-act="reconnect">Reconnect ${esc(Store.fileName)}</button>`)
        : `<button class="btn primary" data-act="connect-file">Save to a file…</button>`) : ''}
      <button class="btn" data-act="open-file">Open a data file…</button>
      <button class="btn" data-act="backup">Download a backup</button>
      <button class="btn ghost" data-act="export-csv">Export transactions as CSV</button>
    </div>
    ${Store.canPickFiles ? '' : '<p class="notice small">This browser can’t keep a live link to a file, so use “Download a backup” to save a copy. Chrome and Edge on a computer can save to a file automatically.</p>'}
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Passphrase</h2><span class="muted small">${Store.key ? 'On' : 'Off'}</span></header>
    <p>${Store.key ? 'Your data is encrypted with AES-256 using your passphrase, in this browser and in your data file. You’ll enter it each time you open Keel.' : 'Add a passphrase to encrypt your data in this browser and in your data file. Anyone who gets the file can’t read it without the passphrase.'}</p>
    <p class="muted small">There is no way to recover a forgotten passphrase. Write it down somewhere safe.</p>
    <div class="actions">${Vault.available() ? (Store.key ? `<button class="btn" data-act="change-pass">Change passphrase</button><button class="btn ghost danger-text" data-act="remove-pass">Remove passphrase</button>` : `<button class="btn primary" data-act="set-pass">Add a passphrase</button>`) : '<span class="muted">Encryption isn’t available in this browser.</span>'}</div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Categorization rules</h2><span class="muted small">${state.rules.length} rule${state.rules.length === 1 ? '' : 's'}</span></header>
    <p class="muted">When a payee contains the text, it gets that category, both on import and when you run the rules. Keel offers to make a rule whenever you categorize something by hand.</p>
    ${state.rules.length ? `<div class="scroll-table short"><table class="ledger compact"><thead><tr><th>Payee contains</th><th>Category</th><th class="hide-sm">Rename to</th><th></th></tr></thead><tbody>
    ${state.rules.map(r => `<tr><td><code>${esc(r.text)}</code></td><td>${esc(catName(r.categoryId))}</td><td class="hide-sm muted">${esc(r.rename || '')}</td><td class="acts"><button class="linklike small" data-edit-rule="${r.id}">Edit</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="actions"><button class="btn" data-act="add-rule">Add a rule</button><button class="btn ghost" data-act="run-rules">Apply rules to uncategorized</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Categories</h2><span class="muted small">${state.categories.length}</span></header>
    <div class="cat-groups">${Object.entries(groups).map(([g, cs]) => `<div><h3>${esc(g)}</h3><ul class="plain">${cs.map(c => `<li><button class="linklike" data-edit-cat="${c.id}">${esc(c.name)}</button> <span class="muted small">${[c.kind === 'transfer' ? 'transfer' : c.kind === 'income' && !c.rental ? 'income' : '', c.period === 'year' ? 'yearly' : '', c.rental ? RENTAL_ROLES[c.rental].toLowerCase() : ''].filter(Boolean).join(', ')}</span></li>`).join('')}</ul></div>`).join('')}</div>
    <div class="actions"><button class="btn" data-act="add-cat">Add a category</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Preferences</h2></header>
    <div class="form-grid">
      <label class="field"><span>Appearance</span><select data-setting="theme"><option value="auto" ${state.settings.theme === 'auto' ? 'selected' : ''}>Match my computer</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label>
      <label class="field"><span>Flag balances older than (days)</span><input data-setting="staleDays" inputmode="numeric" value="${state.settings.staleDays}"></label>
      <label class="field"><span>Warn when cash may dip below</span><input data-setting="lowCash" inputmode="decimal" value="${state.settings.lowCash}"></label>
    </div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Start over</h2></header>
    <p class="muted">${state.accounts.length} accounts, ${n.toLocaleString()} transactions, ${state.holdings.length} holdings${state.meta.sample ? '. This is sample data.' : '.'}</p>
    <div class="actions"><button class="btn" data-act="load-sample">Load sample data</button><button class="btn ghost danger-text" data-act="erase">Erase everything</button></div>
  </section>
  <p class="muted small center">Keel 1.0. A single file you own. No accounts, servers or tracking.</p>`;
};
