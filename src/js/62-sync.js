/* ================= iPhone ⇄ Mac sync =================
   The Mac keeps the main copy in its Ọrọ̀ folder (data/oro.json, synced by iCloud Drive).
   A phone (or any browser that can't save into a folder) opens that file, keeps a working copy,
   and sends its own edits back as a small change file saved into the folder's inbox/.
   The Mac merges change files item by item (account, transaction, category, goal, setting…), and within an item
   field by field: a category changed on the phone and a payee tidied on the Mac both survive.
   Only when both sides changed the same field of the same item is the Mac's version kept. */

const SYNC = { rec: null, cacheKey: null, cacheOps: [], busy: false, prepared: null, warnedLocked: false };
const SYNC_SKIP_TOP = new Set(['meta', 'version', 'snapshots']);
const SYNC_SKIP_SETTINGS = new Set(['theme', 'look', 'privacy', 'autoLock']);
const isCompanion = () => !Store.canPickFolder;
function deviceLabel() {
  const u = navigator.userAgent || '';
  if (/iPhone/.test(u)) return 'iPhone';
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(u)) return 'phone';
  return 'device';
}
const shortWhen = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const saveLabel = (no, at) => `${no ? `save ${no}` : 'copy'} from ${whenLabel(at)}`;
const whenLabel = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'an unknown date';

/* ---------- diff and merge ---------- */
function stableStr(v) {
  if (v === undefined) return '';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : stableStr(x))).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
}
const hashVal = v => (v === undefined ? '' : hashStr(stableStr(v)));
const sameVal = (a, b) => stableStr(a) === stableStr(b);
const isPlainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const cloneVal = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function isIdList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length + b.length === 0) return false;
  for (const list of [a, b]) {
    const ids = new Set();
    for (const x of list) { if (!isPlainObj(x) || typeof x.id !== 'string' || !x.id || ids.has(x.id)) return false; ids.add(x.id); }
  }
  return true;
}
const syncSkip = (path, k) => (path.length === 0 && SYNC_SKIP_TOP.has(k)) || (path.length === 1 && path[0] === 'settings' && SYNC_SKIP_SETTINGS.has(k));

/* The changes that turn `base` into `cur`, as a flat list. Items in lists with ids are compared whole;
   every change remembers a fingerprint of what it replaced (`was`) so the receiver can spot conflicts. */
function syncDiff(base, cur) { const ops = []; diffInto(ops, base, cur, []); return ops; }
function diffInto(ops, b, c, path) {
  if (isPlainObj(b) && isPlainObj(c)) {
    for (const k of new Set([...Object.keys(b), ...Object.keys(c)])) {
      if (syncSkip(path, k)) continue;
      const p = [...path, k];
      if (c[k] === undefined) { if (b[k] !== undefined) ops.push({ op: 'unset', path: p, was: hashVal(b[k]) }); }
      else if (b[k] === undefined) ops.push({ op: 'set', path: p, v: c[k], was: '' });
      else diffInto(ops, b[k], c[k], p);
    }
    return;
  }
  if (isIdList(b, c)) {
    const bm = new Map(b.map(x => [x.id, x])), cs = new Set(c.map(x => x.id));
    for (const x of c) {
      const o = bm.get(x.id);
      if (!o) ops.push({ op: 'put', path, id: x.id, v: x, was: '' });
      else if (!sameVal(o, x)) ops.push({ op: 'put', path, id: x.id, v: x, was: hashVal(o) });
    }
    for (const o of b) if (!cs.has(o.id)) ops.push({ op: 'del', path, id: o.id, was: hashVal(o) });
    return;
  }
  if (!sameVal(b, c)) ops.push({ op: 'set', path, v: c, was: hashVal(b) });
}

