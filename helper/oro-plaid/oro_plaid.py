#!/usr/bin/env python3
"""Ọrọ̀'s bank helper: a small program on this Mac that talks to Plaid for Ọrọ̀.

Plaid needs a secret key that must never sit inside a web page, so Ọrọ̀ asks this helper and the helper asks Plaid.
- It listens on 127.0.0.1 only, answers only Ọrọ̀'s own web address, and (except /status and /pair) only requests that
  carry the helper key. Pairing asks you first, in a Mac window.
- Plaid's sign-in window (a new bank, or signing in again) opens only after Touch ID: a passkey made on this Mac signs a
  one-time challenge, and the helper checks it (it keeps only the passkey's public key).
- The Plaid client ID and secret, the helper key and each bank connection's access token live in the Mac's Keychain
  (service "oro-plaid"), read and written with macOS's own `security` tool. Nothing else is written to disk.
- It keeps nothing about your transactions and logs only the time, the path asked for and the result code.
Python standard library only, Python 3.11 or newer (macOS's own /usr/bin/python3 is 3.9, past its end of life, and
is refused). Runs at login through launchd (see dev/tools/setup-plaid.sh in the private dev folder,
or install.sh here). Settings come from the environment:
  ORO_PLAID_ENV      sandbox (default) or production
  ORO_PLAID_PORT     47321 by default
  ORO_PLAID_ORIGINS  extra web addresses allowed besides https://devanaire02.github.io (comma-separated; tests only)
  ORO_PLAID_SERVICE  Keychain service for the helper key and connections (tests use their own)
  ORO_PLAID_KEYS     Keychain service holding the Plaid keys (oro-plaid; tests use a stand-in)
  ORO_PLAID_PAIR     dialog (default) or auto (tests only; refused with the real service)
  ORO_PLAID_BASE     Plaid's address (tests point it at a stand-in)
"""
import base64, hashlib, hmac, json, os, secrets, subprocess, sys, threading, time, urllib.error, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MIN_PYTHON = (3, 11)   # older versions no longer get security fixes; install.sh picks one at least this new
if sys.version_info < MIN_PYTHON:
    sys.exit(f'The bank helper needs Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]} or newer, and this is {sys.version.split()[0]}. '
             'Install one with Homebrew (brew install python), then run install.sh again.')

VERSION = '1'
ENV = os.environ.get('ORO_PLAID_ENV', 'sandbox')
PORT = int(os.environ.get('ORO_PLAID_PORT', '47321'))
KEYS = os.environ.get('ORO_PLAID_KEYS', 'oro-plaid')         # where you put the Plaid client ID and secrets (tests: a stand-in)
SERVICE = os.environ.get('ORO_PLAID_SERVICE', KEYS)           # helper key, this Mac's Plaid user id, connections
PAIR = os.environ.get('ORO_PLAID_PAIR', 'dialog')
ORIGINS = {'https://devanaire02.github.io'} | {o.strip() for o in os.environ.get('ORO_PLAID_ORIGINS', '').split(',') if o.strip()}
BASE = os.environ.get('ORO_PLAID_BASE') or {'sandbox': 'https://sandbox.plaid.com', 'production': 'https://production.plaid.com'}[ENV]
ALLOWED = {o: o for o in ORIGINS}   # sent back from here, never the request's own text
HOSTS = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
if PAIR == 'auto' and SERVICE == 'oro-plaid': sys.exit('ORO_PLAID_PAIR=auto is for tests and needs a separate ORO_PLAID_SERVICE')


class Problem(Exception):
    """Something to tell Ọrọ̀, in plain words: code (for the app), message (for you), HTTP status."""
    def __init__(self, code, message, status=400, **extra):
        super().__init__(message); self.code, self.message, self.status, self.extra = code, message, status, extra


