/* ================= cards on one account =================
   A credit card account with an authorized user has one balance but a card number for each person. Capital One's QFX
   (and its CSV "Card No." column) says which card made each purchase. Ọrọ̀ keeps only the card's last 4 digits on each
   transaction (t.card), asks once whose each card is (account.cards: last 4 → person, '' = the account owner), and puts
   each purchase under that person. Importing a file again adds nothing new but marks whose card it was on the
   transactions already there, leaving any you assigned to someone yourself as they are. */
const cardL4 = v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 4 ? d.slice(-4) : ''; };
const isTransferTx = t => catById(t.categoryId)?.kind === 'transfer';

/* The cards in an import item, most used first: [{ l4, n }] — only worth asking about when there are two or more */
function itemCards(it) {
  if (it.multi) return [];
  const n = {};
  for (const r of it.txRows || []) if (r.card) n[r.card] = (n[r.card] || 0) + 1;
  const acct = acctById(it.accountId);
  const known = Object.keys(acct?.cards || {});
  const list = [...new Set([...Object.keys(n), ...known.filter(k => n[k])])].map(l4 => ({ l4, n: n[l4] || 0 }));
  return list.length >= 2 || (list.length === 1 && known.length >= 2) ? list.sort((a, b) => b.n - a.n) : [];
}
function itemCardMap(it) {
  const acct = acctById(it.accountId), out = {};
  for (const c of itemCards(it)) out[c.l4] = it.cardMap?.[c.l4] ?? acct?.cards?.[c.l4] ?? '';
  return out;
}
/* What marking an existing transaction would change: { card, person } or null. Only ones still following the card
   change person (no person yet, or the person this card had before); ones you set yourself stay. */
function cardMark(t, r, map, before) {
  const out = {};
  if (t.card !== r.card) out.card = r.card;
  const p = map[r.card] || '', cur = t.person || '';
  if (cur !== p && cur === (before[r.card] || '') && !isSplit(t) && !isTransferTx(t)) out.person = p;
  return Object.keys(out).length ? out : null;
}
/* Rows already in Ọrọ̀ (same transaction) that this file would mark */
function itemCardOld(it) {
  const acct = acctById(it.accountId); if (!acct) return 0;
  const byId = new Map(state.transactions.filter(t => t.accountId === acct.id).map(t => [t.id, t]));
  const map = itemCardMap(it), before = acct.cards || {};
  let n = 0;
  for (const r of it.txRows || []) { const t = !r.include && r.existingId && r.card && byId.get(r.existingId); if (t && cardMark(t, r, map, before)) n++; }
  return n;
}
function ownerLabel(it) {
  const acct = acctById(it.accountId), owner = acct ? acct.owner : it.newDefaults?.owner;
  return `Account owner (${memberName(owner || 'joint')})`;
}
/* The block on the import review (k = batch item index, or null for a single file) */
function cardsBlock(it, k = null) {
  const cards = itemCards(it);
  if (!cards.length || members().length < 2) return '';
  const map = itemCardMap(it), old = itemCardOld(it), at = k == null ? '' : `${k}|`;
  return `<div class="cards-box">
    <p><strong>${cards.length} cards on this account.</strong> Whose is each? Their purchases go under that person. Only the last 4 digits are kept.</p>
    <div class="cards-rows">${cards.map(c => `<label class="field"><span>Card ending ${esc(c.l4)}${c.n ? ` · ${c.n.toLocaleString()}` : ''}</span><select data-card="${at}${esc(c.l4)}">${memberOptions(map[c.l4], ownerLabel(it), true)}</select></label>`).join('')}</div>
    ${old ? `<label class="check small"><input type="checkbox" data-cardsold="${at}" ${it.cardsOld !== false ? 'checked' : ''}> Also mark whose card it was on the ${old.toLocaleString()} already in Ọrọ̀ (any you put under someone yourself stay as they are)</label>` : ''}
  </div>`;
}
/* A change in the block: returns true when handled */
function cardsChange(el, items) {
  const d = el.dataset;
  if (d.card != null) { const [k, l4] = d.card.includes('|') ? d.card.split('|') : [null, d.card]; const it = k == null ? IMP : items[+k]; (it.cardMap ||= {})[l4] = el.value; return true; }
  if (d.cardsold != null) { const k = d.cardsold.replace('|', ''); const it = k === '' ? IMP : items[+k]; it.cardsOld = el.checked; return true; }
  return false;
}
/* How many existing transactions the import will mark */
const itemCardMarks = it => itemCards(it).length && it.cardsOld !== false ? itemCardOld(it) : 0;

/* At commit: remember whose each card is, set the person on new rows, and mark the ones already there */
function applyItemCards(it, acct) {
  const cards = itemCards(it);
  if (!acct || !cards.length) return 0;
  const map = itemCardMap(it), before = { ...(acct.cards || {}) };
  acct.cards = { ...before, ...map };
  if (it.cardsOld === false) return 0;
  let marked = 0;
  const byId = new Map(state.transactions.filter(t => t.accountId === acct.id).map(t => [t.id, t]));
  for (const r of it.txRows || []) {
    const t = !r.include && r.existingId && r.card && byId.get(r.existingId); if (!t) continue;
    const m = cardMark(t, r, map, before); if (!m) continue;
    if (m.card) t.card = m.card;
    if ('person' in m) { if (m.person) t.person = m.person; else delete t.person; }
    marked++;
  }
  return marked;
}
/* Whose a new transaction is, from its card */
function personFromCard(acct, card, t) {
  const p = card && acct?.cards?.[card];
  return p && !isTransferTx(t) ? p : '';
}

/* ---- the account window: change whose a card is later ---- */
function acctCardsFields(a) {
  if (!a || members().length < 2) return '';
  const n = {};
  for (const t of state.transactions) if (t.accountId === a.id && t.card) n[t.card] = (n[t.card] || 0) + 1;
  const cards = [...new Set([...Object.keys(a.cards || {}), ...Object.keys(n)])];
  if (cards.length < 2) return '';
  return `<div class="wide cards-acct"><span class="field-label">Cards on this account</span>
    <div class="cards-rows">${cards.map(c => `<label class="field"><span>Card ending ${esc(c)}${n[c] ? ` · ${n[c].toLocaleString()}` : ''}</span><select data-acard="${esc(c)}">${memberOptions(a.cards?.[c] || '', `Account owner (${memberName(a.owner || 'joint')})`, true)}</select></label>`).join('')}</div>
    <small class="muted">Purchases on each card go under that person. Ones you put under someone yourself stay as they are.</small></div>`;
}
/* Saving the account window: move the card's transactions that followed the old choice */
function saveAcctCards(a) {
  const sels = $$('#f [data-acard]');
  if (!sels.length) return 0;
  const before = { ...(a.cards || {}) }, next = { ...before };
  for (const s of sels) next[s.dataset.acard] = s.value;
  let moved = 0;
  for (const t of state.transactions) {
    if (t.accountId !== a.id || !t.card || !(t.card in next) || (before[t.card] || '') === (next[t.card] || '')) continue;
    if ((t.person || '') !== (before[t.card] || '') || isSplit(t) || isTransferTx(t)) continue;
    if (next[t.card]) t.person = next[t.card]; else delete t.person;
    moved++;
  }
  a.cards = next;
  return moved;
}
