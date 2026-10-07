/* ---------- reference data ---------- */
const ACCOUNT_TYPES = {
  checking:       { label: 'Checking',              side: 'asset',     bucket: 'cash',     cls: 'Cash', forecast: true },
  savings:        { label: 'Savings',               side: 'asset',     bucket: 'cash',     cls: 'Cash', forecast: true },
  brokerage:      { label: 'Brokerage',             side: 'asset',     bucket: 'invest' },
  retirement:     { label: 'Retirement',            side: 'asset',     bucket: 'invest' },
  education:      { label: 'Education or custodial', side: 'asset',    bucket: 'invest' },
  hsa:            { label: 'HSA',                   side: 'asset',     bucket: 'invest' },
  crypto:         { label: 'Crypto',                side: 'asset',     bucket: 'invest',   cls: 'Crypto' },
  private:        { label: 'Private investment',    side: 'asset',     bucket: 'illiquid', cls: 'Private & alternatives' },
  realestate:     { label: 'Real estate',           side: 'asset',     bucket: 'illiquid', cls: 'Real estate' },
  vehicle:        { label: 'Vehicle',               side: 'asset',     bucket: 'illiquid', cls: 'Other' },
  otherAsset:     { label: 'Other asset',           side: 'asset',     bucket: 'illiquid', cls: 'Other' },
  credit:         { label: 'Credit card',           side: 'liability', bucket: 'debt' },
  mortgage:       { label: 'Mortgage',              side: 'liability', bucket: 'debt' },
  loan:           { label: 'Loan',                  side: 'liability', bucket: 'debt' },
  otherLiability: { label: 'Other liability',       side: 'liability', bucket: 'debt' },
};
const BUCKETS = [
  { id: 'cash',     label: 'Cash',                      types: ['checking', 'savings'] },
  { id: 'invest',   label: 'Investments',               types: ['brokerage', 'retirement', 'education', 'hsa', 'crypto'] },
  { id: 'illiquid', label: 'Property and private assets', types: ['realestate', 'private', 'vehicle', 'otherAsset'] },
  { id: 'debt',     label: 'Liabilities',               types: ['credit', 'mortgage', 'loan', 'otherLiability'] },
];
const ASSET_CLASSES = ['Cash', 'US stocks', 'International stocks', 'Bonds', 'Real estate', 'Private & alternatives', 'Crypto', 'Other'];
const CLASS_COLORS = { 'Cash': 'var(--c6)', 'US stocks': 'var(--c1)', 'International stocks': 'var(--c2)', 'Bonds': 'var(--c3)', 'Real estate': 'var(--c4)', 'Private & alternatives': 'var(--c5)', 'Crypto': 'var(--c7)', 'Other': 'var(--c8)', 'Unclassified': 'var(--muted-2)' };
const FREQS = { weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Twice a year', annual: 'Yearly' };
const RENTAL_ROLES = { income: 'Rental income', opex: 'Operating expense', debt: 'Debt service' };

const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function defaultCategories() {
  const C = [];
  const add = (group, kind, names, extra = {}) => names.forEach(n => {
    const [name, budget = 0, period = 'month', rental] = Array.isArray(n) ? n : [n];
    C.push({ id: 'c-' + slug(group + '-' + name), name, group, kind, budget, period, ...(rental ? { rental } : {}), ...extra });
  });
  add('Income', 'income', ['Paycheck', 'Bonus', 'Interest and dividends', 'Other income']);
  add('Home', 'expense', ['Mortgage or rent', ['Property tax', 0, 'year'], ['Home insurance', 0, 'year'], 'Utilities', 'Home maintenance']);
  add('Transportation', 'expense', ['Auto payment', 'Fuel and charging', ['Auto insurance', 0, 'year'], 'Auto maintenance', 'Parking and tolls', 'Transit and rideshare']);
  add('Food', 'expense', ['Groceries', 'Dining out', 'Coffee']);
  add('Family', 'expense', ['Childcare', 'Kids activities', 'School', 'Pets']);
  add('Health', 'expense', ['Medical', 'Fitness']);
  add('Lifestyle', 'expense', ['Shopping', 'Entertainment', 'Subscriptions', ['Travel', 0, 'year'], 'Gifts and giving', 'Personal care']);
  add('Financial', 'expense', ['Life and disability insurance', 'Taxes', 'Bank fees']);
  add('Rental property', 'income', [['Rent received', 0, 'month', 'income']]);
  add('Rental property', 'expense', [['Rental mortgage', 0, 'month', 'debt'], ['Rental repairs', 0, 'month', 'opex'], ['Rental property tax', 0, 'year', 'opex'], ['Rental insurance', 0, 'year', 'opex'], ['Rental utilities', 0, 'month', 'opex'], ['Rental management and other', 0, 'month', 'opex']]);
  add('Transfers', 'transfer', ['Transfer between accounts', 'Credit card payment', 'Savings and investing']);
  return C;
}

function defaultState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    meta: { created: now, modified: now },
    settings: { theme: 'auto', lowCash: 2500, staleDays: 35, targets: {} },
    accounts: [], transactions: [], categories: defaultCategories(), rules: [],
    holdings: [], recurring: [], snapshots: {}, reviews: {},
  };
}
function migrate(s) {
  const d = defaultState();
  s = Object.assign(d, s || {});
  s.settings = Object.assign(defaultState().settings, s.settings || {});
  for (const k of ['accounts', 'transactions', 'categories', 'rules', 'holdings', 'recurring']) if (!Array.isArray(s[k])) s[k] = [];
  for (const k of ['snapshots', 'reviews']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  if (!s.categories.length) s.categories = defaultCategories();
  return s;
}

let state = defaultState();

/* ---------- lookups ---------- */
const acctById = id => state.accounts.find(a => a.id === id);
const catById = id => state.categories.find(c => c.id === id);
const catName = id => (catById(id)?.name) || 'Uncategorized';
const isTransferCat = id => catById(id)?.kind === 'transfer';
const activeAccounts = () => state.accounts.filter(a => !a.archived);

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
    return { keel: 1, encrypted: true, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: this.ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) };
  },
  async open(env, pass) {
    const salt = unb64(env.salt);
    const key = await this.key(pass, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
    return { data: JSON.parse(new TextDecoder().decode(pt)), key, salt };
  },
};

