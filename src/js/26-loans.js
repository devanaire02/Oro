/* ================= Mortgages and loans: payments and amortization =================
   A tracked loan starts from the balance on a statement (the account's balance and "as of" date). Every payment
   after that date that matches the loan's payee text is split the way a servicer would: this month's interest on
   the balance, then escrow, then principal (anything above the regular payment is extra principal).
   Entering a new statement balance moves the starting point, so a drift is corrected by one edit. */
const LOAN_TYPES = new Set(['mortgage', 'loan']);
const isTrackedLoan = a => !!a && LOAN_TYPES.has(a.type) && !a.ledger && !!a.amort?.track && !!String(a.amort.match || '').trim();

/* Monthly principal and interest: what you entered, or what the original terms imply. */
function loanPI(a) {
  const pi = Number(a.minPayment);
  if (pi > 0) return round2(pi);
  const am = a.amort || {}, L = Number(am.original), n = Math.round((Number(am.termYears) || 0) * 12), r = (Number(a.rate) || 0) / 1200;
  if (L > 0 && n > 0) return round2(r ? L * r / (1 - Math.pow(1 + r, -n)) : L / n);
  return 0;
}
function loanMatches(a, t, match = a.amort?.match) {
  const m = String(match || '').trim().toLowerCase();
  if (!m || t.accountId === a.id || !(t.amount < 0)) return false;
  return String(t.payee || '').toLowerCase().includes(m) || String(t.rawPayee || '').toLowerCase().includes(m);
}

/* The balance now, and how each payment since the statement was applied. */
function loanTrack(a) {
  return memo('loan:' + a.id, () => {
    const am = a.amort || {}, r = (Number(a.rate) || 0) / 1200, pi = loanPI(a), escrow = Math.max(0, Number(am.escrow) || 0);
    const from = a.balanceDate || '0000-00-00', anchor = round2(Math.abs(Number(a.balance) || 0));
    const regular = pi ? pi + escrow : 0;
    let bal = anchor;
    const applied = [];
    if (isTrackedLoan(a)) {
      const pays = state.transactions.filter(t => t.date > from && loanMatches(a, t)).sort((x, y) => x.date.localeCompare(y.date) || (x.amount - y.amount));
      for (const t of pays) {
        const A = round2(-t.amount);
        const installment = !regular || A >= regular * 0.9;            // a regular monthly payment (anything smaller is extra principal)
        const interest = installment && bal > 0 ? round2(bal * r) : 0;
        const esc = installment ? round2(Math.min(escrow, Math.max(0, A - interest))) : 0;
        const principal = round2(Math.max(0, Math.min(bal, A - interest - esc)));
        const extra = installment && pi ? round2(Math.max(0, principal - Math.max(0, pi - interest))) : (installment ? 0 : principal);
        bal = round2(bal - principal);
        applied.push({ id: t.id, date: t.date, payee: t.payee, amount: A, interest, escrow: esc, principal, extra, balance: bal });
      }
    }
    const last = applied.length ? applied[applied.length - 1].date : from;
    return { anchor, from, balance: bal, applied, pi, escrow, rate: Number(a.rate) || 0, last, tracked: isTrackedLoan(a) };
  });
}

/* A tax year's interest: what the payments Ọrọ̀ followed that year paid, plus an estimate for the year's other months
   from the schedule (worked back from the statement balance for months before it, forward from the last payment for
   months after). The estimate needs the rate and the monthly payment; a typed Form 1098 figure always wins over this. */
