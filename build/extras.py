import os, sys, datetime
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
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    sm.append('  <url><loc>%s%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>' % (SITE, u, today, pri(u)))
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

Sitemap: https://adahome.ca/sitemap.xml
''')
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
''')
open(os.path.join(OUT, 'CNAME'), 'w').write('adahome.ca\n')
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