# ---------- the Keychain, through macOS's `security` tool ----------
def _security(args, stdin=None):
    try:
        return subprocess.run(['/usr/bin/security'] + args, input=stdin, capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired:
        raise Problem('keychain_stuck', 'The Mac’s Keychain isn’t answering. A Keychain window may be waiting for an answer, or restarting the Mac clears it.', 503)

def kc_get(account, service=SERVICE):
    r = _security(['find-generic-password', '-s', service, '-a', account, '-w'])
    return r.stdout.rstrip('\n') if r.returncode == 0 else None

def kc_has(account, service=SERVICE):
    return _security(['find-generic-password', '-s', service, '-a', account]).returncode == 0   # without -w: the value isn't read

def kc_set(account, value, label, service=SERVICE):
    # through `security -i` so the value never appears in a command line
    for v in (service, account, label, value):
        if '"' in v or '\n' in v or '\\' in v: raise Problem('bad_value', 'That can’t be stored.', 500)
    r = _security(['-i'], stdin=f'add-generic-password -U -s "{service}" -a "{account}" -l "{label}" -w "{value}"\n')
    if r.returncode != 0 or 'error' in (r.stderr or '').lower(): raise Problem('keychain', 'Couldn’t save to the Mac’s Keychain.', 500)

def kc_del(account, service=SERVICE):
    _security(['delete-generic-password', '-s', service, '-a', account])


_cache = {}
def creds():
    """The Plaid client ID and this environment's secret (kept in memory for ten minutes)."""
    hit = _cache.get('creds')
    if hit and time.time() - hit[0] < 600: return hit[1]
    cid, sec = kc_get('client-id', KEYS), kc_get(f'{ENV}-secret', KEYS)
    if not cid or not sec:
        raise Problem('no_keys', f'The Plaid keys aren’t in this Mac’s Keychain yet (client ID and {ENV} secret).', 409)
    _cache['creds'] = (time.time(), (cid, sec))
    return cid, sec

def helper_key():
    k = kc_get('helper-key')
    if not k:
        k = secrets.token_urlsafe(32); kc_set('helper-key', k, 'Ọrọ̀ bank helper key')
    return k

def plaid_user():
    u = kc_get('client-user-id')
    if not u:
        u = 'oro-' + secrets.token_hex(8); kc_set('client-user-id', u, 'Ọrọ̀ Plaid user (no personal details)')
    return u

def items():
    """The connections on this Mac (bank names and ids, no tokens), kept in the Keychain as base64 so no quotes reach `security`."""
    try: return json.loads(base64.b64decode(kc_get(f'{ENV}-items') or 'W10=').decode())
    except ValueError: return []

def save_items(lst): kc_set(f'{ENV}-items', base64.b64encode(json.dumps(lst, separators=(',', ':')).encode()).decode(), f'Ọrọ̀ bank connections ({ENV})')

def access_token(item_id):
    if not isinstance(item_id, str) or not item_id: raise Problem('bad_request', 'Which connection?')
    t = kc_get(f'{ENV}-item:{item_id}')
    if not t: raise Problem('unknown_item', 'That bank connection isn’t on this Mac.', 404)
    return t

def remember_item(item_id, token, inst):
    kc_set(f'{ENV}-item:{item_id}', token, f'Ọrọ̀ bank connection {inst.get("name") or ""}'.strip())
    lst = [x for x in items() if x.get('item_id') != item_id] + [{'item_id': item_id, 'institution_id': inst.get('institution_id') or '', 'institution': inst.get('name') or ''}]
    save_items(lst)

def forget_item(item_id):
    kc_del(f'{ENV}-item:{item_id}')
    save_items([x for x in items() if x.get('item_id') != item_id])


# ---------- Plaid ----------
def plaid(path, body):
    cid, sec = creds()
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'PLAID-CLIENT-ID': cid, 'PLAID-SECRET': sec, 'Plaid-Version': '2020-09-14'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: err = json.loads(e.read() or b'{}')
        except ValueError: err = {}
        code = err.get('error_code') or f'HTTP_{e.code}'
        if code == 'ITEM_LOGIN_REQUIRED': raise Problem('login_required', 'This bank needs you to sign in again.', 409, plaid=code)
        if code in ('INVALID_API_KEYS', 'INVALID_SECRET', 'INVALID_CLIENT_ID'): _cache.pop('creds', None); raise Problem('bad_keys', f'Plaid didn’t accept the {ENV} keys in the Keychain.', 409, plaid=code)
        if code in ('PRODUCTS_NOT_SUPPORTED', 'PRODUCT_NOT_ENABLED', 'INVALID_PRODUCT', 'PRODUCT_NOT_READY'): raise Problem('product', 'That isn’t on your Plaid plan yet (add it in Plaid’s Dashboard).', 409, plaid=code)
        raise Problem('plaid', err.get('display_message') or 'Plaid couldn’t do that just now.', 502, plaid=code, plaid_type=err.get('error_type') or '')
    except (urllib.error.URLError, TimeoutError, OSError):
        raise Problem('offline', 'Couldn’t reach Plaid. Check the internet connection and try again.', 503)


def acct_out(a):
    b = a.get('balances') or {}
    return {'id': a.get('account_id') or a.get('id'), 'name': a.get('name') or '', 'official': a.get('official_name') or '',
            'mask': str(a.get('mask') or '')[-4:], 'type': a.get('type') or '', 'subtype': a.get('subtype') or '',
            'balance': {'current': b.get('current'), 'available': b.get('available'), 'limit': b.get('limit'),
                        'currency': b.get('iso_currency_code') or '', 'updated': b.get('last_updated_datetime') or ''}}

def tx_out(t):
    """Only what Ọrọ̀ uses. Plaid's sign is the opposite of bank files (Plaid: plus = money out), so it's flipped here."""
    c = t.get('personal_finance_category') or {}
    return {'id': t['transaction_id'], 'account': t['account_id'], 'date': t['date'], 'amount': round(-float(t['amount']), 2),
            'merchant': t.get('merchant_name') or '', 'text': t.get('original_description') or t.get('name') or '',
            'cat': [c.get('primary') or '', c.get('detailed') or ''], 'owner': t.get('account_owner') or ''}

def sync(token, cursor):
    """Everything added, changed or removed since `cursor`, all pages, restarting if the data moves underneath."""
    for _ in range(4):
        added, modified, removed, cur, status = [], [], [], cursor or '', ''
        try:
            while True:
                body = {'access_token': token, 'count': 500, 'options': {'include_original_description': True}}
                if cur: body['cursor'] = cur
                r = plaid('/transactions/sync', body)
                added += r.get('added') or []; modified += r.get('modified') or []; removed += r.get('removed') or []
                status = r.get('transactions_update_status') or status
                cur = r.get('next_cursor') or cur
                if not r.get('has_more'): break
        except Problem as e:
            if e.extra.get('plaid') == 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION': continue
            raise
        posted = lambda lst: [tx_out(t) for t in lst if not t.get('pending')]   # pending ones never come in; the posted one does
        return {'added': posted(added), 'modified': posted(modified), 'removed': [x.get('transaction_id') for x in removed if x.get('transaction_id')],
                'next_cursor': cur, 'status': status}
    raise Problem('plaid_busy', 'Plaid’s data kept changing while it was being read. Try again in a minute.', 503)

def institution_of(token):
    it = plaid('/item/get', {'access_token': token}).get('item') or {}
    iid = it.get('institution_id') or ''
    name = ''
    if iid:
        try: name = (plaid('/institutions/get_by_id', {'institution_id': iid, 'country_codes': ['US']}).get('institution') or {}).get('name') or ''
        except Problem: pass
    return {'institution_id': iid, 'name': name}


# ---------- Touch ID before Plaid's sign-in window ----------
# Ọrọ̀ makes a passkey on this Mac once (Touch ID, or the Mac's password where there's no Touch ID), and the helper
# keeps only its public key. Every Plaid sign-in window (a new bank, or signing in again) then needs a fresh Touch ID
# confirmation, signed by that passkey over a one-time challenge from this helper, so two factors stand between anyone
# and a bank connection: this Mac (the helper answers nothing else) and you (Touch ID). Checked here, where the Plaid
# secret is, with ES256 (ECDSA on the P-256 curve with SHA-256) worked out in plain Python below.
_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
_A, _B = _P - 3, 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
_G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)

