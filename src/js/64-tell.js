/* ================= Adding accounts and properties by talking =================
   In Check-in's answer box (typed or dictated): "add a checking account at Chase ending 4321 with 12,400 for Julissa",
   "add a property, our home, worth 650,000, with a mortgage of 310,000 at 6.25 percent". Ọrọ̀ fills in what it heard,
   asks for what's missing one question at a time, shows everything before adding, then asks what to do about
   transactions. Everything is understood on the device from a small set of patterns. */
const TELL_TYPES = [
  ['loan', /\b(heloc|home equity( line| loan)?|student loans?|auto loans?|car loans?|car payment|personal loans?|line of credit)\b/],
  ['mortgage', /\bmortgage\b/],
  ['hsa', /\b(hsa|health savings)\b/],
  ['education', /\b(529|utma|ugma|custodial|coogan|college (fund|savings))\b/],
  ['retirement', /\b(401 ?k|403 ?b|457|ira|roth|rollover|sep|pension|retirement|tsp|thrift savings)\b/],
  ['savings', /\b(savings|money market|high[- ]yield|cd|certificate of deposit)\b/],
  ['checking', /\bchecking\b/],
  ['credit', /\b(credit cards?|card|amex|american express|visa|mastercard|sapphire)\b/],
  ['crypto', /\b(crypto(currency|currencies)?|bitcoin|ethereum|coinbase|kraken|gemini|crypto\.com|cold wallet|hardware wallet|ledger wallet|trezor)\b/],
  ['private', /\b(private (investment|equity)|pre[- ]?ipo|angel investment|secondary)\b/],
  ['brokerage', /\b(brokerage|investment account|taxable account|individual account|trading account|stock account)\b/],
  ['realestate', /\b(property|house|home|condo|townhouse|town home|rental|duplex|two[- ]flat|three[- ]flat|real estate|land|cabin|vacation home)\b/],
  ['vehicle', /\b(car|truck|suv|vehicle|van|motorcycle|boat)\b/],
  ['loan', /\bloan\b/],
];
const TELL_TYPE_WORDS = { checking: 'checking', savings: 'savings', credit: 'credit card', brokerage: 'brokerage', retirement: 'retirement', education: '529 or custodial', hsa: 'HSA', crypto: 'crypto', private: 'private investment', realestate: 'property', vehicle: 'vehicle', mortgage: 'mortgage', loan: 'loan', otherAsset: 'other asset', otherLiability: 'other debt' };
const TELL_INSTITUTIONS = ['Charles Schwab', 'Schwab', 'Chase', 'JPMorgan', 'Fidelity', 'Vanguard', 'Bank of America', 'Wells Fargo', 'Citibank', 'Citi', 'Capital One', 'American Express', 'Amex', 'Discover', 'BMO', 'PNC', 'US Bank', 'U.S. Bank',
  'Ally', 'Marcus', 'Goldman Sachs', 'Robinhood', 'E*Trade', 'E-Trade', 'Etrade', 'Merrill Lynch', 'Merrill', 'Morgan Stanley', 'Coinbase', 'SoFi', 'Wealthfront', 'Betterment', 'TD Bank', 'Huntington', 'Fifth Third', 'Citizens',
  'Navy Federal', 'USAA', 'Kraken', 'Gemini', 'River', 'Strike', 'Cash App', 'Crypto.com', 'Binance.US', 'Ledger', 'Trezor', 'Apple', 'Synchrony', 'Barclays', 'Northern Trust', 'Wintrust', 'Alliant', 'Associated Bank', 'Mr. Cooper', 'Mr Cooper', 'Rocket Mortgage', 'Guaranteed Rate', 'Truist', 'Regions', 'KeyBank', 'Santander',
  'HSBC', 'Interactive Brokers', 'T. Rowe Price', 'T Rowe Price', 'Empower', 'John Hancock', 'Voya', 'TIAA', 'Nelnet', 'Navient', 'Mohela', 'Toyota Financial', 'Honda Financial', 'Ford Credit', 'Tesla', 'PayPal', 'Venmo'];
const TELL_CANON = { 'Schwab': 'Charles Schwab', 'Citibank': 'Citi', 'Amex': 'American Express', 'U.S. Bank': 'US Bank', 'E-Trade': 'E*Trade', 'Etrade': 'E*Trade', 'Merrill': 'Merrill Lynch', 'Mr Cooper': 'Mr. Cooper', 'T Rowe Price': 'T. Rowe Price' };
const tellLedgerType = t => !!ACCOUNT_TYPES[t]?.ledger;
const tellInvestType = t => ACCOUNT_TYPES[t]?.bucket === 'invest';
const tellDebtType = t => ACCOUNT_TYPES[t]?.side === 'liability';
const TELL_ADD = /^(?:(?:can you|could you|please|let'?s|i want to|i'?d like to|i need to)\s+)*(add|new|create|set up|open|track)\b/;

