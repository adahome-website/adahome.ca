#!/usr/bin/env python3
"""Private client reports: encrypted pages at /c/<id>/ that are not in the menu, sitemap or search.

The repo only ever holds ciphertext (source/private/<id>.json). A report opens in the browser only
with BOTH the secret in the link's #fragment (never sent to any server) AND the client's first and
last name. Without either, the page shows a friendly locked screen.

  Encrypt a report (prints the link to send):
    python3 build/private.py encrypt REPORT.html --id r7k2q9 --name "Linda Rausch" [--link OLD_LINK]
  Read a report back for editing (needs the link and the name):
    python3 build/private.py decrypt r7k2q9 --link "https://adahome.ca/c/r7k2q9/#k=..." --name "Linda Rausch" > REPORT.html
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
    iv = secrets.token_bytes(12)
    ct = AESGCM(key(secret, a.name)).encrypt(iv, html.encode('utf-8'), None)
    os.makedirs(SRC, exist_ok=True)
    json.dump({'v': 1, 'iter': ITER, 'iv': b64u(iv), 'ct': b64u(ct)}, open(os.path.join(SRC, a.id + '.json'), 'w'))
    print(f'https://adahome.ca/c/{a.id}/#k={b64u(secret)}')

def decrypt(a):
    d = json.load(open(os.path.join(SRC, a.id + '.json')))
    sys.stdout.write(AESGCM(key(secret_from_link(a.link), a.name)).decrypt(ub64u(d['iv']), ub64u(d['ct']), None).decode('utf-8'))

SHELL = open(os.path.join(ROOT, 'build', 'private-shell.html'), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, 'build', 'private-shell.html')) else ''

def build(a):
    if not os.path.isdir(SRC): return
    n = 0
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.json'): continue
        rid = f[:-5]
        data = open(os.path.join(SRC, f)).read().strip()
        out = os.path.join(a.out, 'c', rid)
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(SHELL.replace('__PAYLOAD__', data))
        n += 1
    print('private reports:', n)

p = argparse.ArgumentParser()
sp = p.add_subparsers(dest='cmd', required=True)
e = sp.add_parser('encrypt'); e.add_argument('report'); e.add_argument('--id', required=True); e.add_argument('--name', required=True); e.add_argument('--link')
d = sp.add_parser('decrypt'); d.add_argument('id'); d.add_argument('--link', required=True); d.add_argument('--name', required=True)
b = sp.add_parser('build'); b.add_argument('out')
a = p.parse_args()
{'encrypt': encrypt, 'decrypt': decrypt, 'build': build}[a.cmd](a)
