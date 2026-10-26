#!/usr/bin/env python3
"""Private client reports: encrypted pages at /<id>/ (e.g. /123-main-street-sw-market-analysis/) that are not in the menu, sitemap or search.

The repo only ever holds ciphertext (source/private/<id>.json). A report opens in the browser only
with BOTH the secret in the link's #fragment (never sent to any server) AND the client's first and
last name. Without either, the page shows a friendly locked screen.

  Encrypt a report (prints the link to send). Add --no-key for a short link that opens with the names alone:
    python3 build/private.py encrypt REPORT.html --id r7k2q9 --name "Jane Doe" [--name "John Doe" ...] [--link OLD_LINK]
  Read a report back for editing (needs the link and the name):
    python3 build/private.py decrypt r7k2q9 --link "https://adahome.ca/r7k2q9/#k=..." --name "Jane Doe" > REPORT.html
  Render shells into a built site (release.sh runs this):
    python3 build/private.py build docs-new
"""
import argparse, base64, json, os, re, secrets, sys, unicodedata
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source', 'private')
ITER = 210000

def b64u(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
def ub64u(s): return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

def norm(name):
    s = unicodedata.normalize('NFD', name.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 \-\']', ' ', s)).strip()

def key(secret, name):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=secret, iterations=ITER).derive(norm(name).encode())

def secret_from_link(link):
    m = re.search(r'#k=([A-Za-z0-9_-]+)', link or '')
    if not m: sys.exit('link has no #k= secret')
    return ub64u(m.group(1))

def encrypt(a):
    html = open(a.report, encoding='utf-8').read()
    secret = secret_from_link(a.link) if a.link else secrets.token_bytes(16)
    if a.no_key:  # names alone open it; the salt lives in the page instead of the link
        secret = ub64u(json.load(open(os.path.join(SRC, a.id + '.json'))).get('salt', '')) if a.keep_salt else secrets.token_bytes(16)
    # One random report key, wrapped once per person, so each of their names opens the same report.
    ck, iv = secrets.token_bytes(32), secrets.token_bytes(12)
    ct = AESGCM(ck).encrypt(iv, html.encode('utf-8'), None)
    slots = []
    for n in a.name:
        siv = secrets.token_bytes(12)
        slots.append({'iv': b64u(siv), 'k': b64u(AESGCM(key(secret, n)).encrypt(siv, ck, None))})
    secrets.SystemRandom().shuffle(slots)
    os.makedirs(SRC, exist_ok=True)
    d = {'v': 2, 'iter': ITER, 'iv': b64u(iv), 'ct': b64u(ct), 'slots': slots}
    if a.no_key: d['salt'] = b64u(secret)
    json.dump(d, open(os.path.join(SRC, a.id + '.json'), 'w'))
    print(f'https://adahome.ca/{a.id}/' + ('' if a.no_key else f'#k={b64u(secret)}'))

def decrypt(a):
    d = json.load(open(os.path.join(SRC, a.id + '.json')))
    k = key(ub64u(d['salt']) if d.get('salt') else secret_from_link(a.link), a.name)
    if d.get('slots'):
        for sl in d['slots']:
            try: k = AESGCM(k).decrypt(ub64u(sl['iv']), ub64u(sl['k']), None); break
            except Exception: pass
        else: sys.exit('name does not open this report')
    sys.stdout.write(AESGCM(k).decrypt(ub64u(d['iv']), ub64u(d['ct']), None).decode('utf-8'))

SHELL = open(os.path.join(ROOT, 'build', 'private-shell.html'), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, 'build', 'private-shell.html')) else ''

def build(a):
    if not os.path.isdir(SRC): return
    n = 0
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.json'): continue
        rid = f[:-5]
        data = open(os.path.join(SRC, f)).read().strip()
        out = os.path.join(a.out, rid)
        if os.path.exists(os.path.join(out, 'index.html')): sys.exit(f'{rid} clashes with a site page')
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(SHELL.replace('__PAYLOAD__', data))
        n += 1
    print('private reports:', n)
    # Public demo reports (no names, no encryption): source/demo/<id>.html -> /client/<id>/, same look as a private report.
    demo = os.path.join(ROOT, 'source', 'demo')
    if not os.path.isdir(demo): return
    for f in sorted(os.listdir(demo)):
        if not f.endswith('.html'): continue
        body = open(os.path.join(demo, f), encoding='utf-8').read()
        page = re.sub(r'<section class="gate" id="gate">.*?</section>\n', '', SHELL, count=1, flags=re.S)
        page = re.sub(r'<script>.*?</script>\n', '', page, count=1, flags=re.S)
        page = page.replace('<div id="report" hidden></div>', '<div id="report">' + body + '</div>', 1)
        page = page.replace('Private report</span>', 'Demo report</span>', 1)
        m = re.search(r'<span data-title hidden>(.*?)</span>', body)
        if m: page = re.sub(r'<title>.*?</title>', '<title>' + m.group(1) + '</title>', page, count=1)
        out = os.path.join(a.out, 'client', f[:-5])
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
        print('demo report:', '/client/' + f[:-5] + '/')

p = argparse.ArgumentParser()
sp = p.add_subparsers(dest='cmd', required=True)
e = sp.add_parser('encrypt'); e.add_argument('report'); e.add_argument('--id', required=True); e.add_argument('--name', required=True, action='append'); e.add_argument('--link'); e.add_argument('--no-key', action='store_true', help='open with names only, no #k= in the link'); e.add_argument('--keep-salt', action='store_true')
d = sp.add_parser('decrypt'); d.add_argument('id'); d.add_argument('--link'); d.add_argument('--name', required=True)
b = sp.add_parser('build'); b.add_argument('out')
a = p.parse_args()
{'encrypt': encrypt, 'decrypt': decrypt, 'build': build}[a.cmd](a)
