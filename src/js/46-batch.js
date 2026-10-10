/* ================= batch import: the month's downloads in one go =================
   Each file is read the same way as a single import, matched to its account (account number,
   the file's name pattern from last time, or overlap with transactions already there),
   and everything is reviewed on one screen. */

const isYearLike = s => /^(19|20)\d\d$/.test(s);
const MONTH_WORDS = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)/g;
/* A file name with dates and copy numbers removed: "Chase9876_Activity20261005.CSV" → "chase9876-activity". */
function fileStem(name) {
  let s = String(name || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '');
  s = s.replace(/\(\d+\)/g, ' ').replace(/\d{5,}/g, ' ').replace(/(?<!\d)\d{1,2}[-_.]\d{1,2}(?:[-_.]\d{2,4})?(?!\d)/g, ' ')
       .replace(/(?<!\d)(?:19|20)\d\d(?!\d)/g, ' ').replace(MONTH_WORDS, ' ');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const generic = /^((export|exported|transactions?|download|statement|statements|activity|history|data|file|untitled|accounts?|ofx|qfx|csv|qbo|pdf|bank|my)(-|$))+$/;
  return s.length < 4 || generic.test(s + '-') ? '' : s;
}
function matchByStem(name) {
  const st = fileStem(name); if (!st) return '';
  const a = txnAccounts().find(a => (a.importStems || []).includes(st));
  return a ? a.id : '';
}
/* The account whose existing transactions this file clearly overlaps (downloads usually overlap last month's). */
function matchByOverlap(list) {
  const keyOf = (t, sign) => (t.fitid ? 'fit:' + t.fitid : 'h:' + hashStr(`${t.date}|${round2(t.amount * sign)}|${normPayee(t.payee)}`));
  const keys = list.map(t => keyOf(t, 1)), flippedKeys = list.map(t => keyOf(t, -1));
  let best = null, bestN = 0, second = 0;
  for (const a of txnAccounts()) {
    const ids = new Set(state.transactions.filter(t => t.accountId === a.id && t.importId).map(t => (t.importId.startsWith('h:') ? t.importId.replace(/:\d+$/, '') : t.importId)));
    if (!ids.size) continue;
    for (const [ks, flipped] of [[keys, false], [flippedKeys, true]]) {
      const n = ks.filter(k => ids.has(k)).length;
      if (n > bestN) { second = bestN; bestN = n; best = { id: a.id, flipped }; } else if (n > second) second = n;
    }
  }
  return best && bestN >= 2 && bestN >= second * 2 ? best : null;
}
function withItem(it, fn) { const saved = IMP; IMP = it; try { return fn(); } finally { IMP = saved; } }
function rebuildItem(it) { withItem(it, () => { if (it.source === 'pdf') buildTxRowsFromPdf(); else buildTxRows(it.rawList); }); }
function itemAcctType(it) { return it.accountId === '__new' ? (it.newDefaults?.type || 'checking') : acctById(it.accountId)?.type; }
function suggestAccountName(it, type) {
  if (it.csvAcctName) return it.csvAcctName;
  const label = ACCOUNT_TYPES[type]?.label || 'Account';
  const skip = /^(activity|transactions?|statements?|stmt|export|checking|savings|card|credit|debit|bank|account|acct|history|download|\d+)$/;
  const brand = fileStem(it.fileName).split('-').map(w => w.replace(/\d+/g, '')).filter(w => w.length > 1 && !skip.test(w)).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return `${brand ? brand + ' ' : ''}${label}${it.fileLast4 ? ' ' + it.fileLast4 : ''}`.trim();
}
/* Some bank CSVs start with lines like "Account Name : Household Checking" and "Account Number : XXXX4421". */
function csvPreamble(it) {
  for (const r of (it.csv || []).slice(0, Math.min(it.headerRow || 0, 12))) {
    const line = r.join(' ');
    const name = /account\s*name\s*[:=]\s*(.+)$/i.exec(line), num = /account\s*(?:number|no\.?|#)\s*[:=]\s*\S*?(\d{4})\b/i.exec(line);
    if (name) it.csvAcctName = name[1].trim().slice(0, 60);
    if (num) it.fileLast4 = num[1];
  }
  // card exports mark purchases as "Sale"
  const m = it.map || {}, ti = (it.headers || []).findIndex(h => /^type$/i.test(String(h).trim()));
  if (ti >= 0 && (it.csv || []).slice((it.headerRow || 0) + 1, (it.headerRow || 0) + 40).some(r => /^sale$/i.test(String(r[ti] || '').trim()))) it.looksLikeCard = true;
  return m;
}
const accountsWithLast4 = l4 => (l4 ? txnAccounts().filter(a => a.last4 === l4) : []);
/* Card files sometimes list purchases as positive; flip them so money out is negative. */
function autoFlipForCard(it) {
  if (it.source !== 'csv' || itemAcctType(it) !== 'credit') return;
  const rows = it.txRows.filter(r => !/payment|thank you|autopay|pymt/i.test(r.payee));
  const pos = rows.filter(r => r.amount > 0).length, neg = rows.filter(r => r.amount < 0).length;
  if (pos >= 2 && pos > neg * 1.5) { it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount })); it.flipped = !it.flipped; it.autoFlipped = true; rebuildItem(it); }
}