function opLabel(o, target) {
  if (o.path[0] === 'settings' && (o.path[1] === 'checkinQuiet' || o.k === 'checkinQuiet')) return 'check-in: a bill or charge you set aside';
  const v = o.v || (o.op === 'del' ? null : undefined);
  const where = { transactions: 'transaction', accounts: 'account', categories: 'category', goals: 'goal', holdings: 'holding', recurring: 'recurring item', rules: 'rule' }[o.path[0]] || o.path.join(' › ');
  if (o.op === 'put' || o.op === 'del') {
    const list = walkPath(target, o.path);
    const item = (Array.isArray(list) ? list.find(x => x.id === o.id) : null) || v || {};   // name it as it stands where it was kept
    const name = item.payee || item.name || item.text || item.symbol || o.id;
    return `${where} “${name}”`;
  }
  return o.path.join(' › ');
}
function walkPath(root, keys) { let n = root; for (const k of keys) { if (n == null) return undefined; n = n[k]; } return n; }

/* Field-by-field fallback for a changed item: `o.bf` lists, for each field the sender changed, the values it started from.
   A field lands when the receiver still holds one of those; a field the receiver changed too stays as it is (a clash). */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function mergeFields(cur, o) {
  let took = 0, clash = false;
  for (const [k, prevs] of Object.entries(o.bf || {})) {
    if (UNSAFE_KEYS.has(k) || !Array.isArray(prevs)) continue;
    const nv = o.v[k], cs = stableStr(cur[k]);
    if (cs === stableStr(nv)) continue;
    if (prevs.includes(cs)) { if (nv === undefined) delete cur[k]; else cur[k] = cloneVal(nv); took++; }
    else clash = true;
  }
  return { took, clash };
}

/* Apply changes onto `target`. A change only lands if the target still holds what the sender started from
   (or already holds the new value); otherwise the target's version wins and the change is reported as a conflict. */
function syncApply(target, ops) {
  const res = { applied: 0, dupes: 0, conflicts: [], conflictOps: [] };
  const container = (keys, make) => {
    let n = target;
    for (const k of keys) {
      if (n[k] === undefined && make) n[k] = {};
      if (!isPlainObj(n[k])) return null;
      n = n[k];
    }
    return n;
  };
  for (const o of ops) {
    const okPrev = h => (Array.isArray(o.was) ? o.was.includes(h) : o.was === h);
    if (o.op === 'set' || o.op === 'unset') {
      const parent = container(o.path.slice(0, -1), true), k = o.path[o.path.length - 1];
      if (!parent) { (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o)); continue; }
      const cur = parent[k];
      if (o.op === 'set') {
        if (sameVal(cur, o.v)) continue;
        if (okPrev(hashVal(cur))) { parent[k] = cloneVal(o.v); res.applied++; } else (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o));
      } else {
        if (cur === undefined) continue;
        if (okPrev(hashVal(cur))) { delete parent[k]; res.applied++; } else (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o));
      }
      continue;
    }
    const parent = container(o.path.slice(0, -1), true), k = o.path[o.path.length - 1];
    if (!parent) { (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o)); continue; }
    if (parent[k] === undefined && o.op === 'put') parent[k] = [];
    const arr = parent[k];
    if (!Array.isArray(arr)) { (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o)); continue; }
    const idx = arr.findIndex(x => x && x.id === o.id);
    if (o.op === 'put') {
      if (idx < 0) {
        if (!okPrev('')) { (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o)); continue; }       // deleted on the receiving side
        const v = o.v;
        if (o.path.length === 1 && o.path[0] === 'transactions' && v.importId && arr.some(t => t.accountId === v.accountId && t.importId === v.importId)) { res.dupes++; continue; }
        arr.push(cloneVal(v)); res.applied++;
      } else if (!sameVal(arr[idx], o.v)) {
        if (okPrev(hashVal(arr[idx]))) { arr[idx] = cloneVal(o.v); res.applied++; }
        else if (o.bf && isPlainObj(arr[idx]) && isPlainObj(o.v)) {
          const r = mergeFields(arr[idx], o);
          if (r.took) res.applied++;
          if (r.clash) (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o));
        }
        else (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o));
      }
    } else if (idx >= 0) {
      if (okPrev(hashVal(arr[idx]))) { arr.splice(idx, 1); res.applied++; } else (res.conflicts.push(opLabel(o, target)), res.conflictOps.push(o));
    }
  }
  return res;
}

