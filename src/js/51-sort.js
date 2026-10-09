/* ---------- Sorting by column ----------
   Click a column heading to sort: the first click sorts the natural way (names A–Z, amounts largest first), the second
   reverses it, the third goes back to the page's own order. Sorting only changes the order shown, never the data, and the
   choice stays while you move around the app (it resets on restart or lock, like filters).
   A list table opts in with data-sort-id="…" (tables sharing an id, like one per account group, sort together); a heading
   opts out with data-nosort, or picks its first direction with data-sort-first="asc|desc"; a cell carries data-v when its
   text isn't its value (a date shown as "Oct 9", an amount typed in a box). Transactions sorts its whole list in the view
   instead, since it shows 250 at a time. */
UI.sorts = {};

/* ---- Transactions: the whole filtered list, before it's cut to 250 ---- */
const TX_SORT_KEYS = {
  date: { label: 'Date', first: 'asc' },   // newest first is the page's own order, so the first click shows oldest first
  payee: { label: 'Payee', first: 'asc' },
  cat: { label: 'Category', first: 'asc' },
  who: { label: 'Person', first: 'asc' },
  acct: { label: 'Account', first: 'asc' },
  amount: { label: 'Amount', first: 'asc' },   // biggest spending first
};
function txSortParse(s) {
  const [key, dir] = String(s || '').split('.');
  return TX_SORT_KEYS[key] && (dir === 'asc' || dir === 'desc') ? { key, dir } : null;
}
function txSortLabel(key, dir) {
  if (key === 'date') return dir === 'asc' ? 'Oldest first' : 'Newest first';
  if (key === 'amount') return dir === 'asc' ? 'Biggest spending first' : 'Biggest money in first';
  return `${TX_SORT_KEYS[key].label} ${dir === 'asc' ? 'A–Z' : 'Z–A'}`;
}
function txSorted(list, sort) {
  if (!sort) return list;
  const text = {
    payee: t => t.payee || '',
    cat: t => (isSplit(t) ? 'Split' : catName(t.categoryId)) || '',
    who: t => memberName(personOf(t)) || '',
    acct: t => acctById(t.accountId)?.name || '',
  }[sort.key];
  const sign = sort.dir === 'asc' ? 1 : -1;
  const idx = new Map(list.map((t, i) => [t, i]));
  const cmp = sort.key === 'date' ? (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    : sort.key === 'amount' ? (a, b) => a.amount - b.amount
    : (a, b) => text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
  // ties keep the page's own order (newest first)
  return [...list].sort((a, b) => sign * cmp(a, b) || idx.get(a) - idx.get(b));
}
/* Next sort after clicking a heading: natural → reversed → the page's own order (newest first) */
function txSortNext(cur, key) {
  const first = TX_SORT_KEYS[key].first, rev = first === 'asc' ? 'desc' : 'asc';
  if (key === 'date') return cur?.key === 'date' && cur.dir === 'asc' ? '' : 'date.asc';
  if (!cur || cur.key !== key) return `${key}.${first}`;
  return cur.dir === first ? `${key}.${rev}` : '';
}
function txSortHead(key, sort, cls = '') {
  const eff = sort || { key: 'date', dir: 'desc' };
  const on = eff.key === key;
  return `<th class="${cls}" ${on ? `aria-sort="${eff.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" class="th-sort" data-txsort="${key}" title="Sort by ${TX_SORT_KEYS[key].label.toLowerCase()}">${TX_SORT_KEYS[key].label}${on ? `<span class="sort-ind" aria-hidden="true">${eff.dir === 'asc' ? '↑' : '↓'}</span>` : ''}</button></th>`;
}
function txSortSelect(sort, multi) {
  const cur = sort ? `${sort.key}.${sort.dir}` : '';
  const opts = [['', 'Newest first'], ['date.asc', 'Oldest first'], ['amount.asc', txSortLabel('amount', 'asc')], ['amount.desc', txSortLabel('amount', 'desc')]];
  for (const k of ['payee', 'cat', 'acct', ...(multi ? ['who'] : [])]) for (const d of ['asc', 'desc']) opts.push([`${k}.${d}`, txSortLabel(k, d)]);
  return `<label class="field inline sort-field"><span>Sort</span><select data-filter="sort">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
}

/* ---- Every other list table: sorted in place on the page ---- */
function sortCellAt(row, col) {
  let c = 0;
  for (const cell of row.cells) { if (c === col) return cell; c += cell.colSpan || 1; if (c > col) return null; }
  return null;
}
function sortValue(cell, numeric) {
  if (!cell) return null;
  if ('v' in cell.dataset) {
    const raw = cell.dataset.v;
    if (raw === '') return null;
    return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw.toLowerCase();
  }
  const line = (cell.innerText || cell.textContent || '').trim().split('\n')[0].trim();
  if (!line || line === '—' || line === '–') return null;
  if (!numeric) return line.toLowerCase();
  const m = line.replace(/−/g, '-').replace(/\s/g, '').match(/^([+-]?)(\()?\$?([\d,]*\.?\d+)(%|[KkMm](?![a-z]))?/);
  if (!m) return null;
  let n = Number(m[3].replace(/,/g, ''));
  if (/k/i.test(m[4] || '')) n *= 1e3; else if (/m/i.test(m[4] || '')) n *= 1e6;
  return m[1] === '-' || m[2] ? -n : n;
}
function sortCompare(a, b) {   // blanks always last; numbers before words
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
  return typeof a === 'number' ? a - b : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
function applySort(table) {
  const s = UI.sorts[table.dataset.sortId], tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = [...tbody.rows];
  rows.forEach((r, i) => { if (r.dataset.ord == null) r.dataset.ord = i; });
  const fixed = rows.filter(r => [...r.cells].some(c => (c.colSpan || 1) > 1));   // notes and empty-state rows stay at the end
  const movable = rows.filter(r => !fixed.includes(r));
  const th = s ? table.querySelector(`thead [data-sort-col="${s.col}"]`) : null;
  const numeric = !!th?.closest('th')?.classList.contains('num');
  const vals = new Map(movable.map(r => [r, s ? sortValue(sortCellAt(r, s.col), numeric) : null]));
  movable.sort((a, b) => {
    if (s) {
      const va = vals.get(a), vb = vals.get(b);
      const blank = va == null || vb == null;
      const c = blank ? sortCompare(va, vb) : (s.dir === 'asc' ? 1 : -1) * sortCompare(va, vb);
      if (c) return c;
    }
    return a.dataset.ord - b.dataset.ord;
  });
  for (const r of [...movable, ...fixed]) tbody.appendChild(r);
  for (const b of table.querySelectorAll('thead .th-sort[data-sort-col]')) {
    const on = s && +b.dataset.sortCol === s.col, cell = b.closest('th');
    if (on) cell.setAttribute('aria-sort', s.dir === 'asc' ? 'ascending' : 'descending'); else cell.removeAttribute('aria-sort');
    b.querySelector('.sort-ind').textContent = on ? (s.dir === 'asc' ? '↑' : '↓') : '';
  }
}
function decorateSortable(root) {
  for (const table of root.querySelectorAll('table[data-sort-id]')) {
    const hr = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!hr) continue;
    let col = 0;
    for (const th of hr.cells) {
      if (!th.hasAttribute('data-nosort') && th.textContent.trim() && !th.querySelector('button, a, input, select')) {
        const label = th.textContent.trim();
        th.innerHTML = `<button type="button" class="th-sort" data-sort-col="${col}" title="Sort by ${esc(label.toLowerCase())}">${th.innerHTML}<span class="sort-ind" aria-hidden="true"></span></button>`;
      }
      col += th.colSpan || 1;
    }
    applySort(table);
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('.th-sort');
  if (!b) return;
  e.preventDefault();
  if (b.dataset.txsort) return setParam('sort', txSortNext(txSortParse(route().params.sort), b.dataset.txsort));
  const table = b.closest('table'), id = table?.dataset.sortId;
  if (!id) return;
  const col = +b.dataset.sortCol, th = b.closest('th'), cur = UI.sorts[id];
  const first = th.dataset.sortFirst || (th.classList.contains('num') ? 'desc' : 'asc');
  if (!cur || cur.col !== col) UI.sorts[id] = { col, dir: first };
  else if (cur.dir === first) UI.sorts[id] = { col, dir: first === 'asc' ? 'desc' : 'asc' };
  else delete UI.sorts[id];
  for (const t of $$(`table[data-sort-id="${CSS.escape(id)}"]`)) applySort(t);
});
