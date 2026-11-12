/* ================= Pay stubs: from pay before tax to the paycheck, the year so far, and What if… =================
   A pay stub is kept as numbers and row labels only (state.paystubs): whose it is, the employer, the pay date and
   period, pay before tax, what was saved or paid before tax, the taxes taken out, anything else taken out, take-home pay
   and what the employer put in, each for this paycheck and year to date. Never the stub's text, a Social Security
   number or an account number (a deposit account is kept as "ending 1234" at most).
   From the stubs Ọrọ̀ works out: the path from pay before tax to take-home and the deposit it landed as; where the
   year stands and where it will end (the latest year-to-date plus the regular paychecks left); the likely tax bill or
   refund; and what was saved through pay, which never reaches the bank and so isn't in Money in or Kept.
   The limits used when projecting are in 28-tax.js (TAX_TABLES[year].save, with their IRS sources): Social Security
   stops at the wage base; 401(k), 403(b) and 457 deferrals (before tax and Roth together) stop at the year's limit, with
   the extra at 50 and at 60 to 63 once a birth year is given; an HSA (yours plus your employer's) stops at its limit.
   A what-if bonus counts the usual flat 22% federal withholding on bonuses (IRS Publication 15 (2026): "the withholding
   rate on supplemental wages remains 22%"; the 37% above $1 million in a year isn't modeled) and Illinois's 4.95%.
   Not modeled: a 457 plan's separate limit, an HSA limit for part of a year, the extra 0.9% Medicare withholding above
   $200,000 in what's projected as taken out, withholding rising after a 401(k) limit is reached, a payday moved across
   New Year's by a holiday, Social Security taken out twice by two employers. */
const STUB_PRE = { retire: '401(k), 403(b) or 457', hsa: 'HSA', fsa: 'FSA', premium: 'Health, dental or vision', other: 'Something else before tax' };
const STUB_TAX = { federal: 'Federal income tax', ss: 'Social Security', medicare: 'Medicare', state: 'Illinois income tax', other: 'Another tax' };
const STUB_POST = { roth: 'Roth 401(k)', stock: 'Stock or savings plan', life: 'Life or disability insurance', other: 'Something else' };
const STUB_ER = { retire: '401(k) match', hsa: 'HSA', other: 'Something else' };
const STUB_BLOCKS = { pre: STUB_PRE, tax: STUB_TAX, post: STUB_POST, er: STUB_ER };
const PAY_FREQS = ['weekly', 'biweekly', 'semimonthly', 'monthly'];   // labels in FREQS (10-store.js)
const STUB_LINES = ['gross', ...Object.entries(STUB_BLOCKS).flatMap(([b, kinds]) => Object.keys(kinds).map(k => `${b}.${k}`)), 'net'];
const BONUS_FED_WH = 0.22;

const stubsAll = () => state.paystubs || [];
const cents = n => Math.round((Number(n) || 0) * 100);
const stubById = id => stubsAll().find(s => s.id === id);
const stubNum = v => { if (v === '' || v == null) return null; const n = typeof v === 'number' ? v : parseAmount(String(v).replace(/\*+$/, '')); return isFinite(n) ? round2(Math.abs(n)) : null; };
/* One employer, however its name was typed: "ACME CORP, INC." and "Acme" are the same job (year-to-date is per employer,
   so two spellings must not be counted twice). */
const stubEmpKey = s => String(s.employer || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w && !/^(the|inc|incorporated|llc|corp|corporation|co|company|ltd|lp|llp|pllc|pc)$/.test(w)).join(' ');
/* "Acme Corp, Nov 20": how a stub is named in lists and in what's waiting to go to the Mac */
const stubName = s => `${s.employer || memberName(s.person)}, ${dateLabel(s.date)}`;
const isPayCat = c => !!c && c.kind === 'income' && !c.rental && /pay|salary|wage|bonus/i.test(c.name);

/* Labels and employer names: nothing that looks like a Social Security number, no run of 5 or more digits, no long
   dashed or masked numbers. */