/* ---------- phone side ---------- */
async function syncSave() {
  try {
    if (!SYNC.rec) { await IDB.del('sync'); return; }
    const payload = Store.key ? await Vault.seal({ sync: SYNC.rec }, Store.key, Store.salt) : { sync: SYNC.rec };
    await IDB.set('sync', payload);
  } catch (e) { console.warn('sync record not saved', e); }
}
async function syncLoad() {
  let p = null;
  try { p = await IDB.get('sync'); } catch (e) { /* none */ }
  if (!p) return;
  try {
    if (p.encrypted) { if (!Store.pass) return; p = (await Vault.open(p, Store.pass)).data; }
    SYNC.rec = p.sync || null; SYNC.cacheKey = null;
    if (SYNC.rec) { tidyPayees(SYNC.rec.base); tidyPayees(SYNC.rec.sentSnap); }   // match the tidy-up migrate() does, so it isn't counted as a change
  } catch (e) { SYNC.rec = null; }
}
/* Edits made here since the last send (or since the Mac's data was opened). */
function syncPending() {
  if (!SYNC.rec?.base) return [];
  const key = History.current || JSON.stringify(state);
  if (SYNC.cacheKey !== key) { SYNC.cacheOps = syncDiff(SYNC.rec.sentSnap || SYNC.rec.base, state); SYNC.cacheKey = key; }
  return SYNC.cacheOps;
}
const opKey = o => o.path.join('\u0001') + (o.id ? '#' + o.id : '');
function baseHash(root, o) {
  if (o.op === 'put' || o.op === 'del') { const arr = walkPath(root, o.path); return hashVal(Array.isArray(arr) ? arr.find(x => x && x.id === o.id) : undefined); }
  return hashVal(walkPath(root, o.path));
}
/* Everything this device has changed since the Mac's data was opened, as one self-contained batch.
   Each change accepts the Mac's original value or any value this device sent before, so resending is safe
   and a lost or not-yet-merged earlier file is covered by the next one. */
function syncBatchOps(rec = SYNC.rec) {
  if (!rec?.base) return [];
  const ops = syncDiff(rec.base, state);
  if (rec.sentSnap) { const seen = new Set(ops.map(opKey)); for (const o of syncDiff(rec.sentSnap, state)) if (!seen.has(opKey(o))) ops.push(o); }
  const sent = rec.sentHashes || {};
  return ops.map(o => {
    const out = { ...o, was: [...new Set([baseHash(rec.base, o), ...(sent[opKey(o)] || [])])] };
    if (o.op === 'put') { const bf = fieldPrevs(o.v, [itemAt(rec.base, o), itemAt(rec.sentSnap, o)]); if (bf) out.bf = bf; }
    return out;
  });
}
const itemAt = (root, o) => { const arr = root ? walkPath(root, o.path) : undefined; return Array.isArray(arr) ? arr.find(x => x && x.id === o.id) : undefined; };
/* For each field of `v` that differs from an earlier version of the item, the earlier values (as stableStr). */
function fieldPrevs(v, refs) {
  refs = refs.filter(isPlainObj);
  if (!refs.length || !isPlainObj(v)) return null;
  const bf = {};
  for (const k of new Set([...Object.keys(v), ...refs.flatMap(r => Object.keys(r))])) {
    const nv = stableStr(v[k]), prevs = [...new Set(refs.map(r => stableStr(r[k])))];
    if (prevs.some(p => p !== nv)) bf[k] = prevs;
  }
  return Object.keys(bf).length ? bf : null;
}
const changesWord = n => `${n} change${n === 1 ? '' : 's'}`;

