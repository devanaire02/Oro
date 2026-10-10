/* ================= Claude help (optional, off by default) =================
   When Ọrọ̀'s own understanding (on the device) doesn't catch what you said, or you ask a question about your spending,
   it can ask Claude, Anthropic's AI, with your own API key. It stays off until you turn it on, separately on each device.
   What's sent is kept small: your words; for the transactions involved, the payee (long numbers removed), amount, date,
   category and flag; your category names; and for questions, totals by category and month and your top payees. People and
   accounts go as codes (P1, A2), and their names in your words are swapped for the codes before sending. Account names
   and numbers, balances, notes, receipts, files and the passphrase never leave the device.
   Claude only suggests: changes come back as the same cards Talk shows, checked against your data, and nothing is saved
   until you say yes. The key is kept on this device only (in its browser storage, never in oro.json or a change file),
   locked with your passphrase. Every request can be shown to you before it's sent, and each one is logged on the device.
   This is the only place Ọrọ̀ goes online; the page's security policy lets it reach api.anthropic.com and nothing else. */
const AI_URL = 'https://api.anthropic.com/v1/messages';
const AI_MODELS = {
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5', in: 0.10, out: 0.50, effort: true, note: 'Fast. Usually well under a cent a request.' },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5', in: 2, out: 10, effort: true, note: 'More careful. About 20 times the cost of Haiku 5.5.' },
  'claude-haiku-4-5-20251001': { label: 'Claude Haiku 4.5', in: 1, out: 5, effort: false, hidden: true },
};
const AI_FALLBACK = { 'claude-haiku-5-5': 'claude-haiku-4-5-20251001' };   // if a model isn't available to the key
const AI_CAPS = [[1, '$1'], [2, '$2'], [5, '$5'], [10, '$10'], [25, '$25'], [0, 'No limit']];
const AI_DEFAULTS = { on: false, model: 'claude-haiku-5-5', preview: true, auto: false, cap: 5 };
const AI_KEY_ID = 'ai.key', AI_LOG_ID = 'ai.log', AI_LOG_MAX = 40;
const AI = { rec: undefined, key: null, keyPass: null, state: 'none', ck: new Map(), log: null, seq: 0, model: null, abort: null, cancelled: false, busy: false };
class AiError extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }

/* ---------- this device's settings (not secret; kept with the device's other settings) ---------- */
let AI_MEM = null;
function aiPrefs() {
  if (AI_MEM) return { ...AI_DEFAULTS, ...AI_MEM };
  try { return { ...AI_DEFAULTS, ...JSON.parse(localStorage.getItem('oro.ai') || '{}') }; } catch (e) { return { ...AI_DEFAULTS }; }
}
function setAiPref(k, v) {
  const p = { ...aiPrefs(), [k]: v };
  try { localStorage.setItem('oro.ai', JSON.stringify(p)); AI_MEM = null; } catch (e) { AI_MEM = p; }
}
const aiDev = () => isCompanion() ? deviceLabel() : 'Mac';
const aiModel = () => { const m = AI.model || aiPrefs().model; return AI_MODELS[m] ? m : AI_DEFAULTS.model; };
/* On, with a key saved on this device (the key itself is unlocked when it's first needed) */
const aiReady = () => aiPrefs().on && !!AI.rec;

/* ---------- the key and the log, locked with the passphrase ---------- */
async function aiRecLoad() {
  if (AI.rec === undefined) { try { AI.rec = (await IDB.get(AI_KEY_ID)) || null; } catch (e) { AI.rec = null; } }
  return AI.rec;
}
async function aiCk(pass, salt) {
  const k = `${salt}|${pass}`;
  if (!AI.ck.has(k)) { AI.ck.clear(); AI.ck.set(k, await Vault.key(pass, unb64(salt))); }
  return AI.ck.get(k);
}
async function aiSeal(text) {
  if (!Store.pass || !Vault.available()) return { enc: false, text };
  const salt = AI.rec?.enc && AI.rec.salt && AI.keyPass === Store.pass ? AI.rec.salt : b64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aiCk(Store.pass, salt), new TextEncoder().encode(text));
  return { enc: true, salt, iv: b64(iv), data: b64(ct) };
}
async function aiOpen(rec, pass = Store.pass) {
  if (!rec.enc) return rec.text;
  if (!pass) throw new Error('locked');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, await aiCk(pass, rec.salt), unb64(rec.data));
  return new TextDecoder().decode(pt);
}
async function aiKey() {
  await aiRecLoad();
  if (!AI.rec) { AI.state = 'none'; return null; }
  if (AI.key) {
    if (AI.keyPass !== (Store.pass || null)) await aiSaveKey(AI.key);   // the passphrase changed: lock it again with the new one
    return AI.key;
  }
  try {
    AI.key = await aiOpen(AI.rec); AI.keyPass = Store.pass || null; AI.state = 'ready';
    if (!AI.rec.enc && Store.pass) await aiSaveKey(AI.key);   // saved before a passphrase was added
    return AI.key;
  } catch (e) { AI.state = 'stale'; return null; }
}
async function aiSaveKey(key) {
  AI.keyPass = Store.pass || null;
  const rec = { v: 1, ...(await aiSeal(key)), tail: key.slice(-4), saved: new Date().toISOString() };
  await IDB.set(AI_KEY_ID, rec);
  AI.rec = rec; AI.key = key; AI.state = 'ready';
  if (AI.log) await aiLogSave();   // the log follows the key's lock
}
async function aiForgetKey() {
  try { await IDB.del(AI_KEY_ID); } catch (e) { /* ignore */ }
  AI.rec = null; AI.key = null; AI.keyPass = null; AI.state = 'none';
}
/* Settings › Security changed the passphrase (or removed it): lock the key and the log again under the new one */
async function aiRekey(oldPass) {
  try {
    await aiRecLoad(); if (!AI.rec) return;
    if (!AI.key) { try { AI.key = await aiOpen(AI.rec, oldPass); } catch (e) { return; } }
    if (!AI.log) { try { const r = await IDB.get(AI_LOG_ID); AI.log = r ? JSON.parse(await aiOpen(r, oldPass)) : []; } catch (e) { AI.log = []; } }
    await aiSaveKey(AI.key);
  } catch (e) { console.warn('Claude key:', e); }
}
async function aiLogLoad() {
  if (AI.log) return AI.log;
  try { const r = await IDB.get(AI_LOG_ID); AI.log = r ? JSON.parse(await aiOpen(r)) : []; } catch (e) { AI.log = []; }
  return AI.log;
}
async function aiLogSave() { try { await IDB.set(AI_LOG_ID, await aiSeal(JSON.stringify(AI.log || []))); } catch (e) { /* the log is a convenience */ } }
async function aiLogAdd(entry) {
  const log = await aiLogLoad();
  log.unshift(entry); if (log.length > AI_LOG_MAX) log.length = AI_LOG_MAX;
  await aiLogSave();
}

/* ---------- what it costs (an estimate from the token counts Anthropic sends back) ---------- */
function aiUsage() {
  const blank = { month: thisMonth(), n: 0, cost: 0 };
  try { const u = JSON.parse(localStorage.getItem('oro.ai.usage') || 'null'); return u && u.month === thisMonth() ? u : blank; } catch (e) { return blank; }
}
function aiAddUsage(cost) {
  const u = aiUsage(); u.n++; u.cost = Math.round((u.cost + cost) * 1e6) / 1e6;
  try { localStorage.setItem('oro.ai.usage', JSON.stringify(u)); } catch (e) { /* ignore */ }
}
function aiCost(model, u = {}) {
  const m = AI_MODELS[model] || AI_MODELS[AI_DEFAULTS.model];
  const inTok = (u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0);
  return (inTok * m.in + (u.output_tokens || 0) * m.out) / 1e6;
}
const aiCostLabel = c => c < 0.01 ? 'under a cent' : `about ${money(c)}`;
function aiCspOk() {
  const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  return !m || /connect-src[^;]*https:\/\/api\.anthropic\.com/.test(m.content);
}

