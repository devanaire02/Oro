/* ================= Check-in: what needs you today, this week or this month =================
   One thing at a time: transactions to sort (with Ọrọ̀'s best guess and why), flagged ones, bills and paychecks that
   usually show up by now, accounts that haven't been imported lately, balances to update, budgets running over and what's
   coming up. Each card is answered by tapping, or by typing or dictating into the answer box, and can be read aloud with the
   device's built-in voice. All of it runs on the device; nothing is sent anywhere. */
const CI_WINDOWS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month']];
const CI = { w: 'week', handled: [], skipped: new Set(), older: false, talking: false, heard: '', last: null, back: null, choose: null, wParam: '', sayBack: '', draft: null, addParam: '' };
function ciReset() {
  Object.assign(CI, { w: 'week', handled: [], skipped: new Set(), older: false, talking: false, heard: '', last: null, back: null, choose: null, wParam: '', sayBack: '', draft: null, addParam: '', talkParam: '', intro: false, ai: null });
  ciHush();
}
const checkinOn = () => state.settings.checkin !== false;

/* ---------- reading aloud (this device only) ---------- */
const VOICE_DEFAULTS = { on: false, amounts: true, rate: 1, voice: '', box: true, talk: true };
let VOICE_MEM = null;   // if browser storage is blocked, preferences last for this session
function voicePrefs() {
  if (VOICE_MEM) return { ...VOICE_MEM };
  try { return { ...VOICE_DEFAULTS, ...JSON.parse(localStorage.getItem('oro.voice') || '{}') }; } catch (e) { return { ...VOICE_DEFAULTS }; }
}
function setVoicePref(k, v) {
  const p = voicePrefs(); p[k] = v;
  try { localStorage.setItem('oro.voice', JSON.stringify(p)); VOICE_MEM = null; } catch (e) { VOICE_MEM = p; }
}
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
const speakOn = () => canSpeak() && voicePrefs().on;
/* The iPhone hands web pages its voice list only some of the time (often not right after the app opens or a page
   changes), so the list is remembered once seen: the menu keeps every voice and your choice, and speaking finds the
   real voice again by its id whenever the phone offers it. Novelty voices (Bells, Bubbles, Zarvox…) are left out. */
const NOVELTY_VOICES = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical)\b/;
let LIVE_VOICES = [];
function liveVoices() {
  if (!canSpeak()) return [];
  let vs = [];
  try { vs = speechSynthesis.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang) && !NOVELTY_VOICES.test(v.name)); } catch (e) { /* none yet */ }
  if (vs.length) {
    LIVE_VOICES = vs;
    try { localStorage.setItem('oro.voices', JSON.stringify(vs.map(v => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, default: !!v.default })))); } catch (e) { /* storage blocked */ }
  }
  return LIVE_VOICES;
}
function englishVoices() {
  const live = liveVoices();
  if (live.length) return live;
  try { return JSON.parse(localStorage.getItem('oro.voices') || '[]'); } catch (e) { return []; }
}
const sameVoice = (v, p) => !!v && !!p.voice && (v.voiceURI === p.voice || (!!p.voiceName && v.name === p.voiceName));
function pickVoice(p = voicePrefs(), vs = englishVoices()) {
  const us = vs.filter(v => /^en[-_]US$/i.test(v.lang));
  return vs.find(v => sameVoice(v, p)) || us.find(v => /premium|enhanced/i.test(v.name)) || us.find(v => /^(Samantha|Ava|Allison|Nicky|Evan|Zoe)\b/.test(v.name))
    || us.find(v => v.default) || us[0] || vs.find(v => v.default) || vs[0] || null;
}
const isRealVoice = v => !!v && (typeof SpeechSynthesisVoice === 'undefined' || v instanceof SpeechSynthesisVoice);
function voiceLabel(v) {
  const region = String(v.lang || '').split(/[-_]/)[1];
  let place = region || '';
  try { if (region) place = ({ US: 'US', GB: 'UK' })[region.toUpperCase()] || new Intl.DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase()); } catch (e) { /* keep the code */ }
  return `${v.name}${place ? ` (${place})` : ''}`;
}
function voiceOptions(p, dev) {
  const vs = englishVoices().slice().sort((a, b) => (/^en[-_]US$/i.test(b.lang) - /^en[-_]US$/i.test(a.lang)) || voiceLabel(a).localeCompare(voiceLabel(b)));
  const cur = pickVoice(p, vs);
  const saved = p.voice && !vs.some(v => sameVoice(v, p)) ? `<option value="${esc(p.voice)}" selected>${esc(p.voiceName || 'Your chosen voice')}</option>` : '';
  if (!vs.length) return saved || `<option value="">This ${dev}’s default voice</option>`;
  return saved + vs.map(v => `<option value="${esc(v.voiceURI)}" ${!saved && cur && v.voiceURI === cur.voiceURI ? 'selected' : ''}>${esc(voiceLabel(v))}</option>`).join('');
}
/* Fill in the voice menu when the phone gets round to listing its voices, without redrawing the page (an open menu stays open) */
function refreshVoiceMenu() {
  const sel = document.querySelector('select[data-voice="voice"]');
  if (!sel || document.activeElement === sel) return;
  const html = voiceOptions(voicePrefs(), isCompanion() ? deviceLabel() : 'Mac');
  if (sel.innerHTML !== html) sel.innerHTML = html;
}
function ciSpeak(text) {
  if (!canSpeak() || !text) return;
  try {
    speechSynthesis.cancel();
    const p = voicePrefs(), u = new SpeechSynthesisUtterance(text), live = liveVoices(), chosen = englishVoices().find(v => sameVoice(v, p));
    const v = pickVoice(p, live);
    if (isRealVoice(v) && (!chosen || sameVoice(v, p))) { u.voice = v; u.lang = v.lang; }
    else u.lang = chosen?.lang || 'en-US';   // the phone isn't listing voices right now: ask for the language and let it choose
    u.rate = clamp(Number(p.rate) || 1, 0.6, 1.6);
    speechSynthesis.speak(u);
  } catch (e) { /* no voice available */ }
}
function ciHush() { try { if (canSpeak()) speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
/* Amounts as they should be spoken, or left out when "Say amounts out loud" is off or privacy mode is on */
const sayMoney = n => voicePrefs().amounts && !state.settings.privacy ? money(Math.abs(n), { cents: Math.abs(n) % 1 > 0.004 }) : '';
function sayDate(iso) {
  const d = daysBetween(iso, today());
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d > 1 && d < 7) return 'on ' + fromISO(iso).toLocaleDateString('en-US', { weekday: 'long' });
  return 'on ' + MONTHS[+iso.slice(5, 7) - 1] + ' ' + +iso.slice(8);
}
function shortDay(iso) {
  const d = daysBetween(iso, today());
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d > 1 && d < 7) return fromISO(iso).toLocaleDateString('en-US', { weekday: 'short' }) + ', ' + dateLabel(iso);
  return dateLabel(iso);
}

/* ---------- the window: what counts as new ---------- */
function ciWindow(w) {
  const now = today();
  if (w === 'day') return { w, label: 'Today', from: addDays(now, -1), added: now, ahead: addDays(now, 1) };
  if (w === 'month') {
    const start = thisMonth() + '-01', end = monthEnd(thisMonth());
    return { w, label: 'This month', from: start, added: start, ahead: end < addDays(now, 7) ? addDays(now, 7) : end };
  }
  return { w: 'week', label: 'This week', from: addDays(now, -6), added: addDays(now, -6), ahead: addDays(now, 7) };
}
/* New in the window: dated in it, or imported or added in it (a file imported today with last week's charges counts as today) */
const ciInWindow = (t, win) => t.date >= win.from || (!!t.added && t.added >= win.added);
const ciNeeds = t => isUncat(t) || !!t.flag;

/* ---------- Ọrọ̀'s best guess for a transaction, and why ---------- */
function ciHistory() {
  return memo('ci:hist', () => {
    const m = new Map();
    for (const t of state.transactions) {
      if (!t.categoryId || isSplit(t)) continue;
      const k = merchantKey(t.rawPayee || t.payee); if (!k) continue;
      const c = m.get(k) || {}; c[t.categoryId] = (c[t.categoryId] || 0) + 1; m.set(k, c);
    }
    return m;
  });
}
function ciGuess(t) {
  const src = t.rawPayee || t.payee;
  const rule = matchRule(src, t);
  if (rule && catById(rule.categoryId)) return { id: rule.categoryId, sure: true, person: rule.person, why: rule.text ? `Your rule for “${prettyPayee(rule.text)}”` : 'One of your rules' };
  const g = autoCategory(src, t.amount, { mcc: t.mcc, bankCategory: t.bankCategory }, memo('ci:cathist', categoryHistory));
  if (!g || !catById(g.id)) return null;
  if (g.how === 'history') {
    const c = ciHistory().get(merchantKey(src)) || {}, n = c[g.id] || 0, total = sum(Object.values(c));
    return { id: g.id, sure: true, why: n <= 1 ? 'Same as last time there' : n === total ? `Your last ${n} there were` : `${n} of your ${total} there were` };
  }
  return { id: g.id, sure: false, why: GUESS_WHY[g.how] || 'A guess' };
}
/* Other likely categories: what you've used for this merchant, then what this account usually gets */
function ciAlternatives(t, guessId) {
  const out = [], add = id => { if (id && id !== guessId && catById(id) && !out.includes(id)) out.push(id); };
  const c = ciHistory().get(merchantKey(t.rawPayee || t.payee)) || {};
  Object.entries(c).sort((a, b) => b[1] - a[1]).forEach(([id]) => add(id));
  const since = addDays(today(), -180), counts = {};
  for (const x of txByAccount(t.accountId)) {
    if (x.date < since || !x.categoryId || isSplit(x) || Math.sign(x.amount) !== Math.sign(t.amount) || isTransferCat(x.categoryId)) continue;
    counts[x.categoryId] = (counts[x.categoryId] || 0) + 1;
  }
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([id]) => add(id));
  return out.slice(0, 4);
}

