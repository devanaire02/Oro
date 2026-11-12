/* ================= Bank connections through Plaid (the Mac, with Ọrọ̀'s bank helper) =================
   Plaid's secret key can't sit in a web page, so a small helper program on the Mac (helper/oro-plaid) holds it, with each
   bank connection, in the Mac's Keychain. Ọrọ̀ asks the helper at http://127.0.0.1:47321 (the only address its security
   policy adds), the helper asks Plaid, and the answer comes straight back: no other server. Plaid's sign-in window is
   Plaid's own hosted page, opened in a window of its own, so Plaid's code never runs inside Ọrọ̀.
   What's kept here (synced like the rest): state.banks.items = [{ id (Plaid's item id), inst, instId, env, added, cursor,
   last, problem, accounts: { [plaid account id]: { to (Ọrọ̀ account id, or '' when not brought in), name, mask, type,
   subtype, from } } }] and state.banks.price (Plaid's monthly price per connection, as you typed it). No keys, no tokens.
   On this Mac only: the helper key (sealed with your passphrase, like the Claude key) and whether the helper was found. */
const BANKS = { url: 'http://127.0.0.1:47321', key: null, keyPass: null, rec: undefined, status: null, checked: false, busy: '', review: null, waiting: null, ready: null };
const BANKS_KEY_ID = 'banks.key';
class BankError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

const bankState = () => (state.banks ||= { items: [], price: null });
const bankItems = () => bankState().items || [];
const bankHere = () => !isCompanion() && location.protocol !== 'file:';   // the Mac's Ọrọ̀ app (the web address); not the phone, not the file copy
function bankSeen() { try { return localStorage.getItem('oro.banks.seen') === '1'; } catch (e) { return false; } }
function setBankSeen(on) { try { if (on) localStorage.setItem('oro.banks.seen', '1'); else localStorage.removeItem('oro.banks.seen'); } catch (e) { /* ignore */ } }
/* Accounts that come in from a connection on this Mac (for the buttons and Check-in) */
const bankLinked = () => bankItems().filter(i => !BANKS.status || i.env === BANKS.status.env).flatMap(i => Object.entries(i.accounts || {}).filter(([, a]) => a.to).map(([pid, a]) => ({ item: i, pid, ...a })));
const bankLinkedTo = acctId => bankLinked().find(x => x.to === acctId);
const bankReadyHere = () => bankHere() && bankSeen() && bankLinked().length > 0;
const txIds = t => (t.importId ? [t.importId] : []).concat(t.ids || []);
const plIdOf = t => txIds(t).find(x => x.startsWith('pl:')) || '';

/* ---------- the helper key, sealed with the passphrase on this Mac ---------- */
async function bankRecLoad() {
  if (BANKS.rec === undefined) { try { BANKS.rec = (await IDB.get(BANKS_KEY_ID)) || null; } catch (e) { BANKS.rec = null; } }
  return BANKS.rec;
}
async function bankSeal(text) {
  if (!Store.pass || !Vault.available()) return { enc: false, text };
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await Vault.key(Store.pass, salt), new TextEncoder().encode(text));
  return { enc: true, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
async function bankOpen(rec, pass = Store.pass) {
  if (!rec.enc) return rec.text;
  if (!pass) throw new Error('locked');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, await Vault.key(pass, unb64(rec.salt)), unb64(rec.data));
  return new TextDecoder().decode(pt);
}
async function bankSaveKey(key) {
  const rec = { v: 1, ...(await bankSeal(key)), saved: new Date().toISOString() };
  await IDB.set(BANKS_KEY_ID, rec); BANKS.rec = rec; BANKS.key = key; BANKS.keyPass = Store.pass || null;
}
async function bankKey() {
  if (BANKS.key && BANKS.keyPass === (Store.pass || null)) return BANKS.key;
  await bankRecLoad(); if (!BANKS.rec) return null;
  if (BANKS.key) await bankSaveKey(BANKS.key);   // unlocked earlier, and the passphrase changed since: lock it again with the new one
  else {
    try { BANKS.key = await bankOpen(BANKS.rec); BANKS.keyPass = Store.pass || null; } catch (e) { return null; }
    if (!BANKS.rec.enc && Store.pass) await bankSaveKey(BANKS.key);   // saved before a passphrase was added
  }
  return BANKS.key;
}
async function bankForgetKey() { try { await IDB.del(BANKS_KEY_ID); } catch (e) { /* ignore */ } BANKS.rec = null; BANKS.key = null; }
/* Settings › Security changed the passphrase: lock the helper key again with the new one (10-store.js) */
async function bankRekey(oldPass) {
  try { await bankRecLoad(); if (!BANKS.rec) return; if (!BANKS.key) BANKS.key = await bankOpen(BANKS.rec, oldPass); await bankSaveKey(BANKS.key); } catch (e) { /* paired again when needed */ }
}

/* ---------- talking to the helper ---------- */
async function bankCall(path, body, { keyed = true, timeout = 120000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (keyed) { const k = await bankKey(); if (!k) throw new BankError('not_paired', 'Ọrọ̀ isn’t paired with the bank helper on this Mac yet.'); headers['X-Oro-Key'] = k; }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  let r;
  try { r = await fetch(BANKS.url + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal, cache: 'no-store', targetAddressSpace: 'loopback' }); }
  catch (e) { throw new BankError('not_running', 'Ọrọ̀’s bank helper isn’t answering on this Mac.'); }
  finally { clearTimeout(timer); }
  let j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) {
    if (j.error === 'not_paired') await bankForgetKey();
    throw new BankError(j.error || 'helper', j.message || 'The bank helper couldn’t do that.');
  }
  return j;
}
/* Is the helper there, with keys, and paired with this Ọrọ̀? (Chrome may ask once whether Ọrọ̀ may talk to it.) */
async function bankCheck(quiet) {
  BANKS.checked = true;
  try { BANKS.status = await bankCall('/status', undefined, { keyed: false, timeout: 8000 }); setBankSeen(true); }
  catch (e) { BANKS.status = { ok: false, error: e.code, message: e.message }; if (!quiet) toast(e.message); }
  if (BANKS.status.ok && BANKS.status.paired && !(await bankKey())) BANKS.status.unpaired = true;
  if (route().page === 'data') render();
  return BANKS.status;
}
async function bankPair() {
  BANKS.busy = 'pair'; render();
  try { const r = await bankCall('/pair', {}, { keyed: false, timeout: 150000 }); await bankSaveKey(r.key); await bankCheck(true); toast('Paired with the bank helper on this Mac.'); }
  catch (e) { toast(e.code === 'not_allowed' ? 'The helper wasn’t allowed. Choose Pair again and click Allow in the Mac’s window.' : e.message); }
  BANKS.busy = ''; render();
}

