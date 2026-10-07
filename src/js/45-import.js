/* ================= import wizard ================= */
let IMP = null;

function startImport(preset = {}) {
  IMP = { step: 'pick', kind: 'txns', ...preset };
  openModal({ title: 'Import', wide: true, body: '<div id="imp"></div>', id: 'import-modal' });
  renderImport();
}

function txnAccountOptions(sel) {
  const accts = activeAccounts().filter(a => !holdingsFor(a.id).length && !['realestate', 'vehicle', 'private'].includes(a.type));
  return `<option value="">Choose an account…</option>` +
    accts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.institution ? ' · ' + esc(a.institution) : ''}</option>`).join('') +
    `<option value="__new" ${sel === '__new' ? 'selected' : ''}>New account…</option>`;
}
function invAccountOptions(sel) {
  const accts = activeAccounts().filter(a => ['invest'].includes(ACCOUNT_TYPES[a.type]?.bucket) || a.type === 'private');
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

async function handleImportFile(file) {
  const box = $('#imp'); if (box) box.innerHTML = `<p class="muted pad">Reading ${esc(file.name)}…</p>`;
  IMP.fileName = file.name;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const fours = [...file.name.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map(m => m[1]);
  const last4 = fours.find(f => activeAccounts().some(a => a.last4 === f)) || fours[fours.length - 1];
  try {
    if (ext === 'pdf') {
      const lines = await pdfToLines(await readFileAsBuffer(file));
      const { rows, period, last4: textLast4, isCard } = parseStatementLines(lines);
      if (!rows.length) throw new Error('Keel couldn’t find transaction lines in that PDF. If it’s a scanned image, or an unusual layout, download the OFX/QFX or CSV version from your bank instead.');
      IMP.source = 'pdf'; IMP.period = period; IMP.pdfRows = rows;
      IMP.accountId = guessAccount(textLast4) || guessAccount(last4);
      if (!IMP.accountId) IMP.newDefaults = { type: isCard ? 'credit' : 'checking' };
      IMP.step = 'review'; buildTxRowsFromPdf();
    } else {
      const text = await readFileAsText(file);
      if (looksLikeOFX(text) || ['ofx', 'qfx', 'qbo'].includes(ext)) {
        const o = parseOFX(text);
        IMP.source = 'ofx'; IMP.ofx = o;
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
      } else {
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error('That file looks empty.');
        const hi = findHeaderRow(rows);
        if (isPositionsHeader(rows[hi])) {
          IMP.source = 'csv'; IMP.kind = 'positions'; IMP.step = 'positions';
          IMP.positions = parsePositionsCSV(rows).map(p => ({ ...p, assetClass: guessAssetClass(p.symbol, p.name), include: true }));
          if (!IMP.positions.length) throw new Error('Keel found a positions file but couldn’t read any holdings from it.');
          IMP.srcMap = {};
          for (const src of [...new Set(IMP.positions.map(p => p.srcAccount || ''))]) IMP.srcMap[src] = matchInvAccount(src);
        } else {
          IMP.source = 'csv'; IMP.csv = rows; IMP.headerRow = hi; IMP.headers = rows[hi];
          IMP.map = guessTxnMapping(rows[hi]);
          IMP.useDebitCredit = IMP.map.amount < 0 && IMP.map.debit >= 0;
          IMP.accountId = guessAccount(last4);
          IMP.step = 'map';
        }
      }
    }
  } catch (e) {
    IMP.error = e.message || String(e); IMP.step = 'pick';
  }
  renderImport();
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

/* ---- CSV mapping → rows ---- */
function csvMappedRows() {
  const m = IMP.map, out = [];
  for (const r of IMP.csv.slice(IMP.headerRow + 1)) {
    const date = parseDateFlexible(r[m.date]);
    if (!date) continue;
    let amount;
    if (IMP.useDebitCredit) {
      const d = parseAmount(r[m.debit]), c = parseAmount(r[m.credit]);
      amount = (isFinite(c) ? Math.abs(c) : 0) - (isFinite(d) ? Math.abs(d) : 0);
      if (!isFinite(d) && !isFinite(c)) continue;
    } else { amount = parseAmount(r[m.amount]); if (!isFinite(amount)) continue; }
    if (IMP.flip) amount = -amount;
    out.push({ date, payee: (r[m.payee] || '').trim(), amount: round2(amount), memo: m.memo >= 0 ? r[m.memo] : '', bankCategory: m.category >= 0 ? r[m.category] : '', fitid: '' });
  }
  return out;
}
function buildTxRowsFromPdf() {
  const acct = acctById(IMP.accountId);
  const isCard = acct ? acct.type === 'credit' : (IMP.newDefaults?.type === 'credit');
  buildTxRows(IMP.pdfRows.map(r => ({ date: r.date, payee: r.payee, amount: round2(pdfSignedAmount(r, isCard) * (IMP.flipAll ? -1 : 1)), fitid: '', memo: '', bankCategory: '' })));
}
function buildTxRows(list) {
  const acctId = IMP.accountId && IMP.accountId !== '__new' ? IMP.accountId : null;
  const acct = acctId ? acctById(acctId) : null;
  const existing = acctId ? state.transactions.filter(t => t.accountId === acctId) : [];
  const ids = new Set(existing.map(t => t.importId).filter(Boolean));
  const seen = {};
  IMP.txRows = list.map(t => {
    const base = t.fitid ? 'fit:' + t.fitid : 'h:' + hashStr(`${t.date}|${t.amount}|${normPayee(t.payee)}`);
    seen[base] = (seen[base] || 0) + 1;
    const importId = t.fitid ? base : `${base}:${seen[base]}`;
    let status = 'new';
    if (ids.has(importId)) status = 'dup';
    else if (existing.some(e => Math.abs(e.amount - t.amount) < 0.005 && Math.abs(daysBetween(e.date, t.date)) <= 3 && (normPayee(e.rawPayee || e.payee).split(' ')[0] === normPayee(t.payee).split(' ')[0] || !e.importId))) status = 'maybe';
    const rule = matchRule(t.payee);
    let categoryId = rule ? rule.categoryId : (builtinCategory(t.payee, t.amount) || categoryFromBank(t.bankCategory));
    const isCard = acct ? acct.type === 'credit' : IMP.newDefaults?.type === 'credit';
    if (!categoryId && isCard && t.amount > 0 && /payment|thank you|autopay|pymt/i.test(t.payee)) categoryId = state.categories.find(c => c.name === 'Credit card payment')?.id || null;
    return { ...t, importId, status, include: status === 'new', categoryId: categoryId || '', rename: rule?.rename };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

/* ---- rendering ---- */
function renderImport() {
  const box = $('#imp'); if (!box || !IMP) return;
  const s = IMP.step;
  if (s === 'pick') {
    box.innerHTML = `
      ${IMP.error ? `<div class="notice bad">${esc(IMP.error)}</div>` : ''}
      <label class="drop" id="imp-drop">
        <input type="file" id="imp-file" accept=".csv,.ofx,.qfx,.qbo,.pdf,.txt">
        <span class="drop-title">Drop a statement or export here</span>
        <span class="muted">or click to choose a file. OFX, QFX, QBO, CSV or PDF.</span>
        <span class="drop-note">The file is read on this computer. Nothing is uploaded.</span>
      </label>
      <div class="help-grid">
        <div><h4>Bank and credit card activity</h4><p>On your bank’s site, look for “Download transactions” or “Export.” Pick <strong>Quicken (QFX)</strong> or <strong>OFX</strong> if offered: it carries IDs that prevent duplicates. CSV works too.</p></div>
        <div><h4>Brokerage holdings</h4><p>Download the <strong>Positions</strong> page as CSV (Fidelity, Schwab, Vanguard and most others offer it), or an investment QFX. Keel updates shares, prices and cost basis.</p></div>
        <div><h4>PDF statements</h4><p>Keel reads the transaction lines and shows you every row before saving. Use it when a bank only offers PDFs; scanned images can’t be read.</p></div>
      </div>`;
    const inp = $('#imp-file'), drop = $('#imp-drop');
    inp.onchange = () => inp.files[0] && handleImportFile(inp.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); };
    setModalActions('<button class="btn ghost" data-close>Cancel</button>');
    return;
  }
  if (s === 'map') return renderMapStep(box);
  if (s === 'review') return renderReviewStep(box);
  if (s === 'positions') return renderPositionsStep(box);
}

function colSelect(id, val, allowNone) {
  return `<select id="${id}">${allowNone ? `<option value="-1">None</option>` : ''}${IMP.headers.map((h, i) => `<option value="${i}" ${i === val ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('')}</select>`;
}
function renderMapStep(box) {
  const m = IMP.map;
  const preview = csvMappedRows().slice(0, 6);
  box.innerHTML = `
    <p class="lede">${esc(IMP.fileName)} has ${IMP.csv.length - IMP.headerRow - 1} rows. Check that Keel picked the right columns.</p>
    <div class="form-grid">
      <label class="field"><span>Import into</span><select id="imp-acct">${txnAccountOptions(IMP.accountId)}</select></label>
      <label class="field"><span>Date</span>${colSelect('map-date', m.date)}</label>
      <label class="field"><span>Description</span>${colSelect('map-payee', m.payee)}</label>
      <label class="field"><span>Bank category</span>${colSelect('map-category', m.category, true)}</label>
    </div>
    <div id="imp-new">${IMP.accountId === '__new' ? newAccountFields('imp-new', { type: 'checking', ...(IMP.newDefaults || {}) }) : ''}</div>
    <div class="form-grid">
      <label class="check"><input type="checkbox" id="map-dc" ${IMP.useDebitCredit ? 'checked' : ''}> Amounts are in separate debit and credit columns</label>
      ${IMP.useDebitCredit
        ? `<label class="field"><span>Debit (money out)</span>${colSelect('map-debit', m.debit)}</label><label class="field"><span>Credit (money in)</span>${colSelect('map-credit', m.credit)}</label>`
        : `<label class="field"><span>Amount</span>${colSelect('map-amount', m.amount)}</label>`}
      <label class="check"><input type="checkbox" id="map-flip" ${IMP.flip ? 'checked' : ''}> Flip signs (purchases show as positive numbers)</label>
    </div>
    <table class="ledger compact"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>${preview.map(r => `<tr><td>${dateLabel(r.date, true)}</td><td>${esc(r.payee)}</td><td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No rows could be read with this mapping.</td></tr>'}</tbody></table>
    <p class="muted small">Money out should be negative. Purchases on a credit card are money out.</p>`;
  const upd = () => {
    IMP.accountId = $('#imp-acct').value;
    m.date = +$('#map-date').value; m.payee = +$('#map-payee').value; m.category = +$('#map-category').value;
    IMP.useDebitCredit = $('#map-dc').checked; IMP.flip = $('#map-flip').checked;
    if ($('#map-amount')) m.amount = +$('#map-amount').value;
    if ($('#map-debit')) { m.debit = +$('#map-debit').value; m.credit = +$('#map-credit').value; }
    if (IMP.useDebitCredit && m.debit < 0) { m.debit = 0; m.credit = 0; }
    stashNewAcct();
    renderImport();
  };
  $$('#imp select, #imp input[type=checkbox]').forEach(el => el.onchange = upd);
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
  const acct = acctById(IMP.accountId);
  const opts = catOptions(null, true);
  box.innerHTML = `
    <div class="form-grid">
      <label class="field"><span>Import into</span><select id="imp-acct">${txnAccountOptions(IMP.accountId)}</select></label>
    </div>
    <div id="imp-new">${IMP.accountId === '__new' ? newAccountFields('imp-new', { type: 'checking', ...(IMP.newDefaults || {}) }) : ''}</div>
    <p class="lede">${rows.length} transaction${rows.length === 1 ? '' : 's'}${dates.length ? `, ${dateLabel(dates[0], true)} to ${dateLabel(dates[dates.length - 1], true)}` : ''}.
      ${dup ? `${dup} look${dup === 1 ? 's' : ''} like ${dup === 1 ? 'a duplicate' : 'duplicates'} and ${dup === 1 ? 'is' : 'are'} unchecked.` : 'None of them are already in Keel.'}
      ${IMP.source === 'pdf' ? ' Read from a PDF: check the signs. Click any amount to flip it.' : ''}</p>
    <div class="toolbar">
      <button class="btn small ghost" data-imp="all">Check all</button>
      <button class="btn small ghost" data-imp="none">Uncheck all</button>
      ${IMP.source !== 'ofx' ? `<button class="btn small ghost" data-imp="flipall">Flip every sign</button>` : ''}
      ${bal && isFinite(bal.amount) ? `<label class="check"><input type="checkbox" id="imp-bal" ${IMP.setBal !== false ? 'checked' : ''}> Set the balance to ${money(Math.abs(bal.amount))} as of ${dateLabel(bal.date, true)}</label>` : ''}
    </div>
    <div class="scroll-table"><table class="ledger compact" id="imp-table"><thead><tr><th class="cb"></th><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.include ? '' : 'off'}" data-i="${i}">
        <td class="cb"><input type="checkbox" data-row="${i}" ${r.include ? 'checked' : ''} aria-label="Include"></td>
        <td class="nowrap">${dateLabel(r.date, true)}</td>
        <td>${esc(prettyPayee(r.payee))}<div class="muted small">${esc(r.payee)}</div></td>
        <td><select data-cat="${i}">${opts.replace(`value="${r.categoryId}"`, `value="${r.categoryId}" selected`)}</select></td>
        <td class="num ${signClass(r.amount)}">${IMP.source !== 'ofx' ? `<button class="linklike num" data-flip="${i}" title="Flip sign">${money(r.amount)}</button>` : money(r.amount)}</td>
        <td>${r.status === 'dup' ? '<span class="tag">Already imported</span>' : r.status === 'maybe' ? '<span class="tag">Possible duplicate</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  $('#imp-acct').onchange = e => {
    stashNewAcct(); IMP.accountId = e.target.value;
    if (IMP.source === 'pdf') buildTxRowsFromPdf();
    else if (IMP.source === 'csv') buildTxRows(csvMappedRows());
    else buildTxRows(IMP.ofx.txns);
    renderImport();
  };
  $('#imp-table').onchange = e => {
    const t = e.target;
    if (t.dataset.row != null) { rows[+t.dataset.row].include = t.checked; t.closest('tr').classList.toggle('off', !t.checked); updateImportCount(); }
    if (t.dataset.cat != null) rows[+t.dataset.cat].categoryId = t.value;
  };
  $('#imp-table').onclick = e => {
    const b = e.target.closest('[data-flip]'); if (!b) return;
    const r = rows[+b.dataset.flip]; r.amount = -r.amount;
    b.textContent = money(r.amount); b.closest('td').className = 'num ' + signClass(r.amount);
  };
  if ($('#imp-bal')) $('#imp-bal').onchange = e => IMP.setBal = e.target.checked;
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="commit" id="imp-go">Import ${inc.length} transaction${inc.length === 1 ? '' : 's'}</button>`);
}
function updateImportCount() { const n = IMP.txRows.filter(r => r.include).length; const b = $('#imp-go'); if (b) b.textContent = `Import ${n} transaction${n === 1 ? '' : 's'}`; }

function renderPositionsStep(box) {
  const P = IMP.positions;
  const srcs = Object.keys(IMP.srcMap);
  const total = sum(P.filter(p => p.include).map(p => p.value));
  box.innerHTML = `
    <p class="lede">${P.length} holding${P.length === 1 ? '' : 's'} worth ${money(total, { cents: false })} in ${srcs.length} account${srcs.length === 1 ? '' : 's'}. Choose where each account goes in Keel.</p>
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
  if (act === 'back') { if (IMP.step === 'review' && IMP.source === 'csv') IMP.step = 'map'; else { IMP = { step: 'pick', kind: 'txns' }; } return renderImport(); }
  if (act === 'to-review') {
    stashNewAcct();
    const list = csvMappedRows();
    if (!list.length) return toast('No rows could be read with this column mapping.');
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
}
function resolveNewAccount(fallbackType) {
  stashNewAcct();
  const d = IMP.newDefaults || {};
  const name = (d.name || '').trim();
  if (!name) { toast('Give the new account a name.'); $('#imp-new-name')?.focus(); return null; }
  const a = { id: uid(), name, type: d.type || fallbackType, institution: d.inst || '', balance: 0, balanceDate: today() };
  state.accounts.push(a);
  return a;
}
function commitTxImport() {
  let acct = acctById(IMP.accountId);
  if (!IMP.accountId) { toast('Choose which account these transactions belong to.'); $('#imp-acct')?.focus(); return; }
  if (IMP.accountId === '__new') { acct = resolveNewAccount('checking'); if (!acct) return; }
  const rows = IMP.txRows.filter(r => r.include);
  for (const r of rows) {
    state.transactions.push({ id: uid(), date: r.date, accountId: acct.id, payee: r.rename || prettyPayee(r.payee), rawPayee: r.payee, amount: r.amount, categoryId: r.categoryId || null, memo: r.memo || '', importId: r.importId });
  }
  state.transactions.sort((a, b) => b.date.localeCompare(a.date));
  if (IMP.ofx?.last4) acct.last4 = IMP.ofx.last4;
  const bal = IMP.ofx?.balance;
  if (bal && isFinite(bal.amount) && IMP.setBal !== false) { acct.balance = round2(Math.abs(bal.amount) * (bal.amount < 0 && !isLiability(acct) ? -1 : 1)); acct.balanceDate = bal.date || today(); }
  const unc = rows.filter(r => !r.categoryId).length;
  closeModal(); IMP = null;
  commit();
  toast(`Imported ${rows.length} transaction${rows.length === 1 ? '' : 's'} into ${acct.name}.${unc ? ` ${unc} need a category.` : ''}`, unc ? { label: 'Categorize', fn: () => go(`#/transactions?cat=_none&acct=${acct.id}`) } : null);
}
function commitPositions() {
  const P = IMP.positions.filter(p => p.include);
  const targets = {};
  for (const [src, val] of Object.entries(IMP.srcMap)) {
    if (val === '__new') {
      const a = { id: uid(), name: (IMP.srcNames?.[src] ?? (src || 'Brokerage')).trim() || 'Brokerage', type: IMP.srcTypes?.[src] || guessInvType(src), institution: '', balance: 0, balanceDate: today(), importName: src };
      if (IMP.ofx?.last4) a.last4 = IMP.ofx.last4;
      state.accounts.push(a); targets[src] = a.id;
    } else { targets[src] = val; const a = acctById(val); if (a && src) a.importName = src; }
  }
  const touched = new Set(Object.values(targets));
  const oldCost = {};
  for (const h of state.holdings) if (touched.has(h.accountId)) oldCost[h.accountId + '|' + h.symbol] = h.costBasis;
  if (IMP.replace !== false) state.holdings = state.holdings.filter(h => !touched.has(h.accountId) || h.private);
  for (const p of P) {
    const accountId = targets[p.srcAccount || ''] || targets[Object.keys(targets)[0]];
    const existing = state.holdings.find(h => h.accountId === accountId && h.symbol === p.symbol);
    const rec = { symbol: p.symbol, name: p.name, shares: p.shares, price: p.price, costBasis: p.costBasis ?? oldCost[accountId + '|' + p.symbol] ?? null, assetClass: p.assetClass, priceDate: today(), accountId };
    if (existing) Object.assign(existing, rec); else state.holdings.push({ id: uid(), ...rec });
  }
  for (const id of touched) { const a = acctById(id); if (a) a.balanceDate = today(); }
  closeModal(); IMP = null;
  commit();
  toast(`Updated ${P.length} holding${P.length === 1 ? '' : 's'} in ${touched.size} account${touched.size === 1 ? '' : 's'}.`);
}
