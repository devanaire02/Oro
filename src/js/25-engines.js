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
/* More widely held index funds and ETFs. Expense ratios change now and then, so these are approximate starting points:
   a figure you type in a holding always wins. */
Object.assign(KNOWN_ER, {
  // Vanguard ETFs
  VT: 0.06, VV: 0.04, MGK: 0.07, MGC: 0.06, VBR: 0.07, VBK: 0.07, VOE: 0.07, VOT: 0.07, VXF: 0.05, VEU: 0.07, VSS: 0.07, VGK: 0.06, VPL: 0.07, VNQI: 0.12,
  VTEB: 0.03, VCIT: 0.03, VCSH: 0.03, VCLT: 0.03, VGIT: 0.03, VGSH: 0.03, VGLT: 0.03, VTIP: 0.03, BSV: 0.03, BIV: 0.03, BLV: 0.03, VMBS: 0.03, VTC: 0.03,
  VHT: 0.09, VFH: 0.09, VDE: 0.09, VIS: 0.09, VCR: 0.09, VDC: 0.09, VPU: 0.09, VAW: 0.09, VOX: 0.09, VONG: 0.07, VONV: 0.07, VONE: 0.07, VTHR: 0.07,
  VOOG: 0.07, VOOV: 0.07, VIOO: 0.07, VYMI: 0.17, VIGI: 0.10, ESGV: 0.09, VWOB: 0.15, VUSB: 0.10,
  // Vanguard mutual funds (Admiral and target-date)
  VTSAX: 0.04, VFIAX: 0.04, VTIAX: 0.09, VBTLX: 0.04, VTABX: 0.10, VGSLX: 0.13, VIMAX: 0.05, VSMAX: 0.05, VWENX: 0.17, VWELX: 0.25, VWIAX: 0.15, VWINX: 0.22,
  VTWAX: 0.10, VBIAX: 0.07, VTMFX: 0.09, VWIUX: 0.09, VDADX: 0.08, VEXAX: 0.05, VEMAX: 0.13, VTMGX: 0.05, VGSTX: 0.17, VSIAX: 0.07, VIGAX: 0.05, VVIAX: 0.05,
  VTINX: 0.08, VTXVX: 0.08, VTWNX: 0.08, VTTVX: 0.08, VTHRX: 0.08, VTTHX: 0.08, VFORX: 0.08, VTIVX: 0.08, VFIFX: 0.08, VFFVX: 0.08, VTTSX: 0.08, VLXVX: 0.08, VSVNX: 0.08,
  // Schwab
  SCHA: 0.04, SCHM: 0.04, SCHG: 0.04, SCHV: 0.04, SCHE: 0.11, SCHC: 0.11, SCHH: 0.07, SCHP: 0.03, SCHR: 0.03, SCHO: 0.03, SCHQ: 0.03, SCHI: 0.03, SCHJ: 0.03,
  SCHY: 0.08, SCHK: 0.03, SWPPX: 0.02, SWTSX: 0.03, SWISX: 0.06, SWAGX: 0.04, SWLGX: 0.035, SWMCX: 0.04, SWSSX: 0.04,
  // iShares
  IJH: 0.05, IJR: 0.06, IWF: 0.19, IWD: 0.19, IWB: 0.15, IWV: 0.20, IWR: 0.18, IWO: 0.24, IWN: 0.24, IUSB: 0.06, IUSG: 0.04, IUSV: 0.04, EFA: 0.35, EEM: 0.70, ACWI: 0.32,
  MUB: 0.05, TIP: 0.18, SHY: 0.15, IEF: 0.15, LQD: 0.14, HYG: 0.49, USMV: 0.15, MTUM: 0.15, QUAL: 0.15, IVW: 0.18, IVE: 0.18, IGSB: 0.04, IGIB: 0.04,
  GOVT: 0.05, SHV: 0.15, ETHA: 0.25, DGRO: 0.08, HDV: 0.08, SOXX: 0.35, EFV: 0.33, IDEV: 0.04, ISTB: 0.06, IMTB: 0.06, USRT: 0.08, REET: 0.14,
  // SPDR (State Street)
  SPLG: 0.02, SPTM: 0.03, SPDW: 0.03, SPEM: 0.07, SPAB: 0.03, SPYG: 0.04, SPYV: 0.04, SPSM: 0.03, SPMD: 0.03, SPTL: 0.03, SPTI: 0.03, SPTS: 0.03, SPIB: 0.04,
  XLF: 0.08, XLE: 0.08, XLV: 0.08, XLY: 0.08, XLP: 0.08, XLI: 0.08, XLU: 0.08, XLB: 0.08, XLRE: 0.08, XLC: 0.08, MDY: 0.23, GLDM: 0.10, SDY: 0.35,
  // Invesco and others
  RSP: 0.20, SPLV: 0.25, JEPI: 0.35, JEPQ: 0.35, DGRW: 0.28, NOBL: 0.35, COWZ: 0.49, AVUV: 0.25, AVDV: 0.36, AVEM: 0.33, AVUS: 0.15, DFAC: 0.17,
  // Fidelity ETFs and index mutual funds
  FBND: 0.36, FTEC: 0.084, FHLC: 0.084, FENY: 0.084, FDIS: 0.084, FNCL: 0.084, FSTA: 0.084, FIDU: 0.084, FUTY: 0.084, FMAT: 0.084, FREL: 0.084, FCOM: 0.084,
  ONEQ: 0.21, FBCG: 0.59, FETH: 0.25, FDVV: 0.15, FELC: 0.18,
  FNILX: 0, FZIPX: 0, FSMDX: 0.025, FSSNX: 0.025, FSPGX: 0.035, FLCOX: 0.035, FPADX: 0.075, FUAMX: 0.03, FNSOX: 0.03, FSRNX: 0.07, FIPDX: 0.05, FSGGX: 0.055, FSEVX: 0.035,
});
function expenseRatioOf(h) { const er = h.er ?? KNOWN_ER[String(h.symbol || '').toUpperCase()]; return er == null || er === '' ? null : Number(er); }