/* ---------- Plaid's account kinds, and Plaid's categories as yours ---------- */
function bankKind(a) {
  const st = String(a.subtype || '').toLowerCase();
  if (st === 'paypal') return 'paypal';
  if (a.type === 'credit') return 'credit';
  if (a.type === 'depository') return /saving|money market|\bcd\b/.test(st) ? 'savings' : st === 'hsa' ? 'other' : 'checking';   // cash management takes transactions like checking
  if (a.type === 'investment' || a.type === 'brokerage') return 'invest';
  if (a.type === 'loan') return 'loan';
  return 'other';
}
const BANK_KIND_NOTE = { paypal: 'PayPal comes in later, through PayPal details', invest: 'Investments come in a later step', loan: 'Loans keep their own payment schedule', other: 'Not brought in' };
const bankLinkable = a => ['checking', 'savings', 'credit'].includes(bankKind(a));
const PLAID_CATS = [
  [/^INCOME_WAGES/, 'Paycheck'], [/^INCOME_(DIVIDENDS|INTEREST)/, 'Interest and dividends'], [/^INCOME_/, 'Other income'],
  [/^LOAN_PAYMENTS_CREDIT_CARD/, 'Credit card payment'], [/^LOAN_PAYMENTS_MORTGAGE/, 'Mortgage or rent'], [/^LOAN_PAYMENTS_CAR/, 'Auto payment'],
  [/^TRANSFER_(IN|OUT)_INVESTMENT|^TRANSFER_OUT_SAVINGS/, 'Savings and investing'], [/^TRANSFER_(IN|OUT)/, 'Transfer between accounts'],
  [/^BANK_FEES/, 'Bank fees'], [/^ENTERTAINMENT/, 'Entertainment'],
  [/^FOOD_AND_DRINK_GROCER/, 'Groceries'], [/^FOOD_AND_DRINK_COFFEE/, 'Coffee'], [/^FOOD_AND_DRINK_BEER_WINE/, 'Groceries'], [/^FOOD_AND_DRINK/, 'Dining out'],
  [/^GENERAL_MERCHANDISE_GIFTS/, 'Gifts'], [/^GENERAL_MERCHANDISE_PET/, 'Pets'], [/^GENERAL_MERCHANDISE/, 'Shopping'],
  [/^HOME_IMPROVEMENT/, 'Home maintenance'], [/^MEDICAL/, 'Medical'], [/^PERSONAL_CARE_GYM/, 'Fitness'], [/^PERSONAL_CARE/, 'Personal care'],
  [/^GENERAL_SERVICES_CHILDCARE/, 'Childcare'], [/^GENERAL_SERVICES_EDUCATION/, 'School'], [/^GENERAL_SERVICES_AUTOMOTIVE/, 'Auto maintenance'],
  [/^GOVERNMENT_AND_NON_PROFIT_DONATIONS/, 'Charitable giving'], [/^GOVERNMENT_AND_NON_PROFIT_TAX/, 'Taxes'],
  [/^TRANSPORTATION_GAS/, 'Fuel and charging'], [/^TRANSPORTATION_(PARKING|TOLLS)/, 'Parking and tolls'], [/^TRANSPORTATION_(TAXIS|PUBLIC_TRANSIT)/, 'Transit and rideshare'],
  [/^TRAVEL/, 'Travel'], [/^RENT_AND_UTILITIES_RENT/, 'Mortgage or rent'], [/^RENT_AND_UTILITIES/, 'Utilities'],
];
/* Plaid's category (["FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"]) as the name of one of your categories, or '' */
function plaidCategoryName(cat) {
  const [primary, detailed] = Array.isArray(cat) ? cat : [];
  const key = detailed || primary || '';
  const hit = PLAID_CATS.find(([re]) => re.test(key)) || PLAID_CATS.find(([re]) => re.test(primary || ''));
  return hit ? hit[1] : '';
}

/* ---------- duplicates across sources: Plaid's IDs never equal the bank file's, so match by amount and date ---------- */
const BANK_SKIP_WORDS = new Set(['POS', 'DEBIT', 'CREDIT', 'CARD', 'PURCHASE', 'PAYMENT', 'ONLINE', 'ACH', 'CHECKCARD', 'VISA', 'RECURRING', 'THE', 'AND', 'INC', 'LLC', 'COM', 'WWW']);
function bankWords(s) { return new Set(normPayee(s).split(/[^A-Z0-9]+/).filter(w => w.length >= 3 && !BANK_SKIP_WORDS.has(w) && !/^\d+$/.test(w))); }
function bankLikeness(a, b) { const x = bankWords(a), y = bankWords(b); let n = 0; for (const w of x) if (y.has(w)) n++; return n; }
/* Pair incoming rows with transactions already in Ọrọ̀, one to one: same amount to the cent, dates within 3 days,
   nearest date first, then the closest description. Two real $5.75 coffees never become one. Returns Map(row → {tx, sure}). */
