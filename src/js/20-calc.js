/* ---------- memo (cleared on every commit/render) ---------- */
let MEMO = {};
function invalidate() { MEMO = {}; }
function memo(key, fn) { if (!(key in MEMO)) MEMO[key] = fn(); return MEMO[key]; }

/* ---------- transactions: splits ---------- */
/* A transaction with splits contributes one line per split; otherwise itself. */
function txLines(t) {
  if (t.splits && t.splits.length) return t.splits.map(s => ({ date: t.date, accountId: t.accountId, amount: Number(s.amount) || 0, categoryId: s.categoryId || null, parent: t }));
  return [{ date: t.date, accountId: t.accountId, amount: t.amount, categoryId: t.categoryId || null, parent: t }];
}
const isUncat = t => (t.splits && t.splits.length) ? t.splits.some(s => !s.categoryId) : !t.categoryId;
const isSplit = t => !!(t.splits && t.splits.length);
function txHasCat(t, id) { return isSplit(t) ? t.splits.some(s => s.categoryId === id) : t.categoryId === id; }

/* ---------- account values ---------- */
const holdingsFor = accId => state.holdings.filter(h => h.accountId === accId);
const holdingValue = h => round2((Number(h.shares) || 0) * (Number(h.price) || 0));
const isLiability = a => ACCOUNT_TYPES[a.type]?.side === 'liability';
function txByAccount(id) {
  return memo('txacct', () => groupBy(state.transactions, t => t.accountId))[id] || [];
}
/* Ledger accounts: balance = anchor ± everything after the anchor date (or before, for past dates). */
function ledgerBalance(a, asOf = '9999-12-31') {
  const anchor = Number(a.anchorBalance ?? a.balance) || 0, ad = a.anchorDate || a.balanceDate || '0000-00-00';
  let flow = 0;
  for (const t of txByAccount(a.id)) {
    if (t.date > ad && t.date <= asOf) flow += t.amount;
    else if (t.date > asOf && t.date <= ad) flow -= t.amount;
  }
  return round2(isLiability(a) ? anchor - flow : anchor + flow);
}
function accountValue(a) {
  const hs = holdingsFor(a.id);
  if (hs.length) return round2(sum(hs.map(holdingValue)) + (Number(a.cash) || 0));
  if (a.ledger) return ledgerBalance(a);
  return round2(Number(a.balance) || 0);
}
function accountAsOf(a) {
  const hs = holdingsFor(a.id);
  if (hs.length) return hs.map(h => h.priceDate || '').sort()[0] || a.balanceDate;
  if (a.ledger) { const last = txByAccount(a.id).reduce((m, t) => t.date > m ? t.date : m, ''); const ad = a.anchorDate || a.balanceDate || ''; return last > ad ? last : ad; }
  return a.balanceDate;
}
function totals() {
  return memo('totals', () => {
    const t = { assets: 0, liabilities: 0, cash: 0, invest: 0, illiquid: 0, debt: 0 };
    for (const a of activeAccounts()) {
      const v = accountValue(a), b = ACCOUNT_TYPES[a.type]?.bucket || 'illiquid';
      t[b] += v;
      if (isLiability(a)) t.liabilities += v; else t.assets += v;
    }
    t.netWorth = round2(t.assets - t.liabilities);
    t.liquid = round2(t.cash + t.invest);
    return t;
  });
}
function netWorthSeries() { return Object.keys(state.snapshots).sort().map(mk => ({ x: mk, y: round2(sum(Object.values(state.snapshots[mk]))) })); }
function snapshotNW(mk) { const s = state.snapshots[mk]; return s ? round2(sum(Object.values(s))) : null; }

/* ---------- rules ---------- */
function ruleMatches(r, payee) {
  const t = String(r.text || '').toUpperCase().trim();
  if (!t) return false;
  return normPayee(payee).includes(normPayee(t) || t) || String(payee || '').toUpperCase().includes(t);
}
function matchRule(payee) { return state.rules.find(r => ruleMatches(r, payee)) || null; }

