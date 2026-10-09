/* ================= actions + events + boot ================= */
function replaceState(next, msg) {
  state = next; invalidate(); applyTheme();
  // On a phone, swapping in different data (sample data, erase, a backup) unlinks it from the Mac's copy.
  if (isCompanion() && SYNC.rec && !SYNC.rec.replaced) { SYNC.rec.replaced = true; syncSave(); }
  commit({ silent: true }); render(); if (msg) toast(msg, { label: 'Undo', fn: undo });
}
const ACTIONS = {
  'import': () => startImport(),
  'add-txn': () => txnModal(),
  'add-account': el => acctModal(null, el?.dataset.type),
  'add-holding': el => holdingModal(null, el?.dataset.acct),
  'add-recurring': () => recModal(),
  'add-cat': () => catModal(),
  'add-rule': () => ruleModal(),
  'add-goal': () => goalModal(),
  'palette': () => openPalette(),
  'more-pages': () => morePagesSheet(),
  'loan-detail': el => loanModal(el.dataset.id),
  'tx-filters': () => { UI.txFilters = !$('.filters')?.classList.contains('open'); render(); },
  'tx-select': () => { UI.txSelect = !UI.txSelect; if (!UI.txSelect) { $$('.tx-cb:checked').forEach(c => { c.checked = false; }); } render(); },
  'more-money-date': () => { closeModal(true); ACTIONS['money-date'](); },
  'money-date': el => startMoneyDate(el?.dataset.mk),
  'privacy': () => { state.settings.privacy = !state.settings.privacy; commit({ silent: true }); render(); },
  'print': () => window.print(),
  'sync': () => syncSheet(),
  'sync-open': () => syncPickFile(),
  'sync-send': () => syncSend(),
  'run-rules': () => {
    let n = 0;
    const hist = categoryHistory();
    for (const t of state.transactions) if (!t.categoryId && !(t.splits && t.splits.length)) {
      const r = matchRule(t.rawPayee || t.payee);
      if (r) { t.categoryId = r.categoryId; if (r.rename) t.payee = r.rename; if (r.person) t.person = r.person; n++; }
      else { const a = autoCategory(t.rawPayee || t.payee, t.amount, { mcc: t.mcc }, hist); if (a) { t.categoryId = a.id; n++; } }
    }
    if (n) commit();
    const left = state.transactions.filter(isUncat).length;
    toast(n ? `Categorized ${n.toLocaleString()} transaction${n > 1 ? 's' : ''}.${left ? ` ${left.toLocaleString()} still need you.` : ''}` : 'Nothing new to categorize. Pick a category for one and Ọrọ̀ will offer to remember it.', n ? { label: 'Undo', fn: undo } : null);
  },
  'load-sample': async () => {
    if (state.accounts.length && !await confirmBox('Load sample data', 'This replaces everything in Ọrọ̀ with a fictional household. You can undo it right after.', 'Replace with sample data', true)) return;
    const s = buildSampleState(); UI.nwRange = '12'; UI.lens = '';
    replaceState(s); go('#/overview');
    toast('Sample data loaded. Explore, then erase it in Settings when you’re ready to start.', { label: 'Undo', fn: undo });
  },
  'erase': () => {
    openModal({ title: 'Erase everything', body: `<p>This deletes every account, transaction, holding and setting${hasFolder() ? ` here and in <code>${esc(Store.fileName)}/data</code>. Earlier copies stay in the backups folder` : ''}. You can undo it until you close Ọrọ̀.</p><label class="field"><span>Type ERASE to confirm</span><input id="erase-confirm" autocomplete="off"></label>`,
      actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="erase-go">Erase everything</button>` });
    $('#erase-go').onclick = () => {
      if ($('#erase-confirm').value.trim().toUpperCase() !== 'ERASE') return toast('Type ERASE to confirm.');
      closeModal(); replaceState(defaultState(), 'Everything was erased.'); go('#/overview');
    };
  },
  'save-balances': () => {
    let n = 0;
    $$('[data-bal]').forEach(inp => {
      const a = acctById(inp.dataset.bal), v = parseAmount(inp.value);
      if (!a || !isFinite(v)) return;
      setBalance(a, isLiability(a) ? Math.abs(v) : v); n++;
    });
    commit({ silent: true }); go('#/accounts'); toast(`Saved ${n} balance${n === 1 ? '' : 's'} as of today.`);
  },
  'budget-avg': async () => {
    const mk = route().params.m || thisMonth();
    if (!await confirmBox('Fill budgets from averages', `Set each monthly category’s budget to its average over the three months before ${monthLabel(mk)}, rounded to the nearest $10? Yearly categories aren’t changed.`, 'Fill budgets')) return;
    let n = 0;
    for (const c of state.categories) { if (c.kind === 'transfer' || c.period === 'year') continue; const avg = trailingAvg(c.id, mk, 3); if (avg > 0) { c.budget = Math.round(avg / 10) * 10; n++; } }
    commit(); toast(`Updated ${n} budget${n === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
  },
  'bulk-cat': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value)), cat = $('#bulk-cat').value || null;
    let unflagged = 0;
    state.transactions.forEach(t => { if (ids.has(t.id)) { t.categoryId = cat; delete t.splits; if (cat && t.flag) { delete t.flag; unflagged++; } } });
    commit(); toast(`Updated ${ids.size} transaction${ids.size === 1 ? '' : 's'}${unflagged ? ` and cleared ${unflagged} flag${unflagged === 1 ? '' : 's'}` : ''}.`, { label: 'Undo', fn: undo });
  },
  'bulk-who': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value)), who = $('#bulk-who').value;
    state.transactions.forEach(t => { if (ids.has(t.id)) { if (who) t.person = who; else delete t.person; } });
    commit(); toast(`Updated ${ids.size} transaction${ids.size === 1 ? '' : 's'}.`);
  },
  'bulk-tag': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value)), tags = parseTags($('#bulk-tag').value);
    if (!tags.length) return toast('Type a tag first.');
    state.transactions.forEach(t => { if (ids.has(t.id)) t.tags = [...new Set([...(t.tags || []), ...tags])]; });
    commit(); toast(`Tagged ${ids.size} transaction${ids.size === 1 ? '' : 's'}.`);
  },
  'tx-flag': el => {
    const t = state.transactions.find(x => x.id === el.dataset.id); if (!t) return;
    if (t.flag) delete t.flag; else t.flag = true;
    const first = t.flag && !state.transactions.some(x => x.flag && x.id !== t.id);
    commit();
    if (first) toast('Flagged. Flagged transactions collect under Transactions › flagged, and on Overview, until you pick a category.');
  },
  'bulk-flag': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value));
    state.transactions.forEach(t => { if (ids.has(t.id)) t.flag = true; });
    commit(); toast(`Flagged ${ids.size} transaction${ids.size === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
  },
  'bulk-unflag': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value));
    state.transactions.forEach(t => { if (ids.has(t.id)) delete t.flag; });
    commit(); toast(`Cleared ${ids.size} flag${ids.size === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
  },
  'bulk-del': async () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value));
    if (!await confirmBox('Delete transactions', `Delete ${ids.size} transaction${ids.size === 1 ? '' : 's'}?`, 'Delete', true)) return;
    state.transactions = state.transactions.filter(t => !ids.has(t.id)); commit(); toast('Deleted.', { label: 'Undo', fn: undo });
  },
  'connect-folder': async () => {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'oro', mode: 'readwrite', startIn: 'documents' }); }
    catch (e) { if (e.name !== 'AbortError') toast('Couldn’t open that folder: ' + e.message); return; }
    await connectFolder(dir);
  },
  'reconnect': async () => { const ok = await reconnect(); render(); toast(ok ? `Saving to ${Store.fileName} again.` : 'Ọrọ̀ still doesn’t have permission to write there.'); if (ok) syncCheckInbox(); },
  'disconnect-file': async () => { await disconnectStorage(); render(); toast('Disconnected. Your data is still saved in this browser.'); },
  'open-file': async () => {
    const ask = () => promptPass('Unlock data file', 'This file is encrypted. Enter its passphrase.');
    const load = async text => {
      let next;
      try { next = await readDataFile(text, ask); } catch (e) { if (e.message !== 'cancelled') toast(e.message); return; }
      if (state.accounts.length && !await confirmBox('Open data file', 'Replace what’s in Ọrọ̀ now with the contents of this file? You can undo it.', 'Open file', true)) return;
      replaceState(next, 'Data file opened.'); go('#/overview');
    };
    if (window.showOpenFilePicker) {
      try { const [h] = await window.showOpenFilePicker({ types: [{ description: 'Ọrọ̀ data file', accept: { 'application/json': ['.json'] } }] }); await load(await (await h.getFile()).text()); }
      catch (e) { if (e.name !== 'AbortError') toast(e.message); }
    } else {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => inp.files[0] && load(await readFileAsText(inp.files[0]));
      inp.click();
    }
  },
  'backup': async () => { downloadFile(`oro-backup-${today()}.json`, JSON.stringify(await serialize())); toast(Store.key ? 'Encrypted backup downloaded.' : 'Backup downloaded. It isn’t encrypted; add a passphrase if you’ll store it somewhere shared.'); },
  'export-csv': () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Account', 'Payee', 'Category', 'Group', 'Amount', 'Person', 'Tags', 'Memo'].join(',')];
    for (const t of state.transactions) for (const l of txLines(t)) { const c = catById(l.categoryId); lines.push([t.date, q(acctById(t.accountId)?.name), q(t.payee), q(c?.name || 'Uncategorized'), q(c?.group || ''), l.amount.toFixed(2), q(memberName(personOf(t))), q((t.tags || []).join(' ')), q(t.memo)].join(',')); }
    saveExport(`oro-transactions-${today()}.csv`, lines.join('\n'));
  },
  'export-statement': el => {
    const ms = monthsIn(el.dataset.from, el.dataset.to).slice(-12);
    const per = ms.map(m => categoryActuals(lensed(txInMonth(m))));
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Group', 'Category', ...ms, 'Total'].join(',')];
    for (const c of state.categories.filter(c => c.kind !== 'transfer')) { const vals = per.map(a => a[c.id] || 0); if (vals.some(Boolean)) lines.push([q(c.group), q(c.name), ...vals.map(v => v.toFixed(2)), sum(vals).toFixed(2)].join(',')); }
    saveExport(`oro-income-statement-${ms[0]}-to-${ms[ms.length - 1]}.csv`, lines.join('\n'));
  },
  'export-tax': el => {
    const year = +el.dataset.year, q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [`Ọrọ̀ tax summary for ${year}`, ''];
    for (const a of activeAccounts().filter(x => x.type === 'realestate' && x.rental)) {
      const E = scheduleE(a, year);
      lines.push(`Schedule E,${q(a.name)}`, 'Line,Description,Amount');
      for (const k of Object.keys(SCHED_E)) if (E.lines[k]) lines.push(`${k},${q(SCHED_E[k])},${E.lines[k].toFixed(2)}`);
      lines.push(`20,Total expenses,${E.expenses.toFixed(2)}`, `21,Income or (loss),${E.net.toFixed(2)}`, '');
    }
    const D = deductionSummary(year);
    lines.push('Possible deductions,Amount');
    for (const [k, v] of Object.entries(D.by)) lines.push(`${q(k)},${v.toFixed(2)}`);
    if (D.tagged.length) { lines.push('', 'Transactions tagged #tax', 'Date,Payee,Amount'); D.tagged.forEach(t => lines.push(`${t.date},${q(t.payee)},${t.amount.toFixed(2)}`)); }
    lines.push('', 'Detail: every transaction in tax-tagged and rental categories', 'Date,Account,Payee,Category,Amount');
    for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) for (const l of txLines(t)) { const c = catById(l.categoryId); if (c && (c.taxTag || c.rental)) lines.push(`${t.date},${q(acctById(t.accountId)?.name)},${q(t.payee)},${q(c.name)},${l.amount.toFixed(2)}`); }
    saveExport(`oro-tax-${year}.csv`, lines.join('\n'));
  },
  'set-pass': async () => { const p = await promptPass('Add a passphrase', 'Ọrọ̀ will encrypt your data, backups and receipts with this passphrase. You’ll need it every time you open Ọrọ̀.', { confirm: true, ok: 'Encrypt my data' }); if (p) { await setPassphrase(p); render(); armAutoLock(); toast('Your data is now encrypted.'); } },
  'change-pass': async () => { const p = await promptPass('Change passphrase', 'Choose a new passphrase. Receipts saved earlier still open with the old one, so keep it until you re-attach them.', { confirm: true, ok: 'Change passphrase' }); if (p) { await setPassphrase(p); render(); toast('Passphrase changed.'); } },
  'remove-pass': async () => { if (await confirmBox('Remove passphrase', 'Your data and new backups will be stored without encryption.', 'Remove passphrase', true)) { await setPassphrase(null); render(); toast('Passphrase removed.'); } },
  'add-member': () => { const id = 'm' + uid().slice(0, 5); state.settings.members.push({ id, name: 'New person' }); commit(); setTimeout(() => { const el = $(`[data-member="${id}"]`); if (el) { el.focus(); el.select(); } }, 30); },
};