function bankPair1to1(rows, existing, textOf = r => r.text, exText = t => `${t.rawPayee || ''} ${t.payee || ''}`) {
  const pairs = [];
  for (const r of rows) for (const t of existing) {
    if (Math.abs(t.amount - r.amount) >= 0.005) continue;
    const d = Math.abs(daysBetween(t.date, r.date)); if (d > 3) continue;
    pairs.push({ r, t, d, s: bankLikeness(textOf(r), exText(t)) });
  }
  pairs.sort((a, b) => a.d - b.d || b.s - a.s);
  const out = new Map(), used = new Set();
  for (const p of pairs) {
    if (out.has(p.r) || used.has(p.t.id)) continue;
    out.set(p.r, { tx: p.t, sure: p.d <= 1 || p.s > 0 }); used.add(p.t.id);
  }
  return out;
}

/* ---------- Touch ID before Plaid's window: a passkey on this Mac, checked by the helper ----------
   Set up once (Settings › Bank connections): Chrome makes a passkey for Ọrọ̀ on this Mac and the helper keeps its public key.
   Then every Plaid sign-in window (a new bank, or signing in again) needs Touch ID first: the passkey signs a one-time
   challenge from the helper, and the helper won't ask Plaid for the window without it. */
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
function bankTouchError(e) {
  if (e instanceof BankError) return e;
  if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return new BankError('touch_cancel', 'Touch ID was cancelled, so nothing was opened.');
  if (e?.name === 'SecurityError') return new BankError('touch_here', 'Touch ID works in the Ọrọ̀ app in your Dock, not in this copy.');
  return new BankError('touch', 'Touch ID couldn’t be used just now. Try again.');
}
async function bankTouchSetup() {
  if (!window.PublicKeyCredential || !navigator.credentials?.create) throw new BankError('touch_none', 'This browser can’t use Touch ID. Use the Ọrọ̀ app in your Dock.');
  const c = await bankCall('/touchid/challenge', { purpose: 'register' });
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      rp: { id: c.rp_id, name: 'Ọrọ̀' }, user: { id: unb64u(c.user_id), name: 'Ọrọ̀ bank connections', displayName: 'Ọrọ̀ bank connections' },
      challenge: unb64u(c.challenge), pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      hints: ['client-device'], attestation: 'none', timeout: 120000 } });
  } catch (e) { throw bankTouchError(e); }
  await bankCall('/touchid/register', { clientDataJSON: b64u(cred.response.clientDataJSON), authenticatorData: b64u(cred.response.getAuthenticatorData()) }, { timeout: 150000 });
  if (BANKS.status) BANKS.status.touchid = true;
}
async function bankTouchConfirm() {
  const c = await bankCall('/touchid/challenge', { purpose: 'confirm' });
  let a;
  try { a = await navigator.credentials.get({ publicKey: { challenge: unb64u(c.challenge), rpId: c.rp_id, allowCredentials: [{ type: 'public-key', id: unb64u(c.credential) }], userVerification: 'required', hints: ['client-device'], timeout: 120000 } }); }
  catch (e) { throw bankTouchError(e); }
  return { id: b64u(a.rawId), clientDataJSON: b64u(a.response.clientDataJSON), authenticatorData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature) };
}
async function bankTouchSetupClick() {
  if (BANKS.busy) return;
  BANKS.busy = 'touch'; render();
  try { await bankTouchSetup(); toast('Touch ID is set up. Ọrọ̀ asks for it each time you connect a bank or sign in to one again.'); }
  catch (e) { toast(e.code === 'not_allowed' ? 'The passkey wasn’t replaced: the Mac’s window wasn’t allowed.' : e.message); }
  BANKS.busy = ''; await bankCheck(true); render();
}

