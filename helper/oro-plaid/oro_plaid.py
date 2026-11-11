#!/usr/bin/env python3
"""Ọrọ̀'s bank helper: a small program on this Mac that talks to Plaid for Ọrọ̀.

Plaid needs a secret key that must never sit inside a web page, so Ọrọ̀ asks this helper and the helper asks Plaid.
- It listens on 127.0.0.1 only, answers only Ọrọ̀'s own web address, and (except /status and /pair) only requests that
  carry the helper key. Pairing asks you first, in a Mac window.
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
import base64, hmac, json, os, secrets, subprocess, sys, threading, time, urllib.error, urllib.request
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


# ---------- what Ọrọ̀ can ask ----------
LINKS = {}            # link tokens this helper made (link_token -> {update, done}); in memory only
LOCK = threading.Lock()

def r_status(_):
    return {'ok': True, 'helper': 'oro-plaid', 'version': VERSION, 'env': ENV,
            'keys': kc_has('client-id', KEYS) and kc_has(f'{ENV}-secret', KEYS), 'paired': kc_has('helper-key')}

def r_pair(_):
    if PAIR != 'auto':
        msg = 'Ọrọ̀ (devanaire02.github.io) wants to use the bank helper on this Mac to bring in your bank transactions through Plaid.'
        script = f'display dialog "{msg}" buttons {{"Don’t Allow", "Allow"}} default button "Allow" cancel button "Don’t Allow" with title "Ọrọ̀ bank helper" giving up after 120'
        try: r = subprocess.run(['/usr/bin/osascript', '-e', script], capture_output=True, text=True, timeout=130)
        except subprocess.TimeoutExpired: r = None
        if not r or 'button returned:Allow' not in (r.stdout or '') or 'gave up:true' in (r.stdout or ''):
            raise Problem('not_allowed', 'The helper wasn’t allowed on this Mac.', 403)
    return {'key': helper_key()}

def link_body(update_token=None):
    b = {'client_name': 'Ọrọ̀', 'language': 'en', 'country_codes': ['US'], 'user': {'client_user_id': plaid_user()}, 'hosted_link': {}}
    if update_token: b['access_token'] = update_token
    else: b['products'] = ['transactions']; b['transactions'] = {'days_requested': 730}
    return b

def r_link_start(req):
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

ROUTES = {'/pair': (r_pair, False), '/link/start': (r_link_start, True), '/link/finish': (r_link_finish, True), '/accounts': (r_accounts, True),
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
        if self.headers.get('Origin', '') in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin']); self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        self._log(status)

    def do_OPTIONS(self):
        if not self._allowed(): self.send_response(403); self.end_headers(); return self._log(403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin']); self.send_header('Vary', 'Origin')
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