/* ---------- flows ---------- */
function txInMonth(mk) { return memo('m:' + mk, () => state.transactions.filter(t => t.date.startsWith(mk))); }
function txInRange(from, to) { return memo(`r:${from}:${to}`, () => state.transactions.filter(t => t.date >= from && t.date <= to)); }
function flowSummary(txs) {
  let income = 0, spending = 0, uncategorized = 0;
  for (const t of txs) {
    if (isUncat(t)) uncategorized++;
    for (const l of txLines(t)) {
      const c = catById(l.categoryId);
      if (!c) { if (l.amount < 0) spending += -l.amount; else income += l.amount; continue; }
      if (c.kind === 'transfer') continue;
      if (c.kind === 'income') income += l.amount; else spending += -l.amount;
    }
  }
  const net = income - spending;
  return { income: round2(income), spending: round2(spending), net: round2(net), rate: income > 0 ? net / income : NaN, uncategorized };
}
/* Category → actual (spending positive for expense categories, income positive for income). */
function categoryActuals(txs) {
  const m = {};
  for (const t of txs) for (const l of txLines(t)) {
    const id = l.categoryId || '_none', c = catById(l.categoryId);
    if (c?.kind === 'transfer') continue;
    m[id] = (m[id] || 0) + (c?.kind === 'income' ? l.amount : -l.amount);
  }
  for (const k in m) m[k] = round2(m[k]);
  return m;
}
const monthActuals = mk => memo('a:' + mk, () => categoryActuals(txInMonth(mk)));
const rangeActuals = (from, to) => memo(`ra:${from}:${to}`, () => categoryActuals(txInRange(from, to)));
function trailingAvg(catId, mk, n = 3) { let s = 0; for (let i = 1; i <= n; i++) s += monthActuals(addMonths(mk, -i))[catId] || 0; return round2(s / n); }
function firstTxMonth() { return memo('first', () => state.transactions.reduce((m, t) => t.date < m ? t.date : m, '9999').slice(0, 7)); }

/* Budget figures for a category in a month. Rollover categories carry unspent (or overspent) amounts forward. */
function budgetView(c, mk) {
  const yr = mk.slice(0, 4), m = +mk.slice(5);
  if (c.period === 'year') {
    const ytd = rangeActuals(`${yr}-01-01`, monthEnd(mk))[c.id] || 0;
    return { budget: c.budget || 0, actual: ytd, label: 'this year', period: 'year', monthShare: (c.budget || 0) / 12 * m, available: (c.budget || 0) - ytd };
  }
  const act = monthActuals(mk)[c.id] || 0;
  let carry = 0;
  if (c.rollover && c.kind === 'expense') {
    const start = c.rolloverStart || firstTxMonth();
    for (let k = start; k < mk; k = addMonths(k, 1)) carry += (c.budget || 0) - (monthActuals(k)[c.id] || 0);
  }
  return { budget: c.budget || 0, actual: act, label: 'this month', period: 'month', carry: round2(carry), available: round2((c.budget || 0) + carry - act) };
}