/* ---------- connecting a bank (Plaid's own window) ---------- */
async function bankConnect(updateId) {
  if (BANKS.waiting || BANKS.busy) return;
  BANKS.busy = 'touch'; BANKS.ready = null;
  let start;
  try {
    if (!BANKS.status?.ok) await bankCheck(true);
    if (!BANKS.status?.touchid) await bankTouchSetup();
    let touch;
    try { touch = await bankTouchConfirm(); }
    catch (e) { if (e.code !== 'touchid_setup') throw e; await bankTouchSetup(); touch = await bankTouchConfirm(); }   // the helper lost it (set up again): make a new one
    start = await bankCall('/link/start', { ...(updateId ? { item_id: updateId } : {}), touchid: touch });
  } catch (e) { BANKS.busy = ''; render(); return toast(e.message); }
  BANKS.busy = ''; render();
  const it = updateId && bankItems().find(i => i.id === updateId);
  BANKS.ready = { start, updateId: updateId || '' };
  // Plaid's window opens from this click: Chrome only lets a click open a window, and Touch ID used up the first one
  openModal({ title: it ? `Sign in to ${it.inst} again` : 'Connect a bank', body: `<p>Touch ID confirmed. ${it ? `Open Plaid’s window to sign in to ${esc(it.inst)} again.` : 'Open Plaid’s window to choose your bank and sign in.'}</p>`,
    actions: '<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-bank="open-plaid">Open Plaid’s window</button>' });
}
async function bankOpenPlaid() {
  const r = BANKS.ready; BANKS.ready = null;
  if (!r || BANKS.waiting) return closeModal(true);
  const start = r.start, updateId = r.updateId;
  const w = window.open(start.url, 'oro-plaid', 'width=460,height=760');
  if (!w) { BANKS.ready = r; return toast('Chrome blocked Plaid’s window. Allow pop-ups for Ọrọ̀, then click Open Plaid’s window again.'); }
  const it = updateId && bankItems().find(i => i.id === updateId);
  BANKS.waiting = { token: start.link_token, win: w, update: updateId || '', stop: false };
  openModal({ title: it ? `Sign in to ${it.inst} again` : 'Connect a bank', body: `<p>${it ? `Finish signing in to ${esc(it.inst)} in Plaid’s window.` : 'Choose your bank and sign in, in Plaid’s window. Fidelity, Capital One and Chase use their own sign-in pages inside it.'}</p>
    <p class="muted small" id="bank-wait">Waiting for you to finish there…</p>`, actions: '<button class="btn ghost" data-bank="cancel-wait">Cancel</button>' });
  const t0 = Date.now(); let closedAt = 0, res = { status: 'waiting' };
  while (!BANKS.waiting.stop && Date.now() - t0 < 30 * 60000) {
    await new Promise(r => setTimeout(r, 2000));
    if (BANKS.waiting.stop) break;
    try { res = await bankCall('/link/finish', { link_token: start.link_token }); } catch (e) { res = { status: 'error', message: e.message }; }
    if (res.status !== 'waiting') break;
    if (w && w.closed) { closedAt = closedAt || Date.now(); if (Date.now() - closedAt > 12000) { res = { status: 'exited' }; break; } }
  }
  const stopped = BANKS.waiting.stop; BANKS.waiting = null;
  try { if (w && !w.closed) w.close(); } catch (e) { /* ignore */ }
  if (stopped) return;
  closeModal(true);
  if (res.status === 'error') return toast(res.message);
  if (res.status !== 'done') return toast(it ? 'Nothing changed: the sign-in was closed before it finished.' : 'No bank was connected: Plaid’s window was closed before it finished.');
  if (it) { delete it.problem; commit({ silent: true }); render(); return toast(`${it.inst} is signed in again. Nothing new is billed.`, { label: 'Get new transactions', fn: () => bankPull() }); }
  const added = [];
  for (const x of res.items || []) {
    const dupe = bankItems().find(i => i.instId && i.instId === x.institution.id && i.env === BANKS.status?.env);
    const item = { id: x.item_id, inst: x.institution.name || 'Bank', instId: x.institution.id || '', env: BANKS.status?.env || 'sandbox', added: today(), cursor: '', accounts: {} };
    for (const a of x.accounts || []) item.accounts[a.id] = { to: '', name: a.name, mask: a.mask, type: a.type, subtype: a.subtype, from: '' };
    if (dupe) item.dupeOf = dupe.id;
    bankItems().push(item); added.push(item);
  }
  commit({ silent: true }); render();
  if (added[0]) bankLinkModal(added[0].id);
}
function bankCancelWait() { if (BANKS.waiting) { BANKS.waiting.stop = true; try { BANKS.waiting.win?.close(); } catch (e) { /* ignore */ } } closeModal(true); }

/* ---------- linking Plaid's accounts to yours ---------- */
function bankCandidates(item, pid) {
  const pa = item.accounts[pid], kind = bankKind(pa);
  const taken = new Set(bankItems().flatMap(i => Object.entries(i.accounts || {}).filter(([p, a]) => a.to && !(i.id === item.id && p === pid)).map(([, a]) => a.to)));
  return txnAccounts().filter(a => !taken.has(a.id) && (kind === 'credit' ? a.type === 'credit' : ['checking', 'savings'].includes(a.type)));
}
function bankGuess(item, pid) {
  const pa = item.accounts[pid];
  if (!bankLinkable(pa)) return '';
  const c = bankCandidates(item, pid), byLast4 = c.filter(a => pa.mask && (a.last4 === pa.mask || (a.name || '').includes(pa.mask)));
  return byLast4.length === 1 ? byLast4[0].id : '__new';
}
function bankLinkModal(itemId) {
  const item = bankItems().find(i => i.id === itemId); if (!item) return;
  const dupe = item.dupeOf && bankItems().find(i => i.id === item.dupeOf);
  const rows = Object.entries(item.accounts).map(([pid, pa]) => {
    const kind = bankKind(pa), sel = pa.to || (item.linkedOnce ? '' : bankGuess(item, pid));
    const label = `${esc(pa.name || 'Account')}${pa.mask ? ` ···${esc(pa.mask)}` : ''}`;
    if (!bankLinkable(pa)) return `<tr><th scope="row">${label}<div class="muted small">${esc(pa.subtype || pa.type || '')}</div></th><td class="muted small">${BANK_KIND_NOTE[kind]}</td></tr>`;
    const opts = bankCandidates(item, pid).map(a => `<option value="${a.id}" ${sel === a.id ? 'selected' : ''}>${esc(a.name)}${a.last4 ? ` ···${esc(a.last4)}` : ''}</option>`).join('');
    const newName = `${item.inst} ${pa.name || ''}`.trim() + (pa.mask ? ` ···${pa.mask}` : '');
    return `<tr data-pid="${esc(pid)}"><th scope="row">${label}<div class="muted small">${esc(ACCOUNT_TYPES[kind]?.label || kind)}</div></th>
      <td><select data-banklink="${esc(pid)}" aria-label="Where ${esc(pa.name || 'this account')} goes">${opts ? `<optgroup label="Your accounts">${opts}</optgroup>` : ''}<option value="__new" ${sel === '__new' ? 'selected' : ''}>New account</option><option value="" ${!sel ? 'selected' : ''}>Don’t bring it in</option></select>
      <div class="bank-new" ${sel === '__new' ? '' : 'hidden'}><input data-banknew="${esc(pid)}" value="${esc(newName)}" aria-label="New account’s name">${members().length > 1 ? `<select data-bankowner="${esc(pid)}" aria-label="Whose">${memberOptions('joint')}</select>` : ''}</div></td></tr>`;
  }).join('');
  openModal({ title: `Link ${esc(item.inst)}’s accounts`, wide: true, body: `
    ${dupe ? `<div class="notice">You already had ${esc(dupe.inst)} connected. Plaid bills each connection, so this one is billed again. To sign in to a bank again, use <strong>Sign in again</strong> instead. <button class="btn small" data-bank="remove-dupe" data-item="${esc(item.id)}">Remove this new one</button></div>` : ''}
    <p class="small">Each account can go to one of yours (matched by its last 4 digits), become a new account, or not be brought in. New transactions start the day after the newest one you have, with 10 days of overlap checked for duplicates.</p>
    <div class="scroll-table"><table class="ledger compact bank-link"><tbody>${rows}</tbody></table></div>`,
    actions: `<button class="btn ghost" data-close>Not now</button><button class="btn primary" data-bank="save-links" data-item="${esc(item.id)}">Save</button>` });
  $('#modal').onchange = e => { const t = e.target; if (t.dataset.banklink != null) t.parentElement.querySelector('.bank-new')?.toggleAttribute('hidden', t.value !== '__new'); };
}
function bankSaveLinks(itemId) {
  const item = bankItems().find(i => i.id === itemId); if (!item) return;
  let n = 0;
  for (const sel of $$('#modal [data-banklink]')) {
    const pid = sel.dataset.banklink, pa = item.accounts[pid]; if (!pa) continue;
    let to = sel.value;
    if (to === '__new') {
      const name = ($(`#modal [data-banknew="${CSS.escape(pid)}"]`)?.value || '').trim() || `${item.inst} ${pa.name || ''}`.trim();
      const a = makeAccount(name, bankKind(pa), item.inst, $(`#modal [data-bankowner="${CSS.escape(pid)}"]`)?.value || 'joint');
      if (pa.mask) a.last4 = pa.mask;
      to = a.id;
    }
    if (to && to !== pa.to) {
      const newest = txByAccount(to).reduce((m, t) => (t.date > m ? t.date : m), '');
      pa.from = newest ? addDays(newest, 1 - 10) : '';   // the day after the newest one you have, less 10 days of overlap
      const acct = acctById(to); if (acct && !acct.last4 && pa.mask) acct.last4 = pa.mask;
    }
    if (!to) pa.from = '';
    pa.to = to; if (to) n++;
  }
  item.linkedOnce = true;
  closeModal(true); commit();
  toast(n ? `Linked ${n} account${n === 1 ? '' : 's'} from ${item.inst}.` : `Nothing from ${item.inst} is brought in for now.`, n ? { label: 'Get new transactions', fn: () => bankPull(item.id) } : null);
}
async function bankDisconnect(itemId) {
  const item = bankItems().find(i => i.id === itemId); if (!item) return;
  if (!(await confirmBox(`Disconnect ${item.inst}?`, `Ọrọ̀ stops bringing in ${item.inst}’s transactions and the connection is removed at Plaid, which stops its monthly charge. Transactions already in Ọrọ̀ stay.`, 'Disconnect', true))) return;
  try { await bankCall('/remove', { item_id: itemId }); }
  catch (e) { if (e.code !== 'unknown_item') return toast(e.message); }
  state.banks.items = bankItems().filter(i => i.id !== itemId);
  commit(); toast(`${item.inst} is disconnected. Its transactions are still here.`);
}