/* ---------- persistence ---------- */
const Store = {
  key: null, salt: null,            // set when a passphrase is in use
  handle: null, perm: 'none', fileName: '', fileSavedAt: null,
  status: 'idle', savedAt: null, error: '',
  canPickFiles: typeof window.showSaveFilePicker === 'function',
};

async function serialize() {
  const plain = { keel: 1, encrypted: false, savedAt: new Date().toISOString(), state };
  if (Store.key) return Vault.seal(plain, Store.key, Store.salt);
  return plain;
}
function unwrap(payload) {
  if (!payload) return null;
  if (payload.state) return payload.state;
  if (payload.accounts || payload.transactions) return payload; // bare state
  return null;
}

async function persistNow() {
  Store.status = 'saving'; paintStatus();
  try {
    const payload = await serialize();
    try { await IDB.set('state', payload); }
    catch (e) { try { localStorage.setItem('keel.state', JSON.stringify(payload)); } catch (e2) { /* storage unavailable: data stays in memory */ } }
    if (Store.handle && Store.perm === 'granted') {
      try {
        const w = await Store.handle.createWritable();
        await w.write(JSON.stringify(payload));
        await w.close();
        Store.fileSavedAt = new Date();
      } catch (e) { Store.perm = 'prompt'; }
    }
    Store.status = 'saved'; Store.savedAt = new Date(); Store.error = '';
  } catch (e) {
    Store.status = 'error'; Store.error = e.message || String(e);
  }
  paintStatus();
}
const persist = debounce(persistNow, 450);

/* Every mutation goes through commit(): stamps, snapshots, saves, re-renders. */
function commit(opts = {}) {
  state.meta.modified = new Date().toISOString();
  recordSnapshot();
  persist();
  if (!opts.silent) render();
}

