// Builds the static English site for adahome.ca from the design's .dc.html pages.
// Usage: node build.js <srcDir> <assetsRawDir> <outDir>
'use strict';
const fs = require('fs');
const path = require('path');
const DC = require('./dc.js');

const [SRC, RAW, OUT] = process.argv.slice(2);
const SITE = 'https://adahome.ca';
const FORM_KEY = process.env.FORM_KEY || '';
const CF_BEACON = process.env.CF_BEACON || ''; // Cloudflare Web Analytics token, when set up

const PAGES = [
  ['Gallery-tjka-th8q', '/'],
  ['Steps', '/buying-selling/'],
  ['Selling', '/buying-selling/selling/'],
  ['Listings', '/listings/'],
  ['Listing', '/listings/2526-3-avenue-nw/'],
  ['Listing-somerside-common', '/listings/47-somerside-common-sw/'],
  ['Listing-willow-crescent', '/listings/3b-willow-crescent-sw/'],
  ['Listing-19-street-sw', '/listings/307-3450-19-street-sw/'],
  ['Listing-wycliffe-mews', '/listings/12-wycliffe-mews/'],
  ['Listing-49-avenue-sw', '/listings/1732-49-avenue-sw/'],
  ['About', '/about/'],
  ['Newcomers', '/newcomers/'],
  ['Stats', '/market-stats/'],
  ['Calculator', '/calculators/'],
  ['Privacy', '/privacy/'],
];
const LINKS = Object.fromEntries(PAGES);
DC.links(LINKS);

// ---------- assets ----------
const ASSET = {};
for (const f of fs.readdirSync(RAW)) { const m = /^([0-9a-f]{32})\.(\w+)$/.exec(f); if (m) ASSET[m[1]] = '/assets/img/' + f; }
function rewrite(s) {
  s = s.replace(/\/_blob\/([0-9a-f]{32})/g, (_, id) => { if (!ASSET[id]) throw new Error('missing asset ' + id); return ASSET[id]; });
  s = s.replace(/'\/_blob\/' \+ id/g, "'/assets/img/' + id + '.jpg'");
  return s;
}

// ---------- tiny HTML parser (authored templates only) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', middot: '·', mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', times: '×', eacute: 'é' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] !== undefined ? ENT[e] : m;
  });
}
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parse(html) {
  const root = { kids: [] }, stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i); i = e < 0 ? html.length : e + 3; continue; }
    if (html[i] === '<' && html[i + 1] === '/') {
      const e = html.indexOf('>', i); const name = html.slice(i + 2, e).trim();
      // pop to the matching tag
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      i = e + 1; continue;
    }
    if (html[i] === '<' && /[a-zA-Z]/.test(html[i + 1] || '')) {
      let j = i + 1, q = null;
      while (j < html.length) { const c = html[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
      let inner = html.slice(i + 1, j); let selfClose = false;
      if (inner.endsWith('/')) { selfClose = true; inner = inner.slice(0, -1); }
      const tag = /^[^\s/>]+/.exec(inner)[0];
      const attrs = [];
      const re = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      re.lastIndex = tag.length; let m;
      while ((m = re.exec(inner))) { const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]; attrs.push([m[1], v === undefined ? null : decode(v)]); }
      i = j + 1;
      let node;
      const A = Object.fromEntries(attrs);
      if (tag === 'sc-for') node = { t: 'for', list: A.list, as: A.as, kids: [] };
      else if (tag === 'sc-if') node = { t: 'if', value: A.value, kids: [] };
      else if (tag === 'dc-import') node = { t: 'imp', name: A.name, attrs, kids: [] };
      else node = { t: 'el', tag, attrs, kids: [] };
      top().kids.push(node);
      if (tag === 'style' || tag === 'script') {
        const e = html.indexOf('</' + tag, i); node.kids.push({ t: 'text', v: html.slice(i, e) }); i = html.indexOf('>', e) + 1; continue;
      }
      if (!selfClose && !VOID.has(tag.toLowerCase())) { node.tag = tag; stack.push(node); }
      continue;
    }
    const e = html.indexOf('<', i + 1); const end = e < 0 ? html.length : e;
    const text = html.slice(i, end); i = end;
    top().kids.push({ t: 'text', v: decode(text) });
  }
  return root.kids;
}
function strip(nodes) { // remove 'tag' from for/if/imp stack markers and keep JSON small
  return nodes.map((n) => {
    if (n.t === 'text') return n;
    const o = Object.assign({}, n); o.kids = strip(n.kids || []); delete o.tag;
    if (n.t === 'el') o.tag = n.tag;
    return o;
  });
}