/* ---------- one request ---------- */
function aiHttpError(status, type, msg) {
  if (status === 401) { AI.state = 'bad'; return new AiError('Anthropic didn’t accept the API key. Check it in Settings › Claude help.', 'key'); }
  if (status === 403) return new AiError('This API key isn’t allowed to do that. Check its workspace in the Claude Console.', 'key');
  if (status === 400 && /credit balance|billing|purchase credits/i.test(msg)) return new AiError('Your Anthropic credit balance is too low. Add credits in the Claude Console (Billing).', 'credit');
  if (status === 429) return new AiError('Too many requests to Claude right now. Try again in a minute.', 'rate');
  if (status === 413) return new AiError('That was too much to send at once.', 'size');
  if (status >= 500 || status === 529) return new AiError('Claude is busy right now. Try again shortly.', 'busy');
  return new AiError(`Claude couldn’t take that request (${status}${msg ? `: ${msg}` : ''}).`, 'http');
}
async function aiSend(body, key) {
  const ctl = new AbortController();
  AI.abort = ctl; AI.cancelled = false;
  const timer = setTimeout(() => ctl.abort(), 60000);
  let res;
  try {
    res = await fetch(AI_URL, {
      method: 'POST', body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    });
  } catch (e) {
    if (e.name === 'AbortError') throw AI.cancelled ? new AiError('', 'cancelled') : new AiError('Claude took too long to answer. Try again.', 'timeout');
    throw new AiError(navigator.onLine === false ? 'You’re offline, so Claude can’t be reached.' : 'Couldn’t reach Anthropic. Check the connection and try again.', 'network');
  } finally { clearTimeout(timer); AI.abort = null; }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}
function aiCancel() { if (AI.abort) { AI.cancelled = true; AI.abort.abort(); } }
/* Ask Claude. what: { kind, label, codes } for the preview and the log. Returns { data, model, cost }. */
async function aiCall({ system, user, tools, maxTokens = 1500, effort = 'low', what = {}, preview = true }) {
  const p = aiPrefs();
  if (!p.on) throw new AiError('Claude help is off on this ' + aiDev() + '. Turn it on in Settings › Claude help.', 'off');
  if (!aiCspOk()) throw new AiError('This copy of Ọrọ̀ is older and can’t connect to Claude. Update it, then try again.', 'csp');
  const key = await aiKey();
  if (!key) throw new AiError(AI.state === 'stale' ? 'Your saved API key was locked with a different passphrase. Paste it again in Settings › Claude help.' : 'Add your API key in Settings › Claude help first.', 'key');
  const u = aiUsage();
  if (p.cap && u.cost >= p.cap) throw new AiError(`This month’s Claude use on this ${aiDev()} has reached your ${money(p.cap)} limit. You can raise it in Settings › Claude help.`, 'cap');
  if (navigator.onLine === false) throw new AiError('You’re offline, so Claude can’t be reached.', 'offline');
  const model = aiModel();
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
  if (tools) { body.tools = tools; body.tool_choice = { type: 'auto' }; }
  if (effort && AI_MODELS[model].effort) body.output_config = { effort };
  if (p.preview && preview && !(await aiPreview(body, what))) throw new AiError('', 'cancelled');
  AI.busy = true;
  what.onSend?.();
  const at = new Date().toISOString();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { status, data } = await aiSend(body, key);
      if (status === 200 && data) {
        const cost = aiCost(body.model, data.usage);
        aiAddUsage(cost);
        await aiLogAdd({ at, kind: what.label || what.kind || 'Request', model: body.model, system, user, reply: aiReplyText(data), tin: data.usage?.input_tokens || 0, tout: data.usage?.output_tokens || 0, cost });
        if (AI.state === 'bad') AI.state = 'ready';
        return { data, model: body.model, cost };
      }
      const msg = data?.error?.message || '', type = data?.error?.type || '';
      if ((status === 404 || /model/i.test(msg) && status === 400 && /not.?found|does not exist|invalid model/i.test(msg)) && AI_FALLBACK[body.model]) {
        body.model = AI_FALLBACK[body.model]; AI.model = body.model;
        if (!AI_MODELS[body.model].effort) delete body.output_config;
        continue;
      }
      if (status === 400 && body.output_config && /output_config|effort/i.test(msg)) { delete body.output_config; continue; }
      const err = aiHttpError(status, type, msg);
      await aiLogAdd({ at, kind: what.label || what.kind || 'Request', model: body.model, system, user, reply: '', err: err.message, cost: 0 });
      throw err;
    }
    throw new AiError('Claude couldn’t take that request.', 'http');
  } catch (e) {
    if (e instanceof AiError && ['network', 'timeout'].includes(e.kind)) await aiLogAdd({ at, kind: what.label || what.kind || 'Request', model: body.model, system, user, reply: '', err: e.message, cost: 0 });
    throw e;
  } finally { AI.busy = false; }
}
function aiReplyText(data) {
  return (data?.content || []).map(c => c.type === 'text' ? c.text : c.type === 'tool_use' ? JSON.stringify(c.input, null, 1) : '').filter(Boolean).join('\n').trim();
}
const aiText = data => (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
function aiTool(data, name) {
  const use = (data?.content || []).find(c => c.type === 'tool_use' && c.name === name);
  if (use) return use.input || {};
  const t = aiText(data), m = t.match(/\{[\s\S]*\}/);   // a reply written out as JSON instead of a tool call
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* not JSON */ } }
  return t ? { reply: t } : null;
}

/* ---------- see it before it's sent ---------- */
function aiPreview(body, what) {
  return new Promise(res => {
    const chars = JSON.stringify(body).length, tokens = Math.round(chars / 3.6), m = AI_MODELS[body.model];
    const est = (tokens * m.in + Math.min(body.max_tokens, 900) * m.out) / 1e6;
    const codes = what.codes ? [...what.codes.people.map(p => `${p.code} = ${p.name}`), ...what.codes.accounts.filter(a => (body.messages[0].content || '').includes(a.code + ' ') || (body.messages[0].content || '').includes(a.code + ':')).map(a => `${a.code} = ${a.name}`)] : [];
    openModal({
      title: 'Send this to Claude?',
      body: `<p>${esc(what.intro || 'Ọrọ̀ will send this')} to Anthropic’s ${esc(m.label)} with your key. About ${tokens.toLocaleString()} tokens, ${aiCostLabel(est)}.</p>
        ${what.said ? `<p class="ai-said">Your words, as sent: “${esc(what.said)}”</p>` : ''}
        <p class="muted small">People and accounts are sent as codes, and names in your words were swapped for them. No account names or numbers, balances, notes or passphrase.</p>
        <pre class="ai-pre" tabindex="0">${esc(body.messages[0].content)}</pre>
        ${codes.length ? `<details class="ai-codes"><summary>What the codes mean (kept on this ${esc(aiDev())})</summary><p class="small">${codes.map(esc).join(' · ')}</p></details>` : ''}
        <details><summary>Instructions sent with it</summary><pre class="ai-pre small">${esc(body.system)}</pre></details>
        <label class="check small ai-skip"><input type="checkbox" id="ai-skip-preview"> Don’t show this before sending on this ${esc(aiDev())}</label>`,
      actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ai-send">Send to Claude</button>`,
    });
    _modalResolve = v => res(!!v);
    $('#ai-send').onclick = () => { if ($('#ai-skip-preview')?.checked) setAiPref('preview', false); _modalResolve = null; closeModal(true); res(true); };
  });
}

