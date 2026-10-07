/* ---------- account values ---------- */
const holdingsFor = accId => state.holdings.filter(h => h.accountId === accId);
const holdingValue = h => round2((Number(h.shares) || 0) * (Number(h.price) || 0));
function accountValue(a) {
  const hs = holdingsFor(a.id);
  if (hs.length) return round2(sum(hs.map(holdingValue)) + (Number(a.cash) || 0));
  return round2(Number(a.balance) || 0);
}
function accountAsOf(a) {
  const hs = holdingsFor(a.id);
  if (hs.length) return hs.map(h => h.priceDate || '').sort()[0] || a.balanceDate;
  return a.balanceDate;
}
const isLiability = a => ACCOUNT_TYPES[a.type]?.side === 'liability';

function totals() {
  const t = { assets: 0, liabilities: 0, cash: 0, invest: 0, illiquid: 0, debt: 0 };
  for (const a of activeAccounts()) {
    const v = accountValue(a), b = ACCOUNT_TYPES[a.type]?.bucket || 'illiquid';
    t[b] += v;
    if (isLiability(a)) t.liabilities += v; else t.assets += v;
  }
  t.netWorth = round2(t.assets - t.liabilities);
  t.liquid = round2(t.cash + t.invest);
  return t;
}

/* Net worth series from monthly snapshots (current month is live). */
function netWorthSeries() {
  const keys = Object.keys(state.snapshots).sort();
  return keys.map(mk => ({ x: mk, y: round2(sum(Object.values(state.snapshots[mk]))) }));
}
function snapshotNW(mk) { const s = state.snapshots[mk]; return s ? round2(sum(Object.values(s))) : null; }

/* ---------- rules ---------- */
function matchRule(payee) {
  const p = normPayee(payee), raw = String(payee || '').toUpperCase();
  for (const r of state.rules) {
    const t = String(r.text || '').toUpperCase().trim();
    if (!t) continue;
    if (p.includes(normPayee(t) || t) || raw.includes(t)) return r;
  }
  return null;
}

/* ---------- monthly flows ---------- */
function txInMonth(mk) { return state.transactions.filter(t => t.date.startsWith(mk)); }
function txInRange(from, to) { return state.transactions.filter(t => t.date >= from && t.date <= to); }
function flowSummary(txs) {
  let income = 0, spending = 0, uncategorized = 0, rentalIncome = 0;
  for (const t of txs) {
    const c = catById(t.categoryId);
    if (!c) { uncategorized++; if (t.amount < 0) spending += -t.amount; else income += t.amount; continue; }
    if (c.kind === 'transfer') continue;
    if (c.kind === 'income') income += t.amount;
    else spending += -t.amount;
    if (c.rental === 'income') rentalIncome += t.amount;
  }
  const net = income - spending;
  return { income: round2(income), spending: round2(spending), net: round2(net), rate: income > 0 ? net / income : NaN, uncategorized, rentalIncome };
}
function categoryActuals(txs) {
  const m = {};
  for (const t of txs) {
    const id = t.categoryId || '_none';
    const c = catById(t.categoryId);
    if (c?.kind === 'transfer') continue;
    m[id] = (m[id] || 0) + (c?.kind === 'income' ? t.amount : -t.amount);
  }
  for (const k in m) m[k] = round2(m[k]);
  return m;
}
function trailingAvg(catId, mk, n = 3) {
  const vals = [];
  for (let i = 1; i <= n; i++) { const a = categoryActuals(txInMonth(addMonths(mk, -i)))[catId] || 0; vals.push(a); }
  return round2(sum(vals) / n);
}
/* budget figure to compare against for a given month (yearly categories compare YTD) */
function budgetView(c, mk) {
  const yr = mk.slice(0, 4), m = +mk.slice(5);
  if (c.period === 'year') {
    const ytd = categoryActuals(txInRange(`${yr}-01-01`, monthEnd(mk)))[c.id] || 0;
    return { budget: c.budget || 0, actual: ytd, label: 'this year', period: 'year', monthShare: (c.budget || 0) / 12 * m };
  }
  const act = categoryActuals(txInMonth(mk))[c.id] || 0;
  return { budget: c.budget || 0, actual: act, label: 'this month', period: 'month' };
}

/* ---------- rental property ---------- */
function rentalPnL(group, from, to) {
  const out = { income: 0, opex: 0, debt: 0 };
  for (const t of txInRange(from, to)) {
    const c = catById(t.categoryId);
    if (!c || c.group !== group || !c.rental) continue;
    if (c.rental === 'income') out.income += t.amount; else out[c.rental] += -t.amount;
  }
  out.noi = round2(out.income - out.opex);
  out.cashFlow = round2(out.noi - out.debt);
  for (const k of ['income', 'opex', 'debt']) out[k] = round2(out[k]);
  return out;
}