/* ---------- Get new transactions ---------- */
async function bankPull(onlyItem) {
  if (BANKS.busy === 'pull') return;
  if (!BANKS.status?.ok) await bankCheck(true);
  if (!BANKS.status?.ok) return toast(BANKS.status?.message || 'Ọrọ̀’s bank helper isn’t answering on this Mac.');
  const items = bankItems().filter(i => i.env === BANKS.status.env && Object.values(i.accounts || {}).some(a => a.to) && (!onlyItem || i.id === onlyItem));
  if (!items.length) return toast('Link an account first: Settings › Bank connections.');
  BANKS.busy = 'pull';
  openModal({ title: 'Get new transactions', body: `<p>Asking ${listWords(items.map(i => esc(i.inst)))} through the bank helper…</p>`, actions: '<button class="btn ghost" data-close>Close</button>' });
  const results = [];
  for (const item of items) {
    try { results.push({ item, r: await bankCall('/sync', { item_id: item.id, cursor: item.cursor || '' }) }); }
    catch (e) { results.push({ item, error: e }); }
  }
  BANKS.busy = '';
  BANKS.review = bankReview(results);
  bankRenderReview();
}
/* What a pull would do, account by account. Nothing changes until Add. */
function bankReview(results) {
  const hist = categoryHistory(), cardPayId = categoryIdByName('Credit card payment'), transferId = categoryIdByName('Transfer between accounts');
  const sections = [], problems = [], notes = [];
  for (const { item, r, error } of results) {
    if (error) { problems.push({ item, code: error.code, message: error.code === 'login_required' ? `${item.inst} needs you to sign in again.` : error.message }); continue; }
    if (!r.next_cursor && !r.added.length) notes.push(`Plaid is still gathering ${item.inst}’s history. Try again in a few minutes.`);
    const byPl = new Map();
    for (const pa of Object.values(item.accounts)) if (pa.to) for (const t of txByAccount(pa.to)) for (const id of txIds(t)) if (id.startsWith('pl:')) byPl.set(id, t);
    for (const [pid, pa] of Object.entries(item.accounts)) {
      if (!pa.to) continue;
      const acct = acctById(pa.to); if (!acct) continue;
      const sec = { item, pid, pa, acct, rows: [], links: [], have: 0, older: 0, balance: null };
      const incoming = r.added.filter(t => t.account === pid);
      const fresh = [];
      for (const t of incoming) {
        if (byPl.has('pl:' + t.id)) { sec.have++; continue; }
        if (pa.from && t.date < pa.from) { sec.older++; continue; }
        fresh.push(t);
      }
      // the ones you already have from a file (and not yet from Plaid): linked, not added
      const pairs = bankPair1to1(fresh, txByAccount(acct.id).filter(t => !plIdOf(t)), t => `${t.text} ${t.merchant}`);
      for (const t of fresh) {
        const m = pairs.get(t);
        if (m && m.sure) { sec.links.push({ plId: 'pl:' + t.id, tx: m.tx }); continue; }
        const raw = t.text || t.merchant, rule = matchRule(raw, { amount: t.amount, accountId: acct.id }) || (t.merchant ? matchRule(t.merchant, { amount: t.amount, accountId: acct.id }) : null);
        const auto = rule ? null : autoCategory(raw, t.amount, { bankCategory: plaidCategoryName(t.cat) }, hist);
        let categoryId = rule ? rule.categoryId : auto ? auto.id : null;
        if (acct.type === 'credit' && t.amount > 0 && cardPayId && (!categoryId || categoryId === transferId) && /payment|thank you|autopay|pymt/i.test(raw)) categoryId = cardPayId;
        sec.rows.push({ kind: m ? 'maybe' : 'new', include: !m, plId: 'pl:' + t.id, date: t.date, amount: t.amount, payee: rule?.rename || t.merchant || prettyPayee(raw), raw, categoryId: categoryId || '', guess: auto && categoryId === auto.id ? auto.how : '', person: rule?.person || '', match: m?.tx.id || '' });
      }
      for (const t of r.modified.filter(x => x.account === pid)) {
        const have = byPl.get('pl:' + t.id);
        if (have && (Math.abs(have.amount - t.amount) >= 0.005 || have.date !== t.date)) sec.rows.push({ kind: 'changed', include: false, plId: 'pl:' + t.id, date: t.date, amount: t.amount, payee: have.payee, raw: t.text, match: have.id, old: { date: have.date, amount: have.amount } });
      }
      for (const id of r.removed) {
        const have = byPl.get('pl:' + id);
        if (have && have.accountId === acct.id) sec.rows.push({ kind: 'removed', include: false, plId: 'pl:' + id, date: have.date, amount: have.amount, payee: have.payee, raw: have.rawPayee || '', match: have.id });
      }
      const pb = (r.accounts || []).find(a => a.id === pid)?.balance;
      if (pb && isFinite(pb.current) && pb.current !== null) {
        const value = round2(Math.abs(pb.current) * (pb.current < 0 && !isLiability(acct) ? -1 : 1)), date = (pb.updated || '').slice(0, 10) || today();
        sec.balance = { value, date, have: accountValue(acct), set: date >= (acct.balanceDate || '') };
      }
      sec.rows.sort((a, b) => b.date.localeCompare(a.date));
      sections.push(sec);
    }
  }
  return { results, sections, problems, notes };
}
function bankRowTag(r) {
  if (r.kind === 'maybe') { const t = state.transactions.find(x => x.id === r.match); return `<span class="tag">Looks like one you have</span>${t ? `<div class="muted small">${esc(t.payee)} · ${dateLabel(t.date, true)}</div>` : ''}`; }
  if (r.kind === 'changed') return `<span class="tag">Changed at the bank</span><div class="muted small">Was ${money(r.old.amount)} on ${dateLabel(r.old.date, true)}</div>`;
  if (r.kind === 'removed') return '<span class="tag">Removed at the bank</span>';
  return '';
}
function bankAddLabel(rv) {
  const n = rv.sections.reduce((s, x) => s + x.rows.filter(r => r.include && (r.kind === 'new' || r.kind === 'maybe')).length, 0);
  const c = rv.sections.reduce((s, x) => s + x.rows.filter(r => r.include && r.kind !== 'new' && r.kind !== 'maybe').length, 0);
  return n || c ? `Add ${n.toLocaleString()} transaction${n === 1 ? '' : 's'}${c ? ` and make ${c} change${c === 1 ? '' : 's'}` : ''}` : 'Done';
}
function bankRenderReview() {
  const rv = BANKS.review; if (!rv) return;
  const opts = catOptions(null, true);
  const sec = (s, si) => {
    const n = s.rows.filter(r => r.kind === 'new').length, b = s.balance, apart = b ? round2(b.value - b.have) : 0;
    return `<section class="bank-sec">
      <h3>${esc(s.item.inst)} ${esc(s.pa.name || '')}${s.pa.mask ? ` ···${esc(s.pa.mask)}` : ''} <span class="muted small">into ${esc(s.acct.name)}</span></h3>
      <p class="small">${[n ? `${n} new` : 'Nothing new', s.links.length ? `${s.links.length} matched to ones you have` : '', s.have ? `${s.have} already in Ọrọ̀` : '', s.older ? `${s.older} older than ${dateLabel(s.pa.from, true)}, left out` : ''].filter(Boolean).join(' · ')}</p>
      ${b ? `<p class="small bank-bal">Plaid says ${money(b.value)} · Ọrọ̀ has ${money(b.have)}${Math.abs(apart) >= 0.005 ? ` · <strong>${money(Math.abs(apart))} apart</strong>` : ' · the same'}
        <label class="check"><input type="checkbox" data-bankbal="${si}" ${b.set ? 'checked' : ''}> Set the balance to ${money(b.value)} as of ${dateLabel(b.date, true)}</label></p>` : ''}
      ${s.rows.length ? `<div class="scroll-table"><table class="ledger compact bank-rows"><thead><tr><th class="cb"></th><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${s.rows.map((r, ri) => `<tr class="${r.include ? '' : 'off'}"><td class="cb"><input type="checkbox" data-bankrow="${si}:${ri}" ${r.include ? 'checked' : ''} aria-label="${r.kind === 'removed' ? 'Remove it' : r.kind === 'changed' ? 'Update it' : 'Add it'}"></td>
          <td class="nowrap">${dateLabel(r.date, true)}</td><td>${esc(r.payee)}<div class="muted small">${esc(r.raw)}</div></td>
          <td>${r.kind === 'new' || r.kind === 'maybe' ? `<select data-bankcat="${si}:${ri}" aria-label="Category">${opts.replace(`value="${r.categoryId}"`, `value="${r.categoryId}" selected`)}</select>` : ''}</td>
          <td class="num ${signClass(r.amount)}">${money(r.amount)}</td><td>${bankRowTag(r)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}</section>`;
  };
  const body = `
    ${rv.problems.map(p => `<div class="notice ${p.code === 'login_required' ? '' : 'bad'}">${esc(p.message)} ${p.code === 'login_required' ? `<button class="btn small" data-bank="relogin" data-item="${esc(p.item.id)}">Sign in again</button>` : ''} Other banks still come in.</div>`).join('')}
    ${rv.notes.map(n => `<p class="muted small">${esc(n)}</p>`).join('')}
    ${rv.sections.length ? rv.sections.map(sec).join('') : '<p>Nothing to bring in.</p>'}`;
  openModal({ title: 'New from your banks', wide: true, body, actions: `<button class="btn ghost" data-bank="cancel-review">Cancel</button><button class="btn primary" data-bank="apply" id="bank-go">${bankAddLabel(rv)}</button>` });
  $('#modal').onchange = e => {
    const t = e.target, d = t.dataset;
    if (d.bankrow) { const [si, ri] = d.bankrow.split(':').map(Number); rv.sections[si].rows[ri].include = t.checked; t.closest('tr').classList.toggle('off', !t.checked); }
    if (d.bankcat) { const [si, ri] = d.bankcat.split(':').map(Number); const r = rv.sections[si].rows[ri]; r.categoryId = t.value; r.guess = ''; }
    if (d.bankbal != null) rv.sections[+d.bankbal].balance.set = t.checked;
    const go = $('#bank-go'); if (go) go.textContent = bankAddLabel(rv);
  };
}
/* Add what's ticked, link what matched, save each connection's place, set the ticked balances: one step for Undo */
function bankApply() {
  const rv = BANKS.review; if (!rv) return;
  let added = 0, unc = 0, linked = 0, changed = 0, removed = 0;
  const gone = new Set(), addId = (t, id) => { if (!txIds(t).includes(id)) { if (!t.importId) t.importId = id; else (t.ids ||= []).push(id); } };
  for (const s of rv.sections) {
    for (const l of s.links) { addId(l.tx, l.plId); linked++; }
    for (const r of s.rows) {
      const have = r.match && state.transactions.find(t => t.id === r.match);
      if (r.kind === 'new' || r.kind === 'maybe') {
        if (!r.include) { if (r.kind === 'maybe' && have) { addId(have, r.plId); linked++; } continue; }
        const t = { id: uid(), date: r.date, accountId: s.acct.id, payee: r.payee, rawPayee: r.raw, amount: r.amount, categoryId: r.categoryId || null, memo: '', importId: r.plId, added: today() };
        if (r.person) t.person = r.person;
        state.transactions.push(t); added++; if (!t.categoryId) unc++;
      } else if (r.kind === 'changed' && r.include && have) { have.amount = r.amount; have.date = r.date; changed++; }
      else if (r.kind === 'removed' && r.include && have) { gone.add(have.id); removed++; }
    }
    if (s.balance?.set) setBalance(s.acct, s.balance.value, s.balance.date);
  }
  if (gone.size) state.transactions = state.transactions.filter(t => !gone.has(t.id));
  state.transactions.sort((a, b) => b.date.localeCompare(a.date));
  const when = new Date().toISOString();
  for (const { item, r } of rv.results) {
    if (!r) { const p = rv.problems.find(x => x.item === item); if (p?.code === 'login_required') item.problem = 'login'; continue; }
    if (r.next_cursor) item.cursor = r.next_cursor;
    item.last = when; delete item.problem;
  }
  BANKS.review = null; closeModal(true); commit();
  const parts = [added ? `Added ${added.toLocaleString()} transaction${added === 1 ? '' : 's'}` : 'Nothing new added', linked ? `matched ${linked} you already had` : '', changed ? `updated ${changed}` : '', removed ? `removed ${removed}` : ''].filter(Boolean);
  toast(`${listWords(parts)}.${unc ? ` ${unc} need a category.` : ''}`, unc ? { label: 'Categorize', fn: () => go('#/transactions?cat=_none&m=all') } : { label: 'Undo', fn: undo });
}
function bankCancelReview() {
  // nothing is saved, so the same transactions come again next time; a bank that needs signing in is still marked
  const rv = BANKS.review;
  if (rv) for (const p of rv.problems) if (p.code === 'login_required') p.item.problem = 'login';
  BANKS.review = null; closeModal(true);
  if (rv?.problems.length) commit();
}

/* ---------- Settings › Bank connections ---------- */
function bankSettings() {
  const items = bankItems(), dev = isCompanion() ? deviceLabel() : 'Mac';
  const list = items.length ? `<ul class="bank-list">${items.map(i => {
    const linked = Object.values(i.accounts || {}).filter(a => a.to).map(a => `${esc(a.name || 'Account')}${a.mask ? ` ···${esc(a.mask)}` : ''} → ${esc(acctById(a.to)?.name || 'an account')}`);
    return `<li><strong>${esc(i.inst)}</strong>${i.env === 'sandbox' ? ' <span class="tag soft">Sandbox</span>' : ''}${i.problem === 'login' ? ' <span class="tag">Needs you to sign in again</span>' : ''}
      <div class="muted small">${linked.length ? linked.join(' · ') : 'No accounts brought in yet'}${i.last ? ` · Last brought in ${esc(whenLabel(i.last))}` : ''}</div>
      ${bankHere() && BANKS.status?.ok && !BANKS.status.unpaired && BANKS.status.paired ? `<div class="actions wrap"><button class="btn small" data-bank="link" data-item="${esc(i.id)}">Link accounts…</button><button class="btn small ghost" data-bank="relogin" data-item="${esc(i.id)}">Sign in again</button><button class="btn small ghost" data-bank="disconnect" data-item="${esc(i.id)}">Disconnect</button></div>` : ''}</li>`;
  }).join('')}</ul>` : '';
  const head = (sub) => `<header class="panel-head"><h2>Bank connections</h2><span class="muted small">${sub}</span></header>`;
  if (isCompanion()) return `<section class="panel" id="bank-settings">${head('Run on your Mac')}<p>Bank connections run on your Mac: it brings new transactions in through Plaid, and this ${esc(dev)} gets them with Get latest.</p>${list}</section>`;
  if (location.protocol === 'file:') return `<section class="panel" id="bank-settings">${head('In the Ọrọ̀ app')}<p class="muted">Bank connections work in the Ọrọ̀ app in your Dock (the web address), not in this copy.</p>${list}</section>`;
  if (!BANKS.checked && bankSeen()) setTimeout(() => bankCheck(true), 0);
  const st = BANKS.status, price = Number(bankState().price) || 0, n = items.filter(i => i.env === 'production').length;
  let body;
  if (!st) body = `<p>Connect your bank and card accounts once, through Plaid, and <strong>Get new transactions</strong> brings in what’s new, for you to review, instead of downloading files. It needs Ọrọ̀’s bank helper on this Mac, which keeps Plaid’s key and your connections in the Mac’s Keychain.</p>
    <div class="actions"><button class="btn" data-bank="check">Look for the bank helper on this Mac</button></div><p class="muted small">Chrome may ask once whether Ọrọ̀ may talk to apps on this Mac. Choose Allow.</p>`;
  else if (!st.ok) body = `<p class="notice">${esc(st.message || 'Ọrọ̀’s bank helper isn’t answering on this Mac.')}</p><p class="small">The helper is a small program that starts with the Mac. To install it, run <code>bash helper/oro-plaid/install.sh</code> from Ọrọ̀’s code folder, then look again.</p>
    <div class="actions"><button class="btn" data-bank="check">Look again</button></div>`;
  else if (!st.keys) body = `<p class="notice">The helper is running, but Plaid’s keys aren’t in this Mac’s Keychain yet (the client ID and the ${esc(st.env)} secret).</p><div class="actions"><button class="btn" data-bank="check">Look again</button></div>`;
  else if (!st.paired || st.unpaired) body = `<p>The helper is running${st.env === 'sandbox' ? ' with Plaid’s Sandbox (test banks only)' : ''}. Pair it with Ọrọ̀ once: the Mac shows a window asking you to allow it.</p>
    <div class="actions"><button class="btn primary" data-bank="pair" ${BANKS.busy === 'pair' ? 'disabled' : ''}>${BANKS.busy === 'pair' ? 'Waiting for the Mac’s window…' : 'Pair with the helper'}</button></div>`;
  else if (!st.touchid) body = `<p>One more step: turn on <strong>Touch ID</strong> for bank connections. Ọrọ̀ then asks for Touch ID each time you connect a bank or sign in to one again, so no one else can, even on this Mac.</p>
    <div class="actions"><button class="btn primary" data-bank="touch-setup" ${BANKS.busy === 'touch' ? 'disabled' : ''}>${BANKS.busy === 'touch' ? 'Waiting for Touch ID…' : 'Set up Touch ID'}</button></div>
    <p class="muted small">Chrome shows a passkey window: confirm with Touch ID (or your Mac’s password). Only the passkey’s public key goes to the bank helper.</p>`;
  else body = `${st.env === 'sandbox' ? '<p class="notice small">Plaid’s <strong>Sandbox</strong>: test banks only, free. Sign in with user_good and pass_good.</p>' : ''}
    <div class="actions wrap"><button class="btn primary" data-bank="connect" ${BANKS.busy === 'touch' ? 'disabled' : ''}>${BANKS.busy === 'touch' ? 'Waiting for Touch ID…' : 'Connect a bank'}</button>${bankLinked().length ? '<button class="btn" data-bank="pull">Get new transactions</button>' : ''}</div>
    <p class="muted small">Connecting a bank, or signing in to one again, asks for Touch ID first.${items.length ? '' : ' Connecting the same bank twice means paying twice, so Ọrọ̀ uses Sign in again when a bank asks for it.'}</p>
    ${st.env === 'production' ? `<div class="form-grid"><label class="field"><span>Plaid’s monthly price per connection</span><input data-bankprice inputmode="decimal" value="${bankState().price ?? ''}" placeholder="From Plaid’s Dashboard"><small class="muted">${price && n ? `${n} connection${n === 1 ? '' : 's'}: about ${money(price * n)} a month` : 'Plaid bills each connected bank login every month while it stays connected.'}</small></label></div>` : ''}`;
  return `<section class="panel" id="bank-settings">${head(st?.ok ? (st.env === 'sandbox' ? 'Sandbox' : 'On this Mac') : 'Through Plaid')}${body}${list}</section>`;
}
function bankButton(cls = '') { return bankReadyHere() ? `<button class="btn ${cls}" data-bank="pull">Get new transactions</button>` : ''; }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-bank]'); if (!b) return;
  const id = b.dataset.item;
  switch (b.dataset.bank) {
    case 'check': return bankCheck();
    case 'pair': return bankPair();
    case 'connect': return bankConnect();
    case 'touch-setup': return bankTouchSetupClick();
    case 'open-plaid': return bankOpenPlaid();
    case 'relogin': closeModal(true); return bankConnect(id);
    case 'cancel-wait': return bankCancelWait();
    case 'link': return bankLinkModal(id);
    case 'save-links': return bankSaveLinks(id);
    case 'disconnect': return bankDisconnect(id);
    case 'remove-dupe': closeModal(true); return bankDisconnect(id);
    case 'pull': return bankPull();
    case 'apply': return bankApply();
    case 'cancel-review': return bankCancelReview();
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset?.bankprice == null) return;
  const v = parseAmount(e.target.value.trim());
  bankState().price = e.target.value.trim() === '' || !isFinite(v) ? null : round2(v);
  commit({ silent: true }); setTimeout(render, 0);
});