/* ---------- codes for people and accounts, and what to leave out ---------- */
const AI_NAME_STOP = new Set(['you', 'me', 'my', 'partner', 'joint', 'kid', 'kids', 'child', 'spouse', 'wife', 'husband', 'mom', 'dad', 'other', 'new trust', 'household', 'checking', 'savings', 'credit card', 'brokerage', 'home', 'house', 'car']);
function aiCodebook() {
  const people = [], accounts = [];
  for (const m of members()) if (m.id !== 'joint') people.push({ code: `P${people.length + 1}`, id: m.id, name: m.name, role: OWNER_ROLES[roleOf(m.id)] || '' });
  for (const a of activeAccounts()) accounts.push({ code: `A${accounts.length + 1}`, id: a.id, name: a.name, last4: a.last4 || '', desc: `${(ACCOUNT_TYPES[a.type]?.label || a.type).toLowerCase()}${a.institution ? ` at ${aiScrub(a.institution)}` : ''}`, owner: a.owner || 'joint' });
  return { people, accounts };
}
const aiPersonCode = (cb, id) => !id || id === 'joint' ? 'Joint' : cb.people.find(p => p.id === id)?.code || 'Joint';
function aiPersonId(code, cb) {
  const c = String(code || '').trim();
  if (/^joint$/i.test(c)) return 'joint';
  return cb.people.find(p => p.code.toLowerCase() === c.toLowerCase())?.id || null;
}
/* Payees and institutions: no card, account, phone or store numbers, no email addresses */
function aiScrub(s) {
  return String(s || '').replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/[A-Za-z0-9]{6,}/g, w => (w.match(/\d/g) || []).length >= 2 && !/[A-Za-z]{4,}/.test(w) ? '#' : w)   // order and reference codes (Amazon.com*S18KN3WG2), not names like 1800Flowers
    .replace(/[A-Za-z]*\d[\d-]{3,}[A-Za-z]*/g, '#').replace(/\s+/g, ' ').trim().slice(0, 60);
}
/* Your words: account and people names → codes; "ending 1234" → the account's code; long numbers out */
function aiMask(text, cb, { accounts = true } = {}) {
  let s = String(text || '');
  if (accounts) s = s.replace(/\b(?:ending(?: in)?|ends? in|last (?:4|four)(?: digits)?(?: of)?|x{2,}|#|…|\.\.\.)\s*(\d{4})\b/gi, (m, d) => cb.accounts.find(a => a.last4 === d)?.code || 'an account');
  const names = [...(accounts ? cb.accounts.map(a => [a.name, a.code]) : []), ...cb.people.map(p => [p.name, p.code])]
    .filter(([n]) => n && n.trim().length >= 3 && !AI_NAME_STOP.has(n.trim().toLowerCase())).sort((a, b) => b[0].length - a[0].length);
  for (const [n, code] of names) s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(n.trim())}(?=[^\\p{L}\\p{N}]|$)`, 'giu'), `$1${code}`);
  return s.replace(/\d{9,}/g, '#');
}
/* Codes in Claude's words → names, on the device */
function aiUnmask(text, cb) {
  return String(text || '').replace(/\b([PA])(\d{1,3})\b/g, (m, k, n) => { const x = (k === 'P' ? cb.people : cb.accounts).find(y => y.code === k + n); return x ? x.name : m; });
}
function aiCategoryList() {
  return Object.entries(groupBy(state.categories, c => c.group)).map(([g, cs]) => `${g}: ${cs.map(c => c.name + (c.kind === 'income' ? ' [income]' : c.kind === 'transfer' ? ' [transfer]' : '')).join('; ')}`).join('\n');
}
function aiCatId(name, t) {
  const n = String(name || '').replace(/\s*\[(income|transfer|expense)\]\s*$/i, '').replace(/^.*›\s*/, '').trim().toLowerCase();
  if (!n) return null;
  const exact = state.categories.filter(c => c.name.toLowerCase() === n);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) { const fit = exact.find(c => !t || (t.amount < 0 ? c.kind !== 'income' : c.kind !== 'expense')); return (fit || exact[0]).id; }
  return ciMatchCategory(n, t).best || null;
}
function aiPeopleLine(cb) { return [...cb.people.map(p => `${p.code} (${p.role || 'person'})`), 'Joint (shared)'].join(', '); }
function aiAccountLines(cb, only) {
  return cb.accounts.filter(a => !only || only.has(a.id)).map(a => `${a.code}: ${a.desc}, ${aiPersonCode(cb, a.owner)}`).join('\n');
}
function aiTxLine(t, code, cb) {
  const a = cb.accounts.find(x => x.id === t.accountId);
  const cat = isSplit(t) ? 'Split: ' + t.splits.map(s => `${catName(s.categoryId)} ${Math.abs(+s.amount || 0).toFixed(2)}`).join(', ') : isUncat(t) ? '(none)' : catName(t.categoryId);
  return [code, t.date, (t.amount < 0 ? '-' : '+') + Math.abs(t.amount).toFixed(2), aiMask(aiScrub(prettyPayee(t.payee) || t.payee), cb, { accounts: false }) || '(no payee)', a?.code || '-', cat, aiPersonCode(cb, personOf(t)), t.flag ? 'flagged' : ''].join(' | ').replace(/ \| $/, '');
}
const AI_TX_HEAD = 'code | date | amount (- is money out) | payee | account | category | for | flag';
const byDateDesc = (a, b) => b.date.localeCompare(a.date);

/* ---------- Talk: what Ọrọ̀ didn't understand ---------- */
/* The transactions Claude might need: the one open, the ones selected, any your words point at, then recent ones */
function aiCandidates(text, ctx, limit = 60) {
  const out = new Map(), add = t => { if (t && !out.has(t.id) && out.size < limit) out.set(t.id, t); };
  if (ctx.t) add(ctx.t);
  for (const id of ctx.sel) add(state.transactions.find(t => t.id === id));
  const low = String(text).toLowerCase();
  const words = ciTokens(text).filter(w => w.length >= 3 && !TX_GENERIC.has(w) && !/^\d/.test(w));
  const amt = txAmountHint(low), dp = txDateHint(low);
  const visible = ctx.page === 'transactions' && UI.txVisible?.length ? new Set(UI.txVisible) : null;
  const since = addDays(today(), -120);
  const pool = state.transactions.filter(t => visible ? visible.has(t.id) : t.date >= since);
  pool.map(t => {
    const toks = ciTokens(`${t.payee || ''} ${t.rawPayee || ''}`);
    let s = 2 * words.filter(w => toks.some(p => tokSame(w, p))).length;
    if (amt != null && Math.abs(Math.abs(t.amount) - amt) < 0.01) s += 3;
    if (s && dp && dp(t.date)) s += 1;
    return { t, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || byDateDesc(a.t, b.t)).slice(0, 40).forEach(x => add(x.t));
  if (!ctx.t && !ctx.sel.length) {
    pool.filter(t => isUncat(t) || t.flag).sort(byDateDesc).slice(0, 15).forEach(add);
    [...pool].sort(byDateDesc).forEach(add);
  }
  return [...out.values()];
}
const AI_PROPOSE_TOOL = {
  name: 'propose',
  description: 'Reply to the person, and propose changes. Ọrọ̀ shows each change to them and saves nothing until they say yes.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'One or two short, plain sentences to the person: what you are proposing, a question if you need to know which one, or why you can’t.' },
      changes: {
        type: 'array', description: 'Changes to transactions. Leave empty when asking a question.',
        items: {
          type: 'object',
          properties: {
            transactions: { type: 'array', items: { type: 'string' }, description: 'Codes like T3 of the transactions this change applies to. Empty for a rule on its own.' },
            category: { type: 'string', description: 'A category name exactly as in the list.' },
            split: { type: 'array', description: 'To split one transaction across categories. Dollar amounts are positive; leave out the amount on the last part to give it the rest; leave out every amount to split evenly.', items: { type: 'object', properties: { category: { type: 'string' }, amount: { type: 'number' } }, required: ['category'] } },
            person: { type: 'string', description: 'Who it is for: a P code, or Joint.' },
            flag: { type: 'boolean', description: 'true to flag it to come back to, false to clear a flag.' },
            note: { type: 'string', description: 'A short note to save on the transaction, only if they asked for one.' },
            rule: { type: 'object', description: 'Only if they asked to always do this.', properties: { payee_contains: { type: 'string', description: 'Merchant words the payee contains, like STARBUCKS.' }, category: { type: 'string' }, amount: { type: 'number', description: 'Only when the rule is for one exact amount.' }, direction: { type: 'string', enum: ['in', 'out'] } }, required: ['payee_contains', 'category'] },
          },
          required: ['transactions'],
        },
      },
      say: { type: 'array', items: { type: 'string' }, description: 'Only for accounts: short commands in Ọrọ̀’s own words, like “A2 is 12400”, “rename A3 to Blue Cash”, “A4 rate is 6.25 percent”, “add a savings account at Ally with 40000”.' },
    },
    required: ['reply'],
  },
};
const AI_PROPOSE_SYSTEM = `You help inside Ọrọ̀, a private household finance app. The person typed or dictated something to Ọrọ̀ that its simple on-device parser didn't understand. Work out what they want and call the propose tool.
You can propose: a category for transactions, or a split of one transaction across categories; who a transaction is for (a person code); flagging or unflagging; a short note; and a categorization rule ("payee contains X → category"), only if they ask for it to always happen.
For account balances, values, renames, interest rates or new accounts, don't use changes: put a short command in "say" in Ọrọ̀'s phrasing, using account codes.
Use transaction codes, category names, person codes and account codes exactly as listed. Never invent codes. If they name a category that doesn't exist, use the closest one and say so in the reply.
If it's unclear which transaction they mean, ask in the reply and propose nothing. If they ask a question instead, answer briefly in the reply.
People and accounts are codes on purpose; use the codes. Amounts below 0 are money out. Nothing changes until the person confirms, so be precise rather than cautious. Keep the reply to one or two short plain sentences.`;
function aiProposeRequest(text, ctx) {
  const cb = aiCodebook(), txs = aiCandidates(text, ctx), T = {};
  const lines = txs.map((t, i) => { T[`T${i + 1}`] = t.id; return aiTxLine(t, `T${i + 1}`, cb); });
  const pageName = PAGES.find(p => p[0] === ctx.page)?.[1] || ctx.page;
  const where = ctx.t ? `They have T1 open.` : ctx.sel.length ? `They selected ${ctx.sel.length === 1 ? 'T1' : `T1 to T${Math.min(ctx.sel.length, txs.length)}`}.` : `They're on the ${pageName} page.`;
  const used = new Set(txs.map(t => t.accountId));
  if (ctx.a) used.add(ctx.a.id);
  const acctCode = ctx.a ? cb.accounts.find(a => a.id === ctx.a.id)?.code : '';
  const user = `Today is ${today()}. ${where}${acctCode ? ` They have account ${acctCode} open.` : ''}
People: ${aiPeopleLine(cb)}
Accounts:
${aiAccountLines(cb)}
Categories by group:
${aiCategoryList()}
Transactions (${AI_TX_HEAD}):
${lines.join('\n') || '(none)'}

What they said: "${aiMask(text, cb)}"`;
  return { user, T, cb, said: aiMask(text, cb) };
}
/* Claude's proposal → Talk's own change cards, checked against your data */
function aiDrafts(out, T, cb, reply) {
  const drafts = [], notes = [];
  for (const ch of Array.isArray(out?.changes) ? out.changes : []) {
    const ids = [...new Set((Array.isArray(ch.transactions) ? ch.transactions : []).map(c => T[String(c).trim().toUpperCase()]).filter(Boolean))];
    const targets = ids.map(id => state.transactions.find(t => t.id === id)).filter(Boolean), t0 = targets[0] || null;
    const set = {}, rules = [];
    if (Array.isArray(ch.split) && ch.split.length >= 2 && targets.length === 1) {
      const parts = ch.split.map(p => ({ categoryId: aiCatId(p.category, t0), amount: +p.amount > 0 ? round2(+p.amount) : null }));
      if (parts.every(p => p.categoryId)) { parts[parts.length - 1].amount = null; set.splits = parts; }
      else notes.push(`Claude named a category you don’t have (${ch.split.filter((p, i) => !parts[i].categoryId).map(p => `“${p.category}”`).join(', ')}).`);
    } else if (ch.category) {
      const id = aiCatId(ch.category, t0);
      if (id) set.categoryId = id; else notes.push(`Claude named a category you don’t have (“${ch.category}”).`);
    }
    if (ch.person) { const pid = aiPersonId(ch.person, cb); if (pid) set.person = pid; }
    if (typeof ch.flag === 'boolean') set.flag = ch.flag;
    if (ch.note && String(ch.note).trim()) set.memo = aiUnmask(String(ch.note).trim(), cb).slice(0, 200);
    if (ch.rule?.payee_contains) {
      const catId = aiCatId(ch.rule.category, t0) || set.categoryId || null, key = normPayee(aiUnmask(ch.rule.payee_contains, cb));
      if (key && catId) rules.push({ text: key, label: key.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()), categoryId: catId, auto: false, own: false, wanted: '',
        ...(+ch.rule.amount > 0 ? { amt: { op: 'eq', a: round2(+ch.rule.amount) } } : {}), ...(ch.rule.direction === 'in' || ch.rule.direction === 'out' ? { dir: ch.rule.direction } : {}) });
    }
    if (!targets.length && !rules.length) continue;
    if (!Object.keys(set).length && !rules.length) continue;
    const who = targets.length === 1 ? prettyPayee(t0.payee) || t0.payee : targets.length ? `${targets.length} transactions` : 'a rule';
    drafts.push({ ids: targets.map(t => t.id), pending: null, set, rules, choose: null, needCat: false, label: who, fromAi: true });
  }
  if (drafts[0]) drafts[0].ai = [reply, ...notes].filter(Boolean).join(' ');
  return { drafts, notes, say: (Array.isArray(out?.say) ? out.say : []).map(s => aiUnmask(String(s), cb).trim()).filter(Boolean).slice(0, 4) };
}

