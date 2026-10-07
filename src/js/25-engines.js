/* ================= planning, tax and analytics engines ================= */

/* ---------- capital market assumptions → portfolio return and volatility ---------- */
function cma() { return Object.assign({}, DEFAULT_CMA, state.plan.cma || {}); }
function portfolioStats(alloc) {
  const total = sum(Object.values(alloc));
  if (!total) return { mean: 0.06, sd: 0.12, weights: {} };
  const C = cma(), w = {};
  for (const [k, v] of Object.entries(alloc)) w[k] = v / total;
  let mean = 0, varSum = 0;
  const keys = Object.keys(w), rho = 0.6;
  for (const k of keys) mean += w[k] * (C[k] || C.Unclassified)[0] / 100;
  for (const i of keys) for (const j of keys) {
    const si = (C[i] || C.Unclassified)[1] / 100, sj = (C[j] || C.Unclassified)[1] / 100;
    const r = i === j ? 1 : (i === 'Cash' || j === 'Cash') ? 0 : rho;
    varSum += w[i] * w[j] * si * sj * r;
  }
  return { mean, sd: Math.sqrt(varSum), weights: w };
}

/* ---------- defaults the planner derives from your data ---------- */
function planDefaults() {
  const p = state.plan;
  const mk = thisMonth();
  const from = `${addMonths(mk, -12)}-01`, to = monthEnd(addMonths(mk, -1));
  const txs = txInRange(from, to);
  let spend = 0, rentalNet = 0;
  for (const t of txs) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (!c || c.kind === 'transfer') continue;
    if (c.rental) { rentalNet += l.amount; continue; }
    if (c.kind === 'expense') spend += -l.amount;
  }
  const f = flowSummary(txs);
  const months = Math.max(1, Math.min(12, monthsBetween(firstTxMonth() === '9999' ? mk : firstTxMonth(), mk)));
  const scale = 12 / months;
  const alloc = investableAllocation(p.includePrivate);
  const start = sum(Object.values(alloc)) + totals().cash;
  return {
    start: round2(start),
    savings: round2(Math.max(0, f.net) * scale),
    spending: round2(spend * scale),
    rentalNet: p.includeRental ? round2(rentalNet * scale) : 0,
    alloc: { ...alloc, Cash: (alloc.Cash || 0) + totals().cash },
  };
}

/* ---------- Monte Carlo retirement simulation (annual steps, today's dollars) ---------- */
function runRetirement(inputs, opts = {}) {
  const { age, retireAge, endAge, start, savings, spending, otherIncome, otherIncomeAge, rentalNet, inflation, mean, sd } = inputs;
  const sims = opts.sims || 2000, years = Math.max(1, endAge - age);
  const infl = inflation / 100;
  const sigma2 = Math.log(1 + (sd * sd) / ((1 + mean) ** 2)), mu = Math.log(1 + mean) - sigma2 / 2, sig = Math.sqrt(sigma2);
  const r = rng(opts.seed || 20261006);
  const paths = Array.from({ length: years + 1 }, () => new Float64Array(sims));
  let success = 0, depletedAges = [];
  for (let s = 0; s < sims; s++) {
    let v = start, failed = false;
    paths[0][s] = v;
    for (let y = 1; y <= years; y++) {
      const a = age + y - 1;
      const nominal = Math.exp(mu + sig * randn(r)) - 1;
      const real = (1 + nominal) / (1 + infl) - 1;
      v *= 1 + real;
      if (a < retireAge) v += savings;
      else {
        const inc = (a >= otherIncomeAge ? otherIncome : 0) + rentalNet;
        v -= Math.max(0, spending - inc);
      }
      if (v <= 0 && !failed) { failed = true; depletedAges.push(age + y); v = 0; }
      paths[y][s] = v;
    }
    if (!failed) success++;
  }
  const pcts = [0.1, 0.25, 0.5, 0.75, 0.9];
  const bands = paths.map(col => { const arr = Array.from(col).sort((a, b) => a - b); return pcts.map(q => quantile(arr, q)); });
  depletedAges.sort((a, b) => a - b);
  return { success: success / sims, bands, years, depletedMedianAge: depletedAges.length ? quantile(depletedAges, 0.5) : null };
}
/* Highest retirement spending (today's $) that still clears the target success rate. */
function safeSpending(inputs, target = 0.9) {
  let lo = 0, hi = Math.max(20000, inputs.spending * 2, inputs.start * 0.08);
  for (let k = 0; k < 8 && runRetirement({ ...inputs, spending: hi }, { sims: 400, seed: 7 }).success >= target; k++) { lo = hi; hi *= 2; }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const r = runRetirement({ ...inputs, spending: mid }, { sims: 600, seed: 7 });
    if (r.success >= target) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 100) * 100;
}
/* Earliest retirement age that clears the target, holding spending fixed. */
function earliestRetirement(inputs, target = 0.9) {
  for (let a = Math.max(inputs.age, 35); a <= Math.min(inputs.endAge - 1, 80); a++) {
    if (runRetirement({ ...inputs, retireAge: a }, { sims: 600, seed: 11 }).success >= target) return a;
  }
  return null;
}