function syncPickFile() {
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = async () => { const f = inp.files[0]; if (f) await syncOpenText(await readFileAsText(f), f.name); };
  inp.click();
}
async function syncOpenText(text, fileName = '') {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return toast('That isn’t an Ọrọ̀ data file. Choose Ọrọ̀ › data › oro.json.'); }
  if (parsed.oroChanges || /^oro-changes-/i.test(fileName)) return toast('That’s a change file. Choose Ọrọ̀ › data › oro.json instead.');
  // Daily backups are named by date, so they look newest; they hold the first save of that day, not the latest
  if (/^(oro|keel)-\d{4}-\d{2}-\d{2}\.json$/i.test(fileName) && !await confirmBox('That’s a daily backup', `<strong>${esc(fileName)}</strong> is a backup: a copy of your Mac’s data from the first save that day, so later changes aren’t in it. For your Mac’s latest, choose <strong>Ọrọ̀ › data › oro.json</strong>.`, 'Open the backup anyway')) return;
  let next;
  try { next = await readDataFile(text, () => promptPass('Unlock your Mac’s data', 'Enter the passphrase you use for Ọrọ̀ on your Mac.')); }
  catch (e) { if (e.message !== 'cancelled') toast(e.message.includes('holds no') ? 'That file doesn’t hold Ọrọ̀ data. Choose Ọrọ̀ › data › oro.json.' : e.message); return; }
  const prev = SYNC.rec, dev = deviceLabel();
  const nNo = Number(next.meta?.saveNo) || 0, nAt = next.meta?.modified || '';
  const older = !!(prev?.macSaved && nAt) && (prev.macSaveNo && nNo ? nNo < prev.macSaveNo : nAt < prev.macSaved);
  if (older && !await confirmBox('This is an older copy', `This file is your Mac’s ${saveLabel(nNo, nAt)}. This ${dev} already has your Mac’s ${saveLabel(prev.macSaveNo, prev.macSaved)}, which is newer. iCloud Drive may still be bringing the newest copy to this ${dev}. Wait a minute, then choose <strong>data › oro.json</strong> again.`, 'Open the older copy anyway', true)) return;
  const cur = cloneVal(next);
  let res = null, carried = 0;
  if (prev?.base && !prev.replaced && !syncLooksReplaced(syncDiff(prev.base, state), prev.base)) {
    const ops = syncBatchOps(prev);
    if (ops.length) {
      res = syncApply(cur, ops); carried = res.applied;
      // Items the Mac already took from this device and changed again later aren't conflicts, just newer edits.
      const sentH = prev.sentHashes || {};
      const real = res.conflictOps.map((o, i) => [o, res.conflicts[i]]).filter(([o]) => !(sentH[opKey(o)] || []).includes(o.op === 'del' || o.op === 'unset' ? '' : hashVal(o.v)));
      res.conflicts = real.map(x => x[1]);
    }
  }
  for (const k of SYNC_SKIP_SETTINGS) if (state.settings && state.settings[k] !== undefined) cur.settings[k] = state.settings[k]; else if (!prev && state.accounts.length && !state.meta.sample && !await confirmBox('Use your Mac’s data?', `This ${deviceLabel()} already has its own data. Replace it with your Mac’s data? Anything you entered only here will be removed.`, 'Use my Mac’s data', true)) return;
  const merged = new Set(next.meta?.mergedBatches || []);
  SYNC.rec = { base: cloneVal(next), macSaved: next.meta?.modified || null, macSaveNo: nNo || null, openedAt: new Date().toISOString(), fileName, lastSent: prev?.lastSent || null };
  if (SYNC.rec.lastSent && merged.has(SYNC.rec.lastSent.id)) SYNC.rec.lastSent.merged = true;
  state = cur; invalidate(); applyTheme(); commit({ silent: true }); resetHistory();
  SYNC.cacheKey = null; SYNC.prepared = null;
  await syncSave();
  closeModal(true); render();
  const same = !!prev?.macSaved && (nNo && prev.macSaveNo ? nNo === prev.macSaveNo : nAt === prev.macSaved);
  let msg = same ? `This is the same copy this ${dev} already had, your Mac’s ${saveLabel(nNo, nAt)}. If your Mac has saved since, iCloud Drive hasn’t brought the new one here yet: open the Files app, go to Ọrọ̀ › data, let oro.json finish downloading, then try again.`
    : `Opened your Mac’s ${saveLabel(nNo, nAt)}.`;
  const lm = next.meta?.lastMerge;
  if (lm && (!prev?.macSaved || lm.at > prev.macSaved)) msg += ` It includes ${changesWord(lm.applied)} from your ${lm.device || dev}, added on your Mac ${whenLabel(lm.at)}${lm.conflicts ? `; your Mac kept its own version of ${lm.conflicts === 1 ? 'one item' : lm.conflicts + ' items'}${lm.kept?.length ? ` (${lm.kept.slice(0, 2).join(', ')}${lm.kept.length > 2 ? '…' : ''})` : ''}` : ''}.`;
  const left = syncPending().length;
  if (left) msg += ` ${changesWord(left)} made here still ${left === 1 ? 'needs' : 'need'} to go to your Mac.`;
  if (res?.conflicts.length) msg += ` Your Mac had also changed ${res.conflicts.length === 1 ? 'one item' : res.conflicts.length + ' items'} you edited here (${res.conflicts.slice(0, 2).join(', ')}${res.conflicts.length > 2 ? '…' : ''}), so its version was kept.`;
  toast(msg);
  if (!prev) go('#/overview');
  return carried;
}