function tellFindType(s) { for (const [t, re] of TELL_TYPES) if (re.test(s)) return t; return null; }
function tellFindInstitution(raw) {
  const low = ' ' + raw.toLowerCase().replace(/[^a-z0-9*.&' -]/g, ' ') + ' ';
  const hit = TELL_INSTITUTIONS.filter(n => new RegExp(`[^a-z]${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(low)).sort((a, b) => b.length - a.length)[0];
  if (hit) return TELL_CANON[hit] || hit;
  const m = raw.match(/\b(?:at|with|from|through)\s+((?:[A-Z][\w&'.-]*)(?:\s+(?:[A-Z][\w&'.-]*|of|and|&))*)/);   // "at Wintrust Bank": capitalized words
  return m && !/^(The|My|Our|A|An)$/.test(m[1]) ? m[1].replace(/\s+(of|and|&)$/, '') : null;
}
/* Everything one sentence says about a new account, as fields (only what was said) */
function tellParse(raw, d = null) {
  const out = {};
  let s = ' ' + String(raw || '').replace(/[’‘]/g, "'").replace(/\(k\)/gi, 'k').replace(/\s+/g, ' ') + ' ';
  const low = () => s.toLowerCase();
  // name: "called …" / "named …"
  const nm = s.match(/\b(?:called|named|call it|name it)\s+["“]?(.+?)["”]?(?=,|\.\s|\s+(?:with|ending|balance|worth|valued|for|owned|at \$|and it|it'?s|that|which)\b|\s*$)/i);
  if (nm) { out.name = nm[1].trim().replace(/[.,]$/, ''); s = s.replace(nm[0], ' '); }
  // a street address names a property: "at 1849 Weeg Way"
  const addr = s.match(/\b(?:at|on)\s+(\d{2,6}\s+[A-Za-z][\w.]*(?:\s+(?!worth|valued|with|for|and)[A-Za-z][\w.]*){0,3})/) || s.match(/^\s*()(\d{2,6}\s+[A-Za-z][\w.]*(?:\s+(?!worth|valued|with|for|and)[A-Za-z][\w.]*){0,3})(?=\s*(?:,|$))/);
  if (addr && addr[2]) addr[1] = addr[2];
  if (addr) { out.address = addr[1].trim(); s = s.replace(addr[0], ' '); }
  // last 4: "ending 4321", "ending in 4321", "last four 4321", "x4321"
  const l4 = s.match(/\b(?:ending(?:\s+in)?|last\s+(?:four|4)(?:\s+digits)?(?:\s+(?:are|is))?|account number ending(?:\s+in)?)\s*(?:are|is)?\s*(\d{4})\b|\bx(\d{4})\b/i);
  if (l4) { out.last4 = l4[1] || l4[2]; s = s.replace(l4[0], ' '); }
  // the mortgage part of a property sentence: "with a mortgage of 310,000 at 6.25 percent with Chase"
  const t0 = tellFindType(low());
  if ((t0 === 'mortgage' || /\bmortgage\b/i.test(s)) && /\b(property|house|home|condo|townhouse|rental|duplex|flat|real estate|cabin)\b/i.test(s.split(/mortgage/i)[0])) {
    const i = s.toLowerCase().indexOf('mortgage');
    let before = s.slice(0, i), after = s.slice(i + 8);
    const worth = after.match(/\b(?:worth|valued at|value(?:\s+is|\s+of)?)\s*(?:about\s+)?\$?\s*[\d,]+(?:\.\d+)?\s*(?:k|thousand|million|m)?\b/i);   // "…mortgage of 310,000, worth 650,000"
    if (worth) { after = after.replace(worth[0], ' '); before += ' ' + worth[0]; }
    out.type = 'realestate'; out.mortgage = !/\b(no|without|paid off|free and clear)\s+(a\s+)?$/i.test(before.replace(worth ? worth[0] : '\u0000', '').trim().split(/\s+/).slice(-3).join(' ') + ' ');
    if (!out.mortgage) before += ' ' + after;
    if (out.mortgage) {
      const rate = after.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i); if (rate) out.mortRate = parseFloat(rate[1]);
      const pay = after.match(/\b(?:payment|paying|pay)\s*(?:is|of)?\s*\$?\s*([\d,]+(?:\.\d+)?\s*(?:k|thousand)?)/i); if (pay) out.mortPayment = ciNumber(pay[1]);
      const lender = tellFindInstitution(after.replace(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i, ' ')); if (lender) out.mortLender = lender;
      const owed = ciNumber(after.replace(rate ? rate[0] : '\u0000', ' ').replace(pay ? pay[0] : '\u0000', ' '));
      if (owed != null && Math.abs(owed) >= 100) out.mortOwed = Math.abs(owed);
    }
    s = before;
  }
  const type = out.type || tellFindType(low());
  if (type) out.type = type;
  if (type === 'realestate' && /\b(rental|rent it|tenants?|investment property|duplex|two[- ]flat|three[- ]flat|multi[- ]?unit)\b/i.test(raw)) out.rental = true;
  if (type === 'realestate' && /\b(our|my|the family|primary)\s+(home|house|residence)\b/i.test(raw) && !out.name) out.name = 'Home';
  if (type === 'realestate' && out.mortgage == null && /\b(paid off|free and clear|no mortgage|without a mortgage|own it outright)\b/i.test(raw)) out.mortgage = false;
  // rate and payment (loans)
  const rate = s.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (rate) { out.rate = parseFloat(rate[1]); s = s.replace(rate[0], ' '); }
  const pay = s.match(/\b(?:monthly payment|payment|paying|pay)\s*(?:is|of)?\s*\$?\s*([\d,]+(?:\.\d+)?\s*(?:k|thousand)?)/i);
  if (pay) { out.payment = ciNumber(pay[1]); s = s.replace(pay[0], ' '); }
  const inst = tellFindInstitution(s); if (inst) out.institution = inst;
  const who = ciFindPerson(s.replace(/\b(called|named)\b.*$/i, '')); if (who) out.owner = who.id;
  // the balance or value: the first amount left, with account-type numbers (401k, 529…) taken out
  const rest = s.replace(/\b(401 ?k|403 ?b|457 ?b?|529)\b/gi, ' ').replace(/\b(19|20)\d{2}\b(?!,)/g, ' ');
  const zero = /\b(zero|nothing|empty|no balance|brand new|new account)\b/i.test(rest);
  const kw = rest.match(/\b(?:worth|valued at|value(?:\s+is|\s+of)?|balance(?:\s+is|\s+of)?|owes?|owed|owing|has|with)\s*(?:about\s+|around\s+|roughly\s+)?(\$?\s*[\d,]+(?:\.\d+)?\s*(?:k|thousand|million|m)?)\b/i);
  const n = kw ? ciNumber(kw[1]) : ciNumber(rest);
  if (n != null && (Math.abs(n) >= 1 || /\$\s*0\b|\b0 dollars/.test(rest))) out.balance = Math.abs(n);
  else if (zero) out.balance = 0;
  return out;
}

/* ---------- what's still needed, one question at a time ---------- */
function tellQuestions(d) {
  const f = d.f, q = [], skip = k => d.skipped.includes(k);
  if (!f.type) return ['type'];
  if (f.type === 'realestate') {
    if (!f.name && !f.address) q.push('name');
    if (f.balance == null) q.push('value');
    if (members().length > 1 && !f.owner) q.push('owner');
    if (f.rental == null) q.push('rental');
    if (f.mortgage == null) q.push('mortgage');
    if (f.mortgage) {
      if (f.mortOwed == null) q.push('mortOwed');
      if (!f.mortLender && !skip('mortLender')) q.push('mortLender');
      if (f.mortRate == null && !skip('mortRate')) q.push('mortRate');
      if (f.mortPayment == null && !skip('mortPayment')) q.push('mortPayment');
    }
    return q;
  }
  if (!f.name && !f.institution && !skip('institution')) q.push('institution');
  if (members().length > 1 && !f.owner) q.push('owner');
  if (f.balance == null) q.push(tellDebtType(f.type) && f.type !== 'credit' ? 'owed' : 'balance');
  if ((tellLedgerType(f.type) || (tellInvestType(f.type) && f.type !== 'crypto')) && !f.last4 && !skip('last4')) q.push('last4');   // wallets don't have account numbers
  if (['mortgage', 'loan'].includes(f.type)) {
    if (f.rate == null && !skip('rate')) q.push('rate');
    if (f.payment == null && !skip('payment')) q.push('payment');
    const props = activeAccounts().filter(a => a.type === 'realestate' && !a.mortgageId);
    if (f.type === 'mortgage' && props.length && f.propertyId === undefined) q.push('property');
  }
  return q;
}
const TELL_OPTIONAL = new Set(['institution', 'last4', 'mortLender', 'mortRate', 'mortPayment', 'rate', 'payment']);
function tellAsk(k, d) {
  const f = d.f, debt = tellDebtType(f.type);
  return ({
    type: 'What kind is it? Checking, savings, credit card, brokerage, retirement, HSA, 529, a loan, a mortgage or a property?',
    name: 'What should I call it? Something like “Home” or the street address.',
    value: 'About what is it worth today?',
    owner: f.type === 'realestate' ? 'Whose is it?' : 'Whose account is it?',
    rental: 'Is it a rental?',
    mortgage: 'Is there a mortgage on it?',
    mortOwed: 'How much is owed on the mortgage?',
    mortLender: 'Who is the mortgage with?',
    mortRate: 'What’s the mortgage interest rate?',
    mortPayment: 'What’s the monthly principal and interest payment?',
    institution: 'Which bank or company is it with?',
    balance: f.type === 'credit' ? 'What’s the balance on the card?' : debt ? 'How much is owed?' : 'What’s the balance?',
    owed: 'How much is owed on it?',
    last4: 'What are the last 4 digits of the account number? They help match your imports.',
    rate: 'What’s the interest rate?',
    payment: 'What’s the monthly payment?',
    property: 'Which property is it on?',
  })[k] || '';
}
/* Tap answers for the current question */
function tellChips(k, d) {
  if (k === 'type') return ['checking', 'savings', 'credit', 'brokerage', 'retirement', 'hsa', 'education', 'loan', 'mortgage', 'realestate'].map(t => [t, TELL_TYPE_WORDS[t].replace(/^./, c => c.toUpperCase())]);
  if (k === 'owner') return members().map(m => [m.id, m.name]);
  if (k === 'rental' || k === 'mortgage') return [['yes', 'Yes'], ['no', 'No']];
  if (k === 'property') return [...activeAccounts().filter(a => a.type === 'realestate' && !a.mortgageId).map(a => [a.id, a.name]), ['none', 'None']];
  if (k === 'balance' || k === 'owed') return [['0', 'Zero']];
  if (TELL_OPTIONAL.has(k)) return [['skip', 'Skip']];
  return [];
}
function tellName(f) {
  if (f.name) return f.name;
  if (f.type === 'realestate') return f.address || 'Property';
  const label = (TELL_TYPE_WORDS[f.type] || 'account').replace(/^529 or custodial$/, '529');
  return f.institution ? `${f.institution} ${label}` : label.replace(/^./, c => c.toUpperCase());
}

/* ---------- the conversation ---------- */
function tellStart(text, kind) {
  const d = { step: 'fields', f: {}, skipped: [], heard: '' };
  if (kind === 'property') d.f.type = 'realestate';
  else if (kind && ACCOUNT_TYPES[kind]) d.f.type = kind;
  if (text) Object.assign(d.f, tellParse(text.replace(TELL_ADD, ' ').replace(/^\s*(a|an|my|our|the)\b/i, ' ')));
  CI.draft = d; CI.choose = null; CI.heard = '';
  return tellPrompt();
}
/* What Ọrọ̀ says next: the next question, or that it's ready */
function tellPrompt() {
  const d = CI.draft; if (!d) return '';
  if (d.step === 'tx') return txPrompt();   // Claude's suggestion for a Check-in card (67-claude.js)
  if (d.step === 'after') return tellAfterText(d);
  if (d.step === 'update') return updPrompt();
  const q = tellQuestions(d)[0];
  d.ask = q || null;
  if (q) return tellAsk(q, d);
  return `Ready to add ${tellName(d.f)}. Say “add it”, or change anything.`;
}
const TELL_YES = /^(yes|yeah|yep|yup|sure|correct|it is|there is|we do|i do|right)\b/;
const TELL_NO = /^(no|nope|nah|there isn'?t|it isn'?t|not really|none|we don'?t|paid off|free and clear)\b/;
const TELL_SKIP = /^(skip|pass|not sure|don'?t know|i don'?t know|no idea|later|leave it( blank)?|none|no)$/;
function tellAnswer(raw) {
  const d = CI.draft; if (!d) return '';
  if (d.step === 'tx') return ciTxStep(() => txAnswer(raw));
  if (d.step === 'update') return updAnswer(raw);
  const s = String(raw).toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, '').trim();
  if (/^(cancel|never ?mind|stop|forget it|don'?t add it|scratch that)$/.test(s)) { CI.draft = null; CI.heard = 'OK, nothing was added.'; return CI.heard; }
  if (d.step === 'after') return tellAfterAnswer(s);
  const f = d.f, k = d.ask;
  if (!k && /^(yes|yep|yeah|sure|ok(ay)?|add it|add|save( it)?|looks good|sounds good|that'?s (it|right|good)|correct|do it|go ahead|done)\b/.test(s)) return tellCommit();
  let took = false;
  if (['type', 'name', 'value', 'institution', 'owner', 'balance', 'owed'].includes(k)) {
    const more = tellParse(raw);
    if (f.type && more.type && more.type !== f.type && !(k === 'type')) delete more.type;
    if (Object.keys(more).length >= 2) { Object.assign(f, more); CI.heard = ''; return tellPrompt(); }
  }
  if (k === 'type') { const t = tellFindType(s); if (t) { f.type = t; took = true; } }
  else if (k === 'owner') { const p = ciFindPerson(raw); if (p) { f.owner = p.id; took = true; } else if (/\b(both|us|shared|joint|family)\b/.test(s) && members().some(m => m.id === 'joint')) { f.owner = 'joint'; took = true; } }
  else if (['value', 'balance', 'owed', 'mortOwed', 'mortPayment', 'payment'].includes(k)) {
    if (TELL_OPTIONAL.has(k) && TELL_SKIP.test(s)) { d.skipped.push(k); took = true; }
    else if (k !== 'value' && /^(zero|nothing|none|0|paid off)$/.test(s)) { f[{ value: 'balance', owed: 'balance' }[k] || k] = 0; took = true; }
    else { const n = ciNumber(s); if (n != null) { f[{ value: 'balance', owed: 'balance' }[k] || k] = Math.abs(n); took = true; } }
  }
  else if (k === 'rate' || k === 'mortRate') {
    if (TELL_SKIP.test(s)) { d.skipped.push(k); took = true; }
    else { const n = ciNumber(s.replace(/percent|%/g, '')); if (n != null && n < 30) { f[k] = n; took = true; } }
  }
  else if (k === 'last4') {
    const m = s.replace(/\s+/g, '').match(/\d{4}/);
    if (m) { f.last4 = m[0]; took = true; } else if (TELL_SKIP.test(s)) { d.skipped.push(k); took = true; }
  }
  else if (k === 'institution' || k === 'mortLender') {
    if (TELL_SKIP.test(s)) { d.skipped.push(k); took = true; }
    else { const inst = tellFindInstitution(raw) || raw.replace(/^(it'?s |with |at |the )+/i, '').replace(/[.!?]+$/, '').trim(); if (inst) { f[k] = (TELL_CANON[inst] || inst).replace(/^./, c => c.toUpperCase()); took = true; } }
  }
  else if (k === 'name') { const n = raw.replace(/^(call it|name it|it'?s|its|let'?s call it)\s+/i, '').replace(/[.!?]+$/, '').trim(); if (n) { f.name = n.replace(/^./, c => c.toUpperCase()); took = true; } }
  else if (k === 'rental') { if (TELL_YES.test(s) || /\brental\b/.test(s)) { f.rental = true; took = true; } else if (TELL_NO.test(s)) { f.rental = false; took = true; } }
  else if (k === 'mortgage') {
    if (TELL_NO.test(s)) { f.mortgage = false; took = true; }
    else if (TELL_YES.test(s) || /\d/.test(s)) {
      f.mortgage = true; took = true;
      const more = tellParse('property with a mortgage ' + raw.replace(TELL_YES, ' '));
      for (const x of ['mortOwed', 'mortRate', 'mortLender', 'mortPayment']) if (more[x] != null) f[x] = more[x];
    }
  }
  else if (k === 'property') {
    if (/^(none|no|not linked|neither)$/.test(s)) { f.propertyId = null; took = true; }
    else { const props = activeAccounts().filter(a => a.type === 'realestate'), hit = props.find(a => ciTokens(a.name).some(w => ciTokens(raw).includes(w))); if (hit) { f.propertyId = hit.id; took = true; } }
  }
  // corrections anywhere: "call it Chase Sapphire", "the balance is 13,000", "it's for Julissa", "it's a savings account"
  if (!took) {
    const more = tellParse(raw);
    const keys = Object.keys(more).filter(x => !(x === 'type' && f.type && more.type === 'realestate' && f.type !== 'realestate'));
    for (const x of keys) f[x] = more[x];
    took = keys.length > 0;
  }
  if (!took) { CI.heard = `I didn’t catch that. ${tellAsk(k, d) || 'Say “add it”, or change something.'}`; return CI.heard; }
  CI.heard = '';
  return tellPrompt();
}
function tellChip(v) {
  const d = CI.draft; if (!d) return '';
  const k = d.ask;
  if (v === 'skip') { d.skipped.push(k); return tellPrompt(); }
  if (k === 'type') d.f.type = v;
  else if (k === 'owner') d.f.owner = v;
  else if (k === 'rental') d.f.rental = v === 'yes';
  else if (k === 'mortgage') d.f.mortgage = v === 'yes';
  else if (k === 'property') d.f.propertyId = v === 'none' ? null : v;
  else if (k === 'balance' || k === 'owed') d.f.balance = 0;
  return tellPrompt();
}
/* Add it, the same way the account dialog does */
function tellCommit() {
  const d = CI.draft; if (!d) return '';
  const f = d.f, need = tellQuestions(d).filter(k => !TELL_OPTIONAL.has(k));
  if (need.length) return tellPrompt();
  const T = ACCOUNT_TYPES[f.type], name = tellName(f);
  const rec = { id: uid(), name, type: f.type, institution: f.institution || '', last4: f.last4 || '', notes: '', forecast: !!T.forecast, ledger: !!T.ledger, owner: f.owner || (members().some(m => m.id === 'joint') ? 'joint' : members()[0]?.id) };
  if (T.bucket === 'invest') rec.assetClass = f.type === 'crypto' ? 'Crypto' : 'US stocks';
  if (T.bucket === 'debt') { rec.rate = f.rate ?? null; rec.minPayment = f.payment ?? null; }
  let mort = null;
  if (f.type === 'realestate') {
    const groups = [...new Set(state.categories.filter(c => c.rental).map(c => c.group))];
    Object.assign(rec, { mortgageId: null, rental: !!f.rental, rentalGroup: groups[0] || 'Rental property', cashInvested: null, units: null, buildingBasis: null, placedInService: null });
    if (f.mortgage && f.mortOwed) {
      mort = { id: uid(), name: `${name} mortgage`, type: 'mortgage', institution: f.mortLender || '', owner: rec.owner, balance: round2(Math.abs(f.mortOwed)), balanceDate: today(),
        rate: f.mortRate ?? null, minPayment: f.mortPayment ? round2(Math.abs(f.mortPayment)) : null, forecast: false, ledger: false };
      rec.mortgageId = mort.id;
    }
  }
  const val = round2(Math.abs(Number(f.balance) || 0));
  rec.balance = val; rec.balanceDate = today();
  if (rec.ledger) { rec.anchorBalance = val; rec.anchorDate = today(); }
  state.accounts.push(rec);
  if (mort) state.accounts.push(mort);
  if (f.type === 'mortgage' && f.propertyId) { const p = acctById(f.propertyId); if (p) p.mortgageId = rec.id; }
  commit({ silent: true });
  const bits = [members().length > 1 ? memberName(rec.owner) : '', money(val, { cents: val % 1 > 0.004 }) + (f.type === 'realestate' ? ' value' : ''), rec.last4 ? `ending ${rec.last4}` : ''].filter(Boolean);
  CI.last = { text: `Added ${name} (${bits.join(', ')})${mort ? ` and ${mort.name} (${money(mort.balance, { cents: false })} owed)` : ''}.`, undo: true, n: 0 };
  CI.draft = { step: 'after', added: rec.id, mort: mort?.id || null };
  return CI.last.text + ' ' + tellAfterText(CI.draft);
}

/* ---------- after adding: what about transactions ---------- */
function tellAfterText(d) {
  const a = acctById(d.added); if (!a) return '';
  if (d.mort || LOAN_TYPES.has(a.type)) return `Want Ọrọ̀ to follow the ${d.mort ? 'mortgage ' : ''}payments from your bank imports, so the balance comes down on its own?`;
  if (a.type === 'realestate') return 'That’s it. Update the value now and then from Accounts › Update balances.';
  if (a.type === 'crypto') return `Add the coins ${a.name} holds (like 0.5 bitcoin) so its value follows their prices, or keep the balance updated by hand?`;
  if (tellInvestType(a.type)) return `${a.name} has no holdings yet. Import a positions file from the brokerage, or keep the balance updated by hand?`;
  if (a.ledger) return `${a.name} has no transactions yet. Import a file now, or keep the balance updated by hand?`;
  return 'That’s it.';
}
function tellAfterAnswer(s) {
  const d = CI.draft, a = acctById(d.added);
  if (!a) { CI.draft = null; return ''; }
  if (a.type === 'crypto' && /\b(coins?|add (them|it|coins)|bitcoin|ethereum|yes|sure)\b/.test(s)) return tellAfter('coins');
  if (/\b(import|upload|file)\b/.test(s)) return tellAfter('import');
  if (/\b(by hand|manual|manually|myself|i'?ll update|hand)\b/.test(s)) return tellAfter('hand');
  if (/\b(follow|track|yes|sure|set (it )?up)\b/.test(s) && (d.mort || LOAN_TYPES.has(a.type))) return tellAfter('track');
  if (/\b(edit|change|details|more)\b/.test(s)) return tellAfter('edit');
  if (/\b(another|one more|add)\b/.test(s)) return tellAfter('another');
  if (/^(no|later|done|that'?s it|not now|skip|ok|okay|thanks?|thank you)\b/.test(s)) return tellAfter('done');
  CI.heard = `I didn’t catch that. ${tellAfterText(d)}`; return CI.heard;
}
function tellAfter(what) {
  const d = CI.draft, a = d && acctById(d.added);
  CI.draft = null;
  if (!a) return '';
  if (what === 'import') { startImport(); return ''; }
  if (what === 'coins') { holdingModal(null, a.id); return ''; }
  if (what === 'hand') {
    if (a.ledger) { a.ledger = false; delete a.anchorBalance; delete a.anchorDate; commit({ silent: true }); }
    CI.last = { text: `OK. Ọrọ̀ will ask for ${a.name}’s balance when it’s more than ${state.settings.staleDays || 35} days old.`, undo: false };
    return CI.last.text;
  }
  if (what === 'track') { loanModal(d.mort || a.id); return ''; }
  if (what === 'edit') { acctModal(a.id); return ''; }
  if (what === 'another') return tellStart('', a.type === 'realestate' ? 'property' : '');
  return '';
}

/* ---------- the card ---------- */
function tellCardHtml() {
  const d = CI.draft; if (!d) return '';
  if (d.step === 'tx') return txCardHtml();
  if (d.step === 'update') return updCardHtml();
  if (d.step === 'after') {
    const a = acctById(d.added); if (!a) return '';
    const loan = d.mort || LOAN_TYPES.has(a.type), acts = [];
    if (loan) acts.push('<button class="btn primary" data-ci="tell-track">Follow the payments</button>');
    else if (a.ledger) acts.push('<button class="btn primary" data-ci="tell-import">Import a file</button>', '<button class="btn" data-ci="tell-hand">Keep the balance by hand</button>');
    else if (a.type === 'crypto') acts.push('<button class="btn primary" data-ci="tell-coins">Add coins</button>', '<button class="btn" data-ci="tell-hand">Balance by hand is fine</button>');
    else if (tellInvestType(a.type)) acts.push('<button class="btn primary" data-ci="tell-import">Import positions</button>', '<button class="btn" data-ci="tell-hand">Balance by hand is fine</button>');
    acts.push('<button class="btn" data-ci="tell-edit">Edit details</button>', '<button class="btn ghost" data-ci="tell-another">Add another</button>');
    return `<section class="panel ci-card tell-card"><div class="ci-top"><span class="ci-kicker">Added</span></div>
      <h2 class="ci-title">${esc(a.name)}</h2><p class="ci-guess">${esc(tellAfterText(d))}</p>
      <div class="ci-actions">${acts.join('')}</div>
      <div class="ci-foot"><button class="btn ghost" data-ci="tell-done">Done</button></div></section>`;
  }
  const f = d.f, k = d.ask, q = tellQuestions(d), ready = !q.some(x => !TELL_OPTIONAL.has(x)) && !k;
  const debt = f.type && tellDebtType(f.type) && f.type !== 'realestate';
  const rows = [
    ['Type', f.type ? (ACCOUNT_TYPES[f.type]?.label || f.type) + (f.type === 'realestate' && f.rental ? ', rental' : '') : ''],
    ['Name', f.type ? tellName(f) : ''],
    ['At', f.institution || ''],
    members().length > 1 ? ['Owner', f.owner ? memberName(f.owner) : ''] : null,
    [f.type === 'realestate' ? 'Worth' : debt ? 'Owed' : 'Balance', f.balance != null ? money(f.balance, { cents: f.balance % 1 > 0.004 }) : ''],
    (tellLedgerType(f.type) || tellInvestType(f.type)) ? ['Ending', f.last4 || ''] : null,
    ['mortgage', 'loan'].includes(f.type) ? ['Rate', f.rate != null ? `${f.rate}%` : ''] : null,
    ['mortgage', 'loan'].includes(f.type) ? ['Payment', f.payment != null ? money(f.payment) : ''] : null,
    f.type === 'mortgage' && f.propertyId ? ['Property', acctById(f.propertyId)?.name || ''] : null,
    f.type === 'realestate' ? ['Mortgage', f.mortgage == null ? '' : f.mortgage ? [f.mortOwed != null ? money(f.mortOwed, { cents: false }) + ' owed' : '', f.mortRate != null ? `${f.mortRate}%` : '', f.mortLender ? `with ${f.mortLender}` : ''].filter(Boolean).join(', ') || 'Yes' : 'None'] : null,
  ].filter(Boolean).filter(([l, v]) => v || l === 'Type' || (l === 'Name' && f.type));
  const chips = k ? tellChips(k, d) : [];
  return `<section class="panel ci-card tell-card"><div class="ci-top"><span class="ci-kicker">${f.type === 'realestate' ? 'Add a property' : 'Add an account'}</span></div>
    <dl class="tell-fields">${rows.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd></div>`).join('')}</dl>
    <p class="ci-guess tell-q">${esc(k ? tellAsk(k, d) : `Ready to add ${tellName(f)}.`)}</p>
    ${chips.length ? `<div class="ci-chips">${chips.map(([v, l]) => `<button class="ci-chip" data-ci="tell-chip" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>` : ''}
    <div class="ci-actions">${ready ? `<button class="btn primary" data-ci="tell-add">Add ${esc(tellName(f))}</button>` : ''}</div>
    <div class="ci-foot"><button class="btn ghost" data-ci="tell-cancel">Cancel</button>${!ready && q.length && !q.some(x => !TELL_OPTIONAL.has(x)) ? '<button class="btn ghost" data-ci="tell-add">Add it as is</button>' : ''}</div></section>`;
}
function tellClick(act, v) {
  if (act === 'tell-start') return tellStart('', v);
  if (act === 'tell-chip') return tellChip(v);
  if (act === 'tell-add') { const d = CI.draft; if (d) d.ask = null; return tellCommit(); }
  if (act === 'tell-cancel') { const upd = CI.draft?.step === 'update'; CI.draft = null; return upd ? 'OK, nothing was changed.' : 'OK, nothing was added.'; }
  if (act === 'tell-pick') { if (v) return updPick(v); const d = CI.draft; d?.pending.shift(); if (d && !d.changes.length && !d.pending.length) { CI.draft = null; return 'OK, nothing was changed.'; } return updPrompt(); }
  if (act === 'tell-save') return updApply();
  if (act === 'tell-import') return tellAfter('import');
  if (act === 'tell-coins') return tellAfter('coins');
  if (act === 'tell-hand') return tellAfter('hand');
  if (act === 'tell-track') return tellAfter('track');
  if (act === 'tell-edit') return tellAfter('edit');
  if (act === 'tell-another') return tellAfter('another');
  if (act === 'tell-done') return tellAfter('done');
  return '';
}

/* ---------- existing accounts with something missing ---------- */
function ciGaps() {
  return memo('ci:gaps', () => {
    const out = [];
    for (const a of activeAccounts()) {
      const key = what => `gap:${a.id}:${what}`, quiet = what => ciQuiet(key(what));
      const txs = txByAccount(a.id), holds = holdingsFor(a.id).length;
      if (a.ledger && !txs.length && !quiet('notx')) out.push({ id: key('notx'), key: key('notx'), kind: 'gap', what: 'notx', accountId: a.id });
      else if (!a.ledger && !holds && !txs.length && !isTrackedLoan(a) && !(Math.abs(Number(a.balance)) > 0) && !quiet('balance')) out.push({ id: key('balance'), key: key('balance'), kind: 'gap', what: a.type === 'realestate' ? 'value' : 'balance', accountId: a.id });
      if (LOAN_TYPES.has(a.type) && Math.abs(Number(a.balance)) > 0 && (a.rate == null || a.rate === '' || isNaN(a.rate)) && !quiet('rate')) out.push({ id: key('rate'), key: key('rate'), kind: 'gap', what: 'rate', accountId: a.id });
    }
    return out;
  });
}
function gapCardHtml(item, q, head, foot) {
  const a = acctById(item.accountId); if (!a) return '';
  const meta = `${esc(ACCOUNT_TYPES[a.type]?.label || '')}${members().length > 1 ? ` · ${esc(memberName(a.owner || 'joint'))}` : ''}`;
  const input = (ph, label) => `<form class="ci-bal" data-ci-bal><input id="ci-bal" inputmode="decimal" placeholder="${ph}" aria-label="${label}" autocomplete="off"><button class="btn primary" type="submit">Save</button></form>`;
  const body = (title, html, actions) => `<section class="panel ci-card" data-ci-item="${esc(item.id)}">${head}<h2 class="ci-title">${esc(a.name)}</h2><p class="ci-meta">${meta}</p>${html}<div class="ci-actions">${actions}</div>${foot('')}</section>`;
  if (item.what === 'notx') return body('', `<p class="ci-guess">No transactions yet${Math.abs(Number(a.balance)) > 0 ? '' : ', and no balance'}.</p>`,
    '<button class="btn primary" data-ci="import">Import a file</button><button class="btn" data-ci="hand">Keep the balance by hand</button>');
  if (item.what === 'balance' || item.what === 'value') return body('', `<p class="ci-guess">${item.what === 'value' ? 'No value yet. About what is it worth?' : 'No balance yet. What is it?'}</p>${input(item.what === 'value' ? 'What it’s worth' : 'Balance today', 'Balance')}`,
    `<button class="btn" data-ci="not-needed">${item.what === 'value' ? 'Leave it' : 'It’s zero'}</button>`);
  if (item.what === 'rate') return body('', `<p class="ci-guess">No interest rate yet. It’s used for the payoff date and the schedule.</p>${input('Rate, like 6.25', 'Interest rate')}`, '<button class="btn" data-ci="not-needed">I don’t know</button>');
  return '';
}
function gapSpeech(item) {
  const a = acctById(item.accountId); if (!a) return '';
  if (item.what === 'notx') return `${a.name} has no transactions yet. Import a file, or keep the balance by hand?`;
  if (item.what === 'value') return `${a.name} doesn’t have a value yet. About what is it worth?`;
  if (item.what === 'balance') return `${a.name} doesn’t have a balance yet. What is it?`;
  if (item.what === 'rate') return `What’s the interest rate on ${a.name}?`;
  return '';
}