async function connectFolder(dir) {
  const ok = await useFolder(dir);
  if (!ok) return toast('Ọrọ̀ needs permission to save in that folder.');
  const existing = await folderHasData();
  if (existing) {
    let next = null;
    try { next = await readDataFile(existing, () => promptPass('Unlock Ọrọ̀ data', 'The data in this folder is encrypted. Enter its passphrase.')); } catch (e) { if (e.message !== 'cancelled') toast(e.message); }
    if (next && JSON.stringify(next.accounts) !== JSON.stringify(state.accounts)) {
      const theirs = next.meta?.modified ? new Date(next.meta.modified).toLocaleString() : 'an earlier date';
      const useTheirs = !state.accounts.length || await confirmBox('This folder already has Ọrọ̀ data', `It was last saved ${esc(theirs)}. Open it, replacing what’s on screen now? Choose Cancel to keep what’s on screen and save it into the folder instead.`, 'Open the folder’s data');
      if (useTheirs) { replaceState(next); resetHistory(); toast(`Opened your data from ${Store.fileName}.`); syncCheckInbox(); return; }
    }
  }
  Store.lastBackup = null;
  await persistNow(); render();
  toast(`Saving to ${Store.fileName}: data, daily backups and receipts.`);
  syncCheckInbox();
}

