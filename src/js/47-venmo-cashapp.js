/* ================= Venmo and Cash App details =================
   A bank line says only "VENMO PAYMENT 1023456789" or "CASH APP*CASH OUT". Venmo's statement (CSV, from venmo.com ›
   Statements) and Cash App's activity (CSV, from cash.app on a computer) say who it was to or from and the note. Like
   PayPal's file (47-paypal.js) they add nothing: each payment pulled straight from your bank or card names that line
   ("Venmo to Sam Rivera", the note in the memo), and money people send you, which waits in the app until it's moved to
   the bank, names the deposit it reached the bank in ("Cash App from Rita Moreno and Leo Park", each one's amount and
   note in the memo). The money in the app is followed oldest first, so a deposit is made of the payments that came in
   before it; what the app's balance paid for doesn't reach the bank. Only names, notes, amounts and dates are kept,
   never the app's account or card numbers. */

const APP_HEAD = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function isVenmoFile(headers) {
  const H = (headers || []).map(APP_HEAD), has = n => H.includes(n);
  return has('note') && has('from') && has('to') && (has('datetime') || has('date')) && H.some(h => /^amount( \(total\))?$/.test(h)) && (has('funding source') || has('destination'));
}
function isCashAppFile(headers) {
  const H = (headers || []).map(APP_HEAD), has = n => H.includes(n);
  return has('transaction type') && (has('amount') || has('net amount')) && (H.some(h => /sender|receiver/.test(h)) || (has('asset type') && has('transaction id')));
}
/* The header row can sit below a title or two (Venmo starts with "Account Statement - (@name)") */
function findAppFile(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (isVenmoFile(rows[i])) return { src: 'venmo', hi: i };
    if (isCashAppFile(rows[i])) return { src: 'cashapp', hi: i };
  }
  return null;
}
const appName = v => String(v || '').replace(/\S+@\S+\.\S+/g, '').replace(/\+?\d[\d ().-]{8,}\d/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
/* A sortable time from "2026-10-02T19:04:11" or "2026-10-02 19:04:11 EDT" (or a date the bank way round) */
function appStamp(raw, date) {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i.exec(String(raw || '').replace(/^\d{4}-\d{2}-\d{2}/, ''));
  if (!m) return date + ' 00:00:00';
  let h = +m[1]; if (m[4]) h = h % 12 + (/p/i.test(m[4]) ? 12 : 0);
  return `${date} ${pad2(h)}:${m[2]}:${m[3] || '00'}`;
}
/* Where money came from (paying) or went to (paid to you): the app's own balance, a bank or card, or '' when the file
   doesn't say (paying: look for a bank line anyway; paid to you: it waits in the app) */
function appVia(src, v, paying) {
  const s = String(v || '').trim();
  if (!s) return paying ? '' : 'balance';
  const bal = src === 'venmo' ? /venmo balance|^balance$/i.test(s) : /^(your )?cash( balance)?$|cash app|^balance$/i.test(s) || !/\d|bank|debit|credit|visa|mastercard|card|checking|savings/i.test(s);
  return bal ? 'balance' : 'bank';
}

/* Each row as { src, date, ts, name, type, amount (− out of your pocket, + to you), fee, net, id, note, flow, via, merchant }.
   flow: out (you paid someone), in (paid to you), cashout (moved to the bank), fund (money into the app that isn't a
   payment to you: added from the bank, a paycheck, a sale), spend (the app's balance or card paid a store), skip. */
function parseVenmo(rows, hi) {
  const H = rows[hi].map(APP_HEAD);
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const c = { id: col('id', 'transaction id'), dt: col('datetime', 'date'), type: col('type'), status: col('status'), note: col('note'), from: col('from'), to: col('to'),
    amt: col('amount (total)', 'amount'), fee: col('amount (fee)', 'fee'), fund: col('funding source'), dest: col('destination') };
  const body = rows.slice(hi + 1).filter(r => r.some(v => String(v).trim()));
  // you are the name on most rows
  const n = {};
  for (const r of body) for (const k of [c.from, c.to]) { const v = appName(r[k]); if (v) n[v] = (n[v] || 0) + 1; }
  const ranked = Object.entries(n).sort((a, b) => b[1] - a[1]);
  const me = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : '';
  const out = [];
  for (const r of body) {
    const get = i => i >= 0 ? String(r[i] ?? '').trim() : '';
    const date = parseDateFlexible(get(c.dt)), amount = parseAmount(get(c.amt));
    if (!date || !isFinite(amount) || !amount) continue;
    const type = get(c.type), from = appName(get(c.from)), to = appName(get(c.to)), status = get(c.status);
    const charge = /charge|request/i.test(type);
    const name = from === me ? to : to === me ? from : (amount < 0) !== charge ? to : from;
    const fund = get(c.fund), dest = get(c.dest), fee = Math.abs(parseAmount(get(c.fee)) || 0);
    let flow, via = '';
    if (status && !/complete|issued|success|paid/i.test(status)) flow = 'skip';
    else if (/transfer|cash ?out|withdraw/i.test(type)) flow = amount < 0 ? 'cashout' : 'fund';
    else if (/add(ed)? (funds|money)|top ?up|direct deposit|cash back|reward|interest/i.test(type)) flow = amount < 0 ? 'skip' : 'fund';
    else if (amount < 0) { via = appVia('venmo', fund, true); flow = via === 'balance' && /card/i.test(type) ? 'spend' : 'out'; }
    else { via = appVia('venmo', dest, false); flow = 'in'; }
    out.push({ src: 'venmo', date, ts: appStamp(get(c.dt), date), name, type, status, amount: round2(amount), fee: round2(fee), net: 0,
      id: get(c.id) ? `venmo:${get(c.id)}` : `venmo:d:${date}:${round2(amount)}:${normPayee(name)}`, note: appNote(get(c.note)), flow, via,
      merchant: /merchant|card|purchase/i.test(type) });
  }
  return out;
}
function parseCashApp(rows, hi) {
  const H = rows[hi].map(APP_HEAD);
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const c = { id: col('transaction id', 'id'), date: col('date', 'datetime'), type: col('transaction type', 'type'), status: col('status'), note: col('notes', 'note'),
    name: H.findIndex(h => /sender|receiver/.test(h)), amt: col('amount'), fee: col('fee'), net: col('net amount'), asset: col('asset type'), acct: col('account') };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const get = i => i >= 0 ? String(r[i] ?? '').trim() : '';
    const date = parseDateFlexible(get(c.date));
    let amount = parseAmount(get(c.amt));
    if (!isFinite(amount) || !amount) amount = parseAmount(get(c.net));
    if (!date || !isFinite(amount) || !amount) continue;
    const type = get(c.type), status = get(c.status), acct = get(c.acct), net = parseAmount(get(c.net));
    // the type says which way when the sign doesn't
    if (/sent|cash ?out|withdraw|card|purchase|buy/i.test(type) && amount > 0) amount = -amount;
    if (/received/i.test(type) && amount < 0) amount = -amount;
    let flow, via = '';
    if (status && !/complete|success|paid|settled/i.test(status)) flow = 'skip';
    else if (get(c.asset) || /bitcoin|btc|stock|invest/i.test(type)) flow = amount < 0 ? 'spend' : 'fund';
    else if (/cash ?out|withdraw|transfer to/i.test(type)) flow = 'cashout';
    else if (/cash ?in|add cash|deposit|boost|reward|interest|cash back|refund/i.test(type) && !/p2p|received/i.test(type)) flow = amount < 0 ? 'skip' : 'fund';
    else if (/card/i.test(type)) flow = amount < 0 ? 'spend' : 'fund';
    else if (amount < 0) { via = appVia('cashapp', acct, true); flow = 'out'; }
    else { via = appVia('cashapp', acct, false); flow = 'in'; }
    const name = appName(get(c.name));
    out.push({ src: 'cashapp', date, ts: appStamp(get(c.date), date), name, type, status, amount: round2(amount), fee: round2(Math.abs(parseAmount(get(c.fee)) || 0)),
      net: isFinite(net) ? round2(Math.abs(net)) : 0, id: get(c.id) ? `cashapp:${get(c.id)}` : `cashapp:d:${date}:${round2(amount)}:${normPayee(name)}`,
      note: appNote(get(c.note)), flow, via, merchant: false });
  }
  return out;
}
/* How many payments a file holds (for the batch list) */
const appPayCount = rows => rows.filter(p => p.src ? ['out', 'in', 'cashout'].includes(p.flow) : ['buy', 'refund'].includes(ppKind(p))).length;