/* True when the edits look like the data was swapped out wholesale rather than edited. */
function syncLooksReplaced(ops, base) {
  const delTx = ops.filter(o => o.op === 'del' && o.path[0] === 'transactions').length, baseTx = (base?.transactions || []).length;
  const delAc = ops.filter(o => o.op === 'del' && o.path[0] === 'accounts').length, baseAc = (base?.accounts || []).length;
  return (baseTx > 20 && delTx > baseTx / 2) || (baseAc > 0 && delAc === baseAc);
}

/* Build the change file ahead of the tap, so the share sheet opens straight from the button press. */
async function syncPrepare() {
  SYNC.prepared = null;
  const fresh = syncPending();
  if (!SYNC.rec || !fresh.length || SYNC.rec.replaced || syncLooksReplaced(syncDiff(SYNC.rec.base, state), SYNC.rec.base)) return null;
  const ops = syncBatchOps();
  const id = 'b' + uid();
  const batch = { oroChanges: 1, id, device: deviceLabel(), createdAt: new Date().toISOString(), base: SYNC.rec.macSaved, count: fresh.length, ops };
  const payload = Store.key ? await Vault.seal(batch, Store.key, Store.salt) : batch;
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const name = `oro-changes-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}-${id.slice(1, 5)}.json`;
  SYNC.prepared = { id, count: fresh.length, createdAt: batch.createdAt, name, text: JSON.stringify(payload), key: History.current, ops };
  return SYNC.prepared;
}
async function syncSend() {
  let p = SYNC.prepared;
  if (!p || p.key !== History.current) p = await syncPrepare();
  if (!p) return toast(SYNC.rec ? `Nothing new to send. Your Mac has everything from this ${deviceLabel()}.` : 'Open your Mac’s data first.');
  const file = new File([p.text], p.name, { type: 'application/json' });
  let shared = false;
  if (navigator.canShare && navigator.share) {
    try { if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); shared = true; } }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!shared) downloadFile(p.name, file);
  SYNC.rec.lastSent = { id: p.id, at: p.createdAt, count: p.count, merged: false };
  const sentHashes = SYNC.rec.sentHashes || (SYNC.rec.sentHashes = {});
  for (const o of p.ops) { const k = opKey(o), h = o.op === 'del' || o.op === 'unset' ? '' : hashVal(o.v); (sentHashes[k] = sentHashes[k] || []).includes(h) || sentHashes[k].push(h); }
  SYNC.rec.sentSnap = cloneVal(state);
  SYNC.prepared = null; SYNC.cacheKey = null;
  await syncSave();
  closeModal(true); render();
  toast(`Sent ${changesWord(p.count)}. Your Mac adds them the next time Ọrọ̀ is open on it.`);
}

