/* ---------- reference data ---------- */
const ACCOUNT_TYPES = {
  checking:       { label: 'Checking',              side: 'asset',     bucket: 'cash',     cls: 'Cash', forecast: true, ledger: true },
  savings:        { label: 'Savings',               side: 'asset',     bucket: 'cash',     cls: 'Cash', forecast: true, ledger: true },
  brokerage:      { label: 'Brokerage',             side: 'asset',     bucket: 'invest' },
  retirement:     { label: 'Retirement',            side: 'asset',     bucket: 'invest' },
  education:      { label: 'Education or custodial', side: 'asset',    bucket: 'invest' },
  hsa:            { label: 'HSA',                   side: 'asset',     bucket: 'invest' },
  crypto:         { label: 'Crypto',                side: 'asset',     bucket: 'invest',   cls: 'Crypto' },
  private:        { label: 'Private investment',    side: 'asset',     bucket: 'illiquid', cls: 'Private & alternatives' },
  realestate:     { label: 'Real estate',           side: 'asset',     bucket: 'illiquid', cls: 'Real estate' },
  vehicle:        { label: 'Vehicle',               side: 'asset',     bucket: 'illiquid', cls: 'Other' },
  otherAsset:     { label: 'Other asset',           side: 'asset',     bucket: 'illiquid', cls: 'Other' },
  credit:         { label: 'Credit card',           side: 'liability', bucket: 'debt', ledger: true },
  mortgage:       { label: 'Mortgage',              side: 'liability', bucket: 'debt' },
  loan:           { label: 'Loan',                  side: 'liability', bucket: 'debt' },
  otherLiability: { label: 'Other liability',       side: 'liability', bucket: 'debt' },
};
const BUCKETS = [
  { id: 'cash',     label: 'Cash',                        types: ['checking', 'savings'] },
  { id: 'invest',   label: 'Investments',                 types: ['brokerage', 'retirement', 'education', 'hsa', 'crypto'] },
  { id: 'illiquid', label: 'Property and private assets', types: ['realestate', 'private', 'vehicle', 'otherAsset'] },
  { id: 'debt',     label: 'Liabilities',                 types: ['credit', 'mortgage', 'loan', 'otherLiability'] },
];
const ASSET_CLASSES = ['Cash', 'US stocks', 'International stocks', 'Bonds', 'Real estate', 'Private & alternatives', 'Crypto', 'Other'];
const CLASS_COLORS = { 'Cash': 'var(--c6)', 'US stocks': 'var(--c1)', 'International stocks': 'var(--c2)', 'Bonds': 'var(--c3)', 'Real estate': 'var(--c4)', 'Private & alternatives': 'var(--c5)', 'Crypto': 'var(--c7)', 'Other': 'var(--c8)', 'Unclassified': 'var(--muted-2)' };
/* Long-run capital market assumptions (nominal arithmetic return, volatility) used by the planner. Editable in Planning. */
const DEFAULT_CMA = { 'Cash': [3.5, 1], 'US stocks': [8, 16], 'International stocks': [8, 18], 'Bonds': [4.5, 6], 'Real estate': [7, 14], 'Private & alternatives': [9, 24], 'Crypto': [10, 60], 'Other': [5, 10], 'Unclassified': [7, 15] };
const FREQS = { weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Twice a year', annual: 'Yearly' };
const FREQ_PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
const RENTAL_ROLES = { income: 'Rental income', opex: 'Operating expense', debt: 'Debt service' };
const SCHED_E = { '3': 'Rents received', '5': 'Advertising', '6': 'Auto and travel', '7': 'Cleaning and maintenance', '8': 'Commissions', '9': 'Insurance', '10': 'Legal and other professional fees', '11': 'Management fees', '12': 'Mortgage interest', '13': 'Other interest', '14': 'Repairs', '15': 'Supplies', '16': 'Taxes', '17': 'Utilities', '18': 'Depreciation', '19': 'Other' };
const TAX_TAGS = ['Charitable', 'Medical', 'State and local taxes', 'Mortgage interest', 'Dependent care', 'Education', 'Business'];

const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function defaultCategories() {
  const C = [];
  const add = (group, kind, names) => names.forEach(n => {
    const [name, budget = 0, period = 'month', extra = {}] = Array.isArray(n) ? n : [n];
    C.push({ id: 'c-' + slug(group + '-' + name), name, group, kind, budget, period, ...extra });
  });
  add('Income', 'income', ['Paycheck', 'Bonus', 'Interest and dividends', 'Other income']);
  add('Home', 'expense', ['Mortgage or rent', ['Property tax', 0, 'year', { taxTag: 'State and local taxes' }], ['Home insurance', 0, 'year'], 'Utilities', 'Home maintenance']);
  add('Transportation', 'expense', ['Auto payment', 'Fuel and charging', ['Auto insurance', 0, 'year'], 'Auto maintenance', 'Parking and tolls', 'Transit and rideshare']);
  add('Food', 'expense', ['Groceries', 'Dining out', 'Coffee']);
  add('Family', 'expense', [['Childcare', 0, 'month', { taxTag: 'Dependent care' }], 'Kids activities', ['School', 0, 'month', { taxTag: 'Education' }], 'Pets']);
  add('Health', 'expense', [['Medical', 0, 'month', { taxTag: 'Medical' }], 'Fitness']);
  add('Lifestyle', 'expense', ['Shopping', 'Entertainment', 'Subscriptions', ['Travel', 0, 'year'], 'Gifts', ['Charitable giving', 0, 'month', { taxTag: 'Charitable' }], 'Personal care']);
  add('Financial', 'expense', ['Life and disability insurance', 'Taxes', 'Bank fees']);
  add('Rental property', 'income', [['Rent received', 0, 'month', { rental: 'income', schedE: '3' }]]);
  add('Rental property', 'expense', [
    ['Rental mortgage', 0, 'month', { rental: 'debt' }],
    ['Rental repairs', 0, 'month', { rental: 'opex', schedE: '14' }],
    ['Rental property tax', 0, 'year', { rental: 'opex', schedE: '16' }],
    ['Rental insurance', 0, 'year', { rental: 'opex', schedE: '9' }],
    ['Rental utilities', 0, 'month', { rental: 'opex', schedE: '17' }],
    ['Rental management and other', 0, 'month', { rental: 'opex', schedE: '19' }]]);
  add('Transfers', 'transfer', ['Transfer between accounts', 'Credit card payment', 'Savings and investing', 'Balance adjustment']);
  return C;
}
function defaultPlan() {
  return { age: null, retireAge: 62, endAge: 95, spending: null, payrollSavings: 0, otherIncome: 0, otherIncomeAge: 67, inflation: 2.5, includePrivate: true, includeRental: true, cma: null, sims: 2000, target: 90, debtExtra: 500, debtMethod: 'avalanche', includeMortgages: false };
}
function defaultState() {
  const now = new Date().toISOString();
  return {
    version: 2,
    meta: { created: now, modified: now },
    settings: { theme: 'auto', lowCash: 2500, staleDays: 35, targets: {}, privacy: false, autoLock: 15, keepBackups: 30, members: [{ id: 'joint', name: 'Joint' }, { id: 'you', name: 'You' }, { id: 'partner', name: 'Partner' }] },
    accounts: [], transactions: [], categories: defaultCategories(), rules: [],
    holdings: [], recurring: [], snapshots: {}, reviews: {}, goals: [], plan: defaultPlan(), tax: {},
  };
}
function migrate(s) {
  const d = defaultState();
  const fromVersion = s?.version || 1;
  s = Object.assign(d, s || {});
  s.settings = Object.assign(defaultState().settings, s.settings || {});
  s.plan = Object.assign(defaultPlan(), s.plan || {});
  for (const k of ['accounts', 'transactions', 'categories', 'rules', 'holdings', 'recurring', 'goals']) if (!Array.isArray(s[k])) s[k] = [];
  for (const k of ['snapshots', 'reviews', 'tax']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  if (!s.categories.length) s.categories = defaultCategories();
  if (!Array.isArray(s.settings.members) || !s.settings.members.length) s.settings.members = defaultState().settings.members;
  if (fromVersion < 2) {
    // categories and fields introduced in v2
    const defs = defaultCategories();
    for (const id of ['c-transportation-transit-and-rideshare', 'c-lifestyle-charitable-giving', 'c-transfers-balance-adjustment']) {
      if (!s.categories.some(c => c.id === id)) s.categories.push(defs.find(c => c.id === id));
    }
    for (const c of s.categories) {
      const def = defs.find(x => x.id === c.id);
      if (def && def.schedE && !c.schedE) c.schedE = def.schedE;
      if (def && def.taxTag && !c.taxTag) c.taxTag = def.taxTag;
      if (c.rental === 'income' && !c.schedE) c.schedE = '3';
      if (c.rental === 'opex' && !c.schedE) c.schedE = '19';
    }
    for (const a of s.accounts) {
      if (ACCOUNT_TYPES[a.type]?.ledger && a.ledger == null) { a.ledger = true; a.anchorBalance = Number(a.balance) || 0; a.anchorDate = a.balanceDate || today(); }
      if (!a.owner || a.owner === 'Joint') a.owner = 'joint';
    }
    s.version = 2;
  }
  tidyPayees(s);
  return s;
}
/* Older imports capitalized after apostrophes ("Rita'S", "Mcdonald'S") and kept store numbers on mixed-case names.
   Runs the same way on every device, so the Mac and phone stay in step. */
function tidyPayees(s) {
  for (const t of s?.transactions || []) {
    if (typeof t.payee !== 'string') continue;
    let p = t.payee;
    if (t.rawPayee && /[a-z]/.test(t.rawPayee) && p === t.rawPayee.trim()) p = prettyPayee(t.rawPayee);
    p = p.replace(/([A-Za-z])'S\b/g, "$1's").replace(/\bMc([a-z])/g, (m, b) => 'Mc' + b.toUpperCase());
    if (p !== t.payee) t.payee = p;
  }
  return s;
}

let state = defaultState();

/* ---------- lookups ---------- */
const acctById = id => state.accounts.find(a => a.id === id);
const catById = id => state.categories.find(c => c.id === id);
const catName = id => (id === '__split' ? 'Split' : catById(id)?.name) || 'Uncategorized';
const isTransferCat = id => catById(id)?.kind === 'transfer';
const activeAccounts = () => state.accounts.filter(a => !a.archived);
const allTags = () => [...new Set(state.transactions.flatMap(t => t.tags || []))].sort();

/* ---------- local storage: IndexedDB with localStorage fallback ---------- */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open('keel-finance', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) { await this.open(); return new Promise((res, rej) => { const q = this.db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { await this.open(); return new Promise((res, rej) => { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  async del(k) { await this.open(); return new Promise((res, rej) => { const t = this.db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
};

/* ---------- passphrase encryption (AES-256-GCM, PBKDF2-SHA256) ---------- */
const b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const Vault = {
  ITER: 310000,
  available: () => !!(window.crypto && crypto.subtle),
  async key(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: this.ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async seal(obj, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { keel: 2, encrypted: true, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: this.ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) };
  },
  async sealBytes(bytes, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    const out = new Uint8Array(4 + 12 + ct.byteLength); out.set([75, 69, 76, 49]); out.set(iv, 4); out.set(new Uint8Array(ct), 16);
    return out;
  },
  async openBytes(bytes, key) {
    const b = new Uint8Array(bytes);
    if (!(b[0] === 75 && b[1] === 69 && b[2] === 76 && b[3] === 49)) return b; // not encrypted
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(4, 16) }, key, b.slice(16)));
  },
  async open(env, pass) {
    const salt = unb64(env.salt);
    const key = await this.key(pass, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
    return { data: JSON.parse(new TextDecoder().decode(pt)), key, salt };
  },
};

/* ---------- persistence: browser storage + a Ọrọ̀ folder (or a single data file) ---------- */
const Store = {
  key: null, salt: null, pass: null,
  dir: null,                 // FileSystemDirectoryHandle for the Ọrọ̀ folder
  handle: null,              // legacy single data file
  perm: 'none', fileName: '', fileSavedAt: null, lastBackup: null,
  status: 'idle', savedAt: null, error: '',
  canPickFiles: typeof window.showSaveFilePicker === 'function',
  canPickFolder: typeof window.showDirectoryPicker === 'function',
};
const hasFolder = () => !!(Store.dir && Store.perm === 'granted');

async function serialize() {
  const plain = { keel: 2, /* format id, kept for compatibility */ encrypted: false, savedAt: new Date().toISOString(), state };
  if (Store.key) return Vault.seal(plain, Store.key, Store.salt);
  return plain;
}
function unwrap(payload) {
  if (!payload) return null;
  if (payload.state) return payload.state;
  if (payload.accounts || payload.transactions) return payload;
  return null;
}
async function queryPerm(h, ask) {
  if (!h) return 'none';
  try {
    if (!h.queryPermission) return 'granted'; // origin-private handles (tests) have no permission API
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
    return p;
  } catch (e) { return 'prompt'; }
}
async function dirFile(sub, name, create) {
  let d = Store.dir;
  for (const part of sub.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
  return d.getFileHandle(name, { create });
}
/* Data file names. Builds before the rename used keel.json and keel-YYYY-MM-DD backups; those are still read. */
const DATA_FILE = 'oro.json', LEGACY_DATA_FILE = 'keel.json';
async function readFolderData() {
  for (const n of [DATA_FILE, LEGACY_DATA_FILE]) { try { const t = await readHandleText(await dirFile('data', n, false)); if (t && t.trim()) return t; } catch (e) { /* try the next name */ } }
  return null;
}
async function writeHandle(fh, data) { const w = await fh.createWritable(); await w.write(data); await w.close(); }
async function readHandleText(fh) { return (await fh.getFile()).text(); }

async function persistNow() {
  Store.status = 'saving'; paintStatus();
  try {
    const payload = await serialize();
    try { await IDB.set('state', payload); }
    catch (e) { try { localStorage.setItem('keel.state', JSON.stringify(payload)); } catch (e2) { /* in memory only */ } }
    const text = JSON.stringify(payload);
    if (hasFolder()) {
      try {
        await writeHandle(await dirFile('data', DATA_FILE, true), text);
        Store.fileSavedAt = new Date();
        await dailyBackup(text);
      } catch (e) { console.warn(e); Store.perm = await queryPerm(Store.dir); }
    } else if (Store.handle && Store.perm === 'granted') {
      try { await writeHandle(Store.handle, text); Store.fileSavedAt = new Date(); }
      catch (e) { Store.perm = 'prompt'; }
    }
    Store.status = 'saved'; Store.savedAt = new Date(); Store.error = '';
  } catch (e) {
    Store.status = 'error'; Store.error = e.message || String(e);
  }
  paintStatus();
}
const persist = debounce(persistNow, 450);

/* One backup per day in backups/, pruned to the newest N plus one per month for a year. */
async function dailyBackup(text) {
  const day = today();
  if (Store.lastBackup === day) return;
  const name = `oro-${day}.json`;
  await writeHandle(await dirFile('backups', name, true), text);
  Store.lastBackup = day;
  await pruneBackups();
}
async function listBackups() {
  if (!hasFolder()) return [];
  try {
    const d = await Store.dir.getDirectoryHandle('backups', { create: true });
    const out = [];
    for await (const [name, h] of d.entries()) {
      const m = h.kind === 'file' && /^(?:oro|keel)-(\d{4}-\d{2}-\d{2}).*\.json$/.exec(name);
      if (m) out.push({ name, date: m[1], handle: h });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name));
  } catch (e) { return []; }
}
async function pruneBackups() {
  const list = await listBackups();
  const keep = new Set(list.slice(0, state.settings.keepBackups || 30).map(b => b.name));
  const months = {};
  for (const b of list) { const m = b.date.slice(0, 7); months[m] = b.name; } // oldest of each month wins (list is newest first)
  Object.entries(months).sort().reverse().slice(0, 12).forEach(([, n]) => keep.add(n));
  const d = await Store.dir.getDirectoryHandle('backups');
  for (const b of list) if (!keep.has(b.name)) { try { await d.removeEntry(b.name); } catch (e) { /* ignore */ } }
}

/* ---------- undo / redo ---------- */
const History = { past: [], future: [], current: null, max: 40 };
function resetHistory() { History.past = []; History.future = []; History.current = JSON.stringify(state); }
function commit(opts = {}) {
  state.meta.modified = new Date().toISOString();
  recordSnapshot();
  invalidate();
  const json = JSON.stringify(state);
  if (History.current && History.current !== json) {
    History.past.push(History.current);
    let total = sum(History.past.map(s => s.length));
    while (History.past.length > History.max || (total > 60e6 && History.past.length > 2)) total -= History.past.shift().length;
    History.future = [];
  }
  History.current = json;
  persist();
  if (!opts.silent) render();
}
function undo() {
  if (!History.past.length) return toast('Nothing to undo.');
  History.future.push(History.current);
  History.current = History.past.pop();
  state = JSON.parse(History.current); invalidate(); applyTheme(); persist(); render();
  toast('Undone.', { label: 'Redo', fn: redo });
}
function redo() {
  if (!History.future.length) return toast('Nothing to redo.');
  History.past.push(History.current);
  History.current = History.future.pop();
  state = JSON.parse(History.current); invalidate(); applyTheme(); persist(); render();
  toast('Redone.');
}

async function loadFromBrowser() {
  let payload = null;
  try { payload = await IDB.get('state'); } catch (e) { /* fall through */ }
  if (!payload) { try { payload = JSON.parse(localStorage.getItem('keel.state') || 'null'); } catch (e) { /* none */ } }
  try {
    const dir = await IDB.get('dirHandle');
    if (dir) { Store.dir = dir; Store.fileName = dir.name; Store.perm = await queryPerm(dir); }
    else {
      const h = await IDB.get('fileHandle');
      if (h) { Store.handle = h; Store.fileName = h.name; Store.perm = await queryPerm(h); }
    }
  } catch (e) { /* no handles */ }
  return payload;
}
async function readStoredText() {
  if (Store.dir) return readFolderData();
  if (Store.handle) return readHandleText(Store.handle);
  return null;
}
/* If the folder or file holds newer data (edited on another machine, or restored by hand), prefer it. */
async function syncFromDiskIfNewer() {
  if (Store.perm !== 'granted') return false;
  try {
    const text = await readStoredText();
    if (!text || !text.trim()) return false;
    const payload = JSON.parse(text);
    let diskState;
    if (payload.encrypted) { if (!Store.pass) return false; diskState = unwrap((await Vault.open(payload, Store.pass)).data); }
    else diskState = unwrap(payload);
    if (diskState && diskState.meta?.modified > state.meta.modified) { state = migrate(diskState); return true; }
  } catch (e) { /* unreadable: keep browser copy */ }
  return false;
}

async function setPassphrase(pass) {
  if (!pass) { Store.key = null; Store.salt = null; Store.pass = null; await persistNow(); if (SYNC.rec) await syncSave(); return; }
  Store.salt = crypto.getRandomValues(new Uint8Array(16));
  Store.key = await Vault.key(pass, Store.salt);
  Store.pass = pass;
  Store.lastBackup = null; // next save writes a fresh, encrypted backup
  await persistNow();
  if (SYNC.rec) await syncSave();
}

/* Folder mode: the recommended setup on a Mac. */
async function useFolder(dir) {
  Store.dir = dir; Store.handle = null; Store.fileName = dir.name; Store.perm = await queryPerm(dir, true);
  try { await IDB.set('dirHandle', dir); await IDB.del('fileHandle'); } catch (e) { /* not persisted */ }
  return Store.perm === 'granted';
}
async function folderHasData() { return readFolderData(); }
async function connectNewFile() {
  const handle = await window.showSaveFilePicker({ suggestedName: 'oro-finances.json', types: [{ description: 'Ọrọ̀ data file', accept: { 'application/json': ['.json'] } }] });
  Store.handle = handle; Store.dir = null; Store.perm = 'granted'; Store.fileName = handle.name;
  try { await IDB.set('fileHandle', handle); await IDB.del('dirHandle'); } catch (e) { /* not persisted */ }
  await persistNow();
}
async function reconnect() {
  const h = Store.dir || Store.handle; if (!h) return false;
  Store.perm = await queryPerm(h, true);
  if (Store.perm === 'granted') { const changed = await syncFromDiskIfNewer(); if (changed) resetHistory(); await persistNow(); if (changed) render(); }
  paintStatus();
  return Store.perm === 'granted';
}
async function disconnectStorage() {
  Store.handle = null; Store.dir = null; Store.perm = 'none'; Store.fileName = '';
  try { await IDB.del('fileHandle'); await IDB.del('dirHandle'); } catch (e) { /* ignore */ }
  paintStatus();
}

/* Read a Ọrọ̀ data file (picker, backup, or folder). Returns migrated state or throws. */
async function readDataFile(text, askPass) {
  let payload;
  try { payload = JSON.parse(text); } catch (e) { throw new Error('That file isn’t a Ọrọ̀ data file (it isn’t valid JSON).'); }
  if (payload.encrypted) {
    let pass = Store.pass, opened = null;
    if (pass) { try { opened = await Vault.open(payload, pass); } catch (e) { opened = null; } }
    if (!opened) {
      pass = await askPass(); if (!pass) throw new Error('cancelled');
      try { opened = await Vault.open(payload, pass); } catch (e) { throw new Error('That passphrase didn’t unlock the file.'); }
    }
    Store.key = opened.key; Store.salt = opened.salt; Store.pass = pass;
    const s = unwrap(opened.data);
    if (!s) throw new Error('The file unlocked, but it holds no Ọrọ̀ data.');
    return migrate(s);
  }
  const s = unwrap(payload);
  if (!s) throw new Error('That file isn’t a Ọrọ̀ data file.');
  return migrate(s);
}

/* ---------- receipts and exports in the Ọrọ̀ folder ---------- */
async function saveAttachment(file, t) {
  if (!hasFolder()) throw new Error('Connect your Ọrọ̀ folder in Settings to keep receipts.');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 6);
  const name = `${t.date}-${slugFile(t.payee)}-${uid().slice(0, 5)}.${ext}${Store.key ? '.enc' : ''}`;
  const folder = `receipts/${t.date.slice(0, 4)}`;
  let bytes = new Uint8Array(await readFileAsBuffer(file));
  if (Store.key) bytes = await Vault.sealBytes(bytes, Store.key);
  await writeHandle(await dirFile(folder, name, true), bytes);
  return { name: file.name, path: `${folder}/${name}`, type: file.type || '', size: file.size };
}
async function openAttachment(att) {
  if (!hasFolder()) throw new Error('Connect your Ọrọ̀ folder to open receipts.');
  const parts = att.path.split('/'), name = parts.pop();
  const fh = await dirFile(parts.join('/'), name, false);
  let bytes = new Uint8Array(await (await fh.getFile()).arrayBuffer());
  if (Store.key) bytes = await Vault.openBytes(bytes, Store.key);
  const url = URL.createObjectURL(new Blob([bytes], { type: att.type || 'application/octet-stream' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function saveExport(name, text, mime = 'text/csv') {
  if (hasFolder()) {
    try { await writeHandle(await dirFile('exports', name, true), text); toast(`Saved to ${Store.fileName}/exports/${name}`); return; }
    catch (e) { /* fall back to download */ }
  }
  downloadFile(name, text, mime);
}

/* ---------- monthly balance snapshots (signed: liabilities negative) ---------- */
function signedValue(a) { const v = accountValue(a); return ACCOUNT_TYPES[a.type]?.side === 'liability' ? -v : v; }
function recordSnapshot() {
  const mk = thisMonth();
  const snap = {};
  for (const a of activeAccounts()) snap[a.id] = round2(signedValue(a));
  state.snapshots[mk] = snap;
}
/* Set an account's balance by hand (anchors ledger accounts). */
function setBalance(a, value, date = today()) {
  a.balance = round2(value); a.balanceDate = date;
  if (a.ledger) { a.anchorBalance = round2(value); a.anchorDate = date; }
}