function loanInterestForYear(a, year) {
  return memo(`loanint:${a.id}:${year}`, () => {
    const L = loanTrack(a), r = (Number(a.rate) || 0) / 1200, pi = loanPI(a), Y = String(year), first = `${Y}-01`, last = `${Y}-12`;
    const inst = L.applied.filter(p => p.date.startsWith(Y) && p.interest > 0);
    const covered = new Set(inst.map(p => p.date.slice(0, 7)));
    const followed = round2(sum(inst.map(p => p.interest)));
    let before = 0, beforeN = 0, ahead = 0, aheadN = 0;
    const canEstimate = r > 0 && pi > L.anchor * r && !!a.balanceDate;
    if (canEstimate) {
      const am = a.amort || {}, orig = Number(am.original) || 0, firstPay = am.firstPayment ? am.firstPayment.slice(0, 7) : '';
      // The statement balance is taken as after that month's payment, unless a followed payment falls in that month.
      const stmtM = a.balanceDate.slice(0, 7);
      let m = L.applied.some(p => p.date.startsWith(stmtM) && p.interest > 0) ? addMonths(stmtM, -1) : stmtM, bal = L.anchor;
      for (let i = 0; i < 48 && m >= first; i++) {
        const prev = (bal + pi) / (1 + r);
        if ((orig && prev > orig * 1.001) || (firstPay && m < firstPay)) break;
        if (m <= last && !covered.has(m)) { before += prev * r; beforeN++; }
        bal = prev; m = addMonths(m, -1);
      }
      const lastM = L.applied.length ? L.last.slice(0, 7) : stmtM;
      if (lastM < last) {
        const proj = loanProjection(a, L.balance, addMonths(lastM, 1));
        for (const row of proj?.rows || []) { if (row.m > last) break; if (row.m >= first && !covered.has(row.m)) { ahead += row.interest; aheadN++; } }
      }
    }
    const estimated = round2(before + ahead);
    return { total: round2(followed + estimated), followed, followedN: inst.length, estimated, estimatedN: beforeN + aheadN, months: inst.length + beforeN + aheadN, canEstimate };
  });
}

/* Month-by-month from `bal`, starting with the payment due in `startMonth`, with optional extra principal each month. */
function loanProjection(a, bal, startMonth, extra = 0) {
  const r = (Number(a.rate) || 0) / 1200, pi = loanPI(a);
  if (!pi || !(bal > 0.005)) return null;
  if (pi + extra <= bal * r + 0.005) return { never: true };
  const rows = [];
  let m = startMonth, interest = 0;
  while (bal > 0.005 && rows.length < 720) {
    const i = round2(bal * r), p = round2(Math.min(bal, pi + extra - i));
    bal = round2(bal - p); interest += i;
    rows.push({ m, interest: i, principal: p, balance: bal });
    m = addMonths(m, 1);
  }
  return { rows, months: rows.length, payoff: rows[rows.length - 1].m, interest: round2(interest) };
}

/* Where the original terms say the balance should be by now (needs original amount, first payment and term). */
function loanOriginalNow(a, asOf = today()) {
  const am = a.amort || {}, L = Number(am.original), n = Math.round((Number(am.termYears) || 0) * 12), first = am.firstPayment;
  if (!(L > 0) || !n || !first) return null;
  const r = (Number(a.rate) || 0) / 1200;
  const P = r ? L * r / (1 - Math.pow(1 + r, -n)) : L / n;
  let k = monthsBetween(first.slice(0, 7), asOf.slice(0, 7)) + (asOf.slice(8) >= first.slice(8) ? 1 : 0);
  k = clamp(k, 0, n);
  const g = Math.pow(1 + r, k);
  const owed = r ? L * g - P * (g - 1) / r : L - P * k;
  return { owed: round2(Math.max(0, owed)), paymentsMade: k, payoff: addMonths(first.slice(0, 7), n - 1), payment: round2(P) };
}

/* Payees that look like loan payments, to pick from when setting up tracking. */
function loanPaymentCandidates(a) {
  const re = /mortgage|mtg|home ?loan|\bloans?\b|lending|servicing|escrow|heloc/i;
  const groups = new Map();
  for (const t of state.transactions) {
    if (!(t.amount < 0) || t.accountId === a.id) continue;
    const c = catById(t.categoryId);
    if (!(re.test(t.payee || '') || re.test(t.rawPayee || '') || (c && re.test(c.name)))) continue;
    const key = String(t.payee || '').trim(); if (!key) continue;
    const g = groups.get(key) || { payee: key, n: 0, last: '', amount: 0 };
    g.n++; if (t.date > g.last) { g.last = t.date; g.amount = round2(-t.amount); }
    groups.set(key, g);
  }
  return [...groups.values()].sort((x, y) => y.n - x.n || y.last.localeCompare(x.last)).slice(0, 8);
}