function syncSheet() {
  const rec = SYNC.rec, dev = deviceLabel();
  const blocked = !!rec && (rec.replaced || syncLooksReplaced(syncDiff(rec.base, state), rec.base));
  const n = blocked ? 0 : syncPending().length;
  const sent = rec?.lastSent;
  const dels = rec ? syncBatchOps().filter(o => o.op === 'del').length : 0;
  const body = !rec ? `
    <p>Open the data file your Mac keeps in iCloud Drive. This ${dev} keeps a copy, and anything you change here goes back to your Mac.</p>
    <ol class="steps small"><li>Tap <strong>Open from iCloud Drive</strong>.</li><li>Go to <strong>iCloud Drive › Ọrọ̀ › data</strong> and choose <strong>oro.json</strong>.</li><li>Enter the passphrase you use on your Mac, if you set one.</li></ol>`
    : `
    <p>This ${dev} has your Mac’s <strong>${esc(saveLabel(rec.macSaveNo, rec.macSaved))}</strong>.${mergeNote(rec.base?.meta?.lastMerge, dev)}</p>
    ${blocked ? `<p class="notice bad small">The data on this ${dev} was replaced or erased, so it no longer matches your Mac’s. Nothing will be sent. Get the latest from iCloud Drive to start fresh from your Mac’s data.</p>` : ''}
    <div class="sync-block">
      <h3>${n ? `${changesWord(n)} to send` : 'Nothing to send'}</h3>
      <p class="muted small">${n ? `Made on this ${dev} and not on your Mac yet. In the share sheet, choose <strong>Save to Files</strong>, then <strong>iCloud Drive › Ọrọ̀ › inbox</strong>.` : sent ? (sent.merged ? `Your Mac added the last ${changesWord(sent.count)} you sent.` : `You sent ${changesWord(sent.count)} on ${esc(whenLabel(sent.at))}. Your Mac adds them the next time Ọrọ̀ is open on it.`) : `Everything you change here is listed until you send it.`}</p>
      ${dels > 20 ? `<p class="notice bad small">This includes deleting ${dels} items on your Mac. If that isn’t what you meant, get the latest from iCloud Drive first and redo your edits.</p>` : ''}
      ${n ? `<ul class="sync-changes small">${pendingLabels().slice(0, 8).map(l => `<li>${esc(l)}</li>`).join('')}${n > 8 ? `<li class="muted">and ${n - 8} more</li>` : ''}</ul>
      <div class="actions"><button class="btn primary" data-act="sync-send">Send to your Mac</button><button class="btn ghost danger-text" data-act="sync-discard">Discard these changes</button></div>` : ''}
    </div>
    <div class="sync-block">
      <h3>Get the latest from your Mac</h3>
      <p class="muted small">Choose <strong>iCloud Drive › Ọrọ̀ › data › oro.json</strong>. It’s the only file there and always your Mac’s newest save; the save number shows which one you have. Files in <strong>inbox</strong> only carry changes to your Mac, so don’t open those. ${n ? 'Your unsent changes here are kept.' : ''}</p>
      <button class="btn ${n ? '' : 'primary'}" data-act="sync-open">Get latest from iCloud Drive</button>
    </div>
    <p class="muted small sync-note">Keep Ọrọ̀ on your Home Screen. Removing it erases this ${dev}’s copy, including changes you haven’t sent.</p>`;
  openModal({ title: 'Sync with your Mac', body, actions: !rec ? `<button class="btn ghost" data-close>Not now</button><button class="btn primary" data-act="sync-open">Open from iCloud Drive</button>` : `<button class="btn ghost" data-close>Done</button>` });
  if (n) syncPrepare();
}

