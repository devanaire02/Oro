/* ================= Balance sheet =================
   An eMoney-style net worth statement: every account in a column for its owner (you, your spouse, joint, a revocable
   trust) with a total, grouped the way an advisor would read it, assets then liabilities, then net worth. Out of estate
   is the same statement for what children, irrevocable trusts, charities and others own: tracked, but not yours.
   Detailed lists each account; Simple shows just the section totals. */
const BS_ASSETS = [
  ['Cash and equivalents', ['checking', 'savings']],
  ['Taxable investments', ['brokerage']],
  ['Retirement', ['retirement']],
  ['Education', ['education']],
  ['Health savings', ['hsa']],
  ['Cryptocurrency', ['crypto']],
  ['Real estate', ['realestate']],
  ['Private investments', ['private']],
  ['Other assets', ['vehicle', 'otherAsset']],
];
const BS_LIABILITIES = [
  ['Credit cards', ['credit']],
  ['Mortgages', ['mortgage']],
  ['Loans', ['loan']],
  ['Other liabilities', ['otherLiability']],
];
const BS_ROLE_ORDER = { adult: 0, revocable: 1, joint: 2, kid: 3, irrevocable: 4, charity: 5, other: 6 };
function bsOwners(list) {
  const ms = members();
  return ms.filter(m => list.some(a => (a.owner || 'joint') === m.id))
    .sort((a, b) => BS_ROLE_ORDER[roleOf(a.id)] - BS_ROLE_ORDER[roleOf(b.id)] || ms.indexOf(a) - ms.indexOf(b));
}
function bsTable(list, owners, { simple, totalLabel }) {
  const cols = owners.map(m => m.id), n = cols.length + 2;
  const val = a => accountValue(a);
  const cell = v => `<td class="num">${v ? money(v, { cents: false }) : '<span class="muted">—</span>'}</td>`;
  const sums = accts => { const by = Object.fromEntries(cols.map(c => [c, 0])); for (const a of accts) by[a.owner || 'joint'] += val(a); return by; };
  const rowCells = by => cols.map(c => cell(by[c])).join('') + `<td class="num bs-tot">${money(sum(Object.values(by)), { cents: false })}</td>`;
  let html = '';
  const section = (title, groups) => {
    const all = [];
    html += `<tr class="bs-sect"><th colspan="${n}">${title}</th></tr>`;
    for (const [label, types] of groups) {
      const accts = list.filter(a => types.includes(a.type)).sort((x, y) => val(y) - val(x));
      if (!accts.length) continue;
      all.push(...accts);
      if (!simple) for (const a of accts) {
        const by = Object.fromEntries(cols.map(c => [c, (a.owner || 'joint') === c ? val(a) : 0]));
        html += `<tr class="bs-acct"><th scope="row"><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button>${a.institution || a.last4 ? `<span class="muted small bs-inst">${esc([a.institution, a.last4 ? `…${a.last4}` : ''].filter(Boolean).join(' '))}</span>` : ''}</th>${rowCells(by)}</tr>`;
      }
      html += `<tr class="bs-sub ${simple ? 'flat' : ''}"><th scope="row">${simple ? label : `Total ${label.toLowerCase()}`}</th>${rowCells(sums(accts))}</tr>`;
    }
    return sums(all);
  };
  const A = section('Assets', BS_ASSETS);
  html += `<tr class="bs-total"><th scope="row">Total assets</th>${rowCells(A)}</tr>`;
  const L = list.some(isLiability) ? section('Liabilities', BS_LIABILITIES) : null;
  if (L) html += `<tr class="bs-total"><th scope="row">Total liabilities</th>${rowCells(L)}</tr>`;
  const NW = Object.fromEntries(cols.map(c => [c, A[c] - (L ? L[c] : 0)]));
  html += `<tr class="bs-nw"><th scope="row">${totalLabel}</th>${cols.map(c => `<td class="num">${money(NW[c], { cents: false })}</td>`).join('')}<td class="num bs-tot">${money(sum(Object.values(NW)), { cents: false })}</td></tr>`;
  return `${owners.length > 1 ? '<p class="muted small only-sm bs-swipe">Swipe the statement sideways to see each owner.</p>' : ''}<div class="scroll-table bs-wrap"><table class="ledger bs-table">
    <thead><tr><th scope="col"></th>${owners.map(m => `<th scope="col" class="num"><span class="person-dot" style="background:${memberColor(m.id)}"></span>${esc(m.name)}${roleOf(m.id) !== 'adult' && m.id !== 'joint' ? `<span class="muted small bs-role">${esc(OWNER_ROLES[roleOf(m.id)])}</span>` : ''}</th>`).join('')}<th scope="col" class="num">Total</th></tr></thead>
    <tbody>${html}</tbody></table></div>`;
}
VIEWS.balance = p => {
  const tab = p.t === 'out' ? 'out' : 'in', simple = UI.mode === 'simple';
  const all = activeAccounts(), inA = all.filter(acctInEstate), outA = all.filter(a => !acctInEstate(a));
  const t = totals(), assets = inA.filter(a => !isLiability(a)), owners = bsOwners(tab === 'in' ? inA : outA);
  const outTotal = sum(outA.map(signedValue));
  const head = pageHead('Balance sheet', `As of ${dateLabel(today(), true)}. ${tab === 'in' ? 'Who owns what, in your estate.' : 'What children, trusts, charities and others own. Tracked here, not counted in your net worth.'}`,
    `<button class="btn ghost" data-act="print">Print</button>`) + tabs('t', tab, [['in', 'Net worth'], ['out', 'Out of estate']]);
  if (!all.length) return head + emptyState('Nothing to show yet', 'Add accounts to see who owns what.', '<button class="btn primary" data-act="add-account">Add an account</button>');
  if (tab === 'in') {
    if (!inA.length) return head + emptyState('No accounts in your estate', 'Every account belongs to a child, trust or someone else. Check each account’s owner, and who’s who in Settings › Household.', '<a class="btn" href="#/data">Settings</a>');
    return head + `
    <dl class="kpis bs-kpis"><div><dt>Total assets</dt><dd class="num">${money(t.assets, { cents: false })}</dd></div><div><dt>Total liabilities</dt><dd class="num">${money(t.liabilities, { cents: false })}</dd></div><div><dt>Net worth</dt><dd class="num">${money(t.netWorth, { cents: false })}</dd></div>
      ${outA.length ? `<div><dt><a href="#/balance?t=out">Out of estate</a></dt><dd class="num muted">${money(outTotal, { cents: false })}</dd><span class="muted small">Not counted</span></div>` : ''}</dl>
    ${bsTable(inA, owners, { simple, totalLabel: 'Net worth' })}
    <p class="muted small bs-note">Each account sits in its owner’s column; change an owner in the account. ${simple ? 'Switch to Detailed to see every account.' : 'Switch to Simple for section totals only.'} ${people().length > 1 ? '' : 'Add your spouse and others in Settings › Household to split this by owner.'}</p>`;
  }
  if (!outA.length) return head + emptyState('Nothing out of your estate yet', 'Accounts owned by your children, an irrevocable trust, a charity or donor-advised fund, or someone else show here. Mark who’s who in Settings › Household, then set each account’s owner.', '<a class="btn" href="#/data">Settings › Household</a>');
  return head + `
  <dl class="kpis bs-kpis"><div><dt>Out of estate</dt><dd class="num">${money(outTotal, { cents: false })}</dd></div><div><dt>Your net worth</dt><dd class="num">${money(t.netWorth, { cents: false })}</dd></div><div><dt>Everything tracked</dt><dd class="num">${money(t.netWorth + outTotal, { cents: false })}</dd></div></dl>
  ${bsTable(outA, owners, { simple, totalLabel: 'Total out of estate' })}
  <p class="muted small bs-note">Owners outside your estate: children, irrevocable trusts, charities and donor-advised funds, and anyone else. Change who’s who in <a href="#/data">Settings › Household</a>.</p>`;
};
