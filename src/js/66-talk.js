/* ================= Talk to Ọrọ̀, from any page =================
   A Talk button in the top bar opens a panel beside the page (a sheet on the iPhone), so you can keep looking at a
   transaction or an account while you say what to change. It knows what you're looking at: the transaction or account
   you last opened, transactions you've selected, or the list on screen. It handles transactions ("this one is groceries
   and make a rule", "the Jewel Osco one on Tuesday is for Julissa", "make a rule: Starbucks, Dunkin and Peet's are
   coffee"), account updates ("Chase ending 1234 is 12,400") and new accounts. Nothing changes until you say yes. */
const TALK = { open: false, draft: null, heard: '', last: null, speak: null, queue: [] };
const talkOn = () => voicePrefs().talk !== false;
const MIC_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>';

/* What "this" means right now */
function talkCtx() {
  const page = route().page, c = UI.talkCtx, fresh = c && Date.now() - c.at < 20 * 60 * 1000;
  const t = fresh && c.kind === 'txn' ? state.transactions.find(x => x.id === c.id) || null : null;
  const a = fresh && c.kind === 'acct' ? acctById(c.id) || null : null;
  const sel = page === 'transactions' ? $$('.tx-cb:checked').map(x => x.value).filter(id => state.transactions.some(t => t.id === id)) : [];
  return { page, t, a, sel };
}
/* The panel keeps its own conversation; the check-in page keeps its own */
function withTalk(fn) {
  const keep = { draft: CI.draft, heard: CI.heard, last: CI.last, choose: CI.choose };
  CI.draft = TALK.draft; CI.heard = TALK.heard; CI.last = TALK.last; CI.choose = null;
  try { return fn(); } finally { TALK.draft = CI.draft; TALK.heard = CI.heard; TALK.last = CI.last; Object.assign(CI, keep); }
}

/* ---------- the panel ---------- */
function talkEl() {
  let el = $('#talk');
  if (!el) {
    el = document.createElement('aside');
    el.id = 'talk'; el.className = 'talk'; el.hidden = true;
    el.setAttribute('role', 'complementary'); el.setAttribute('aria-label', 'Talk to Ọrọ̀');
    el.innerHTML = `<div class="talk-head"></div><div class="talk-body"></div>
      <form class="talk-say" data-talk-say autocomplete="off"><input id="talk-say" type="text" enterkeyhint="go" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="Say or type what to change"><button class="btn primary" type="submit">Go</button></form>`;
    document.body.appendChild(el);
  }
  return el;
}
function openTalk(ctx) {
  if (ctx) UI.talkCtx = { ...ctx, at: Date.now() };
  TALK.open = true; TALK.heard = '';
  if (TALK.speak == null) TALK.speak = speakOn();
  const el = talkEl(); el.hidden = false;
  document.body.classList.add('talk-open');
  paintTalk();
  const inp = $('#talk-say'); if (inp) inp.focus();   // inside the tap, so the iPhone keyboard comes up too
}
function closeTalk() {
  TALK.open = false; TALK.heard = '';
  const el = $('#talk'); if (el) el.hidden = true;
  document.body.classList.remove('talk-open');
  ciHush();
}
function talkExamples(ctx) {
  const ex = [];
  const exp = state.categories.filter(c => c.kind === 'expense' && !c.rental).map(c => c.name), c1 = (exp.find(n => /grocer/i.test(n)) || exp[0] || 'groceries').toLowerCase(), c2 = (exp.find(n => /^shopping$/i.test(n)) || exp.find(n => /^household|^home goods|^shopping/i.test(n) && n.toLowerCase() !== c1) || exp[1] || 'shopping').toLowerCase();
  if (ctx.t) ex.push(`this one is ${c1}, and make a rule`, `it’s for ${members().find(m => m.id !== 'joint')?.name || 'Julissa'}`, `split it half ${c1}, half ${c2}`, 'flag it', 'note: Costco run for the party');
  else if (ctx.sel.length) ex.push('these are groceries', `these are for ${members().find(m => m.id !== 'joint')?.name || 'Julissa'}`, 'flag these');
  else if (ctx.page === 'transactions' || ctx.page === 'checkin' || ctx.page === 'budget') ex.push('the Jewel Osco one on Tuesday is groceries', 'the $84.12 charge should be household, and make a rule', 'make a rule: Starbucks, Dunkin and Peet’s are coffee', 'flag the Best Buy charge');
  if (ctx.a) ex.push('the balance is 12,400', `rename it to ${ctx.a.name.split(' ')[0]} …`, 'it ends in 1234');
  if (!ctx.t && !ctx.sel.length && ['accounts', 'overview', 'property', 'investments', 'planning'].includes(ctx.page)) ex.push('Chase ending 1234 is 12,400', 'the home is worth 675k', 'rename the Amex to Blue Cash', 'the mortgage rate is 6.125 percent');
  ex.push('add a savings account at Ally with 40,000');
  return [...new Set(ex)].slice(0, 6);
}
function paintTalk() {
  if (!TALK.open) return;
  const el = talkEl(), ctx = talkCtx();
  const about = ctx.t ? `${esc(prettyPayee(ctx.t.payee) || ctx.t.payee)} · ${money(ctx.t.amount)} · ${dateLabel(ctx.t.date)}`
    : ctx.a ? esc(ctx.a.name) : ctx.sel.length ? `${ctx.sel.length} selected` : '';
  const pageName = PAGES.find(p => p[0] === ctx.page)?.[1] || '';
  $('.talk-head', el).innerHTML = `<strong class="talk-title">${MIC_ICON} Talk</strong>
    <span class="talk-ctx">${about ? `<span class="chip flat">About: ${about}</span>` : `<span class="muted small">On ${esc(pageName)}</span>`}</span>${ctx.t || ctx.a ? '<button class="icon-btn talk-clear" data-talk="clear-ctx" aria-label="Not about this" title="Not about this">×</button>' : ''}
    ${canSpeak() ? `<button class="icon-btn" data-talk="speak" aria-pressed="${TALK.speak ? 'true' : 'false'}" title="${TALK.speak ? 'Reading replies aloud' : 'Read replies aloud'}">${SPEAKER_ICON}</button>` : ''}
    <button class="icon-btn" data-talk="close" aria-label="Close">×</button>`;
  const card = withTalk(() => CI.draft ? (CI.draft.step === 'tx' ? txCardHtml() : tellCardHtml()) : '');
  const last = TALK.last ? `<p class="ci-last">${esc(TALK.last.text)}${canUndoLast(TALK.last) ? ' <button class="linklike" data-ci="undo">Undo</button>' : ''}</p>` : '';
  const heard = TALK.heard ? `<p class="ci-heard">${esc(TALK.heard)}</p>` : '';
  const ex = !card ? `<p class="muted small talk-try">Say or type what to change${isTouch() ? ' (tap the box, then the keyboard’s mic)' : ''}. For example:</p>
    <div class="talk-ex">${talkExamples(ctx).map(x => `<button class="ci-chip" data-talk="example" data-v="${esc(x)}">“${esc(x)}”</button>`).join('')}</div>` : '';
  const queued = TALK.queue.length ? `<p class="muted small talk-next">Then: ${TALK.queue.map(q => `“${esc(q)}”`).join(', ')}</p>` : '';
  $('.talk-body', el).innerHTML = last + heard + card + queued + ex;
  const inp = $('#talk-say', el);
  if (inp) inp.placeholder = isTouch() ? 'Tap here, then the keyboard’s mic' : ctx.t ? '“this one is groceries, and make a rule”' : 'Say or type what to change';
}

