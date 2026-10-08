'use strict';
/* ---------- DOM + string helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const sum = arr => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});

/* ---------- money ---------- */
const _fmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
function money(n, opts = {}) {
  n = Number(n) || 0;
  if (Object.is(round2(n), -0)) n = 0;
  const s = (opts.cents === false || (opts.auto && Math.abs(n) >= 10000) ? _fmt0 : _fmt2).format(Math.abs(n));
  if (n < 0) return opts.paren ? `(${s})` : `−${s}`;
  return (opts.sign && n > 0 ? '+' : '') + s;
}
function moneyCompact(n) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `${s}$${Math.round(a)}`;
}
const pct = (n, d = 1) => (isFinite(n) ? (n * 100).toFixed(d) + '%' : '—');
const signClass = n => (n > 0.004 ? 'pos' : n < -0.004 ? 'neg' : '');

/* Parse "$1,234.56", "(12.34)", "12.34-", "-$5", "12.34 CR" */
function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/\bCR$/i.test(s)) s = s.replace(/\s*CR$/i, '');
  if (/\bDR$/i.test(s)) { s = s.replace(/\s*DR$/i, ''); neg = true; }
  s = s.replace(/[$,\s]/g, '').replace(/^\+/, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = parseFloat(s);
  return neg ? -n : n;
}

/* ---------- dates (local, string based: YYYY-MM-DD / YYYY-MM) ---------- */
const pad2 = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => toISO(new Date());
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const monthKey = s => s.slice(0, 7);
const thisMonth = () => monthKey(today());
function addMonths(mk, n) { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 86400000); }
function monthEnd(mk) { const [y, m] = mk.split('-').map(Number); return toISO(new Date(y, m, 0)); }
function monthsBetween(a, b) { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map(m => m.slice(0, 3));
function monthLabel(mk, short) { const [y, m] = mk.split('-').map(Number); return short ? `${MON[m - 1]} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`; }
function dateLabel(iso, withYear) { if (!iso) return '—'; const [y, m, d] = iso.split('-').map(Number); return `${MON[m - 1]} ${d}` + (withYear || y !== new Date().getFullYear() ? `, ${y}` : ''); }

/* Flexible date parser for imports. hintYear used for "MM/DD" statement lines. */
function parseDateFlexible(v, hintYear) {
  if (!v) return null;
  let s = String(v).trim().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/)) && !s.includes('/')) return valid(+m[1], +m[2], +m[3]); // OFX 20261002120000
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) { let y = +m[3]; if (y < 100) y += 2000; return valid(y, +m[1], +m[2]); }
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})$/))) return valid(hintYear || new Date().getFullYear(), +m[1], +m[2]);
  const mi = t => MON.findIndex(x => x.toLowerCase() === t.slice(0, 3).toLowerCase()) + 1;
  if ((m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? ?(\d{4})?/)) && mi(m[1])) return valid(m[3] ? +m[3] : (hintYear || new Date().getFullYear()), mi(m[1]), +m[2]);
  if ((m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?,? ?(\d{4})?/)) && mi(m[2])) return valid(m[3] ? +m[3] : (hintYear || new Date().getFullYear()), mi(m[2]), +m[1]);
  return null;
  function valid(y, mo, d) { if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null; return `${y}-${pad2(mo)}-${pad2(d)}`; }
}

/* Normalize a bank payee string for matching rules / dedupe */
/* Strip processor prefixes, store numbers, phone numbers and card-network noise from a bank description */
function cleanPayee(s) {
  return String(s || '')
    .replace(/\b(TST|SQ|SP|PP|PAYPAL|DD|IC|BT|PY|EB|GOOGLE|APL)\s?\*\s?/gi, ' ')
    .replace(/\b(POS|DEBIT CARD|PURCHASE|CHECKCARD|CHECK CARD|RECURRING|PPD|CCD|WEB ID|ACH DEBIT|ACH CREDIT)\b/gi, ' ')
    .replace(/\*/g, ' ')
    .replace(/#\s?\d+/g, ' ').replace(/\b\d{3}[-. ]?\d{3}[-. ]?\d{4}\b/g, ' ').replace(/\b[A-Z]*\d{4,}[A-Z]*\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
function normPayee(s) {
  return cleanPayee(s).toUpperCase().replace(/[^A-Z& ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
/* Friendlier display payee */
function prettyPayee(s) {
  const raw = String(s || '').trim();
  if (!raw) return '';
  // already mixed case: keep it as written, minus a trailing store number or dangling "&"
  if (/[a-z]/.test(raw)) return raw.replace(/\s+#?\s?\d{3,}\s*$/, '').replace(/[\s&*\-–,]+$/, '').slice(0, 60) || raw.slice(0, 60);
  const c = cleanPayee(raw) || raw;
  const words = c.split(' ');
  if (words.length > 2 && US_STATES.has(words[words.length - 1].toUpperCase())) words.pop();
  const kept = words.slice(0, 5);
  while (kept.length > 1 && /^[&*\-–,.]+$/.test(kept[kept.length - 1])) kept.pop();
  return kept.map(w => /^(LLC|INC|USA|ATM|IRS|HOA|ACH|CVS|AT&T|BP|UPS|USPS|IKEA|BMW|KFC|TJ|HSA|IRA|FFC|AMC|YMCA|ADT|DMV|HBO|NYC|CTA)$/.test(w) ? w
    : w.toLowerCase()
      .replace(/(^|[-/(&])([a-z])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/'([a-z])(?=[a-z]{2})/g, (m, b) => "'" + b.toUpperCase())   // O'Reilly, but Rita's
      .replace(/^Mc([a-z])/, (m, b) => 'Mc' + b.toUpperCase())).join(' ');  // McDonald's
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

function downloadFile(name, text, mime = 'application/json') {
  const blob = text instanceof Blob ? text : new Blob([text], { type: mime });
  // iPhone and iPad: hand the file to the share sheet (Save to Files) instead of a download link
  if (navigator.maxTouchPoints > 0 && !window.showDirectoryPicker && navigator.share && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type || mime });
    if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(e => { if (e.name !== 'AbortError') anchorDownload(blob, name); }); return; }
  }
  anchorDownload(blob, name);
}
function anchorDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function readFileAsText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
function readFileAsBuffer(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }); }

/* Seeded RNG for sample data */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- math helpers ---------- */
function randn(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function quantile(sorted, q) { if (!sorted.length) return 0; const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }
const yearOf = iso => +String(iso).slice(0, 4);
function ageFromBirthYear(y) { return y ? new Date().getFullYear() - y : null; }
function slugFile(s) { return String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file'; }
function parseTags(s) { return [...new Set(String(s || '').split(/[,\s]+/).map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))]; }

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
    settings: { theme: 'auto', look: 'ng', lowCash: 2500, staleDays: 35, targets: {}, privacy: false, autoLock: 15, keepBackups: 30, members: [{ id: 'joint', name: 'Joint' }, { id: 'you', name: 'You' }, { id: 'partner', name: 'Partner' }] },
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
    // Each save into the folder gets the next number, so the phone and the Mac can tell which copy is newest
    if (hasFolder()) { Store.saveNo = Math.max(Store.saveNo || 0, Number(state.meta.saveNo) || 0) + 1; state.meta.saveNo = Store.saveNo; }
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

/* Fictional household used by "Load sample data". Deterministic, dated relative to today. */
function buildSampleState() {
  const r = rng(20261006);
  const between = (a, b) => round2(a + (b - a) * r());
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const cid = (g, n) => 'c-' + slug(g + '-' + n);
  const s = defaultState();
  const T = today(), M = thisMonth();
  const daysAgo = n => addDays(T, -n);

  const A = (id, name, type, institution, balance, extra = {}) => s.accounts.push({ id, name, type, institution, balance, balanceDate: daysAgo(Math.floor(r() * 6)), ...extra });
  A('a-chk', 'Everyday checking', 'checking', 'Lakeshore Bank', 0, { forecast: true, owner: 'joint' });
  A('a-sav', 'Reserve savings', 'savings', 'Lakeshore Bank', 41250, { forecast: true, owner: 'joint' });
  A('a-cc', 'Alex’s rewards card', 'credit', 'Northline Card', 0, { owner: 'you', minPayment: 40, rate: 24.99, last4: '9876' });
  A('a-cc2', 'Sam’s card', 'credit', 'Lakeshore Bank', 0, { owner: 'partner', minPayment: 35, rate: 21.49 });
  A('a-brk', 'Joint brokerage', 'brokerage', 'Harbor Securities', 0, { cash: 0, owner: 'joint' });
  A('a-401', 'Alex’s 401(k)', 'retirement', 'Employer plan', 0, { owner: 'you' });
  A('a-roth', 'Sam’s Roth IRA', 'retirement', 'Harbor Securities', 0, { owner: 'partner' });
  A('a-529', '529 college plan', 'education', 'State 529 program', 48200, { assetClass: 'US stocks', owner: 'joint' });
  A('a-pvt', 'Pre-IPO secondary', 'private', 'Secondary platform', 0, { owner: 'you' });
  A('a-home', 'Home', 'realestate', 'Estimate', 685000, { balanceDate: daysAgo(40), mortgageId: 'a-mtg', owner: 'joint' });
  A('a-mtg', 'Home mortgage', 'mortgage', 'Lakeshore Mortgage', 411860, { rate: 3.125, minPayment: 2410, owner: 'joint' });
  A('a-rent', 'Rental duplex', 'realestate', 'Estimate', 540000, { rental: true, rentalGroup: 'Rental property', cashInvested: 135000, mortgageId: 'a-rmtg', units: 2, balanceDate: daysAgo(40), buildingBasis: 380000, placedInService: '2019-06-15', owner: 'joint' });
  A('a-rmtg', 'Duplex mortgage', 'mortgage', 'Prairie Loan Servicing', 317940, { rate: 4.25, minPayment: 2180, owner: 'joint' });
  A('a-car', 'SUV', 'vehicle', 'Estimate', 33800, { owner: 'joint' });
  A('a-auto', 'Auto loan', 'loan', 'Auto Finance', 18420, { rate: 5.9, minPayment: 535, owner: 'joint' });

  const H = (accountId, symbol, name, shares, price, costBasis, assetClass, extra = {}) =>
    s.holdings.push({ id: uid(), accountId, symbol, name, shares, price, costBasis, assetClass, priceDate: daysAgo(1), ...extra });
  H('a-brk', 'VTI', 'Total US stock market ETF', 410, 286.4, 72000, 'US stocks');
  H('a-brk', 'VXUS', 'Total international stock ETF', 520, 66.2, 28000, 'International stocks');
  H('a-brk', 'BND', 'Total bond market ETF', 300, 73.1, 23000, 'Bonds');
  H('a-brk', 'NVDA', 'NVIDIA', 180, 182.5, 9800, 'US stocks');
  H('a-brk', 'MSFT', 'Microsoft', 60, 515, 14000, 'US stocks');
  H('a-brk', 'SPAXX', 'Money market (core position)', 8400, 1, 8400, 'Cash');
  H('a-401', 'FXAIX', 'S&P 500 index fund', 900, 229.1, 140000, 'US stocks');
  H('a-401', 'FTIHX', 'Total international index fund', 4200, 17.4, 60000, 'International stocks');
  H('a-401', 'FXNAX', 'US bond index fund', 3000, 10.45, 33000, 'Bonds');
  H('a-roth', 'QQQ', 'Nasdaq-100 ETF', 95, 590, 30000, 'US stocks');
  H('a-roth', 'SCHD', 'US dividend equity ETF', 400, 27.6, 10000, 'US stocks');
  H('a-pvt', 'SERIES-D', 'Late-stage AI company (secondary)', 2000, 18.5, 24000, 'Private & alternatives', { private: true, priceDate: daysAgo(124) });

  const rules = [
    ['PAYROLL', cid('Income', 'Paycheck')], ['ANNUAL BONUS', cid('Income', 'Bonus')], ['INTEREST PAID', cid('Income', 'Interest and dividends')],
    ['LAKESHORE MTG', cid('Home', 'Mortgage or rent')], ['CITY ELECTRIC', cid('Home', 'Utilities')], ['NORTHERN GAS', cid('Home', 'Utilities')],
    ['FIBERNET', cid('Home', 'Utilities')], ['WIRELESS ONE', cid('Home', 'Utilities')], ['COUNTY TREASURER HOME', cid('Home', 'Property tax')],
    ['HOMESHIELD INS', cid('Home', 'Home insurance')], ['HOME DEPOT', cid('Home', 'Home maintenance')],
    ['AUTO FINANCE', cid('Transportation', 'Auto payment')], ['SHELL OIL', cid('Transportation', 'Fuel and charging')], ['PARK CHICAGO', cid('Transportation', 'Parking and tolls')],
    ['FRESH MARKET', cid('Food', 'Groceries')], ['COSTCO', cid('Food', 'Groceries')], ['LUCA TRATTORIA', cid('Food', 'Dining out')],
    ['TACO NORTE', cid('Food', 'Dining out')], ['SWEETGREEN', cid('Food', 'Dining out')], ['STARBUCKS', cid('Food', 'Coffee')], ['DARK MATTER', cid('Food', 'Coffee')],
    ['LITTLE OAKS', cid('Family', 'Childcare')], ['RIVER CITY SOCCER', cid('Family', 'Kids activities')], ['SWIM ACADEMY', cid('Family', 'Kids activities')],
    ['CHEWY', cid('Family', 'Pets')], ['PAWS VET', cid('Family', 'Pets')], ['NORTHSHORE CLINIC', cid('Health', 'Medical')], ['ORANGETHEORY', cid('Health', 'Fitness')],
    ['PELOTON', cid('Health', 'Fitness')], ['AMAZON', cid('Lifestyle', 'Shopping')], ['TARGET', cid('Lifestyle', 'Shopping')], ['AMC THEATRES', cid('Lifestyle', 'Entertainment')],
    ['TICKETMASTER', cid('Lifestyle', 'Entertainment')], ['NETFLIX', cid('Lifestyle', 'Subscriptions')], ['SPOTIFY', cid('Lifestyle', 'Subscriptions')],
    ['APPLE COM BILL', cid('Lifestyle', 'Subscriptions')], ['ADOBE', cid('Lifestyle', 'Subscriptions')], ['DELTA AIR', cid('Lifestyle', 'Travel')], ['MARRIOTT', cid('Lifestyle', 'Travel')],
    ['SUPERCUTS', cid('Lifestyle', 'Personal care')], ['SEPHORA', cid('Lifestyle', 'Personal care')], ['TRADER JOE', cid('Food', 'Groceries')], ['FOOD DEPOSITORY', cid('Lifestyle', 'Charitable giving')], ['PARISH GIVING', cid('Lifestyle', 'Charitable giving')], ['LAKESHORE CARD PAYMENT', cid('Transfers', 'Credit card payment')], ['GUARDIAN LIFE', cid('Financial', 'Life and disability insurance')],
    ['RENT UNIT', cid('Rental property', 'Rent received')], ['PRAIRIE LOAN', cid('Rental property', 'Rental mortgage')], ['ACE PLUMBING', cid('Rental property', 'Rental repairs')],
    ['COUNTY TREASURER DUPLEX', cid('Rental property', 'Rental property tax')], ['LANDLORD SHIELD', cid('Rental property', 'Rental insurance')], ['CITY WATER DUPLEX', cid('Rental property', 'Rental utilities')],
    ['TRANSFER TO RESERVE', cid('Transfers', 'Transfer between accounts')], ['TRANSFER FROM CHECKING', cid('Transfers', 'Transfer between accounts')],
    ['NORTHLINE CARD PAYMENT', cid('Transfers', 'Credit card payment')], ['PAYMENT THANK YOU', cid('Transfers', 'Credit card payment')], ['HARBOR SECURITIES CONTRIB', cid('Transfers', 'Savings and investing')],
  ];
  s.rules = rules.map(([text, categoryId]) => ({ id: uid(), text, categoryId }));

  const budgets = {
    [cid('Income', 'Paycheck')]: 10500, [cid('Home', 'Mortgage or rent')]: 2410, [cid('Home', 'Utilities')]: 420, [cid('Home', 'Property tax')]: 12400, [cid('Home', 'Home insurance')]: 2100,
    [cid('Home', 'Home maintenance')]: 150, [cid('Transportation', 'Auto payment')]: 535, [cid('Transportation', 'Fuel and charging')]: 220, [cid('Transportation', 'Parking and tolls')]: 40,
    [cid('Food', 'Groceries')]: 950, [cid('Food', 'Dining out')]: 560, [cid('Food', 'Coffee')]: 80, [cid('Family', 'Childcare')]: 640, [cid('Family', 'Kids activities')]: 250,
    [cid('Family', 'Pets')]: 110, [cid('Health', 'Medical')]: 120, [cid('Health', 'Fitness')]: 225, [cid('Lifestyle', 'Shopping')]: 450, [cid('Lifestyle', 'Entertainment')]: 120,
    [cid('Lifestyle', 'Subscriptions')]: 140, [cid('Lifestyle', 'Travel')]: 4500, [cid('Lifestyle', 'Gifts')]: 100, [cid('Lifestyle', 'Charitable giving')]: 150, [cid('Lifestyle', 'Personal care')]: 60,
    [cid('Financial', 'Life and disability insurance')]: 95, [cid('Rental property', 'Rent received')]: 4125, [cid('Rental property', 'Rental mortgage')]: 2180,
    [cid('Rental property', 'Rental repairs')]: 250, [cid('Rental property', 'Rental property tax')]: 7800, [cid('Rental property', 'Rental insurance')]: 1480, [cid('Rental property', 'Rental utilities')]: 90,
  };
  for (const c of s.categories) if (budgets[c.id] != null) c.budget = budgets[c.id];
  for (const id of [cid('Home', 'Home maintenance'), cid('Rental property', 'Rental repairs'), cid('Food', 'Dining out')]) { const c = s.categories.find(x => x.id === id); c.rollover = true; c.rolloverStart = addMonths(M, -6); }

  /* ---- transactions: 13 months ---- */
  const tx = [];
  const add = (accountId, date, payee, amount, extra = {}) => { if (date <= T) tx.push({ id: uid(), date, accountId, payee, amount: round2(amount), memo: '', ...extra }); };
  const start = addMonths(M, -12);
  // biweekly paychecks on Fridays
  let d = fromISO(start + '-01'); while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  for (; toISO(d) <= T; d.setDate(d.getDate() + 14)) add('a-chk', toISO(d), 'ACME CORP PAYROLL PPD', 4850);
  for (let i = 0; i <= 12; i++) {
    const mk = addMonths(start, i), mo = +mk.slice(5), day = n => `${mk}-${pad2(n)}`;
    const card = { 'a-cc': 0, 'a-cc2': 0 };
    const C = (date, payee, amt, acct = 'a-cc') => { add(acct, date, payee, -amt); if (date <= T) card[acct] += amt; };
    add('a-chk', day(1), 'LAKESHORE MTG PAYMENT', -2410);
    add('a-chk', day(1), 'PRAIRIE LOAN SERVICING', -2180);
    add('a-chk', day(2), 'TRANSFER TO RESERVE SAVINGS', -1000);
    add('a-sav', day(2), 'TRANSFER FROM CHECKING', 1000);
    add('a-chk', day(2), 'HARBOR SECURITIES CONTRIB', -1500);
    add('a-chk', day(3), 'RENT UNIT 1 ZELLE', 2150);
    add('a-chk', day(4), 'RENT UNIT 2 ZELLE', 1975);
    add('a-chk', day(5), 'LITTLE OAKS AFTERCARE', -640);
    add('a-chk', day(12), 'CITY ELECTRIC CO', -between(110, 215));
    const winter = [11, 12, 1, 2, 3].includes(mo);
    add('a-chk', day(14), 'NORTHERN GAS', -(winter ? between(140, 230) : between(38, 70)));
    add('a-chk', day(15), 'AUTO FINANCE PMT', -535);
    add('a-chk', day(18), 'FIBERNET', -79.99);
    add('a-chk', day(22), 'WIRELESS ONE', -145);
    add('a-chk', day(27), 'GUARDIAN LIFE PREM', -95);
    add('a-sav', monthEnd(mk), 'INTEREST PAID', between(118, 142));
    if (mo % 3 === 0) add('a-chk', day(20), 'CITY WATER DUPLEX', -between(210, 260));
    if (mo === 3) add('a-chk', day(15), 'ACME CORP ANNUAL BONUS', 12000);
    if (mo === 3 || mo === 8) add('a-chk', day(1), 'COUNTY TREASURER DUPLEX', -3900);
    if (mo === 6 || mo === 9) add('a-chk', day(1), 'COUNTY TREASURER HOME', -6200);
    if (mo === 4) add('a-chk', day(10), 'HOMESHIELD INS', -2100);
    if (mo === 6) add('a-chk', day(10), 'LANDLORD SHIELD INS', -1480);
    if (mo === 2) add('a-chk', day(17), 'ACE PLUMBING WATER HEATER', -1240);
    if (r() < 0.35) add('a-chk', day(9 + Math.floor(r() * 15)), 'ACE PLUMBING SERVICE', -between(180, 420));
    if ([4, 5, 6, 9, 10].includes(mo)) add('a-chk', day(6), 'RIVER CITY SOCCER', -125);
    add('a-chk', day(8), 'SWIM ACADEMY', -95);
    // card spending
    for (let w = 0; w < 5; w++) { const dd = 2 + w * 6 + Math.floor(r() * 3); if (dd <= 28) { const p = pick(['FRESH MARKET #123', 'COSTCO WHSE #0388', 'TRADER JOE S #551', 'FRESH MARKET #123']); C(day(dd), p, between(120, 255), /TRADER/.test(p) ? 'a-cc2' : 'a-cc'); } }
    for (let k = 0, n = 4 + Math.floor(r() * 3); k < n; k++) C(day(1 + Math.floor(r() * 27)), pick(['TST* LUCA TRATTORIA', 'SQ *TACO NORTE', 'SWEETGREEN 0412', 'TST* LUCA TRATTORIA']), between(28, 145));
    for (let k = 0, n = 8 + Math.floor(r() * 5); k < n; k++) { const p = pick(['STARBUCKS STORE 12345', 'DARK MATTER COFFEE']); C(day(1 + Math.floor(r() * 27)), p, between(4.75, 8.9), /DARK/.test(p) ? 'a-cc2' : 'a-cc'); }
    for (let k = 0; k < 3; k++) C(day(3 + k * 9), 'SHELL OIL 5744', between(48, 74));
    C(day(9), 'NETFLIX.COM', 17.99); C(day(14), 'SPOTIFY USA', 11.99); C(day(20), 'APPLE.COM/BILL', 2.99); C(day(7), 'ADOBE *CREATIVE CLD', 59.99); C(day(11), 'PELOTON MEMBERSHIP', 44);
    C(day(16), 'ORANGETHEORY FITNESS', 179);
    if (i >= 8) C(day(13), 'HULU 877-824-4858', 18.99); // newer subscription, not yet in the forecast
    C(day(19), 'CHEWY.COM', 68.4);
    for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) { const p = pick(['AMAZON MKTPLACE PMTS', 'TARGET 00012', 'AMAZON MKTPLACE PMTS']); C(day(1 + Math.floor(r() * 27)), p, between(18, 240), /TARGET/.test(p) || r() < 0.3 ? 'a-cc2' : 'a-cc'); }
    if (r() < 0.5) C(day(1 + Math.floor(r() * 27)), pick(['AMC THEATRES 0611', 'TICKETMASTER']), between(38, 160));
    if (r() < 0.4) C(day(1 + Math.floor(r() * 27)), 'NORTHSHORE CLINIC COPAY', between(30, 90));
    if (r() < 0.3) C(day(1 + Math.floor(r() * 27)), 'HOME DEPOT 1922', between(40, 310));
    if (r() < 0.6) C(day(1 + Math.floor(r() * 27)), 'PARK CHICAGO', between(8, 32));
    C(day(21), 'SUPERCUTS 4410', 42);
    C(day(9 + Math.floor(r() * 12)), 'SEPHORA 0118', between(28, 96), 'a-cc2');
    add('a-chk', day(10), 'CHICAGO FOOD DEPOSITORY', -50);
    if (mo === 12) add('a-chk', day(20), 'ST JAMES PARISH GIVING', -1200);
    if (r() < 0.5) C(day(1 + Math.floor(r() * 27)), 'TST* LUCA TRATTORIA', between(40, 120), 'a-cc2');
    if (mo === 7) { C(day(6), 'DELTA AIR LINES', 1840); C(day(12), 'MARRIOTT LINCOLN PARK', 1265); }
    if (mo === 12) { C(day(18), 'DELTA AIR LINES', 920); C(day(10), 'AMAZON MKTPLACE PMTS', 610); }
    if (mo === 11 && r() < 1) C(day(24), 'PAWS VET CLINIC', 285);
    // pay card next month
    const payDate = `${addMonths(mk, 1)}-25`;
    add('a-chk', payDate, 'NORTHLINE CARD PAYMENT', -round2(card['a-cc']));
    add('a-cc', payDate, 'PAYMENT THANK YOU', round2(card['a-cc']));
    add('a-chk', `${addMonths(mk, 1)}-21`, 'LAKESHORE CARD PAYMENT', -round2(card['a-cc2']));
    add('a-cc2', `${addMonths(mk, 1)}-21`, 'PAYMENT THANK YOU', round2(card['a-cc2']));
  }
  // a few fresh ones this month with no rule yet
  const fresh = [['DOORDASH*BURGER DISTRICT', -46.18], ['WALGREENS #4411', -23.67], ['BEST BUY 00123', -189.99], ['UBER *TRIP', -27.4]];
  fresh.forEach(([p, amt], k) => { const dt = addDays(T, -(k + 1)); if (monthKey(dt) === M) add('a-cc', dt, p, amt, { fresh: true }); });

  s.transactions = tx.sort((a, b) => b.date.localeCompare(a.date));
  state = s; invalidate(); // rules need the live state
  for (const t of s.transactions) { if (!t.fresh) { const rr = matchRule(t.payee); t.categoryId = rr ? rr.categoryId : null; } else { t.categoryId = null; delete t.fresh; } t.rawPayee = t.payee; t.payee = prettyPayee(t.payee); }
  // splits, tags and per-person overrides
  for (const t of s.transactions) {
    if (/COSTCO/.test(t.rawPayee)) { const g = round2(t.amount * 0.75); t.splits = [{ categoryId: cid('Food', 'Groceries'), amount: g, memo: 'Food' }, { categoryId: cid('Lifestyle', 'Shopping'), amount: round2(t.amount - g), memo: 'Household' }]; t.categoryId = '__split'; }
    if (/DELTA|MARRIOTT/.test(t.rawPayee)) t.tags = [t.date.slice(5, 7) === '12' ? 'holidays' : 'summer-trip'];
    if (/CLINIC/.test(t.rawPayee)) t.tags = ['hsa-eligible'];
    if (/SOCCER|SWIM/.test(t.rawPayee)) t.person = 'joint';
  }

  // ledger-style balances for checking and card from flows
  const chkFlow = sum(tx.filter(t => t.accountId === 'a-chk').map(t => t.amount));
  acctById('a-chk').balance = round2(9800 + chkFlow - sum(tx.filter(t => t.accountId === 'a-chk' && t.date < start + '-01').map(t => t.amount)));
  acctById('a-chk').balance = round2(Math.max(6200, Math.min(acctById('a-chk').balance, 24000)));
  for (const id of ['a-cc', 'a-cc2']) acctById(id).balance = round2(-sum(tx.filter(t => t.accountId === id && monthKey(t.date) === M && t.amount < 0).map(t => t.amount)));
  for (const a of s.accounts) if (ACCOUNT_TYPES[a.type].ledger) { a.ledger = true; a.anchorBalance = a.balance; a.anchorDate = T; a.balanceDate = T; }
  acctById('a-chk').reconciledThrough = monthEnd(addMonths(M, -1));
  invalidate();

  /* ---- recurring (cash-flow forecast) ---- */
  const nextDom = dom => { let dt = `${M}-${pad2(dom)}`; if (dt <= T) dt = `${addMonths(M, 1)}-${pad2(dom)}`; return dt; };
  let nf = fromISO(T); while (nf.getDay() !== 5) nf.setDate(nf.getDate() + 1);
  // align with paycheck cadence
  const lastPay = s.transactions.find(t => t.categoryId === cid('Income', 'Paycheck'));
  const nextPay = lastPay ? addDays(lastPay.date, 14) : toISO(nf);
  const R = (name, amount, freq, nextDate, categoryId) => s.recurring.push({ id: uid(), name, amount, freq, nextDate, categoryId });
  R('Paycheck', 4850, 'biweekly', nextPay, cid('Income', 'Paycheck'));
  R('Rent, unit 1', 2150, 'monthly', nextDom(3), cid('Rental property', 'Rent received'));
  R('Rent, unit 2', 1975, 'monthly', nextDom(4), cid('Rental property', 'Rent received'));
  R('Home mortgage', -2410, 'monthly', nextDom(1), cid('Home', 'Mortgage or rent'));
  R('Duplex mortgage', -2180, 'monthly', nextDom(1), cid('Rental property', 'Rental mortgage'));
  R('Brokerage contribution', -1500, 'monthly', nextDom(2), cid('Transfers', 'Savings and investing'));
  R('Aftercare', -640, 'monthly', nextDom(5), cid('Family', 'Childcare'));
  R('Utilities (estimate)', -330, 'monthly', nextDom(12), cid('Home', 'Utilities'));
  R('Auto loan', -535, 'monthly', nextDom(15), cid('Transportation', 'Auto payment'));
  R('Internet', -79.99, 'monthly', nextDom(18), cid('Home', 'Utilities'));
  R('Phone', -145, 'monthly', nextDom(22), cid('Home', 'Utilities'));
  R('Credit card payment (estimate)', -3400, 'monthly', nextDom(25), cid('Transfers', 'Credit card payment'));
  R('Life insurance', -95, 'monthly', nextDom(27), cid('Financial', 'Life and disability insurance'));
  R('Home property tax', -6200, 'semiannual', `${addMonths(M, 2)}-01`, cid('Home', 'Property tax'));

  /* ---- 18 months of balance history ---- */
  for (let i = 18; i >= 1; i--) {
    const mk = addMonths(M, -i), snap = {};
    const mkt = Math.pow(1.0085, -i) * (1 + (r() - 0.5) * 0.05);
    for (const a of s.accounts) {
      let v = accountValue(a);
      if (['brokerage', 'retirement', 'education', 'crypto'].includes(a.type)) v = v * mkt - (a.type === 'brokerage' ? 1500 * i : a.id === 'a-401' ? 1900 * i : a.type === 'education' ? 500 * i : 0);
      else if (a.type === 'private') v = i > 5 ? 24000 : v;
      else if (a.type === 'realestate') v = v * Math.pow(1.003, -i);
      else if (a.type === 'mortgage') v = v + (a.id === 'a-mtg' ? 690 : 540) * i;
      else if (a.type === 'loan') v = v + 455 * i;
      else if (a.type === 'vehicle') v = v + 380 * i;
      else if (a.type === 'savings') v = v - 1120 * i;
      else if (a.type === 'checking') v = v * (0.85 + r() * 0.35);
      else if (a.type === 'credit') v = a.id === 'a-cc' ? between(2200, 3600) : between(700, 1500);
      v = Math.max(0, round2(v));
      snap[a.id] = ACCOUNT_TYPES[a.type].side === 'liability' ? -v : v;
    }
    s.snapshots[mk] = snap;
  }
  for (let i = 2; i <= 4; i++) s.reviews[addMonths(M, -i)] = { completedAt: daysAgo(30 * i - 22), notes: i === 2 ? 'Water heater replaced at the duplex. Pushed travel budget up for the summer trip.' : '' };
  s.settings.targets = { 'Cash': 5, 'US stocks': 55, 'International stocks': 20, 'Bonds': 15, 'Private & alternatives': 5 };
  s.settings.members = [{ id: 'joint', name: 'Joint' }, { id: 'you', name: 'Alex' }, { id: 'partner', name: 'Sam' }];
  s.goals = [
    { id: uid(), name: 'Emergency fund', target: 50000, accountId: 'a-sav', targetDate: `${+T.slice(0, 4) + 1}-06-30`, monthly: 1200 },
    { id: uid(), name: 'New roof for the duplex', target: 18000, saved: 7500, targetDate: `${+T.slice(0, 4) + 1}-09-01`, monthly: 1000 },
    { id: uid(), name: 'College, oldest', target: 120000, accountId: 'a-529', targetDate: '2036-08-15', monthly: 500 },
    { id: uid(), name: 'Home projects fund', target: 3000, categoryId: cid('Home', 'Home maintenance'), targetDate: `${+T.slice(0, 4) + 1}-04-01` },
  ];
  Object.assign(s.plan, { age: 41, retireAge: 60, payrollSavings: 23000, otherIncome: 42000, otherIncomeAge: 67 });
  const yr = +T.slice(0, 4);
  s.tax = { 'a-rent': { [yr - 1]: { interest: 13480 }, [yr]: { interest: 13050 } } };
  s.meta.sample = true;
  return s;
}

/* ---------- memo (cleared on every commit/render) ---------- */
let MEMO = {};
function invalidate() { MEMO = {}; }
function memo(key, fn) { if (!(key in MEMO)) MEMO[key] = fn(); return MEMO[key]; }

/* ---------- transactions: splits ---------- */
/* A transaction with splits contributes one line per split; otherwise itself. */
function txLines(t) {
  if (t.splits && t.splits.length) return t.splits.map(s => ({ date: t.date, accountId: t.accountId, amount: Number(s.amount) || 0, categoryId: s.categoryId || null, parent: t }));
  return [{ date: t.date, accountId: t.accountId, amount: t.amount, categoryId: t.categoryId || null, parent: t }];
}
const isUncat = t => (t.splits && t.splits.length) ? t.splits.some(s => !s.categoryId) : !t.categoryId;
const isSplit = t => !!(t.splits && t.splits.length);
function txHasCat(t, id) { return isSplit(t) ? t.splits.some(s => s.categoryId === id) : t.categoryId === id; }

/* ---------- account values ---------- */
const holdingsFor = accId => state.holdings.filter(h => h.accountId === accId);
const holdingValue = h => round2((Number(h.shares) || 0) * (Number(h.price) || 0));
const isLiability = a => ACCOUNT_TYPES[a.type]?.side === 'liability';
function txByAccount(id) {
  return memo('txacct', () => groupBy(state.transactions, t => t.accountId))[id] || [];
}
/* Ledger accounts: balance = anchor ± everything after the anchor date (or before, for past dates). */
function ledgerBalance(a, asOf = '9999-12-31') {
  const anchor = Number(a.anchorBalance ?? a.balance) || 0, ad = a.anchorDate || a.balanceDate || '0000-00-00';
  let flow = 0;
  for (const t of txByAccount(a.id)) {
    if (t.date > ad && t.date <= asOf) flow += t.amount;
    else if (t.date > asOf && t.date <= ad) flow -= t.amount;
  }
  return round2(isLiability(a) ? anchor - flow : anchor + flow);
}
function accountValue(a) {
  const hs = holdingsFor(a.id);
  if (hs.length) return round2(sum(hs.map(holdingValue)) + (Number(a.cash) || 0));
  if (a.ledger) return ledgerBalance(a);
  return round2(Number(a.balance) || 0);
}
function accountAsOf(a) {
  const hs = holdingsFor(a.id);
  if (hs.length) return hs.map(h => h.priceDate || '').sort()[0] || a.balanceDate;
  if (a.ledger) { const last = txByAccount(a.id).reduce((m, t) => t.date > m ? t.date : m, ''); const ad = a.anchorDate || a.balanceDate || ''; return last > ad ? last : ad; }
  return a.balanceDate;
}
function totals() {
  return memo('totals', () => {
    const t = { assets: 0, liabilities: 0, cash: 0, invest: 0, illiquid: 0, debt: 0 };
    for (const a of activeAccounts()) {
      const v = accountValue(a), b = ACCOUNT_TYPES[a.type]?.bucket || 'illiquid';
      t[b] += v;
      if (isLiability(a)) t.liabilities += v; else t.assets += v;
    }
    t.netWorth = round2(t.assets - t.liabilities);
    t.liquid = round2(t.cash + t.invest);
    return t;
  });
}
function netWorthSeries() { return Object.keys(state.snapshots).sort().map(mk => ({ x: mk, y: round2(sum(Object.values(state.snapshots[mk]))) })); }
function snapshotNW(mk) { const s = state.snapshots[mk]; return s ? round2(sum(Object.values(s))) : null; }

/* ---------- rules ---------- */
function ruleMatches(r, payee) {
  const t = String(r.text || '').toUpperCase().trim();
  if (!t) return false;
  return normPayee(payee).includes(normPayee(t) || t) || String(payee || '').toUpperCase().includes(t);
}
function matchRule(payee) { return state.rules.find(r => ruleMatches(r, payee)) || null; }

/* ---------- flows ---------- */
function txInMonth(mk) { return memo('m:' + mk, () => state.transactions.filter(t => t.date.startsWith(mk))); }
function txInRange(from, to) { return memo(`r:${from}:${to}`, () => state.transactions.filter(t => t.date >= from && t.date <= to)); }
function flowSummary(txs) {
  let income = 0, spending = 0, uncategorized = 0;
  for (const t of txs) {
    if (isUncat(t)) uncategorized++;
    for (const l of txLines(t)) {
      const c = catById(l.categoryId);
      if (!c) { if (l.amount < 0) spending += -l.amount; else income += l.amount; continue; }
      if (c.kind === 'transfer') continue;
      if (c.kind === 'income') income += l.amount; else spending += -l.amount;
    }
  }
  const net = income - spending;
  return { income: round2(income), spending: round2(spending), net: round2(net), rate: income > 0 ? net / income : NaN, uncategorized };
}
/* Category → actual (spending positive for expense categories, income positive for income). */
function categoryActuals(txs) {
  const m = {};
  for (const t of txs) for (const l of txLines(t)) {
    const id = l.categoryId || '_none', c = catById(l.categoryId);
    if (c?.kind === 'transfer') continue;
    m[id] = (m[id] || 0) + (c?.kind === 'income' ? l.amount : -l.amount);
  }
  for (const k in m) m[k] = round2(m[k]);
  return m;
}
const monthActuals = mk => memo('a:' + mk, () => categoryActuals(txInMonth(mk)));
const rangeActuals = (from, to) => memo(`ra:${from}:${to}`, () => categoryActuals(txInRange(from, to)));
function trailingAvg(catId, mk, n = 3) { let s = 0; for (let i = 1; i <= n; i++) s += monthActuals(addMonths(mk, -i))[catId] || 0; return round2(s / n); }
function firstTxMonth() { return memo('first', () => state.transactions.reduce((m, t) => t.date < m ? t.date : m, '9999').slice(0, 7)); }

/* Budget figures for a category in a month. Rollover categories carry unspent (or overspent) amounts forward. */
function budgetView(c, mk) {
  const yr = mk.slice(0, 4), m = +mk.slice(5);
  if (c.period === 'year') {
    const ytd = rangeActuals(`${yr}-01-01`, monthEnd(mk))[c.id] || 0;
    return { budget: c.budget || 0, actual: ytd, label: 'this year', period: 'year', monthShare: (c.budget || 0) / 12 * m, available: (c.budget || 0) - ytd };
  }
  const act = monthActuals(mk)[c.id] || 0;
  let carry = 0;
  if (c.rollover && c.kind === 'expense') {
    const start = c.rolloverStart || firstTxMonth();
    for (let k = start; k < mk; k = addMonths(k, 1)) carry += (c.budget || 0) - (monthActuals(k)[c.id] || 0);
  }
  return { budget: c.budget || 0, actual: act, label: 'this month', period: 'month', carry: round2(carry), available: round2((c.budget || 0) + carry - act) };
}

/* ---------- rental property ---------- */
function rentalPnL(group, from, to) {
  const out = { income: 0, opex: 0, debt: 0 };
  for (const t of txInRange(from, to)) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (!c || c.group !== group || !c.rental) continue;
    if (c.rental === 'income') out.income += l.amount; else out[c.rental] += -l.amount;
  }
  out.noi = round2(out.income - out.opex);
  out.cashFlow = round2(out.noi - out.debt);
  for (const k of ['income', 'opex', 'debt']) out[k] = round2(out[k]);
  return out;
}

/* ---------- allocation ---------- */
function allocation() {
  const m = {};
  const add = (k, v) => { if (v) m[k] = (m[k] || 0) + v; };
  for (const a of activeAccounts()) {
    if (isLiability(a)) continue;
    const hs = holdingsFor(a.id);
    if (hs.length) { hs.forEach(h => add(h.assetClass || 'Unclassified', holdingValue(h))); add('Cash', Number(a.cash) || 0); }
    else add(ACCOUNT_TYPES[a.type]?.cls || a.assetClass || 'Unclassified', accountValue(a));
  }
  const total = sum(Object.values(m));
  return { total, rows: [...ASSET_CLASSES, 'Unclassified'].filter(k => m[k]).map(k => ({ cls: k, value: round2(m[k]), share: total ? m[k] / total : 0 })) };
}
function investableAllocation(includePrivate = true) {
  const m = {};
  for (const a of activeAccounts()) {
    const b = ACCOUNT_TYPES[a.type]?.bucket;
    if (b !== 'invest' && !(includePrivate && a.type === 'private')) continue;
    const hs = holdingsFor(a.id);
    if (hs.length) { hs.forEach(h => { const k = h.assetClass || 'Unclassified'; m[k] = (m[k] || 0) + holdingValue(h); }); if (a.cash) m.Cash = (m.Cash || 0) + Number(a.cash); }
    else { const k = ACCOUNT_TYPES[a.type]?.cls || a.assetClass || 'Unclassified'; m[k] = (m[k] || 0) + accountValue(a); }
  }
  return m;
}

/* ---------- recurring + forecast ---------- */
function nextOccurrence(date, freq) {
  const d = fromISO(date);
  switch (freq) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'semimonthly': if (d.getDate() < 15) d.setDate(d.getDate() + 15); else { d.setMonth(d.getMonth() + 1); d.setDate(Math.max(1, d.getDate() - 15)); } break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'semiannual': d.setMonth(d.getMonth() + 6); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return toISO(d);
}
function occurrences(r, from, to) {
  const out = []; let d = r.nextDate, guard = 0;
  while (d && d < from && guard++ < 800) d = nextOccurrence(d, r.freq);
  while (d && d <= to && guard++ < 1600) { out.push(d); d = nextOccurrence(d, r.freq); }
  return out;
}
function forecastAccounts() { return activeAccounts().filter(a => a.forecast ?? ACCOUNT_TYPES[a.type]?.forecast); }
function forecast(days = 90) {
  return memo('fc:' + days, () => {
    const start = today(), end = addDays(start, days);
    const startBal = round2(sum(forecastAccounts().map(accountValue)));
    const events = [];
    for (const r of state.recurring) for (const d of occurrences(r, addDays(start, 1), end)) events.push({ date: d, amount: Number(r.amount) || 0, name: r.name, id: r.id });
    events.sort((a, b) => a.date.localeCompare(b.date));
    const series = []; let bal = startBal, i = 0, low = { y: startBal, x: start };
    for (let k = 0; k <= days; k++) {
      const day = addDays(start, k);
      while (i < events.length && events[i].date === day) bal += events[i++].amount;
      series.push({ x: day, y: round2(bal) });
      if (bal < low.y) low = { x: day, y: round2(bal) };
    }
    return { startBal, series, events, low, end: round2(bal) };
  });
}
function upcoming(days = 14) {
  const from = today(), to = addDays(from, days), out = [];
  for (const r of state.recurring) for (const d of occurrences(r, from, to)) out.push({ date: d, name: r.name, amount: Number(r.amount) || 0, id: r.id });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* Repeating charges: same payee, ≥3 of the last 4 months, steady amount. */
function detectRepeating() {
  return memo('rep', () => {
    const since = `${addMonths(thisMonth(), -4)}-01`;
    const all = {};
    for (const t of state.transactions) {
      if (t.amount >= 0 || isTransferCat(t.categoryId)) continue;
      const k = normPayee(t.payee); if (!k) continue;
      (all[k] = all[k] || []).push(t);
    }
    const known = state.recurring.map(r => normPayee(r.name));
    const out = [];
    for (const [k, everything] of Object.entries(all)) {
      const list = everything.filter(t => t.date >= since);
      const months = new Set(list.map(t => monthKey(t.date)));
      if (months.size < 3) continue;
      const perMonth = [...months].map(m => -sum(list.filter(t => t.date.startsWith(m)).map(t => t.amount)));
      if (Math.max(...[...months].map(m => list.filter(t => t.date.startsWith(m)).length)) > 1) continue;
      const avg = sum(perMonth) / perMonth.length;
      const sd = Math.sqrt(sum(perMonth.map(v => (v - avg) ** 2)) / perMonth.length);
      if (avg <= 0 || sd / avg > 0.12) continue;
      list.sort((a, b) => b.date.localeCompare(a.date));
      const last = list[0], firstSeen = everything.map(t => t.date).sort()[0], acct = acctById(last.accountId);
      const fromCash = !!acct && !!(acct.forecast ?? ACCOUNT_TYPES[acct.type]?.forecast);
      const tracked = known.some(n => n && (k.includes(n) || n.includes(k))) || state.recurring.some(r => r.categoryId === last.categoryId && Math.abs(Math.abs(r.amount) - avg) / avg < 0.06);
      out.push({ key: k, payee: last.payee, monthly: round2(avg), lastDate: last.date, categoryId: last.categoryId, accountId: last.accountId, firstSeen, isNew: daysBetween(firstSeen, today()) <= 150, fromCash, tracked });
    }
    return out.sort((a, b) => b.monthly - a.monthly);
  });
}

/* ---------- goals ---------- */
function goalProgress(g) {
  let current = Number(g.saved) || 0, source = 'Updated by hand';
  if (g.accountId && acctById(g.accountId)) { current = accountValue(acctById(g.accountId)); source = acctById(g.accountId).name; }
  else if (g.categoryId && catById(g.categoryId)) { const c = catById(g.categoryId); current = Math.max(0, budgetView(c, thisMonth()).available); source = `${c.name} budget`; }
  const target = Number(g.target) || 0;
  const monthsLeft = g.targetDate ? Math.max(0, monthsBetween(thisMonth(), g.targetDate.slice(0, 7))) : null;
  const remaining = Math.max(0, target - current);
  const needed = monthsLeft == null ? null : monthsLeft ? remaining / monthsLeft : remaining;
  const share = target ? clamp(current / target, 0, 1) : 0;
  let status = 'on';
  if (current >= target) status = 'done';
  else if (g.monthly != null && g.monthly !== '' && needed != null && Number(g.monthly) + 0.01 < needed) status = 'behind';
  return { current: round2(current), target, remaining: round2(remaining), monthsLeft, needed: needed == null ? null : round2(needed), share, status, source };
}

/* ---------- attention items ---------- */
function attentionItems() {
  const items = [];
  if (isCompanion()) {
    const dev = deviceLabel();
    if (!SYNC.rec && state.accounts.length && !state.meta.sample) items.push({ tone: 'warn', text: `This ${dev} isn’t connected to your Mac’s data. Open it from iCloud Drive`, act: 'sync' });
    else if (SYNC.rec?.replaced) items.push({ tone: 'warn', text: `The data here no longer matches your Mac’s. Get the latest from iCloud Drive`, act: 'sync' });
    else if (SYNC.rec) {
      const n = syncPending().length;
      if (n) items.push({ tone: 'warn', text: `${changesWord(n)} on this ${dev} ${n === 1 ? 'isn’t' : 'aren’t'} on your Mac yet. Send ${n === 1 ? 'it' : 'them'}`, act: 'sync' });
      if (SYNC.rec.macSaved && daysBetween(SYNC.rec.macSaved.slice(0, 10), today()) >= 3) items.push({ tone: 'info', text: `Your Mac’s data here is from ${whenLabel(SYNC.rec.macSaved)}. Get the latest`, act: 'sync' });
    }
  }
  else if (!hasFolder() && !Store.handle && state.accounts.length && !state.meta.sample) items.push({ tone: 'warn', text: 'Your data only lives in this browser. Choose your Ọrọ̀ folder so it’s saved as files with daily backups', go: '#/data' });
  else if ((Store.dir || Store.handle) && Store.perm !== 'granted') items.push({ tone: 'warn', text: `Ọrọ̀ needs permission again to save to ${Store.fileName}`, go: '#/data' });
  const unc = state.transactions.filter(isUncat).length;
  if (unc) items.push({ tone: 'warn', text: `${unc} transaction${unc > 1 ? 's' : ''} need a category`, go: '#/transactions?cat=_none&m=all' });
  const stale = activeAccounts().filter(a => !holdingsFor(a.id).length && !a.ledger && a.balanceDate && daysBetween(a.balanceDate, today()) > (state.settings.staleDays || 35));
  if (stale.length) items.push({ tone: 'info', text: `${stale.length} balance${stale.length > 1 ? 's are' : ' is'} more than ${state.settings.staleDays} days old`, go: '#/accounts?update=1' });
  const marks = state.holdings.filter(h => h.private && daysBetween(h.priceDate || '2000-01-01', today()) > 90);
  if (marks.length) items.push({ tone: 'info', text: `${marks.length} private holding${marks.length > 1 ? 's' : ''} last valued over 90 days ago`, go: '#/investments' });
  const mk = thisMonth();
  const over = state.categories.filter(c => c.kind === 'expense' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) })).filter(x => x.v.period === 'year' ? x.v.actual > x.v.budget * 1.0001 : x.v.available < -0.01);
  if (over.length) items.push({ tone: 'bad', text: `${over.length} categor${over.length > 1 ? 'ies are' : 'y is'} over budget: ${over.slice(0, 3).map(x => x.c.name).join(', ')}${over.length > 3 ? '…' : ''}`, go: '#/budget' });
  if (state.recurring.length && forecastAccounts().length) {
    const f = forecast(60);
    if (f.low.y < (state.settings.lowCash || 0)) items.push({ tone: 'bad', text: `Cash is projected to dip to ${money(f.low.y, { cents: false })} on ${dateLabel(f.low.x)}`, go: '#/cashflow' });
  }
  const conc = concentration();
  if (conc) items.push({ tone: 'info', text: `${conc.symbol} is ${pct(conc.share, 0)} of your investments`, go: '#/investments' });
  const behind = state.goals.filter(g => goalProgress(g).status === 'behind');
  if (behind.length) items.push({ tone: 'warn', text: `${behind.length} goal${behind.length > 1 ? 's are' : ' is'} behind pace: ${behind.map(g => g.name).slice(0, 2).join(', ')}`, go: '#/planning' });
  const lm = addMonths(mk, -1);
  if (state.transactions.some(t => t.date.startsWith(lm)) && !state.reviews[lm]?.completedAt) items.push({ tone: 'warn', text: `${MONTHS[+lm.slice(5) - 1]} hasn’t been reviewed yet`, go: `#/review?m=${lm}` });
  const rep = detectRepeating();
  const newSubs = rep.filter(d => d.isNew);
  if (newSubs.length) items.push({ tone: 'info', text: `New repeating charge${newSubs.length > 1 ? 's' : ''}: ${newSubs.slice(0, 2).map(d => `${d.payee} (${money(d.monthly)}/mo)`).join(', ')}`, go: '#/cashflow' });
  const untracked = rep.filter(d => d.fromCash && !d.tracked);
  if (untracked.length) items.push({ tone: 'info', text: `${untracked.length} bill${untracked.length > 1 ? 's' : ''} paid from checking ${untracked.length > 1 ? 'aren’t' : 'isn’t'} in your forecast`, go: '#/cashflow' });
  const unrec = activeAccounts().filter(a => a.ledger && (!a.reconciledThrough || daysBetween(a.reconciledThrough, today()) > 45) && txByAccount(a.id).length);
  if (unrec.length) items.push({ tone: 'info', text: `${unrec.length} account${unrec.length > 1 ? 's haven’t' : ' hasn’t'} been reconciled in over 45 days`, go: '#/accounts' });
  return items;
}
function concentration() {
  const inv = state.holdings.filter(h => h.assetClass !== 'Cash' && !/fund|index|etf|portfolio|trust/i.test(h.name || ''));
  const total = sum(activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private').map(accountValue));
  if (!total) return null;
  const top = inv.map(h => ({ symbol: h.symbol, share: holdingValue(h) / total })).sort((a, b) => b.share - a.share)[0];
  return top && top.share >= 0.1 ? top : null;
}

/* ================= planning, tax and analytics engines ================= */

/* ---------- capital market assumptions → portfolio return and volatility ---------- */
function cma() { return Object.assign({}, DEFAULT_CMA, state.plan.cma || {}); }
function portfolioStats(alloc) {
  const total = sum(Object.values(alloc));
  if (!total) return { mean: 0.06, sd: 0.12, weights: {} };
  const C = cma(), w = {};
  for (const [k, v] of Object.entries(alloc)) w[k] = v / total;
  let mean = 0, varSum = 0;
  const keys = Object.keys(w), rho = 0.6;
  for (const k of keys) mean += w[k] * (C[k] || C.Unclassified)[0] / 100;
  for (const i of keys) for (const j of keys) {
    const si = (C[i] || C.Unclassified)[1] / 100, sj = (C[j] || C.Unclassified)[1] / 100;
    const r = i === j ? 1 : (i === 'Cash' || j === 'Cash') ? 0 : rho;
    varSum += w[i] * w[j] * si * sj * r;
  }
  return { mean, sd: Math.sqrt(varSum), weights: w };
}

/* ---------- defaults the planner derives from your data ---------- */
function planDefaults() {
  const p = state.plan;
  const mk = thisMonth();
  const from = `${addMonths(mk, -12)}-01`, to = monthEnd(addMonths(mk, -1));
  const txs = txInRange(from, to);
  let spend = 0, rentalNet = 0;
  for (const t of txs) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (!c || c.kind === 'transfer') continue;
    if (c.rental) { rentalNet += l.amount; continue; }
    if (c.kind === 'expense') spend += -l.amount;
  }
  const f = flowSummary(txs);
  const months = Math.max(1, Math.min(12, monthsBetween(firstTxMonth() === '9999' ? mk : firstTxMonth(), mk)));
  const scale = 12 / months;
  const alloc = investableAllocation(p.includePrivate);
  const start = sum(Object.values(alloc)) + totals().cash;
  return {
    start: round2(start),
    savings: round2(Math.max(0, f.net) * scale),
    spending: round2(spend * scale),
    rentalNet: p.includeRental ? round2(rentalNet * scale) : 0,
    alloc: { ...alloc, Cash: (alloc.Cash || 0) + totals().cash },
  };
}

/* ---------- Monte Carlo retirement simulation (annual steps, today's dollars) ---------- */
function runRetirement(inputs, opts = {}) {
  const { age, retireAge, endAge, start, savings, spending, otherIncome, otherIncomeAge, rentalNet, inflation, mean, sd } = inputs;
  const sims = opts.sims || 2000, years = Math.max(1, endAge - age);
  const infl = inflation / 100;
  const sigma2 = Math.log(1 + (sd * sd) / ((1 + mean) ** 2)), mu = Math.log(1 + mean) - sigma2 / 2, sig = Math.sqrt(sigma2);
  const r = rng(opts.seed || 20261006);
  const paths = Array.from({ length: years + 1 }, () => new Float64Array(sims));
  let success = 0, depletedAges = [];
  for (let s = 0; s < sims; s++) {
    let v = start, failed = false;
    paths[0][s] = v;
    for (let y = 1; y <= years; y++) {
      const a = age + y - 1;
      const nominal = Math.exp(mu + sig * randn(r)) - 1;
      const real = (1 + nominal) / (1 + infl) - 1;
      v *= 1 + real;
      if (a < retireAge) v += savings;
      else {
        const inc = (a >= otherIncomeAge ? otherIncome : 0) + rentalNet;
        v -= Math.max(0, spending - inc);
      }
      if (v <= 0 && !failed) { failed = true; depletedAges.push(age + y); v = 0; }
      paths[y][s] = v;
    }
    if (!failed) success++;
  }
  const pcts = [0.1, 0.25, 0.5, 0.75, 0.9];
  const bands = paths.map(col => { const arr = Array.from(col).sort((a, b) => a - b); return pcts.map(q => quantile(arr, q)); });
  depletedAges.sort((a, b) => a - b);
  return { success: success / sims, bands, years, depletedMedianAge: depletedAges.length ? quantile(depletedAges, 0.5) : null };
}
/* Highest retirement spending (today's $) that still clears the target success rate. */
function safeSpending(inputs, target = 0.9) {
  let lo = 0, hi = Math.max(20000, inputs.spending * 2, inputs.start * 0.08);
  for (let k = 0; k < 8 && runRetirement({ ...inputs, spending: hi }, { sims: 400, seed: 7 }).success >= target; k++) { lo = hi; hi *= 2; }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const r = runRetirement({ ...inputs, spending: mid }, { sims: 600, seed: 7 });
    if (r.success >= target) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 100) * 100;
}
/* Earliest retirement age that clears the target, holding spending fixed. */
function earliestRetirement(inputs, target = 0.9) {
  for (let a = Math.max(inputs.age, 35); a <= Math.min(inputs.endAge - 1, 80); a++) {
    if (runRetirement({ ...inputs, retireAge: a }, { sims: 600, seed: 11 }).success >= target) return a;
  }
  return null;
}

/* ---------- debt payoff (avalanche / snowball) ---------- */
function debtList() {
  return activeAccounts().filter(a => isLiability(a) && accountValue(a) > 0.5 && (state.plan.includeMortgages || a.type !== 'mortgage'))
    .map(a => ({ id: a.id, name: a.name, balance: accountValue(a), rate: Number(a.rate) || 0, min: Number(a.minPayment) || Math.max(25, accountValue(a) * 0.02) }));
}
function payoffPlan(debts, extra, method) {
  const ds = debts.map(d => ({ ...d, bal: d.balance, paidMonth: null, interest: 0 }));
  const budget = sum(ds.map(d => d.min)) + (Number(extra) || 0);
  let month = 0, totalInterest = 0;
  const series = [{ m: 0, y: sum(ds.map(d => d.bal)) }];
  while (ds.some(d => d.bal > 0.005) && month < 600) {
    month++;
    for (const d of ds) if (d.bal > 0) { const i = d.bal * d.rate / 100 / 12; d.bal += i; d.interest += i; totalInterest += i; }
    let pool = budget;
    for (const d of ds) if (d.bal > 0) { const p = Math.min(d.min, d.bal); d.bal -= p; pool -= p; }
    const order = ds.filter(d => d.bal > 0.005).sort(method === 'snowball' ? (a, b) => a.bal - b.bal : (a, b) => b.rate - a.rate || a.bal - b.bal);
    for (const d of order) { if (pool <= 0) break; const p = Math.min(pool, d.bal); d.bal -= p; pool -= p; }
    for (const d of ds) if (d.bal <= 0.005 && d.paidMonth == null) { d.bal = 0; d.paidMonth = month; }
    series.push({ m: month, y: round2(sum(ds.map(d => d.bal))) });
  }
  return { months: month, interest: round2(totalInterest), debts: ds, series, monthly: round2(budget), capped: month >= 600 };
}

/* ---------- Schedule E (per rental property, per tax year) ---------- */
function depreciationFor(a, year) {
  const basis = Number(a.buildingBasis) || 0, pis = a.placedInService;
  if (!basis || !pis) return 0;
  const y0 = yearOf(pis), m0 = +pis.slice(5, 7);
  if (year < y0) return 0;
  const annual = basis / 27.5;
  const firstYear = annual * ((12 - m0 + 0.5) / 12);
  if (year === y0) return round2(firstYear);
  const taken = firstYear + annual * (year - y0 - 1);
  return round2(Math.max(0, Math.min(annual, basis - taken)));
}
function scheduleE(a, year) {
  const group = a.rentalGroup || 'Rental property';
  const lines = {}; let debtPaid = 0, unmapped = 0;
  for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) for (const l of txLines(t)) {
    const c = catById(l.categoryId);
    if (!c || c.group !== group) continue;
    if (c.rental === 'debt') { debtPaid += -l.amount; continue; }
    const line = c.schedE || (c.rental === 'income' ? '3' : c.rental === 'opex' ? '19' : null);
    if (!line) { unmapped += Math.abs(l.amount); continue; }
    lines[line] = (lines[line] || 0) + (line === '3' ? l.amount : -l.amount);
  }
  const interest = Number(state.tax?.[a.id]?.[year]?.interest);
  if (isFinite(interest) && interest > 0) lines['12'] = (lines['12'] || 0) + interest;
  const dep = depreciationFor(a, year);
  if (dep) lines['18'] = dep;
  for (const k in lines) lines[k] = round2(lines[k]);
  const expenses = round2(sum(Object.entries(lines).filter(([k]) => k !== '3').map(([, v]) => v)));
  return { lines, rents: lines['3'] || 0, expenses, net: round2((lines['3'] || 0) - expenses), debtPaid: round2(debtPaid), interestEntered: isFinite(interest) && interest > 0, unmapped: round2(unmapped) };
}
function deductionSummary(year) {
  const by = {}, tagged = [];
  for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) {
    for (const l of txLines(t)) { const c = catById(l.categoryId); if (c?.taxTag && c.kind === 'expense') by[c.taxTag] = (by[c.taxTag] || 0) + -l.amount; }
    if ((t.tags || []).some(x => /^(tax|deductible|tax-deductible)$/.test(x))) tagged.push(t);
  }
  return { by, tagged };
}

/* ---------- fund fees ---------- */
const KNOWN_ER = { VTI: 0.03, VOO: 0.03, VXUS: 0.05, BND: 0.03, BNDX: 0.07, VTSAX: 0.04, VFIAX: 0.04, VTIAX: 0.12, VBTLX: 0.04, VEA: 0.05, VWO: 0.08, VNQ: 0.13, VIG: 0.05, VYM: 0.06, SCHD: 0.06, SCHB: 0.03, SCHX: 0.03, SCHF: 0.06, SCHZ: 0.03, SPY: 0.0945, IVV: 0.03, ITOT: 0.03, IXUS: 0.07, AGG: 0.03, IEFA: 0.07, IEMG: 0.09, QQQ: 0.20, QQQM: 0.15, FXAIX: 0.015, FSKAX: 0.015, FTIHX: 0.06, FZROX: 0, FZILX: 0, FXNAX: 0.025, FSPSX: 0.035, SPAXX: 0.42, FDRXX: 0.37, VMFXX: 0.11, SWVXX: 0.34, ARKK: 0.75, GLD: 0.40, IAU: 0.25, IBIT: 0.25, FBTC: 0.25, TLT: 0.15, SGOV: 0.09, BIL: 0.1356, VGT: 0.09, XLK: 0.08, VUG: 0.04, VTV: 0.04, DIA: 0.16, IWM: 0.19, VB: 0.05, VO: 0.04 };
function expenseRatioOf(h) { const er = h.er ?? KNOWN_ER[String(h.symbol || '').toUpperCase()]; return er == null || er === '' ? null : Number(er); }
function feeAnalysis() {
  const hs = state.holdings.filter(h => !h.private);
  const known = hs.filter(h => expenseRatioOf(h) != null);
  const value = sum(known.map(holdingValue));
  const fees = sum(known.map(h => holdingValue(h) * expenseRatioOf(h) / 100));
  const weighted = value ? fees / value * 100 : 0;
  const total = sum(hs.map(holdingValue));
  const g = 0.06, yrs = 20;
  const drag = value * (Math.pow(1 + g, yrs) - Math.pow(1 + g - weighted / 100, yrs));
  const top = known.map(h => ({ h, er: expenseRatioOf(h), fee: holdingValue(h) * expenseRatioOf(h) / 100 })).sort((a, b) => b.fee - a.fee);
  return { value, fees: round2(fees), weighted, drag: round2(drag), coverage: total ? value / total : 0, top, unknown: hs.filter(h => expenseRatioOf(h) == null && h.assetClass !== 'Cash') };
}

/* ---------- report periods ---------- */
function periodRange(p, from, to) {
  const t = today(), mk = thisMonth(), y = t.slice(0, 4);
  switch (p) {
    case 'm': return { from: `${mk}-01`, to: t, label: monthLabel(mk) };
    case 'lm': { const l = addMonths(mk, -1); return { from: `${l}-01`, to: monthEnd(l), label: monthLabel(l) }; }
    case 'ytd': return { from: `${y}-01-01`, to: t, label: `${y} so far` };
    case 'ly': return { from: `${+y - 1}-01-01`, to: `${+y - 1}-12-31`, label: String(+y - 1) };
    case 'custom': if (from && to) return { from, to, label: `${dateLabel(from, true)} to ${dateLabel(to, true)}` };
    // falls through
    default: { const s = addMonths(mk, -12); return { from: `${s}-01`, to: monthEnd(addMonths(mk, -1)), label: 'Last 12 full months' }; }
  }
}
function monthsIn(from, to) { const out = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7) && out.length < 60; m = addMonths(m, 1)) out.push(m); return out; }

/* Sankey: income categories → total income → spending groups (+ saved, or drawn from savings). */
function sankeyData(from, to) {
  const acts = rangeActuals(from, to);
  const inc = [], groups = {};
  for (const [id, v] of Object.entries(acts)) {
    const c = catById(id);
    if (id === '_none') { if (v > 0) groups.Uncategorized = (groups.Uncategorized || 0) + v; else inc.push({ name: 'Uncategorized income', value: -v }); continue; }
    if (!c) continue;
    if (c.kind === 'income' && v > 0) inc.push({ name: c.name, value: v });
    else if (c.kind === 'expense' && v > 0) groups[c.group] = (groups[c.group] || 0) + v;
    else if (c.kind === 'expense' && v < 0) inc.push({ name: `${c.name} refunds`, value: -v });
  }
  const income = sum(inc.map(x => x.value)), spending = sum(Object.values(groups));
  const outs = Object.entries(groups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (income > spending) outs.push({ name: 'Saved', value: income - spending, saved: true });
  else if (spending > income) inc.push({ name: 'From savings', value: spending - income, drawn: true });
  inc.sort((a, b) => (a.drawn ? 1 : 0) - (b.drawn ? 1 : 0) || b.value - a.value);
  return { left: inc, right: outs, income, spending };
}

/* Charts are drawn at the host's real pixel width after each render, so text stays legible on any screen. */
const ChartSpecs = {};
function chartHost(spec) {
  const id = 'ch-' + uid();
  ChartSpecs[id] = spec;
  const auto = spec.type === 'sankey' || spec.type === 'heatmap';
  return `<div class="chart-host" id="${id}" ${auto ? '' : `style="height:${spec.h || 220}px"`} role="img" aria-label="${esc(spec.label || 'Chart')}"></div>`;
}
function niceTicks(min, max, count = 4) {
  if (min === max) { const p = Math.abs(min) * 0.1 || 1; min -= p; max += p; }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count + 0.5) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round2(v));
  return ticks;
}
function drawCharts(root = document) {
  for (const host of $$('.chart-host', root)) {
    const spec = ChartSpecs[host.id]; if (!spec) continue;
    const w = Math.max(240, host.clientWidth);
    host.innerHTML = spec.type === 'bars' ? svgBars(spec, w) : spec.type === 'stack' ? svgStack(spec, w) : spec.type === 'sankey' ? svgSankey(spec, w) : spec.type === 'donut' ? svgDonut(spec, w) : spec.type === 'treemap' ? svgTreemap(spec, w) : spec.type === 'heatmap' ? svgHeatmap(spec, w) : svgLine(spec, w);
    wireTooltip(host, spec, w);
  }
}
function layout(spec, W) {
  const H = spec.h || 220, P = { l: spec.padL ?? 58, r: 14, t: 14, b: 28 };
  return { H, P, iw: W - P.l - P.r, ih: H - P.t - P.b };
}
function svgLine(spec, W) {
  const { H, P, iw, ih } = layout(spec, W);
  const series = spec.series.filter(s => s.points.length);
  if (!series.length) return `<div class="chart-empty">${esc(spec.empty || 'Not enough history yet.')}</div>`;
  const n = Math.max(...series.map(s => s.points.length));
  let ys = series.flatMap(s => s.points.map(p => p.y));
  for (const b of spec.bands || []) ys.push(...b.lo, ...b.hi);
  const lo = Math.min(...ys);
  const thr = spec.threshold != null && lo < spec.threshold * 4 ? spec.threshold : null;
  if (thr != null) ys.push(thr);
  if (spec.zero && lo < 0) ys.push(0);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  spec._geom = { X, Y, n, P, iw, ih, H };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc((spec.yFmt || moneyCompact)(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const pts0 = series[0].points;
  for (let i = 0; i < n; i += every) if (pts0[i]) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc((spec.xFmt || (x => x))(pts0[i].x))}</text>`;
  if (thr != null) g += `<line class="threshold" x1="${P.l}" x2="${P.l + iw}" y1="${Y(thr)}" y2="${Y(thr)}"/><text class="tick threshold-label" x="${P.l + iw}" y="${Y(thr) - 6}" text-anchor="end">${esc(spec.thresholdLabel || '')}</text>`;
  if (spec.zero && y0 < 0) g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  for (const b of spec.bands || []) {
    const up = b.hi.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const down = b.lo.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    g += `<path class="band" style="fill:${b.color};opacity:${b.opacity ?? 0.18}" d="${up}${down}Z"/>`;
  }
  for (const v of spec.vlines || []) g += `<line class="vline" x1="${X(v.i)}" x2="${X(v.i)}" y1="${P.t}" y2="${P.t + ih}"/><text class="tick vline-label" x="${X(v.i) + 5}" y="${P.t + 10}">${esc(v.label)}</text>`;
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    if (s.area) { const gid = 'g' + uid(); g += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.30"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient></defs><path class="area" fill="url(#${gid})" d="${d}L${X(s.points.length - 1)},${Y(Math.max(y0, 0))}L${X(0)},${Y(Math.max(y0, 0))}Z"/>`; }
    g += `<path class="line${s.dash ? ' dash' : ''}" style="stroke:${s.color}" d="${d}"/>`;
    if (s.points.length < 30 && !s.nodots) s.points.forEach((p, i) => { g += `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="${i === s.points.length - 1 ? 3.5 : 2}" style="fill:${s.color}"/>`; });
  }
  for (let m of spec.markers || []) {
    const x = X(m.i), y = Y(m.y), right = x > P.l + iw * 0.7;
    m = { ...m, below: m.below && y + 20 < P.t + ih };
    g += `<circle class="marker" cx="${x}" cy="${y}" r="4.5"/><text class="marker-label" x="${x + (right ? -8 : 8)}" y="${y + (m.below ? 16 : -9)}" text-anchor="${right ? 'end' : 'start'}">${esc(m.label)}</text>`;
  }
  g += `<line class="guide" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="opacity:0"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}
function svgBars(spec, W) {
  const { H, P, iw, ih } = layout(spec, W);
  const n = spec.labels.length;
  if (!n) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  const all = spec.series.flatMap(s => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const band = iw / n, k = spec.series.length, bw = Math.max(3, Math.min(22, (band * 0.72) / k));
  const X = i => P.l + band * i + band / 2;
  spec._geom = { X, Y, n, P, iw, ih, H, band };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(moneyCompact(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 46))));
  spec.labels.forEach((l, i) => { if (i % every === 0) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  spec.series.forEach((s, j) => s.values.forEach((v, i) => {
    const x = X(i) - (bw * k) / 2 + j * bw, y = Y(Math.max(0, v)), h = Math.abs(Y(v) - Y(0));
    g += `<rect class="bar" x="${x + 0.5}" y="${y}" width="${bw - 1}" height="${Math.max(0.5, h)}" rx="1.5" style="fill:${s.color}"/>`;
  }));
  g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  g += `<rect class="guide-band" x="0" y="${P.t}" width="${band}" height="${ih}" style="opacity:0"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}
function wireTooltip(host, spec, W) {
  const svg = host.querySelector('svg'), tip = host.querySelector('.chart-tip');
  if (!svg || !tip || !spec.tip || !spec._geom) return;
  const { X, n, P, iw, band } = spec._geom;
  const guide = svg.querySelector('.guide, .guide-band');
  const show = clientX => {
    const r = svg.getBoundingClientRect(), x = clientX - r.left;
    let i = band ? Math.floor((x - P.l) / band) : Math.round(((x - P.l) / (iw || 1)) * (n - 1));
    i = clamp(i, 0, n - 1);
    const html = spec.tip(i); if (!html) return;
    tip.innerHTML = html; tip.hidden = false;
    const gx = X(i);
    if (band) { guide.setAttribute('x', gx - band / 2); } else { guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); }
    guide.style.opacity = 1;
    const tw = tip.offsetWidth;
    tip.style.left = clamp(gx - tw / 2, 0, W - tw) + 'px';
    tip.style.top = '0px';
  };
  const hide = () => { tip.hidden = true; guide.style.opacity = 0; };
  host.onmousemove = e => show(e.clientX);
  host.onmouseleave = hide;
  host.ontouchstart = host.ontouchmove = e => { if (e.touches[0]) show(e.touches[0].clientX); };
  host.ontouchend = () => setTimeout(hide, 1600);
}

/* Stacked areas (positive series stack up, negative stack down) with an optional overlay line. */
function svgStack(spec, W) {
  const { H, P, iw, ih } = layout(spec, W);
  const n = spec.labels.length;
  if (n < 2) return `<div class="chart-empty">${esc(spec.empty || 'Not enough history yet.')}</div>`;
  const pos = new Array(n).fill(0), neg = new Array(n).fill(0), layers = [];
  for (const s of spec.series) {
    const base = [], top = [];
    s.values.forEach((v, i) => { if (v >= 0) { base.push(pos[i]); pos[i] += v; top.push(pos[i]); } else { base.push(neg[i]); neg[i] += v; top.push(neg[i]); } });
    layers.push({ s, base, top });
  }
  const ys = [...pos, ...neg, 0, ...(spec.line ? spec.line.values : [])];
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), spec.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => P.l + (i / (n - 1)) * iw, Y = v => P.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  spec._geom = { X, Y, n, P, iw, ih, H };
  let g = '';
  for (const t of ticks) g += `<line class="grid" x1="${P.l}" x2="${P.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(moneyCompact(t))}</text>`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  spec.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) g += `<text class="tick" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
  for (const { s, base, top } of layers) {
    const up = top.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const down = base.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    g += `<path class="stack-area" style="fill:${s.color}" d="${up}${down}Z"/>`;
  }
  g += `<line class="zero" x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  if (spec.line) g += `<path class="line" style="stroke:${spec.line.color}" d="${spec.line.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}"/>`;
  g += `<line class="guide" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="opacity:0"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg><div class="chart-tip" hidden></div>`;
}

/* Sankey: left nodes → one center node → right nodes. Small nodes get a minimum label slot so text never collides. */
function svgSankey(spec, W) {
  const { total } = spec;
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'No income or spending in this period.')}</div>`;
  const merge = list => {
    const big = list.filter(n => n.saved || n.drawn || n.value / total >= 0.025), small = list.filter(n => !(n.saved || n.drawn || n.value / total >= 0.025));
    const at = big.findIndex(n => n.saved || n.drawn) >= 0 ? big.findIndex(n => n.saved || n.drawn) : big.length;
    if (small.length > 1) big.splice(at, 0, { name: `${small.length} smaller`, value: sum(small.map(n => n.value)), title: small.map(n => `${n.name} ${money(n.value, { cents: false })}`).join(', ') });
    else big.splice(at, 0, ...small);
    return big;
  };
  const left = merge(spec.left), right = merge(spec.right);
  const narrow = W < 640;
  const labelW = narrow ? 104 : 200, nodeW = 12, gap = 6, slot = 32, top = 12;
  const centerH = narrow ? 240 : 320, scale = centerH / total;
  const lay = list => { let y = 0; return list.map(n => { const h = Math.max(1.5, n.value * scale); const box = Math.max(h, slot); const o = { ...n, h, y: y + (box - h) / 2 }; y += box + gap; return o; }); };
  const L = lay(left), R = lay(right);
  const colH = l => l.length ? l[l.length - 1].y + l[l.length - 1].h + gap : 0;
  const inner = Math.max(centerH, colH(L), colH(R));
  const H = inner + top * 2;
  const off = (h) => top + (inner - h) / 2;
  const lo = off(colH(L)), ro = off(colH(R)), cY = off(centerH);
  const xL = labelW, xC = W / 2 - nodeW / 2, xR = W - labelW - nodeW;
  const fmt = v => (narrow ? moneyCompact(v) : money(v, { cents: false }));
  const trunc = n => n.length > (narrow ? 13 : 26) ? n.slice(0, narrow ? 12 : 25) + '…' : n;
  const band = (x1, y1, x2, y2, h1, h2, color, title) => {
    const mx = (x1 + x2) / 2;
    return `<path class="sk-band" style="fill:${color}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + h2} C${mx},${y2 + h2} ${mx},${y1 + h1} ${x1},${y1 + h1} Z"><title>${esc(title)}</title></path>`;
  };
  let g = '', cy = cY;
  L.forEach((n, i) => {
    const y = lo + n.y, color = n.drawn ? 'var(--neg)' : `var(--c${(i % 8) + 1})`;
    g += band(xL + nodeW, y, xC, cy, n.h, n.h, color, n.title || `${n.name}: ${money(n.value, { cents: false })}`);
    g += `<rect class="sk-node" x="${xL}" y="${y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${color}"/>`;
    g += `<text class="sk-label" x="${xL - 10}" y="${y + n.h / 2 - 2}" text-anchor="end">${esc(trunc(n.name))}</text><text class="sk-value num" x="${xL - 10}" y="${y + n.h / 2 + 12}" text-anchor="end">${fmt(n.value)}</text>`;
    cy += n.h;
  });
  g += `<rect class="sk-node center" x="${xC}" y="${cY}" width="${nodeW}" height="${centerH}" rx="2"/>`;
  if (!narrow) g += `<text class="sk-value" x="${xC + nodeW / 2}" y="${cY - 6}" text-anchor="middle">${money(total, { cents: false })}</text>`;
  cy = cY;
  R.forEach((n, i) => {
    const y = ro + n.y, color = n.saved ? 'var(--pos)' : `var(--c${((i + 3) % 8) + 1})`;
    g += band(xC + nodeW, cy, xR, y, n.h, n.h, color, n.title || `${n.name}: ${money(n.value, { cents: false })}`);
    g += `<rect class="sk-node" x="${xR}" y="${y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${color}"/>`;
    g += `<text class="sk-label${n.saved ? ' saved' : ''}" x="${xR + nodeW + 10}" y="${y + n.h / 2 - 2}">${esc(trunc(n.name))}</text><text class="sk-value num" x="${xR + nodeW + 10}" y="${y + n.h / 2 + 12}" text-anchor="start">${fmt(n.value)} · ${pct(n.value / total, 0)}</text>`;
    cy += n.h;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="sankey">${g}</svg>`;
}

/* Donut with a center figure. */
function svgDonut(spec, W) {
  const items = spec.items.filter(i => i.value > 0), total = sum(items.map(i => i.value));
  const H = spec.h || 220, size = Math.min(W, H), r = size / 2 - 4, inner = r * (spec.thin ? 0.78 : 0.64), cx = W / 2, cy = H / 2;
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  let a0 = -Math.PI / 2, g = '';
  const gapA = items.length > 1 ? 0.012 : 0;
  const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  for (const it of items) {
    const a = (it.value / total) * Math.PI * 2, a1 = a0 + a, s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a1 - gapA / 2), large = s1 - s0 > Math.PI ? 1 : 0;
    const path = items.length === 1
      ? `M${pt(r, -Math.PI / 2)} A${r},${r} 0 1 1 ${pt(r, Math.PI * 1.5 - 0.0001)} L${pt(inner, Math.PI * 1.5 - 0.0001)} A${inner},${inner} 0 1 0 ${pt(inner, -Math.PI / 2)} Z`
      : `M${pt(r, s0)} A${r},${r} 0 ${large} 1 ${pt(r, s1)} L${pt(inner, s1)} A${inner},${inner} 0 ${large} 0 ${pt(inner, s0)} Z`;
    g += `<path class="donut-seg" d="${path}" style="fill:${it.color}"><title>${esc(it.label)}: ${money(it.value, { cents: false })} (${pct(it.value / total, 0)})</title></path>`;
    a0 = a1;
  }
  if (spec.center) g += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-value">${esc(spec.center.value)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-label">${esc(spec.center.label)}</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

/* Squarified treemap. */
function svgTreemap(spec, W) {
  const H = spec.h || 320;
  const items = spec.items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sum(items.map(i => i.value));
  if (!total) return `<div class="chart-empty">${esc(spec.empty || 'Nothing to show yet.')}</div>`;
  const rects = [];
  const area = items.map(i => ({ ...i, a: (i.value / total) * W * H }));
  (function squarify(list, x, y, w, h) {
    if (!list.length) return;
    if (list.length === 1) { rects.push({ ...list[0], x, y, w, h }); return; }
    const short = Math.min(w, h);
    let row = [], best = Infinity, i = 0;
    const worst = r => { const s = sum(r.map(o => o.a)), mx = Math.max(...r.map(o => o.a)), mn = Math.min(...r.map(o => o.a)); return Math.max((short * short * mx) / (s * s), (s * s) / (short * short * mn)); };
    while (i < list.length) { const next = [...row, list[i]], wv = worst(next); if (wv <= best) { row = next; best = wv; i++; } else break; }
    const s = sum(row.map(o => o.a));
    if (w >= h) { const cw = s / h; let yy = y; for (const o of row) { const ch = o.a / cw; rects.push({ ...o, x, y: yy, w: cw, h: ch }); yy += ch; } squarify(list.slice(row.length), x + cw, y, w - cw, h); }
    else { const ch = s / w; let xx = x; for (const o of row) { const cw = o.a / ch; rects.push({ ...o, x: xx, y, w: cw, h: ch }); xx += cw; } squarify(list.slice(row.length), x, y + ch, w, h - ch); }
  })(area, 0, 0, W, H);
  let g = '';
  for (const r of rects) {
    const big = r.w > 78 && r.h > 40, mid = r.w > 54 && r.h > 22;
    const inner = `<rect class="tm-tile" x="${r.x + 1}" y="${r.y + 1}" width="${Math.max(0, r.w - 2)}" height="${Math.max(0, r.h - 2)}" rx="4" style="fill:${r.color}"><title>${esc(r.label)}: ${money(r.value, { cents: false })} (${pct(r.value / total, 0)})</title></rect>` +
      (mid ? `<text class="tm-label" x="${r.x + 9}" y="${r.y + 18}">${esc(r.label.length * 7 > r.w - 14 ? r.label.slice(0, Math.max(3, Math.floor((r.w - 14) / 7) - 1)) + '…' : r.label)}</text>` : '') +
      (big ? `<text class="tm-value" x="${r.x + 9}" y="${r.y + 35}">${money(r.value, { cents: false })}</text>` : '');
    g += r.href ? `<a href="${r.href}">${inner}</a>` : inner;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="treemap">${g}</svg>`;
}

/* Calendar heatmap of daily spending (weeks as columns), sized to fill the width. */
function svgHeatmap(spec, W) {
  const top = 18, left = 26, gap = 3;
  const weeks = Math.max(8, Math.min(spec.weeks || 52, Math.floor((W - left) / (15 + gap)) - 1));
  const cell = Math.max(8, Math.min(22, Math.floor((W - left - 4) / (weeks + 1)) - gap));
  const end = fromISO(today());
  const start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1) - start.getDay());
  const H = top + 7 * (cell + gap);
  const vals = Object.values(spec.days).filter(v => v > 0).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75, 0.92].map(x => quantile(vals, x));
  const level = v => !v ? 0 : v <= q[0] ? 1 : v <= q[1] ? 2 : v <= q[2] ? 3 : v <= q[3] ? 4 : 5;
  let g = '', lastMonth = -1;
  ['M', 'W', 'F'].forEach((l, i) => { g += `<text class="tick" x="0" y="${top + (i * 2 + 1) * (cell + gap) + cell - 2}">${l}</text>`; });
  const d = new Date(start);
  for (let w = 0; w <= weeks; w++) {
    for (let day = 0; day < 7; day++) {
      if (d > end) break;
      const iso = toISO(d), v = spec.days[iso] || 0, x = left + w * (cell + gap), y = top + day * (cell + gap);
      if (day === 0 && d.getMonth() !== lastMonth && d.getDate() <= 7) { g += `<text class="tick" x="${x}" y="11">${MON[d.getMonth()]}</text>`; lastMonth = d.getMonth(); }
      g += `<rect class="hm l${level(v)}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2"><title>${dateLabel(iso, true)}: ${v ? money(v, { cents: false }) + ' spent' : 'no spending'}</title></rect>`;
      d.setDate(d.getDate() + 1);
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="heatmap">${g}</svg>`;
}
window.addEventListener('resize', debounce(() => drawCharts(), 150));

/* ================= file parsers (pure functions) ================= */

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const sample = text.split(/\r?\n/).slice(0, 8).join('\n');
  const count = ch => (sample.match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length;
  const delim = [',', ';', '\t', '|'].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}
const HEADER_WORDS = /^(date|trans(action)?\.? ?date|post(ing|ed)? ?date|description|payee|merchant|name|amount|debit|credit|withdrawals?|deposits?|category|memo|type|balance|details|symbol|quantity|shares|price|last price|current value|market value|cost basis.*|account.*|reference.*|check.*|status)$/i;
function findHeaderRow(rows) {
  let best = 0, bestScore = -1;
  rows.slice(0, 25).forEach((r, i) => {
    const score = r.filter(c => HEADER_WORDS.test(c.replace(/[^a-z .]/gi, '').trim())).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return bestScore >= 2 ? best : 0;
}
function pickCol(headers, patterns, exclude) {
  for (const p of patterns) {
    const i = headers.findIndex(h => p.test(h) && !(exclude && exclude.test(h)));
    if (i >= 0) return i;
  }
  return -1;
}
function isPositionsHeader(h) {
  return pickCol(h, [/^symbol$|^ticker|symbol/i]) >= 0 && pickCol(h, [/quantity|shares|units/i]) >= 0;
}
function guessTxnMapping(h) {
  return {
    date: pickCol(h, [/^trans(action)?\.? ?date/i, /^date$/i, /^posted? ?date|posting date/i, /date/i]),
    payee: pickCol(h, [/^description$/i, /^payee|merchant/i, /^name$/i, /description|details/i, /^memo$/i], /category|type/i),
    amount: pickCol(h, [/^amount$/i, /transaction amount|amount \(?usd|^amt$/i, /amount/i], /balance|original/i),
    debit: pickCol(h, [/^debit|withdrawal|outflow|charges?$/i]),
    credit: pickCol(h, [/^credit$|^credits?$|deposit|inflow|payments?$/i], /card/i),
    category: pickCol(h, [/^category$/i, /category/i], /code|mcc|sic/i),
    mcc: pickCol(h, [/^mcc$|^mcc code$|merchant category code|^sic$|^sic code$/i]),
    memo: pickCol(h, [/^memo$|^notes?$/i]),
    account: pickCol(h, [/^account( name)?$/i], /number|type|mask|id$/i),
    tags: pickCol(h, [/^tags?$|^labels?$/i]),
    ttype: pickCol(h, [/^transaction type$/i]),
  };
}

/* ---------- QIF (Quicken Interchange Format) ---------- */
function looksLikeQIF(text) { return /^\s*!(Type|Account|Option)/im.test(text.slice(0, 500)); }
function parseQIF(text) {
  const out = []; let cur = {}, acct = '', inAcct = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd(); if (!line) continue;
    if (line.startsWith('!Account')) { inAcct = true; continue; }
    if (line.startsWith('!')) { inAcct = false; continue; }
    const c = line[0], v = line.slice(1).trim();
    if (inAcct) { if (c === 'N') acct = v; if (c === '^') inAcct = false; continue; }
    if (c === '^') { if (cur.date && isFinite(cur.amount)) out.push({ ...cur, srcAccount: acct }); cur = {}; continue; }
    if (c === 'D') { const m = v.replace(/'/g, '/').replace(/\s/g, '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (m) { let y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; cur.date = `${y}-${pad2(m[1])}-${pad2(m[2])}`; } else cur.date = parseDateFlexible(v); }
    else if (c === 'T' || c === 'U') cur.amount = parseAmount(v);
    else if (c === 'P') cur.payee = v;
    else if (c === 'M') cur.memo = v;
    else if (c === 'L') cur.bankCategory = v.replace(/^\[.*\]$/, '');
    else if (c === 'N' && !cur.payee) cur.num = v;
  }
  return out.map(t => ({ date: t.date, amount: round2(t.amount), payee: t.payee || (t.num ? `Check #${t.num}` : 'Unknown'), memo: t.memo || '', bankCategory: t.bankCategory || '', fitid: '', srcAccount: t.srcAccount || '' }));
}

/* ---------- OFX / QFX / QBO ---------- */
const ofxDecode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
function ofxTag(block, tag) { const m = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i')); return m ? ofxDecode(m[1]) : ''; }
function ofxBlocks(text, tag) {
  const out = [], re = new RegExp('<' + tag + '>', 'ig'); let m; const starts = [];
  while ((m = re.exec(text))) starts.push(m.index);
  starts.forEach((s, i) => {
    const endClose = text.toUpperCase().indexOf('</' + tag.toUpperCase() + '>', s);
    const next = i + 1 < starts.length ? starts[i + 1] : text.length;
    out.push(text.slice(s, endClose > -1 && endClose < next ? endClose : next));
  });
  return out;
}
function looksLikeOFX(text) { return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000)); }
function parseOFX(text) {
  const acctBlock = ofxBlocks(text, 'BANKACCTFROM')[0] || ofxBlocks(text, 'CCACCTFROM')[0] || ofxBlocks(text, 'INVACCTFROM')[0] || '';
  const acctId = ofxTag(acctBlock, 'ACCTID');
  const isCard = /<CCACCTFROM>/i.test(text), isInv = /<INVSTMTRS>/i.test(text);
  const ofxType = ofxTag(acctBlock, 'ACCTTYPE');
  const txns = ofxBlocks(text, 'STMTTRN').map(b => ({
    date: parseDateFlexible(ofxTag(b, 'DTPOSTED')),
    amount: parseAmount(ofxTag(b, 'TRNAMT')),
    payee: (ofxTag(b, 'CHECKNUM') && /^(CHECK|CHK)\b/i.test(ofxTag(b, 'NAME') || 'CHECK')) ? `Check #${ofxTag(b, 'CHECKNUM')}` : (ofxTag(b, 'NAME') || ofxTag(b, 'PAYEE') || ofxTag(b, 'MEMO')),
    memo: ofxTag(b, 'MEMO'),
    fitid: ofxTag(b, 'FITID'),
    mcc: ofxTag(b, 'SIC') || ofxTag(b, 'MCC'),
    type: ofxTag(b, 'TRNTYPE'),
  })).filter(t => t.date && isFinite(t.amount));
  const ledger = ofxBlocks(text, 'LEDGERBAL')[0];
  const balance = ledger ? { amount: parseAmount(ofxTag(ledger, 'BALAMT')), date: parseDateFlexible(ofxTag(ledger, 'DTASOF')) } : null;
  // investment positions
  const secs = {};
  for (const b of ofxBlocks(text, 'SECINFO')) secs[ofxTag(b, 'UNIQUEID')] = { symbol: ofxTag(b, 'TICKER') || ofxTag(b, 'UNIQUEID'), name: ofxTag(b, 'SECNAME') };
  const positions = [];
  for (const b of ofxBlocks(text, 'INVPOS')) {
    const id = ofxTag(b, 'UNIQUEID'), sec = secs[id] || { symbol: id, name: '' };
    const shares = parseAmount(ofxTag(b, 'UNITS')), price = parseAmount(ofxTag(b, 'UNITPRICE')), value = parseAmount(ofxTag(b, 'MKTVAL'));
    if (!isFinite(shares)) continue;
    positions.push({ symbol: sec.symbol, name: sec.name, shares, price: isFinite(price) ? price : (isFinite(value) && shares ? value / shares : 0), value: isFinite(value) ? value : shares * price, costBasis: null, srcAccount: acctId });
  }
  const invCash = parseAmount(ofxTag(ofxBlocks(text, 'INVBAL')[0] || '', 'AVAILCASH'));
  return { acctId, last4: acctId.replace(/\D/g, '').slice(-4), isCard, isInv, ofxType, txns, balance, positions, invCash: isFinite(invCash) ? invCash : null };
}

/* ---------- positions CSV (Fidelity, Schwab, Vanguard, etc.) ---------- */
function parsePositionsCSV(rows) {
  const hi = findHeaderRow(rows), h = rows[hi];
  const col = {
    symbol: pickCol(h, [/^symbol$/i, /ticker|symbol/i]),
    name: pickCol(h, [/^description$/i, /security|^name$|description/i], /account/i),
    shares: pickCol(h, [/^quantity$/i, /quantity|shares|units/i]),
    price: pickCol(h, [/^last price$/i, /^price$/i, /current price|unit price|last price|price/i], /change|cost/i),
    value: pickCol(h, [/^current value$/i, /market value|current value|^value$|total value/i], /change|gain|%/i),
    cost: pickCol(h, [/^cost basis total$/i, /total cost|cost basis total|^cost basis$|^cost$/i], /average|per share|avg/i),
    avgCost: pickCol(h, [/average cost|avg cost|cost per share/i]),
    account: pickCol(h, [/^account name$/i, /^account$/i, /account number|account name/i]),
  };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    let sym = (r[col.symbol] || '').replace(/\*+$/, '').trim();
    if (!sym || /pending|total|^--$/i.test(sym) || sym.length > 24) continue;
    let shares = parseAmount(r[col.shares]), price = parseAmount(r[col.price]), value = parseAmount(r[col.value]);
    let cost = parseAmount(r[col.cost]);
    if (!isFinite(cost) && col.avgCost >= 0 && isFinite(parseAmount(r[col.avgCost])) && isFinite(shares)) cost = parseAmount(r[col.avgCost]) * shares;
    if (!isFinite(shares) && isFinite(value)) { shares = value; price = 1; }   // cash sweep rows
    if (!isFinite(shares)) continue;
    if (!isFinite(price)) price = isFinite(value) && shares ? value / shares : 1;
    const name = (r[col.name] || '').trim();
    out.push({ symbol: sym, name, shares, price: round2(price * 10000) / 10000, value: isFinite(value) ? value : shares * price, costBasis: isFinite(cost) ? cost : null, srcAccount: col.account >= 0 ? (r[col.account] || '').trim() : '' });
  }
  return out;
}
function guessAssetClass(symbol, name) {
  const s = (symbol || '').toUpperCase(), n = (name || '').toUpperCase();
  if (/^(SPAXX|FDRXX|FZFXX|FCASH|SWVXX|SNVXX|VMFXX|VMRXX|SPRXX|CORE|CASH|MMDA)/.test(s) || /MONEY MARKET|CASH RESERVE|GOVERNMENT CASH|SWEEP|CORE POSITION/.test(n)) return 'Cash';
  if (/^(BTC|ETH|SOL|IBIT|FBTC|GBTC|ETHE|FETH|BITO)$/.test(s) || /BITCOIN|ETHEREUM|CRYPTO/.test(n)) return 'Crypto';
  if (/^(VNQ|VNQI|SCHH|XLRE|IYR|FREL|USRT)$/.test(s) || /\bREIT\b|REAL ESTATE/.test(n)) return 'Real estate';
  if (/^(BND|AGG|BNDX|VGIT|VGSH|VGLT|SCHZ|FXNAX|FBND|TLT|IEF|SHY|SGOV|BIL|MUB|VTEB|TIP|SCHP|LQD|HYG|JNK|VCIT|VCSH)$/.test(s) || /\bBOND|TREASUR|\bMUNI|FIXED INCOME|INCOME FUND|T-BILL|AGGREGATE|\bCD\b|CERTIFICATE OF DEPOSIT/.test(n)) return 'Bonds';
  if (/^(VXUS|VEA|VWO|IXUS|IEFA|IEMG|EFA|EEM|FTIHX|FSPSX|SCHF|SPDW|VTIAX|FZILX)$/.test(s) || /INTERNATIONAL|INTL|EMERGING|EX[- ]US|DEVELOPED MKT|FOREIGN|WORLD EX/.test(n)) return 'International stocks';
  if (/GOLD|COMMODIT|HEDGE|PRIVATE|INTERVAL FUND/.test(n) || /^(GLD|IAU|GLDM|SLV|DBC|PDBC)$/.test(s)) return 'Private & alternatives';
  return 'US stocks';
}

/* ---------- PDF statements (best effort, fully local) ---------- */
let _pdfjs = null;
function loadPdfJs() {
  if (_pdfjs) return Promise.resolve(_pdfjs);
  return (async () => {
    // Single-file build carries the reader inline; the Mac folder build loads it from app/vendor on first use.
    for (const [id, file] of [['vendor-pdfworker', 'pdf.worker.min.js'], ['vendor-pdfjs', 'pdf.min.js']]) {
      const inline = document.getElementById(id);
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        if (inline) { s.textContent = inline.textContent; document.head.appendChild(s); res(); }
        else { s.src = `app/vendor/${file}`; s.onload = res; s.onerror = () => rej(new Error('Ọrọ̀ couldn’t load its PDF reader from the app folder.')); document.head.appendChild(s); }
      });
    }
    _pdfjs = window.pdfjsLib;
    if (!_pdfjs) throw new Error('The PDF reader failed to start.');
    return _pdfjs;
  })();
}
async function pdfToLines(buffer) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5], w = it.width || 0, fs = Math.abs(it.transform[3]) || 10;
      let row = rows.find(r => Math.abs(r.y - y) < Math.max(2, fs * 0.35));
      if (!row) rows.push(row = { y, items: [] });
      row.items.push({ x, w, s: it.str, fs });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let text = '', prevEnd = null;
      for (const it of r.items) {
        if (prevEnd != null) text += (it.x - prevEnd > it.fs * 1.2) ? '   ' : (it.x - prevEnd > it.fs * 0.15 ? ' ' : '');
        text += it.s; prevEnd = it.x + it.w;
      }
      lines.push(text.replace(/\s+$/, ''));
    }
  }
  return lines;
}
function statementPeriod(text) {
  const mo = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?';
  let m = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:-|–|—|to|through|thru)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) return { start: parseDateFlexible(m[1]), end: parseDateFlexible(m[2]) };
  m = text.match(new RegExp(mo + '\\s+\\d{1,2},?\\s+(\\d{4})?\\s*(?:-|–|—|to|through|thru)\\s*' + mo + '\\s+\\d{1,2},?\\s+(\\d{4})', 'i'));
  if (m) { const end = parseDateFlexible(m[0].split(/\s*(?:-|–|—|to|through|thru)\s*/i).pop()); return { start: null, end }; }
  m = text.match(/(?:closing|statement|period ending|ending)\s*date:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) return { start: null, end: parseDateFlexible(m[1]) };
  const years = (text.match(/\b20\d{2}\b/g) || []).reduce((a, y) => (a[y] = (a[y] || 0) + 1, a), {});
  const y = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
  return { start: null, end: y ? `${y[0]}-12-31` : null };
}
const AMT_RE = /\(?-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?-|\s?CR\b|\s?DR\b)?/gi;
const SKIP_LINE = /\b(total|subtotal|beginning balance|ending balance|previous balance|new balance|opening balance|closing balance|minimum payment|payment due|available credit|credit limit|balance forward|daily balance|annual percentage|interest rate|page \d)/i;
function parseStatementLines(lines) {
  const text = lines.join('\n');
  const period = statementPeriod(text);
  const endY = period.end ? +period.end.slice(0, 4) : new Date().getFullYear();
  const endM = period.end ? +period.end.slice(5, 7) : 12;
  const out = [];
  let section = -1;
  const dateStart = /^\s*((\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:,? \d{4})?)\b/i;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(dateStart);
    if (!m) {
      const l = line.toLowerCase();
      if (line.length < 70) {
        if (/(payments?|deposits?|credits?|additions|refunds?)\b/.test(l) && !/(withdrawals?|debits?|purchases?|subtractions)/.test(l)) section = 1;
        else if (/(withdrawals?|debits?|purchases?|subtractions|checks paid|fees|interest charged|charges|new charges)/.test(l)) section = -1;
      }
      continue;
    }
    if (SKIP_LINE.test(line)) continue;
    let rest = line.slice(m[0].length).trim();
    rest = rest.replace(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+/, ''); // second (post) date
    const amts = rest.match(AMT_RE);
    if (!amts) continue;
    const tail = rest.slice(rest.search(new RegExp(amts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    const trailing = (tail.match(AMT_RE) || []);
    let amtTok = trailing.length >= 2 ? trailing[trailing.length - 2] : trailing[trailing.length - 1];
    let payee = rest.slice(0, rest.indexOf(trailing[0])).replace(/\s{2,}/g, ' ').replace(/[\s$]+$/, '').trim();
    if (!payee || payee.length < 2) continue;
    let iso = parseDateFlexible(m[1], endY);
    if (!iso) continue;
    if (!m[4] && !/\d{4}/.test(m[1]) && +iso.slice(5, 7) > endM) iso = `${endY - 1}${iso.slice(4)}`;
    const explicitNeg = /^\(|^-|-$|\bDR\b/i.test(amtTok.trim());
    const explicitCr = /\bCR\b/i.test(amtTok);
    const abs = Math.abs(parseAmount(amtTok.replace(/\s?(CR|DR)\b/i, '')));
    if (!isFinite(abs) || abs === 0) continue;
    out.push({ date: iso, payee, abs, explicitNeg, explicitCr, section, raw: line });
  }
  const acctM = text.match(/(?:ending(?: in)?|account(?: number)?(?: ending)?:?)\s*[x*•.\s-]*(\d{4})\b/i);
  const isCard = /credit card|credit limit|minimum payment|new balance|visa|mastercard|american express|discover card/i.test(text);
  return { rows: out, period, last4: acctM ? acctM[1] : null, isCard };
}
/* Turn a parsed PDF row into a signed amount for the chosen account type. */
function pdfSignedAmount(r, isCard) {
  if (r.explicitCr) return r.abs;
  if (isCard) return r.explicitNeg ? r.abs : (r.section > 0 ? r.abs : -r.abs);
  if (r.explicitNeg) return -r.abs;
  return r.section > 0 ? r.abs : -r.abs;
}

/* ---------- Automatic categories ----------
   Everything here runs on this device. For each imported transaction Ọrọ̀ tries, in order:
     1. your rules
     2. the category column from another app's export (YNAB, Monarch, Mint…) when it names one of yours
     3. how you categorized the same merchant before
     4. a list of about 1,000 national and Chicago-area merchants
     5. the merchant category code (MCC/SIC) some banks put in QFX/OFX and CSV files
     6. the card issuer's own category column (Chase, Capital One, Discover, Amex, Apple Card CSVs)
     7. words in the name ("… GRILL", "… PHARMACY", "… DENTAL")
     8. the payment processor (TST* is Toast, used by restaurants)
   Anything still unmatched stays uncategorized for you to pick. */

/* Names are matched as whole words on the cleaned description: upper case, digits and punctuation removed,
   apostrophes become spaces (MCDONALD'S → MCDONALD S, 7-ELEVEN → ELEVEN). A trailing * allows more letters,
   " ?S" covers possessives. An entry can also be a RegExp tested on " CLEANED DESCRIPTION ". */
const CARD_ISSUERS = 'AMEX|AMERICAN EXPRESS|CHASE|CITI|CITIBANK|CITICARDS?|CITI CARDS?|DISCOVER|DISCOVER CARD|CAPITAL ONE|CAPITALONE|BARCLAYCARD|BARCLAYS|SYNCHRONY|SYNCB|APPLECARD|APPLE CARD|GSBANK|GS BANK|GOLDMAN SACHS|BK OF AMER|BANK OF AMERICA|BOFA|WELLS FARGO|US BANK|USBANK|CARDMEMBER|CARDMEMBER SERV|ELAN|ELAN FINANCIAL|COMENITY|BREAD FINANCIAL|CREDIT ONE|BILT|FNBO|FIDELITY VISA|FIDELITY REWARDS|CREDIT CARD|CREDIT CRD|CRCARD[A-Z]*|CARD';
const CARD_PAYWORDS = 'PAYMENTS?|PMTS?|PYMT|PYMNT|EPAYMENT|EPAY|E PAYMENT|AUTOPAY|AUTO PAY|AUTOPAYMENT|ONLINE PMT|ACH PMT|WEB PMT|WEB PYMT|MOBILE PMT|MOBILE PYMT';
const CARD_PAYMENT_RE = new RegExp(
  ` (?:PAYMENT THANK YOU|THANK YOU FOR YOUR PAYMENT|PAYMENT RECEIVED|AUTOPAY PAYMENT|CRCARDPMT|CRDPMT|CRD PMT|CARD PYMT|CARD PMT|CARD PAYMENT)(?= )` +
  `| (?:${CARD_ISSUERS})(?: [A-Z&]+){0,4} (?:${CARD_PAYWORDS})(?= )` +
  `| (?:${CARD_PAYWORDS})(?: [A-Z&]+){0,3} (?:${CARD_ISSUERS})(?= )`);

const MERCHANTS = [
  /* money in */
  ['Other income', 'in', `SSA TREAS|SSA|SOC SEC|SOCIAL SECURITY|SSI TREAS|VA BENEFITS|VA TREAS|UNEMPLOYMENT|IDES|UI BENEFITS|PENSION|ANNUITY PAYMENT`],
  ['Taxes', 'in', `IRS TREAS|TAX REF*|TAXRFD|TAX REFUND|STATE TAX REF*|IL TAX REF*|IL DEPT OF REV*|TREASURY TAX`],
  ['Paycheck', 'in', `PAYROLL|PAYRL|PAYROLL DEP|DIR DEP|DIRECT DEP|DIRECT DEPOSIT|DIRDEP|SALARY|PAYCHECK|NET PAY|PAYCHEX|ADP|GUSTO|PAYLOCITY|PAYCOM|TRINET|JUSTWORKS|RIPPLING|INSPERITY|CERIDIAN|DAYFORCE|WORKDAY|ULTIPRO|UKG`],
  ['Interest and dividends', 'in', `INTEREST|INT|INT EARNED|INTEREST EARNED|INTEREST PAID|INTEREST PAYMENT|INTEREST CREDIT|DIVIDEND*|DIV|CAP GAIN*|QUAL DIV|ORDINARY DIV`],
  ['Other income', 'in', `CASHBACK|CASH BACK|CASH REWARD*|REWARD*|REDEMPTION|STATEMENT CREDIT`],

  /* fees, bills with distinctive words, payments, transfers */
  ['Bank fees', '', `OVERDRAFT|NSF|INSUFFICIENT FUNDS|RETURNED ITEM|SERVICE FEE|SERVICE CHARGE|MONTHLY FEE|MAINTENANCE FEE|MAINT FEE|ATM FEE|ATM SURCHARGE|NON CHASE ATM|FOREIGN TRANSACTION*|FOREIGN TRANS FEE|INTL TRANSACTION|INTERNATIONAL TRANSACTION|LATE FEE|LATE PAYMENT FEE|INTEREST CHARGE*|PURCHASE INTEREST|FINANCE CHARGE|ANNUAL FEE|MEMBERSHIP FEE|WIRE FEE|WIRE TRANSFER FEE|STOP PAYMENT|CASH ADVANCE FEE|BALANCE TRANSFER FEE|PAPER STATEMENT|STATEMENT FEE|CHECK ORDER|DEPOSITED ITEM RETURNED`],
  ['Mortgage or rent', 'out', `MORTGAGE|MTG|MTGE|HOME LOAN*|HOME LENDING|LOAN SERVICING|LOAN SVC|LOANCARE|MR COOPER|ROCKET MORTGAGE|QUICKEN LOANS|DOVENMUEHLE|PENNYMAC|FREEDOM MORTGAGE|LAKEVIEW LOAN|CENLAR|NEWREZ|SHELLPOINT|CALIBER HOME|FLAGSTAR|LOANDEPOT|CARRINGTON|NATIONSTAR|OCWEN|PHH MORTGAGE|MIDLAND MORTGAGE|ROUNDPOINT|GUARANTEED RATE(?! FIELD)|GUILD MORTGAGE|SUN WEST|UWM|
    APPFOLIO|RENTCAFE|RENT CAFE|YARDI|BUILDIUM|ZILLOW RENT*|RENTPAYMENT|RENT PAYMENT|CLICKPAY|PAYLEASE|ZEGO|RENT MANAGER|ENTRATA|BILT RENT|RENTREDI|TURBOTENANT|RESIDENT PORTAL|RESIDENTPORTAL|PROPERTY MANAGEMENT|PROPERTY MGMT`],
  ['Home maintenance', '', `HOA|HOMEOWNERS ASSOC*|HOMEOWNERS ASSN|HOME OWNERS ASSOC*|CONDO ASSOC*|CONDOMINIUM ASSOC*|CONDO ASSN|TOWNHOME ASSOC*|COMMUNITY ASSOC*|FIRSTSERVICE RESIDENTIAL|ASSOCIA`],
  ['Property tax', 'out', `PROPERTY TAX*|PROP TAX|REAL ESTATE TAX*|COUNTY TREAS*|COUNTY TREASURER|TREASURER|COUNTY COLLECTOR|TAX COLLECTOR`],
  ['Auto payment', 'out', `AUTO LOAN|AUTO FINANCE|AUTO FIN|AUTO LEASE|CAR PAYMENT|CARPAY|TOYOTA FIN*|TOYOTA MOTOR CREDIT|TOYOTA PAYMENT|TFS|LEXUS FIN*|HONDA FIN*|AMERICAN HONDA|AHFC|ACURA FIN*|NISSAN MOTOR|NISSAN FIN*|NMAC|INFINITI FIN*|HYUNDAI MOTOR FIN*|HYUNDAI CAPITAL|KIA MOTORS FIN*|KIA FIN*|GENESIS FIN*|FORD CREDIT|FORD MOTOR CREDIT|LINCOLN AUTO*|GM FINANCIAL|GMFINANCIAL|CHRYSLER CAPITAL|STELLANTIS FIN*|ALLY AUTO|ALLY PAYMT|ALLY PAYMENT|SANTANDER CONSUMER|CAPITAL ONE AUTO*|CAPITALONE AUTO|CHASE AUTO*|WELLS FARGO AUTO|WF AUTO|WELLS FARGO DEALER|TD AUTO*|BMW FIN*|BMW FS|MERCEDES BENZ FIN*|MB FIN*|MBFS|VW CREDIT|VOLKSWAGEN CREDIT|AUDI FIN*|SUBARU MOTORS FIN*|MAZDA FIN*|VOLVO CAR FIN*|PORSCHE FIN*|TESLA FIN*|TESLA LEASE|CARMAX AUTO|CARVANA|WESTLAKE FIN*|EXETER FINANCE|CREDIT ACCEPTANCE|BRIDGECREST|US BANK AUTO|PNC AUTO|HUNTINGTON AUTO`],
  ['Credit card payment', '', CARD_PAYMENT_RE],
  ['Transfer between accounts', '', `ONLINE TRANSFER|TRANSFER TO|TRANSFER FROM|INTERNAL TRANSFER|XFER|ONLINE XFER|ACCOUNT TRANSFER|FUNDS TRANSFER|BOOK TRANSFER|TRANSFER SAVINGS|SAVINGS TRANSFER|TRSF|ONLINE BANKING TRANSFER|MOBILE TRANSFER`],

  /* giving (before investing and restaurants: Fidelity Charitable, Ronald McDonald House) */
  ['Charitable giving', '', `FIDELITY CHARITABLE|SCHWAB CHARITABLE|VANGUARD CHARITABLE|NATIONAL PHILANTHROPIC|DAF GIVING|DAFGIVING|GIVING FUND|RONALD MCDONALD*|RED CROSS|AMERICAN RED CROSS|UNITED WAY|SALVATION ARMY(?! THRIFT| FAMILY STORE)|ST JUDE*|STJUDE|UNICEF|DOCTORS WITHOUT BORDERS|FEEDING AMERICA|FOOD DEPOSITORY|GREATER CHICAGO FOOD|HABITAT FOR HUMANITY(?! RESTORE)|WORLD VISION|COMPASSION INTL|COMPASSION INTERNATIONAL|SAMARITAN S PURSE|SAMARITANS PURSE|ACLU|WIKIMEDIA|KIVA|CHARITY WATER|MAKE A WISH|KOMEN|AMERICAN CANCER SOC*|AMERICAN HEART ASSOC*|ALZHEIMER S ASSOC*|ALZHEIMERS ASSOC*|BOYS & GIRLS CLUB*|BIG BROTHERS|WWF|WORLD WILDLIFE|NATURE CONSERVANCY|SIERRA CLUB|ASPCA|HUMANE SOCIETY|PAWS CHICAGO|ANTI CRUELTY|ALS ASSOC*|LEUKEMIA|MARCH OF DIMES|SPECIAL OLYMPICS|WOUNDED WARRIOR*|TUNNEL TO TOWERS|SHRINERS|UNCF|NAACP|SOUTHERN POVERTY|NPR|WBEZ|PBS|WTTW|KQED|WNYC|PUBLIC RADIO|GOFUNDME|GO FUND ME|GIVEBUTTER|CLASSY|DONORBOX|EVERY ORG|NETWORK FOR GOOD|BENEVITY|BLACKBAUD|PAYPAL GIVING|GIVELIFY|TITHE LY|TITHELY|PUSHPAY|CHURCH CENTER|PLANNING CENTER|SUBSPLASH|ONEREALM|EGIVING|E GIVING|ONLINE GIVING|DONATION*`],

  /* insurance */
  ['Pets', '', `TRUPANION|EMBRACE PET*|HEALTHY PAWS|LEMONADE PET|FETCH PET|PUMPKIN PET|PUMPKIN INS*|NATIONWIDE PET|PETS BEST|ASPCA PET|FIGO PET|SPOT PET`],
  ['Medical', '', `BCBS|BLUE CROSS|BLUECROSS|BLUE SHIELD|ANTHEM|AETNA|CIGNA|UNITEDHEALTH*|UNITED HEALTHCARE|UHC|HUMANA|OSCAR HEALTH|AMBETTER|MOLINA|HEALTHCARE GOV|DELTA DENTAL|VSP|EYEMED|METLIFE DENTAL`],
  ['Life and disability insurance', '', `NORTHWESTERN MUTUAL|NW MUTUAL|NWMUTUAL|MASSMUTUAL|MASS MUTUAL|NEW YORK LIFE|NY LIFE|PRUDENTIAL|GUARDIAN LIFE|GUARDIAN INS*|LINCOLN FINANCIAL|LINCOLN NATIONAL|JOHN HANCOCK|PACIFIC LIFE|PROTECTIVE LIFE|TRANSAMERICA|BANNER LIFE|LEGAL & GENERAL|LEGAL AND GENERAL|HAVEN LIFE|LADDER LIFE|LADDER INS*|BESTOW|POLICYGENIUS|ETHOS LIFE|ETHOS|MEETFABRIC|FABRIC LIFE|METLIFE|MET LIFE|UNUM|AFLAC|COLONIAL LIFE|PRIMERICA|BRIGHTHOUSE|SECURIAN|PENN MUTUAL|OHIO NATIONAL|MUTUAL OF OMAHA|GLOBE LIFE|AIG LIFE|SUN LIFE|BREEZE DISABILITY|LIFE INS*|LIFE INSURANCE|DISABILITY INS*|TERM LIFE|STATE FARM LIFE|ALLSTATE LIFE|NATIONWIDE LIFE`],
  ['Home insurance', '', `LEMONADE|HIPPO INS*|HIPPO HOME|KIN INS*|KIN INSURANCE|OPENLY|CHUBB|PURE INS*|PURE INSURANCE|ASSURANT|HOMEOWNERS INS*|HOME INSURANCE|HOME INS|RENTERS INS*|RENTERS INSURANCE|SURE RENTERS|HOMESITE|FLOOD INS*|NFIP|UMBRELLA POLICY`],
  ['Auto insurance', '', `AAA INS*|AAA INSURANCE|AAA AUTO INS*|GEICO|PROGRESSIVE|PROG INS*|STATE FARM|STATEFARM|ALLSTATE|LIBERTY MUTUAL|LIBERTYMUTUAL|FARMERS INS*|FARMERS INSURANCE|NATIONWIDE|TRAVELERS|USAA P&C|USAA INS*|AMERICAN FAMILY|AMFAM|ERIE INS*|ESURANCE|ROOT INS*|METROMILE|MERCURY INS*|SAFECO|THE GENERAL|DIRECT AUTO|KEMPER|INFINITY INS*|HANOVER INS*|PLYMOUTH ROCK|NJM|AUTO OWNERS|COUNTRY FINANCIAL|SHELTER INS*|GRANGE INS*|WESTFIELD INS*|CLEARCOVER|HAGERTY|DAIRYLAND|BRISTOL WEST|ELEPHANT INS*|AUTO INS*|AUTO INSURANCE|CAR INSURANCE`],

  /* taxes and investing */
  ['Taxes', '', `IRS|US TREASURY|USATAXPYMT|USA TAX PYMT|TREAS TAX|EFTPS|TAX PAYMENT|TAX PMT|TAX PYMT|ESTIMATED TAX|EST TAX|DEPT OF REV*|DEPARTMENT OF REVENUE|DEPT OF TAXATION|DEPARTMENT OF TAXATION|STATE TAX|FRANCHISE TAX|FTB|NYS DTF|COMPTROLLER|TAX COMMISSION|TAXATION AND FINANCE|IDOR|TURBOTAX|TURBO TAX|INTUIT TURBOTAX|H&R BLOCK|HR BLOCK|HRB|TAXACT|FREETAXUSA|TAXSLAYER|JACKSON HEWITT|LIBERTY TAX`],
  ['Savings and investing', 'out', `FIDELITY*|FMR|NFS|NATIONAL FINANCIAL|SCHWAB|CHARLES SCHWAB|VANGUARD|E TRADE|ETRADE|MORGAN STANLEY|ROBINHOOD|BETTERMENT|WEALTHFRONT|MERRILL*|ML PIERCE|TD AMERITRADE|AMERITRADE|INTERACTIVE BROKERS|IBKR|WEBULL|PUBLIC COM|ACORNS|STASH|SOFI INVEST|ALLY INVEST|FIRSTRADE|TIAA|PRINCIPAL|EMPOWER|T ROWE*|TROWE|AMERICAN FUNDS|CAPITAL GROUP|EDWARD JONES|EDWARDJONES|AMERIPRISE|RAYMOND JAMES|LPL|COINBASE|KRAKEN|GEMINI|TREASURYDIRECT|TREASURY DIRECT|TREAS DRCT|MARCUS BY GOLDMAN*|MARCUS SAVINGS|GS BANK MARCUS|UPROMISE|BRIGHT START|BRIGHTSTART|BRIGHT DIRECTIONS|COLLEGE SAVINGS|COLLEGEADVANTAGE|SCHOLARSHARE|HEALTHEQUITY|HSA BANK|OPTUM BANK|LIVELY HSA`],

  /* specific names that would otherwise land in a broader group below */
  ['Fuel and charging', '', `COSTCO GAS|COSTCO FUEL|SAMS CLUB GAS|SAMS CLUB FUEL|SAM S CLUB GAS|SAM S CLUB FUEL|SAMSCLUB GAS|SAMSCLUB FUEL|BJ ?S GAS|BJ ?S FUEL|KROGER FUEL|KROGER GAS|SAFEWAY FUEL|SAFEWAY GAS|MEIJER GAS|MEIJER EXPRESS|HY VEE GAS|HY VEE FAST|WALMART GAS|WALMART FUEL|WM GAS|MURPHY USA|MURPHY EXPRESS|MURPHYUSA|GETGO|FRED MEYER FUEL|KING SOOPERS FUEL|SMITHS FUEL|RALPHS FUEL|ALBERTSONS FUEL|VONS FUEL|JEWEL OSCO FUEL|WEIS GAS|FOOD LION FUEL|HEB FUEL|H E B FUEL|TESLA SUPERCHARGER|TESLA SUPERCHGR|TESLA SUPER*|SHELL RECHARGE`],
  ['Medical', '', `COSTCO PHARMACY|COSTCO OPTICAL|COSTCO HEARING|WALMART PHARMACY|WALMART VISION|WM PHARMACY|TARGET PHARMACY|TARGET OPTICAL|KROGER PHARMACY|JEWEL OSCO PHARM*|JEWEL OSCO RX|OSCO PHARMACY|OSCO DRUG|MARIANO ?S PHARMACY|HEB PHARMACY|MEIJER PHARMACY|PUBLIX PHARMACY|SAFEWAY PHARMACY|HY VEE PHARMACY|WEGMANS PHARMACY|SAMS CLUB PHARMACY|SAMSCLUB PHARMACY|AMAZON PHARMACY|AMZN PHARMACY|PILLPACK`],
  ['Groceries', '', `AMAZON FRESH|AMAZONFRESH|AMZN FRESH|AMAZON GROCE*|AMZN GROCE*|WHOLE FOODS|WHOLEFDS|WHOLE FDS|WFM|WALMART GROCERY|WMT GROCERY|TARGET GROCERY`],
  ['Subscriptions', '', `COSTCO MEMBERSHIP|COSTCO MBRSHIP|COSTCO MBR|COSTCO RENEWAL|SAMS CLUB MEMBERSHIP|SAMSCLUB MEMBERSHIP|SAMS MEMBERSHIP|BJ ?S MEMBERSHIP|WALMART PLUS|WMT PLUS|WALMART MEMBERSHIP|UBER ONE|DASHPASS|DOORDASH DASHPASS|GRUBHUB PLUS|INSTACART PLUS|INSTACART MEMBERSHIP|SHIPT MEMBERSHIP|AMAZON PRIME|AMZN PRIME|PRIME MEMBERSHIP|PRIME VIDEO|PRIMEVIDEO|AMAZON MUSIC|AMZN MUSIC|AMAZON DIGI*|AMZN DIGI*|AMAZON KINDLE|KINDLE*|AUDIBLE|AMAZON WEB SERVICES|AWS|APPLE COM BILL|ITUNES*|APPLE MUSIC|APPLE TV|APPLE ONE|APPLE ARCADE|ICLOUD|GOOGLE STORAGE|GOOGLE ONE|GOOGLE PLAY|GOOGLE WORKSPACE|GOOGLE CLOUD|GOOGLE NEST|NEST AWARE|GSUITE|G SUITE|YOUTUBE*`],
  ['Entertainment', '', `XBOX|MICROSOFT XBOX|MSFT XBOX|PLAYSTATION*|SONY PLAYSTATION|PSN|NINTENDO|STEAM GAMES|STEAMGAMES|STEAMPOWERED|STEAM PURCHASE|EPIC GAMES|ROBLOX|BLIZZARD|ELECTRONIC ARTS|EA GAMES|UNITED CENTER|GUARANTEED RATE FIELD|RATE FIELD|DAVE & BUSTER*|DAVE AND BUSTER*|TOPGOLF|PINSTRIPES|PUNCH BOWL SOCIAL|WALT DISNEY WORLD|DISNEY WORLD|DISNEYLAND|DISNEY PARKS|DISNEY RESORT*|WDW|DISNEY CRUISE|AMC PLUS`],
  ['Shopping', '', `PANDORA JEWEL*|PANDORA STORE|SPIRIT HALLOWEEN|DISNEY STORE|SHOPDISNEY|SHOP DISNEY|APPLE STORE|APPLE ONLINE STORE|APPLE COM US|GOOGLE STORE`],
  ['Dining out', '', `SHAW ?S CRAB*|BJ ?S RESTAURANT*|BJ ?S BREWHOUSE|BJ ?S RESTA*`],
  ['Shopping', '', `UNITED STATES POST*|UNITED PARCEL|SALVATION ARMY THRIFT|SALVATION ARMY FAMILY STORE|HABITAT FOR HUMANITY RESTORE`],
  ['Auto maintenance', '', `TIDAL WAVE AUTO*|TIDAL WAVE|LAND ROVER|AAA MEMBERSHIP|AAA|CITY STICKER|VEHICLE STICKER|WHEEL TAX|SECRETARY OF STATE|SOS VEHICLE|IL SOS|CYBERDRIVE|DMV`],

  /* utilities and phone/internet */
  ['Utilities', '', `COMED|COM ED|COMMONWEALTH EDISON|NICOR*|PEOPLES GAS|PEOPLES ENERGY|NORTH SHORE GAS|AMEREN|MIDAMERICAN*|XCEL|CON ED|CONED|CONSOLIDATED EDISON|PSEG|PSE&G|PG ?& ?E|PACIFIC GAS|SO CAL EDISON|SOCAL EDISON|SOUTHERN CALIFORNIA EDISON|SCE|SDG&E|SDGE|SOCALGAS|SOCAL GAS|DUKE ENERGY|DUKEENERGY|DOMINION|DOMINION ENERGY|GEORGIA POWER|ALABAMA POWER|MISSISSIPPI POWER|GULF POWER|FPL|FLORIDA POWER|TECO|TAMPA ELECTRIC|ENTERGY|AEP|APPALACHIAN POWER|OHIO EDISON|FIRSTENERGY|FIRST ENERGY|PECO|PPL|PPL ELECTRIC|BGE|BALTIMORE GAS|PEPCO|DELMARVA|ATLANTIC CITY ELECTRIC|NATIONAL GRID|NATIONALGRID|EVERSOURCE|CENTRAL HUDSON|NYSEG|RG&E|ORANGE & ROCKLAND|DTE|DTE ENERGY|CONSUMERS ENERGY|WE ENERGIES|WEC ENERGY|ALLIANT ENERGY|CENTERPOINT|RELIANT|TXU|ONCOR|AUSTIN ENERGY|CPS ENERGY|SRP|SALT RIVER PROJECT|ARIZONA PUBLIC SERVICE|NV ENERGY|PACIFICORP|ROCKY MOUNTAIN POWER|PUGET SOUND ENERGY|PORTLAND GENERAL|PGE|AVISTA|IDAHO POWER|EVERGY|OG&E|SPIRE|ATMOS|SOUTHWEST GAS|SW GAS|WASHINGTON GAS|COLUMBIA GAS|PIEDMONT NATURAL|VECTREN|BLACK HILLS ENERGY|NIPSCO|CONSTELLATION|DIRECT ENERGY|JUST ENERGY|ARCADIA POWER|
    AMERICAN WATER|AQUA AMERICA|AQUA IL*|AQUA ILLINOIS|ESSENTIAL UTIL*|CAL WATER|CULLIGAN|PRIMO WATER|SPARKLETTS|READYREFRESH|READY REFRESH|DEER PARK WATER|POLAND SPRING|WASTE MANAGEMENT|WM EZPAY|WM CORPORATE|REPUBLIC SERVICES|REPUBLIC SVC*|WASTE CONNECTIONS|GFL|RUMPKE|GROOT|LAKESHORE RECYCLING|
    COMCAST|XFINITY|SPECTRUM|CHARTER COMM*|COX COMM*|COX CABLE|COXCOM|OPTIMUM|ALTICE|SUDDENLINK|MEDIACOM|WOW INTERNET|WIDEOPENWEST|RCN|ASTOUND|WAVE BROADBAND|FRONTIER COMM*|FRONTIER INTERNET|FRONTIER ONLINE|CENTURYLINK|CENTURY LINK|LUMEN|QUANTUM FIBER|WINDSTREAM|GOOGLE FIBER|SONIC NET|ZIPLY|STARLINK|SPACEX|HUGHESNET|VIASAT|EARTHLINK|DIRECTV|DIRECT TV|DISH NETWORK|DISH TV|VERIZON*|VZW|VZ WIRELESS|AT&T|ATT|AT T|T MOBILE|TMOBILE|SPRINT|MINT MOBILE|MINTMOBILE|VISIBLE|CRICKET*|METROPCS|METRO PCS|METRO BY T MOBILE|BOOST MOBILE|BOOSTMOBILE|GOOGLE FI|US CELLULAR|USCELLULAR|CONSUMER CELLULAR|TELLO|TING MOBILE|STRAIGHT TALK|STRAIGHTTALK|TRACFONE|TOTAL WIRELESS|XFINITY MOBILE|SPECTRUM MOBILE|ADT|VIVINT|BRINKS HOME|UTILITY BILL|UTIL BILL|CITY OF CHICAGO UTIL*`],

  /* streaming, software, news */
  ['Subscriptions', '', `NETFLIX|HULU*|DISNEY ?PLUS|DISNEYPLUS|DISNEY STREAMING|DISNEY|ESPN ?PLUS|ESPN|HBO*|HBO MAX|MAX COM|HELP MAX|PARAMOUNT*|PEACOCK*|SPOTIFY*|PANDORA|SIRIUSXM|SIRIUS XM|SIRIUS|TIDAL COM|TIDAL MUSIC|SLING*|FUBO*|PHILO|STARZ|SHOWTIME|BRITBOX|ACORN TV|CRUNCHYROLL|DISCOVERY PLUS|DISCOVERY|SHUDDER|MUBI|CRITERION|CURIOSITYSTREAM|NEBULA|TWITCH*|PATREON*|SUBSTACK|MEDIUM COM|NYTIMES|NY TIMES|NEW YORK TIMES|NYT|WSJ|WALL STREET JOURNAL|DOW JONES|WASHINGTON POST|WASHPOST|WAPO|THE ATHLETIC|ECONOMIST|NEW YORKER|CONDE NAST|THE ATLANTIC|BLOOMBERG|BARRON ?S|CHICAGO TRIBUNE|TRIBUNE|SUN TIMES|SUNTIMES|FINANCIAL TIMES|FT COM|WIRED|AXIOS|POLITICO|ROKU|FRNDLY|
    DROPBOX|BOX COM|MICROSOFT*|MSFT|MICROSOFT OFFICE|MS OFFICE|ADOBE*|CANVA|GRAMMARLY|LASTPASS|ONEPASSWORD|DASHLANE|BITWARDEN|NORDVPN|NORD VPN|EXPRESSVPN|EXPRESS VPN|SURFSHARK|NORTON*|MCAFEE|ZOOM COM|ZOOM US|ZOOM VIDEO|SLACK|NOTION*|EVERNOTE|TODOIST|DUOLINGO|BABBEL|ROSETTA STONE|HEADSPACE|CALM COM|CALM APP|NOOM|WW INTERNATIONAL|WEIGHTWATCHERS|WEIGHT WATCHERS|MYFITNESSPAL|OPENAI|CHATGPT|ANTHROPIC|CLAUDE AI|CLAUDE COM|MIDJOURNEY|PERPLEXITY|GITHUB|SQUARESPACE|SQSP|WIX COM|GODADDY|NAMECHEAP|ANCESTRY*|EXPERIAN|CREDIT KARMA|LIFELOCK|AURA COM|IDENTITY GUARD|RING COM|RING YEARLY|RING MONTHLY|RING PROTECT|SIMPLISAFE|ARLO|WYZE|SCRIBD|EVERAND|BLINKIST|MASTERCLASS|COURSERA|UDEMY|SKILLSHARE|LINKEDIN*|TINDER|BUMBLE|HINGE|MATCH COM|CHEGG|QUIZLET|BRILLIANT ORG|ABCMOUSE|ABC MOUSE|EPIC KIDS|GETEPIC|NOGGIN|PRODIGY|IXL*|MATHSEEDS|READING EGGS|HOMER LEARNING|KIWICO|LOVEVERY|LITERATI`],

  /* restaurants: delivery, coffee, chains */
  ['Dining out', '', `UBER EATS|UBEREATS|UBER EAT*|DOORDASH|DOOR DASH|GRUBHUB|POSTMATES|CAVIAR|SEAMLESS|EZCATER|CHOWNOW|SLICE PIZZA|TOAST TAB|OPENTABLE|RESY|TOCK`],
  ['Coffee', '', `STARBUCKS|STARBUCK|SBUX|DUNKIN*|PEET ?S|CARIBOU*|DUTCH BROS*|TIM HORTON*|BIGGBY|SCOOTER ?S COFFEE|PHILZ|BLUE BOTTLE|INTELLIGENTSIA|LA COLOMBE|COFFEE BEAN|GREGORYS*|BLACK ROCK COFFEE|PJ ?S COFFEE|ZIGGI ?S|HUMAN BEAN|COSTA COFFEE|COLECTIVO|STUMPTOWN|BLUESTONE LANE|JOE & THE JUICE|JOE AND THE JUICE|KUNG FU TEA|GONG CHA|TIGER SUGAR|TEAVANA|ARGO TEA|DAVIDSTEA|DAVID ?S TEA|SHARETEA|CHATIME|HAPPY LEMON|BOBA GUYS|DOLLOP|METRIC COFFEE|SAWADA|DARK MATTER|BEAN & BEAKER|PASSION HOUSE|STAN ?S DONUTS & COFFEE|GLORIA JEAN*|CAFFE NERO|PAVEMENT COFFEE|GREEN BEANERY|THE COFFEE BEAN`],
  ['Dining out', '', `MCDONALD*|MC DONALD*|MCDONALDS|BURGER KING|WENDY ?S|TACO BELL|KFC|KENTUCKY FRIED|POPEYES*|CHICK FIL A|CHICKFILA|CHICK FILA|SUBWAY|JERSEY MIKE*|JIMMY JOHN*|FIREHOUSE SUBS|POTBELLY*|QUIZNOS|ARBY ?S|SONIC DRIVE*|SONIC DR|DAIRY QUEEN|DQ|CULVER ?S|WHATABURGER|IN N OUT|FIVE GUYS|5 GUYS|SHAKE SHACK|SMASHBURGER|STEAK N SHAKE|STEAK N SHAK|STEAK & SHAKE|WHITE CASTLE|JACK IN THE BOX|JACK IN THE|CARL ?S JR|HARDEE ?S|CHECKERS|RALLY ?S|KRYSTAL|DEL TACO|EL POLLO LOCO|QDOBA|CHIPOTLE|MOE ?S SOUTHWEST|MOE ?S SW|BAJA FRESH|TACO CABANA|TACO JOHN ?S|RUBIO ?S|PANDA EXP*|PANDA EXPRESS|P ?F CHANG*|PEI WEI|NOODLES & CO*|NOODLES AND CO*|NOODLES & COMPANY|PANERA*|CORNER BAKERY|AU BON PAIN|COSI|EINSTEIN BRO*|BRUEGGER*|WINGSTOP|BUFFALO WILD*|BWW|WING ZONE|RAISING CANE*|ZAXBY*|BOJANGLES*|CHURCH ?S CHICKEN|BOSTON MARKET|DOMINO ?S|PIZZA HUT|PAPA JOHN*|LITTLE CAESAR*|PAPA MURPHY*|MARCO ?S PIZZA|JET ?S PIZZA|HUNGRY HOWIE*|MOD PIZZA|MODPIZZA|BLAZE PIZZA|PIEOLOGY|SBARRO|CICI ?S|ROUND TABLE PIZZA|MOUNTAIN MIKE*|DONATOS|NANDO ?S|SWEETGREEN|CAVA|CHOPT|SALAD AND GO|TROPICAL SMOOTHIE|SMOOTHIE KING|JAMBA*|ROBEKS|AUNTIE ANNE*|PRETZELMAKER|CINNABON|WETZEL ?S|KRISPY KREME|CRUMBL*|INSOMNIA COOKIES|NOTHING BUNDT*|BASKIN*|COLD STONE*|BEN & JERRY*|BEN AND JERRY*|MENCHIE*|YOGURTLAND|PINKBERRY|RITA ?S ITALIAN|KILWINS|ANDY ?S FROZEN|FREDDY ?S FROZEN|FREDDYS|HABIT BURGER|THE HABIT|BURGERFI|FATBURGER|RED ROBIN|CAPTAIN D*|LONG JOHN SILVER*|JOLLIBEE|BONCHON|KURA SUSHI|KURA REVOLVING|YOSHINOYA|WABA GRILL|POLLO TROPICAL|POLLO CAMPERO|TORCHY ?S|VELVET TACO|TIJUANA FLATS|CHUY ?S|ON THE BORDER|CHEVYS|UNCLE JULIO*|PAPPADEAUX|PAPPASITO*|WAHLBURGERS|BAREBURGER|MENDOCINO FARMS|JASON ?S DELI|MCALISTER*|SCHLOTZSKY*|WHICH WICH|CHARLEYS|PENN STATION|CAPRIOTTI*|PRIMO HOAGIES|COUSINS SUBS|PRET A MANGER|PRET|LE PAIN QUOTIDIEN|PARIS BAGUETTE|TOUS LES JOURS|EATALY|DIG INN|JUST SALAD|CHOPT|DAVE ?S HOT CHICKEN|PORTILLO*|GIORDANO*|LOU MALNATI*|MALNATI*|GINO ?S EAST|PIZZERIA UNO|UNO PIZZ*|UNO CHICAGO|ROSATI*|HOME RUN INN|AL ?S BEEF|AL ?S ITALIAN BEEF|BUONA*|HAROLD ?S CHICKEN|JOHNNIE ?S BEEF|SUPERDAWG|GENE & JUDE*|GARRETT POPCORN|ELI ?S CHEESECAKE|DO RITE|FIRECAKES|DINKEL ?S|FOXTROT|DOM ?S KITCHEN|GODDESS AND THE BAKER|GODDESS & THE BAKER|LETTUCE ENTERTAIN*|RPM ITALIAN|RPM STEAK|RPM SEAFOOD|RPM ON THE WATER|MAPLE & ASH|AU CHEVAL|SMALL CHEVAL|BIG STAR|BANDERA|WILDFIRE|TAVERN ON RUSH|JOE ?S SEAFOOD|JOE ?S STONE CRAB|GIBSONS*|COOPER ?S HAWK|BEATRIX|YOLK|WILDBERRY|WALKER BROS*|EGG HARBOR*|OVER EASY|ANN SATHER|PIZANO ?S|PEQUOD ?S|LOU MITCHELL ?S|
    RED LOBSTER|OLIVE GARD*|APPLEBEE*|CHILI ?S|TGI FRIDAY*|FRIDAYS|OUTBACK*|LONGHORN*|TEXAS ROADH*|CHEESECAKE*|RUBY TUESDAY|DENNY ?S|IHOP|WAFFLE HOUSE|CRACKER BARR*|BOB EVANS|PERKINS|VILLAGE INN|FIRST WATCH|SNOOZE*|ANOTHER BROKEN EGG|ORIGINAL PANCAKE*|LE PEEP|HOOTERS|TWIN PEAKS|YARD HOUSE|CARRABBA*|BONEFISH*|MAGGIANO*|MACARONI GRILL|BERTUCCI*|BRAVO CUCINA|BRIO ITALIAN|BRIO TUSCAN|BUCA DI BEPPO|FAZOLI*|BENIHANA|KONA GRILL|RA SUSHI|RUTH ?S CHRIS|MORTON ?S|FLEMING ?S|CAPITAL GRILLE|DEL FRISCO*|SMITH & WOLLENSKY|MASTRO ?S|STK|FOGO DE CHAO|TEXAS DE BRAZIL|LAWRY ?S|EDDIE V*|CHART HOUSE|JOE ?S CRAB*|BUBBA GUMP|LANDRY ?S|MCCORMICK & SCHMICK*|MCCORMICK SCHMICK*|LEGAL SEA*|GOLDEN CORRAL|O CHARLEY*|LOGAN ?S ROADHOUSE|SALTGRASS|BLACK ANGUS|CLAIM JUMPER|MARIE CALLENDER*|HOULIHAN*|BAR LOUIE|WORLD OF BEER|MILLER ?S ALE*|OLD CHICAGO|ROCK BOTTOM|GORDON BIERSCH|CHEDDAR ?S|HUDDLE HOUSE|FRIENDLY ?S|SHONEY*|BIG BOY|FRISCH*|EMMETT ?S|MITCHELL ?S FISH|FLOWER CHILD|LIME FRESH|HARRY CARAY*|PURPLE PIG|GIRL & THE GOAT|GIRL AND THE GOAT|ALINEA|SMYTH|MONTEVERDE|AVEC|THE PUBLICAN|PUBLICAN|PEQUOD*|PORT OF CALL|PAPA ?S CACHE*`],

  /* groceries */
  ['Groceries', '', `TRADER JOE*|ALDI*|LIDL|KROGER|RALPHS|FRED MEYER|KING SOOPERS|SMITHS FOOD*|SMITH ?S FOOD*|FRY ?S FOOD*|QFC|DILLONS|HARRIS TEETER|MARIANO ?S|MARIANOS|PICK N SAVE|METRO MARKET|FOOD ?LESS|FOOD FOR LESS|CITY MARKET|SAFEWAY|ALBERTSONS|VONS|PAVILIONS|JEWEL OSCO|JEWEL|JEWELOSCO|ACME MARKET*|SHAW ?S|STAR MARKET|TOM THUMB|RANDALLS|CARRS|UNITED SUPERMARKETS|PUBLIX|WEGMANS|H ?E ?B|HEB|CENTRAL MARKET|MEIJER|FOOD LION|GIANT EAGLE|GIANT FOOD*|GIANT|MARTIN ?S SUPER*|MARTINS FOOD*|STOP & SHOP|STOP AND SHOP|HANNAFORD|SHOPRITE|SHOP RITE|PRICE CHOPPER|MARKET BASKET|WINN DIXIE|WINNDIXIE|HARVEYS SUPERMARKET|FRESCO Y MAS|INGLES|BI LO|PIGGLY WIGGLY|HY VEE|HYVEE|FAREWAY|CUB FOODS|SCHNUCKS|DIERBERGS|WINCO|RALEY ?S|BEL AIR MARKET|NOB HILL|SAVE MART|LUCKY SUPERMARKET*|STATER BROS*|SMART & FINAL|SMART AND FINAL|GROCERY OUTLET|SPROUTS|NATURAL GROCERS|FRESH THYME|FRESH MARKET|EARTH FARE|FOOD CITY|WEIS|TOPS MARKET*|TOPS FRIENDLY|BROOKSHIRE*|LOWES FOODS|HARPS|MARSH SUPERMARKET*|STRACK|PETE ?S FRESH*|PETES FRESH|TONY ?S FRESH*|TONY ?S FINER*|CAPUTO ?S|TREASURE ISLAND|SUNSET FOODS|HEINEN ?S|GARDEN FRESH|VALLI PRODUCE|JOONG BOO|PLUM MARKET|STANLEY ?S FRESH*|WOODMAN ?S|FESTIVAL FOODS|SHOP N SAVE|SAVE A LOT|SAVEALOT|FOOD BAZAAR|KEY FOOD|C TOWN|FAIRWAY MARKET|GRISTEDES|D AGOSTINO|MORTON WILLIAMS|SEDANO ?S|NORTHGATE MARKET|VALLARTA SUPERMARKET*|EL SUPER|CARDENAS|FIESTA MART|LA MICHOACANA|H MART|HMART|RANCH MARKET|MITSUWA|PATEL BROTHERS|PATEL BROS|SEAFOOD CITY|UWAJIMAYA|ZABAR ?S|GELSON ?S|BRISTOL FARMS|EREWHON|LAZY ACRES|MOLLIE STONE ?S|ANDRONICO ?S|DRAEGER ?S|DOROTHY LANE|KOWALSKI ?S|LUNDS|BYERLYS|MARKET DISTRICT|COSTCO*|SAMS CLUB|SAM ?S CLUB|SAMSCLUB|SAMS WEST|BJ ?S WHOLESALE|BJ ?S WHSE|BJ ?S CLUB|INSTACART|SHIPT|GOPUFF|GO PUFF|FRESHDIRECT|FRESH DIRECT|PEAPOD|IMPERFECT FOODS|MISFITS MARKET|THRIVE MARKET|HUNGRYROOT|HELLOFRESH|HELLO FRESH|BLUE APRON|HOME CHEF|FACTOR|GREEN CHEF|SUNBASKET|EVERYPLATE|BUTCHERBOX|BUTCHER BOX|DAILY HARVEST|WEEE|BINNY ?S|BEVMO|TOTAL WINE|SPEC ?S|ABC FINE WINE|LIQUOR BARN|DRIZLY|WINE COM|WINC|NAKED WINES|FIRSTLEAF`],

  /* gas, transit, parking, car care */
  ['Fuel and charging', '', `SHELL|SHELL OIL|SHELL SERVICE|EXXON*|MOBIL|EXXONMOBIL|CHEVRON|TEXACO|BP|AMOCO|MARATHON PETRO*|MARATHON GAS|MARATHON OIL|SPEEDWAY|CITGO|SUNOCO|VALERO|ARCO|AMPM|PHILLIPS|CONOCO|CIRCLE K|WAWA|SHEETZ|QUIKTRIP|QT|RACETRAC|RACEWAY|CASEY ?S|CASEYS GEN*|KWIK TRIP|KWIK STAR|KWIK FILL|HOLIDAY STATION*|HOLIDAY STNSTORE*|PILOT|FLYING J|LOVE ?S TRAVEL*|LOVE ?S COUNTRY|TRAVELCENTERS|TA TRAVEL|PETRO STOPPING|BUC EE ?S|BUCEES|THORNTONS|GULF OIL|HESS|GETTY|MAPCO|CUMBERLAND FARMS|STEWART ?S SHOP*|KUM & GO|KUM AND GO|MAVERIK|ROYAL FARMS|SINCLAIR|CLARK OIL|MACH|FAMILY EXPRESS|ELEVEN|SEVEN ELEVEN|SUPERCHARGER|CHARGEPOINT|ELECTRIFY AMERICA|EVGO|EV GO|BLINK CHARGING|VOLTA|EVCS|FLO EV|GREENLOTS|SHELL RECHARGE`],
  ['Transit and rideshare', '', `UBER|LYFT|VIA RIDE*|CURB|VENTRA|CTA|METRA|PACE BUS|MTA|NYCT|OMNY|NJ TRANSIT|NJT|SEPTA|MBTA|WMATA|SMARTRIP|BART FARE|BART TICKET|CLIPPER CARD|CALTRAIN|LA METRO|TAP CARD|MARTA BREEZE|DART TRANSIT|RTD|TRIMET|KING COUNTY METRO|ORCA CARD|SOUND TRANSIT|PATH TRAIN|LIRR|METRO NORTH|DIVVY|CITI BIKE|CITIBIKE|LIME RIDE*|LIMEBIKE|BIRD APP|BIRD RIDES|SPIN SCOOTER|VEO RIDE|BOLT RIDE|ZIPCAR|GETAROUND|WAYMO|YELLOW CAB|CHECKER CAB|FLASH CAB|CURB MOBILITY`],
  ['Parking and tolls', '', `PARKMOBILE|PARK MOBILE|SPOTHERO|SPOT HERO|PARKWHIZ|PAYBYPHONE|PAY BY PHONE|PASSPORT PARKING|LAZ PARKING|LAZ|SP PLUS|SP PARKING|IMPARK|ABM PARKING|PREMIUM PARKING|PARK CHICAGO|PARKCHICAGO|CHICAGO PARKING METER*|INTERPARK|ICON PARKING|DIAMOND PARKING|ACE PARKING|TOWNE PARK|PROPARK|PARK N FLY|PARKING SPOT|WAY COM|HONK MOBILE|I ?PASS|IPASS|IL TOLLWAY|ILLINOIS TOLLWAY|E ?Z ?PASS|EZPASS|SUNPASS|FASTRAK|TXTAG|EZ TAG|NTTA|TOLLTAG|PEACH PASS|GOOD TO GO|PIKEPASS|TURNPIKE|TOLL BY PLATE|TOLLBYPLATE|EXPRESSTOLL|INDIANA TOLL|SKYWAY`],
  ['Auto maintenance', '', `JIFFY LUBE|VALVOLINE|TAKE FIVE|TAKE OIL|GREASE MONKEY|QUICK LANE|FIRESTONE*|GOODYEAR|DISCOUNT TIRE|AMERICA ?S TIRE|TIRE KINGDOM|NTB|BIG O TIRES|LES SCHWAB|MAVIS*|MONRO|PEP BOYS|MIDAS|MEINEKE|PRECISION TUNE|CHRISTIAN BROTHERS AUTO*|CALIBER COLLISION|GERBER COLLISION|MAACO|SAFELITE|AUTOZONE|AUTO ZONE|O ?REILLY*|OREILLY*|ADVANCE AUTO*|NAPA AUTO*|NAPA PARTS|NAPA STORE|CARQUEST|MISTER CAR WASH|TOMMY ?S EXPRESS|ZIPS CAR WASH|QUICK QUACK|DELTA SONIC|AUTOBELL|MODWASH|CLUB CAR WASH|CAR WASH|CARWASH|DMV`],

  /* health, fitness */
  ['Medical', '', `WALGREENS*|WALGREEN|CVS*|RITE AID|DUANE READE|MINUTECLINIC|MINUTE CLINIC|KAISER*|LABCORP|LAB CORP|QUEST DIAG*|QUESTDIAG*|ADVOCATE*|AURORA HEALTH*|NORTHWESTERN MED*|NORTHWESTERN MEMORIAL|NORTHWESTERN LAKE FOREST|NM PHYSICIANS|NMHC|NMG|RUSH UNIV*|RUSH MED*|RUSH OAK PARK|RUSH COPLEY|UCHICAGO MED*|UNIVERSITY OF CHICAGO MED*|UOFC MED*|LURIE*|NORTHSHORE UNIV*|NORTHSHORE HEALTH*|ENDEAVOR HEALTH|LOYOLA MED*|ASCENSION*|AMITA*|EDWARD ELMHURST|EEHEALTH|SILVER CROSS|DULY*|DUPAGE MEDICAL|OAK STREET HEALTH|HOWARD BROWN|ILLINOIS BONE|MIDWEST ORTHO*|ATHLETICO|ATI PHYSICAL|ATI PT|IVY REHAB|SELECT PHYSICAL|UPSTREAM REHAB|NOVACARE|CONCENTRA|PHYSICIANS IMMEDIATE|AFC URGENT*|MEDEXPRESS|GOHEALTH|CITYMD|CITY MD|PM PEDIATRICS|PATIENT FIRST|CARENOW|ZOOMCARE|ONE MEDICAL|ONEMEDICAL|TELADOC|MDLIVE|AMWELL|AMERICAN WELL|DOCTOR ON DEMAND|SESAME CARE|GOODRX|CAPSULE PHARMACY|ALTO PHARMACY|EXPRESS SCRIPTS|OPTUMRX|OPTUM RX|OPTUM|CAREMARK|ACCREDO|HIMS|NURX|KEEPS|ASPEN DENTAL|HEARTLAND DENTAL|PACIFIC DENTAL|WESTERN DENTAL|BRIGHT NOW|SMILE DIRECT|SMILEDIRECT|INVISALIGN|LENSCRAFTERS|PEARLE VISION|PEARLEVISION|WARBY PARKER|WARBYPARKER|VISIONWORKS|AMERICA ?S BEST|MYEYEDR|MY EYE DR|CONTACTS|CONTACTSDIRECT|LENS COM|MIRACLE EAR|BELTONE|MAYO CLINIC|CLEVELAND CLINIC|MYCHART|INSTAMED|PATIENTPAY|PATIENT PAY|HEALTHPAY|ZOTEC|CHANGE HEALTHCARE|PATIENT PORTAL|BILLPAY HEALTH`],
  ['Fitness', '', `FFC|FITNESS FORMULA*|EAST BANK CLUB|MIDTOWN ATHLETIC|MIDTOWN CLUB|LAKESHORE SPORT*|CHICAGO ATHLETIC*|SHRED|STUDIO THREE|PELOTON*|ORANGETHEORY|ORANGE THEORY|OTF|EQUINOX|LIFE ?TIME|LIFETIME FITNESS|PLANET FITNESS|PLANET FIT|PF CLUB|CRUNCH*|LA FITNESS|LAFITNESS|ESPORTA|HOUR FITNESS|ANYTIME FITNESS|GOLD ?S GYM|SNAP FITNESS|CHUZE|EOS FITNESS|BLINK FITNESS|RETRO FITNESS|YMCA|YWCA|JCC|XSPORT*|X SPORT|BALLY TOTAL*|BALLY FITNESS|F TRAINING|BURN BOOT CAMP|CLASSPASS|SOULCYCLE|SOUL CYCLE|FLYWHEEL|CYCLEBAR|PURE BARRE|CLUB PILATES|SOLIDCORE|BARRY ?S|COREPOWER*|CORE POWER|YOGASIX|YOGA SIX|BIKRAM|RUMBLE|TITLE BOXING|STRETCHLAB|STRETCH LAB|ROW HOUSE|XPONENTIAL|MINDBODY*|SPENGA|STRAVA|ZWIFT|WHOOP|OURA|BEACHBODY|APPLE FITNESS|TONAL|HYDROW|IFIT|NORDICTRACK|ALO MOVES|GLO YOGA`],

  /* travel */
  // an airline's ticket line is often just its name and a ticket number: "UNITED 0162345678901"
  ['Travel', '', /^ (?:UNITED|DELTA|SOUTHWEST|SPIRIT|FRONTIER|ALASKA|AMERICAN|JETBLUE|ALLEGIANT)(?: [A-Z]{2})? $/],
  ['Travel', '', `DELTA AIR*|DELTA COM|UNITED AIR*|UNITED COM|AMERICAN AIR*|AA COM|SOUTHWEST AIR*|SOUTHWES|SOUTHWEST COM|JETBLUE|JET BLUE|ALASKA AIR*|SPIRIT AIR*|FRONTIER AIR*|FLYFRONTIER|ALLEGIANT|SUN COUNTRY|HAWAIIAN AIR*|BREEZE AIR*|AVELO|AIR CANADA|BRITISH AIRWAYS|BRITISH AIR|LUFTHANSA|AIR FRANCE|KLM|EMIRATES|QATAR AIR*|ETIHAD|TURKISH AIR*|VIRGIN ATLANTIC|AER LINGUS|IBERIA|ICELANDAIR|COPA AIR*|AEROMEXICO|VOLARIS|WESTJET|ETHIOPIAN AIR*|KENYA AIRWAYS|AIR PEACE|ARIK AIR|ROYAL AIR MAROC|EGYPTAIR|SINGAPORE AIR*|CATHAY|KOREAN AIR|QANTAS|AVIANCA|LATAM|TAP AIR*|SWISS INTL|SAS AIRLINES|
    MARRIOTT*|COURTYARD*|RESIDENCE INN|FAIRFIELD INN|SPRINGHILL*|WESTIN|SHERATON|W HOTEL*|ST REGIS|RITZ CARLTON|RITZ|JW MARRIOTT|RENAISSANCE HOTEL*|ALOFT|ELEMENT HOTEL*|MOXY|AC HOTEL*|FOUR POINTS|LE MERIDIEN|GAYLORD*|HILTON*|HAMPTON INN*|HAMPTON BY HILTON|EMBASSY SUITES|DOUBLETREE|HOMEWOOD SUITES|HOME SUITES|TRU BY HILTON|CONRAD HOTEL*|CONRAD CHICAGO|WALDORF|CURIO|CANOPY|TAPESTRY COLLECTION|HYATT*|ANDAZ|THOMPSON HOTEL*|ALILA|IHG|HOLIDAY INN*|CROWNE PLAZA|INTERCONTINENTAL|KIMPTON|STAYBRIDGE|CANDLEWOOD|HOTEL INDIGO|WYNDHAM|DAYS INN|LA QUINTA|RAMADA|MICROTEL|BAYMONT|TRAVELODGE|HOWARD JOHNSON|WINGATE|HAWTHORN|COMFORT INN|COMFORT SUITES|QUALITY INN|SLEEP INN|CLARION|ECONO LODGE|RODEWAY|MAINSTAY|CAMBRIA|BEST WESTERN|RADISSON|OMNI HOTEL*|OMNI|FAIRMONT|FOUR SEASONS|LOEWS|GRADUATE HOTEL*|ACE HOTEL|SONESTA|RED ROOF|MOTEL|EXTENDED STAY|DRURY|GREAT WOLF*|MGM|CAESARS|WYNN|VENETIAN|BELLAGIO|ATLANTIS|SANDALS|CLUB MED|AULANI|
    EXPEDIA*|BOOKING COM|BKG|HOTELS COM|PRICELINE|KAYAK|ORBITZ|TRAVELOCITY|HOTWIRE|AGODA|TRIP COM|HOPPER|AIRBNB|VRBO|HOMEAWAY|SONDER|VACASA|EVOLVE VACATION|HERTZ|AVIS|BUDGET RENT*|BUDGET CAR|ENTERPRISE RENT*|ENTERPRISE CAR|ENTERPRISE RAC|ENTERPRISE RENTACAR|NATIONAL CAR|NATIONAL RENT*|ALAMO RENT*|ALAMO CAR|ALAMO RAC|GOALAMO|DOLLAR RENT*|DOLLAR CAR|THRIFTY|SIXT|FOX RENT*|PAYLESS CAR|TURO|RENT A CAR|RENTAL CAR|CAR RENTAL|CARNIVAL CRUISE*|CARNIVAL|ROYAL CARIBBEAN|RCCL|NORWEGIAN CRUISE*|NCL|PRINCESS CRUISE*|CELEBRITY CRUISE*|MSC CRUISE*|VIKING CRUISE*|VIKING RIVER|TSA PRE*|TSA PRECHECK|CLEAR ME|CLEARME|CLEAR SECURE|GLOBAL ENTRY|PRIORITY PASS|CENTURION LOUNGE|ADMIRALS CLUB|SKY CLUB|UNITED CLUB|AMTRAK|GREYHOUND|MEGABUS|FLIXBUS|WANDERU|EUROSTAR|TRAINLINE|RAIL EUROPE|ALLIANZ TRAVEL|TRAVEL GUARD|ALLIANZ GLOBAL`],

  /* fun */
  ['Entertainment', '', `AMC|AMC THEATRES|REGAL*|CINEMARK|MARCUS THEATRE*|MARCUS THEATER*|ALAMO DRAFTHOUSE|HARKINS|SHOWCASE CINEMA*|LANDMARK THEAT*|STUDIO MOVIE GRILL|IPIC|FANDANGO*|ATOM TICKETS|TICKETMASTER|TICKETMSTR|LIVE NATION|LIVENATION|STUBHUB|SEATGEEK|VIVID SEATS|AXS|EVENTBRITE|TODAYTIX|GOLDSTAR|TIXR|DICE FM|ETIX|SEE TICKETS|BROADWAY IN CHICAGO|STEPPENWOLF|GOODMAN THEATRE|LYRIC OPERA|CHICAGO SYMPHONY|CSO|JOFFREY|SECOND CITY|CHUCK E CHEESE|MAIN EVENT|ROUND ONE|ROUNDONE|ROUND BOWLING|LUCKY STRIKE|BOWLERO|AMF|URBAN AIR|SKY ZONE|ALTITUDE TRAMPOLINE|IFLY|SIX FLAGS|CEDAR FAIR|CEDAR POINT|KINGS ISLAND|UNIVERSAL STUDIOS|UNIVERSAL ORLANDO|SEAWORLD|BUSCH GARDENS|LEGOLAND|FIELD MUSEUM|SHEDD AQUARIUM|ART INSTITUTE*|MUSEUM OF SCIENCE*|MSI CHICAGO|LINCOLN PARK ZOO|BROOKFIELD ZOO|ADLER PLANETARIUM|NAVY PIER|CHICAGO CHILDREN ?S MUSEUM|KOHL CHILDREN ?S|MORTON ARBORETUM|CHICAGO BOTANIC|DRAFTKINGS|FANDUEL|BETMGM|CAESARS SPORTSBOOK|LOTTERY|ILLINOIS LOTTERY|MLB|NBA|NFL|NHL|MLS|CUBS|WHITE SOX|CHICAGO BEARS|CHICAGO BULLS|BLACKHAWKS|CHICAGO FIRE|CHICAGO SKY|WRIGLEY FIELD|SOLDIER FIELD|GUARANTEED RATE FIELD|RATE FIELD|VUDU|PAINTING WITH A TWIST|PINOT ?S PALETTE|ESCAPE ROOM*`],

  /* pets, personal care, family */
  ['Pets', '', `CHEWY*|PETCO*|PETSMART|PET SMART|PET SUPPLIES PLUS|PETLAND|PET VALU|BANFIELD|VCA*|BLUEPEARL|BLUE PEARL|ROVER|WAG LABS|WAGWALKING|BARKBOX|BARK CO|FARMER ?S DOG|THEFARMERSDOG|OLLIE PETS|MYOLLIE|NOM NOM|DOGTOPIA|CAMP BOW WOW|WOOF GANG|PETSUITES|PET SUITES|MUD BAY|PET PEOPLE|PET FOOD EXPRESS|PET SUPERMARKET|PETMEDS|HOLLYWOOD FEED|PET WANT ?S|BENTLEY ?S PET*`],
  ['Personal care', '', `SUPERCUTS|GREAT CLIPS|SPORT CLIPS|FANTASTIC SAMS|COST CUTTERS|HAIR CUTTERY|REGIS SALON*|SMARTSTYLE|FLOYD ?S|DRYBAR|ULTA*|SEPHORA|SALLY BEAUTY|EUROPEAN WAX*|MASSAGE ENVY|HAND & STONE|HAND AND STONE|ELEMENTS MASSAGE|MASSAGE HEIGHTS|HEYDAY|BENEFIT BROW*|AMAZING LASH*|HOLLYWOOD TANS|PALM BEACH TAN*|GLOSSIER|FENTY|DOLLAR SHAVE*|HARRYS COM|HARRY ?S RAZOR*|FUNCTION OF BEAUTY|PROSE HAIR|CUROLOGY|MEETBILLIE|BILLIE COM|MADISON REED|BIRCHBOX|IPSY|BOXYCHARM|LUSH COSMETICS|LUSH FRESH*|LUSH HANDMADE|LUSHUSA|KIEHL ?S|MAC COSMETICS|BATH & BODY WORKS|BATH AND BODY WORKS|BATH & BODY|BLUEMERCURY|ORANGETWIST|SKIN LAUNDRY|BLO BLOW DRY`],
  ['Childcare', '', `KINDERCARE|BRIGHT HORIZONS|GODDARD SCHOOL|PRIMROSE*|LA PETITE ACADEMY|LEARNING EXPERIENCE|KIDDIE ACADEMY|CHILDRENS LEARNING ADVENTURE|TUTOR TIME|LIGHTBRIDGE ACADEMY|LITTLE SPROUTS|CHILDTIME|KIDS R KIDS|CREATIVE WORLD|CARE COM|SITTERCITY|URBANSITTER|BRIGHTWHEEL|PROCARE*|TADPOLES|KANGAROOTIME|KIDDIE KOLLEGE|MOTHERS DAY OUT`],
  ['Kids activities', '', `KUMON|MATHNASIUM|SYLVAN LEARNING|SYLVAN|HUNTINGTON LEARNING|CODE NINJAS|GOLDFISH SWIM*|BRITISH SWIM*|SAFESPLASH|AQUA TOTS|BIG BLUE SWIM|LITTLE GYM|MY GYM|GYMBOREE PLAY|KIDVILLE|MUSIC TOGETHER|SCHOOL OF ROCK|BACH TO ROCK|YOUNG REMBRANDTS|ABRAKADOODLE|SNAPOLOGY|ENGINEERING FOR KIDS|I SPORTS|SUPER SOCCER STARS|LIL KICKERS|SOCCER SHOTS|LITTLE LEAGUE|AYSO|POP WARNER|GIRL SCOUTS|BOY SCOUTS|SCOUTING AMERICA|KIDSTRONG|MAD SCIENCE|CHICAGO PARK DISTRICT|PARK DISTRICT|PARKS & REC*|PARKS AND REC*|JACKRABBIT*|JACKRABBITCLASS|HISAWYER|SAWYER TECH*|ACTIVITYHERO|CAMPMINDER|CAMPBRAIN|ULTRACAMP|CAMPSITE|TEAMSNAP|SPORTSENGINE|SPORTS ENGINE|LEAGUEAPPS|GAMECHANGER|STACK SPORTS|OUTSCHOOL|VARSITY TUTORS|WYZANT|ID TECH|STEAMOJI|BRICKS ?KIDZ|PLAYWELL|OLD TOWN SCHOOL*|MERIT SCHOOL OF MUSIC`],
  ['School', '', `SCHOLASTIC|MYSCHOOLBUCKS|MY SCHOOL BUCKS|SCHOOLPAY|SCHOOL PAY|REVTRAK|PAYPAMS|EZSCHOOLPAY|SCHOOLCASH|SCHOOL CASH|LINQ CONNECT|LINQCONNECT|K PAYMENT|INFINITE CAMPUS|POWERSCHOOL|SCHOOL MESSENGER|TUITION*|NELNET CAMPUS|FACTS MGMT|FACTS TUITION|SMART TUITION|BLACKBAUD TUITION|FLYWIRE|TRANSACT CAMPUS|TOUCHNET|CASHNET|COLLEGE BOARD|COLLEGEBOARD|ACT INC|PEARSON|MCGRAW HILL|CENGAGE|NORTHWESTERN UNIV*|LOYOLA UNIV*|DEPAUL*|UNIV OF CHICAGO|UNIVERSITY OF CHICAGO|UIC|UIUC|UNIVERSITY OF ILLINOIS`],

  /* home */
  ['Home maintenance', '', `HOME DEPOT|HOMEDEPOT|THE HOME DEPOT|LOWE ?S|LOWES|MENARDS|ACE HARDWARE|ACE HDWE|TRUE VALUE|DO IT BEST|SHERWIN*|BENJAMIN MOORE|PPG PAINTS|FLOOR & DECOR|FLOOR AND DECOR|LL FLOORING|LUMBER LIQUIDATORS|LUMBER|HARBOR FREIGHT|NORTHERN TOOL|TRACTOR SUPPLY|ANGI|ANGIE ?S|ANGIES LIST|HOMEADVISOR|THUMBTACK|TASKRABBIT|HANDY|TERMINIX|ORKIN|RENTOKIL|APTIVE|ROTO ROOTER|ROTOROOTER|MR ROOTER|MR HANDYMAN|MR ELECTRIC|BENJAMIN FRANKLIN PLUMB*|ONE HOUR HEATING|ARS RESCUE|MOLLY MAID|MERRY MAIDS|THE MAIDS|TRUGREEN|LAWN DOCTOR|WEED MAN|BRIGHTVIEW|SAVATREE|DAVEY TREE|BARTLETT TREE|SERVICEMASTER|SERVPRO|STANLEY STEEMER|CHEM DRY|SEARS HOME|AMERICAN HOME SHIELD|CHOICE HOME WARRANTY|FRONTDOOR|FIRST AMERICAN HOME|HOMESERVE|SUNRUN|TESLA ENERGY|KINETICO|RAINSOFT|COMED HOME|ABC HOME`],
  ['Gifts', '', `FLOWERS|FTD|TELEFLORA|PROFLOWERS|EDIBLE ARRANGEMENT*|HARRY & DAVID|HARRY AND DAVID|SHARI ?S BERRIES|HALLMARK*|THINGS REMEMBERED|PERSONALIZATION MALL|UNCOMMON GOODS|UNCOMMONGOODS|MINTED|PAPER SOURCE|CAMEO|GIFT CARD*|GIFTCARD*|GIFTLY|GIFTS COM`],

  /* stores (last: broadest) */
  ['Shopping', '', `AMAZON*|AMZN*|AMAZON COM|AMAZON MKTPL*|AMZN MKTP*|AMAZON MARKETPLACE|AMAZON RETA*|TARGET|TARGET COM|WALMART*|WAL MART|WM SUPERCENTER|WM SUPERC*|WMT|BEST BUY|BESTBUY|HOMEGOODS|HOME GOODS|TJ ?MAXX|TJMAXX|T J MAXX|MARSHALLS|ROSS STORES|ROSS DRESS*|BURLINGTON*|NORDSTROM*|MACY ?S|MACYS COM|KOHL ?S|JCPENNEY|JC PENNEY|DILLARD ?S|BELK|NEIMAN MARCUS|SAKS*|BLOOMINGDALE ?S|VON MAUR|ETSY*|EBAY*|IKEA|WAYFAIR|OVERSTOCK|CRATE & BARREL|CRATE AND BARREL|CRATE BARREL|POTTERY BARN*|WEST ELM|WILLIAMS SONOMA|RESTORATION HARDWARE|RH GALLERY|RH COM|ARHAUS|ROOM & BOARD|ARTICLE COM|PIER IMPORTS|PIER ONE|KIRKLAND ?S|AT HOME|BED BATH*|CONTAINER STORE|WORLD MARKET|COST PLUS|MICHAELS*|HOBBY LOBBY|JO ANN*|JOANN*|PARTY CITY|DOLLAR TREE|DOLLAR GENERAL|FAMILY DOLLAR|FIVE BELOW|BIG LOTS|OLLIE ?S BARGAIN|TUESDAY MORNING|OLD NAVY|GAP|GAP KIDS|BANANA REPUBLIC|ATHLETA|J ?CREW|MADEWELL|ABERCROMBIE*|HOLLISTER|AMERICAN EAGLE|AE OUTFITTERS|AERIE|EXPRESS STORE|EXPRESS COM|EXPRESS FACTORY|ANN TAYLOR|LOFT STORE|LOFT OUTLET|LOFT COM|TALBOTS|CHICO ?S|WHITE HOUSE BLACK*|H&M|H & M|ZARA|UNIQLO|URBAN OUTFITTERS|ANTHROPOLOGIE|FREE PEOPLE|LULULEMON|NIKE*|ADIDAS|UNDER ARMOUR|PUMA|NEW BALANCE|FOOT LOCKER|FOOTLOCKER|KIDS FOOT LOCKER|FINISH LINE|CHAMPS SPORTS|DSW*|FAMOUS FOOTWEAR|SKECHERS|VANS|CONVERSE|ALLBIRDS|HOKA|ZAPPOS|CARTER ?S|OSHKOSH|CHILDREN ?S PLACE|CHILDRENS PLACE|GYMBOREE|JANIE AND JACK|HANNA ANDERSSON|PRIMARY COM|TEA COLLECTION|BUYBUY BABY|DICK ?S SPORTING*|DICKS SPORTING*|ACADEMY SPORTS|BIG FIVE|SCHEELS|BASS PRO*|CABELA ?S|REI|PATAGONIA|NORTH FACE|COLUMBIA SPORTSWEAR|L ?L ?BEAN|LANDS ?END|EDDIE BAUER|STAPLES|OFFICE DEPOT|OFFICEMAX|BARNES & NOBLE|BARNES AND NOBLE|BARNES NOBLE|BOOKS A MILLION|HALF PRICE BOOKS|GAMESTOP|SAMSUNG|DELL COM|DELL INC|DELL MARKETING|LENOVO|MICRO CENTER|B&H PHOTO|B & H PHOTO|ADORAMA|NEWEGG|SWEETWATER|GUITAR CENTER|SHEIN|TEMU|ALIEXPRESS|WISH COM|POSHMARK|THREDUP|DEPOP|MERCARI|THE REALREAL|REALREAL|RENT THE RUNWAY|STITCH FIX|STITCHFIX|VICTORIA ?S SECRET|BROOKSTONE|SHARPER IMAGE|LEGO*|BUILD A BEAR|TOYS R US|LEARNING EXPRESS|MATTRESS FIRM|PURPLE INNOVATION|PURPLE COM|CASPER SLEEP|CASPER COM|TEMPUR*|SLEEP NUMBER|ASHLEY FURNITURE|ASHLEY HOMESTORE|RAYMOUR*|BOB ?S DISCOUNT|ROOMS TO GO|LA Z BOY|ETHAN ALLEN|HAVERTYS|LIVING SPACES|VALUE CITY|KAY JEWELERS|ZALES|JARED THE GALLERIA|JARED JEWEL*|JARED GALLERIA|TIFFANY*|BLUE NILE|BRILLIANT EARTH|MEJURI|GOODWILL|SAVERS|PLATO ?S CLOSET|BUFFALO EXCHANGE|NORDSTROM RACK|SAKS OFF|OFF FIFTH|SIERRA TRADING|THE UPS STORE|UPS STORE|USPS|FEDEX OFFICE|SHUTTERFLY|SNAPFISH|CVS PHOTO|APPLE COM|BACKMARKET|BACK MARKET|BEST BUY COM|CHEWY COM|GOOGLE STORE|MICROSOFT STORE|SPIRIT HALLOWEEN|HALLOWEEN CITY`],
];

/* Words for local places that aren't on any list. Checked after the merchant list, merchant codes and bank categories. */
const NAME_WORDS = [
  ['Charitable giving', '', `DONAT*|CHARIT*|CHURCH|PARISH|MINISTRY|MINISTRIES|MOSQUE|MASJID|SYNAGOGUE|CONGREGATION|DIOCESE|ARCHDIOCESE|TITHE*|FOUNDATION(?! REPAIR| ROOM)|FDN`],
  ['Pets', '', `VET|VETS|VETERINAR*|ANIMAL HOSPITAL|ANIMAL CLINIC|ANIMAL MEDICAL|ANIMAL CARE|PET|PETS|PET SUPPLY|PET SUPPLIES|PET FOOD|PET HOSPITAL|PET CLINIC|PET RESORT|PET SPA|DOG TRAINING|DOG GROOMING|DOG WALKING|DOG DAYCARE|DOG BOARDING|DOG WASH|DOG SPA|DOG BAKERY|DOGGY|DOGGIE|PUPPY|CANINE|FELINE|KENNEL*|PET GROOMING|DOGWALKER`],
  ['Personal care', '', `SALON*|BARBER*|BARBERSHOP|BARBERS|HAIR*|HAIRCUT*|STYLIST|NAIL|NAILS|SPA|DAY SPA|MED SPA|MEDSPA|MASSAGE|WAX|WAXING|BROW|BROWS|LASH|LASHES|BEAUTY|COSMETIC*|SKIN CARE|SKINCARE|ESTHETIC*|AESTHETIC*|TANNING|DRY CLEAN*|DRYCLEAN*|CLEANERS|LAUNDRY|LAUNDROMAT|LAUNDRYMAT|WASH & FOLD|TAILOR*|ALTERATION*|SHOE REPAIR|COBBLER|PIERCING|TATTOO*|THREADING|BLOWOUT|GROOMING LOUNGE|BRAIDS|BRAIDING|LOCS`],
  ['Home maintenance', '', `HARDWARE|LUMBER|HOME CENTER|HOME IMPROVEMENT|HOME REPAIR|HOME SERVICES|HOME SERVICE|HOME WARRANTY|HOME INSPECTION|PLUMB*|ROOTER|DRAIN|SEPTIC|HEATING|COOLING|AIR CONDITIONING|HVAC|FURNACE|ELECTRICAL|ELECTRICIAN*|ROOFING|ROOFER*|GUTTER*|SIDING|WINDOWS|WINDOW|DOORS|GARAGE DOOR*|LOCKSMITH*|LANDSCAP*|LAWN*|TREE SERVICE|TREE CARE|ARBORIST|SNOW REMOVAL|SNOW PLOW*|IRRIGATION|SPRINKLER*|PEST|PEST CONTROL|EXTERMINAT*|TERMITE*|MAID|MAIDS|HOUSEKEEPING|HOUSE CLEANING|CLEANING SERVICE*|CLEANING CO*|HOME CLEANING|CARPET*|FLOORING|FLOORS|TILE|PAINT|PAINTS|PAINTING|PAINTER*|DRYWALL|CONTRACTOR*|CONSTRUCTION|REMODEL*|RENOVATION*|BUILDER*|BUILDING SUPPLY|HANDYMAN|APPLIANCE*|CHIMNEY|FIREPLACE|POOL SERVICE|POOL & SPA|FENCE|FENCING|MASONRY|CONCRETE|PAVING|ASPHALT|INSULATION|WATERPROOFING|BASEMENT*|FOUNDATION REPAIR|GARDEN CENTER|NURSERY & GARDEN|GREENHOUSE`],
  ['Coffee', '', `COFFEE*|COFFEEHOUSE|ESPRESSO|ROASTER*|ROASTING|ROASTERY|TEA HOUSE|TEAHOUSE|TEA BAR|TEA SHOP|BOBA|BUBBLE TEA|MILK TEA|TEA`],
  ['Dining out', '', `RESTAURANT*|RESTAURANTE|RISTORANTE|TRATTORIA|OSTERIA|PIZZERIA|PIZZA*|PIZZE|GRILL|GRILLE|GRILLHOUSE|BISTRO|BRASSERIE|CAFE|CAFFE|CAFETERIA|DINER|EATERY|EATS|KITCHEN|TAVERN|PUB|GASTROPUB|TAPROOM|TAP ROOM|TAPHOUSE|ALEHOUSE|ALE HOUSE|BREWERY|BREWERIES|BREWING|BREWPUB|BREWHOUSE|SALOON|CANTINA|TAQUERIA|TAQUERIAS|TACO|TACOS|BURRITO*|TAMALE*|GYRO*|KABOB*|KEBAB*|SHAWARMA|FALAFEL|MEDITERRANEAN|SUSHI|RAMEN|PHO|NOODLE*|DUMPLING*|DIM SUM|BAO|TERIYAKI|HIBACHI|IZAKAYA|YAKITORI|POKE|THAI|VIETNAMESE|CHINESE|SZECHUAN|SICHUAN|HUNAN|CANTONESE|KOREAN|JAPANESE|ITALIAN|MEXICAN|INDIAN CUISINE|ETHIOPIAN|NIGERIAN|CARIBBEAN|JAMAICAN|CUBAN|PERUVIAN|GREEK|LEBANESE|PERSIAN|TURKISH|BBQ|BAR B Q|BARBECUE|BARBEQUE|SMOKEHOUSE|STEAKHOUSE|STEAK HOUSE|STEAKS|CHOPHOUSE|SEAFOOD|OYSTER*|CRAB|CRABHOUSE|LOBSTER|FISH FRY|WINGS|BURGER*|HOT DOG*|HOTDOG*|BEEF|SUBS|HOAGIE*|SANDWICH*|DELI|DELICATESSEN|BAGEL*|BAKERY|BAKERIES|BAKE SHOP|BAKESHOP|BAKEHOUSE|PATISSERIE|BOULANGERIE|PASTRY|PASTRIES|DONUT*|DOUGHNUT*|CUPCAKE*|CREPE*|CREPERIE|GELATO|GELATERIA|ICE CREAM|CREAMERY|FROZEN YOGURT|FROYO|CUSTARD|SMOOTHIE*|JUICE BAR|JUICERY|PANCAKE*|WAFFLE*|BRUNCH|BREAKFAST|CHICKEN|ROTISSERIE|CURRY|TANDOOR*|BIRYANI|MASALA|CUISINE|BUFFET|CATERING|CATERER*|FOOD TRUCK|FOOD HALL|FOOD COURT|FAST FOOD|SOUL FOOD|JERK|SUYA|EMPANADA*|AREPA*|PUPUSA*|CEVICHE*|TAPAS|PAELLA|PIEROGI|SCHNITZEL|BIERGARTEN|BEER GARDEN|BEER HALL|WINE BAR|WINEBAR|COCKTAIL*|LOUNGE|SPORTS BAR|NIGHTCLUB|SUPPER CLUB|ROADHOUSE|WOK|CHOP SUEY|POPCORN|CHOCOLATIER|CONFECTION*|CANDY`],
  ['Groceries', '', `GROCER*|GROCERIES|SUPERMARKET*|SUPERMERCADO|MERCADO|CARNICERIA|BUTCHER*|MEATS|MEAT MARKET|PRODUCE|FARMERS MARKET|FARM STAND|FOOD MART|FOODMART|FOODS|FOOD STORE|FOOD CENTER|FOOD MARKET|FRESH MARKET|MARKET|MARKETS|LIQUOR*|WINE & SPIRITS|WINE AND SPIRITS|SPIRITS|BEER & WINE|WINE SHOP|CO OP|BODEGA|ORGANIC*`],
  ['Fitness', '', `GYM|GYMS|FITNESS|FIT|YOGA|PILATES|BARRE|CROSSFIT|CROSS FIT|BOXING|KICKBOXING|SPIN|SPINNING|CYCLING STUDIO|BOOTCAMP|BOOT CAMP|ATHLETIC CLUB|ATHLETIC CLUBS|HEALTH CLUB|RACQUET*|TENNIS|PICKLEBALL|CLIMBING|BOULDERING|ROCK GYM|STRENGTH|CONDITIONING|PERSONAL TRAIN*|TRAINING STUDIO|REC CENTER|RECREATION CENTER|AQUATIC*|ROWING`],
  ['Utilities', '', `ELECTRIC|ELECTRICITY|ENERGY|POWER & LIGHT|POWER AND LIGHT|LIGHT & POWER|LIGHT AND POWER|POWER CO*|POWER COMPANY|PUBLIC SERVICE|PUBLIC UTIL*|UTILITY|UTILITIES|UTIL|NATURAL GAS|GAS CO|GAS COMPANY|GAS & ELECTRIC|GAS AND ELECTRIC|GAS SERVICE|GAS UTIL*|GAS BILL|WATER DEPT|WATER DEPARTMENT|WATER DIST*|WATER UTIL*|WATER & SEWER|WATER AND SEWER|WATER SEWER|WATER BILL|WATER WORKS|WATERWORKS|WATER COMPANY|WATER CO|WATER AUTHORITY|SEWER|SANITATION|SANITARY|TRASH|REFUSE|RECYCLING|WASTE|DISPOSAL|TELECOM*|WIRELESS|CELLULAR|BROADBAND|INTERNET|FIBER|CABLE|CABLEVISION|PROPANE|HEATING OIL|FUEL OIL`],
  ['Fuel and charging', '', `GAS STATION|GAS STN|GAS MART|GAS N GO|GAS & GO|GAS AND GO|GAS & FOOD|GAS & WASH|GAS|GASOLINE|FUEL*|FUELS|PETRO|PETROLEUM|OIL CO|TRAVEL PLAZA|TRAVEL CENTER|TRUCK STOP|EV CHARGING|EV CHARGE|CHARGING`],
  ['Parking and tolls', '', `PARKING|PARK & RIDE|PARK N RIDE|PARK N FLY|PARK N GO|TOLL|TOLLS|TOLLWAY|TOLL ROAD|TOLLROAD|TURNPIKE|PARKING GARAGE|PARKING LOT|VALET`],
  ['Auto maintenance', '', `AUTOMOTIVE|AUTO REPAIR|AUTO BODY|AUTOBODY|AUTO PARTS|AUTO CARE|AUTO SERVICE*|AUTO CENTER|AUTO SPA|AUTO WASH|AUTO GLASS|AUTO DETAIL*|BODY SHOP|COLLISION|TIRE|TIRES|LUBE|OIL CHANGE|QUICK LUBE|CAR WASH|CARWASH|CAR CARE|MUFFLER*|BRAKE*|TRANSMISSION*|TOWING|TOW|SMOG|EMISSIONS|DETAILING|MECHANIC*|GARAGE|MOTORS|VEHICLE`],
  ['Transit and rideshare', '', `TAXI*|TAXICAB|CAB CO*|CAB COMPANY|LIMO|LIMOUSINE|TRANSIT|RAILWAY|RAILROAD|COMMUTER|BUS|SHUTTLE|SCOOTER*|BIKE SHARE|BIKESHARE|RIDESHARE|FERRY`],
  ['Travel', '', `HOTEL*|MOTEL*|RESORT*|SUITES|INN & SUITES|INN AND SUITES|BED & BREAKFAST|BED AND BREAKFAST|HOSTEL|LODGING|VACATION*|AIRLINE*|AIRWAYS|AIR LINES|AIRPORT*|AIRFARE|CRUISE*|TRAVEL|TRAVELS|TOURS|TOUR|EXCURSION*|CAR RENTAL|RENT A CAR|RENTAL CAR|DUTY FREE`],
  ['Mortgage or rent', 'out', `RENT|RENTS|APARTMENTS|APARTMENT|PROPERTIES|LEASING|LEASING OFFICE|REALTY`],
  ['Property tax', 'out', `PROPERTY TAX*|REAL ESTATE TAX*`],
  ['Medical', '', `PHARMACY|PHARMACIES|PHARMA|DRUG STORE|DRUGSTORE|DRUGS|DRUG MART|APOTHECARY|RX|CLINIC*|HOSPITAL*|MEDICAL|MEDICINE|MED CTR|MED CENTER|MED GROUP|MEDICAL GROUP|HEALTHCARE|HEALTH CARE|HEALTH SYSTEM|HEALTH CENTER|HEALTH SERVICES|DENTAL|DENTIST*|DENTISTRY|DDS|DMD|ORTHODONT*|ENDODONT*|PERIODONT*|ORAL SURGERY|PEDIATRIC*|DERMATOLOG*|DERM|CHIROPRACT*|PHYSICAL THERAP*|PHYSIOTHERAPY|OCCUPATIONAL THERAPY|SPEECH THERAPY|THERAPY|THERAPIST*|COUNSELING|COUNSELLING|PSYCHIATR*|PSYCHOLOG*|BEHAVIORAL|OPTOMETR*|OPTICAL|OPTICIAN*|EYE CARE|EYECARE|EYE CENTER|EYE ASSOC*|VISION CENTER|VISION CARE|EYEWEAR|OPHTHALM*|ORTHOPED*|ORTHOPAED*|CARDIOLOG*|RADIOLOG*|IMAGING|LABORATOR*|PATHOLOGY|URGENT CARE|URGENTCARE|IMMEDIATE CARE|PHYSICIAN*|DOCTOR*|SURGERY|SURGICAL|SURGEON*|SURGICENTER|ANESTHES*|OBGYN|OB GYN|GYNECOLOG*|OBSTETRIC*|WOMENS HEALTH|WOMEN S HEALTH|FAMILY MEDICINE|FAMILY PRACTICE|INTERNAL MEDICINE|ALLERG*|AUDIOLOG*|HEARING|PODIATR*|ONCOLOG*|UROLOG*|GASTROENTEROLOG*|NEUROLOG*|PULMONAR*|ENDOCRIN*|NEPHROLOG*|RHEUMATOLOG*|MIDWIFE*|MIDWIFERY|BIRTH CENTER|LACTATION|ACUPUNCTURE|NATUROPATH*`],
  ['Childcare', '', `DAYCARE|DAY CARE|CHILDCARE|CHILD CARE|CHILD DEVELOPMENT|PRESCHOOL|PRE SCHOOL|PREK|PRE K|NURSERY SCHOOL|EARLY LEARNING|EARLY CHILDHOOD|LEARNING CENTER|MONTESSORI|NANNY|NANNIES|BABYSIT*|SITTER*|AU PAIR|AFTERCARE|AFTER CARE|AFTER SCHOOL|AFTERSCHOOL|BEFORE SCHOOL|EXTENDED DAY|TODDLER*|INFANT*`],
  ['Kids activities', '', `KIDS|KID S|KIDZ|CHILDRENS|CHILDREN S|YOUTH|SOCCER|FUTBOL|BASEBALL|SOFTBALL|BASKETBALL|FOOTBALL|LACROSSE|VOLLEYBALL|HOCKEY|SKATING|FIGURE SKATING|GYMNASTIC*|TUMBLING|CHEER|CHEERLEADING|DANCE*|BALLET|SWIM*|KARATE|TAEKWONDO|TAE KWON DO|JIU JITSU|JUJITSU|JUDO|MARTIAL ARTS|MARTIAL ART|NINJA*|CAMP|CAMPS|DAY CAMP|SUMMER CAMP|TUTOR*|TUTORING|LEARNING|ENRICHMENT|PIANO|VIOLIN|MUSIC LESSON*|MUSIC SCHOOL|MUSIC ACADEMY|MUSIC STUDIO|LESSONS|ART CLASS*|ART STUDIO|CERAMICS|CHESS|ROBOTICS|CODING|STEM|SCOUT*|LEAGUE|LEAGUES|SPORTS ACADEMY|SPORTS CLUB|PARK DIST*|RECREATION DEPT|REC DEPT`],
  ['School', '', `SCHOOL|SCHOOLS|SCHOOL DIST*|ELEMENTARY|JUNIOR HIGH|HIGH SCHOOL|MIDDLE SCHOOL|ACADEMY|UNIVERSITY|UNIV|COLLEGE|COLLEGES|TUITION|REGISTRAR|BURSAR|STUDENT ACCOUNT*|CAMPUS|PTA|PTO|PTSA|YEARBOOK|SCHOOL LUNCH|LUNCH ACCOUNT`],
  ['Entertainment', '', `THEATER*|THEATRE*|CINEMA*|CINEPLEX|MOVIES|MOVIE|IMAX|MUSEUM*|ZOO|ZOOLOGICAL|AQUARIUM|PLANETARIUM|ARBORETUM|BOTANIC*|BOWLING|LANES|ARCADE|AMUSEMENT*|FUN CENTER|FUNPLEX|FAMILY FUN|TRAMPOLINE|ESCAPE ROOM*|LASER TAG|GO KART*|MINI GOLF|MINIGOLF|PUTT PUTT|GOLF|GOLF CLUB|COUNTRY CLUB|CONCERT*|TICKET*|TIX|BOX OFFICE|STADIUM|ARENA|BALLPARK|FIELDHOUSE|AMPHITHEATER|AMPHITHEATRE|KARAOKE|CASINO|LOTTERY|LOTTO|ICE RINK|ROLLER RINK|WATER PARK|WATERPARK|THEME PARK|SYMPHONY|ORCHESTRA|OPERA|PHILHARMONIC|PLAYHOUSE|COMEDY|IMPROV|CIRCUS|FESTIVAL|EXHIBIT*|BILLIARDS|POOL HALL|PAINTBALL|AXE THROWING|RECORDS|VINYL`],
  ['Gifts', '', `FLORIST*|FLOWER*|FLORAL|GIFT CARD*|GIFTCARD*|GIFTS|GIFT|GIFT SHOP`],
  ['Subscriptions', '', `SUBSCRIPTION*|SUBSCRIBE|STREAMING`],
  ['Shopping', '', `BOUTIQUE|OUTLET*|MALL|DEPT STORE|DEPARTMENT STORE|CLOTHING|CLOTHIER*|APPAREL|SHOES|SHOE|FOOTWEAR|JEWELRY|JEWELERS|JEWELER|JEWELLERS|BOOKS|BOOKSTORE|BOOKSHOP|BOOKSELLER*|TOYS|TOY|FURNITURE|MATTRESS*|DECOR|HOME DECOR|HOMEGOODS|ELECTRONICS|COMPUTER*|CAMERA*|SPORTING GOODS|OUTFITTER*|HOBBY|HOBBIES|CRAFT*|FABRIC*|YARN|THRIFT|RESALE|CONSIGNMENT|VINTAGE|ANTIQUE*|SHOP|SHOPS|STORE|STORES|EMPORIUM|MERCANTILE|SUPPLY|SUPPLIES|GOODS|WAREHOUSE|DEPOT|MART|BAZAAR`],
];

/* Payment processors visible in the raw description (before Ọrọ̀ cleans it) */
const PROCESSOR_HINTS = [
  [/^\s*TST\s?\*/i, 'Dining out'],          // Toast: restaurants, bars, cafés
  [/^\s*(DD|DOORDASH)\s?\*/i, 'Dining out'],
  [/\b(CHOWNOW|OLO|TOCK|BBOT|SLICE)\s?\*/i, 'Dining out'],
  [/^\s*IC\s?\*/i, 'Groceries'],            // Instacart
  [/^\s*EB\s?\*/i, 'Entertainment'],        // Eventbrite
  [/^\s*(SP|SHOPIFY)\s?\*/i, 'Shopping'],   // Shopify stores
];

/* Merchant category codes (ISO 18245), as sent in an OFX/QFX <SIC> tag or a CSV "MCC" column. First match wins. */
const MCC_CATEGORIES = [
  [742, 742, 'Pets'], [780, 780, 'Home maintenance'], [1520, 1799, 'Home maintenance'],
  [3000, 3299, 'Travel'], [3351, 3441, 'Travel'], [3501, 3999, 'Travel'],
  [4111, 4111, 'Transit and rideshare'], [4112, 4112, 'Travel'], [4119, 4119, 'Medical'], [4121, 4131, 'Transit and rideshare'],
  [4411, 4411, 'Travel'], [4511, 4511, 'Travel'], [4582, 4582, 'Travel'], [4722, 4723, 'Travel'], [4784, 4784, 'Parking and tolls'], [4789, 4789, 'Transit and rideshare'],
  [4812, 4812, 'Shopping'], [4814, 4815, 'Utilities'], [4816, 4816, 'Subscriptions'], [4899, 4900, 'Utilities'],
  [5013, 5013, 'Auto maintenance'], [5021, 5021, 'Shopping'], [5039, 5039, 'Home maintenance'], [5044, 5046, 'Shopping'], [5047, 5047, 'Medical'], [5065, 5065, 'Shopping'],
  [5072, 5074, 'Home maintenance'], [5094, 5099, 'Shopping'], [5122, 5122, 'Medical'], [5111, 5139, 'Shopping'], [5172, 5172, 'Fuel and charging'], [5192, 5193, 'Shopping'], [5198, 5198, 'Home maintenance'], [5199, 5199, 'Shopping'],
  [5200, 5261, 'Home maintenance'], [5300, 5300, 'Groceries'], [5309, 5309, 'Travel'], [5310, 5399, 'Shopping'],
  [5411, 5451, 'Groceries'], [5462, 5462, 'Dining out'], [5499, 5499, 'Groceries'],
  [5511, 5533, 'Auto maintenance'], [5541, 5542, 'Fuel and charging'], [5551, 5551, 'Shopping'], [5552, 5552, 'Fuel and charging'], [5561, 5599, 'Auto maintenance'],
  [5611, 5699, 'Shopping'], [5712, 5735, 'Shopping'],
  [5811, 5814, 'Dining out'], [5815, 5816, 'Entertainment'], [5817, 5818, 'Subscriptions'],
  [5912, 5912, 'Medical'], [5921, 5921, 'Groceries'], [5947, 5947, 'Gifts'], [5931, 5950, 'Shopping'], [5962, 5962, 'Travel'], [5963, 5965, 'Shopping'], [5968, 5968, 'Subscriptions'], [5969, 5973, 'Shopping'],
  [5975, 5976, 'Medical'], [5977, 5977, 'Personal care'], [5978, 5978, 'Shopping'], [5983, 5983, 'Utilities'], [5992, 5992, 'Gifts'], [5993, 5994, 'Shopping'], [5995, 5995, 'Pets'], [5996, 5999, 'Shopping'],
  [6513, 6513, 'Mortgage or rent'],
  [7011, 7012, 'Travel'], [7032, 7032, 'Kids activities'], [7033, 7033, 'Travel'],
  [7210, 7216, 'Personal care'], [7217, 7217, 'Home maintenance'], [7230, 7230, 'Personal care'], [7251, 7251, 'Personal care'], [7276, 7276, 'Taxes'], [7277, 7277, 'Medical'], [7297, 7298, 'Personal care'],
  [7338, 7338, 'Shopping'], [7342, 7349, 'Home maintenance'], [7372, 7372, 'Subscriptions'], [7375, 7375, 'Subscriptions'], [7395, 7395, 'Shopping'],
  [7512, 7512, 'Travel'], [7519, 7519, 'Travel'], [7523, 7523, 'Parking and tolls'], [7531, 7549, 'Auto maintenance'],
  [7622, 7622, 'Shopping'], [7623, 7623, 'Home maintenance'], [7629, 7629, 'Home maintenance'], [7631, 7631, 'Shopping'], [7641, 7641, 'Home maintenance'],
  [7829, 7841, 'Entertainment'], [7911, 7911, 'Kids activities'], [7922, 7996, 'Entertainment'], [7997, 7997, 'Fitness'], [7998, 7999, 'Entertainment'],
  [8011, 8099, 'Medical'], [8211, 8299, 'School'], [8351, 8351, 'Childcare'], [8398, 8398, 'Charitable giving'], [8661, 8661, 'Charitable giving'], [8675, 8675, 'Auto maintenance'],
  [9311, 9311, 'Taxes'],
];

/* The card issuer's own category column. [pattern, category (null = leave it), direction] — first match wins. */
const BANK_CATEGORY_MAP = [
  [/reward|rebate|cash ?back/i, 'Other income', 'in'],
  [/payment|thank you|^credits?$|transfer|^deposits?$|^installment/i, null],
  [/interest|dividend/i, 'Interest and dividends', 'in'],
  [/interest|finance charge/i, 'Bank fees', 'out'],
  [/(auto|car|vehicle) insurance/i, 'Auto insurance'], [/(home(owners)?|renters) insurance/i, 'Home insurance'],
  [/life insurance|disability/i, 'Life and disability insurance'], [/health insurance/i, 'Medical'], [/insurance/i, null],
  [/property tax/i, 'Property tax'], [/taxi|rideshare|ride share/i, 'Transit and rideshare'], [/\btax(es)?\b/i, 'Taxes'],
  [/^gifts?\b/i, 'Gifts'], [/donat|charit|religio|non-?profit/i, 'Charitable giving'],
  [/grocer|supermarket|warehouse|wholesale/i, 'Groceries'],
  [/pharmac|drug ?store|health|medical|doctor|dentist|dental|vision|optic|hospital/i, 'Medical'],
  [/hardware|home improvement/i, 'Home maintenance'],
  [/\bpets?\b|veterinar/i, 'Pets'],
  [/travel|air(line|fare)s?|lodging|hotel|car rental|vehicle rental|rental car|cruise|vacation/i, 'Travel'],
  [/^coffee|coffee shop/i, 'Coffee'],
  [/restaurant|dining|food|\bbars?\b|drink|fast food|caf[eé]/i, 'Dining out'],
  [/gas|fuel|petrol|service station/i, 'Fuel and charging'],
  [/parking|toll/i, 'Parking and tolls'],
  [/transit|transportation|commut/i, 'Transit and rideshare'],
  [/auto(motive)?|vehicle|car (wash|service|repair)/i, 'Auto maintenance'],
  [/phone|cable|internet|utilit|bills|telecom|communication/i, 'Utilities'],
  [/fitness|gym/i, 'Fitness'],
  [/child ?care|daycare|babysit/i, 'Childcare'],
  [/kids|children/i, 'Kids activities'],
  [/education|school|tuition|student/i, 'School'],
  [/merchandise|shopping|retail|department|clothing|apparel|electronics|stores?\b|books?\b/i, 'Shopping'],
  [/hair|beauty|personal|spa\b|salon|laundry|dry clean/i, 'Personal care'],
  [/entertain|movie|music|game|amusement|recreation|sport|\barts?\b|event|theat/i, 'Entertainment'],
  [/subscription|streaming|digital|software|membership/i, 'Subscriptions'],
  [/home|household|garden|lawn|furnish/i, 'Home maintenance'],
  [/mortgage|\brent\b/i, 'Mortgage or rent'],
  [/fee|adjustment|overdraft|\batm\b/i, 'Bank fees'],
];

function compileNameList(list) {
  return list.map(([name, dir, alts]) => {
    if (alts instanceof RegExp) return [alts, name, dir];
    const body = alts.split('|').map(a => a.replace(/\s+/g, ' ').trim()).filter(Boolean).map(a => a.replace(/\*/g, '[A-Z&]*')).join('|');
    return [new RegExp(` (?:${body})(?= )`), name, dir];
  });
}
let _catLists = null;
function catLists() { return _catLists || (_catLists = { merchants: compileNameList(MERCHANTS), words: compileNameList(NAME_WORDS) }); }
function knownMerchantCount() { return MERCHANTS.reduce((n, [, , a]) => n + (typeof a === 'string' ? a.split('|').length : 0), 0); }

function categoryIdByName(name) {
  if (!name) return null;
  const c = state.categories.find(c => c.name === name) || state.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  return c ? c.id : null;
}
const dirOk = (dir, amount) => !dir || (dir === 'in' ? amount > 0 : amount < 0);
function matchNameList(list, payee, amount) {
  const p = ' ' + normPayee(payee) + ' ';
  for (const [re, name, dir] of list) {
    if (!dirOk(dir, amount)) continue;
    if (re.test(p)) { const id = categoryIdByName(name); if (id) return id; }
  }
  return null;
}
/* Known merchants only (kept under its old name for callers) */
function builtinCategory(payee, amount) { return matchNameList(catLists().merchants, payee, amount); }
function wordCategory(payee, amount) { return matchNameList(catLists().words, payee, amount); }
function processorCategory(raw) {
  for (const [re, name] of PROCESSOR_HINTS) if (re.test(String(raw || ''))) return categoryIdByName(name);
  return null;
}
function mccCategory(code, amount) {
  const n = parseInt(String(code || '').replace(/\D/g, ''), 10);
  if (!(n > 0)) return null;
  const hit = MCC_CATEGORIES.find(([a, b]) => n >= a && n <= b);
  if (!hit) return null;
  if (hit[2] === 'Mortgage or rent' && !(amount < 0)) return null;
  return categoryIdByName(hit[2]);
}
function categoryFromBank(name, amount) {
  if (!name) return null;
  if (/^\d{4}$/.test(name.trim())) return mccCategory(name, amount);
  for (const [re, target, dir] of BANK_CATEGORY_MAP) {
    if (!re.test(name)) continue;
    if (dir && amount !== undefined && !dirOk(dir, amount)) continue;
    return target ? categoryIdByName(target) : null;
  }
  return categoryIdByName(name);
}

/* How you've categorized each merchant before: merchant key → category, when your past choices agree */
const HISTORY_SKIP = /^(VENMO|ZELLE|PAYPAL|CASH APP|SQUARE CASH|SQC|APPLE CASH|ATM|CHECK|DEPOSIT|WITHDRAWAL|TRANSFER|ONLINE TRANSFER|MOBILE DEPOSIT|REMOTE DEPOSIT|WIRE|INTERNATIONAL WIRE)\b/;
function merchantKey(payee) {
  if (PERSON_TO_PERSON.test(String(payee || ''))) {   // a payment to a person: key on the whole name (the nanny every month)
    const n = normPayee(payee).replace(/\b(CONF|CONFIRMATION|REF|ID|TRANS|TRN|MEMO)\b.*$/, '').trim();
    return n.split(' ').length >= 3 ? 'P2P ' + n : '';
  }
  const key = ruleWords(payee).slice(0, 3).join(' ');
  return key && !HISTORY_SKIP.test(key) ? key : '';
}
function categoryHistory() {
  const counts = new Map();
  for (const t of state.transactions) {
    if (!t.categoryId || (t.splits && t.splits.length)) continue;
    const k = merchantKey(t.rawPayee || t.payee); if (!k) continue;
    const m = counts.get(k) || {}; m[t.categoryId] = (m[t.categoryId] || 0) + 1; counts.set(k, m);
  }
  const out = new Map();
  for (const [k, m] of counts) {
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    const [best, n] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    if (n / total >= 0.75 && state.categories.some(c => c.id === best)) out.set(k, best);
  }
  return out;
}

const GUESS_WHY = { history: 'Same as you picked before', merchant: 'Known merchant', code: 'From the merchant code in the file', bank: 'From the bank’s own category', words: 'A guess from words in the name', processor: 'A guess from the payment processor' };
/* The full guess for one transaction. Returns { id, how } or null. hist: a categoryHistory() map (optional). */
const PERSON_TO_PERSON = /\b(ZELLE|VENMO|CASH APP|SQUARE CASH|SQC|APPLE CASH|POPMONEY)\b|\bPAYPAL (TRANSFER|INST XFER|INSTANT)/i;
function autoCategory(payee, amount, x = {}, hist = null) {
  const id = (how, v) => v ? { id: v, how } : null;
  const k = hist && merchantKey(payee);
  if (PERSON_TO_PERSON.test(String(payee || '')))   // people's names collide with brand names, so only your history and the bank's category
    return id('history', k && hist.get(k)) || id('bank', categoryFromBank(x.bankCategory, amount));
  return id('history', k && hist.get(k))
    || id('merchant', builtinCategory(payee, amount))
    || id('code', mccCategory(x.mcc, amount))
    || id('bank', categoryFromBank(x.bankCategory, amount))
    || id('words', wordCategory(payee, amount))
    || id('processor', processorCategory(payee));
}

/* ================= import wizard ================= */
let IMP = null;

function startImport(preset = {}) {
  IMP = { step: 'pick', kind: 'txns', ...preset };
  openModal({ title: 'Import', wide: true, body: '<div id="imp"></div>', id: 'import-modal' });
  renderImport();
}
const txnAccounts = () => activeAccounts().filter(a => !holdingsFor(a.id).length && !['realestate', 'vehicle', 'private'].includes(a.type));
function txnAccountOptions(sel, newLabel = 'New account…') {
  return `<option value="">Choose an account…</option>` +
    txnAccounts().map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.institution ? ' · ' + esc(a.institution) : ''}</option>`).join('') +
    `<option value="__new" ${sel === '__new' ? 'selected' : ''}>${esc(newLabel)}</option>`;
}
function invAccountOptions(sel) {
  const accts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  return accts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('') + `<option value="__new" ${sel === '__new' ? 'selected' : ''}>New account…</option>`;
}
function newAccountFields(prefix, def = {}) {
  const types = def.types || Object.keys(ACCOUNT_TYPES);
  return `<div class="inline-new">
    <label class="field"><span>Account name</span><input id="${prefix}-name" value="${esc(def.name || '')}" placeholder="e.g. Checking"></label>
    <label class="field"><span>Type</span><select id="${prefix}-type">${types.map(t => `<option value="${t}" ${t === def.type ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</select></label>
    <label class="field"><span>Institution</span><input id="${prefix}-inst" value="${esc(def.inst || '')}" placeholder="Optional"></label>
  </div>`;
}
const guessTypeFromName = n => /card|visa|amex|american express|mastercard|discover|sapphire|freedom/i.test(n) ? 'credit' : /saving|reserve|money market|hysa/i.test(n) ? 'savings' : /loan|mortgage/i.test(n) ? 'loan' : 'checking';

async function handleImportFile(file, opts = {}) {
  const box = $('#imp'); if (box && !opts.silent) box.innerHTML = `<p class="muted pad">Reading ${esc(file.name)}…</p>`;
  IMP.fileName = file.name;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const fours = [...file.name.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map(m => m[1]);
  const last4 = fours.find(f => activeAccounts().some(a => a.last4 === f)) || fours.filter(f => !isYearLike(f)).pop() || '';
  IMP.fileLast4 = last4;
  try {
    if (ext === 'pdf') {
      const lines = await pdfToLines(await readFileAsBuffer(file));
      const { rows, period, last4: textLast4, isCard } = parseStatementLines(lines);
      if (!rows.length) throw new Error('Ọrọ̀ couldn’t find transaction lines in that PDF. If it’s a scanned image, or an unusual layout, download the OFX/QFX or CSV version from your bank instead.');
      IMP.source = 'pdf'; IMP.period = period; IMP.pdfRows = rows; if (textLast4) IMP.fileLast4 = textLast4;
      IMP.accountId = guessAccount(textLast4) || guessAccount(last4);
      if (!IMP.accountId) IMP.newDefaults = { type: isCard ? 'credit' : 'checking' };
      IMP.step = 'review'; buildTxRowsFromPdf();
    } else {
      const text = await readFileAsText(file);
      if (looksLikeOFX(text) || ['ofx', 'qfx', 'qbo'].includes(ext)) {
        const o = parseOFX(text);
        IMP.source = 'ofx'; IMP.ofx = o; if (o.last4) IMP.fileLast4 = o.last4;
        if (o.positions.length) {
          IMP.kind = 'positions'; IMP.step = 'positions';
          IMP.positions = o.positions.map(p => ({ ...p, assetClass: guessAssetClass(p.symbol, p.name), include: true }));
          if (o.invCash) IMP.positions.push({ symbol: 'CASH', name: 'Cash balance', shares: o.invCash, price: 1, value: o.invCash, costBasis: o.invCash, srcAccount: o.acctId, assetClass: 'Cash', include: true });
          IMP.srcMap = { [o.acctId]: guessAccount(o.last4, true) };
        } else {
          if (!o.txns.length) throw new Error('That file didn’t contain any transactions. Try a wider date range when you download it.');
          IMP.accountId = guessAccount(o.last4);
          if (!IMP.accountId) IMP.newDefaults = { type: o.isCard ? 'credit' : (/SAVINGS/i.test(o.ofxType) ? 'savings' : 'checking') };
          IMP.step = 'review'; buildTxRows(o.txns.map(t => ({ ...t, bankCategory: '' })));
        }
      } else if (looksLikeQIF(text) || ext === 'qif') {
        const rows = parseQIF(text);
        if (!rows.length) throw new Error('No transactions were found in that QIF file.');
        IMP.source = 'qif'; IMP.qif = rows; IMP.createCats = true;
        setupAccountMap(rows, last4);
        IMP.step = 'review'; buildTxRows(rows);
      } else {
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error('That file looks empty.');
        const hi = findHeaderRow(rows);
        if (isPositionsHeader(rows[hi])) {
          IMP.source = 'csv'; IMP.kind = 'positions'; IMP.step = 'positions';
          IMP.positions = parsePositionsCSV(rows).map(p => ({ ...p, assetClass: guessAssetClass(p.symbol, p.name), include: true }));
          if (!IMP.positions.length) throw new Error('Ọrọ̀ found a positions file but couldn’t read any holdings from it.');
          IMP.srcMap = {};
          for (const src of [...new Set(IMP.positions.map(p => p.srcAccount || ''))]) IMP.srcMap[src] = matchInvAccount(src);
        } else {
          IMP.source = 'csv'; IMP.csv = rows; IMP.headerRow = hi; IMP.headers = rows[hi];
          IMP.map = guessTxnMapping(rows[hi]);
          IMP.useDebitCredit = IMP.map.amount < 0 && IMP.map.debit >= 0;
          IMP.useAcctCol = IMP.map.account >= 0;
          IMP.createCats = IMP.map.category >= 0 && IMP.useAcctCol; // exports from other budgeting apps
          IMP.last4 = last4;
          IMP.accountId = guessAccount(last4);
          IMP.step = 'map';
        }
      }
    }
  } catch (e) {
    IMP.error = e.message || String(e); IMP.step = 'pick';
  }
  if (!opts.silent) renderImport();
}
function guessAccount(last4, inv) {
  if (last4) { const a = activeAccounts().find(a => a.last4 === last4); if (a) return a.id; }
  return inv ? '__new' : '';
}
function matchInvAccount(src) {
  if (!src) return activeAccounts().find(a => ACCOUNT_TYPES[a.type].bucket === 'invest')?.id || '__new';
  const s = src.toLowerCase(), digits = src.replace(/\D/g, '').slice(-4);
  const a = activeAccounts().find(a => (a.importName && a.importName.toLowerCase() === s) || (digits && a.last4 === digits) || a.name.toLowerCase() === s);
  return a ? a.id : '__new';
}
function matchTxnAccount(src) {
  if (!src) return '';
  const s = src.toLowerCase().trim(), digits = src.replace(/\D/g, '').slice(-4);
  const a = txnAccounts().find(a => (a.importName && a.importName.toLowerCase() === s) || a.name.toLowerCase() === s || (digits.length === 4 && a.last4 === digits));
  return a ? a.id : '__new';
}
function setupAccountMap(rows, last4) {
  const srcs = [...new Set(rows.map(r => r.srcAccount || ''))];
  IMP.multi = srcs.length > 1 || (srcs[0] && srcs[0] !== '');
  if (IMP.multi) { IMP.acctMap = IMP.acctMap || {}; for (const s of srcs) if (!(s in IMP.acctMap)) IMP.acctMap[s] = matchTxnAccount(s); }
  else IMP.accountId = IMP.accountId || guessAccount(last4);
}

/* ---- CSV mapping → rows ---- */
function csvMappedRows() {
  const m = IMP.map, out = [];
  const typeVals = m.ttype >= 0 ? new Set(IMP.csv.slice(IMP.headerRow + 1, IMP.headerRow + 40).map(r => (r[m.ttype] || '').toLowerCase())) : null;
  const useType = typeVals && [...typeVals].every(v => !v || v === 'debit' || v === 'credit');
  for (const r of IMP.csv.slice(IMP.headerRow + 1)) {
    const date = parseDateFlexible(r[m.date]);
    if (!date) continue;
    let amount;
    if (IMP.useDebitCredit) {
      const d = parseAmount(r[m.debit]), c = parseAmount(r[m.credit]);
      if (!isFinite(d) && !isFinite(c)) continue;
      amount = (isFinite(c) ? Math.abs(c) : 0) - (isFinite(d) ? Math.abs(d) : 0);
    } else { amount = parseAmount(r[m.amount]); if (!isFinite(amount)) continue; }
    if (useType) amount = Math.abs(amount) * ((r[m.ttype] || '').toLowerCase() === 'debit' ? -1 : 1);
    if (IMP.flip) amount = -amount;
    out.push({ date, payee: (r[m.payee] || '').trim(), amount: round2(amount), memo: m.memo >= 0 ? r[m.memo] : '', bankCategory: m.category >= 0 ? (r[m.category] || '').trim() : '', mcc: m.mcc >= 0 ? (r[m.mcc] || '').trim() : '', tags: m.tags >= 0 ? parseTags(r[m.tags]) : [], srcAccount: IMP.useAcctCol && m.account >= 0 ? (r[m.account] || '').trim() : '', fitid: '' });
  }
  return out;
}
function buildTxRowsFromPdf() {
  const acct = acctById(IMP.accountId);
  const isCard = acct ? acct.type === 'credit' : (IMP.newDefaults?.type === 'credit');
  buildTxRows(IMP.pdfRows.map(r => ({ date: r.date, payee: r.payee, amount: round2(pdfSignedAmount(r, isCard) * (IMP.flipAll ? -1 : 1)), fitid: '', memo: '', bankCategory: '' })));
}
/* Category from another app's export: exact name, "Group: Category", or a close match. */
function findCategoryByName(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const parts = n.split(/\s*[:>/]\s*/);
  const leaf = parts[parts.length - 1];
  return state.categories.find(c => c.name.toLowerCase() === n) || state.categories.find(c => c.name.toLowerCase() === leaf) || null;
}
function rowAccountId(r) { return IMP.multi ? (IMP.acctMap[r.srcAccount || ''] || '') : (IMP.accountId || ''); }
function buildTxRows(list) {
  IMP.rawList = list;
  const seenByAcct = {};
  const hist = categoryHistory(), transferId = categoryIdByName('Transfer between accounts'), cardPayId = categoryIdByName('Credit card payment');
  IMP.txRows = list.map(t => {
    const acctId = rowAccountId(t);
    const acct = acctId && !acctId.startsWith('__') ? acctById(acctId) : null;
    const existing = acct ? txByAccount(acct.id) : [];
    const ids = acct ? (seenByAcct[acct.id] = seenByAcct[acct.id] || new Set(existing.map(x => x.importId).filter(Boolean))) : new Set();
    const seen = (IMP._seen = IMP._seen || {});
    const base = t.fitid ? 'fit:' + t.fitid : 'h:' + hashStr(`${t.date}|${t.amount}|${normPayee(t.payee)}`);
    const k = (acctId || '') + base; seen[k] = (seen[k] || 0) + 1;
    const importId = t.fitid ? base : `${base}:${seen[k]}`;
    let status = 'new';
    if (ids.has(importId)) status = 'dup';
    else if (existing.some(e => Math.abs(e.amount - t.amount) < 0.005 && Math.abs(daysBetween(e.date, t.date)) <= 3 && (normPayee(e.rawPayee || e.payee).split(' ')[0] === normPayee(t.payee).split(' ')[0] || !e.importId))) status = 'maybe';
    const rule = matchRule(t.payee);
    const named = findCategoryByName(t.bankCategory);
    const auto = rule || named ? null : autoCategory(t.payee, t.amount, { mcc: t.mcc, bankCategory: t.bankCategory }, hist);
    let categoryId = rule ? rule.categoryId : named ? named.id : (auto ? auto.id : null);
    const type = acct ? acct.type : (IMP.multi ? guessTypeFromName(t.srcAccount || '') : IMP.newDefaults?.type);
    // money coming into a credit card is almost always a payment
    if (type === 'credit' && t.amount > 0 && cardPayId && (!categoryId || categoryId === transferId) && /payment|thank you|autopay|pymt|transfer from|ach deposit/i.test(t.payee)) categoryId = cardPayId;
    const willCreate = !categoryId && IMP.createCats && t.bankCategory && !/^(uncategori[sz]ed|none|transfer.*|.*ready to assign|to be budgeted|split.*)$/i.test(t.bankCategory);
    return { ...t, importId, status, include: status === 'new', categoryId: categoryId || '', guess: auto && categoryId === auto.id ? auto.how : '', newCat: willCreate ? t.bankCategory : '', rename: rule?.rename, person: rule?.person };
  }).sort((a, b) => b.date.localeCompare(a.date));
  IMP._seen = {};
}

/* ---- rendering ---- */
function renderImport() {
  const box = $('#imp'); if (!box || !IMP) return;
  const s = IMP.step;
  if (s === 'pick') {
    box.innerHTML = `
      ${IMP.error ? `<div class="notice bad">${esc(IMP.error)}</div>` : ''}
      <label class="drop" id="imp-drop">
        <input type="file" id="imp-file" accept=".csv,.ofx,.qfx,.qbo,.qif,.pdf,.txt" multiple>
        <span class="drop-title">Drop statements or exports here</span>
        <span class="muted">or click to choose. One file or the whole month’s downloads at once. OFX, QFX, QBO, QIF, CSV or PDF.</span>
        <span class="drop-note">Read on this Mac. Nothing is uploaded.</span>
      </label>
      <div class="help-grid">
        <div><h4>Bank and credit card activity</h4><p>On your bank’s site, look for “Download transactions.” Pick <strong>Quicken (QFX)</strong> or <strong>OFX</strong> if offered: it carries IDs that prevent duplicates and the current balance. CSV works too.</p></div>
        <div><h4>Brokerage holdings</h4><p>Download the <strong>Positions</strong> page as CSV (Fidelity, Schwab, Vanguard and most others), or an investment QFX. Ọrọ̀ updates shares, prices and cost basis.</p></div>
        <div><h4>Moving from another app</h4><p>Exports from <strong>YNAB, Monarch, Mint, Copilot, Tiller</strong> (CSV) or <strong>Quicken</strong> (QIF) bring every account at once, with categories, tags and notes. PDF statements work as a last resort.</p></div>
      </div>`;
    const inp = $('#imp-file'), drop = $('#imp-drop');
    inp.onchange = () => importFiles([...inp.files]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); };
    setModalActions('<button class="btn ghost" data-close>Cancel</button>');
    return;
  }
  if (s === 'map') return renderMapStep(box);
  if (s === 'review') return renderReviewStep(box);
  if (s === 'positions') return renderPositionsStep(box);
  if (s === 'batch') return renderBatchStep(box);
}
function importFiles(files) {
  if (!files.length) return;
  if (files.length === 1) return handleImportFile(files[0]);
  startBatch(files);
}
function colSelect(id, val, allowNone) {
  return `<select id="${id}">${allowNone ? `<option value="-1">None</option>` : ''}${IMP.headers.map((h, i) => `<option value="${i}" ${i === val ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('')}</select>`;
}
function acctMapBlock() {
  const srcs = Object.keys(IMP.acctMap || {});
  return `<div class="map-list"><p class="muted small">This file has ${srcs.length} account${srcs.length === 1 ? '' : 's'}. Match each one, or let Ọrọ̀ create it.</p>${srcs.map((src, k) => `<div class="map-row"><span class="map-src">${esc(src || '(no account name)')}</span><select data-amap="${k}">${txnAccountOptions(IMP.acctMap[src], `New account “${src || 'Imported'}”`)}</select></div>`).join('')}</div>`;
}
function renderMapStep(box) {
  const m = IMP.map;
  const preview = csvMappedRows();
  if (IMP.useAcctCol) setupAccountMap(preview, IMP.last4); else IMP.multi = false;
  box.innerHTML = `
    <p class="lede">${esc(IMP.fileName)} has ${IMP.csv.length - IMP.headerRow - 1} rows. Check that Ọrọ̀ picked the right columns.</p>
    <div class="form-grid four">
      <label class="field"><span>Date</span>${colSelect('map-date', m.date)}</label>
      <label class="field"><span>Description</span>${colSelect('map-payee', m.payee)}</label>
      <label class="field"><span>Category</span>${colSelect('map-category', m.category, true)}</label>
      <label class="field"><span>Account</span>${colSelect('map-account', m.account, true)}</label>
    </div>
    <div class="form-grid four">
      <label class="check"><input type="checkbox" id="map-dc" ${IMP.useDebitCredit ? 'checked' : ''}> Separate debit and credit columns</label>
      ${IMP.useDebitCredit
        ? `<label class="field"><span>Debit (money out)</span>${colSelect('map-debit', m.debit)}</label><label class="field"><span>Credit (money in)</span>${colSelect('map-credit', m.credit)}</label>`
        : `<label class="field"><span>Amount</span>${colSelect('map-amount', m.amount)}</label>`}
      <label class="check"><input type="checkbox" id="map-flip" ${IMP.flip ? 'checked' : ''}> Flip signs (purchases show as positive)</label>
    </div>
    ${IMP.useAcctCol ? acctMapBlock() : `<div class="form-grid"><label class="field"><span>Import into</span><select id="imp-acct">${txnAccountOptions(IMP.accountId)}</select></label></div><div id="imp-new">${IMP.accountId === '__new' ? newAccountFields('imp-new', { type: 'checking', ...(IMP.newDefaults || {}) }) : ''}</div>`}
    ${m.category >= 0 ? `<label class="check"><input type="checkbox" id="map-create" ${IMP.createCats ? 'checked' : ''}> Create categories from the file that Ọrọ̀ doesn’t have yet</label>` : ''}
    <table class="ledger compact"><thead><tr><th>Date</th><th>Description</th>${IMP.useAcctCol ? '<th>Account</th>' : ''}${m.category >= 0 ? '<th>Category</th>' : ''}<th class="num">Amount</th></tr></thead>
      <tbody>${preview.slice(0, 6).map(r => `<tr><td>${dateLabel(r.date, true)}</td><td>${esc(r.payee)}</td>${IMP.useAcctCol ? `<td class="muted">${esc(r.srcAccount)}</td>` : ''}${m.category >= 0 ? `<td class="muted">${esc(r.bankCategory)}</td>` : ''}<td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No rows could be read with this mapping.</td></tr>'}</tbody></table>
    <p class="muted small">Money out should be negative. Purchases on a credit card are money out.</p>`;
  const upd = () => {
    m.date = +$('#map-date').value; m.payee = +$('#map-payee').value; m.category = +$('#map-category').value; m.account = +$('#map-account').value;
    IMP.useAcctCol = m.account >= 0;
    IMP.useDebitCredit = $('#map-dc').checked; IMP.flip = $('#map-flip').checked;
    if ($('#map-create')) IMP.createCats = $('#map-create').checked;
    if ($('#map-amount')) m.amount = +$('#map-amount').value;
    if ($('#map-debit')) { m.debit = +$('#map-debit').value; m.credit = +$('#map-credit').value; }
    if (IMP.useDebitCredit && m.debit < 0) { m.debit = 0; m.credit = 0; }
    if ($('#imp-acct')) IMP.accountId = $('#imp-acct').value;
    stashNewAcct(); renderImport();
  };
  box.onchange = e => {
    const el = e.target;
    if (el.dataset.amap != null) { IMP.acctMap[Object.keys(IMP.acctMap)[+el.dataset.amap]] = el.value; return; }
    if (el.closest('.inline-new')) return;
    upd();
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="to-review">Continue</button>`);
}
function stashNewAcct() {
  if ($('#imp-new-name')) IMP.newDefaults = { name: $('#imp-new-name').value, type: $('#imp-new-type').value, inst: $('#imp-new-inst').value };
}

function renderReviewStep(box) {
  const rows = IMP.txRows || [];
  const inc = rows.filter(r => r.include);
  const dates = rows.map(r => r.date).sort();
  const dup = rows.filter(r => r.status !== 'new').length;
  const bal = IMP.ofx?.balance;
  const opts = catOptions(null, true);
  const newCats = [...new Set(rows.filter(r => r.include && r.newCat && !r.categoryId).map(r => r.newCat))];
  box.innerHTML = `
    ${IMP.multi ? acctMapBlock() : `<div class="form-grid"><label class="field"><span>Import into</span><select id="imp-acct">${txnAccountOptions(IMP.accountId)}</select></label></div>
    <div id="imp-new">${IMP.accountId === '__new' ? newAccountFields('imp-new', { type: 'checking', ...(IMP.newDefaults || {}) }) : ''}</div>`}
    <p class="lede">${rows.length.toLocaleString()} transaction${rows.length === 1 ? '' : 's'}${dates.length ? `, ${dateLabel(dates[0], true)} to ${dateLabel(dates[dates.length - 1], true)}` : ''}.
      ${dup ? `${dup} look${dup === 1 ? 's' : ''} like ${dup === 1 ? 'a duplicate' : 'duplicates'} and ${dup === 1 ? 'is' : 'are'} unchecked.` : 'None of them are already in Ọrọ̀.'}
      ${IMP.source === 'pdf' ? ' Read from a PDF: check the signs. Click any amount to flip it.' : ''}
      ${newCats.length ? ` ${newCats.length} new categor${newCats.length === 1 ? 'y' : 'ies'} will be created: ${newCats.slice(0, 5).map(esc).join(', ')}${newCats.length > 5 ? '…' : ''}.` : ''}</p>
    <div class="toolbar">
      <button class="btn small ghost" data-imp="all">Check all</button>
      <button class="btn small ghost" data-imp="none">Uncheck all</button>
      ${IMP.source !== 'ofx' ? `<button class="btn small ghost" data-imp="flipall">Flip every sign</button>` : ''}
      ${bal && isFinite(bal.amount) ? `<label class="check"><input type="checkbox" id="imp-bal" ${IMP.setBal !== false ? 'checked' : ''}> Set the balance to ${money(Math.abs(bal.amount))} as of ${dateLabel(bal.date, true)}</label>` : ''}
    </div>
    <div class="scroll-table tall"><table class="ledger compact" id="imp-table"><thead><tr><th class="cb"></th><th>Date</th><th>Description</th>${IMP.multi ? '<th>Account</th>' : ''}<th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${rows.slice(0, 1500).map((r, i) => `<tr class="${r.include ? '' : 'off'}" data-i="${i}">
        <td class="cb"><input type="checkbox" data-row="${i}" ${r.include ? 'checked' : ''} aria-label="Include"></td>
        <td class="nowrap">${dateLabel(r.date, true)}</td>
        <td>${esc(prettyPayee(r.payee))}<div class="muted small">${esc(r.payee)}${r.tags?.length ? ' · ' + r.tags.map(x => '#' + esc(x)).join(' ') : ''}</div></td>
        ${IMP.multi ? `<td class="muted small">${esc(r.srcAccount)}</td>` : ''}
        <td>${r.newCat && !r.categoryId ? `<span class="tag soft" title="Will be created">New: ${esc(r.newCat)}</span>` : `<select data-cat="${i}"${r.guess && r.categoryId ? ` title="${esc(GUESS_WHY[r.guess] || '')}"` : ''}>${opts.replace(`value="${r.categoryId}"`, `value="${r.categoryId}" selected`)}</select>`}</td>
        <td class="num ${signClass(r.amount)}">${IMP.source !== 'ofx' ? `<button class="linklike num" data-flip="${i}" title="Flip sign">${money(r.amount)}</button>` : money(r.amount)}</td>
        <td>${r.status === 'dup' ? '<span class="tag">Already imported</span>' : r.status === 'maybe' ? '<span class="tag">Possible duplicate</span>' : ''}</td></tr>`).join('')}
    </tbody></table>${rows.length > 1500 ? `<p class="muted small">Showing the first 1,500 rows for review; all ${rows.length.toLocaleString()} will import.</p>` : ''}</div>`;
  const rebuild = () => { stashNewAcct(); if (IMP.source === 'pdf') buildTxRowsFromPdf(); else buildTxRows(IMP.rawList); renderImport(); };
  if ($('#imp-acct')) $('#imp-acct').onchange = e => { IMP.accountId = e.target.value; rebuild(); };
  box.onchange = e => {
    const t = e.target;
    if (t.dataset.amap != null) { IMP.acctMap[Object.keys(IMP.acctMap)[+t.dataset.amap]] = t.value; return rebuild(); }
    if (t.dataset.row != null) { rows[+t.dataset.row].include = t.checked; t.closest('tr').classList.toggle('off', !t.checked); updateImportCount(); }
    if (t.dataset.cat != null) { rows[+t.dataset.cat].categoryId = t.value; rows[+t.dataset.cat].guess = ''; }
    if (t.id === 'imp-bal') IMP.setBal = t.checked;
  };
  $('#imp-table').onclick = e => {
    const b = e.target.closest('[data-flip]'); if (!b) return;
    const r = rows[+b.dataset.flip]; r.amount = -r.amount;
    b.textContent = money(r.amount); b.closest('td').className = 'num ' + signClass(r.amount);
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="commit" id="imp-go">Import ${inc.length.toLocaleString()} transaction${inc.length === 1 ? '' : 's'}</button>`);
}
function updateImportCount() { const n = IMP.txRows.filter(r => r.include).length; const b = $('#imp-go'); if (b) b.textContent = `Import ${n.toLocaleString()} transaction${n === 1 ? '' : 's'}`; }

function renderPositionsStep(box) {
  const P = IMP.positions;
  const srcs = Object.keys(IMP.srcMap);
  const total = sum(P.filter(p => p.include).map(p => p.value));
  box.innerHTML = `
    <p class="lede">${P.length} holding${P.length === 1 ? '' : 's'} worth ${money(total, { cents: false })} in ${srcs.length} account${srcs.length === 1 ? '' : 's'}. Choose where each account goes in Ọrọ̀.</p>
    <div class="map-list">${srcs.map((src, k) => `
      <div class="map-row">
        <span class="map-src">${esc(src || IMP.fileName)}</span>
        <select data-src="${k}">${invAccountOptions(IMP.srcMap[src])}</select>
        ${IMP.srcMap[src] === '__new' ? `<input data-srcname="${k}" value="${esc(IMP.srcNames?.[src] ?? (src || 'Brokerage'))}" placeholder="Account name"><select data-srctype="${k}">${['brokerage', 'retirement', 'education', 'hsa', 'crypto'].map(t => `<option value="${t}" ${(IMP.srcTypes?.[src] || guessInvType(src)) === t ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</select>` : ''}
      </div>`).join('')}</div>
    <label class="check"><input type="checkbox" id="imp-replace" ${IMP.replace !== false ? 'checked' : ''}> Replace the current holdings in these accounts (recommended: positions files are a full snapshot)</label>
    <div class="scroll-table"><table class="ledger compact" id="pos-table"><thead><tr><th class="cb"></th><th>Symbol</th><th>Name</th><th>Class</th><th class="num">Shares</th><th class="num">Price</th><th class="num">Value</th><th class="num">Cost basis</th></tr></thead><tbody>
    ${P.map((p, i) => `<tr class="${p.include ? '' : 'off'}"><td class="cb"><input type="checkbox" data-row="${i}" ${p.include ? 'checked' : ''}></td>
      <td><strong>${esc(p.symbol)}</strong></td><td class="muted">${esc(p.name)}</td>
      <td><select data-cls="${i}">${ASSET_CLASSES.map(c => `<option ${c === p.assetClass ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td class="num">${(+p.shares).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td><td class="num">${money(p.price)}</td><td class="num">${money(p.value)}</td><td class="num">${p.costBasis == null ? '<span class="muted">—</span>' : money(p.costBasis)}</td></tr>`).join('')}
    </tbody></table></div>`;
  box.onchange = e => {
    const t = e.target;
    if (t.dataset.src != null) { IMP.srcMap[srcs[+t.dataset.src]] = t.value; renderImport(); }
    if (t.dataset.srcname != null) (IMP.srcNames = IMP.srcNames || {})[srcs[+t.dataset.srcname]] = t.value;
    if (t.dataset.srctype != null) (IMP.srcTypes = IMP.srcTypes || {})[srcs[+t.dataset.srctype]] = t.value;
    if (t.dataset.row != null) { P[+t.dataset.row].include = t.checked; t.closest('tr').classList.toggle('off', !t.checked); }
    if (t.dataset.cls != null) P[+t.dataset.cls].assetClass = t.value;
    if (t.id === 'imp-replace') IMP.replace = t.checked;
  };
  setModalActions(`<button class="btn ghost" data-imp="back">Back</button><button class="btn primary" data-imp="commit-pos">Import holdings</button>`);
}
function guessInvType(src) { return /401|403|ira|roth|rollover|retire|457|sep/i.test(src) ? 'retirement' : /529|ugma|utma|coogan|custod|education/i.test(src) ? 'education' : /hsa|health savings/i.test(src) ? 'hsa' : 'brokerage'; }

/* ---- actions ---- */
function importAction(act) {
  if (act === 'back') { if (IMP.step === 'review' && IMP.source === 'csv' && !IMP.fromBatch) IMP.step = 'map'; else if (IMP.fromBatch) { IMP = IMP.fromBatch; IMP.step = 'batch'; } else IMP = { step: 'pick', kind: 'txns' }; return renderImport(); }
  if (act === 'to-review') {
    stashNewAcct();
    const list = csvMappedRows();
    if (!list.length) return toast('No rows could be read with this column mapping.');
    if (IMP.useAcctCol) setupAccountMap(list, IMP.last4); else IMP.multi = false;
    IMP.step = 'review'; buildTxRows(list); return renderImport();
  }
  if (act === 'all' || act === 'none') { IMP.txRows.forEach(r => r.include = act === 'all'); return renderImport(); }
  if (act === 'flipall') {
    if (IMP.source === 'pdf') { IMP.flipAll = !IMP.flipAll; buildTxRowsFromPdf(); }
    else IMP.txRows.forEach(r => r.amount = -r.amount);
    return renderImport();
  }
  if (act === 'commit') return commitTxImport();
  if (act === 'commit-pos') return commitPositions();
  if (act.startsWith('b')) return batchAction(act);
}
function makeAccount(name, type, inst) {
  const T = ACCOUNT_TYPES[type] || ACCOUNT_TYPES.checking;
  const a = { id: uid(), name, type, institution: inst || '', balance: 0, balanceDate: today(), owner: UI.lens || 'joint', forecast: !!T.forecast };
  if (T.ledger) { a.ledger = true; a.anchorBalance = 0; a.anchorDate = '0000-00-00'; }
  state.accounts.push(a);
  return a;
}
/* What's missing before an import can be saved ('' when ready). */
function txItemProblem(it) {
  if (it.multi) { for (const [src, v] of Object.entries(it.acctMap)) if (!v) return `Choose where “${src || 'unnamed'}” goes.`; return ''; }
  if (!it.accountId) return 'Choose which account these transactions belong to.';
  if (it.accountId === '__new' && !((it.newDefaults || {}).name || '').trim()) return 'Give the new account a name.';
  return '';
}
/* Next time a file like this arrives, match it to the same account. */
function rememberImportSource(acct, it) {
  if (!acct) return;
  if (!acct.last4 && it.fileLast4 && !state.accounts.some(x => x !== acct && x.last4 === it.fileLast4)) acct.last4 = it.fileLast4;
  const stem = fileStem(it.fileName);
  if (stem) acct.importStems = [stem, ...(acct.importStems || []).filter(s => s !== stem)].slice(0, 5);
}
/* Adds an import's checked rows to state (the caller commits). */
function applyTxItem(it) {
  const dest = {}, fresh = [];
  if (it.multi) {
    for (const [src, v] of Object.entries(it.acctMap)) {
      if (v === '__new') { const a = makeAccount(src || 'Imported account', guessTypeFromName(src)); a.importName = src; dest[src] = a; fresh.push(a); }
      else { dest[src] = acctById(v); dest[src].importName = dest[src].importName || src; }
    }
  } else {
    let acct = acctById(it.accountId);
    if (it.accountId === '__new') { const d = it.newDefaults || {}; acct = makeAccount(d.name.trim(), d.type || 'checking', d.inst); fresh.push(acct); }
    dest[''] = acct;
  }
  // categories from other apps' exports
  const created = {};
  const rows = it.txRows.filter(r => r.include);
  for (const r of rows) if (!r.categoryId && r.newCat) {
    if (!created[r.newCat]) {
      const parts = r.newCat.split(/\s*[:>]\s*/);
      const name = parts.length > 1 ? parts[parts.length - 1] : r.newCat, group = parts.length > 1 ? parts[0] : 'Imported';
      const kind = rows.filter(x => x.newCat === r.newCat).reduce((s, x) => s + x.amount, 0) > 0 ? 'income' : 'expense';
      const c = { id: uid(), name, group, kind, budget: 0, period: 'month' };
      state.categories.push(c); created[r.newCat] = c.id;
    }
    r.categoryId = created[r.newCat];
  }
  const have = {};
  let added = 0, skipped = 0, unc = 0;
  for (const r of rows) {
    const acct = it.multi ? dest[r.srcAccount || ''] : dest[''];
    if (r.importId) {
      const ids = have[acct.id] || (have[acct.id] = new Set(state.transactions.filter(t => t.accountId === acct.id && t.importId).map(t => t.importId)));
      if (ids.has(r.importId)) { skipped++; continue; }   // e.g. two overlapping downloads in one batch
      ids.add(r.importId);
    }
    const t = { id: uid(), date: r.date, accountId: acct.id, payee: r.rename || prettyPayee(r.payee), rawPayee: r.payee, amount: r.amount, categoryId: r.categoryId || null, memo: r.memo || '', importId: r.importId };
    if (r.tags?.length) t.tags = r.tags;
    if (r.person) t.person = r.person;
    if (r.mcc) t.mcc = String(r.mcc).slice(0, 6);
    state.transactions.push(t); added++;
    if (!t.categoryId) unc++;
  }
  state.transactions.sort((a, b) => b.date.localeCompare(a.date));
  const single = dest[''];
  if (single && it.ofx?.last4) single.last4 = it.ofx.last4;
  if (single) rememberImportSource(single, it);
  const bal = it.ofx?.balance;
  if (single && bal && isFinite(bal.amount) && it.setBal !== false) setBalance(single, round2(Math.abs(bal.amount) * (bal.amount < 0 && !isLiability(single) ? -1 : 1)), bal.date || today());
  // accounts created by import start at zero on the earliest date so imported history doesn't move today's balance unexpectedly
  for (const a of Object.values(dest)) if (a.ledger && a.anchorDate === '0000-00-00') { a.anchorDate = today(); a.anchorBalance = 0; a.balanceDate = today(); }
  return { added, skipped, unc, dest, fresh, created, bal };
}
function commitTxImport() {
  stashNewAcct();
  const problem = txItemProblem(IMP);
  if (problem) { toast(problem); (IMP.accountId === '__new' ? $('#imp-new-name') : $('#imp-acct'))?.focus(); return; }
  const r = applyTxItem(IMP);
  const nAcct = Object.keys(r.dest).length, nCats = Object.keys(r.created).length, single = r.dest[''];
  closeModal(); IMP = null;
  commit();
  toast(`Imported ${r.added.toLocaleString()} transaction${r.added === 1 ? '' : 's'}${nAcct > 1 ? ` into ${nAcct} accounts` : single ? ` into ${single.name}` : ''}.${nCats ? ` Created ${nCats} categor${nCats === 1 ? 'y' : 'ies'}.` : ''}${r.unc ? ` ${r.unc} need a category.` : ''}`,
    r.unc ? { label: 'Categorize', fn: () => go(`#/transactions?cat=_none&m=all`) } : { label: 'Undo', fn: undo });
  if (r.fresh.some(a => a.ledger && !a.anchorBalance && !r.bal)) setTimeout(() => toast('Set each new account’s current balance (Accounts › Update balances) so its balance tracks from here.'), 400);
}
/* Writes a positions file into holdings (the caller commits). */
function applyPositionsItem(it) {
  const P = it.positions.filter(p => p.include);
  const targets = {};
  for (const [src, val] of Object.entries(it.srcMap)) {
    if (val === '__new') {
      const a = { id: uid(), name: (it.srcNames?.[src] ?? (src || 'Brokerage')).trim() || 'Brokerage', type: it.srcTypes?.[src] || guessInvType(src), institution: '', balance: 0, balanceDate: today(), importName: src, owner: UI.lens || 'joint' };
      if (it.ofx?.last4) a.last4 = it.ofx.last4;
      state.accounts.push(a); targets[src] = a.id;
    } else { targets[src] = val; const a = acctById(val); if (a && src) a.importName = src; }
  }
  const touched = new Set(Object.values(targets));
  const old = {};
  for (const h of state.holdings) if (touched.has(h.accountId)) old[h.accountId + '|' + h.symbol] = h;
  if (it.replace !== false) state.holdings = state.holdings.filter(h => !touched.has(h.accountId) || h.private);
  for (const p of P) {
    const accountId = targets[p.srcAccount || ''] || targets[Object.keys(targets)[0]];
    const prev = old[accountId + '|' + p.symbol];
    const existing = state.holdings.find(h => h.accountId === accountId && h.symbol === p.symbol);
    const rec = { symbol: p.symbol, name: p.name, shares: p.shares, price: p.price, costBasis: p.costBasis ?? prev?.costBasis ?? null, er: prev?.er, assetClass: p.assetClass, priceDate: today(), accountId };
    if (existing) Object.assign(existing, rec); else state.holdings.push({ id: uid(), ...rec });
  }
  for (const id of touched) { const a = acctById(id); if (a) a.balanceDate = today(); }
  return { count: P.length, accounts: [...touched] };
}
function commitPositions() {
  const r = applyPositionsItem(IMP);
  closeModal(); IMP = null;
  commit();
  toast(`Updated ${r.count} holding${r.count === 1 ? '' : 's'} in ${r.accounts.length} account${r.accounts.length === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
}

/* ================= batch import: the month's downloads in one go =================
   Each file is read the same way as a single import, matched to its account (account number,
   the file's name pattern from last time, or overlap with transactions already there),
   and everything is reviewed on one screen. */

const isYearLike = s => /^(19|20)\d\d$/.test(s);
const MONTH_WORDS = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)/g;
/* A file name with dates and copy numbers removed: "Chase9876_Activity20261005.CSV" → "chase9876-activity". */
function fileStem(name) {
  let s = String(name || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '');
  s = s.replace(/\(\d+\)/g, ' ').replace(/\d{5,}/g, ' ').replace(/(?<!\d)\d{1,2}[-_.]\d{1,2}(?:[-_.]\d{2,4})?(?!\d)/g, ' ')
       .replace(/(?<!\d)(?:19|20)\d\d(?!\d)/g, ' ').replace(MONTH_WORDS, ' ');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const generic = /^((export|exported|transactions?|download|statement|statements|activity|history|data|file|untitled|accounts?|ofx|qfx|csv|qbo|pdf|bank|my)(-|$))+$/;
  return s.length < 4 || generic.test(s + '-') ? '' : s;
}
function matchByStem(name) {
  const st = fileStem(name); if (!st) return '';
  const a = txnAccounts().find(a => (a.importStems || []).includes(st));
  return a ? a.id : '';
}
/* The account whose existing transactions this file clearly overlaps (downloads usually overlap last month's). */
function matchByOverlap(list) {
  const keyOf = (t, sign) => (t.fitid ? 'fit:' + t.fitid : 'h:' + hashStr(`${t.date}|${round2(t.amount * sign)}|${normPayee(t.payee)}`));
  const keys = list.map(t => keyOf(t, 1)), flippedKeys = list.map(t => keyOf(t, -1));
  let best = null, bestN = 0, second = 0;
  for (const a of txnAccounts()) {
    const ids = new Set(state.transactions.filter(t => t.accountId === a.id && t.importId).map(t => (t.importId.startsWith('h:') ? t.importId.replace(/:\d+$/, '') : t.importId)));
    if (!ids.size) continue;
    for (const [ks, flipped] of [[keys, false], [flippedKeys, true]]) {
      const n = ks.filter(k => ids.has(k)).length;
      if (n > bestN) { second = bestN; bestN = n; best = { id: a.id, flipped }; } else if (n > second) second = n;
    }
  }
  return best && bestN >= 2 && bestN >= second * 2 ? best : null;
}
function withItem(it, fn) { const saved = IMP; IMP = it; try { return fn(); } finally { IMP = saved; } }
function rebuildItem(it) { withItem(it, () => { if (it.source === 'pdf') buildTxRowsFromPdf(); else buildTxRows(it.rawList); }); }
function itemAcctType(it) { return it.accountId === '__new' ? (it.newDefaults?.type || 'checking') : acctById(it.accountId)?.type; }
function suggestAccountName(it, type) {
  if (it.csvAcctName) return it.csvAcctName;
  const label = ACCOUNT_TYPES[type]?.label || 'Account';
  const skip = /^(activity|transactions?|statements?|stmt|export|checking|savings|card|credit|debit|bank|account|acct|history|download|\d+)$/;
  const brand = fileStem(it.fileName).split('-').map(w => w.replace(/\d+/g, '')).filter(w => w.length > 1 && !skip.test(w)).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return `${brand ? brand + ' ' : ''}${label}${it.fileLast4 ? ' ' + it.fileLast4 : ''}`.trim();
}
/* Some bank CSVs start with lines like "Account Name : Household Checking" and "Account Number : XXXX4421". */
function csvPreamble(it) {
  for (const r of (it.csv || []).slice(0, Math.min(it.headerRow || 0, 12))) {
    const line = r.join(' ');
    const name = /account\s*name\s*[:=]\s*(.+)$/i.exec(line), num = /account\s*(?:number|no\.?|#)\s*[:=]\s*\S*?(\d{4})\b/i.exec(line);
    if (name) it.csvAcctName = name[1].trim().slice(0, 60);
    if (num) it.fileLast4 = num[1];
  }
  // card exports mark purchases as "Sale"
  const m = it.map || {}, ti = (it.headers || []).findIndex(h => /^type$/i.test(String(h).trim()));
  if (ti >= 0 && (it.csv || []).slice((it.headerRow || 0) + 1, (it.headerRow || 0) + 40).some(r => /^sale$/i.test(String(r[ti] || '').trim()))) it.looksLikeCard = true;
  return m;
}
const accountsWithLast4 = l4 => (l4 ? txnAccounts().filter(a => a.last4 === l4) : []);
/* Card files sometimes list purchases as positive; flip them so money out is negative. */
function autoFlipForCard(it) {
  if (it.source !== 'csv' || itemAcctType(it) !== 'credit') return;
  const rows = it.txRows.filter(r => !/payment|thank you|autopay|pymt/i.test(r.payee));
  const pos = rows.filter(r => r.amount > 0).length, neg = rows.filter(r => r.amount < 0).length;
  if (pos >= 2 && pos > neg * 1.5) { it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount })); it.flipped = !it.flipped; it.autoFlipped = true; rebuildItem(it); }
}

async function analyzeBatchFile(file) {
  const saved = IMP;
  IMP = { step: 'pick', kind: 'txns' };
  try {
    await handleImportFile(file, { silent: true });
    const it = IMP;
    Object.assign(it, { file, include: true });
    if (it.error) { it.problem = it.error; it.include = false; return it; }
    if (it.step === 'positions') return it;
    if (it.step === 'map') {
      if (it.useAcctCol) { it.solo = 'This file holds several accounts, like an export from another app. Import it on its own.'; it.include = false; return it; }
      const list = csvMappedRows();
      if (!list.length) { it.solo = 'Ọrọ̀ couldn’t tell which columns hold the date and amount. Import it on its own to choose them.'; it.include = false; return it; }
      it.multi = false; it.step = 'review'; it.rawList = list;
    }
    if (it.multi) { it.solo = 'This file holds several accounts. Import it on its own.'; it.include = false; return it; }
    if (!it.rawList && it.source !== 'pdf') it.rawList = it.ofx?.txns?.map(t => ({ ...t, bankCategory: '' })) || it.qif || [];
    // which account?
    if (it.source === 'csv') { csvPreamble(it); if (!it.accountId) it.accountId = guessAccount(it.fileLast4); }
    const sameNumber = accountsWithLast4(it.fileLast4), stemId = matchByStem(it.fileName);
    if (it.source === 'ofx' && sameNumber.length === 1) { it.accountId = sameNumber[0].id; it.matchedBy = `number ending ${it.fileLast4}`; }
    else if (stemId) { it.accountId = stemId; it.matchedBy = 'same kind of file as last time'; }
    else if (sameNumber.length === 1) { it.accountId = sameNumber[0].id; it.matchedBy = `number ending ${it.fileLast4}`; }
    else {
      it.accountId = '';
      const m = matchByOverlap(it.source === 'pdf' ? withItem(it, () => (buildTxRowsFromPdf(), it.rawList)) : it.rawList);
      if (m) {
        it.accountId = m.id; it.matchedBy = 'overlaps transactions already there';
        if (m.flipped) { if (it.source === 'pdf') it.flipAll = !it.flipAll; else it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount })); it.flipped = true; it.autoFlipped = true; }
      }
    }
    if (!it.accountId && sameNumber.length > 1) { it.accountId = sameNumber[0].id; it.matchedBy = `number ending ${it.fileLast4} (more than one account has it; check this)`; }
    if (!it.accountId) {
      const type = it.newDefaults?.type || (it.looksLikeCard ? 'credit' : guessTypeFromName(it.fileName));
      it.accountId = '__new'; it.newDefaults = { name: suggestAccountName(it, type), type, inst: '' };
    }
    rebuildItem(it);
    autoFlipForCard(it);
    return it;
  } finally { IMP = saved; }
}

async function startBatch(files) {
  IMP = { step: 'batch', items: [], reading: files.length };
  const box = $('#imp');
  for (let i = 0; i < files.length; i++) {
    if (box) box.innerHTML = `<p class="muted pad">Reading ${i + 1} of ${files.length}: ${esc(files[i].name)}…</p>`;
    setModalActions('<button class="btn ghost" data-close>Cancel</button>');
    IMP.items.push(await analyzeBatchFile(files[i]));
    if (!IMP || IMP.step !== 'batch') return; // closed while reading
  }
  IMP.reading = 0;
  renderImport();
}

function batchCounts(it) {
  const rows = it.txRows || [];
  return { add: rows.filter(r => r.include).length, dup: rows.filter(r => r.status === 'dup').length, maybe: rows.filter(r => r.status === 'maybe').length, maybeIn: rows.filter(r => r.status === 'maybe' && r.include).length, unc: rows.filter(r => r.include && !r.categoryId).length };
}
function renderBatchStep(box) {
  const items = IMP.items;
  let nTx = 0, nPosFiles = 0;
  const cards = items.map((it, k) => {
    const head = `<header class="batch-head"><label class="check"><input type="checkbox" data-binc="${k}" ${it.include ? 'checked' : ''} ${it.problem || it.solo ? 'disabled' : ''}> <strong>${esc(it.fileName)}</strong></label>`;
    if (it.problem || it.solo) return `<section class="batch-item off">${head}<span class="muted small">Not included</span></header>
      <p class="notice ${it.problem ? 'bad' : ''} small">${esc(it.problem || it.solo)}</p>${it.solo ? `<button class="btn small" data-imp="bsolo-${k}">Import this file on its own</button>` : ''}</section>`;
    if (it.kind === 'positions') {
      const P = it.positions.filter(p => p.include), total = sum(P.map(p => p.value));
      if (it.include) nPosFiles++;
      const srcs = Object.keys(it.srcMap);
      return `<section class="batch-item ${it.include ? '' : 'off'}">${head}<span class="muted small">Holdings · ${P.length} position${P.length === 1 ? '' : 's'} · ${money(total, { cents: false })}</span></header>
        ${srcs.map((src, j) => `<div class="batch-row"><label class="field"><span>${esc(src || 'Into')}</span><select data-bsrc="${k}|${j}">${invAccountOptions(it.srcMap[src])}</select></label>
          ${it.srcMap[src] === '__new' ? `<label class="field"><span>New account name</span><input data-bsrcname="${k}|${j}" value="${esc(it.srcNames?.[src] ?? (src || 'Brokerage'))}"></label>` : ''}</div>`).join('')}
        <p class="muted small">Replaces the current holdings in ${srcs.length === 1 ? 'that account' : 'those accounts'} with this snapshot.</p></section>`;
    }
    const c = batchCounts(it), rows = it.txRows || [], dates = rows.map(r => r.date).sort();
    if (it.include) nTx += c.add;
    const kind = { ofx: 'QFX/OFX', csv: 'CSV', pdf: 'PDF statement', qif: 'QIF' }[it.source] || 'File';
    const bal = it.ofx?.balance;
    return `<section class="batch-item ${it.include ? '' : 'off'}">${head}
        <span class="muted small">${kind}${dates.length ? ` · ${dateLabel(dates[0], true)} to ${dateLabel(dates[dates.length - 1], true)}` : ''}</span></header>
      <div class="batch-row">
        <label class="field"><span>Into</span><select data-bacct="${k}">${txnAccountOptions(it.accountId)}</select></label>
        <span class="muted small batch-why">${it.accountId === '__new' ? 'No match yet. Ọrọ̀ will remember this file next time.' : it.matchedBy ? `Matched: ${esc(it.matchedBy)}` : ''}</span>
      </div>
      ${it.accountId === '__new' ? `<div class="batch-new">${newAccountFields(`b${k}-new`, it.newDefaults || {})}</div>` : ''}
      <p class="batch-counts"><strong>${c.add.toLocaleString()} new</strong>${c.dup ? ` · ${c.dup} already in Ọrọ̀` : ''}${c.unc ? ` · ${c.unc} need a category` : ''}${it.autoFlipped ? ' · <span class="tag soft">signs flipped: this file listed purchases as positive</span>' : ''}</p>
      <div class="toolbar">
        ${c.maybe ? `<label class="check small"><input type="checkbox" data-bmaybe="${k}" ${c.maybeIn ? 'checked' : ''}> Also add ${c.maybe} possible duplicate${c.maybe === 1 ? '' : 's'}</label>` : ''}
        ${bal && isFinite(bal.amount) ? `<label class="check small"><input type="checkbox" data-bbal="${k}" ${it.setBal !== false ? 'checked' : ''}> Set balance to ${money(Math.abs(bal.amount))} as of ${dateLabel(bal.date, true)}</label>` : ''}
        ${it.source !== 'ofx' ? `<button class="btn small ghost" data-imp="bflip-${k}">Flip signs</button>` : ''}
      </div>
      ${c.add ? `<details><summary class="small">Preview</summary><table class="ledger compact"><tbody>${rows.filter(r => r.include).slice(0, 8).map(r => `<tr><td class="nowrap">${dateLabel(r.date, true)}</td><td>${esc(prettyPayee(r.payee))}</td><td class="muted small">${r.categoryId ? esc(catName(r.categoryId)) : 'Uncategorized'}</td><td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('')}</tbody></table>${c.add > 8 ? `<p class="muted small">and ${c.add - 8} more</p>` : ''}</details>` : ''}
    </section>`;
  }).join('');
  const nFiles = items.filter(it => it.include && !it.problem && !it.solo).length;
  box.innerHTML = `<p class="lede">${items.length} files. Check where each one goes, then import them together. Duplicates are skipped automatically.</p><div class="batch-list">${cards}</div>`;
  box.onchange = e => {
    const el = e.target, d = el.dataset;
    const at = s => s.split('|').map(Number);
    if (d.binc != null) { items[+d.binc].include = el.checked; return renderImport(); }
    if (d.bacct != null) {
      const it = items[+d.bacct]; it.accountId = el.value; it.matchedBy = el.value && el.value !== '__new' ? 'chosen by you' : '';
      if (el.value === '__new' && !it.newDefaults?.name) { const type = guessTypeFromName(it.fileName); it.newDefaults = { name: suggestAccountName(it, type), type, inst: '' }; }
      if (it.autoFlipped) { it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount })); it.flipped = !it.flipped; it.autoFlipped = false; }
      rebuildItem(it); autoFlipForCard(it); return renderImport();
    }
    const nm = /^b(\d+)-new-(name|type|inst)$/.exec(el.id || '');
    if (nm) { const it = items[+nm[1]]; it.newDefaults = { ...(it.newDefaults || {}), [nm[2]]: el.value }; if (nm[2] === 'type') { rebuildItem(it); renderImport(); } return; }
    if (d.bmaybe != null) { const it = items[+d.bmaybe]; it.txRows.forEach(r => { if (r.status === 'maybe') r.include = el.checked; }); return renderImport(); }
    if (d.bbal != null) { items[+d.bbal].setBal = el.checked; return; }
    if (d.bsrc != null) { const [k, j] = at(d.bsrc), it = items[k]; it.srcMap[Object.keys(it.srcMap)[j]] = el.value; return renderImport(); }
    if (d.bsrcname != null) { const [k, j] = at(d.bsrcname), it = items[k]; (it.srcNames = it.srcNames || {})[Object.keys(it.srcMap)[j]] = el.value; return; }
  };
  const parts = [];
  if (nTx) parts.push(`${nTx.toLocaleString()} transaction${nTx === 1 ? '' : 's'}`);
  if (nPosFiles) parts.push(`${nPosFiles} holdings file${nPosFiles === 1 ? '' : 's'}`);
  setModalActions(`<button class="btn ghost" data-imp="back">Start over</button><button class="btn primary" data-imp="bcommit" ${nFiles ? '' : 'disabled'}>${parts.length ? `Import ${parts.join(' and ')}` : 'Nothing to import'}</button>`);
}

function batchAction(act) {
  const k = +act.split('-')[1];
  if (act.startsWith('bflip-')) {
    const it = IMP.items[k];
    if (it.source === 'pdf') { it.flipAll = !it.flipAll; } else it.rawList = it.rawList.map(r => ({ ...r, amount: -r.amount }));
    it.flipped = !it.flipped; it.autoFlipped = false;
    rebuildItem(it); return renderImport();
  }
  if (act.startsWith('bsolo-')) { const file = IMP.items[k].file; IMP = { step: 'pick', kind: 'txns' }; return handleImportFile(file); }
  if (act === 'bcommit') return commitBatch();
}

function commitBatch() {
  const items = IMP.items.filter(it => it.include && !it.problem && !it.solo);
  for (const it of items) {
    if (it.kind === 'positions') continue;
    const problem = txItemProblem(it);
    if (problem) return toast(`${it.fileName}: ${problem}`);
  }
  let added = 0, skipped = 0, unc = 0, holdings = 0, bal = false;
  const accts = new Set(), posAccts = new Set(), fresh = [];
  for (const it of items) {
    if (it.kind === 'positions') { const r = applyPositionsItem(it); holdings += r.count; r.accounts.forEach(a => posAccts.add(a)); continue; }
    const r = applyTxItem(it);
    added += r.added; skipped += r.skipped; unc += r.unc; if (r.bal) bal = true;
    Object.values(r.dest).forEach(a => accts.add(a.id)); fresh.push(...r.fresh);
  }
  closeModal(); IMP = null;
  commit();
  const bits = [];
  if (added || accts.size) bits.push(`Imported ${added.toLocaleString()} transaction${added === 1 ? '' : 's'} into ${accts.size} account${accts.size === 1 ? '' : 's'}`);
  if (posAccts.size) bits.push(`${bits.length ? 'updated' : 'Updated'} ${holdings} holding${holdings === 1 ? '' : 's'} in ${posAccts.size} account${posAccts.size === 1 ? '' : 's'}`);
  toast(`${bits.join(' and ')}.${skipped ? ` Skipped ${skipped} already there.` : ''}${unc ? ` ${unc} need a category.` : ''}`,
    unc ? { label: 'Categorize', fn: () => go('#/transactions?cat=_none&m=all') } : { label: 'Undo', fn: undo });
  if (fresh.some(a => a.ledger && !a.anchorBalance && !bal)) setTimeout(() => toast('Set each new account’s current balance (Accounts › Update balances) so its balance tracks from here.'), 400);
}

/* ================= shared UI: router, shell, modal, toast, visual helpers ================= */
const UI = { nwRange: '12', lens: '', mode: 'detailed' };
try { UI.mode = localStorage.getItem('keel.mode') || 'detailed'; UI.lens = sessionStorage.getItem('keel.lens') || ''; } catch (e) { /* storage blocked */ }

const PAGES = [
  ['overview', 'Overview', ''], ['transactions', 'Transactions', ''], ['budget', 'Budget', ''], ['cashflow', 'Cash flow', ''],
  ['accounts', 'Accounts', 'Wealth'], ['investments', 'Investments', 'Wealth'], ['property', 'Property', 'Wealth'],
  ['reports', 'Reports', 'Plan'], ['planning', 'Planning', 'Plan'], ['taxes', 'Taxes', 'Plan'], ['review', 'Monthly review', 'Plan'],
  ['data', 'Settings', 'end'],
];
const LENS_PAGES = new Set(['overview', 'transactions', 'reports']);
/* iPhone and iPad portrait: four main sections in a tab bar at the bottom, everything else under More */
const TAB_PAGES = ['overview', 'transactions', 'budget', 'accounts'];
const TAB_ICONS = {
  overview: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
  transactions: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  budget: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5V12l5.3 5.3"/>',
  accounts: '<path d="M4 9.5 12 5l8 4.5M5.5 10v7M9.8 10v7M14.2 10v7M18.5 10v7M4 19.5h16"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
};
const tabIcon = k => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${TAB_ICONS[k]}</svg>`;
const isTouch = () => { try { return matchMedia('(hover: none)').matches; } catch (e) { return false; } };
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'overview';
  const [page, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { page: PAGES.some(p => p[0] === page) ? page : 'overview', params };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function setParam(k, v) {
  const { page, params } = route();
  if (v === '' || v == null) delete params[k]; else params[k] = v;
  const qs = new URLSearchParams(params).toString();
  history.replaceState(null, '', `#/${page}${qs ? '?' + qs : ''}`);
  render();
}

/* ---------- household members ---------- */
const members = () => state.settings.members || [{ id: 'joint', name: 'Joint' }];
const memberName = id => members().find(m => m.id === id)?.name || 'Joint';
const memberColor = id => { const i = members().findIndex(m => m.id === id); return `var(--c${((i < 0 ? 0 : i) % 8) + 1})`; };
function personOf(t) { return t.person || acctById(t.accountId)?.owner || 'joint'; }
function lensed(txs) { return UI.lens ? txs.filter(t => personOf(t) === UI.lens) : txs; }
function memberOptions(sel, inherit) {
  return (inherit ? `<option value="">${esc(inherit)}</option>` : '') + members().map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function render() {
  if (!$('#main')) return;
  invalidate();
  const ae = document.activeElement;
  let focusSel = null;
  if (ae && ae !== document.body && $('#main')?.contains(ae)) {
    if (ae.id) focusSel = '#' + CSS.escape(ae.id);
    else { const k = Object.keys(ae.dataset)[0]; if (k) focusSel = `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(ae.dataset[k])}"]`; }
  }
  const { page, params } = route();
  for (const k in ChartSpecs) delete ChartSpecs[k];
  document.body.classList.toggle('simple', UI.mode === 'simple');
  document.body.classList.toggle('privacy', !!state.settings.privacy);
  let html;
  try { html = VIEWS[page](params); }
  catch (e) { console.error(e); html = `<div class="notice bad">This page hit an error: ${esc(e.message)}. Your data is safe; try another page or reload.</div>`; }
  $('#main').innerHTML = html;
  for (const t of $$('#main table.ledger')) {
    if (t.parentElement.classList.contains('scroll-table')) continue;
    const w = document.createElement('div'); w.className = 'scroll-table'; t.replaceWith(w); w.appendChild(t);
  }
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  $$('#tabbar [data-tab-page]').forEach(a => { const on = a.dataset.tabPage === page || (a.dataset.tabPage === 'more' && !TAB_PAGES.includes(page)); a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = `${PAGES.find(p => p[0] === page)[1]} · Ọrọ̀`;
  paintTopbar(page);
  drawCharts($('#main'));
  if (focusSel) {
    const el = $(focusSel, $('#main'));
    // On iPhone and iPad, focusing a dropdown opens its picker again, so dropdowns aren't refocused there
    if (el && el.focus && !(isTouch() && el.tagName === 'SELECT')) { el.focus(); if (el.setSelectionRange && /text|search/.test(el.type)) { const n = el.value.length; el.setSelectionRange(n, n); } }
  }
  paintStatus();
  if (page === 'data') paintBackups();
}

function buildShell() {
  let html = '', group = null;
  for (const [id, label, g] of PAGES) {
    if (g !== group) { if (g && g !== 'end') html += `<span class="nav-group">${esc(g)}</span>`; if (g === 'end') html += '<span class="nav-spacer"></span>'; group = g; }
    html += `<a href="#/${id}" data-page="${id}">${label}</a>`;
  }
  $('#nav').innerHTML = html;
  const tb = $('#tabbar');
  if (tb) tb.innerHTML = TAB_PAGES.map(id => `<a href="#/${id}" data-tab-page="${id}">${tabIcon(id)}<span>${PAGES.find(p => p[0] === id)[1]}</span></a>`).join('')
    + `<button type="button" data-act="more-pages" data-tab-page="more">${tabIcon('more')}<span>More</span></button>`;
}
/* The More sheet on iPhone: the pages that aren't in the tab bar, plus Money date */
function morePagesSheet() {
  const { page } = route();
  const desc = { cashflow: 'Bills, paychecks and the next 90 days', investments: 'Holdings, allocation and fees', property: 'Home, rental and other assets', reports: 'Cash flow, spending, income statement', planning: 'Retirement, goals, debt payoff', taxes: 'Schedule E and deductions for your CPA', review: 'Close out the month together', data: 'Sync, security, household, rules' };
  const links = PAGES.filter(([id]) => !TAB_PAGES.includes(id)).map(([id, label]) => `<a class="more-link ${id === page ? 'on' : ''}" href="#/${id}" data-close><strong>${label}</strong><span>${desc[id] || ''}</span></a>`).join('');
  openModal({ title: 'More', body: `<div class="more-list">${links}</div>
    <div class="more-row"><button class="btn money-date-btn" data-act="more-money-date">Money date</button>
    <div class="seg mode" role="group" aria-label="Detail level"><button class="${UI.mode === 'simple' ? 'on' : ''}" data-mode="simple">Simple</button><button class="${UI.mode === 'detailed' ? 'on' : ''}" data-mode="detailed">Detailed</button></div></div>` });
  $('#modal')?.classList.add('sheet');
}
function paintTopbar(page) {
  const tb = $('#topbar'); if (!tb) return;
  const lensOn = LENS_PAGES.has(page) || page === 'overview';
  tb.innerHTML = `
    <button class="search-btn" data-act="palette" aria-label="Search or jump to (Command K)"><span>Search or jump to…</span><kbd>⌘K</kbd></button>
    <div class="tb-right">
      ${members().length > 1 ? `<label class="lens ${UI.lens ? 'on' : ''} ${lensOn ? '' : 'dim'}" title="${lensOn ? 'Show spending for one person' : 'The household lens applies to Overview, Transactions and Reports'}">
        <span class="sr">Household lens</span>
        <select id="lens-select" aria-label="Whose spending">${`<option value="">Everyone</option>` + members().map(m => `<option value="${m.id}" ${UI.lens === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}
      <div class="seg mode" role="group" aria-label="Detail level">
        <button class="${UI.mode === 'simple' ? 'on' : ''}" data-mode="simple">Simple</button><button class="${UI.mode === 'detailed' ? 'on' : ''}" data-mode="detailed">Detailed</button>
      </div>
      <button class="btn small money-date-btn" data-act="money-date" title="Walk through a month together, one screen at a time">Money date</button>
      <button class="icon-btn eye" data-act="privacy" aria-pressed="${state.settings.privacy ? 'true' : 'false'}" title="${state.settings.privacy ? 'Show amounts' : 'Hide amounts'} (⇧P)">${state.settings.privacy ? EYE_OFF : EYE}</button>
    </div>`;
  const st = $('#side-tools');
  if (st) st.innerHTML = `<button class="icon-btn" data-act="palette" aria-label="Search">${SEARCH_ICON}</button><button class="icon-btn eye" data-act="privacy" aria-pressed="${state.settings.privacy ? 'true' : 'false'}" aria-label="${state.settings.privacy ? 'Show amounts' : 'Hide amounts'}">${state.settings.privacy ? EYE_OFF : EYE}</button>`;
}
const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.1 6.1C3.6 7.8 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

/* ---------- status in the sidebar ---------- */
function paintStatus() {
  const el = $('#save-status'); if (!el) return;
  let text, tone = 'ok', action = '';
  if (Store.status === 'saving') text = 'Saving…';
  else if (Store.status === 'error') { text = 'Couldn’t save'; tone = 'bad'; }
  else if ((Store.dir || Store.handle) && Store.perm !== 'granted') { text = `Reconnect ${Store.fileName}`; tone = 'warn'; action = 'reconnect'; }
  else if (isCompanion() && SYNC.rec) {
    const n = SYNC.rec.replaced ? 0 : syncPending().length;
    action = 'sync';
    if (SYNC.rec.replaced) { text = 'Not matched to your Mac'; tone = 'warn'; }
    else if (n) { text = `${changesWord(n)} to send to Mac`; tone = 'warn'; }
    else text = SYNC.rec.macSaveNo ? `Mac save ${SYNC.rec.macSaveNo} · ${shortWhen(SYNC.rec.macSaved)}` : `Mac copy · ${shortWhen(SYNC.rec.macSaved)}`;
  }
  else if (isCompanion()) { text = `Saved on this ${deviceLabel()} only`; tone = 'warn'; action = 'sync'; }
  else if (Store.dir) text = `Saved to ${Store.fileName} folder${state.meta.saveNo ? ` · save ${state.meta.saveNo}` : ''}`;
  else if (Store.handle) text = `Saved to ${Store.fileName}`;
  else { text = 'Saved in this browser only'; tone = 'warn'; }
  el.className = 'save-status ' + tone;
  el.innerHTML = `<span class="dot"></span><span>${esc(text)}${Store.key ? ' <span class="lock" title="Encrypted with your passphrase">encrypted</span>' : ''}</span>`;
  el.dataset.action = action;
  el.title = action === 'reconnect' ? 'Click to give Ọrọ̀ permission to keep saving' : action === 'sync' ? 'Sync with your Mac' : (Store.savedAt ? `Last saved ${Store.savedAt.toLocaleTimeString()}` : '');
}

/* ---------- modal ---------- */
let _modalResolve = null;
function openModal({ title, body, actions, wide, id }) {
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" ${id ? `data-id="${id}"` : ''}>
      <header class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></header>
      <div class="modal-body">${body}</div>
      <footer class="modal-foot">${actions || ''}</footer></div>`;
  document.body.appendChild(wrap);
  holdPage(true); fitModal();
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeModal(); });
  // on a touch screen, don't pop the keyboard up until a field is tapped (the passphrase box is the exception)
  setTimeout(() => { const f = isTouch() ? wrap.querySelector('input[type=password][autofocus]') : wrap.querySelector('[autofocus], input:not([type=checkbox]):not([type=file]), select, textarea'); if (f) f.focus(); }, 30);
  return wrap;
}
function setModalActions(html) { const f = $('#modal .modal-foot'); if (f) f.innerHTML = html; }
function closeModal(silent) {
  const m = $('#modal'); if (m) m.remove();
  holdPage(false);
  if (!silent && _modalResolve) { const r = _modalResolve; _modalResolve = null; r(null); }
}
function confirmBox(title, text, okLabel = 'Continue', danger) {
  return new Promise(res => {
    openModal({ title, body: `<p>${text}</p>`, actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="confirm-ok">${esc(okLabel)}</button>` });
    _modalResolve = res;
    $('#confirm-ok').onclick = () => { _modalResolve = null; closeModal(true); res(true); };
  });
}
function promptPass(title, text, opts = {}) {
  return new Promise(res => {
    openModal({ title, body: `<p>${text}</p><label class="field"><span>Passphrase</span><input type="password" id="pp1" autocomplete="${opts.confirm ? 'new-password' : 'current-password'}" autofocus></label>${opts.confirm ? `<label class="field"><span>Type it again</span><input type="password" id="pp2" autocomplete="new-password"></label>` : ''}<p class="notice small" id="pp-err" hidden></p>`,
      actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="pp-ok">${esc(opts.ok || 'Unlock')}</button>` });
    _modalResolve = res;
    const ok = () => {
      const a = $('#pp1').value, b = opts.confirm ? $('#pp2').value : a;
      const err = $('#pp-err');
      if (!a) { err.hidden = false; err.textContent = 'Enter a passphrase.'; return; }
      if (opts.confirm && a.length < 8) { err.hidden = false; err.textContent = 'Use at least 8 characters.'; return; }
      if (a !== b) { err.hidden = false; err.textContent = 'Those don’t match.'; return; }
      _modalResolve = null; closeModal(true); res(a);
    };
    $('#pp-ok').onclick = ok;
    $$('#modal input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') ok(); });
  });
}

/* ---------- toast ---------- */
function toast(text, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(text)}</span>${action ? `<button class="btn small">${esc(action.label)}</button>` : ''}<button class="icon-btn" aria-label="Dismiss">×</button>`;
  $('#toasts').appendChild(t);
  while ($$('#toasts .toast').length > 3) $('#toasts .toast').remove();
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  if (action) t.querySelector('.btn').onclick = () => { action.fn(); kill(); };
  t.querySelector('.icon-btn').onclick = kill;
  setTimeout(kill, action ? 9000 : 4500);
}

/* ---------- small builders ---------- */
function catOptions(sel, includeNone = true, filter) {
  const groups = groupBy(state.categories.filter(c => !filter || filter(c)), c => c.group);
  return (includeNone ? `<option value="" ${!sel ? 'selected' : ''}>Uncategorized</option>` : '') +
    Object.entries(groups).map(([g, cs]) => `<optgroup label="${esc(g)}">${cs.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}
function acctOptions(sel, filter, emptyLabel) {
  return (emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : '') +
    activeAccounts().filter(a => !filter || filter(a)).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}
const amt = (n, opts) => `<span class="num ${signClass(n)}">${money(n, opts)}</span>`;
const ORO_BUILD = '1ff8b3f';
const ORO_MEANING = 'Yoruba for wealth', ORO_TAGLINE = 'Know your wealth. Keep it close.';
// the wordmark: real text for Classic and screen readers; the Ọrọ̀ look draws its two under-dots as brass coins
const BRAND_MARK = '<span class="bm-cl">Ọrọ̀</span><span class="bm-ng" aria-hidden="true"><span>O<i></i></span>r<span>ò<i></i></span></span>';
/* A quiet sign-off at the foot of the overview. */
function colophon() { return `<footer class="colophon"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}. <em>${ORO_TAGLINE}</em></footer>`; }
function pageHead(title, sub, actions = '') {
  return `<header class="page-head"><div><h1>${esc(title).replace(/Ọrọ̀/g, '<span class="wordmark">Ọrọ̀</span>')}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions}</div></header>`;
}
function lensNote() { return UI.lens ? `<p class="lens-note">Showing ${esc(memberName(UI.lens))}’s spending only. <button class="linklike" data-lens="">Show everyone</button></p>` : ''; }
function monthNav(mk, param = 'm') {
  return `<div class="month-nav" role="group" aria-label="Month">
    <button class="icon-btn" data-month="${addMonths(mk, -1)}" data-param="${param}" aria-label="Previous month">‹</button>
    <span class="month-label">${monthLabel(mk)}</span>
    <button class="icon-btn" data-month="${addMonths(mk, 1)}" data-param="${param}" aria-label="Next month" ${mk >= thisMonth() ? 'disabled' : ''}>›</button></div>`;
}
function bar(actual, budget, opts = {}) {
  const share = budget > 0 ? actual / budget : (actual > 0 ? 1 : 0);
  const over = budget > 0 && actual > budget * 1.0001;
  const pace = opts.pace != null && budget > 0 ? clamp(opts.pace / budget, 0, 1) : null;
  return `<div class="meter ${over ? 'over' : ''}" title="${pct(share, 0)} of budget"><span style="width:${clamp(share, 0, 1) * 100}%"></span>${pace != null ? `<i style="left:${pace * 100}%" title="Where you’d be on an even pace"></i>` : ''}</div>`;
}
/* Progress ring (inline SVG). */
function ring(share, opts = {}) {
  const s = opts.size || 64, w = opts.width || 7, r = (s - w) / 2, c = 2 * Math.PI * r, p = clamp(share, 0, 1);
  const color = opts.color || (share > 1.0001 ? 'var(--neg)' : 'var(--ink-accent)');
  return `<svg class="ring" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${pct(share, 0)}">
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="var(--rule)" stroke-width="${w}"/>
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${s / 2} ${s / 2})"/>
    ${opts.label != null ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-label">${esc(opts.label)}</text>` : ''}</svg>`;
}
/* Sparkline (inline SVG). */
function sparkline(values, opts = {}) {
  const w = opts.w || 90, h = opts.h || 24, n = values.length;
  if (n < 2 || values.every(v => !v)) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
  const lo = Math.min(0, ...values), hi = Math.max(...values) || 1;
  const X = i => 1 + (i / (n - 1)) * (w - 2), Y = v => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${X(n - 1)},${h}L${X(0)},${h}Z" class="spark-area" style="fill:${opts.color || 'var(--ink-accent)'}"/><path d="${d}" fill="none" stroke="${opts.color || 'var(--ink-accent)'}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${X(n - 1)}" cy="${Y(values[n - 1])}" r="2" fill="${opts.color || 'var(--ink-accent)'}"/></svg>`;
}
function deltaChip(now, then, opts = {}) {
  if (then == null || !isFinite(then)) return '';
  const d = now - then, good = opts.inverse ? d < 0 : d > 0;
  if (Math.abs(d) < 0.5) return '<span class="chip flat">no change</span>';
  return `<span class="chip ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${money(Math.abs(d), { cents: false })}${opts.pct && then ? ` · ${pct(Math.abs(d / then), 0)}` : ''}</span>`;
}
function formData(root) {
  const o = {};
  $$('[name]', root).forEach(el => { o[el.dataset.key || el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}
/* iPhone and iPad: while a dialog is open, hold the page behind it still and keep the dialog inside the part of the
   screen the keyboard doesn't cover. Otherwise iOS scrolls the page under the dialog and draws the cursor in the wrong place. */
function holdPage(on) {
  const b = document.body;
  if (!isTouch()) return;
  if (on && !b.classList.contains('page-held')) { b.dataset.heldY = String(window.scrollY); b.style.top = `-${window.scrollY}px`; b.classList.add('page-held'); }
  else if (!on && b.classList.contains('page-held')) { const y = +b.dataset.heldY || 0; b.classList.remove('page-held'); b.style.top = ''; window.scrollTo(0, y); }
}
function fitModal() {
  const w = $('#modal'), vv = window.visualViewport;
  if (!w || !vv || !isTouch()) return;
  w.style.top = `${vv.offsetTop}px`; w.style.height = `${vv.height}px`; w.style.bottom = 'auto';
}
if (window.visualViewport) { visualViewport.addEventListener('resize', fitModal); visualViewport.addEventListener('scroll', fitModal); }
function emptyState(title, text, actions) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${text}</p><div class="actions">${actions || ''}</div></div>`;
}
function staleTag(date, days = state.settings.staleDays || 35) {
  if (!date) return '<span class="tag">No date</span>';
  const d = daysBetween(date, today());
  return d > days ? `<span class="tag warn" title="Updated ${d} days ago">${dateLabel(date)}</span>` : `<span class="muted">${dateLabel(date)}</span>`;
}
function tabs(param, current, list) {
  return `<nav class="tabs" role="tablist">${list.map(([id, label]) => `<button role="tab" aria-selected="${id === current}" class="${id === current ? 'on' : ''}" data-tab="${id}" data-param="${param}">${esc(label)}</button>`).join('')}</nav>`;
}

const VIEWS = {};

/* Plain-English observations used by the Simple view and Money date. */
function insights(mk = thisMonth(), opts = {}) {
  const out = [];
  const isCur = mk === thisMonth();
  const now = new Date();
  const dim = +monthEnd(mk).slice(8), dayN = isCur ? now.getDate() : dim, dayShare = dayN / dim;
  const billCats = new Set(state.recurring.map(r => r.categoryId));
  const fixed = c => billCats.has(c.id) || c.rental === 'debt' || [1, 2, 3].every(i => txInMonth(addMonths(mk, -i)).filter(t => txHasCat(t, c.id)).length <= 1);
  for (const c of state.categories.filter(c => c.kind === 'expense' && c.budget > 0)) {
    const v = budgetView(c, mk);
    if (fixed(c) && v.period !== 'year' && v.available >= -1) continue;
    if (v.period === 'year') { if (v.actual > v.budget) out.push({ tone: 'bad', w: v.actual - v.budget, text: `${c.name} is ${money(v.actual - v.budget, { cents: false })} over its yearly budget.` }); continue; }
    if (v.available < -1) out.push({ tone: 'bad', w: -v.available, text: `${c.name} is ${money(-v.available, { cents: false })} over budget${isCur ? ' this month' : ''}.` });
    else if (isCur && dayShare < 0.85 && v.actual > 100 && v.actual > (v.budget + (v.carry || 0)) * dayShare * 1.3) out.push({ tone: 'warn', w: v.actual - v.budget * dayShare, text: `${c.name} is ahead of pace: ${money(v.actual, { cents: false })} of ${money(v.budget + (v.carry || 0), { cents: false })} with ${dim - dayN} days to go.` });
  }
  const acts = monthActuals(mk);
  for (const c of state.categories.filter(c => c.kind === 'expense' && !c.rental)) {
    const a = acts[c.id] || 0, avg = trailingAvg(c.id, mk, 3);
    if (!isCur && a > 150 && avg > 0 && a > avg * 1.4 && !out.some(o => o.text.startsWith(c.name))) out.push({ tone: 'info', w: (a - avg) / 2, text: `${c.name} came to ${money(a, { cents: false })}, versus a usual ${money(avg, { cents: false })}.` });
  }
  if (isCur) for (const u of upcoming(35).filter(u => u.amount <= -1000 && !/mortgage|rent\b|card payment/i.test(u.name))) out.push({ tone: 'info', w: -u.amount / 3, text: `${u.name} of ${money(-u.amount, { cents: false })} is due ${dateLabel(u.date)}.` });
  for (const g of state.goals) { const p = goalProgress(g); if (p.status === 'behind') out.push({ tone: 'warn', w: 400, text: `${g.name} needs ${money(p.needed, { cents: false })} a month to hit ${dateLabel(g.targetDate, true)}; you’re putting in ${money(g.monthly, { cents: false })}.` }); else if (p.status === 'done') out.push({ tone: 'good', w: 300, text: `${g.name} is fully funded. Nice work.` }); }
  for (const d of detectRepeating().filter(d => d.isNew)) out.push({ tone: 'info', w: d.monthly * 6, text: `New subscription: ${d.payee}, ${money(d.monthly)} a month (${money(d.monthly * 12, { cents: false })} a year).` });
  const f = flowSummary(txInMonth(mk)), avgRate = (() => { const xs = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i)))); const inc = sum(xs.map(x => x.income)), sp = sum(xs.map(x => x.spending)); return inc ? (inc - sp) / inc : NaN; })();
  if (!isCur && isFinite(f.rate) && isFinite(avgRate) && Math.abs(f.rate - avgRate) > 0.05) out.push({ tone: f.rate > avgRate ? 'good' : 'warn', w: 500, text: `You kept ${pct(f.rate, 0)} of income, ${f.rate > avgRate ? 'better than' : 'below'} the recent ${pct(avgRate, 0)}.` });
  return out.sort((a, b) => b.w - a.w).slice(0, opts.limit || 5);
}

/* ================= Overview ================= */
VIEWS.overview = () => {
  const d = new Date();
  const sub = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!state.accounts.length) {
    if (isCompanion()) return pageHead('Welcome to Ọrọ̀', sub) + `<div class="welcome">
      <div class="welcome-copy"><p class="welcome-kicker"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}.</p><h2>${ORO_TAGLINE}</h2>
        <p>On this ${deviceLabel()}, Ọrọ̀ works from the data your Mac keeps in iCloud Drive, so it stays on your devices and in your iCloud. Nothing is uploaded anywhere else.</p>
        <ol class="steps"><li><strong>Open your Mac’s data:</strong> choose <strong>iCloud Drive › Ọrọ̀ › data › oro.json</strong>.</li>
        <li><strong>Review, import or add transactions</strong> here as you go.</li>
        <li><strong>Send your changes</strong> back to your Mac. They’re added the next time Ọrọ̀ is open there.</li></ol>
        <div class="actions"><button class="btn primary" data-act="sync-open">Open from iCloud Drive</button><button class="btn ghost" data-act="load-sample">Explore with sample data</button></div></div></div>`;
    return pageHead('Welcome to Ọrọ̀', sub) + `<div class="welcome">
      <div class="welcome-copy"><p class="welcome-kicker"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}.</p><h2>${ORO_TAGLINE}</h2>
        <p>Your budget, net worth, investments, property and plans in one place that never leaves your own devices. Nothing is uploaded, and there’s no subscription.</p>
        <ol class="steps"><li><strong>Choose your Ọrọ̀ folder</strong> so everything is saved as files with daily backups. <button class="linklike" data-act="connect-folder">Choose folder</button></li>
        <li><strong>Add your accounts</strong>, or import a statement from your bank, card or brokerage.</li>
        <li><strong>Set a few budgets and goals</strong>, then use Money date to go over the month together.</li></ol>
        <div class="actions"><button class="btn primary" data-act="add-account">Add an account</button><button class="btn" data-act="import">Import a file</button><button class="btn ghost" data-act="load-sample">Explore with sample data</button></div></div></div>`;
  }
  return (UI.mode === 'simple' ? overviewSimple(sub) : overviewDetailed(sub)) + colophon();
};

function spendByGroup(txs) {
  const acts = categoryActuals(txs), g = {};
  for (const [id, v] of Object.entries(acts)) { if (v <= 0) continue; const c = catById(id); if (id === '_none') g.Uncategorized = (g.Uncategorized || 0) + v; else if (c && c.kind === 'expense') g[c.group] = (g[c.group] || 0) + v; }
  return Object.entries(g).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
function donutItems(groups, max = 7) {
  const top = groups.slice(0, max), rest = sum(groups.slice(max).map(x => x.value));
  const items = top.map((x, i) => ({ ...x, color: `var(--c${(i % 8) + 1})` }));
  if (rest > 0) items.push({ label: 'Everything else', value: rest, color: 'var(--muted-2)' });
  return items;
}
function legendList(items, total) {
  return `<ul class="legend-list">${items.map(i => `<li><i style="background:${i.color}"></i><span>${esc(i.label)}</span><span class="num">${money(i.value, { cents: false })}</span><span class="num muted">${pct(i.value / total, 0)}</span></li>`).join('')}</ul>`;
}
function monthlySeries(fn, n = 12) { return Array.from({ length: n }, (_, i) => fn(addMonths(thisMonth(), i - n + 1))); }

function overviewDetailed(sub) {
  const t = totals(), mk = thisMonth(), prev = addMonths(mk, -1);
  const prevNW = snapshotNW(prev);
  const series = netWorthSeries();
  const shown = UI.nwRange === 'all' ? series : series.slice(-13);
  const txs = lensed(txInMonth(mk));
  const f = flowSummary(txs);
  const groups = spendByGroup(txs), items = donutItems(groups), spendTotal = sum(groups.map(g => g.value));
  const billCats = new Set(state.recurring.map(r => r.categoryId));
  const dim = +monthEnd(mk).slice(8), dayShare = new Date().getDate() / dim;
  const budgeted = state.categories.filter(c => c.kind === 'expense' && c.budget > 0 && c.period !== 'year' && !c.rental && !billCats.has(c.id))
    .map(c => ({ c, v: budgetView(c, mk) })).sort((a, b) => (b.v.actual / (b.v.budget + (b.v.carry || 0) || 1)) - (a.v.actual / (a.v.budget + (a.v.carry || 0) || 1))).slice(0, 6);
  const up = upcoming(14), att = attentionItems();
  const planned = sum(state.categories.filter(c => c.kind === 'expense').map(c => c.period === 'year' ? (c.budget || 0) / 12 : (c.budget || 0)));
  const spendSeries = monthlySeries(m => flowSummary(lensed(txInMonth(m))).spending);
  const keptSeries = monthlySeries(m => flowSummary(lensed(txInMonth(m))).net);
  const cashSeries = monthlySeries(m => { const s = state.snapshots[m] || {}; return sum(Object.entries(s).filter(([id]) => ACCOUNT_TYPES[acctById(id)?.type]?.bucket === 'cash').map(([, v]) => v)); });
  const invSeries = monthlySeries(m => { const s = state.snapshots[m] || {}; return sum(Object.entries(s).filter(([id]) => ['invest'].includes(ACCOUNT_TYPES[acctById(id)?.type]?.bucket)).map(([, v]) => v)); });
  const fc = forecast(60);
  const days = {};
  for (const tx of lensed(txInRange(addDays(today(), -53 * 7), today()))) for (const l of txLines(tx)) { const c = catById(l.categoryId); if ((c && c.kind === 'expense' && !c.rental && !/Mortgage|Auto payment|Childcare/.test(c.name)) || (!c && l.amount < 0)) days[tx.date] = (days[tx.date] || 0) - l.amount; }
  const goals = state.goals.slice(0, 4);

  return pageHead('Overview', sub, `<button class="btn" data-act="import">Import</button><button class="btn primary" data-act="add-txn">Add transaction</button>`) + lensNote() + `
  <section class="hero">
    <div class="hero-figure">
      <span class="hero-label">Net worth</span>
      <span class="hero-num num">${money(t.netWorth, { cents: false })}</span>
      <span class="hero-delta">${prevNW == null ? '<span class="muted">History builds month by month. Add past balances from each account’s History.</span>' : `${deltaChip(t.netWorth, prevNW, { pct: true })} <span class="muted">since the end of ${MONTHS[+prev.slice(5) - 1]}</span>`}</span>
      <dl class="hero-split">
        <div><dt>Assets</dt><dd class="num">${money(t.assets, { cents: false })}</dd></div>
        <div><dt>Liabilities</dt><dd class="num">${money(t.liabilities, { cents: false })}</dd></div>
        <div><dt>Cash and investments</dt><dd class="num">${money(t.liquid, { cents: false })}</dd></div>
      </dl>
    </div>
    <div class="hero-chart">
      <div class="seg small" role="group" aria-label="Range"><button class="${UI.nwRange === '12' ? 'on' : ''}" data-nwrange="12">1Y</button><button class="${UI.nwRange === 'all' ? 'on' : ''}" data-nwrange="all">All</button></div>
      ${chartHost({ h: 220, label: 'Net worth by month', series: [{ points: shown, color: 'var(--ink-accent)', area: true }], xFmt: x => monthLabel(x, true),
        tip: i => { const p = shown[i], q = shown[i - 1]; return `<strong>${monthLabel(p.x)}</strong><br>${money(p.y, { cents: false })}${q ? `<br><span class="${signClass(p.y - q.y)}">${money(p.y - q.y, { cents: false, sign: true })}</span>` : ''}`; } })}
    </div>
  </section>

  <section class="kpis-row">
    <div class="kpi"><span class="kpi-label">Spent in ${MONTHS[new Date().getMonth()]}</span><span class="kpi-value num">${money(f.spending, { cents: false })}</span><span class="kpi-sub">${planned ? `of ${money(planned, { cents: false })} planned · ${pct(f.spending / planned, 0)}` : 'No budget set'}</span>${sparkline(spendSeries, { color: 'var(--c4)' })}</div>
    <div class="kpi"><span class="kpi-label">Kept this month</span><span class="kpi-value num ${signClass(f.net)}">${money(f.net, { cents: false })}</span><span class="kpi-sub">${isFinite(f.rate) ? `${pct(f.rate, 0)} of income` : 'No income yet'}</span>${sparkline(keptSeries, { color: 'var(--pos)' })}</div>
    <div class="kpi"><span class="kpi-label">Cash on hand</span><span class="kpi-value num">${money(t.cash, { cents: false })}</span><span class="kpi-sub">${state.recurring.length ? `Low of ${money(fc.low.y, { cents: false })} on ${dateLabel(fc.low.x)}` : 'Add bills to forecast'}</span>${sparkline(cashSeries, { color: 'var(--c2)' })}</div>
    <div class="kpi"><span class="kpi-label">Investments</span><span class="kpi-value num">${money(t.invest, { cents: false })}</span><span class="kpi-sub">${(() => { const p = invSeries[invSeries.length - 2]; return p ? `${money(t.invest - p, { cents: false, sign: true })} this month` : '&nbsp;'; })()}</span>${sparkline(invSeries, { color: 'var(--c1)' })}</div>
  </section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Where it went</h2><a href="#/reports?r=spending&p=m">Breakdown</a></header>
      ${items.length ? `<div class="donut-wrap">${chartHost({ type: 'donut', h: 200, items, center: { value: money(spendTotal, { cents: false }), label: 'spent so far' } })}${legendList(items, spendTotal)}</div>` : '<p class="muted">No spending recorded this month yet.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Flexible spending</h2><a href="#/budget">Budget</a></header>
      ${budgeted.length ? `<ul class="meters">${budgeted.map(({ c, v }) => `
        <li><div class="meter-row"><span>${esc(c.name)}${c.rollover ? ' <span class="tag soft">rolls over</span>' : ''}</span><span class="num ${v.available < 0 ? 'neg' : ''}">${money(v.actual, { cents: false })} <span class="muted">of ${money(v.budget + (v.carry || 0), { cents: false })}</span></span></div>${bar(v.actual, v.budget + (v.carry || 0), { pace: (v.budget + (v.carry || 0)) * dayShare })}</li>`).join('')}</ul>
        <p class="muted small">The tick marks an even pace for this point in the month.</p>` : `<p class="muted">No budgets yet. <a href="#/budget">Set targets</a> for the categories you care about.</p>`}
    </section>
  </div>

  <section class="panel">
    <header class="panel-head"><h2>Daily spending</h2><span class="muted small">Darker days mean more spending. Mortgage, rent and other fixed bills are left out.</span></header>
    ${chartHost({ type: 'heatmap', days, weeks: 52 })}
  </section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Coming up</h2><a href="#/cashflow">Calendar</a></header>
      ${up.length ? `<table class="ledger compact"><tbody>${up.slice(0, 8).map(u => `<tr><td class="nowrap muted">${dateLabel(u.date)}</td><td>${esc(u.name)}</td><td class="num ${signClass(u.amount)}">${money(u.amount)}</td></tr>`).join('')}</tbody></table>`
        : `<p class="muted">Nothing scheduled in the next two weeks. Add paychecks and bills on the <a href="#/cashflow">Cash flow</a> page.</p>`}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Needs attention</h2></header>
      ${att.length ? `<ul class="attention">${att.map(a => `<li class="${a.tone}">${a.act ? `<button class="linklike" data-act="${a.act}">${esc(a.text)}</button>` : `<a href="${a.go}">${esc(a.text)}</a>`}</li>`).join('')}</ul>` : '<p class="muted">Everything is categorized, current and on budget.</p>'}
    </section>
  </div>
  ${goals.length ? `<section class="panel"><header class="panel-head"><h2>Goals</h2><a href="#/planning">All goals</a></header><div class="goal-strip">${goals.map(goalTile).join('')}</div></section>` : ''}`;
}

function goalTile(g) {
  const p = goalProgress(g);
  return `<button class="goal-tile" data-edit-goal="${g.id}">${ring(p.share, { size: 74, width: 8, label: pct(p.share, 0), color: p.status === 'behind' ? 'var(--warn)' : p.status === 'done' ? 'var(--pos)' : 'var(--ink-accent)' })}
    <span class="goal-name">${esc(g.name)}</span><span class="goal-sub num">${money(p.current, { cents: false })} of ${money(p.target, { cents: false })}</span>
    <span class="goal-status ${p.status}">${p.status === 'done' ? 'Funded' : p.status === 'behind' ? `Needs ${money(p.needed, { cents: false })}/mo` : p.needed != null ? `${money(p.needed, { cents: false })}/mo to finish` : 'On track'}</span></button>`;
}

function overviewSimple(sub) {
  const t = totals(), mk = thisMonth(), prev = addMonths(mk, -1), prevNW = snapshotNW(prev);
  const who = UI.lens ? memberName(UI.lens) + ' has' : 'We’ve';
  const txs = lensed(txInMonth(mk)), f = flowSummary(txs);
  const planned = sum(state.categories.filter(c => c.kind === 'expense').map(c => c.period === 'year' ? (c.budget || 0) / 12 : (c.budget || 0)));
  const groups = spendByGroup(txs), items = donutItems(groups, 5), total = sum(groups.map(g => g.value));
  const notes = insights(mk, { limit: 4 });
  const up = upcoming(21).filter(u => Math.abs(u.amount) >= 100).slice(0, 5);
  const series = netWorthSeries().slice(-13);
  return `<header class="page-head simple-head"><div><p class="sub">${sub}</p><h1 class="big-sentence">${who} spent <span class="num">${money(f.spending, { cents: false })}</span>${!UI.lens && planned ? ` of the <span class="num">${money(planned, { cents: false })}</span> we planned` : ''} this month.</h1></div></header>
  <section class="simple-cards">
    <div class="s-card"><span class="s-label">Came in</span><span class="s-value num">${money(f.income, { cents: false })}</span><span class="s-sub">${MONTHS[+mk.slice(5) - 1]} so far</span></div>
    <div class="s-card"><span class="s-label">Went out</span><span class="s-value num">${money(f.spending, { cents: false })}</span><span class="s-sub">${planned ? `${pct(Math.min(9.99, f.spending / planned), 0)} of the plan` : '&nbsp;'}</span></div>
    <div class="s-card accent"><span class="s-label">Kept</span><span class="s-value num ${signClass(f.net)}">${money(f.net, { cents: false })}</span><span class="s-sub">${isFinite(f.rate) ? `${pct(f.rate, 0)} of what came in` : '&nbsp;'}</span></div>
  </section>
  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Where it went</h2></header>
      ${items.length ? `<div class="donut-wrap big">${chartHost({ type: 'donut', h: 230, items, center: { value: money(total, { cents: false }), label: 'this month' } })}${legendList(items, total)}</div>` : '<p class="muted">Nothing spent yet this month.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Worth a look</h2></header>
      ${notes.length ? `<ul class="insights">${notes.map(n => `<li class="${n.tone}">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted">Nothing stands out. Everything is on track.</p>'}
    </section>
  </div>
  <div class="cols">
    <section class="panel nw-simple">
      <header class="panel-head"><h2>What we own, minus what we owe</h2></header>
      <span class="s-value num">${money(t.netWorth, { cents: false })}</span>
      <p class="muted">${prevNW == null ? 'History builds month by month.' : `${t.netWorth >= prevNW ? 'Up' : 'Down'} ${money(Math.abs(t.netWorth - prevNW), { cents: false })} since the end of ${MONTHS[+prev.slice(5) - 1]}.`}</p>
      ${chartHost({ h: 150, padL: 50, label: 'Net worth', series: [{ points: series, color: 'var(--ink-accent)', area: true, nodots: true }], xFmt: x => MON[+x.slice(5) - 1], tip: i => `<strong>${monthLabel(series[i].x)}</strong><br>${money(series[i].y, { cents: false })}` })}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Coming up</h2></header>
      ${up.length ? `<ul class="simple-list">${up.map(u => `<li><span class="date-chip">${dateLabel(u.date)}</span><span>${esc(u.name)}</span><span class="num ${signClass(u.amount)}">${money(u.amount, { cents: false })}</span></li>`).join('')}</ul>` : '<p class="muted">No big bills in the next three weeks.</p>'}
    </section>
  </div>
  ${state.goals.length ? `<section class="panel"><header class="panel-head"><h2>Our goals</h2></header><div class="goal-strip">${state.goals.map(goalTile).join('')}</div></section>` : ''}`;
}

/* ================= Transactions ================= */
function parseSearch(q) {
  const out = { text: [], tags: [], min: null, max: null };
  for (const tok of String(q || '').toLowerCase().split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^(?:tag:|#)(.+)$/))) out.tags.push(m[1]);
    else if ((m = tok.match(/^>(\d+(\.\d+)?)$/))) out.min = +m[1];
    else if ((m = tok.match(/^<(\d+(\.\d+)?)$/))) out.max = +m[1];
    else out.text.push(tok);
  }
  return out;
}
/* A memo that only repeats the bank's description isn't worth a second line */
function memoWorthShowing(t) {
  if (!t.memo) return false;
  const m = normPayee(t.memo), r = normPayee(t.rawPayee || t.payee), q = normPayee(t.payee);
  return !!m && m !== r && m !== q && !r.startsWith(m) && !m.startsWith(r);
}
VIEWS.transactions = p => {
  const month = p.m || thisMonth();
  const S = parseSearch(p.q);
  let list = lensed(state.transactions);
  if (month !== 'all') list = list.filter(t => t.date.startsWith(month));
  if (p.acct) list = list.filter(t => t.accountId === p.acct);
  if (p.cat === '_none') list = list.filter(isUncat);
  else if (p.cat) list = list.filter(t => txHasCat(t, p.cat));
  if (p.who) list = list.filter(t => personOf(t) === p.who);
  if (p.tag) list = list.filter(t => (t.tags || []).includes(p.tag));
  if (S.tags.length) list = list.filter(t => S.tags.every(x => (t.tags || []).some(y => y.includes(x))));
  if (S.min != null) list = list.filter(t => Math.abs(t.amount) >= S.min);
  if (S.max != null) list = list.filter(t => Math.abs(t.amount) <= S.max);
  if (S.text.length) list = list.filter(t => { const hay = (t.payee + ' ' + (t.memo || '') + ' ' + (t.rawPayee || '') + ' ' + catName(t.categoryId) + ' ' + (t.tags || []).join(' ') + ' ' + Math.abs(t.amount).toFixed(2)).toLowerCase(); return S.text.every(x => hay.includes(x)); });
  const limit = +p.limit || 250;
  const shown = list.slice(0, limit);
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  if (!months.includes(thisMonth())) months.unshift(thisMonth());
  // Totals leave out transfers (credit card payments, moves between your own accounts), like Overview and Cash flow do
  let inflow = 0, outflow = 0, moved = 0, nMoved = 0;
  for (const t of list) for (const l of txLines(t)) {
    if (isTransferCat(l.categoryId)) { moved += l.amount; nMoved++; } else if (l.amount > 0) inflow += l.amount; else outflow += l.amount;
  }
  inflow = round2(inflow); outflow = round2(outflow); moved = round2(moved);
  const opts = catOptions(null, true);
  const unc = state.transactions.filter(isUncat).length;
  const tags = allTags();
  const multi = members().length > 1;
  const nFilters = ['acct', 'cat', 'who', 'tag'].filter(k => p[k]).length;
  const fOpen = UI.txFilters === undefined ? nFilters > 0 : UI.txFilters;

  return pageHead('Transactions', `${list.length.toLocaleString()} shown${unc ? ` · <a href="#/transactions?cat=_none&m=all">${unc} uncategorized</a>` : ''}`,
    `${unc ? `<button class="btn ghost" data-act="run-rules" title="Fill in uncategorized transactions using your rules, your past choices and Ọrọ̀’s merchant list">Auto-categorize</button>` : ''}<button class="btn" data-act="import">Import</button><button class="btn primary" data-act="add-txn">Add transaction</button>`) + lensNote() + `
  <div class="filters ${fOpen ? 'open' : ''}">
    <label class="field inline"><span>Month</span><select data-filter="m"><option value="all" ${month === 'all' ? 'selected' : ''}>All months</option>${months.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
    <label class="field inline more"><span>Account</span><select data-filter="acct">${acctOptions(p.acct, null, 'All accounts')}</select></label>
    <label class="field inline more"><span>Category</span><select data-filter="cat"><option value="">All categories</option><option value="_none" ${p.cat === '_none' ? 'selected' : ''}>Uncategorized</option>${catOptions(p.cat, false)}</select></label>
    ${multi && !UI.lens ? `<label class="field inline more"><span>Person</span><select data-filter="who"><option value="">Everyone</option>${memberOptions(p.who)}</select></label>` : ''}
    ${tags.length ? `<label class="field inline more"><span>Tag</span><select data-filter="tag"><option value="">Any tag</option>${tags.map(t => `<option ${t === p.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
    <label class="field inline grow"><span>Search</span><input type="search" id="tx-search" data-filter="q" value="${esc(p.q || '')}" placeholder="Payee, memo, #tag, >100"></label>
    <div class="filters-sm"><button class="btn small ghost" data-act="tx-filters" aria-expanded="${fOpen ? 'true' : 'false'}">${fOpen ? 'Fewer filters' : 'More filters'}${nFilters ? ` · ${nFilters} on` : ''}</button>${shown.length ? `<button class="btn small ghost" data-act="tx-select" aria-pressed="${UI.txSelect ? 'true' : 'false'}">${UI.txSelect ? 'Done selecting' : 'Select'}</button>` : ''}</div>
  </div>
  <div class="bulk" id="bulk" hidden>
    <span id="bulk-count"></span>
    <select id="bulk-cat" aria-label="Category">${catOptions(null, true)}</select><button class="btn small" data-act="bulk-cat">Set category</button>
    ${multi ? `<select id="bulk-who" aria-label="Person">${memberOptions('', 'Account owner')}</select><button class="btn small" data-act="bulk-who">Set person</button>` : ''}
    <input id="bulk-tag" placeholder="tag" list="tag-list" style="width:8em"><datalist id="tag-list">${tags.map(t => `<option value="${esc(t)}">`).join('')}</datalist><button class="btn small" data-act="bulk-tag">Add tag</button>
    <button class="btn small ghost danger-text" data-act="bulk-del">Delete</button>
  </div>
  ${shown.length ? `<div class="scroll-table"><table class="ledger tx-table ${UI.txSelect ? 'selecting' : ''}" id="tx-table">
    <thead><tr><th class="cb"><input type="checkbox" id="tx-all" aria-label="Select all shown"></th><th>Date</th><th>Payee</th><th>Category</th>${multi ? '<th class="hide-sm detail-only">Person</th>' : ''}<th class="hide-sm">Account</th><th class="num">Amount</th></tr></thead>
    <tbody>${shown.map(t => {
      const who = personOf(t);
      return `<tr data-id="${t.id}" class="${isUncat(t) ? 'needs' : ''}">
      <td class="cb"><input type="checkbox" class="tx-cb" value="${t.id}" aria-label="Select"></td>
      <td class="nowrap muted tx-date">${dateLabel(t.date)}${t.reconciled ? ' <span class="rec" title="Reconciled">✓</span>' : ''}<span class="tx-acct-sm"> · ${esc(acctById(t.accountId)?.name || '—')}</span></td>
      <td class="tx-payee"><button class="linklike" data-edit-txn="${t.id}">${esc(t.payee || '(no description)')}</button>${t.attachments?.length ? ' <span class="clip" title="Has a receipt">⎘</span>' : ''}
        ${memoWorthShowing(t) || t.tags?.length ? `<div class="tx-meta">${(t.tags || []).map(x => `<button class="tagchip" data-tagfilter="${esc(x)}">#${esc(x)}</button>`).join('')}${memoWorthShowing(t) ? `<span class="muted small">${esc(t.memo)}</span>` : ''}</div>` : ''}</td>
      <td class="tx-cat">${isSplit(t) ? `<button class="split-btn" data-edit-txn="${t.id}">Split · ${t.splits.length}</button>` : `<span class="cat-pill"><span class="cat-pill-text" aria-hidden="true">${esc(catName(t.categoryId))}</span><select class="cat-select" data-txcat="${t.id}" aria-label="Category">${t.categoryId ? opts.replace(`value="${t.categoryId}"`, `value="${t.categoryId}" selected`) : opts}</select></span>`}</td>
      ${multi ? `<td class="hide-sm detail-only nowrap"><span class="person-dot" style="background:${memberColor(who)}"></span>${esc(memberName(who))}</td>` : ''}
      <td class="hide-sm muted">${esc(acctById(t.accountId)?.name || '—')}</td>
      <td class="num tx-amt ${signClass(t.amount)}">${money(t.amount)}</td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="${multi ? 4 : 3}" class="tx-foot-pad"></td><td class="hide-sm"></td><td class="muted">Money in<br>Money out<br><strong>Net</strong>${nMoved ? '<br><span class="small">Transfers (not counted)</span>' : ''}</td><td class="num total">${money(inflow)}<br>${money(outflow)}<br><strong class="${signClass(inflow + outflow)}">${money(round2(inflow + outflow))}</strong>${nMoved ? `<br><span class="small muted">${money(moved, { sign: true })}</span>` : ''}</td></tr></tfoot>
  </table></div>
  ${list.length > limit ? `<p class="center"><button class="btn ghost" data-more="${limit + 250}">Show ${Math.min(250, list.length - limit)} more</button></p>` : ''}`
  : emptyState(state.transactions.length ? 'Nothing matches these filters' : 'No transactions yet',
    state.transactions.length ? 'Try another month or clear the search.' : 'Import an OFX, QFX, CSV, QIF or PDF from your bank or card, or bring your history over from YNAB, Monarch, Mint or Copilot.',
    state.transactions.length ? `<a class="btn" href="#/transactions?m=all">Show all months</a>` : `<button class="btn primary" data-act="import">Import a file</button>`)}`;
};

/* ================= Budget ================= */
VIEWS.budget = p => {
  const mk = p.m || thisMonth();
  const isCurrent = mk === thisMonth();
  const now = new Date();
  const dayShare = isCurrent ? now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() : 1;
  const cats = state.categories.filter(c => c.kind !== 'transfer');
  const monthly = c => c.period === 'year' ? (c.budget || 0) / 12 : (c.budget || 0);
  const expIncome = sum(cats.filter(c => c.kind === 'income').map(monthly));
  const planned = sum(cats.filter(c => c.kind === 'expense').map(monthly));
  const f = flowSummary(txInMonth(mk));
  const groups = groupBy(cats, c => c.group);
  const order = Object.keys(groups).sort((a, b) => (groups[a][0].kind === 'income' && !groups[a][0].rental ? -1 : 0) - (groups[b][0].kind === 'income' && !groups[b][0].rental ? -1 : 0));
  const head = pageHead('Budget', UI.mode === 'simple' ? 'How each part of the budget is doing.' : 'Targets repeat every month. Yearly categories compare with spending so far this year; rollover categories carry what’s left forward.', monthNav(mk) +
    `<button class="btn ghost detail-only" data-act="budget-avg">Fill from averages</button>`);
  const summary = `<section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Expected income</th><th class="num">Planned spending</th><th class="num">Unplanned</th><th class="num">Spent in ${MONTHS[+mk.slice(5) - 1]}</th></tr></thead>
    <tbody><tr><th scope="row">Per month</th><td class="num">${money(expIncome, { cents: false })}</td><td class="num">${money(planned, { cents: false })}</td><td class="num ${signClass(expIncome - planned)}">${money(expIncome - planned, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td></tr></tbody></table>
    <p class="muted small">Planned spending includes one-twelfth of each yearly budget. Unplanned is what’s left for saving and investing.</p></section>`;

  if (UI.mode === 'simple') {
    const cards = order.filter(g => groups[g].some(c => c.kind === 'expense' && c.budget > 0)).map(g => {
      const cs = groups[g].filter(c => c.kind === 'expense' && c.budget > 0);
      const b = sum(cs.map(c => monthly(c))), a = sum(cs.map(c => { const v = budgetView(c, mk); return v.period === 'year' ? v.actual / (+mk.slice(5)) : v.actual; }));
      const share = b ? a / b : 0;
      return `<div class="b-card">${ring(share, { size: 84, width: 9, label: pct(share, 0), color: share > 1.0001 ? 'var(--neg)' : share > dayShare * 1.15 && isCurrent ? 'var(--warn)' : 'var(--ink-accent)' })}
        <div class="b-card-body"><h3>${esc(g)}</h3><p class="num">${money(a, { cents: false })} <span class="muted">of ${money(b, { cents: false })}</span></p>
        <ul>${cs.slice(0, 4).map(c => { const v = budgetView(c, mk); const bb = v.period === 'year' ? v.budget : v.budget + (v.carry || 0); return `<li><span>${esc(c.name)}</span>${bar(v.actual, bb)}</li>`; }).join('')}</ul></div></div>`;
    }).join('');
    return head + summary + `<div class="b-cards">${cards || '<p class="muted">No budgets set yet. Switch to Detailed to set targets.</p>'}</div>`;
  }

  const rowsFor = cs => cs.map(c => {
    const v = budgetView(c, mk), inc = c.kind === 'income';
    const avail = v.period === 'year' ? v.budget - v.actual : v.available;
    const cap = v.period === 'year' ? v.budget : v.budget + (v.carry || 0);
    const pace = v.period === 'year' ? v.monthShare : cap * dayShare;
    const trend = Array.from({ length: 6 }, (_, i) => monthActuals(addMonths(mk, i - 5))[c.id] || 0);
    return `<tr>
      <th scope="row"><button class="linklike" data-edit-cat="${c.id}">${esc(c.name)}</button>${v.period === 'year' ? '<span class="tag soft">yearly</span>' : ''}${c.rollover ? `<span class="tag soft" title="Carried from earlier months: ${money(v.carry || 0)}">rolls over</span>` : ''}</th>
      <td class="num budget-cell"><span class="cur">$</span><input class="budget-input" id="b-${c.id}" data-budget="${c.id}" inputmode="decimal" value="${c.budget ? round2(c.budget) : ''}" placeholder="0" aria-label="Budget for ${esc(c.name)}"></td>
      <td class="num">${money(v.actual, { cents: false })}</td>
      <td class="num ${inc ? (v.actual > v.budget ? 'pos' : 'muted') : (avail < 0 ? 'neg' : '')}">${!v.budget && !c.rollover ? '<span class="muted">—</span>' : inc ? (v.budget - v.actual > 0 ? `${money(v.budget - v.actual, { cents: false })} to come` : money(v.actual - v.budget, { cents: false, sign: true })) : money(avail, { cents: false })}</td>
      <td class="meter-cell">${v.budget ? bar(v.actual, cap, { pace: inc ? null : pace }) : ''}</td>
      <td class="spark-cell hide-sm">${sparkline(trend, { w: 70, h: 20, color: inc ? 'var(--pos)' : 'var(--muted)' })}</td></tr>`;
  }).join('');
  const groupTotal = cs => { const m = cs.filter(c => c.period !== 'year'); return { b: sum(m.map(c => c.budget || 0)), a: sum(m.map(c => budgetView(c, mk).actual)) }; };
  return head + summary + order.map(g => {
    const cs = groups[g], tt = groupTotal(cs.filter(c => c.kind === 'expense'));
    const isRental = cs.some(c => c.rental);
    const pnl = isRental ? rentalPnL(g, `${mk}-01`, monthEnd(mk)) : null;
    return `<section class="budget-group"><table class="ledger budget-table">
      <thead><tr><th scope="col">${esc(g)}</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">${cs[0].kind === 'income' && !isRental ? 'Difference' : 'Available'}</th><th class="meter-cell"></th><th class="spark-cell hide-sm">6 months</th></tr></thead>
      <tbody>${rowsFor(cs)}</tbody>
      ${isRental ? `<tfoot><tr><th scope="row">Cash flow after debt service</th><td></td><td class="num total ${signClass(pnl.cashFlow)}">${money(pnl.cashFlow, { cents: false })}</td><td colspan="3" class="muted small">NOI ${money(pnl.noi, { cents: false })} this month</td></tr></tfoot>`
      : cs[0].kind === 'expense' && cs.length > 1 ? `<tfoot><tr><th scope="row">Monthly total</th><td class="num total">${money(tt.b, { cents: false })}</td><td class="num total">${money(tt.a, { cents: false })}</td><td class="num total ${tt.b - tt.a < 0 ? 'neg' : ''}">${money(tt.b - tt.a, { cents: false })}</td><td></td><td class="hide-sm"></td></tr></tfoot>` : ''}
    </table></section>`;
  }).join('') + `<p class="center"><button class="btn ghost" data-act="add-cat">Add a category</button></p>`;
};

/* ================= Accounts ================= */
VIEWS.accounts = p => {
  const updating = p.update === '1', byOwner = p.by === 'owner';
  if (!state.accounts.length) return pageHead('Accounts') + emptyState('Add your first account', 'Checking, cards, brokerage, retirement, property, loans: list everything you own and owe to see your full balance sheet.', `<button class="btn primary" data-act="add-account">Add an account</button><button class="btn" data-act="import">Import a file</button>`);
  const t = totals();
  const groups = byOwner
    ? members().map(m => ({ label: m.name, accts: activeAccounts().filter(a => (a.owner || 'joint') === m.id), signed: true })).filter(g => g.accts.length)
    : BUCKETS.map(b => ({ label: b.label, debt: b.id === 'debt', accts: activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === b.id) })).filter(g => g.accts.length);
  const archived = state.accounts.filter(a => a.archived);
  const multi = members().length > 1;
  return pageHead('Accounts', updating ? 'Type in current balances from your statements, then save.' : 'Everything you own and owe.',
    updating ? `<a class="btn ghost" href="#/accounts">Cancel</a><button class="btn primary" data-act="save-balances">Save balances</button>`
      : `${multi ? `<div class="seg small" role="group" aria-label="Group by"><button class="${byOwner ? '' : 'on'}" data-by="">By type</button><button class="${byOwner ? 'on' : ''}" data-by="owner">By owner</button></div>` : ''}<a class="btn" href="#/accounts?update=1">Update balances</a><button class="btn primary" data-act="add-account">Add account</button>`) + `
  <section class="alloc-bar-wrap detail-only">${(() => { const segs = [['Cash', t.cash, 'var(--c2)'], ['Investments', t.invest, 'var(--c1)'], ['Property and private', t.illiquid, 'var(--c4)']]; const tot = t.assets || 1; return `<div class="stack tall" role="img" aria-label="Assets by type">${segs.map(([l, v, c]) => v > 0 ? `<span style="width:${v / tot * 100}%;background:${c}" title="${l} ${pct(v / tot, 0)}"></span>` : '').join('')}</div><p class="legend">${segs.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} ${pct(v / tot, 0)}</span>`).join('')}<span><i style="background:var(--neg)"></i>Debt is ${pct(t.liabilities / tot, 0)} of assets</span></p>`; })()}</section>
  ${groups.map(g => {
    const subtotal = sum(g.accts.map(a => g.signed ? signedValue(a) : accountValue(a)));
    return `<section class="acct-group"><table class="ledger acct-table">
      <thead><tr><th scope="col">${esc(g.label)}</th><th class="hide-sm">${byOwner ? 'Type' : multi ? 'Owner' : 'Type'}</th><th>As of</th><th class="num">${g.debt ? 'Owed' : byOwner ? 'Net' : 'Value'}</th><th class="acts"></th></tr></thead>
      <tbody>${g.accts.map(a => {
        const hs = holdingsFor(a.id).length, v = byOwner ? signedValue(a) : accountValue(a);
        return `<tr>
          <th scope="row" class="acct-name"><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button>${a.institution ? `<div class="muted small">${esc(a.institution)}${a.last4 ? ` ending ${esc(a.last4)}` : ''}</div>` : ''}</th>
          <td class="hide-sm muted">${byOwner || !multi ? `${esc(ACCOUNT_TYPES[a.type]?.label)}${a.rental ? ', rental' : ''}${hs ? `, ${hs} holding${hs > 1 ? 's' : ''}` : ''}` : `<span class="person-dot" style="background:${memberColor(a.owner || 'joint')}"></span>${esc(memberName(a.owner || 'joint'))}`}</td>
          <td class="acct-asof">${staleTag(accountAsOf(a))}${a.reconciledThrough ? `<div class="muted small">Reconciled ${dateLabel(a.reconciledThrough)}</div>` : ''}</td>
          <td class="num acct-val">${updating && !hs ? `<input class="bal-input" data-bal="${a.id}" inputmode="decimal" value="${round2(accountValue(a))}" aria-label="Balance for ${esc(a.name)}">` : `<span class="${byOwner ? signClass(v) : ''}">${money(v)}</span>`}</td>
          <td class="acts"><button class="linklike small" data-history="${a.id}">History</button>${a.ledger ? ` <button class="linklike small" data-reconcile="${a.id}">Reconcile</button>` : ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="hide-sm"></td><td class="acct-pad"></td><td class="num total">${money(subtotal)}</td><td class="acct-pad"></td></tr></tfoot>
    </table></section>`;
  }).join('')}
  <section class="acct-group"><table class="ledger acct-table grand">
    <tbody>
      <tr><th scope="row">Total assets</th><td class="num">${money(t.assets)}</td></tr>
      <tr><th scope="row">Total liabilities</th><td class="num">${money(-t.liabilities)}</td></tr>
      <tr class="grand-total"><th scope="row">Net worth</th><td class="num total double">${money(t.netWorth)}</td></tr>
    </tbody></table></section>
  ${archived.length ? `<details class="archived"><summary>${archived.length} archived account${archived.length > 1 ? 's' : ''}</summary><ul>${archived.map(a => `<li><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button> <span class="muted">${money(accountValue(a))}</span></li>`).join('')}</ul></details>` : ''}`;
};

/* ================= Investments ================= */
VIEWS.investments = () => {
  const accts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  if (!accts.length) return pageHead('Investments') + emptyState('No investment accounts yet', 'Add a brokerage, retirement, 529 or private account, then import a positions file from your brokerage or enter holdings by hand.', `<button class="btn primary" data-act="add-account" data-type="brokerage">Add an investment account</button><button class="btn" data-act="import">Import positions</button>`);
  const total = sum(accts.map(accountValue));
  const hs = state.holdings.filter(h => accts.some(a => a.id === h.accountId));
  const withCost = hs.filter(h => h.costBasis != null && h.costBasis !== '' && h.assetClass !== 'Cash');
  const cost = sum(withCost.map(h => +h.costBasis)), mval = sum(withCost.map(holdingValue));
  const alloc = investableAllocation();
  const allocTotal = sum(Object.values(alloc));
  const classes = [...ASSET_CLASSES, 'Unclassified'].filter(c => alloc[c] || state.settings.targets[c]);
  const targetSum = sum(Object.values(state.settings.targets || {}));
  const all = allocation();
  const re = all.rows.find(r => r.cls === 'Real estate');

  return pageHead('Investments', `${accts.length} account${accts.length > 1 ? 's' : ''}, ${hs.length} holding${hs.length === 1 ? '' : 's'}`,
    `<button class="btn" data-act="import">Import positions</button><button class="btn primary" data-act="add-holding">Add holding</button>`) + `
  <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Market value</th><th class="num hide-sm">Cost basis</th><th class="num">Unrealized gain</th><th class="num">Return on cost</th></tr></thead>
    <tbody><tr><th scope="row">All investments</th><td class="num">${money(total, { cents: false })}</td><td class="num hide-sm">${cost ? money(cost, { cents: false }) : '—'}</td><td class="num ${signClass(mval - cost)}">${cost ? money(mval - cost, { cents: false, sign: true }) : '—'}</td><td class="num ${signClass(mval - cost)}">${cost ? pct((mval - cost) / cost) : '—'}</td></tr></tbody></table>
    <p class="muted small">Gains count only holdings with a cost basis. Cash positions are left out.</p></section>

  <section class="panel">
    <header class="panel-head"><h2>Allocation</h2><span class="muted small">Targets ${targetSum ? `add to ${targetSum}%` : 'are optional'}</span></header>
    <div class="stack" role="img" aria-label="Investment allocation">${classes.filter(c => alloc[c]).map(c => `<span style="width:${(alloc[c] / allocTotal) * 100}%;background:${CLASS_COLORS[c]}" title="${esc(c)} ${pct(alloc[c] / allocTotal)}"></span>`).join('')}</div>
    <table class="ledger compact alloc-table"><thead><tr><th>Asset class</th><th class="num hide-sm">Value</th><th class="num">Actual</th><th class="num">Target</th><th class="num">Drift</th><th class="num hide-sm">To rebalance</th></tr></thead><tbody>
    ${classes.map(c => {
      const v = alloc[c] || 0, share = allocTotal ? v / allocTotal : 0, tgt = state.settings.targets[c];
      const drift = tgt != null && tgt !== '' ? share - tgt / 100 : null;
      return `<tr><th scope="row"><span class="swatch" style="background:${CLASS_COLORS[c]}"></span>${esc(c)}</th><td class="num hide-sm">${money(v, { cents: false })}</td><td class="num">${pct(share)}</td>
        <td class="num budget-cell"><input class="budget-input" id="tg-${slug(c)}" data-target="${esc(c)}" inputmode="decimal" value="${tgt ?? ''}" placeholder="—" aria-label="Target for ${esc(c)}"><span class="cur">%</span></td>
        <td class="num ${drift == null ? '' : Math.abs(drift) >= 0.05 ? 'neg' : 'muted'}">${drift == null ? '—' : (drift >= 0 ? '+' : '−') + Math.abs(drift * 100).toFixed(1) + ' pts'}</td>
        <td class="num hide-sm">${drift == null ? '' : money(-drift * allocTotal, { cents: false, sign: true })}</td></tr>`;
    }).join('')}</tbody></table>
    ${re ? `<p class="muted small">Counting your property too, real estate is ${pct(re.share, 0)} of everything you own.</p>` : ''}
  </section>
  ${(() => {
    const fa = feeAnalysis();
    const months = Object.keys(state.snapshots).sort().slice(-24);
    const histAccts = accts.filter(a => months.some(m => state.snapshots[m][a.id]));
    return `<div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>What you pay in fund fees</h2><span class="muted small">${fa.coverage < 0.999 ? `Covers ${pct(fa.coverage, 0)} of holdings` : ''}</span></header>
      ${fa.value ? `<dl class="kpis three"><div><dt>Weighted expense ratio</dt><dd class="num">${fa.weighted.toFixed(2)}%</dd></div><div><dt>Per year</dt><dd class="num">${money(fa.fees, { cents: false })}</dd></div><div><dt>Over 20 years</dt><dd class="num">${money(fa.drag, { cents: false })}</dd><span class="muted small">Growth lost at 6% a year</span></div></dl>
      <table class="ledger compact"><thead><tr><th>Fund</th><th class="num">Expense ratio</th><th class="num">Per year</th></tr></thead><tbody>${fa.top.slice(0, 5).map(x => `<tr><th scope="row"><button class="linklike" data-edit-holding="${x.h.id}">${esc(x.h.symbol)}</button> <span class="muted small">${esc(x.h.name || '')}</span></th><td class="num ${x.er >= 0.5 ? 'neg' : ''}">${x.er.toFixed(2)}%</td><td class="num">${money(x.fee, { cents: false })}</td></tr>`).join('')}</tbody></table>
      ${fa.unknown.length ? `<p class="muted small">No expense ratio on file for ${fa.unknown.slice(0, 4).map(h => esc(h.symbol)).join(', ')}${fa.unknown.length > 4 ? '…' : ''}. Add it in each holding.</p>` : ''}`
      : '<p class="muted">Add holdings to see the fees inside your funds.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Value over time</h2></header>
      ${chartHost({ type: 'stack', h: 230, labels: months.map(m => monthLabel(m, true)), series: histAccts.map((a, i) => ({ name: a.name, color: `var(--c${(i % 8) + 1})`, values: months.map(m => state.snapshots[m][a.id] || 0) })), empty: 'History builds as months pass.',
        tip: i => `<strong>${monthLabel(months[i])}</strong>${histAccts.map(a => `<br>${esc(a.name)} ${money(state.snapshots[months[i]][a.id] || 0, { cents: false })}`).join('')}` })}
      <p class="legend">${histAccts.map((a, i) => `<span><i style="background:var(--c${(i % 8) + 1})"></i>${esc(a.name)}</span>`).join('')}</p>
    </section></div>`;
  })()}

  ${accts.map(a => {
    const list = holdingsFor(a.id).sort((x, y) => holdingValue(y) - holdingValue(x));
    const v = accountValue(a);
    return `<section class="acct-group"><table class="ledger holdings-table"><colgroup><col style="width:10%"><col style="width:24%"><col class="hide-sm" style="width:17%"><col class="hide-sm" style="width:9%"><col class="hide-sm" style="width:10%"><col style="width:11%"><col class="hide-sm" style="width:10%"><col style="width:9%"></colgroup>
      <thead><tr><th scope="col" colspan="2"><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button> <span class="muted small">${esc(ACCOUNT_TYPES[a.type].label)}${a.institution ? `, ${esc(a.institution)}` : ''}</span></th><th class="hide-sm">Class</th><th class="num hide-sm">Shares</th><th class="num hide-sm">Price</th><th class="num">Value</th><th class="num hide-sm">Cost basis</th><th class="num">Gain</th></tr></thead>
      <tbody>${list.length ? list.map(h => {
        const hv = holdingValue(h), g = h.costBasis != null && h.costBasis !== '' ? hv - h.costBasis : null;
        const old = h.private && daysBetween(h.priceDate || '2000-01-01', today()) > 90;
        return `<tr><th scope="row"><button class="linklike" data-edit-holding="${h.id}"><strong>${esc(h.symbol)}</strong></button></th>
          <td class="muted">${esc(h.name || '')}${h.private ? `<div class="small">Private. ${old ? `<span class="tag warn">Marked ${dateLabel(h.priceDate, true)}</span>` : `Marked ${dateLabel(h.priceDate, true)}`}</div>` : ''}</td>
          <td class="hide-sm"><span class="swatch" style="background:${CLASS_COLORS[h.assetClass] || CLASS_COLORS.Unclassified}"></span>${esc(h.assetClass || 'Unclassified')}</td>
          <td class="num hide-sm">${(+h.shares).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td><td class="num hide-sm">${money(h.price)}</td>
          <td class="num">${money(hv, { cents: false })}</td><td class="num hide-sm">${g == null ? '<span class="muted">—</span>' : money(h.costBasis, { cents: false })}</td>
          <td class="num ${g == null ? '' : signClass(g)}">${g == null ? '' : `${money(g, { cents: false, sign: true })}<div class="small">${h.costBasis ? pct(g / h.costBasis, 0) : ''}</div>`}</td></tr>`;
      }).join('') : `<tr><td colspan="8" class="muted">No holdings listed. The account counts at its balance of ${money(v, { cents: false })}${a.assetClass ? `, as ${esc(a.assetClass)}` : ''}. <button class="linklike" data-act="add-holding" data-acct="${a.id}">Add holdings</button></td></tr>`}</tbody>
      ${list.length ? `<tfoot><tr><th scope="row" colspan="2">Account total${a.cash ? ` (includes ${money(a.cash, { cents: false })} cash)` : ''}</th><td class="hide-sm" colspan="3"></td><td class="num total">${money(v, { cents: false })}</td><td class="hide-sm"></td><td></td></tr></tfoot>` : ''}
    </table></section>`;
  }).join('')}`;
};

/* ================= Property ================= */
VIEWS.property = () => {
  const props = activeAccounts().filter(a => a.type === 'realestate');
  if (!props.length) return pageHead('Property') + emptyState('No properties yet', 'Add your home or a rental. For rentals, Ọrọ̀ tracks rent, operating costs, NOI, cap rate and cash-on-cash return from your categorized transactions.', `<button class="btn primary" data-act="add-account" data-type="realestate">Add a property</button>`);
  const mk = thisMonth(), yr = mk.slice(0, 4);
  const ttmFrom = `${addMonths(mk, -12)}-01`, ttmTo = monthEnd(addMonths(mk, -1));
  return pageHead('Property', 'Equity, leverage and, for rentals, operating returns.', `<button class="btn primary" data-act="add-account" data-type="realestate">Add a property</button>`) +
    props.map(a => {
      const value = accountValue(a);
      const loan = a.mortgageId ? acctById(a.mortgageId) : null;
      const debt = loan ? accountValue(loan) : 0;
      const equity = value - debt;
      let rental = '';
      if (a.rental) {
        const g = a.rentalGroup || 'Rental property';
        const ytd = rentalPnL(g, `${yr}-01-01`, today());
        const ttm = rentalPnL(g, ttmFrom, ttmTo);
        const months = Array.from({ length: 12 }, (_, i) => addMonths(mk, i - 11));
        const per = months.map(m => rentalPnL(g, `${m}-01`, monthEnd(m)));
        const cap = value ? ttm.noi / value : NaN;
        const coc = a.cashInvested ? ttm.cashFlow / a.cashInvested : NaN;
        const dscr = ttm.debt ? ttm.noi / ttm.debt : NaN;
        rental = `
        <table class="ledger flows-table"><thead><tr><th></th><th class="num">Rent</th><th class="num hide-sm">Operating costs</th><th class="num">NOI</th><th class="num hide-sm">Debt service</th><th class="num">Cash flow</th></tr></thead>
          <tbody>
            <tr><th scope="row">This year</th><td class="num">${money(ytd.income, { cents: false })}</td><td class="num hide-sm">${money(ytd.opex, { cents: false })}</td><td class="num">${money(ytd.noi, { cents: false })}</td><td class="num hide-sm">${money(ytd.debt, { cents: false })}</td><td class="num ${signClass(ytd.cashFlow)}">${money(ytd.cashFlow, { cents: false })}</td></tr>
            <tr><th scope="row">Last 12 full months</th><td class="num">${money(ttm.income, { cents: false })}</td><td class="num hide-sm">${money(ttm.opex, { cents: false })}</td><td class="num">${money(ttm.noi, { cents: false })}</td><td class="num hide-sm">${money(ttm.debt, { cents: false })}</td><td class="num ${signClass(ttm.cashFlow)}">${money(ttm.cashFlow, { cents: false })}</td></tr>
          </tbody></table>
        <dl class="kpis">
          <div><dt>Cap rate</dt><dd>${pct(cap)}</dd><span class="muted small">NOI over value</span></div>
          <div><dt>Cash-on-cash</dt><dd>${a.cashInvested ? pct(coc) : '—'}</dd><span class="muted small">${a.cashInvested ? `On ${money(a.cashInvested, { cents: false })} invested` : 'Add cash invested to see this'}</span></div>
          <div><dt>Debt coverage</dt><dd>${isFinite(dscr) ? dscr.toFixed(2) + '×' : '—'}</dd><span class="muted small">NOI over debt service</span></div>
          <div><dt>Expense ratio</dt><dd>${ttm.income ? pct(ttm.opex / ttm.income, 0) : '—'}</dd><span class="muted small">Operating costs over rent</span></div>
        </dl>
        ${chartHost({ type: 'bars', h: 180, label: 'Monthly rental cash flow', labels: months.map(m => MON[+m.slice(5) - 1]),
          series: [{ values: per.map(x => x.income), color: 'var(--c1)' }, { values: per.map(x => x.opex + x.debt), color: 'var(--c4)' }],
          tip: i => `<strong>${monthLabel(months[i])}</strong><br>Rent ${money(per[i].income, { cents: false })}<br>Costs ${money(per[i].opex + per[i].debt, { cents: false })}<br>Cash flow <span class="${signClass(per[i].cashFlow)}">${money(per[i].cashFlow, { cents: false })}</span>` })}
        <p class="legend"><span><i style="background:var(--c1)"></i>Rent collected</span><span><i style="background:var(--c4)"></i>Operating costs and debt service</span></p>
        <p class="muted small"><a href="#/taxes">See this property’s Schedule E</a>. Figures come from transactions in the “${esc(g)}” category group. Mortgage payments count as debt service; give operating categories the “Operating expense” role in Data and settings.</p>`;
      }
      return `<section class="panel property">
        <header class="panel-head"><h2><button class="linklike" data-edit-acct="${a.id}">${esc(a.name)}</button></h2><span class="muted small">${a.rental ? `Rental${a.units ? `, ${a.units} units` : ''}` : 'Residence'}. Value as of ${dateLabel(a.balanceDate, true)}</span></header>
        <dl class="kpis">
          <div><dt>Value</dt><dd>${money(value, { cents: false })}</dd></div>
          <div><dt>Mortgage</dt><dd>${loan ? money(debt, { cents: false }) : '—'}</dd>${loan ? `<span class="muted small">${esc(loan.name)}${loan.rate ? ` at ${loan.rate}%` : ''}</span>` : `<span class="muted small"><button class="linklike" data-edit-acct="${a.id}">Link a mortgage</button></span>`}</div>
          <div><dt>Equity</dt><dd>${money(equity, { cents: false })}</dd></div>
          <div><dt>Loan to value</dt><dd>${loan && value ? pct(debt / value, 0) : '—'}</dd></div>
        </dl>
        ${rental}
      </section>`;
    }).join('');
};

/* ================= Cash flow ================= */
VIEWS.cashflow = () => {
  const fa = forecastAccounts();
  const days = 90;
  const f = forecast(days);
  const rep = detectRepeating();
  const repNew = rep.filter(r => !r.tracked);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth(), i - 11));
  const flows = months.map(m => flowSummary(txInMonth(m)));
  const low = state.settings.lowCash || 0;
  const lowIdx = f.series.findIndex(p => p.x === f.low.x);
  return pageHead('Cash flow', fa.length ? `${money(f.startBal, { cents: false })} on hand across ${fa.map(a => esc(a.name)).join(', ')}` : 'Mark checking or savings accounts to include in the forecast.',
    `<button class="btn primary" data-act="add-recurring">Add a bill or paycheck</button>`) + `
  <section class="panel">
    <header class="panel-head"><h2>Next ${days} days</h2><span class="muted small">Lowest point ${money(f.low.y, { cents: false })} on ${dateLabel(f.low.x)}. ${money(f.end, { cents: false })} on ${dateLabel(addDays(today(), days))}.</span></header>
    ${state.recurring.length ? chartHost({ h: 230, label: 'Projected cash balance', series: [{ points: f.series, color: 'var(--ink-accent)', area: true }], threshold: low || null, thresholdLabel: low ? `Cushion ${moneyCompact(low)}` : '', zero: true,
      xFmt: x => dateLabel(x), markers: lowIdx > 0 ? [{ i: lowIdx, y: f.low.y, label: `Low ${moneyCompact(f.low.y)}`, below: true }] : [],
      tip: i => { const p = f.series[i]; const ev = f.events.filter(e => e.date === p.x); return `<strong>${dateLabel(p.x)}</strong><br>${money(p.y, { cents: false })}${ev.map(e => `<br><span class="muted">${esc(e.name)} ${money(e.amount, { cents: false, sign: true })}</span>`).join('')}`; } })
      : `<p class="muted">Add your paychecks, mortgage or rent, and other regular bills to project your cash balance day by day.</p>`}
    <label class="field inline"><span>Warn me below</span><input id="low-cash" data-setting="lowCash" inputmode="decimal" value="${low}" style="width:8em"></label>
  </section>

  ${billCalendar(route().params.cm || thisMonth())}
  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Bills and income</h2><span class="muted small">${state.recurring.length} scheduled</span></header>
      ${state.recurring.length ? `<table class="ledger compact"><thead><tr><th>Name</th><th class="hide-sm">How often</th><th>Next</th><th class="num">Amount</th></tr></thead><tbody>
      ${[...state.recurring].sort((a, b) => occurrences(a, today(), '9999-12-31')[0]?.localeCompare(occurrences(b, today(), '9999-12-31')[0] || '') || 0).map(r => `<tr><th scope="row"><button class="linklike" data-edit-rec="${r.id}">${esc(r.name)}</button></th><td class="hide-sm muted">${FREQS[r.freq]}</td><td class="nowrap">${dateLabel(occurrences(r, today(), '9999-12-31')[0])}</td><td class="num ${signClass(r.amount)}">${money(r.amount)}</td></tr>`).join('')}
      </tbody><tfoot><tr><th scope="row" colspan="3">Net per month (approximate)</th><td class="num total">${money(sum(state.recurring.map(r => r.amount * ({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[r.freq] || 12) / 12)), { cents: false })}</td></tr></tfoot></table>`
      : '<p class="muted">Nothing scheduled yet.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Repeating charges</h2><span class="muted small">${repNew.length ? `${money(sum(repNew.map(r => r.monthly)))} a month, ${money(sum(repNew.map(r => r.monthly)) * 12, { cents: false })} a year` : ''}</span></header>
      ${repNew.length ? `<table class="ledger compact"><thead><tr><th>Payee</th><th class="hide-sm">Since</th><th class="num">Monthly</th><th></th></tr></thead><tbody>
      ${repNew.map(r => `<tr><th scope="row">${esc(r.payee)}${r.isNew ? ' <span class="tag">New</span>' : ''}<div class="muted small">${esc(catName(r.categoryId))}, ${esc(acctById(r.accountId)?.name || '')}</div></th><td class="hide-sm muted nowrap">${dateLabel(r.firstSeen, true)}</td><td class="num">${money(r.monthly)}</td>
        <td class="acts">${r.fromCash ? `<button class="btn small ghost" data-add-rep="${rep.indexOf(r)}">Add to forecast</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <p class="muted small">${rep.length ? `Ọrọ̀ found ${rep.length} charges that repeat at a steady amount${rep.length - repNew.length ? `; ${rep.length - repNew.length} are already scheduled and hidden here` : ''}. Card charges are covered by your card-payment estimate, so only bills paid straight from checking need adding.` : 'Ọrọ̀ looks for charges that repeat at a steady amount. Import a few months of history to see them.'}</p>
    </section>
  </div>

  <section class="panel">
    <header class="panel-head"><h2>Money in and out, by month</h2></header>
    ${chartHost({ type: 'bars', h: 200, label: 'Income and spending by month', labels: months.map(m => MON[+m.slice(5) - 1]), series: [{ values: flows.map(x => x.income), color: 'var(--c1)' }, { values: flows.map(x => x.spending), color: 'var(--c4)' }],
      tip: i => `<strong>${monthLabel(months[i])}</strong><br>In ${money(flows[i].income, { cents: false })}<br>Out ${money(flows[i].spending, { cents: false })}<br>Left over <span class="${signClass(flows[i].net)}">${money(flows[i].net, { cents: false })}</span>` })}
    <p class="legend"><span><i style="background:var(--c1)"></i>Money in</span><span><i style="background:var(--c4)"></i>Money out</span></p>
  </section>`;
};

function billCalendar(mk) {
  const first = fromISO(`${mk}-01`), startDow = first.getDay(), dim = +monthEnd(mk).slice(8);
  const ev = {};
  for (const r of state.recurring) for (const d of occurrences(r, `${mk}-01`, monthEnd(mk))) (ev[d] = ev[d] || []).push(r);
  const totalOut = sum(Object.values(ev).flat().filter(r => r.amount < 0).map(r => r.amount)), totalIn = sum(Object.values(ev).flat().filter(r => r.amount > 0).map(r => r.amount));
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell empty"></div>';
  for (let dd = 1; dd <= dim; dd++) {
    const iso = `${mk}-${pad2(dd)}`, list = ev[iso] || [];
    cells += `<div class="cal-cell ${iso === today() ? 'today' : ''} ${iso < today() ? 'past' : ''}"><span class="cal-day">${dd}</span>${list.map(r => `<button class="cal-ev ${r.amount >= 0 ? 'in' : 'out'}" data-edit-rec="${r.id}" title="${esc(r.name)} ${money(r.amount)}"><span>${esc(r.name)}</span><span class="num">${moneyCompact(r.amount)}</span></button>`).join('')}</div>`;
  }
  return `<section class="panel calendar">
    <header class="panel-head"><h2>Bill calendar</h2><div class="month-nav"><button class="icon-btn" data-month="${addMonths(mk, -1)}" data-param="cm" aria-label="Previous month">‹</button><span class="month-label">${monthLabel(mk)}</span><button class="icon-btn" data-month="${addMonths(mk, 1)}" data-param="cm" aria-label="Next month">›</button></div></header>
    <p class="muted small">${money(totalIn, { cents: false })} scheduled in, ${money(-totalOut, { cents: false })} scheduled out.</p>
    <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div class="cal-dow">${x}</div>`).join('')}${cells}</div>
  </section>`;
}

/* ================= Monthly review ================= */
VIEWS.review = p => {
  const lm = addMonths(thisMonth(), -1);
  const mk = p.m || (state.transactions.some(t => t.date.startsWith(lm)) ? lm : thisMonth());
  const prev = addMonths(mk, -1);
  const rv = state.reviews[mk] || {};
  const txs = txInMonth(mk);
  const f = flowSummary(txs), fp = flowSummary(txInMonth(prev));
  const avg3 = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i))));
  const avgSpend = sum(avg3.map(x => x.spending)) / 3, avgIncome = sum(avg3.map(x => x.income)) / 3;
  const acts = categoryActuals(txs);
  const exp = state.categories.filter(c => c.kind === 'expense');
  const over = exp.filter(c => c.period !== 'year' && c.budget > 0 && (acts[c.id] || 0) > c.budget).map(c => ({ c, a: acts[c.id] || 0, d: (acts[c.id] || 0) - c.budget })).sort((a, b) => b.d - a.d);
  const under = exp.filter(c => c.period !== 'year' && c.budget > 0 && (acts[c.id] || 0) < c.budget).map(c => ({ c, a: acts[c.id] || 0, d: c.budget - (acts[c.id] || 0) })).sort((a, b) => b.d - a.d).slice(0, 4);
  const yearly = exp.filter(c => c.period === 'year' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) }));
  const unusual = exp.map(c => ({ c, a: acts[c.id] || 0, avg: trailingAvg(c.id, mk, 3) })).filter(x => x.a > 60 && x.a > x.avg * 1.3 && x.a - x.avg > 50).sort((a, b) => (b.a - b.avg) - (a.a - a.avg)).slice(0, 5);
  const largest = txs.filter(t => t.amount < 0 && !isTransferCat(t.categoryId)).sort((a, b) => a.amount - b.amount).slice(0, 8);
  const endNW = snapshotNW(mk), startNW = snapshotNW(prev);
  const bucketOf = id => { const a = acctById(id); return a ? ACCOUNT_TYPES[a.type]?.bucket : 'illiquid'; };
  const bucketChange = BUCKETS.map(b => {
    const e = state.snapshots[mk] || {}, s = state.snapshots[prev] || {};
    const val = snap => sum(Object.entries(snap).filter(([id]) => bucketOf(id) === b.id).map(([, v]) => v));
    return { b, change: val(e) - val(s) };
  });
  const unc = txs.filter(t => !t.categoryId).length;
  const stale = activeAccounts().filter(a => !holdingsFor(a.id).length && (!a.balanceDate || a.balanceDate < `${mk}-${pad2(Math.min(25, +monthEnd(mk).slice(8)))}`)).length;
  const marks = state.holdings.filter(h => h.private && daysBetween(h.priceDate || '2000-01-01', monthEnd(mk)) > 90).length;
  const unrec = activeAccounts().filter(a => a.ledger && txByAccount(a.id).some(t => t.date <= monthEnd(mk)) && (!a.reconciledThrough || a.reconciledThrough < monthEnd(mk))).length;
  const newRep = detectRepeating().filter(r => r.firstSeen.startsWith(mk) || (r.isNew && mk === lm));
  const rentals = activeAccounts().filter(a => a.type === 'realestate' && a.rental);
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  const cmp = (now, then) => then ? `<span class="small ${signClass(now - then)}">${money(now - then, { cents: false, sign: true })}</span>` : '';

  return pageHead(`${monthLabel(mk)} review`, rv.completedAt ? `Reviewed ${dateLabel(rv.completedAt, true)}` : 'Not reviewed yet',
    `<label class="field inline"><span class="sr">Month</span><select data-filter="m">${months.map(m => `<option value="${m}" ${m === mk ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label><button class="btn" data-act="money-date" data-mk="${mk}">Present as Money date</button><button class="btn ghost" data-act="print">Print</button>`) + `
  <section class="flows"><table class="ledger flows-table">
    <thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th><th class="num">Savings rate</th></tr></thead>
    <tbody>
      <tr><th scope="row">${MONTHS[+mk.slice(5) - 1]}</th><td class="num">${money(f.income, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td><td class="num ${signClass(f.net)}">${money(f.net, { cents: false })}</td><td class="num">${pct(f.rate, 0)}</td></tr>
      <tr><th scope="row">${MONTHS[+prev.slice(5) - 1]}</th><td class="num muted">${money(fp.income, { cents: false })}</td><td class="num muted">${money(fp.spending, { cents: false })}</td><td class="num muted">${money(fp.net, { cents: false })}</td><td class="num muted">${pct(fp.rate, 0)}</td></tr>
      <tr><th scope="row">Prior 3-month average</th><td class="num muted">${money(avgIncome, { cents: false })}</td><td class="num muted">${money(avgSpend, { cents: false })}</td><td class="num muted">${money(avgIncome - avgSpend, { cents: false })}</td><td class="num muted">${avgIncome ? pct((avgIncome - avgSpend) / avgIncome, 0) : '—'}</td></tr>
    </tbody></table></section>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Net worth</h2></header>
      ${endNW != null && startNW != null ? `<table class="ledger compact"><tbody>
        <tr><th scope="row">End of ${MONTHS[+prev.slice(5) - 1]}</th><td class="num">${money(startNW, { cents: false })}</td></tr>
        ${bucketChange.filter(x => Math.abs(x.change) >= 1).map(x => `<tr><td class="indent">${esc(x.b.label)}</td><td class="num ${signClass(x.change)}">${money(x.change, { cents: false, sign: true })}</td></tr>`).join('')}
        <tr><th scope="row">${mk === thisMonth() ? 'Today' : `End of ${MONTHS[+mk.slice(5) - 1]}`}</th><td class="num total double">${money(endNW, { cents: false })}</td></tr></tbody></table>
        <p class="muted small">Each line is its effect on net worth. Of the ${money(endNW - startNW, { cents: false, sign: true })} change, ${money(f.net, { cents: false, sign: true })} came from income left over after spending; the rest is market moves, loan paydown and revaluations.</p>`
        : '<p class="muted">Net worth history starts once two months of balances exist. You can add past balances from each account’s History.</p>'}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Over budget</h2></header>
      ${over.length ? `<table class="ledger compact"><tbody>${over.map(x => `<tr><th scope="row">${esc(x.c.name)}</th><td class="num muted">${money(x.a, { cents: false })} of ${money(x.c.budget, { cents: false })}</td><td class="num neg">${money(x.d, { cents: false })} over</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Every monthly category stayed within budget.</p>'}
      ${under.length ? `<h3>Most room left</h3><table class="ledger compact"><tbody>${under.map(x => `<tr><th scope="row">${esc(x.c.name)}</th><td class="num muted">${money(x.a, { cents: false })} of ${money(x.c.budget, { cents: false })}</td><td class="num pos">${money(x.d, { cents: false })} under</td></tr>`).join('')}</tbody></table>` : ''}
      ${yearly.length ? `<h3>Yearly budgets</h3><table class="ledger compact"><tbody>${yearly.map(({ c, v }) => `<tr><th scope="row">${esc(c.name)}</th><td class="num muted">${money(v.actual, { cents: false })} of ${money(v.budget, { cents: false })}</td><td class="meter-cell">${bar(v.actual, v.budget, { pace: v.monthShare })}</td></tr>`).join('')}</tbody></table>` : ''}
    </section>
  </div>

  <div class="cols">
    <section class="panel">
      <header class="panel-head"><h2>Unusual spending</h2></header>
      ${unusual.length ? `<table class="ledger compact"><tbody>${unusual.map(x => `<tr><th scope="row"><a href="#/transactions?m=${mk}&cat=${x.c.id}">${esc(x.c.name)}</a></th><td class="num">${money(x.a, { cents: false })}</td><td class="num muted">usually ${money(x.avg, { cents: false })}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No category ran more than 30% above its recent average.</p>'}
      ${newRep.length ? `<h3>New repeating charges</h3><ul class="plain">${newRep.map(r => `<li>${esc(r.payee)}, ${money(r.monthly)} a month</li>`).join('')}</ul>` : ''}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Largest purchases</h2></header>
      ${largest.length ? `<table class="ledger compact"><tbody>${largest.map(t => `<tr><td class="nowrap muted">${dateLabel(t.date)}</td><td>${esc(t.payee)}<div class="muted small">${esc(catName(t.categoryId))}</div></td><td class="num neg">${money(t.amount, { cents: false })}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No spending this month.</p>'}
    </section>
  </div>

  ${members().length > 1 ? (() => { const per = members().map(m => ({ m, f: flowSummary(txs.filter(t => personOf(t) === m.id)) })).filter(x => x.f.spending > 0); const tot = sum(per.map(x => x.f.spending)) || 1; return per.length ? `<section class="panel"><header class="panel-head"><h2>Who spent what</h2><a href="#/reports?r=people&p=custom&from=${mk}-01&to=${monthEnd(mk)}">Details</a></header>
    <div class="stack tall">${per.map(x => `<span style="width:${x.f.spending / tot * 100}%;background:${memberColor(x.m.id)}"></span>`).join('')}</div>
    <p class="legend">${per.map(x => `<span><i style="background:${memberColor(x.m.id)}"></i>${esc(x.m.name)} ${money(x.f.spending, { cents: false })} (${pct(x.f.spending / tot, 0)})</span>`).join('')}</p></section>` : ''; })() : ''}
  ${state.goals.length ? `<section class="panel"><header class="panel-head"><h2>Goals</h2></header><div class="goal-strip">${state.goals.map(goalTile).join('')}</div></section>` : ''}
  ${rentals.length ? `<section class="panel"><header class="panel-head"><h2>Rental property</h2></header><table class="ledger compact"><thead><tr><th></th><th class="num">Rent</th><th class="num">Operating costs</th><th class="num">NOI</th><th class="num">Cash flow</th></tr></thead><tbody>
    ${rentals.map(a => { const r = rentalPnL(a.rentalGroup || 'Rental property', `${mk}-01`, monthEnd(mk)); return `<tr><th scope="row">${esc(a.name)}</th><td class="num">${money(r.income, { cents: false })}</td><td class="num">${money(r.opex, { cents: false })}</td><td class="num">${money(r.noi, { cents: false })}</td><td class="num ${signClass(r.cashFlow)}">${money(r.cashFlow, { cents: false })}</td></tr>`; }).join('')}
  </tbody></table></section>` : ''}

  <section class="panel checklist">
    <header class="panel-head"><h2>Close the month</h2></header>
    <ol class="steps">
      <li class="${unc ? '' : 'done'}"><strong>Categorize every transaction.</strong> ${unc ? `<a href="#/transactions?m=${mk}&cat=_none">${unc} left</a>` : 'Done.'}</li>
      <li class="${stale ? '' : 'done'}"><strong>Update account balances.</strong> ${stale ? `<a href="#/accounts?update=1">${stale} account${stale > 1 ? 's' : ''} not updated since late ${MONTHS[+mk.slice(5) - 1]}</a>` : 'Done.'}</li>
      <li class="${unrec ? '' : 'done'}"><strong>Reconcile bank and card accounts.</strong> ${unrec ? `<a href="#/accounts">${unrec} not reconciled through ${MONTHS[+mk.slice(5) - 1]}</a>` : 'Done.'}</li>
      <li class="${marks ? '' : 'done'}"><strong>Re-mark private holdings.</strong> ${marks ? `<a href="#/investments">${marks} mark${marks > 1 ? 's are' : ' is'} over 90 days old</a>` : 'Nothing stale.'}</li>
      <li class="${rv.notes ? 'done' : ''}"><strong>Write down what changed and what to do next.</strong>
        <textarea id="review-notes" data-review-notes="${mk}" rows="4" placeholder="Decisions, surprises, things to follow up on">${esc(rv.notes || '')}</textarea></li>
    </ol>
    <div class="actions">${rv.completedAt ? `<button class="btn ghost" data-review-done="${mk}" data-undo="1">Mark as not reviewed</button>` : `<button class="btn primary" data-review-done="${mk}">Mark ${MONTHS[+mk.slice(5) - 1]} as reviewed</button>`}</div>
  </section>`;
};


/* ================= Reports ================= */
const PERIODS = [['m', 'This month'], ['lm', 'Last month'], ['ytd', 'This year'], ['12m', 'Last 12 months'], ['ly', 'Last year'], ['custom', 'Custom']];
VIEWS.reports = p => {
  const tab = p.r || 'flow';
  const per = p.p || (tab === 'statement' || tab === 'networth' ? '12m' : 'm');
  const R = periodRange(per, p.from, p.to);
  const head = pageHead('Reports', `${R.label}${UI.lens && tab !== 'networth' ? ` · ${esc(memberName(UI.lens))} only` : ''}`,
    `<label class="field inline"><span class="sr">Period</span><select data-filter="p">${PERIODS.map(([id, l]) => `<option value="${id}" ${id === per ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
     ${per === 'custom' ? `<input type="date" data-date="from" value="${p.from || R.from}" aria-label="From"><input type="date" data-date="to" value="${p.to || R.to}" aria-label="To">` : ''}`) +
    tabs('r', tab, [['flow', 'Cash flow'], ['spending', 'Spending'], ['statement', 'Income statement'], ['yoy', 'Year over year'], ...(members().length > 1 ? [['people', 'By person']] : []), ['networth', 'Net worth']]);
  const txs = lensed(txInRange(R.from, R.to));
  const acts = categoryActuals(txs);
  const months = monthsIn(R.from, R.to);

  if (tab === 'flow') {
    const sk = UI.lens ? (() => { const all = sankeyFromActs(acts); return all; })() : sankeyData(R.from, R.to);
    const f = flowSummary(txs);
    return head + `
    <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th><th class="num">Savings rate</th></tr></thead>
      <tbody><tr><th scope="row">${esc(R.label)}</th><td class="num">${money(f.income, { cents: false })}</td><td class="num">${money(f.spending, { cents: false })}</td><td class="num ${signClass(f.net)}">${money(f.net, { cents: false })}</td><td class="num">${pct(f.rate, 0)}</td></tr></tbody></table></section>
    <section class="panel"><header class="panel-head"><h2>Where the money came from and went</h2><span class="muted small">${isTouch() ? 'Tap' : 'Hover over'} a band for the amount</span></header>
      ${chartHost({ type: 'sankey', left: sk.left, right: sk.right, total: Math.max(sk.income, sk.spending), empty: 'No income or spending in this period.' })}</section>`;
  }

  if (tab === 'spending') {
    const groupIdx = {}; let gi = 0;
    const rows = Object.entries(acts).filter(([id, v]) => v > 0 && (id === '_none' || catById(id)?.kind === 'expense')).map(([id, v]) => {
      const c = catById(id), g = c ? c.group : 'Uncategorized';
      if (!(g in groupIdx)) groupIdx[g] = gi++;
      return { id, name: c ? c.name : 'Uncategorized', group: g, value: v };
    }).sort((a, b) => b.value - a.value);
    const total = sum(rows.map(r => r.value)) || 1;
    const nM = Math.max(1, months.length);
    const trendMonths = Array.from({ length: 12 }, (_, i) => addMonths(R.to.slice(0, 7), i - 11));
    const groups = Object.keys(groupIdx);
    const stackMonths = months.length >= 3 ? months : trendMonths;
    const topGroups = groups.slice(0, 7);
    return head + `
    <div class="cols wide-left">
      <section class="panel"><header class="panel-head"><h2>Spending map</h2><span class="muted small">${money(total, { cents: false })} across ${rows.length} categories</span></header>
        ${chartHost({ type: 'treemap', h: 340, items: rows.map(r => ({ label: r.name, value: r.value, color: `var(--c${(groupIdx[r.group] % 8) + 1})`, href: `#/transactions?m=${months.length === 1 ? months[0] : 'all'}&cat=${r.id}` })) })}
        <p class="legend">${groups.map(g => `<span><i style="background:var(--c${(groupIdx[g] % 8) + 1})"></i>${esc(g)}</span>`).join('')}</p></section>
      <section class="panel"><header class="panel-head"><h2>By month</h2></header>
        ${chartHost({ type: 'stack', h: 300, labels: stackMonths.map(m => MON[+m.slice(5) - 1]), series: topGroups.map(g => ({ name: g, color: `var(--c${(groupIdx[g] % 8) + 1})`, values: stackMonths.map(m => sum(Object.entries(categoryActuals(lensed(txInMonth(m)))).filter(([id, v]) => v > 0 && (catById(id)?.group || 'Uncategorized') === g && (id === '_none' || catById(id)?.kind === 'expense')).map(([, v]) => v))) })),
          tip: i => `<strong>${monthLabel(stackMonths[i])}</strong>${topGroups.map(g => { const v = sum(Object.entries(categoryActuals(lensed(txInMonth(stackMonths[i])))).filter(([id, v]) => v > 0 && (catById(id)?.group || 'Uncategorized') === g && (id === '_none' || catById(id)?.kind === 'expense')).map(([, v]) => v)); return v ? `<br>${esc(g)} ${money(v, { cents: false })}` : ''; }).join('')}` })}
        <p class="legend">${topGroups.map(g => `<span><i style="background:var(--c${(groupIdx[g] % 8) + 1})"></i>${esc(g)}</span>`).join('')}</p></section>
    </div>
    <table class="ledger"><thead><tr><th>Category</th><th class="hide-sm">Group</th><th class="num">Total</th><th class="num hide-sm">Per month</th><th class="num">Share</th><th class="spark-cell hide-sm">12 months</th></tr></thead>
      <tbody>${rows.map(r => `<tr><th scope="row"><a href="#/transactions?m=all&cat=${r.id}">${esc(r.name)}</a></th><td class="hide-sm muted">${esc(r.group)}</td><td class="num">${money(r.value, { cents: false })}</td><td class="num hide-sm">${money(r.value / nM, { cents: false })}</td><td class="num">${pct(r.value / total, 1)}</td><td class="spark-cell hide-sm">${sparkline(trendMonths.map(m => categoryActuals(lensed(txInMonth(m)))[r.id] || 0), { w: 90, h: 22, color: `var(--c${(groupIdx[r.group] % 8) + 1})` })}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="hide-sm"></td><td class="num total">${money(total, { cents: false })}</td><td class="num hide-sm">${money(total / nM, { cents: false })}</td><td></td><td class="hide-sm"></td></tr></tfoot></table>`;
  }

  if (tab === 'statement') {
    const ms = months.slice(-12);
    const per = ms.map(m => categoryActuals(lensed(txInMonth(m))));
    const cats = state.categories.filter(c => c.kind !== 'transfer' && per.some(a => a[c.id]));
    const inc = cats.filter(c => c.kind === 'income'), exp = groupBy(cats.filter(c => c.kind === 'expense'), c => c.group);
    const hasUnc = per.some(a => a._none);
    const row = (label, vals, cls = '') => `<tr class="${cls}"><th scope="row">${label}</th>${vals.map(v => `<td class="num">${v ? money(v, { cents: false }) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num total-col">${money(sum(vals), { cents: false })}</td></tr>`;
    const incT = ms.map((_, i) => sum(inc.map(c => per[i][c.id] || 0)));
    const expT = ms.map((_, i) => sum(cats.filter(c => c.kind === 'expense').map(c => per[i][c.id] || 0)) + (per[i]._none || 0));
    return head + `<div class="toolbar"><button class="btn small" data-act="export-statement" data-from="${R.from}" data-to="${R.to}">Export CSV</button><span class="muted small">Showing ${ms.length} month${ms.length > 1 ? 's' : ''}. Transfers are left out.</span></div>
    <div class="scroll-table"><table class="ledger statement"><thead><tr><th>Category</th>${ms.map(m => `<th class="num">${monthLabel(m, true)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      <tr class="sect"><th colspan="${ms.length + 2}">Income</th></tr>
      ${inc.map(c => row(`<span class="indent-in">${esc(c.name)}</span>`, ms.map((_, i) => per[i][c.id] || 0))).join('')}
      ${row('Total income', incT, 'subtotal')}
      <tr class="sect"><th colspan="${ms.length + 2}">Spending</th></tr>
      ${Object.entries(exp).map(([g, cs]) => row(`<strong>${esc(g)}</strong>`, ms.map((_, i) => sum(cs.map(c => per[i][c.id] || 0))), 'grp') + cs.map(c => row(`<span class="indent-in">${esc(c.name)}</span>`, ms.map((_, i) => per[i][c.id] || 0), 'detail-only')).join('')).join('')}
      ${hasUnc ? row('<strong>Uncategorized</strong>', ms.map((_, i) => per[i]._none || 0), 'grp') : ''}
      ${row('Total spending', expT, 'subtotal')}
      ${row('Net', ms.map((_, i) => incT[i] - expT[i]), 'net')}
      <tr class="rate"><th scope="row">Savings rate</th>${ms.map((_, i) => `<td class="num">${incT[i] ? pct((incT[i] - expT[i]) / incT[i], 0) : '—'}</td>`).join('')}<td class="num total-col">${sum(incT) ? pct((sum(incT) - sum(expT)) / sum(incT), 0) : '—'}</td></tr>
    </tbody></table></div>`;
  }

  if (tab === 'yoy') {
    const shift = d => `${+d.slice(0, 4) - 1}${d.slice(4)}`;
    const lyFrom = shift(R.from), lyTo = shift(R.to) === `${+R.to.slice(0, 4) - 1}-02-29` ? `${+R.to.slice(0, 4) - 1}-02-28` : shift(R.to);
    const a1 = categoryActuals(lensed(txInRange(lyFrom, lyTo)));
    const ids = [...new Set([...Object.keys(acts), ...Object.keys(a1)])].filter(id => id !== '_none' && catById(id) && catById(id).kind !== 'transfer');
    const rows = ids.map(id => ({ c: catById(id), now: acts[id] || 0, then: a1[id] || 0 })).filter(r => r.now || r.then).sort((x, y) => Math.abs(y.now - y.then) - Math.abs(x.now - x.then));
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.now - r.then)));
    const f0 = flowSummary(lensed(txInRange(lyFrom, lyTo))), f1 = flowSummary(txs);
    return head + `
    <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Left over</th></tr></thead><tbody>
      <tr><th scope="row">${dateLabel(R.from, true)} to ${dateLabel(R.to, true)}</th><td class="num">${money(f1.income, { cents: false })}</td><td class="num">${money(f1.spending, { cents: false })}</td><td class="num">${money(f1.net, { cents: false })}</td></tr>
      <tr><th scope="row">Same period a year earlier</th><td class="num muted">${money(f0.income, { cents: false })}</td><td class="num muted">${money(f0.spending, { cents: false })}</td><td class="num muted">${money(f0.net, { cents: false })}</td></tr></tbody></table></section>
    ${rows.length ? `<table class="ledger yoy"><thead><tr><th>Category</th><th class="num">A year earlier</th><th class="num">Now</th><th class="num">Change</th><th class="diverge-cell hide-sm"></th></tr></thead><tbody>
      ${rows.map(r => { const d = r.now - r.then, bad = r.c.kind === 'income' ? d < 0 : d > 0; return `<tr><th scope="row">${esc(r.c.name)} <span class="muted small">${esc(r.c.group)}</span></th><td class="num muted">${money(r.then, { cents: false })}</td><td class="num">${money(r.now, { cents: false })}</td><td class="num ${bad ? 'neg' : 'pos'}">${money(d, { cents: false, sign: true })}${r.then ? `<div class="small">${pct(d / r.then, 0)}</div>` : ''}</td><td class="diverge-cell hide-sm"><div class="diverge"><span class="${bad ? 'bad' : 'good'}" style="${d >= 0 ? 'left:50%' : `right:50%`};width:${Math.abs(d) / maxAbs * 50}%"></span></div></td></tr>`; }).join('')}
    </tbody></table>` : emptyState('No history to compare yet', 'Year-over-year needs transactions from the same period last year.')}`;
  }

  if (tab === 'people') {
    const ms = months.length >= 2 ? months.slice(-12) : Array.from({ length: 12 }, (_, i) => addMonths(thisMonth(), i - 11));
    const all = txInRange(R.from, R.to);
    const per = members().map(m => { const t = all.filter(x => personOf(x) === m.id); return { m, f: flowSummary(t), acts: categoryActuals(t) }; });
    const tot = sum(per.map(x => x.f.spending)) || 1;
    const cats = state.categories.filter(c => c.kind === 'expense' && per.some(x => (x.acts[c.id] || 0) > 0)).sort((a, b) => sum(per.map(x => x.acts[b.id] || 0)) - sum(per.map(x => x.acts[a.id] || 0)));
    return head + `
    <div class="people-cards">${per.map(x => `<div class="person-card" style="--pc:${memberColor(x.m.id)}"><span class="person-name">${esc(x.m.name)}</span><span class="s-value num">${money(x.f.spending, { cents: false })}</span><span class="muted">${pct(x.f.spending / tot, 0)} of household spending</span>
      <ul>${Object.entries(x.acts).filter(([id, v]) => v > 0 && catById(id)?.kind === 'expense').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => `<li><span>${esc(catName(id))}</span><span class="num">${money(v, { cents: false })}</span></li>`).join('')}</ul></div>`).join('')}</div>
    <section class="panel"><header class="panel-head"><h2>Spending by person, by month</h2></header>
      ${chartHost({ type: 'stack', h: 240, labels: ms.map(m => MON[+m.slice(5) - 1]), series: members().map(m => ({ name: m.name, color: memberColor(m.id), values: ms.map(mm => flowSummary(txInMonth(mm).filter(t => personOf(t) === m.id)).spending) })),
        tip: i => `<strong>${monthLabel(ms[i])}</strong>${members().map(m => `<br>${esc(m.name)} ${money(flowSummary(txInMonth(ms[i]).filter(t => personOf(t) === m.id)).spending, { cents: false })}`).join('')}` })}
      <p class="legend">${members().map(m => `<span><i style="background:${memberColor(m.id)}"></i>${esc(m.name)}</span>`).join('')}</p></section>
    <table class="ledger"><thead><tr><th>Category</th>${per.map(x => `<th class="num">${esc(x.m.name)}</th>`).join('')}<th class="num">Household</th></tr></thead><tbody>
      ${cats.map(c => `<tr><th scope="row">${esc(c.name)}</th>${per.map(x => `<td class="num">${x.acts[c.id] > 0 ? money(x.acts[c.id], { cents: false }) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num">${money(sum(per.map(x => Math.max(0, x.acts[c.id] || 0))), { cents: false })}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small">A transaction belongs to its account’s owner unless you set a person on it. Set owners in each account and people in Settings.</p>`;
  }

  // net worth
  const ms = Object.keys(state.snapshots).sort();
  const bucketVals = b => ms.map(m => sum(Object.entries(state.snapshots[m]).filter(([id]) => (ACCOUNT_TYPES[acctById(id)?.type]?.bucket || 'illiquid') === b).map(([, v]) => v)));
  const nw = ms.map(m => snapshotNW(m));
  const ago = ms[Math.max(0, ms.length - 13)];
  return head + `
  <section class="panel"><header class="panel-head"><h2>Net worth over time</h2><span class="muted small">Areas show what you own by type; debt sits below zero. The line is net worth.</span></header>
    ${chartHost({ type: 'stack', h: 300, labels: ms.map(m => monthLabel(m, true)), series: [['cash', 'Cash', 'var(--c2)'], ['invest', 'Investments', 'var(--c1)'], ['illiquid', 'Property and private', 'var(--c4)'], ['debt', 'Debt', 'var(--neg)']].map(([b, name, color]) => ({ name, color, values: bucketVals(b) })), line: { values: nw, color: 'var(--ink)' },
      tip: i => `<strong>${monthLabel(ms[i])}</strong><br>Net worth ${money(nw[i], { cents: false })}` })}
    <p class="legend"><span><i style="background:var(--c2)"></i>Cash</span><span><i style="background:var(--c1)"></i>Investments</span><span><i style="background:var(--c4)"></i>Property and private</span><span><i style="background:var(--neg)"></i>Debt</span><span><i style="background:var(--ink);height:2px"></i>Net worth</span></p></section>
  <table class="ledger"><thead><tr><th>Account</th><th class="num">${ago ? monthLabel(ago, true) : ''}</th><th class="num">Now</th><th class="num">Change</th><th class="spark-cell hide-sm">Trend</th></tr></thead><tbody>
    ${activeAccounts().map(a => { const then = ago ? state.snapshots[ago][a.id] : null, now = signedValue(a); return `<tr><th scope="row">${esc(a.name)}</th><td class="num muted">${then == null ? '—' : money(then, { cents: false })}</td><td class="num">${money(now, { cents: false })}</td><td class="num ${then == null ? '' : signClass(now - then)}">${then == null ? '' : money(now - then, { cents: false, sign: true })}</td><td class="spark-cell hide-sm">${sparkline(ms.slice(-13).map(m => state.snapshots[m][a.id] || 0), { w: 90, h: 22, color: isLiability(a) ? 'var(--neg)' : 'var(--ink-accent)' })}</td></tr>`; }).join('')}
  </tbody><tfoot><tr><th scope="row">Net worth</th><td class="num total">${ago ? money(snapshotNW(ago), { cents: false }) : ''}</td><td class="num total">${money(totals().netWorth, { cents: false })}</td><td class="num total ${ago ? signClass(totals().netWorth - snapshotNW(ago)) : ''}">${ago ? money(totals().netWorth - snapshotNW(ago), { cents: false, sign: true }) : ''}</td><td class="hide-sm"></td></tr></tfoot></table>`;
};
function sankeyFromActs(acts) {
  const inc = [], groups = {};
  for (const [id, v] of Object.entries(acts)) { const c = catById(id); if (!c) { if (v > 0) groups.Uncategorized = (groups.Uncategorized || 0) + v; continue; } if (c.kind === 'income' && v > 0) inc.push({ name: c.name, value: v }); else if (c.kind === 'expense' && v > 0) groups[c.group] = (groups[c.group] || 0) + v; }
  const income = sum(inc.map(x => x.value)), spending = sum(Object.values(groups));
  const right = Object.entries(groups).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (income > spending) right.push({ name: 'Saved', value: income - spending, saved: true }); else if (spending > income) inc.push({ name: 'From savings or shared income', value: spending - income, drawn: true });
  return { left: inc.sort((a, b) => (a.drawn ? 1 : 0) - (b.drawn ? 1 : 0) || b.value - a.value), right, income, spending };
}

/* ================= Planning ================= */
VIEWS.planning = p => {
  const tab = p.t || 'goals';
  const head = pageHead('Planning', tab === 'retire' ? 'A Monte Carlo projection in today’s dollars. It’s a planning tool, not a promise.' : tab === 'debt' ? 'Pay debt off faster and see what it saves.' : 'What you’re saving toward, and whether you’re on pace.',
    tab === 'goals' ? '<button class="btn primary" data-act="add-goal">Add a goal</button>' : '') + tabs('t', tab, [['goals', 'Goals'], ['retire', 'Retirement'], ['debt', 'Debt payoff']]);
  if (tab === 'goals') {
    if (!state.goals.length) return head + emptyState('No goals yet', 'Create a goal for an emergency fund, a trip, a down payment or college. Link it to an account or a rollover budget and Ọrọ̀ tracks progress automatically.', '<button class="btn primary" data-act="add-goal">Add a goal</button>');
    return head + `<div class="goal-grid">${state.goals.map(g => {
      const pr = goalProgress(g);
      return `<article class="goal-card ${pr.status}">
        ${ring(pr.share, { size: 108, width: 11, label: pct(pr.share, 0), color: pr.status === 'behind' ? 'var(--warn)' : pr.status === 'done' ? 'var(--pos)' : 'var(--ink-accent)' })}
        <div><h3><button class="linklike" data-edit-goal="${g.id}">${esc(g.name)}</button></h3>
        <p class="s-value num">${money(pr.current, { cents: false })} <span class="muted">of ${money(pr.target, { cents: false })}</span></p>
        <dl class="goal-facts">
          ${g.targetDate ? `<div><dt>Target date</dt><dd>${dateLabel(g.targetDate, true)}</dd></div>` : ''}
          ${pr.needed != null && pr.status !== 'done' ? `<div><dt>Needed each month</dt><dd class="num">${money(pr.needed, { cents: false })}</dd></div>` : ''}
          ${g.monthly ? `<div><dt>Planned each month</dt><dd class="num">${money(g.monthly, { cents: false })}</dd></div>` : ''}
          <div><dt>Tracks</dt><dd>${esc(pr.source)}</dd></div></dl>
        <span class="goal-status ${pr.status}">${pr.status === 'done' ? 'Funded' : pr.status === 'behind' ? 'Behind pace' : 'On track'}</span></div></article>`;
    }).join('')}</div>`;
  }
  if (tab === 'debt') {
    const P = state.plan, debts = debtList();
    if (!debts.length) return head + emptyState('No debt to pay off', P.includeMortgages ? 'There are no liabilities with a balance.' : 'No cards or loans have a balance. Mortgages are left out unless you include them.', `<label class="check"><input type="checkbox" data-plan="includeMortgages" ${P.includeMortgages ? 'checked' : ''}> Include mortgages</label>`);
    const plan = payoffPlan(debts, P.debtExtra, P.debtMethod), other = payoffPlan(debts, P.debtExtra, P.debtMethod === 'avalanche' ? 'snowball' : 'avalanche'), min = payoffPlan(debts, 0, 'avalanche');
    const dateAt = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
    const len = Math.max(plan.series.length, min.series.length);
    const pad = (s) => Array.from({ length: len }, (_, i) => ({ x: i, y: s[i] ? s[i].y : 0 }));
    return head + `
    <div class="form-grid four">
      <label class="field"><span>Extra each month</span><input data-plan="debtExtra" inputmode="decimal" value="${P.debtExtra}"></label>
      <label class="field"><span>Strategy</span><select data-plan="debtMethod"><option value="avalanche" ${P.debtMethod === 'avalanche' ? 'selected' : ''}>Highest rate first (avalanche)</option><option value="snowball" ${P.debtMethod === 'snowball' ? 'selected' : ''}>Smallest balance first (snowball)</option></select></label>
      <label class="check"><input type="checkbox" data-plan="includeMortgages" ${P.includeMortgages ? 'checked' : ''}> Include mortgages</label>
    </div>
    <section class="flows"><table class="ledger flows-table"><thead><tr><th></th><th class="num">Debt-free</th><th class="num">Months</th><th class="num">Interest paid</th></tr></thead><tbody>
      <tr><th scope="row">Your plan (${P.debtMethod})</th><td class="num">${plan.capped ? 'Over 50 years' : dateAt(plan.months)}</td><td class="num">${plan.months}</td><td class="num">${money(plan.interest, { cents: false })}</td></tr>
      <tr><th scope="row">${P.debtMethod === 'avalanche' ? 'Snowball instead' : 'Avalanche instead'}</th><td class="num muted">${dateAt(other.months)}</td><td class="num muted">${other.months}</td><td class="num muted">${money(other.interest, { cents: false })}</td></tr>
      <tr><th scope="row">Minimums only</th><td class="num muted">${min.capped ? 'Over 50 years' : dateAt(min.months)}</td><td class="num muted">${min.months}</td><td class="num muted">${money(min.interest, { cents: false })}</td></tr></tbody></table>
      <p class="callout">${P.debtExtra > 0 ? `Paying ${money(P.debtExtra, { cents: false })} extra a month saves <strong>${money(min.interest - plan.interest, { cents: false })}</strong> in interest and finishes <strong>${min.months - plan.months} months</strong> sooner.` : 'Add an extra monthly amount to see what it saves.'}</p></section>
    <section class="panel"><header class="panel-head"><h2>Balance remaining</h2></header>
      ${chartHost({ h: 230, label: 'Debt balance over time', series: [{ points: pad(min.series), color: 'var(--muted-2)', dash: true, nodots: true }, { points: pad(plan.series), color: 'var(--ink-accent)', area: true, nodots: true }], xFmt: i => i % 12 === 0 ? `${new Date().getFullYear() + i / 12}` : `+${i}m`, tip: i => `<strong>${dateAt(i)}</strong><br>Your plan ${money(plan.series[i]?.y || 0, { cents: false })}<br><span class="muted">Minimums ${money(min.series[i]?.y || 0, { cents: false })}</span>` })}
      <p class="legend"><span><i style="background:var(--ink-accent)"></i>Your plan</span><span><i style="background:var(--muted-2)"></i>Minimums only</span></p></section>
    <table class="ledger"><thead><tr><th>Debt</th><th class="num">Balance</th><th class="num">Rate</th><th class="num">Minimum</th><th class="num">Paid off</th></tr></thead><tbody>
      ${plan.debts.sort((a, b) => (a.paidMonth || 999) - (b.paidMonth || 999)).map(d => `<tr><th scope="row"><button class="linklike" data-edit-acct="${d.id}">${esc(d.name)}</button></th><td class="num">${money(d.balance, { cents: false })}</td><td class="num">${d.rate ? d.rate + '%' : '<span class="muted">add rate</span>'}</td><td class="num">${money(d.min, { cents: false })}</td><td class="num">${d.paidMonth ? dateAt(d.paidMonth) : '—'}</td></tr>`).join('')}
    </tbody></table><p class="muted small">Rates and minimum payments come from each account. Missing minimums assume 2% of the balance.</p>`;
  }
  // retirement
  const P = state.plan, D = planDefaults();
  if (!P.age) return head + `<section class="panel narrow"><h2>Start with your age</h2><p class="muted">Ọrọ̀ fills in the rest from your accounts and spending, and you can adjust any of it.</p>
    <div class="form-grid"><label class="field"><span>Your age</span><input data-plan="age" inputmode="numeric" autofocus placeholder="e.g. 42"></label><label class="field"><span>Retire at</span><input data-plan="retireAge" inputmode="numeric" value="${P.retireAge}"></label></div></section>`;
  const stats = portfolioStats(D.alloc);
  const inp = {
    age: +P.age, retireAge: +P.retireAge, endAge: +P.endAge,
    start: P.start != null && P.start !== '' ? +P.start : D.start,
    savings: (P.savings != null && P.savings !== '' ? +P.savings : D.savings) + (+P.payrollSavings || 0),
    spending: P.spending != null && P.spending !== '' ? +P.spending : D.spending,
    otherIncome: +P.otherIncome || 0, otherIncomeAge: +P.otherIncomeAge || 67,
    rentalNet: P.includeRental ? D.rentalNet : 0, inflation: +P.inflation,
    mean: P.mean != null && P.mean !== '' ? P.mean / 100 : stats.mean, sd: P.sd != null && P.sd !== '' ? P.sd / 100 : stats.sd,
  };
  const res = runRetirement(inp, { sims: +P.sims || 2000 });
  const target = (+P.target || 90) / 100;
  const safe = safeSpending(inp, target), early = earliestRetirement(inp, target);
  const xs = res.bands.map((_, i) => inp.age + i);
  const ri = inp.retireAge - inp.age;
  const tone = res.success >= 0.85 ? 'var(--pos)' : res.success >= 0.7 ? 'var(--warn)' : 'var(--neg)';
  const field = (k, label, val, ph, help) => `<label class="field"><span>${label}</span><input data-plan="${k}" inputmode="decimal" value="${val ?? ''}" placeholder="${ph ?? ''}">${help ? `<small class="muted">${help}</small>` : ''}</label>`;
  return head + `
  <div class="plan-layout">
    <section class="panel plan-inputs">
      <h2>Assumptions</h2>
      <div class="form-grid">
        ${field('age', 'Your age', P.age)}${field('retireAge', 'Retire at', P.retireAge)}
        ${field('endAge', 'Plan through age', P.endAge)}${field('inflation', 'Inflation (%)', P.inflation)}
      </div>
      <div class="form-grid">
        ${field('start', 'Invested today', P.start, money(D.start, { cents: false }), 'Cash, investments' + (P.includePrivate ? ' and private' : ''))}
        ${field('savings', 'Saved per year from cash flow', P.savings, money(D.savings, { cents: false }), 'Last 12 months, after spending')}
        ${field('payrollSavings', '401(k) and payroll savings per year', P.payrollSavings, '0', 'Taken out before your paycheck')}
        ${field('spending', 'Spending in retirement per year', P.spending, money(D.spending, { cents: false }), 'Today’s dollars; defaults to the last 12 months')}
        ${field('otherIncome', 'Social Security or pension per year', P.otherIncome, '0', 'Today’s dollars')}
        ${field('otherIncomeAge', 'Starting at age', P.otherIncomeAge)}
      </div>
      <div class="form-grid">
        ${field('mean', 'Expected return (%)', P.mean, (stats.mean * 100).toFixed(1), 'From your allocation')}
        ${field('sd', 'Volatility (%)', P.sd, (stats.sd * 100).toFixed(1))}
        ${field('target', 'Confidence target (%)', P.target)}
        ${field('sims', 'Simulations', P.sims)}
      </div>
      <label class="check"><input type="checkbox" data-plan="includePrivate" ${P.includePrivate ? 'checked' : ''}> Count private investments</label>
      <label class="check"><input type="checkbox" data-plan="includeRental" ${P.includeRental ? 'checked' : ''}> Keep rental cash flow in retirement (${money(D.rentalNet, { cents: false })} a year)</label>
      <p class="muted small">Leave a field blank to use the value Ọrọ̀ works out from your data. Returns are drawn from a lognormal distribution each year; everything is in today’s dollars.</p>
    </section>
    <div class="plan-results">
      <section class="panel result-hero">
        ${ring(res.success, { size: 132, width: 13, label: pct(res.success, 0), color: tone })}
        <div><h2>Chance your money lasts to ${inp.endAge}</h2>
          <p>Retiring at <strong>${inp.retireAge}</strong> and spending <strong>${money(inp.spending, { cents: false })}</strong> a year, the plan works in ${pct(res.success, 0)} of ${(+P.sims || 2000).toLocaleString()} simulated markets.${res.depletedMedianAge ? ` When it doesn’t, money typically runs out around ${Math.round(res.depletedMedianAge)}.` : ''}</p>
          <dl class="kpis three"><div><dt>Spend up to</dt><dd class="num">${money(safe, { cents: false })}</dd><span class="muted small">a year at ${pct(target, 0)} confidence</span></div>
          <div><dt>Earliest retirement</dt><dd>${early ? `Age ${early}` : 'After 80'}</dd><span class="muted small">at today’s spending</span></div>
          <div><dt>Median at ${inp.retireAge}</dt><dd class="num">${money(res.bands[Math.min(ri, res.bands.length - 1)][2], { cents: false })}</dd><span class="muted small">in today’s dollars</span></div></dl></div>
      </section>
      <section class="panel"><header class="panel-head"><h2>Range of outcomes</h2><span class="muted small">Today’s dollars</span></header>
        ${chartHost({ h: 280, label: 'Projected portfolio range', series: [{ points: res.bands.map((b, i) => ({ x: xs[i], y: b[2] })), color: 'var(--ink-accent)', nodots: true }],
          bands: [{ lo: res.bands.map(b => b[0]), hi: res.bands.map(b => b[4]), color: 'var(--ink-accent)', opacity: 0.12 }, { lo: res.bands.map(b => b[1]), hi: res.bands.map(b => b[3]), color: 'var(--ink-accent)', opacity: 0.2 }],
          vlines: ri > 0 && ri < xs.length ? [{ i: ri, label: 'Retire' }] : [], xFmt: x => `${x}`,
          tip: i => `<strong>Age ${xs[i]}</strong><br>Strong markets ${money(res.bands[i][4], { cents: false })}<br>Median ${money(res.bands[i][2], { cents: false })}<br>Weak markets ${money(res.bands[i][0], { cents: false })}` })}
        <p class="legend"><span><i style="background:var(--ink-accent)"></i>Median</span><span><i style="background:var(--ink-accent);opacity:.35"></i>Middle half of outcomes</span><span><i style="background:var(--ink-accent);opacity:.15"></i>80% of outcomes</span></p></section>
    </div>
  </div>`;
};

/* ================= Taxes ================= */
VIEWS.taxes = p => {
  const year = +(p.y || new Date().getFullYear());
  const years = [...new Set([new Date().getFullYear(), new Date().getFullYear() - 1, ...state.transactions.map(t => yearOf(t.date))])].sort((a, b) => b - a);
  const rentals = activeAccounts().filter(a => a.type === 'realestate' && a.rental);
  const ded = deductionSummary(year);
  return pageHead('Taxes', `${year} tax year. Organized for your CPA; not tax advice.`, `<label class="field inline"><span class="sr">Year</span><select data-filter="y">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label><button class="btn" data-act="export-tax" data-year="${year}">Export for your CPA</button>`) + `
  ${rentals.length ? rentals.map(a => {
    const E = scheduleE(a, year), g = a.rentalGroup || 'Rental property';
    const rentalCats = state.categories.filter(c => c.group === g);
    return `<section class="panel"><header class="panel-head"><h2>Schedule E: ${esc(a.name)}</h2><span class="muted small">Part I, rental real estate</span></header>
      <div class="cols tight">
        <table class="ledger compact sched"><tbody>
          ${Object.keys(SCHED_E).filter(k => E.lines[k] || k === '3' || k === '12' || k === '18').map(k => `<tr class="${k === '3' ? 'income-line' : ''}"><td class="lineno">${k}</td><th scope="row">${SCHED_E[k]}</th><td class="num">${money(E.lines[k] || 0)}</td></tr>`).join('')}
          <tr class="subtotal"><td class="lineno">20</td><th scope="row">Total expenses</th><td class="num total">${money(E.expenses)}</td></tr>
          <tr class="net"><td class="lineno">21</td><th scope="row">Income or (loss)</th><td class="num total double ${signClass(E.net)}">${money(E.net, { paren: true })}</td></tr>
        </tbody></table>
        <div class="tax-side">
          <label class="field"><span>Mortgage interest from Form 1098, ${year}</span><input data-taxint="${a.id}" data-year="${year}" inputmode="decimal" value="${state.tax?.[a.id]?.[year]?.interest ?? ''}" placeholder="0.00"><small class="muted">Recorded mortgage payments this year: ${money(E.debtPaid, { cents: false })} (principal and interest). Only the interest goes on line 12.</small></label>
          <p class="small">${a.buildingBasis && a.placedInService ? `Depreciation: ${money(a.buildingBasis, { cents: false })} building basis over 27.5 years from ${dateLabel(a.placedInService, true)} (mid-month convention).` : `<button class="linklike" data-edit-acct="${a.id}">Add the building basis and in-service date</button> to calculate depreciation.`}</p>
          <details><summary>Which line each category goes on</summary>
            <table class="ledger compact"><tbody>${rentalCats.map(c => `<tr><th scope="row">${esc(c.name)}</th><td>${c.rental === 'debt' ? '<span class="muted">Debt service (use 1098 interest)</span>' : `<select data-schede="${c.id}">${Object.entries(SCHED_E).filter(([k]) => k !== '18' && k !== '12').map(([k, l]) => `<option value="${k}" ${(c.schedE || (c.rental === 'income' ? '3' : '19')) === k ? 'selected' : ''}>Line ${k}: ${l}</option>`).join('')}</select>`}</td></tr>`).join('')}</tbody></table></details>
        </div>
      </div></section>`;
  }).join('') : `<section class="panel"><h2>Rental property</h2><p class="muted">Mark a real-estate account as a rental to build its Schedule E here.</p></section>`}
  <section class="panel"><header class="panel-head"><h2>Possible deductions and credits</h2><span class="muted small">From categories with a tax tag</span></header>
    ${Object.keys(ded.by).length ? `<table class="ledger compact"><tbody>${Object.entries(ded.by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="muted small">${state.categories.filter(c => c.taxTag === k).map(c => esc(c.name)).join(', ')}</td><td class="num">${money(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No spending in tax-tagged categories this year. Tag categories (charitable, medical, dependent care) in Settings.</p>'}
    ${ded.tagged.length ? `<h3>Transactions tagged #tax</h3><table class="ledger compact"><tbody>${ded.tagged.map(t => `<tr><td class="nowrap muted">${dateLabel(t.date, true)}</td><td>${esc(t.payee)}</td><td class="num">${money(t.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Tag any transaction #tax to collect it here.</p>'}
  </section>`;
};

/* ================= Settings ================= */
VIEWS.data = () => {
  const n = state.transactions.length;
  const groups = groupBy(state.categories, c => c.group);
  let where;
  if (Store.dir) where = Store.perm === 'granted' ? `Saving to your <strong>${esc(Store.fileName)}</strong> folder: <code>data/oro.json</code> (each save is numbered at the bottom of the sidebar; your iPhone shows the same number once it has that copy), with a dated copy in <code>backups/</code> each day and receipts in <code>receipts/</code>.` : `Your <strong>${esc(Store.fileName)}</strong> folder is connected, but this browser needs your permission again.`;
  else if (Store.handle) where = `Saving to <strong>${esc(Store.fileName)}</strong>. Switch to a Ọrọ̀ folder to get daily backups and receipts.`;
  else where = 'Only saved in this browser’s private storage. Choose your Ọrọ̀ folder so your data lives as files you can see and back up.';
  const lm = state.meta.lastMerge;
  const phoneLine = !isCompanion() && Store.dir ? `<p class="muted small"><strong>iPhone:</strong> changes you send from Ọrọ̀ on your iPhone are saved into <code>inbox/</code> in this folder and added here automatically while Ọrọ̀ is open.${lm ? ` Last added ${esc(whenLabel(lm.at))}: ${changesWord(lm.applied)} from your ${esc(lm.device)}${lm.conflicts ? `, ${lm.conflicts} kept as this Mac’s version${lm.kept?.length ? ` (${lm.kept.slice(0, 6).map(esc).join(', ')}${lm.kept.length > 6 ? '…' : ''})` : ''}` : ''}.` : ''}</p>` : '';
  if (isCompanion()) {
    const dev = deviceLabel(), rec = SYNC.rec, n = rec && !rec.replaced ? syncPending().length : 0;
    where = rec ? (rec.replaced ? `The data on this ${dev} was replaced, so it no longer matches your Mac’s. Get the latest from iCloud Drive to start fresh.` : `This ${dev} has your Mac’s <strong>${esc(saveLabel(rec.macSaveNo, rec.macSaved))}</strong>.${mergeNote(rec.base?.meta?.lastMerge, dev)} ${n ? `${changesWord(n)} made here ${n === 1 ? 'isn’t' : 'aren’t'} on your Mac yet.` : 'Everything you’ve changed here has been sent.'}`)
      : `Saved on this ${dev} only. Open your Mac’s data from iCloud Drive to work with the same numbers in both places.`;
  }
  return pageHead('Settings', '') + `
  <section class="panel">
    <header class="panel-head"><h2>Where your data lives</h2><span class="muted small">${isCompanion() ? 'Only on your devices and in your iCloud' : 'Nothing ever leaves this Mac'}</span></header>
    <p>${where}</p>
    <div class="actions wrap">
      ${Store.canPickFolder ? (Store.dir && Store.perm !== 'granted' ? `<button class="btn primary" data-act="reconnect">Reconnect ${esc(Store.fileName)}</button>` : `<button class="btn ${Store.dir ? '' : 'primary'}" data-act="connect-folder">${Store.dir ? 'Choose a different folder…' : 'Choose your Ọrọ̀ folder…'}</button>`) : ''}
      ${isCompanion() ? `<button class="btn primary" data-act="sync">${SYNC.rec ? 'Sync with your Mac…' : 'Open from iCloud Drive…'}</button>` : `<button class="btn" data-act="open-file">Open a data file…</button>`}
      <button class="btn" data-act="backup">Download a backup</button>
      <button class="btn ghost" data-act="export-csv">Export transactions as CSV</button>
      ${Store.dir || Store.handle ? `<button class="btn ghost" data-act="disconnect-file">Disconnect</button>` : ''}
    </div>
    ${isCompanion() ? `<p class="muted small">Your Mac’s data is in <strong>iCloud Drive › Ọrọ̀ › data › oro.json</strong>. Changes you send go to <strong>iCloud Drive › Ọrọ̀ › inbox</strong>, and your Mac adds them the next time Ọrọ̀ is open there. If both places change the same item, your Mac’s version is kept.</p>` : `<p class="muted small">Tip: choose the Ọrọ̀ folder this app lives in (iCloud Drive › Ọrọ̀). Because that folder syncs through iCloud Drive, turn on a passphrase so the copy Apple stores is encrypted.</p>${phoneLine}`}
    <div id="backup-list" class="backup-list"></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Security</h2><span class="muted small">${Store.key ? 'Encrypted' : 'Not encrypted'}</span></header>
    <p>${Store.key ? 'Your data, backups and receipts are encrypted with AES-256 using your passphrase.' : 'Add a passphrase to encrypt your data, backups and receipts. Anyone who gets the files can’t read them without it.'} There’s no way to recover a forgotten passphrase, so store it in your password manager.</p>
    <div class="form-grid">
      <div class="actions">${Vault.available() ? (Store.key ? `<button class="btn" data-act="change-pass">Change passphrase</button><button class="btn ghost danger-text" data-act="remove-pass">Remove</button>` : `<button class="btn primary" data-act="set-pass">Add a passphrase</button>`) : '<span class="muted">Encryption isn’t available in this browser.</span>'}</div>
      <label class="field"><span>Lock after inactivity</span><select data-setting="autoLock" ${Store.key ? '' : 'disabled'}>${[[0, 'Never'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']].map(([v, l]) => `<option value="${v}" ${+state.settings.autoLock === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${Store.key ? '' : '<small class="muted">Needs a passphrase</small>'}</label>
    </div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Household</h2></header>
    <p class="muted">People in the household. Each account has an owner, and each transaction belongs to its account’s owner unless you choose someone else. Use Joint for shared spending.</p>
    <div class="member-list">${members().map((m, i) => `<div class="member-row"><span class="person-dot big" style="background:${memberColor(m.id)}"></span><input data-member="${m.id}" value="${esc(m.name)}" aria-label="Name">${m.id !== 'joint' ? `<button class="icon-btn" data-member-del="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>` : '<span class="muted small">shared</span>'}</div>`).join('')}</div>
    <div class="actions"><button class="btn" data-act="add-member">Add a person</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Appearance and privacy</h2></header>
    <div class="form-grid">
      <label class="field"><span>Theme</span><select data-setting="look">${[['ng', 'Ọrọ̀: forest, ivory and brass'], ['classic', 'Classic: blue ledger']].map(([v, l]) => `<option value="${v}" ${(state.settings.look === 'classic' ? 'classic' : 'ng') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Light or dark</span><select data-setting="theme">${[['auto', isTouch() ? 'Match this device' : 'Match my Mac'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${(state.settings.theme || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-setting-bool="privacy" ${state.settings.privacy ? 'checked' : ''}> ${isTouch() ? 'Hide amounts until I tap them' : 'Hide amounts until I hover (⇧P)'}</label>
      <label class="field"><span>Flag balances older than (days)</span><input data-setting="staleDays" inputmode="numeric" value="${state.settings.staleDays}"></label>
      <label class="field"><span>Warn when cash may dip below</span><input data-setting="lowCash" inputmode="decimal" value="${state.settings.lowCash}"></label>
      <label class="field"><span>Daily backups to keep</span><input data-setting="keepBackups" inputmode="numeric" value="${state.settings.keepBackups}"><small class="muted">Plus one per month for a year</small></label>
    </div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Categorization rules</h2><span class="muted small">${state.rules.length} rule${state.rules.length === 1 ? '' : 's'}</span></header>
    <p class="muted">When a payee contains the text, it gets that category (and optionally a person), on import and when you auto-categorize. Your rules always win. After them Ọrọ̀ uses how you categorized the same merchant before, a built-in list of about 2,000 merchants, the merchant code some banks include, the bank’s own category, and finally words in the name like GRILL, PHARMACY or DENTAL. All of it runs on your device.</p>
    ${state.rules.length ? `<div class="scroll-table short"><table class="ledger compact"><thead><tr><th>Payee contains</th><th>Category</th><th class="hide-sm">Person</th><th class="hide-sm">Rename to</th><th></th></tr></thead><tbody>
    ${state.rules.map(r => `<tr><td><code>${esc(r.text)}</code></td><td>${esc(catName(r.categoryId))}</td><td class="hide-sm muted">${r.person ? esc(memberName(r.person)) : ''}</td><td class="hide-sm muted">${esc(r.rename || '')}</td><td class="acts"><button class="linklike small" data-edit-rule="${r.id}">Edit</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="actions"><button class="btn" data-act="add-rule">Add a rule</button><button class="btn ghost" data-act="run-rules">Auto-categorize uncategorized</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Categories</h2><span class="muted small">${state.categories.length}</span></header>
    <div class="cat-groups">${Object.entries(groups).map(([g, cs]) => `<div><h3>${esc(g)}</h3><ul class="plain">${cs.map(c => `<li><button class="linklike" data-edit-cat="${c.id}">${esc(c.name)}</button> <span class="muted small">${[c.kind === 'transfer' ? 'transfer' : c.kind === 'income' && !c.rental ? 'income' : '', c.period === 'year' ? 'yearly' : '', c.rollover ? 'rolls over' : '', c.taxTag ? c.taxTag.toLowerCase() : '', c.schedE ? `Sch. E line ${c.schedE}` : ''].filter(Boolean).join(', ')}</span></li>`).join('')}</ul></div>`).join('')}</div>
    <div class="actions"><button class="btn" data-act="add-cat">Add a category</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Moving from another app</h2></header>
    <p class="muted">Export your history from YNAB, Monarch, Mint, Copilot, Tiller or Quicken (CSV or QIF), then use Import. Ọrọ̀ reads the account and category columns, creates any categories you don’t have, and keeps tags and notes.</p>
    <div class="actions"><button class="btn" data-act="import">Import a file</button></div>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Keyboard shortcuts</h2></header>
    <dl class="shortcuts">${[['⌘K', 'Search or jump anywhere'], ['N', 'New transaction'], ['I', 'Import'], ['/', 'Search transactions'], ['G then O, T, B, C, A, I, P, R, L, X, M, S', 'Go to a page'], ['⇧P', 'Hide or show amounts'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['?', 'Show shortcuts']].map(([k, l]) => `<div><dt><kbd>${k}</kbd></dt><dd>${l}</dd></div>`).join('')}</dl>
  </section>

  <section class="panel">
    <header class="panel-head"><h2>Start over</h2></header>
    <p class="muted">${state.accounts.length} accounts, ${n.toLocaleString()} transactions, ${state.holdings.length} holdings, ${state.goals.length} goals${state.meta.sample ? '. This is sample data.' : '.'}</p>
    <div class="actions"><button class="btn" data-act="load-sample">Load sample data</button><button class="btn ghost danger-text" data-act="erase">Erase everything</button></div>
  </section>
  <p class="muted small center about-line"><span class="wordmark">Ọrọ̀</span> is ${ORO_MEANING}. <em>${ORO_TAGLINE}</em><br>Version 2.2 · build ${typeof ORO_BUILD === 'string' ? ORO_BUILD : ''} · Runs on your own devices. No accounts, servers or tracking.</p>`;
};
async function paintBackups() {
  const box = $('#backup-list'); if (!box) return;
  const list = await listBackups();
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<details><summary>${list.length} backup${list.length > 1 ? 's' : ''} in your folder</summary><ul class="plain">${list.slice(0, 40).map(b => `<li><span>${dateLabel(b.date, true)}</span> <button class="linklike small" data-restore="${esc(b.name)}">Restore</button></li>`).join('')}</ul></details>`;
}

/* ================= edit dialogs ================= */
/* The merchant part of a bank description: skip leading clutter (POS, SQ, TST…), stop at store codes,
   PENDING, .COM and similar, and drop a trailing state. "FITNESS FORMULA CLUB" stays whole. */
const RULE_LEAD = new Set(['POS', 'DEBIT', 'PURCHASE', 'CHECKCARD', 'CHECK', 'CARD', 'SQ', 'TST', 'PP', 'ACH', 'RECURRING', 'PREAUTHORIZED', 'PENDING', 'THE', 'VISA']);
const RULE_STOP = new Set(['PENDING', 'COM', 'WWW', 'NET', 'ORG', 'HTTPS', 'HTTP', 'PPD', 'WEB', 'ID', 'CCD', 'ACH', 'RECURRING', 'PMT']);
function ruleWords(payee) {
  const all = normPayee(payee).split(' ').filter(Boolean);
  let i = 0;
  while (i < all.length && (RULE_LEAD.has(all[i]) || all[i].length < 2)) i++;
  const run = [];
  for (; i < all.length && run.length < 4; i++) { const w = all[i]; if (w.length < 2 || RULE_STOP.has(w)) break; run.push(w); }
  if (run.length > 1 && US_STATES.has(run[run.length - 1])) run.pop();
  return run;
}
/* Default text for a new rule: the merchant name. When other transactions share the start of it
   (other visits or other locations), keep just the shared part so they all match. */
function ruleKeyFor(payee, selfId) {
  const mine = ruleWords(payee);
  if (!mine.length) return '';
  let shared = Infinity;
  for (const t of state.transactions) {
    if (t.id === selfId) continue;
    const w = ruleWords(t.rawPayee || t.payee);
    let n = 0;
    while (n < mine.length && n < w.length && w[n] === mine[n]) n++;
    if (n >= 2) shared = Math.min(shared, n);
  }
  return mine.slice(0, shared !== Infinity ? shared : Math.min(3, mine.length)).join(' ');
}
function offerRule(t, catId) {
  if (!catId || catId === '__split') return;
  const src = t.rawPayee || t.payee;
  const existing = matchRule(src);
  if (existing && existing.categoryId === catId) return;
  const key = existing ? existing.text : ruleKeyFor(src, t.id); if (!key) return;
  const others = state.transactions.filter(x => x.id !== t.id && isUncat(x) && !isSplit(x) && ruleMatches({ text: key }, x.rawPayee || x.payee)).length;
  toast(`Always file “${key}” under ${catName(catId)}?${others ? ` ${others} more uncategorized look${others === 1 ? 's' : ''} like it.` : ''}`, {
    label: existing ? 'Update the rule…' : 'Make a rule…',
    fn: () => ruleModal(existing?.id || null, { text: key, categoryId: catId }),
  });
}
/* Which transactions a rule's text would catch, for the live preview in the rule dialog. */
function rulePreview(text, categoryId) {
  const r = { text: String(text || '').trim().toUpperCase() };
  if (!r.text) return null;
  const hits = state.transactions.filter(t => !isSplit(t) && ruleMatches(r, t.rawPayee || t.payee));
  const unc = hits.filter(t => !t.categoryId), other = hits.filter(t => t.categoryId && t.categoryId !== categoryId), same = hits.filter(t => categoryId && t.categoryId === categoryId);
  const examples = [...new Set(hits.map(t => prettyPayee(t.rawPayee || t.payee)))].slice(0, 6);
  const otherCats = Object.entries(groupBy(other, t => t.categoryId)).map(([c, l]) => `${catName(c)} ${l.length}`).join(', ');
  return { hits, unc, other, same, examples, otherCats };
}

/* ---------- transaction (with splits, tags, person, receipts) ---------- */
function txnModal(id) {
  const t = id ? state.transactions.find(x => x.id === id) : null;
  const cashAcct = activeAccounts().find(a => a.type === 'checking') || activeAccounts()[0];
  const v = t || { date: today(), payee: '', amount: '', accountId: cashAcct?.id, categoryId: '', memo: '' };
  if (!activeAccounts().length) { toast('Add an account first.'); return acctModal(); }
  let splits = isSplit(v) ? v.splits.map(s => ({ ...s })) : null;
  let atts = (v.attachments || []).map(a => ({ ...a }));
  const multi = members().length > 1;
  openModal({
    title: t ? 'Edit transaction' : 'Add transaction', wide: false,
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Date</span><input type="date" name="date" value="${v.date}" required></label>
      <label class="field"><span>Amount</span><input name="amount" id="tx-amount" inputmode="decimal" value="${v.amount === '' ? '' : round2(v.amount)}" placeholder="-42.50" required><small class="muted">Negative for money out</small></label>
      <label class="field wide"><span>Payee</span><input name="payee" value="${esc(v.payee)}" required autofocus></label>
      <label class="field"><span>Account</span><select name="accountId">${acctOptions(v.accountId)}</select></label>
      <div class="field" id="cat-field"></div>
      ${multi ? `<label class="field"><span>Whose</span><select name="person">${memberOptions(v.person || '', `Account owner (${memberName(acctById(v.accountId)?.owner || 'joint')})`)}</select></label>` : ''}
      <label class="field ${multi ? '' : 'wide'}"><span>Tags</span><input name="tags" value="${esc((v.tags || []).join(', '))}" placeholder="e.g. vacation, tax" list="tag-list-m"><datalist id="tag-list-m">${allTags().map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="field wide"><span>Memo</span><input name="memo" value="${esc(v.memo || '')}"></label>
      <div class="wide" id="split-box"></div>
      <div class="wide attach-box"><span class="field-label">Receipts</span><div id="att-list"></div>
        <label class="btn small ${hasFolder() ? '' : 'disabled'}" title="${hasFolder() ? 'Saved into receipts/ in your Ọrọ̀ folder' : isCompanion() ? 'Attach receipts in Ọrọ̀ on your Mac' : 'Choose your Ọrọ̀ folder in Settings first'}">Attach a file<input type="file" id="att-input" accept="image/*,application/pdf" hidden ${hasFolder() ? '' : 'disabled'}></label></div>
      ${t?.rawPayee && t.rawPayee !== t.payee ? `<p class="muted small wide">Bank description: ${esc(t.rawPayee)}</p>` : ''}
      ${t?.reconciled ? '<p class="muted small wide">✓ Reconciled with a statement</p>' : ''}
    </form>`,
    actions: `${t ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${t ? 'Save' : 'Add transaction'}</button>`,
  });
  const total = () => parseAmount($('#tx-amount').value);
  const paintCat = () => {
    $('#cat-field').innerHTML = splits
      ? `<span class="field-label">Category</span><button type="button" class="btn small" id="unsplit">Remove split</button>`
      : `<span class="field-label">Category</span><div class="cat-row"><select name="categoryId" id="tx-cat">${catOptions(v.categoryId === '__split' ? '' : v.categoryId)}</select><button type="button" class="btn small ghost" id="do-split">Split</button></div>`;
    if ($('#do-split')) $('#do-split').onclick = () => { const a = total(); splits = [{ categoryId: $('#tx-cat').value, amount: isFinite(a) ? round2(a) : 0, memo: '' }, { categoryId: '', amount: 0, memo: '' }]; paintCat(); paintSplits(); };
    if ($('#unsplit')) $('#unsplit').onclick = () => { v.categoryId = splits[0]?.categoryId || ''; splits = null; paintCat(); paintSplits(); };
  };
  const paintSplits = () => {
    const box = $('#split-box');
    if (!splits) { box.innerHTML = ''; return; }
    const rem = round2((total() || 0) - sum(splits.map(s => +s.amount || 0)));
    box.innerHTML = `<div class="split-editor"><div class="split-head"><strong>Split into categories</strong><span class="${Math.abs(rem) > 0.004 ? 'neg' : 'muted'} small">${Math.abs(rem) > 0.004 ? `${money(rem)} left to assign` : 'Fully assigned'}</span></div>
      ${splits.map((s, i) => `<div class="split-row"><select data-si="${i}" data-sk="categoryId">${catOptions(s.categoryId)}</select><input data-si="${i}" data-sk="amount" inputmode="decimal" value="${s.amount}" aria-label="Amount"><input data-si="${i}" data-sk="memo" value="${esc(s.memo || '')}" placeholder="Note" aria-label="Note"><button type="button" class="icon-btn" data-sdel="${i}" aria-label="Remove line">×</button></div>`).join('')}
      <div class="actions"><button type="button" class="btn small" id="split-add">Add a line</button>${Math.abs(rem) > 0.004 ? `<button type="button" class="btn small ghost" id="split-fill">Put the rest on the last line</button>` : ''}</div></div>`;
    box.onchange = e => { const el = e.target; if (el.dataset.si == null) return; const s = splits[+el.dataset.si]; s[el.dataset.sk] = el.dataset.sk === 'amount' ? round2(parseAmount(el.value) || 0) : el.value; paintSplits(); };
    box.onclick = e => {
      if (e.target.closest('#split-add')) { splits.push({ categoryId: '', amount: rem, memo: '' }); paintSplits(); }
      if (e.target.closest('#split-fill')) { splits[splits.length - 1].amount = round2((+splits[splits.length - 1].amount || 0) + rem); paintSplits(); }
      const d = e.target.closest('[data-sdel]'); if (d && splits.length > 1) { splits.splice(+d.dataset.sdel, 1); paintSplits(); }
    };
  };
  const paintAtts = () => {
    $('#att-list').innerHTML = atts.length ? atts.map((a, i) => `<span class="att-chip"><button type="button" class="linklike" data-att-open="${i}">⎘ ${esc(a.name)}</button><button type="button" class="icon-btn" data-att-del="${i}" aria-label="Remove">×</button></span>`).join('') : '<span class="muted small">None</span>';
    $('#att-list').onclick = async e => {
      const o = e.target.closest('[data-att-open]'); if (o) { try { await openAttachment(atts[+o.dataset.attOpen]); } catch (err) { toast(err.message); } }
      const d = e.target.closest('[data-att-del]'); if (d) { atts.splice(+d.dataset.attDel, 1); paintAtts(); }
    };
  };
  paintCat(); paintSplits(); paintAtts();
  $('#tx-amount').onchange = () => paintSplits();
  const ai = $('#att-input');
  if (ai) ai.onchange = async () => {
    const file = ai.files[0]; if (!file) return;
    try { const d = formData($('#f')); atts.push(await saveAttachment(file, { date: d.date || today(), payee: d.payee || 'receipt' })); paintAtts(); }
    catch (err) { toast(err.message); }
  };
  $('#save').onclick = () => {
    const d = formData($('#f'));
    const amount = parseAmount(d.amount);
    if (!d.date || !d.payee.trim() || !isFinite(amount)) return toast('Fill in a date, payee and amount.');
    if (splits) {
      const rem = round2(amount - sum(splits.map(s => +s.amount || 0)));
      if (Math.abs(rem) > 0.004) return toast(`The split lines are ${money(rem)} short of the total.`);
    }
    const prevCat = t?.categoryId;
    const rec = { date: d.date, payee: d.payee.trim(), amount: round2(amount), accountId: d.accountId, memo: d.memo, tags: parseTags(d.tags), attachments: atts };
    if (multi) rec.person = d.person || undefined;
    if (splits) { rec.splits = splits.filter(s => +s.amount || s.categoryId).map(s => ({ categoryId: s.categoryId || null, amount: round2(+s.amount || 0), memo: s.memo || '' })); rec.categoryId = '__split'; }
    else { rec.splits = undefined; rec.categoryId = d.categoryId || null; }
    let target;
    if (t) target = Object.assign(t, rec); else state.transactions.push(target = { id: uid(), ...rec });
    if (!target.tags.length) delete target.tags;
    if (!target.attachments.length) delete target.attachments;
    if (!target.splits) delete target.splits;
    state.transactions.sort((a, b) => b.date.localeCompare(a.date));
    closeModal(); commit();
    if (t && !splits && prevCat !== target.categoryId) offerRule(target, target.categoryId);
  };
  if (t) $('#del').onclick = async () => { if (await confirmBox('Delete transaction', `Delete “${esc(t.payee)}” for ${money(t.amount)}?`, 'Delete', true)) { state.transactions = state.transactions.filter(x => x.id !== t.id); commit(); toast('Transaction deleted.', { label: 'Undo', fn: undo }); } };
}

/* ---------- account ---------- */
function acctModal(id, presetType) {
  const a = id ? acctById(id) : null;
  const v = a || { name: '', type: presetType || 'checking', institution: '', balance: '', balanceDate: today(), owner: UI.lens || 'joint' };
  const hasHoldings = a && holdingsFor(a.id).length;
  const loans = activeAccounts().filter(x => ['mortgage', 'loan', 'otherLiability'].includes(x.type));
  const rentalGroups = [...new Set(state.categories.filter(c => c.rental).map(c => c.group))];
  const curVal = a ? accountValue(a) : '';
  openModal({
    title: a ? 'Edit account' : 'Add account',
    body: `<form id="f" class="form-grid" data-type="${v.type}">
      <label class="field wide"><span>Account name</span><input name="acct-label" data-key="name" value="${esc(v.name)}" placeholder="e.g. Joint checking" autocomplete="off" required autofocus></label>
      <label class="field"><span>Type</span><select name="type" id="acct-type">${BUCKETS.map(b => `<optgroup label="${esc(b.label)}">${b.types.map(t => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${ACCOUNT_TYPES[t].label}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="field"><span>Institution</span><input name="institution" value="${esc(v.institution || '')}" placeholder="Optional"></label>
      ${members().length > 1 ? `<label class="field"><span>Owner</span><select name="owner">${memberOptions(v.owner || 'joint')}</select></label>` : ''}
      <label class="field"><span>Last 4 digits</span><input name="last4" value="${esc(v.last4 || '')}" maxlength="4" inputmode="numeric" placeholder="Matches imports"></label>
      ${hasHoldings ? `<p class="muted small wide">Value comes from ${hasHoldings} holding${hasHoldings > 1 ? 's' : ''}: ${money(accountValue(a))}.</p><label class="field"><span>Uninvested cash</span><input name="cash" inputmode="decimal" value="${a.cash || ''}" placeholder="0"></label>`
        : `<label class="field"><span id="bal-label">${ACCOUNT_TYPES[v.type].side === 'liability' ? 'Amount owed' : 'Balance or value'}</span><input name="balance" inputmode="decimal" value="${curVal === '' ? (v.balance === '' ? '' : round2(v.balance)) : round2(curVal)}" placeholder="0.00"></label>
           <label class="field"><span>As of</span><input type="date" name="balanceDate" value="${(a && a.ledger ? a.anchorDate : v.balanceDate) || today()}"></label>`}
      <div class="when-ledger wide"><label class="check"><input type="checkbox" name="ledger" ${(v.ledger ?? ACCOUNT_TYPES[v.type].ledger) ? 'checked' : ''}> Keep the balance up to date from transactions</label><small class="muted">The balance above is the starting point; imported transactions after that date move it. Lets you reconcile against statements.</small></div>
      <div class="when-cash wide"><label class="check"><input type="checkbox" name="forecast" ${(v.forecast ?? ACCOUNT_TYPES[v.type].forecast) ? 'checked' : ''}> Include in the cash-flow forecast</label></div>
      <label class="field when-invest"><span>Treat as (when no holdings)</span><select name="assetClass">${ASSET_CLASSES.map(c => `<option ${c === (v.assetClass || 'US stocks') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field when-debt"><span>Interest rate (%)</span><input name="rate" inputmode="decimal" value="${v.rate ?? ''}"></label>
      <label class="field when-debt"><span>Minimum payment</span><input name="minPayment" inputmode="decimal" value="${v.minPayment ?? ''}"></label>
      <div class="when-property wide form-grid">
        <label class="field"><span>Mortgage</span><select name="mortgageId" id="mort-pick"><option value="">None</option>${loans.map(l => `<option value="${l.id}" ${l.id === v.mortgageId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}<option value="__new">Add a mortgage…</option></select></label>
        <div class="new-mort wide form-grid" id="new-mort" hidden>
          <label class="field"><span>Lender</span><input name="mort-lender" data-key="mortLender" placeholder="e.g. Chase" autocomplete="off"></label>
          <label class="field"><span>Amount owed</span><input name="mort-owed" data-key="mortOwed" inputmode="decimal" placeholder="From your latest statement"></label>
          <label class="field"><span>As of</span><input type="date" name="mort-date" data-key="mortDate" value="${today()}"></label>
          <label class="field"><span>Interest rate (%)</span><input name="mort-rate" data-key="mortRate" inputmode="decimal" placeholder="e.g. 6.25"></label>
          <label class="field"><span>Monthly payment</span><input name="mort-payment" data-key="mortPayment" inputmode="decimal" placeholder="Optional"></label>
          <p class="muted small wide">Adds the mortgage under Accounts › Liabilities, linked to this property, so its equity and net worth count the loan. Keep importing the payments from your bank; there’s no need to import the mortgage statement. Update what you owe from the statement now and then.</p>
        </div>
        <label class="check"><input type="checkbox" name="rental" ${v.rental ? 'checked' : ''}> This is a rental property</label>
        <label class="field"><span>Rental category group</span><select name="rentalGroup">${(rentalGroups.length ? rentalGroups : ['Rental property']).map(g => `<option ${g === v.rentalGroup ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label class="field"><span>Cash invested</span><input name="cashInvested" inputmode="decimal" value="${v.cashInvested ?? ''}" placeholder="Down payment plus improvements"></label>
        <label class="field"><span>Units</span><input name="units" inputmode="numeric" value="${v.units ?? ''}"></label>
        <label class="field"><span>Building basis (excludes land)</span><input name="buildingBasis" inputmode="decimal" value="${v.buildingBasis ?? ''}" placeholder="For depreciation"></label>
        <label class="field"><span>Placed in service</span><input type="date" name="placedInService" value="${v.placedInService || ''}"></label>
      </div>
      <label class="field wide"><span>Notes</span><input name="notes" value="${esc(v.notes || '')}"></label>
    </form>`,
    actions: `${a ? `<button class="btn ghost danger-text left" id="del">Delete</button><button class="btn ghost" id="arch">${a.archived ? 'Restore' : 'Archive'}</button>` : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${a ? 'Save' : 'Add account'}</button>`,
  });
  const f = $('#f');
  $('#acct-type').onchange = e => {
    const T = ACCOUNT_TYPES[e.target.value]; f.dataset.type = e.target.value;
    const l = $('#bal-label'); if (l) l.textContent = T.side === 'liability' ? 'Amount owed' : 'Balance or value';
    f.querySelector('[name=forecast]').checked = !!T.forecast; f.querySelector('[name=ledger]').checked = !!T.ledger;
  };
  $('#mort-pick').onchange = e => { $('#new-mort').hidden = e.target.value !== '__new'; fitModal(); };
  $('#save').onclick = () => {
    const d = formData(f);
    if (!d.name.trim()) return toast('Give the account a name.');
    let newMort = null;
    if (d.type === 'realestate' && d.mortgageId === '__new') {
      const owed = parseAmount(d.mortOwed || '');
      if (!isFinite(owed) || !owed) return toast('Enter how much is owed on the mortgage.');
      const rate = parseFloat(d.mortRate), pay = parseAmount(d.mortPayment || '');
      newMort = { id: uid(), name: `${d.name.trim()} mortgage`, type: 'mortgage', institution: (d.mortLender || '').trim(), owner: 'owner' in d ? d.owner : (a?.owner || v.owner || 'joint'),
        balance: round2(Math.abs(owed)), balanceDate: d.mortDate || today(), rate: isFinite(rate) ? rate : null, minPayment: isFinite(pay) && pay ? round2(Math.abs(pay)) : null, forecast: false, ledger: false };
      d.mortgageId = newMort.id;
    }
    const rec = { name: d.name.trim(), type: d.type, institution: d.institution.trim(), last4: d.last4.trim(), notes: d.notes, forecast: d.forecast, ledger: d.ledger && !hasHoldings };
    if ('owner' in d) rec.owner = d.owner;
    if (ACCOUNT_TYPES[d.type].bucket === 'invest') rec.assetClass = d.assetClass;
    if (ACCOUNT_TYPES[d.type].bucket === 'debt') { rec.rate = d.rate === '' ? null : parseFloat(d.rate); rec.minPayment = d.minPayment === '' ? null : parseAmount(d.minPayment); }
    if (d.type === 'realestate') Object.assign(rec, { mortgageId: d.mortgageId || null, rental: d.rental, rentalGroup: d.rentalGroup, cashInvested: parseAmount(d.cashInvested) || null, units: parseInt(d.units) || null, buildingBasis: parseAmount(d.buildingBasis) || null, placedInService: d.placedInService || null });
    if ('cash' in d) rec.cash = round2(parseAmount(d.cash || '0') || 0);
    const target = a || { id: uid() };
    Object.assign(target, rec);
    if ('balance' in d) {
      const b = parseAmount(d.balance || '0'), val = isFinite(b) ? round2(isLiability(target) ? Math.abs(b) : b) : 0;
      const changed = !a || Math.abs(val - curVal) > 0.004 || (a.ledger ? a.anchorDate : a.balanceDate) !== d.balanceDate || !!a.ledger !== !!rec.ledger;
      if (changed) { target.balance = val; target.balanceDate = d.balanceDate || today(); if (target.ledger) { target.anchorBalance = val; target.anchorDate = d.balanceDate || today(); } }
    }
    if (!a) state.accounts.push(target);
    if (newMort) state.accounts.push(newMort);
    closeModal(); commit();
    if (newMort) toast(`${a ? 'Saved' : 'Added'} ${rec.name} and added ${newMort.name} under Liabilities.`);
    else if (!a) toast(`Added ${rec.name}.`);
  };
  if (a) {
    $('#arch').onclick = () => { a.archived = !a.archived; closeModal(); commit(); toast(a.archived ? `${a.name} archived. Its history stays in your net worth chart.` : `${a.name} restored.`); };
    $('#del').onclick = async () => {
      const n = state.transactions.filter(t => t.accountId === a.id).length, h = holdingsFor(a.id).length;
      if (!await confirmBox('Delete account', `Delete <strong>${esc(a.name)}</strong>${n || h ? ` along with ${[n && `${n} transactions`, h && `${h} holdings`].filter(Boolean).join(' and ')}` : ''}? Archiving keeps the history instead.`, 'Delete', true)) return;
      state.accounts = state.accounts.filter(x => x.id !== a.id);
      state.transactions = state.transactions.filter(t => t.accountId !== a.id);
      state.holdings = state.holdings.filter(x => x.accountId !== a.id);
      for (const s of Object.values(state.snapshots)) delete s[a.id];
      for (const x of state.accounts) if (x.mortgageId === a.id) x.mortgageId = null;
      state.goals.forEach(g => { if (g.accountId === a.id) g.accountId = null; });
      commit(); toast('Account deleted.', { label: 'Undo', fn: undo });
    };
  }
}

/* ---------- reconcile against a statement ---------- */
function reconcileModal(id) {
  const a = acctById(id); if (!a) return;
  const from = a.reconciledThrough || '0000-00-00';
  openModal({
    title: `Reconcile ${a.name}`, wide: true,
    body: `<p class="muted">Enter the ending balance and date from your statement. Ọrọ̀ compares it with the balance it calculates from your transactions.</p>
      <div class="form-grid"><label class="field"><span>Statement date</span><input type="date" id="rc-date" value="${monthEnd(addMonths(thisMonth(), -1))}"></label>
      <label class="field"><span>${isLiability(a) ? 'Statement balance owed' : 'Statement ending balance'}</span><input id="rc-bal" inputmode="decimal" placeholder="0.00" autofocus></label></div>
      <div id="rc-out"></div>`,
    actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="rc-go" disabled>Mark reconciled</button>`,
  });
  const paint = () => {
    const date = $('#rc-date').value, st = parseAmount($('#rc-bal').value);
    const calc = ledgerBalance(a, date);
    const txs = txByAccount(a.id).filter(t => t.date > from && t.date <= date).sort((x, y) => x.date.localeCompare(y.date));
    let run = ledgerBalance(a, from === '0000-00-00' ? addDays(txs[0]?.date || date, -1) : from);
    const diff = isFinite(st) ? round2(Math.abs(st) - calc) : null;
    $('#rc-out').innerHTML = `<dl class="kpis three"><div><dt>Ọrọ̀’s balance on ${dateLabel(date, true)}</dt><dd class="num">${money(calc)}</dd></div><div><dt>Statement</dt><dd class="num">${isFinite(st) ? money(Math.abs(st)) : '—'}</dd></div><div><dt>Difference</dt><dd class="num ${diff ? 'neg' : diff === 0 ? 'pos' : ''}">${diff == null ? '—' : diff === 0 ? 'Matches' : money(diff, { sign: true })}</dd></div></dl>
      ${diff ? `<p class="notice">Look for a missing or duplicated transaction of ${money(Math.abs(diff))}, or one with the wrong sign (that shows up as twice its amount). If the statement is right and nothing is missing, treat it as the true balance on that date; transactions after it carry on from there.</p><button class="btn small" id="rc-adjust">Use the statement balance of ${money(Math.abs(st))}</button>` : ''}
      <div class="scroll-table short"><table class="ledger compact"><thead><tr><th>Date</th><th>Payee</th><th class="num">Amount</th><th class="num">Running balance</th></tr></thead><tbody>
      ${txs.map(t => { run = round2(run + (isLiability(a) ? -t.amount : t.amount)); return `<tr><td class="nowrap muted">${dateLabel(t.date)}</td><td>${esc(t.payee)}${t.reconciled ? ' <span class="rec">✓</span>' : ''}</td><td class="num ${signClass(t.amount)}">${money(t.amount)}</td><td class="num">${money(run)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No transactions since the last reconciliation.</td></tr>'}</tbody></table></div>`;
    $('#rc-go').disabled = diff !== 0;
    const adj = $('#rc-adjust');
    if (adj) adj.onclick = () => { a.anchorBalance = round2(Math.abs(st)); a.anchorDate = date; a.ledger = true; commit({ silent: true }); paint(); };
  };
  $('#rc-bal').oninput = paint; $('#rc-date').onchange = paint; paint();
  $('#rc-go').onclick = () => {
    const date = $('#rc-date').value;
    for (const t of txByAccount(a.id)) if (t.date <= date) t.reconciled = true;
    a.reconciledThrough = date; a.reconciledBalance = ledgerBalance(a, date);
    closeModal(); commit(); toast(`${a.name} reconciled through ${dateLabel(date, true)}.`);
  };
}

/* ---------- balance history ---------- */
function historyModal(id) {
  const a = acctById(id); if (!a) return;
  const liab = isLiability(a), cur = thisMonth();
  const months = Object.keys(state.snapshots).filter(m => state.snapshots[m][id] != null).sort().reverse();
  const rows = months.map(m => `<tr><th scope="row">${monthLabel(m)}</th><td class="num">${m === cur ? `${money(accountValue(a))} <span class="muted small">live</span>` : `<input class="bal-input" data-hm="${m}" inputmode="decimal" value="${round2(Math.abs(state.snapshots[m][id]))}">`}</td><td class="acts">${m === cur ? '' : `<button class="icon-btn" data-hdel="${m}" aria-label="Remove ${monthLabel(m)}">×</button>`}</td></tr>`).join('');
  const vals = months.slice().reverse().map(m => Math.abs(state.snapshots[m][id]));
  openModal({
    title: `${a.name}: balance history`,
    body: `${vals.length > 1 ? `<div class="hist-spark">${sparkline(vals, { w: 520, h: 60, color: liab ? 'var(--neg)' : 'var(--ink-accent)' })}</div>` : ''}<p class="muted">Month-end ${liab ? 'amounts owed' : 'values'} feed the net worth chart. Ọrọ̀ records the current month automatically; add earlier months from old statements.</p>
      <div class="scroll-table short"><table class="ledger compact" id="hist"><tbody>${rows || '<tr><td class="muted">No history yet.</td></tr>'}</tbody></table></div>
      <div class="form-grid"><label class="field"><span>Add a month</span><input type="month" id="h-m" max="${addMonths(cur, -1)}"></label><label class="field"><span>${liab ? 'Owed' : 'Value'}</span><input id="h-v" inputmode="decimal" placeholder="0.00"></label></div>`,
    actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">Save history</button>`,
  });
  const removed = new Set();
  $('#hist').onclick = e => { const b = e.target.closest('[data-hdel]'); if (b) { removed.add(b.dataset.hdel); b.closest('tr').remove(); } };
  $('#save').onclick = () => {
    const sign = liab ? -1 : 1;
    $$('[data-hm]').forEach(inp => { const v = parseAmount(inp.value); if (isFinite(v)) state.snapshots[inp.dataset.hm][id] = round2(Math.abs(v) * sign); });
    removed.forEach(m => { delete state.snapshots[m][id]; if (!Object.keys(state.snapshots[m]).length) delete state.snapshots[m]; });
    const m = $('#h-m').value, v = parseAmount($('#h-v').value);
    if (m && isFinite(v) && m < cur) (state.snapshots[m] = state.snapshots[m] || {})[id] = round2(Math.abs(v) * sign);
    closeModal(); commit();
  };
}

/* ---------- holding ---------- */
function holdingModal(id, presetAcct) {
  const h = id ? state.holdings.find(x => x.id === id) : null;
  const invAccts = activeAccounts().filter(a => ACCOUNT_TYPES[a.type]?.bucket === 'invest' || a.type === 'private');
  if (!invAccts.length) { toast('Add an investment account first.'); return acctModal(null, 'brokerage'); }
  const v = h || { accountId: presetAcct || invAccts[0].id, symbol: '', name: '', shares: '', price: '', costBasis: '', assetClass: 'US stocks', priceDate: today(), private: acctById(presetAcct)?.type === 'private' };
  const known = KNOWN_ER[String(v.symbol || '').toUpperCase()];
  openModal({
    title: h ? `Edit ${h.symbol}` : 'Add holding',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Account</span><select name="accountId">${invAccts.map(a => `<option value="${a.id}" ${a.id === v.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Symbol or short name</span><input name="symbol" value="${esc(v.symbol)}" required autofocus></label>
      <label class="field wide"><span>Description</span><input name="desc-label" data-key="name" value="${esc(v.name || '')}" autocomplete="off"></label>
      <label class="field"><span>Shares or units</span><input name="shares" inputmode="decimal" value="${v.shares}"></label>
      <label class="field"><span>Price per share</span><input name="price" inputmode="decimal" value="${v.price}"></label>
      <label class="field"><span>Total cost basis</span><input name="costBasis" inputmode="decimal" value="${v.costBasis ?? ''}" placeholder="Optional"></label>
      <label class="field"><span>Expense ratio (%)</span><input name="er" inputmode="decimal" value="${v.er ?? ''}" placeholder="${known != null ? known + ' (on file)' : 'e.g. 0.03'}"></label>
      <label class="field"><span>Asset class</span><select name="assetClass">${ASSET_CLASSES.map(c => `<option ${c === v.assetClass ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Price as of</span><input type="date" name="priceDate" value="${v.priceDate || today()}"></label>
      <label class="check wide"><input type="checkbox" name="private" ${v.private ? 'checked' : ''}> Private or illiquid (valued by your own marks)</label>
    </form>`,
    actions: `${h ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${h ? 'Save' : 'Add holding'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f'));
    const shares = parseAmount(d.shares), price = parseAmount(d.price), cb = parseAmount(d.costBasis), er = parseFloat(d.er);
    if (!d.symbol.trim() || !isFinite(shares) || !isFinite(price)) return toast('Fill in a symbol, shares and price.');
    const rec = { accountId: d.accountId, symbol: d.symbol.trim().toUpperCase(), name: d.name.trim(), shares, price, costBasis: isFinite(cb) ? cb : null, er: isFinite(er) ? er : undefined, assetClass: d.assetClass, priceDate: d.priceDate || today(), private: d.private };
    if (h && (h.price !== price || h.shares !== shares) && rec.priceDate === h.priceDate) rec.priceDate = today();
    if (h) Object.assign(h, rec); else state.holdings.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (h) $('#del').onclick = async () => { if (await confirmBox('Delete holding', `Remove ${esc(h.symbol)} (${money(holdingValue(h))})?`, 'Delete', true)) { state.holdings = state.holdings.filter(x => x.id !== h.id); commit(); } };
}

/* ---------- recurring ---------- */
function recModal(id, preset) {
  const r = id ? state.recurring.find(x => x.id === id) : null;
  const v = r || { name: '', amount: '', freq: 'monthly', nextDate: addDays(today(), 1), categoryId: '', ...(preset || {}) };
  openModal({
    title: r ? 'Edit bill or income' : 'Add a bill or paycheck',
    body: `<form id="f" class="form-grid">
      <label class="field wide"><span>Bill or paycheck</span><input name="rec-label" data-key="name" value="${esc(v.name)}" autocomplete="off" required autofocus></label>
      <label class="field"><span>Amount</span><input name="amount" inputmode="decimal" value="${v.amount}" placeholder="-1,250.00"><small class="muted">Negative for bills, positive for income</small></label>
      <label class="field"><span>How often</span><select name="freq">${Object.entries(FREQS).map(([k, l]) => `<option value="${k}" ${k === v.freq ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Next date</span><input type="date" name="nextDate" value="${v.nextDate}"></label>
      <label class="field"><span>Category</span><select name="categoryId">${catOptions(v.categoryId)}</select></label>
    </form>`,
    actions: `${r ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${r ? 'Save' : 'Add'}</button>`,
  });
  $('#save').onclick = () => {
    const d = formData($('#f')), amount = parseAmount(d.amount);
    if (!d.name.trim() || !isFinite(amount) || !d.nextDate) return toast('Fill in a name, amount and next date.');
    const rec = { name: d.name.trim(), amount: round2(amount), freq: d.freq, nextDate: d.nextDate, categoryId: d.categoryId || null };
    if (r) Object.assign(r, rec); else state.recurring.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (r) $('#del').onclick = () => { state.recurring = state.recurring.filter(x => x.id !== r.id); closeModal(); commit(); };
}

/* ---------- goal ---------- */
function goalModal(id) {
  const g = id ? state.goals.find(x => x.id === id) : null;
  const v = g || { name: '', target: '', targetDate: `${new Date().getFullYear() + 1}-12-31`, monthly: '', saved: '' };
  const src = v.accountId ? 'account' : v.categoryId ? 'category' : 'manual';
  openModal({
    title: g ? `Edit ${g.name}` : 'Add a goal',
    body: `<form id="f" class="form-grid">
      <label class="field wide"><span>Goal</span><input name="goal-label" data-key="name" autocomplete="off" value="${esc(v.name)}" placeholder="e.g. Emergency fund, Italy 2027, New car" required autofocus></label>
      <label class="field"><span>Target amount</span><input name="target" inputmode="decimal" value="${v.target}"></label>
      <label class="field"><span>Target date</span><input type="date" name="targetDate" value="${v.targetDate || ''}"></label>
      <label class="field"><span>Track progress with</span><select name="src" id="g-src"><option value="manual" ${src === 'manual' ? 'selected' : ''}>An amount I update</option><option value="account" ${src === 'account' ? 'selected' : ''}>An account’s balance</option><option value="category" ${src === 'category' ? 'selected' : ''}>A rollover budget category</option></select></label>
      <label class="field g-src g-manual"><span>Saved so far</span><input name="saved" inputmode="decimal" value="${v.saved ?? ''}"></label>
      <label class="field g-src g-account"><span>Account</span><select name="accountId">${acctOptions(v.accountId, a => !isLiability(a))}</select></label>
      <label class="field g-src g-category"><span>Category</span><select name="categoryId">${catOptions(v.categoryId, false, c => c.kind === 'expense')}</select><small class="muted">Ọrọ̀ turns on rollover for it</small></label>
      <label class="field"><span>Planning to put in each month</span><input name="monthly" inputmode="decimal" value="${v.monthly ?? ''}" placeholder="Optional"></label>
    </form>`,
    actions: `${g ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${g ? 'Save' : 'Add goal'}</button>`,
  });
  const sync = () => { const s = $('#g-src').value; $$('.g-src').forEach(el => el.hidden = !el.classList.contains('g-' + s)); };
  $('#g-src').onchange = sync; sync();
  $('#save').onclick = () => {
    const d = formData($('#f')), target = parseAmount(d.target);
    if (!d.name.trim() || !isFinite(target)) return toast('Fill in a name and target amount.');
    const rec = { name: d.name.trim(), target: round2(target), targetDate: d.targetDate || null, monthly: d.monthly === '' ? null : round2(parseAmount(d.monthly) || 0), accountId: null, categoryId: null, saved: null };
    if (d.src === 'account') rec.accountId = d.accountId;
    else if (d.src === 'category') { rec.categoryId = d.categoryId; const c = catById(d.categoryId); if (c && !c.rollover) { c.rollover = true; c.rolloverStart = thisMonth(); } }
    else rec.saved = round2(parseAmount(d.saved) || 0);
    if (g) Object.assign(g, rec); else state.goals.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (g) $('#del').onclick = () => { state.goals = state.goals.filter(x => x.id !== g.id); closeModal(); commit(); toast('Goal deleted.', { label: 'Undo', fn: undo }); };
}

/* ---------- category ---------- */
function catModal(id) {
  const c = id ? catById(id) : null;
  const v = c || { name: '', group: '', kind: 'expense', budget: 0, period: 'month', rental: '' };
  const groups = [...new Set(state.categories.map(x => x.group))];
  const used = c ? state.transactions.filter(t => txHasCat(t, c.id)).length : 0;
  openModal({
    title: c ? `Edit ${c.name}` : 'Add a category',
    body: `<form id="f" class="form-grid">
      <label class="field"><span>Category name</span><input name="cat-label" data-key="name" value="${esc(v.name)}" autocomplete="off" autocapitalize="sentences" required autofocus></label>
      <label class="field"><span>Group</span><select name="groupPick" id="grp-pick">${v.group ? '' : '<option value="" selected disabled>Choose a group</option>'}${groups.map(g => `<option ${g === v.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}<option value="__new">New group…</option></select></label>
      <label class="field" id="grp-new" hidden><span>New group name</span><input name="groupNew" autocomplete="off" autocapitalize="words" placeholder="e.g. Kids"></label>
      <label class="field"><span>Kind</span><select name="kind"><option value="expense" ${v.kind === 'expense' ? 'selected' : ''}>Spending</option><option value="income" ${v.kind === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${v.kind === 'transfer' ? 'selected' : ''}>Transfer (left out of spending)</option></select></label>
      <label class="field"><span>Budget</span><input name="budget" inputmode="decimal" value="${v.budget || ''}" placeholder="0"></label>
      <label class="field"><span>Budget period</span><select name="period"><option value="month" ${v.period !== 'year' ? 'selected' : ''}>Per month</option><option value="year" ${v.period === 'year' ? 'selected' : ''}>Per year</option></select></label>
      <label class="check"><input type="checkbox" name="rollover" ${v.rollover ? 'checked' : ''}> Roll unspent money into next month</label>
      <label class="field"><span>Tax tag</span><select name="taxTag"><option value="">None</option>${TAX_TAGS.map(t => `<option ${v.taxTag === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Rental role</span><select name="rental"><option value="">Not a rental category</option>${Object.entries(RENTAL_ROLES).map(([k, l]) => `<option value="${k}" ${v.rental === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${c ? `<p class="muted small wide">Used by ${used} transaction${used === 1 ? '' : 's'}.</p>` : ''}
    </form>`,
    actions: `${c ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${c ? 'Save' : 'Add category'}</button>`,
  });
  const pick = $('#grp-pick');
  pick.onchange = () => {
    const isNew = pick.value === '__new';
    $('#grp-new').hidden = !isNew;
    if (isNew) { $('#grp-new input').focus(); return; }
    const kinds = [...new Set(state.categories.filter(x => x.group === pick.value).map(x => x.kind))];   // Income group → Income kind, and so on
    if (kinds.length === 1 && !c) $('#f [name=kind]').value = kinds[0];
  };
  $('#save').onclick = () => {
    const d = formData($('#f'));
    d.group = d.groupPick === '__new' ? (d.groupNew || '') : (d.groupPick || '');
    if (!d.name.trim() || !d.group.trim()) return toast(d.name.trim() ? 'Choose a group, or make a new one.' : 'Give the category a name.');
    const rec = { name: d.name.trim(), group: d.group.trim(), kind: d.kind, budget: round2(parseAmount(d.budget || '0') || 0), period: d.period, rental: d.rental || undefined, taxTag: d.taxTag || undefined, rollover: d.rollover || undefined };
    if (rec.rollover && !(c && c.rollover)) rec.rolloverStart = thisMonth();
    if (rec.rental === 'income' && !(c && c.schedE)) rec.schedE = '3';
    if (rec.rental === 'opex' && !(c && c.schedE)) rec.schedE = '19';
    if (c) Object.assign(c, rec); else state.categories.push({ id: uid(), ...rec });
    closeModal(); commit();
  };
  if (c) $('#del').onclick = async () => {
    if (!await confirmBox('Delete category', `Delete <strong>${esc(c.name)}</strong>? ${used ? `Its ${used} transactions become uncategorized and` : ''} any rules that use it are removed.`, 'Delete', true)) return;
    state.categories = state.categories.filter(x => x.id !== c.id);
    state.transactions.forEach(t => { if (t.categoryId === c.id) t.categoryId = null; (t.splits || []).forEach(s => { if (s.categoryId === c.id) s.categoryId = null; }); });
    state.rules = state.rules.filter(r => r.categoryId !== c.id);
    state.recurring.forEach(r => { if (r.categoryId === c.id) r.categoryId = null; });
    state.goals.forEach(g => { if (g.categoryId === c.id) g.categoryId = null; });
    commit(); toast('Category deleted.', { label: 'Undo', fn: undo });
  };
}

/* ---------- rule ---------- */
function ruleModal(id, preset = {}) {
  const r = id ? state.rules.find(x => x.id === id) : null;
  const v = { ...(r || { text: '', categoryId: '', rename: '' }), ...preset };
  openModal({
    title: r ? 'Edit rule' : 'Add a rule',
    body: `<form id="f" class="form-grid">
      <label class="field wide"><span>When the payee contains</span><input name="text" value="${esc(v.text)}" placeholder="e.g. WHOLE FOODS" required autofocus></label>
      <label class="field"><span>Set the category to</span><select name="categoryId">${catOptions(v.categoryId, false)}</select></label>
      ${members().length > 1 ? `<label class="field"><span>And the person to</span><select name="person">${memberOptions(v.person || '', 'Leave as account owner')}</select></label>` : ''}
      <label class="field"><span>And rename the payee to</span><input name="rename" value="${esc(v.rename || '')}" placeholder="Optional"></label>
      <div class="wide rule-preview" id="rule-preview"></div>
    </form>`,
    actions: `${r ? '<button class="btn ghost danger-text left" id="del">Delete</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="save">${r ? 'Save' : 'Add rule'}</button>`,
  });
  let applyUnc = true, applyOther = false;
  const paint = () => {
    const d = formData($('#f')), p = rulePreview(d.text, d.categoryId), box = $('#rule-preview');
    if (!box) return;
    if (!p) { box.innerHTML = '<p class="muted small">Type part of the payee, like COSTCO or SHELL OIL. Shorter text catches more.</p>'; return; }
    if (!p.hits.length) { box.innerHTML = '<p class="muted small">Nothing you have matches this yet. It will apply to future imports.</p>'; return; }
    box.innerHTML = `<p><strong>Matches ${p.hits.length.toLocaleString()} transaction${p.hits.length === 1 ? '' : 's'}</strong>${p.unc.length ? ` · ${p.unc.length} uncategorized` : ''}${p.other.length ? ` · ${p.other.length} in other categories` : ''}${p.same.length ? ` · ${p.same.length} already in ${esc(catName(d.categoryId))}` : ''}</p>
      <p class="muted small">For example: ${p.examples.map(esc).join(' · ')}${p.hits.length > p.examples.length ? ' …' : ''}</p>
      ${p.unc.length ? `<label class="check"><input type="checkbox" id="rule-apply-unc" ${applyUnc ? 'checked' : ''}> Categorize the ${p.unc.length} uncategorized now</label>` : ''}
      ${p.other.length ? `<label class="check"><input type="checkbox" id="rule-apply-other" ${applyOther ? 'checked' : ''}> Also move the ${p.other.length} filed elsewhere (${esc(p.otherCats)})</label>` : ''}`;
  };
  $('#f').addEventListener('input', e => { if (e.target.name === 'text') paint(); });
  $('#f').addEventListener('change', e => {
    if (e.target.id === 'rule-apply-unc') applyUnc = e.target.checked;
    else if (e.target.id === 'rule-apply-other') applyOther = e.target.checked;
    else paint();
  });
  paint();
  $('#save').onclick = () => {
    const d = formData($('#f'));
    if (!d.text.trim()) return toast('Type the text to match.');
    if (!d.categoryId) return toast('Choose a category.');
    const rec = { text: d.text.trim().toUpperCase(), categoryId: d.categoryId, rename: d.rename.trim(), person: d.person || undefined };
    const p = rulePreview(rec.text, rec.categoryId);
    if (r) Object.assign(r, rec); else state.rules.unshift({ id: uid(), ...rec });
    const targets = p ? [...(applyUnc ? p.unc : []), ...(applyOther ? p.other : [])] : [];
    for (const t of targets) { t.categoryId = rec.categoryId; if (rec.rename) t.payee = rec.rename; if (rec.person) t.person = rec.person; }
    closeModal(); commit();
    toast(`Rule ${r ? 'updated' : 'saved'}.${targets.length ? ` ${targets.length} transaction${targets.length === 1 ? '' : 's'} categorized as ${catName(rec.categoryId)}.` : ''}`, { label: 'Undo', fn: undo });
  };
  if (r) $('#del').onclick = () => { state.rules = state.rules.filter(x => x.id !== r.id); closeModal(); commit(); };
}

/* ================= Money date: a month, one screen at a time ================= */
const MD = { i: 0, mk: null, slides: [] };
function startMoneyDate(mk) {
  const lm = addMonths(thisMonth(), -1);
  MD.mk = mk || (state.transactions.some(t => t.date.startsWith(lm)) ? lm : thisMonth());
  MD.i = 0;
  MD.slides = buildSlides(MD.mk);
  let el = $('#present');
  if (!el) { el = document.createElement('div'); el.id = 'present'; el.className = 'present'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Money date'); document.body.appendChild(el); }
  document.body.classList.add('presenting');
  paintSlide();
}
/* Swipe left or right between slides on a phone or iPad */
document.addEventListener('touchstart', e => {
  const el = e.target.closest?.('#present .slide'); if (!el || e.touches.length !== 1 || e.target.closest('textarea, input, select, button')) { MD.swipe = null; return; }
  MD.swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  const s = MD.swipe; MD.swipe = null; if (!s || !$('#present')) return;
  const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 700) { if (dx > 0) mdAction('prev'); else if (MD.i < MD.slides.length - 1) mdAction('next'); }
}, { passive: true });
function endMoneyDate() { $('#present')?.remove(); document.body.classList.remove('presenting'); render(); }
function paintSlide() {
  const el = $('#present'); if (!el) return;
  for (const k in ChartSpecs) delete ChartSpecs[k];
  const n = MD.slides.length, s = MD.slides[MD.i];
  el.innerHTML = `
    <header class="present-top"><span class="brand" title="Ọrọ̀ is Yoruba for wealth">${BRAND_MARK}</span><span class="present-title">Money date · ${monthLabel(MD.mk)}</span>
      <span class="present-prog">${MD.slides.map((_, k) => `<i class="${k === MD.i ? 'on' : k < MD.i ? 'done' : ''}"></i>`).join('')}</span>
      <button class="icon-btn" data-md="close" aria-label="Exit Money date">×</button></header>
    <section class="slide" aria-live="polite">${s.html()}</section>
    <footer class="present-nav"><button class="btn ghost" data-md="prev" ${MD.i ? '' : 'disabled'}>Back</button><span class="muted">${MD.i + 1} of ${n} · ${esc(s.title)}</span><button class="btn primary" data-md="next">${MD.i === n - 1 ? 'Finish' : 'Next'}</button></footer>`;
  drawCharts(el);
}
function buildSlides(mk) {
  const prev = addMonths(mk, -1);
  const txs = txInMonth(mk), f = flowSummary(txs);
  const avg = [1, 2, 3].map(i => flowSummary(txInMonth(addMonths(mk, -i))));
  const avgSpend = sum(avg.map(x => x.spending)) / 3;
  const endNW = mk === thisMonth() ? totals().netWorth : snapshotNW(mk), startNW = snapshotNW(prev);
  const nwChange = endNW != null && startNW != null ? endNW - startNW : null;
  const M = MONTHS[+mk.slice(5) - 1];
  const groups = spendByGroup(txs), items = donutItems(groups, 6), spendTotal = sum(groups.map(g => g.value));
  const acts = monthActuals(mk);
  const exp = state.categories.filter(c => c.kind === 'expense' && c.period !== 'year' && c.budget > 0).map(c => ({ c, v: budgetView(c, mk) }));
  const wins = exp.filter(x => x.v.actual < x.v.budget).sort((a, b) => (b.v.budget - b.v.actual) - (a.v.budget - a.v.actual)).slice(0, 4);
  const misses = exp.filter(x => x.v.actual > x.v.budget).sort((a, b) => (b.v.actual - b.v.budget) - (a.v.actual - a.v.budget)).slice(0, 4);
  const notes = insights(mk, { limit: 4 });
  const slides = [];
  slides.push({ title: 'The big picture', html: () => `<div class="slide-center">
      <p class="eyebrow-plain">${monthLabel(mk)}</p>
      <h1 class="slide-h">${f.net >= 0 ? `We kept <span class="num pos">${money(f.net, { cents: false })}</span> this month.` : `We spent <span class="num neg">${money(-f.net, { cents: false })}</span> more than came in.`}</h1>
      <p class="slide-lede">${money(f.income, { cents: false })} came in and ${money(f.spending, { cents: false })} went out${nwChange != null ? `, and our net worth ${nwChange >= 0 ? 'grew' : 'fell'} by ${money(Math.abs(nwChange), { cents: false })}` : ''}.</p></div>` });
  if (endNW != null) {
    const series = netWorthSeries().filter(p => p.x <= mk).slice(-13);
    const bk = BUCKETS.map(b => { const s = mk === thisMonth() ? null : state.snapshots[mk] || {}; const v = s ? sum(Object.entries(s).filter(([id]) => ACCOUNT_TYPES[acctById(id)?.type]?.bucket === b.id).map(([, x]) => x)) : (b.id === 'debt' ? -totals().debt : totals()[b.id]); return { b, v }; });
    slides.push({ title: 'Net worth', html: () => `<div class="slide-split">
      <div><p class="eyebrow-plain">What we own, minus what we owe</p><p class="slide-num num">${money(endNW, { cents: false })}</p>${startNW != null ? `<p class="slide-lede">${deltaChip(endNW, startNW, { pct: true })} since the end of ${MONTHS[+prev.slice(5) - 1]}</p>` : ''}
        <ul class="slide-bars">${bk.map(({ b, v }) => `<li><span>${esc(b.label)}</span><span class="num ${v < 0 ? 'neg' : ''}">${money(v, { cents: false })}</span></li>`).join('')}</ul></div>
      <div>${chartHost({ h: 300, series: [{ points: series, color: 'var(--ink-accent)', area: true }], xFmt: x => MON[+x.slice(5) - 1], tip: i => `<strong>${monthLabel(series[i].x)}</strong><br>${money(series[i].y, { cents: false })}` })}</div></div>` });
  }
  slides.push({ title: 'Money in and out', html: () => {
    const mx = Math.max(f.income, f.spending, 1);
    return `<div class="slide-split">
      <div><h2 class="slide-h2">In and out</h2>
        <div class="io-bars"><div><span>Came in</span><div class="io-track"><span style="width:${f.income / mx * 100}%;background:var(--pos)"></span></div><strong class="num">${money(f.income, { cents: false })}</strong></div>
        <div><span>Went out</span><div class="io-track"><span style="width:${f.spending / mx * 100}%;background:var(--c4)"></span></div><strong class="num">${money(f.spending, { cents: false })}</strong></div></div>
        <p class="slide-lede">Spending was ${avgSpend ? `${money(Math.abs(f.spending - avgSpend), { cents: false })} ${f.spending > avgSpend ? 'more' : 'less'} than` : 'compared with'} our usual month.</p></div>
      <div class="slide-center">${ring(isFinite(f.rate) ? Math.max(0, f.rate) : 0, { size: 220, width: 20, label: isFinite(f.rate) ? pct(f.rate, 0) : '—', color: f.rate >= 0.2 ? 'var(--pos)' : f.rate >= 0 ? 'var(--ink-accent)' : 'var(--neg)' })}<p class="slide-lede">of what came in, we kept</p></div></div>`;
  } });
  if (items.length) slides.push({ title: 'Where it went', html: () => `<div class="slide-split">
      <div>${chartHost({ type: 'donut', h: 330, items, center: { value: money(spendTotal, { cents: false }), label: 'spent' } })}</div>
      <div><h2 class="slide-h2">Where it went</h2>${legendList(items, spendTotal)}
      <p class="slide-lede">${groups[0] ? `${esc(groups[0].label)} was the biggest piece at ${pct(groups[0].value / spendTotal, 0)}.` : ''}</p></div></div>` });
  if (wins.length || misses.length) slides.push({ title: 'Budget', html: () => `<h2 class="slide-h2 center">How the budget did</h2><div class="slide-split">
      <div class="wins"><h3>Under budget</h3>${wins.length ? wins.map(x => `<div class="wm good"><span>${esc(x.c.name)}</span><strong class="num">${money(x.v.budget - x.v.actual, { cents: false })} under</strong>${bar(x.v.actual, x.v.budget)}</div>`).join('') : '<p class="muted">Nothing came in under.</p>'}</div>
      <div class="misses"><h3>Over budget</h3>${misses.length ? misses.map(x => `<div class="wm bad"><span>${esc(x.c.name)}</span><strong class="num">${money(x.v.actual - x.v.budget, { cents: false })} over</strong>${bar(x.v.actual, x.v.budget)}</div>`).join('') : '<p class="slide-lede pos">Every category stayed within budget.</p>'}</div></div>` });
  if (members().length > 1) {
    const per = members().map(m => ({ m, f: flowSummary(txs.filter(t => personOf(t) === m.id)), a: categoryActuals(txs.filter(t => personOf(t) === m.id)) })).filter(x => x.f.spending > 0);
    const tot = sum(per.map(x => x.f.spending)) || 1;
    if (per.length > 1) slides.push({ title: 'Who spent what', html: () => `<h2 class="slide-h2 center">Who spent what</h2>
      <div class="stack huge">${per.map(x => `<span style="width:${x.f.spending / tot * 100}%;background:${memberColor(x.m.id)}"></span>`).join('')}</div>
      <div class="people-cards">${per.map(x => `<div class="person-card" style="--pc:${memberColor(x.m.id)}"><span class="person-name">${esc(x.m.name)}</span><span class="s-value num">${money(x.f.spending, { cents: false })}</span><span class="muted">${pct(x.f.spending / tot, 0)}</span><ul>${Object.entries(x.a).filter(([id, v]) => v > 0 && catById(id)?.kind === 'expense').sort((p, q) => q[1] - p[1]).slice(0, 3).map(([id, v]) => `<li><span>${esc(catName(id))}</span><span class="num">${money(v, { cents: false })}</span></li>`).join('')}</ul></div>`).join('')}</div>` });
  }
  if (state.goals.length) slides.push({ title: 'Goals', html: () => `<h2 class="slide-h2 center">Our goals</h2><div class="goal-strip big">${state.goals.map(goalTile).join('')}</div>` });
  const nextFrom = mk === thisMonth() ? today() : `${addMonths(mk, 1)}-01`;
  const ahead = []; for (const r of state.recurring) for (const d of occurrences(r, nextFrom, addDays(nextFrom, 40))) ahead.push({ d, r });
  ahead.sort((a, b) => a.d.localeCompare(b.d));
  slides.push({ title: 'Looking ahead', html: () => `<div class="slide-split">
      <div><h2 class="slide-h2">Looking ahead</h2>
        ${notes.length ? `<ul class="insights big">${notes.map(n => `<li class="${n.tone}">${esc(n.text)}</li>`).join('')}</ul>` : '<p class="slide-lede">Nothing unusual to flag.</p>'}</div>
      <div><h3>Bills in the next few weeks</h3><ul class="simple-list">${ahead.filter(x => Math.abs(x.r.amount) >= 50).slice(0, 8).map(x => `<li><span class="date-chip">${dateLabel(x.d)}</span><span>${esc(x.r.name)}</span><span class="num ${signClass(x.r.amount)}">${money(x.r.amount, { cents: false })}</span></li>`).join('') || '<li class="muted">None scheduled.</li>'}</ul></div></div>` });
  slides.push({ title: 'Decisions', html: () => `<div class="slide-narrow"><h2 class="slide-h2">What we decided</h2>
      <p class="slide-lede">Write down anything you agreed to change. It’s saved with ${M}’s review.</p>
      <textarea data-review-notes="${mk}" rows="7" placeholder="e.g. Move $300 a month from dining out to the roof fund">${esc(state.reviews[mk]?.notes || '')}</textarea>
      <div class="actions"><button class="btn primary" data-md="done">Mark ${M} as reviewed</button></div>
      <p class="slide-sign"><span class="wordmark">Ọrọ̀</span> · ${ORO_TAGLINE}</p></div>` });
  return slides;
}
function mdAction(a) {
  if (a === 'close') return endMoneyDate();
  if (a === 'prev' && MD.i > 0) { MD.i--; return paintSlide(); }
  if (a === 'next') { if (MD.i < MD.slides.length - 1) { MD.i++; return paintSlide(); } return endMoneyDate(); }
  if (a === 'done') { (state.reviews[MD.mk] = state.reviews[MD.mk] || {}).completedAt = today(); commit({ silent: true }); toast(`${monthLabel(MD.mk)} marked as reviewed.`); return endMoneyDate(); }
}

/* ================= command palette ================= */
const PAL = { items: [], sel: 0 };
function paletteItems(q) {
  q = q.trim().toLowerCase();
  const out = [];
  for (const [id, label] of PAGES) out.push({ group: 'Go to', label, run: () => go(`#/${id}`) });
  const acts = [['Add a transaction', () => txnModal()], ['Import a file', () => startImport()], ['Add an account', () => acctModal()], ['Add a goal', () => goalModal()], ['Start a Money date', () => startMoneyDate()],
    [state.settings.privacy ? 'Show amounts' : 'Hide amounts', () => ACTIONS.privacy()], [UI.mode === 'simple' ? 'Switch to Detailed view' : 'Switch to Simple view', () => { setMode(UI.mode === 'simple' ? 'detailed' : 'simple'); }],
    ['Undo', undo], ['Redo', redo], ['Download a backup', () => ACTIONS.backup()], ['Update balances', () => go('#/accounts?update=1')], ['Monthly review', () => go('#/review')]];
  if (Store.key) acts.push(['Lock Ọrọ̀ now', () => lockNow()]);
  for (const [label, run] of acts) out.push({ group: 'Actions', label, run });
  for (const a of activeAccounts()) out.push({ group: 'Accounts', label: a.name, hint: money(accountValue(a), { cents: false }), run: () => acctModal(a.id) });
  for (const c of state.categories) out.push({ group: 'Categories', label: c.name, hint: c.group, run: () => go(`#/transactions?m=all&cat=${c.id}`) });
  let list = q ? out.filter(i => (i.label + ' ' + (i.hint || '') + ' ' + i.group).toLowerCase().includes(q)) : out.filter(i => i.group !== 'Categories').slice(0, 14);
  if (q.length >= 2) {
    const tx = state.transactions.filter(t => (t.payee + ' ' + (t.memo || '')).toLowerCase().includes(q)).slice(0, 8);
    list = list.slice(0, 10).concat(tx.map(t => ({ group: 'Transactions', label: t.payee, hint: `${dateLabel(t.date, true)} · ${money(t.amount)}`, run: () => txnModal(t.id) })));
    if (state.transactions.some(t => (t.payee || '').toLowerCase().includes(q))) list.push({ group: 'Transactions', label: `Show all transactions matching “${q}”`, run: () => go(`#/transactions?m=all&q=${encodeURIComponent(q)}`) });
  }
  return list;
}
function openPalette() {
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap palette-wrap'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="palette" role="dialog" aria-label="Search or jump to"><input id="pal-q" placeholder="Search pages, actions, accounts, transactions…" autocomplete="off" aria-label="Search"><ul id="pal-list" role="listbox"></ul><p class="pal-foot muted small">↑↓ to move · Enter to open · Esc to close</p></div>`;
  document.body.appendChild(wrap);
  holdPage(true); fitModal();
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeModal(); });
  const inp = $('#pal-q');
  const paint = () => {
    PAL.items = paletteItems(inp.value); PAL.sel = clamp(PAL.sel, 0, Math.max(0, PAL.items.length - 1));
    let lastG = '';
    $('#pal-list').innerHTML = PAL.items.map((it, i) => { const g = it.group !== lastG ? `<li class="pal-group">${esc(it.group)}</li>` : ''; lastG = it.group; return g + `<li role="option" aria-selected="${i === PAL.sel}" class="${i === PAL.sel ? 'sel' : ''}" data-pal="${i}"><span>${esc(it.label)}</span>${it.hint ? `<span class="muted small">${esc(it.hint)}</span>` : ''}</li>`; }).join('') || '<li class="muted pal-empty">No matches</li>';
    $('#pal-list .sel')?.scrollIntoView({ block: 'nearest' });
  };
  inp.oninput = () => { PAL.sel = 0; paint(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { PAL.sel++; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { PAL.sel--; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = PAL.items[PAL.sel]; if (it) { closeModal(true); it.run(); } e.preventDefault(); }
  };
  $('#pal-list').onclick = e => { const li = e.target.closest('[data-pal]'); if (li) { const it = PAL.items[+li.dataset.pal]; closeModal(true); it.run(); } };
  PAL.sel = 0; paint(); inp.focus();
}
function showShortcuts() {
  openModal({ title: 'Keyboard shortcuts', body: `<dl class="shortcuts">${[['⌘K', 'Search or jump anywhere'], ['N', 'New transaction'], ['I', 'Import'], ['/', 'Search transactions'], ['G, O', 'Overview'], ['G, T', 'Transactions'], ['G, B', 'Budget'], ['G, C', 'Cash flow'], ['G, A', 'Accounts'], ['G, I', 'Investments'], ['G, P', 'Property'], ['G, R', 'Reports'], ['G, L', 'Planning'], ['G, X', 'Taxes'], ['G, M', 'Monthly review'], ['G, S', 'Settings'], ['⇧P', 'Hide or show amounts'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['← →', 'Move through a Money date']].map(([k, l]) => `<div><dt><kbd>${k}</kbd></dt><dd>${l}</dd></div>`).join('')}</dl>` });
}
function setMode(m) { UI.mode = m; try { localStorage.setItem('keel.mode', m); } catch (e) { /* ignore */ } render(); }

/* ================= auto-lock ================= */
let _idleTimer = null;
function armAutoLock() {
  clearTimeout(_idleTimer);
  const mins = +state.settings.autoLock || 0;
  if (!Store.key || !mins || $('.lock-screen')) return;
  _idleTimer = setTimeout(lockNow, mins * 60000);
}
['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, debounce(armAutoLock, 1000), { passive: true }));
function lockNow() {
  if (!Store.key || $('.lock-screen')) return;
  if ($('#present')) { $('#present').remove(); document.body.classList.remove('presenting'); }
  closeModal(true);
  const wrap = document.createElement('div');
  wrap.className = 'lock-screen';
  wrap.innerHTML = `<form class="lock-card" id="relock"><div class="brand big">${BRAND_MARK}</div><p class="brand-tag">${ORO_MEANING} · ${ORO_TAGLINE}</p><p>Ọrọ̀ locked after a period of inactivity.</p>
    <label class="field"><span>Passphrase</span><input type="password" id="relock-pass" autocomplete="current-password" autofocus></label>
    <p class="notice bad small" id="relock-err" hidden>That passphrase didn’t work.</p><button class="btn primary" type="submit">Unlock</button></form>`;
  document.body.appendChild(wrap);
  document.body.classList.add('locked');
  setTimeout(() => $('#relock-pass')?.focus(), 30);
  $('#relock').onsubmit = e => {
    e.preventDefault();
    if ($('#relock-pass').value === Store.pass) { wrap.remove(); document.body.classList.remove('locked'); armAutoLock(); }
    else $('#relock-err').hidden = false;
  };
}

/* ================= actions + events + boot ================= */
function replaceState(next, msg) {
  state = next; invalidate(); applyTheme();
  // On a phone, swapping in different data (sample data, erase, a backup) unlinks it from the Mac's copy.
  if (isCompanion() && SYNC.rec && !SYNC.rec.replaced) { SYNC.rec.replaced = true; syncSave(); }
  commit({ silent: true }); render(); if (msg) toast(msg, { label: 'Undo', fn: undo });
}
const ACTIONS = {
  'import': () => startImport(),
  'add-txn': () => txnModal(),
  'add-account': el => acctModal(null, el?.dataset.type),
  'add-holding': el => holdingModal(null, el?.dataset.acct),
  'add-recurring': () => recModal(),
  'add-cat': () => catModal(),
  'add-rule': () => ruleModal(),
  'add-goal': () => goalModal(),
  'palette': () => openPalette(),
  'more-pages': () => morePagesSheet(),
  'tx-filters': () => { UI.txFilters = !$('.filters')?.classList.contains('open'); render(); },
  'tx-select': () => { UI.txSelect = !UI.txSelect; if (!UI.txSelect) { $$('.tx-cb:checked').forEach(c => { c.checked = false; }); } render(); },
  'more-money-date': () => { closeModal(true); ACTIONS['money-date'](); },
  'money-date': el => startMoneyDate(el?.dataset.mk),
  'privacy': () => { state.settings.privacy = !state.settings.privacy; commit({ silent: true }); render(); },
  'print': () => window.print(),
  'sync': () => syncSheet(),
  'sync-open': () => syncPickFile(),
  'sync-send': () => syncSend(),
  'run-rules': () => {
    let n = 0;
    const hist = categoryHistory();
    for (const t of state.transactions) if (!t.categoryId && !(t.splits && t.splits.length)) {
      const r = matchRule(t.rawPayee || t.payee);
      if (r) { t.categoryId = r.categoryId; if (r.rename) t.payee = r.rename; if (r.person) t.person = r.person; n++; }
      else { const a = autoCategory(t.rawPayee || t.payee, t.amount, { mcc: t.mcc }, hist); if (a) { t.categoryId = a.id; n++; } }
    }
    if (n) commit();
    const left = state.transactions.filter(isUncat).length;
    toast(n ? `Categorized ${n.toLocaleString()} transaction${n > 1 ? 's' : ''}.${left ? ` ${left.toLocaleString()} still need you.` : ''}` : 'Nothing new to categorize. Pick a category for one and Ọrọ̀ will offer to remember it.', n ? { label: 'Undo', fn: undo } : null);
  },
  'load-sample': async () => {
    if (state.accounts.length && !await confirmBox('Load sample data', 'This replaces everything in Ọrọ̀ with a fictional household. You can undo it right after.', 'Replace with sample data', true)) return;
    const s = buildSampleState(); UI.nwRange = '12'; UI.lens = '';
    replaceState(s); go('#/overview');
    toast('Sample data loaded. Explore, then erase it in Settings when you’re ready to start.', { label: 'Undo', fn: undo });
  },
  'erase': () => {
    openModal({ title: 'Erase everything', body: `<p>This deletes every account, transaction, holding and setting${hasFolder() ? ` here and in <code>${esc(Store.fileName)}/data</code>. Earlier copies stay in the backups folder` : ''}. You can undo it until you close Ọrọ̀.</p><label class="field"><span>Type ERASE to confirm</span><input id="erase-confirm" autocomplete="off"></label>`,
      actions: `<button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="erase-go">Erase everything</button>` });
    $('#erase-go').onclick = () => {
      if ($('#erase-confirm').value.trim().toUpperCase() !== 'ERASE') return toast('Type ERASE to confirm.');
      closeModal(); replaceState(defaultState(), 'Everything was erased.'); go('#/overview');
    };
  },
  'save-balances': () => {
    let n = 0;
    $$('[data-bal]').forEach(inp => {
      const a = acctById(inp.dataset.bal), v = parseAmount(inp.value);
      if (!a || !isFinite(v)) return;
      setBalance(a, isLiability(a) ? Math.abs(v) : v); n++;
    });
    commit({ silent: true }); go('#/accounts'); toast(`Saved ${n} balance${n === 1 ? '' : 's'} as of today.`);
  },
  'budget-avg': async () => {
    const mk = route().params.m || thisMonth();
    if (!await confirmBox('Fill budgets from averages', `Set each monthly category’s budget to its average over the three months before ${monthLabel(mk)}, rounded to the nearest $10? Yearly categories aren’t changed.`, 'Fill budgets')) return;
    let n = 0;
    for (const c of state.categories) { if (c.kind === 'transfer' || c.period === 'year') continue; const avg = trailingAvg(c.id, mk, 3); if (avg > 0) { c.budget = Math.round(avg / 10) * 10; n++; } }
    commit(); toast(`Updated ${n} budget${n === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
  },
  'bulk-cat': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value)), cat = $('#bulk-cat').value || null;
    state.transactions.forEach(t => { if (ids.has(t.id)) { t.categoryId = cat; delete t.splits; } });
    commit(); toast(`Updated ${ids.size} transaction${ids.size === 1 ? '' : 's'}.`, { label: 'Undo', fn: undo });
  },
  'bulk-who': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value)), who = $('#bulk-who').value;
    state.transactions.forEach(t => { if (ids.has(t.id)) { if (who) t.person = who; else delete t.person; } });
    commit(); toast(`Updated ${ids.size} transaction${ids.size === 1 ? '' : 's'}.`);
  },
  'bulk-tag': () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value)), tags = parseTags($('#bulk-tag').value);
    if (!tags.length) return toast('Type a tag first.');
    state.transactions.forEach(t => { if (ids.has(t.id)) t.tags = [...new Set([...(t.tags || []), ...tags])]; });
    commit(); toast(`Tagged ${ids.size} transaction${ids.size === 1 ? '' : 's'}.`);
  },
  'bulk-del': async () => {
    const ids = new Set($$('.tx-cb:checked').map(c => c.value));
    if (!await confirmBox('Delete transactions', `Delete ${ids.size} transaction${ids.size === 1 ? '' : 's'}?`, 'Delete', true)) return;
    state.transactions = state.transactions.filter(t => !ids.has(t.id)); commit(); toast('Deleted.', { label: 'Undo', fn: undo });
  },
  'connect-folder': async () => {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'oro', mode: 'readwrite', startIn: 'documents' }); }
    catch (e) { if (e.name !== 'AbortError') toast('Couldn’t open that folder: ' + e.message); return; }
    await connectFolder(dir);
  },
  'reconnect': async () => { const ok = await reconnect(); render(); toast(ok ? `Saving to ${Store.fileName} again.` : 'Ọrọ̀ still doesn’t have permission to write there.'); if (ok) syncCheckInbox(); },
  'disconnect-file': async () => { await disconnectStorage(); render(); toast('Disconnected. Your data is still saved in this browser.'); },
  'open-file': async () => {
    const ask = () => promptPass('Unlock data file', 'This file is encrypted. Enter its passphrase.');
    const load = async text => {
      let next;
      try { next = await readDataFile(text, ask); } catch (e) { if (e.message !== 'cancelled') toast(e.message); return; }
      if (state.accounts.length && !await confirmBox('Open data file', 'Replace what’s in Ọrọ̀ now with the contents of this file? You can undo it.', 'Open file', true)) return;
      replaceState(next, 'Data file opened.'); go('#/overview');
    };
    if (window.showOpenFilePicker) {
      try { const [h] = await window.showOpenFilePicker({ types: [{ description: 'Ọrọ̀ data file', accept: { 'application/json': ['.json'] } }] }); await load(await (await h.getFile()).text()); }
      catch (e) { if (e.name !== 'AbortError') toast(e.message); }
    } else {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => inp.files[0] && load(await readFileAsText(inp.files[0]));
      inp.click();
    }
  },
  'backup': async () => { downloadFile(`oro-backup-${today()}.json`, JSON.stringify(await serialize())); toast(Store.key ? 'Encrypted backup downloaded.' : 'Backup downloaded. It isn’t encrypted; add a passphrase if you’ll store it somewhere shared.'); },
  'export-csv': () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Account', 'Payee', 'Category', 'Group', 'Amount', 'Person', 'Tags', 'Memo'].join(',')];
    for (const t of state.transactions) for (const l of txLines(t)) { const c = catById(l.categoryId); lines.push([t.date, q(acctById(t.accountId)?.name), q(t.payee), q(c?.name || 'Uncategorized'), q(c?.group || ''), l.amount.toFixed(2), q(memberName(personOf(t))), q((t.tags || []).join(' ')), q(t.memo)].join(',')); }
    saveExport(`oro-transactions-${today()}.csv`, lines.join('\n'));
  },
  'export-statement': el => {
    const ms = monthsIn(el.dataset.from, el.dataset.to).slice(-12);
    const per = ms.map(m => categoryActuals(lensed(txInMonth(m))));
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Group', 'Category', ...ms, 'Total'].join(',')];
    for (const c of state.categories.filter(c => c.kind !== 'transfer')) { const vals = per.map(a => a[c.id] || 0); if (vals.some(Boolean)) lines.push([q(c.group), q(c.name), ...vals.map(v => v.toFixed(2)), sum(vals).toFixed(2)].join(',')); }
    saveExport(`oro-income-statement-${ms[0]}-to-${ms[ms.length - 1]}.csv`, lines.join('\n'));
  },
  'export-tax': el => {
    const year = +el.dataset.year, q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [`Ọrọ̀ tax summary for ${year}`, ''];
    for (const a of activeAccounts().filter(x => x.type === 'realestate' && x.rental)) {
      const E = scheduleE(a, year);
      lines.push(`Schedule E,${q(a.name)}`, 'Line,Description,Amount');
      for (const k of Object.keys(SCHED_E)) if (E.lines[k]) lines.push(`${k},${q(SCHED_E[k])},${E.lines[k].toFixed(2)}`);
      lines.push(`20,Total expenses,${E.expenses.toFixed(2)}`, `21,Income or (loss),${E.net.toFixed(2)}`, '');
    }
    const D = deductionSummary(year);
    lines.push('Possible deductions,Amount');
    for (const [k, v] of Object.entries(D.by)) lines.push(`${q(k)},${v.toFixed(2)}`);
    if (D.tagged.length) { lines.push('', 'Transactions tagged #tax', 'Date,Payee,Amount'); D.tagged.forEach(t => lines.push(`${t.date},${q(t.payee)},${t.amount.toFixed(2)}`)); }
    lines.push('', 'Detail: every transaction in tax-tagged and rental categories', 'Date,Account,Payee,Category,Amount');
    for (const t of txInRange(`${year}-01-01`, `${year}-12-31`)) for (const l of txLines(t)) { const c = catById(l.categoryId); if (c && (c.taxTag || c.rental)) lines.push(`${t.date},${q(acctById(t.accountId)?.name)},${q(t.payee)},${q(c.name)},${l.amount.toFixed(2)}`); }
    saveExport(`oro-tax-${year}.csv`, lines.join('\n'));
  },
  'set-pass': async () => { const p = await promptPass('Add a passphrase', 'Ọrọ̀ will encrypt your data, backups and receipts with this passphrase. You’ll need it every time you open Ọrọ̀.', { confirm: true, ok: 'Encrypt my data' }); if (p) { await setPassphrase(p); render(); armAutoLock(); toast('Your data is now encrypted.'); } },
  'change-pass': async () => { const p = await promptPass('Change passphrase', 'Choose a new passphrase. Receipts saved earlier still open with the old one, so keep it until you re-attach them.', { confirm: true, ok: 'Change passphrase' }); if (p) { await setPassphrase(p); render(); toast('Passphrase changed.'); } },
  'remove-pass': async () => { if (await confirmBox('Remove passphrase', 'Your data and new backups will be stored without encryption.', 'Remove passphrase', true)) { await setPassphrase(null); render(); toast('Passphrase removed.'); } },
  'add-member': () => { const id = 'm' + uid().slice(0, 5); state.settings.members.push({ id, name: 'New person' }); commit(); setTimeout(() => { const el = $(`[data-member="${id}"]`); if (el) { el.focus(); el.select(); } }, 30); },
};

async function connectFolder(dir) {
  const ok = await useFolder(dir);
  if (!ok) return toast('Ọrọ̀ needs permission to save in that folder.');
  const existing = await folderHasData();
  if (existing) {
    let next = null;
    try { next = await readDataFile(existing, () => promptPass('Unlock Ọrọ̀ data', 'The data in this folder is encrypted. Enter its passphrase.')); } catch (e) { if (e.message !== 'cancelled') toast(e.message); }
    if (next && JSON.stringify(next.accounts) !== JSON.stringify(state.accounts)) {
      const theirs = next.meta?.modified ? new Date(next.meta.modified).toLocaleString() : 'an earlier date';
      const useTheirs = !state.accounts.length || await confirmBox('This folder already has Ọrọ̀ data', `It was last saved ${esc(theirs)}. Open it, replacing what’s on screen now? Choose Cancel to keep what’s on screen and save it into the folder instead.`, 'Open the folder’s data');
      if (useTheirs) { replaceState(next); resetHistory(); toast(`Opened your data from ${Store.fileName}.`); syncCheckInbox(); return; }
    }
  }
  Store.lastBackup = null;
  await persistNow(); render();
  toast(`Saving to ${Store.fileName}: data, daily backups and receipts.`);
  syncCheckInbox();
}

const THEME_COLORS = { ng: ['#F6F3EA', '#0C1713'], classic: ['#E8EEE5', '#0F1619'] };   // browser bar colors: light, dark
function applyTheme() {
  const t = state?.settings?.theme || 'auto', look = state?.settings?.look === 'classic' ? 'classic' : 'ng', root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  root.dataset.look = look;
  for (const m of document.querySelectorAll('meta[name="theme-color"]'))
    m.content = THEME_COLORS[look][(t === 'auto' ? /dark/.test(m.media) : t === 'dark') ? 1 : 0];
}
function updateBulk() {
  const n = $$('.tx-cb:checked').length, b = $('#bulk');
  if (!b) return;
  b.hidden = !n; $('#bulk-count').textContent = `${n} selected`;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-close],[data-imp],[data-act],[data-md],[data-month],[data-nwrange],[data-mode],[data-tab],[data-by],[data-lens],[data-tagfilter],[data-edit-txn],[data-edit-acct],[data-history],[data-reconcile],[data-edit-holding],[data-edit-rec],[data-edit-cat],[data-edit-rule],[data-edit-goal],[data-add-rep],[data-more],[data-review-done],[data-restore],[data-member-del],#save-status,#menu-btn');
  if (!el) return;
  const d = el.dataset;
  if ('close' in d) return closeModal();
  if (d.imp) return importAction(d.imp);
  if (d.md) return mdAction(d.md);
  if (d.act) { e.preventDefault(); return ACTIONS[d.act]?.(el); }
  if (d.month) return setParam(d.param || 'm', d.month === thisMonth() && d.param !== 'cm' ? '' : d.month);
  if (d.nwrange) { UI.nwRange = d.nwrange; return render(); }
  if (d.mode) { setMode(d.mode); $$('#modal .seg.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === d.mode)); return; }
  if (d.tab) return setParam(d.param, d.tab);
  if ('by' in d && el.closest('.seg')) return setParam('by', d.by);
  if ('lens' in d) { UI.lens = d.lens; try { sessionStorage.setItem('keel.lens', d.lens); } catch (e2) { /* ignore */ } return render(); }
  if (d.tagfilter) { e.preventDefault(); return go(`#/transactions?m=all&tag=${encodeURIComponent(d.tagfilter)}`); }
  if (d.editTxn) return txnModal(d.editTxn);
  if (d.editAcct) return acctModal(d.editAcct);
  if (d.history) return historyModal(d.history);
  if (d.reconcile) return reconcileModal(d.reconcile);
  if (d.editHolding) return holdingModal(d.editHolding);
  if (d.editRec) return recModal(d.editRec);
  if (d.editCat) return catModal(d.editCat);
  if (d.editRule) return ruleModal(d.editRule);
  if (d.editGoal) return goalModal(d.editGoal);
  if (d.addRep) { const r = detectRepeating()[+d.addRep]; if (r) recModal(null, { name: r.payee, amount: -r.monthly, freq: 'monthly', nextDate: nextOccurrence(r.lastDate, 'monthly'), categoryId: r.categoryId }); return; }
  if (d.more) return setParam('limit', d.more);
  if (d.memberDel) { const id = d.memberDel; state.settings.members = state.settings.members.filter(m => m.id !== id); state.accounts.forEach(a => { if (a.owner === id) a.owner = 'joint'; }); state.transactions.forEach(t => { if (t.person === id) delete t.person; }); if (UI.lens === id) UI.lens = ''; commit(); return; }
  if (d.restore) {
    (async () => {
      const b = (await listBackups()).find(x => x.name === d.restore); if (!b) return;
      let next; try { next = await readDataFile(await readHandleText(b.handle), () => promptPass('Unlock backup', 'This backup is encrypted. Enter its passphrase.')); } catch (err) { if (err.message !== 'cancelled') toast(err.message); return; }
      if (!await confirmBox('Restore backup', `Replace what’s in Ọrọ̀ now with the backup from ${dateLabel(b.date, true)}? You can undo it.`, 'Restore', true)) return;
      replaceState(next, `Restored the backup from ${dateLabel(b.date, true)}.`);
    })();
    return;
  }
  if (d.reviewDone) {
    const mk = d.reviewDone; state.reviews[mk] = state.reviews[mk] || {};
    if (d.undo) delete state.reviews[mk].completedAt; else state.reviews[mk].completedAt = today();
    commit(); if (!d.undo) toast(`${monthLabel(mk)} marked as reviewed.`);
    return;
  }
  if (el.id === 'save-status' && d.action === 'reconnect') return ACTIONS.reconnect();
  if (el.id === 'save-status' && d.action === 'sync') return syncSheet();
  if (el.id === 'menu-btn') { document.body.classList.toggle('nav-open'); return; }
});
document.addEventListener('click', e => { if (e.target.closest('.nav a')) document.body.classList.remove('nav-open'); });

document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (el.id === 'lens-select') { UI.lens = el.value; try { sessionStorage.setItem('keel.lens', el.value); } catch (e2) { /* ignore */ } return render(); }
  if (d.filter && el.tagName === 'SELECT') return setParam(d.filter, el.value === thisMonth() && d.filter === 'm' && route().page !== 'review' ? '' : el.value);
  if (d.date) return setParam(d.date, el.value);
  if (d.txcat) {
    const t = state.transactions.find(x => x.id === d.txcat); if (!t) return;
    t.categoryId = el.value || null;
    el.closest('tr')?.classList.toggle('needs', !t.categoryId);
    const pill = el.parentElement?.querySelector('.cat-pill-text'); if (pill) pill.textContent = catName(t.categoryId);
    commit({ silent: true });
    offerRule(t, t.categoryId);
    return;
  }
  if (d.budget) { const c = catById(d.budget), v = parseAmount(el.value || '0'); if (c && isFinite(v)) { c.budget = round2(Math.max(0, v)); commit({ silent: true }); setTimeout(render, 0); } return; }
  if (d.target) { const v = parseFloat(el.value); if (el.value.trim() === '' || !isFinite(v)) delete state.settings.targets[d.target]; else state.settings.targets[d.target] = clamp(v, 0, 100); commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.setting) {
    const k = d.setting; let v = el.value;
    if (k !== 'theme' && k !== 'look') { v = parseAmount(v); if (!isFinite(v)) return; }
    state.settings[k] = v; applyTheme(); armAutoLock(); commit({ silent: true }); setTimeout(render, 0); return;
  }
  if (d.settingBool) { state.settings[d.settingBool] = el.checked; commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.plan) {
    const k = d.plan;
    if (el.type === 'checkbox') state.plan[k] = el.checked;
    else if (k === 'debtMethod') state.plan[k] = el.value;
    else { const raw = el.value.trim(); state.plan[k] = raw === '' ? null : parseAmount(raw); if (state.plan[k] != null && !isFinite(state.plan[k])) state.plan[k] = null; }
    commit({ silent: true }); setTimeout(render, 0); return;
  }
  if (d.taxint) { const v = parseAmount(el.value || ''); ((state.tax[d.taxint] = state.tax[d.taxint] || {})[d.year] = state.tax[d.taxint][d.year] || {}).interest = isFinite(v) ? round2(v) : null; commit({ silent: true }); setTimeout(render, 0); return; }
  if (d.schede) { const c = catById(d.schede); if (c) { c.schedE = el.value; commit({ silent: true }); setTimeout(render, 0); } return; }
  if (d.member) { const m = state.settings.members.find(x => x.id === d.member); if (m && el.value.trim()) { m.name = el.value.trim(); commit({ silent: true }); setTimeout(render, 0); } return; }
  if (el.classList.contains('tx-cb')) return updateBulk();
  if (el.id === 'tx-all') { $$('.tx-cb').forEach(c => c.checked = el.checked); return updateBulk(); }
});
const searchDebounced = debounce(v => setParam('q', v), 300);
const notesDebounced = debounce((mk, v) => { (state.reviews[mk] = state.reviews[mk] || {}).notes = v; commit({ silent: true }); }, 500);
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'tx-search') return searchDebounced(el.value);
  if (el.dataset.reviewNotes) return notesDebounced(el.dataset.reviewNotes, el.value);
});

/* ---------- keyboard ---------- */
let _gPending = 0;
const GO_KEYS = { o: 'overview', t: 'transactions', b: 'budget', c: 'cashflow', a: 'accounts', i: 'investments', p: 'property', r: 'reports', l: 'planning', x: 'taxes', m: 'review', s: 'data' };
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  const mod = e.metaKey || e.ctrlKey;
  if (document.body.classList.contains('locked')) return;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
  if ($('#present') && !typing) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); return mdAction('next'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return mdAction('prev'); }
    if (e.key === 'Escape') return mdAction('close');
  }
  if (e.key === 'Escape' && $('#modal')) { closeModal(); return; }
  if (e.key === 'Enter' && (e.target.matches?.('.budget-input') || e.target.matches?.('[data-setting]') || e.target.matches?.('[data-plan]'))) { e.target.blur(); return; }
  if (typing || $('#modal') || $('#present')) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod || e.altKey) return;
  if (_gPending && Date.now() - _gPending < 1200) { _gPending = 0; const pg = GO_KEYS[e.key.toLowerCase()]; if (pg) { e.preventDefault(); go(`#/${pg}`); } return; }
  if (e.key === 'g') { _gPending = Date.now(); return; }
  if (e.key === 'n') { e.preventDefault(); return txnModal(); }
  if (e.key === 'i') { e.preventDefault(); return startImport(); }
  if (e.key === '/') { e.preventDefault(); if (route().page !== 'transactions') go('#/transactions'); setTimeout(() => $('#tx-search')?.focus(), 50); return; }
  if (e.key === '?') { e.preventDefault(); return showShortcuts(); }
  if (e.key === 'P' && e.shiftKey) { e.preventDefault(); return ACTIONS.privacy(); }
});

/* ---------- lock screen at startup ---------- */
function lockScreen(payload) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'lock-screen';
    wrap.innerHTML = `<form class="lock-card" id="lock-form">
      <div class="brand big">${BRAND_MARK}</div>
      <p class="brand-tag">${ORO_MEANING} · ${ORO_TAGLINE}</p>
      <p>Your data is encrypted. Enter your passphrase to open it.</p>
      <label class="field"><span>Passphrase</span><input type="password" id="lock-pass" autocomplete="current-password" autofocus></label>
      <p class="notice bad small" id="lock-err" hidden>That passphrase didn’t work.</p>
      <button class="btn primary" type="submit">Unlock</button>
      <details><summary>Forgot it?</summary><p class="muted small">There’s no way to recover a forgotten passphrase. If you have an unencrypted backup you can open it after starting over.</p><button class="btn ghost danger-text" type="button" id="lock-reset">Erase this browser’s copy and start over</button></details>
    </form>`;
    document.body.appendChild(wrap);
    document.body.classList.add('locked');
    setTimeout(() => $('#lock-pass')?.focus(), 30);
    $('#lock-form').onsubmit = async e => {
      e.preventDefault();
      const pass = $('#lock-pass').value;
      const btn = wrap.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Unlocking…';
      try {
        const o = await Vault.open(payload, pass);
        Store.key = o.key; Store.salt = o.salt; Store.pass = pass;
        state = migrate(unwrap(o.data));
        wrap.remove(); document.body.classList.remove('locked'); resolve();
      } catch (err) { $('#lock-err').hidden = false; btn.disabled = false; btn.textContent = 'Unlock'; }
    };
    $('#lock-reset').onclick = async () => {
      if (!confirm('Erase the encrypted copy in this browser? Your Ọrọ̀ folder (if any) is not touched.')) return;
      try { await IDB.del('state'); await IDB.del('sync'); } catch (e) { /* ignore */ }
      try { localStorage.removeItem('keel.state'); } catch (e) { /* ignore */ }
      state = defaultState(); wrap.remove(); document.body.classList.remove('locked'); resolve();
    };
  });
}

async function boot() {
  buildShell();
  const payload = await loadFromBrowser();
  if (payload && payload.encrypted) await lockScreen(payload);
  else state = migrate(unwrap(payload) || defaultState());
  if (await syncFromDiskIfNewer()) invalidate();
  if (isCompanion()) await syncLoad();
  applyTheme();
  resetHistory();
  window.addEventListener('hashchange', () => { if ($('#present')) endMoneyDate(); render(); });
  render();
  if (!payload || (state.version || 0) < 2 || (hasFolder() && !state.meta.saveNo)) persist();   // first numbered save
  armAutoLock();
  syncWatch();
  registerOffline();
}
document.addEventListener('DOMContentLoaded', boot);

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
  const v = o.v || (o.op === 'del' ? null : undefined);
  const where = { transactions: 'transaction', accounts: 'account', categories: 'category', goals: 'goal', holdings: 'holding', recurring: 'recurring item', rules: 'rule' }[o.path[0]] || o.path.join(' › ');
  if (o.op === 'put' || o.op === 'del') {
    const item = v || (Array.isArray(walkPath(target, o.path)) ? walkPath(target, o.path).find(x => x.id === o.id) : null) || {};
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
  if (parsed.oroChanges) return toast('That’s a change file. Choose Ọrọ̀ › data › oro.json instead.');
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
  let msg = `Opened your Mac’s ${saveLabel(nNo, nAt)}.`;
  const lm = next.meta?.lastMerge;
  if (lm && (!prev?.macSaved || lm.at > prev.macSaved)) msg += ` It includes ${changesWord(lm.applied)} from your ${lm.device || dev}, added on your Mac ${whenLabel(lm.at)}${lm.conflicts ? `; your Mac kept its own version of ${lm.conflicts === 1 ? 'one item' : lm.conflicts + ' items'}${lm.kept?.length ? ` (${lm.kept.slice(0, 2).join(', ')}${lm.kept.length > 2 ? '…' : ''})` : ''}` : ''}.`;
  const left = syncPending().length;
  if (left) msg += ` ${changesWord(left)} made here still need to go to your Mac.`;
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
      ${n ? `<button class="btn primary" data-act="sync-send">Send to your Mac</button>` : ''}
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
