/* ================= Updating accounts by talking =================
   "Chase savings is 12,400", "the home is worth 675k", "Alex's 401k is 312,000 and the Roth is 85k",
   "rename the Amex to Blue Cash", "change the owner of the brokerage to Julissa", "the mortgage rate is 6.125 percent",
   "Sam's card ends in 1234", "archive the SUV". Ọrọ̀ finds the account by its name (and type, owner, last 4), shows each
   change as old → new, asks which one when two accounts could match, and saves only after "yes". */
const UPD_VERB = /^(?:(?:can you|could you|please|let'?s|i want to|i need to)\s+)*(update|set|change|make|rename|name|call|archive|close|mark|correct|fix)\b/;
const UPD_STRIP = /^(?:(?:can you|could you|please|let'?s|i want to|i need to)\s+)*(update|set|change|correct|fix)\b/;
const UPD_FIELDS = { balance: 'Balance', value: 'Value', owner: 'Owner', name: 'Name', last4: 'Last 4', rate: 'Interest rate', minPayment: 'Monthly payment', rental: 'Rental', archived: 'Archive', coinPrice: 'Price' };
/* what a change is about: an account, or a coin's price (27-crypto.js) */
const updName = c => c.coin ? coinName(c.coin) : acctById(c.accountId)?.name || '';

/* Which accounts a stretch of words could mean, best first */
function updFindAccounts(seg) {
  const low = seg.toLowerCase(), toks = ciTokens(seg), type = tellFindType(low), who = ciFindPerson(seg);
  const l4 = (seg.match(/\b(\d{4})\b/g) || []);
  return activeAccounts().map(a => {
    const name = ciTokens(a.name), weight = n => UPD_GENERIC.has(n) ? 0.5 : 1;
    const hit = sum(name.filter(n => toks.some(w => tokSame(w, n))).map(weight)), total = sum(name.map(weight));
    let s = total ? 2 * hit / total : 0;
    if (a.institution && ciTokens(a.institution).length && ciTokens(a.institution).every(n => toks.some(w => tokSame(w, n)))) s += 0.5;
    if (type) s += type === a.type ? 0.7 : -0.3;
    if (a.last4 && l4.includes(a.last4)) s += 2;
    if (who && who.id !== 'joint' && a.owner === who.id) s += 0.4;
    return { a, s };
  }).filter(x => x.s >= 0.9).sort((x, y) => y.s - x.s);
}
const UPD_GENERIC = new Set(['card', 'account', 'credit', 'the', 'my', 'our', 'bank']);
/* "the car", "the house": with no name to go on, the type picks the account when there's one of it (or offers the few there are) */
function updByType(seg) {
  const type = tellFindType(seg.toLowerCase()); if (!type) return [];
  const same = activeAccounts().filter(a => a.type === type);
  return same.length && same.length <= 4 ? same.map(a => ({ a, s: same.length === 1 ? 1.6 : 1.5 })) : [];
}
/* A new name, and which account it's for, kept apart so the words of the new name never pick the account
   ("call it Fidelity #1234–Deejay–Savings" is about the open account, not the savings account).
   "rename the Amex to Blue Cash", "rename it Blue Cash", "name this account …", "call it …", "change the name of this
   account to …", "change its name to …", "its name should be …", "the Amex should be called …". */
const UPD_PRONOUN = /^(?:it|its|this|that|this (?:account|card|one)|that (?:account|card|one)|the (?:account|card)|this account's|its own)$/i;
function updRename(seg) {
  const s = String(seg).replace(/[’‘]/g, "'").trim().replace(/^(?:(?:can you|could you|please|let'?s|i want to|i need to|update|change|set)\s+)+/i, '');
  const pr = '(it|this(?:\\s+(?:account|card|one))?|that(?:\\s+(?:account|card|one))?)';
  let m, target, name;
  if ((m = s.match(new RegExp(`^(?:re)?name\\s+${pr}\\s+(?:to\\s+|as\\s+)?(.+)$`, 'i')))) [, target, name] = m;   // "name this account Fidelity …", "rename it Blue Cash"
  else if ((m = s.match(new RegExp(`^call\\s+${pr}\\s+(?:to\\s+)?(.+)$`, 'i')))) [, target, name] = m;
  else if ((m = s.match(/^rename\s+(.+?)\s+(?:to|as)\s+(.+)$/i))) [, target, name] = m;                     // "rename the Amex to Blue Cash"
  else if ((m = s.match(/^call\s+(.+?)\s+to\s+(.+)$/i))) [, target, name] = m;
  else if ((m = s.match(/^(?:the\s+)?name\s+(?:of\s+)?(.+?)\s+to\s+(.+)$/i))) [, target, name] = m;         // "(change) the name of this account to …"
  else if ((m = s.match(/^(its|(?:the\s+)?.+?'s)\s+name\s+(?:to|should be|is now|is)\s+(.+)$/i))) { [, target, name] = m; target = target.replace(/'s$/i, ''); }
  else if ((m = s.match(/^(?:the\s+)?name\s+(?:should be|is now|to)\s+(.+)$/i))) { target = 'it'; name = m[1]; }
  else if ((m = s.match(/^(.*?)\s*(?:should be called|is now called)\s+(.+)$/i))) { target = m[1] || 'it'; name = m[2]; }
  else return null;
  name = name.replace(/[.!?]+$/, '').replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim()
    .replace(/\b(?:number|pound|hashtag|hash)\s+(?=\d)/gi, '#')                  // said aloud: "number 1234" → #1234
    .replace(/\s+(?:dash|hyphen)\s+/gi, '–');                                    // "Deejay dash Savings" → Deejay–Savings
  target = target.trim().replace(/^(?:the|my|our)\s+(?=account$|card$)/i, 'the ');
  return name ? { name, target, pronoun: UPD_PRONOUN.test(target) } : null;
}
/* What one stretch of words wants changed (without the account) */
function updFields(seg) {
  const raw = seg, s = seg.toLowerCase().replace(/[’‘]/g, "'"), out = {};
  if (/^(archive|close)\b|\b(archive|close (out )?(the|my|our)|closed (the|my|our|it|that)|no longer have|don'?t have (it|that) anymore)\b/.test(s)) out.archived = true;
  const rn = updRename(raw);
  if (rn) { out.name = rn.name; return out; }
  const its = s.match(/^(?:it'?s|its|this is|this one is)\s+(?:for\s+)?([a-z]+)(?:'s)?(?:\s+(?:account|card|now))?[.!]?$/);
  if (its) { const p = ciFindPerson(its[1]); if (p) { out.owner = p.id; return out; } }
  const mk = s.match(/^make (?:the |my |our )?.+?\s+([a-z]+)'s$/);
  if (mk) { const p = ciFindPerson(mk[1]); if (p) { out.owner = p.id; return out; } }
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
    const kw = rest.match(/\b(?:worth|valued at|value(?:\s+is|\s+of)?|balance(?:\s+is|\s+of)?|is now|is at|it'?s|its|is|at|to|owe[sd]?|owing|has|now)\s*(?:about\s+|around\s+|roughly\s+)?(\$?\s*[\d,]+(?:\.\d+)?\s*(?:k|thousand|million|m)?)\b/);
    const n = kw ? ciNumber(kw[1]) : null;
    if (n != null) out.balance = Math.abs(n);
    else if (/\b(is|to|at)\s+(zero|nothing)\b|\bpaid off\b/.test(rest)) out.balance = 0;
  }
  return out;
}
/* A whole sentence: { changes: [...], pending: [{ seg, fields, options }] } or null when it isn't an update */
function updParse(text, { force = false, ctxAcct = null } = {}) {
  const raw = String(text || '').replace(/[’‘]/g, "'").trim().replace(/^(?:(?:hey|hi|ok(?:ay)?|so|um+|uh+|alright|all right|oro|ọrọ̀)[,!.]?\s+)+/i, '');
  const verb = UPD_VERB.test(raw.toLowerCase());
  const body = raw.replace(UPD_STRIP, ' ');
  let segs;
  if (/^\s*(rename|call|name\s+(it|this|that)\b)/i.test(body)) {
    // "rename Sam's card to Food and Gas card" keeps its "and"; "… to Family SUV and the checking to Bills" is two renames
    segs = []; let rest = body;
    for (let guard = 0; rest && guard < 6; guard++) {
      // every " and " after the first "to" could start the next rename; take the latest one whose words name an account,
      // so "to Food and Gas card and the checking to Bills" keeps "Food and Gas card" whole
      const first = rest.search(/\bto\s+/i), cuts = [];
      if (first >= 0) for (const m of rest.slice(first).matchAll(/\s+and\s+(?:rename\s+)?/gi)) cuts.push([first + m.index, first + m.index + m[0].length]);
      let cut = null;
      for (const [a, b] of cuts.reverse()) {
        const next = rest.slice(b), target = next.split(/\s+to\s+/i);
        if (target.length > 1 && /\S\s+to\s+\S/i.test(next) && updFindAccounts(target[0]).some(x => x.s >= 1.2)) { cut = [a, b]; break; }
      }
      if (cut) { segs.push(rest.slice(0, cut[0])); rest = 'rename ' + rest.slice(cut[1]); } else { segs.push(rest); rest = ''; }
    }
  } else if (updRename(body)) segs = [body];   // "the name of this account to Food, Gas and Fun" stays one piece
  else segs = body.split(/\s*(?:;|\band also\b|\band then\b|\band\b|,(?!\d{3}\b))\s*/i).map(x => x.trim()).filter(Boolean);
  const changes = [], pending = [];
  let lastAcct = null, hint = '';
  for (const seg of segs) {
    const fields = updFields(seg);
    if (!Object.keys(fields).length) continue;
    const rn = updRename(seg);
    if (rn?.pronoun) {   // "call it …", "name this account …": the account that's open (or the one just mentioned)
      const a = ctxAcct || lastAcct;
      if (a) { lastAcct = a; changes.push(...updChanges(a, { name: rn.name })); }
      else hint = `Which account should be called “${rn.name}”? Open it first, or say “rename Chase savings to ${rn.name}”.`;
      continue;
    }
    const who = rn ? rn.target : seg;
    // "it's for Sam", "the balance is 12,400": about the account that's open, whatever other names it mentions
    if (ctxAcct && /^\s*(it'?s?|its|this( one| account| card)?|the (balance|rate|value|payment|owner|name)|balance|rate)\b/i.test(seg)) { lastAcct = ctxAcct; changes.push(...updChanges(ctxAcct, fields)); continue; }
    let found = updFindAccounts(who);
    if (!found.length) found = updByType(who);
    if (/\b(paid (it )?off|pay(ed)? (it )?off|paid in full)\b/i.test(seg)) {   // paying something off is about what's owed, never the thing itself
      found = found.filter(x => isLiability(x.a));
      if (!found.length) {
        const words = ciTokens(who).map(w => ({ car: 'auto', truck: 'auto', vehicle: 'auto', house: 'mortgage', home: 'mortgage' })[w] || w);
        const debts = activeAccounts().filter(a => isLiability(a) && a.type !== 'credit');
        const hit = debts.filter(a => ciTokens(a.name).some(n => words.some(w => tokSame(w, n))));
        found = (hit.length ? hit : debts).slice(0, 4).map(a => ({ a, s: hit.length === 1 ? 1.6 : 1.5 }));
      }
    }
    const strong = found[0] && (found[0].s >= 1.5 || verb || force);
    if (found.length && strong && (found.length === 1 || found[0].s - found[1].s >= 0.5)) { lastAcct = found[0].a; changes.push(...updChanges(found[0].a, fields)); }
    else if (found.length && (strong || (found[0].s >= 1.0 && tellFindType(who.toLowerCase())))) pending.push({ seg, fields, options: found.slice(0, 4).map(x => x.a.id) });
    else if (!found.length && lastAcct && ((verb || force) && Object.keys(fields).some(k => k !== 'balance') || /^(its?\b|it'?s\b|the (balance|rate|value|payment)\b|balance\b|rate\b|value\b)/i.test(seg))) changes.push(...updChanges(lastAcct, fields));   // "…and its rate is 6.1", "…and the balance is 9,000"
    else if (!found.length && ctxAcct) { lastAcct = ctxAcct; changes.push(...updChanges(ctxAcct, fields)); }   // the account that's open: "the balance is 12,400"
  }
  return changes.length || pending.length ? { changes, pending } : hint ? { changes, pending, hint } : null;
}
function updChanges(a, f) {
  const out = [];
  for (const [k, v] of Object.entries(f)) {
    if (k === 'rental' && a.type !== 'realestate') continue;
    if (k === 'last4' && a.last4 === v) { if (Object.keys(f).length === 1) out.push({ accountId: a.id, field: k, from: v, to: v, same: true }); continue; }
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
  if (f === 'coinPrice') return [c.from == null ? 'none' : priceFmt(c.from), priceFmt(c.to)];
  if (f === 'balance' || f === 'value' || f === 'minPayment') return [money(Math.abs(Number(c.from) || 0), { cents: false }), money(c.to, { cents: Math.abs(c.to) % 1 > 0.004 })];
  if (f === 'owner') return [memberName(c.from || 'joint'), memberName(c.to)];
  if (f === 'rate') return [c.from == null || c.from === '' ? 'none' : `${c.from}%`, `${c.to}%`];
  if (f === 'rental' || f === 'archived') return [c.from ? 'Yes' : 'No', c.to ? 'Yes' : 'No'];
  return [c.from || 'none', c.to];
}
function updSay(c) {
  const a = acctById(c.accountId), [from, to] = updShow(c);
  if (c.field === 'coinPrice') return `${coinName(c.coin)} price ${to}${c.from != null ? ` (was ${from})` : ''}`;
  if (c.field === 'archived') return `archive ${a.name}`;
  if (c.field === 'rental') return `mark ${a.name} as ${c.to ? '' : 'not '}a rental`;
  return `${a.name}: ${UPD_FIELDS[c.field].toLowerCase()} ${to}${c.field === 'balance' || c.field === 'value' ? ` (was ${from})` : ''}`;
}

/* ---------- the conversation ---------- */
function updStart(p) {
  if (p.hint && !p.changes.length && !p.pending.length) { CI.heard = p.hint; return p.hint; }   // nothing to change yet: say what's missing
  CI.draft = { step: 'update', changes: p.changes, pending: p.pending }; CI.choose = null; CI.heard = ''; return updPrompt();
}
function updPrompt() {
  const d = CI.draft; if (!d) return '';
  if (d.pending.length) { const p = d.pending[0]; const names = p.options.map(id => acctById(id)?.name); return `Which account did you mean${p.fields.balance != null ? ` for ${money(p.fields.balance, { cents: false })}` : ''}: ${names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0]}?`; }
  const real = d.changes.filter(c => !c.same && !c.note), notes = d.changes.filter(c => c.same || c.note).map(c => c.note ? `${updName(c)}: ${c.note}` : `${updName(c)}’s ${UPD_FIELDS[c.field].toLowerCase()} is already ${updShow(c)[1]}.`);
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
  if (/^(yes|yep|yeah|sure|save( it)?|do it|go ahead|correct|that'?s right|update( it)?|confirm|ok(ay)?|sounds good)\b/.test(s)) return updApply();
  if (/^(no|nope|cancel|never ?mind|stop|don'?t)\b/.test(s) && !/\d/.test(s)) { CI.draft = null; CI.heard = 'OK, nothing was changed.'; return CI.heard; }
  const coins = coinParse(raw.replace(/^\s*(and|also|plus)\s+/i, ''));   // "and ethereum is 2,450"
  if (coins) { for (const c of coins.changes) { d.changes = d.changes.filter(x => x.coin !== c.coin); d.changes.push(c); } return updPrompt(); }
  const more = updParse(raw, { force: true });   // "and the Roth is 85k", or a correction for the same account
  const lastAcct = d.changes.length ? acctById(d.changes[d.changes.length - 1].accountId) : null;
  if (!more && lastAcct && !/^(no|nope|actually|make it|i mean|sorry)\b/.test(s)) {
    const f = updFields(raw.replace(/^\s*(and|also|plus)\s+/i, ''));
    if (Object.keys(f).length && !(Object.keys(f).length === 1 && 'balance' in f && !/\b(balance|worth|value|owe)/.test(s))) {
      for (const c of updChanges(lastAcct, f)) { d.changes = d.changes.filter(x => !(x.accountId === c.accountId && x.field === c.field)); d.changes.push(c); }
      return updPrompt();
    }
  }
  if (more) {
    for (const c of more.changes) { d.changes = d.changes.filter(x => !(x.accountId === c.accountId && x.field === c.field)); d.changes.push(c); }
    d.pending.push(...more.pending);
    return updPrompt();
  }
  if (d.changes.length === 1 && /^(?:(?:no|nope|actually|make it|i mean|sorry)[, ]+)*\$?\s*[\d,]+(?:\.\d+)?\s*(?:k|thousand|percent|%)?$/.test(s)) {   // "no, 12,500": a new amount for the one change
    const n = ciNumber(s.replace(/percent|%/g, '')); const c = d.changes[0];
    if (n != null && ['balance', 'value', 'minPayment', 'rate', 'coinPrice'].includes(c.field) && !(c.field === 'coinPrice' && n <= 0)) { c.to = Math.abs(n); delete c.same; return updPrompt(); }
  }
  CI.heard = `I didn’t catch that. ${updPrompt()}`; return CI.heard;
}
function updApply() {
  const d = CI.draft; if (!d) return '';
  const real = d.changes.filter(c => !c.same && !c.note);
  if (!real.length) { CI.draft = null; return ''; }
  d.changes = real;
  for (const c of d.changes) {
    if (c.field === 'coinPrice') { setCoinPrice(c.coin, c.to); continue; }
    const a = acctById(c.accountId); if (!a) continue;
    if (c.field === 'balance' || c.field === 'value') setBalance(a, isLiability(a) ? Math.abs(c.to) : c.to);
    else if (c.field === 'rate') a.rate = c.to;
    else if (c.field === 'minPayment') a.minPayment = round2(Math.abs(c.to));
    else if (c.field === 'archived') a.archived = true;
    else a[c.field] = c.to;
  }
  commit({ silent: true });
  const text = `Updated ${d.changes.length === 1 ? updSay(d.changes[0]) : listWords([...new Set(d.changes.map(updName))])}.`;
  CI.last = { text, undo: true, n: 0 };
  CI.draft = null;
  return text;
}
function updCardHtml() {
  const d = CI.draft; if (!d) return '';
  const p = d.pending[0];
  const rows = d.changes.map(c => { const [from, to] = updShow(c), name = `<strong>${esc(updName(c))}</strong> <span class="muted">${esc(UPD_FIELDS[c.field])}</span>`;
    const fx = c.field === 'coinPrice' && !c.same ? `<ul class="upd-fx">${coinEffects(c.coin, c.to).map(e => `<li>${esc(e.acct)}: ${amountFmt(e.amount, true)} ${esc(c.coin)}, ${money(e.from, { cents: false })} → ${money(e.to, { cents: false })}</li>`).join('')}</ul>` : '';
    if (c.note) return `<li class="upd-note">${name} <span class="muted">${esc(c.note)}</span></li>`;
    if (c.same) return `<li class="upd-note">${name} <span class="muted">already ${esc(to)}</span></li>`;
    return `<li>${name} <span class="upd-from">${esc(from)}</span> → <span class="upd-to">${esc(to)}</span>${fx}</li>`; }).join('');
  const real = d.changes.filter(c => !c.same && !c.note).length;
  return `<section class="panel ci-card tell-card"><div class="ci-top"><span class="ci-kicker">Update</span></div>
    ${rows ? `<ul class="upd-list">${rows}</ul>` : ''}
    <p class="ci-guess tell-q">${esc(p ? updPrompt() : real ? (real === 1 ? 'Save this change?' : 'Save these changes?') : 'Nothing to change.')}</p>
    ${p ? `<div class="ci-chips">${p.options.map(id => `<button class="ci-chip" data-ci="tell-pick" data-v="${esc(id)}">${esc(acctById(id)?.name || '')}</button>`).join('')}<button class="ci-chip" data-ci="tell-pick" data-v="">Neither</button></div>` : ''}
    <div class="ci-actions">${!p && real ? '<button class="btn primary" data-ci="tell-save">Save</button>' : ''}</div>
    <div class="ci-foot"><button class="btn ghost" data-ci="tell-cancel">${!p && !real ? 'Close' : 'Cancel'}</button></div></section>`;
}
