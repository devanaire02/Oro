/* ---------- Cryptocurrency ----------
   A Cryptocurrency account holds coins the way a brokerage account holds funds: amount × price = value, so its balance
   follows the price. Prices are typed in (Investments › Crypto prices, a coin's dialog, Check-in, or said to Talk), or
   come from a positions file; Ọrọ̀ doesn't go online for them, like every other price in it. A coin has one price, so
   changing it updates every Cryptocurrency account that holds that coin. (Only Cryptocurrency accounts: a brokerage
   holding with the same ticker, like the Grayscale Bitcoin Mini Trust "BTC", is a fund with its own price.) */
const CRYPTO_COINS = [
  ['BTC', 'Bitcoin', ['bitcoin', 'bitcoins', 'btc', 'xbt']],
  ['ETH', 'Ethereum', ['ethereum', 'ether', 'eth']],
  ['SOL', 'Solana', ['solana', 'sol']],
  ['XRP', 'XRP', ['xrp', 'ripple']],
  ['USDC', 'USD Coin', ['usdc', 'usd coin']],
  ['USDT', 'Tether', ['usdt', 'tether']],
  ['ADA', 'Cardano', ['cardano', 'ada']],
  ['DOGE', 'Dogecoin', ['dogecoin', 'doge']],
  ['LTC', 'Litecoin', ['litecoin', 'ltc']],
  ['BCH', 'Bitcoin Cash', ['bitcoin cash', 'bch']],
  ['AVAX', 'Avalanche', ['avalanche', 'avax']],
  ['DOT', 'Polkadot', ['polkadot', 'dot']],
  ['LINK', 'Chainlink', ['chainlink', 'link']],
  ['XLM', 'Stellar', ['stellar', 'xlm', 'lumens']],
  ['POL', 'Polygon', ['polygon', 'matic', 'pol']],
  ['SHIB', 'Shiba Inu', ['shiba inu', 'shiba', 'shib']],
  ['ATOM', 'Cosmos', ['cosmos', 'atom']],
  ['UNI', 'Uniswap', ['uniswap', 'uni']],
  ['TRX', 'TRON', ['tron', 'trx']],
  ['TON', 'Toncoin', ['toncoin', 'ton']],
  ['SUI', 'Sui', ['sui']],
  ['HBAR', 'Hedera', ['hedera', 'hbar']],
  ['NEAR', 'NEAR Protocol', ['near protocol', 'near']],
  ['DAI', 'Dai', ['dai']],
];
const CRYPTO_STALE_DAYS = 7;   // prices move fast; Check-in asks for one older than a week
/* Spot bitcoin and ether funds held at a brokerage count as Crypto for allocation (guessAssetClass) */
const CRYPTO_FUNDS = /^(IBIT|FBTC|GBTC|BITB|ARKB|HODL|BRRR|EZBC|BTCO|BTCW|DEFI|BITO|BTF|ETHA|FETH|ETHE|ETHW|CETH|QETH|EZET|ETHV)$/;

const coinRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function coinBySymbol(sym) { const s = String(sym || '').toUpperCase(); return CRYPTO_COINS.find(c => c[0] === s) || null; }
/* "bitcoin", "BTC", "Bitcoin (BTC)" → the coin */
function coinFind(text) {
  const t = String(text || '').toLowerCase().replace(/[()]/g, ' ').trim();
  if (!t) return null;
  return CRYPTO_COINS.find(c => c[0].toLowerCase() === t || c[1].toLowerCase() === t || c[2].includes(t))
    || CRYPTO_COINS.find(c => new RegExp(`\\b(${c[2].map(escRe).join('|')}|${c[0].toLowerCase()})\\b`).test(t) && t.split(/\s+/).length <= 3)
    || null;
}
function isCryptoAcct(a) { return a?.type === 'crypto'; }
function coinHoldings(sym) {
  const s = String(sym || '').toUpperCase();
  return state.holdings.filter(h => h.symbol === s && !h.private && isCryptoAcct(acctById(h.accountId)) && !acctById(h.accountId)?.archived);
}
function coinName(sym) { const c = coinBySymbol(sym); return c ? c[1] : (coinHoldings(sym).find(h => h.name)?.name || String(sym).toUpperCase()); }
/* Every coin held in a Cryptocurrency account, with its amount, price and value */
function cryptoHeld() {
  const by = {};
  for (const h of state.holdings) {
    const a = acctById(h.accountId);
    if (!isCryptoAcct(a) || a.archived || h.private) continue;
    const x = by[h.symbol] ||= { symbol: h.symbol, name: '', amount: 0, value: 0, price: h.price, priceDate: h.priceDate || '', holdings: [] };
    x.amount += +h.shares || 0; x.value += holdingValue(h); x.holdings.push(h);
    if ((h.priceDate || '') > (x.priceDate || '')) { x.price = h.price; }
    if (!x.priceDate || (h.priceDate || '') < x.priceDate) x.priceDate = h.priceDate || '';   // the oldest, so a stale one shows
  }
  return Object.values(by).map(x => ({ ...x, name: coinName(x.symbol) })).sort((a, b) => b.value - a.value);
}
/* One price for a coin, in every Cryptocurrency account that holds it */
function setCoinPrice(sym, price, date = today()) {
  const hs = coinHoldings(sym);
  for (const h of hs) { h.price = price; h.priceDate = date; }
  return hs.length;
}
function cryptoStale(days = CRYPTO_STALE_DAYS) { return cryptoHeld().filter(c => !c.priceDate || daysBetween(c.priceDate, today()) > days); }

