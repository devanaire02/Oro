/* ================= Taxes on pay: what you keep, the average and top rates =================
   Ọrọ̀'s own estimate of a year's federal income tax, Illinois income tax, and Social Security and Medicare, from the
   year's published tables, so the average (effective) rate can be set beside the top (marginal) rate and the tax that
   saving before tax avoided can be shown. Actual taxes typed from W-2s or the return replace the estimate.
   Organized for the CPA; not tax advice. Not modeled: capital gains and qualified dividend rates, self-employment
   tax, the 65-and-older deductions, tips and overtime, AMT, other credits.
   Sources: IRS Rev. Proc. 2024-40 with the One Big Beautiful Bill Act's 2025 changes (standard deduction, child tax
   credit, SALT cap); IRS Rev. Proc. 2025-32 (2026); SSA wage base; Illinois Department of Revenue and Comptroller. */
const TAX_TABLES = {
  2025: {
    brackets: {
      mfj: [[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [Infinity, 0.37]],
      single: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [Infinity, 0.37]],
      hoh: [[17000, 0.10], [64850, 0.12], [103350, 0.22], [197300, 0.24], [250500, 0.32], [626350, 0.35], [Infinity, 0.37]],
      mfs: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [375800, 0.35], [Infinity, 0.37]],
    },
    std: { mfj: 31500, single: 15750, hoh: 23625, mfs: 15750 },
    ctc: 2200, ctcRefund: 1700, ssBase: 176100, saltCap: 40000, saltPhase: 500000, ilExempt: 2850,
  },
  2026: {
    brackets: {
      mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
      single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
      hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
      mfs: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]],
    },
    std: { mfj: 32200, single: 16100, hoh: 24150, mfs: 16100 },
    ctc: 2200, ctcRefund: 1700, ssBase: 184500, saltCap: 40400, saltPhase: 505000, ilExempt: 2925,
  },
};
const FILING = { mfj: 'Married filing jointly', single: 'Single', hoh: 'Head of household', mfs: 'Married filing separately' };
const IL_RATE = 0.0495;

/* The tables for a year; a year Ọrọ̀ doesn't have uses the nearest one (and says so). */
function taxTables(year) {
  const ys = Object.keys(TAX_TABLES).map(Number);
  const y = ys.includes(year) ? year : year > Math.max(...ys) ? Math.max(...ys) : Math.min(...ys);
  return { T: TAX_TABLES[y], tableYear: y };
}
function bracketTax(income, brackets) {
  let tax = 0, lo = 0;
  const rows = [];
  for (const [hi, rate] of brackets) {
    if (income <= lo) break;
    const part = Math.min(income, hi) - lo;
    tax += part * rate; rows.push({ rate, from: lo, to: Math.min(income, hi), amount: part, tax: part * rate });
    lo = hi;
  }
  return { tax, rows };
}
const topBracket = (income, brackets) => (brackets.find(([hi]) => income < hi) || brackets[brackets.length - 1])[1];

/* Who earns pay: the adults in Settings › Household. */
const taxEarners = () => people().filter(m => roleOf(m.id) === 'adult');
/* What's typed for a year (Taxes page), with the defaults filled in. */
function taxHousehold(year) {
  const H = state.tax?.household?.[year] || {};
  const kids = members().filter(m => roleOf(m.id) === 'kid').length;
  const n = v => (v === '' || v == null || !isFinite(+v) ? null : +v);
  return {
    status: FILING[H.status] ? H.status : taxEarners().length >= 2 ? 'mfj' : 'single',
    people: Object.fromEntries(taxEarners().map(m => { const p = H.people?.[m.id] || {}; return [m.id, { gross: n(p.gross), retire: n(p.retire), health: n(p.health) }]; })),
    other: n(H.other), deps: n(H.deps) ?? kids, kids: n(H.kids) ?? kids, propertyTax: n(H.propertyTax),
    actual: { federal: n(H.actual?.federal), state: n(H.actual?.state), fica: n(H.actual?.fica) },
    entered: taxEarners().some(m => n(H.people?.[m.id]?.gross) > 0),
  };
}