/* ---------- bills and paychecks that usually show up by now ---------- */
const BILL_FILLER = new Set(['PAYMENT', 'PAYMENTS', 'BILL', 'AUTOPAY', 'AUTO', 'PAY', 'MONTHLY', 'ONLINE', 'ACH', 'DEBIT', 'THE', 'AND', 'INC', 'LLC', 'CORP', 'SERVICE', 'SERVICES', 'COMPANY']);
const billWords = s => normPayee(s).split(' ').filter(w => w.length >= 3 && !BILL_FILLER.has(w));
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const approx = n => money(Math.abs(n), { cents: Math.abs(n) % 1 > 0.004 });
const clampDay = (mk, day) => `${mk}-${pad2(Math.min(Math.max(1, day), +monthEnd(mk).slice(8)))}`;
function shiftMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number), first = new Date(y, m - 1 + n, 1);
  return clampDay(`${first.getFullYear()}-${pad2(first.getMonth() + 1)}`, d);
}
function prevOccurrence(iso, freq) {
  switch (freq) {
    case 'weekly': return addDays(iso, -7);
    case 'biweekly': return addDays(iso, -14);
    case 'semimonthly': { const d = +iso.slice(8); return d >= 16 ? addDays(iso, -15) : shiftMonthsISO(iso.slice(0, 8) + pad2(Math.min(28, d + 15)), -1); }
    case 'quarterly': return shiftMonthsISO(iso, -3);
    case 'semiannual': return shiftMonthsISO(iso, -6);
    case 'annual': return shiftMonthsISO(iso, -12);
    default: return shiftMonthsISO(iso, -1);
  }
}
/* The latest date a scheduled bill or paycheck was due, if that was 4 to 31 days ago */
function ciLastDue(r, now = today()) {
  const lo = addDays(now, -31), hi = addDays(now, -4);
  let d = r.nextDate, guard = 0;
  if (!d) return null;
  if (d > hi) while (d > hi && guard++ < 400) d = prevOccurrence(d, r.freq);
  else while (guard++ < 1600) { const n = nextOccurrence(d, r.freq); if (n > hi) break; d = n; }
  return d >= lo && d <= hi ? d : null;
}
function ciQuiet(key, last) {
  const v = (state.settings.checkinQuiet || {})[key];
  if (!v) return false;
  if (v === thisMonth()) return true;                              // "not this month"
  return v.startsWith('stop:') && (!last || last <= v.slice(5));  // "it stopped", until it shows up again
}
function ciMissing() {
  return memo('ci:missing', () => {
    const now = today(), mk = thisMonth(), out = [];
    const loans = activeAccounts().filter(isTrackedLoan);
    const lastFrom = list => list.length ? list.reduce((a, b) => (b.date > a.date ? b : a)) : null;
    // 1. mortgages and loans whose payments Ọrọ̀ follows
    for (const a of loans) {
      const tr = loanTrack(a), pays = state.transactions.filter(t => loanMatches(a, t)), last = lastFrom(pays);
      const day = +((a.amort.firstPayment || last?.date || '').slice(8)) || 1, due = clampDay(mk, day);
      if (daysBetween(due, now) < 5 || pays.some(t => t.date >= addDays(due, -12)) || ciQuiet('loan:' + a.id)) continue;
      out.push({ key: 'loan:' + a.id, kind: 'missing', name: a.name, what: 'payment', amount: -(round2((tr.pi || 0) + (tr.escrow || 0)) || (last ? -last.amount : 0)), due, from: last?.accountId || null, last: last?.date || null, loan: a.id });
    }
    const coveredByLoan = name => loans.some(a => { const m = normPayee(a.amort.match), n = normPayee(name); return m && (n.includes(m) || m.includes(n)); });
    // 2. bills and paychecks you scheduled on Cash flow
    for (const r of state.recurring) {
      const amt = Number(r.amount) || 0; if (!amt || coveredByLoan(r.name)) continue;
      const due = ciLastDue(r, now); if (!due) continue;
      const words = billWords(r.name);
      const like = t => Math.sign(t.amount) === Math.sign(amt) && ((words.length && words.some(w => normPayee(t.rawPayee || t.payee).split(' ').includes(w)))
        || (r.categoryId && txLines(t).some(l => l.categoryId === r.categoryId) && Math.abs(Math.abs(t.amount) - Math.abs(amt)) <= Math.abs(amt) * 0.25));
      const matches = state.transactions.filter(like);
      if (!matches.length) continue;   // never seen it come through, so there's no "usually"
      if (matches.some(t => t.date >= addDays(due, -8) && t.date <= addDays(due, 12)) || ciQuiet('rec:' + r.id)) continue;
      const last = lastFrom(matches);
      out.push({ key: 'rec:' + r.id, kind: 'missing', name: r.name, what: amt > 0 ? 'deposit' : 'bill', amount: amt, due, from: last.accountId || null, last: last.date, rec: r.id });
    }
    // 3. repeating charges Ọrọ̀ noticed but you haven't scheduled
    for (const d of detectRepeating()) {
      if (d.tracked || coveredByLoan(d.payee)) continue;
      const list = state.transactions.filter(t => t.amount < 0 && normPayee(t.payee) === d.key).sort((a, b) => b.date.localeCompare(a.date));
      if (!list.length || daysBetween(list[0].date, now) > 75) continue;   // it stopped a while ago
      const days = list.slice(0, 4).map(t => +t.date.slice(8)).sort((a, b) => a - b), due = clampDay(mk, days[Math.floor(days.length / 2)]);
      if (daysBetween(due, now) < 4 || list[0].date >= addDays(due, -10) || ciQuiet('rep:' + d.key, list[0].date)) continue;
      out.push({ key: 'rep:' + d.key, kind: 'missing', name: d.payee, what: 'charge', amount: -d.monthly, due, from: list[0].accountId, last: list[0].date, rep: d.key });
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  });
}

/* ---------- accounts that haven't been imported lately ---------- */
function ciImportsDue() {
  return memo('ci:imports', () => {
    const now = today(), out = [];
    for (const a of activeAccounts()) {
      if (!['checking', 'savings', 'credit'].includes(a.type)) continue;
      const txs = txByAccount(a.id);
      if (!txs.some(t => t.importId)) continue;   // only accounts you import into
      const newest = txs.reduce((m, t) => (t.date > m ? t.date : m), '');
      const age = daysBetween(newest, now);
      if (age > (a.type === 'savings' ? 40 : 10)) out.push({ key: 'imp:' + a.id, accountId: a.id, newest, age });
    }
    return out.sort((a, b) => b.age - a.age);
  });
}
const ciStaleImport = id => ciImportsDue().find(x => x.accountId === id);
function ciStaleBalances() {
  return activeAccounts().filter(a => !holdingsFor(a.id).length && !a.ledger && !isTrackedLoan(a) && a.balanceDate && ['cash', 'invest', 'debt'].includes(ACCOUNT_TYPES[a.type]?.bucket)
    && daysBetween(a.balanceDate, today()) > (state.settings.staleDays || 35));
}
function ciBudgets() {
  const mk = thisMonth();
  return state.categories.filter(c => c.kind === 'expense' && c.budget > 0 && c.period !== 'year').map(c => ({ c, v: budgetView(c, mk) }))
    .filter(x => x.v.available < -0.01 || x.v.actual >= (x.v.budget + (x.v.carry || 0)) * 0.9)
    .sort((a, b) => a.v.available - b.v.available).slice(0, 6);
}

/* ---------- everything for a window, in the order it's worth doing ---------- */
function ciItems(w) {
  const win = ciWindow(w), now = today(), items = [];
  const got = SYNC.rec?.openedAt || SYNC.rec?.macSaved;
  if (isCompanion() && got && daysBetween(got.slice(0, 10), now) >= 2) items.push({ id: 'copy:' + got, kind: 'copy', got });
  for (const x of ciGaps()) items.push(x);
  for (const x of ciImportsDue()) items.push({ id: `${x.key}:${x.newest}`, kind: 'import', ...x });
  for (const x of ciMissing()) items.push({ id: `${x.key}:${x.due}`, ...x });
  const txs = state.transactions.filter(t => ciNeeds(t) && (CI.older || ciInWindow(t, win))).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  for (const t of txs) items.push({ id: 'tx:' + t.id, kind: t.flag ? 'flag' : 'uncat', tx: t.id });
  if (w !== 'day') for (const a of ciStaleBalances()) items.push({ id: `bal:${a.id}:${a.balanceDate}`, kind: 'balance', accountId: a.id });
  if (w !== 'day') for (const c of cryptoStale()) items.push({ id: `coin:${c.symbol}:${c.priceDate}`, kind: 'coin', symbol: c.symbol });   // crypto prices older than a week
  if (w !== 'day') { const b = ciBudgets(); if (b.length) items.push({ id: `budget:${thisMonth()}:${b.map(x => x.c.id).join(',')}`, kind: 'budget', list: b }); }
  const due = upcoming(Math.max(1, daysBetween(now, win.ahead)));
  if (due.length) items.push({ id: `due:${w}:${now}`, kind: 'due', list: due });
  if (!CI.older) { const n = state.transactions.filter(t => ciNeeds(t) && !ciInWindow(t, win)).length; if (n) items.push({ id: 'older:' + w, kind: 'older', n }); }
  if (w === 'month') {
    const lm = addMonths(thisMonth(), -1);
    if (state.transactions.some(t => t.date.startsWith(lm)) && !state.reviews[lm]?.completedAt) items.push({ id: 'review:' + lm, kind: 'review', month: lm });
  }
  if (isCompanion() && SYNC.rec) { const n = syncPending().length; if (n) items.push({ id: 'send', kind: 'send', n }); }
  return { win, items };
}
/* What's left, what was skipped, and the card to show now */
function ciQueue() {
  const { win, items } = ciItems(CI.w);
  const done = new Map(CI.handled.map(h => [h.id, h.what]));
  const again = i => { const t = i.tx && ciTx(i); return done.get(i.id) === 'sorted' && !!t && ciNeeds(t) && !(i.kind === 'flag' && t.categoryId); };   // undone since
  const left = items.filter(i => !done.has(i.id) || again(i));
  const handled = CI.handled.filter(h => !left.some(i => i.id === h.id));
  const cur = CI.back || left[0] || null;
  const extra = CI.back && !left.some(i => i.id === CI.back.id) ? 1 : 0;
  return { win, items, left, cur, pos: handled.length + 1, total: handled.length + left.length + extra };
}
/* How many things a window has for you (Overview's button and the More list) */
function ciCount(w = 'week') {
  return memo('ci:count:' + w, () => {
    const keep = CI.older; CI.older = false;
    try { return ciItems(w).items.filter(i => !['due', 'budget', 'older'].includes(i.kind)).length; } finally { CI.older = keep; }
  });
}

/* ---------- the opening line ---------- */
const listWords = a => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
function ciSummary(items, win, spoken) {
  const n = k => items.filter(i => i.kind === k).length, parts = [];
  const lead = win.w === 'day' ? 'Today' : win.w === 'week' ? 'This week' : 'This month';
  const cp = items.find(i => i.kind === 'copy');
  if (cp) parts.push(`you last got your Mac’s data ${whenLabel(cp.got)}, so get the latest first`);
  const unc = n('uncat'), fl = n('flag');
  if (unc) parts.push(`${unc} transaction${unc === 1 ? '' : 's'} to sort`);
  if (fl) parts.push(`${fl} flagged`);
  const miss = items.filter(i => i.kind === 'missing');
  if (miss.length === 1) parts.push(`${miss[0].name} hasn’t shown up yet`);
  else if (miss.length === 2) parts.push(`${miss[0].name} and ${miss[1].name} haven’t shown up yet`);
  else if (miss.length) parts.push(`${miss.length} bills or deposits haven’t shown up yet`);
  const imp = items.filter(i => i.kind === 'import');
  if (imp.length === 1) parts.push(`${acctById(imp[0].accountId)?.name || 'one account'} hasn’t been imported since ${spoken ? MONTHS[+imp[0].newest.slice(5, 7) - 1] + ' ' + +imp[0].newest.slice(8) : dateLabel(imp[0].newest)}`);
  else if (imp.length) parts.push(`${imp.length} accounts haven’t been imported lately`);
  const bal = n('balance'); if (bal) parts.push(`${bal} balance${bal === 1 ? '' : 's'} to update`);
  const coins = n('coin'); if (coins) parts.push(`${coins} crypto price${coins === 1 ? '' : 's'} to update`);
  const bud = items.find(i => i.kind === 'budget');
  if (bud) { const over = bud.list.filter(x => x.v.available < -0.01); if (over.length) parts.push(`${listWords(over.slice(0, 2).map(x => x.c.name))}${over.length > 2 ? ' and more' : ''} ${over.length === 1 ? 'is' : 'are'} over budget`); }
  if (items.some(i => i.kind === 'review')) parts.push(`${MONTHS[+items.find(i => i.kind === 'review').month.slice(5) - 1]} still needs its review`);
  const send = items.find(i => i.kind === 'send'); if (send) parts.push(`${changesWord(send.n)} to send to your Mac`);
  const due = items.find(i => i.kind === 'due');
  if (!parts.length) {
    const tail = due ? ` Coming up: ${listWords(due.list.slice(0, 2).map(u => u.name))}.` : '';
    return `${lead === 'Today' ? 'Today' : lead}, you’re all caught up.${tail}`;
  }
  return `${lead}: ${listWords(parts)}.`;
}
/* Opened from Accounts: what you can say to add or update */
function ciIntroHtml() {
  return `<section class="panel ci-card tell-card"><div class="ci-top"><span class="ci-kicker">Add or update by talking</span></div>
    <p class="ci-guess tell-q">What would you like to add or change?</p>
    <ul class="ci-examples muted">
      <li>“Chase savings is 12,400” · “the home is worth 675k”</li>
      <li>“Alex’s 401k is 312,000 and the Roth is 85k”</li>
      <li>“rename the Amex to Blue Cash” · “Sam’s card ends in 1234”</li>
      <li>“change the owner of the brokerage to Julissa” · “the mortgage rate is 6.125 percent”</li>
      <li>“add a savings account at Ally with 40,000” · “archive the old Citi card”</li>
    </ul>
    <div class="ci-actions"><button class="btn" data-ci="tell-start" data-v="account">Add an account</button><button class="btn" data-ci="tell-start" data-v="property">Add a property</button><a class="btn ghost" href="#/accounts?update=1">Type in balances instead</a></div>
    <div class="ci-foot"><button class="btn ghost" data-ci="intro-close">Back to Check-in</button></div></section>`;
}
/* The Check-in button on Overview, with how many things this week has for you */
function ciButton() {
  if (!checkinOn()) return '';
  const n = ciCount('week');
  return `<a class="btn ci-open" href="#/checkin"${n ? ` aria-label="Check-in, ${n} thing${n === 1 ? '' : 's'} this week"` : ''}>Check-in${n ? ` <span class="ci-badge">${n}</span>` : ''}</a>`;
}
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.'; }

/* ---------- each card: what it shows, and what it says ---------- */
const kindLabel = { gap: 'Missing something', uncat: 'Needs a category', flag: 'You flagged this', missing: 'Hasn’t shown up', import: 'Time to import', balance: 'Update a balance', budget: 'Budgets', due: 'Coming up', older: 'Older ones', send: 'Send to your Mac', review: 'Monthly review', copy: 'Get the latest first' };
function ciTx(item) { return state.transactions.find(t => t.id === item.tx); }
function ciCardSpeech(item) {
  if (!item) return '';
  const t = item.tx ? ciTx(item) : null;
  if (t) {
    const a = acctById(t.accountId), g = isUncat(t) ? ciGuess(t) : null, amt = sayMoney(t.amount);
    let s = `${item.kind === 'flag' ? 'You flagged this one. ' : ''}${prettyPayee(t.payee) || t.payee}, ${amt ? (t.amount > 0 ? `a ${amt} deposit` : amt) + ', ' : ''}${sayDate(t.date)}${a ? `, ${a.type === 'credit' ? 'on' : 'from'} ${a.name}` : ''}.`;
    if (t.memo) s += ` The note says: ${t.memo}.`;
    if (!isUncat(t)) s += ` It’s filed under ${catName(t.categoryId)}.`;
    else if (g) s += ` I think it’s ${catName(g.id)}. ${g.why}.`;
    else s += ' I don’t have a guess for this one. What is it?';
    return s;
  }
  switch (item.kind) {
    case 'gap': return gapSpeech(item);
    case 'missing': {
      const amt = sayMoney(item.amount), from = item.from && acctById(item.from), stale = item.from && ciStaleImport(item.from);
      return `${item.name}${amt ? `, about ${amt},` : ''} usually ${item.what === 'deposit' ? 'comes in' : 'shows up'} around the ${ordinal(+item.due.slice(8))}, and it hasn’t yet.${item.last ? ` Last seen ${sayDate(item.last).replace(/^on /, '')}.` : ''}${stale ? ` ${from.name} hasn’t been imported since ${MONTHS[+stale.newest.slice(5, 7) - 1]} ${+stale.newest.slice(8)}, so it may just need an import.` : ''}`;
    }
    case 'import': { const a = acctById(item.accountId); return `${a?.name || 'This account'}’s newest transaction is from ${MONTHS[+item.newest.slice(5, 7) - 1]} ${+item.newest.slice(8)}, ${item.age} days ago. Time to import a fresh file.`; }
    case 'balance': { const a = acctById(item.accountId); return `${a?.name} was last updated ${sayDate(a.balanceDate)}. What’s the balance now?`; }
    case 'coin': { const c = cryptoHeld().find(x => x.symbol === item.symbol); return c ? `${c.name}’s price was last updated ${c.priceDate ? sayDate(c.priceDate) : 'a while ago'}. What is it now?` : ''; }
    case 'budget': return item.list.map(x => x.v.available < -0.01 ? `${x.c.name} is over by ${sayMoney(-x.v.available) || 'a bit'}` : `${x.c.name} is ${pct(x.v.actual / Math.max(1, x.v.budget + (x.v.carry || 0)), 0)} used`).join('. ') + '.';
    case 'due': return 'Coming up: ' + item.list.slice(0, 4).map(u => `${u.name}${sayMoney(u.amount) ? ', ' + sayMoney(u.amount) : ''}, ${sayDate(u.date)}`).join('; ') + '.';
    case 'older': return `There ${item.n === 1 ? 'is' : 'are'} also ${item.n} older transaction${item.n === 1 ? '' : 's'} that still need you. Go through them too?`;
    case 'send': return `${changesWord(item.n)} on this ${deviceLabel()} ${item.n === 1 ? 'isn’t' : 'aren’t'} on your Mac yet. Send ${item.n === 1 ? 'it' : 'them'} now?`;
    case 'review': return `${MONTHS[+item.month.slice(5) - 1]} hasn’t been reviewed yet. Start the review?`;
    case 'copy': return `You last got your Mac’s data ${whenLabel(item.got)}. Get the latest first, so you’re working from the newest copy.`;
  }
  return '';
}

function ciCardHtml(item, q) {
  const head = `<div class="ci-top"><span class="ci-kicker">${kindLabel[item.kind] || ''}</span><span class="ci-count">${q.pos} of ${q.total}</span>${speakOn() ? `<button class="icon-btn ci-speak" data-ci="say-card" aria-label="Read this aloud" title="Read this aloud">${SPEAKER_ICON}</button>` : ''}</div>`;
  const foot = extra => `<div class="ci-foot"><button class="btn ghost" data-ci="back" ${CI.handled.length ? '' : 'disabled'}>Back</button>${extra || ''}<button class="btn ghost" data-ci="skip">Skip</button></div>`;
  const t = item.tx ? ciTx(item) : null;
  if (item.tx && !t) return '';
  if (t) {
    const a = acctById(t.accountId), uncat = isUncat(t), g = uncat ? ciGuess(t) : null;
    const alts = ciAlternatives(t, g?.id), owner = memberName(a?.owner || 'joint');
    const key = ruleKeyFor(t.rawPayee || t.payee, t.id);
    const choosing = CI.choose && CI.choose.id === item.id ? CI.choose.options : null;
    return `<section class="panel ci-card" data-ci-item="${esc(item.id)}">${head}
      <h2 class="ci-title">${esc(prettyPayee(t.payee) || t.payee)}</h2>
      <div class="ci-amount num ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${money(Math.abs(t.amount))}</div>
      <p class="ci-meta">${esc(shortDay(t.date))}${a ? ` · ${esc(a.name)}` : ''}${members().length > 1 ? ` · ${esc(memberName(personOf(t)))}` : ''}</p>
      ${t.memo ? `<p class="ci-memo">${esc(t.memo)}</p>` : ''}
      ${!uncat ? `<p class="ci-guess">Filed under <strong>${esc(catName(t.categoryId))}</strong>. Pick a category to sort it out, or keep it as it is.</p>`
        : g ? `<p class="ci-guess">I think it’s <strong>${esc(catName(g.id))}</strong><span class="muted"> · ${esc(g.why)}</span></p>` : `<p class="ci-guess muted">No guess for this one yet.${aiReady() && !CI.ai ? ` <button class="linklike ai-guess" data-ci="ai-guess">${AI_SPARK} Ask Claude</button>` : ''}</p>`}
      ${choosing ? `<p class="ci-choose">Did you mean:</p><div class="ci-chips">${choosing.map(id => `<button class="ci-chip on" data-ci="cat" data-v="${id}">${esc(catName(id))}</button>`).join('')}</div>` : ''}
      <div class="ci-actions">
        ${g ? `<button class="btn primary ci-yes" data-ci="yes">Yes, ${esc(catName(g.id))}</button>` : !uncat ? '<button class="btn primary ci-yes" data-ci="unflag">Keep it, clear the flag</button>' : ''}
        <select class="ci-pick" data-ci-cat aria-label="Pick a category"><option value="">${g || !uncat ? 'Something else…' : 'Pick a category…'}</option>${catOptions('', false)}</select>
      </div>
      ${alts.length && !choosing ? `<div class="ci-chips">${alts.map(id => `<button class="ci-chip" data-ci="cat" data-v="${id}">${esc(catName(id))}</button>`).join('')}</div>` : ''}
      <div class="ci-row">
        ${members().length > 1 ? `<label class="ci-who"><span>For</span><select data-ci-person aria-label="Who it’s for">${memberOptions(t.person || '', `${owner} (account owner)`, true)}</select></label>` : ''}
        ${key ? `<label class="check small ci-always"><input type="checkbox" id="ci-always"> Always for “${esc(prettyPayee(key))}”</label>` : ''}
      </div>
      ${foot(t.flag ? '' : `<button class="btn ghost" data-ci="flag">${FLAG_ICON} Flag it</button>`)}
    </section>`;
  }
  const body = (title, html, actions, extra) => `<section class="panel ci-card" data-ci-item="${esc(item.id)}">${head}<h2 class="ci-title">${title}</h2>${html}<div class="ci-actions">${actions}</div>${foot(extra)}</section>`;
  switch (item.kind) {
    case 'gap': return gapCardHtml(item, q, head, foot);
    case 'missing': {
      const from = item.from && acctById(item.from), stale = item.from && ciStaleImport(item.from);
      return body(esc(item.name), `${item.amount ? `<div class="ci-amount num ${item.amount > 0 ? 'pos' : ''}">about ${approx(item.amount)}</div>` : ''}
        <p class="ci-meta">Usually ${item.what === 'deposit' ? 'comes in' : 'shows up'} around the ${ordinal(+item.due.slice(8))}${from ? ` in ${esc(from.name)}` : ''}.${item.last ? ` Last seen ${dateLabel(item.last)}.` : ''}</p>
        ${stale ? `<p class="ci-guess">${esc(from.name)}’s newest transaction is from ${dateLabel(stale.newest)}, so it may just need an import.</p>` : ''}`,
        `<button class="btn primary" data-ci="import">Import transactions</button><button class="btn" data-ci="quiet-month">Not this month</button><button class="btn" data-ci="stopped">${item.rec ? 'It stopped, remove it' : 'It stopped'}</button>`);
    }
    case 'import': {
      const a = acctById(item.accountId);
      return body(esc(a?.name || 'Account'), `<p class="ci-meta">Newest transaction: ${dateLabel(item.newest)}, ${item.age} days ago.</p>`, '<button class="btn primary" data-ci="import">Import a file</button>');
    }
    case 'coin': {
      const c = cryptoHeld().find(x => x.symbol === item.symbol); if (!c) return '';
      return body(`${esc(c.name)} price`, `<p class="ci-meta">${priceFmt(c.price)} as of ${c.priceDate ? dateLabel(c.priceDate) : 'no date'}. You hold ${amountFmt(c.amount, true)} ${esc(c.symbol)}, ${money(c.value, { cents: false })}${c.holdings.length > 1 ? ` across ${c.holdings.length} accounts` : ''}.</p>
        <form class="ci-bal" data-ci-bal><input id="ci-bal" inputmode="decimal" placeholder="Price today" aria-label="${esc(c.name)} price today" autocomplete="off"><button class="btn primary" type="submit">Save</button></form>`, '<a class="btn" href="#/investments">Investments</a>');
    }
    case 'balance': {
      const a = acctById(item.accountId);
      return body(esc(a.name), `<p class="ci-meta">${money(accountValue(a))} as of ${dateLabel(a.balanceDate)}.</p>
        <form class="ci-bal" data-ci-bal><input id="ci-bal" inputmode="decimal" placeholder="Balance today" aria-label="Balance today" autocomplete="off"><button class="btn primary" type="submit">Save</button></form>`, '');
    }
    case 'budget':
      return body('Budgets to watch', `<ul class="meters ci-list">${item.list.map(({ c, v }) => `<li><div class="meter-row"><span>${esc(c.name)}</span><span class="num ${v.available < 0 ? 'neg' : ''}">${money(v.actual, { cents: false })} <span class="muted">of ${money(v.budget + (v.carry || 0), { cents: false })}</span></span></div>${bar(v.actual, v.budget + (v.carry || 0))}</li>`).join('')}</ul>`,
        '<button class="btn primary" data-ci="next">Got it</button><a class="btn" href="#/budget">Open Budget</a>');
    case 'due':
      return body('Coming up', `<table class="ledger compact ci-list"><tbody>${item.list.slice(0, 8).map(u => `<tr><td class="nowrap muted">${esc(shortDay(u.date).replace(/^Today$/, 'Today'))}</td><td>${esc(u.name)}</td><td class="num ${signClass(u.amount)}">${money(u.amount)}</td></tr>`).join('')}</tbody></table>`,
        '<button class="btn primary" data-ci="next">Got it</button><a class="btn" href="#/cashflow">Cash flow</a>');
    case 'older':
      return body(`${item.n} older transaction${item.n === 1 ? '' : 's'}`, `<p class="ci-meta">From before ${CI.w === 'day' ? 'today' : CI.w === 'week' ? 'this week' : 'this month'}, still uncategorized or flagged.</p>`, '<button class="btn primary" data-ci="older">Go through them too</button>');
    case 'send':
      return body(`${changesWord(item.n)} not on your Mac yet`, `<p class="ci-meta">Send them so your Mac has what you did here.</p>`, '<button class="btn primary" data-ci="send">Send to your Mac</button>');
    case 'review':
      return body(`${MONTHS[+item.month.slice(5) - 1]} hasn’t been reviewed`, '<p class="ci-meta">Close out the month: spending, budgets and anything unusual.</p>', '<button class="btn primary" data-ci="review">Start the review</button>');
    case 'copy':
      return body('Get the latest from your Mac', `<p class="ci-meta">You last got your Mac’s data ${esc(whenLabel(item.got))}. Getting it again keeps the changes you haven’t sent.</p>`, '<button class="btn primary" data-ci="sync-open">Get the latest</button>');
  }
  return '';
}
const SPEAKER_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

/* ---------- Settings › Check-in ---------- */
function checkinSettings() {
  const p = voicePrefs(), dev = isCompanion() ? deviceLabel() : 'Mac', on = checkinOn();
  const rates = [[0.85, 'Slower'], [1, 'Normal'], [1.15, 'Faster'], [1.3, 'Fastest']];
  return `<section class="panel" id="checkin-settings">
    <header class="panel-head"><h2>Check-in and Talk</h2><span class="muted small">Runs on this ${dev}. ${aiReady() ? 'Only “Ask Claude”, or a reply to Claude’s answer, sends anything.' : 'Nothing is sent anywhere.'}</span></header>
    <p class="muted">Goes through what needs you today, this week or this month, one item at a time: transactions to sort, flagged ones, bills that haven’t shown up, accounts to import and balances to update.</p>
    <div class="form-grid">
      <label class="check"><input type="checkbox" data-setting-bool="checkin" ${on ? 'checked' : ''}> Show Check-in</label>
      <label class="check"><input type="checkbox" data-voice="talk" ${p.talk !== false ? 'checked' : ''}> Talk button on every page of this ${dev}</label>
      ${on ? `<label class="check"><input type="checkbox" data-voice="box" ${p.box ? 'checked' : ''}> Answer box on this ${dev}: type, or ${isTouch() ? 'tap the keyboard’s microphone' : 'use dictation'} and talk</label>
      ${canSpeak() ? `<label class="check"><input type="checkbox" data-voice="on" ${p.on ? 'checked' : ''}> Read items aloud on this ${dev}</label>
      ${p.on ? `<label class="check"><input type="checkbox" data-voice="amounts" ${p.amounts ? 'checked' : ''}> Say amounts out loud${state.settings.privacy ? ' <span class="muted small">(off while amounts are hidden)</span>' : ''}</label>
      <label class="field"><span>Voice</span><select data-voice="voice">${voiceOptions(p, dev)}</select></label>
      <label class="field"><span>Speed</span><select data-voice="rate">${rates.map(([v, l]) => `<option value="${v}" ${Math.abs((Number(p.rate) || 1) - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="actions"><button class="btn" data-ci="test-voice">${SPEAKER_ICON} Hear a sample</button></div>` : ''}` : `<p class="muted small">This browser can’t read aloud.</p>`}` : ''}
    </div>
    ${on && p.on && isTouch() ? '<p class="muted small">If you hear nothing, check the volume and that the phone isn’t on silent. More natural voices may show up here after you download them in Settings › Accessibility › Spoken Content › Voices.</p>' : ''}
  </section>`;
}

/* ---------- the page ---------- */
VIEWS.checkin = p => {
  const sub = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!checkinOn()) return pageHead('Check-in', sub) + `<section class="panel narrow"><p>Check-in is turned off.</p><div class="actions"><button class="btn primary" data-ci="turn-on">Turn it on</button></div></section>`;
  if (p.talk && p.talk !== CI.talkParam) { CI.talkParam = p.talk; CI.intro = true; }
  if (p.add && p.add !== CI.addParam) { CI.addParam = p.add; tellStart('', p.add === 'property' ? 'property' : ''); }
  if (p.w && p.w !== CI.wParam && CI_WINDOWS.some(([k]) => k === p.w)) { CI.wParam = p.w; if (p.w !== CI.w) { CI.w = p.w; CI.handled = []; CI.back = null; } }
  const q = ciQueue(), prefs = voicePrefs();
  const seg = `<div class="seg ci-seg" role="group" aria-label="Window">${CI_WINDOWS.map(([k, l]) => `<button class="${CI.w === k ? 'on' : ''}" data-ci="w" data-v="${k}">${l}</button>`).join('')}</div>`;
  const sure = q.items.filter(i => i.kind === 'uncat').map(ciTx).filter(t => t && ciGuess(t)?.sure);
  const talk = speakOn() ? (CI.talking ? '<button class="btn" data-ci="quiet">Stop reading</button>' : `<button class="btn" data-ci="talk">${SPEAKER_ICON} Read it to me</button>`) : '';
  const lead = !CI.handled.length
    ? `<section class="ci-lead"><p class="ci-sentence">${esc(ciSummary(q.left, q.win))}</p><div class="actions">${talk}${sure.length >= 2 ? `<button class="btn" data-ci="file-sure">File the ${sure.length} sure ones</button>` : ''}</div></section>`
    : `<div class="ci-progress"><div class="ci-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${q.total}" aria-valuenow="${Math.min(q.pos - 1, q.total)}" aria-label="Progress"><i style="width:${Math.round(100 * (q.pos - 1) / Math.max(1, q.total))}%"></i></div>${talk}</div>`;
  const last = CI.last ? `<p class="ci-last">${esc(CI.last.text)}${canUndoLast(CI.last) ? ' <button class="linklike" data-ci="undo">Undo</button>' : ''}</p>` : '';
  // the answer box sits above the card, so with the phone's keyboard up the card is still in view
  const say = prefs.box ? `<form class="ci-say" data-ci-say autocomplete="off"><input id="ci-say" type="text" enterkeyhint="go" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="${isTouch() ? 'Tap here, then the keyboard’s mic' : q.cur || CI.draft ? 'Type an answer' : 'Say “add a savings account at Chase…”'}" aria-label="Answer"${CI.intro && !isTouch() ? ' autofocus' : ''}><button class="btn" type="submit">Go</button></form>` : '';
  const hint = (say ? `<p class="ci-hint muted small">${CI.draft?.step === 'update' ? 'Say “yes” to save, “cancel” to stop, or add another change: “and the Roth is 85k”.' : CI.draft?.step === 'tx' ? 'Say “yes” to save, or change it: “actually groceries”, “for Julissa”, “and make a rule”. Say “cancel” to stop.' : CI.draft ? 'Answer the question, or change anything: “call it Chase Sapphire”, “the balance is 13,000”, “it’s Julissa’s”. Say “cancel” to stop.'
    : 'Say “yes”, a category, a person, “flag it”, “skip”, “back” or “always”. For a split: “half groceries, half household”. Add a note with “note:” and what to write. To add an account: “add a checking account at Chase ending 4321 with 12,400 for Julissa”. To update one: “Chase savings is 12,400”, “rename the Amex to Blue Cash”.'}</p>` : '')
    + (CI.draft ? '' : '<div class="ci-add-row"><button class="btn ghost" data-ci="tell-start" data-v="account">Add an account</button><button class="btn ghost" data-ci="tell-start" data-v="property">Add a property</button></div>');
  let card = CI.draft ? tellCardHtml() : CI.intro ? ciIntroHtml() : q.cur ? ciCardHtml(q.cur, q) : '';
  if (!q.cur && !CI.draft && !CI.intro) {
    const did = CI.handled.filter(h => h.what !== 'skipped').length, skipped = CI.handled.filter(h => h.what === 'skipped').length;
    card = `<section class="panel ci-done"><h2>${q.items.length ? 'That’s everything' : 'You’re all caught up'} for ${CI.w === 'day' ? 'today' : CI.w === 'week' ? 'this week' : 'this month'}.</h2>
      ${CI.handled.length ? `<p>${did ? `You took care of ${did}` : 'Nothing changed'}${skipped ? `${did ? ' and' : ','} skipped ${skipped}` : ''}.</p>` : ''}
      <div class="actions">${skipped ? `<button class="btn" data-ci="revisit">Go back to the ${skipped} you skipped</button>` : ''}${CI.w !== 'month' ? '<button class="btn" data-ci="w" data-v="month">Check this month</button>' : ''}<a class="btn ghost" href="#/overview">Overview</a></div></section>`;
  }
  return pageHead('Check-in', sub, seg) + lead + last + say + (CI.heard ? `<p class="ci-heard">${esc(CI.heard)}</p>` : '') + (CI.draft ? '' : aiCheckinHtml(q.cur)) + card + hint;
};

/* ---------- doing things ---------- */
function ciMark(item, what) { CI.handled.push({ id: item.id, item, what }); CI.back = null; CI.choose = null; CI.ai = null; }
/* Claude's suggestion for a card is a change card like Talk's; saving it finishes the card (and Undo brings it back) */
function ciTxStep(fn) {
  const d = CI.draft, before = CI.last;
  // the card, found before saving (once it's filed it's no longer in the list)
  const item = d?.ciItem ? (ciCurrent()?.id === d.ciItem ? ciCurrent() : ciItems(CI.w).items.find(i => i.id === d.ciItem)) : null;
  const reply = fn();
  if (item && !CI.draft && CI.last && CI.last !== before) { ciMark(item, 'sorted'); CI.last.n = 1; }
  return reply;
}
function ciSetCategory(t, catId, opts = {}) {
  t.categoryId = catId; delete t.splits;
  if (t.flag) delete t.flag;
  if (opts.person) t.person = opts.person;
  let extra = '';
  if (opts.always) extra = ' ' + ciMakeRule(t, catId);
  commit({ silent: true });
  return `Filed ${prettyPayee(t.payee) || t.payee} under ${catName(catId)}${opts.person ? ` for ${memberName(opts.person)}` : ''}.${extra}`;
}
function ciMakeRule(t, catId) {
  const text = ruleKeyFor(t.rawPayee || t.payee, t.id);
  if (!text) return '';
  const twin = state.rules.find(r => r.text === text && !ruleHasConds(r));
  if (twin) twin.categoryId = catId; else state.rules.unshift({ id: uid(), text, categoryId: catId });
  const others = state.transactions.filter(x => x.id !== t.id && isUncat(x) && !x.flag && !isSplit(x) && ruleMatches({ text }, x.rawPayee || x.payee, x));
  for (const x of others) x.categoryId = catId;
  return `${twin ? 'Updated the rule' : 'Made a rule'} for “${prettyPayee(text)}”${others.length ? ` and filed ${others.length} more like it` : ''}.`;
}
function ciSplit(t, parts) {
  const total = round2(t.amount), out = [];
  let left = total;
  parts.forEach((p, i) => {
    let a = i === parts.length - 1 ? left : p.amount != null ? round2(Math.sign(total) * Math.abs(p.amount)) : round2(total / parts.length);
    if (Math.abs(a) > Math.abs(left)) a = left;
    out.push({ categoryId: p.categoryId, amount: a, memo: '' }); left = round2(left - a);
  });
  t.splits = out; t.categoryId = '__split'; if (t.flag) delete t.flag;
  commit({ silent: true });
  return `Split ${prettyPayee(t.payee) || t.payee}: ${out.map(s => `${money(Math.abs(s.amount))} ${catName(s.categoryId)}`).join(', ')}.`;
}
function ciQuietSet(key, v) { state.settings.checkinQuiet = { ...(state.settings.checkinQuiet || {}), [key]: v }; }

/* One action on the current card. Returns what to say back (and the next card is read after it when reading aloud). */
function ciDo(a, item) {
  if (!a || !item) return;
  const t = item.tx ? ciTx(item) : null;
  CI.last = null;
  const done = (what, text, undo = true, say = '') => { ciMark(item, what); if (text) CI.last = { text, undo, n: 1 }; CI.sayBack = say; return text || ''; };
  switch (a.act) {
    case 'yes': {
      if (t) {
        const g = isUncat(t) ? ciGuess(t) : null;
        if (!g) { if (!isUncat(t)) return ciDo({ act: 'unflag' }, item); CI.heard = 'There’s no guess for this one. Say or pick a category.'; return CI.heard; }
        return done('sorted', ciSetCategory(t, g.id, { person: a.person || g.person, always: a.always || $('#ci-always')?.checked }), true, catName(g.id) + '.');
      }
      const map = { gap: item.what === 'notx' ? 'import' : null, missing: 'import', import: 'import', older: 'older', send: 'send', review: 'review', copy: 'sync-open', budget: 'next', due: 'next', balance: null };
      return map[item.kind] ? ciDo({ act: map[item.kind] }, item) : '';
    }
    case 'cat': return t ? done('sorted', ciSetCategory(t, a.categoryId, { person: a.person, always: a.always || $('#ci-always')?.checked }), true, catName(a.categoryId) + (a.person ? ` for ${memberName(a.person)}` : '') + '.') : '';
    case 'split': return t ? done('sorted', ciSplit(t, a.parts), true, 'Split.') : '';
    case 'choose': CI.choose = { id: item.id, options: a.options }; CI.heard = `Which one: ${listWords(a.options.map(catName))}?`; return CI.heard;
    case 'person': if (t) { t.person = a.person; commit({ silent: true }); CI.heard = `Set to ${memberName(a.person)}. Now the category?`; return CI.heard; } return '';
    case 'note': if (t) { t.memo = a.text; commit({ silent: true }); CI.heard = `Note added: ${a.text}`; return CI.heard; } return '';
    case 'flag': if (t) { t.flag = true; commit({ silent: true }); return done('flagged', `Flagged ${prettyPayee(t.payee) || t.payee} to come back to.`, true, 'Flagged.'); } return '';
    case 'unflag': if (t) { delete t.flag; commit({ silent: true }); return done('sorted', `Cleared the flag on ${prettyPayee(t.payee) || t.payee}.`); } return '';
    case 'coinprice': {
      if (!(a.value > 0) || !coinHoldings(item.symbol).length) return '';
      setCoinPrice(item.symbol, a.value); commit({ silent: true });
      return done('sorted', `${coinName(item.symbol)} price updated to ${priceFmt(a.value)}.`, true, 'Saved.');
    }
    case 'balance': {
      const acc = acctById(item.accountId); if (!acc || !isFinite(a.value)) return '';
      const v = ACCOUNT_TYPES[acc.type]?.side === 'liability' ? Math.abs(a.value) : a.value;
      setBalance(acc, v); commit({ silent: true });
      return done('sorted', `${acc.name} updated to ${money(v)}.`, true, 'Saved.');
    }
    case 'hand': {
      const acc = acctById(item.accountId); if (!acc) return '';
      if (acc.ledger) { acc.ledger = false; delete acc.anchorBalance; delete acc.anchorDate; commit({ silent: true }); }
      return done('sorted', `OK, ${acc.name}’s balance will be kept by hand.`, true, 'OK.');
    }
    case 'rate': {
      const acc = acctById(item.accountId); if (!acc || !isFinite(a.value) || a.value <= 0 || a.value >= 30) { CI.heard = 'Say the rate as a number, like 6.25.'; return CI.heard; }
      acc.rate = round2(a.value * 1000) / 1000; commit({ silent: true });
      return done('sorted', `${acc.name}: ${acc.rate}% interest.`, true, 'Saved.');
    }
    case 'not-needed': ciQuietSet(item.key, 'stop:' + today()); commit({ silent: true }); return done('sorted', 'OK, I won’t ask about that again.', true, 'OK.');
    case 'quiet-month': ciQuietSet(item.key, thisMonth()); commit({ silent: true }); return done('sorted', `OK, I won’t ask about ${item.name} again this month.`);
    case 'stopped':
      if (item.rec) { state.recurring = state.recurring.filter(r => r.id !== item.rec); commit({ silent: true }); return done('sorted', `Removed ${item.name} from your bills.`); }
      ciQuietSet(item.key, 'stop:' + today()); commit({ silent: true }); return done('sorted', `OK, I’ll stop expecting ${item.name}.`);
    case 'next': return done('seen', '', false);
    case 'older': CI.older = true; return done('seen', '', false);
    case 'skip': CI.skipped.add(item.id); return done('skipped', '', false, 'Skipped.');
    case 'back': {
      const h = CI.handled.pop(); if (!h) return '';
      CI.skipped.delete(h.id); CI.back = h.item; CI.choose = null; CI.heard = ''; return 'Going back.';
    }
    case 'undo': return ciUndo();
    case 'import': ciMark(item, 'seen'); startImport(); return '';
    case 'send': ciMark(item, 'seen'); syncSend(); return '';
    case 'sync-open': ciMark(item, 'seen'); syncPickFile(); return '';
    case 'review': ciMark(item, 'seen'); go(`#/review?m=${item.month}`); return '';
    case 'again': return 'again';
    case 'stop': CI.talking = false; ciHush(); return '';
    case 'no': CI.heard = 'OK, what is it? Say a category, or pick one.'; return CI.heard;
    case 'unknown':
      if (t && aiReady() && a.text) {   // Claude can try (67-claude.js)
        CI.ai = { status: 'offer', item: item.id, text: a.text };
        if (aiPrefs().auto) setTimeout(() => aiCheckinRun(item, a.text), 0);
        CI.heard = `I didn’t catch “${a.text}”.${aiPrefs().auto ? '' : ' Claude can try.'}`; return CI.heard;
      }
      CI.heard = `I didn’t catch “${a.text || ''}”. Try “yes”, a category, “flag it” or “skip”.`; return CI.heard;
  }
  return '';
}

/* After an action: draw the next card, and read it when reading aloud */
function ciAfter(reply, moved = true) {
  render();
  if (!CI.talking) return;
  const q = ciQueue();
  if (reply === 'again') return ciSpeak(ciCardSpeech(q.cur));
  if (!moved) return ciSpeak(reply);
  const next = q.cur ? ciCardSpeech(q.cur) : `That’s everything for ${CI.w === 'day' ? 'today' : CI.w === 'week' ? 'this week' : 'this month'}.`;
  ciSpeak(`${CI.sayBack || (/^(Going back|Undone)/.test(reply || '') ? reply : '')} ${next}`.trim());
  CI.sayBack = '';
}
/* Run one action on the current card, then move on */
function ciRun(a, item) {
  const before = CI.handled.length, back = CI.back;
  const reply = ciDo(a, item);
  ciAfter(reply, CI.handled.length !== before || CI.back !== back || a?.act === 'again');
}
function ciCurrent() { return ciQueue().cur; }
/* Undo the last change made here, and show that card again */
/* An Undo line only undoes its own change: it's offered while nothing else has been changed since (anywhere in the app) */
function canUndoLast(last) {
  if (!last?.undo) return false;
  if (!last.after) last.after = History.current;   // first drawn right after the change was saved
  return History.current === last.after;
}
function ciUndo() {
  if (!canUndoLast(CI.last)) { CI.last = CI.last ? { ...CI.last, undo: false } : null; return 'Other changes were made since, so that can’t be undone from here.'; }
  const n = CI.last?.n ?? 1, popped = n ? CI.handled.splice(-n, n) : [];
  if (CI.draft?.step === 'after') CI.draft = null;
  undo();
  CI.last = null; CI.choose = null; CI.back = popped.length === 1 ? popped[0].item : null;
  return 'Undone.';
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-ci]'); if (!el) return;
  e.preventDefault();
  if (el.closest('#talk')) return talkClick(el.dataset.ci, el.dataset.v);
  const act = el.dataset.ci, v = el.dataset.v;
  if (act === 'turn-on') { state.settings.checkin = true; commit(); return; }
  if (act === 'test-voice') voiceMenuSoon();
  if (act === 'test-voice') return ciSpeak(`${greeting()} This is how check-in sounds on this ${isCompanion() ? deviceLabel() : 'Mac'}.${voicePrefs().amounts ? ' Jewel-Osco, $84.12, on Tuesday.' : ' Jewel-Osco, on Tuesday.'} I think it’s Groceries.`);
  if (act === 'w') { if (v !== CI.w) { CI.w = v; CI.handled = []; CI.back = null; CI.last = null; CI.heard = ''; CI.choose = null; } return ciAfter(''); }
  if (act === 'talk') {
    CI.talking = true; render();
    const q = ciQueue();
    if (CI.draft) return ciSpeak(tellPrompt());
    return ciSpeak(`${greeting()} ${CI.handled.length ? '' : ciSummary(q.left, q.win, true) + ' '}${q.cur ? (CI.handled.length ? '' : 'First: ') + ciCardSpeech(q.cur) : ''}`);
  }
  if (act === 'quiet') { CI.talking = false; ciHush(); return render(); }
  if (act === 'say-card') return ciSpeak(CI.draft ? tellPrompt() : ciCardSpeech(ciCurrent()));
  if (act === 'revisit') { CI.handled = CI.handled.filter(h => h.what !== 'skipped'); CI.skipped.clear(); return ciAfter(''); }
  if (act === 'undo') return ciAfter(ciUndo());
  if (act === 'intro-close') { CI.intro = false; return render(); }
  if (act.startsWith('tell-')) { CI.heard = ''; CI.intro = false; const reply = tellClick(act, v); render(); if (CI.talking && reply) ciSpeak(reply); return; }
  // Claude's suggestion for this card (67-claude.js)
  if (act.startsWith('tx-') && CI.draft?.step === 'tx') {
    CI.heard = '';
    const reply = ciTxStep(() => act === 'tx-save' ? txApply() : act === 'tx-pick' ? txPick(v) : act === 'tx-cat' ? txChooseCat(v) : (CI.draft = null, 'OK, nothing was changed.'));
    if (act === 'tx-cancel') CI.heard = reply;
    return ciAfter(reply, !CI.draft);
  }
  if (act === 'ai-ask' || act === 'ai-retry') { const item = ciCurrent(); if (item && CI.ai) aiCheckinRun(item, CI.ai.text); return; }
  if (act === 'ai-guess') { const item = ciCurrent(); if (item) aiCheckinRun(item, ''); return; }
  if (act === 'ai-cancel') { AI.seq++; aiCancel(); CI.ai = null; return render(); }
  if (act === 'file-sure') {
    const ts = ciItems(CI.w).items.filter(i => i.kind === 'uncat').map(ciTx).filter(t => t && ciGuess(t)?.sure);
    for (const t of ts) { const g = ciGuess(t); t.categoryId = g.id; if (g.person && !t.person) t.person = g.person; }
    commit({ silent: true });
    CI.last = { text: `Filed ${ts.length} transaction${ts.length === 1 ? '' : 's'} the way you have before.`, undo: true, n: ts.length };
    CI.handled.push(...ts.map(t => ({ id: 'tx:' + t.id, item: { id: 'tx:' + t.id, kind: 'uncat', tx: t.id }, what: 'sorted' })));
    return ciAfter(CI.last.text);
  }
  const item = ciCurrent(); if (!item) return;
  CI.heard = '';
  ciRun({ act, categoryId: v }, item);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('[data-voice]')) {
    const k = el.dataset.voice;
    if (k === 'voice') { if (!el.value) return; setVoicePref('voiceName', englishVoices().find(v => v.voiceURI === el.value)?.name || ''); }   // the default-only placeholder never clears a choice
    setVoicePref(k, el.type === 'checkbox' ? el.checked : k === 'rate' ? Number(el.value) : el.value);
    if (k === 'on' && !el.checked) { CI.talking = false; ciHush(); }
    if (k === 'talk' && !el.checked) closeTalk();
    return render();
  }
  if (el.matches('[data-ci-cat]') && el.value) { const item = ciCurrent(); if (item) { CI.heard = ''; ciRun({ act: 'cat', categoryId: el.value }, item); } return; }
  if (el.matches('[data-ci-person]')) {
    const item = ciCurrent(), t = item?.tx && ciTx(item); if (!t) return;
    if (el.value) t.person = el.value; else delete t.person;
    commit({ silent: true }); return render();
  }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.matches('[data-ci-bal]')) {
    e.preventDefault();
    const item = ciCurrent(), n = ciNumber(($('#ci-bal')?.value || '').replace(/%/g, ''));
    if (!item || n == null || (item.kind === 'coin' && !(n > 0))) return toast(item?.kind === 'coin' ? 'Type the price, like 62,000.' : item?.what === 'rate' ? 'Type the rate, like 6.25.' : 'Type the balance, like 12,400.');
    return ciRun({ act: item.kind === 'coin' ? 'coinprice' : item.kind === 'gap' && item.what === 'rate' ? 'rate' : 'balance', value: n }, item);
  }
  if (f.matches('[data-ci-say]')) {
    e.preventDefault();
    const inp = $('#ci-say'), text = inp?.value || '';
    if (!text.trim()) return;
    if (CI.ai) { if (CI.ai.status === 'busy') { AI.seq++; aiCancel(); } CI.ai = null; }
    const low = text.trim().toLowerCase().replace(/[’‘]/g, "'");
    if (CI.draft || (TELL_ADD.test(low) && !/^add (a )?note\b/.test(low) && (tellFindType(low) || /\b(account|property)\b/.test(low)))) {
      CI.heard = ''; CI.intro = false;
      const reply = CI.draft ? tellAnswer(text) : tellStart(text);
      render();
      if (CI.talking) ciSpeak(reply);
      const again = $('#ci-say'); if (again) { again.value = ''; again.focus(); }
      return;
    }
    const item = ciCurrent();
    const cp = coinParse(text);
    if (cp && !(item?.kind === 'coin' && cp.changes.length === 1 && cp.changes[0].coin === item.symbol)) {
      CI.intro = false;
      const reply = updStart(cp);
      render();
      if (CI.talking) ciSpeak(reply);
      const again = $('#ci-say'); if (again) { again.value = ''; again.focus(); }
      return;
    }
    const upd = updParse(text);
    // an update for the account the card is already asking about is just the card's answer
    const own = upd && item && (item.kind === 'balance' || (item.kind === 'gap' && item.what !== 'notx')) && !upd.pending.length && upd.changes.length === 1 && upd.changes[0].accountId === item.accountId && ['balance', 'value', 'rate'].includes(upd.changes[0].field);
    if (upd && !own) {
      CI.intro = false;
      const reply = updStart(upd);
      render();
      if (CI.talking) ciSpeak(reply);
      const again = $('#ci-say'); if (again) { again.value = ''; again.focus(); }
      return;
    }
    CI.intro = false;
    if (!item) { CI.heard = 'Nothing left to answer here. To add or update something, say “add a checking account…” or “Chase savings is 12,400”.'; render(); return; }
    const a = ciUnderstand(text, item);
    CI.heard = '';
    const before = CI.handled.length, back = CI.back;
    const reply = ciDo(a, item);
    if (!CI.heard && a && !['unknown', 'no', 'choose', 'again', 'stop'].includes(a.act)) CI.heard = `Heard “${text.trim()}”.`;
    ciAfter(reply, CI.handled.length !== before || CI.back !== back || a?.act === 'again');
    const again = $('#ci-say'); if (again) { again.value = ''; again.focus(); }   // keep the keyboard up for the next answer
  }
});
window.addEventListener('hashchange', () => { if (!/^#\/?checkin/.test(location.hash)) { CI.addParam = ''; CI.talkParam = ''; CI.intro = false; if (CI.talking) { CI.talking = false; ciHush(); } } });
if (canSpeak()) {
  const onVoices = () => { liveVoices(); refreshVoiceMenu(); };
  try { speechSynthesis.addEventListener('voiceschanged', onVoices); } catch (e) { try { speechSynthesis.onvoiceschanged = onVoices; } catch (e2) { /* older browsers */ } }
  liveVoices();   // ask early: some phones only start loading voices once asked
}
/* The iPhone doesn't always announce its voices, so Settings looks again shortly after it's drawn and after a sample plays */
function voiceMenuSoon() { if (canSpeak()) [300, 1200, 3000].forEach(ms => setTimeout(() => { liveVoices(); refreshVoiceMenu(); }, ms)); }

/* ---------- understanding a typed or dictated answer (on the device, from a small set of phrases) ---------- */
const CI_SAY = {
  yes: /^(yes|yeah|yep|yup|ya|yah|correct|right|that'?s right|sure|ok(ay)?|confirm(ed)?|sounds good|do it|good|perfect|exactly|uh huh|got it)\b/,
  no: /^(no|nope|nah|wrong|not right|that'?s wrong|not quite)\b/,
  skip: /^(skip|next|later|not now|pass|move on|skip (it|this|this one))$/,
  back: /^(back|go back|previous|last one|the last one)$/,
  undo: /^undo( that)?$/,
  flag: /\b(flag|flagged|not sure|don'?t know|no idea|come back|unsure|ask (her|him|julissa|later))\b/,
  stop: /^(stop|done|that'?s (it|all)|finish(ed)?|exit|quit|end|i'?m done|stop reading)$/,
  again: /^(repeat|again|say (it|that) again|read (it|that) again|what|huh|come again|one more time)$/,
  unflag: /^(unflag|it'?s fine|keep it|leave it|clear (the )?flag|that'?s fine|it'?s right|fine)$/,
  note: /^(note|memo|add a note)\b[:,]?\s*/,
  always: /\b(always|every time|make (it )?a rule|remember (that|this|it))\b/,
  import: /\b(import|upload)\b/,
  quietMonth: /\b(not this month|skip this month|this month off|late this month|it'?s late)\b/,
  stopped: /\b(stopped|cancel+ed|cancel|no longer|don'?t have (it|that)|ended|it'?s gone|remove it)\b/,
  send: /\b(send|send (it|them))\b/,
  older: /\b(older|those too|them too|go through)\b/,
};
const CI_STOP = new Set(['the', 'a', 'an', 'it', 'its', 'is', 'was', 'that', 'this', 'for', 'to', 'of', 'under', 'as', 'in', 'put', 'file', 'filed', 'make', 'mark', 'call', 'categorize', 'category', 'please', 'just', 'one', 'into', 'on', 'my', 'our', 'should', 'be', 'go', 'goes', 'should', 'thats', 'like', 'um', 'uh', 'so', 'actually', 'yes', 'yeah', 'no', 'and', 'with']);
const CI_SYNONYMS = {
  gas: ['fuel', 'gas', 'gasoline'], fuel: ['gas', 'fuel'], food: ['grocery', 'dining', 'food'], restaurant: ['dining', 'restaurant'], restaurants: ['dining', 'restaurant'], eating: ['dining'], takeout: ['dining'],
  lunch: ['dining'], dinner: ['dining'], breakfast: ['dining'], coffee: ['coffee', 'dining'], doctor: ['medical', 'health', 'doctor'], pharmacy: ['medical', 'health', 'pharmacy'], dentist: ['dental', 'medical', 'health'],
  kid: ['child', 'kid', 'children'], school: ['education', 'school', 'tuition'], clothes: ['clothing', 'apparel'], uber: ['rideshare', 'transport', 'taxi'], lyft: ['rideshare', 'transport', 'taxi'],
  electric: ['utility', 'electric'], electricity: ['utility', 'electric'], water: ['utility', 'water'], internet: ['internet', 'utility'], phone: ['phone', 'mobile', 'utility'], car: ['auto', 'car', 'vehicle'],
  church: ['giving', 'charity', 'tithe', 'church'], tithe: ['giving', 'charity', 'tithe'], donation: ['giving', 'charity', 'donation'], salary: ['paycheck', 'salary', 'income'], paycheck: ['paycheck', 'salary', 'income'],
  gym: ['fitness', 'gym'], dog: ['pet'], vet: ['pet'], hotel: ['travel', 'lodging'], flight: ['travel', 'airfare'], streaming: ['subscription', 'streaming', 'entertainment'], movie: ['entertainment'],
  haircut: ['personal', 'hair'], gift: ['gift'], present: ['gift'], amazon: ['shopping'], household: ['household', 'home'], home: ['home', 'household'],
};
const ciStem = w => w.replace(/ies$/, 'y').replace(/(ss|us)$/, m => m + '#').replace(/(ses|xes|ches|shes)$/, m => m.slice(0, -2)).replace(/s$/, '').replace(/#$/, '');
const ciTokens = s => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/(\d+)\s*\(?([a-z])\)?(?![a-z])/g, '$1$2').replace(/&/g, ' and ').replace(/'s\b/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !CI_STOP.has(w)).map(ciStem);
function ciEdit(a, b) {   // small edit distance, for dictation and typing slips
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const tokSame = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && ciEdit(a, b) <= 1) || (a.length >= 4 && b.startsWith(a) && b.length - a.length <= 3);
/* Best category for some words, or a short list to choose from when it's close */
function ciMatchCategory(text, t) {
  const words = ciTokens(text);
  if (!words.length) return { best: null, options: [], score: 0 };
  const syn = new Set(words.flatMap(w => (CI_SYNONYMS[w] || CI_SYNONYMS[w + 's'] || []).map(ciStem)));
  const phrase = words.join(' ');
  const scored = state.categories.map(c => {
    const name = ciTokens(c.name); if (!name.length) return { c, s: 0 };
    let s = 0;
    if (name.join(' ') === phrase) s = 3;
    else {
      const hit = name.filter(n => words.some(w => tokSame(w, n))).length, hitSyn = name.filter(n => !words.some(w => tokSame(w, n)) && syn.has(n)).length;
      s = (hit + 0.8 * hitSyn) / name.length + (hit + hitSyn ? 0.2 : 0);
    }
    if (s && t) { const neg = t.amount < 0; if ((c.kind === 'income' && neg) || (c.kind === 'expense' && !neg)) s -= 0.25; }
    return { c, s };
  }).filter(x => x.s >= 0.45).sort((a, b) => b.s - a.s);
  if (!scored.length) return { best: null, options: [], score: 0 };
  if (scored.length === 1 || scored[0].s - scored[1].s >= 0.2 || scored[0].s >= 3) return { best: scored[0].c.id, options: [], score: scored[0].s };
  return { best: null, options: scored.slice(0, 3).map(x => x.c.id), score: scored[0].s };
}
function ciFindPerson(text) {
  const words = String(text).toLowerCase().replace(/'s\b/g, '').replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(Boolean);
  for (const m of members()) {
    const first = ciTokens(m.name)[0]; if (!first) continue;
    const i = words.findIndex(w => tokSame(ciStem(w), first));
    if (i >= 0) return { id: m.id, rest: words.filter((_, k) => k !== i && !(k === i - 1 && /^(for|to)$/.test(words[k]))).join(' ') };
  }
  const shared = text.match(/\b(joint|shared|both of us|the family|family|everyone)\b/i);
  if (shared && members().some(m => m.id === 'joint')) return { id: 'joint', rest: text.replace(shared[0], ' ') };
  return null;
}
function ciNumber(s) {
  const m = String(s).replace(/,(?=\d{3}\b)/g, '').match(/-?\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|million|m)?\b/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (/^(k|thousand)$/i.test(m[2] || '')) n *= 1e3; else if (/^(m|million)$/i.test(m[2] || '')) n *= 1e6;
  return /-/.test(m[0]) ? -n : n;
}
/* "half groceries, half household", "groceries and household", "$50 groceries, the rest household" */
function ciFindSplit(text, t) {
  if (!/\b(half|split|rest|and|remainder)\b|,/.test(text) && (String(text).match(/\d[\d,.]*/g) || []).length < 2) return null;
  if (ciMatchCategory(text, t).score >= 3) return null;   // a category whose name has "and" in it
  const segs = text.split(/\s*(?:,|\band\b|\bhalf\b|\bsplit\b|\bbetween\b|\bthe rest\b|\brest\b|\bremainder\b|\bwith\b)\s*/).map(x => x.trim()).filter(Boolean)
    .flatMap(x => (x.match(/\d[\d,.]*/g) || []).length > 1 ? x.split(/\s+(?=\$?\d)/) : [x]);
  const parts = [];
  for (const seg of segs) {
    const m = ciMatchCategory(seg.replace(/-?\$?\s*\d[\d,]*(\.\d+)?/g, ' '), t);
    if (!m.best || parts.some(p => p.categoryId === m.best)) continue;
    const n = /\d/.test(seg) ? ciNumber(seg) : null;
    parts.push({ categoryId: m.best, amount: n });
  }
  return parts.length >= 2 ? parts.slice(0, 4) : null;
}
function ciUnderstand(text, item) {
  const raw = String(text || '').trim();
  const s = raw.toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/g, '').replace(/^(hey|so|um|uh|okay so|ok so)\s+/, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (CI_SAY.stop.test(s)) return { act: 'stop' };
  if (CI_SAY.again.test(s)) return { act: 'again' };
  if (CI_SAY.undo.test(s)) return { act: 'undo' };
  if (CI_SAY.back.test(s)) return { act: 'back' };
  if (CI_SAY.skip.test(s)) return { act: 'skip' };
  const note = s.match(CI_SAY.note);
  if (note && item.tx) return { act: 'note', text: raw.replace(/^\s*(note|memo|add a note)\b[:,]?\s*/i, '').trim() };
  const yes = CI_SAY.yes.test(s);
  switch (item.kind) {
    case 'uncat': case 'flag': {
      const t = ciTx(item);
      if (CI_SAY.flag.test(s) && !/\bunflag\b/.test(s)) return { act: 'flag' };
      if (item.kind === 'flag' && CI_SAY.unflag.test(s)) return { act: 'unflag' };
      const always = CI_SAY.always.test(s);
      let rest = s.replace(new RegExp(CI_SAY.always.source, 'g'), ' ');
      const person = ciFindPerson(rest); if (person) rest = person.rest;
      rest = rest.replace(CI_SAY.yes, ' ').replace(/\s+/g, ' ').trim();
      if (CI_SAY.no.test(rest) && !ciTokens(rest.replace(CI_SAY.no, '')).length) return { act: 'no' };
      rest = rest.replace(CI_SAY.no, ' ').trim();
      if (CI.choose && CI.choose.id === item.id) {   // answering "which one": pick among the offered
        const m = ciMatchCategory(rest, t), hit = CI.choose.options.find(id => id === m.best) || (m.options || []).find(id => CI.choose.options.includes(id));
        if (hit) return { act: 'cat', categoryId: hit, person: person?.id, always };
      }
      const split = ciFindSplit(rest, t);
      if (split) return { act: 'split', parts: split };
      const m = ciMatchCategory(rest, t);
      if (m.best) return { act: 'cat', categoryId: m.best, person: person?.id, always };
      if (m.options.length) return { act: 'choose', options: m.options };
      if (yes || always) return { act: 'yes', person: person?.id, always };
      if (person) return { act: 'person', person: person.id };
      return { act: 'unknown', text: raw };
    }
    case 'balance': { const n = ciNumber(s); if (n != null) return { act: 'balance', value: n }; break; }
    case 'coin': { const cp = coinParse(s); const n = cp?.changes.length === 1 && cp.changes[0].coin === item.symbol ? cp.changes[0].to : ciNumber(s); if (n > 0) return { act: 'coinprice', value: n }; break; }
    case 'gap':
      if (item.what === 'notx') { if (CI_SAY.import.test(s)) return { act: 'import' }; if (/\b(by hand|manual|manually|myself|hand)\b/.test(s)) return { act: 'hand' }; break; }
      if (/^(i )?(don'?t know|not sure|no idea|leave it|skip it for good|it'?s zero|zero|none)$/.test(s)) return { act: 'not-needed' };
      { const n = ciNumber(s.replace(/percent|%/g, '')); if (n != null) return { act: item.what === 'rate' ? 'rate' : 'balance', value: n }; }
      break;
    case 'missing':
      if (CI_SAY.quietMonth.test(s)) return { act: 'quiet-month' };
      if (CI_SAY.stopped.test(s)) return { act: 'stopped' };
      if (CI_SAY.import.test(s) || yes) return { act: 'import' };
      break;
    case 'import': if (CI_SAY.import.test(s) || yes) return { act: 'import' }; break;
    case 'older': if (CI_SAY.older.test(s) || yes) return { act: 'older' }; if (CI_SAY.no.test(s)) return { act: 'skip' }; break;
    case 'send': if (CI_SAY.send.test(s) || yes) return { act: 'send' }; if (CI_SAY.no.test(s)) return { act: 'skip' }; break;
    case 'review': if (yes || /\b(start|review|open)\b/.test(s)) return { act: 'review' }; if (CI_SAY.no.test(s)) return { act: 'skip' }; break;
    case 'copy': if (yes || /\b(get|latest|open)\b/.test(s)) return { act: 'sync-open' }; break;
    case 'budget': case 'due': if (yes || /\b(next|fine|good)\b/.test(s)) return { act: 'next' }; break;
  }
  if (CI_SAY.no.test(s)) return { act: 'skip' };
  return { act: 'unknown', text: raw };
}
