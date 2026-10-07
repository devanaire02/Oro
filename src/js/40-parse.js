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
    category: pickCol(h, [/^category$/i, /category/i]),
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

/* Built-in merchant dictionary: a starting point before you've made any rules. [pattern, category, direction] */
const BUILTIN_MERCHANTS = [
  [/PAYROLL|DIR(ECT)? ?DEP|SALARY/, 'Paycheck', 'in'],
  [/INTEREST (PAID|EARNED|PAYMENT)|DIVIDEND/, 'Interest and dividends', 'in'],
  [/PAYMENT THANK YOU|AUTOPAY|AUTO PAY|CARD PAYMENT|CRD PMT|CREDIT CRD|EPAYMENT|E PAYMENT|MOBILE PMT|ONLINE PAYMENT THANK/, 'Credit card payment'],
  [/ONLINE TRANSFER|TRANSFER (TO|FROM)|XFER/, 'Transfer between accounts'],
  [/\bMTG\b|MORTGAGE|HOME LOAN|LOAN SERVICING|MR COOPER|ROCKET MORTGAGE|LOANCARE|DOVENMUEHLE/, 'Mortgage or rent', 'out'],
  [/AUTO (FINANCE|LOAN|PMT|PAYMENT)|TOYOTA (FIN|MOTOR CREDIT)|HONDA FIN|ALLY (AUTO|PAYMT)|GM FINANCIAL|FORD CREDIT|TESLA FINANCE|CAR PAYMENT/, 'Auto payment', 'out'],
  [/FIDELITY|SCHWAB|VANGUARD|E TRADE|ETRADE|ROBINHOOD|BETTERMENT|WEALTHFRONT|MERRILL|TD AMERITRADE|INTERACTIVE BROKERS/, 'Savings and investing', 'out'],
  [/UBER EATS|UBEREATS|DOORDASH|GRUBHUB|POSTMATES|CAVIAR|SEAMLESS/, 'Dining out'],
  [/STARBUCKS|DUNKIN|PEET|DUTCH BROS|BLUE BOTTLE|INTELLIGENTSIA|TIM HORTONS|COFFEE|ESPRESSO/, 'Coffee'],
  [/WHOLE ?FOODS|WHOLEFDS|JEWEL|MARIANO|TRADER JOE|\bALDI\b|KROGER|SAFEWAY|PUBLIX|WEGMANS|\bH ?E ?B\b|MEIJER|FOOD LION|GIANT EAGLE|SPROUTS|INSTACART|FRESH THYME|COSTCO|SAMS CLUB|STOP & SHOP|HY VEE|WINCO|RALPHS|ALBERTSONS|\bVONS\b|SHOPRITE|GROCER|SUPERMARKET|FRESH MARKET/, 'Groceries'],
  [/MCDONALD|CHIPOTLE|PANERA|CHICK FIL|SUBWAY|DOMINO|PIZZA|SWEETGREEN|SHAKE SHACK|WENDY|BURGER|TACO|RESTAURANT|GRILL|TRATTORIA|PORTILLO|GIORDANO|MALNATI|FIVE GUYS|\bCAVA\b|POTBELLY|JIMMY JOHN|POPEYES|OLIVE GARDEN|SUSHI|RAMEN|KITCHEN|BISTRO|TAVERN|\bPUB\b|BREWING|BAKERY|DELI\b/, 'Dining out'],
  [/\bUBER\b|\bLYFT\b|METRA|\bCTA\b|VENTRA|AMTRAK|\bMTA\b|CITI BIKE|DIVVY|LIME\b|BIRD APP/, 'Transit and rideshare'],
  [/COMED|NICOR|PEOPLES GAS|NORTHERN GAS|CON ED|PG ?& ?E|DUKE ENERGY|XFINITY|COMCAST|SPECTRUM|VERIZON|AT&T|\bATT\b|T MOBILE|TMOBILE|WATER DEPT|WATER UTIL|ELECTRIC|ENERGY|EDISON|DOMINION|GEORGIA POWER|\bFPL\b|NATIONAL GRID|EVERSOURCE|FIBER|INTERNET|WASTE MANAGEMENT|REPUBLIC SERVICES/, 'Utilities'],
  [/\bSHELL\b|EXXON|MOBIL|CHEVRON|\bBP\b|MARATHON PETRO|SPEEDWAY|CITGO|SUNOCO|VALERO|\bARCO\b|PHILLIPS 66|CIRCLE K|\bWAWA\b|SHEETZ|QUIKTRIP|CASEYS|SUPERCHARGER|CHARGEPOINT|ELECTRIFY AMERICA|EVGO|FUEL/, 'Fuel and charging'],
  [/PARKING|PARKMOBILE|SPOTHERO|PARK CHICAGO|I ?PASS|E ?Z ?PASS|TOLLWAY|\bTOLL|SUNPASS|FASTRAK/, 'Parking and tolls'],
  [/JIFFY LUBE|VALVOLINE|FIRESTONE|DISCOUNT TIRE|AUTOZONE|O REILLY|PEP BOYS|MIDAS|CAR WASH|DMV|SECRETARY OF STATE/, 'Auto maintenance'],
  [/NETFLIX|SPOTIFY|HULU|DISNEY ?PLUS|\bHBO|MAX COM|PARAMOUNT|PEACOCK|YOUTUBE|APPLE COM BILL|ICLOUD|GOOGLE STORAGE|GOOGLE ONE|AUDIBLE|KINDLE|NYTIMES|NY TIMES|\bWSJ\b|DROPBOX|ADOBE|MICROSOFT|PATREON|SIRIUSXM|OPENAI|CHATGPT|ANTHROPIC|SUBSTACK|AMAZON PRIME|PRIME VIDEO/, 'Subscriptions'],
  [/PELOTON|ORANGETHEORY|EQUINOX|LIFE ?TIME|PLANET FITNESS|CRUNCH|LA FITNESS|ANYTIME FITNESS|CLASSPASS|SOULCYCLE|\bF45\b|\bYMCA\b|XSPORT|GYM\b/, 'Fitness'],
  [/WALGREENS|\bCVS\b|RITE AID|PHARMACY|CLINIC|HOSPITAL|MEDICAL|\bMED\b|DENTAL|DENTIST|ORTHODONT|OPTOM|LABCORP|QUEST DIAG|ADVOCATE|KAISER|MYCHART|URGENT CARE|PEDIATRIC|PHYSICIAN|THERAP/, 'Medical'],
  [/DELTA AIR|UNITED AIR|AMERICAN AIR|SOUTHWEST|JETBLUE|ALASKA AIR|SPIRIT AIR|FRONTIER AIR|AIRBNB|VRBO|MARRIOTT|HILTON|HYATT|\bIHG\b|HOLIDAY INN|EXPEDIA|BOOKING COM|HOTELS COM|HERTZ|\bAVIS\b|ENTERPRISE RENT|NATIONAL CAR|TSA PRE|CLEAR ME|AIRLINE|HOTEL|RESORT/, 'Travel'],
  [/\bAMC\b|REGAL|CINEMARK|TICKETMASTER|LIVE NATION|STUBHUB|SEATGEEK|FANDANGO|STEAM ?GAMES|PLAYSTATION|XBOX|NINTENDO|THEATER|THEATRE|MUSEUM|BOWL/, 'Entertainment'],
  [/CHEWY|PETCO|PETSMART|\bVET\b|VETERINAR|BANFIELD|\bROVER\b/, 'Pets'],
  [/SUPERCUTS|GREAT CLIPS|SALON|BARBER|\bULTA\b|SEPHORA|\bSPA\b|MASSAGE|NAIL/, 'Personal care'],
  [/DAYCARE|CHILDCARE|AFTERCARE|PRESCHOOL|KINDERCARE|BRIGHT HORIZONS|BABYSIT|NANNY/, 'Childcare'],
  [/SOCCER|SWIM|GYMNAST|DANCE|MARTIAL|KARATE|LITTLE LEAGUE|\bCAMP\b|TUTOR|KUMON|MATHNASIUM|HOCKEY|BASEBALL|BASKETBALL/, 'Kids activities'],
  [/TUITION|SCHOOL|SCHOLASTIC|UNIVERSITY|COLLEGE/, 'School'],
  [/HOME DEPOT|LOWES|MENARDS|ACE HARDWARE|TRUE VALUE|SHERWIN|HARDWARE|PLUMB|HVAC|ROOFING|LANDSCAP|LAWN/, 'Home maintenance'],
  [/GOFUNDME|DONAT|CHARITY|RED CROSS|UNITED WAY|CHURCH|TITHE|FOUNDATION/, 'Gifts and giving'],
  [/\bIRS\b|US TREASURY|DEPT OF REV|DEPARTMENT OF REVENUE|TAX PAYMENT|FRANCHISE TAX/, 'Taxes'],
  [/OVERDRAFT|SERVICE FEE|MONTHLY FEE|MAINTENANCE FEE|ATM FEE|FOREIGN TRANSACTION|LATE FEE|INTEREST CHARGE|ANNUAL FEE/, 'Bank fees'],
  [/AMAZON|AMZN|TARGET|WALMART|WAL MART|BEST BUY|HOMEGOODS|TJ ?MAXX|MARSHALLS|NORDSTROM|MACY|KOHLS|ETSY|EBAY|APPLE STORE|IKEA|WAYFAIR|OLD NAVY|\bGAP\b|ZARA|UNIQLO|NIKE|LULULEMON|CRATE|POTTERY BARN|WILLIAMS SONOMA|BED BATH|DICKS SPORTING|REI\b/, 'Shopping'],
];
function builtinCategory(payee, amount) {
  const p = ' ' + normPayee(payee) + ' ';
  for (const [re, name, dir] of BUILTIN_MERCHANTS) {
    if (dir === 'in' && !(amount > 0)) continue;
    if (dir === 'out' && !(amount < 0)) continue;
    if (re.test(p)) { const c = state.categories.find(c => c.name === name); if (c) return c.id; }
  }
  return null;
}