/* Home mortgages for Schedule A: mortgages owned inside your estate and not on a rental. Each is keyed by its property
   (or the loan itself when it isn't linked to one), which is where a typed Form 1098 figure is kept. */
function homeLoansForTax() {
  const props = activeAccounts().filter(a => a.type === 'realestate');
  return activeAccounts().filter(a => a.type === 'mortgage' && acctInEstate(a)).map(loan => {
    const prop = props.find(p => p.mortgageId === loan.id);
    return prop?.rental ? null : { loan, prop, key: prop ? prop.id : loan.id };
  }).filter(Boolean);
}
/* The mortgage interest for a property or loan: a typed 1098 figure, or else the schedule's. */
function mortgageInterestFor(key, loan, year) {
  const typed = Number(state.tax?.[key]?.[year]?.interest);
  const est = loan ? loanInterestForYear(loan, year) : null;
  if (isFinite(typed) && typed > 0) return { amount: round2(typed), from: '1098', est };
  if (est && est.total > 0) return { amount: est.total, from: 'schedule', est };
  return { amount: 0, from: null, est };
}

/* Schedule A: itemized deductions, to set against the standard deduction. */
function scheduleA(year, agi, stateTax, H, T, tableYear) {
  const by = deductionSummary(year).by, st = H.status, half = st === 'mfs' ? 0.5 : 1;
  const medicalPaid = round2(by['Medical'] || 0), medical = round2(Math.max(0, medicalPaid - 0.075 * agi));
  const propertyTax = H.propertyTax != null ? H.propertyTax : round2(by['State and local taxes'] || 0);
  const saltCap = Math.max(10000 * half, T.saltCap * half - 0.3 * Math.max(0, agi - T.saltPhase * half));
  const saltPaid = round2(stateTax + propertyTax), salt = round2(Math.min(saltCap, saltPaid));
  const loans = homeLoansForTax().map(x => ({ ...x, ...mortgageInterestFor(x.key, x.loan, year) }));
  const interest = round2(sum(loans.map(x => x.amount)));
  const charityPaid = round2(by['Charitable'] || 0), charity = round2(tableYear >= 2026 ? Math.max(0, charityPaid - 0.005 * agi) : charityPaid);
  return { medicalPaid, medical, propertyTax, saltPaid, saltCap: round2(saltCap), salt, loans, interest, charityPaid, charity, total: round2(medical + salt + interest + charity) };
}