/* One of Claude's account commands ("Chase Savings is 12400"), run through Ọrọ̀'s own understanding, which shows it to
   you to confirm like anything you say. It never asks Claude again about Claude's own words. */
function aiSay(cmd) {
  TALK.noOffer = true;
  try { const r = talkUnderstand(cmd, { split: false }); if (!CI.draft) CI.heard = r && !/^I didn’t catch/.test(r) ? r : `Claude suggested “${cmd}”, but Ọrọ̀ couldn’t make that change. Try saying it another way.`; return CI.heard || r; }
  finally { TALK.noOffer = false; }
}

/* ---------- questions about your spending ---------- */
const AI_Q_STRONG = /^(?:how (?:much|many|often)|what (?:did|have|do) (?:we|i)|did (?:we|i) spend|have (?:we|i) spent|where (?:did|does|do) (?:we|i|our|my|the money)|who (?:spent|spends)|when did (?:we|i)|compare|summari[sz]e|break ?down|what(?:'s| is| was) (?:our|my|the) (?:biggest|largest|top|total|average|spending|income)|which (?:category|categories|month|months|payee|store|merchant))\b/;
const AI_QUESTION = /^(?:how (?:much|many|often|is|are|did|does|do|was|were|has|have|can|come)|how's|what(?:'s| is| are| was| were| did| do| does|\b)|which|when (?:did|was|were|do|does)|where (?:did|do|does|is|are)|who (?:spent|spends|paid|is|was)|why|did (?:we|i|you)|do (?:we|i)|does (?:it|that)|have (?:we|i)|has (?:our|my)|are (?:we|our|my)|am i|is (?:our|my|that|it)|was (?:our|my|it)|were (?:we|our)|can (?:we|i) afford|compare|summari[sz]e|break ?down|show me (?:how|what|where|our|my)|tell me (?:how|what|where|about|our|my)|give me (?:a |an )?(?:summary|breakdown|rundown|sense|overview)|explain)\b/;
function aiLooksLikeQuestion(low) {
  const s = low.replace(/^(?:hey|hi|ok(?:ay)?|so|um+|uh+|and|oro|ọrọ̀)[,!.]?\s+/g, '').trim();
  if (/\b(make|create|add) (?:a )?rules?\b|\b(rename|split|flag|categori[sz]e|file|mark)\b/.test(s)) return false;
  return AI_QUESTION.test(s) || (/\?\s*$/.test(low) && !/\b(is|are)\s+(?:groceries|dining|for)\b/.test(s));
}
function aiSpendingData(cb) {
  const end = thisMonth(), first = firstTxMonth(), months = [];
  for (let i = 12; i >= 0; i--) { const m = addMonths(end, -i); if (m >= first) months.push(m); }
  const n = months.length, rows = {}, people = {}, payees = {};
  months.forEach((mk, i) => {
    for (const t of txInMonth(mk)) for (const l of txLines(t)) {
      const c = catById(l.categoryId); if (c?.kind === 'transfer') continue;
      const id = l.categoryId || '_none';
      (rows[id] ||= Array(n).fill(0))[i] += c?.kind === 'income' ? l.amount : -l.amount;
      if (c?.kind !== 'income' && (c || l.amount < 0)) (people[aiPersonCode(cb, personOf(t))] ||= Array(n).fill(0))[i] += -l.amount;
    }
  });
  const yearAgo = addMonths(end, -11) + '-01';
  for (const t of state.transactions) {
    if (t.date < yearAgo || t.amount >= 0 || isTransferCat(t.categoryId)) continue;
    const name = aiMask(aiScrub(prettyPayee(t.payee) || t.payee), cb, { accounts: false }) || '(no payee)';
    const p = payees[name] ||= { total: 0, n: 0, cats: {}, last: '' };
    p.total += -t.amount; p.n++; const cn = catName(t.categoryId); p.cats[cn] = (p.cats[cn] || 0) + 1; if (t.date > p.last) p.last = t.date;
  }
  const r0 = v => Math.round(v);
  const catRow = id => { const c = catById(id); return `${c ? c.name : 'Uncategorized'}${c?.kind === 'income' ? ' [income]' : ''} | ${rows[id].map(r0).join(' | ')}`; };
  const ids = Object.keys(rows).filter(id => rows[id].some(v => Math.abs(v) >= 0.5));
  const order = id => { const c = catById(id); return `${c?.kind === 'income' ? 0 : 1}${c?.group || 'zz'}${c?.name || ''}`; };
  ids.sort((a, b) => order(a).localeCompare(order(b)));
  const flows = months.map(mk => flowSummary(txInMonth(mk)));
  const budgets = state.categories.filter(c => c.kind === 'expense' && c.budget > 0).map(c => `${c.name}: ${r0(c.budget)} a ${c.period === 'year' ? 'year' : 'month'}`);
  const top = Object.entries(payees).sort((a, b) => b[1].total - a[1].total).slice(0, 60)
    .map(([name, p]) => `${name} | ${r0(p.total)} | ${p.n} | ${Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0][0]} | ${p.last}`);
  return `Months: ${months.join(', ')} (${end} is this month, so far; today is ${today()}).
Totals by month (whole dollars; transfers between their own accounts and card payments are left out):
Money in | ${flows.map(f => r0(f.income)).join(' | ')}
Money out | ${flows.map(f => r0(f.spending)).join(' | ')}
By category (spending positive; [income] rows are money in):
category | ${months.join(' | ')}
${ids.map(catRow).join('\n')}
Spending by person (P codes; Joint is shared):
${Object.entries(people).map(([k, v]) => `${k} | ${v.map(r0).join(' | ')}`).join('\n')}
${budgets.length ? `Budgets: ${budgets.join('; ')}\n` : ''}Top payees, last 12 months (payee | total spent | times | usual category | last date):
${top.join('\n')}`;
}
const AI_ANSWER_SYSTEM = `You answer questions about a household's spending inside Ọrọ̀, a private finance app, using only the data given. Be brief and direct: one to four short sentences, or a short list with "- " bullets. Use whole dollars. Do the arithmetic carefully. If the data can't answer it (for example balances or net worth, which aren't included), say what's missing and where in Ọrọ̀ to look (Overview, Accounts, Reports, Budget). People are codes (P1, P2…; Joint is shared): use the codes, Ọrọ̀ shows the names. Don't give investment, tax or legal advice beyond explaining the numbers.`;
function aiAnswerRequest(text) {
  const cb = aiCodebook();
  const user = `${aiSpendingData(cb)}

People: ${aiPeopleLine(cb)}
Their question: "${aiMask(text, cb)}"`;
  return { user, cb, said: aiMask(text, cb) };
}
/* Claude's words on screen: plain paragraphs and "- " lists, nothing else */
function aiFormat(text) {
  const out = []; let list = null;
  for (const line of String(text || '').split(/\n+/)) {
    const l = line.trim(); if (!l) continue;
    const b = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const html = esc(b ? b[1] : l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^#+\s*/, '');
    if (b) { (list ||= []).push(`<li>${html}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    out.push(`<p>${html}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('');
}

/* ---------- Talk wiring ---------- */
function aiTalkOffer(text, mode = 'change') {
  TALK.ai = { status: 'offer', text, mode };
  if (aiPrefs().auto || mode === 'ask') TALK.ai.go = true;
}
async function aiTalkRun() {
  const a = TALK.ai; if (!a || a.status === 'busy') return;
  const seq = ++AI.seq;
  TALK.ai = { ...a, status: 'busy', seq, go: false }; paintTalk();
  try {
    const ctx = talkCtx();
    if (a.mode === 'ask') {
      const { user, cb, said } = aiAnswerRequest(a.text);
      const r = await aiCall({ system: AI_ANSWER_SYSTEM, user, maxTokens: 1500, effort: null, what: { kind: 'question', label: 'Talk: question', codes: cb, said, intro: 'Ọrọ̀ will send your question, your totals by category and month, and your top payees' } });
      if (AI.seq !== seq) return;
      TALK.ai = { status: 'answer', text: a.text, answer: aiUnmask(aiText(r.data), cb) || 'Claude didn’t answer that.', cost: r.cost, model: r.model };
      if (TALK.speak) ciSpeak(TALK.ai.answer);
    } else {
      const { user, T, cb, said } = aiProposeRequest(a.text, ctx);
      const r = await aiCall({ system: AI_PROPOSE_SYSTEM, user, tools: [AI_PROPOSE_TOOL], maxTokens: 2000, what: { kind: 'talk', label: 'Talk', codes: cb, said, intro: 'Ọrọ̀ will send what you said and the transactions it might be about' } });
      if (AI.seq !== seq) return;
      const out = aiTool(r.data, 'propose') || {};
      const reply = aiUnmask(out.reply || '', cb).trim();
      const { drafts, say, notes } = aiDrafts(out, T, cb, reply);
      TALK.ai = null;
      if (!drafts.length && !say.length) TALK.ai = { status: 'answer', text: a.text, answer: [reply, ...notes].filter(Boolean).join(' ') || 'Claude didn’t find anything to change.', cost: r.cost, model: r.model };
      else {
        TALK.queue = [...drafts.slice(1), ...say.map(x => ({ say: x }))];
        const first = drafts[0] || null;
        const said = withTalk(() => first ? txStart(first) : aiSay(TALK.queue.shift().say));
        if (!first && reply) TALK.ai = { status: 'answer', text: a.text, answer: reply, cost: r.cost, model: r.model };
        if (TALK.speak) ciSpeak(first ? `${reply} ${said}`.trim() : said);
      }
    }
  } catch (e) {
    if (AI.seq !== seq) return;
    TALK.ai = e.kind === 'cancelled' ? null : { status: 'error', text: a.text, mode: a.mode, error: e.message || 'Something went wrong asking Claude.' };
    if (!(e instanceof AiError)) console.error(e);
  }
  if (document.body.classList.contains('locked')) { TALK.ai = null; TALK.draft = null; return; }
  render();
}
function aiTalkCardHtml() {
  const a = TALK.ai; if (!a) return '';
  const cost = a.cost != null ? `<span class="muted small ai-cost">${esc(AI_MODELS[a.model]?.label || 'Claude')} · ${aiCostLabel(a.cost)}</span>` : '';
  if (a.status === 'offer') return `<section class="panel ci-card ai-card"><p class="ai-offer-line">Ọrọ̀ didn’t understand that${a.mode === 'ask' ? ' question' : ''}. Claude can try.</p>
    <div class="ci-actions"><button class="btn primary" data-talk="ai-ask">${AI_SPARK} Ask Claude</button><button class="btn ghost" data-talk="ai-dismiss">No thanks</button></div>
    <p class="muted small">Sends your words and the transactions they might be about, without account names, balances or notes.</p></section>`;
  if (a.status === 'busy') return `<section class="panel ci-card ai-card ai-busy" aria-live="polite"><p><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span> Asking Claude…</p><div class="ci-actions"><button class="btn ghost" data-talk="ai-cancel">Cancel</button></div></section>`;
  if (a.status === 'error') return `<section class="panel ci-card ai-card"><p class="ai-err">${esc(a.error)}</p><div class="ci-actions"><button class="btn" data-talk="ai-retry">Try again</button><a class="btn ghost" href="#/data" data-talk="ai-settings">Claude help settings</a></div></section>`;
  return `<section class="panel ci-card ai-card ai-answer"><div class="ci-top"><span class="ci-kicker">${AI_SPARK} Claude</span></div>${aiFormat(a.answer)}${cost}</section>`;
}
const AI_SPARK = '<svg class="ai-spark" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" opacity=".7"/></svg>';
document.addEventListener('click', e => {
  const el = e.target.closest('[data-talk^="ai-"]'); if (!el) return;
  e.preventDefault();
  const a = el.dataset.talk;
  if (a === 'ai-ask' || a === 'ai-retry') { if (TALK.ai) { TALK.ai.status = 'offer'; aiTalkRun(); } return; }
  if (a === 'ai-cancel') { AI.seq++; aiCancel(); TALK.ai = null; return paintTalk(); }
  if (a === 'ai-dismiss') { TALK.ai = null; return paintTalk(); }
  if (a === 'ai-settings') { closeTalk(); go('#/data'); setTimeout(() => $('#ai-settings')?.scrollIntoView({ block: 'start' }), 60); }
});

/* ---------- Check-in: an answer it didn't catch, or a transaction with no guess ---------- */
async function aiCheckinRun(item, text) {
  const t = item?.tx ? ciTx(item) : null; if (!t) return;
  const seq = ++AI.seq;
  CI.ai = { status: 'busy', item: item.id, text }; CI.heard = ''; render();
  try {
    const cb = aiCodebook(), T = { T1: t.id };
    const guess = !text;
    const hist = guess ? aiHistoryLines(cb, t) : '';
    const user = `Today is ${today()}. They're going through Check-in, on this transaction:
${AI_TX_HEAD}
${aiTxLine(t, 'T1', cb)}
Account ${cb.accounts.find(a => a.id === t.accountId)?.code || '-'} is ${cb.accounts.find(a => a.id === t.accountId)?.desc || 'unknown'}.
People: ${aiPeopleLine(cb)}
Categories by group:
${aiCategoryList()}
${hist ? `How they categorized similar payees before:\n${hist}\n` : ''}
${guess ? 'Suggest the most likely category for T1 (and who it’s for only if it’s clear). Say in the reply, in a few words, why.' : `What they said about it: "${aiMask(text, cb)}"`}`;
    const r = await aiCall({ system: AI_PROPOSE_SYSTEM, user, tools: [AI_PROPOSE_TOOL], maxTokens: 1500, what: { kind: 'checkin', label: guess ? 'Check-in: a guess' : 'Check-in', codes: cb, said: guess ? '' : aiMask(text, cb), intro: guess ? 'Ọrọ̀ will send this transaction and your category names' : 'Ọrọ̀ will send what you said and this transaction' } });
    if (AI.seq !== seq) return;
    const out = aiTool(r.data, 'propose') || {};
    const reply = aiUnmask(out.reply || '', cb).trim();
    const changes = (Array.isArray(out.changes) ? out.changes : []).filter(c => !c.transactions?.length || c.transactions.some(x => String(x).toUpperCase() === 'T1'));
    for (const c of changes) if (!c.transactions?.length && !c.rule) c.transactions = ['T1'];
    const { drafts, notes } = aiDrafts({ changes }, T, cb, reply);
    CI.ai = null;
    if (!drafts.length) { CI.heard = [reply, ...notes].filter(Boolean).join(' ') || 'Claude didn’t find anything to change.'; CI.aiNote = true; }
    else {
      // one card for this transaction: everything Claude proposed for it, together
      const d = drafts[0];
      for (const x of drafts.slice(1)) { Object.assign(d.set, x.set); d.rules.push(...x.rules); }
      if (d.set.splits) delete d.set.categoryId;
      if (!d.ids.length) d.ids = [t.id];
      CI.draft = { step: 'tx', ...d, ciItem: item.id };
      const said = txPrompt();
      if (CI.talking) ciSpeak(`${d.ai || ''} ${said}`.trim());
    }
  } catch (e) {
    if (AI.seq !== seq) return;
    CI.ai = e.kind === 'cancelled' ? null : { status: 'error', item: item.id, text, error: e.message || 'Something went wrong asking Claude.' };
    if (!(e instanceof AiError)) console.error(e);
  }
  render();
}
function aiHistoryLines(cb, t) {
  const words = new Set(ciTokens(`${t.payee} ${t.rawPayee || ''}`).filter(w => w.length >= 3));
  const seen = new Map();
  for (const x of [...state.transactions].sort(byDateDesc)) {
    if (x.id === t.id || isUncat(x) || isSplit(x) || isTransferCat(x.categoryId)) continue;
    const toks = ciTokens(`${x.payee} ${x.rawPayee || ''}`);
    if (!toks.some(w => words.has(w))) continue;
    const name = aiMask(aiScrub(prettyPayee(x.payee) || x.payee), cb, { accounts: false });
    if (!seen.has(name)) seen.set(name, catName(x.categoryId));
    if (seen.size >= 12) break;
  }
  return [...seen].map(([p, c]) => `${p} → ${c}`).join('\n');
}
function aiCheckinHtml(item) {
  const a = CI.ai;
  if (!a || !item || a.item !== item.id) return '';
  if (a.status === 'offer') return `<div class="ai-offer"><button class="btn" data-ci="ai-ask">${AI_SPARK} Ask Claude</button><span class="muted small">Sends what you said and this transaction, without account names, balances or notes.</span></div>`;
  if (a.status === 'busy') return `<div class="ai-offer ai-busy" aria-live="polite"><span><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span> Asking Claude…</span><button class="btn ghost small" data-ci="ai-cancel">Cancel</button></div>`;
  if (a.status === 'error') return `<div class="ai-offer"><span class="ai-err">${esc(a.error)}</span><button class="btn ghost small" data-ci="ai-retry">Try again</button></div>`;
  return '';
}

/* ---------- Transactions: suggest categories for the uncategorized ones ---------- */
const AI_SUGGEST_TOOL = {
  name: 'suggest',
  description: 'A category suggestion for each transaction.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            t: { type: 'string', description: 'The transaction code, like T4.' },
            category: { type: 'string', description: 'A category name exactly as in the list.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            why: { type: 'string', description: 'A few words, like “coffee shop” or “you file Target under Shopping”.' },
          },
          required: ['t', 'category', 'confidence'],
        },
      },
    },
    required: ['suggestions'],
  },
};
const AI_SUGGEST_SYSTEM = `You suggest categories for a household's uncategorized transactions inside Ọrọ̀, a private finance app. For every transaction listed, call the suggest tool with the most likely category from their list, exactly as written. Their own past choices are the strongest signal; then what the merchant is. Transfers between their own accounts and credit card payments go under the Transfers group; refunds go where the purchase would. Give your best guess even when unsure, with low confidence.`;
const AI_SORT_MAX = 60;
async function aiSortUncategorized() {
  if (AI.busy) return toast('Claude is still working on the last request.');
  const list = state.transactions.filter(t => isUncat(t) && !isSplit(t)).sort(byDateDesc), batch = list.slice(0, AI_SORT_MAX);
  if (!batch.length) return toast('Nothing is uncategorized.');
  const cb = aiCodebook(), T = {};
  const lines = batch.map((t, i) => { T[`T${i + 1}`] = t.id; return aiTxLine(t, `T${i + 1}`, cb); });
  // how this household files its most common payees (so "Mariano's" goes where you put it, not where a stranger would)
  const seen = new Map();
  for (const x of [...state.transactions].sort(byDateDesc)) {
    if (isUncat(x) || isSplit(x)) continue;
    const name = aiMask(aiScrub(prettyPayee(x.payee) || x.payee), cb, { accounts: false });
    if (name && !seen.has(name)) seen.set(name, catName(x.categoryId));
    if (seen.size >= 80) break;
  }
  const user = `Today is ${today()}.
Categories by group:
${aiCategoryList()}
How they've categorized recent payees (payee → category):
${[...seen].map(([p, c]) => `${p} → ${c}`).join('\n') || '(none yet)'}
Accounts:
${aiAccountLines(cb, new Set(batch.map(t => t.accountId)))}
Uncategorized transactions (${AI_TX_HEAD}):
${lines.join('\n')}`;
  let r;
  const done = () => $$('#toasts .toast').filter(x => /^Asking Claude/.test(x.textContent)).forEach(x => x.remove());
  try { r = await aiCall({ system: AI_SUGGEST_SYSTEM, user, tools: [AI_SUGGEST_TOOL], maxTokens: 6000, what: { kind: 'sort', label: 'Transactions: suggest categories', codes: cb, onSend: () => toast(`Asking Claude about ${batch.length} transaction${batch.length === 1 ? '' : 's'}…`), intro: `Ọrọ̀ will send ${batch.length} uncategorized transaction${batch.length === 1 ? '' : 's'}, your category names, and how you’ve filed recent payees` } }); }
  catch (e) { done(); if (e.kind !== 'cancelled') toast(e.message || 'Something went wrong asking Claude.'); if (!(e instanceof AiError)) console.error(e); return; }
  done();
  const out = aiTool(r.data, 'suggest') || {};
  const rows = [];
  for (const s of Array.isArray(out.suggestions) ? out.suggestions : []) {
    const id = T[String(s.t || '').trim().toUpperCase()], t = id && state.transactions.find(x => x.id === id);
    if (!t || !isUncat(t) || rows.some(x => x.t === t)) continue;
    const catId = aiCatId(s.category, t);
    rows.push({ t, catId, conf: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'low', why: aiUnmask(String(s.why || ''), cb).slice(0, 80) });
  }
  if (!rows.length) return toast(aiText(r.data) ? `Claude: ${aiUnmask(aiText(r.data), cb).slice(0, 200)}` : 'Claude didn’t suggest anything.');
  aiSortReview(rows, list.length - batch.length, r);
}
function aiSortReview(rows, more, r) {
  const ord = { high: 0, medium: 1, low: 2 };
  rows.sort((a, b) => ord[a.conf] - ord[b.conf] || byDateDesc(a.t, b.t));
  openModal({
    title: 'Claude’s suggestions', wide: true,
    body: `<p>Claude suggested a category for ${rows.length} uncategorized transaction${rows.length === 1 ? '' : 's'}${more ? ` (the newest ${AI_SORT_MAX}; ${more} more after these)` : ''}. Nothing is filed until you choose. Untick any you’re not sure about, or pick a different category.</p>
      <div class="ai-sort">${rows.map((x, i) => `<div class="ai-sort-row conf-${x.conf}">
        <label class="ai-sort-pick"><input type="checkbox" data-ai-row="${i}" ${x.catId && x.conf !== 'low' ? 'checked' : ''} aria-label="File ${esc(prettyPayee(x.t.payee) || x.t.payee)}"></label>
        <div class="ai-sort-what"><strong>${esc(prettyPayee(x.t.payee) || x.t.payee)}</strong><span class="muted small">${esc(dateLabel(x.t.date))} · ${esc(acctById(x.t.accountId)?.name || '')}</span></div>
        <div class="ai-sort-amt num ${x.t.amount > 0 ? 'pos' : ''}">${money(x.t.amount)}</div>
        <div class="ai-sort-cat"><select data-ai-cat="${i}" aria-label="Category">${x.catId ? '' : '<option value="">Pick a category…</option>'}${catOptions(x.catId, false)}</select><span class="muted small">${x.conf === 'high' ? '' : `<span class="tag soft">${x.conf === 'medium' ? 'fairly sure' : 'a guess'}</span> `}${esc(x.why)}</span></div>
      </div>`).join('')}</div>
      <label class="check small"><input type="checkbox" id="ai-sort-rules"> Also make a rule for each payee I file, so the next ones file themselves</label>
      <p class="muted small">${esc(AI_MODELS[r.model]?.label || 'Claude')} · ${aiCostLabel(r.cost)}</p>`,
    actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ai-sort-save">File these</button>`,
  });
  const count = () => { const n = $$('#modal [data-ai-row]:checked').length; const b = $('#ai-sort-save'); if (b) { b.textContent = n ? `File ${n}` : 'File these'; b.disabled = !n; } };
  $$('#modal [data-ai-row]').forEach(c => c.addEventListener('change', count));
  $$('#modal [data-ai-cat]').forEach(s => s.addEventListener('change', () => { const c = $(`#modal [data-ai-row="${s.dataset.aiCat}"]`); if (c && s.value) c.checked = true; count(); }));
  count();
  $('#ai-sort-save').onclick = () => {
    const rules = $('#ai-sort-rules')?.checked;
    let filed = 0, made = 0, more = 0;
    for (const c of $$('#modal [data-ai-row]:checked')) {
      const x = rows[+c.dataset.aiRow], catId = $(`#modal [data-ai-cat="${c.dataset.aiRow}"]`)?.value;
      if (!x || !catId || !isUncat(x.t)) continue;
      x.t.categoryId = catId; delete x.t.splits; if (x.t.flag) delete x.t.flag; filed++;
      if (rules) {
        const text = ruleKeyFor(x.t.rawPayee || x.t.payee, x.t.id);
        if (text && !state.rules.some(r => r.text === text && !ruleHasConds(r))) {
          state.rules.unshift({ id: uid(), text, categoryId: catId }); made++;
          for (const y of state.transactions) if (y !== x.t && isUncat(y) && !y.flag && !isSplit(y) && ruleMatches({ text }, y.rawPayee || y.payee, y)) { y.categoryId = catId; more++; }
        }
      }
    }
    closeModal(true);
    if (!filed) return;
    commit();
    toast(`Filed ${filed} transaction${filed === 1 ? '' : 's'}${made ? `, made ${made} rule${made === 1 ? '' : 's'}${more ? ` and filed ${more} more like them` : ''}` : ''}.`, { label: 'Undo', fn: undo });
  };
}

/* ---------- Settings › Claude help ---------- */
function claudeSettings() {
  const p = aiPrefs(), dev = aiDev(), rec = AI.rec, u = aiUsage();
  if (rec === undefined) aiRecLoad().then(() => { if (route().page === 'data') render(); });
  const keyLine = !rec ? `<p class="muted small">No key on this ${dev} yet.</p>`
    : AI.state === 'stale' ? `<p class="notice small">The key saved on this ${dev} was locked with a different passphrase. Paste it again.</p>`
    : AI.state === 'bad' ? `<p class="notice bad small">Anthropic didn’t accept the key ending …${esc(rec.tail || '')}. Paste a new one.</p>`
    : `<p class="small">Key ending <code>…${esc(rec.tail || '')}</code> saved on this ${dev}${rec.enc ? ', locked with your passphrase' : ''}${rec.saved ? `, ${esc(dateLabel(rec.saved.slice(0, 10), true))}` : ''}.${rec.enc ? '' : ' Add a passphrase (Security, above) to lock it.'}</p>`;
  return `<section class="panel" id="ai-settings">
    <header class="panel-head"><h2>${AI_SPARK} Claude help</h2><span class="muted small">${p.on && rec ? `On for this ${dev}` : `Off on this ${dev}. Nothing is sent`}</span></header>
    <p class="muted">Optional. When Ọrọ̀ doesn’t understand what you said in Talk or Check-in, or you ask a question about your spending (“how much did we spend eating out last month?”), it can ask Claude, Anthropic’s AI, with your own API key. It can also suggest categories for uncategorized transactions. Claude only suggests: every change is shown to you first, and nothing is saved until you say yes.</p>
    <details class="ai-what"><summary>What’s sent, and what isn’t</summary><ul class="small">
      <li><strong>Sent:</strong> your words; for the transactions involved, the payee (with long numbers removed), amount, date, category and flag; your category names; for questions, totals by category and month and your top payees.</li>
      <li><strong>Never sent:</strong> account names or numbers, balances, notes, receipts, files, or your passphrase. People and accounts go as codes (P1, A2), and their names in your words are swapped for the codes first.</li>
      <li>Anthropic doesn’t use API data for training by default and deletes it within 30 days (kept up to 2 years if flagged for a usage-policy review). The connection is encrypted, but Claude has to read what it’s sent.</li>
      <li>This is the only connection Ọrọ̀ makes, and only while this is on: the app is locked to reach Anthropic’s API and nothing else.</li></ul></details>
    <div class="form-grid ai-grid">
      <label class="check"><input type="checkbox" data-ai-pref="on" ${p.on ? 'checked' : ''}> Use Claude help on this ${dev}</label>
      <div class="field ai-key-field"><span>API key</span>${keyLine}
        <form class="ai-key-row" data-ai-key autocomplete="off"><input type="password" id="ai-key" placeholder="${rec ? 'Paste a new key to replace it' : 'sk-ant-…'}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Anthropic API key"><button class="btn ${rec ? '' : 'primary'}" type="submit">Save key</button></form>
        <div class="actions">${rec ? `<button class="btn" data-ai="test">Test the key</button><button class="btn ghost danger-text" data-ai="forget">Remove the key</button>` : ''}<a class="btn ghost" href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">Get a key</a></div>
        <small class="muted">Make a key just for Ọrọ̀ in the Claude Console (API keys), and buy a few dollars of credit with auto-reload off. Paste it here on each device; it’s kept on this ${dev} only. Never paste it into a chat.</small></div>
      <label class="field"><span>Model</span><select data-ai-pref="model">${Object.entries(AI_MODELS).filter(([, m]) => !m.hidden).map(([id, m]) => `<option value="${id}" ${p.model === id ? 'selected' : ''}>${m.label}</option>`).join('')}</select><small class="muted">${esc(AI_MODELS[p.model]?.note || '')}</small></label>
      <label class="field"><span>Monthly limit on this ${dev}</span><select data-ai-pref="cap">${AI_CAPS.map(([v, l]) => `<option value="${v}" ${+p.cap === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small class="muted">Ọrọ̀ stops asking once this month’s estimate reaches it.</small></label>
      <label class="check"><input type="checkbox" data-ai-pref="preview" ${p.preview ? 'checked' : ''}> Show me each request before it’s sent</label>
      <label class="check"><input type="checkbox" data-ai-pref="auto" ${p.auto ? 'checked' : ''}> Ask Claude right away when Ọrọ̀ doesn’t understand (otherwise tap Ask Claude)</label>
    </div>
    <p class="small">This month on this ${dev}: ${u.n ? `${u.n} request${u.n === 1 ? '' : 's'}, ${aiCostLabel(u.cost)}` : 'no requests yet'}. <span class="muted">An estimate; the Claude Console shows the actual bill.</span></p>
    <div class="actions"><button class="btn ghost" data-ai="log">What was sent</button></div>
  </section>`;
}
async function aiShowLog() {
  const log = await aiLogLoad();
  openModal({
    title: 'What was sent to Claude', wide: true,
    body: log.length ? `<p class="muted small">The last ${log.length} request${log.length === 1 ? '' : 's'} from this ${esc(aiDev())}, newest first. Kept on this ${esc(aiDev())} only${Store.pass ? ', locked with your passphrase' : ''}.</p>
      <div class="ai-log">${log.map(x => `<details><summary><span>${esc(new Date(x.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span> <strong>${esc(x.kind)}</strong> <span class="muted small">${esc(AI_MODELS[x.model]?.label || x.model)}${x.err ? ' · didn’t go through' : ` · ${aiCostLabel(x.cost || 0)}`}</span></summary>
        <h4>Sent</h4><pre class="ai-pre">${esc(x.user)}</pre>${x.err ? `<p class="notice small">${esc(x.err)}</p>` : `<h4>Claude’s reply</h4><pre class="ai-pre">${esc(x.reply)}</pre>`}</details>`).join('')}</div>`
      : `<p>Nothing has been sent from this ${esc(aiDev())}.</p>`,
    actions: `${log.length ? '<button class="btn ghost danger-text" id="ai-log-clear">Clear the log</button>' : ''}<button class="btn primary" data-close>Close</button>`,
  });
  const c = $('#ai-log-clear');
  if (c) c.onclick = async () => { AI.log = []; await aiLogSave(); closeModal(true); toast('Cleared the log on this ' + aiDev() + '.'); };
}
async function aiTest() {
  try {
    const r = await aiCall({ system: 'Reply with the single word OK.', user: 'Test from Ọrọ̀.', maxTokens: 64, effort: 'low', preview: false, what: { kind: 'test', label: 'Key test' } });
    toast(`The key works. ${AI_MODELS[r.model]?.label || 'Claude'} answered (${aiCostLabel(r.cost)}).`);
  } catch (e) { if (e.kind !== 'cancelled') toast(e.message); }
  render();
}
document.addEventListener('submit', async e => {
  if (!e.target.matches('[data-ai-key]')) return;
  e.preventDefault();
  const inp = $('#ai-key'), key = (inp?.value || '').trim().replace(/\s+/g, '');
  if (!key) return toast('Paste your API key first.');
  if (!/^sk-ant-/.test(key) && !await confirmBox('That doesn’t look like an Anthropic key', 'Anthropic API keys start with “sk-ant-”. Save it anyway?', 'Save it')) return;
  try { await aiSaveKey(key); } catch (err) { console.error(err); return toast('Couldn’t save the key in this browser’s storage.'); }
  inp.value = '';
  if (!aiPrefs().on) setAiPref('on', true);
  render();
  toast(`Key saved on this ${aiDev()}${Store.pass ? ', locked with your passphrase' : ''}. Tap Test the key to check it.`);
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-ai]'); if (!el) return;
  e.preventDefault();
  const a = el.dataset.ai;
  if (a === 'test') return aiTest();
  if (a === 'log') return aiShowLog();
  if (a === 'forget') {
    if (!await confirmBox('Remove the API key?', `Ọrọ̀ forgets the key on this ${esc(aiDev())} and turns Claude help off here. The key itself still works until you delete it in the Claude Console.`, 'Remove it', true)) return;
    await aiForgetKey(); setAiPref('on', false); render(); toast('Removed the key from this ' + aiDev() + '.');
  }
  if (a === 'sort') return aiSortUncategorized();
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-ai-pref]'); if (!el) return;
  const k = el.dataset.aiPref;
  setAiPref(k, el.type === 'checkbox' ? el.checked : k === 'cap' ? Number(el.value) : el.value);
  if (k === 'model') AI.model = null;
  if (k === 'on' && !el.checked) { aiCancel(); TALK.ai = null; CI.ai = null; }
  render();
});
document.addEventListener('DOMContentLoaded', () => setTimeout(aiRecLoad, 0));