/* Bank-provided category names → Ọrọ̀ categories */
const BANK_CATEGORY_MAP = [
  [/grocer|supermarket/i, 'Groceries'], [/food|dining|restaurant|bar\b/i, 'Dining out'], [/coffee/i, 'Coffee'],
  [/gas|fuel|automotive fuel/i, 'Fuel and charging'], [/auto(motive)?|car service/i, 'Auto maintenance'], [/parking|toll/i, 'Parking and tolls'],
  [/utilit|bills/i, 'Utilities'], [/travel|airline|airfare|lodging|hotel|rental car/i, 'Travel'], [/entertain/i, 'Entertainment'],
  [/health|medical|pharmac|doctor/i, 'Medical'], [/fitness|gym/i, 'Fitness'], [/personal/i, 'Personal care'],
  [/shopping|merchandise|retail/i, 'Shopping'], [/home|household/i, 'Home maintenance'], [/education|school|tuition/i, 'School'],
  [/gift|donat|charit/i, 'Gifts and giving'], [/fee|adjustment/i, 'Bank fees'], [/pet/i, 'Pets'], [/subscription|streaming/i, 'Subscriptions'],
  [/insurance/i, 'Life and disability insurance'], [/tax/i, 'Taxes'],
];
function categoryFromBank(name) {
  if (!name) return null;
  for (const [re, target] of BANK_CATEGORY_MAP) if (re.test(name)) { const c = state.categories.find(c => c.name === target); if (c) return c.id; }
  const exact = state.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  return exact ? exact.id : null;
}