// ---------- read a .dc.html file ----------
function readDC(name) {
  let s = fs.readFileSync(path.join(SRC, name + '.dc.html'), 'utf8');
  s = rewrite(s);
  if (name === 'SiteHeader') {
    // English only for now: drop the language switcher row.
    s = s.replace(/<div style="background: #0D0D0D; border-bottom: 1px solid #2A2925"><nav aria-label="\{\{t\.langLabel\}\}"[\s\S]*?<\/nav><\/div>\n?/, '');
  }
  const head = s.slice(s.indexOf('<head>') + 6, s.indexOf('</head>'));
  const xdc = s.slice(s.indexOf('<x-dc>') + 6, s.indexOf('</x-dc>'));
  const hm = /<helmet>([\s\S]*?)<\/helmet>/.exec(xdc);
  const helmet = hm ? hm[1].trim() : '';
  const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const sm = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(s);
  return { head, helmet, tree: strip(parse(body)), src: sm[1] };
}

const COMPONENTS = ['SiteHeader', 'SiteFooter'];
const comp = Object.fromEntries(COMPONENTS.map((c) => [c, readDC(c)]));

// ---------- write ----------
function write(rel, content) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
const runtime = fs.readFileSync(path.join(__dirname, 'dc.js'), 'utf8');
write('assets/dc.js', runtime);
for (const c of COMPONENTS) write('assets/c/' + c + '.js', 'window.DCDEFS=window.DCDEFS||{};DCDEFS[' + JSON.stringify(c) + ']=' + JSON.stringify({ tree: comp[c].tree, src: comp[c].src }) + ';');

const report = [];
for (const [name, url] of PAGES) {
  const p = readDC(name);
  const defs = Object.assign({}, Object.fromEntries(COMPONENTS.map((c) => [c, comp[c]])), { Page: { tree: p.tree, src: p.src } });
  let html = DC.renderToString(defs, 'Page', {});
  const title = (/<title>([\s\S]*?)<\/title>/.exec(p.head) || [])[1] || 'Ada Celik, REALTOR®';
  const desc = (/<meta name="description" content="([^"]*)">/.exec(p.head) || [])[1] || '';
  const ld = (/<script type="application\/ld\+json">[\s\S]*?<\/script>/.exec(p.head) || [''])[0];
  // share image: a listing's first photo, otherwise Ada's portrait
  const firstPhoto = (/\/assets\/img\/[0-9a-f]{32}\.jpg/.exec(p.src) || [])[0];
  const ogImg = SITE + (name.startsWith('Listing-') || name === 'Listing' ? firstPhoto : ASSET['7a3d8d3da0d485171459ca723502a8d1']);
  const helmets = [...new Set([p.helmet, comp.SiteHeader.helmet, comp.SiteFooter.helmet].join('\n').split('\n').map((l) => l.trim()).filter(Boolean))].join('\n');
  const canon = SITE + url;
  const doc = `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ada Celik, REALTOR®">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${ogImg}">
<meta property="og:locale" content="en_CA">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${helmets}
${ld}
</head>
<body>
<div id="dc-root">${html}</div>
<script src="/assets/dc.js"></script>
<script src="/assets/c/SiteHeader.js"></script>
<script src="/assets/c/SiteFooter.js"></script>
<script>
DC.links(${JSON.stringify(LINKS)});
DC.formKey(${JSON.stringify(FORM_KEY)});
DCDEFS.Page=${JSON.stringify({ tree: p.tree, src: p.src }).replace(/<\/script/gi, '<\\/script')};
DC.mount(document.getElementById('dc-root'), DCDEFS, 'Page', {});
</script>
${CF_BEACON ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${CF_BEACON}"}'></script>` : ''}
</body>
</html>
`;
  write(url.replace(/^\//, '') + 'index.html', doc);
  report.push([url, html.length]);
}
console.log(report.map((r) => r.join(' ')).join('\n'));
