/* ================= PayPal details =================
   A card or bank statement shows a PayPal purchase only as "PAYPAL *INST XFER $12.47". PayPal's own activity file says
   it was McDonald's. Importing that file adds nothing new: each PayPal payment is matched to the card or bank line with
   the same amount a few days later, and that line takes the store's name, the item as a memo when it has none, and a
   category when it has none. The bank's own wording is kept, and a payment already named is skipped next time. */
const PP_BANK = /PAYPAL|\bPYPL\b|\bPP\s?\*/i;
const PP_FUNDING = /deposit|add(ed)? funds|instant transfer|funding/i;
const PP_IGNORE = /authori[sz]ation|\bhold\b|currency conversion|deposit|add(ed)? funds|transfer (to|from)|withdrawal|reversal|void|cash ?back|reward|repayment|interest/i;
const PP_PERSON = /^(general payment|mobile payment|payment sent|send money|money sent|personal payment)$|friends|family/i;
const PP_WHY = {
  card: 'Paid by card or bank. Import that statement, then this file again.',
  balance: 'Looks paid from your PayPal balance (or PayPal Credit), so no card or bank line shows it.',
  unknown: 'No card or bank line with this amount yet.',
  refund: 'Refunded to your PayPal balance, or the card’s statement isn’t in yet.',
  currency: 'In another currency, so the amounts don’t line up.',
};