/* ---------- rental property ---------- */
function rentalPnL(group, from, to) {
  const out = { income: 0, opex: 0, debt: 0 };
  for (const t of txInRange(from, to)) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (!c || c.group !== group || !c.rental) continue;
    if (c.rental === 'income') out.income += l.amount; else out[c.rental] += -l.amount;
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
  return { total, rows: [...ASSET_CLASSES, 'Unclassified'].filter(k => m[k]).map(k => ({ cls: k, value: round2(m[k]), share: total ? m[k] / total : 0 })) };
}
function investableAllocation(includePrivate = true) {
  const m = {};
  for (const a of activeAccounts()) {
    const b = ACCOUNT_TYPES[a.type]?.bucket;
    if (b !== 'invest' && !(includePrivate && a.type === 'private')) continue;
    const hs = holdingsFor(a.id);
    if (hs.length) { hs.forEach(h => { const k = h.assetClass || 'Unclassified'; m[k] = (m[k] || 0) + holdingValue(h); }); if (a.cash) m.Cash = (m.Cash || 0) + Number(a.cash); }
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
  const out = []; let d = r.nextDate, guard = 0;
  while (d && d < from && guard++ < 800) d = nextOccurrence(d, r.freq);
  while (d && d <= to && guard++ < 1600) { out.push(d); d = nextOccurrence(d, r.freq); }
  return out;
}
function forecastAccounts() { return activeAccounts().filter(a => a.forecast ?? ACCOUNT_TYPES[a.type]?.forecast); }
function forecast(days = 90) {
  return memo('fc:' + days, () => {
    const start = today(), end = addDays(start, days);
    const startBal = round2(sum(forecastAccounts().map(accountValue)));
    const events = [];
    for (const r of state.recurring) for (const d of occurrences(r, addDays(start, 1), end)) events.push({ date: d, amount: Number(r.amount) || 0, name: r.name, id: r.id });
    events.sort((a, b) => a.date.localeCompare(b.date));
    const series = []; let bal = startBal, i = 0, low = { y: startBal, x: start };
    for (let k = 0; k <= days; k++) {
      const day = addDays(start, k);
      while (i < events.length && events[i].date === day) bal += events[i++].amount;
      series.push({ x: day, y: round2(bal) });
      if (bal < low.y) low = { x: day, y: round2(bal) };
    }
    return { startBal, series, events, low, end: round2(bal) };
  });
}
function upcoming(days = 14) {
  const from = today(), to = addDays(from, days), out = [];
  for (const r of state.recurring) for (const d of occurrences(r, from, to)) out.push({ date: d, name: r.name, amount: Number(r.amount) || 0, id: r.id });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* Repeating charges: same payee, ≥3 of the last 4 months, steady amount. */
function detectRepeating() {
  return memo('rep', () => {
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
      if (Math.max(...[...months].map(m => list.filter(t => t.date.startsWith(m)).length)) > 1) continue;
      const avg = sum(perMonth) / perMonth.length;
      const sd = Math.sqrt(sum(perMonth.map(v => (v - avg) ** 2)) / perMonth.length);
      if (avg <= 0 || sd / avg > 0.12) continue;
      list.sort((a, b) => b.date.localeCompare(a.date));
      const last = list[0], firstSeen = everything.map(t => t.date).sort()[0], acct = acctById(last.accountId);
      const fromCash = !!acct && !!(acct.forecast ?? ACCOUNT_TYPES[acct.type]?.forecast);
      const tracked = known.some(n => n && (k.includes(n) || n.includes(k))) || state.recurring.some(r => r.categoryId === last.categoryId && Math.abs(Math.abs(r.amount) - avg) / avg < 0.06);
      out.push({ key: k, payee: last.payee, monthly: round2(avg), lastDate: last.date, categoryId: last.categoryId, accountId: last.accountId, firstSeen, isNew: daysBetween(firstSeen, today()) <= 150, fromCash, tracked });
    }
    return out.sort((a, b) => b.monthly - a.monthly);
  });
}

/* ---------- goals ---------- */
function goalProgress(g) {
  let current = Number(g.saved) || 0, source = 'Updated by hand';
  if (g.accountId && acctById(g.accountId)) { current = accountValue(acctById(g.accountId)); source = acctById(g.accountId).name; }
  else if (g.categoryId && catById(g.categoryId)) { const c = catById(g.categoryId); current = Math.max(0, budgetView(c, thisMonth()).available); source = `${c.name} budget`; }
  const target = Number(g.target) || 0;
  const monthsLeft = g.targetDate ? Math.max(0, monthsBetween(thisMonth(), g.targetDate.slice(0, 7))) : null;
  const remaining = Math.max(0, target - current);
  const needed = monthsLeft == null ? null : monthsLeft ? remaining / monthsLeft : remaining;
  const share = target ? clamp(current / target, 0, 1) : 0;
  let status = 'on';
  if (current >= target) status = 'done';
  else if (g.monthly != null && g.monthly !== '' && needed != null && Number(g.monthly) + 0.01 < needed) status = 'behind';
  return { current: round2(current), target, remaining: round2(remaining), monthsLeft, needed: needed == null ? null : round2(needed), share, status, source };
}

/* ---------- attention items ---------- */
function attentionItems() {
  const items = [];
  if (isCompanion()) {
    const dev = deviceLabel();
    if (!SYNC.rec && state.accounts.length && !state.meta.sample) items.push({ tone: 'warn', text: `This ${dev} isn’t connected to your Mac’s data. Open it from iCloud Drive`, act: 'sync' });
    else if (SYNC.rec?.replaced) items.push({ tone: 'warn', text: `The data here no longer matches your Mac’s. Get the latest from iCloud Drive`, act: 'sync' });
    else if (SYNC.rec) {
      const n = syncPending().length;
      if (n) items.push({ tone: 'warn', text: `${changesWord(n)} on this ${dev} ${n === 1 ? 'isn’t' : 'aren’t'} on your Mac yet. Send ${n === 1 ? 'it' : 'them'}`, act: 'sync' });
      if (SYNC.rec.macSaved && daysBetween(SYNC.rec.macSaved.slice(0, 10), today()) >= 3) items.push({ tone: 'info', text: `Your Mac’s data here is from ${whenLabel(SYNC.rec.macSaved)}. Get the latest`, act: 'sync' });
    }
  }
  else if (!hasFolder() && !Store.handle && state.accounts.length && !state.meta.sample) items.push({ tone: 'warn', text: 'Your data only lives in this browser. Choose your Ọrọ̀ folder so it’s saved as files with daily backups', go: '#/data' });
  else if ((Store.dir || Store.handle) && Store.perm !== 'granted') items.push({ tone: 'warn', text: `Ọrọ̀ needs permission again to save to ${Store.fileName}`, go: '#/data' });
  const unc = state.transactions.filter(isUncat).length;
  if (unc) items.push({ tone: 'warn', text: `${unc} transaction${unc > 1 ? 's' : ''} need a category`, go: '#/transactions?cat=_none&m=all' });
  const stale = activeAccounts().filter(a => !holdingsFor(a.id).length && !a.ledger && a.balanceDate && daysBetween(a.balanceDate, today()) > (state.settings.staleDays || 35));
  if (stale.length) items.push({ tone: 'info', text: `${stale.length} balance${stale.length > 1 ? 's are' : ' is'} more than ${state.settings.staleDays} days old`, go: '#/accounts?update=1' });
  const marks = state.holdings.filter(h => h.private && daysBetween(h.priceDate || '2000-01-01', today()) > 90);
  if (marks.length) items.push({ tone: 'info', text: `${marks.length} private holding${marks.length > 1 ? 's' : ''} last valued over 90 days ago`, go: '#/investments' });
  const mk = thisMonth();
  const over = state.categories.filter(c => c.kind === 'expense' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) })).filter(x => x.v.period === 'year' ? x.v.actual > x.v.budget * 1.0001 : x.v.available < -0.01);
  if (over.length) items.push({ tone: 'bad', text: `${over.length} categor${over.length > 1 ? 'ies are' : 'y is'} over budget: ${over.slice(0, 3).map(x => x.c.name).join(', ')}${over.length > 3 ? '…' : ''}`, go: '#/budget' });
  if (state.recurring.length && forecastAccounts().length) {
    const f = forecast(60);
    if (f.low.y < (state.settings.lowCash || 0)) items.push({ tone: 'bad', text: `Cash is projected to dip to ${money(f.low.y, { cents: false })} on ${dateLabel(f.low.x)}`, go: '#/cashflow' });
  }
  const conc = concentration();
  if (conc) items.push({ tone: 'info', text: `${conc.symbol} is ${pct(conc.share, 0)} of your investments`, go: '#/investments' });
  const behind = state.goals.filter(g => goalProgress(g).status === 'behind');
  if (behind.length) items.push({ tone: 'warn', text: `${behind.length} goal${behind.length > 1 ? 's are' : ' is'} behind pace: ${behind.map(g => g.name).slice(0, 2).join(', ')}`, go: '#/planning' });
  const lm = addMonths(mk, -1);
  if (state.transactions.some(t => t.date.startsWith(lm)) && !state.reviews[lm]?.completedAt) items.push({ tone: 'warn', text: `${MONTHS[+lm.slice(5) - 1]} hasn’t been reviewed yet`, go: `#/review?m=${lm}` });
  const rep = detectRepeating();
  const newSubs = rep.filter(d => d.isNew);
  if (newSubs.length) items.push({ tone: 'info', text: `New repeating charge${newSubs.length > 1 ? 's' : ''}: ${newSubs.slice(0, 2).map(d => `${d.payee} (${money(d.monthly)}/mo)`).join(', ')}`, go: '#/cashflow' });
  const untracked = rep.filter(d => d.fromCash && !d.tracked);
  if (untracked.length) items.push({ tone: 'info', text: `${untracked.length} bill${untracked.length > 1 ? 's' : ''} paid from checking ${untracked.length > 1 ? 'aren’t' : 'isn’t'} in your forecast`, go: '#/cashflow' });
  const unrec = activeAccounts().filter(a => a.ledger && (!a.reconciledThrough || daysBetween(a.reconciledThrough, today()) > 45) && txByAccount(a.id).length);
  if (unrec.length) items.push({ tone: 'info', text: `${unrec.length} account${unrec.length > 1 ? 's haven’t' : ' hasn’t'} been reconciled in over 45 days`, go: '#/accounts' });
  return items;
}
function concentration() {
  const inv = state.holdings.filter(h => h.assetClass !== 'Cash' && !/fund|index|etf|portfolio|trust/i.test(h.name || ''));
  const total = sum(activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private').map(accountValue));
  if (!total) return null;
  const top = inv.map(h => ({ symbol: h.symbol, share: holdingValue(h) / total })).sort((a, b) => b.share - a.share)[0];
  return top && top.share >= 0.1 ? top : null;
}