const THEME_COLORS = { ng: ['#F6F3EA', '#0C1713'], classic: ['#E8EEE5', '#0F1619'] };   // browser bar colors: light, dark
function applyTheme() {
  const t = state?.settings?.theme || 'auto', look = state?.settings?.look === 'classic' ? 'classic' : 'ng', root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  root.dataset.look = look;
  for (const m of document.querySelectorAll('meta[name="theme-color"]'))
    m.content = THEME_COLORS[look][(t === 'auto' ? /dark/.test(m.media) : t === 'dark') ? 1 : 0];
}
function updateBulk() {
  const n = $$('.tx-cb:checked').length, b = $('#bulk');
  if (!b) return;
  b.hidden = !n; $('#bulk-count').textContent = `${n} selected`;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-close],[data-imp],[data-act],[data-md],[data-month],[data-nwrange],[data-mode],[data-tab],[data-by],[data-lens],[data-tagfilter],[data-edit-txn],[data-edit-acct],[data-history],[data-reconcile],[data-edit-holding],[data-edit-rec],[data-edit-cat],[data-edit-rule],[data-edit-goal],[data-add-rep],[data-more],[data-review-done],[data-restore],[data-member-del],#save-status,#menu-btn');
  if (!el) return;
  const d = el.dataset;
  if ('close' in d) return closeModal();
  if (d.imp) return importAction(d.imp);
  if (d.md) return mdAction(d.md);
  if (d.act) { e.preventDefault(); return ACTIONS[d.act]?.(el); }
  if (d.month) return setParam(d.param || 'm', d.month === thisMonth() && d.param !== 'cm' ? '' : d.month);
  if (d.nwrange) { UI.nwRange = d.nwrange; return render(); }
  if (d.mode) { setMode(d.mode); $$('#modal .seg.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === d.mode)); return; }
  if (d.tab) return setParam(d.param, d.tab);
  if ('by' in d && el.closest('.seg')) return setParam('by', d.by);
  if ('lens' in d) { UI.lens = d.lens; try { sessionStorage.setItem('keel.lens', d.lens); } catch (e2) { /* ignore */ } return render(); }
  if (d.tagfilter) { e.preventDefault(); return go(`#/transactions?m=all&tag=${encodeURIComponent(d.tagfilter)}`); }
  if (d.editTxn) return txnModal(d.editTxn);
  if (d.editAcct) return acctModal(d.editAcct);
  if (d.history) return historyModal(d.history);
  if (d.reconcile) return reconcileModal(d.reconcile);
  if (d.editHolding) return holdingModal(d.editHolding);
  if (d.editRec) return recModal(d.editRec);
  if (d.editCat) return catModal(d.editCat);
  if (d.editRule) return ruleModal(d.editRule);
  if (d.editGoal) return goalModal(d.editGoal);
  if (d.addRep) { const r = detectRepeating()[+d.addRep]; if (r) recModal(null, { name: r.payee, amount: -r.monthly, freq: 'monthly', nextDate: nextOccurrence(r.lastDate, 'monthly'), categoryId: r.categoryId }); return; }
  if (d.more) return setParam('limit', d.more);
  if (d.memberDel) { const id = d.memberDel; state.settings.members = state.settings.members.filter(m => m.id !== id); state.accounts.forEach(a => { if (a.owner === id) a.owner = 'joint'; }); state.transactions.forEach(t => { if (t.person === id) delete t.person; }); if (UI.lens === id) UI.lens = ''; commit(); return; }
  if (d.restore) {
    (async () => {
      const b = (await listBackups()).find(x => x.name === d.restore); if (!b) return;
      let next; try { next = await readDataFile(await readHandleText(b.handle), () => promptPass('Unlock backup', 'This backup is encrypted. Enter its passphrase.')); } catch (err) { if (err.message !== 'cancelled') toast(err.message); return; }
      if (!await confirmBox('Restore backup', `Replace what’s in Ọrọ̀ now with the backup from ${dateLabel(b.date, true)}? You can undo it.`, 'Restore', true)) return;
      replaceState(next, `Restored the backup from ${dateLabel(b.date, true)}.`);
    })();
    return;
  }
  if (d.reviewDone) {
    const mk = d.reviewDone; state.reviews[mk] = state.reviews[mk] || {};
    if (d.undo) delete state.reviews[mk].completedAt; else state.reviews[mk].completedAt = today();
    commit(); if (!d.undo) toast(`${monthLabel(mk)} marked as reviewed.`);
    return;
  }
  if (el.id === 'save-status' && d.action === 'reconnect') return ACTIONS.reconnect();
  if (el.id === 'save-status' && d.action === 'sync') return syncSheet();
  if (el.id === 'menu-btn') { document.body.classList.toggle('nav-open'); return; }
});
document.addEventListener('click', e => { if (e.target.closest('.nav a')) document.body.classList.remove('nav-open'); });

