/* ================= Updating accounts by talking =================
   "Chase savings is 12,400", "the home is worth 675k", "Alex's 401k is 312,000 and the Roth is 85k",
   "rename the Amex to Blue Cash", "change the owner of the brokerage to Julissa", "the mortgage rate is 6.125 percent",
   "Sam's card ends in 1234", "archive the SUV". Ọrọ̀ finds the account by its name (and type, owner, last 4), shows each
   change as old → new, asks which one when two accounts could match, and saves only after "yes". */
const UPD_VERB = /^(?:(?:can you|could you|please|let'?s|i want to|i need to)\s+)*(update|set|change|make|rename|archive|close|mark|correct|fix)\b/;
const UPD_STRIP = /^(?:(?:can you|could you|please|let'?s|i want to|i need to)\s+)*(update|set|change|correct|fix)\b/;
const UPD_FIELDS = { balance: 'Balance', value: 'Value', owner: 'Owner', name: 'Name', last4: 'Last 4', rate: 'Interest rate', minPayment: 'Monthly payment', rental: 'Rental', archived: 'Archive' };

/* Which accounts a stretch of words could mean, best first */
function updFindAccounts(seg) {
  const low = seg.toLowerCase(), toks = ciTokens(seg), type = tellFindType(low), who = ciFindPerson(seg);
  const l4 = (seg.match(/\b(\d{4})\b/g) || []);
  return activeAccounts().map(a => {
    const name = ciTokens(a.name);
    const hit = name.filter(n => toks.some(w => tokSame(w, n))).length;
    let s = name.length ? 2 * hit / name.length : 0;
    if (a.institution && ciTokens(a.institution).length && ciTokens(a.institution).every(n => toks.some(w => tokSame(w, n)))) s += 0.5;
    if (type) s += type === a.type ? 0.7 : -0.3;
    if (a.last4 && l4.includes(a.last4)) s += 2;
    if (who && who.id !== 'joint' && a.owner === who.id) s += 0.4;
    return { a, s };
  }).filter(x => x.s >= 0.9).sort((x, y) => y.s - x.s);
}
/* What one stretch of words wants changed (without the account) */
function updFields(seg) {
  const raw = seg, s = seg.toLowerCase().replace(/[’‘]/g, "'"), out = {};
  if (/^(archive|close)\b|\b(archive|close (out )?(the|my|our)|closed (the|my|our|it|that)|no longer have|don'?t have (it|that) anymore)\b/.test(s)) out.archived = true;
  const rn = raw.match(/\b(?:rename|call)\b.*?\bto\b\s+["“]?(.+?)["”]?\s*$/i) || raw.match(/\b(?:call it|name it|should be called)\s+["“]?(.+?)["”]?\s*$/i);
  if (rn) { out.name = rn[1].replace(/[.!?]+$/, '').trim(); return out; }
  if (/\b(owner|owned by|belongs to|is (now )?(\w+)'s|make (it|\w+(\s\w+)?) (joint|shared)|(joint|shared) (account|now))\b/.test(s)) {
    const tail = s.match(/\b(?:to|by|is now|is|belongs to)\s+([a-z' ]+)$/);
    const p = (tail && ciFindPerson(tail[1])) || (/\b(joint|shared)\b/.test(s) && members().some(m => m.id === 'joint') ? { id: 'joint' } : null) || ciFindPerson(s.replace(/^.*\b(owner|owned by|belongs to)\b/, ''));
    if (p) out.owner = p.id;
  }
  const l4 = s.match(/\b(?:ends?(?:\s+in)?|ending(?:\s+in)?|last\s+(?:four|4)(?:\s+digits)?(?:\s+(?:is|are))?)\s*(\d{4})\b/);
  let rest = s;
  if (l4) { out.last4 = l4[1]; rest = rest.replace(l4[0], ' '); }
  const rate = rest.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/) || rest.match(/\brate\b[^\d]*(\d+(?:\.\d+)?)/);
  if (rate && parseFloat(rate[1]) < 30) { out.rate = parseFloat(rate[1]); rest = rest.replace(rate[0], ' '); }
  const pay = rest.match(/\b(?:payment|paying|pay)\b[^\d$]*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (pay) { out.minPayment = ciNumber(pay[1]); rest = rest.replace(pay[0], ' '); }
  if (/\b(not a rental|no longer a rental|isn'?t a rental|not rented)\b/.test(s)) out.rental = false;
  else if (/\b(as a|is a|is now a|it'?s a) rental\b|\bnow rented\b/.test(s)) out.rental = true;
  rest = rest.replace(/\b(401 ?k|403 ?b|457 ?b?|529)\b/g, ' ');
  if (!out.archived && !('owner' in out)) {
    const kw = rest.match(/\b(?:worth|valued at|value(?:\s+is|\s+of)?|balance(?:\s+is|\s+of)?|is now|is at|is|at|to|owe[sd]?|owing|has|now)\s*(?:about\s+|around\s+|roughly\s+)?(\$?\s*[\d,]+(?:\.\d+)?\s*(?:k|thousand|million|m)?)\b/);
    const n = kw ? ciNumber(kw[1]) : null;
    if (n != null) out.balance = Math.abs(n);
    else if (/\b(is|to|at)\s+(zero|nothing)\b|\bpaid off\b/.test(rest)) out.balance = 0;
  }
  return out;
}
/* A whole sentence: { changes: [...], pending: [{ seg, fields, options }] } or null when it isn't an update */
function updParse(text, { force = false } = {}) {
  const raw = String(text || '').replace(/[’‘]/g, "'").trim();
  const verb = UPD_VERB.test(raw.toLowerCase());
  const segs = raw.replace(UPD_STRIP, ' ').split(/\s*(?:;|\band also\b|\band then\b|\band\b|,(?!\d{3}\b))\s*/i).map(x => x.trim()).filter(Boolean);
  const changes = [], pending = [];
  let lastAcct = null;
  for (const seg of segs) {
    const fields = updFields(seg);
    if (!Object.keys(fields).length) continue;
    const found = updFindAccounts(seg.replace(/\b(?:rename|call)\b.*?\bto\b.*$/i, m => m.replace(/\bto\b.*$/i, '')));
    const strong = found[0] && (found[0].s >= 1.5 || verb || force);
    if (found.length && strong && (found.length === 1 || found[0].s - found[1].s >= 0.5)) { lastAcct = found[0].a; changes.push(...updChanges(found[0].a, fields)); }
    else if (found.length && strong) pending.push({ seg, fields, options: found.slice(0, 4).map(x => x.a.id) });
    else if (!found.length && lastAcct && (verb || force) && Object.keys(fields).some(k => k !== 'balance')) changes.push(...updChanges(lastAcct, fields));   // "…and its rate is 6.1"
  }
  return changes.length || pending.length ? { changes, pending } : null;
}
function updChanges(a, f) {
  const out = [];
  for (const [k, v] of Object.entries(f)) {
    if (k === 'rental' && a.type !== 'realestate') continue;
    if ((k === 'rate' || k === 'minPayment') && !tellDebtType(a.type)) continue;
    const field = k === 'balance' && a.type === 'realestate' ? 'value' : k;
    const from = k === 'balance' ? accountValue(a) : a[k];
    if (k === 'balance' && holdingsFor(a.id).length) { out.push({ accountId: a.id, field, from, to: v, note: 'Its value comes from its holdings. Import a positions file, or edit the holdings on Investments.' }); continue; }
    const same = k === 'balance' ? Math.abs(round2(from) - round2(isLiability(a) ? Math.abs(v) : v)) < 0.005 : from === v || (k === 'name' && String(from).toLowerCase() === String(v).toLowerCase());
    out.push({ accountId: a.id, field, from, to: v, ...(same ? { same: true } : {}) });
  }
  return out;
}
function updShow(c) {
  const a = acctById(c.accountId), f = c.field;
  if (f === 'balance' || f === 'value' || f === 'minPayment') return [money(Math.abs(Number(c.from) || 0), { cents: false }), money(c.to, { cents: Math.abs(c.to) % 1 > 0.004 })];
  if (f === 'owner') return [memberName(c.from || 'joint'), memberName(c.to)];
  if (f === 'rate') return [c.from == null || c.from === '' ? 'none' : `${c.from}%`, `${c.to}%`];
  if (f === 'rental' || f === 'archived') return [c.from ? 'Yes' : 'No', c.to ? 'Yes' : 'No'];
  return [c.from || 'none', c.to];
}
function updSay(c) {
  const a = acctById(c.accountId), [from, to] = updShow(c);
  if (c.field === 'archived') return `archive ${a.name}`;
  if (c.field === 'rental') return `mark ${a.name} as ${c.to ? '' : 'not '}a rental`;
  return `${a.name}: ${UPD_FIELDS[c.field].toLowerCase()} ${to}${c.field === 'balance' || c.field === 'value' ? ` (was ${from})` : ''}`;
}

/* ---------- the conversation ---------- */
function updStart(p) { CI.draft = { step: 'update', changes: p.changes, pending: p.pending }; CI.choose = null; CI.heard = ''; return updPrompt(); }
function updPrompt() {
  const d = CI.draft; if (!d) return '';
  if (d.pending.length) { const p = d.pending[0]; const names = p.options.map(id => acctById(id)?.name); return `Which account did you mean${p.fields.balance != null ? ` for ${money(p.fields.balance, { cents: false })}` : ''}: ${names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0]}?`; }
  const real = d.changes.filter(c => !c.same && !c.note), notes = d.changes.filter(c => c.same || c.note).map(c => c.note ? `${acctById(c.accountId)?.name}: ${c.note}` : `${acctById(c.accountId)?.name}’s ${UPD_FIELDS[c.field].toLowerCase()} is already ${updShow(c)[1]}.`);
  if (!real.length) return notes.join(' ') || 'Nothing to change.';
  return `${notes.length ? notes.join(' ') + ' ' : ''}${real.length === 1 ? 'Update ' + updSay(real[0]) : 'Update ' + real.length + ' things: ' + real.map(updSay).join('; ')}? Say “yes” to save.`;
}
function updPick(id) {
  const d = CI.draft, p = d?.pending[0], a = acctById(id);
  if (!p || !a) return updPrompt();
  d.pending.shift(); d.changes.push(...updChanges(a, p.fields));
  return updPrompt();
}
function updAnswer(raw) {
  const d = CI.draft, s = String(raw).toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, '').trim();
  if (d.pending.length) {
    const opts = d.pending[0].options.map(acctById).filter(Boolean);
    // only the offered accounts, by the words of their names
    const words = ciTokens(raw), scored = opts.map(a => ({ a, s: ciTokens(a.name).filter(n => words.some(w => tokSame(w, n))).length })).sort((x, y) => y.s - x.s);
    const hit = (scored[0]?.s > 0 && (scored.length === 1 || scored[0].s > scored[1].s) ? scored[0] : null)
      || (/\b(first|1st|top)\b/.test(s) ? { a: opts[0] } : /\b(second|2nd)\b/.test(s) ? { a: opts[1] } : /\b(third|3rd)\b/.test(s) ? { a: opts[2] } : null);
    if (hit?.a) return updPick(hit.a.id);
    if (/^(skip|none|neither|never ?mind)$/.test(s)) { d.pending.shift(); return d.changes.length || d.pending.length ? updPrompt() : (CI.draft = null, 'OK, nothing was changed.'); }
    CI.heard = `I didn’t catch which one. ${updPrompt()}`; return CI.heard;
  }
  if (/^(yes|yep|yeah|save( it)?|do it|go ahead|correct|that'?s right|update( it)?|confirm|ok(ay)?)\b/.test(s)) return updApply();
  if (/^(no|nope|cancel|never ?mind|stop|don'?t)\b/.test(s) && !/\d/.test(s)) { CI.draft = null; CI.heard = 'OK, nothing was changed.'; return CI.heard; }
  const more = updParse(raw, { force: true });   // "and the Roth is 85k", or a correction for the same account
  if (more) {
    for (const c of more.changes) { d.changes = d.changes.filter(x => !(x.accountId === c.accountId && x.field === c.field)); d.changes.push(c); }
    d.pending.push(...more.pending);
    return updPrompt();
  }
  if (d.changes.length === 1) {   // "no, 12,500": a new amount for the one change
    const n = ciNumber(s); const c = d.changes[0];
    if (n != null && ['balance', 'value', 'minPayment', 'rate'].includes(c.field)) { c.to = Math.abs(n); return updPrompt(); }
  }
  CI.heard = `I didn’t catch that. ${updPrompt()}`; return CI.heard;
}
function updApply() {
  const d = CI.draft; if (!d) return '';
  const real = d.changes.filter(c => !c.same && !c.note);
  if (!real.length) { CI.draft = null; return ''; }
  d.changes = real;
  for (const c of d.changes) {
    const a = acctById(c.accountId); if (!a) continue;
    if (c.field === 'balance' || c.field === 'value') setBalance(a, isLiability(a) ? Math.abs(c.to) : c.to);
    else if (c.field === 'rate') a.rate = c.to;
    else if (c.field === 'minPayment') a.minPayment = round2(Math.abs(c.to));
    else if (c.field === 'archived') a.archived = true;
    else a[c.field] = c.to;
  }
  commit({ silent: true });
  const text = `Updated ${d.changes.length === 1 ? updSay(d.changes[0]) : listWords([...new Set(d.changes.map(c => acctById(c.accountId)?.name))])}.`;
  CI.last = { text, undo: true, n: 0 };
  CI.draft = null;
  return text;
}
function updCardHtml() {
  const d = CI.draft; if (!d) return '';
  const p = d.pending[0];
  const rows = d.changes.map(c => { const [from, to] = updShow(c), name = `<strong>${esc(acctById(c.accountId)?.name || '')}</strong> <span class="muted">${esc(UPD_FIELDS[c.field])}</span>`;
    if (c.note) return `<li class="upd-note">${name} <span class="muted">${esc(c.note)}</span></li>`;
    if (c.same) return `<li class="upd-note">${name} <span class="muted">already ${esc(to)}</span></li>`;
    return `<li>${name} <span class="upd-from">${esc(from)}</span> → <span class="upd-to">${esc(to)}</span></li>`; }).join('');
  const real = d.changes.filter(c => !c.same && !c.note).length;
  return `<section class="panel ci-card tell-card"><div class="ci-top"><span class="ci-kicker">Update</span></div>
    ${rows ? `<ul class="upd-list">${rows}</ul>` : ''}
    <p class="ci-guess tell-q">${esc(p ? updPrompt() : real ? (real === 1 ? 'Save this change?' : 'Save these changes?') : 'Nothing to change.')}</p>
    ${p ? `<div class="ci-chips">${p.options.map(id => `<button class="ci-chip" data-ci="tell-pick" data-v="${esc(id)}">${esc(acctById(id)?.name || '')}</button>`).join('')}<button class="ci-chip" data-ci="tell-pick" data-v="">Neither</button></div>` : ''}
    <div class="ci-actions">${!p && real ? '<button class="btn primary" data-ci="tell-save">Save</button>' : ''}</div>
    <div class="ci-foot"><button class="btn ghost" data-ci="tell-cancel">${!p && !real ? 'Close' : 'Cancel'}</button></div></section>`;
}
