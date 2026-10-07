const VIEWS = {};

/* ================= Overview ================= */
VIEWS.overview = () => {
  const d = new Date();
  const sub = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!state.accounts.length) {
    return pageHead('Overview', sub) + emptyState('Your money, on your own machine',
      'Keel keeps your budget, net worth, investments and property in one file that never leaves this computer. Start by adding an account or importing a statement, or look around with sample data first.',
      `<button class="btn primary" data-act="add-account">Add an account</button><button class="btn" data-act="import">Import a file</button><button class="btn ghost" data-act="load-sample">Load sample data</button>`);
  }
  const t = totals(), mk = thisMonth(), prev = addMonths(mk, -1);
  const prevNW = snapshotNW(prev);
  const delta = prevNW == null ? null : t.netWorth - prevNW;
  const series = netWorthSeries();
  const shown = UI.nwRange === 'all' ? series : series.slice(-13);
  const f = flowSummary(txInMonth(mk));
  const ytdF = flowSummary(txInRange(`${mk.slice(0, 4)}-01-01`, today()));
  const acts = categoryActuals(txInMonth(mk));
  const spendCats = Object.entries(acts).filter(([id, v]) => v > 0 && catById(id)?.kind !== 'income' && id !== '_none' || (id === '_none' && v > 0)).sort((a, b) => b[1] - a[1]);
  const topSpend = spendCats.slice(0, 7), maxSpend = topSpend[0]?.[1] || 1;
  const billCats = new Set(state.recurring.map(r => r.categoryId));
  const budgeted = state.categories.filter(c => c.kind === 'expense' && c.budget > 0 && c.period !== 'year' && !c.rental && !billCats.has(c.id))
    .map(c => ({ c, v: budgetView(c, mk) })).sort((a, b) => (b.v.actual / b.v.budget) - (a.v.actual / a.v.budget)).slice(0, 6);
  const dayShare = new Date().getDate() / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const up = upcoming(14);
  const att = attentionItems();

  return pageHead('Overview', sub, `<button class="btn" data-act="import">Import</button><a class="btn ghost" href="#/review">Monthly review</a>`) + `
  <section class="hero">
    <div class="hero-figure">
      <span class="hero-label">Net worth</span>
      <span class="hero-num">${money(t.netWorth, { cents: false })}</span>
      ${delta == null ? '<span class="hero-delta muted">History builds as months pass, or add past balances on the Accounts page.</span>'
        : `<span class="hero-delta ${signClass(delta)}">${delta >= 0 ? 'Up' : 'Down'} ${money(Math.abs(delta), { cents: false })} since the end of ${MONTHS[+prev.slice(5) - 1]}</span>`}
      <dl class="hero-split">
        <div><dt>Assets</dt><dd>${money(t.assets, { cents: false })}</dd></div>
        <div><dt>Liabilities</dt><dd>${money(t.liabilities, { cents: false })}</dd></div>
        <div><dt>Cash and investments</dt><dd>${money(t.liquid, { cents: false })}</dd></div>
      </dl>
    </div>
    <div class="hero-chart">
      <div class="seg" role="tablist" aria-label="Range">
        <button class="${UI.nwRange === '12' ? 'on' : ''}" data-nwrange="12">12 months</button>
        <button class="${UI.nwRange === 'all' ? 'on' : ''}" data-nwrange="all">All</button>
      </div>
      ${chartHost({ h: 210, label: 'Net worth by month', series: [{ points: shown, color: 'var(--ink-accent)', area: true }], xFmt: x => monthLabel(x, true),
        tip: i => { const p = shown[i], q = shown[i - 1]; return `<strong>${monthLabel(p.x)}</strong><br>${money(p.y, { cents: false })}${q ? `<br><span class="${signClass(p.y - q.y)}">${money(p.y - q.y, { cents: false, sign: true })}</span>` : ''}`; } })}
    </div>
  </section>

  <section class="flows" aria-label="This month">
    <div class="flows-title"><h2>${MONTHS[d.getMonth()]} so far</h2><span class="muted">Transfers between your own accounts are left out.</span></div>
    <table class="ledger flows-table"><thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th><th class="num">Savings rate</th></tr></thead>
      <tbody>
        <tr><th scope="row">This month</th><td class="num">${money(f.income, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td><td class="num ${signClass(f.net)}">${money(f.net, { cents: false })}</td><td class="num">${pct(f.rate, 0)}</td></tr>
        <tr><th scope="row">This year</th><td class="num">${money(ytdF.income, { cents: false })}</td><td class="num">${money(ytdF.spending, { cents: false })}</td><td class="num ${signClass(ytdF.net)}">${money(ytdF.net, { cents: false })}</td><td class="num">${pct(ytdF.rate, 0)}</td></tr>
      </tbody></table>
  </section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Flexible spending</h2><a href="#/budget">Open budget</a></header>
      ${budgeted.length ? `<ul class="meters">${budgeted.map(({ c, v }) => `
        <li><div class="meter-row"><span>${esc(c.name)}</span><span class="num ${v.actual > v.budget ? 'neg' : ''}">${money(v.actual, { cents: false })} <span class="muted">of ${money(v.budget, { cents: false })}</span></span></div>${bar(v.actual, v.budget, { pace: v.budget * dayShare })}</li>`).join('')}</ul>
        <p class="muted small">Categories you budget for that aren’t scheduled bills. The tick marks an even pace for this point in the month.</p>`
        : `<p class="muted">No budgets yet. <a href="#/budget">Set targets</a> for the categories you care about.</p>`}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Where it went</h2><a href="#/transactions">All transactions</a></header>
      ${topSpend.length ? `<ul class="bars">${topSpend.map(([id, v], i) => `
        <li><a href="#/transactions?cat=${id}"><span class="bars-label">${esc(id === '_none' ? 'Uncategorized' : catName(id))}</span><span class="bars-track"><span style="width:${(v / maxSpend) * 100}%;background:var(--c${(i % 8) + 1})"></span></span><span class="num">${money(v, { cents: false })}</span></a></li>`).join('')}</ul>`
        : '<p class="muted">No spending recorded this month yet.</p>'}
    </section>
  </div>
  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Coming up</h2><a href="#/cashflow">Cash flow</a></header>
      ${up.length ? `<table class="ledger compact"><tbody>${up.slice(0, 8).map(u => `<tr><td class="nowrap muted">${dateLabel(u.date)}</td><td>${esc(u.name)}</td><td class="num ${signClass(u.amount)}">${money(u.amount)}</td></tr>`).join('')}</tbody></table>`
        : `<p class="muted">Nothing scheduled in the next two weeks. Add paychecks and bills on the <a href="#/cashflow">Cash flow</a> page to see what’s ahead.</p>`}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Needs attention</h2></header>
      ${att.length ? `<ul class="attention">${att.map(a => `<li class="${a.tone}"><a href="${a.go}">${esc(a.text)}</a></li>`).join('')}</ul>` : '<p class="muted">Everything is categorized, current and on budget.</p>'}
    </section>
  </div>`;
};