def _on_curve(x, y): return 0 <= x < _P and 0 <= y < _P and (y * y - (x * x * x + _A * x + _B)) % _P == 0

def _add(p, q):
    if p is None: return q
    if q is None: return p
    if p[0] == q[0] and (p[1] + q[1]) % _P == 0: return None
    lam = (3 * p[0] * p[0] + _A) * pow(2 * p[1], -1, _P) if p == q else (q[1] - p[1]) * pow(q[0] - p[0], -1, _P)
    x = (lam * lam - p[0] - q[0]) % _P
    return x, (lam * (p[0] - x) - p[1]) % _P

def _mul(k, p):
    out = None
    while k:
        if k & 1: out = _add(out, p)
        p, k = _add(p, p), k >> 1
    return out

def _der_sig(d):
    """An ECDSA signature as WebAuthn gives it (DER: SEQUENCE of two INTEGERs) -> (r, s)."""
    if len(d) < 8 or d[0] != 0x30 or d[1] != len(d) - 2: raise ValueError('signature')
    i, out = 2, []
    for _ in range(2):
        if d[i] != 0x02 or not d[i + 1] or i + 2 + d[i + 1] > len(d): raise ValueError('signature')
        out.append(int.from_bytes(d[i + 2:i + 2 + d[i + 1]], 'big')); i += 2 + d[i + 1]
    if i != len(d): raise ValueError('signature')
    return out