/* ---------- allocation ---------- */
function allocation() {
  const m = {};
  const add = (k, v) => { if (v) m[k] = (m[k] || 0) + v; };
  for (const a of activeAccounts()) {
    if (isLiability(a)) continue;
    const hs = holdingsFor(a.id);
    if (hs.length) { hs.forEach(h => add(h.assetClass || 'Unclassified', holdingValue(h))); add('Cash', Number(a.cash) || 0); }
    else add(ACCOUNT_TYPES[a.type]?.cls || a.assetClass || 'Unclassified', accountValue(a));
  }
  const total = sum(Object.values(m));
  const order = [...ASSET_CLASSES, 'Unclassified'];
  return { total, rows: order.filter(k => m[k]).map(k => ({ cls: k, value: round2(m[k]), share: total ? m[k] / total : 0 })) };
}
function investableAllocation() {
  const m = {};
  for (const a of activeAccounts()) {
    const b = ACCOUNT_TYPES[a.type]?.bucket;
    if (b !== 'invest' && a.type !== 'private') continue;
    const hs = holdingsFor(a.id);
    if (hs.length) hs.forEach(h => { m[h.assetClass || 'Unclassified'] = (m[h.assetClass || 'Unclassified'] || 0) + holdingValue(h); });
    else { const k = ACCOUNT_TYPES[a.type]?.cls || a.assetClass || 'Unclassified'; m[k] = (m[k] || 0) + accountValue(a); }
  }
  return m;
}

