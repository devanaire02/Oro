/* ================= actions + events + boot ================= */
const ACTIONS = {
  'import': () => startImport(),
  'add-txn': () => txnModal(),
  'add-account': el => acctModal(null, el?.dataset.type),
  'add-holding': el => holdingModal(null, el?.dataset.acct),
  'add-recurring': () => recModal(),
  'add-cat': () => catModal(),
  'add-rule': () => ruleModal(),
  'print': () => window.print(),
  'run-rules': () => {
    let n = 0;
    for (const t of state.transactions) if (!t.categoryId) { const r = matchRule(t.rawPayee || t.payee); if (r) { t.categoryId = r.categoryId; if (r.rename) t.payee = r.rename; n++; } else { const b = builtinCategory(t.rawPayee || t.payee, t.amount); if (b) { t.categoryId = b; n++; } } }
    commit(); toast(n ? `Categorized ${n} transaction${n > 1 ? 's' : ''}.` : 'No uncategorized transactions matched a rule.');
  },
  'load-sample': async () => {
    if (state.accounts.length && !await confirmBox('Load sample data', 'This replaces everything in Keel with a fictional household. Download a backup first if you want to keep your current data.', 'Replace with sample data', true)) return;
    state = buildSampleState(); UI.nwRange = '12';
    commit({ silent: true }); go('#/overview');
    toast('Sample data loaded. Explore, then erase it from Data and settings when you’re ready to start.');
  },
  'erase': () => {
    openModal({ title: 'Erase everything', body: `<p>This deletes every account, transaction, holding and setting in this browser${Store.handle && Store.perm === 'granted' ? ` and empties ${esc(Store.fileName)}` : ''}. It can’t be undone.</p><label class="field"><span>Type ERASE to confirm</span><input id="erase-confirm" autocomplete="off"></label>`,
      actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="erase-go">Erase everything</button>` });
    $('#erase-go').onclick = () => {
      if ($('#erase-confirm').value.trim().toUpperCase() !== 'ERASE') return toast('Type ERASE to confirm.');
      state = defaultState(); closeModal(); commit({ silent: true }); go('#/overview'); toast('Everything was erased.');
    };
  },
  'save-balances': () => {
    let n = 0;
    $$('[data-bal]').forEach(inp => {
      const a = acctById(inp.dataset.bal), v = parseAmount(inp.value);
      if (!a || !isFinite(v)) return;
      a.balance = round2(isLiability(a) ? Math.abs(v) : v); a.balanceDate = today(); n++;
    });
    commit({ silent: true }); go('#/accounts'); toast(`Saved ${n} balance${n === 1 ? '' : 's'} as of today.`);
  },
  'budget-avg': async () => {
    const mk = route().params.m || thisMonth();
    if (!await confirmBox('Fill budgets from averages', `Set each monthly category’s budget to its average over the three months before ${monthLabel(mk)}, rounded to the nearest $10? Yearly categories aren’t changed.`, 'Fill budgets')) return;
    let n = 0;
    for (const c of state.categories) {
      if (c.kind === 'transfer' || c.period === 'year') continue;
      const avg = trailingAvg(c.id, mk, 3);
      if (avg > 0) { c.budget = Math.round(avg / 10) * 10; n++; }
    }
    commit(); toast(`Updated ${n} budget${n === 1 ? '' : 's'}.`);
  },
  'bulk-cat': () => {
    const ids = $$('.tx-cb:checked').map(c => c.value), cat = $('#bulk-cat').value || null;
    state.transactions.forEach(t => { if (ids.includes(t.id)) t.categoryId = cat; });
    commit(); toast(`Updated ${ids.length} transaction${ids.length === 1 ? '' : 's'}.`);
  },
  'bulk-del': async () => {
    const ids = $$('.tx-cb:checked').map(c => c.value);
    if (!await confirmBox('Delete transactions', `Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}?`, 'Delete', true)) return;
    state.transactions = state.transactions.filter(t => !ids.includes(t.id)); commit();
  },
  'connect-file': async () => {
    try { await connectNewFile(); render(); toast(`Keel will now save every change to ${Store.fileName}.`); }
    catch (e) { if (e.name !== 'AbortError') toast('Couldn’t save to that file: ' + e.message); }
  },
  'reconnect': async () => { const ok = await reconnectFile(); render(); toast(ok ? `Saving to ${Store.fileName} again.` : 'Keel still doesn’t have permission to write to the file.'); },
  'disconnect-file': async () => { await disconnectFile(); render(); toast('Stopped saving to the file. Your data is still saved in this browser.'); },
  'open-file': async () => {
    const ask = () => promptPass('Unlock data file', 'This file is encrypted. Enter its passphrase.');
    const load = async (text, handle) => {
      let next;
      try { next = await readDataFile(text, ask); } catch (e) { if (e.message !== 'cancelled') toast(e.message); return; }
      if (state.accounts.length && !await confirmBox('Open data file', 'Replace what’s in Keel now with the contents of this file?', 'Open file', true)) return;
      state = next;
      if (handle) {
        Store.handle = handle; Store.fileName = handle.name;
        try { Store.perm = await handle.requestPermission({ mode: 'readwrite' }); } catch (e) { Store.perm = 'prompt'; }
        try { await IDB.set('fileHandle', handle); } catch (e) { /* not persisted */ }
      }
      applyTheme(); await persistNow(); go('#/overview'); toast('Data file opened.');
    };
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: [{ description: 'Keel data file', accept: { 'application/json': ['.json'] } }] });
        await load(await (await h.getFile()).text(), h);
      } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
    } else {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => inp.files[0] && load(await readFileAsText(inp.files[0]));
      inp.click();
    }
  },
  'backup': async () => { downloadFile(`keel-backup-${today()}.json`, JSON.stringify(await serialize())); toast(Store.key ? 'Encrypted backup downloaded.' : 'Backup downloaded. It isn’t encrypted; add a passphrase if you’ll store it somewhere shared.'); },
  'export-csv': () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Account', 'Payee', 'Category', 'Group', 'Amount', 'Memo'].join(',')];
    for (const t of state.transactions) { const c = catById(t.categoryId); lines.push([t.date, q(acctById(t.accountId)?.name), q(t.payee), q(c?.name || 'Uncategorized'), q(c?.group || ''), t.amount.toFixed(2), q(t.memo)].join(',')); }
    downloadFile(`keel-transactions-${today()}.csv`, lines.join('\n'), 'text/csv');
  },
  'set-pass': async () => { const p = await promptPass('Add a passphrase', 'Keel will encrypt your data with this passphrase. You’ll need it every time you open Keel or your data file.', { confirm: true, ok: 'Encrypt my data' }); if (p) { await setPassphrase(p); render(); toast('Your data is now encrypted.'); } },
  'change-pass': async () => { const p = await promptPass('Change passphrase', 'Choose a new passphrase.', { confirm: true, ok: 'Change passphrase' }); if (p) { await setPassphrase(p); render(); toast('Passphrase changed.'); } },
  'remove-pass': async () => { if (await confirmBox('Remove passphrase', 'Your data will be stored without encryption in this browser and in your data file.', 'Remove passphrase', true)) { await setPassphrase(null); render(); toast('Passphrase removed.'); } },
};

function applyTheme() {
  const t = state.settings?.theme || 'auto';
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}

function updateBulk() {
  const n = $$('.tx-cb:checked').length, b = $('#bulk');
  if (!b) return;
  b.hidden = !n; $('#bulk-count').textContent = `${n} selected`;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-close],[data-imp],[data-act],[data-month],[data-nwrange],[data-edit-txn],[data-edit-acct],[data-history],[data-edit-holding],[data-edit-rec],[data-edit-cat],[data-edit-rule],[data-add-rep],[data-more],[data-review-done],#save-status,#menu-btn');
  if (!el) return;
  const d = el.dataset;
  if ('close' in d) return closeModal();
  if (d.imp) return importAction(d.imp);
  if (d.act) { e.preventDefault(); return ACTIONS[d.act]?.(el); }
  if (d.month) return setParam(d.param || 'm', d.month === thisMonth() ? '' : d.month);
  if (d.nwrange) { UI.nwRange = d.nwrange; return render(); }
  if (d.editTxn) return txnModal(d.editTxn);
  if (d.editAcct) return acctModal(d.editAcct);
  if (d.history) return historyModal(d.history);
  if (d.editHolding) return holdingModal(d.editHolding);
  if (d.editRec) return recModal(d.editRec);
  if (d.editCat) return catModal(d.editCat);
  if (d.editRule) return ruleModal(d.editRule);
  if (d.addRep) { const r = detectRepeating()[+d.addRep]; if (r) recModal(null, { name: r.payee, amount: -r.monthly, freq: 'monthly', nextDate: nextOccurrence(r.lastDate, 'monthly'), categoryId: r.categoryId }); return; }
  if (d.more) return setParam('limit', d.more);
  if (d.reviewDone) {
    const mk = d.reviewDone; state.reviews[mk] = state.reviews[mk] || {};
    if (d.undo) delete state.reviews[mk].completedAt; else state.reviews[mk].completedAt = today();
    commit(); if (!d.undo) toast(`${monthLabel(mk)} marked as reviewed.`);
    return;
  }
  if (el.id === 'save-status' && d.action === 'reconnect') return ACTIONS.reconnect();
  if (el.id === 'menu-btn') { document.body.classList.toggle('nav-open'); return; }
});
document.addEventListener('click', e => { if (e.target.closest('.nav a')) document.body.classList.remove('nav-open'); });

document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (d.filter && el.tagName === 'SELECT') return setParam(d.filter, el.value === thisMonth() && d.filter === 'm' && route().page !== 'review' ? '' : el.value);
  if (d.txcat) {
    const t = state.transactions.find(x => x.id === d.txcat); if (!t) return;
    t.categoryId = el.value || null;
    el.closest('tr')?.classList.toggle('needs', !t.categoryId);
    commit({ silent: true });
    offerRule(t, t.categoryId);
    return;
  }
  if (d.budget) { const c = catById(d.budget), v = parseAmount(el.value || '0'); if (c && isFinite(v)) { c.budget = round2(Math.max(0, v)); commit({ silent: true }); setTimeout(render, 0); } return; }
  if (d.target) { const v = parseFloat(el.value); if (el.value.trim() === '' || !isFinite(v)) delete state.settings.targets[d.target]; else state.settings.targets[d.target] = clamp(v, 0, 100); commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.setting) {
    const k = d.setting; let v = el.value;
    if (k !== 'theme') { v = parseAmount(v); if (!isFinite(v)) return; }
    state.settings[k] = v; applyTheme(); commit({ silent: true }); setTimeout(render, 0); return;
  }
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal')) { closeModal(); return; }
  if (e.key === 'Enter' && (e.target.matches('.budget-input') || e.target.matches('[data-setting]'))) e.target.blur();
});

/* ---------- lock screen ---------- */
function lockScreen(payload) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'lock-screen';
    wrap.innerHTML = `<form class="lock-card" id="lock-form">
      <div class="brand big">Keel</div>
      <p>Your data is encrypted. Enter your passphrase to open it.</p>
      <label class="field"><span>Passphrase</span><input type="password" id="lock-pass" autocomplete="current-password" autofocus></label>
      <p class="notice bad small" id="lock-err" hidden>That passphrase didn’t work.</p>
      <button class="btn primary" type="submit">Unlock</button>
      <details><summary>Forgot it?</summary><p class="muted small">There’s no way to recover a forgotten passphrase. If you have an unencrypted backup you can open it after starting over.</p><button class="btn ghost danger-text" type="button" id="lock-reset">Erase this browser’s copy and start over</button></details>
    </form>`;
    document.body.appendChild(wrap);
    setTimeout(() => $('#lock-pass')?.focus(), 30);
    $('#lock-form').onsubmit = async e => {
      e.preventDefault();
      const pass = $('#lock-pass').value;
      const btn = wrap.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Unlocking…';
      try {
        const o = await Vault.open(payload, pass);
        Store.key = o.key; Store.salt = o.salt; Store.pass = pass;
        state = migrate(unwrap(o.data));
        wrap.remove(); resolve();
      } catch (err) { $('#lock-err').hidden = false; btn.disabled = false; btn.textContent = 'Unlock'; }
    };
    $('#lock-reset').onclick = async () => {
      if (!confirm('Erase the encrypted copy in this browser? Your data file (if any) is not touched.')) return;
      try { await IDB.del('state'); } catch (e) { /* ignore */ }
      try { localStorage.removeItem('keel.state'); } catch (e) { /* ignore */ }
      state = defaultState(); wrap.remove(); resolve();
    };
  });
}

/* ---------- shell ---------- */
function buildShell() {
  $('#nav').innerHTML = PAGES.map(([id, label]) => `<a href="#/${id}" data-page="${id}">${label}</a>`).join('');
}

async function boot() {
  buildShell();
  const payload = await loadFromBrowser();
  if (payload && payload.encrypted) await lockScreen(payload);
  else state = migrate(unwrap(payload) || defaultState());
  await syncFromFileIfNewer();
  applyTheme();
  window.addEventListener('hashchange', render);
  render();
  if (!payload) persist();
}
document.addEventListener('DOMContentLoaded', boot);