async function analyzeBatchFile(file) {
  const saved = IMP;
  IMP = { step: 'pick', kind: 'txns' };
  try {
    await handleImportFile(file, { silent: true });
    const it = IMP;
    Object.assign(it, { file, include: true });
    if (it.error) { it.problem = it.error; it.include = false; return it; }
    if (it.step === 'positions' || it.step === 'paypal') return it;
    if (it.step === 'map') {
      if (it.useAcctCol) { it.solo = 'This file holds several accounts, like an export from another app. Import it on its own.'; it.include = false; return it; }
      const list = csvMappedRows();
      if (!list.length) { it.solo = 'Ọrọ̀ couldn’t tell which columns hold the date and amount. Import it on its own to choose them.'; it.include = false; return it; }
      it.multi = false; it.step = 'review'; it.rawList = list;
    }
    if (it.multi) { it.solo = 'This file holds several accounts. Import it on its own.'; it.include = false; return it; }
    if (!it.rawList && it.source !== 'pdf') it.rawList = it.ofx?.txns?.map(t => ({ ...t, bankCategory: '' })) || it.qif || [];
    // which account?
    if (it.source === 'csv') { csvPreamble(it); if (!it.accountId) it.accountId = guessAccount(it.fileLast4); }
    const sameNumber = accountsWithLast4(it.fileLast4), stemId = matchByStem(it.fileName);
    if (it.source === 'ofx' && sameNumber.length === 1) { it.accountId = sameNumber[0].id; it.matchedBy = `number ending ${it.fileLast4}`; }
    else if (stemId) { it.accountId = stemId; it.matchedBy = 'same kind of file as last time'; }
    else if (sameNumber.length === 1) { it.accountId = sameNumber[0].id; it.matchedBy = `number ending ${it.fileLast4}`; }
    else {
      it.accountId = '';
      const m = matchByOverlap(it.source === 'pdf' ? withItem(it, () => (buildTxRowsFromPdf(), it.rawList)) : it.rawList);
      if (m) {
        it.accountId = m.id; it.matchedBy = 'overlaps transactions already there';
        if (m.flipped) { if (it.source === 'pdf') it.flipAll = !it.flipAll; else it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount })); it.flipped = true; it.autoFlipped = true; }
      }
    }
    if (!it.accountId && sameNumber.length > 1) { it.accountId = sameNumber[0].id; it.matchedBy = `number ending ${it.fileLast4} (more than one account has it; check this)`; }
    if (!it.accountId) {
      const type = it.newDefaults?.type || (it.looksLikeCard ? 'credit' : guessTypeFromName(it.fileName));
      it.accountId = '__new'; it.newDefaults = { name: suggestAccountName(it, type), type, inst: '' };
    }
    rebuildItem(it);
    autoFlipForCard(it);
    return it;
  } finally { IMP = saved; }
}