def es256_ok(x, y, msg, der):
    try: r, s = _der_sig(der)
    except (ValueError, IndexError): return False
    if not (1 <= r < _N and 1 <= s < _N and _on_curve(x, y)): return False
    w = pow(s, -1, _N)
    pt = _add(_mul(int.from_bytes(hashlib.sha256(msg).digest(), 'big') * w % _N, _G), _mul(r * w % _N, (x, y)))
    return pt is not None and pt[0] % _N == r

def _cbor(b, i=0):
    """Just enough CBOR to read a passkey's public key (a map of small integers and byte strings)."""
    mt, ai = b[i] >> 5, b[i] & 31; i += 1
    if ai < 24: v = ai
    elif ai <= 27: n = 1 << (ai - 24); v = int.from_bytes(b[i:i + n], 'big'); i += n
    else: raise ValueError('cbor')
    if mt == 0: return v, i
    if mt == 1: return -1 - v, i
    if mt in (2, 3):
        if i + v > len(b): raise ValueError('cbor')
        return (b[i:i + v] if mt == 2 else b[i:i + v].decode()), i + v
    if mt == 5:
        m = {}
        for _ in range(v): k, i = _cbor(b, i); m[k], i = _cbor(b, i)
        return m, i
    raise ValueError('cbor')

