import os, re, sys, datetime
OUT = sys.argv[1]
SITE = 'https://adahome.ca'
urls = []
for root, dirs, files in os.walk(OUT):
    if 'index.html' in files and '/assets' not in root:
        rel = os.path.relpath(root, OUT)
        urls.append('/' if rel == '.' else '/' + rel.replace(os.sep, '/') + '/')
urls.sort(key=lambda u: (u.count('/'), u))
today = datetime.date.today().isoformat()
pri = lambda u: '1.0' if u == '/' else ('0.8' if u.count('/') == 2 else '0.6')

# lastmod: keep the previous date unless the page actually changed, so search engines can trust it.
PREV = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'docs')
prev_dates = {}
try:
    for m in re.finditer(r'<loc>https://adahome\.ca([^<]*)</loc><lastmod>([^<]+)</lastmod>', open(os.path.join(PREV, 'sitemap.xml')).read()):
        prev_dates[m.group(1)] = m.group(2)
except OSError:
    pass
def page_html(base, u):
    try: return open(os.path.join(base, u.lstrip('/'), 'index.html')).read()
    except OSError: return None
def lastmod(u):
    old = page_html(PREV, u)
    if os.path.abspath(PREV) != os.path.abspath(OUT) and old is not None and old == page_html(OUT, u) and u in prev_dates:
        return prev_dates[u]
    return today

# listing photos go in the sitemap too (Google Images)
def images(u):
    h = page_html(OUT, u) or ''
    m = re.search(r'"@type":"RealEstateListing".*?"image":\[([^\]]*)\]', h)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []

sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
for u in urls:
    imgs = ''.join('<image:image><image:loc>%s</image:loc></image:image>' % i for i in images(u))
    sm.append('  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority>%s</url>' % (SITE, u, lastmod(u), pri(u), imgs))
sm.append('</urlset>')
open(os.path.join(OUT, 'sitemap.xml'), 'w').write('\n'.join(sm) + '\n')
open(os.path.join(OUT, 'robots.txt'), 'w').write('''User-agent: *
Allow: /

# AI assistants and AI search: allowed on purpose
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: Applebot-Extended
Allow: /

Sitemap: https://adahome.ca/sitemap.xml
''')

import html as _html, json as _json
def _txt(h): return re.sub(r'\s+', ' ', _html.unescape(re.sub(r'<[^>]+>', ' ', h))).strip()
def llms_extra():
    out = []
    rows = []
    for u in urls:
        if not u.startswith('/listings/') or u == '/listings/': continue
        h = page_html(OUT, u) or ''
        m = re.search(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)
        if not m: continue
        for g in _json.loads(m.group(1)).get('@graph', []):
            if g.get('@type') == 'RealEstateListing':
                o = g.get('offers', {}); mls = g.get('identifier', {}).get('value', '')
                rows.append('- [%s](%s%s): $%s CAD%s' % (g['name'], SITE, u, format(o.get('price', 0), ','), (', MLS® ' + mls) if mls else ''))
    if rows:
        out.append('\n## Featured listings (Century 21 Masters)\n' + '\n'.join(rows) + '\n')
    h = page_html(OUT, '/') or ''
    qa = re.findall(r'<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>', h, re.S)
    if qa:
        out.append('\n## Common questions\n' + '\n'.join('- **%s** %s' % (_txt(q), _txt(a)) for q, a in qa) + '\n')
    return ''.join(out)
open(os.path.join(OUT, 'llms.txt'), 'w').write('''# Ada Celik, REALTOR®, Calgary

> Ada Celik is a Calgary real estate agent (REALTOR®) with Century 21 Masters, an independently owned and operated brokerage at 338 24 Avenue SW, Calgary, AB. She helps buyers, sellers and newcomers across Calgary and the surrounding areas, in English, French and Turkish. Phone (403) 464-1595, ada.celik@century21.ca.

## Pages
- [Home](https://adahome.ca/): how Ada works with buyers and sellers, Calgary market snapshot, neighbourhoods and FAQ
- [Buying, step by step](https://adahome.ca/buying-selling/): how buying a home in Calgary works
- [Selling, step by step](https://adahome.ca/buying-selling/selling/): how selling a home in Calgary works
- [Listings](https://adahome.ca/listings/): open houses and featured Century 21 Masters listings
- [Newcomers](https://adahome.ca/newcomers/): moving to Calgary, and who can buy under Canada's foreign buyer ban
- [Monthly market stats](https://adahome.ca/market-stats/): CREB benchmark prices, sales and inventory, explained
- [Calculators](https://adahome.ca/calculators/): mortgage payments and rental cash flow
- [About Ada](https://adahome.ca/about/)
- [Privacy policy](https://adahome.ca/privacy/)
''' + llms_extra())
open(os.path.join(OUT, 'CNAME'), 'w').write('adahome.ca')
open(os.path.join(OUT, '.nojekyll'), 'w').write('')
open(os.path.join(OUT, '404.html'), 'w').write('''<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found · Ada Celik, REALTOR®</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&amp;family=Montserrat:wght@400;600&amp;display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D0D0D;color:#F4EFE6;font-family:Montserrat,system-ui,sans-serif;text-align:center;padding:24px}
h1{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:clamp(40px,7vw,72px);margin:0 0 12px}p{color:#C9BFAE;margin:0 0 28px}
a{display:inline-flex;align-items:center;min-height:48px;padding:0 24px;border-radius:999px;background:#F4EFE6;color:#0D0D0D;font-weight:600;text-decoration:none;margin:4px}</style></head>
<body><main><h1>This page has <em>moved</em>.</h1><p>The link may be old, or the listing may have sold.</p>
<a href="/">Go to the home page</a><a href="/listings/">See current listings</a></main></body></html>
''')
print(len(urls), 'pages in sitemap')