function stubScrub(text) {
  return String(text ?? '').replace(/\b\d{3}[-\s.]?\d{2}[-\s.]?\d{4}\b/g, ' ').replace(/[x*•#]{2,}[-\s]?\d*/gi, ' ')
    .replace(/\d[\d\s-]{5,}\d/g, m => (m.replace(/\D/g, '').length >= 5 ? ' ' : m)).replace(/\d{5,}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
/* A deposit account from a stub: "ending 1234" at most. */
function stubEnding(text) {
  const d = String(text ?? '').replace(/\D/g, '');
  return d.length >= 4 ? `ending ${d.slice(-4)}` : '';
}
/* A stub as it is stored: known fields only, amounts as positive dollars and cents, labels scrubbed, empty rows dropped. */
function stubTidy(raw) {
  const day = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '');
  const rows = (list, kinds) => (Array.isArray(list) ? list : []).map(r => {
    const kind = kinds[r?.kind] ? r.kind : 'other', cur = stubNum(r?.cur), ytd = stubNum(r?.ytd);
    return cur == null && ytd == null ? null : { kind, label: stubScrub(r.label) || kinds[kind], cur: cur ?? 0, ytd };
  }).filter(Boolean);
  const s = {
    id: raw.id || 'ps' + uid(), person: raw.person, employer: stubScrub(raw.employer), date: day(raw.date), from: day(raw.from), to: day(raw.to), bonus: !!raw.bonus,
    gross: stubNum(raw.gross) ?? 0, grossYtd: stubNum(raw.grossYtd),
    pre: rows(raw.pre, STUB_PRE), tax: rows(raw.tax, STUB_TAX), post: rows(raw.post, STUB_POST),
    net: stubNum(raw.net) ?? 0, netYtd: stubNum(raw.netYtd), er: rows(raw.er, STUB_ER), added: raw.added || today(),
  };
  if (Array.isArray(raw.txIds) && raw.txIds.length) s.txIds = [...new Set(raw.txIds.filter(x => typeof x === 'string' && x))];
  if (raw.deposit && stubEnding(raw.deposit)) s.deposit = stubEnding(raw.deposit);
  if (raw.src === 'pdf') s.src = 'pdf';
  if (s.from && s.to && s.from > s.to) [s.from, s.to] = [s.to, s.from];
  return s;
}

/* ---------- one stub: pay before tax down to take-home ---------- */
const stubSum = (rows, f = 'cur', kind) => round2(sum((rows || []).filter(r => !kind || r.kind === kind).map(r => Number(r[f]) || 0)));
/* The steps, and whether they add up to the take-home to the cent. `f` is 'cur' (this paycheck) or 'ytd'. */
function stubPath(s, f = 'cur') {
  const gross = round2(f === 'ytd' ? s.grossYtd : s.gross), net = round2(f === 'ytd' ? s.netYtd : s.net);
  const pre = stubSum(s.pre, f), tax = stubSum(s.tax, f), post = stubSum(s.post, f);
  const afterPre = round2(gross - pre), afterTax = round2(afterPre - tax), expected = round2(afterTax - post);
  return { gross, pre, tax, post, net, afterPre, afterTax, expected, off: round2(expected - net), ok: cents(expected) === cents(net) };
}
/* "These add up." or "Off by $12.40: check the rows." */
function stubAddsUp(s) {
  const p = stubPath(s);
  if (!(p.gross > 0) && !(p.net > 0)) return { ok: null, text: 'Type the pay before tax and the take-home pay, and Ọrọ̀ checks that the rows add up.' };
  const cur = p.ok ? 'These add up.' : `Off by ${money(Math.abs(p.off))}: check the rows.`;
  let ytd = '', yOk = null;
  if (s.grossYtd != null && s.netYtd != null) { const y = stubPath(s, 'ytd'); yOk = y.ok; ytd = y.ok ? ' Year to date adds up too.' : ` Year to date is off by ${money(Math.abs(y.off))}.`; }
  return { ok: p.ok, ytdOk: yOk, off: p.off, text: cur + ytd, detail: `${money(p.gross)} − ${money(p.pre)} − ${money(p.tax)} − ${money(p.post)} = ${money(p.expected)}${p.ok ? '' : `, and the take-home says ${money(p.net)}`}` };
}
/* Every line of a stub by kind, as one flat list of numbers ("pre.retire", "tax.federal"…). A year-to-date figure is
   null when a row of that kind has none. */
function stubLines(s, f = 'cur') {
  const out = {};
  for (const k of STUB_LINES) out[k] = f === 'cur' ? 0 : null;
  out.gross = f === 'cur' ? round2(s.gross) : s.grossYtd ?? null;
  out.net = f === 'cur' ? round2(s.net) : s.netYtd ?? null;
  for (const b of Object.keys(STUB_BLOCKS)) {
    const by = groupBy(s[b] || [], r => (STUB_BLOCKS[b][r.kind] ? r.kind : 'other'));
    for (const [kind, rows] of Object.entries(by)) out[`${b}.${kind}`] = f === 'cur' ? stubSum(rows) : rows.every(r => r.ytd != null) ? stubSum(rows, 'ytd') : null;
  }
  return out;
}
const linesPart = (L, b) => round2(sum(Object.keys(STUB_BLOCKS[b]).map(k => L[`${b}.${k}`] || 0)));
/* What a set of lines saved: 401(k) and the like, Roth, HSA, a stock or savings plan. Premiums and an FSA aren't saving. */
const linesSaved = L => ({ retire: L['pre.retire'] || 0, roth: L['post.roth'] || 0, hsa: L['pre.hsa'] || 0, other: L['post.stock'] || 0 });

/* ---------- the paycheck it landed as ---------- */
/* Each stub's deposit: the ones picked by hand, else the money-in transaction with the same amount to the cent, dated
   from a day before to five days after the pay date (one filed under a pay category first, then an uncategorized one,
   then other income; the nearest date), each transaction used for one stub only. */
function stubTies() {
  return memo('stubties', () => {
    const byStub = {}, byTx = {}, txs = new Map(state.transactions.map(t => [t.id, t]));
    const stubs = stubsAll().slice().sort((a, b) => a.date.localeCompare(b.date));
    const take = (s, list, how) => { byStub[s.id] = { txs: list, how }; for (const t of list) byTx[t.id] = s.id; };
    for (const s of stubs) { const list = (s.txIds || []).map(id => txs.get(id)).filter(Boolean); if (list.length) take(s, list, 'picked'); }
    const rank = t => { const ls = txLines(t); return ls.some(l => isPayCat(catById(l.categoryId))) ? 0 : isUncat(t) ? 1 : ls.some(l => catById(l.categoryId)?.kind === 'income') ? 2 : -1; };
    const ins = state.transactions.filter(t => t.amount > 0);
    for (const s of stubs) {
      if (byStub[s.id] || !(s.net > 0) || !s.date) continue;
      const lo = addDays(s.date, -1), hi = addDays(s.date, 5), want = cents(s.net);
      let best = null, bk = null;
      for (const t of ins) {
        if (t.date < lo || t.date > hi || cents(t.amount) !== want || byTx[t.id]) continue;
        const r = rank(t); if (r < 0) continue;
        const k = [r, Math.abs(daysBetween(s.date, t.date)), t.date];
        if (!best || k[0] < bk[0] || (k[0] === bk[0] && (k[1] < bk[1] || (k[1] === bk[1] && k[2] < bk[2])))) { best = t; bk = k; }
      }
      if (best) take(s, [best], 'matched');
    }
    return { byStub, byTx };
  });
}
/* { txs, how: 'picked' | 'matched' | null, total, short } for a stub; short is what the deposits fall short of take-home by */
function stubDeposits(s) {
  const d = stubTies().byStub[s.id] || { txs: [], how: null };
  const total = round2(sum(d.txs.map(t => t.amount)));
  return { ...d, total, short: d.txs.length ? round2(s.net - total) : 0 };
}
/* The stub a transaction is the paycheck of, if any */
function stubForTxn(id) { const sid = stubTies().byTx[id]; return sid ? stubById(sid) : null; }
/* "Landed in Everyday checking on Nov 20: $4,850.00" (plain text) */
function stubLandedText(s) {
  const d = stubDeposits(s);
  if (!d.txs.length) return 'Not in your transactions yet';
  return 'Landed in ' + d.txs.map(t => `${acctById(t.accountId)?.name || 'an account'} on ${dateLabel(t.date)}: ${money(t.amount)}`).join(' and ');
}

/* ---------- how often, and how many paychecks are left ---------- */
const payInfo = id => state.tax?.payInfo?.[id] || {};
/* Worked out from the regular stubs: the pay period's length, or else the gap between pay dates. null = can't tell. */
function stubFreqGuess(regs) {
  const last = regs[regs.length - 1]; if (!last) return null;
  if (last.from && last.to) {
    const len = daysBetween(last.from, last.to) + 1, f = +last.from.slice(8), t = +last.to.slice(8), eom = last.to === monthEnd(last.to.slice(0, 7));
    if (len >= 6 && len <= 8) return 'weekly';
    if (len >= 28 && len <= 31) return 'monthly';
    if (len >= 13 && len <= 16 && len !== 14) return 'semimonthly';
    if (len === 14 && !((f === 1 && t === 15) || (f === 16 && eom))) return 'biweekly';   // 14 days on the 16th to month's end happens in a leap February: the pay dates decide
  }
  const dates = [...new Set(regs.map(s => s.date))].sort();
  if (dates.length < 2) return last.from && last.to && daysBetween(last.from, last.to) === 13 ? 'biweekly' : null;
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d)), g = Math.min(...gaps);
  const days = dates.map(d => +d.slice(8)), sameDay = days.every(d => d === days[0]) || dates.every(d => d === monthEnd(d.slice(0, 7)));
  if (g >= 6 && g <= 8) return 'weekly';
  if (g >= 13 && g <= 17) return gaps.filter(x => x % 14 === 0).length * 2 >= gaps.length ? 'biweekly' : 'semimonthly';   // every 2 weeks lands 14 days apart; twice a month mostly 15 or 16
  if (g >= 27 && g <= 32) return sameDay || g % 14 ? 'monthly' : 'biweekly';
  if (g % 14 === 0) return 'biweekly';
  if (g % 7 === 0) return 'weekly';
  return null;
}
/* Regular pay dates after `last` through December 31 of that year. */
function payDatesLeft(last, freq, year, regs = []) {
  if (!last || yearOf(last) !== year) return 0;
  const days = daysBetween(last, `${year}-12-31`);
  if (freq === 'weekly') return Math.floor(days / 7);
  if (freq === 'biweekly') return Math.floor(days / 14);
  if (freq === 'monthly') return 12 - +last.slice(5, 7);
  if (freq !== 'semimonthly') return 0;
  // the two pay days of the month: from the stubs' own dates when they show both, else 15 days apart
  const seen = regs.map(s => +s.date.slice(8)), lo = seen.filter(d => d <= 15).pop(), hi = seen.filter(d => d > 15).pop(), d = +last.slice(8);
  const pair = lo && hi ? [lo, hi] : d <= 15 ? [d, d + 15 >= 30 ? 31 : d + 15] : [Math.max(1, d - 15), d >= 28 ? 31 : d];
  let n = 0;
  for (let m = +last.slice(5, 7); m <= 12; m++) for (const day of pair) {
    const mk = `${year}-${pad2(m)}`, iso = `${mk}-${pad2(Math.min(day, +monthEnd(mk).slice(8)))}`;
    if (daysBetween(last, iso) >= 7) n++;
  }
  return n;
}

/* ---------- the saving limits ---------- */
const saveLimits = year => TAX_TABLES[year]?.save || null;
const ageIn = (id, year) => { const b = +payInfo(id).born; return b > 1900 && b <= year ? year - b : null; };
/* A year's limit on 401(k), 403(b) and 457 pay deferrals (before tax and Roth together) for someone that age at the
   end of the year; null when Ọrọ̀ doesn't have that year's limits. */
function deferralLimit(year, age) {
  const L = saveLimits(year); if (!L) return null;
  return L.deferral + (age == null || age < 50 ? 0 : age >= 60 && age <= 63 ? L.catch60 : L.catch50);
}
/* A year's HSA limit: 'self' or 'family' coverage (family unless told otherwise), $1,000 more at 55 or older. */
function hsaLimit(year, cover, age) {
  const L = saveLimits(year); if (!L) return null;
  return (cover === 'self' ? L.hsaSelf : L.hsaFamily) + (age != null && age >= 55 ? L.hsa55 : 0);
}

/* ---------- where the year stands, and where it will end ---------- */
/* One person's year from their stubs, per employer and together: so far (the latest stub's year-to-date; the stubs
   added up when those boxes were left blank) and projected (so far plus the regular paychecks left times the latest
   regular paycheck, stopped at the Social Security wage base and the 401(k) and HSA limits). null with no stubs. */
function stubYear(personId, year) {
  return memo(`stubyr:${personId}:${year}`, () => {
    const all = stubsAll().filter(s => s.person === personId && s.date && yearOf(s.date) === year).sort((a, b) => a.date.localeCompare(b.date));
    if (!all.length) return null;
    const { T } = taxTables(year), info = payInfo(personId), age = ageIn(personId, year);
    const lastDate = all[all.length - 1].date;
    // A stub with no employer named belongs with one that has a name: the only one there is, else the one with the same
    // regular paycheck, else the one with the nearest pay date.
    const withName = all.filter(stubEmpKey), named = [...new Set(withName.map(stubEmpKey))];
    const jobOf = s => stubEmpKey(s) || (named.length < 2 ? named[0] || '' : stubEmpKey(withName.filter(x => !x.bonus && !s.bonus && cents(x.gross) === cents(s.gross)).pop()
      || withName.slice().sort((x, y) => Math.abs(daysBetween(x.date, s.date)) - Math.abs(daysBetween(y.date, s.date)))[0]));
    const jobs = Object.entries(groupBy(all, jobOf)).map(([key, list]) => {
      const latest = list[list.length - 1], regs = list.filter(s => !s.bonus), regular = regs[regs.length - 1] || null;
      const sums = {}; for (const k of STUB_LINES) sums[k] = round2(sum(list.map(s => stubLines(s)[k])));
      const ytdMode = latest.grossYtd != null, sofar = {};
      for (const k of STUB_LINES) {
        let v = null;
        if (ytdMode) for (let i = list.length - 1; i >= 0 && v == null; i--) v = stubLines(list[i], 'ytd')[k];   // the newest stub that gives it
        sofar[k] = v != null ? v : sums[k];
      }
      if (ytdMode && latest.netYtd == null) sofar.net = round2(sofar.gross - linesPart(sofar, 'pre') - linesPart(sofar, 'tax') - linesPart(sofar, 'post'));
      const typed = info.freq?.[key], guess = stubFreqGuess(regs), freq = PAY_FREQS.includes(typed) ? typed : guess;
      const active = !!regular && daysBetween(regular.date, lastDate) <= Math.max(35, freq === 'monthly' ? 62 : 0);
      const left = active && freq ? payDatesLeft(regular.date, freq, year, regs) : 0;
      return { key, employer: list.map(s => s.employer).filter(Boolean).pop() || '', n: list.length, latest, regular, ytdMode, sofar, freq, guess, typedFreq: PAY_FREQS.includes(typed) ? typed : '', ask: !!regular && !freq, active, left, cur: regular ? stubLines(regular) : null };
    });
    const sofar = {}, projected = {}, capped = {};
    for (const k of STUB_LINES) sofar[k] = round2(sum(jobs.map(j => j.sofar[k])));
    // deferrals stop at the year's limit (before tax and Roth together, across employers); an HSA at its limit (with the employer's part)
    const factor = (keys, limit) => {
      if (limit == null) return 1;
      const had = sum(keys.map(k => sofar[k])), plan = sum(jobs.map(j => (j.cur ? j.left * sum(keys.map(k => j.cur[k])) : 0)));
      return plan > 0 && had + plan > limit ? Math.max(0, limit - had) / plan : 1;
    };
    const lim = { deferral: deferralLimit(year, age), hsa: hsaLimit(year, info.hsa, age) };
    const fR = factor(['pre.retire', 'post.roth'], lim.deferral), fH = factor(['pre.hsa', 'er.hsa'], lim.hsa);
    if (fR < 1) capped.retire = true;
    if (fH < 1) capped.hsa = true;
    const ssMax = round2(0.062 * T.ssBase);
    for (const j of jobs) {
      j.projected = {};
      for (const k of STUB_LINES) j.projected[k] = round2(j.sofar[k] + (j.cur ? j.left * j.cur[k] * (k === 'pre.retire' || k === 'post.roth' ? fR : k === 'pre.hsa' || k === 'er.hsa' ? fH : 1) : 0));
      const ss = Math.min(j.projected['tax.ss'], Math.max(j.sofar['tax.ss'], ssMax));   // each employer stops at the wage base
      if (ss < j.projected['tax.ss'] || (j.sofar['tax.ss'] >= ssMax && j.left > 0)) capped.ss = true;
      j.projected['tax.ss'] = round2(ss);
      j.projected.net = round2(j.projected.gross - linesPart(j.projected, 'pre') - linesPart(j.projected, 'tax') - linesPart(j.projected, 'post'));
    }
    for (const k of STUB_LINES) projected[k] = round2(sum(jobs.map(j => j.projected[k])));
    const main = jobs.filter(j => j.regular).sort((a, b) => b.regular.date.localeCompare(a.regular.date))[0] || jobs[jobs.length - 1];
    return {
      person: personId, year, n: all.length, jobs, main, latest: all[all.length - 1], sofar, projected, capped, limits: lim, age,
      left: sum(jobs.map(j => j.left)), ask: jobs.some(j => j.ask && j.active !== false), summed: jobs.some(j => !j.ytdMode), ssMax,
      room: {
        retire: lim.deferral == null ? null : round2(Math.max(0, lim.deferral - projected['pre.retire'] - projected['post.roth'])),
        hsa: lim.hsa == null ? null : round2(Math.max(0, lim.hsa - projected['pre.hsa'] - projected['er.hsa'])),
      },
    };
  });
}
/* What the Taxes page uses for a person when a box is blank: the projected year. Health through pay is the HSA, FSA and
   premiums (and anything else before tax), which skip Social Security and Medicare too; a 401(k) doesn't. */
function stubPlan(personId, year) {
  const Y = stubYear(personId, year); if (!Y) return null;
  const P = Y.projected;
  return { gross: P.gross, retire: P['pre.retire'], health: round2(P['pre.hsa'] + P['pre.fsa'] + P['pre.premium'] + P['pre.other']), hsa: P['pre.hsa'], fedWh: P['tax.federal'], stateWh: P['tax.state'] };
}
/* The adults with stubs that year, and the household's totals. */
function stubHousehold(year) {
  const people = taxEarners().map(m => stubYear(m.id, year)).filter(Boolean), sofar = {}, projected = {};
  for (const k of STUB_LINES) { sofar[k] = round2(sum(people.map(p => p.sofar[k]))); projected[k] = round2(sum(people.map(p => p.projected[k]))); }
  return { year, people, sofar, projected, n: sum(people.map(p => p.n)) };
}

/* ---------- saved through pay: saving, not spending ---------- */
/* What went into a 401(k), 403(b) or 457, a Roth 401(k), an HSA or a stock or savings plan straight from pay, on stubs
   dated from..to (this-paycheck amounts). It never reaches the bank, so Money in and Kept don't have it. Follows the
   whose-money menu by the stub's person unless { lens: false }. `employer` is what the employer added (401(k) and HSA). */
function payrollSaving(from, to, opts = {}) {
  const useLens = opts.lens !== false;
  return memo(`paysave:${from}:${to}:${useLens ? UI.lens : '*'}`, () => {
    const out = { total: 0, byKind: { retire: 0, roth: 0, hsa: 0, other: 0 }, employer: 0, stubs: 0, ids: [] };
    for (const s of stubsAll()) {
      if (!s.date || s.date < from || s.date > to || (useLens && !inLens(s.person))) continue;
      const L = stubLines(s), sv = linesSaved(L);
      for (const k of Object.keys(out.byKind)) out.byKind[k] += sv[k];
      out.employer += L['er.retire'] + L['er.hsa']; out.stubs++; out.ids.push(s.id);
    }
    for (const k of Object.keys(out.byKind)) out.byKind[k] = round2(out.byKind[k]);
    out.total = round2(sum(Object.values(out.byKind))); out.employer = round2(out.employer);
    return out;
  });
}
/* Money in, spent and what was kept over a stretch, counting what was saved through pay:
   kept = left over + saved through pay; rate = kept ÷ (money in + saved through pay). */
function keptWithPayrollRange(from, to, opts = {}) {
  const useLens = opts.lens !== false, txs = txInRange(from, to), f = flowSummary(useLens ? lensed(txs) : txs), p = payrollSaving(from, to, opts);
  const kept = round2(f.net + p.total), base = f.income + p.total;
  return { moneyIn: f.income, spent: f.spending, leftOver: f.net, savedThroughPay: p.total, kept, rate: base > 0 ? kept / base : NaN, byKind: p.byKind, employer: p.employer, stubs: p.stubs };
}
const keptWithPayroll = (mk, opts) => keptWithPayrollRange(`${mk}-01`, monthEnd(mk), opts);
/* "401(k) $854, HSA $250" */
function payrollKindsText(byKind) {
  const names = { retire: '401(k)', roth: 'Roth 401(k)', hsa: 'HSA', other: 'stock or savings plan' };
  return Object.keys(names).filter(k => byKind[k] > 0).map(k => `${names[k]} ${money(byKind[k], { cents: false })}`).join(', ');
}
/* A year's saving through pay, projected from the stubs (for Planning › Retirement): yours, and with your employer's part. */
function payrollSavingForYear(year) {
  const H = stubHousehold(year), sv = linesSaved(H.projected), mine = round2(sum(Object.values(sv))), employer = round2(H.projected['er.retire'] + H.projected['er.hsa']);
  return { mine, employer, total: round2(mine + employer), byKind: sv, people: H.people.length };
}

/* ---------- the likely tax bill or refund ---------- */
/* The estimate for the year (typed numbers, or the stub projection where a box is blank) set against what will have
   been taken out of pay and any other payments sent in. due > 0 is owed, < 0 is coming back. Also what saving in the
   401(k) and HSA keeps out of taxes, and, for this year or a later one, the room left under the limits. */
function taxDue(year) {
  const none = { federal: null, state: null, fica: null };
  const X = taxEstimate(year), E = taxEstimate(year, { actual: none });
  const people = E.earners.map(e => ({ ...e, hsa: E.H.people[e.id]?.hsa || 0, stub: stubYear(e.id, year), age: ageIn(e.id, year) }));
  const saved = round2(sum(people.map(p => (p.retire || 0) + (p.hsa || 0))));
  let keeps = 0;
  if (saved > 0) {
    const without = Object.fromEntries(people.map(p => [p.id, { ...E.H.people[p.id], retire: 0, health: round2((p.health || 0) - (p.hsa || 0)), hsa: 0 }]));
    keeps = round2(taxEstimate(year, { people: without, actual: none }).taxes - E.taxes);
  }
  // Room left under the limits: a 401(k) for someone already putting pay into one, and no more than the pay still to
  // come this year; an HSA for someone who has one (a couple filing together with family coverage shares one family limit)
  let room = null;
  if (saveLimits(year) && year >= new Date().getFullYear()) {
    const L = saveLimits(year), more = {}, list = [];
    const defer = p => (p.retire || 0) + (p.stub ? p.stub.projected['post.roth'] : 0), hsaHas = p => (p.hsa || 0) + (p.stub ? p.stub.projected['er.hsa'] : 0);
    const hsaPeople = people.filter(p => hsaHas(p) > 0);
    const shared = E.status === 'mfj' && hsaPeople.length > 1 && hsaPeople.every(p => payInfo(p.id).hsa !== 'self');
    let sharedLeft = shared ? Math.max(0, L.hsaFamily - sum(hsaPeople.map(hsaHas))) : 0;
    for (const p of people) {
      if (!(p.gross > 0)) continue;
      const Y = p.stub;
      let r = defer(p) > 0 ? Math.max(0, deferralLimit(year, p.age) - defer(p)) : 0;
      r = Math.min(r, Math.max(0, Y ? (Y.projected.gross - Y.sofar.gross) - (linesPart(Y.projected, 'pre') - linesPart(Y.sofar, 'pre')) : p.gross - (p.retire || 0) - (p.health || 0)));
      let h = 0;
      if (hsaPeople.includes(p)) {
        if (shared) { h = sharedLeft + (p.age != null && p.age >= 55 ? L.hsa55 : 0); sharedLeft = 0; }
        else h = Math.max(0, hsaLimit(year, payInfo(p.id).hsa, p.age) - hsaHas(p));
      }
      const rr = round2(r), hh = round2(h);
      more[p.id] = { ...E.H.people[p.id], retire: round2((p.retire || 0) + rr), health: round2((p.health || 0) + hh), hsa: round2((p.hsa || 0) + hh) };
      if (rr > 0 || hh > 0) list.push({ id: p.id, name: p.name, retire: rr, hsa: hh, ageKnown: p.age != null });
    }
    const retire = round2(sum(list.map(x => x.retire))), hsa = round2(sum(list.map(x => x.hsa)));
    room = { retire, hsa, people: list, saves: retire + hsa > 0 ? round2(E.taxes - taxEstimate(year, { people: { ...E.H.people, ...more }, actual: none }).taxes) : 0 };
  }
  const line = (tax, wh, paid) => ({ tax, withheld: wh, paid, due: round2(tax - wh - paid) });
  const federal = line(X.federal, X.withheld.federal, X.paid.federal), state = line(X.state, X.withheld.state, X.paid.state);
  return { year, X, federal, state, all: round2(federal.due + state.due), withheldAny: X.withheld.federal + X.withheld.state + X.paid.federal + X.paid.state > 0, saved, keeps, room, people };
}
/* "a refund of $1,240" / "$860 owed" / "even" */
const dueWords = (due, o = {}) => (Math.abs(due) < 0.005 ? 'even' : due < 0 ? `a refund of ${money(-due, o)}` : `${money(due, o)} owed`);

/* ---------- What if… ---------- */
const WI_PERSON = ['gross', 'bonus', 'retire', 'hsa', 'health', 'fedWh', 'stateWh'];
const WI_HOUSE = ['other', 'status', 'kids', 'charity', 'propertyTax', 'interest'];
const wiNum = v => (v === '' || v == null || !isFinite(+v) ? null : +v);
/* What the plan uses for each what-if box (the placeholders). */
function whatIfPlan(year) {
  const P = taxEstimate(year, { actual: { federal: null, state: null, fica: null } });
  const people = Object.fromEntries(P.earners.map(e => {
    const p = P.H.people[e.id];
    return [e.id, { gross: p.gross || 0, bonus: 0, retire: p.retire || 0, hsa: p.hsa || 0, health: round2((p.health || 0) - (p.hsa || 0)), fedWh: p.fedWh || 0, stateWh: p.stateWh || 0 }];
  }));
  return { P, people, house: { other: P.other, status: P.status, kids: P.H.kids || 0, charity: P.A.charityPaid, propertyTax: P.A.propertyTax, interest: P.A.interest } };
}
/* The changes as taxEstimate takes them. `only` = [personId or 'h', field] keeps just that one change. A bonus adds to
   the year's pay and to what's taken out (22% federal, 4.95% Illinois); children also count as dependents for Illinois. */
function whatIfOver(year, W, plan = whatIfPlan(year), only = null) {
  const on = (who, f) => !only || (only[0] === who && only[1] === f);
  const people = {};
  for (const [id, p] of Object.entries(plan.people)) {
    const w = W?.people?.[id] || {}, v = f => (on(id, f) ? wiNum(w[f]) : null);
    const bonus = Math.max(0, v('bonus') || 0), hsa = v('hsa') ?? p.hsa;
    people[id] = { gross: round2((v('gross') ?? p.gross) + bonus), retire: v('retire') ?? p.retire, health: round2(hsa + (v('health') ?? p.health)), hsa,
      fedWh: round2((v('fedWh') ?? p.fedWh) + bonus * BONUS_FED_WH), stateWh: round2((v('stateWh') ?? p.stateWh) + bonus * IL_RATE) };
  }
  const over = { people, actual: { federal: null, state: null, fica: null } }, h = f => (on('h', f) ? W?.[f] : null);
  if (wiNum(h('other')) != null) over.other = wiNum(h('other'));
  if (FILING[h('status')]) over.status = h('status');
  if (wiNum(h('kids')) != null) { over.kids = Math.max(0, Math.round(wiNum(h('kids')))); over.deps = Math.max(0, (plan.P.H.deps || 0) + over.kids - (plan.P.H.kids || 0)); }
  for (const f of ['charity', 'propertyTax', 'interest']) if (wiNum(h(f)) != null) over[f] = Math.max(0, wiNum(h(f)));
  return over;
}
/* Which boxes differ from the plan: [[personId or 'h', field, plan's figure, what-if figure]…] */
function whatIfChanges(year, W = state.tax?.whatif?.[year], plan = whatIfPlan(year)) {
  const out = [];
  for (const [id, p] of Object.entries(plan.people)) for (const f of WI_PERSON) {
    const v = wiNum(W?.people?.[id]?.[f]);
    if (v != null && Math.abs(v - p[f]) > 0.004) out.push([id, f, p[f], v]);
  }
  for (const f of WI_HOUSE) {
    const v = f === 'status' ? (FILING[W?.[f]] ? W[f] : null) : wiNum(W?.[f]);
    if (v != null && (f === 'status' ? v !== plan.house.status : Math.abs(v - plan.house[f]) > 0.004)) out.push(['h', f, plan.house[f], v]);
  }
  return out;
}
/* The figures a column shows. Refund is what comes back (+) or is owed (−). */
function whatIfFigures(X) {
  return { income: X.income, pretax: X.pretax, taxable: X.taxable, federal: X.federal, state: X.state, fica: X.fica, taxes: X.taxes,
    withheld: round2(X.withheld.federal + X.withheld.state), refund: round2(-X.due.all), kept: X.kept, keptSaved: round2(X.kept + X.pretax), average: X.average, top: X.top.all };
}
const WI_ROWS = [['income', 'Income'], ['pretax', 'Saved before tax'], ['taxable', 'Taxable income'], ['federal', 'Federal income tax'], ['state', 'Illinois income tax'], ['fica', 'Social Security and Medicare'],
  ['taxes', 'All taxes'], ['withheld', 'Taken out of pay'], ['refund', 'Refund or owed'], ['kept', 'Kept after tax'], ['keptSaved', 'Kept, counting what you saved'], ['average', 'Average rate'], ['top', 'Top rate']];
/* Both columns, the difference, and each change on its own in plain words. */
function whatIf(year) {
  const W = state.tax?.whatif?.[year], plan = whatIfPlan(year), changes = whatIfChanges(year, W, plan);
  const base = whatIfFigures(plan.P), X = changes.length ? taxEstimate(year, whatIfOver(year, W, plan)) : plan.P, what = whatIfFigures(X);
  const rows = WI_ROWS.map(([key, label]) => ({ key, label, plan: base[key], what: what[key], diff: key === 'average' || key === 'top' ? what[key] - base[key] : round2(what[key] - base[key]), rate: key === 'average' || key === 'top' }));
  const says = changes.map(c => whatIfSentence(year, W, plan, c)).filter(Boolean);
  if (changes.length > 1) {
    const d = k => round2(what[k] - base[k]);
    says.push(`All together: ${d('taxes') === 0 ? 'the same tax' : `${money(Math.abs(d('taxes')), { cents: false })} ${d('taxes') < 0 ? 'less' : 'more'} tax`}, ${d('kept') === 0 ? 'the same kept after tax' : `${money(Math.abs(d('kept')), { cents: false })} ${d('kept') < 0 ? 'less' : 'more'} kept after tax`}, and ${refundWords(base.refund, what.refund)}. Each line above is that change on its own.`);
  }
  return { year, W: W || null, plan, changes, changed: changes.length > 0, X, base, what, rows, says };
}
const refundSay = r => (Math.abs(r) < 0.5 ? 'coming out even' : r > 0 ? `a ${money(r, { cents: false })} refund` : `${money(-r, { cents: false })} owed`);
function refundWords(a, b) {
  if (Math.abs(a - b) < 0.5) return `still ${refundSay(b)}`;
  return `${refundSay(b)} instead of ${refundSay(a)}`;
}
/* One change by itself: "Putting $4,000 more in Alex’s 401(k) lowers this year’s tax by $1,158 and take-home by $2,842." */
function whatIfSentence(year, W, plan, [who, f, was, now]) {
  const A = whatIfFigures(plan.P), B = whatIfFigures(taxEstimate(year, whatIfOver(year, W, plan, [who, f])));
  const m = n => money(Math.abs(n), { cents: false }), d = round2(now - was), tax = round2(B.taxes - A.taxes), kept = round2(B.kept - A.kept);
  const name = who === 'h' ? '' : memberName(who), solo = Object.keys(plan.people).length < 2, whose = solo ? 'the' : `${name}’s`;
  const taxSay = Math.abs(tax) < 0.5 ? 'doesn’t change this year’s tax' : `${tax < 0 ? 'lowers' : 'raises'} this year’s tax by ${m(tax)}`;
  const keptSay = Math.abs(kept) < 0.5 ? '' : ` and take-home by ${m(kept)}`;
  const moreLess = d > 0 ? 'more' : 'less';
  if (f === 'retire') return `Putting ${m(d)} ${moreLess} in ${whose} 401(k) ${taxSay}${keptSay}.`;
  if (f === 'hsa') return `Putting ${m(d)} ${moreLess} in ${whose} HSA ${taxSay}${keptSay}. An HSA skips Social Security and Medicare too.`;
  if (f === 'health') return `Paying ${m(d)} ${moreLess} before tax for ${solo ? 'an' : `${name}’s`} FSA and premiums ${taxSay}${keptSay}.`;
  if (f === 'gross') return `${solo ? 'Pay' : `${name}’s pay`} of ${money(now, { cents: false })} for the year (${m(d)} ${moreLess}) ${taxSay}, and you keep ${m(kept)} ${kept < 0 ? 'less' : 'more'}.`;
  if (f === 'bonus') return `A ${m(now)} bonus${solo ? '' : ` for ${name}`} adds ${m(tax)} of tax (${m(B.federal - A.federal)} federal, ${m(B.state - A.state)} Illinois, ${m(B.fica - A.fica)} Social Security and Medicare), so you keep ${m(kept)} of it. Ọrọ̀ counts ${m(now * BONUS_FED_WH)} federal and ${m(now * IL_RATE)} Illinois as taken out of the bonus itself.`;
  if (f === 'fedWh' || f === 'stateWh') return `Having ${m(d)} ${moreLess} ${f === 'fedWh' ? 'federal' : 'Illinois'} tax taken out of ${solo ? 'your' : `${name}’s`} pay doesn’t change the tax: it means ${refundWords(A.refund, B.refund)}.`;
  if (f === 'other') return `Other income of ${money(now, { cents: false })} (${m(d)} ${moreLess}) ${taxSay}.`;
  if (f === 'status') return `Filing as ${FILING[now].toLowerCase()} instead of ${FILING[was].toLowerCase()} ${taxSay}.`;
  if (f === 'kids') return `${now} ${now === 1 ? 'child' : 'children'} under 17 instead of ${was} ${taxSay}.`;
  const itemNote = Math.abs(tax) < 0.5 && !taxEstimate(year, whatIfOver(year, W, plan, [who, f])).itemize ? ': the standard deduction is still larger' : '';
  if (f === 'charity') return `Giving ${money(now, { cents: false })} to charity (${m(d)} ${moreLess}) ${taxSay}${itemNote}.`;
  if (f === 'propertyTax') return `Property tax of ${money(now, { cents: false })} (${m(d)} ${moreLess}) ${taxSay}${itemNote}.`;
  if (f === 'interest') return `Mortgage interest of ${money(now, { cents: false })} (${m(d)} ${moreLess}) ${taxSay}${itemNote}.`;
  return '';
}
/* Drop a year's what-if (and the holder itself once it's empty, so nothing is left behind to sync). */
function whatIfForget(year) {
  if (!state.tax?.whatif) return;
  delete state.tax.whatif[year];
  if (!Object.keys(state.tax.whatif).length) delete state.tax.whatif;
}
/* Copy the what-if into the typed numbers and empty it. One commit, so one Undo puts everything back. */
function whatIfMakePlan(year) {
  const W = state.tax?.whatif?.[year], plan = whatIfPlan(year), changes = whatIfChanges(year, W, plan);
  if (!changes.length) return 0;
  const over = whatIfOver(year, W, plan), H = ((state.tax.household = state.tax.household || {})[year] = state.tax.household[year] || {});
  const touched = (id, fs) => changes.some(c => c[0] === id && fs.includes(c[1]));
  for (const [id, o] of Object.entries(over.people)) {
    if (!touched(id, WI_PERSON)) continue;
    const p = ((H.people = H.people || {})[id] = H.people[id] || {});
    if (touched(id, ['gross', 'bonus'])) p.gross = o.gross;
    if (touched(id, ['retire'])) p.retire = o.retire;
    if (touched(id, ['hsa', 'health'])) { p.health = o.health; p.hsa = o.hsa; }
    if (touched(id, ['fedWh', 'bonus'])) p.fedWh = o.fedWh;
    if (touched(id, ['stateWh', 'bonus'])) p.stateWh = o.stateWh;
  }
  if (touched('h', ['other'])) H.other = over.other;
  if (touched('h', ['status'])) H.status = over.status;
  if (touched('h', ['kids'])) { H.kids = over.kids; H.deps = over.deps; }
  if (touched('h', ['charity'])) H.charity = over.charity;
  if (touched('h', ['propertyTax'])) H.propertyTax = over.propertyTax;
  if (touched('h', ['interest'])) {
    const loans = homeLoansForTax();   // one home loan: its Form 1098 box; otherwise the total for the year
    if (loans.length === 1) { ((state.tax[loans[0].key] = state.tax[loans[0].key] || {})[year] = state.tax[loans[0].key][year] || {}).interest = over.interest; delete H.interest; }
    else H.interest = over.interest;
  }
  whatIfForget(year);
  commit();
  return changes.length;
}

/* ---------- reading a pay stub from a PDF's text (best effort; nothing but numbers and labels is kept) ---------- */
const STUB_AMT = /^[($-]*\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?\*{0,2}$|^[($-]*\$?\d+\.\d{2}\)?-?\*{0,2}$/;
const STUB_DATE = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4})/i;
const STUB_DATE_ALL = new RegExp(STUB_DATE.source, 'gi');
const STUB_LABELS = {
  gross: /\bgross (pay|earnings|wages)\b|\btotal (gross|earnings|pay)\b|\bgross$|^gross\b|\bcurrent gross\b/,
  net: /\bnet (pay|check|amount)\b|\bnet$|\btake.?home\b|\bcheck amount\b/,
  deposit: /\bdirect deposit\b|\bnet (pay )?distribution\b|\bdeposit(ed)? (to|into)\b/,
};
/* What a row's label is: [block, kind] or a single field name; null when Ọrọ̀ doesn't know it. */
function stubClassify(label, section, starred) {
  const l = ' ' + String(label).toLowerCase().replace(/[^a-z0-9()/&+ ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (/taxable|\bwages?\b|allowance|exemption|filing|marital|\bhours?\b|\brate\b|balance|accru|available|\bpto\b|vacation|sick/.test(l) && !/\bgross (pay|earnings|wages)\b/.test(l)) return null;
  const er = /\b(employer|company|er|match|matching)\b/.test(l) || section === 'er';
  if (/\b(oasdi|social security|soc sec|ss tax|fica ss|fica oasdi|ee social security)\b/.test(l) || /\bfica\b(?!.*med)/.test(l)) return er ? null : ['tax', 'ss'];
  if (/\b(medicare|fica med|fica hi|med tax|fed med|medi)\b/.test(l)) return er ? null : ['tax', 'medicare'];
  if (/\b(futa|suta|sui|unemployment)\b/.test(l)) return section === 'er' ? null : ['tax', 'other'];
  if (/\b(fed(eral)?)\b.*\b(income|w ?\/ ?h|with ?holding|withhold|tax)\b|\b(fitw?|fwt|fit)\b|\bfed ?w ?h\b/.test(l)) return ['tax', 'federal'];
  if (/\b(state|illinois|il)\b.*\b(income|w ?\/ ?h|with ?holding|withhold|tax)\b|\b(sitw?|swt|sit)\b|\bstate ?w ?h\b|^ [a-z]{2} (state )?(income tax|with ?holding|w ?\/ ?h)\b/.test(l) && !/\b(sdi|disability|unemployment)\b/.test(l)) return ['tax', 'state'];
  if (/\b(local|city|county|sdi|pfl|pfml|occupational|school district|disability)\b.*\btax\b|\b(sdi|pfml)\b/.test(l)) return ['tax', 'other'];
  if (STUB_LABELS.net.test(l.trim())) return 'net';
  if (STUB_LABELS.gross.test(l.trim())) return 'gross';
  if (/\broth\b/.test(l)) return er ? ['er', 'retire'] : ['post', 'roth'];
  if (/\b(401 ?\(?k\)?|403 ?\(?b\)?|457 ?\(?b?\)?|tsp|retirement|pension|deferred comp)/.test(l)) {
    if (/\bloan\b/.test(l)) return ['post', 'other'];
    if (er) return ['er', 'retire'];
    return /after.?tax|post.?tax/.test(l) ? ['post', 'stock'] : ['pre', 'retire'];
  }
  if (/\bhsa\b|health savings/.test(l)) return er ? ['er', 'hsa'] : ['pre', 'hsa'];
  if (/\bfsa\b|flex(ible)? spend|dependent care|\bdcap\b|\bdcfsa\b|limited purpose/.test(l)) return ['pre', 'fsa'];
  if (/\b(espp|essp)\b|stock (purchase|plan)|savings plan|savings bond/.test(l)) return ['post', 'stock'];
  if (/\b(medical|dental|vision|health)\b/.test(l)) return er && section === 'er' ? ['er', 'other'] : /after.?tax|post.?tax/.test(l) || section === 'post' ? ['post', 'other'] : ['pre', 'premium'];
  if (/\b(life|ad&d|add|ltd|std|disability|accident|critical illness|legal|hospital)\b/.test(l)) return er && section === 'er' ? ['er', 'other'] : /pre.?tax/.test(l) || section === 'pre' || starred ? ['pre', 'other'] : ['post', 'life'];
  if (/^ (total|subtotal|ytd|year|current|this period|amount|description|earnings|deductions|taxes|withholdings?|net|gross|regular|salary|overtime|bonus|holiday|commission|page)\b/.test(l)) return null;
  if (section === 'pre') return ['pre', 'other'];
  if (section === 'post') return ['post', 'other'];
  if (section === 'tax' && /\btax\b/.test(l)) return ['tax', 'other'];
  if (section === 'ded') return starred || /pre.?tax|pretax|\bs125\b|section 125/.test(l) ? ['pre', 'other'] : ['post', 'other'];
  return null;
}
/* A heading that says which part of the stub the next rows are in */
function stubSection(text) {
  const l = text.toLowerCase();
  if (/employer (paid|contribution|benefit|match)|company (paid|contribution)|other benefits and/.test(l)) return 'er';
  if (/pre.?tax (deduction|benefit)|before.?tax deduction/.test(l)) return 'pre';
  if (/post.?tax deduction|after.?tax deduction/.test(l)) return 'post';
  if (/^(employee )?tax(es)?( withheld| deductions?)?$|withholdings?|statutory|employee taxes/.test(l.trim())) return 'tax';
  if (/^(employee |voluntary |other )?deductions?( from gross)?$|^other$/.test(l.trim())) return 'ded';
  if (/^(earnings|hours and earnings|pay|employee gross earnings)$/.test(l.trim())) return 'earn';
  if (/net pay distribution|payment information|direct deposit (distribution|information)/.test(l)) return 'dist';
  return null;
}
/* Do these lines look like a pay stub? Pay before tax, take-home pay and a tax taken out. */
function isPayStubLines(lines) {
  const t = lines.join('\n').toLowerCase();
  return /\bgross (pay|earnings|wages)\b|\btotal earnings\b|\btotal gross\b/.test(t) && /\bnet (pay|check|amount)\b/.test(t)
    && /federal income tax|fed(eral)? (w ?\/ ?h|with ?holding|tax)|\bfitw?\b|social security|\boasdi\b|\bmedicare\b|fica/.test(t);
}
/* Lines from the PDF reader (40-parse.js; each with its words and where they sit across the page) → the boxes of a
   stub. Amounts go to "this paycheck" or "year to date" by the column heading they sit under when the stub has them
   (Current, This Period, YTD…); otherwise the first amount after a label is this paycheck and the next is year to date. */
function parsePayStub(lines) {
  const text = lines.join('\n');
  const out = { gross: {}, net: {}, pre: [], tax: [], post: [], er: [], employer: '', date: '', from: '', to: '', deposit: '', found: 0, noText: text.replace(/\s/g, '').length < 20 };
  if (out.noText) return out;
  const pos = lines.pos || [];
  // each line as words and amounts with where they sit; a text run is split on spaces, each word placed by its share of the run
  const rows = lines.map((line, i) => {
    const toks = [], items = [];
    for (const it of pos[i] && pos[i].length ? pos[i] : [{ x: 0, w: line.length, s: line }]) {   // pieces that touch are one run (some PDFs draw a number a few characters at a time)
      const last = items[items.length - 1];
      if (last && it.x - (last.x + last.w) <= (it.fs || 10) * 0.15) { last.s += it.s; last.w = Math.max(last.w, it.x + (it.w || 0) - last.x); }
      else items.push({ x: it.x, w: it.w || 0, s: String(it.s) });
    }
    for (const it of items) {
      // "6 6 0 . 3 3" (an amount drawn one character at a time) is put back together
      const str = String(it.s).replace(/(?:^|(?<=\s))[-$(]?\d(?: [\d,.)*-]){3,}(?=\s|$)/g, m => (STUB_AMT.test(m.replace(/ /g, '')) ? m.replace(/ /g, '') : m)), per = str.length ? (it.w || 0) / str.length : 0;
      for (const m of str.matchAll(/\S+/g)) toks.push({ s: m[0], x0: it.x + m.index * per, x1: it.x + (m.index + m[0].length) * per });
    }
    return toks.filter(t => t.s !== '$').map(t => (STUB_AMT.test(t.s) ? { ...t, amt: stubNum(t.s), star: /\*$/.test(t.s) } : t));
  });
  // Column headings: where "this paycheck" and "year to date" amounts sit. Each table has its own, so an amount goes
  // by the headings on the nearest heading line above it (a line of two blocks side by side carries both blocks').
  const word = t => (t?.s || '').toLowerCase().replace(/[^a-z/-]/g, '');
  const lineHeads = rows.map(toks => {
    const hs = [];
    if (toks.some(t => t.amt != null)) return hs;
    for (let i = 0; i < toks.length; i++) {
      const one = word(toks[i]), next = word(toks[i + 1]), three = `${one} ${next} ${word(toks[i + 2])}`;
      if (/^(hours?|hrs|units?|hrs\/units|rate|qty)$/.test(one)) hs.push({ col: 'x', x0: (/^(ytd|current)$/.test(word(toks[i - 1])) ? toks[i - 1] : toks[i]).x0, x1: toks[i].x1 });   // hours and rates: not money
      else if (/^(ytd|y-t-d|year-to-date|current)$/.test(one) && /^(hours?|hrs|units?)$/.test(next)) continue;   // "YTD Hours": taken with the next word
      else if (/^(ytd|y-t-d|year-to-date)$/.test(one)) hs.push({ col: 'ytd', x0: toks[i].x0, x1: toks[i].x1 });
      else if (three === 'year to date' || three === 'total to date') hs.push({ col: 'ytd', x0: toks[i].x0, x1: toks[i + 2].x1 });
      else if (one === 'current' || one === 'amount') hs.push({ col: 'cur', x0: toks[i].x0, x1: toks[i].x1 });
      else if (`${one} ${next}` === 'this period') hs.push({ col: 'cur', x0: toks[i].x0, x1: toks[i + 1].x1 });
    }
    return hs.some(h => h.col !== 'x') ? hs : [];
  });
  let heads = [], useCols = false;
  const colOf = t => {   // the heading an amount sits under (right edges line up, or it overlaps the heading)
    let best = null, bd = 1e9;
    for (const h of heads) { const d = Math.min(Math.abs(h.x1 - t.x1), Math.abs((h.x0 + h.x1) / 2 - (t.x0 + t.x1) / 2)); if (d < bd) { bd = d; best = h; } }
    return best && bd <= 40 ? best.col : null;   // 'cur', 'ytd', or 'x' for a column of hours or rates
  };
  const seen = {};
  const put = (what, label, cur, ytd) => {
    if (cur == null && ytd == null) return;
    if (typeof what === 'string') { const g = out[what]; if (g.cur == null && cur != null) g.cur = cur; if (g.ytd == null && ytd != null) g.ytd = ytd; return; }
    const [block, kind] = what, clean = stubScrub(label), key = `${block}:${kind}:${clean.toLowerCase()}`;
    const single = block === 'tax' && kind !== 'other';   // one row each for federal, Social Security, Medicare and state
    const row = seen[single ? `${block}:${kind}` : key];
    if (row) { if (row.cur == null && cur != null) row.cur = cur; if (row.ytd == null && ytd != null) row.ytd = ytd; return; }
    const r = { kind, label: clean || STUB_BLOCKS[block][kind], cur: cur ?? null, ytd: ytd ?? null };
    out[block].push(r); seen[single ? `${block}:${kind}` : key] = r;
  };
  let section = null, deposited = null, alone = null, aloneLabel = '';
  rows.forEach((toks, li) => {
    const line = lines[li].trim(); if (!line) return;
    if (lineHeads[li].length) { heads = lineHeads[li]; useCols = !!lines.pos && heads.some(h => h.col === 'cur') && heads.some(h => h.col === 'ytd'); }
    if (!toks.some(t => t.amt != null)) {
      const s = stubSection(line.replace(/\s{2,}.*$/, '')) || (line.length < 40 ? stubSection(line) : null); if (s) section = s;
    }
    // a summary across the page: "Gross Pay  Pre Tax Deductions  Employee Taxes  Post Tax Deductions  Net Pay" over "Current …" and "YTD …"
    if (/gross/i.test(line) && /net pay/i.test(line) && !toks.some(t => t.amt != null)) {
      const at = re => { const i = toks.findIndex((t, j) => re.test(`${t.s} ${toks[j + 1]?.s || ''}`)); return i < 0 ? null : toks[i + 1].x1; };
      const gx = lines.pos ? at(/^gross (pay|earnings|wages)$/i) : null, nx2 = lines.pos ? at(/^net pay$/i) : null;
      const near = (am, x) => am.slice().sort((a, b) => Math.abs(a.x1 - x) - Math.abs(b.x1 - x))[0];
      for (const [k, f] of [[1, 'cur'], [2, 'ytd'], [3, 'ytd']]) {
        const nx = rows[li + k] || [], first = (lines[li + k] || '').trim().toLowerCase(), am = nx.filter(t => t.amt != null);
        if (am.length >= 2 && (f === 'cur' ? /^(current|this period)/.test(first) : /^(ytd|year)/.test(first))) {
          if (out.gross[f] == null) out.gross[f] = (gx != null ? near(am, gx) : am[0]).amt;
          if (out.net[f] == null) out.net[f] = (nx2 != null ? near(am, nx2) : am[am.length - 1]).amt;
        }
      }
      return;
    }
    if (/^(current|this period|ytd|year to date)\b/i.test(line) && /gross/i.test((lines[li - 1] || '') + (lines[li - 2] || '')) && /net pay/i.test((lines[li - 1] || '') + (lines[li - 2] || ''))) return;
    // label, then its amounts; a line can hold two blocks side by side. A line of amounts alone belongs to the pay
    // before tax or take-home named alone on the line above ("NET PAY" over "3,045.61   56,866.59").
    let words = toks.length && toks.every(t => t.amt != null) && ['gross', 'net'].includes(alone) ? [aloneLabel] : [];
    if (toks.some(t => t.amt != null)) alone = null;
    else if (!lineHeads[li].length) { alone = stubClassify(line.replace(/[:.\s]+$/, ''), null, false); aloneLabel = line; }   // a line of column headings between the two doesn't break it
    for (let i = 0; i < toks.length;) {
      if (toks[i].amt == null) { words.push(toks[i].s); i++; continue; }
      const nums = []; while (i < toks.length && toks[i].amt != null) nums.push(toks[i++]);
      const label = words.join(' ').replace(/[:.\s]+$/, ''); words = [];
      if (!label) continue;
      if (!/health|hsa|spending|fsa|401|403|457|retire|plan/i.test(label) && (section === 'dist' || STUB_LABELS.deposit.test(label.toLowerCase()) || /\b(checking|savings|account (number|no|#))\b/i.test(label))) {
        if (/\bdirect deposit\b|net (pay )?distribution/i.test(label) && section !== 'dist') deposited = deposited ?? nums[0].amt;   // take-home, if the stub never says "Net Pay"
        continue;
      }
      const what = stubClassify(label, section, nums.some(n => n.star)); if (!what) continue;
      let cur = null, ytd = null;
      if (useCols) {
        for (const n of nums) { const c = colOf(n); if (c === 'cur' && cur == null) cur = n.amt; else if (c === 'ytd' && ytd == null) ytd = n.amt; }
        if (cur == null && ytd == null) { cur = nums[nums.length > 2 ? nums.length - 2 : 0].amt; ytd = nums.length > 1 ? nums[nums.length - 1].amt : null; }
      } else if (nums.length === 1) cur = nums[0].amt;
      else if (what === 'gross' && nums.length === 4 && Math.abs(nums[0].amt * nums[1].amt - nums[2].amt) > nums[2].amt * 0.02 && nums[2].amt >= nums[0].amt && nums[3].amt >= nums[1].amt) { cur = nums[1].amt; ytd = nums[3].amt; }   // hours, this period, hours to date, year to date
      else { cur = nums[nums.length - 2].amt; ytd = nums[nums.length - 1].amt; }
      if (ytd != null && cur != null && ytd < cur && !useCols) [cur, ytd] = [ytd, cur];   // year to date is never the smaller one
      put(what, label, cur, ytd);
    }
  });
  if (out.net.cur == null && deposited != null) out.net.cur = deposited;
  // the account the pay went to: its last four digits and nothing more
  for (const line of lines) {
    if (out.deposit || !/\b(checking|savings|direct deposit|deposit|account)\b/i.test(line) || /health savings|hsa|spending|fsa/i.test(line)) continue;
    const acct = /[x*•#]{2,}[-\s]?(\d{2,})\b|\baccount(?: number| no\.?| #)?:?\s*[x*•#-]*(\d{4,})\b/i.exec(line);
    if (acct) out.deposit = stubEnding(acct[1] || acct[2]);
  }
  // dates: "Pay Date: 11/20/2026", "Period Beginning 11/02/2026", or a row of headings over a row of dates
  const iso = s => parseDateFlexible(s) || '';
  const DATE_KEYS = [['date', /\b(pay|check|payment|advice|paid)\s*date\b|\bdate paid\b|\bpay day\b/i], ['from', /\b(period|pay)\s*(begin(ning)?|start|beg)\b|\bbegin(ning)? date\b|\bstart date\b/i], ['to', /\b(period|pay)\s*(end(ing)?|thru|through)\b|\bend(ing)? date\b/i]];
  lines.forEach((line, li) => {
    for (const [k, re] of DATE_KEYS) {
      if (out[k]) continue;
      const m = re.exec(line); if (!m) continue;
      const after = STUB_DATE.exec(line.slice(m.index + m[0].length));
      if (after && !/[a-z]{4,}/i.test(line.slice(m.index + m[0].length, m.index + m[0].length + after.index).replace(/date|end|ending|beginning|begin|start|period/gi, ''))) { out[k] = iso(after[1]); continue; }
      // headings on this line, dates on the next: the date in the same place along the line
      const found = DATE_KEYS.map(([kk, r2]) => ({ kk, at: line.search(r2) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at), ds = ((lines[li + 1] || '').match(STUB_DATE_ALL) || []);
      const idx = found.findIndex(x => x.kk === k);
      if (!STUB_DATE.test(line) && ds.length && ds.length >= found.length && idx >= 0) out[k] = iso(ds[idx + (ds.length - found.length)]);
    }
    const range = /\b(?:pay )?period:?\s*(\S+(?: \d{1,2},? \d{4})?)\s*(?:-|–|—|to|through|thru)\s*(\S+(?: \d{1,2},? \d{4})?)/i.exec(line);
    if (range && iso(range[1]) && iso(range[2])) { if (!out.from) out.from = iso(range[1]); if (!out.to) out.to = iso(range[2]); }
  });
  // the employer: a line that says so, else the first line near the top that reads like a company's name
  const emp = /\b(?:employer|company)(?: name)?\s*[:\-]\s*([^\n]+?)(?:\s{3,}|$)/im.exec(text);
  const co = lines.slice(0, 14).map(l => l.split(/\s{3,}/)[0].trim()).filter(l => l.length >= 5 && /\S \S/.test(l)).find(l => /\b(inc|llc|l\.l\.c|corp|corporation|company|co|ltd|lp|llp|pllc|pc|group|associates|partners|university|college|hospital|schools?|district|foundation|bank)\b\.?,?$/i.test(l) && l.length <= 60 && !STUB_DATE.test(l));
  out.employer = stubScrub((emp ? emp[1] : co) || '');
  for (const b of ['pre', 'tax', 'post', 'er']) out[b] = out[b].filter(r => r.cur != null || r.ytd != null);
  out.found = [out.gross.cur, out.net.cur, ...['pre', 'tax', 'post', 'er'].flatMap(b => out[b].map(r => r.cur ?? r.ytd))].filter(v => v != null).length;
  return out;
}