/* Prices under a dollar keep their digits ($0.000012), so a coin like Shiba Inu doesn't show as $0.00 */
function priceFmt(p) {
  const n = Number(p);
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1 || n === 0) return money(n);
  const dec = Math.min(10, Math.max(2, Math.ceil(-Math.log10(Math.abs(n))) + 3));
  const [whole, frac = ''] = Math.abs(n).toFixed(dec).split('.');
  return (n < 0 ? '−' : '') + '$' + whole + '.' + frac.replace(/0+$/, '').padEnd(2, '0');   // at least cents: $0.50
}
function amountFmt(n, crypto) { return (+n || 0).toLocaleString('en-US', { maximumFractionDigits: crypto ? 8 : 4 }); }

/* ---- Talk and Check-in: "bitcoin is 62,000", "BTC at 62k", "ethereum price 2,450 and solana 140" ---- */
function coinMentions() {   // coins you hold, with every way of saying them, longest first
  const out = [];
  for (const c of cryptoHeld()) {
    const known = coinBySymbol(c.symbol);
    const words = new Set([c.symbol.toLowerCase(), ...(known ? known[2] : []), c.name.toLowerCase()]);
    for (const w of words) if (w.length >= 2) out.push({ symbol: c.symbol, word: w });
  }
  return out.sort((a, b) => b.word.length - a.word.length);
}
function coinParse(text) {
  const s = String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/,(?=\d{3}\b)/g, '').trim();
  if (!s || /\b(my|our|i have|i own|we have|we own|i bought|i sold|bought|sold|account|wallet|holdings?|balance|owe|transaction|charge|one is|ones are|rule)\b/.test(s)) return null;
  const ments = coinMentions(); if (!ments.length) return null;
  const changes = [];
  for (const seg of s.split(/\s*(?:\band\b|;|,\s*(?=[a-z]))\s*/)) {
    const hit = ments.find(m => new RegExp(`(^|[^a-z])${coinRe(m.word)}([^a-z]|$)`).test(seg));
    if (!hit) continue;
    const at = new RegExp(`(^|[^a-z])${coinRe(hit.word)}(?=[^a-z]|$)`).exec(seg);
    const rest = seg.slice(at.index + at[1].length + hit.word.length);
    const m = rest.match(/^\s*(?:'s\s+)?(?:price\s*)?(?:is\s+|at\s+|@\s*|=\s*|:\s*|to\s+|now\s+|worth\s+|trading\s+at\s+|currently\s+|going for\s+)*\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?\b\s*(?:a coin|per coin|each)?\s*$/);
    if (!m) { if (/\d/.test(rest)) return null; continue; }
    let n = parseFloat(m[1]); if (/^(k|thousand)$/.test(m[2] || '')) n *= 1e3; else if (/^(m|million)$/.test(m[2] || '')) n *= 1e6;
    if (!(n > 0)) return null;
    const cur = cryptoHeld().find(c => c.symbol === hit.symbol);
    changes.push({ coin: hit.symbol, field: 'coinPrice', from: cur?.price, to: n, ...(cur && Math.abs(cur.price - n) < 1e-12 ? { same: true } : {}) });
  }
  return changes.length ? { changes, pending: [] } : null;
}
/* what a price change does to each account's value, for the confirm card */
function coinEffects(sym, price) {
  return coinHoldings(sym).map(h => ({ acct: acctById(h.accountId)?.name || '', amount: +h.shares || 0, from: holdingValue(h), to: (+h.shares || 0) * price }));
}
