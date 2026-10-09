/* ================= import wizard ================= */
let IMP = null;

function startImport(preset = {}) {
  IMP = { step: 'pick', kind: 'txns', ...preset };
  openModal({ title: 'Import', wide: true, body: '<div id="imp"></div>', id: 'import-modal' });
  renderImport();
}
const txnAccounts = () => activeAccounts().filter(a => !holdingsFor(a.id).length && !['realestate', 'vehicle', 'private'].includes(a.type));
function txnAccountOptions(sel, newLabel = 'New account…') {
  return `<option value="">Choose an account…</option>` +
    txnAccounts().map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.institution ? ' · ' + esc(a.institution) : ''}</option>`).join('') +
    `<option value="__new" ${sel === '__new' ? 'selected' : ''}>${esc(newLabel)}</option>`;
}
function invAccountOptions(sel) {
  const accts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  return accts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('') + `<option value="__new" ${sel === '__new' ? 'selected' : ''}>New account…</option>`;
}
function newAccountFields(prefix, def = {}) {
  const types = def.types || Object.keys(ACCOUNT_TYPES);
  return `<div class="inline-new">
    <label class="field"><span>Account name</span><input id="${prefix}-name" value="${esc(def.name || '')}" placeholder="e.g. Checking"></label>
    <label class="field"><span>Type</span><select id="${prefix}-type">${types.map(t => `<option value="${t}" ${t === def.type ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</select></label>
    <label class="field"><span>Institution</span><input id="${prefix}-inst" value="${esc(def.inst || '')}" placeholder="Optional"></label>
  </div>`;
}
const guessTypeFromName = n => /card|visa|amex|american express|mastercard|discover|sapphire|freedom/i.test(n) ? 'credit' : /saving|reserve|money market|hysa/i.test(n) ? 'savings' : /loan|mortgage/i.test(n) ? 'loan' : 'checking';

async function handleImportFile(file, opts = {}) {
  const box = $('#imp'); if (box && !opts.silent) box.innerHTML = `<p class="muted pad">Reading ${esc(file.name)}…</p>`;
  IMP.fileName = file.name;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const fours = [...file.name.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map(m => m[1]);
  const last4 = fours.find(f => activeAccounts().some(a => a.last4 === f)) || fours.filter(f => !isYearLike(f)).pop() || '';
  IMP.fileLast4 = last4;
  try {
    if (ext === 'pdf') {
      const lines = await pdfToLines(await readFileAsBuffer(file));
      const { rows, period, last4: textLast4, isCard } = parseStatementLines(lines);
      if (!rows.length) throw new Error('Ọrọ̀ couldn’t find transaction lines in that PDF. If it’s a scanned image, or an unusual layout, download the OFX/QFX or CSV version from your bank instead.');
      IMP.source = 'pdf'; IMP.period = period; IMP.pdfRows = rows; if (textLast4) IMP.fileLast4 = textLast4;
      IMP.accountId = guessAccount(textLast4) || guessAccount(last4);
      if (!IMP.accountId) IMP.newDefaults = { type: isCard ? 'credit' : 'checking' };
      IMP.step = 'review'; buildTxRowsFromPdf();
    } else {
      const text = await readFileAsText(file);
      if (looksLikeOFX(text) || ['ofx', 'qfx', 'qbo'].includes(ext)) {
        const o = parseOFX(text);
        IMP.source = 'ofx'; IMP.ofx = o; if (o.last4) IMP.fileLast4 = o.last4;
        if (o.positions.length) {
          IMP.kind = 'positions'; IMP.step = 'positions';
          IMP.positions = o.positions.map(p => ({ ...p, assetClass: guessAssetClass(p.symbol, p.name), include: true }));
          if (o.invCash) IMP.positions.push({ symbol: 'CASH', name: 'Cash balance', shares: o.invCash, price: 1, value: o.invCash, costBasis: o.invCash, srcAccount: o.acctId, assetClass: 'Cash', include: true });
          IMP.srcMap = { [o.acctId]: guessAccount(o.last4, true) };
        } else {
          if (!o.txns.length) throw new Error('That file didn’t contain any transactions. Try a wider date range when you download it.');
          IMP.accountId = guessAccount(o.last4);
          if (!IMP.accountId) IMP.newDefaults = { type: o.isCard ? 'credit' : (/SAVINGS/i.test(o.ofxType) ? 'savings' : 'checking') };
          IMP.step = 'review'; buildTxRows(o.txns.map(t => ({ ...t, bankCategory: '' })));
        }
      } else if (looksLikeQIF(text) || ext === 'qif') {
        const rows = parseQIF(text);
        if (!rows.length) throw new Error('No transactions were found in that QIF file.');
        IMP.source = 'qif'; IMP.qif = rows; IMP.createCats = true;
        setupAccountMap(rows, last4);
        IMP.step = 'review'; buildTxRows(rows);
      } else {
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error('That file looks empty.');
        const hi = findHeaderRow(rows);
        if (isPositionsHeader(rows[hi])) {
          IMP.source = 'csv'; IMP.kind = 'positions'; IMP.step = 'positions';
          IMP.positions = parsePositionsCSV(rows).map(p => ({ ...p, assetClass: guessAssetClass(p.symbol, p.name), include: true }));
          if (!IMP.positions.length) throw new Error('Ọrọ̀ found a positions file but couldn’t read any holdings from it.');
          IMP.srcMap = {};
          for (const src of [...new Set(IMP.positions.map(p => p.srcAccount || ''))]) IMP.srcMap[src] = matchInvAccount(src);
        } else {
          IMP.source = 'csv'; IMP.csv = rows; IMP.headerRow = hi; IMP.headers = rows[hi];
          IMP.map = guessTxnMapping(rows[hi]);
          IMP.useDebitCredit = IMP.map.amount < 0 && IMP.map.debit >= 0;
          IMP.useAcctCol = IMP.map.account >= 0;
          IMP.createCats = IMP.map.category >= 0 && IMP.useAcctCol; // exports from other budgeting apps
          IMP.last4 = last4;
          IMP.accountId = guessAccount(last4);
          IMP.step = 'map';
        }
      }
    }
  } catch (e) {
    IMP.error = e.message || String(e); IMP.step = 'pick';
  }
  if (!opts.silent) renderImport();
}
function guessAccount(last4, inv) {
  if (last4) { const a = activeAccounts().find(a => a.last4 === last4); if (a) return a.id; }
  return inv ? '__new' : '';
}
function matchInvAccount(src) {
  if (!src) return activeAccounts().find(a => ACCOUNT_TYPES[a.type].bucket === 'invest')?.id || '__new';
  const s = src.toLowerCase(), digits = src.replace(/\D/g, '').slice(-4);
  const a = activeAccounts().find(a => (a.importName && a.importName.toLowerCase() === s) || (digits && a.last4 === digits) || a.name.toLowerCase() === s);
  return a ? a.id : '__new';
}
function matchTxnAccount(src) {
  if (!src) return '';
  const s = src.toLowerCase().trim(), digits = src.replace(/\D/g, '').slice(-4);
  const a = txnAccounts().find(a => (a.importName && a.importName.toLowerCase() === s) || a.name.toLowerCase() === s || (digits.length === 4 && a.last4 === digits));
  return a ? a.id : '__new';
}
function setupAccountMap(rows, last4) {
  const srcs = [...new Set(rows.map(r => r.srcAccount || ''))];
  IMP.multi = srcs.length > 1 || (srcs[0] && srcs[0] !== '');
  if (IMP.multi) { IMP.acctMap = IMP.acctMap || {}; for (const s of srcs) if (!(s in IMP.acctMap)) IMP.acctMap[s] = matchTxnAccount(s); }
  else IMP.accountId = IMP.accountId || guessAccount(last4);
}

/* ---- CSV mapping → rows ---- */
function csvMappedRows() {
  const m = IMP.map, out = [];
  const typeVals = m.ttype >= 0 ? new Set(IMP.csv.slice(IMP.headerRow + 1, IMP.headerRow + 40).map(r => (r[m.ttype] || '').toLowerCase())) : null;
  const useType = typeVals && [...typeVals].every(v => !v || v === 'debit' || v === 'credit');
  for (const r of IMP.csv.slice(IMP.headerRow + 1)) {
    const date = parseDateFlexible(r[m.date]);
    if (!date) continue;
    let amount;
    if (IMP.useDebitCredit) {
      const d = parseAmount(r[m.debit]), c = parseAmount(r[m.credit]);
      if (!isFinite(d) && !isFinite(c)) continue;
      amount = (isFinite(c) ? Math.abs(c) : 0) - (isFinite(d) ? Math.abs(d) : 0);
    } else { amount = parseAmount(r[m.amount]); if (!isFinite(amount)) continue; }
    if (useType) amount = Math.abs(amount) * ((r[m.ttype] || '').toLowerCase() === 'debit' ? -1 : 1);
    if (IMP.flip) amount = -amount;
    out.push({ date, payee: (r[m.payee] || '').trim(), amount: round2(amount), memo: m.memo >= 0 ? r[m.memo] : '', bankCategory: m.category >= 0 ? (r[m.category] || '').trim() : '', mcc: m.mcc >= 0 ? (r[m.mcc] || '').trim() : '', tags: m.tags >= 0 ? parseTags(r[m.tags]) : [], srcAccount: IMP.useAcctCol && m.account >= 0 ? (r[m.account] || '').trim() : '', fitid: '' });
  }
  return out;
}
function buildTxRowsFromPdf() {
  const acct = acctById(IMP.accountId);
  const isCard = acct ? acct.type === 'credit' : (IMP.newDefaults?.type === 'credit');
  buildTxRows(IMP.pdfRows.map(r => ({ date: r.date, payee: r.payee, amount: round2(pdfSignedAmount(r, isCard) * (IMP.flipAll ? -1 : 1)), fitid: '', memo: '', bankCategory: '' })));
}
/* Category from another app's export: exact name, "Group: Category", or a close match. */
function findCategoryByName(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const parts = n.split(/\s*[:>/]\s*/);
  const leaf = parts[parts.length - 1];
  return state.categories.find(c => c.name.toLowerCase() === n) || state.categories.find(c => c.name.toLowerCase() === leaf) || null;
}
function rowAccountId(r) { return IMP.multi ? (IMP.acctMap[r.srcAccount || ''] || '') : (IMP.accountId || ''); }
function buildTxRows(list) {
  IMP.rawList = list;
  const seenByAcct = {};
  const hist = categoryHistory(), transferId = categoryIdByName('Transfer between accounts'), cardPayId = categoryIdByName('Credit card payment');
  IMP.txRows = list.map(t => {
    const acctId = rowAccountId(t);
    const acct = acctId && !acctId.startsWith('__') ? acctById(acctId) : null;
    const existing = acct ? txByAccount(acct.id) : [];
    const ids = acct ? (seenByAcct[acct.id] = seenByAcct[acct.id] || new Set(existing.map(x => x.importId).filter(Boolean))) : new Set();
    const seen = (IMP._seen = IMP._seen || {});
    const base = t.fitid ? 'fit:' + t.fitid : 'h:' + hashStr(`${t.date}|${t.amount}|${normPayee(t.payee)}`);
    const k = (acctId || '') + base; seen[k] = (seen[k] || 0) + 1;
    const importId = t.fitid ? base : `${base}:${seen[k]}`;
    let status = 'new';
    if (ids.has(importId)) status = 'dup';
    else if (existing.some(e => Math.abs(e.amount - t.amount) < 0.005 && Math.abs(daysBetween(e.date, t.date)) <= 3 && (normPayee(e.rawPayee || e.payee).split(' ')[0] === normPayee(t.payee).split(' ')[0] || !e.importId))) status = 'maybe';
    const rule = matchRule(t.payee, { amount: t.amount, accountId: acctId });
    const named = findCategoryByName(t.bankCategory);
    const auto = rule || named ? null : autoCategory(t.payee, t.amount, { mcc: t.mcc, bankCategory: t.bankCategory }, hist);
    let categoryId = rule ? rule.categoryId : named ? named.id : (auto ? auto.id : null);
    const type = acct ? acct.type : (IMP.multi ? guessTypeFromName(t.srcAccount || '') : IMP.newDefaults?.type);
    // money coming into a credit card is almost always a payment
    if (type === 'credit' && t.amount > 0 && cardPayId && (!categoryId || categoryId === transferId) && /payment|thank you|autopay|pymt|transfer from|ach deposit/i.test(t.payee)) categoryId = cardPayId;
    const willCreate = !categoryId && IMP.createCats && t.bankCategory && !/^(uncategori[sz]ed|none|transfer.*|.*ready to assign|to be budgeted|split.*)$/i.test(t.bankCategory);
    return { ...t, importId, status, include: status === 'new', categoryId: categoryId || '', guess: auto && categoryId === auto.id ? auto.how : '', newCat: willCreate ? t.bankCategory : '', rename: rule?.rename, person: rule?.person };
  }).sort((a, b) => b.date.localeCompare(a.date));
  IMP._seen = {};
}

/* ---- rendering ---- */
function renderImport() {
  const box = $('#imp'); if (!box || !IMP) return;
  const s = IMP.step;
  if (s === 'pick') {
    box.innerHTML = `
      ${IMP.error ? `<div class="notice bad">${esc(IMP.error)}</div>` : ''}
      <label class="drop" id="imp-drop">
        <input type="file" id="imp-file" accept=".csv,.ofx,.qfx,.qbo,.qif,.pdf,.txt" multiple>
        <span class="drop-title">Drop statements or exports here</span>
        <span class="muted">or click to choose. One file or the whole month’s downloads at once. OFX, QFX, QBO, QIF, CSV or PDF.</span>
        <span class="drop-note">Read on this Mac. Nothing is uploaded.</span>
      </label>
      <div class="help-grid">
        <div><h4>Bank and credit card activity</h4><p>On your bank’s site, look for “Download transactions.” Pick <strong>Quicken (QFX)</strong> or <strong>OFX</strong> if offered: it carries IDs that prevent duplicates and the current balance. CSV works too.</p></div>
        <div><h4>Brokerage holdings</h4><p>Download the <strong>Positions</strong> page as CSV (Fidelity, Schwab, Vanguard and most others), or an investment QFX. Ọrọ̀ updates shares, prices and cost basis.</p></div>
        <div><h4>Moving from another app</h4><p>Exports from <strong>YNAB, Monarch, Mint, Copilot, Tiller</strong> (CSV) or <strong>Quicken</strong> (QIF) bring every account at once, with categories, tags and notes. PDF statements work as a last resort.</p></div>
      </div>`;
    const inp = $('#imp-file'), drop = $('#imp-drop');
    inp.onchange = () => importFiles([...inp.files]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); };
    setModalActions('<button class="btn ghost" data-close>Cancel</button>');
    return;
  }
  if (s === 'map') return renderMapStep(box);
  if (s === 'review') return renderReviewStep(box);
  if (s === 'positions') return renderPositionsStep(box);
  if (s === 'batch') return renderBatchStep(box);
}
function importFiles(files) {
  if (!files.length) return;
  if (files.length === 1) return handleImportFile(files[0]);
  startBatch(files);
}
function colSelect(id, val, allowNone) {
  return `<select id="${id}">${allowNone ? `<option value="-1">None</option>` : ''}${IMP.headers.map((h, i) => `<option value="${i}" ${i === val ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('')}</select>`;
}
function acctMapBlock() {
  const srcs = Object.keys(IMP.acctMap || {});
  return `<div class="map-list"><p class="muted small">This file has ${srcs.length} account${srcs.length === 1 ? '' : 's'}. Match each one, or let Ọrọ̀ create it.</p>${srcs.map((src, k) => `<div class="map-row"><span class="map-src">${esc(src || '(no account name)')}</span><select data-amap="${k}">${txnAccountOptions(IMP.acctMap[src], `New account “${src || 'Imported'}”`)}</select></div>`).join('')}</div>`;
}
function renderMapStep(box) {
  const m = IMP.map;
  const preview = csvMappedRows();
  if (IMP.useAcctCol) setupAccountMap(preview, IMP.last4); else IMP.multi = false;
  box.innerHTML = `
    <p class="lede">${esc(IMP.fileName)} has ${IMP.csv.length - IMP.headerRow - 1} rows. Check that Ọrọ̀ picked the right columns.</p>
    <div class="form-grid four">
      <label class="field"><span>Date</span>${colSelect('map-date', m.date)}</label>
      <label class="field"><span>Description</span>${colSelect('map-payee', m.payee)}</label>
      <label class="field"><span>Category</span>${colSelect('map-category', m.category, true)}</label>
      <label class="field"><span>Account</span>${colSelect('map-account', m.account, true)}</label>
    </div>
    <div class="form-grid four">
      <label class="check"><input type="checkbox" id="map-dc" ${IMP.useDebitCredit ? 'checked' : ''}> Separate debit and credit columns</label>
      ${IMP.useDebitCredit
        ? `<label class="field"><span>Debit (money out)</span>${colSelect('map-debit', m.debit)}</label><label class="field"><span>Credit (money in)</span>${colSelect('map-credit', m.credit)}</label>`
        : `<label class="field"><span>Amount</span>${colSelect('map-amount', m.amount)}</label>`}
      <label class="check"><input type="checkbox" id="map-flip" ${IMP.flip ? 'checked' : ''}> Flip signs (purchases show as positive)</label>
    </div>
    ${IMP.useAcctCol ? acctMapBlock() : `<div class="form-grid"><label class="field"><span>Import into</span><select id="imp-acct">${txnAccountOptions(IMP.accountId)}</select></label></div><div id="imp-new">${IMP.accountId === '__new' ? newAccountFields('imp-new', { type: 'checking', ...(IMP.newDefaults || {}) }) : ''}</div>`}
    ${m.category >= 0 ? `<label class="check"><input type="checkbox" id="map-create" ${IMP.createCats ? 'checked' : ''}> Create categories from the file that Ọrọ̀ doesn’t have yet</label>` : ''}
    <table class="ledger compact"><thead><tr><th>Date</th><th>Description</th>${IMP.useAcctCol ? '<th>Account</th>' : ''}${m.category >= 0 ? '<th>Category</th>' : ''}<th class="num">Amount</th></tr></thead>
      <tbody>${preview.slice(0, 6).map(r => `<tr><td>${dateLabel(r.date, true)}</td><td>${esc(r.payee)}</td>${IMP.useAcctCol ? `<td class="muted">${esc(r.srcAccount)}</td>` : ''}${m.category >= 0 ? `<td class="muted">${esc(r.bankCategory)}</td>` : ''}<td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No rows could be read with this mapping.</td></tr>'}</tbody></table>
    <p class="muted small">Money out should be negative. Purchases on a credit card are money out.</p>`;
  const upd = () => {
    m.date = +$('#map-date').value; m.payee = +$('#map-payee').value; m.category = +$('#map-category').value; m.account = +$('#map-account').value;
    IMP.useAcctCol = m.account >= 0;
    IMP.useDebitCredit = $('#map-dc').checked; IMP.flip = $('#map-flip').checked;
    if ($('#map-create')) IMP.createCats = $('#map-create').checked;
    if ($('#map-amount')) m.amount = +$('#map-amount').value;
    if ($('#map-debit')) { m.debit = +$('#map-debit').value; m.credit = +$('#map-credit').value; }
    if (IMP.useDebitCredit && m.debit < 0) { m.debit = 0; m.credit = 0; }
    if ($('#imp-acct')) IMP.accountId = $('#imp-acct').value;
    stashNewAcct(); renderImport();
  };
  box.onchange = e => {
    const el = e.target;
    if (el.dataset.amap != null) { IMP.acctMap[Object.keys(IMP.acctMap)[+el.dataset.amap]] = el.value; return; }
    if (el.closest('.inline-new')) return;
    upd();
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="to-review">Continue</button>`);
}
function stashNewAcct() {
  if ($('#imp-new-name')) IMP.newDefaults = { name: $('#imp-new-name').value, type: $('#imp-new-type').value, inst: $('#imp-new-inst').value };
}

function renderReviewStep(box) {
  const rows = IMP.txRows || [];
  const inc = rows.filter(r => r.include);
  const dates = rows.map(r => r.date).sort();
  const dup = rows.filter(r => r.status !== 'new').length;
  const bal = IMP.ofx?.balance;
  const opts = catOptions(null, true);
  const newCats = [...new Set(rows.filter(r => r.include && r.newCat && !r.categoryId).map(r => r.newCat))];
  box.innerHTML = `
    ${IMP.multi ? acctMapBlock() : `<div class="form-grid"><label class="field"><span>Import into</span><select id="imp-acct">${txnAccountOptions(IMP.accountId)}</select></label></div>
    <div id="imp-new">${IMP.accountId === '__new' ? newAccountFields('imp-new', { type: 'checking', ...(IMP.newDefaults || {}) }) : ''}</div>`}
    <p class="lede">${rows.length.toLocaleString()} transaction${rows.length === 1 ? '' : 's'}${dates.length ? `, ${dateLabel(dates[0], true)} to ${dateLabel(dates[dates.length - 1], true)}` : ''}.
      ${dup ? `${dup} look${dup === 1 ? 's' : ''} like ${dup === 1 ? 'a duplicate' : 'duplicates'} and ${dup === 1 ? 'is' : 'are'} unchecked.` : 'None of them are already in Ọrọ̀.'}
      ${IMP.source === 'pdf' ? ' Read from a PDF: check the signs. Click any amount to flip it.' : ''}
      ${newCats.length ? ` ${newCats.length} new categor${newCats.length === 1 ? 'y' : 'ies'} will be created: ${newCats.slice(0, 5).map(esc).join(', ')}${newCats.length > 5 ? '…' : ''}.` : ''}</p>
    <div class="toolbar">
      <button class="btn small ghost" data-imp="all">Check all</button>
      <button class="btn small ghost" data-imp="none">Uncheck all</button>
      ${IMP.source !== 'ofx' ? `<button class="btn small ghost" data-imp="flipall">Flip every sign</button>` : ''}
      ${bal && isFinite(bal.amount) ? `<label class="check"><input type="checkbox" id="imp-bal" ${IMP.setBal !== false ? 'checked' : ''}> Set the balance to ${money(Math.abs(bal.amount))} as of ${dateLabel(bal.date, true)}</label>` : ''}
    </div>
    <div class="scroll-table tall"><table class="ledger compact" id="imp-table"><thead><tr><th class="cb"></th><th>Date</th><th>Description</th>${IMP.multi ? '<th>Account</th>' : ''}<th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${rows.slice(0, 1500).map((r, i) => `<tr class="${r.include ? '' : 'off'}" data-i="${i}">
        <td class="cb"><input type="checkbox" data-row="${i}" ${r.include ? 'checked' : ''} aria-label="Include"></td>
        <td class="nowrap">${dateLabel(r.date, true)}</td>
        <td>${esc(prettyPayee(r.payee))}<div class="muted small">${esc(r.payee)}${r.tags?.length ? ' · ' + r.tags.map(x => '#' + esc(x)).join(' ') : ''}</div></td>
        ${IMP.multi ? `<td class="muted small">${esc(r.srcAccount)}</td>` : ''}
        <td>${r.newCat && !r.categoryId ? `<span class="tag soft" title="Will be created">New: ${esc(r.newCat)}</span>` : `<select data-cat="${i}"${r.guess && r.categoryId ? ` title="${esc(GUESS_WHY[r.guess] || '')}"` : ''}>${opts.replace(`value="${r.categoryId}"`, `value="${r.categoryId}" selected`)}</select>`}</td>
        <td class="num ${signClass(r.amount)}">${IMP.source !== 'ofx' ? `<button class="linklike num" data-flip="${i}" title="Flip sign">${money(r.amount)}</button>` : money(r.amount)}</td>
        <td>${r.status === 'dup' ? '<span class="tag">Already imported</span>' : r.status === 'maybe' ? '<span class="tag">Possible duplicate</span>' : ''}</td></tr>`).join('')}
    </tbody></table>${rows.length > 1500 ? `<p class="muted small">Showing the first 1,500 rows for review; all ${rows.length.toLocaleString()} will import.</p>` : ''}</div>`;
  const rebuild = () => { stashNewAcct(); if (IMP.source === 'pdf') buildTxRowsFromPdf(); else buildTxRows(IMP.rawList); renderImport(); };
  if ($('#imp-acct')) $('#imp-acct').onchange = e => { IMP.accountId = e.target.value; rebuild(); };
  box.onchange = e => {
    const t = e.target;
    if (t.dataset.amap != null) { IMP.acctMap[Object.keys(IMP.acctMap)[+t.dataset.amap]] = t.value; return rebuild(); }
    if (t.dataset.row != null) { rows[+t.dataset.row].include = t.checked; t.closest('tr').classList.toggle('off', !t.checked); updateImportCount(); }
    if (t.dataset.cat != null) { rows[+t.dataset.cat].categoryId = t.value; rows[+t.dataset.cat].guess = ''; }
    if (t.id === 'imp-bal') IMP.setBal = t.checked;
  };
  $('#imp-table').onclick = e => {
    const b = e.target.closest('[data-flip]'); if (!b) return;
    const r = rows[+b.dataset.flip]; r.amount = -r.amount;
    b.textContent = money(r.amount); b.closest('td').className = 'num ' + signClass(r.amount);
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="commit" id="imp-go">Import ${inc.length.toLocaleString()} transaction${inc.length === 1 ? '' : 's'}</button>`);
}
function updateImportCount() { const n = IMP.txRows.filter(r => r.include).length; const b = $('#imp-go'); if (b) b.textContent = `Import ${n.toLocaleString()} transaction${n === 1 ? '' : 's'}`; }

function renderPositionsStep(box) {
  const P = IMP.positions;
  const srcs = Object.keys(IMP.srcMap);
  const total = sum(P.filter(p => p.include).map(p => p.value));
  box.innerHTML = `
    <p class="lede">${P.length} holding${P.length === 1 ? '' : 's'} worth ${money(total, { cents: false })} in ${srcs.length} account${srcs.length === 1 ? '' : 's'}. Choose where each account goes in Ọrọ̀.</p>
    <div class="map-list">${srcs.map((src, k) => `
      <div class="map-row">
        <span class="map-src">${esc(src || IMP.fileName)}</span>
        <select data-src="${k}">${invAccountOptions(IMP.srcMap[src])}</select>
        ${IMP.srcMap[src] === '__new' ? `<input data-srcname="${k}" value="${esc(IMP.srcNames?.[src] ?? (src || 'Brokerage'))}" placeholder="Account name"><select data-srctype="${k}">${['brokerage', 'retirement', 'education', 'hsa', 'crypto'].map(t => `<option value="${t}" ${(IMP.srcTypes?.[src] || guessInvType(src)) === t ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</select>` : ''}
      </div>`).join('')}</div>
    <label class="check"><input type="checkbox" id="imp-replace" ${IMP.replace !== false ? 'checked' : ''}> Replace the current holdings in these accounts (recommended: positions files are a full snapshot)</label>
    <div class="scroll-table"><table class="ledger compact" id="pos-table"><thead><tr><th class="cb"></th><th>Symbol</th><th>Name</th><th>Class</th><th class="num">Shares</th><th class="num">Price</th><th class="num">Value</th><th class="num">Cost basis</th></tr></thead><tbody>
    ${P.map((p, i) => `<tr class="${p.include ? '' : 'off'}"><td class="cb"><input type="checkbox" data-row="${i}" ${p.include ? 'checked' : ''}></td>
      <td><strong>${esc(p.symbol)}</strong></td><td class="muted">${esc(p.name)}</td>
      <td><select data-cls="${i}">${ASSET_CLASSES.map(c => `<option ${c === p.assetClass ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td class="num">${(+p.shares).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td><td class="num">${money(p.price)}</td><td class="num">${money(p.value)}</td><td class="num">${p.costBasis == null ? '<span class="muted">—</span>' : money(p.costBasis)}</td></tr>`).join('')}
    </tbody></table></div>`;
  box.onchange = e => {
    const t = e.target;
    if (t.dataset.src != null) { IMP.srcMap[srcs[+t.dataset.src]] = t.value; renderImport(); }
    if (t.dataset.srcname != null) (IMP.srcNames = IMP.srcNames || {})[srcs[+t.dataset.srcname]] = t.value;
    if (t.dataset.srctype != null) (IMP.srcTypes = IMP.srcTypes || {})[srcs[+t.dataset.srctype]] = t.value;
    if (t.dataset.row != null) { P[+t.dataset.row].include = t.checked; t.closest('tr').classList.toggle('off', !t.checked); }
    if (t.dataset.cls != null) P[+t.dataset.cls].assetClass = t.value;
    if (t.id === 'imp-replace') IMP.replace = t.checked;
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="commit-pos">Import holdings</button>`);
}
function guessInvType(src) { return /401|403|ira|roth|rollover|retire|457|sep/i.test(src) ? 'retirement' : /529|ugma|utma|coogan|custod|education/i.test(src) ? 'education' : /hsa|health savings/i.test(src) ? 'hsa' : 'brokerage'; }

/* ---- actions ---- */
function importAction(act) {
  if (act === 'back') { if (IMP.step === 'review' && IMP.source === 'csv' && !IMP.fromBatch) IMP.step = 'map'; else if (IMP.fromBatch) { IMP = IMP.fromBatch; IMP.step = 'batch'; } else IMP = { step: 'pick', kind: 'txns' }; return renderImport(); }
  if (act === 'to-review') {
    stashNewAcct();
    const list = csvMappedRows();
    if (!list.length) return toast('No rows could be read with this column mapping.');
    if (IMP.useAcctCol) setupAccountMap(list, IMP.last4); else IMP.multi = false;
    IMP.step = 'review'; buildTxRows(list); return renderImport();
  }
  if (act === 'all' || act === 'none') { IMP.txRows.forEach(r => r.include = act === 'all'); return renderImport(); }
  if (act === 'flipall') {
    if (IMP.source === 'pdf') { IMP.flipAll = !IMP.flipAll; buildTxRowsFromPdf(); }
    else IMP.txRows.forEach(r => r.amount = -r.amount);
    return renderImport();
  }
  if (act === 'commit') return commitTxImport();
  if (act === 'commit-pos') return commitPositions();
  if (act.startsWith('b')) return batchAction(act);
}
function makeAccount(name, type, inst) {
  const T = ACCOUNT_TYPES[type] || ACCOUNT_TYPES.checking;
  const a = { id: uid(), name, type, institution: inst || '', balance: 0, balanceDate: today(), owner: UI.lens || 'joint', forecast: !!T.forecast };
  if (T.ledger) { a.ledger = true; a.anchorBalance = 0; a.anchorDate = '0000-00-00'; }
  state.accounts.push(a);
  return a;
}
/* What's missing before an import can be saved ('' when ready). */
function txItemProblem(it) {
  if (it.multi) { for (const [src, v] of Object.entries(it.acctMap)) if (!v) return `Choose where “${src || 'unnamed'}” goes.`; return ''; }
  if (!it.accountId) return 'Choose which account these transactions belong to.';
  if (it.accountId === '__new' && !((it.newDefaults || {}).name || '').trim()) return 'Give the new account a name.';
  return '';
}
/* Next time a file like this arrives, match it to the same account. */
function rememberImportSource(acct, it) {
  if (!acct) return;
  if (!acct.last4 && it.fileLast4 && !state.accounts.some(x => x !== acct && x.last4 === it.fileLast4)) acct.last4 = it.fileLast4;
  const stem = fileStem(it.fileName);
  if (stem) acct.importStems = [stem, ...(acct.importStems || []).filter(s => s !== stem)].slice(0, 5);
}
/* Adds an import's checked rows to state (the caller commits). */
function applyTxItem(it) {
  const dest = {}, fresh = [];
  if (it.multi) {
    for (const [src, v] of Object.entries(it.acctMap)) {
      if (v === '__new') { const a = makeAccount(src || 'Imported account', guessTypeFromName(src)); a.importName = src; dest[src] = a; fresh.push(a); }
      else { dest[src] = acctById(v); dest[src].importName = dest[src].importName || src; }
    }
  } else {
    let acct = acctById(it.accountId);
    if (it.accountId === '__new') { const d = it.newDefaults || {}; acct = makeAccount(d.name.trim(), d.type || 'checking', d.inst); fresh.push(acct); }
    dest[''] = acct;
  }
  // categories from other apps' exports
  const created = {};
  const rows = it.txRows.filter(r => r.include);
  for (const r of rows) if (!r.categoryId && r.newCat) {
    if (!created[r.newCat]) {
      const parts = r.newCat.split(/\s*[:>]\s*/);
      const name = parts.length > 1 ? parts[parts.length - 1] : r.newCat, group = parts.length > 1 ? parts[0] : 'Imported';
      const kind = rows.filter(x => x.newCat === r.newCat).reduce((s, x) => s + x.amount, 0) > 0 ? 'income' : 'expense';
      const c = { id: uid(), name, group, kind, budget: 0, period: 'month' };
      state.categories.push(c); created[r.newCat] = c.id;
    }
    r.categoryId = created[r.newCat];
  }
  const have = {};
  let added = 0, skipped = 0, unc = 0;
  for (const r of rows) {
    const acct = it.multi ? dest[r.srcAccount || ''] : dest[''];
    if (r.importId) {
      const ids = have[acct.id] || (have[acct.id] = new Set(state.transactions.filter(t => t.accountId === acct.id && t.importId).map(t => t.importId)));
      if (ids.has(r.importId)) { skipped++; continue; }   // e.g. two overlapping downloads in one batch
      ids.add(r.importId);
    }
    const t = { id: uid(), date: r.date, accountId: acct.id, payee: r.rename || prettyPayee(r.payee), rawPayee: r.payee, amount: r.amount, categoryId: r.categoryId || null, memo: r.memo || '', importId: r.importId };
    if (r.tags?.length) t.tags = r.tags;
    if (r.person) t.person = r.person;
    if (r.mcc) t.mcc = String(r.mcc).slice(0, 6);
    state.transactions.push(t); added++;
    if (!t.categoryId) unc++;
  }
  state.transactions.sort((a, b) => b.date.localeCompare(a.date));
  const single = dest[''];
  if (single && it.ofx?.last4) single.last4 = it.ofx.last4;
  if (single) rememberImportSource(single, it);
  const bal = it.ofx?.balance;
  if (single && bal && isFinite(bal.amount) && it.setBal !== false) setBalance(single, round2(Math.abs(bal.amount) * (bal.amount < 0 && !isLiability(single) ? -1 : 1)), bal.date || today());
  // accounts created by import start at zero on the earliest date so imported history doesn't move today's balance unexpectedly
  for (const a of Object.values(dest)) if (a.ledger && a.anchorDate === '0000-00-00') { a.anchorDate = today(); a.anchorBalance = 0; a.balanceDate = today(); }
  return { added, skipped, unc, dest, fresh, created, bal };
}
function commitTxImport() {
  stashNewAcct();
  const problem = txItemProblem(IMP);
  if (problem) { toast(problem); (IMP.accountId === '__new' ? $('#imp-new-name') : $('#imp-acct'))?.focus(); return; }
  const r = applyTxItem(IMP);
  const nAcct = Object.keys(r.dest).length, nCats = Object.keys(r.created).length, single = r.dest[''];
  closeModal(); IMP = null;
  commit();
  toast(`Imported ${r.added.toLocaleString()} transaction${r.added === 1 ? '' : 's'}${nAcct > 1 ? ` into ${nAcct} accounts` : single ? ` into ${single.name}` : ''}.${nCats ? ` Created ${nCats} categor${nCats === 1 ? 'y' : 'ies'}.` : ''}${r.unc ? ` ${r.unc} need a category.` : ''}`,
    r.unc ? { label: 'Categorize', fn: () => go(`#/transactions?cat=_none&m=all`) } : { label: 'Undo', fn: undo });
  if (r.fresh.some(a => a.ledger && !a.anchorBalance && !r.bal)) setTimeout(() => toast('Set each new account’s current balance (Accounts › Update balances) so its balance tracks from here.'), 400);
}
/* Writes a positions file into holdings (the caller commits). */
function applyPositionsItem(it) {
  const P = it.positions.filter(p => p.include);
  const targets = {};
  for (const [src, val] of Object.entries(it.srcMap)) {
    if (val === '__new') {
      const a = { id: uid(), name: (it.srcNames?.[src] ?? (src || 'Brokerage')).trim() || 'Brokerage', type: it.srcTypes?.[src] || guessInvType(src), institution: '', balance: 0, balanceDate: today(), importName: src, owner: UI.lens || 'joint' };
      if (it.ofx?.last4) a.last4 = it.ofx.last4;
      state.accounts.push(a); targets[src] = a.id;
    } else { targets[src] = val; const a = acctById(val); if (a && src) a.importName = src; }
  }
  const touched = new Set(Object.values(targets));
  const old = {};
  for (const h of state.holdings) if (touched.has(h.accountId)) old[h.accountId + '|' + h.symbol] = h;
  if (it.replace !== false) state.holdings = state.holdings.filter(h => !touched.has(h.accountId) || h.private);
  for (const p of P) {
    const accountId = targets[p.srcAccount || ''] || targets[Object.keys(targets)[0]];
    const prev = old[accountId + '|' + p.symbol];
    const existing = state.holdings.find(h => h.accountId === accountId && h.symbol === p.symbol);
    const rec = { symbol: p.symbol, name: p.name, shares: p.shares, price: p.price, costBasis: p.costBasis ?? prev?.costBasis ?? null, er: prev?.er, assetClass: p.assetClass, priceDate: today(), accountId };
    if (existing) Object.assign(existing, rec); else state.holdings.push({ id: uid(), ...rec });
  }
  for (const id of touched) { const a = acctById(id); if (a) a.balanceDate = today(); }
  return { count: P.length, accounts: [...touched] };
}
function commitPositions() {
  const r = applyPositionsItem(IMP);
  closeModal(); IMP = null;
  commit();
  toast(`Updated ${r.count} holding${r.count === 1 ? '' : 's'} in ${r.accounts.length} account${r.accounts.length === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
}
