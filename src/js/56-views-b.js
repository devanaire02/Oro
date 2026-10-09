/* ================= Investments ================= */
VIEWS.investments = () => {
  const accts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  if (!accts.length) return pageHead('Investments') + emptyState('No investment accounts yet', 'Add a brokerage, retirement, 529, cryptocurrency or private account, then import a positions file from your brokerage or enter holdings (or coins) by hand.', `<button class="btn primary" data-act="add-account" data-type="brokerage">Add an investment account</button><button class="btn" data-act="import">Import positions</button>`);
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
    `${(() => { const many = accts.filter(a => holdingsFor(a.id).length); return many.length > 1 ? `<button class="btn ghost" data-act="holdings-all">${many.every(a => holdingsCollapsed()[a.id]) ? 'Expand all' : 'Collapse all'}</button>` : ''; })()}<button class="btn" data-act="import">Import positions</button><button class="btn primary" data-act="add-holding">Add holding</button>`) + `
  <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Market value</th><th class="num hide-sm">Cost basis</th><th class="num">Unrealized gain</th><th class="num">Return on cost</th></tr></thead>
    <tbody><tr><th scope="row">All investments</th><td class="num">${money(total, { cents: false })}</td><td class="num hide-sm">${cost ? money(cost, { cents: false }) : '—'}</td><td class="num ${signClass(mval - cost)}">${cost ? money(mval - cost, { cents: false, sign: true }) : '—'}</td><td class="num ${signClass(mval - cost)}">${cost ? pct((mval - cost) / cost) : '—'}</td></tr></tbody></table>
    <p class="muted small">Gains count only holdings with a cost basis. Cash positions are left out.</p></section>
  ${cryptoPricesPanel()}

  <section class="panel">
    <header class="panel-head"><h2>Allocation</h2><span class="muted small">Targets ${targetSum ? `add to ${targetSum}%` : 'are optional'}</span></header>
    <div class="stack" role="img" aria-label="Investment allocation">${classes.filter(c => alloc[c]).map(c => `<span style="width:${(alloc[c] / allocTotal) * 100}%;background:${CLASS_COLORS[c]}" title="${esc(c)} ${pct(alloc[c] / allocTotal)}"></span>`).join('')}</div>
    <table class="ledger compact alloc-table" data-sort-id="alloc"><thead><tr><th>Asset class</th><th class="num hide-sm">Value</th><th class="num">Actual</th><th class="num">Target</th><th class="num">Drift</th><th class="num hide-sm">To rebalance</th></tr></thead><tbody>
    ${classes.map(c => {
      const v = alloc[c] || 0, share = allocTotal ? v / allocTotal : 0, tgt = state.settings.targets[c];
      const drift = tgt != null && tgt !== '' ? share - tgt / 100 : null;
      return `<tr><th scope="row"><span class="swatch" style="background:${CLASS_COLORS[c]}"></span>${esc(c)}</th><td class="num hide-sm">${money(v, { cents: false })}</td><td class="num">${pct(share)}</td>
        <td class="num budget-cell" data-v="${tgt ?? ''}"><input class="budget-input" id="tg-${slug(c)}" data-target="${esc(c)}" inputmode="decimal" value="${tgt ?? ''}" placeholder="—" aria-label="Target for ${esc(c)}"><span class="cur">%</span></td>
        <td class="num ${drift == null ? '' : Math.abs(drift) >= 0.05 ? 'neg' : 'muted'}">${drift == null ? '—' : (drift >= 0 ? '+' : '−') + Math.abs(drift * 100).toFixed(1) + ' pts'}</td>
        <td class="num hide-sm">${drift == null ? '' : money(-drift * allocTotal, { cents: false, sign: true })}</td></tr>`;
    }).join('')}</tbody></table>
    ${re ? `<p class="muted small">Counting your property too, real estate is ${pct(re.share, 0)} of everything you own.</p>` : ''}
  </section>
  ${(() => {
    const fa = feeAnalysis();
    const months = Object.keys(state.snapshots).sort().slice(-24);
    const histAccts = accts.filter(a => months.some(m => state.snapshots[m][a.id]));
    return `<div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>What you pay in fund fees</h2><span class="muted small">${fa.coverage < 0.999 ? `Covers ${pct(fa.coverage, 0)} of holdings` : ''}</span></header>
      ${fa.value ? `<dl class="kpis three"><div><dt>Weighted expense ratio</dt><dd class="num">${fa.weighted.toFixed(2)}%</dd></div><div><dt>Per year</dt><dd class="num">${money(fa.fees, { cents: false })}</dd></div><div><dt>Over 20 years</dt><dd class="num">${money(fa.drag, { cents: false })}</dd><span class="muted small">Growth lost at 6% a year</span></div></dl>
      <table class="ledger compact" data-sort-id="fees"><thead><tr><th>Fund</th><th class="num">Expense ratio</th><th class="num">Per year</th></tr></thead><tbody>${fa.top.slice(0, 5).map(x => `<tr><th scope="row"><button class="linklike" data-edit-holding="${x.h.id}">${esc(x.h.symbol)}</button> <span class="muted small">${esc(x.h.name || '')}</span></th><td class="num ${x.er >= 0.5 ? 'neg' : ''}">${x.er.toFixed(2)}%</td><td class="num">${money(x.fee, { cents: false })}</td></tr>`).join('')}</tbody></table>
      ${fa.unknown.length ? `<p class="muted small">No expense ratio on file for ${fa.unknown.slice(0, 4).map(h => esc(h.symbol)).join(', ')}${fa.unknown.length > 4 ? '…' : ''}. Add it in each holding.</p>` : ''}`
      : '<p class="muted">Add holdings to see the fees inside your funds.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Value over time</h2></header>
      ${chartHost({ type: 'stack', h: 230, labels: months.map(m => monthLabel(m, true)), series: histAccts.map((a, i) => ({ name: a.name, color: `var(--c${(i % 8) + 1})`, values: months.map(m => state.snapshots[m][a.id] || 0) })), empty: 'History builds as months pass.',
        tip: i => `<strong>${monthLabel(months[i])}</strong>${histAccts.map(a => `<br>${esc(a.name)} ${money(state.snapshots[months[i]][a.id] || 0, { cents: false })}`).join('')}` })}
      <p class="legend">${histAccts.map((a, i) => `<span><i style="background:var(--c${(i % 8) + 1})"></i>${esc(a.name)}</span>`).join('')}</p>
    </section></div>`;
  })()}

  ${accts.map(a => {
    const list = holdingsFor(a.id).sort((x, y) => holdingValue(y) - holdingValue(x)), crypto = isCryptoAcct(a);
    const v = accountValue(a);
    const folded = list.length && holdingsCollapsed()[a.id];
    return `<section class="acct-group"><table class="ledger holdings-table ${folded ? 'collapsed' : ''}" data-sort-id="holdings" data-acct="${a.id}"><colgroup><col style="width:10%"><col style="width:24%"><col class="hide-sm" style="width:17%"><col class="hide-sm" style="width:9%"><col class="hide-sm" style="width:10%"><col style="width:11%"><col class="hide-sm" style="width:10%"><col style="width:9%"></colgroup>
      <thead><tr><th scope="col" colspan="2">${list.length ? collapseBtn(a, folded) : ''}<button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button>${list.length ? ` <span class="coll-count muted small">${list.length} holding${list.length === 1 ? '' : 's'}</span>` : ''} <span class="muted small">${esc(ACCOUNT_TYPES[a.type].label)}${a.institution ? `, ${esc(a.institution)}` : ''}</span></th><th class="hide-sm">Class</th><th class="num hide-sm">${crypto ? 'Amount' : 'Shares'}</th><th class="num hide-sm">Price</th><th class="num">Value</th><th class="num hide-sm">Cost basis</th><th class="num">Gain</th></tr></thead>
      <tbody>${list.length ? list.map(h => {
        const hv = holdingValue(h), g = h.costBasis != null && h.costBasis !== '' ? hv - h.costBasis : null;
        const old = h.private && daysBetween(h.priceDate || '2000-01-01', today()) > 90;
        return `<tr><th scope="row"><button class="linklike" data-edit-holding="${h.id}"><strong>${esc(h.symbol)}</strong></button></th>
          <td class="muted">${esc(h.name || '')}${crypto ? `<div class="small only-sm">${amountFmt(h.shares, true)} ${esc(h.symbol)} at ${priceFmt(h.price)}</div>` : ''}${h.private ? `<div class="small">Private. ${old ? `<span class="tag warn">Marked ${dateLabel(h.priceDate, true)}</span>` : `Marked ${dateLabel(h.priceDate, true)}`}</div>` : ''}</td>
          <td class="hide-sm"><span class="swatch" style="background:${CLASS_COLORS[h.assetClass] || CLASS_COLORS.Unclassified}"></span>${esc(h.assetClass || 'Unclassified')}</td>
          <td class="num hide-sm">${amountFmt(h.shares, crypto)}</td><td class="num hide-sm">${priceFmt(h.price)}</td>
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
  if (!props.length) return pageHead('Property') + emptyState('No properties yet', 'Add your home or a rental. For rentals, Ọrọ̀ tracks rent, operating costs, NOI, cap rate and cash-on-cash return from your categorized transactions.', `<button class="btn primary" data-act="add-account" data-type="realestate">Add a property</button>`);
  const mk = thisMonth(), yr = mk.slice(0, 4);
  const ttmFrom = `${addMonths(mk, -12)}-01`, ttmTo = monthEnd(addMonths(mk, -1));
  return pageHead('Property', 'Equity, leverage and, for rentals, operating returns.', `${checkinOn() ? '<a class="btn" href="#/checkin?add=property">Add by talking</a>' : ''}<button class="btn primary" data-act="add-account" data-type="realestate">Add a property</button>`) +
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
        <table class="ledger flows-table"><thead><tr><th></th><th class="num">Rent</th><th class="num hide-sm">Operating costs</th><th class="num">NOI</th><th class="num hide-sm">Debt service</th><th class="num">Cash flow</th></tr></thead>
          <tbody>
            <tr><th scope="row">This year</th><td class="num">${money(ytd.income, { cents: false })}</td><td class="num hide-sm">${money(ytd.opex, { cents: false })}</td><td class="num">${money(ytd.noi, { cents: false })}</td><td class="num hide-sm">${money(ytd.debt, { cents: false })}</td><td class="num ${signClass(ytd.cashFlow)}">${money(ytd.cashFlow, { cents: false })}</td></tr>
            <tr><th scope="row">Last 12 full months</th><td class="num">${money(ttm.income, { cents: false })}</td><td class="num hide-sm">${money(ttm.opex, { cents: false })}</td><td class="num">${money(ttm.noi, { cents: false })}</td><td class="num hide-sm">${money(ttm.debt, { cents: false })}</td><td class="num ${signClass(ttm.cashFlow)}">${money(ttm.cashFlow, { cents: false })}</td></tr>
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
        <p class="muted small"><a href="#/taxes">See this property’s Schedule E</a>. Figures come from transactions in the “${esc(g)}” category group. Mortgage payments count as debt service; give operating categories the “Operating expense” role in Data and settings.</p>`;
      }
      return `<section class="panel property">
        <header class="panel-head"><h2><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button></h2><span class="muted small">${a.rental ? `Rental${a.units ? `, ${a.units} units` : ''}` : 'Residence'}. Value as of ${dateLabel(a.balanceDate, true)}</span></header>
        <dl class="kpis">
          <div><dt>Value</dt><dd>${money(value, { cents: false })}</dd></div>
          <div><dt>Mortgage</dt><dd>${loan ? money(debt, { cents: false }) : '—'}</dd>${loan ? `<span class="muted small">${esc(loan.name)}${loan.rate ? ` at ${loan.rate}%` : ''}${LOAN_TYPES.has(loan.type) ? ` · <button class="linklike" data-act="loan-detail" data-id="${loan.id}">${isTrackedLoan(loan) ? 'Payments and schedule' : 'Track payments'}</button>` : ''}</span>` : `<span class="muted small"><button class="linklike" data-edit-acct="${a.id}">Link a mortgage</button></span>`}</div>
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

  ${billCalendar(route().params.cm || thisMonth())}
  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Bills and income</h2><span class="muted small">${state.recurring.length} scheduled</span></header>
      ${state.recurring.length ? `<table class="ledger compact" data-sort-id="bills"><thead><tr><th>Name</th><th class="hide-sm">How often</th><th>Next</th><th class="num">Amount</th></tr></thead><tbody>
      ${[...state.recurring].sort((a, b) => occurrences(a, today(), '9999-12-31')[0]?.localeCompare(occurrences(b, today(), '9999-12-31')[0] || '') || 0).map(r => `<tr><th scope="row"><button class="linklike" data-edit-rec="${r.id}">${esc(r.name)}</button></th><td class="hide-sm muted">${FREQS[r.freq]}</td><td class="nowrap" data-v="${occurrences(r, today(), '9999-12-31')[0] || ''}">${dateLabel(occurrences(r, today(), '9999-12-31')[0])}</td><td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('')}
      </tbody><tfoot><tr><th scope="row" colspan="3">Net per month (approximate)</th><td class="num total">${money(sum(state.recurring.map(r => r.amount * ({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[r.freq] || 12) / 12)), { cents: false })}</td></tr></tfoot></table>`
      : '<p class="muted">Nothing scheduled yet.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Repeating charges</h2><span class="muted small">${repNew.length ? `${money(sum(repNew.map(r => r.monthly)))} a month, ${money(sum(repNew.map(r => r.monthly)) * 12, { cents: false })} a year` : ''}</span></header>
      ${repNew.length ? `<table class="ledger compact" data-sort-id="repeating"><thead><tr><th>Payee</th><th class="hide-sm">Since</th><th class="num">Monthly</th><th></th></tr></thead><tbody>
      ${repNew.map(r => `<tr><th scope="row">${esc(r.payee)}${r.isNew ? ' <span class="tag">New</span>' : ''}<div class="muted small">${esc(catName(r.categoryId))}, ${esc(acctById(r.accountId)?.name || '')}</div></th><td class="hide-sm muted nowrap" data-v="${r.firstSeen || ''}">${dateLabel(r.firstSeen, true)}</td><td class="num">${money(r.monthly)}</td>
        <td class="acts">${r.fromCash ? `<button class="btn small ghost" data-add-rep="${rep.indexOf(r)}">Add to forecast</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <p class="muted small">${rep.length ? `Ọrọ̀ found ${rep.length} charges that repeat at a steady amount${rep.length - repNew.length ? `; ${rep.length - repNew.length} are already scheduled and hidden here` : ''}. Card charges are covered by your card-payment estimate, so only bills paid straight from checking need adding.` : 'Ọrọ̀ looks for charges that repeat at a steady amount. Import a few months of history to see them.'}</p>
    </section>
  </div>

  <section class="panel">
    <header class="panel-head"><h2>Money in and out, by month</h2></header>
    ${chartHost({ type: 'bars', h: 200, label: 'Income and spending by month', labels: months.map(m => MON[+m.slice(5) - 1]), series: [{ values: flows.map(x => x.income), color: 'var(--c1)' }, { values: flows.map(x => x.spending), color: 'var(--c4)' }],
      tip: i => `<strong>${monthLabel(months[i])}</strong><br>In ${money(flows[i].income, { cents: false })}<br>Out ${money(flows[i].spending, { cents: false })}<br>Left over <span class="${signClass(flows[i].net)}">${money(flows[i].net, { cents: false })}</span>` })}
    <p class="legend"><span><i style="background:var(--c1)"></i>Money in</span><span><i style="background:var(--c4)"></i>Money out</span></p>
  </section>`;
};

function billCalendar(mk) {
  const first = fromISO(`${mk}-01`), startDow = first.getDay(), dim = +monthEnd(mk).slice(8);
  const ev = {};
  for (const r of state.recurring) for (const d of occurrences(r, `${mk}-01`, monthEnd(mk))) (ev[d] = ev[d] || []).push(r);
  const totalOut = sum(Object.values(ev).flat().filter(r => r.amount < 0).map(r => r.amount)), totalIn = sum(Object.values(ev).flat().filter(r => r.amount > 0).map(r => r.amount));
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell empty"></div>';
  for (let dd = 1; dd <= dim; dd++) {
    const iso = `${mk}-${pad2(dd)}`, list = ev[iso] || [];
    cells += `<div class="cal-cell ${iso === today() ? 'today' : ''} ${iso < today() ? 'past' : ''}"><span class="cal-day">${dd}</span>${list.map(r => `<button class="cal-ev ${r.amount >= 0 ? 'in' : 'out'}" data-edit-rec="${r.id}" title="${esc(r.name)} ${money(r.amount)}"><span>${esc(r.name)}</span><span class="num">${moneyCompact(r.amount)}</span></button>`).join('')}</div>`;
  }
  return `<section class="panel calendar">
    <header class="panel-head"><h2>Bill calendar</h2><div class="month-nav"><button class="icon-btn" data-month="${addMonths(mk, -1)}" data-param="cm" aria-label="Previous month">‹</button><span class="month-label">${monthLabel(mk)}</span><button class="icon-btn" data-month="${addMonths(mk, 1)}" data-param="cm" aria-label="Next month">›</button></div></header>
    <p class="muted small">${money(totalIn, { cents: false })} scheduled in, ${money(-totalOut, { cents: false })} scheduled out.</p>
    <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
  </section>`;
}

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
  const unrec = activeAccounts().filter(a => a.ledger && txByAccount(a.id).some(t => t.date <= monthEnd(mk)) && (!a.reconciledThrough || a.reconciledThrough < monthEnd(mk))).length;
  const newRep = detectRepeating().filter(r => r.firstSeen.startsWith(mk) || (r.isNew && mk === lm));
  const rentals = activeAccounts().filter(a => a.type === 'realestate' && a.rental);
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  const cmp = (now, then) => then ? `<span class="small ${signClass(now - then)}">${money(now - then, { cents: false, sign: true })}</span>` : '';

  return pageHead(`${monthLabel(mk)} review`, rv.completedAt ? `Reviewed ${dateLabel(rv.completedAt, true)}` : 'Not reviewed yet',
    `<label class="field inline"><span class="sr">Month</span><select data-filter="m">${months.map(m => `<option value="${m}" ${m === mk ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label><button class="btn" data-act="money-date" data-mk="${mk}">Present as Money date</button><button class="btn ghost" data-act="print">Print</button>`) + `
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

  ${members().length > 1 ? (() => { const per = members().map(m => ({ m, f: flowSummary(txs.filter(t => personOf(t) === m.id)) })).filter(x => x.f.spending > 0); const tot = sum(per.map(x => x.f.spending)) || 1; return per.length ? `<section class="panel"><header class="panel-head"><h2>Who spent what</h2><a href="#/reports?r=people&p=custom&from=${mk}-01&to=${monthEnd(mk)}">Details</a></header>
    <div class="stack tall">${per.map(x => `<span style="width:${x.f.spending / tot * 100}%;background:${memberColor(x.m.id)}"></span>`).join('')}</div>
    <p class="legend">${per.map(x => `<span><i style="background:${memberColor(x.m.id)}"></i>${esc(x.m.name)} ${money(x.f.spending, { cents: false })} (${pct(x.f.spending / tot, 0)})</span>`).join('')}</p></section>` : ''; })() : ''}
  ${state.goals.length ? `<section class="panel"><header class="panel-head"><h2>Goals</h2></header><div class="goal-strip">${state.goals.map(goalTile).join('')}</div></section>` : ''}
  ${rentals.length ? `<section class="panel"><header class="panel-head"><h2>Rental property</h2></header><table class="ledger compact"><thead><tr><th></th><th class="num">Rent</th><th class="num">Operating costs</th><th class="num">NOI</th><th class="num">Cash flow</th></tr></thead><tbody>
    ${rentals.map(a => { const r = rentalPnL(a.rentalGroup || 'Rental property', `${mk}-01`, monthEnd(mk)); return `<tr><th scope="row">${esc(a.name)}</th><td class="num">${money(r.income, { cents: false })}</td><td class="num">${money(r.opex, { cents: false })}</td><td class="num">${money(r.noi, { cents: false })}</td><td class="num ${signClass(r.cashFlow)}">${money(r.cashFlow, { cents: false })}</td></tr>`; }).join('')}
  </tbody></table></section>` : ''}

  <section class="panel checklist">
    <header class="panel-head"><h2>Close the month</h2></header>
    <ol class="steps">
      <li class="${unc ? '' : 'done'}"><strong>Categorize every transaction.</strong> ${unc ? `<a href="#/transactions?m=${mk}&cat=_none">${unc} left</a>` : 'Done.'}</li>
      <li class="${stale ? '' : 'done'}"><strong>Update account balances.</strong> ${stale ? `<a href="#/accounts?update=1">${stale} account${stale > 1 ? 's' : ''} not updated since late ${MONTHS[+mk.slice(5) - 1]}</a>` : 'Done.'}</li>
      <li class="${unrec ? '' : 'done'}"><strong>Reconcile bank and card accounts.</strong> ${unrec ? `<a href="#/accounts">${unrec} not reconciled through ${MONTHS[+mk.slice(5) - 1]}</a>` : 'Done.'}</li>
      <li class="${marks ? '' : 'done'}"><strong>Re-mark private holdings.</strong> ${marks ? `<a href="#/investments">${marks} mark${marks > 1 ? 's are' : ' is'} over 90 days old</a>` : 'Nothing stale.'}</li>
      <li class="${rv.notes ? 'done' : ''}"><strong>Write down what changed and what to do next.</strong>
        <textarea id="review-notes" data-review-notes="${mk}" rows="4" placeholder="Decisions, surprises, things to follow up on">${esc(rv.notes || '')}</textarea></li>
    </ol>
    <div class="actions">${rv.completedAt ? `<button class="btn ghost" data-review-done="${mk}" data-undo="1">Mark as not reviewed</button>` : `<button class="btn primary" data-review-done="${mk}">Mark ${MONTHS[+mk.slice(5) - 1]} as reviewed</button>`}</div>
  </section>`;
};

/* Crypto prices: one row per coin you hold in a Cryptocurrency account. Type today's prices and save; each price is
   used in every account that holds that coin. */
function cryptoPricesPanel() {
  const held = cryptoHeld();
  if (!held.length) return '';
  return `<section class="panel crypto-prices" id="crypto-prices">
    <header class="panel-head"><h2>Crypto prices</h2><span class="muted small">One price per coin, in every account that holds it</span></header>
    <form data-crypto-prices>
    <table class="ledger compact"><thead><tr><th>Coin</th><th class="num hide-sm">You hold</th><th class="num">Price</th><th class="hide-sm">As of</th><th class="num">Value</th></tr></thead>
    <tbody>${held.map(c => `<tr><th scope="row"><strong>${esc(c.symbol)}</strong> <span class="muted small">${esc(c.name)}</span><div class="muted small only-sm">${amountFmt(c.amount, true)} ${esc(c.symbol)}</div></th>
      <td class="num hide-sm">${amountFmt(c.amount, true)}</td>
      <td class="num coin-price-cell" data-v="${c.price}"><span class="cur">$</span><input class="coin-price" data-coin="${esc(c.symbol)}" data-was="${c.price}" inputmode="decimal" value="${c.price}" aria-label="Price of ${esc(c.name)}" autocomplete="off"></td>
      <td class="hide-sm" data-v="${esc(c.priceDate || '')}">${staleTag(c.priceDate, CRYPTO_STALE_DAYS)}</td>
      <td class="num">${money(c.value, { cents: false })}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">Total</th><td class="hide-sm"></td><td></td><td class="hide-sm"></td><td class="num total">${money(sum(held.map(c => c.value)), { cents: false })}</td></tr></tfoot></table>
    <div class="actions"><button class="btn primary" type="submit">Save prices</button><span class="muted small">Type today’s prices from your exchange or wallet app. Ọrọ̀ doesn’t look prices up online. You can also say “bitcoin is 62,000” to Talk.</span></div>
    </form></section>`;
}
document.addEventListener('submit', e => {
  const f = e.target;
  if (!f.matches?.('[data-crypto-prices]')) return;
  e.preventDefault();
  const changed = [];
  for (const inp of f.querySelectorAll('.coin-price')) {
    const p = parseAmount(inp.value);
    if (!inp.value.trim()) continue;
    if (!isFinite(p) || p <= 0) { inp.focus(); return toast(`Type a price for ${coinName(inp.dataset.coin)}, like 62,000.`); }
    if (Math.abs(p - Number(inp.dataset.was)) > 1e-12) changed.push([inp.dataset.coin, p]);
  }
  if (!changed.length) return toast('No prices changed.');
  for (const [sym, p] of changed) setCoinPrice(sym, p);
  commit();
  toast(`Updated ${listWords(changed.map(([sym]) => coinName(sym)))} ${changed.length === 1 ? 'price' : 'prices'}.`);
});

/* Each account's holdings fold away to just its total. Remembered on this device. */
function holdingsCollapsed() { try { return JSON.parse(localStorage.getItem('oro.collapsed') || '{}') || {}; } catch (e) { return {}; } }
function setHoldingsCollapsed(map) { try { localStorage.setItem('oro.collapsed', JSON.stringify(map)); } catch (e) { /* storage blocked: it lasts until the page redraws */ } }
const CHEVRON = '<svg class="chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function collapseBtn(a, folded) {
  return `<button type="button" class="coll-btn" data-collapse="${a.id}" aria-expanded="${folded ? 'false' : 'true'}" aria-label="${folded ? 'Show' : 'Hide'} ${esc(a.name)} holdings" title="${folded ? 'Show the holdings' : 'Fold the holdings away'}">${CHEVRON}</button>`;
}
function paintCollapseAll() {
  const b = $('[data-act="holdings-all"]'); if (!b) return;
  const tables = $$('.holdings-table[data-acct]').filter(t => t.querySelector('.coll-btn'));
  b.textContent = tables.length && tables.every(t => t.classList.contains('collapsed')) ? 'Expand all' : 'Collapse all';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-collapse]'); if (!b) return;
  e.preventDefault();
  const id = b.dataset.collapse, t = b.closest('table'), folded = !t.classList.contains('collapsed');
  t.classList.toggle('collapsed', folded);
  b.setAttribute('aria-expanded', folded ? 'false' : 'true');
  const name = acctById(id)?.name || '';
  b.setAttribute('aria-label', `${folded ? 'Show' : 'Hide'} ${name} holdings`); b.title = folded ? 'Show the holdings' : 'Fold the holdings away';
  const map = holdingsCollapsed(); if (folded) map[id] = true; else delete map[id];
  setHoldingsCollapsed(map); paintCollapseAll();
});
function holdingsAll() {   // Collapse all / Expand all (ACTIONS['holdings-all'] in 60-app.js)
  const ids = activeAccounts().filter(a => holdingsFor(a.id).length).map(a => a.id), map = holdingsCollapsed();
  const fold = !ids.every(id => map[id]);
  for (const id of ids) { if (fold) map[id] = true; else delete map[id]; }
  setHoldingsCollapsed(map); render();
}