document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (el.id === 'lens-select') { UI.lens = el.value; try { sessionStorage.setItem('keel.lens', el.value); } catch (e2) { /* ignore */ } return render(); }
  if (d.filter && el.tagName === 'SELECT') return setParam(d.filter, el.value === thisMonth() && d.filter === 'm' && route().page !== 'review' ? '' : el.value);
  if (d.date) return setParam(d.date, el.value);
  if (d.txcat) {
    const t = state.transactions.find(x => x.id === d.txcat); if (!t) return;
    t.categoryId = el.value || null;
    el.closest('tr')?.classList.toggle('needs', !t.categoryId);
    const pill = el.parentElement?.querySelector('.cat-pill-text'); if (pill) pill.textContent = catName(t.categoryId);
    const resolved = !!(t.flag && t.categoryId);   // picking a category is how a flagged transaction gets sorted out
    if (resolved) { delete t.flag; const fb = el.closest('tr')?.querySelector('.flag-btn'); if (fb) { fb.classList.remove('on'); fb.setAttribute('aria-pressed', 'false'); } }
    commit({ silent: true });
    if (resolved) toast(`Flag cleared on “${t.payee}”.`, { label: 'Keep flag', fn: () => { t.flag = true; commit(); } });
    if (resolved && route().params.flag) setTimeout(render, 700);   // in the flagged list, a sorted-out one drops off
    offerRule(t, t.categoryId);
    return;
  }
  if (d.budget) { const c = catById(d.budget), v = parseAmount(el.value || '0'); if (c && isFinite(v)) { c.budget = round2(Math.max(0, v)); commit({ silent: true }); setTimeout(render, 0); } return; }
  if (d.target) { const v = parseFloat(el.value); if (el.value.trim() === '' || !isFinite(v)) delete state.settings.targets[d.target]; else state.settings.targets[d.target] = clamp(v, 0, 100); commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.setting) {
    const k = d.setting; let v = el.value;
    if (k !== 'theme' && k !== 'look') { v = parseAmount(v); if (!isFinite(v)) return; }
    state.settings[k] = v; applyTheme(); armAutoLock(); commit({ silent: true }); setTimeout(render, 0); return;
  }
  if (d.settingBool) { state.settings[d.settingBool] = el.checked; commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.plan) {
    const k = d.plan;
    if (el.type === 'checkbox') state.plan[k] = el.checked;
    else if (k === 'debtMethod') state.plan[k] = el.value;
    else { const raw = el.value.trim(); state.plan[k] = raw === '' ? null : parseAmount(raw); if (state.plan[k] != null && !isFinite(state.plan[k])) state.plan[k] = null; }
    commit({ silent: true }); setTimeout(render, 0); return;
  }
  if (d.taxint) { const v = parseAmount(el.value || ''); ((state.tax[d.taxint] = state.tax[d.taxint] || {})[d.year] = state.tax[d.taxint][d.year] || {}).interest = isFinite(v) ? round2(v) : null; commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.schede) { const c = catById(d.schede); if (c) { c.schedE = el.value; commit({ silent: true }); setTimeout(render, 0); } return; }
  if (d.member) { const m = state.settings.members.find(x => x.id === d.member); if (m && el.value.trim()) { m.name = el.value.trim(); commit({ silent: true }); setTimeout(render, 0); } return; }
  if (el.classList.contains('tx-cb')) return updateBulk();
  if (el.id === 'tx-all') { $$('.tx-cb').forEach(c => c.checked = el.checked); return updateBulk(); }
});
const searchDebounced = debounce(v => setParam('q', v), 300);
const notesDebounced = debounce((mk, v) => { (state.reviews[mk] = state.reviews[mk] || {}).notes = v; commit({ silent: true }); }, 500);
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'tx-search') return searchDebounced(el.value);
  if (el.dataset.reviewNotes) return notesDebounced(el.dataset.reviewNotes, el.value);
});

