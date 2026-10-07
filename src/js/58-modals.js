/* ================= edit dialogs ================= */
function ruleKeyFor(payee) {
  const words = normPayee(payee).split(' ').filter(Boolean);
  if (!words.length) return '';
  return words[0].length >= 5 ? words[0] : words.slice(0, 2).join(' ');
}
function offerRule(t, catId) {
  if (!catId) return;
  const src = t.rawPayee || t.payee;
  const existing = matchRule(src);
  if (existing && existing.categoryId === catId) return;
  const key = ruleKeyFor(src); if (!key) return;
  const others = state.transactions.filter(x => x.id !== t.id && !x.categoryId && normPayee(x.rawPayee || x.payee).includes(key));
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

/* ---------- transaction ---------- */
function txnModal(id) {
  const t = id ? state.transactions.find(x => x.id === id) : null;
  const cashAcct = activeAccounts().find(a => a.type === 'checking') || activeAccounts()[0];
  const v = t || { date: today(), payee: '', amount: '', accountId: cashAcct?.id, categoryId: '', memo: '' };
  if (!activeAccounts().length) { toast('Add an account first.'); return acctModal(); }
  openModal({
    title: t ? 'Edit transaction' : 'Add transaction',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Date</span><input type="date" name="date" value="${v.date}" required></label>
      <label class="field"><span>Amount</span><input name="amount" inputmode="decimal" value="${v.amount === '' ? '' : round2(v.amount)}" placeholder="-42.50" required><small class="muted">Negative for money out</small></label>
      <label class="field wide"><span>Payee</span><input name="payee" value="${esc(v.payee)}" required autofocus></label>
      <label class="field"><span>Account</span><select name="accountId">${acctOptions(v.accountId)}</select></label>
      <label class="field"><span>Category</span><select name="categoryId">${catOptions(v.categoryId)}</select></label>
      <label class="field wide"><span>Memo</span><input name="memo" value="${esc(v.memo || '')}"></label>
      ${t?.rawPayee && t.rawPayee !== t.payee ? `<p class="muted small wide">Bank description: ${esc(t.rawPayee)}</p>` : ''}
    </form>`,
    actions: `${t ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${t ? 'Save' : 'Add transaction'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    const amount = parseAmount(d.amount);
    if (!d.date || !d.payee.trim() || !isFinite(amount)) return toast('Fill in a date, payee and amount.');
    const changedCat = !t || t.categoryId !== (d.categoryId || null);
    const rec = { date: d.date, payee: d.payee.trim(), amount: round2(amount), accountId: d.accountId, categoryId: d.categoryId || null, memo: d.memo };
    let target;
    if (t) target = Object.assign(t, rec); else state.transactions.push(target = { id: uid(), ...rec });
    state.transactions.sort((a, b) => b.date.localeCompare(a.date));
    closeModal(); commit();
    if (changedCat && t) offerRule(target, target.categoryId);
  };
  if (t) $('#del').onclick = async () => { if (await confirmBox('Delete transaction', `Delete “${esc(t.payee)}” for ${money(t.amount)}?`, 'Delete', true)) { state.transactions = state.transactions.filter(x => x.id !== t.id); commit(); } };
}

/* ---------- account ---------- */
function acctModal(id, presetType) {
  const a = id ? acctById(id) : null;
  const v = a || { name: '', type: presetType || 'checking', institution: '', balance: '', balanceDate: today() };
  const hasHoldings = a && holdingsFor(a.id).length;
  const loans = activeAccounts().filter(x => ['mortgage', 'loan', 'otherLiability'].includes(x.type));
  const rentalGroups = [...new Set(state.categories.filter(c => c.rental).map(c => c.group))];
  openModal({
    title: a ? 'Edit account' : 'Add account',
    body: `<form id="f" class="form-grid" data-type="${v.type}">
      <label class="field wide"><span>Name</span><input name="name" value="${esc(v.name)}" placeholder="e.g. Joint checking" required autofocus></label>
      <label class="field"><span>Type</span><select name="type" id="acct-type">${BUCKETS.map(b => `<optgroup label="${esc(b.label)}">${b.types.map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="field"><span>Institution</span><input name="institution" value="${esc(v.institution || '')}" placeholder="Optional"></label>
      ${hasHoldings ? `<p class="muted small wide">Value comes from ${hasHoldings} holding${hasHoldings > 1 ? 's' : ''}: ${money(accountValue(a))}.</p><label class="field"><span>Uninvested cash</span><input name="cash" inputmode="decimal" value="${a.cash || ''}" placeholder="0"></label>`
        : `<label class="field"><span id="bal-label">${ACCOUNT_TYPES[v.type].side === 'liability' ? 'Amount owed' : 'Balance or value'}</span><input name="balance" inputmode="decimal" value="${v.balance === '' ? '' : round2(v.balance)}" placeholder="0.00"></label>`}
      <label class="field"><span>As of</span><input type="date" name="balanceDate" value="${v.balanceDate || today()}"></label>
      <label class="field"><span>Last 4 digits</span><input name="last4" value="${esc(v.last4 || '')}" maxlength="4" inputmode="numeric" placeholder="Matches imports"></label>
      <div class="when-cash wide"><label class="check"><input type="checkbox" name="forecast" ${(v.forecast ?? ACCOUNT_TYPES[v.type].forecast) ? 'checked' : ''}> Include in the cash-flow forecast</label></div>
      <label class="field when-invest"><span>Treat as (when no holdings)</span><select name="assetClass">${ASSET_CLASSES.map(c => `<option ${c === (v.assetClass || 'US stocks') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field when-debt"><span>Interest rate (%)</span><input name="rate" inputmode="decimal" value="${v.rate ?? ''}"></label>
      <div class="when-property wide form-grid">
        <label class="field"><span>Mortgage</span><select name="mortgageId"><option value="">None</option>${loans.map(l => `<option value="${l.id}" ${l.id === v.mortgageId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="rental" ${v.rental ? 'checked' : ''}> This is a rental property</label>
        <label class="field"><span>Rental category group</span><select name="rentalGroup">${(rentalGroups.length ? rentalGroups : ['Rental property']).map(g => `<option ${g === v.rentalGroup ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label class="field"><span>Cash invested</span><input name="cashInvested" inputmode="decimal" value="${v.cashInvested ?? ''}" placeholder="Down payment plus improvements"></label>
        <label class="field"><span>Units</span><input name="units" inputmode="numeric" value="${v.units ?? ''}"></label>
      </div>
      <label class="field wide"><span>Notes</span><input name="notes" value="${esc(v.notes || '')}"></label>
    </form>`,
    actions: `${a ? `<button class="btn ghost danger-text left" id="del">Delete</button><button class="btn ghost" id="arch">${a.archived ? 'Restore' : 'Archive'}</button>` : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${a ? 'Save' : 'Add account'}</button>`,
  });
  const f = $('#f');
  $('#acct-type').onchange = e => { f.dataset.type = e.target.value; const l = $('#bal-label'); if (l) l.textContent = ACCOUNT_TYPES[e.target.value].side === 'liability' ? 'Amount owed' : 'Balance or value'; const fc = f.querySelector('[name=forecast]'); fc.checked = !!ACCOUNT_TYPES[e.target.value].forecast; };
  $('#save').onclick = () => {
    const d = formData(f);
    if (!d.name.trim()) return toast('Give the account a name.');
    const rec = { name: d.name.trim(), type: d.type, institution: d.institution.trim(), balanceDate: d.balanceDate || today(), last4: d.last4.trim(), notes: d.notes, forecast: d.forecast };
    if ('balance' in d) { const b = parseAmount(d.balance || '0'); rec.balance = isFinite(b) ? round2(isLiability({ type: d.type }) ? Math.abs(b) : b) : 0; }
    if ('cash' in d) rec.cash = round2(parseAmount(d.cash || '0') || 0);
    if (ACCOUNT_TYPES[d.type].bucket === 'invest') rec.assetClass = d.assetClass;
    if (ACCOUNT_TYPES[d.type].bucket === 'debt') rec.rate = d.rate === '' ? null : parseFloat(d.rate);
    if (d.type === 'realestate') Object.assign(rec, { mortgageId: d.mortgageId || null, rental: d.rental, rentalGroup: d.rentalGroup, cashInvested: parseAmount(d.cashInvested) || null, units: parseInt(d.units) || null });
    if (a) Object.assign(a, rec); else state.accounts.push({ id: uid(), ...rec });
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
      commit();
    };
  }
}

/* ---------- balance history ---------- */
function historyModal(id) {
  const a = acctById(id); if (!a) return;
  const liab = isLiability(a), cur = thisMonth();
  const months = Object.keys(state.snapshots).filter(m => state.snapshots[m][id] != null).sort().reverse();
  const rows = months.map(m => `<tr><th scope="row">${monthLabel(m)}</th><td class="num">${m === cur ? `${money(accountValue(a))} <span class="muted small">live</span>` : `<input class="bal-input" data-hm="${m}" inputmode="decimal" value="${round2(Math.abs(state.snapshots[m][id]))}">`}</td><td class="acts">${m === cur ? '' : `<button class="icon-btn" data-hdel="${m}" aria-label="Remove ${monthLabel(m)}">×</button>`}</td></tr>`).join('');
  openModal({
    title: `${a.name}: balance history`,
    body: `<p class="muted">Month-end ${liab ? 'amounts owed' : 'values'} feed the net worth chart. Keel records the current month automatically; add earlier months from old statements.</p>
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
  openModal({
    title: h ? `Edit ${h.symbol}` : 'Add holding',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Account</span><select name="accountId">${invAccts.map(a => `<option value="${a.id}" ${a.id === v.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Symbol or short name</span><input name="symbol" value="${esc(v.symbol)}" required autofocus></label>
      <label class="field wide"><span>Description</span><input name="name" value="${esc(v.name || '')}"></label>
      <label class="field"><span>Shares or units</span><input name="shares" inputmode="decimal" value="${v.shares}"></label>
      <label class="field"><span>Price per share</span><input name="price" inputmode="decimal" value="${v.price}"></label>
      <label class="field"><span>Total cost basis</span><input name="costBasis" inputmode="decimal" value="${v.costBasis ?? ''}" placeholder="Optional"></label>
      <label class="field"><span>Asset class</span><select name="assetClass">${ASSET_CLASSES.map(c => `<option ${c === v.assetClass ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Price as of</span><input type="date" name="priceDate" value="${v.priceDate || today()}"></label>
      <label class="check"><input type="checkbox" name="private" ${v.private ? 'checked' : ''}> Private or illiquid (valued by your own marks)</label>
    </form>`,
    actions: `${h ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${h ? 'Save' : 'Add holding'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    const shares = parseAmount(d.shares), price = parseAmount(d.price), cb = parseAmount(d.costBasis);
    if (!d.symbol.trim() || !isFinite(shares) || !isFinite(price)) return toast('Fill in a symbol, shares and price.');
    const rec = { accountId: d.accountId, symbol: d.symbol.trim().toUpperCase(), name: d.name.trim(), shares, price, costBasis: isFinite(cb) ? cb : null, assetClass: d.assetClass, priceDate: d.priceDate || today(), private: d.private };
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

/* ---------- category ---------- */
function catModal(id) {
  const c = id ? catById(id) : null;
  const v = c || { name: '', group: '', kind: 'expense', budget: 0, period: 'month', rental: '' };
  const groups = [...new Set(state.categories.map(x => x.group))];
  const used = c ? state.transactions.filter(t => t.categoryId === c.id).length : 0;
  openModal({
    title: c ? `Edit ${c.name}` : 'Add a category',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Name</span><input name="name" value="${esc(v.name)}" required autofocus></label>
      <label class="field"><span>Group</span><input name="group" list="grp" value="${esc(v.group)}" placeholder="e.g. Lifestyle"><datalist id="grp">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="field"><span>Kind</span><select name="kind"><option value="expense" ${v.kind === 'expense' ? 'selected' : ''}>Spending</option><option value="income" ${v.kind === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${v.kind === 'transfer' ? 'selected' : ''}>Transfer (left out of spending)</option></select></label>
      <label class="field"><span>Budget</span><input name="budget" inputmode="decimal" value="${v.budget || ''}" placeholder="0"></label>
      <label class="field"><span>Budget period</span><select name="period"><option value="month" ${v.period !== 'year' ? 'selected' : ''}>Per month</option><option value="year" ${v.period === 'year' ? 'selected' : ''}>Per year</option></select></label>
      <label class="field"><span>Rental role</span><select name="rental"><option value="">Not a rental category</option>${Object.entries(RENTAL_ROLES).map(([k, l]) => `<option value="${k}" ${v.rental === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${c ? `<p class="muted small wide">Used by ${used} transaction${used === 1 ? '' : 's'}.</p>` : ''}
    </form>`,
    actions: `${c ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${c ? 'Save' : 'Add category'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    if (!d.name.trim() || !d.group.trim()) return toast('Fill in a name and group.');
    const rec = { name: d.name.trim(), group: d.group.trim(), kind: d.kind, budget: round2(parseAmount(d.budget || '0') || 0), period: d.period, rental: d.rental || undefined };
    if (c) Object.assign(c, rec); else state.categories.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (c) $('#del').onclick = async () => {
    if (!await confirmBox('Delete category', `Delete <strong>${esc(c.name)}</strong>? ${used ? `Its ${used} transactions become uncategorized and` : ''} any rules that use it are removed.`, 'Delete', true)) return;
    state.categories = state.categories.filter(x => x.id !== c.id);
    state.transactions.forEach(t => { if (t.categoryId === c.id) t.categoryId = null; });
    state.rules = state.rules.filter(r => r.categoryId !== c.id);
    state.recurring.forEach(r => { if (r.categoryId === c.id) r.categoryId = null; });
    commit();
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
      <label class="field"><span>And rename the payee to</span><input name="rename" value="${esc(v.rename || '')}" placeholder="Optional"></label>
    </form>`,
    actions: `${r ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${r ? 'Save' : 'Add rule'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    if (!d.text.trim()) return toast('Type the text to match.');
    const rec = { text: d.text.trim().toUpperCase(), categoryId: d.categoryId, rename: d.rename.trim() };
    if (r) Object.assign(r, rec); else state.rules.unshift({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (r) $('#del').onclick = () => { state.rules = state.rules.filter(x => x.id !== r.id); closeModal(); commit(); };
}
