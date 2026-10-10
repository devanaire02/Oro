/* ================= a new category from a category menu =================
   "New category…" at the bottom of the category menus on Transactions (each row's, and the one in the bar for ticked
   rows) opens a small window over the list: name it, pick its group (or start a new one), and the transaction is filed
   under it at once, with the usual offer of a rule for others like it. The list behind stays where it was. In the
   transaction window the same choice opens the fields right there. Budget and the rest are set later on Budget. */
const NEWCAT = '__newcat';
const newCatOption = () => `<option value="${NEWCAT}">New category…</option>`;
const catGroups = () => [...new Set(state.categories.map(x => x.group))];

/* A sensible starting group: the one the transaction's category (or Ọrọ̀'s guess for it) is in */
function newCatDefaults(ts) {
  const t = ts[0];
  let grp = '';
  if (t) {
    const cur = catById(t.categoryId);
    const guess = cur ? null : autoCategory(t.rawPayee || t.payee, t.amount, { mcc: t.mcc }, categoryHistory());
    grp = (cur || catById(guess?.id))?.group || '';
  }
  const kind = ts.length && ts.every(x => x.amount > 0) ? 'income' : 'expense';
  return { group: grp, kind: groupKind(grp) || kind };
}
function groupKind(g) { const kinds = [...new Set(state.categories.filter(x => x.group === g).map(x => x.kind))]; return kinds.length === 1 ? kinds[0] : ''; }
function newCatFields(def = {}) {
  const groups = catGroups();
  return `<label class="field wide"><span>Category name</span><input data-key="ncName" name="nc-name" autocomplete="off" autocapitalize="words" placeholder="e.g. Kids’ sports" autofocus></label>
    <label class="field"><span>Group</span><select data-key="ncGroup" name="nc-group" class="nc-group">${def.group ? '' : '<option value="" selected disabled>Choose a group</option>'}${groups.map(g => `<option ${g === def.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}<option value="__new">New group…</option></select></label>
    <label class="field nc-group-new" hidden><span>New group name</span><input data-key="ncGroupNew" name="nc-group-new" autocomplete="off" autocapitalize="words" placeholder="e.g. Kids"></label>
    <label class="field"><span>Kind</span><select data-key="ncKind" name="nc-kind" class="nc-kind"><option value="expense" ${def.kind !== 'income' && def.kind !== 'transfer' ? 'selected' : ''}>Spending</option><option value="income" ${def.kind === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${def.kind === 'transfer' ? 'selected' : ''}>Transfer (left out of spending)</option></select></label>`;
}
/* Picking a group shows the new-group box, or sets the kind to that group's */
function wireNewCatFields(root) {
  const g = root.querySelector('.nc-group'); if (!g) return;
  g.onchange = () => {
    const isNew = g.value === '__new', box = root.querySelector('.nc-group-new');
    box.hidden = !isNew;
    if (isNew) { box.querySelector('input').focus(); return; }
    const k = groupKind(g.value); if (k) root.querySelector('.nc-kind').value = k;
  };
}
/* The fields' values → the category to use: a new one, or one you already have by that name. { cat, made } or { error } */
function newCatFrom(d) {
  const name = String(d.ncName || '').trim().replace(/\s+/g, ' ');
  const group = (d.ncGroup === '__new' ? d.ncGroupNew : d.ncGroup || '').trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Give the category a name.' };
  const have = state.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (have) return { cat: have, made: false };
  if (!group) return { error: 'Choose a group, or make a new one.' };
  const cat = { id: uid(), name: name.slice(0, 60), group: group.slice(0, 40), kind: ['income', 'transfer'].includes(d.ncKind) ? d.ncKind : 'expense', budget: 0, period: 'month' };
  state.categories.push(cat);
  return { cat, made: true };
}
/* A category added while the list stays on screen: put it in every category menu on the page */
function addCatOptionEverywhere(c) {
  for (const sel of $$('#main select.cat-select, #bulk-cat')) {
    if (sel.querySelector(`option[value="${CSS.escape(c.id)}"]`)) continue;
    let grp = [...sel.querySelectorAll('optgroup')].find(o => o.label === c.group);
    if (!grp) { grp = document.createElement('optgroup'); grp.label = c.group; sel.insertBefore(grp, sel.querySelector(`option[value="${NEWCAT}"]`)); }
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; grp.appendChild(o);
  }
}

/* From a row's menu (ids = [that one]) or the bar for ticked rows (bulk) */
function newCatModal({ ids, bulk = false }) {
  const ts = ids.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  if (!ts.length) return;
  const one = ts.length === 1 ? ts[0] : null;
  const def = newCatDefaults(ts);
  openModal({
    title: 'New category',
    body: `<p class="muted small nc-for">${one ? `For <strong>${esc(one.payee || '(no description)')}</strong> · ${money(one.amount)} · ${dateLabel(one.date)}` : `For the ${ts.length} ticked transactions`}</p>
      <form id="nc" class="form-grid">${newCatFields(def)}<button type="submit" hidden></button></form>
      <p class="muted small">Its budget and other settings are on the Budget page.</p>`,
    actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="nc-save">${one ? 'Add and file it' : `Add and file ${ts.length}`}</button>`,
  });
  const f = $('#nc');
  wireNewCatFields(f);
  const save = () => {
    const r = newCatFrom(formData(f));
    if (r.error) { toast(r.error); return (r.error.includes('name') ? f.querySelector('[name=nc-name]') : f.querySelector('[name=nc-group]'))?.focus(); }
    const c = r.cat, fresh = ts.map(t => state.transactions.find(x => x.id === t.id)).filter(Boolean);
    let unflagged = 0;
    for (const t of fresh) { t.categoryId = c.id; delete t.splits; if (t.flag) { delete t.flag; unflagged++; } }
    closeModal(true);
    const what = `${r.made ? `Added “${c.name}” (${c.group}) and filed` : `You already have “${c.name}”, so filed`} ${one ? 'it' : `${fresh.length} transactions`} there${unflagged ? `; ${unflagged === 1 ? 'flag' : 'flags'} cleared` : ''}.`;
    if (bulk || !one) { commit(); toast(what, { label: 'Undo', fn: undo }); return; }
    // one row: change it in place so the list doesn't move
    commit({ silent: true });
    addCatOptionEverywhere(c);
    const row = $(`#main tr[data-id="${CSS.escape(one.id)}"]`);
    const sel = row?.querySelector('select.cat-select');
    if (sel) sel.value = c.id;
    const pill = row?.querySelector('.cat-pill-text'); if (pill) pill.textContent = c.name;
    row?.classList.remove('needs');
    if (unflagged) { const fb = row?.querySelector('.flag-btn'); if (fb) { fb.classList.remove('on'); fb.setAttribute('aria-pressed', 'false'); } }
    toast(what, { label: 'Undo', fn: undo });
    if (unflagged && route().params.flag) setTimeout(render, 700);   // in the flagged list, a sorted-out one drops off
    offerRule(fresh[0], c.id);
  };
  $('#nc-save').onclick = save;
  f.onsubmit = e => { e.preventDefault(); save(); };
}