/* The estimate. `over` replaces typed values (used to see what the year would have cost without saving before tax). */
function taxEstimate(year, over = {}) {
  const H = { ...taxHousehold(year), ...over }, { T, tableYear } = taxTables(year), st = H.status;
  const earners = taxEarners().map(m => { const p = H.people[m.id] || {}; return { id: m.id, name: m.name, gross: p.gross || 0, retire: p.retire || 0, health: p.health || 0 }; });
  const gross = round2(sum(earners.map(e => e.gross))), retire = round2(sum(earners.map(e => e.retire))), health = round2(sum(earners.map(e => e.health)));
  const other = H.other || 0, income = round2(gross + other), pretax = round2(retire + health);
  const agi = round2(Math.max(0, gross - pretax + other));
  // Illinois: a flat rate on income after the personal exemptions (none above $500,000 joint, $250,000 otherwise)
  const ilPeople = (st === 'mfj' ? 2 : 1) + (H.deps || 0);
  const ilExempt = agi > (st === 'mfj' ? 500000 : 250000) ? 0 : ilPeople * T.ilExempt;
  const ilEst = round2(Math.max(0, agi - ilExempt) * IL_RATE);
  const stateTax = H.actual.state ?? ilEst;
  // Federal: the larger of the standard deduction and itemizing; from 2026, gifts to charity count a little either way
  const A = scheduleA(year, agi, stateTax, H, T, tableYear), std = T.std[st];
  const itemize = A.total > std, deduction = itemize ? A.total : std;
  const charityStd = !itemize && tableYear >= 2026 ? Math.min(A.charityPaid, st === 'mfj' ? 2000 : 1000) : 0;
  const taxable = round2(Math.max(0, agi - deduction - charityStd));
  const B = bracketTax(taxable, T.brackets[st]);
  const ctcStart = st === 'mfj' ? 400000 : 200000;
  const ctcFull = (H.kids || 0) * T.ctc, ctc = Math.max(0, ctcFull - 50 * Math.ceil(Math.max(0, agi - ctcStart) / 1000));
  const ctcUsed = Math.min(ctc, B.tax), refund = Math.min(ctc - ctcUsed, (H.kids || 0) * T.ctcRefund, Math.max(0, 0.15 * (gross - 2500)));
  const fedEst = round2(B.tax - ctcUsed - refund);
  // Social Security (up to the wage base, per person) and Medicare (plus 0.9% above $250,000 joint, $200,000 single)
  const addlAt = st === 'mfj' ? 250000 : st === 'mfs' ? 125000 : 200000;
  const ficaWages = earners.map(e => Math.max(0, e.gross - e.health)), allWages = sum(ficaWages);
  const ss = sum(ficaWages.map(w => 0.062 * Math.min(w, T.ssBase))), medicare = 0.0145 * allWages + 0.009 * Math.max(0, allWages - addlAt);
  const ficaEst = round2(ss + medicare);
  const federal = H.actual.federal ?? fedEst, fica = H.actual.fica ?? ficaEst;
  const taxes = round2(federal + stateTax + fica), kept = round2(income - pretax - taxes);
  // The top rate on another dollar of pay (the highest earner's): bracket, plus the credit and SALT phase-outs where they apply
  const top = earners.slice().sort((a, b) => b.gross - a.gross)[0];
  let fedTop = taxable > 0 ? topBracket(taxable, T.brackets[st]) : 0;
  const ctcPhase = ctcFull > 0 && agi > ctcStart && ctc > 0;
  if (ctcPhase) fedTop += 0.05;
  const saltPhase = itemize && agi > T.saltPhase * (st === 'mfs' ? 0.5 : 1) && A.saltCap > 10000 * (st === 'mfs' ? 0.5 : 1) && A.saltPaid > A.saltCap;
  if (saltPhase) fedTop += 0.3 * topBracket(taxable, T.brackets[st]);
  const ficaTop = top ? (Math.max(0, top.gross - top.health) < T.ssBase ? 0.062 : 0) + 0.0145 + (allWages > addlAt ? 0.009 : 0) : 0;
  const ilTop = agi > ilExempt ? IL_RATE : 0;
  return {
    year, tableYear, status: st, H, earners, gross, retire, health, pretax, other, income, agi, A, std, itemize, deduction, charityStd, taxable,
    brackets: B.rows, regular: round2(B.tax), ctc: round2(ctcUsed + refund), fedEst, ilEst, ficaEst, ss: round2(ss), medicare: round2(medicare),
    federal: round2(federal), state: round2(stateTax), fica: round2(fica), taxes, kept,
    average: income > 0 ? taxes / income : 0, averageIncomeTax: income > 0 ? (federal + stateTax) / income : 0,
    top: { federal: fedTop, state: ilTop, fica: ficaTop, all: fedTop + ilTop + ficaTop, who: top?.name || '', ctcPhase, saltPhase },
    actual: H.actual,
  };
}

/* What saving before tax was worth this year: the same year worked out without it. */
function taxSavedByPretax(year) {
  const E = taxEstimate(year);
  if (!(E.pretax > 0)) return 0;
  const none = Object.fromEntries(Object.entries(E.H.people).map(([id, p]) => [id, { ...p, retire: 0, health: 0 }]));
  const W = taxEstimate(year, { people: none, actual: { federal: null, state: null, fica: null } });
  const Est = taxEstimate(year, { actual: { federal: null, state: null, fica: null } });
  return round2(W.taxes - Est.taxes);
}

/* Paychecks that came into your accounts that year (Money in, in categories named for pay). */
function paychecksIn(year) {
  const isPay = c => c && c.kind === 'income' && !c.rental && /pay|salary|wage|bonus/i.test(c.name);
  let total = 0;
  for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) for (const l of txLines(t)) if (l.amount > 0 && isPay(catById(l.categoryId))) total += l.amount;
  return round2(total);
}
