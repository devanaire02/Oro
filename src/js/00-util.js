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
  if (/[a-z]/.test(raw)) return raw.slice(0, 60);
  const c = cleanPayee(raw) || raw;
  const words = c.split(' ');
  if (words.length > 2 && US_STATES.has(words[words.length - 1].toUpperCase())) words.pop();
  return words.slice(0, 5).map(w => /^(LLC|INC|USA|ATM|IRS|HOA|ACH|CVS|AT&T|BP|UPS|USPS|IKEA|BMW|KFC|TJ|HSA|IRA)$/.test(w) ? w
    : w.toLowerCase().replace(/(^|[-/'(&])([a-z])/g, (m, a, b) => a + b.toUpperCase())).join(' ');
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