/* ---------- debt payoff (avalanche / snowball) ---------- */
function debtList() {
  return activeAccounts().filter(a => isLiability(a) && accountValue(a) > 0.5 && (state.plan.includeMortgages || a.type !== 'mortgage'))
    .map(a => ({ id: a.id, name: a.name, balance: accountValue(a), rate: Number(a.rate) || 0, min: Number(a.minPayment) || Math.max(25, accountValue(a) * 0.02) }));
}
function payoffPlan(debts, extra, method) {
  const ds = debts.map(d => ({ ...d, bal: d.balance, paidMonth: null, interest: 0 }));
  const budget = sum(ds.map(d => d.min)) + (Number(extra) || 0);
  let month = 0, totalInterest = 0;
  const series = [{ m: 0, y: sum(ds.map(d => d.bal)) }];
  while (ds.some(d => d.bal > 0.005) && month < 600) {
    month++;
    for (const d of ds) if (d.bal > 0) { const i = d.bal * d.rate / 100 / 12; d.bal += i; d.interest += i; totalInterest += i; }
    let pool = budget;
    for (const d of ds) if (d.bal > 0) { const p = Math.min(d.min, d.bal); d.bal -= p; pool -= p; }
    const order = ds.filter(d => d.bal > 0.005).sort(method === 'snowball' ? (a, b) => a.bal - b.bal : (a, b) => b.rate - a.rate || a.bal - b.bal);
    for (const d of order) { if (pool <= 0) break; const p = Math.min(pool, d.bal); d.bal -= p; pool -= p; }
    for (const d of ds) if (d.bal <= 0.005 && d.paidMonth == null) { d.bal = 0; d.paidMonth = month; }
    series.push({ m: month, y: round2(sum(ds.map(d => d.bal))) });
  }
  return { months: month, interest: round2(totalInterest), debts: ds, series, monthly: round2(budget), capped: month >= 600 };
}

/* ---------- Schedule E (per rental property, per tax year) ---------- */
function depreciationFor(a, year) {
  const basis = Number(a.buildingBasis) || 0, pis = a.placedInService;
  if (!basis || !pis) return 0;
  const y0 = yearOf(pis), m0 = +pis.slice(5, 7);
  if (year < y0) return 0;
  const annual = basis / 27.5;
  const firstYear = annual * ((12 - m0 + 0.5) / 12);
  if (year === y0) return round2(firstYear);
  const taken = firstYear + annual * (year - y0 - 1);
  return round2(Math.max(0, Math.min(annual, basis - taken)));
}
function scheduleE(a, year) {
  const group = a.rentalGroup || 'Rental property';
  const lines = {}; let debtPaid = 0, unmapped = 0;
  for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (!c || c.group !== group) continue;
    if (c.rental === 'debt') { debtPaid += -l.amount; continue; }
    const line = c.schedE || (c.rental === 'income' ? '3' : c.rental === 'opex' ? '19' : null);
    if (!line) { unmapped += Math.abs(l.amount); continue; }
    lines[line] = (lines[line] || 0) + (line === '3' ? l.amount : -l.amount);
  }
  const interest = Number(state.tax?.[a.id]?.[year]?.interest);
  if (isFinite(interest) && interest > 0) lines['12'] = (lines['12'] || 0) + interest;
  const dep = depreciationFor(a, year);
  if (dep) lines['18'] = dep;
  for (const k in lines) lines[k] = round2(lines[k]);
  const expenses = round2(sum(Object.entries(lines).filter(([k]) => k !== '3').map(([, v]) => v)));
  return { lines, rents: lines['3'] || 0, expenses, net: round2((lines['3'] || 0) - expenses), debtPaid: round2(debtPaid), interestEntered: isFinite(interest) && interest > 0, unmapped: round2(unmapped) };
}
function deductionSummary(year) {
  const by = {}, tagged = [];
  for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) {
    for (const l of txLines(t)) { const c = catById(l.categoryId); if (c?.taxTag && c.kind === 'expense') by[c.taxTag] = (by[c.taxTag] || 0) + -l.amount; }
    if ((t.tags || []).some(x => /^(tax|deductible|tax-deductible)$/.test(x))) tagged.push(t);
  }
  return { by, tagged };
}