def _b64u(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def _unb64u(s):
    if not isinstance(s, str) or len(s) > 4096: raise ValueError('base64')
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

CHALLENGES = {}       # one-time Touch ID challenges (challenge -> (expires, purpose)); in memory only
def no_touch(): return Problem('touchid', 'Touch ID didn’t confirm it’s you, so Plaid’s window wasn’t opened. Try again.', 403)

def rp_of(origin): return urllib.parse.urlsplit(origin).hostname or ''

def touch_rec():
    try: return json.loads(base64.b64decode(kc_get('touchid') or '').decode() or 'null')
    except ValueError: return None

def touch_save(rec): kc_set('touchid', base64.b64encode(json.dumps(rec, separators=(',', ':')).encode()).decode(), 'Ọrọ̀ Touch ID passkey (public key only)')

def _take_challenge(cdj, kind, origin, purpose):
    """The browser's own record of what it signed: the right kind, Ọrọ̀'s web address, and a challenge this helper gave
    out for this purpose in the last two minutes, used once."""
    c = json.loads(cdj)
    ch = c.get('challenge') if isinstance(c, dict) else None
    with LOCK: issued = CHALLENGES.pop(ch, None) if isinstance(ch, str) else None
    if not issued or issued[0] < time.time() or issued[1] != purpose or c.get('type') != kind or c.get('origin') != origin: raise no_touch()

def _auth_data(ad, origin):
    """Signed by the passkey: made for Ọrọ̀'s web address, with you there (user present) and confirmed (Touch ID)."""
    if len(ad) < 37 or ad[:32] != hashlib.sha256(rp_of(origin).encode()).digest() or (ad[32] & 0x05) != 0x05: raise no_touch()
    return ad[32], int.from_bytes(ad[33:37], 'big')

def r_touch_challenge(req):
    purpose = req.get('purpose')
    if purpose not in ('register', 'confirm'): raise Problem('bad_request', 'Which Touch ID step?')
    rec = touch_rec()
    if purpose == 'confirm' and not rec: raise Problem('touchid_setup', 'Set up Touch ID for bank connections first.', 403)
    ch = _b64u(secrets.token_bytes(32))
    with LOCK:
        now = time.time()
        for k in [k for k, v in CHALLENGES.items() if v[0] < now]: del CHALLENGES[k]
        if len(CHALLENGES) > 50: raise Problem('busy', 'Too many Touch ID requests at once. Wait a minute and try again.', 429)
        CHALLENGES[ch] = (now + 120, purpose)
    out = {'challenge': ch, 'rp_id': rp_of(req['_origin'])}
    if purpose == 'register': out['user_id'] = _b64u(secrets.token_bytes(16))
    else: out['credential'] = rec['id']
    return out

def r_touch_register(req):
    origin = req['_origin']
    try:
        _take_challenge(_unb64u(req.get('clientDataJSON')), 'webauthn.create', origin, 'register')
        ad = _unb64u(req.get('authenticatorData'))
        flags, count = _auth_data(ad, origin)
        if not flags & 0x40 or len(ad) < 55: raise no_touch()                     # it carries the new passkey
        n = int.from_bytes(ad[53:55], 'big'); cred = ad[55:55 + n]
        key, _ = _cbor(ad, 55 + n)
        x, y = key.get(-2), key.get(-3)
        if not cred or key.get(1) != 2 or key.get(3) != -7 or key.get(-1) != 1 or not (isinstance(x, bytes) and isinstance(y, bytes) and len(x) == len(y) == 32): raise no_touch()
        x, y = int.from_bytes(x, 'big'), int.from_bytes(y, 'big')
        if not _on_curve(x, y): raise no_touch()
    except (ValueError, IndexError, KeyError, TypeError, AttributeError): raise no_touch()
    if touch_rec() and not ask('Ọrọ̀ wants to replace the Touch ID passkey that protects your bank connections on this Mac. Allow it only if you just chose Set up Touch ID in Ọrọ̀.', 'Replace'):
        raise Problem('not_allowed', 'The Touch ID passkey wasn’t replaced.', 403)
    touch_save({'id': _b64u(cred), 'x': f'{x:064x}', 'y': f'{y:064x}', 'rp': rp_of(origin), 'count': count, 'added': time.strftime('%Y-%m-%d')})
    return {'touchid': True}

def touch_confirm(req):
    """Plaid's window opens only after this: a fresh Touch ID confirmation from the passkey made on this Mac."""
    rec, a, origin = touch_rec(), req.get('touchid'), req['_origin']
    if not rec: raise Problem('touchid_setup', 'Set up Touch ID for bank connections first.', 403)
    if not isinstance(a, dict) or a.get('id') != rec['id'] or rec.get('rp') != rp_of(origin): raise no_touch()
    try:
        cdj, ad, sig = _unb64u(a.get('clientDataJSON')), _unb64u(a.get('authenticatorData')), _unb64u(a.get('signature'))
        _take_challenge(cdj, 'webauthn.get', origin, 'confirm')
        _, count = _auth_data(ad, origin)
    except (ValueError, TypeError, AttributeError): raise no_touch()
    if not es256_ok(int(rec['x'], 16), int(rec['y'], 16), ad + hashlib.sha256(cdj).digest(), sig): raise no_touch()
    if (count or rec.get('count')) and count <= rec.get('count', 0): raise no_touch()   # a copied passkey (its counter went back)
    if count: rec['count'] = count; touch_save(rec)


# ---------- what Ọrọ̀ can ask ----------
LINKS = {}            # link tokens this helper made (link_token -> {update, done}); in memory only
LOCK = threading.Lock()

def r_status(_):
    return {'ok': True, 'helper': 'oro-plaid', 'version': VERSION, 'env': ENV,
            'keys': kc_has('client-id', KEYS) and kc_has(f'{ENV}-secret', KEYS), 'paired': kc_has('helper-key'), 'touchid': kc_has('touchid')}

def ask(msg, yes='Allow'):
    """A yes-or-no question in a Mac window (tests: ORO_PLAID_PAIR=auto answers yes)."""
    if PAIR == 'auto': return True
    script = f'display dialog "{msg}" buttons {{"Don’t Allow", "{yes}"}} default button "{yes}" cancel button "Don’t Allow" with title "Ọrọ̀ bank helper" giving up after 120'
    try: r = subprocess.run(['/usr/bin/osascript', '-e', script], capture_output=True, text=True, timeout=130)
    except subprocess.TimeoutExpired: return False
    return f'button returned:{yes}' in (r.stdout or '') and 'gave up:true' not in (r.stdout or '')

def r_pair(_):
    if not ask('Ọrọ̀ (devanaire02.github.io) wants to use the bank helper on this Mac to bring in your bank transactions through Plaid.'):
        raise Problem('not_allowed', 'The helper wasn’t allowed on this Mac.', 403)
    return {'key': helper_key()}

def link_body(update_token=None):
    b = {'client_name': 'Ọrọ̀', 'language': 'en', 'country_codes': ['US'], 'user': {'client_user_id': plaid_user()}, 'hosted_link': {}}
    if update_token: b['access_token'] = update_token
    else: b['products'] = ['transactions']; b['transactions'] = {'days_requested': 730}
    return b

def r_link_start(req):
    touch_confirm(req)
    upd = req.get('item_id')
    r = plaid('/link/token/create', link_body(access_token(upd) if upd else None))
    with LOCK: LINKS[r['link_token']] = {'update': upd or '', 'done': None, 'at': time.time()}
    return {'link_token': r['link_token'], 'url': r.get('hosted_link_url') or '', 'expiration': r.get('expiration') or ''}

def r_link_finish(req):
    lt = req.get('link_token')
    with LOCK: rec = LINKS.get(lt)
    if not rec: raise Problem('unknown_link', 'That sign-in window wasn’t started by this helper.', 404)
    if rec['done']: return rec['done']
    sessions = plaid('/link/token/get', {'link_token': lt}).get('link_sessions') or []
    finished = [s for s in sessions if s.get('finished_at')]
    if not finished: return {'status': 'waiting'}
    out = []
    for s in finished:
        for res in ((s.get('results') or {}).get('item_add_results') or []):
            ex = plaid('/item/public_token/exchange', {'public_token': res['public_token']})
            inst = res.get('institution') or {}
            remember_item(ex['item_id'], ex['access_token'], inst)
            out.append({'item_id': ex['item_id'], 'institution': {'id': inst.get('institution_id') or '', 'name': inst.get('name') or ''},
                        'accounts': [acct_out(a) for a in res.get('accounts') or []]})
    if rec['update']:
        done = {'status': 'exited'} if any(s.get('exit') for s in finished) and not any((s.get('results') or {}) for s in finished) else {'status': 'done', 'updated': rec['update']}
    else:
        done = {'status': 'done', 'items': out} if out else {'status': 'exited'}
    with LOCK: rec['done'] = done
    return done

def r_accounts(req):
    r = plaid('/accounts/get', {'access_token': access_token(req.get('item_id'))})   # cached at Plaid: free (unlike /accounts/balance/get)
    item = r.get('item') or {}
    return {'accounts': [acct_out(a) for a in r.get('accounts') or []], 'institution_id': item.get('institution_id') or '',
            'problem': ((item.get('error') or {}).get('error_code') or '')}

def r_sync(req):
    tok = access_token(req.get('item_id'))
    out = sync(tok, req.get('cursor') or '')
    out['accounts'] = r_accounts(req)['accounts']
    return out

def r_remove(req):
    iid = req.get('item_id')
    try: plaid('/item/remove', {'access_token': access_token(iid)})
    except Problem as e:
        if e.code not in ('unknown_item',) and e.extra.get('plaid') not in ('ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'): raise
    forget_item(iid)
    return {'removed': iid}

def r_items(_):
    return {'items': items()}

# Sandbox only: test banks without the window, test transactions, and a bank asking to sign in again
def r_sb_connect(req):
    pt = plaid('/sandbox/public_token/create', {'institution_id': req.get('institution_id') or 'ins_109508', 'initial_products': ['transactions'],
                                                'options': {'override_username': req.get('username') or 'user_transactions_dynamic', 'override_password': 'pass_good',
                                                            'transactions': {'days_requested': int(req.get('days') or 730)}}})['public_token']
    ex = plaid('/item/public_token/exchange', {'public_token': pt})
    inst = institution_of(ex['access_token'])
    remember_item(ex['item_id'], ex['access_token'], inst)
    return {'item_id': ex['item_id'], 'institution': {'id': inst['institution_id'], 'name': inst['name']}, 'accounts': r_accounts({'item_id': ex['item_id']})['accounts']}

def r_sb_add(req):
    txs = [{'date_transacted': t['date'], 'date_posted': t['date'], 'amount': round(-float(t['amount']), 2), 'description': t['description'], 'iso_currency_code': 'USD'} for t in req.get('transactions') or []]
    plaid('/sandbox/transactions/create', {'access_token': access_token(req.get('item_id')), 'transactions': txs})
    return {'added': len(txs)}

def r_sb_reset(req):
    plaid('/sandbox/item/reset_login', {'access_token': access_token(req.get('item_id'))})
    return {'reset': True}

ROUTES = {'/pair': (r_pair, False), '/touchid/challenge': (r_touch_challenge, True), '/touchid/register': (r_touch_register, True), '/link/start': (r_link_start, True), '/link/finish': (r_link_finish, True), '/accounts': (r_accounts, True),
          '/sync': (r_sync, True), '/remove': (r_remove, True), '/items': (r_items, True)}
if ENV == 'sandbox':
    ROUTES.update({'/sandbox/connect': (r_sb_connect, True), '/sandbox/add': (r_sb_add, True), '/sandbox/reset_login': (r_sb_reset, True)})


class Handler(BaseHTTPRequestHandler):
    server_version = 'oro-plaid/' + VERSION
    sys_version = ''

    def log_message(self, fmt, *args): pass   # see _log: path and result only

    def _log(self, status):
        sys.stderr.write(f'{time.strftime("%Y-%m-%d %H:%M:%S")} {self.command} {self.path.split("?")[0]} {status}\n'); sys.stderr.flush()

    def _allowed(self):
        return self.headers.get('Host', '') in HOSTS and self.headers.get('Origin', '') in ORIGINS

    def _send(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        if self.headers.get('Origin', '') in ALLOWED:
            self.send_header('Access-Control-Allow-Origin', ALLOWED[self.headers['Origin']]); self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        self._log(status)

    def do_OPTIONS(self):
        if not self._allowed(): self.send_response(403); self.end_headers(); return self._log(403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', ALLOWED[self.headers['Origin']]); self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST'); self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Oro-Key')
        self.send_header('Access-Control-Allow-Private-Network', 'true')   # Chrome's question about pages talking to this Mac
        self.send_header('Access-Control-Max-Age', '600'); self.end_headers(); self._log(204)

    def do_GET(self):
        if not self._allowed(): return self._send(403, {'error': 'not_allowed', 'message': 'Only Ọrọ̀ can use this helper.'})
        if self.path.split('?')[0] != '/status': return self._send(404, {'error': 'not_found'})
        try: return self._send(200, r_status({}))
        except Problem as e: return self._send(e.status, {'error': e.code, 'message': e.message})

    def do_POST(self):
        if not self._allowed(): return self._send(403, {'error': 'not_allowed', 'message': 'Only Ọrọ̀ can use this helper.'})
        route = ROUTES.get(self.path.split('?')[0])
        if not route: return self._send(404, {'error': 'not_found'})
        fn, keyed = route
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n > 65536: raise Problem('too_big', 'That request is too large.', 413)
            req = json.loads(self.rfile.read(n) or b'{}') if n else {}
            if not isinstance(req, dict): raise Problem('bad_request', 'That request isn’t understood.')
            req['_origin'] = self.headers.get('Origin', '')   # who's asking (already checked to be Ọrọ̀'s web address), for Touch ID
            if keyed:
                k = kc_get('helper-key')
                if not k or not hmac.compare_digest(k, self.headers.get('X-Oro-Key', '')): raise Problem('not_paired', 'Ọrọ̀ isn’t paired with the helper on this Mac.', 401)
            return self._send(200, fn(req))
        except Problem as e:
            return self._send(e.status, {'error': e.code, 'message': e.message, **({'plaid': e.extra['plaid']} if e.extra.get('plaid') else {})})
        except Exception:
            return self._send(500, {'error': 'helper', 'message': 'The helper hit a problem. Nothing was changed.'})


def main():
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    srv.daemon_threads = True
    sys.stderr.write(f'oro-plaid {VERSION} on 127.0.0.1:{PORT} ({ENV})\n'); sys.stderr.flush()
    srv.serve_forever()

if __name__ == '__main__':
    main()