function isPayPalFile(headers, fileName = '') {
  const H = (headers || []).map(c => String(c).trim().toLowerCase());
  const has = n => H.includes(n);
  if (!(has('transaction id') && has('name') && (has('type') || has('description')) && (has('gross') || has('amount') || has('net')))) return false;
  const extra = ['balance impact', 'time zone', 'timezone', 'currency', 'gross', 'fee', 'net', 'receipt id', 'from email address', 'to email address', 'item title', 'reference txn id'].filter(has).length;
  return extra >= 3 || (/paypal/i.test(fileName) && extra >= 1);
}
function parsePayPal(rows, hi) {
  const H = rows[hi].map(c => String(c).trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const c = { date: col('date'), name: col('name'), type: col('type', 'description'), status: col('status'), cur: col('currency'), gross: col('gross', 'amount', 'net'), impact: col('balance impact'), id: col('transaction id'), item: col('item title', 'subject', 'note') };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const get = i => i >= 0 ? String(r[i] ?? '').trim() : '';
    const date = parseDateFlexible(get(c.date));
    let amount = parseAmount(get(c.gross));
    if (!date || !isFinite(amount) || !amount) continue;
    const impact = get(c.impact).toLowerCase();
    if (impact === 'debit' && amount > 0) amount = -amount;
    if (impact === 'credit' && amount < 0) amount = -amount;
    // only the store or person: never the email addresses or street address in the file
    const name = get(c.name).replace(/\S+@\S+\.\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    out.push({ date, name, type: get(c.type), status: get(c.status), currency: get(c.cur).toUpperCase(), amount: round2(amount), impact, id: get(c.id) || `d:${date}:${round2(amount)}:${normPayee(name)}`, item: get(c.item).replace(/\S+@\S+\.\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) });
  }
  return out;
}
/* PayPal's monthly PDF statement: the same activity as the CSV, one entry per payment:
   "04/03/2026   Website Payment: McDonalds #7385 -   USD   -23.06   0.00   -23.06", the rest of the description on the next
   lines, then "ID: 45H…". A wrapped year ("04/03/202" with "6" on the next line) is put back together. */
function isPayPalPdf(lines) {
  const head = lines.slice(0, 20).join(' ');
  return /PayPal/i.test(head) && lines.some(l => /^DATE\s+DESCRIPTION\s+CURRENCY\s+AMOUNT\s+FEES\s+TOTAL/i.test(l.trim()));
}
function parsePayPalPdf(lines) {
  const START = /^(\d{1,2}\/\d{1,2}\/\d{1,4})\s+(.+?)\s+([A-Z]{3})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})$/;
  const out = []; let cur = null;
  const finish = () => {
    if (!cur) return;
    const desc = cur.desc.join(' ').replace(/\s+/g, ' ').trim(), i = desc.indexOf(':');
    const type = (i > 0 ? desc.slice(0, i) : desc).trim();
    const name = (i > 0 ? desc.slice(i + 1) : '').replace(/\s+-\s+[A-Za-z .'-]+,\s*[A-Z]{2}$/, '').replace(/\s+-$/, '').replace(/\S+@\S+\.\S+/g, '').trim().slice(0, 60);
    const date = parseDateFlexible(cur.date), amount = parseAmount(cur.amount);
    if (date && isFinite(amount) && amount) out.push({ date, name, type, status: '', currency: cur.cur, amount: round2(amount), impact: '', id: cur.id || `d:${date}:${round2(amount)}:${normPayee(name)}`, item: '', funded: cur.funded });
    cur = null;
  };
  for (const raw of lines) {
    let l = raw.trim();
    const m = START.exec(l);
    if (m) { finish(); cur = { date: m[1], desc: [m[2]], cur: m[3], amount: m[4], id: '', funded: '', stop: false }; continue; }
    if (!cur) continue;
    const yr = /\/(\d{1,3})$/.exec(cur.date);
    if (yr) { const w = /^(\d{1,3})(?:\s+(.*))?$/.exec(l); if (w && (yr[1] + w[1]).length === 4) { cur.date += w[1]; l = (w[2] || '').trim(); if (!l) continue; } }
    if (cur.stop) continue;
    const id = /^ID:\s*(\S+)/i.exec(l);
    if (id) { cur.id = id[1]; cur.stop = true; continue; }
    if (/^Ref ID:/i.test(l) || /^[A-Z]{3}$/.test(l)) continue;
    if (/\bx-\d{4}\b/i.test(l)) { cur.funded = 'yes'; continue; }   // paid from a bank account or card on file
    cur.desc.push(l);
  }
  finish();
  return out;
}

/* PayPal's Quicken (QIF) download: the store in one field and PayPal's type ("Express Checkout Payment") in another.
   Read the same way, so it can't come in as a second copy of every purchase. */
const PP_TYPE = /^(general (card |credit card )?(deposit|payment|withdrawal|authori[sz]ation|currency conversion)|express checkout payment|website payment|preapproved payment|mobile payment|subscription payment|payment (refund|reversal|sent|received)|bank deposit to pp|transfer to bank|account hold|reversal of general|void of authori[sz]ation|direct credit card payment|shopping cart payment)/i;
function isPayPalQif(rows, fileName = '') {
  const hits = rows.filter(r => [r.memo, r.bankCategory, r.payee].some(v => PP_TYPE.test(String(v || '').trim()))).length;
  return hits >= Math.max(2, rows.length * 0.3) || (/paypal/i.test(fileName) && hits >= 1);
}
function payPalFromQif(rows) {
  return rows.map(r => {
    const f = [r.payee, r.memo, r.bankCategory].map(v => String(v || '').trim());
    const ti = f.findIndex(v => PP_TYPE.test(v)), type = ti >= 0 ? f[ti] : '';
    const name = (f.find((v, i) => i !== ti && v && !PP_TYPE.test(v) && v !== 'Unknown') || '').replace(/\S+@\S+\.\S+/g, '').trim().slice(0, 60);
    return { date: r.date, name, type, status: '', currency: '', amount: round2(r.amount), impact: '', id: `d:${r.date}:${round2(r.amount)}:${normPayee(name)}`, item: '' };
  }).filter(p => p.date && isFinite(p.amount) && p.amount);
}

function ppKind(p) {
  if (/denied|cancel|fail|void|reversed/i.test(p.status) || p.impact === 'memo') return 'skip';
  if (p.amount > 0 && PP_FUNDING.test(p.type)) return 'funding';
  if (PP_IGNORE.test(p.type)) return 'skip';
  if (p.currency && p.currency !== 'USD') return 'currency';
  if (p.amount < 0) return 'buy';
  if (/refund/i.test(p.type)) return 'refund';
  return 'skip';   // money sent to you inside PayPal: no card or bank line to name
}
const ppIsPerson = p => PP_PERSON.test(p.type.trim()) && !p.item && !/\b(inc|llc|ltd|corp|co|company|store|shop|usa)\b\.?/i.test(p.name);
/* The card's line already carrying the store's name ("PAYPAL *MCDONALDS") is the surest match */
function ppNameHint(t, p) {
  const w = normPayee(p.name).split(' ').find(x => x.length >= 3);
  return !!w && normPayee(t.rawPayee || t.payee).includes(w);
}

function ppMatch(list) {
  const done = new Set(state.transactions.filter(t => t.pp?.id).flatMap(t => [t.pp.id, t.pp.k]).filter(Boolean));
  const pays = [], funding = [], R = { matches: [], left: [], done: 0, skipped: 0 };
  const ids = new Set();
  for (const p of list) {
    if (ids.has(p.id)) continue;   // the same payment in two files (a statement and a CSV)
    ids.add(p.id);
    const k = ppKind(p);
    if (k === 'funding') { funding.push(p); R.skipped++; continue; }
    if (k === 'skip') { R.skipped++; continue; }
    if (done.has(p.id) || done.has(`${p.date}:${p.amount}`)) { R.done++; continue; }
    if (k === 'currency') { R.left.push({ p, why: 'currency' }); continue; }
    pays.push(p);
  }
  const lines = state.transactions.filter(t => !t.pp && PP_BANK.test(t.rawPayee || t.payee || ''));
  const pairs = [];
  pays.forEach((p, i) => lines.forEach((t, j) => {
    if (Math.sign(t.amount) !== Math.sign(p.amount) || Math.abs(t.amount - p.amount) > 0.005) return;
    const d = daysBetween(p.date, t.date);   // the card usually posts the same day or a few days later
    if (d < -2 || d > 6) return;
    pairs.push({ i, j, score: (ppNameHint(t, p) ? 0 : 10) + Math.abs(d) + (d < 0 ? 0.5 : 0) });
  }));
  pairs.sort((a, b) => a.score - b.score);
  const usedP = new Set(), usedT = new Set(), hist = categoryHistory();
  for (const { i, j } of pairs) {
    if (usedP.has(i) || usedT.has(j)) continue;
    usedP.add(i); usedT.add(j);
    R.matches.push(ppMatchRow(pays[i], lines[j], hist));
  }
  pays.forEach((p, i) => {
    if (usedP.has(i)) return;
    const funded = p.funded || funding.some(f => Math.abs(f.amount + p.amount) < 0.005 && Math.abs(daysBetween(f.date, p.date)) <= 1);
    R.left.push({ p, why: p.amount > 0 ? 'refund' : funded ? 'card' : funding.length ? 'balance' : 'unknown' });
  });
  R.matches.sort((a, b) => b.t.date.localeCompare(a.t.date));
  R.left.sort((a, b) => b.p.date.localeCompare(a.p.date));
  return R;
}
function ppMatchRow(p, t, hist) {
  const person = ppIsPerson(p);
  const raw = person ? `PAYPAL TRANSFER ${p.name}` : p.name;
  const rule = matchRule(raw, t);
  // a refund goes back to what the purchase was for
  const auto = rule ? null : autoCategory(raw, -Math.abs(t.amount), {}, hist);
  const guess = rule ? rule.categoryId : auto?.id || '';
  const had = isSplit(t) ? '' : (t.categoryId || '');
  const payee = rule?.rename || (person ? `PayPal ${t.amount < 0 ? 'to' : 'from'} ${prettyPayee(p.name)}` : prettyPayee(p.name)) || prettyPayee(t.payee);
  return { p, t, raw, payee, person: rule?.person || '', guess, how: rule ? 'rule' : auto?.how || '', had, categoryId: had || guess, include: true, touched: false };
}

function ppReviewOpen(rows, fileName) {
  startImport({ step: 'paypal', kind: 'paypal', source: 'paypal', ppRows: rows, fileName });
}
function renderPayPalStep(box) {
  const R = IMP.pp || (IMP.pp = ppMatch(IMP.ppRows || []));
  const M = R.matches, on = M.filter(m => m.include).length;
  const opts = catOptions(null, true);
  const refile = M.filter(m => m.had && m.guess && m.guess !== m.had);
  const s = n => n === 1 ? '' : 's';
  const acctName = id => acctById(id)?.name || '';
  const leftNote = R.left.some(l => l.why === 'card') ? '<p class="muted small">Import the card or bank statement that paid for these, then this PayPal file again. Ones already named are skipped.</p>' : '';
  box.innerHTML = `
    <p class="lede">PayPal’s file doesn’t add transactions. It names the ones your cards and bank show only as “PayPal”, using the store and amount PayPal recorded.</p>
    <p class="pp-sum">${M.length ? `<strong>${M.length} matched</strong>` : '<strong>No “PayPal” lines to name</strong>'}${R.done ? ` · ${R.done} named before` : ''}${R.left.length ? ` · ${R.left.length} without a match` : ''}</p>
    ${refile.length ? `<label class="check small"><input type="checkbox" id="pp-refile" ${IMP.ppRefile ? 'checked' : ''}> Also re-file ${refile.length === 1 ? 'the one that already has' : `the ${refile.length} that already have`} a category, using the store’s name</label>` : ''}
    ${M.length ? `<div class="pp-list">${M.map((m, i) => {
      const t = m.t, changed = m.had && m.categoryId !== m.had;
      return `<div class="pp-row ${m.include ? '' : 'off'}">
        <input type="checkbox" data-pp="${i}" ${m.include ? 'checked' : ''} aria-label="Name this one ${esc(m.payee)}">
        <div class="pp-main"><strong>${esc(m.payee)}</strong>
          <span class="muted small">${dateLabel(t.date, true)} · ${esc(acctName(t.accountId))} · was “${esc(t.rawPayee || t.payee)}”${m.p.item ? ` · ${esc(m.p.item)}` : ''}</span></div>
        <span class="num ${signClass(t.amount)}">${money(t.amount)}</span>
        ${isSplit(t) ? '<span class="muted small pp-cat">Split: categories kept</span>'
          : `<select class="pp-cat" data-ppcat="${i}" aria-label="Category for ${esc(m.payee)}"${m.how && m.categoryId === m.guess && !m.had ? ` title="${esc(m.how === 'rule' ? 'From your rule' : GUESS_WHY[m.how] || '')}"` : ''}>${opts.replace(`value="${m.categoryId}"`, `value="${m.categoryId}" selected`)}</select>`}
        ${changed ? `<span class="muted small pp-was">Was ${esc(catName(m.had))}</span>` : ''}
      </div>`;
    }).join('')}</div>` : ''}
    ${R.left.length ? `<details class="pp-left"${M.length ? '' : ' open'}><summary>${R.left.length} PayPal payment${s(R.left.length)} without a match</summary>${leftNote}
      <ul>${R.left.map(l => `<li><span class="nowrap">${dateLabel(l.p.date, true)}</span><span>${esc(l.p.name || l.p.type)}</span><span class="num ${signClass(l.p.amount)}">${money(l.p.amount)}</span><span class="muted small">${esc(PP_WHY[l.why])}</span></li>`).join('')}</ul></details>` : ''}
    ${R.skipped ? `<p class="muted small">${R.skipped} line${s(R.skipped)} that only move money inside PayPal (card funding, holds, transfers) ${R.skipped === 1 ? 'was' : 'were'} left out.</p>` : ''}`;
  box.onchange = e => {
    const el = e.target, d = el.dataset;
    if (d.pp != null) { M[+d.pp].include = el.checked; el.closest('.pp-row').classList.toggle('off', !el.checked); return ppCount(); }
    if (d.ppcat != null) { const m = M[+d.ppcat]; m.categoryId = el.value; m.touched = true; return; }
    if (el.id === 'pp-refile') {
      IMP.ppRefile = el.checked;
      for (const m of refile) if (!m.touched) m.categoryId = el.checked ? m.guess : m.had;
      return renderImport();
    }
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="ppapply" id="pp-go" ${on ? '' : 'disabled'}>${ppGoLabel(on)}</button>`);
}
const ppGoLabel = n => n ? `Name ${n.toLocaleString()} transaction${n === 1 ? '' : 's'}` : 'Nothing to name';
function ppCount() { const n = IMP.pp.matches.filter(m => m.include).length, b = $('#pp-go'); if (b) { b.textContent = ppGoLabel(n); b.disabled = !n; } }

function ppApply() {
  let named = 0, filed = 0;
  for (const m of IMP.pp.matches) {
    if (!m.include) continue;
    const t = state.transactions.find(x => x.id === m.t.id);
    if (!t || t.pp) continue;
    t.pp = { id: m.p.id, k: `${m.p.date}:${m.p.amount}`, was: t.rawPayee || t.payee };
    t.payee = m.payee; t.rawPayee = m.raw;
    if (m.p.item && !t.memo) t.memo = m.p.item;
    if (!isSplit(t) && (m.categoryId || '') !== (t.categoryId || '')) { t.categoryId = m.categoryId || null; if (m.categoryId) filed++; }
    if (m.person && !t.person && m.categoryId === m.guess) t.person = m.person;
    named++;
  }
  closeModal(); IMP = null;
  if (!named) return;
  commit();
  const unc = state.transactions.filter(t => t.pp && isUncat(t)).length;
  toast(`Named ${named} PayPal transaction${named === 1 ? '' : 's'}${filed ? `, and filed ${filed}` : ''}.${unc ? ` ${unc} still need a category.` : ''}`, { label: 'Undo', fn: undo });
}