/* ---------- fund fees ---------- */
const KNOWN_ER = { VTI: 0.03, VOO: 0.03, VXUS: 0.05, BND: 0.03, BNDX: 0.07, VTSAX: 0.04, VFIAX: 0.04, VTIAX: 0.12, VBTLX: 0.04, VEA: 0.05, VWO: 0.08, VNQ: 0.13, VIG: 0.05, VYM: 0.06, SCHD: 0.06, SCHB: 0.03, SCHX: 0.03, SCHF: 0.06, SCHZ: 0.03, SPY: 0.0945, IVV: 0.03, ITOT: 0.03, IXUS: 0.07, AGG: 0.03, IEFA: 0.07, IEMG: 0.09, QQQ: 0.20, QQQM: 0.15, FXAIX: 0.015, FSKAX: 0.015, FTIHX: 0.06, FZROX: 0, FZILX: 0, FXNAX: 0.025, FSPSX: 0.035, SPAXX: 0.42, FDRXX: 0.37, VMFXX: 0.11, SWVXX: 0.34, ARKK: 0.75, GLD: 0.40, IAU: 0.25, IBIT: 0.25, FBTC: 0.25, TLT: 0.15, SGOV: 0.09, BIL: 0.1356, VGT: 0.09, XLK: 0.08, VUG: 0.04, VTV: 0.04, DIA: 0.16, IWM: 0.19, VB: 0.05, VO: 0.04 };
function expenseRatioOf(h) { const er = h.er ?? KNOWN_ER[String(h.symbol || '').toUpperCase()]; return er == null || er === '' ? null : Number(er); }
function feeAnalysis() {
  const hs = state.holdings.filter(h => !h.private);
  const known = hs.filter(h => expenseRatioOf(h) != null);
  const value = sum(known.map(holdingValue));
  const fees = sum(known.map(h => holdingValue(h) * expenseRatioOf(h) / 100));
  const weighted = value ? fees / value * 100 : 0;
  const total = sum(hs.map(holdingValue));
  const g = 0.06, yrs = 20;
  const drag = value * (Math.pow(1 + g, yrs) - Math.pow(1 + g - weighted / 100, yrs));
  const top = known.map(h => ({ h, er: expenseRatioOf(h), fee: holdingValue(h) * expenseRatioOf(h) / 100 })).sort((a, b) => b.fee - a.fee);
  return { value, fees: round2(fees), weighted, drag: round2(drag), coverage: total ? value / total : 0, top, unknown: hs.filter(h => expenseRatioOf(h) == null && h.assetClass !== 'Cash') };
}

/* ---------- report periods ---------- */
function periodRange(p, from, to) {
  const t = today(), mk = thisMonth(), y = t.slice(0, 4);
  switch (p) {
    case 'm': return { from: `${mk}-01`, to: t, label: monthLabel(mk) };
    case 'lm': { const l = addMonths(mk, -1); return { from: `${l}-01`, to: monthEnd(l), label: monthLabel(l) }; }
    case 'ytd': return { from: `${y}-01-01`, to: t, label: `${y} so far` };
    case 'ly': return { from: `${+y - 1}-01-01`, to: `${+y - 1}-12-31`, label: String(+y - 1) };
    case 'custom': if (from && to) return { from, to, label: `${dateLabel(from, true)} to ${dateLabel(to, true)}` };
    // falls through
    default: { const s = addMonths(mk, -12); return { from: `${s}-01`, to: monthEnd(addMonths(mk, -1)), label: 'Last 12 full months' }; }
  }
}
function monthsIn(from, to) { const out = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7) && out.length < 60; m = addMonths(m, 1)) out.push(m); return out; }

/* Sankey: income categories → total income → spending groups (+ saved, or drawn from savings). */
function sankeyData(from, to) {
  const acts = rangeActuals(from, to);
  const inc = [], groups = {};
  for (const [id, v] of Object.entries(acts)) {
    const c = catById(id);
    if (id === '_none') { if (v > 0) groups.Uncategorized = (groups.Uncategorized || 0) + v; else inc.push({ name: 'Uncategorized income', value: -v }); continue; }
    if (!c) continue;
    if (c.kind === 'income' && v > 0) inc.push({ name: c.name, value: v });
    else if (c.kind === 'expense' && v > 0) groups[c.group] = (groups[c.group] || 0) + v;
    else if (c.kind === 'expense' && v < 0) inc.push({ name: `${c.name} refunds`, value: -v });
  }
  const income = sum(inc.map(x => x.value)), spending = sum(Object.values(groups));
  const outs = Object.entries(groups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (income > spending) outs.push({ name: 'Saved', value: income - spending, saved: true });
  else if (spending > income) inc.push({ name: 'From savings', value: spending - income, drawn: true });
  inc.sort((a, b) => (a.drawn ? 1 : 0) - (b.drawn ? 1 : 0) || b.value - a.value);
  return { left: inc, right: outs, income, spending };
}
