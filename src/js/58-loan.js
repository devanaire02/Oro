/* ---------- mortgage or loan: payments since the statement, schedule ahead, what-if ---------- */
function loanModal(id) {
  const a = acctById(id); if (!a || !LOAN_TYPES.has(a.type)) return;
  const am = a.amort || {}, L = loanTrack(a), pi = L.pi;
  const sm = n => money(n, { cents: false });
  const prop = state.accounts.find(x => x.type === 'realestate' && x.mortgageId === a.id);
  const cands = loanPaymentCandidates(a);
  const lastPay = L.applied.length ? L.last : (a.balanceDate || today());
  const startM = addMonths(monthKey(lastPay), 1);
  const proj = loanProjection(a, L.balance, startM);
  const orig = loanOriginalNow(a);
  const prinSince = round2(sum(L.applied.map(p => p.principal))), intSince = round2(sum(L.applied.map(p => p.interest)));
  const yrsLeft = m => { const y = Math.floor(m / 12), r = m % 12; return [y && `${y} year${y === 1 ? '' : 's'}`, r && `${r} month${r === 1 ? '' : 's'}`].filter(Boolean).join(' ') || '0 months'; };
  const n = L.applied.length;
  const my = mk => `${MON[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`;   // Sep 2045

  const status = !L.tracked
    ? `Ọrọ̀ isn’t following payments for this loan yet, so it shows what you last entered: ${sm(L.anchor)} on ${dateLabel(L.from, true)}. Turn it on below and the balance comes down as payments show up in your bank imports.`
    : n ? `Starting from your statement balance of <strong>${sm(L.anchor)}</strong> on ${dateLabel(L.from, true)}, ${n} payment${n === 1 ? '' : 's'} since paid <strong>${money(prinSince)}</strong> of principal and ${money(intSince)} of interest.`
    : `Following payments that match “${esc(am.match)}”. None has come in since your statement balance of ${sm(L.anchor)} on ${dateLabel(L.from, true)}.`;

  const kpis = `<dl class="kpis loan-kpis">
      <div><dt>Owed now</dt><dd>${sm(L.balance)}</dd><span class="muted small">${L.tracked && n ? 'Estimated from payments' : `As of ${dateLabel(L.from, true)}`}</span></div>
      <div><dt>Monthly payment</dt><dd>${pi ? sm(pi + L.escrow) : '—'}</dd><span class="muted small">${pi ? `${money(pi)} principal and interest${L.escrow ? ` + ${money(L.escrow)} escrow` : ''}` : 'Add it below'}</span></div>
      <div><dt>Paid off</dt><dd>${proj && !proj.never ? my(proj.payoff) : '—'}</dd><span class="muted small">${proj && !proj.never ? `${yrsLeft(proj.months)} left` : proj?.never ? 'Payment doesn’t cover interest' : 'Needs rate and payment'}</span></div>
      <div><dt>Interest left</dt><dd>${proj && !proj.never ? sm(proj.interest) : '—'}</dd><span class="muted small">${a.rate ? `At ${a.rate}%` : 'Add the rate below'}</span></div>
    </dl>`;

  const origLine = orig ? (() => {
    const diff = round2(orig.owed - L.balance);
    return `<p class="small">On the original schedule (${orig.paymentsMade} payments so far, paid off ${monthLabel(orig.payoff)}), you’d owe ${sm(orig.owed)} now. ${Math.abs(diff) < 50 ? 'You’re right on schedule.' : diff > 0 ? `You’re <strong>${sm(diff)} ahead</strong>.` : `You’re ${sm(-diff)} behind it.`}</p>`;
  })() : '';

  const paysTable = n ? `<h3>Payments since your statement</h3>
    <div class="scroll-table"><table class="ledger compact loan-pays"><thead><tr><th>Date</th><th class="num">Paid</th><th class="num">Interest</th><th class="num hide-sm">Escrow</th><th class="num">Principal</th><th class="num">Owed after</th></tr></thead><tbody>
    ${L.applied.slice().reverse().slice(0, 36).map(p => `<tr><td class="nowrap">${dateLabel(p.date)}</td><td class="num">${money(p.amount)}</td><td class="num">${money(p.interest)}</td><td class="num hide-sm">${p.escrow ? money(p.escrow) : '—'}</td><td class="num">${money(p.principal)}${p.extra > 0.5 ? `<br><span class="muted small">${money(p.extra)} extra</span>` : ''}</td><td class="num">${sm(p.balance)}</td></tr>`).join('')}
    </tbody></table></div>` : '';

  let sched = '';
  if (proj && !proj.never) {
    const years = [];
    for (const r of proj.rows) {
      const y = r.m.slice(0, 4); let g = years[years.length - 1];
      if (!g || g.y !== y) years.push(g = { y, n: 0, interest: 0, principal: 0, balance: 0 });
      g.n++; g.interest += r.interest; g.principal += r.principal; g.balance = r.balance;
    }
    const pts = proj.rows.filter((r, i) => i === proj.rows.length - 1 || r.m.endsWith('-12')).map(r => ({ x: r.m, y: r.balance }));
    pts.unshift({ x: addMonths(startM, -1), y: L.balance });
    sched = `<h3>The road to payoff</h3>
      ${chartHost({ h: 170, label: 'Loan balance by year', series: [{ points: pts, color: 'var(--ink-accent)', area: true }], xFmt: x => x.slice(0, 4), tip: i => `<strong>${monthLabel(pts[i].x)}</strong><br>${sm(pts[i].y)} owed` })}
      <details class="loan-next"><summary>Next 12 payments</summary>
        <div class="scroll-table"><table class="ledger compact"><thead><tr><th>Month</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Owed after</th></tr></thead><tbody>
        ${proj.rows.slice(0, 12).map(r => `<tr><td>${my(r.m)}</td><td class="num">${money(r.interest)}</td><td class="num">${money(r.principal)}</td><td class="num">${sm(r.balance)}</td></tr>`).join('')}
        </tbody></table></div></details>
      <details class="loan-years"><summary>Every year until it’s paid off</summary>
        <div class="scroll-table"><table class="ledger compact"><thead><tr><th>Year</th><th class="num hide-sm">Payments</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Owed at year end</th></tr></thead><tbody>
        ${years.map(g => `<tr><td>${g.y}</td><td class="num hide-sm">${g.n}</td><td class="num">${sm(g.interest)}</td><td class="num">${sm(g.principal)}</td><td class="num">${sm(g.balance)}</td></tr>`).join('')}
        </tbody></table></div></details>
      <div class="loan-whatif"><label class="field inline"><span>Pay extra each month</span><input id="loan-extra" inputmode="decimal" placeholder="e.g. 250"></label><p class="small" id="loan-whatif-out"></p></div>`;
  }

  const lastCand = cands.find(c => c.payee === am.match) || cands[0];
  const escrowHint = pi && lastCand && lastCand.amount > pi + 1 && !am.escrow
    ? `<small class="muted">Your last payment to ${esc(lastCand.payee)} was ${money(lastCand.amount)}, ${money(lastCand.amount - pi)} more than principal and interest. If that difference is escrow, enter it here so it isn’t counted as extra principal.</small>` : '';
  const setup = `<details class="loan-setup" ${L.tracked ? '' : 'open'}><summary>Payment tracking and loan terms</summary>
    <form id="loan-f" class="form-grid">
      <label class="check wide"><input type="checkbox" name="loan-track" data-key="track" ${am.track ? 'checked' : ''}> Lower the balance as payments come in from my bank</label>
      <label class="field wide"><span>Payments look like</span><input name="loan-match" data-key="match" id="loan-match" value="${esc(am.match || '')}" placeholder="Text in the payee, e.g. Lakeshore Mtg" autocomplete="off"><small class="muted" id="loan-count"></small></label>
      ${cands.length ? `<div class="wide loan-cands">${cands.map(c => `<button type="button" class="btn small ghost" data-fill="${esc(c.payee)}">${esc(c.payee)} · ${money(c.amount, { cents: false })} · ${c.n}×</button>`).join('')}</div>` : ''}
      <label class="field"><span>Interest rate (%)</span><input name="loan-rate" data-key="rate" inputmode="decimal" value="${a.rate ?? ''}"></label>
      <label class="field"><span>Principal and interest per month</span><input name="loan-pi" data-key="pi" inputmode="decimal" value="${a.minPayment ?? ''}" placeholder="${loanPI({ ...a, minPayment: null }) || ''}"></label>
      <label class="field"><span>Escrow per month (taxes, insurance)</span><input name="loan-escrow" data-key="escrow" inputmode="decimal" value="${am.escrow ?? ''}" placeholder="0">${escrowHint}</label>
      <p class="muted small wide">Optional, for comparing against the original schedule:</p>
      <label class="field"><span>Original amount</span><input name="loan-original" data-key="original" inputmode="decimal" value="${am.original ?? ''}"></label>
      <label class="field"><span>First payment</span><input type="date" name="loan-first" data-key="firstPayment" value="${am.firstPayment || ''}"></label>
      <label class="field"><span>Term (years)</span><input name="loan-term" data-key="termYears" inputmode="numeric" value="${am.termYears ?? ''}" placeholder="30"></label>
    </form></details>`;

  openModal({
    title: a.name, wide: true,
    body: `${prop ? `<p class="muted small">Mortgage on ${esc(prop.name)}${a.institution ? ` · ${esc(a.institution)}` : ''}</p>` : a.institution ? `<p class="muted small">${esc(a.institution)}</p>` : ''}
      ${kpis}<p>${status}</p>${origLine}
      <p class="muted small">If a statement shows a different balance, use <strong>Enter a statement balance</strong>. Payments after that date are counted from there.</p>
      ${paysTable}${sched}${setup}`,
    actions: `<button class="btn ghost left" id="loan-stmt">Enter a statement balance</button><button class="btn ghost" data-close>Close</button><button class="btn primary" id="loan-save">Save</button>`,
  });
  drawCharts($('#modal'));

  const matchEl = $('#loan-match'), countEl = $('#loan-count');
  const showCount = () => {
    const v = matchEl.value.trim();
    if (!v) { countEl.textContent = ''; return; }
    const all = state.transactions.filter(t => loanMatches(a, t, v)), since = all.filter(t => t.date > (a.balanceDate || ''));
    countEl.textContent = all.length ? `Matches ${all.length} payment${all.length === 1 ? '' : 's'}, ${since.length} since your statement on ${dateLabel(a.balanceDate, true)}.` : 'No payments match this yet.';
  };
  matchEl.oninput = showCount; showCount();
  $$('#modal [data-fill]').forEach(b => b.onclick = () => { matchEl.value = b.dataset.fill; $('#loan-f [data-key=track]').checked = true; showCount(); });

  const ex = $('#loan-extra'), out = $('#loan-whatif-out');
  if (ex) ex.oninput = () => {
    const x = parseAmount(ex.value || '');
    if (!isFinite(x) || x <= 0) { out.textContent = ''; return; }
    const q = loanProjection(a, L.balance, startM, x);
    if (!q || q.never) { out.textContent = ''; return; }
    const sooner = proj.months - q.months;
    out.innerHTML = `Paid off ${monthLabel(q.payoff)}, <strong>${yrsLeft(sooner)} sooner</strong>, saving <strong>${sm(proj.interest - q.interest)}</strong> in interest.`;
  };

  $('#loan-stmt').onclick = () => acctModal(a.id);
  $('#loan-save').onclick = () => {
    const d = formData($('#loan-f'));
    const num = v => { const x = parseAmount(String(v || '')); return isFinite(x) && x ? round2(Math.abs(x)) : null; };
    if (d.track && !d.match.trim()) return toast('Choose or type what the payments look like, so Ọrọ̀ can find them.');
    const rate = parseFloat(d.rate);
    a.rate = isFinite(rate) ? rate : null;
    a.minPayment = num(d.pi);
    a.amort = { track: !!d.track, match: d.match.trim(), escrow: num(d.escrow), original: num(d.original), firstPayment: d.firstPayment || null, termYears: parseFloat(d.termYears) || null };
    commit({ silent: true }); render();
    loanModal(a.id);
    toast(a.amort.track ? `Following payments to ${a.name}. ${loanTrack(a).applied.length} found since your statement.` : `Saved ${a.name}.`);
  };
}