/* What kind of holding this is, for fees: only funds carry an expense ratio. Individual stocks and bonds don't, coins
   don't, and a money market's yield is already after its fee. You can say otherwise in the holding (h.fund). */
const MMF = /^(SPAXX|FDRXX|FZFXX|FCASH|SWVXX|SNVXX|SNSXX|VMFXX|VMRXX|VUSXX|SPRXX|FZDXX|FDLXX|TTTXX|CORE|CASH|MMDA)/;
const FUND_NAME = /\b(ETF|ETN|FUNDS?|FD|INDEX|IDX|PORTFOLIO|PORTF?|ISHARES|SPDR|ADMIRAL|ADM|INSTL?|INSTITUTIONAL|INVESTOR CL|TARGET (DATE|RETIREMENT)|FREEDOM|SELECT SECTOR|UNIT INVESTMENT|TR SER|TRUST SER|INTERVAL|CLOSED[- ]END|POWERSHARES|INVESCO|VANGUARD|SCHWAB|PROSHARES|DIREXION|WISDOMTREE|GLOBAL X|FIRST TRUST|ARK )\b/i;
function holdingKind(h) {
  const a = acctById(h.accountId), s = String(h.symbol || '').toUpperCase();
  if (h.assetClass === 'Cash' || MMF.test(s) || /MONEY MARKET|CASH RESERVE|GOVT? CASH|SWEEP|CORE POSITION/i.test(h.name || '')) return 'cash';
  if (a?.type === 'crypto') return 'coin';
  if (h.private) return 'private';
  if (h.fund === false) return 'stock';             // you said it isn't a fund
  if (h.fund === true || (h.er != null && h.er !== '')) return 'fund';
  if (KNOWN_ER[s] != null || /^[A-Z]{4}X$/.test(s) || FUND_NAME.test(h.name || '')) return 'fund';
  return h.name ? 'stock' : 'unknown';              // a named holding that doesn't look like a fund: a stock, bond or CD
}
function feeAnalysis(accts) {
  const ids = accts ? new Set(accts.map(a => a.id)) : null;
  const hs = state.holdings.filter(h => !ids || ids.has(h.accountId));
  const by = { fund: [], stock: [], coin: [], cash: [], private: [], unknown: [] };
  for (const h of hs) by[holdingKind(h)].push(h);
  const known = by.fund.filter(h => expenseRatioOf(h) != null), missingH = [...by.fund.filter(h => expenseRatioOf(h) == null), ...by.unknown];
  const value = sum(known.map(holdingValue)), fees = sum(known.map(h => holdingValue(h) * expenseRatioOf(h) / 100));
  const missingValue = sum(missingH.map(holdingValue)), stockValue = sum(by.stock.map(holdingValue)), coinValue = sum(by.coin.map(holdingValue));
  const cashValue = sum(by.cash.map(holdingValue));
  // the same fund in several accounts is one fund to ask about
  const missing = Object.values(missingH.reduce((m, h) => { const k = h.symbol.toUpperCase(); (m[k] ||= { symbol: k, name: h.name, value: 0, holdings: [] }).value += holdingValue(h); m[k].holdings.push(h); return m; }, {})).sort((a, b) => b.value - a.value);
  const invAccts = (accts || activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest')).filter(a => +a.advisoryFee > 0);
  const advisory = sum(invAccts.map(a => accountValue(a) * a.advisoryFee / 100));
  const invested = value + missingValue + stockValue + coinValue;                 // what fees are charged against (cash aside)
  const allIn = invested ? (fees + advisory) / invested * 100 : 0;
  const g = 0.06, yrs = 20;
  const drag = invested * (Math.pow(1 + g, yrs) - Math.pow(1 + g - allIn / 100, yrs));
  const top = known.map(h => ({ h, er: expenseRatioOf(h), fee: holdingValue(h) * expenseRatioOf(h) / 100 })).sort((a, b) => b.fee - a.fee);
  return {
    value, fees: round2(fees), weighted: value ? fees / value * 100 : 0, advisory: round2(advisory), advisoryAccts: invAccts.length, allIn, invested, drag: round2(drag),
    coverage: value + missingValue ? value / (value + missingValue) : 1, top, missing, stockValue, coinValue, cashValue, nStocks: by.stock.length,
    unknown: missingH,   // older callers
  };
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
