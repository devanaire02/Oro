/* ================= Taxes: What if…, Pay stubs, and the likely tax bill or refund (the screens) =================
   The working-out is in 29-paystubs.js. These are the panels on the Taxes page, the pay stub window (typed, or filled
   from a PDF read on this device), the window for picking the deposit a stub landed as, and the small lines other
   screens borrow (the transaction window, Import, the CPA export). */

/* An amount that shows cents where there's room and whole dollars on a narrow screen */
const mFit = (n, o = {}) => `<span class="m-full">${money(n, o)}</span><span class="m-short">${money(n, { ...o, cents: false })}</span>`;
const stubOpenSet = () => (UI.stubOpen ||= new Set());
const stubPeopleWith = year => taxEarners().filter(m => stubYear(m.id, year));

/* ---------- What if… ---------- */
function whatIfPanel(year) {
  const R = whatIf(year), P = R.plan, W = R.W || {}, sm = n => money(n, { cents: false });
  const head = `<header class="panel-head"><h2>What if…</h2><span class="muted small">${year} · try a change before you make it</span></header>`;
  if (!P.P.H.entered) return `<section class="panel whatif">${head}<p class="muted">Type each person’s pay above, or add a pay stub below. Then try a change here: more in the 401(k), an HSA, a bonus, more tax taken out.</p></section>`;
  const box = (who, f, label, plan, help = '') => `<label class="field"><span>${label}</span><input data-wi="${who}:${f}" data-year="${year}" inputmode="decimal" value="${who === 'h' ? W[f] ?? '' : W.people?.[who]?.[f] ?? ''}" placeholder="${f === 'kids' ? plan : sm(plan)}">${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  const lumped = id => P.P.H.typed?.[id]?.health != null && P.P.H.typed?.[id]?.hsa == null && !P.P.H.stubs?.[id]?.health && P.people[id].health > 0;
  const people = P.P.earners.map(e => { const p = P.people[e.id]; return `<fieldset class="wi-person"><legend>${esc(e.name)}</legend><div class="form-grid four">
      ${box(e.id, 'gross', 'Pay for the year', p.gross)}
      ${box(e.id, 'bonus', 'A bonus', 0, 'On top of that pay')}
      ${box(e.id, 'retire', '401(k), 403(b) or 457', p.retire)}
      ${box(e.id, 'hsa', 'HSA', p.hsa)}
      ${box(e.id, 'health', 'Other before-tax', p.health, lumped(e.id) ? 'FSA and premiums. Your plan has all of health through pay here' : 'FSA and health premiums')}
      ${box(e.id, 'fedWh', 'Federal tax taken out', p.fedWh, 'Income tax, for the year')}
      ${box(e.id, 'stateWh', 'Illinois taken out', p.stateWh, 'For the year')}
    </div></fieldset>`; }).join('');
  const house = `<div class="form-grid three">
      ${box('h', 'other', 'Other income', P.house.other)}
      <label class="field"><span>Filing</span><select data-wi="h:status" data-year="${year}"><option value="">${esc(FILING[P.house.status])} (your plan)</option>${Object.entries(FILING).filter(([k]) => k !== P.house.status).map(([k, l]) => `<option value="${k}" ${W.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${box('h', 'kids', 'Children under 17', P.house.kids)}
      ${box('h', 'charity', 'Gifts to charity', P.house.charity)}
      ${box('h', 'propertyTax', 'Property tax', P.house.propertyTax)}
      ${box('h', 'interest', 'Mortgage interest', P.house.interest)}
    </div>`;
  const refund = r => (Math.abs(r) < 0.005 ? 'Even' : `<span class="nowrap">${mFit(Math.abs(r))}</span> ${r > 0 ? 'refund' : 'owed'}`);
  const cell = (row, v) => (row.rate ? pct(v, 1) : row.key === 'refund' ? refund(v) : mFit(v));
  const diff = row => {
    if (!R.changed || Math.abs(row.diff) < (row.rate ? 0.00005 : 0.005)) return '<span class="muted">—</span>';
    if (row.rate) return `${row.diff > 0 ? '+' : '−'}${Math.abs(row.diff * 100).toFixed(1)} pts`;
    return mFit(row.diff, { sign: true });
  };
  const better = { income: 1, pretax: 0, taxable: 0, federal: -1, state: -1, fica: -1, taxes: -1, withheld: 0, refund: 0, kept: 1, keptSaved: 1, average: -1, top: -1 };
  const tone = row => { const b = better[row.key]; return !R.changed || !b || Math.abs(row.diff) < 0.005 ? '' : row.diff * b > 0 ? 'pos' : 'neg'; };
  const cls = { taxes: 'subtotal', refund: 'net', kept: 'net' };
  const table = `<table class="ledger compact sched whatif-table"><thead><tr><th scope="col">For ${year}</th><th class="num" scope="col">Your plan</th><th class="num" scope="col">What if</th><th class="num" scope="col">Difference</th></tr></thead><tbody>
      ${R.rows.map(r => `<tr class="${cls[r.key] || ''}" data-wi-row="${r.key}"><th scope="row">${r.label}${r.key === 'withheld' ? ' <span class="muted small">income tax</span>' : ''}</th><td class="num${r.key === 'refund' ? ' wraps' : ''}">${cell(r, r.plan)}</td><td class="num${r.key === 'refund' ? ' wraps' : ''}">${cell(r, r.what)}</td><td class="num ${tone(r)}">${diff(r)}</td></tr>`).join('')}
    </tbody></table>`;
  const any = !!state.tax?.whatif?.[year];
  return `<section class="panel whatif">${head}
    <p class="muted small">Each box shows what your plan uses now (what you typed above, or your pay stubs where a box is blank). Type a different number to see what changes. A blank box keeps the plan.</p>
    ${people}${house}${table}
    ${R.says.length ? `<ul class="plain whatif-says">${R.says.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '<p class="muted small whatif-says">Nothing changed yet: both columns are your plan.</p>'}
    ${whatIfActualNote(year)}
    <div class="actions"><button class="btn primary" data-act="whatif-plan" data-year="${year}" ${R.changed ? '' : 'disabled'}>Make this my plan</button><button class="btn ghost" data-act="whatif-clear" data-year="${year}" ${any ? '' : 'disabled'}>Clear</button></div>
  </section>`;
}
/* With actual taxes typed, What if… still works from the estimate (an actual figure wouldn't move) */
function whatIfActualNote(year) {
  const a = taxHousehold(year).actual;
  return Object.values(a).some(v => v != null) ? '<p class="muted small">You’ve typed actual taxes for this year. What if… works from Ọrọ̀’s estimate, so both columns here are estimates.</p>' : '';
}

/* ---------- Pay stubs ---------- */
/* The stepped picture: pay before tax, each thing taken out stepping down from it, and what's left */
function stubSteps(s) {
  const p = stubPath(s), g = p.gross > 0 ? p.gross : 1, pc = v => `${(clamp(v / g, 0, 1) * 100).toFixed(2)}%`;
  const row = (label, amount, left, width, cls) => `<div class="stub-step ${cls}"><span class="stub-step-label">${label}</span><span class="stub-step-bar"><i style="left:${pc(left)};width:${pc(width)}"></i></span><span class="num">${money(amount)}</span></div>`;
  return `<div class="stub-steps" role="img" aria-label="From ${money(p.gross)} before tax to ${money(p.net)} take-home">
    ${row('Pay before tax', p.gross, 0, p.gross, 'pay')}
    ${p.pre ? row('Saved or paid before tax', -p.pre, p.afterPre, p.pre, 'pre') : ''}
    ${row('Taxes taken out', -p.tax, p.afterTax, p.tax, 'tax')}
    ${p.post ? row('Other things taken out', -p.post, p.expected, p.post, 'post') : ''}
    ${row('Take-home pay', p.net, 0, p.net, 'net')}</div>`;
}
/* The same path as a table, row by row, with year to date beside it when the stub has it */
function stubTable(s) {
  const p = stubPath(s), ytd = s.grossYtd != null || [...s.pre, ...s.tax, ...s.post].some(r => r.ytd != null);
  const y = v => (ytd ? `<td class="num muted">${v == null ? '' : money(v)}</td>` : '');
  const rows = (list, kinds) => list.map(r => `<tr><td class="indent">${esc(r.label || kinds[r.kind])}</td><td class="num">${money(-r.cur)}</td>${y(r.ytd)}</tr>`).join('');
  const sub = (label, v) => `<tr class="subtotal"><th scope="row">${label}</th><td class="num">${money(v)}</td>${y(null)}</tr>`;
  return `<table class="ledger compact sched stub-table"><thead><tr><th scope="col">${esc(stubName(s))}</th><th class="num" scope="col">This paycheck</th>${ytd ? '<th class="num" scope="col">Year to date</th>' : ''}</tr></thead><tbody>
    <tr class="income-line"><th scope="row">Pay before tax</th><td class="num">${money(p.gross)}</td>${y(s.grossYtd)}</tr>
    ${s.pre.length ? rows(s.pre, STUB_PRE) + sub('After what’s saved or paid before tax', p.afterPre) : ''}
    ${rows(s.tax, STUB_TAX)}${sub('After taxes', p.afterTax)}
    ${s.post.length ? rows(s.post, STUB_POST) : ''}
    <tr class="net"><th scope="row">Take-home pay</th><td class="num total double">${money(p.net)}</td>${y(s.netYtd)}</tr>
    ${s.er.length ? s.er.map(r => `<tr class="stub-er"><td class="indent muted">Your employer put in: ${esc(r.label || STUB_ER[r.kind])}</td><td class="num muted">${money(r.cur)}</td>${y(r.ytd)}</tr>`).join('') : ''}
  </tbody></table>`;
}
/* "Landed in Everyday checking on Nov 20: $4,850.00" with the amount opening that transaction, or "Not in your transactions yet" */
function stubLanded(s) {
  const d = stubDeposits(s);
  if (!d.txs.length) return `<p class="stub-landed none"><span>Not in your transactions yet</span> <button class="btn small" data-stub-pick="${esc(s.id)}">Pick it…</button></p>`;
  const parts = d.txs.map(t => `${esc(acctById(t.accountId)?.name || 'an account')} on ${dateLabel(t.date)}: <button class="linklike link num" data-edit-txn="${esc(t.id)}">${money(t.amount)}</button>`).join(' and ');
  const short = Math.abs(d.short) > 0.004 ? ` <span class="neg">${money(Math.abs(d.short))} ${d.short > 0 ? 'short of' : 'more than'} the take-home</span>` : '';
  return `<p class="stub-landed"><span>Landed in ${parts}${short}</span> <button class="linklike link small" data-stub-pick="${esc(s.id)}">${d.how === 'picked' ? 'Picked by hand. Change…' : 'Not this one? Pick it…'}</button></p>`;
}
function stubCard(s) {
  const p = stubPath(s), d = stubDeposits(s), open = stubOpenSet().has(s.id);
  const land = d.txs.length ? `${esc(acctById(d.txs[0].accountId)?.name || 'an account')}${d.txs.length > 1 ? ` and ${d.txs.length - 1} more` : ''}` : 'Not in your transactions yet';
  return `<details class="stub" data-stub="${esc(s.id)}" ${open ? 'open' : ''}><summary>
      <span class="stub-when">${dateLabel(s.date)}</span>
      <span class="stub-emp">${esc(s.employer || 'Pay stub')}${s.bonus ? ' <span class="tag soft">bonus or one-time</span>' : ''}${p.ok ? '' : ' <span class="tag warn">doesn’t add up</span>'}</span>
      <span class="stub-nums"><span class="num">${money(p.gross)}</span> <span class="muted">before tax</span> → <span class="num">${money(p.net)}</span> <span class="muted">take-home</span></span>
      <span class="stub-land muted small ${d.txs.length ? '' : 'none'}">${land}</span>
    </summary>
    <div class="stub-body">${stubSteps(s)}${stubTable(s)}
      ${p.ok ? '' : `<p class="stub-adds bad">Off by ${money(Math.abs(p.off))}: check the rows.</p>`}
      ${stubLanded(s)}
      <div class="actions"><button class="btn small" data-stub-edit="${esc(s.id)}">Edit</button>${s.deposit ? `<span class="muted small">Deposit account ${esc(s.deposit)}</span>` : ''}</div>
    </div></details>`;
}
/* Where the year stands: so far and projected, for one person or the household */
function stubYearTable(Y, title, year) {
  const S = Y.sofar, P = Y.projected, any = k => Math.abs(S[k]) > 0.004 || Math.abs(P[k]) > 0.004;
  const line = (label, k, cls = '', neg = false) => `<tr class="${cls}" data-line="${k}"><${cls === 'detail' ? 'td class="indent"' : 'th scope="row"'}>${label}</${cls === 'detail' ? 'td' : 'th'}><td class="num">${mFit(neg ? -S[k] : S[k])}</td><td class="num">${mFit(neg ? -P[k] : P[k])}</td></tr>`;
  const part = (label, b, kinds, names) => {
    const ks = Object.keys(kinds).filter(k => any(`${b}.${k}`)); if (!ks.length) return '';
    return `<tr class="subtotal" data-line="${b}"><th scope="row">${label}</th><td class="num">${mFit(-linesPart(S, b))}</td><td class="num">${mFit(-linesPart(P, b))}</td></tr>` + ks.map(k => line(names[k] || kinds[k], `${b}.${k}`, 'detail', true)).join('');
  };
  const er = round2(S['er.retire'] + S['er.hsa'] + S['er.other']), erP = round2(P['er.retire'] + P['er.hsa'] + P['er.other']);
  return `<table class="ledger compact sched stub-year"><thead><tr><th scope="col">${title}</th><th class="num" scope="col">So far</th><th class="num" scope="col">Projected for ${year}</th></tr></thead><tbody>
    ${line('Earned (pay before tax)', 'gross', 'income-line')}
    ${part('Saved or paid before tax', 'pre', STUB_PRE, { premium: 'Health, dental and vision', other: 'Other before tax' })}
    ${part('Taxes taken out', 'tax', STUB_TAX, { other: 'Other taxes' })}
    ${part('Other things taken out', 'post', STUB_POST, { other: 'Other' })}
    ${line('Take-home pay', 'net', 'net')}
    ${er || erP ? `<tr class="stub-er" data-line="er"><td class="muted">Your employer put in</td><td class="num muted">${mFit(er)}</td><td class="num muted">${mFit(erP)}</td></tr>` : ''}
  </tbody></table>`;
}
/* In words: whose latest stub, how often they're paid, how many paychecks are left, which limits were reached */
function stubYearNotes(Y, year) {
  const j = Y.main, sm = n => money(n, { cents: false }), out = [];
  const src = Y.summed ? `from ${Y.n} stub${Y.n === 1 ? '' : 's'} added up (their year-to-date boxes are blank)` : `from the latest stub’s year-to-date (${dateLabel(Y.latest.date)}${Y.latest.employer ? `, ${esc(Y.latest.employer)}` : ''})`;
  out.push(`So far: ${src}.`);
  if (Y.ask) out.push('<strong>How often are you paid?</strong> Choose it below and Ọrọ̀ projects the rest of the year.');
  else if (j?.regular && j.freq) out.push(`Paid ${FREQS[j.freq].toLowerCase()}${j.typedFreq ? '' : ' (worked out from the stubs)'}: ${Y.left} regular paycheck${Y.left === 1 ? '' : 's'} left through December 31, at the latest regular paycheck’s amounts.`);
  else if (!j?.regular) out.push('Only bonus or one-time stubs so far, so nothing more is projected.');
  if (Y.jobs.length > 1) out.push(`Counted as ${Y.jobs.length} employers (${Y.jobs.map(x => esc(x.employer || 'no name')).join(', ')}), each with its own year-to-date. If two are the same employer, give their stubs the same name.`);
  if (Y.capped.ss) out.push(`Social Security stops at ${sm(taxTables(year).T.ssBase)} of pay (${money(Y.ssMax)} of tax): the projection stops it there.`);
  if (Y.capped.retire) out.push(`The 401(k) limit for ${year} is ${sm(Y.limits.deferral)}${Y.age == null ? ' (under 50)' : ''}: the projection stops there.`);
  if (Y.capped.hsa) out.push(`The HSA limit for ${year} is ${sm(Y.limits.hsa)}: the projection stops there.`);
  return out;
}
function stubPersonBlock(m, year) {
  const Y = stubYear(m.id, year), info = payInfo(m.id);
  const add = `<button class="btn small" data-act="add-paystub" data-person="${esc(m.id)}" data-year="${year}">Add a pay stub for ${esc(m.name)}</button>`;
  if (!Y) return `<div class="stub-person" data-stub-person="${esc(m.id)}"><h3>${esc(m.name)}</h3><p class="muted small">No pay stubs for ${year} yet.</p><div class="actions">${add}</div></div>`;
  const list = stubsAll().filter(s => s.person === m.id && yearOf(s.date) === year).sort((a, b) => b.date.localeCompare(a.date)), first = list.slice(0, 3), rest = list.slice(3);
  const moreKey = `more:${m.id}:${year}`;
  const freqs = Y.jobs.filter(j => j.regular).map(j => `<label class="field"><span>How often ${Y.jobs.length > 1 && j.employer ? `${esc(j.employer)} pays` : 'you’re paid'}</span><select data-payinfo="${esc(m.id)}:freq:${esc(j.key)}">
      <option value="">${j.guess ? `${FREQS[j.guess]} (from the stubs)` : 'Choose…'}</option>${PAY_FREQS.map(f => `<option value="${f}" ${j.typedFreq === f ? 'selected' : ''}>${FREQS[f]}</option>`).join('')}</select></label>`).join('');
  return `<div class="stub-person" data-stub-person="${esc(m.id)}"><h3>${esc(m.name)}</h3>
    ${stubYearTable(Y, 'Where the year stands', year)}
    <ul class="plain stub-notes muted small">${stubYearNotes(Y, year).map(n => `<li>${n}</li>`).join('')}</ul>
    <div class="form-grid three stub-info">${freqs}
      <label class="field"><span>Born in</span><input data-payinfo="${esc(m.id)}:born" inputmode="numeric" maxlength="4" value="${info.born ?? ''}" placeholder="Year"><small class="muted">For the higher 401(k) limit at 50 and the HSA’s at 55</small></label>
      <label class="field"><span>HSA covers</span><select data-payinfo="${esc(m.id)}:hsa"><option value="family" ${info.hsa === 'self' ? '' : 'selected'}>Your family</option><option value="self" ${info.hsa === 'self' ? 'selected' : ''}>Just you</option></select></label>
    </div>
    <div class="stub-list">${first.map(stubCard).join('')}${rest.length ? `<details class="stub-more" data-stubs-more="${esc(moreKey)}" ${stubOpenSet().has(moreKey) ? 'open' : ''}><summary>${rest.length} earlier stub${rest.length === 1 ? '' : 's'}</summary>${rest.map(stubCard).join('')}</details>` : ''}</div>
    <div class="actions">${add}</div></div>`;
}
function payStubsPanel(year) {
  const earners = taxEarners(), H = stubHousehold(year);
  const head = `<header class="panel-head"><h2>Pay stubs</h2><span class="muted small">${year}${H.n ? ` · ${H.n} stub${H.n === 1 ? '' : 's'}` : ''}</span></header>`;
  if (!earners.length) return `<section class="panel paystubs">${head}<p class="muted">Add the adults in your household in Settings › Household to add their pay stubs.</p></section>`;
  if (!H.n) return `<section class="panel paystubs">${head}
    <p>Add a pay stub and Ọrọ̀ shows the path from pay before tax to the paycheck that landed, where the year stands, and the likely tax bill or refund. Type it in, or read it from a PDF: it’s read on this device and nothing is sent anywhere.</p>
    <div class="actions"><button class="btn primary" data-act="add-paystub" data-year="${year}">Add a pay stub</button></div></section>`;
  return `<section class="panel paystubs">${head}
    <p class="muted small">From pay before tax to the paycheck that landed, and where the year stands. The latest stub’s year-to-date is enough for the year; older stubs show each paycheck’s path.</p>
    ${earners.map(m => stubPersonBlock(m, year)).join('')}
    ${H.people.length > 1 ? `<div class="stub-person stub-household"><h3>Your household</h3>${stubYearTable(H, 'Where the year stands, together', year)}</div>` : ''}
  </section>`;
}

/* ---------- the likely tax bill or refund ---------- */
function taxDuePanel(year) {
  const D = taxDue(year), X = D.X, sm = n => money(n, { cents: false });
  const head = `<header class="panel-head"><h2>Likely tax bill or refund</h2><span class="muted small">${year} · the year’s tax against what’s taken out of pay</span></header>`;
  if (!X.H.entered) return `<section class="panel taxdue">${head}<p class="muted">Add a pay stub, or type each person’s pay at the top, and Ọrọ̀ sets the year’s income tax against what’s taken out of pay.</p></section>`;
  const word = d => (Math.abs(d) < 0.005 ? 'even' : d < 0 ? 'refund' : 'owed');
  const kpi = (label, d, note) => `<div data-due="${label.toLowerCase()}"><dt>${label}: ${word(d)}</dt><dd class="num ${d < -0.004 ? 'pos' : d > 0.004 ? 'neg' : ''}">${sm(Math.abs(d))}</dd><span class="muted small">${note}</span></div>`;
  const src = k => (X.actual[k] != null ? 'actual' : 'estimate');
  const box = (attr, v, ph, label, help = '') => `<label class="field"><span>${label}</span><input ${attr} data-year="${year}" inputmode="decimal" value="${v ?? ''}" placeholder="${ph}">${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  const stubs = X.H.stubs || {}, typed = X.H.typed || {};
  const people = X.earners.map(e => {
    const S = stubPlan(e.id, year), from = k => (stubs[e.id]?.[k] ? 'From your pay stubs' : S ? 'Typed here; your pay stubs say ' + sm(S[k]) : '');
    return `<fieldset class="wi-person"><legend>${esc(e.name)}</legend><div class="form-grid three">
      ${box(`data-taxp="${e.id}:fedWh"`, typed[e.id]?.fedWh, S ? sm(S.fedWh) : '0', 'Federal income tax taken out', from('fedWh') || 'For the whole year')}
      ${box(`data-taxp="${e.id}:stateWh"`, typed[e.id]?.stateWh, S ? sm(S.stateWh) : '0', 'Illinois taken out', from('stateWh') || 'For the whole year')}
      ${box(`data-taxp="${e.id}:hsa"`, typed[e.id]?.hsa, S ? sm(S.hsa) : '0', 'HSA part of health through pay', 'So Ọrọ̀ can show what the HSA saves')}
    </div></fieldset>`; }).join('');
  const kpis = D.withheldAny ? `<dl class="kpis three">
      ${kpi('Federal', D.federal.due, `${sm(D.federal.tax)} tax, ${sm(D.federal.withheld + D.federal.paid)} paid in`)}
      ${kpi('Illinois', D.state.due, `${sm(D.state.tax)} tax, ${sm(D.state.withheld + D.state.paid)} paid in`)}
      ${kpi('Together', D.all, Math.abs(D.all) < 0.005 ? 'Right on the nose' : D.all < 0 ? 'Coming back to you' : 'Still to pay with your returns')}
    </dl>` : `<p class="callout">Type what’s taken out of each person’s pay below (or add a pay stub) to see whether it’s a refund or a bill. The year’s income tax comes to ${sm(D.federal.tax)} federal and ${sm(D.state.tax)} Illinois.</p>`;
  const row = (label, a, b, cls = '') => `<tr class="${cls}"><th scope="row">${label}</th><td class="num">${a}</td><td class="num">${b}</td></tr>`;
  const due = d => (Math.abs(d) < 0.005 ? 'Even' : `<span class="nowrap">${mFit(Math.abs(d))}</span> ${d < 0 ? 'refund' : 'owed'}`);
  const says = [];
  if (D.saved > 0 && D.keeps > 0) says.push(`Saving ${sm(D.saved)} before tax in the 401(k) and HSA keeps ${sm(D.keeps)} out of taxes this year.`);
  if (D.room && D.room.retire + D.room.hsa > 0) {
    const parts = [D.room.retire > 0 ? `${sm(D.room.retire)} (401(k))` : '', D.room.hsa > 0 ? `${sm(D.room.hsa)} (HSA)` : ''].filter(Boolean).join(' and ');
    says.push(`Room left: you could still put in ${parts}; that would save about ${sm(D.room.saves)}.${D.room.people.some(p => !p.ageKnown) ? ' The limits are higher from age 50 (401(k)) and 55 (HSA): add a birth year under Pay stubs to count that.' : ''}`);
  }
  return `<section class="panel taxdue">${head}${kpis}
    <table class="ledger compact sched taxdue-table"><thead><tr><th scope="col">For ${year}</th><th class="num" scope="col">Federal</th><th class="num" scope="col">Illinois</th></tr></thead><tbody>
      ${row(`Income tax for the year <span class="tag soft">${src('federal') === src('state') ? src('federal') : 'see above'}</span>`, mFit(D.federal.tax), mFit(D.state.tax), 'income-line')}
      ${row('Taken out of pay', mFit(-D.federal.withheld), mFit(-D.state.withheld))}
      ${D.federal.paid || D.state.paid ? row('Other payments you sent in', mFit(-D.federal.paid), mFit(-D.state.paid)) : ''}
      ${row('Refund or owed', due(D.federal.due), due(D.state.due), 'net wraps')}
    </tbody></table>
    ${says.length ? `<ul class="plain taxdue-says">${says.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <h3>What’s taken out, and other payments</h3>
    <p class="muted small">A blank box uses your pay stubs, projected to the end of the year.</p>
    ${people}
    <div class="form-grid three">
      ${box('data-taxh="paidFed"', X.paid.federal || '', '0', 'Other federal payments you sent in', 'Estimated tax')}
      ${box('data-taxh="paidState"', X.paid.state || '', '0', 'Other Illinois payments you sent in', 'Estimated tax')}
    </div>
    <p class="muted small">An estimate to plan with, not a tax return: see what’s not counted under “How the federal estimate works” above.</p>
  </section>`;
}

/* ---------- the pay stub window ---------- */
function payStubModal(id, preset = {}) {
  const old = id ? stubById(id) : null, adults = taxEarners();
  if (!adults.length) return toast('Add the adults in your household in Settings › Household first.');
  const who = old?.person || (adults.some(m => m.id === preset.person) ? preset.person : adults.some(m => m.id === UI.lens) ? UI.lens : adults[0].id);
  const lastOf = p => stubsAll().filter(s => s.person === p && !s.bonus).sort((a, b) => b.date.localeCompare(a.date))[0];
  const blankRows = (list, f) => list.map(r => ({ kind: r.kind, label: r.label, cur: f ? r.cur : '', ytd: '' }));
  const start = p => { const last = lastOf(p); return {
    employer: last?.employer || '',
    pre: last ? blankRows(last.pre) : ['retire', 'hsa', 'fsa', 'premium'].map(kind => ({ kind, label: '', cur: '', ytd: '' })),
    tax: [...['federal', 'ss', 'medicare', 'state'].map(kind => ({ kind, label: '', cur: '', ytd: '' })), ...(last ? blankRows(last.tax.filter(r => r.kind === 'other')) : [])],
    post: last && last.post.length ? blankRows(last.post) : [{ kind: 'roth', label: '', cur: '', ytd: '' }],
    er: last && last.er.length ? blankRows(last.er) : [{ kind: 'retire', label: '', cur: '', ytd: '' }] }; };
  const M = old ? JSON.parse(JSON.stringify(old)) : { person: who, date: preset.date || '', from: '', to: '', bonus: false, gross: '', grossYtd: '', net: '', netYtd: '', ...start(who) };
  if (old) for (const kind of ['federal', 'ss', 'medicare', 'state']) if (!M.tax.some(r => r.kind === kind)) M.tax.push({ kind, label: '', cur: '', ytd: '' });
  if (old) M.tax.sort((a, b) => Object.keys(STUB_TAX).indexOf(a.kind) - Object.keys(STUB_TAX).indexOf(b.kind));
  let filled = new Set(), note = '';
  const v = x => (x == null ? '' : x);
  const mark = k => (filled.has(k) ? ' class="from-pdf"' : '');
  const rowHtml = (b, r, i) => {
    const kinds = STUB_BLOCKS[b], fixed = b === 'tax' && r.kind !== 'other', name = kinds[r.kind] || kinds.other;
    const as = r.label && r.label.toLowerCase() !== name.toLowerCase() ? `<small class="muted stub-as">On the stub: ${esc(r.label)}</small>` : '';
    return `<div class="stub-row" data-b="${b}" data-i="${i}"><span class="stub-what">${fixed ? `<span class="stub-fixed">${name}</span>` : `<select data-f="kind" aria-label="What it is">${Object.entries(kinds).filter(([k]) => b !== 'tax' || k === 'other').map(([k, l]) => `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${l}</option>`).join('')}</select>`}${as}</span>
      <input data-f="cur" inputmode="decimal" value="${esc(v(r.cur))}" placeholder="This paycheck" aria-label="${esc(name)}, this paycheck"${mark(`${b}.${i}.cur`)}>
      <input data-f="ytd" inputmode="decimal" value="${esc(v(r.ytd))}" placeholder="Year to date" aria-label="${esc(name)}, year to date"${mark(`${b}.${i}.ytd`)}>
      ${fixed ? '<span></span>' : `<button type="button" class="icon-btn" data-row-del aria-label="Remove this row">×</button>`}</div>`;
  };
  const one = (f, label) => `<div class="stub-row" data-one="${f}"><span class="stub-what"><span class="stub-fixed">${label}</span></span>
      <input id="ps-${f}" inputmode="decimal" value="${esc(v(M[f]))}" placeholder="This paycheck" aria-label="${label}, this paycheck"${mark(`${f}.cur`)}>
      <input id="ps-${f}-ytd" inputmode="decimal" value="${esc(v(M[`${f}Ytd`]))}" placeholder="Year to date" aria-label="${label}, year to date"${mark(`${f}.ytd`)}><span></span></div>`;
  const block = (b, title, help, addLabel) => `<div class="stub-block" data-block="${b}"><h3>${title}${help ? ` <span class="muted small">${help}</span>` : ''}</h3>
      ${M[b].map((r, i) => rowHtml(b, r, i)).join('')}<button type="button" class="btn small ghost" data-row-add="${b}">${addLabel}</button></div>`;
  const body = () => `<form id="ps" class="stub-form" autocomplete="off">
      <div class="stub-pdf"><label class="btn small">Read it from a PDF<input type="file" id="ps-pdf" accept="application/pdf,.pdf" hidden></label>
        <span class="muted small" id="ps-pdf-note">${note || 'Read on this device with Ọrọ̀’s own reader. Nothing is sent anywhere, and only the numbers are kept.'}</span></div>
      <div class="form-grid three">
        <label class="field"><span>Whose</span><select id="ps-person">${adults.map(m => `<option value="${m.id}" ${m.id === M.person ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Employer</span><input id="ps-employer" value="${esc(M.employer || '')}" placeholder="Optional"${mark('employer')}></label>
        <label class="field"><span>Pay date</span><input type="date" id="ps-date" value="${esc(M.date || '')}"${mark('date')}></label>
        <label class="field"><span>Pay period from</span><input type="date" id="ps-from" value="${esc(M.from || '')}"${mark('from')}></label>
        <label class="field"><span>to</span><input type="date" id="ps-to" value="${esc(M.to || '')}"${mark('to')}></label>
        <div class="field"><span class="field-label">Kind of paycheck</span><span class="stub-kind"><label class="check"><input type="radio" name="ps-kind" value="" ${M.bonus ? '' : 'checked'}> Regular paycheck</label><label class="check"><input type="radio" name="ps-kind" value="1" ${M.bonus ? 'checked' : ''}> Bonus or one-time</label></span></div>
      </div>
      <div class="stub-row stub-cols" aria-hidden="true"><span></span><span>This paycheck</span><span>Year to date</span><span></span></div>
      <div class="stub-block" data-block="gross"><h3>Pay before tax</h3>${one('gross', 'Pay before tax')}</div>
      ${block('pre', 'Saved or paid before tax', '', 'Add a row')}
      ${block('tax', 'Taxes taken out', '', 'Add another tax')}
      ${block('post', 'Other things taken out', 'after tax', 'Add a row')}
      <div class="stub-block" data-block="net"><h3>Take-home pay</h3>${one('net', 'Take-home pay')}</div>
      <p class="stub-adds" id="ps-adds" role="status"></p>
      ${block('er', 'Your employer put in', 'optional; not part of your pay', 'Add a row')}
      ${filled.size ? '<p class="muted small"><span class="from-pdf-key"></span> Filled from the PDF. Check each against the stub before saving.</p>' : '<p class="muted small">Year-to-date boxes are optional, but with them one stub is enough for the whole year.</p>'}
    </form>`;
  openModal({ title: old ? 'Edit pay stub' : 'Add a pay stub', wide: true, id: 'paystub', body: body(),
    actions: `${old ? '<button class="btn ghost danger-text left" id="ps-del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ps-save">${old ? 'Save' : 'Add pay stub'}</button>` });
  const root = () => $('#modal .modal[data-id="paystub"] .modal-body');
  const read = () => {   // what's in the boxes → M
    const f = $('#ps'); if (!f) return;
    Object.assign(M, { person: $('#ps-person').value, employer: $('#ps-employer').value, date: $('#ps-date').value, from: $('#ps-from').value, to: $('#ps-to').value, bonus: !!f.querySelector('[name=ps-kind]:checked')?.value,
      gross: $('#ps-gross').value, grossYtd: $('#ps-gross-ytd').value, net: $('#ps-net').value, netYtd: $('#ps-net-ytd').value });
    for (const el of f.querySelectorAll('.stub-row[data-b]')) {
      const r = M[el.dataset.b][+el.dataset.i]; if (!r) continue;
      const k = el.querySelector('[data-f=kind]'); if (k && k.value !== r.kind) { r.kind = k.value; r.label = ''; }
      r.cur = el.querySelector('[data-f=cur]').value; r.ytd = el.querySelector('[data-f=ytd]').value;
    }
  };
  const adds = () => {
    const el = $('#ps-adds'); if (!el) return;
    const a = stubAddsUp(stubTidy(M));
    el.textContent = a.text; el.title = a.detail || '';
    el.className = `stub-adds ${a.ok == null ? '' : a.ok && a.ytdOk !== false ? 'ok' : 'bad'}`;
  };
  const paint = () => { const b = root(); if (!b) return; const y = b.scrollTop; b.innerHTML = body(); b.scrollTop = y; wire(); adds(); };
  const fromPdf = async file => {
    const say = t => { note = t; const n = $('#ps-pdf-note'); if (n) n.textContent = t; };
    say('Reading the PDF…');
    let R;
    try { R = parsePayStub(await pdfToLines(await readFileAsBuffer(file))); }
    catch (e) { return say('Ọrọ̀ couldn’t open that PDF. Type the numbers from the stub into the boxes.'); }
    read(); stubFill(M, R, filled = new Set());
    note = R.noText ? 'This PDF has no text Ọrọ̀ can read: it looks like a scan or a photo. Type the numbers from the stub into the boxes.'
      : R.found < 3 || (R.gross.cur == null && R.net.cur == null) ? 'Ọrọ̀ couldn’t find pay stub numbers in that PDF. Type them into the boxes.'
        : `Filled ${filled.size} box${filled.size === 1 ? '' : 'es'} from the PDF. Check them against the stub, then save. Only the numbers and row names are kept.`;
    paint();
  };
  const wire = () => {
    const f = $('#ps'); if (!f) return;
    f.oninput = () => { read(); adds(); };
    f.onchange = e => {
      if (e.target.id === 'ps-pdf') { const file = e.target.files[0]; if (file) fromPdf(file); return; }
      if (e.target.id === 'ps-person' && !old && !filled.size) {   // that person's usual rows and employer, unless rows are already typed
        read();
        if (['pre', 'tax', 'post', 'er'].every(b => M[b].every(r => r.cur === '' && r.ytd === ''))) { const typedEmp = M.employer, st = start(M.person); Object.assign(M, st, st.employer ? {} : { employer: typedEmp }); return paint(); }
      }
      read(); adds();
    };
    f.onclick = e => {
      const add = e.target.closest('[data-row-add]'), del = e.target.closest('[data-row-del]');
      if (add) { read(); const b = add.dataset.rowAdd; M[b].push({ kind: b === 'tax' ? 'other' : Object.keys(STUB_BLOCKS[b]).pop(), label: '', cur: '', ytd: '' }); filled = new Set([...filled].filter(k => !k.startsWith(b + '.'))); paint(); root()?.querySelector(`.stub-row[data-b="${b}"][data-i="${M[b].length - 1}"] select, .stub-row[data-b="${b}"][data-i="${M[b].length - 1}"] input`)?.focus(); }
      if (del) { read(); const row = del.closest('.stub-row'); M[row.dataset.b].splice(+row.dataset.i, 1); filled = new Set([...filled].filter(k => !k.startsWith(row.dataset.b + '.'))); paint(); }
    };
    f.onsubmit = e => e.preventDefault();
  };
  wire(); adds();
  if (preset.parsed) { stubFill(M, preset.parsed, filled); note = `Filled ${filled.size} box${filled.size === 1 ? '' : 'es'} from the PDF. Check them against the stub, then save. Only the numbers and row names are kept.`; paint(); }
  $('#ps-save').onclick = () => {
    read();
    const s = stubTidy({ ...M, id: old?.id, added: old?.added, txIds: old?.txIds, src: filled.size ? 'pdf' : old?.src });
    if (!s.date) { toast('Add the pay date.'); return $('#ps-date')?.focus(); }
    if (!(s.gross > 0) && !(s.net > 0)) { toast('Type the pay before tax and the take-home pay.'); return $('#ps-gross')?.focus(); }
    if (old) state.paystubs[state.paystubs.findIndex(x => x.id === old.id)] = s; else state.paystubs.push(s);
    stubOpenSet().add(s.id);
    const a = stubAddsUp(s), y = yearOf(s.date);
    closeModal(true); commit();
    if (route().page === 'taxes' && +(route().params.y || new Date().getFullYear()) !== y) go(`#/taxes?y=${y}`);
    toast(`${old ? 'Pay stub saved' : 'Pay stub added'}${a.ok === false ? `. It’s off by ${money(Math.abs(a.off))}: check the rows when you can` : ''}.`, { label: 'Undo', fn: undo });
  };
  if (old) $('#ps-del').onclick = async () => {
    if (!await confirmBox('Delete pay stub', `Delete the pay stub “${esc(stubName(old))}”?`, 'Delete', true)) return;
    state.paystubs = state.paystubs.filter(x => x.id !== old.id); commit(); toast('Pay stub deleted.', { label: 'Undo', fn: undo });
  };
}
/* What the PDF gave → the window's boxes, remembering which ones were filled */
function stubFill(M, R, filled) {
  if (!R || R.noText) return;
  const set = (k, val, key) => { if (val != null && val !== '') { M[k] = val; filled.add(key); } };
  set('employer', R.employer, 'employer'); set('date', R.date, 'date'); set('from', R.from, 'from'); set('to', R.to, 'to');
  set('gross', R.gross.cur, 'gross.cur'); set('grossYtd', R.gross.ytd, 'gross.ytd'); set('net', R.net.cur, 'net.cur'); set('netYtd', R.net.ytd, 'net.ytd');
  if (R.deposit) M.deposit = R.deposit;
  const any = ['pre', 'tax', 'post', 'er'].some(b => R[b].length);
  if (!any) return;
  for (const b of ['pre', 'post', 'er']) M[b] = R[b].map(r => ({ ...r }));
  M.tax = [...['federal', 'ss', 'medicare', 'state'].map(kind => R.tax.find(r => r.kind === kind) || { kind, label: '', cur: null, ytd: null }), ...R.tax.filter(r => r.kind === 'other')].map(r => ({ ...r }));
  for (const b of ['pre', 'tax', 'post', 'er']) M[b].forEach((r, i) => { if (r.cur != null) filled.add(`${b}.${i}.cur`); if (r.ytd != null) filled.add(`${b}.${i}.ytd`); });
}

/* ---------- picking the deposit by hand ---------- */
function stubPickModal(id) {
  const s = stubById(id); if (!s) return;
  const ties = stubTies(), mine = new Set(stubDeposits(s).txs.map(t => t.id));
  const lo = addDays(s.date, -5), hi = addDays(s.date, 14);
  const list = state.transactions.filter(t => t.amount > 0 && ((t.date >= lo && t.date <= hi && (!ties.byTx[t.id] || ties.byTx[t.id] === s.id)) || mine.has(t.id)))
    .sort((a, b) => Math.abs(a.amount - s.net) - Math.abs(b.amount - s.net) || a.date.localeCompare(b.date)).slice(0, 40);
  openModal({ title: 'Which deposit was this paycheck?', id: 'stub-pick',
    body: `<p>${esc(stubName(s))}: take-home pay of <strong class="num">${money(s.net)}</strong>. Tick the deposit it landed as. If it was split between accounts, tick each part.</p>
      ${list.length ? `<div class="stub-pick">${list.map(t => `<label class="check stub-pick-row"><input type="checkbox" value="${esc(t.id)}" ${mine.has(t.id) ? 'checked' : ''}><span class="stub-pick-what">${dateLabel(t.date)} · ${esc(t.payee)}<small class="muted">${esc(acctById(t.accountId)?.name || '')}</small></span><span class="num">${money(t.amount)}</span></label>`).join('')}</div>
      <p class="stub-adds" id="pick-sum" role="status"></p>` : `<p class="muted">No money came into your accounts between ${dateLabel(lo)} and ${dateLabel(hi)}. Import that account’s transactions, then pick the deposit here.</p>`}`,
    actions: `<button class="btn ghost" data-close>Cancel</button>${list.length ? '<button class="btn primary" id="pick-save">Save</button>' : ''}` });
  if (!list.length) return;
  const picked = () => $$('#modal .stub-pick input:checked').map(i => i.value);
  const say = () => {
    const tot = round2(sum(picked().map(i => list.find(t => t.id === i).amount))), el = $('#pick-sum'), n = picked().length;
    el.textContent = !n ? 'Nothing ticked: this stub won’t be tied to a deposit.' : cents(tot) === cents(s.net) ? `${n === 1 ? 'That is' : 'Those add up to'} the take-home: ${money(tot)}.` : `${money(tot)} ticked: ${money(Math.abs(s.net - tot))} ${tot < s.net ? 'short of' : 'more than'} the take-home.`;
    el.className = `stub-adds ${!n ? '' : cents(tot) === cents(s.net) ? 'ok' : 'bad'}`;
  };
  $('#modal .stub-pick').onchange = say; say();
  $('#pick-save').onclick = () => {
    const ids = picked(), t = stubById(id);
    if (ids.length) t.txIds = ids; else delete t.txIds;
    closeModal(true); commit(); toast(ids.length ? 'Tied to that deposit.' : 'No longer tied to a deposit.', { label: 'Undo', fn: undo });
  };
}

/* ---------- lines other screens borrow ---------- */
/* The transaction window: "From Alex’s pay stub of Nov 20: $7,115.38 before tax" */
function stubLineForTxn(t) {
  const s = t ? stubForTxn(t.id) : null; if (!s) return '';
  return `<p class="muted small wide stub-from">From <button type="button" class="linklike link" data-stub-view="${esc(s.id)}">${esc(memberName(s.person))}’s pay stub of ${dateLabel(s.date)}</button>: ${money(s.gross)} before tax</p>`;
}
/* Open Taxes at a stub, unfolded */
function stubShow(id) {
  const s = stubById(id); if (!s) return;
  const y = yearOf(s.date), set = stubOpenSet();
  set.add(id); set.add(`more:${s.person}:${y}`);
  closeModal(true); go(`#/taxes?y=${y}`);
  setTimeout(() => document.querySelector(`details[data-stub="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }), 120);
}
/* Import: a pay stub PDF adds no transactions; offer to open it in Taxes › Pay stubs */
function renderPayStubOffer(box) {
  box.innerHTML = `<div class="notice stub-offer"><strong>This looks like a pay stub.</strong> Open it in Taxes › Pay stubs?</div>
    <p class="muted small">A pay stub doesn’t add transactions. Ọrọ̀ reads its numbers on this device, you check them, and nothing is sent anywhere.</p>`;
  setModalActions('<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-act="paystub-from-import">Open it in Pay stubs</button>');
}
/* Export for your CPA: the pay stubs, where the year stands, what was saved through pay, and the likely bill or refund */
function payStubExportLines(year) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, H = stubHousehold(year), out = [], f = n => (Number(n) || 0).toFixed(2);
  const names = { gross: 'Pay before tax', net: 'Take-home pay' };
  for (const [b, kinds] of Object.entries(STUB_BLOCKS)) for (const [k, l] of Object.entries(kinds)) names[`${b}.${k}`] = `${{ pre: 'Before tax', tax: 'Tax taken out', post: 'After tax', er: 'Employer put in' }[b]}: ${l}`;
  if (H.n) {
    out.push(`Pay stubs for ${year}: where the year stands`, 'Person,Line,So far,Projected for the year');
    for (const Y of H.people) for (const k of STUB_LINES) if (Y.sofar[k] || Y.projected[k]) out.push(`${q(memberName(Y.person))},${q(names[k])},${f(Y.sofar[k])},${f(Y.projected[k])}`);
    const sv = payrollSavingForYear(year), so = payrollSaving(`${year}-01-01`, `${year}-12-31`, { lens: false });
    out.push('', 'Saved through pay (not in Money in or Kept),On the stubs so far,Projected for the year',
      `"401(k), 403(b) or 457",${f(so.byKind.retire)},${f(sv.byKind.retire)}`, `Roth 401(k),${f(so.byKind.roth)},${f(sv.byKind.roth)}`, `HSA,${f(so.byKind.hsa)},${f(sv.byKind.hsa)}`, `Stock or savings plan,${f(so.byKind.other)},${f(sv.byKind.other)}`, `Employer put in,${f(so.employer)},${f(sv.employer)}`,
      '', 'Each pay stub', 'Person,Employer,Pay date,Kind,Pay before tax,Saved or paid before tax,Taxes taken out,Other things taken out,Take-home pay,Federal income tax,Social Security,Medicare,Illinois income tax,Landed as');
    for (const s of stubsAll().filter(x => yearOf(x.date) === year).sort((a, b) => a.date.localeCompare(b.date))) {
      const p = stubPath(s), L = stubLines(s);
      out.push([q(memberName(s.person)), q(s.employer), s.date, s.bonus ? 'Bonus or one-time' : 'Regular', f(p.gross), f(p.pre), f(p.tax), f(p.post), f(p.net), f(L['tax.federal']), f(L['tax.ss']), f(L['tax.medicare']), f(L['tax.state']), q(stubLandedText(s))].join(','));
    }
    out.push('');
  }
  const D = taxDue(year);
  if (D.X.H.entered && D.withheldAny) out.push('Likely tax bill or refund,Federal,Illinois', `Income tax for the year,${f(D.federal.tax)},${f(D.state.tax)}`, `Taken out of pay,${f(D.federal.withheld)},${f(D.state.withheld)}`, `Other payments sent in,${f(D.federal.paid)},${f(D.state.paid)}`, `Owed (a minus is a refund),${f(D.federal.due)},${f(D.state.due)}`, '');
  return out;
}

/* ---------- buttons and boxes ---------- */
ACTIONS['add-paystub'] = el => payStubModal(null, { person: el?.dataset.person });
ACTIONS['whatif-plan'] = el => { const n = whatIfMakePlan(+el.dataset.year); if (n) toast('Your plan now uses the what-if numbers.', { label: 'Undo', fn: undo }); };
ACTIONS['whatif-clear'] = el => { if (state.tax.whatif?.[+el.dataset.year]) { whatIfForget(+el.dataset.year); commit(); toast('What if… cleared.', { label: 'Undo', fn: undo }); } };
ACTIONS['paystub-from-import'] = () => {
  const lines = IMP?.stubLines, R = lines ? parsePayStub(lines) : null;
  closeModal(true); IMP = null;
  if (R?.date) go(`#/taxes?y=${yearOf(R.date)}`); else if (route().page !== 'taxes') go('#/taxes');
  payStubModal(null, { parsed: R });
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-stub-edit],[data-stub-pick],[data-stub-view]'); if (!el) return;
  const d = el.dataset;
  e.preventDefault();
  if (d.stubEdit) return payStubModal(d.stubEdit);
  if (d.stubPick) return stubPickModal(d.stubPick);
  if (d.stubView) return stubShow(d.stubView);
});
/* Which stubs are unfolded stays as it was when the page redraws */
document.addEventListener('toggle', e => {
  const d = e.target; if (!d.matches?.('details[data-stub], details[data-stubs-more]')) return;
  const k = d.dataset.stub || d.dataset.stubsMore, set = stubOpenSet();
  if (d.open) set.add(k); else set.delete(k);
}, true);
document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (d.wi) {   // a What if… box: kept with the year's data, so it syncs and survives a restart
    const year = +d.year, all = (state.tax.whatif = state.tax.whatif || {}), W = (all[year] = all[year] || {});
    const [who, f] = d.wi.split(':'), raw = el.value.trim(), n = parseAmount(raw);
    const val = f === 'status' ? (FILING[el.value] ? el.value : null) : raw === '' || !isFinite(n) ? null : f === 'kids' ? Math.max(0, Math.round(n)) : round2(Math.max(0, n));
    const box = who === 'h' ? W : ((W.people = W.people || {})[who] = W.people[who] || {});
    if (val == null) delete box[f]; else box[f] = val;
    for (const id of Object.keys(W.people || {})) if (!Object.keys(W.people[id]).length) delete W.people[id];
    if (W.people && !Object.keys(W.people).length) delete W.people;
    if (!Object.keys(W).length) delete all[year];
    if (!Object.keys(all).length) delete state.tax.whatif;
    commit({ silent: true }); setTimeout(render, 0); return;
  }
  if (d.payinfo) {   // how often someone is paid, their birth year, what their HSA covers
    const [id, f, ...rest] = d.payinfo.split(':'), job = rest.join(':'), all = (state.tax.payInfo = state.tax.payInfo || {}), info = (all[id] = all[id] || {});
    if (f === 'born') { const y = Math.round(parseAmount(el.value)); if (y > 1900 && y <= new Date().getFullYear()) info.born = y; else delete info.born; }
    else if (f === 'hsa') { if (el.value === 'self') info.hsa = 'self'; else delete info.hsa; }
    else if (f === 'freq' && !UNSAFE_KEYS.has(job)) { info.freq = info.freq || {}; if (PAY_FREQS.includes(el.value)) info.freq[job] = el.value; else delete info.freq[job]; if (!Object.keys(info.freq).length) delete info.freq; }
    if (!Object.keys(info).length) delete all[id];
    if (!Object.keys(all).length) delete state.tax.payInfo;
    if (isTouch() && el.tagName === 'SELECT') el.blur();
    commit({ silent: true }); setTimeout(render, 0);
  }
});