function talkUndo() {
  if (!CI.last?.undo) { CI.heard = 'There’s nothing to undo here.'; return CI.heard; }
  if (!canUndoLast(CI.last)) { CI.heard = 'Other changes were made since, so that can’t be undone from here.'; if (CI.last) CI.last.undo = false; return CI.heard; }
  undo(); CI.last = null; if (CI.draft?.step === 'after') CI.draft = null;
  return 'Undone.';
}
/* ---------- understanding ---------- */
const TX_INTENT = /\b(one|ones|charges?|transactions?|purchases?|deposits?|refunds?|rules?|categori[sz]e|category|flag|unflag|note|memo|split)\b/;
/* "the Uber one is for Sam and the Hulu ones are subscriptions" → two requests, done one after the other */
function talkClauses(text) {
  return text.split(/\s*(?:;\s*|\.\s+(?=\S)|(?:,\s*(?:and|also|then)?|\s+(?:and|also|then))\s+(?!(?:the|this|that)\s+(?:rest|remainder|other half)\b)(?=(?:the|this|that|these|those|my|our)\s+[^,]*?\s+(?:is|are|was|were|should|goes|go|belongs?|needs?)\b))/i).map(x => x.trim().replace(/[.]+$/, '')).filter(Boolean);
}
function talkUnderstand(text, { split = true } = {}) {
  const low = text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, '');
  if (/^(cancel|never ?mind|stop|close)$/.test(low) && !CI.draft) { closeTalk(); return ''; }
  if (/^undo( that)?$/.test(low)) { if (CI.draft) { CI.draft = null; TALK.queue = []; CI.heard = 'OK, nothing was changed.'; return CI.heard; } return talkUndo(); }
  if (CI.draft) return CI.draft.step === 'tx' ? txAnswer(text) : tellAnswer(text);
  if (TELL_ADD.test(low) && !/^add (a )?note\b/.test(low) && (tellFindType(low) || /\b(account|property)\b/.test(low))) return tellStart(text);
  const ctx = talkCtx();
  if (split) {
    const parts = talkClauses(text);
    // one request at a time when a transaction is involved; account updates handle their own "and" ("…ends in 4321 and the balance is 9,000")
    if (parts.length > 1 && parts.some(p => TX_INTENT.test(p.toLowerCase()) && txParse(p, ctx))) { TALK.queue = parts.slice(1); return talkUnderstand(parts[0], { split: false }); }
  }
  // "it's for Sam", "the balance is 12,400" with an account open (or "this card" with a transaction open) are about that account
  const ctxAcct = ctx.a || (ctx.t && /\bthis (card|account)\b/.test(low) ? acctById(ctx.t.accountId) : null);
  if (ctxAcct && /^\s*(it'?s?|its|this( one| account| card)?|the (balance|rate|value|payment|owner|name) (on|of|for) (it|this)|the (balance|rate|value|payment|owner|name))\b/.test(low)) { const u = updParse(text, { ctxAcct }); if (u) return updStart(u); }
  // a sentence that names an account and says what to change is about the account, even with a transaction open
  const up0 = updParse(text);
  if (up0 && !TX_INTENT.test(low)) return updStart(up0);
  const tx = txParse(text, ctx);
  if (tx) return txStart(tx);
  const up = up0 || updParse(text, { ctxAcct });
  if (up) return updStart(up);
  CI.heard = ctx.t ? 'I didn’t catch that. Try “it’s groceries”, “for Julissa”, “flag it” or “make a rule”.'
    : 'I didn’t catch that. Try naming the transaction or account: “the Jewel Osco one is groceries”, “Chase savings is 12,400”.';
  return CI.heard;
}
function talkNext(reply) {
  if (TALK.draft || !TALK.queue.length) return reply;
  if (/^OK, nothing was (changed|added)/.test(reply || '')) { TALK.queue = []; return reply; }
  const next = TALK.queue.shift();
  const r2 = withTalk(() => talkUnderstand(next, { split: false }));
  return [reply, `Next: ${r2}`].filter(Boolean).join(' ');
}
function talkSubmit(text) {
  if (!text.trim()) return;
  if (!TALK.draft) TALK.queue = [];
  const reply = talkNext(withTalk(() => { CI.heard = ''; return talkUnderstand(text); }));
  render();   // the page under the panel shows the change too
  if (TALK.speak && reply) ciSpeak(reply);
  const inp = $('#talk-say'); if (inp) { inp.value = ''; if (TALK.open) inp.focus(); }
}
function talkClick(act, v) {
  if (act === 'tx-cancel' || act === 'tell-cancel') TALK.queue = [];
  const reply0 = withTalk(() => {
    CI.heard = '';
    if (act === 'undo') return talkUndo();
    if (act === 'tx-save') return txApply();
    if (act === 'tx-pick') return txPick(v);
    if (act === 'tx-cat') return txChooseCat(v);
    if (act === 'tx-cancel') { CI.draft = null; return 'OK, nothing was changed.'; }
    if (act.startsWith('tell-')) return tellClick(act, v);
    return '';
  });
  const reply = talkNext(reply0);
  render();
  if (TALK.speak && reply) ciSpeak(reply);
}

/* ---------- transactions by talking ---------- */
const TX_GENERIC = new Set(['transaction', 'transactions', 'charge', 'charges', 'purchase', 'purchases', 'payment', 'payments', 'deposit', 'deposits', 'one', 'ones', 'from', 'at', 'on', 'in', 'look', 'looking', 'i', 'im', 'am', 'see', 'here',
  'there', 'this', 'that', 'these', 'those', 'it', 'them', 'they', 'the', 'a', 'an', 'my', 'our', 'for', 'of', 'with', 'today', 'yesterday', 'flag', 'unflag', 'note', 'rename', 'categorize', 'categorise', 'split', 'half', 'need', 'needs',
  'updated', 'update', 'change', 'changed', 'thing', 'item', 'entry', 'line', 'last', 'week', 'month', 'dollar', 'buck', 'card', 'account', 'put', 'file', 'mark', 'move', 'make', 'set', 'all', 'both', 'please', 'can', 'you', 'just', 'actually', 'really', 'was', 'were', 'is', 'are', 'and', 'but']);
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TALK_MONTHS = MONTHS.map(m => m.toLowerCase());
function txDateHint(s) {
  const now = today();
  if (/\btoday\b/.test(s)) return d => d === now;
  if (/\byesterday\b/.test(s)) return d => d === addDays(now, -1);
  const wd = WEEKDAY_NAMES.findIndex(w => new RegExp(`\\b${w}'?s?\\b`).test(s));
  if (wd >= 0) { const back = (fromISO(now).getDay() - wd + 7) % 7, day = addDays(now, -back); return d => d === day || d === addDays(day, -7); }
  const md = s.match(new RegExp(`\\b(${TALK_MONTHS.map(m => m.slice(0, 3)).join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (md) { const m = TALK_MONTHS.findIndex(x => x.startsWith(md[1])) + 1, day = +md[2]; return d => +d.slice(5, 7) === m && +d.slice(8) === day; }
  const th = s.match(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/);
  if (th) return d => +d.slice(8) === +th[1] && daysBetween(d, now) <= 62;
  const sl = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (sl) return d => +d.slice(5, 7) === +sl[1] && +d.slice(8) === +sl[2];
  return null;
}
function txAmountHint(s) {
  const m = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/) || s.match(/\b(\d[\d,]*\.\d{2})\b/) || s.match(/\b(\d[\d,]*)\s*(?:dollars?|bucks)\b/) || s.match(/\bfor (\d[\d,]*(?:\.\d{1,2})?)\b/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}
/* Which transactions a description means: { ids } or { pending: [ids] } or null */
function txFind(targetText, ctx) {
  const s = targetText.toLowerCase().replace(/[’‘]/g, "'");
  if (ctx.sel.length && /\b(these|those|them|the selected|selected( ones)?|all of (these|them))\b/.test(s)) return { ids: ctx.sel.slice() };
  const refWords = /\b(one|ones|charge|charges|transaction|transactions|purchase|purchases|deposit|deposits|refund|payment|for)\b/.test(s);
  let amt = txAmountHint(s);
  if (amt == null && refWords) { const m = s.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollar|buck)?\s*(?:one|charge|transaction|purchase|deposit|refund|payment)\b/); if (m) amt = parseFloat(m[1].replace(/,/g, '')); }
  const datePred = txDateHint(s);
  // an account named in the description ("the Amex charge for 84") narrows by account rather than payee
  const acctHit = updFindAccounts(targetText)[0], acct = acctHit && acctHit.s >= 1.4 ? acctHit.a : null;
  const acctToks = acct ? ciTokens(acct.name + ' ' + (acct.institution || '')) : [];
  const words = ciTokens(targetText).filter(w => !TX_GENERIC.has(w) && !WEEKDAY_NAMES.some(d => w.startsWith(d.slice(0, 3)) && d.startsWith(w)) && !TALK_MONTHS.some(m => m.startsWith(w) && w.length >= 3) && !/^\d/.test(w) && !/^(st|nd|rd|th|s)$/.test(w) && !acctToks.includes(w));
  const refThis = /\b(this|that|it)\b|\bthis one\b|\bthat one\b/.test(s);
  const self = ctx.t || (ctx.sel.length === 1 ? state.transactions.find(t => t.id === ctx.sel[0]) : null);
  if (self && refThis && !words.length && amt == null && !datePred) return { ids: [self.id] };
  if (amt != null && !words.length && !datePred && !acct && !refWords) amt = null;   // "$50 groceries" isn't a way to point at a transaction
  if (!words.length && amt == null && !datePred) return self && refThis ? { ids: [self.id] } : null;
  const visible = ctx.page === 'transactions' && UI.txVisible?.length ? new Set(UI.txVisible) : null;
  const since = addDays(today(), -150);
  const pool = state.transactions.filter(t => visible ? visible.has(t.id) : t.date >= since);
  const scored = [];
  for (const t of pool) {
    const ptoks = ciTokens(`${t.payee || ''} ${t.rawPayee || ''} ${t.memo || ''}`);
    const hit = words.filter(w => ptoks.some(p => tokSame(w, p))).length;
    if (words.length && !hit && !(amt != null && Math.abs(Math.abs(t.amount) - amt) < 0.005)) continue;
    let sc = words.length ? 2 * hit / words.length : 0;
    if (amt != null) { const d = Math.abs(Math.abs(t.amount) - amt); sc += d < 0.005 ? 2 : d < 1 && Number.isInteger(amt) ? 1.6 : d <= Math.max(1, amt * 0.02) ? 1 : -1.5; }
    if (datePred) sc += datePred(t.date) ? 1.5 : -1;
    if (acct) sc += t.accountId === acct.id ? 1 : -1;
    if (ctx.t && t.id === ctx.t.id) sc += 0.3;
    if (sc >= 1.4) scored.push({ t, sc });
  }
  if (!scored.length) return self && refThis ? { ids: [self.id] } : null;
  scored.sort((x, y) => y.sc - x.sc || y.t.date.localeCompare(x.t.date));
  const top = scored.filter(x => x.sc >= scored[0].sc - 0.01);
  if (top.length === 1) return { ids: [top[0].t.id] };
  return { pending: top.slice(0, 30).map(x => x.t.id) };
}
/* Split "<which transaction> <what to do>" */
function txSplitSentence(raw) {
  let m = raw.match(/^\s*(?:please\s+)?(?:categori[sz]e|put|file|mark|move|change|set)\s+(.+?)\s+(?:as|under|in|into|to)\s+(.+)$/i);
  if (m && !/^(a )?rules?\b/i.test(m[1])) return { target: m[1], action: m[2] };
  m = raw.match(/^(.+?)\s+(?:should be|should go (?:in|under|to)|needs to be|need it (?:updated |changed )?to|is actually|is really|is|was|are|were|goes (?:in|under|to)|belongs (?:in|under|to))\s+(.+)$/i);
  if (m) return { target: m[1], action: m[2] };
  m = raw.match(/^(.+?)(?:,|;| - )\s*(.+)$/);
  if (m) return { target: m[1], action: m[2] };
  return { target: raw, action: raw };
}
/* What to do, from the action words: { set, rules, choose } */
function txAction(actionRaw, targets, baseCat = null) {
  const out = { set: {}, rules: [], choose: null, needCat: false };
  let raw = actionRaw.replace(/[’‘]/g, "'"), s = raw.toLowerCase();
  const t0 = targets[0];
  // the rule part: "and make a rule …", "always", "from now on"
  let ruleClause = null;
  const rm = s.match(/(?:,?\s*(?:and|but|also|plus)\s+)*(?:also\s+)?(?:make|create|add|set up|save)\s+(?:a\s+|an?\s+)?(?:new\s+)?rules?\b(.*)$/) || s.match(/(?:,?\s*(?:and)\s+)?\b(?:always|from now on|every time|going forward)\b(.*)$/);
  if (rm) { ruleClause = rm[1] || ''; s = s.slice(0, rm.index); raw = raw.slice(0, rm.index); }
  const note = raw.match(/\b(?:note|memo)\s*[:,]?\s*(.+)$/i);
  if (note) { out.set.memo = note[1].replace(/[.]+$/, '').trim(); s = s.slice(0, note.index); }
  const rn = s.match(/\b(?:rename|call)\s+(?:it|this|the payee|this payee)?\s*to\s+(.+)$/);
  if (rn) { out.set.payee = raw.slice(raw.toLowerCase().indexOf(rn[1])).trim().replace(/[.]+$/, ''); s = s.slice(0, rn.index); }
  if (/\b(unflag|clear the flag|take the flag off)\b/.test(s)) { out.set.flag = false; s = s.replace(/\b(unflag|clear the flag|take the flag off)\b/, ' '); }
  else if (/\bflag\b/.test(s)) { out.set.flag = true; s = s.replace(/\b(flag (it|this|them|these|that)?|flag)\b/, ' '); }
  const who = /\bhalf\b.*\bfor\b.*\bhalf\b/.test(s) ? null : /\bfor\s+[a-z]|\b[a-z]+'s\b|\b(joint|shared)\b/.test(s) ? ciFindPerson(s) : null;
  if (who) { out.set.person = who.id; s = who.rest || ''; }
  const cleaned = s.replace(/\b(it'?s|it is|this is|they'?re|should be|is|are|as|to|under|into|in|categori[sz]ed?|put|file|it|this|them|these|one|and|also|but|please|actually|really)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned && t0) {
    const split = /\b(half|split|rest|remainder)\b/.test(s) ? ciFindSplit(s.replace(/\b(split (it|this|that)?|it'?s|it is|should be)\b/g, ' ').replace(/\s+/g, ' ').trim(), t0) : null;
    if (split && targets.length === 1) out.set.splits = split;
    else {
      // payee words don't count toward the category ("Costco is groceries")
      const ptoks = new Set(targets.flatMap(t => ciTokens(`${t.payee} ${t.rawPayee || ''}`)));
      const words = ciTokens(cleaned).filter(w => !ptoks.has(w)).join(' ');
      const m = words ? ciMatchCategory(words, t0) : { best: null, options: [] };
      if (m.best) out.set.categoryId = m.best; else if (m.options.length) out.choose = m.options;
    }
  }
  if (ruleClause != null) {
    out.rules = txRules(ruleClause, targets, out.set.categoryId || baseCat);
    // "Doordash is always dining out": the rule's category is also this transaction's
    if (!out.set.categoryId && !out.set.splits && targets.length && out.rules[0]?.categoryId && !out.rules[0].auto && out.rules.every(r => r.own)) out.set.categoryId = out.rules[0].categoryId;
  }
  if (out.rules.some(r => !r.categoryId)) out.needCat = true;
  return out;
}
/* "for Fidelity brokerage $500 coming in", "for Starbucks, Dunkin and Peet's as coffee", "" (this payee) */
function txRules(clause, targets, catId) {
  const named = /^\s*(?:for|:|that says|saying)\b|^\s*:/.test(clause) || /,|\band\b/.test(clause);
  let s = ' ' + clause.replace(/^\s*(?:that says|that|so that|so|to say|saying|:|for)\s*/, ' ') + ' ';
  const t0 = targets[0];
  const cond = {};
  const amt = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)|\bfor\s+([\d,]+(?:\.\d{2}))\b|\b(?:when|if) it'?s\s+\$?([\d,]+(?:\.\d{1,2})?)\b/);
  if (/\b(this|that|the same) amount\b/.test(s) && t0) { cond.amt = { op: 'eq', a: round2(Math.abs(t0.amount)) }; s = s.replace(/\b(for|with)?\s*(this|that|the same) amount\b/, ' '); }
  else if (amt) { cond.amt = { op: 'eq', a: round2(parseFloat((amt[1] || amt[2] || amt[3]).replace(/,/g, ''))) }; s = s.replace(amt[0], ' '); }
  if (/\b(coming in|deposits?|money in|incoming|paid to me)\b/.test(s)) { cond.dir = 'in'; s = s.replace(/\b(coming in|deposits?|money in|incoming|paid to me)\b/g, ' '); }
  else if (/\b(going out|charges?|money out|outgoing|purchases?)\b/.test(s)) { cond.dir = 'out'; s = s.replace(/\b(going out|charges?|money out|outgoing|purchases?)\b/g, ' '); }
  if (/\b(this|that) account\b|\bonly (?:on|from|for|in) (?:this|that)( one)?\b/.test(s) && t0) { cond.acct = t0.accountId; s = s.replace(/\b(only )?(on|from|for|in)? ?(this|that) account\b|\bonly (?:on|from|for|in) (?:this|that)( one)?\b/g, ' '); }
  else { const am = s.match(/\b(?:on|from|in)\s+(?:the |my |our )?([a-z0-9' ]+?)\s+(?:account|card)\b/); if (am) { const hit = updFindAccounts(am[1])[0]; if (hit && hit.s >= 1.2) { cond.acct = hit.a.id; s = s.replace(am[0], ' '); } } }
  // an explicit category for the rule: "… as coffee", "… are coffee", "… → coffee"
  let ruleCat = catId || null, auto = true;
  const cm = s.match(/\s(?:are|is|as|go(?:es)? (?:to|under|in)|under|into|to|=|→)\s+(.+)$/);
  let wanted = '';
  if (cm) {
    const m = ciMatchCategory(cm[1], t0);
    if (m.best) { ruleCat = m.best; auto = false; } else { ruleCat = null; auto = false; wanted = cm[1].trim(); }   // a category you don't have: ask, don't guess
    s = s.slice(0, cm.index);
  }
  // nothing but a category ("always dining out", "from now on, groceries"): this payee, that category
  const bare = s.replace(/\b(be|it|this|them|these|one|ones|should|goes|go|in|as|under|to|into|is|are)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!named && bare && !cm) { const m = ciMatchCategory(bare, t0); ruleCat = m.best || null; auto = false; if (!m.best) wanted = bare; s = ' '; }   // "always rideshare": a category, never a payee
  if (!ruleCat && t0 && !isUncat(t0) && !isSplit(t0)) ruleCat = t0.categoryId;
  // the payees named, or this transaction's merchant
  let names = s.replace(/\b(anything|everything|all|any|stuff|transactions?|from|at|by|the|it|this|these|them|one|a|an|for|and also|too|as well|always|ones?)\b/g, ' ')
    .split(/,|\band\b|\bor\b|;/).map(x => x.replace(/[^a-z0-9&' ]/g, ' ').replace(/\s+/g, ' ').trim()).filter(x => x.length >= 2);
  // "a rule for Starbucks coffee": the last word is the category when it names one
  if (names.length === 1 && auto) {
    const w = names[0].split(' ');
    for (let k = Math.min(3, w.length - 1); k >= 1; k--) {
      const m = ciMatchCategory(w.slice(-k).join(' '), t0), c = m.best && catById(m.best);
      if (c && ciTokens(c.name).join(' ') === ciTokens(w.slice(-k).join(' ')).join(' ')) { ruleCat = m.best; auto = false; names = [w.slice(0, -k).join(' ')]; break; }
    }
  }
  const own = !names.length;
  const list = names.length ? names.map(n => ({ text: normPayee(n) || n.toUpperCase(), label: n.replace(/\b[a-z]/g, c => c.toUpperCase()) })) : t0 ? [{ text: ruleKeyFor(t0.rawPayee || t0.payee, t0.id), label: '' }].filter(x => x.text) : [];
  const seen = new Set();
  return list.filter(x => !seen.has(x.text) && seen.add(x.text)).map(x => ({ text: x.text, label: x.label, categoryId: ruleCat, auto, own, wanted, ...cond }));
}
/* A whole sentence about transactions, or null when it isn't one */
function txParse(text, ctx) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  // a rule on its own: "make a rule: Starbucks, Dunkin and Peet's are coffee", "always put Starbucks under coffee"
  const ruleOnly = low.match(/^(?:please\s+)?(?:make|create|add|set up)\s+(?:a\s+|an?\s+)?(?:new\s+)?rules?\b\s*(.*)$/) || low.match(/^always\s+(?:put|file|categori[sz]e|mark|make)\s+(.+?)\s+(?:as|under|in|into|to)\s+(.+)$/);
  if (ruleOnly && !(ctx.t && /\b(this|it)\b/.test(low) && ruleOnly[1] && !/,|\band\b/.test(ruleOnly[1]))) {
    const clause = ruleOnly[2] ? `${ruleOnly[1]} as ${ruleOnly[2]}` : ruleOnly[1];
    const rules = clause.trim() ? txRules(clause, ctx.t ? [ctx.t] : [], null) : ctx.t ? txRules('', [ctx.t], null) : [];
    if (rules.length) return { ids: ctx.t && !clause.trim() ? [ctx.t.id] : [], set: {}, rules, choose: null, needCat: rules.some(r => !r.categoryId) };
  }
  // "from now on", "always" anywhere asks for a rule as well
  const always = /\b(from now on|going forward|every time|always)\b/i.test(raw) && !/\b(make|create|add|set up)\s+(a\s+)?rules?\b/i.test(raw) && !/^always\s+(put|file|categori[sz]e|mark|make)\b/i.test(raw);
  const plain = always ? raw.replace(/,?\s*\b(from now on|going forward|every time|always)\b,?/gi, ' ').replace(/\s+/g, ' ').trim() : raw;
  let { target, action } = txSplitSentence(plain);
  if (ctx.t && /\b(half|the rest|remainder|split)\b/.test(low) && !/\b(the|that)\s+[a-z$\d][^,]*?\s+(one|ones|charge|transaction)\b/.test(low)) { target = 'this'; action = raw; }
  const found = txFind(target, ctx) || (target !== plain ? txFind(plain, ctx) : null) || (ctx.t ? { ids: [ctx.t.id] } : null);
  if (!found) return null;
  const sample = (found.ids || found.pending).map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  if (!sample.length) return null;
  const act = txAction(action, sample);
  if (always && !act.rules.length) act.rules = txRules('', sample, act.set.categoryId);
  // a rule for "this" uses the payee words you said ("Doordash", not "Doordash Burger District")
  const said = ciTokens(target).filter(w => !TX_GENERIC.has(w) && sample.every(t => ciTokens(`${t.payee} ${t.rawPayee || ''}`).some(p => tokSame(w, p))));
  if (said.length) for (const r of act.rules) if (r.own) { const key = normPayee(said.join(' ')); if (key && sample.every(t => ruleMatches({ text: key }, t.rawPayee || t.payee, t))) { r.text = key; r.label = said.join(' ').replace(/\b[a-z]/g, c => c.toUpperCase()); } }
  act.needCat = act.rules.some(r => !r.categoryId);
  const has = Object.keys(act.set).length || act.rules.length || act.choose;
  if (!has) return null;
  return { ids: found.ids || [], pending: found.pending || null, ...act };
}

/* ---------- the conversation ---------- */
function txStart(p) { CI.draft = { step: 'tx', ...p }; return txPrompt(); }
const txLabel = t => `${prettyPayee(t.payee) || t.payee} · ${money(t.amount)} · ${dateLabel(t.date)}`;
function txPrompt() {
  const d = CI.draft; if (!d) return '';
  if (d.pending?.length) return `Which one? ${d.pending.length} transactions match${d.pending.length <= 3 ? ': ' + d.pending.map(id => { const t = state.transactions.find(x => x.id === id); return t ? `${dateLabel(t.date)} for ${money(Math.abs(t.amount))}` : ''; }).join(', ') : ''}.`;
  if (d.choose?.length) return `Which category: ${d.choose.map(catName).join(', ')}?`;
  if (d.needCat) { const w = d.rules.find(r => r.wanted)?.wanted; return w ? `There’s no category called “${w}”. Which category should the rule use?` : 'Which category should the rule use?'; }
  const over = txOverSplit(d); if (over) return over;
  const n = d.ids.length, bits = txChangeWords(d);
  return `${bits.join('; ')}${bits.length ? '. ' : ''}Say “yes” to save.`;
}
function txChangeWords(d) {
  const out = [], s = d.set, n = d.ids.length, who = !n && d.pending?.length ? 'the one you pick' : n === 1 ? (prettyPayee(state.transactions.find(t => t.id === d.ids[0])?.payee || '') || 'it') : `${n} transactions`;
  if (s.categoryId) out.push(`File ${who} under ${catName(s.categoryId)}`);
  if (s.splits) out.push(`Split ${who}: ${s.splits.map(p => catName(p.categoryId)).join(' and ')}`);
  if (s.person) out.push(`${s.categoryId ? 'for' : 'Set ' + who + ' to'} ${memberName(s.person)}`);
  if (s.flag === true) out.push(`Flag ${who}`); else if (s.flag === false) out.push(`Clear the flag on ${who}`);
  if (s.memo) out.push(`Note: ${s.memo}`);
  if (s.payee) out.push(`Rename the payee to ${s.payee}`);
  const targets = d.ids.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  if (s.categoryId || s.splits) {
    const split = targets.filter(t => isSplit(t)), filed = targets.filter(t => !isUncat(t) && !isSplit(t) && t.categoryId !== s.categoryId);
    if (split.length) out.push(`This replaces the split on ${split.length === 1 ? prettyPayee(split[0].payee) : split.length + ' transactions'} (${[...new Set(split.flatMap(t => t.splits.map(x => catName(x.categoryId))))].join(', ')})`);
    if (filed.length) out.push(`${filed.length === 1 ? 'It’s' : `${filed.length} of them are`} filed under ${[...new Set(filed.map(t => catName(t.categoryId)))].join(', ')} now`);
  }
  for (const r of d.rules) {
    const name = r.label || prettyPayee(r.text), twin = !ruleHasConds(r) ? state.rules.find(x => x.text === r.text && !ruleHasConds(x)) : null;
    if (twin && twin.categoryId === r.categoryId) out.push(`You already have a rule: ${name} → ${catName(r.categoryId)}`);
    else if (twin) out.push(`Change your rule for ${name} from ${catName(twin.categoryId)} to ${r.categoryId ? catName(r.categoryId) : '?'}`);
    else out.push(`New rule: ${name} → ${r.categoryId ? catName(r.categoryId) : '?'}${ruleCondText(r) ? ` (${ruleCondText(r)})` : ''}`);
  }
  return out;
}
function txOverSplit(d) {
  if (!d.set.splits) return '';
  const t = state.transactions.find(x => x.id === d.ids[0]); if (!t) return '';
  const fixed = d.set.splits.filter(p => p.amount != null).reduce((a, p) => a + Math.abs(p.amount), 0);
  return fixed > Math.abs(t.amount) + 0.004 ? `${money(fixed)} is more than the ${money(Math.abs(t.amount))} charge. Say the split again, like “$50 groceries, the rest shopping”.` : '';
}
function txPick(v) {
  const d = CI.draft; if (!d?.pending) return '';
  d.ids = v === 'all' ? d.pending.slice() : [v]; d.pending = null;
  return txPrompt();
}
function txChooseCat(id) {
  const d = CI.draft; if (!d) return '';
  if (d.choose) { d.set.categoryId = id; d.choose = null; for (const r of d.rules) if (!r.categoryId) r.categoryId = id; }
  else if (d.needCat) for (const r of d.rules) if (!r.categoryId) r.categoryId = id;
  d.needCat = d.rules.some(r => !r.categoryId);
  return txPrompt();
}
function txAnswer(raw) {
  const d = CI.draft, s = String(raw).toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, '').trim();
  if (/^(cancel|never ?mind|stop|forget it|cancel (it|all|everything))$/.test(s)) { CI.draft = null; CI.heard = 'OK, nothing was changed.'; return CI.heard; }
  if (/^(no|nope|skip( it| that| this one)?|not that one)$/.test(s)) { CI.draft = null; CI.heard = TALK.queue.length ? 'Skipped that one.' : 'OK, nothing was changed.'; return CI.heard; }
  if (d.pending?.length) {
    if (/\b(all|every one|both|all of them|each)\b/.test(s)) {
      txPick('all');
      const rest = raw.replace(/^.*?\b(all of them|all|every one|both|each)\b[,.]?\s*/i, '').trim();
      return rest ? txAnswer(rest) : txPrompt();
    }
    const opts = d.pending.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
    const amt = txAmountHint(s) ?? (s.match(/^\$?(\d[\d,]*(?:\.\d+)?)$/) ? parseFloat(s.replace(/[$,]/g, '')) : null), dp = txDateHint(s);
    const nth = ['first', 'second', 'third', 'fourth', 'fifth'].findIndex(w => new RegExp(`\\b${w}\\b`).test(s));
    let hit = nth >= 0 ? opts[nth] : null;
    if (!hit) { const m = opts.filter(t => (amt == null || Math.abs(Math.abs(t.amount) - amt) < Math.max(0.01, amt * 0.01)) && (!dp || dp(t.date))); if ((amt != null || dp) && m.length === 1) hit = m[0]; }
    if (!hit) { const w = ciTokens(raw).filter(x => !TX_GENERIC.has(x)); const m = w.length ? opts.filter(t => w.every(x => ciTokens(`${t.payee} ${t.rawPayee || ''}`).some(p => tokSame(x, p)))) : []; if (m.length === 1) hit = m[0]; else if (m.length > 1 && m.length < opts.length) { d.pending = m.map(t => t.id); return txPrompt(); } }
    if (hit) return txPick(hit.id);
    CI.heard = `I didn’t catch which one. ${txPrompt()} Say a date, an amount, or “all”.`; return CI.heard;
  }
  if (d.choose?.length || d.needCat) {
    const m = ciMatchCategory(s, null), pick = d.choose ? (d.choose.find(id => id === m.best) || (m.options || []).find(id => d.choose.includes(id))) : m.best;
    if (pick) return txChooseCat(pick);
  }
  if (/^(yes|yep|yeah|sure|save( it)?|do it|go ahead|correct|that'?s right|confirm|ok(ay)?|sounds good)\b[.!]?$/.test(s) && !d.needCat && !d.choose?.length) return txApply();
  // more for the same transactions: "and make a rule", "for Julissa", "actually household"
  const targets = d.ids.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  if (targets.length) {
    const more = txAction(raw.replace(/^\s*(yes|yeah|yep|sure|ok(ay)?)\b[,.]?\s*/i, ''), targets, d.set.categoryId);
    if (Object.keys(more.set).length || more.rules.length || more.choose) {
      Object.assign(d.set, more.set);
      if (more.set.categoryId) { delete d.set.splits; for (const r of d.rules) if (!r.categoryId || r.auto) r.categoryId = more.set.categoryId; }
      if (more.set.splits) delete d.set.categoryId;
      d.rules.push(...more.rules.filter(r => !d.rules.some(x => x.text === r.text)));
      if (more.choose) d.choose = more.choose;
      d.needCat = d.rules.some(r => !r.categoryId);
      return txPrompt();
    }
  }
  CI.heard = `I didn’t catch that. ${txPrompt()}`; return CI.heard;
}
function txApply() {
  const d = CI.draft; if (!d) return '';
  if (d.pending?.length || d.choose?.length || d.needCat || txOverSplit(d)) return txPrompt();
  const targets = d.ids.map(id => state.transactions.find(t => t.id === id)).filter(Boolean), s = d.set;
  for (const t of targets) {
    if (s.categoryId) { t.categoryId = s.categoryId; delete t.splits; if (t.flag && s.flag !== true) delete t.flag; }
    if (s.splits) {
      const total = round2(t.amount); let left = total; const parts = [];
      s.splits.forEach((p, i) => { let a = i === s.splits.length - 1 ? left : p.amount != null ? round2(Math.sign(total) * Math.abs(p.amount)) : round2(total / s.splits.length); if (Math.abs(a) > Math.abs(left)) a = left; parts.push({ categoryId: p.categoryId, amount: a, memo: '' }); left = round2(left - a); });
      t.splits = parts; t.categoryId = '__split'; if (t.flag && s.flag !== true) delete t.flag;
    }
    if (s.person) t.person = s.person;
    if (s.memo) t.memo = s.memo;
    if (s.payee) t.payee = s.payee;
    if (s.flag === true) t.flag = true; else if (s.flag === false) delete t.flag;
  }
  let filed = 0;
  const made = [], had = [];
  for (const r of d.rules) {
    const rec = { text: r.text, categoryId: r.categoryId, ...(r.amt ? { amt: r.amt } : {}), ...(r.dir ? { dir: r.dir } : {}), ...(r.acct ? { acct: r.acct } : {}) };
    const twin = !ruleHasConds(rec) ? state.rules.find(x => x.text === rec.text && !ruleHasConds(x)) : null;
    if (twin && twin.categoryId === rec.categoryId) { had.push(r.label || prettyPayee(rec.text)); continue; }
    if (twin) twin.categoryId = rec.categoryId; else state.rules.unshift({ id: uid(), ...rec });
    for (const x of state.transactions) if (!targets.includes(x) && isUncat(x) && !x.flag && !isSplit(x) && ruleMatches(rec, x.rawPayee || x.payee, x)) { x.categoryId = rec.categoryId; filed++; }
    made.push(r.label || prettyPayee(rec.text));
  }
  commit({ silent: true });
  const bits = txChangeWords(d).filter(b => !/^(New rule|Change your rule|You already have a rule|This replaces|It’s filed|\d+ of them are)/.test(b));
  const text = `${bits.length ? bits.join('; ') + '.' : ''}${made.length ? ` ${made.length === 1 ? 'Made a rule' : `Made ${made.length} rules`} for ${listWords(made.map(m => `“${m}”`))}${filed ? `, and filed ${filed} more like ${made.length === 1 ? 'it' : 'them'}` : ''}.` : ''}${had.length ? ` You already had ${had.length === 1 ? 'that rule' : 'those rules'}.` : ''}`.trim() || 'Nothing needed changing.';
  CI.last = { text, undo: true, n: 0 };
  CI.draft = null;
  return text;
}
function txCardHtml() {
  const d = CI.draft; if (!d) return '';
  const targets = d.ids.map(id => state.transactions.find(t => t.id === id)).filter(Boolean);
  const pend = d.pending?.length ? d.pending.map(id => state.transactions.find(t => t.id === id)).filter(Boolean) : null;
  const list = targets.slice(0, 4).map(t => `<li>${esc(txLabel(t))}<span class="muted"> · ${esc(catName(t.categoryId))}</span></li>`).join('') + (targets.length > 4 ? `<li class="muted">and ${targets.length - 4} more</li>` : '');
  const changes = txChangeWords(d).map(w => `<li>${esc(w)}</li>`).join('');
  const preview = d.rules.map(r => { const n = state.transactions.filter(x => !d.ids.includes(x.id) && isUncat(x) && !x.flag && !isSplit(x) && ruleMatches(r, x.rawPayee || x.payee, x)).length; return n ? `<li class="muted">The rule for “${esc(r.label || prettyPayee(r.text))}” would also file ${n} uncategorized</li>` : ''; }).join('');
  const chips = pend ? [...pend.slice(0, 8).map(t => [t.id, `${dateLabel(t.date)} · ${money(t.amount)} · ${prettyPayee(t.payee)}`]), ...(pend.length > 1 ? [['all', `All ${pend.length}`]] : [])]
    : d.choose?.length ? d.choose.map(id => [id, catName(id)]) : [];
  const act = pend ? 'tx-pick' : 'tx-cat';
  const ready = !pend && !d.choose?.length && !d.needCat && !txOverSplit(d);
  return `<section class="panel ci-card tell-card"><div class="ci-top"><span class="ci-kicker">${d.ids.length || pend ? 'Transactions' : d.rules.length === 1 ? 'Rule' : 'Rules'}</span></div>
    ${list ? `<ul class="upd-list tx-targets">${list}</ul>` : ''}
    ${changes ? `<ul class="upd-list">${changes}${preview}</ul>` : ''}
    <p class="ci-guess tell-q">${esc(ready ? (changes ? 'Save this?' : 'Nothing to change.') : txPrompt())}</p>
    ${chips.length ? `<div class="ci-chips">${chips.map(([v, l]) => `<button class="ci-chip" data-ci="${act}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>` : ''}
    ${d.needCat && !d.choose?.length ? `<select class="ci-pick" data-talk-cat aria-label="Category for the rule"><option value="">Pick a category…</option>${catOptions('', false)}</select>` : ''}
    <div class="ci-actions">${ready && changes ? '<button class="btn primary" data-ci="tx-save">Save</button>' : ''}</div>
    <div class="ci-foot"><button class="btn ghost" data-ci="tx-cancel">Cancel</button></div></section>`;
}

/* ---------- wiring ---------- */
document.addEventListener('click', e => {
  const open = e.target.closest('[data-talk-open]');
  if (open) {
    e.preventDefault();
    const [kind, id] = (open.dataset.talkOpen || '').split(':');
    if (open.closest('#modal')) closeModal(true);
    if (TALK.open && !id) return closeTalk();
    return openTalk(kind && id ? { kind, id } : null);
  }
  const el = e.target.closest('[data-talk]'); if (!el) return;
  e.preventDefault();
  const a = el.dataset.talk;
  if (a === 'close') return closeTalk();
  if (a === 'clear-ctx') { UI.talkCtx = null; return paintTalk(); }
  if (a === 'speak') { TALK.speak = !TALK.speak; if (!TALK.speak) ciHush(); return paintTalk(); }
  if (a === 'example') { const inp = $('#talk-say'); if (inp) { inp.value = el.dataset.v.replace(/ …$/, ' '); inp.focus(); } }
});
document.addEventListener('submit', e => {
  if (!e.target.matches('[data-talk-say]')) return;
  e.preventDefault();
  talkSubmit($('#talk-say')?.value || '');
});
document.addEventListener('change', e => {
  if (!e.target.matches('[data-talk-cat]') || !e.target.value) return;
  const v = e.target.value;
  const reply = withTalk(() => txChooseCat(v));
  render(); if (TALK.speak && reply) ciSpeak(reply);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && TALK.open && (e.target.closest?.('#talk') || !$('#modal'))) { closeTalk(); return; }
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (typing || e.metaKey || e.ctrlKey || e.altKey || $('#modal') || $('#present') || document.body.classList.contains('locked')) return;
  if (e.key === 't' && talkOn()) { e.preventDefault(); TALK.open ? $('#talk-say')?.focus() : openTalk(); }
});
