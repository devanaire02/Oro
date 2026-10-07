/* ================= edit dialogs ================= */
function ruleKeyFor(payee) {
  const words = normPayee(payee).split(' ').filter(Boolean);
  if (!words.length) return '';
  return words[0].length >= 5 ? words[0] : words.slice(0, 2).join(' ');
}
function offerRule(t, catId) {
  if (!catId || catId === '__split') return;
  const src = t.rawPayee || t.payee;
  const existing = matchRule(src);
  if (existing && existing.categoryId === catId) return;
  const key = ruleKeyFor(src); if (!key) return;
  const others = state.transactions.filter(x => x.id !== t.id && isUncat(x) && !isSplit(x) && normPayee(x.rawPayee || x.payee).includes(key));
  toast(`Always file “${key}” under ${catName(catId)}?`, {
    label: others.length ? `Make a rule and fix ${others.length} more` : 'Make a rule',
    fn: () => {
      if (existing) existing.categoryId = catId; else state.rules.unshift({ id: uid(), text: key, categoryId: catId });
      others.forEach(o => o.categoryId = catId);
      commit();
      toast(`Rule saved.${others.length ? ` ${others.length} more categorized.` : ''}`);
    },
  });
}

/* ---------- transaction (with splits, tags, person, receipts) ---------- */
function txnModal(id) {
  const t = id ? state.transactions.find(x => x.id === id) : null;
  const cashAcct = activeAccounts().find(a => a.type === 'checking') || activeAccounts()[0];
  const v = t || { date: today(), payee: '', amount: '', accountId: cashAcct?.id, categoryId: '', memo: '' };
  if (!activeAccounts().length) { toast('Add an account first.'); return acctModal(); }
  let splits = isSplit(v) ? v.splits.map(s => ({ ...s })) : null;
  let atts = (v.attachments || []).map(a => ({ ...a }));
  const multi = members().length > 1;
  openModal({
    title: t ? 'Edit transaction' : 'Add transaction', wide: false,
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Date</span><input type="date" name="date" value="${v.date}" required></label>
      <label class="field"><span>Amount</span><input name="amount" id="tx-amount" inputmode="decimal" value="${v.amount === '' ? '' : round2(v.amount)}" placeholder="-42.50" required><small class="muted">Negative for money out</small></label>
      <label class="field wide"><span>Payee</span><input name="payee" value="${esc(v.payee)}" required autofocus></label>
      <label class="field"><span>Account</span><select name="accountId">${acctOptions(v.accountId)}</select></label>
      <div class="field" id="cat-field"></div>
      ${multi ? `<label class="field"><span>Whose</span><select name="person">${memberOptions(v.person || '', `Account owner (${memberName(acctById(v.accountId)?.owner || 'joint')})`)}</select></label>` : ''}
      <label class="field ${multi ? '' : 'wide'}"><span>Tags</span><input name="tags" value="${esc((v.tags || []).join(', '))}" placeholder="e.g. vacation, tax" list="tag-list-m"><datalist id="tag-list-m">${allTags().map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="field wide"><span>Memo</span><input name="memo" value="${esc(v.memo || '')}"></label>
      <div class="wide" id="split-box"></div>
      <div class="wide attach-box"><span class="field-label">Receipts</span><div id="att-list"></div>
        <label class="btn small ${hasFolder() ? '' : 'disabled'}" title="${hasFolder() ? 'Saved into receipts/ in your Keel folder' : 'Choose your Keel folder in Settings first'}">Attach a file<input type="file" id="att-input" accept="image/*,application/pdf" hidden ${hasFolder() ? '' : 'disabled'}></label></div>
      ${t?.rawPayee && t.rawPayee !== t.payee ? `<p class="muted small wide">Bank description: ${esc(t.rawPayee)}</p>` : ''}
      ${t?.reconciled ? '<p class="muted small wide">✓ Reconciled with a statement</p>' : ''}
    </form>`,
    actions: `${t ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${t ? 'Save' : 'Add transaction'}</button>`,
  });
  const total = () => parseAmount($('#tx-amount').value);
  const paintCat = () => {
    $('#cat-field').innerHTML = splits
      ? `<span class="field-label">Category</span><button type="button" class="btn small" id="unsplit">Remove split</button>`
      : `<span class="field-label">Category</span><div class="cat-row"><select name="categoryId" id="tx-cat">${catOptions(v.categoryId === '__split' ? '' : v.categoryId)}</select><button type="button" class="btn small ghost" id="do-split">Split</button></div>`;
    if ($('#do-split')) $('#do-split').onclick = () => { const a = total(); splits = [{ categoryId: $('#tx-cat').value, amount: isFinite(a) ? round2(a) : 0, memo: '' }, { categoryId: '', amount: 0, memo: '' }]; paintCat(); paintSplits(); };
    if ($('#unsplit')) $('#unsplit').onclick = () => { v.categoryId = splits[0]?.categoryId || ''; splits = null; paintCat(); paintSplits(); };
  };
  const paintSplits = () => {
    const box = $('#split-box');
    if (!splits) { box.innerHTML = ''; return; }
    const rem = round2((total() || 0) - sum(splits.map(s => +s.amount || 0)));
    box.innerHTML = `<div class="split-editor"><div class="split-head"><strong>Split into categories</strong><span class="${Math.abs(rem) > 0.004 ? 'neg' : 'muted'} small">${Math.abs(rem) > 0.004 ? `${money(rem)} left to assign` : 'Fully assigned'}</span></div>
      ${splits.map((s, i) => `<div class="split-row"><select data-si="${i}" data-sk="categoryId">${catOptions(s.categoryId)}</select><input data-si="${i}" data-sk="amount" inputmode="decimal" value="${s.amount}" aria-label="Amount"><input data-si="${i}" data-sk="memo" value="${esc(s.memo || '')}" placeholder="Note" aria-label="Note"><button type="button" class="icon-btn" data-sdel="${i}" aria-label="Remove line">×</button></div>`).join('')}
      <div class="actions"><button type="button" class="btn small" id="split-add">Add a line</button>${Math.abs(rem) > 0.004 ? `<button type="button" class="btn small ghost" id="split-fill">Put the rest on the last line</button>` : ''}</div></div>`;
    box.onchange = e => { const el = e.target; if (el.dataset.si == null) return; const s = splits[+el.dataset.si]; s[el.dataset.sk] = el.dataset.sk === 'amount' ? round2(parseAmount(el.value) || 0) : el.value; paintSplits(); };
    box.onclick = e => {
      if (e.target.closest('#split-add')) { splits.push({ categoryId: '', amount: rem, memo: '' }); paintSplits(); }
      if (e.target.closest('#split-fill')) { splits[splits.length - 1].amount = round2((+splits[splits.length - 1].amount || 0) + rem); paintSplits(); }
      const d = e.target.closest('[data-sdel]'); if (d && splits.length > 1) { splits.splice(+d.dataset.sdel, 1); paintSplits(); }
    };
  };
  const paintAtts = () => {
    $('#att-list').innerHTML = atts.length ? atts.map((a, i) => `<span class="att-chip"><button type="button" class="linklike" data-att-open="${i}">⎘ ${esc(a.name)}</button><button type="button" class="icon-btn" data-att-del="${i}" aria-label="Remove">×</button></span>`).join('') : '<span class="muted small">None</span>';
    $('#att-list').onclick = async e => {
      const o = e.target.closest('[data-att-open]'); if (o) { try { await openAttachment(atts[+o.dataset.attOpen]); } catch (err) { toast(err.message); } }
      const d = e.target.closest('[data-att-del]'); if (d) { atts.splice(+d.dataset.attDel, 1); paintAtts(); }
    };
  };
  paintCat(); paintSplits(); paintAtts();
  $('#tx-amount').onchange = () => paintSplits();
  const ai = $('#att-input');
  if (ai) ai.onchange = async () => {
    const file = ai.files[0]; if (!file) return;
    try { const d = formData($('#f')); atts.push(await saveAttachment(file, { date: d.date || today(), payee: d.payee || 'receipt' })); paintAtts(); }
    catch (err) { toast(err.message); }
  };
  $('#save').onclick = () => {
    const d = formData($('#f'));
    const amount = parseAmount(d.amount);
    if (!d.date || !d.payee.trim() || !isFinite(amount)) return toast('Fill in a date, payee and amount.');
    if (splits) {
      const rem = round2(amount - sum(splits.map(s => +s.amount || 0)));
      if (Math.abs(rem) > 0.004) return toast(`The split lines are ${money(rem)} short of the total.`);
    }
    const prevCat = t?.categoryId;
    const rec = { date: d.date, payee: d.payee.trim(), amount: round2(amount), accountId: d.accountId, memo: d.memo, tags: parseTags(d.tags), attachments: atts };
    if (multi) rec.person = d.person || undefined;
    if (splits) { rec.splits = splits.filter(s => +s.amount || s.categoryId).map(s => ({ categoryId: s.categoryId || null, amount: round2(+s.amount || 0), memo: s.memo || '' })); rec.categoryId = '__split'; }
    else { rec.splits = undefined; rec.categoryId = d.categoryId || null; }
    let target;
    if (t) target = Object.assign(t, rec); else state.transactions.push(target = { id: uid(), ...rec });
    if (!target.tags.length) delete target.tags;
    if (!target.attachments.length) delete target.attachments;
    if (!target.splits) delete target.splits;
    state.transactions.sort((a, b) => b.date.localeCompare(a.date));
    closeModal(); commit();
    if (t && !splits && prevCat !== target.categoryId) offerRule(target, target.categoryId);
  };
  if (t) $('#del').onclick = async () => { if (await confirmBox('Delete transaction', `Delete “${esc(t.payee)}” for ${money(t.amount)}?`, 'Delete', true)) { state.transactions = state.transactions.filter(x => x.id !== t.id); commit(); toast('Transaction deleted.', { label: 'Undo', fn: undo }); } };
}

/* ---------- account ---------- */
function acctModal(id, presetType) {
  const a = id ? acctById(id) : null;
  const v = a || { name: '', type: presetType || 'checking', institution: '', balance: '', balanceDate: today(), owner: UI.lens || 'joint' };
  const hasHoldings = a && holdingsFor(a.id).length;
  const loans = activeAccounts().filter(x => ['mortgage', 'loan', 'otherLiability'].includes(x.type));
  const rentalGroups = [...new Set(state.categories.filter(c => c.rental).map(c => c.group))];
  const curVal = a ? accountValue(a) : '';
  openModal({
    title: a ? 'Edit account' : 'Add account',
    body: `<form id="f" class="form-grid" data-type="${v.type}">
      <label class="field wide"><span>Name</span><input name="name" value="${esc(v.name)}" placeholder="e.g. Joint checking" required autofocus></label>
      <label class="field"><span>Type</span><select name="type" id="acct-type">${BUCKETS.map(b => `<optgroup label="${esc(b.label)}">${b.types.map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="field"><span>Institution</span><input name="institution" value="${esc(v.institution || '')}" placeholder="Optional"></label>
      ${members().length > 1 ? `<label class="field"><span>Owner</span><select name="owner">${memberOptions(v.owner || 'joint')}</select></label>` : ''}
      <label class="field"><span>Last 4 digits</span><input name="last4" value="${esc(v.last4 || '')}" maxlength="4" inputmode="numeric" placeholder="Matches imports"></label>
      ${hasHoldings ? `<p class="muted small wide">Value comes from ${hasHoldings} holding${hasHoldings > 1 ? 's' : ''}: ${money(accountValue(a))}.</p><label class="field"><span>Uninvested cash</span><input name="cash" inputmode="decimal" value="${a.cash || ''}" placeholder="0"></label>`
        : `<label class="field"><span id="bal-label">${ACCOUNT_TYPES[v.type].side === 'liability' ? 'Amount owed' : 'Balance or value'}</span><input name="balance" inputmode="decimal" value="${curVal === '' ? (v.balance === '' ? '' : round2(v.balance)) : round2(curVal)}" placeholder="0.00"></label>
           <label class="field"><span>As of</span><input type="date" name="balanceDate" value="${(a && a.ledger ? a.anchorDate : v.balanceDate) || today()}"></label>`}
      <div class="when-ledger wide"><label class="check"><input type="checkbox" name="ledger" ${(v.ledger ?? ACCOUNT_TYPES[v.type].ledger) ? 'checked' : ''}> Keep the balance up to date from transactions</label><small class="muted">The balance above is the starting point; imported transactions after that date move it. Lets you reconcile against statements.</small></div>
      <div class="when-cash wide"><label class="check"><input type="checkbox" name="forecast" ${(v.forecast ?? ACCOUNT_TYPES[v.type].forecast) ? 'checked' : ''}> Include in the cash-flow forecast</label></div>
      <label class="field when-invest"><span>Treat as (when no holdings)</span><select name="assetClass">${ASSET_CLASSES.map(c => `<option ${c === (v.assetClass || 'US stocks') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field when-debt"><span>Interest rate (%)</span><input name="rate" inputmode="decimal" value="${v.rate ?? ''}"></label>
      <label class="field when-debt"><span>Minimum payment</span><input name="minPayment" inputmode="decimal" value="${v.minPayment ?? ''}"></label>
      <div class="when-property wide form-grid">
        <label class="field"><span>Mortgage</span><select name="mortgageId"><option value="">None</option>${loans.map(l => `<option value="${l.id}" ${l.id === v.mortgageId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="rental" ${v.rental ? 'checked' : ''}> This is a rental property</label>
        <label class="field"><span>Rental category group</span><select name="rentalGroup">${(rentalGroups.length ? rentalGroups : ['Rental property']).map(g => `<option ${g === v.rentalGroup ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label class="field"><span>Cash invested</span><input name="cashInvested" inputmode="decimal" value="${v.cashInvested ?? ''}" placeholder="Down payment plus improvements"></label>
        <label class="field"><span>Units</span><input name="units" inputmode="numeric" value="${v.units ?? ''}"></label>
        <label class="field"><span>Building basis (excludes land)</span><input name="buildingBasis" inputmode="decimal" value="${v.buildingBasis ?? ''}" placeholder="For depreciation"></label>
        <label class="field"><span>Placed in service</span><input type="date" name="placedInService" value="${v.placedInService || ''}"></label>
      </div>
      <label class="field wide"><span>Notes</span><input name="notes" value="${esc(v.notes || '')}"></label>
    </form>`,
    actions: `${a ? `<button class="btn ghost danger-text left" id="del">Delete</button><button class="btn ghost" id="arch">${a.archived ? 'Restore' : 'Archive'}</button>` : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${a ? 'Save' : 'Add account'}</button>`,
  });
  const f = $('#f');
  $('#acct-type').onchange = e => {
    const T = ACCOUNT_TYPES[e.target.value]; f.dataset.type = e.target.value;
    const l = $('#bal-label'); if (l) l.textContent = T.side === 'liability' ? 'Amount owed' : 'Balance or value';
    f.querySelector('[name=forecast]').checked = !!T.forecast; f.querySelector('[name=ledger]').checked = !!T.ledger;
  };
  $('#save').onclick = () => {
    const d = formData(f);
    if (!d.name.trim()) return toast('Give the account a name.');
    const rec = { name: d.name.trim(), type: d.type, institution: d.institution.trim(), last4: d.last4.trim(), notes: d.notes, forecast: d.forecast, ledger: d.ledger && !hasHoldings };
    if ('owner' in d) rec.owner = d.owner;
    if (ACCOUNT_TYPES[d.type].bucket === 'invest') rec.assetClass = d.assetClass;
    if (ACCOUNT_TYPES[d.type].bucket === 'debt') { rec.rate = d.rate === '' ? null : parseFloat(d.rate); rec.minPayment = d.minPayment === '' ? null : parseAmount(d.minPayment); }
    if (d.type === 'realestate') Object.assign(rec, { mortgageId: d.mortgageId || null, rental: d.rental, rentalGroup: d.rentalGroup, cashInvested: parseAmount(d.cashInvested) || null, units: parseInt(d.units) || null, buildingBasis: parseAmount(d.buildingBasis) || null, placedInService: d.placedInService || null });
    if ('cash' in d) rec.cash = round2(parseAmount(d.cash || '0') || 0);
    const target = a || { id: uid() };
    Object.assign(target, rec);
    if ('balance' in d) {
      const b = parseAmount(d.balance || '0'), val = isFinite(b) ? round2(isLiability(target) ? Math.abs(b) : b) : 0;
      const changed = !a || Math.abs(val - curVal) > 0.004 || (a.ledger ? a.anchorDate : a.balanceDate) !== d.balanceDate || !!a.ledger !== !!rec.ledger;
      if (changed) { target.balance = val; target.balanceDate = d.balanceDate || today(); if (target.ledger) { target.anchorBalance = val; target.anchorDate = d.balanceDate || today(); } }
    }
    if (!a) state.accounts.push(target);
    closeModal(); commit();
    if (!a) toast(`Added ${rec.name}.`);
  };
  if (a) {
    $('#arch').onclick = () => { a.archived = !a.archived; closeModal(); commit(); toast(a.archived ? `${a.name} archived. Its history stays in your net worth chart.` : `${a.name} restored.`); };
    $('#del').onclick = async () => {
      const n = state.transactions.filter(t => t.accountId === a.id).length, h = holdingsFor(a.id).length;
      if (!await confirmBox('Delete account', `Delete <strong>${esc(a.name)}</strong>${n || h ? ` along with ${[n && `${n} transactions`, h && `${h} holdings`].filter(Boolean).join(' and ')}` : ''}? Archiving keeps the history instead.`, 'Delete', true)) return;
      state.accounts = state.accounts.filter(x => x.id !== a.id);
      state.transactions = state.transactions.filter(t => t.accountId !== a.id);
      state.holdings = state.holdings.filter(x => x.accountId !== a.id);
      for (const s of Object.values(state.snapshots)) delete s[a.id];
      for (const x of state.accounts) if (x.mortgageId === a.id) x.mortgageId = null;
      state.goals.forEach(g => { if (g.accountId === a.id) g.accountId = null; });
      commit(); toast('Account deleted.', { label: 'Undo', fn: undo });
    };
  }
}

/* ---------- reconcile against a statement ---------- */
function reconcileModal(id) {
  const a = acctById(id); if (!a) return;
  const from = a.reconciledThrough || '0000-00-00';
  openModal({
    title: `Reconcile ${a.name}`, wide: true,
    body: `<p class="muted">Enter the ending balance and date from your statement. Keel compares it with the balance it calculates from your transactions.</p>
      <div class="form-grid"><label class="field"><span>Statement date</span><input type="date" id="rc-date" value="${monthEnd(addMonths(thisMonth(), -1))}"></label>
      <label class="field"><span>${isLiability(a) ? 'Statement balance owed' : 'Statement ending balance'}</span><input id="rc-bal" inputmode="decimal" placeholder="0.00" autofocus></label></div>
      <div id="rc-out"></div>`,
    actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="rc-go" disabled>Mark reconciled</button>`,
  });
  const paint = () => {
    const date = $('#rc-date').value, st = parseAmount($('#rc-bal').value);
    const calc = ledgerBalance(a, date);
    const txs = txByAccount(a.id).filter(t => t.date > from && t.date <= date).sort((x, y) => x.date.localeCompare(y.date));
    let run = ledgerBalance(a, from === '0000-00-00' ? addDays(txs[0]?.date || date, -1) : from);
    const diff = isFinite(st) ? round2(Math.abs(st) - calc) : null;
    $('#rc-out').innerHTML = `<dl class="kpis three"><div><dt>Keel’s balance on ${dateLabel(date, true)}</dt><dd class="num">${money(calc)}</dd></div><div><dt>Statement</dt><dd class="num">${isFinite(st) ? money(Math.abs(st)) : '—'}</dd></div><div><dt>Difference</dt><dd class="num ${diff ? 'neg' : diff === 0 ? 'pos' : ''}">${diff == null ? '—' : diff === 0 ? 'Matches' : money(diff, { sign: true })}</dd></div></dl>
      ${diff ? `<p class="notice">Look for a missing or duplicated transaction of ${money(Math.abs(diff))}, or one with the wrong sign (that shows up as twice its amount). If the statement is right and nothing is missing, treat it as the true balance on that date; transactions after it carry on from there.</p><button class="btn small" id="rc-adjust">Use the statement balance of ${money(Math.abs(st))}</button>` : ''}
      <div class="scroll-table short"><table class="ledger compact"><thead><tr><th>Date</th><th>Payee</th><th class="num">Amount</th><th class="num">Running balance</th></tr></thead><tbody>
      ${txs.map(t => { run = round2(run + (isLiability(a) ? -t.amount : t.amount)); return `<tr><td class="nowrap muted">${dateLabel(t.date)}</td><td>${esc(t.payee)}${t.reconciled ? ' <span class="rec">✓</span>' : ''}</td><td class="num ${signClass(t.amount)}">${money(t.amount)}</td><td class="num">${money(run)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No transactions since the last reconciliation.</td></tr>'}</tbody></table></div>`;
    $('#rc-go').disabled = diff !== 0;
    const adj = $('#rc-adjust');
    if (adj) adj.onclick = () => { a.anchorBalance = round2(Math.abs(st)); a.anchorDate = date; a.ledger = true; commit({ silent: true }); paint(); };
  };
  $('#rc-bal').oninput = paint; $('#rc-date').onchange = paint; paint();
  $('#rc-go').onclick = () => {
    const date = $('#rc-date').value;
    for (const t of txByAccount(a.id)) if (t.date <= date) t.reconciled = true;
    a.reconciledThrough = date; a.reconciledBalance = ledgerBalance(a, date);
    closeModal(); commit(); toast(`${a.name} reconciled through ${dateLabel(date, true)}.`);
  };
}

/* ---------- balance history ---------- */
function historyModal(id) {
  const a = acctById(id); if (!a) return;
  const liab = isLiability(a), cur = thisMonth();
  const months = Object.keys(state.snapshots).filter(m => state.snapshots[m][id] != null).sort().reverse();
  const rows = months.map(m => `<tr><th scope="row">${monthLabel(m)}</th><td class="num">${m === cur ? `${money(accountValue(a))} <span class="muted small">live</span>` : `<input class="bal-input" data-hm="${m}" inputmode="decimal" value="${round2(Math.abs(state.snapshots[m][id]))}">`}</td><td class="acts">${m === cur ? '' : `<button class="icon-btn" data-hdel="${m}" aria-label="Remove ${monthLabel(m)}">×</button>`}</td></tr>`).join('');
  const vals = months.slice().reverse().map(m => Math.abs(state.snapshots[m][id]));
  openModal({
    title: `${a.name}: balance history`,
    body: `${vals.length > 1 ? `<div class="hist-spark">${sparkline(vals, { w: 520, h: 60, color: liab ? 'var(--neg)' : 'var(--ink-accent)' })}</div>` : ''}<p class="muted">Month-end ${liab ? 'amounts owed' : 'values'} feed the net worth chart. Keel records the current month automatically; add earlier months from old statements.</p>
      <div class="scroll-table short"><table class="ledger compact" id="hist"><tbody>${rows || '<tr><td class="muted">No history yet.</td></tr>'}</tbody></table></div>
      <div class="form-grid"><label class="field"><span>Add a month</span><input type="month" id="h-m" max="${addMonths(cur, -1)}"></label><label class="field"><span>${liab ? 'Owed' : 'Value'}</span><input id="h-v" inputmode="decimal" placeholder="0.00"></label></div>`,
    actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">Save history</button>`,
  });
  const removed = new Set();
  $('#hist').onclick = e => { const b = e.target.closest('[data-hdel]'); if (b) { removed.add(b.dataset.hdel); b.closest('tr').remove(); } };
  $('#save').onclick = () => {
    const sign = liab ? -1 : 1;
    $$('[data-hm]').forEach(inp => { const v = parseAmount(inp.value); if (isFinite(v)) state.snapshots[inp.dataset.hm][id] = round2(Math.abs(v) * sign); });
    removed.forEach(m => { delete state.snapshots[m][id]; if (!Object.keys(state.snapshots[m]).length) delete state.snapshots[m]; });
    const m = $('#h-m').value, v = parseAmount($('#h-v').value);
    if (m && isFinite(v) && m < cur) (state.snapshots[m] = state.snapshots[m] || {})[id] = round2(Math.abs(v) * sign);
    closeModal(); commit();
  };
}

/* ---------- holding ---------- */
function holdingModal(id, presetAcct) {
  const h = id ? state.holdings.find(x => x.id === id) : null;
  const invAccts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  if (!invAccts.length) { toast('Add an investment account first.'); return acctModal(null, 'brokerage'); }
  const v = h || { accountId: presetAcct || invAccts[0].id, symbol: '', name: '', shares: '', price: '', costBasis: '', assetClass: 'US stocks', priceDate: today(), private: acctById(presetAcct)?.type === 'private' };
  const known = KNOWN_ER[String(v.symbol || '').toUpperCase()];
  openModal({
    title: h ? `Edit ${h.symbol}` : 'Add holding',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Account</span><select name="accountId">${invAccts.map(a => `<option value="${a.id}" ${a.id === v.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Symbol or short name</span><input name="symbol" value="${esc(v.symbol)}" required autofocus></label>
      <label class="field wide"><span>Description</span><input name="name" value="${esc(v.name || '')}"></label>
      <label class="field"><span>Shares or units</span><input name="shares" inputmode="decimal" value="${v.shares}"></label>
      <label class="field"><span>Price per share</span><input name="price" inputmode="decimal" value="${v.price}"></label>
      <label class="field"><span>Total cost basis</span><input name="costBasis" inputmode="decimal" value="${v.costBasis ?? ''}" placeholder="Optional"></label>
      <label class="field"><span>Expense ratio (%)</span><input name="er" inputmode="decimal" value="${v.er ?? ''}" placeholder="${known != null ? known + ' (on file)' : 'e.g. 0.03'}"></label>
      <label class="field"><span>Asset class</span><select name="assetClass">${ASSET_CLASSES.map(c => `<option ${c === v.assetClass ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Price as of</span><input type="date" name="priceDate" value="${v.priceDate || today()}"></label>
      <label class="check wide"><input type="checkbox" name="private" ${v.private ? 'checked' : ''}> Private or illiquid (valued by your own marks)</label>
    </form>`,
    actions: `${h ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${h ? 'Save' : 'Add holding'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    const shares = parseAmount(d.shares), price = parseAmount(d.price), cb = parseAmount(d.costBasis), er = parseFloat(d.er);
    if (!d.symbol.trim() || !isFinite(shares) || !isFinite(price)) return toast('Fill in a symbol, shares and price.');
    const rec = { accountId: d.accountId, symbol: d.symbol.trim().toUpperCase(), name: d.name.trim(), shares, price, costBasis: isFinite(cb) ? cb : null, er: isFinite(er) ? er : undefined, assetClass: d.assetClass, priceDate: d.priceDate || today(), private: d.private };
    if (h && (h.price !== price || h.shares !== shares) && rec.priceDate === h.priceDate) rec.priceDate = today();
    if (h) Object.assign(h, rec); else state.holdings.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (h) $('#del').onclick = async () => { if (await confirmBox('Delete holding', `Remove ${esc(h.symbol)} (${money(holdingValue(h))})?`, 'Delete', true)) { state.holdings = state.holdings.filter(x => x.id !== h.id); commit(); } };
}

/* ---------- recurring ---------- */
function recModal(id, preset) {
  const r = id ? state.recurring.find(x => x.id === id) : null;
  const v = r || { name: '', amount: '', freq: 'monthly', nextDate: addDays(today(), 1), categoryId: '', ...(preset || {}) };
  openModal({
    title: r ? 'Edit bill or income' : 'Add a bill or paycheck',
    body: `<form id="f" class="form-grid">
      <label class="field wide"><span>Name</span><input name="name" value="${esc(v.name)}" required autofocus></label>
      <label class="field"><span>Amount</span><input name="amount" inputmode="decimal" value="${v.amount}" placeholder="-1,250.00"><small class="muted">Negative for bills, positive for income</small></label>
      <label class="field"><span>How often</span><select name="freq">${Object.entries(FREQS).map(([k, l]) => `<option value="${k}" ${k === v.freq ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Next date</span><input type="date" name="nextDate" value="${v.nextDate}"></label>
      <label class="field"><span>Category</span><select name="categoryId">${catOptions(v.categoryId)}</select></label>
    </form>`,
    actions: `${r ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${r ? 'Save' : 'Add'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f')), amount = parseAmount(d.amount);
    if (!d.name.trim() || !isFinite(amount) || !d.nextDate) return toast('Fill in a name, amount and next date.');
    const rec = { name: d.name.trim(), amount: round2(amount), freq: d.freq, nextDate: d.nextDate, categoryId: d.categoryId || null };
    if (r) Object.assign(r, rec); else state.recurring.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (r) $('#del').onclick = () => { state.recurring = state.recurring.filter(x => x.id !== r.id); closeModal(); commit(); };
}

/* ---------- goal ---------- */
function goalModal(id) {
  const g = id ? state.goals.find(x => x.id === id) : null;
  const v = g || { name: '', target: '', targetDate: `${new Date().getFullYear() + 1}-12-31`, monthly: '', saved: '' };
  const src = v.accountId ? 'account' : v.categoryId ? 'category' : 'manual';
  openModal({
    title: g ? `Edit ${g.name}` : 'Add a goal',
    body: `<form id="f" class="form-grid">
      <label class="field wide"><span>Goal</span><input name="name" value="${esc(v.name)}" placeholder="e.g. Emergency fund, Italy 2027, New car" required autofocus></label>
      <label class="field"><span>Target amount</span><input name="target" inputmode="decimal" value="${v.target}"></label>
      <label class="field"><span>Target date</span><input type="date" name="targetDate" value="${v.targetDate || ''}"></label>
      <label class="field"><span>Track progress with</span><select name="src" id="g-src"><option value="manual" ${src === 'manual' ? 'selected' : ''}>An amount I update</option><option value="account" ${src === 'account' ? 'selected' : ''}>An account’s balance</option><option value="category" ${src === 'category' ? 'selected' : ''}>A rollover budget category</option></select></label>
      <label class="field g-src g-manual"><span>Saved so far</span><input name="saved" inputmode="decimal" value="${v.saved ?? ''}"></label>
      <label class="field g-src g-account"><span>Account</span><select name="accountId">${acctOptions(v.accountId, a => !isLiability(a))}</select></label>
      <label class="field g-src g-category"><span>Category</span><select name="categoryId">${catOptions(v.categoryId, false, c => c.kind === 'expense')}</select><small class="muted">Keel turns on rollover for it</small></label>
      <label class="field"><span>Planning to put in each month</span><input name="monthly" inputmode="decimal" value="${v.monthly ?? ''}" placeholder="Optional"></label>
    </form>`,
    actions: `${g ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${g ? 'Save' : 'Add goal'}</button>`,
  });
  const sync = () => { const s = $('#g-src').value; $$('.g-src').forEach(el => el.hidden = !el.classList.contains('g-' + s)); };
  $('#g-src').onchange = sync; sync();
  $('#save').onclick = () => {
    const d = formData($('#f')), target = parseAmount(d.target);
    if (!d.name.trim() || !isFinite(target)) return toast('Fill in a name and target amount.');
    const rec = { name: d.name.trim(), target: round2(target), targetDate: d.targetDate || null, monthly: d.monthly === '' ? null : round2(parseAmount(d.monthly) || 0), accountId: null, categoryId: null, saved: null };
    if (d.src === 'account') rec.accountId = d.accountId;
    else if (d.src === 'category') { rec.categoryId = d.categoryId; const c = catById(d.categoryId); if (c && !c.rollover) { c.rollover = true; c.rolloverStart = thisMonth(); } }
    else rec.saved = round2(parseAmount(d.saved) || 0);
    if (g) Object.assign(g, rec); else state.goals.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (g) $('#del').onclick = () => { state.goals = state.goals.filter(x => x.id !== g.id); closeModal(); commit(); toast('Goal deleted.', { label: 'Undo', fn: undo }); };
}

/* ---------- category ---------- */
function catModal(id) {
  const c = id ? catById(id) : null;
  const v = c || { name: '', group: '', kind: 'expense', budget: 0, period: 'month', rental: '' };
  const groups = [...new Set(state.categories.map(x => x.group))];
  const used = c ? state.transactions.filter(t => txHasCat(t, c.id)).length : 0;
  openModal({
    title: c ? `Edit ${c.name}` : 'Add a category',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Name</span><input name="name" value="${esc(v.name)}" required autofocus></label>
      <label class="field"><span>Group</span><input name="group" list="grp" value="${esc(v.group)}" placeholder="e.g. Lifestyle"><datalist id="grp">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="field"><span>Kind</span><select name="kind"><option value="expense" ${v.kind === 'expense' ? 'selected' : ''}>Spending</option><option value="income" ${v.kind === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${v.kind === 'transfer' ? 'selected' : ''}>Transfer (left out of spending)</option></select></label>
      <label class="field"><span>Budget</span><input name="budget" inputmode="decimal" value="${v.budget || ''}" placeholder="0"></label>
      <label class="field"><span>Budget period</span><select name="period"><option value="month" ${v.period !== 'year' ? 'selected' : ''}>Per month</option><option value="year" ${v.period === 'year' ? 'selected' : ''}>Per year</option></select></label>
      <label class="check"><input type="checkbox" name="rollover" ${v.rollover ? 'checked' : ''}> Roll unspent money into next month</label>
      <label class="field"><span>Tax tag</span><select name="taxTag"><option value="">None</option>${TAX_TAGS.map(t => `<option ${v.taxTag === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Rental role</span><select name="rental"><option value="">Not a rental category</option>${Object.entries(RENTAL_ROLES).map(([k, l]) => `<option value="${k}" ${v.rental === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${c ? `<p class="muted small wide">Used by ${used} transaction${used === 1 ? '' : 's'}.</p>` : ''}
    </form>`,
    actions: `${c ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${c ? 'Save' : 'Add category'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    if (!d.name.trim() || !d.group.trim()) return toast('Fill in a name and group.');
    const rec = { name: d.name.trim(), group: d.group.trim(), kind: d.kind, budget: round2(parseAmount(d.budget || '0') || 0), period: d.period, rental: d.rental || undefined, taxTag: d.taxTag || undefined, rollover: d.rollover || undefined };
    if (rec.rollover && !(c && c.rollover)) rec.rolloverStart = thisMonth();
    if (rec.rental === 'income' && !(c && c.schedE)) rec.schedE = '3';
    if (rec.rental === 'opex' && !(c && c.schedE)) rec.schedE = '19';
    if (c) Object.assign(c, rec); else state.categories.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (c) $('#del').onclick = async () => {
    if (!await confirmBox('Delete category', `Delete <strong>${esc(c.name)}</strong>? ${used ? `Its ${used} transactions become uncategorized and` : ''} any rules that use it are removed.`, 'Delete', true)) return;
    state.categories = state.categories.filter(x => x.id !== c.id);
    state.transactions.forEach(t => { if (t.categoryId === c.id) t.categoryId = null; (t.splits || []).forEach(s => { if (s.categoryId === c.id) s.categoryId = null; }); });
    state.rules = state.rules.filter(r => r.categoryId !== c.id);
    state.recurring.forEach(r => { if (r.categoryId === c.id) r.categoryId = null; });
    state.goals.forEach(g => { if (g.categoryId === c.id) g.categoryId = null; });
    commit(); toast('Category deleted.', { label: 'Undo', fn: undo });
  };
}

/* ---------- rule ---------- */
function ruleModal(id) {
  const r = id ? state.rules.find(x => x.id === id) : null;
  const v = r || { text: '', categoryId: '', rename: '' };
  openModal({
    title: r ? 'Edit rule' : 'Add a rule',
    body: `<form id="f" class="form-grid">
      <label class="field wide"><span>When the payee contains</span><input name="text" value="${esc(v.text)}" placeholder="e.g. WHOLE FOODS" required autofocus></label>
      <label class="field"><span>Set the category to</span><select name="categoryId">${catOptions(v.categoryId, false)}</select></label>
      ${members().length > 1 ? `<label class="field"><span>And the person to</span><select name="person">${memberOptions(v.person || '', 'Leave as account owner')}</select></label>` : ''}
      <label class="field"><span>And rename the payee to</span><input name="rename" value="${esc(v.rename || '')}" placeholder="Optional"></label>
    </form>`,
    actions: `${r ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${r ? 'Save' : 'Add rule'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    if (!d.text.trim()) return toast('Type the text to match.');
    const rec = { text: d.text.trim().toUpperCase(), categoryId: d.categoryId, rename: d.rename.trim(), person: d.person || undefined };
    if (r) Object.assign(r, rec); else state.rules.unshift({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (r) $('#del').onclick = () => { state.rules = state.rules.filter(x => x.id !== r.id); closeModal(); commit(); };
}