/* Venmo's or Cash App's rows against the bank and card lines that say "Venmo" or "Cash App" */
function p2pMatch(src, list, R, usedT) {
  const A = APP[src], hist = categoryHistory();
  const done = new Set(state.transactions.filter(t => t.pp?.src === src).flatMap(t => [t.pp.id, ...(t.pp.ids || [])]));
  const seen = new Set(), rows = [];
  for (const p of list) if (!seen.has(p.id)) { seen.add(p.id); rows.push(p); }   // the same payment in two files
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  // the money waiting in the app, oldest first: a move to the bank takes from the front
  const pool = [], wants = [];
  const take = amt => {
    const parts = []; let need = round2(amt);
    while (need > 0.005 && pool.length) {
      const x = pool[0], a = round2(Math.min(x.left, need));
      parts.push({ p: x.p, amt: a, fund: x.fund }); x.left = round2(x.left - a); need = round2(need - a);
      if (x.left <= 0.005) pool.shift();
    }
    return { parts, short: need > 0.005 ? need : 0 };
  };
  for (const p of rows) {
    if (p.flow === 'skip') { R.skipped++; continue; }
    if (p.flow === 'fund') { pool.push({ p, left: p.amount, fund: true }); R.skipped++; continue; }
    if (p.flow === 'spend') { take(-p.amount); R.skipped++; continue; }
    if (p.flow === 'in' && p.via !== 'bank') { pool.push({ p, left: p.amount }); continue; }
    if (p.flow === 'out' && p.via === 'balance') { take(-p.amount); wants.push({ p, kind: 'balance' }); continue; }
    if (p.flow === 'cashout') { const r = take(Math.abs(p.amount)); wants.push({ p, kind: 'cashout', parts: r.parts, short: r.short }); continue; }
    wants.push({ p, kind: p.flow });   // out or in, straight from or to a bank or card
  }
  // money that came in and wasn't moved to the bank in this file: deposited straight (some accounts do), or still there
  for (const x of pool) if (!x.fund) wants.push({ p: x.p, kind: Math.abs(x.left - x.p.amount) < 0.005 ? 'held' : 'kept' });
  const todo = [];
  for (const w of wants) {
    if (done.has(w.p.id)) { R.done++; continue; }
    if (w.kind === 'balance' || w.kind === 'kept') { R.left.push({ p: w.p, why: w.kind === 'balance' ? 'balance' : 'held' }); continue; }
    if (w.kind === 'cashout' && !w.parts.some(x => !x.fund)) { R.skipped++; continue; }   // only money you'd added: nothing to name
    todo.push(w);
  }
  const lines = state.transactions.filter(t => !t.pp && !usedT.has(t.id) && A.bank.test(t.rawPayee || t.payee || ''));
  const pairs = [];
  todo.forEach((w, i) => {
    const p = w.p, cash = w.kind === 'cashout';
    const amts = cash ? [...new Set([Math.abs(p.amount), round2(Math.abs(p.amount) - p.fee), p.net].filter(a => a > 0))] : [p.amount];
    lines.forEach((t, j) => {
      if (!amts.some(a => Math.abs(t.amount - a) < 0.005)) return;
      const d = daysBetween(p.date, t.date);   // the bank shows it the same day or a few days later
      if (d < (cash ? -1 : -2) || d > 6) return;
      pairs.push({ i, j, score: (!cash && ppNameHint(t, p) ? 0 : 10) + Math.abs(d) + (d < 0 ? 0.5 : 0) });
    });
  });
  pairs.sort((a, b) => a.score - b.score);
  const usedW = new Set(), usedJ = new Set();
  for (const { i, j } of pairs) {
    if (usedW.has(i) || usedJ.has(j)) continue;
    usedW.add(i); usedJ.add(j); usedT.add(lines[j].id);
    R.matches.push(p2pMatchRow(src, todo[i], lines[j], hist));
  }
  todo.forEach((w, i) => { if (!usedW.has(i)) R.left.push({ p: w.kind === 'cashout' ? { ...w.p, name: w.parts.filter(x => !x.fund).map(x => x.p.name).join(', '), amount: Math.abs(w.p.amount) } : w.p, why: w.kind === 'cashout' ? 'deposit' : w.kind === 'held' ? 'held' : 'unknown' }); });
}
function p2pMatchRow(src, w, t, hist) {
  const A = APP[src], p = w.p;
  const guessFor = raw => { const rule = matchRule(raw, t); return rule ? { id: rule.categoryId || '', how: 'rule', person: rule.person || '', rename: rule.rename || '' } : { ...(autoCategory(raw, t.amount, {}, hist) || { id: '', how: '' }), person: '', rename: '' }; };
  let payee, raw, memo, g, ids = [];
  if (w.kind === 'cashout') {
    const ppl = w.parts.filter(x => !x.fund), names = [...new Set(ppl.map(x => x.p.name || 'Someone'))];
    ids = ppl.map(x => x.p.id);
    payee = `${A.label} from ${names.length <= 2 ? andList(names) : `${names[0]}, ${names[1]} and ${names.length - 2} more`}`;
    raw = `${A.raw} FROM ${names.join(', ')}`;
    const whole = ppl.length === 1 && !w.short && Math.abs(ppl[0].amt - ppl[0].p.amount) < 0.005;
    memo = whole ? ppl[0].p.note : [...ppl.map(x => `${x.p.name || 'Someone'} ${money(x.amt)}${Math.abs(x.amt - x.p.amount) > 0.005 ? ` of ${money(x.p.amount)}` : ''}${x.p.note ? `: ${x.p.note}` : ''}`),
      ...(w.short ? [`${money(w.short)} that came in before this file`] : [])].join(' · ');
    // a category only when every payer's history or rule agrees (rent from both tenants)
    const gs = names.map(n => guessFor(`${A.raw} FROM ${n}`));
    g = gs.every(x => x.id && x.id === gs[0].id) ? { ...gs[0], person: gs.every(x => x.person === gs[0].person) ? gs[0].person : '', rename: names.length === 1 ? gs[0].rename : '' } : { id: '', how: '', person: '', rename: '' };
  } else {
    const dir = p.amount < 0 ? 'to' : 'from';
    payee = p.merchant ? prettyPayee(p.name) : `${A.label} ${dir} ${p.name || 'someone'}`;
    raw = p.merchant ? p.name : `${A.raw} ${dir.toUpperCase()} ${p.name}`;
    memo = p.note;
    g = guessFor(raw);
  }
  const had = isSplit(t) ? '' : (t.categoryId || '');
  return { src, p, t, raw, payee: g.rename || payee, memo, ids, keep: !appNameIsBanks(t, A.bank), person: g.person, guess: g.id, how: g.how, had, categoryId: had || g.id, include: true, touched: false };
}