/* One line on the Mac's last merge of phone changes: when, how many, and anything it kept as its own version. */
function mergeNote(lm, dev) {
  if (!lm) return '';
  const kept = lm.conflicts ? ` It kept its own version of ${lm.conflicts === 1 ? 'one item' : lm.conflicts + ' items'} changed in both places${lm.kept?.length ? `: ${lm.kept.slice(0, 6).map(esc).join(', ')}${lm.kept.length > 6 ? '…' : ''}` : ''}.` : '';
  return ` Your Mac last added changes from your ${esc(lm.device || dev)} ${esc(whenLabel(lm.at))} (${changesWord(lm.applied)}${lm.files > 1 ? ` from ${lm.files} files` : ''}).${kept}`;
}

/* What's waiting to be sent, in words: "Account “Chase checking”: name", "Transaction “Jewel Osco”: category". */
const FIELD_WORDS = { categoryId: 'category', payee: 'payee', amount: 'amount', memo: 'memo', name: 'name', flag: 'flag', tags: 'tags', person: 'person', date: 'date', balance: 'balance', balanceDate: 'balance date', owner: 'owner', budget: 'budget', mortgageId: 'mortgage', amort: 'payment tracking', rate: 'rate', minPayment: 'payment', splits: 'split', institution: 'institution', last4: 'last 4 digits' };
function pendingLabels() {
  const rec = SYNC.rec; if (!rec?.base) return [];
  return syncPending().map(o => {
    const label = opLabel(o, o.op === 'del' ? (rec.sentSnap || rec.base) : state), cap = label.charAt(0).toUpperCase() + label.slice(1);
    if (o.op === 'del') return `${cap}: deleted`;
    if (o.op !== 'put') return cap;
    const before = itemAt(rec.sentSnap || rec.base, o);
    if (!before) return `${cap}: added`;
    const fields = [...new Set([...Object.keys(o.v), ...Object.keys(before)])].filter(k => stableStr(o.v[k]) !== stableStr(before[k])).map(k => FIELD_WORDS[k] || k);
    return `${cap}: ${fields.slice(0, 3).join(', ')}`;
  });
}
/* Throw away this device's unsent edits and go back to the Mac copy it last opened (Undo brings them back). */
async function syncDiscard() {
  const rec = SYNC.rec, n = rec?.base ? syncPending().length : 0;
  if (!n) return toast('Nothing to discard.');
  const dev = deviceLabel();
  // unsent edits are the ones since the last send (or since the Mac copy was opened); anything already sent stays
  const back = rec.sentSnap ? `how it was when you last sent changes (${whenLabel(rec.lastSent?.at)})` : `your Mac’s ${saveLabel(rec.macSaveNo, rec.macSaved)}`;
  if (!await confirmBox('Discard changes on this ' + dev, `Remove the ${changesWord(n)} made on this ${dev} that ${n === 1 ? 'isn’t' : 'aren’t'} on your Mac? This ${dev} goes back to ${esc(back)}. Nothing on your Mac changes.`, 'Discard changes', true)) return;
  const keep = {};
  for (const k of SYNC_SKIP_SETTINGS) keep[k] = state.settings?.[k];
  const next = cloneVal(rec.sentSnap || rec.base);
  for (const k of SYNC_SKIP_SETTINGS) if (keep[k] !== undefined) next.settings[k] = keep[k];
  state = next; invalidate(); applyTheme(); commit({ silent: true });
  SYNC.cacheKey = null; SYNC.prepared = null;
  await syncSave();
  closeModal(true); render();
  toast(`Discarded ${changesWord(n)}. This ${dev} is back to ${back}.`, { label: 'Undo', fn: () => { undo(); SYNC.cacheKey = null; render(); } });
}