async function loadFromBrowser() {
  let payload = null;
  try { payload = await IDB.get('state'); } catch (e) { /* fall through */ }
  if (!payload) { try { payload = JSON.parse(localStorage.getItem('keel.state') || 'null'); } catch (e) { /* none */ } }
  try {
    const h = await IDB.get('fileHandle');
    if (h) { Store.handle = h; Store.fileName = h.name; try { Store.perm = await h.queryPermission({ mode: 'readwrite' }); } catch (e) { Store.perm = 'prompt'; } }
  } catch (e) { /* no handle */ }
  return payload;
}

/* Called after unlocking or loading: if a connected file is newer, prefer it. */
async function syncFromFileIfNewer() {
  if (!Store.handle || Store.perm !== 'granted') return false;
  try {
    const text = await (await Store.handle.getFile()).text();
    if (!text.trim()) return false;
    let payload = JSON.parse(text), fileState;
    if (payload.encrypted) {
      if (!Store.pass) return false;
      fileState = unwrap((await Vault.open(payload, Store.pass)).data);
    } else fileState = unwrap(payload);
    if (fileState && fileState.meta?.modified > state.meta.modified) { state = migrate(fileState); return true; }
  } catch (e) { /* unreadable file: keep browser copy */ }
  return false;
}

async function setPassphrase(pass) {
  if (!pass) { Store.key = null; Store.salt = null; Store.pass = null; await persistNow(); return; }
  Store.salt = crypto.getRandomValues(new Uint8Array(16));
  Store.key = await Vault.key(pass, Store.salt);
  Store.pass = pass;
  await persistNow();
}

async function connectNewFile() {
  const handle = await window.showSaveFilePicker({
    suggestedName: `keel-finances.json`,
    types: [{ description: 'Keel data file', accept: { 'application/json': ['.json'] } }],
  });
  Store.handle = handle; Store.perm = 'granted'; Store.fileName = handle.name;
  try { await IDB.set('fileHandle', handle); } catch (e) { /* handle not persisted */ }
  await persistNow();
}
async function reconnectFile() {
  if (!Store.handle) return false;
  Store.perm = await Store.handle.requestPermission({ mode: 'readwrite' });
  if (Store.perm === 'granted') { const changed = await syncFromFileIfNewer(); await persistNow(); if (changed) render(); }
  paintStatus();
  return Store.perm === 'granted';
}
async function disconnectFile() {
  Store.handle = null; Store.perm = 'none'; Store.fileName = '';
  try { await IDB.del('fileHandle'); } catch (e) { /* ignore */ }
  paintStatus();
}

/* Read a data file chosen by the user (picker or <input>). Returns state or throws. */
async function readDataFile(text, askPass) {
  let payload;
  try { payload = JSON.parse(text); } catch (e) { throw new Error('That file isn’t a Keel data file (it isn’t valid JSON).'); }
  if (payload.encrypted) {
    const pass = await askPass();
    if (!pass) throw new Error('cancelled');
    let opened;
    try { opened = await Vault.open(payload, pass); } catch (e) { throw new Error('That passphrase didn’t unlock the file.'); }
    Store.key = opened.key; Store.salt = opened.salt; Store.pass = pass;
    const s = unwrap(opened.data);
    if (!s) throw new Error('The file unlocked, but it holds no Keel data.');
    return migrate(s);
  }
  const s = unwrap(payload);
  if (!s) throw new Error('That file isn’t a Keel data file.');
  return migrate(s);
}

/* ---------- monthly balance snapshots (signed: liabilities negative) ---------- */
function signedValue(a) { const v = accountValue(a); return ACCOUNT_TYPES[a.type]?.side === 'liability' ? -v : v; }
function recordSnapshot() {
  const mk = thisMonth();
  const snap = {};
  for (const a of activeAccounts()) snap[a.id] = round2(signedValue(a));
  state.snapshots[mk] = snap;
}