async function startBatch(files) {
  IMP = { step: 'batch', items: [], reading: files.length };
  const box = $('#imp');
  for (let i = 0; i < files.length; i++) {
    if (box) box.innerHTML = `<p class="muted pad">Reading ${i + 1} of ${files.length}: ${esc(files[i].name)}…</p>`;
    setModalActions('<button class="btn ghost" data-close>Cancel</button>');
    IMP.items.push(await analyzeBatchFile(files[i]));
    if (!IMP || IMP.step !== 'batch') return; // closed while reading
  }
  IMP.reading = 0;
  renderImport();
}

function batchCounts(it) {
  const rows = it.txRows || [];
  return { add: rows.filter(r => r.include).length, dup: rows.filter(r => r.status === 'dup').length, maybe: rows.filter(r => r.status === 'maybe').length, maybeIn: rows.filter(r => r.status === 'maybe' && r.include).length, unc: rows.filter(r => r.include && !r.categoryId).length };
}
function renderBatchStep(box) {
  const items = IMP.items;
  let nTx = 0, nPosFiles = 0, nPP = 0;
  const cards = items.map((it, k) => {
    const head = `<header class="batch-head"><label class="check"><input type="checkbox" data-binc="${k}" ${it.include ? 'checked' : ''} ${it.problem || it.solo ? 'disabled' : ''}> <strong>${esc(it.fileName)}</strong></label>`;
    if (it.problem || it.solo) return `<section class="batch-item off">${head}<span class="muted small">Not included</span></header>
      <p class="notice ${it.problem ? 'bad' : ''} small">${esc(it.problem || it.solo)}</p>${it.solo ? `<button class="btn small" data-imp="bsolo-${k}">Import this file on its own</button>` : ''}</section>`;
    if (it.kind === 'paypal') {
      const pays = it.ppRows.filter(p => ['buy', 'refund'].includes(ppKind(p))).length;
      if (it.include) nPP++;
      return `<section class="batch-item ${it.include ? '' : 'off'}">${head}<span class="muted small">PayPal activity · ${pays} payment${pays === 1 ? '' : 's'}</span></header>
        <p class="muted small">Adds nothing new. After the other files import, Ọrọ̀ shows which card and bank lines it can name from this file.</p></section>`;
    }
    if (it.kind === 'positions') {
      const P = it.positions.filter(p => p.include), total = sum(P.map(p => p.value));
      if (it.include) nPosFiles++;
      const srcs = Object.keys(it.srcMap);
      return `<section class="batch-item ${it.include ? '' : 'off'}">${head}<span class="muted small">Holdings · ${P.length} position${P.length === 1 ? '' : 's'} · ${money(total, { cents: false })}</span></header>
        ${srcs.map((src, j) => `<div class="batch-row"><label class="field"><span>${esc(src || 'Into')}</span><select data-bsrc="${k}|${j}">${invAccountOptions(it.srcMap[src])}</select></label>
          ${it.srcMap[src] === '__new' ? `<label class="field"><span>New account name</span><input data-bsrcname="${k}|${j}" value="${esc(it.srcNames?.[src] ?? (src || 'Brokerage'))}"></label>${members().length > 1 ? `<label class="field"><span>Owner</span><select data-bsrcowner="${k}|${j}">${memberOptions(it.srcOwners?.[src] || defaultOwner())}</select></label>` : ''}` : ''}</div>`).join('')}
        <p class="muted small">Replaces the current holdings in ${srcs.length === 1 ? 'that account' : 'those accounts'} with this snapshot.</p></section>`;
    }
    const c = batchCounts(it), rows = it.txRows || [], dates = rows.map(r => r.date).sort();
    if (it.include) nTx += c.add;
    const kind = { ofx: 'QFX/OFX', csv: 'CSV', pdf: 'PDF statement', qif: 'QIF' }[it.source] || 'File';
    const bal = it.ofx?.balance;
    return `<section class="batch-item ${it.include ? '' : 'off'}">${head}
        <span class="muted small">${kind}${dates.length ? ` · ${dateLabel(dates[0], true)} to ${dateLabel(dates[dates.length - 1], true)}` : ''}</span></header>
      <div class="batch-row">
        <label class="field"><span>Into</span><select data-bacct="${k}">${txnAccountOptions(it.accountId)}</select></label>
        <span class="muted small batch-why">${it.accountId === '__new' ? 'No match yet. Ọrọ̀ will remember this file next time.' : it.matchedBy ? `Matched: ${esc(it.matchedBy)}` : ''}</span>
      </div>
      ${it.accountId === '__new' ? `<div class="batch-new">${newAccountFields(`b${k}-new`, it.newDefaults || {})}</div>` : ''}
      <p class="batch-counts"><strong>${c.add.toLocaleString()} new</strong>${c.dup ? ` · ${c.dup} already in Ọrọ̀` : ''}${c.unc ? ` · ${c.unc} need a category` : ''}${it.autoFlipped ? ' · <span class="tag soft">signs flipped: this file listed purchases as positive</span>' : ''}</p>
      <div class="toolbar">
        ${c.maybe ? `<label class="check small"><input type="checkbox" data-bmaybe="${k}" ${c.maybeIn ? 'checked' : ''}> Also add ${c.maybe} possible duplicate${c.maybe === 1 ? '' : 's'}</label>` : ''}
        ${bal && isFinite(bal.amount) ? `<label class="check small"><input type="checkbox" data-bbal="${k}" ${it.setBal !== false ? 'checked' : ''}> Set balance to ${money(Math.abs(bal.amount))} as of ${dateLabel(bal.date, true)}</label>` : ''}
        ${it.source !== 'ofx' ? `<button class="btn small ghost" data-imp="bflip-${k}">Flip signs</button>` : ''}
      </div>
      ${c.add ? `<details><summary class="small">Preview</summary><table class="ledger compact"><tbody>${rows.filter(r => r.include).slice(0, 8).map(r => `<tr><td class="nowrap">${dateLabel(r.date, true)}</td><td>${esc(prettyPayee(r.payee))}</td><td class="muted small">${r.categoryId ? esc(catName(r.categoryId)) : 'Uncategorized'}</td><td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('')}</tbody></table>${c.add > 8 ? `<p class="muted small">and ${c.add - 8} more</p>` : ''}</details>` : ''}
    </section>`;
  }).join('');
  const nFiles = items.filter(it => it.include && !it.problem && !it.solo).length;
  box.innerHTML = `<p class="lede">${items.length} files. Check where each one goes, then import them together. Duplicates are skipped automatically.</p><div class="batch-list">${cards}</div>`;
  box.onchange = e => {
    const el = e.target, d = el.dataset;
    const at = s => s.split('|').map(Number);
    if (d.binc != null) { items[+d.binc].include = el.checked; return renderImport(); }
    if (d.bacct != null) {
      const it = items[+d.bacct]; it.accountId = el.value; it.matchedBy = el.value && el.value !== '__new' ? 'chosen by you' : '';
      if (el.value === '__new' && !it.newDefaults?.name) { const type = guessTypeFromName(it.fileName); it.newDefaults = { name: suggestAccountName(it, type), type, inst: '' }; }
      if (it.autoFlipped) { it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount })); it.flipped = !it.flipped; it.autoFlipped = false; }
      rebuildItem(it); autoFlipForCard(it); return renderImport();
    }
    const nm = /^b(\d+)-new-(name|type|inst|owner)$/.exec(el.id || '');
    if (nm) { const it = items[+nm[1]]; it.newDefaults = { ...(it.newDefaults || {}), [nm[2]]: el.value }; if (nm[2] === 'type') { rebuildItem(it); renderImport(); } return; }
    if (d.bmaybe != null) { const it = items[+d.bmaybe]; it.txRows.forEach(r => { if (r.status === 'maybe') r.include = el.checked; }); return renderImport(); }
    if (d.bbal != null) { items[+d.bbal].setBal = el.checked; return; }
    if (d.bsrc != null) { const [k, j] = at(d.bsrc), it = items[k]; it.srcMap[Object.keys(it.srcMap)[j]] = el.value; return renderImport(); }
    if (d.bsrcname != null) { const [k, j] = at(d.bsrcname), it = items[k]; (it.srcNames = it.srcNames || {})[Object.keys(it.srcMap)[j]] = el.value; return; }
    if (d.bsrcowner != null) { const [k, j] = at(d.bsrcowner), it = items[k]; (it.srcOwners = it.srcOwners || {})[Object.keys(it.srcMap)[j]] = el.value; return; }
  };
  const parts = [];
  if (nTx) parts.push(`${nTx.toLocaleString()} transaction${nTx === 1 ? '' : 's'}`);
  if (nPosFiles) parts.push(`${nPosFiles} holdings file${nPosFiles === 1 ? '' : 's'}`);
  if (nPP) parts.push('PayPal details');
  setModalActions(`<button class="btn ghost" data-imp="back">Start over</button><button class="btn primary" data-imp="bcommit" ${nFiles ? '' : 'disabled'}>${parts.length ? `Import ${parts.join(' and ')}` : 'Nothing to import'}</button>`);
}

function batchAction(act) {
  const k = +act.split('-')[1];
  if (act.startsWith('bflip-')) {
    const it = IMP.items[k];
    if (it.source === 'pdf') { it.flipAll = !it.flipAll; } else it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount }));
    it.flipped = !it.flipped; it.autoFlipped = false;
    rebuildItem(it); return renderImport();
  }
  if (act.startsWith('bsolo-')) { const file = IMP.items[k].file; IMP = { step: 'pick', kind: 'txns' }; return handleImportFile(file); }
  if (act === 'bcommit') return commitBatch();
}

function commitBatch() {
  const items = IMP.items.filter(it => it.include && !it.problem && !it.solo);
  for (const it of items) {
    if (it.kind === 'positions' || it.kind === 'paypal') continue;
    const problem = txItemProblem(it);
    if (problem) return toast(`${it.fileName}: ${problem}`);
  }
  let added = 0, skipped = 0, unc = 0, holdings = 0, bal = false;
  const accts = new Set(), posAccts = new Set(), fresh = [];
  const pp = items.filter(it => it.kind === 'paypal');
  for (const it of items) {
    if (it.kind === 'paypal') continue;
    if (it.kind === 'positions') { const r = applyPositionsItem(it); holdings += r.count; r.accounts.forEach(a => posAccts.add(a)); continue; }
    const r = applyTxItem(it);
    added += r.added; skipped += r.skipped; unc += r.unc; if (r.bal) bal = true;
    Object.values(r.dest).forEach(a => accts.add(a.id)); fresh.push(...r.fresh);
  }
  closeModal(); IMP = null;
  if (pp.length && pp.length === items.length) return ppReviewOpen(pp.flatMap(it => it.ppRows), pp[0].fileName);
  commit();
  if (pp.length) ppReviewOpen(pp.flatMap(it => it.ppRows), pp[0].fileName);   // now that the card statements are in
  const bits = [];
  if (added || accts.size) bits.push(`Imported ${added.toLocaleString()} transaction${added === 1 ? '' : 's'} into ${accts.size} account${accts.size === 1 ? '' : 's'}`);
  if (posAccts.size) bits.push(`${bits.length ? 'updated' : 'Updated'} ${holdings} holding${holdings === 1 ? '' : 's'} in ${posAccts.size} account${posAccts.size === 1 ? '' : 's'}`);
  toast(`${bits.join(' and ')}.${skipped ? ` Skipped ${skipped} already there.` : ''}${unc ? ` ${unc} need a category.` : ''}`,
    unc ? { label: 'Categorize', fn: () => go('#/transactions?cat=_none&m=all') } : { label: 'Undo', fn: undo });
  if (fresh.some(a => a.ledger && !a.anchorBalance && !bal)) setTimeout(() => toast('Set each new account’s current balance (Accounts › Update balances) so its balance tracks from here.'), 400);
}
