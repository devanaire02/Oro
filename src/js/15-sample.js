/* Fictional household used by "Load sample data". Deterministic, dated relative to today. */
function buildSampleState() {
  const r = rng(20261006);
  const between = (a, b) => round2(a + (b - a) * r());
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const cid = (g, n) => 'c-' + slug(g + '-' + n);
  const s = defaultState();
  const T = today(), M = thisMonth();
  const daysAgo = n => addDays(T, -n);

  const A = (id, name, type, institution, balance, extra = {}) => s.accounts.push({ id, name, type, institution, balance, balanceDate: daysAgo(Math.floor(r() * 6)), ...extra });
  A('a-chk', 'Everyday checking', 'checking', 'Lakeshore Bank', 0, { forecast: true });
  A('a-sav', 'Reserve savings', 'savings', 'Lakeshore Bank', 41250, { forecast: true });
  A('a-cc', 'Rewards card', 'credit', 'Northline Card', 0);
  A('a-brk', 'Joint brokerage', 'brokerage', 'Harbor Securities', 0, { cash: 0 });
  A('a-401', '401(k)', 'retirement', 'Employer plan', 0);
  A('a-roth', 'Roth IRA', 'retirement', 'Harbor Securities', 0);
  A('a-529', '529 college plan', 'education', 'State 529 program', 48200, { assetClass: 'US stocks' });
  A('a-pvt', 'Pre-IPO secondary', 'private', 'Secondary platform', 0);
  A('a-home', 'Home', 'realestate', 'Estimate', 685000, { balanceDate: daysAgo(40), mortgageId: 'a-mtg' });
  A('a-mtg', 'Home mortgage', 'mortgage', 'Lakeshore Mortgage', 411860, { rate: 3.125 });
  A('a-rent', 'Rental duplex', 'realestate', 'Estimate', 540000, { rental: true, rentalGroup: 'Rental property', cashInvested: 135000, mortgageId: 'a-rmtg', units: 2, balanceDate: daysAgo(40) });
  A('a-rmtg', 'Duplex mortgage', 'mortgage', 'Prairie Loan Servicing', 317940, { rate: 4.25 });
  A('a-car', 'SUV', 'vehicle', 'Estimate', 33800);
  A('a-auto', 'Auto loan', 'loan', 'Auto Finance', 18420, { rate: 5.9 });

  const H = (accountId, symbol, name, shares, price, costBasis, assetClass, extra = {}) =>
    s.holdings.push({ id: uid(), accountId, symbol, name, shares, price, costBasis, assetClass, priceDate: daysAgo(1), ...extra });
  H('a-brk', 'VTI', 'Total US stock market ETF', 410, 286.4, 72000, 'US stocks');
  H('a-brk', 'VXUS', 'Total international stock ETF', 520, 66.2, 28000, 'International stocks');
  H('a-brk', 'BND', 'Total bond market ETF', 300, 73.1, 23000, 'Bonds');
  H('a-brk', 'NVDA', 'NVIDIA', 180, 182.5, 9800, 'US stocks');
  H('a-brk', 'MSFT', 'Microsoft', 60, 515, 14000, 'US stocks');
  H('a-brk', 'SPAXX', 'Money market (core position)', 8400, 1, 8400, 'Cash');
  H('a-401', 'FXAIX', 'S&P 500 index fund', 900, 229.1, 140000, 'US stocks');
  H('a-401', 'FTIHX', 'Total international index fund', 4200, 17.4, 60000, 'International stocks');
  H('a-401', 'FXNAX', 'US bond index fund', 3000, 10.45, 33000, 'Bonds');
  H('a-roth', 'QQQ', 'Nasdaq-100 ETF', 95, 590, 30000, 'US stocks');
  H('a-roth', 'SCHD', 'US dividend equity ETF', 400, 27.6, 10000, 'US stocks');
  H('a-pvt', 'SERIES-D', 'Late-stage AI company (secondary)', 2000, 18.5, 24000, 'Private & alternatives', { private: true, priceDate: daysAgo(124) });

  const rules = [
    ['PAYROLL', cid('Income', 'Paycheck')], ['ANNUAL BONUS', cid('Income', 'Bonus')], ['INTEREST PAID', cid('Income', 'Interest and dividends')],
    ['LAKESHORE MTG', cid('Home', 'Mortgage or rent')], ['CITY ELECTRIC', cid('Home', 'Utilities')], ['NORTHERN GAS', cid('Home', 'Utilities')],
    ['FIBERNET', cid('Home', 'Utilities')], ['WIRELESS ONE', cid('Home', 'Utilities')], ['COUNTY TREASURER HOME', cid('Home', 'Property tax')],
    ['HOMESHIELD INS', cid('Home', 'Home insurance')], ['HOME DEPOT', cid('Home', 'Home maintenance')],
    ['AUTO FINANCE', cid('Transportation', 'Auto payment')], ['SHELL OIL', cid('Transportation', 'Fuel and charging')], ['PARK CHICAGO', cid('Transportation', 'Parking and tolls')],
    ['FRESH MARKET', cid('Food', 'Groceries')], ['COSTCO', cid('Food', 'Groceries')], ['LUCA TRATTORIA', cid('Food', 'Dining out')],
    ['TACO NORTE', cid('Food', 'Dining out')], ['SWEETGREEN', cid('Food', 'Dining out')], ['STARBUCKS', cid('Food', 'Coffee')], ['DARK MATTER', cid('Food', 'Coffee')],
    ['LITTLE OAKS', cid('Family', 'Childcare')], ['RIVER CITY SOCCER', cid('Family', 'Kids activities')], ['SWIM ACADEMY', cid('Family', 'Kids activities')],
    ['CHEWY', cid('Family', 'Pets')], ['PAWS VET', cid('Family', 'Pets')], ['NORTHSHORE CLINIC', cid('Health', 'Medical')], ['ORANGETHEORY', cid('Health', 'Fitness')],
    ['PELOTON', cid('Health', 'Fitness')], ['AMAZON', cid('Lifestyle', 'Shopping')], ['TARGET', cid('Lifestyle', 'Shopping')], ['AMC THEATRES', cid('Lifestyle', 'Entertainment')],
    ['TICKETMASTER', cid('Lifestyle', 'Entertainment')], ['NETFLIX', cid('Lifestyle', 'Subscriptions')], ['SPOTIFY', cid('Lifestyle', 'Subscriptions')],
    ['APPLE COM BILL', cid('Lifestyle', 'Subscriptions')], ['ADOBE', cid('Lifestyle', 'Subscriptions')], ['DELTA AIR', cid('Lifestyle', 'Travel')], ['MARRIOTT', cid('Lifestyle', 'Travel')],
    ['SUPERCUTS', cid('Lifestyle', 'Personal care')], ['GUARDIAN LIFE', cid('Financial', 'Life and disability insurance')],
    ['RENT UNIT', cid('Rental property', 'Rent received')], ['PRAIRIE LOAN', cid('Rental property', 'Rental mortgage')], ['ACE PLUMBING', cid('Rental property', 'Rental repairs')],
    ['COUNTY TREASURER DUPLEX', cid('Rental property', 'Rental property tax')], ['LANDLORD SHIELD', cid('Rental property', 'Rental insurance')], ['CITY WATER DUPLEX', cid('Rental property', 'Rental utilities')],
    ['TRANSFER TO RESERVE', cid('Transfers', 'Transfer between accounts')], ['TRANSFER FROM CHECKING', cid('Transfers', 'Transfer between accounts')],
    ['NORTHLINE CARD PAYMENT', cid('Transfers', 'Credit card payment')], ['PAYMENT THANK YOU', cid('Transfers', 'Credit card payment')], ['HARBOR SECURITIES CONTRIB', cid('Transfers', 'Savings and investing')],
  ];
  s.rules = rules.map(([text, categoryId]) => ({ id: uid(), text, categoryId }));

  const budgets = {
    [cid('Income', 'Paycheck')]: 10500, [cid('Home', 'Mortgage or rent')]: 2410, [cid('Home', 'Utilities')]: 420, [cid('Home', 'Property tax')]: 12400, [cid('Home', 'Home insurance')]: 2100,
    [cid('Home', 'Home maintenance')]: 150, [cid('Transportation', 'Auto payment')]: 535, [cid('Transportation', 'Fuel and charging')]: 220, [cid('Transportation', 'Parking and tolls')]: 40,
    [cid('Food', 'Groceries')]: 950, [cid('Food', 'Dining out')]: 450, [cid('Food', 'Coffee')]: 80, [cid('Family', 'Childcare')]: 640, [cid('Family', 'Kids activities')]: 250,
    [cid('Family', 'Pets')]: 110, [cid('Health', 'Medical')]: 120, [cid('Health', 'Fitness')]: 225, [cid('Lifestyle', 'Shopping')]: 450, [cid('Lifestyle', 'Entertainment')]: 120,
    [cid('Lifestyle', 'Subscriptions')]: 140, [cid('Lifestyle', 'Travel')]: 4500, [cid('Lifestyle', 'Gifts and giving')]: 100, [cid('Lifestyle', 'Personal care')]: 60,
    [cid('Financial', 'Life and disability insurance')]: 95, [cid('Rental property', 'Rent received')]: 4125, [cid('Rental property', 'Rental mortgage')]: 2180,
    [cid('Rental property', 'Rental repairs')]: 250, [cid('Rental property', 'Rental property tax')]: 7800, [cid('Rental property', 'Rental insurance')]: 1480, [cid('Rental property', 'Rental utilities')]: 90,
  };
  for (const c of s.categories) if (budgets[c.id] != null) c.budget = budgets[c.id];

  /* ---- transactions: 13 months ---- */
  const tx = [];
  const add = (accountId, date, payee, amount, extra = {}) => { if (date <= T) tx.push({ id: uid(), date, accountId, payee, amount: round2(amount), memo: '', ...extra }); };
  const start = addMonths(M, -12);
  // biweekly paychecks on Fridays
  let d = fromISO(start + '-01'); while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  for (; toISO(d) <= T; d.setDate(d.getDate() + 14)) add('a-chk', toISO(d), 'ACME CORP PAYROLL PPD', 4850);
  for (let i = 0; i <= 12; i++) {
    const mk = addMonths(start, i), mo = +mk.slice(5), day = n => `${mk}-${pad2(n)}`;
    let card = 0;
    const C = (date, payee, amt) => { add('a-cc', date, payee, -amt); if (date <= T) card += amt; };
    add('a-chk', day(1), 'LAKESHORE MTG PAYMENT', -2410);
    add('a-chk', day(1), 'PRAIRIE LOAN SERVICING', -2180);
    add('a-chk', day(2), 'TRANSFER TO RESERVE SAVINGS', -1000);
    add('a-sav', day(2), 'TRANSFER FROM CHECKING', 1000);
    add('a-chk', day(2), 'HARBOR SECURITIES CONTRIB', -1500);
    add('a-chk', day(3), 'RENT UNIT 1 ZELLE', 2150);
    add('a-chk', day(4), 'RENT UNIT 2 ZELLE', 1975);
    add('a-chk', day(5), 'LITTLE OAKS AFTERCARE', -640);
    add('a-chk', day(12), 'CITY ELECTRIC CO', -between(110, 215));
    const winter = [11, 12, 1, 2, 3].includes(mo);
    add('a-chk', day(14), 'NORTHERN GAS', -(winter ? between(140, 230) : between(38, 70)));
    add('a-chk', day(15), 'AUTO FINANCE PMT', -535);
    add('a-chk', day(18), 'FIBERNET', -79.99);
    add('a-chk', day(22), 'WIRELESS ONE', -145);
    add('a-chk', day(27), 'GUARDIAN LIFE PREM', -95);
    add('a-sav', monthEnd(mk), 'INTEREST PAID', between(118, 142));
    if (mo % 3 === 0) add('a-chk', day(20), 'CITY WATER DUPLEX', -between(210, 260));
    if (mo === 3) add('a-chk', day(15), 'ACME CORP ANNUAL BONUS', 12000);
    if (mo === 3 || mo === 8) add('a-chk', day(1), 'COUNTY TREASURER DUPLEX', -3900);
    if (mo === 6 || mo === 9) add('a-chk', day(1), 'COUNTY TREASURER HOME', -6200);
    if (mo === 4) add('a-chk', day(10), 'HOMESHIELD INS', -2100);
    if (mo === 6) add('a-chk', day(10), 'LANDLORD SHIELD INS', -1480);
    if (mo === 2) add('a-chk', day(17), 'ACE PLUMBING WATER HEATER', -1240);
    if (r() < 0.35) add('a-chk', day(9 + Math.floor(r() * 15)), 'ACE PLUMBING SERVICE', -between(180, 420));
    if ([4, 5, 6, 9, 10].includes(mo)) add('a-chk', day(6), 'RIVER CITY SOCCER', -125);
    add('a-chk', day(8), 'SWIM ACADEMY', -95);
    // card spending
    for (let w = 0; w < 5; w++) { const dd = 2 + w * 6 + Math.floor(r() * 3); if (dd <= 28) C(day(dd), pick(['FRESH MARKET #123', 'COSTCO WHSE #0388', 'FRESH MARKET #123']), between(120, 255)); }
    for (let k = 0, n = 4 + Math.floor(r() * 3); k < n; k++) C(day(1 + Math.floor(r() * 27)), pick(['TST* LUCA TRATTORIA', 'SQ *TACO NORTE', 'SWEETGREEN 0412', 'TST* LUCA TRATTORIA']), between(28, 145));
    for (let k = 0, n = 8 + Math.floor(r() * 5); k < n; k++) C(day(1 + Math.floor(r() * 27)), pick(['STARBUCKS STORE 12345', 'DARK MATTER COFFEE']), between(4.75, 8.9));
    for (let k = 0; k < 3; k++) C(day(3 + k * 9), 'SHELL OIL 5744', between(48, 74));
    C(day(9), 'NETFLIX.COM', 17.99); C(day(14), 'SPOTIFY USA', 11.99); C(day(20), 'APPLE.COM/BILL', 2.99); C(day(7), 'ADOBE *CREATIVE CLD', 59.99); C(day(11), 'PELOTON MEMBERSHIP', 44);
    C(day(16), 'ORANGETHEORY FITNESS', 179);
    if (i >= 8) C(day(13), 'HULU 877-824-4858', 18.99); // newer subscription, not yet in the forecast
    C(day(19), 'CHEWY.COM', 68.4);
    for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) C(day(1 + Math.floor(r() * 27)), pick(['AMAZON MKTPLACE PMTS', 'TARGET 00012', 'AMAZON MKTPLACE PMTS']), between(18, 240));
    if (r() < 0.5) C(day(1 + Math.floor(r() * 27)), pick(['AMC THEATRES 0611', 'TICKETMASTER']), between(38, 160));
    if (r() < 0.4) C(day(1 + Math.floor(r() * 27)), 'NORTHSHORE CLINIC COPAY', between(30, 90));
    if (r() < 0.3) C(day(1 + Math.floor(r() * 27)), 'HOME DEPOT 1922', between(40, 310));
    if (r() < 0.6) C(day(1 + Math.floor(r() * 27)), 'PARK CHICAGO', between(8, 32));
    C(day(21), 'SUPERCUTS 4410', 42);
    if (mo === 7) { C(day(6), 'DELTA AIR LINES', 1840); C(day(12), 'MARRIOTT LINCOLN PARK', 1265); }
    if (mo === 12) { C(day(18), 'DELTA AIR LINES', 920); C(day(10), 'AMAZON MKTPLACE PMTS', 610); }
    if (mo === 11 && r() < 1) C(day(24), 'PAWS VET CLINIC', 285);
    // pay card next month
    const payDate = `${addMonths(mk, 1)}-25`;
    add('a-chk', payDate, 'NORTHLINE CARD PAYMENT', -round2(card));
    add('a-cc', payDate, 'PAYMENT THANK YOU', round2(card));
  }
  // a few fresh ones this month with no rule yet
  const fresh = [['DOORDASH*BURGER DISTRICT', -46.18], ['WALGREENS #4411', -23.67], ['BEST BUY 00123', -189.99], ['UBER *TRIP', -27.4]];
  fresh.forEach(([p, amt], k) => { const dt = addDays(T, -(k + 1)); if (monthKey(dt) === M) add('a-cc', dt, p, amt, { fresh: true }); });

  s.transactions = tx.sort((a, b) => b.date.localeCompare(a.date));
  state = s; // rules need the live state
  for (const t of s.transactions) { if (!t.fresh) { const rr = matchRule(t.payee); t.categoryId = rr ? rr.categoryId : null; } else { t.categoryId = null; delete t.fresh; } t.payee = prettyPayee(t.payee); }

  // ledger-style balances for checking and card from flows
  const chkFlow = sum(tx.filter(t => t.accountId === 'a-chk').map(t => t.amount));
  acctById('a-chk').balance = round2(9800 + chkFlow - sum(tx.filter(t => t.accountId === 'a-chk' && t.date < start + '-01').map(t => t.amount)));
  acctById('a-chk').balance = round2(Math.max(6200, Math.min(acctById('a-chk').balance, 24000)));
  acctById('a-cc').balance = round2(-sum(tx.filter(t => t.accountId === 'a-cc' && monthKey(t.date) === M && t.amount < 0).map(t => t.amount)));

  /* ---- recurring (cash-flow forecast) ---- */
  const nextDom = dom => { let dt = `${M}-${pad2(dom)}`; if (dt <= T) dt = `${addMonths(M, 1)}-${pad2(dom)}`; return dt; };
  let nf = fromISO(T); while (nf.getDay() !== 5) nf.setDate(nf.getDate() + 1);
  // align with paycheck cadence
  const lastPay = s.transactions.find(t => t.categoryId === cid('Income', 'Paycheck'));
  const nextPay = lastPay ? addDays(lastPay.date, 14) : toISO(nf);
  const R = (name, amount, freq, nextDate, categoryId) => s.recurring.push({ id: uid(), name, amount, freq, nextDate, categoryId });
  R('Paycheck', 4850, 'biweekly', nextPay, cid('Income', 'Paycheck'));
  R('Rent, unit 1', 2150, 'monthly', nextDom(3), cid('Rental property', 'Rent received'));
  R('Rent, unit 2', 1975, 'monthly', nextDom(4), cid('Rental property', 'Rent received'));
  R('Home mortgage', -2410, 'monthly', nextDom(1), cid('Home', 'Mortgage or rent'));
  R('Duplex mortgage', -2180, 'monthly', nextDom(1), cid('Rental property', 'Rental mortgage'));
  R('Brokerage contribution', -1500, 'monthly', nextDom(2), cid('Transfers', 'Savings and investing'));
  R('Aftercare', -640, 'monthly', nextDom(5), cid('Family', 'Childcare'));
  R('Utilities (estimate)', -330, 'monthly', nextDom(12), cid('Home', 'Utilities'));
  R('Auto loan', -535, 'monthly', nextDom(15), cid('Transportation', 'Auto payment'));
  R('Internet', -79.99, 'monthly', nextDom(18), cid('Home', 'Utilities'));
  R('Phone', -145, 'monthly', nextDom(22), cid('Home', 'Utilities'));
  R('Credit card payment (estimate)', -3400, 'monthly', nextDom(25), cid('Transfers', 'Credit card payment'));
  R('Life insurance', -95, 'monthly', nextDom(27), cid('Financial', 'Life and disability insurance'));
  R('Home property tax', -6200, 'semiannual', `${addMonths(M, 2)}-01`, cid('Home', 'Property tax'));

  /* ---- 18 months of balance history ---- */
  for (let i = 18; i >= 1; i--) {
    const mk = addMonths(M, -i), snap = {};
    const mkt = Math.pow(1.0085, -i) * (1 + (r() - 0.5) * 0.05);
    for (const a of s.accounts) {
      let v = accountValue(a);
      if (['brokerage', 'retirement', 'education', 'crypto'].includes(a.type)) v = v * mkt - (a.type === 'brokerage' ? 1500 * i : a.id === 'a-401' ? 1900 * i : a.type === 'education' ? 500 * i : 0);
      else if (a.type === 'private') v = i > 5 ? 24000 : v;
      else if (a.type === 'realestate') v = v * Math.pow(1.003, -i);
      else if (a.type === 'mortgage') v = v + (a.id === 'a-mtg' ? 690 : 540) * i;
      else if (a.type === 'loan') v = v + 455 * i;
      else if (a.type === 'vehicle') v = v + 380 * i;
      else if (a.type === 'savings') v = v - 1120 * i;
      else if (a.type === 'checking') v = v * (0.85 + r() * 0.35);
      else if (a.type === 'credit') v = between(2600, 4300);
      v = Math.max(0, round2(v));
      snap[a.id] = ACCOUNT_TYPES[a.type].side === 'liability' ? -v : v;
    }
    s.snapshots[mk] = snap;
  }
  for (let i = 2; i <= 4; i++) s.reviews[addMonths(M, -i)] = { completedAt: daysAgo(30 * i - 22), notes: i === 2 ? 'Water heater replaced at the duplex. Pushed travel budget up for the summer trip.' : '' };
  s.settings.targets = { 'Cash': 5, 'US stocks': 55, 'International stocks': 20, 'Bonds': 15, 'Private & alternatives': 5 };
  s.meta.sample = true;
  return s;
}