/* ---------- keyboard ---------- */
let _gPending = 0;
const GO_KEYS = { o: 'overview', t: 'transactions', b: 'budget', c: 'cashflow', a: 'accounts', i: 'investments', p: 'property', r: 'reports', l: 'planning', x: 'taxes', m: 'review', s: 'data' };
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  const mod = e.metaKey || e.ctrlKey;
  if (document.body.classList.contains('locked')) return;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
  if ($('#present') && !typing) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); return mdAction('next'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return mdAction('prev'); }
    if (e.key === 'Escape') return mdAction('close');
  }
  if (e.key === 'Escape' && $('#modal')) { closeModal(); return; }
  if (e.key === 'Enter' && (e.target.matches?.('.budget-input') || e.target.matches?.('[data-setting]') || e.target.matches?.('[data-plan]'))) { e.target.blur(); return; }
  if (typing || $('#modal') || $('#present')) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod || e.altKey) return;
  if (_gPending && Date.now() - _gPending < 1200) { _gPending = 0; const pg = GO_KEYS[e.key.toLowerCase()]; if (pg) { e.preventDefault(); go(`#/${pg}`); } return; }
  if (e.key === 'g') { _gPending = Date.now(); return; }
  if (e.key === 'n') { e.preventDefault(); return txnModal(); }
  if (e.key === 'i') { e.preventDefault(); return startImport(); }
  if (e.key === '/') { e.preventDefault(); if (route().page !== 'transactions') go('#/transactions'); setTimeout(() => $('#tx-search')?.focus(), 50); return; }
  if (e.key === '?') { e.preventDefault(); return showShortcuts(); }
  if (e.key === 'P' && e.shiftKey) { e.preventDefault(); return ACTIONS.privacy(); }
});