/* ================= Transactions ================= */
VIEWS.transactions = p => {
  const month = p.m || thisMonth();
  const q = (p.q || '').toLowerCase();
  let list = state.transactions;
  if (month !== 'all') list = list.filter(t => t.date.startsWith(month));
  if (p.acct) list = list.filter(t => t.accountId === p.acct);
  if (p.cat === '_none') list = list.filter(t => !t.categoryId);
  else if (p.cat) list = list.filter(t => t.categoryId === p.cat);
  if (q) list = list.filter(t => (t.payee + ' ' + (t.memo || '') + ' ' + (t.rawPayee || '') + ' ' + catName(t.categoryId)).toLowerCase().includes(q) || String(Math.abs(t.amount)).includes(q));
  const limit = +p.limit || 250;
  const shown = list.slice(0, limit);
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  if (!months.includes(thisMonth())) months.unshift(thisMonth());
  const inflow = sum(list.filter(t => t.amount > 0).map(t => t.amount)), outflow = sum(list.filter(t => t.amount < 0).map(t => t.amount));
  const opts = catOptions(null, true);
  const unc = state.transactions.filter(t => !t.categoryId).length;

  return pageHead('Transactions', `${list.length.toLocaleString()} shown${unc ? ` · <a href="#/transactions?cat=_none&m=all">${unc} uncategorized</a>` : ''}`,
    `<button class="btn" data-act="import">Import</button><button class="btn primary" data-act="add-txn">Add transaction</button>`) + `
  <div class="filters">
    <label class="field inline"><span>Month</span><select data-filter="m"><option value="all" ${month === 'all' ? 'selected' : ''}>All months</option>${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
    <label class="field inline"><span>Account</span><select data-filter="acct">${acctOptions(p.acct, null, 'All accounts')}</select></label>
    <label class="field inline"><span>Category</span><select data-filter="cat"><option value="">All categories</option><option value="_none" ${p.cat === '_none' ? 'selected' : ''}>Uncategorized</option>${catOptions(p.cat, false)}</select></label>
    <label class="field inline grow"><span>Search</span><input type="search" id="tx-search" data-filter="q" value="${esc(p.q || '')}" placeholder="Payee, memo or amount"></label>
  </div>
  <div class="bulk" id="bulk" hidden>
    <span id="bulk-count"></span>
    <select id="bulk-cat">${catOptions(null, true)}</select>
    <button class="btn small" data-act="bulk-cat">Set category</button>
    <button class="btn small ghost danger-text" data-act="bulk-del">Delete</button>
  </div>
  ${shown.length ? `<div class="scroll-table"><table class="ledger tx-table" id="tx-table">
    <thead><tr><th class="cb"><input type="checkbox" id="tx-all" aria-label="Select all shown"></th><th>Date</th><th>Payee</th><th>Category</th><th class="hide-sm">Account</th><th class="num">Amount</th></tr></thead>
    <tbody>${shown.map(t => `<tr data-id="${t.id}" class="${t.categoryId ? '' : 'needs'}">
      <td class="cb"><input type="checkbox" class="tx-cb" value="${t.id}" aria-label="Select"></td>
      <td class="nowrap muted">${dateLabel(t.date)}</td>
      <td><button class="linklike" data-edit-txn="${t.id}">${esc(t.payee || '(no description)')}</button>${t.memo ? `<div class="muted small">${esc(t.memo)}</div>` : ''}</td>
      <td><select class="cat-select" data-txcat="${t.id}" aria-label="Category">${t.categoryId ? opts.replace(`value="${t.categoryId}"`, `value="${t.categoryId}" selected`) : opts}</select></td>
      <td class="hide-sm muted">${esc(acctById(t.accountId)?.name || '—')}</td>
      <td class="num ${signClass(t.amount)}">${money(t.amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3"></td><td class="hide-sm"></td><td class="muted">Money in<br>Money out<br><strong>Net</strong></td><td class="num total">${money(inflow)}<br>${money(outflow)}<br><strong class="${signClass(inflow + outflow)}">${money(inflow + outflow)}</strong></td></tr></tfoot>
  </table></div>
  ${list.length > limit ? `<p class="center"><button class="btn ghost" data-more="${limit + 250}">Show ${Math.min(250, list.length - limit)} more</button></p>` : ''}`
  : emptyState(state.transactions.length ? 'Nothing matches these filters' : 'No transactions yet',
    state.transactions.length ? 'Try another month or clear the search.' : 'Import an OFX, QFX, CSV or PDF from your bank or card, or add one by hand.',
    state.transactions.length ? `<a class="btn" href="#/transactions?m=all">Show all months</a>` : `<button class="btn primary" data-act="import">Import a file</button>`)}`;
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
  const avgs = {}; for (const c of cats) avgs[c.id] = trailingAvg(c.id, mk, 3);

  const rowsFor = cs => cs.map(c => {
    const v = budgetView(c, mk);
    const left = v.budget - v.actual;
    const inc = c.kind === 'income';
    const pace = v.period === 'year' ? v.monthShare : v.budget * dayShare;
    return `<tr>
      <th scope="row"><button class="linklike" data-edit-cat="${c.id}">${esc(c.name)}</button>${v.period === 'year' ? '<span class="tag soft">yearly</span>' : ''}</th>
      <td class="num budget-cell"><span class="cur">$</span><input class="budget-input" id="b-${c.id}" data-budget="${c.id}" inputmode="decimal" value="${c.budget ? round2(c.budget) : ''}" placeholder="0" aria-label="Budget for ${esc(c.name)}"></td>
      <td class="num">${money(v.actual, { cents: false })}</td>
      <td class="num ${inc ? (left < 0 ? 'pos' : 'muted') : (left < 0 ? 'neg' : '')}">${!v.budget ? '<span class="muted">—</span>' : inc ? (left > 0 ? `${money(left, { cents: false })} to come` : money(-left, { cents: false, sign: true })) : money(left, { cents: false })}</td>
      <td class="meter-cell">${v.budget ? bar(v.actual, v.budget, { pace: inc ? null : pace }) : ''}</td>
      <td class="num muted hide-sm">${avgs[c.id] ? money(avgs[c.id], { cents: false }) : '—'}</td></tr>`;
  }).join('');

  const groupTotal = cs => {
    const m = cs.filter(c => c.period !== 'year');
    return { b: sum(m.map(c => c.budget || 0)), a: sum(m.map(c => budgetView(c, mk).actual)) };
  };

  return pageHead('Budget', 'Targets repeat every month. Yearly categories are compared with spending so far this year.', monthNav(mk) +
    `<button class="btn ghost" data-act="budget-avg">Fill from averages</button>`) + `
  <section class="flows">
    <table class="ledger flows-table"><thead><tr><th></th><th class="num">Expected income</th><th class="num">Planned spending</th><th class="num">Unplanned</th><th class="num">Spent in ${MONTHS[+mk.slice(5) - 1]}</th></tr></thead>
    <tbody><tr><th scope="row">Per month</th><td class="num">${money(expIncome, { cents: false })}</td><td class="num">${money(planned, { cents: false })}</td><td class="num ${signClass(expIncome - planned)}">${money(expIncome - planned, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td></tr></tbody></table>
    <p class="muted small">Planned spending includes one-twelfth of each yearly budget. Unplanned is what’s left for saving and investing.</p>
  </section>
  ${order.map(g => {
    const cs = groups[g], tt = groupTotal(cs.filter(c => c.kind === 'expense'));
    const isRental = cs.some(c => c.rental);
    const pnl = isRental ? rentalPnL(g, `${mk}-01`, monthEnd(mk)) : null;
    return `<section class="budget-group">
      <table class="ledger budget-table">
        <thead><tr><th scope="col">${esc(g)}</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">${cs[0].kind === 'income' && !isRental ? 'Difference' : 'Left'}</th><th class="meter-cell"></th><th class="num hide-sm">3-mo avg</th></tr></thead>
        <tbody>${rowsFor(cs)}</tbody>
        ${isRental ? `<tfoot><tr><th scope="row">Cash flow after debt service</th><td></td><td class="num total ${signClass(pnl.cashFlow)}">${money(pnl.cashFlow, { cents: false })}</td><td colspan="3" class="muted small">NOI ${money(pnl.noi, { cents: false })} this month</td></tr></tfoot>`
        : cs[0].kind === 'expense' && cs.length > 1 ? `<tfoot><tr><th scope="row">Monthly total</th><td class="num total">${money(tt.b, { cents: false })}</td><td class="num total">${money(tt.a, { cents: false })}</td><td class="num total ${tt.b - tt.a < 0 ? 'neg' : ''}">${money(tt.b - tt.a, { cents: false })}</td><td></td><td class="hide-sm"></td></tr></tfoot>` : ''}
      </table></section>`;
  }).join('')}
  <p class="center"><button class="btn ghost" data-act="add-cat">Add a category</button></p>`;
};

/* ================= Accounts ================= */
VIEWS.accounts = p => {
  const updating = p.update === '1';
  if (!state.accounts.length) return pageHead('Accounts') + emptyState('Add your first account', 'Checking, cards, brokerage, retirement, property, loans: list everything you own and owe to see your full balance sheet.', `<button class="btn primary" data-act="add-account">Add an account</button><button class="btn" data-act="import">Import a file</button>`);
  const t = totals();
  const groups = BUCKETS.map(b => ({ b, accts: activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === b.id) })).filter(g => g.accts.length);
  const archived = state.accounts.filter(a => a.archived);
  return pageHead('Accounts', updating ? 'Type in current balances from your statements, then save.' : 'Everything you own and owe.',
    updating ? `<a class="btn ghost" href="#/accounts">Cancel</a><button class="btn primary" data-act="save-balances">Save balances</button>`
      : `<a class="btn" href="#/accounts?update=1">Update balances</a><button class="btn primary" data-act="add-account">Add account</button>`) + `
  ${groups.map(({ b, accts }) => {
    const subtotal = sum(accts.map(accountValue));
    return `<section class="acct-group"><table class="ledger acct-table">
      <thead><tr><th scope="col">${esc(b.label)}</th><th class="hide-sm">Type</th><th>As of</th><th class="num">${b.id === 'debt' ? 'Owed' : 'Value'}</th><th class="acts"></th></tr></thead>
      <tbody>${accts.map(a => {
        const hs = holdingsFor(a.id).length;
        const v = accountValue(a);
        return `<tr>
          <th scope="row"><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button>${a.institution ? `<div class="muted small">${esc(a.institution)}${a.last4 ? ` ending ${esc(a.last4)}` : ''}</div>` : ''}</th>
          <td class="hide-sm muted">${esc(ACCOUNT_TYPES[a.type]?.label)}${a.rental ? ', rental' : ''}${hs ? `, ${hs} holding${hs > 1 ? 's' : ''}` : ''}</td>
          <td>${staleTag(accountAsOf(a))}</td>
          <td class="num">${updating && !hs ? `<input class="bal-input" data-bal="${a.id}" inputmode="decimal" value="${round2(a.balance)}" aria-label="Balance for ${esc(a.name)}">` : money(v)}</td>
          <td class="acts"><button class="linklike small" data-history="${a.id}">History</button></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th scope="row">Total ${esc(b.label.toLowerCase())}</th><td class="hide-sm"></td><td></td><td class="num total">${money(subtotal)}</td><td></td></tr></tfoot>
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