/* ---------- recurring + forecast ---------- */
function nextOccurrence(date, freq) {
  const d = fromISO(date);
  switch (freq) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'semimonthly': if (d.getDate() < 15) d.setDate(d.getDate() + 15); else { d.setMonth(d.getMonth() + 1); d.setDate(Math.max(1, d.getDate() - 15)); } break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'semiannual': d.setMonth(d.getMonth() + 6); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return toISO(d);
}
function occurrences(r, from, to) {
  const out = [];
  let d = r.nextDate, guard = 0;
  while (d && d < from && guard++ < 500) d = nextOccurrence(d, r.freq);
  while (d && d <= to && guard++ < 1000) { out.push(d); d = nextOccurrence(d, r.freq); }
  return out;
}
function forecastAccounts() { return activeAccounts().filter(a => a.forecast ?? ACCOUNT_TYPES[a.type]?.forecast); }
function forecast(days = 90) {
  const start = today(), end = addDays(start, days);
  const startBal = round2(sum(forecastAccounts().map(accountValue)));
  const events = [];
  for (const r of state.recurring) for (const d of occurrences(r, addDays(start, 1), end)) events.push({ date: d, amount: Number(r.amount) || 0, name: r.name });
  events.sort((a, b) => a.date.localeCompare(b.date));
  const series = []; let bal = startBal, i = 0, low = { y: startBal, x: start };
  for (let k = 0; k <= days; k++) {
    const day = addDays(start, k);
    while (i < events.length && events[i].date === day) bal += events[i++].amount;
    series.push({ x: day, y: round2(bal) });
    if (bal < low.y) low = { x: day, y: round2(bal) };
  }
  return { startBal, series, events, low, end: round2(bal) };
}
function upcoming(days = 14) {
  const from = today(), to = addDays(from, days), out = [];
  for (const r of state.recurring) for (const d of occurrences(r, from, to)) out.push({ date: d, name: r.name, amount: Number(r.amount) || 0, id: r.id });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* Detect repeating charges from history: same payee, ≥3 of the last 4 months, steady amount. */
function detectRepeating() {
  const since = `${addMonths(thisMonth(), -4)}-01`;
  const all = {};
  for (const t of state.transactions) {
    if (t.amount >= 0 || isTransferCat(t.categoryId)) continue;
    const k = normPayee(t.payee); if (!k) continue;
    (all[k] = all[k] || []).push(t);
  }
  const known = state.recurring.map(r => normPayee(r.name));
  const out = [];
  for (const [k, everything] of Object.entries(all)) {
    const list = everything.filter(t => t.date >= since);
    const months = new Set(list.map(t => monthKey(t.date)));
    if (months.size < 3) continue;
    const perMonth = [...months].map(m => -sum(list.filter(t => t.date.startsWith(m)).map(t => t.amount)));
    const counts = [...months].map(m => list.filter(t => t.date.startsWith(m)).length);
    if (Math.max(...counts) > 1) continue; // bought several times a month: not a subscription
    const avg = sum(perMonth) / perMonth.length;
    const sd = Math.sqrt(sum(perMonth.map(v => (v - avg) ** 2)) / perMonth.length);
    if (avg <= 0 || sd / avg > 0.12) continue;
    list.sort((a, b) => b.date.localeCompare(a.date));
    const last = list[0];
    const firstSeen = everything.map(t => t.date).sort()[0];
    const acct = acctById(last.accountId);
    const fromCash = !!acct && !!(acct.forecast ?? ACCOUNT_TYPES[acct.type]?.forecast);
    const tracked = known.some(n => n && (k.includes(n) || n.includes(k))) ||
      state.recurring.some(r => r.categoryId === last.categoryId && Math.abs(Math.abs(r.amount) - avg) / avg < 0.06);
    out.push({ key: k, payee: last.payee, monthly: round2(avg), lastDate: last.date, categoryId: last.categoryId, accountId: last.accountId, firstSeen, isNew: daysBetween(firstSeen, today()) <= 150, fromCash, tracked });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/* ---------- attention items ---------- */
function attentionItems() {
  const items = [];
  if (Store.canPickFiles && !Store.handle && state.accounts.length && !state.meta.sample) items.push({ tone: 'warn', text: 'Your data only lives in this browser. Save it to a file you back up', go: '#/data' });
  const unc = state.transactions.filter(t => !t.categoryId).length;
  if (unc) items.push({ tone: 'warn', text: `${unc} transaction${unc > 1 ? 's' : ''} need a category`, go: '#/transactions?cat=_none' });
  const stale = activeAccounts().filter(a => !holdingsFor(a.id).length && a.balanceDate && daysBetween(a.balanceDate, today()) > (state.settings.staleDays || 35));
  if (stale.length) items.push({ tone: 'info', text: `${stale.length} balance${stale.length > 1 ? 's are' : ' is'} more than ${state.settings.staleDays} days old`, go: '#/accounts?update=1' });
  const marks = state.holdings.filter(h => h.private && daysBetween(h.priceDate || '2000-01-01', today()) > 90);
  if (marks.length) items.push({ tone: 'info', text: `${marks.length} private holding${marks.length > 1 ? 's' : ''} last valued over 90 days ago`, go: '#/investments' });
  const mk = thisMonth();
  const over = state.categories.filter(c => c.kind === 'expense' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) })).filter(x => x.v.actual > x.v.budget * 1.0001);
  if (over.length) items.push({ tone: 'bad', text: `${over.length} categor${over.length > 1 ? 'ies are' : 'y is'} over budget: ${over.slice(0, 3).map(x => x.c.name).join(', ')}${over.length > 3 ? '…' : ''}`, go: '#/budget' });
  if (state.recurring.length && forecastAccounts().length) {
    const f = forecast(60);
    if (f.low.y < (state.settings.lowCash || 0)) items.push({ tone: 'bad', text: `Cash is projected to dip to ${money(f.low.y, { cents: false })} on ${dateLabel(f.low.x)}`, go: '#/cashflow' });
  }
  const conc = concentration();
  if (conc) items.push({ tone: 'info', text: `${conc.symbol} is ${pct(conc.share, 0)} of your investments`, go: '#/investments' });
  const lm = addMonths(mk, -1);
  if (state.transactions.some(t => t.date.startsWith(lm)) && !state.reviews[lm]?.completedAt) items.push({ tone: 'warn', text: `${MONTHS[+lm.slice(5) - 1]} hasn’t been reviewed yet`, go: `#/review?m=${lm}` });
  const rep = detectRepeating();
  const newSubs = rep.filter(d => d.isNew);
  if (newSubs.length) items.push({ tone: 'info', text: `New repeating charge${newSubs.length > 1 ? 's' : ''}: ${newSubs.slice(0, 2).map(d => `${d.payee} (${money(d.monthly)}/mo)`).join(', ')}`, go: '#/cashflow' });
  const untracked = rep.filter(d => d.fromCash && !d.tracked);
  if (untracked.length) items.push({ tone: 'info', text: `${untracked.length} bill${untracked.length > 1 ? 's' : ''} paid from checking ${untracked.length > 1 ? 'aren’t' : 'isn’t'} in your forecast`, go: '#/cashflow' });
  return items;
}
function concentration() {
  const inv = state.holdings.filter(h => h.assetClass !== 'Cash' && !/fund|index|etf|portfolio/i.test(h.name || ''));
  const total = sum(activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private').map(accountValue));
  if (!total) return null;
  const top = inv.map(h => ({ symbol: h.symbol, share: holdingValue(h) / total })).sort((a, b) => b.share - a.share)[0];
  return top && top.share >= 0.1 ? top : null;
}