/* ---------- lock screen at startup ---------- */
function lockScreen(payload) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'lock-screen';
    wrap.innerHTML = `<form class="lock-card" id="lock-form">
      <div class="brand big">${BRAND_MARK}</div>
      <p class="brand-tag">${ORO_MEANING} · ${ORO_TAGLINE}</p>
      <p>Your data is encrypted. Enter your passphrase to open it.</p>
      <label class="field"><span>Passphrase</span><input type="password" id="lock-pass" autocomplete="current-password" autofocus></label>
      <p class="notice bad small" id="lock-err" hidden>That passphrase didn’t work.</p>
      <button class="btn primary" type="submit">Unlock</button>
      <details><summary>Forgot it?</summary><p class="muted small">There’s no way to recover a forgotten passphrase. If you have an unencrypted backup you can open it after starting over.</p><button class="btn ghost danger-text" type="button" id="lock-reset">Erase this browser’s copy and start over</button></details>
    </form>`;
    document.body.appendChild(wrap);
    document.body.classList.add('locked');
    setTimeout(() => $('#lock-pass')?.focus(), 30);
    $('#lock-form').onsubmit = async e => {
      e.preventDefault();
      const pass = $('#lock-pass').value;
      const btn = wrap.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Unlocking…';
      try {
        const o = await Vault.open(payload, pass);
        Store.key = o.key; Store.salt = o.salt; Store.pass = pass;
        state = migrate(unwrap(o.data));
        wrap.remove(); document.body.classList.remove('locked'); resolve();
      } catch (err) { $('#lock-err').hidden = false; btn.disabled = false; btn.textContent = 'Unlock'; }
    };
    $('#lock-reset').onclick = async () => {
      if (!confirm('Erase the encrypted copy in this browser? Your Ọrọ̀ folder (if any) is not touched.')) return;
      try { await IDB.del('state'); await IDB.del('sync'); } catch (e) { /* ignore */ }
      try { localStorage.removeItem('keel.state'); } catch (e) { /* ignore */ }
      state = defaultState(); wrap.remove(); document.body.classList.remove('locked'); resolve();
    };
  });
}

async function boot() {
  buildShell();
  const payload = await loadFromBrowser();
  if (payload && payload.encrypted) await lockScreen(payload);
  else state = migrate(unwrap(payload) || defaultState());
  if (await syncFromDiskIfNewer()) invalidate();
  if (isCompanion()) await syncLoad();
  applyTheme();
  resetHistory();
  window.addEventListener('hashchange', () => { if ($('#present')) endMoneyDate(); render(); });
  render();
  if (!payload || (state.version || 0) < 2 || (hasFolder() && !state.meta.saveNo)) persist();   // first numbered save
  armAutoLock();
  syncWatch();
  registerOffline();
}
document.addEventListener('DOMContentLoaded', boot);