/* ---------- Mac side: merge change files from inbox/ ---------- */
async function syncCheckInbox() {
  if (isCompanion() || !hasFolder() || SYNC.busy || document.body.classList.contains('locked')) return;
  SYNC.busy = true;
  try {
    const inbox = await Store.dir.getDirectoryHandle('inbox', { create: true });
    const files = [];
    for await (const [name, h] of inbox.entries()) if (h.kind === 'file' && /\.json$/i.test(name) && !name.startsWith('.')) files.push({ name, h, from: inbox });
    // The iPhone's Save to Files reopens the last folder used, often data/ (where oro.json was picked). Pick change files up there and at the top too.
    const strays = [Store.dir];
    try { strays.push(await Store.dir.getDirectoryHandle('data')); } catch (e) { /* no data folder yet */ }
    for (const d of strays) for await (const [name, h] of d.entries()) if (h.kind === 'file' && /^oro-changes-.*\.json$/i.test(name)) files.push({ name, h, from: d });
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name));
    const merged = new Set(state.meta.mergedBatches || []);
    const tot = { applied: 0, dupes: 0, conflicts: [], batches: 0, device: '' };
    const done = [];
    let locked = 0;
    for (const f of files) {
      let data;
      try {
        data = JSON.parse(await (await f.h.getFile()).text());
        if (data.encrypted) {
          if (!Store.pass) { locked++; continue; }
          try { data = (await Vault.open(data, Store.pass)).data; } catch (e) { locked++; continue; }
        }
      } catch (e) { continue; } // still arriving from iCloud, or not an Ọrọ̀ file
      if (!data || data.oroChanges !== 1 || !Array.isArray(data.ops) || !data.id) continue;
      if (!merged.has(data.id)) {
        const r = syncApply(state, data.ops);
        tot.applied += r.applied; tot.dupes += r.dupes; tot.conflicts.push(...r.conflicts); tot.batches++; tot.device = data.device || 'iPhone';
        merged.add(data.id);
      }
      done.push(f);
    }
    if (tot.batches) {
      state.meta.mergedBatches = [...merged].slice(-300);
      state.meta.lastMerge = { at: new Date().toISOString(), device: tot.device, applied: tot.applied, conflicts: tot.conflicts.length, dupes: tot.dupes, files: tot.batches, kept: [...new Set(tot.conflicts)].slice(0, 25) };
      commit();
      let msg = tot.applied ? `Added ${changesWord(tot.applied)} from your ${tot.device}.` : `Your ${tot.device}’s changes were already here.`;
      if (tot.dupes) msg += ` Skipped ${tot.dupes} transaction${tot.dupes === 1 ? '' : 's'} already imported here.`;
      if (tot.conflicts.length) msg += ` Kept this Mac’s version of ${tot.conflicts.length === 1 ? 'one item' : tot.conflicts.length + ' items'} changed in both places (${tot.conflicts.slice(0, 2).join(', ')}${tot.conflicts.length > 2 ? '…' : ''}).`;
      toast(msg, tot.applied ? { label: 'Undo', fn: undo } : null);
    }
    for (const f of done) await syncFileAway(inbox, f);
    if (locked && !SYNC.warnedLocked) { SYNC.warnedLocked = true; toast(`A change file in inbox/ couldn’t be unlocked. Make sure your iPhone and this Mac use the same passphrase.`); }
  } catch (e) { console.warn('inbox check failed', e); }
  finally { SYNC.busy = false; }
}
/* Processed change files move to inbox/merged/ (the newest 100 are kept). */
async function syncFileAway(inbox, f) {
  try {
    const dir = await inbox.getDirectoryHandle('merged', { create: true });
    await writeHandle(await dir.getFileHandle(f.name, { create: true }), await f.h.getFile());
    await (f.from || inbox).removeEntry(f.name);
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file') names.push(name);
    names.sort();
    for (const name of names.slice(0, Math.max(0, names.length - 100))) await dir.removeEntry(name);
  } catch (e) { console.warn('could not file away', f.name, e); }
}
function syncWatch() {
  if (isCompanion()) return;
  const check = () => { if (document.visibilityState !== 'hidden') syncCheckInbox(); };
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 60000);
  check();
}

/* ---------- hosted copy (iPhone Home Screen): work offline ---------- */
function registerOffline() {
  if (location.protocol !== 'https:' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('offline cache unavailable', e));
}
