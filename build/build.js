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
// French and Turkish pages live under /fr/ and /tr/ with the same paths as English.
const LANGS = ['en', 'fr', 'tr'];
const BASE_PAGES = PAGES.slice();
PAGES.length = 0;
for (const l of LANGS) for (const [n, u] of BASE_PAGES) PAGES.push(l === 'en' ? [n, u] : [n + '-' + l, '/' + l + u]);
// Client portal pages: English only, not linked in the menu, kept out of search and the sitemap.
const PRIVATE_PAGES = [['Client-signin', '/client/'], ['Client-portal', '/client/portal/']];
const PRIVATE = new Set(PRIVATE_PAGES.map(([n]) => n));
PAGES.push(...PRIVATE_PAGES);
const langOf = (name) => (/-(fr|tr)$/.exec(name) || [, 'en'])[1];
const baseOf = (name) => name.replace(/-(fr|tr)$/, '');
const PAGES_BY_PATH = Object.fromEntries(BASE_PAGES.map(([n, u]) => [u, n]));
const urlFor = (base, l) => (l === 'en' ? '' : '/' + l) + Object.fromEntries(BASE_PAGES)[base];
const HTML_LANG = { en: 'en-CA', fr: 'fr-CA', tr: 'tr' }, OG_LOCALE = { en: 'en_CA', fr: 'fr_CA', tr: 'tr_TR' };
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


// ---------- image sizes (JPEG/PNG headers) ----------
function imgSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

// ---------- tree enhancements (applied to the template, so server HTML and the browser agree) ----------
// - images: intrinsic width/height (no layout shift), async decoding, lazy loading except the page's first image
// - a space before <br> so text read by search engines and AI tools doesn't run words together
function enhance(nodes, ctx) {
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (n.t === 'text') {
      const nx = nodes[k + 1];
      if (nx && nx.t === 'el' && nx.tag === 'br' && /\S$/.test(n.v)) n.v += ' ';
      continue;
    }
    if (n.t === 'el' && n.tag === 'img') {
      const A = Object.fromEntries(n.attrs);
      const set = (key, v) => { if (!(key in A)) { n.attrs.push([key, v]); A[key] = v; } };
      const m = /^\/assets\/img\/([0-9a-f]{32}\.\w+)$/.exec(A.src || '');
      if (m) {
        const sz = imgSize(path.join(RAW, m[1]));
        if (sz) { set('width', String(sz.w)); set('height', String(sz.h)); }
        if (A.style && !/(^|;)\s*height\s*:/.test(A.style)) n.attrs = n.attrs.map(([a, v]) => a === 'style' ? [a, v.replace(/;?\s*$/, '; height: auto')] : [a, v]);
      }
      set('decoding', 'async');
      if (ctx.first && !ctx.seenFirst) { ctx.seenFirst = true; set('fetchpriority', 'high'); }
      else set('loading', 'lazy');
    }
    if (n.kids) enhance(n.kids, ctx);
  }
  return nodes;
}

const COMPONENT_NAMES = ['SiteHeader', 'SiteFooter'];
// ---------- read a .dc.html file ----------
function readDC(name) {
  let s = fs.readFileSync(path.join(SRC, name + '.dc.html'), 'utf8');
  s = rewrite(s);
  const head = s.slice(s.indexOf('<head>') + 6, s.indexOf('</head>'));
  const xdc = s.slice(s.indexOf('<x-dc>') + 6, s.indexOf('</x-dc>'));
  const hm = /<helmet>([\s\S]*?)<\/helmet>/.exec(xdc);
  const helmet = hm ? hm[1].trim() : '';
  const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const sm = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(s);
  return { head, helmet, tree: enhance(strip(parse(body)), { first: !COMPONENT_NAMES.includes(name) }), src: sm[1] };
}

const COMPONENTS = COMPONENT_NAMES;
const comp = Object.fromEntries(COMPONENTS.map((c) => [c, readDC(c)]));

// ---------- write ----------
function write(rel, content) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
const runtime = fs.readFileSync(path.join(__dirname, 'dc.js'), 'utf8');
write('assets/dc.js', runtime);
for (const c of COMPONENTS) write('assets/c/' + c + '.js', 'window.DCDEFS=window.DCDEFS||{};DCDEFS[' + JSON.stringify(c) + ']=' + JSON.stringify({ tree: comp[c].tree, src: comp[c].src }) + ';');


// ---------- structured data (schema.org JSON-LD) for search engines and AI assistants ----------
const NAMES_BY_LANG = {
  fr: { '/': 'Accueil', '/buying-selling/': 'Acheter et vendre', '/buying-selling/selling/': 'Vendre', '/listings/': 'Propriétés', '/about/': 'À propos', '/newcomers/': 'Nouveaux arrivants', '/market-stats/': 'Statistiques du marché', '/calculators/': 'Calculatrices', '/privacy/': 'Confidentialité' },
  tr: { '/': 'Ana sayfa', '/buying-selling/': 'Alım ve satım', '/buying-selling/selling/': 'Satış', '/listings/': 'İlanlar', '/about/': 'Hakkımda', '/newcomers/': 'Yeni gelenler', '/market-stats/': 'Piyasa istatistikleri', '/calculators/': 'Hesaplayıcılar', '/privacy/': 'Gizlilik' }
};
const EN_HTML = {};
const EVENTS = {}; // open houses by listing path (language-free), filled from the Listings page
function calgaryOffset(d) {
  const y = +d.slice(0, 4), md = d.slice(5, 10);
  const nthSunday = (m, n) => { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (n - 1); };
  const pad = (n) => String(n).padStart(2, '0');
  const start = '03-' + pad(nthSunday(3, 2)), end = '11-' + pad(nthSunday(11, 1));
  return md >= start && md < end ? '-06:00' : '-07:00';
}
function openHouses(html) {
  const out = [];
  for (const m of html.matchAll(/<a href="(\/(?:fr\/|tr\/)?listings\/[^"#]+\/)" class="lc" data-start="(\d{4}-\d\d-\d\dT\d\d:\d\d)" data-end="(\d{4}-\d\d-\d\dT\d\d:\d\d)"([\s\S]*?)<\/a>/g)) {
    const card = m[4];
    const address = txt((/<div style="font-weight: 600; font-size: 17px">([\s\S]*?)<\/div>/.exec(card) || [, ''])[1]);
    const area = txt((/<div style="font-size: 14px; color: #5A564E">([\s\S]*?)<\/div>/.exec(card) || [, ''])[1]).split('·')[0].trim();
    const img = (/url\('?(\/assets\/img\/[^')]+)'?\)/.exec(card) || [])[1];
    out.push({ img: img ? SITE + img : null, href: m[1], path: m[1].replace(/^\/(fr|tr)\//, '/'), start: m[2], end: m[3], address, area });
  }
  return out;
}
function eventLd(e, lang, img) {
  const name = { en: 'Open house: ', fr: 'Visite libre : ', tr: 'Açık ev: ' }[lang] + e.address;
  return { '@type': 'Event', name, url: SITE + e.href, startDate: e.start + ':00' + calgaryOffset(e.start), endDate: e.end + ':00' + calgaryOffset(e.end),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true, inLanguage: HTML_LANG[lang],
    location: { '@type': 'Place', name: e.address + (e.area ? ', ' + e.area : '') + ', Calgary', address: { '@type': 'PostalAddress', streetAddress: e.address, addressLocality: 'Calgary', addressRegion: 'AB', addressCountry: 'CA' } },
    image: img ? [img] : undefined, organizer: { '@id': AGENT_ID }, performer: { '@id': AGENT_ID } };
}
const NAMES = { '/': 'Home', '/buying-selling/': 'Buying & selling', '/buying-selling/selling/': 'Selling', '/listings/': 'Listings', '/about/': 'About Ada', '/newcomers/': 'Newcomers', '/market-stats/': 'Market stats', '/calculators/': 'Calculators', '/privacy/': 'Privacy policy' };
const AGENT_ID = SITE + '/#agent';
const txt = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function schema(fullName, url, p, html, title, desc) {
  const graph = [];
  const lang = langOf(fullName), name = baseOf(fullName), pre = lang === 'en' ? '' : '/' + lang, path = url.slice(pre.length) || '/';
  const names = lang === 'en' ? NAMES : NAMES_BY_LANG[lang];
  const srcLd = (/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(p.head) || [])[1];
  if (path === '/') {
    if (lang === 'en') {
    const agent = Object.assign(srcLd ? JSON.parse(srcLd) : {}, { '@id': AGENT_ID, image: SITE + ASSET['7a3d8d3da0d485171459ca723502a8d1'], logo: SITE + '/apple-touch-icon.png' });
    delete agent['@context'];
    graph.push(agent);
    graph.push({ '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'Ada Celik, REALTOR®', inLanguage: ['en-CA', 'fr-CA', 'tr'], publisher: { '@id': AGENT_ID } });
    }
    const faqs = [...html.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({ '@type': 'Question', name: txt(m[1]), acceptedAnswer: { '@type': 'Answer', text: txt(m[2]) } }));
    if (faqs.length) graph.push({ '@type': 'FAQPage', '@id': SITE + url + '#faq', inLanguage: HTML_LANG[lang], mainEntity: faqs });
  }
  const page = { '@type': name === 'About' ? 'ProfilePage' : 'WebPage', '@id': SITE + url + '#webpage', url: SITE + url, name: title, description: desc, inLanguage: HTML_LANG[lang], isPartOf: { '@id': SITE + '/#website' }, about: { '@id': AGENT_ID } };
  if (name === 'About') page.mainEntity = { '@id': AGENT_ID };
  graph.push(page);
  if (path !== '/') {
    const parts = path.split('/').filter(Boolean);
    const items = [{ name: names['/'], item: SITE + pre + '/' }];
    let acc = '/';
    for (const part of parts) { acc += part + '/'; items.push({ name: names[acc] || txt((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [, ''])[1]), item: SITE + pre + acc }); }
    graph.push({ '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => Object.assign({ '@type': 'ListItem', position: i + 1 }, it)) });
  }
  if (name === 'Listing' || name.startsWith('Listing-')) {
    const enHtml = EN_HTML[name] || html;
    const fact = (k) => { const m = new RegExp('>' + k + '</div><div[^>]*>([^<]*)</div>').exec(enHtml); return m ? decode(m[1]).trim() : null; };
    const address = txt((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [, ''])[1]);
    const area = txt((/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(html) || [, ''])[1]).split('·')[0].trim();
    const price = Number((/const price = (\d+)/.exec(p.src) || [])[1]);
    const ids = JSON.parse((/const IDS = (\[[^\]]*\])/.exec(p.src) || [, '[]'])[1]);
    const mls = (/mls: 'MLS® (A\d+)'/.exec(p.src) || [])[1];
    const realtorUrl = (/const realtorUrl = '([^']+)'/.exec(p.src) || [])[1];
    const about = lang !== 'en' ? desc : [...html.matchAll(/About this home<\/h2>([\s\S]*?)<\/div>/g)].map((m) => txt(m[1]))[0];
    const type = fact('Type') || '';
    const homeType = /condo|apartment/i.test(type) ? 'Apartment' : (/town/i.test(type) ? 'House' : (/semi/i.test(type) ? 'House' : 'SingleFamilyResidence'));
    const beds = fact('Bedrooms'), baths = fact('Bathrooms'), sqft = fact('Living area'), built = fact('Built');
    const home = { '@type': homeType, name: address + ', ' + area + ', Calgary', address: { '@type': 'PostalAddress', streetAddress: address, addressLocality: 'Calgary', addressRegion: 'AB', addressCountry: 'CA' } };
    if (beds) home.numberOfBedrooms = beds.split('+').reduce((t, x) => t + (parseInt(x, 10) || 0), 0);
    if (baths) home.numberOfBathroomsTotal = parseFloat(baths);
    if (sqft) home.floorSize = { '@type': 'QuantitativeValue', value: parseInt(sqft.replace(/[^0-9]/g, ''), 10), unitCode: 'FTK' };
    if (built) home.yearBuilt = parseInt(built, 10);
    const listing = { '@type': 'RealEstateListing', '@id': SITE + url + '#listing', url: SITE + url, inLanguage: HTML_LANG[lang], name: lang !== 'en' ? title.split(' · ')[0] + ' · ' + title.split(' · ').slice(1).join(' · ') : address + ', ' + area + ', Calgary: ' + ({ detached: 'detached home', 'semi-detached': 'semi-detached home', townhouse: 'townhouse', condo: 'condo' }[type.toLowerCase()] || 'home') + ' for sale', description: about || desc, image: ids.slice(0, 6).map((id) => SITE + '/assets/img/' + id + '.jpg'), mainEntity: home,
      offers: { '@type': 'Offer', price, priceCurrency: 'CAD', availability: 'https://schema.org/InStock', offeredBy: { '@type': 'RealEstateAgent', name: 'Century 21 Masters' } } };
    if (mls) listing.identifier = { '@type': 'PropertyValue', propertyID: 'MLS®', value: mls };
    if (realtorUrl) listing.sameAs = realtorUrl;
    graph.push(listing);
    const ev = EVENTS[path];
    if (ev && ev.start.slice(0, 10) >= new Date().toISOString().slice(0, 10)) graph.push(eventLd(Object.assign({}, ev, { href: url }), lang, listing.image[0]));
    page.mainEntity = { '@id': SITE + url + '#listing' };
  }
  if (path === '/listings/') {
    const evs = openHouses(html);
    for (const e of evs) { const lp = urlFor(PAGES_BY_PATH[e.path], 'en'); EVENTS[e.path] = e; }
    const today = new Date().toISOString().slice(0, 10);
    for (const e of evs) if (e.start.slice(0, 10) >= today) graph.push(eventLd(Object.assign({}, e, { href: pre + e.path }), lang, e.img));
    const urls = [...new Set([...html.matchAll(/href="(\/(?:fr\/|tr\/)?listings\/[^"#]+\/)"/g)].map((m) => m[1]))];
    if (urls.length) graph.push({ '@type': 'ItemList', name: 'Featured Calgary listings', itemListElement: urls.map((u, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + u })) });
  }
  return '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') + '</script>';
}

const report = [];
for (const [name, url] of PAGES) {
  const p = readDC(name);
  const defs = Object.assign({}, Object.fromEntries(COMPONENTS.map((c) => [c, comp[c]])), { Page: { tree: p.tree, src: p.src } });
  let html = DC.renderToString(defs, 'Page', {});
  const lang = langOf(name), base = baseOf(name);
  if (lang === 'en') EN_HTML[base] = html;
  const priv = PRIVATE.has(name);
  const alternates = priv ? '' : LANGS.map((l) => `<link rel="alternate" hreflang="${HTML_LANG[l]}" href="${SITE}${urlFor(base, l)}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${urlFor(base, 'en')}">`;
  const title = (/<title>([\s\S]*?)<\/title>/.exec(p.head) || [])[1] || 'Ada Celik, REALTOR®';
  const desc = (/<meta name="description" content="([^"]*)">/.exec(p.head) || [])[1] || '';

  // share image: a listing's first photo, otherwise Ada's portrait
  const firstPhoto = (/\/assets\/img\/[0-9a-f]{32}\.jpg/.exec(p.src) || [])[0];
  const ogImg = SITE + (base.startsWith('Listing-') || base === 'Listing' ? firstPhoto : ASSET['7a3d8d3da0d485171459ca723502a8d1']);
  const helmets = [...new Set([p.helmet, comp.SiteHeader.helmet, comp.SiteFooter.helmet].join('\n').split('\n').map((l) => l.trim()).filter(Boolean))].join('\n');
  // Load Google Fonts without blocking the first paint (text shows in a fallback font for a moment instead).
  const headStyles = helmets.replace(/<link href="(https:\/\/fonts\.googleapis\.com\/[^"]+)" rel="stylesheet">/g, (_, href) => `<link rel="preload" as="style" href="${href}"><link rel="stylesheet" href="${href}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${href}"></noscript>`);
  const canon = SITE + url;
  const isListing = base === 'Listing' || base.startsWith('Listing-');
  const ogAlt = isListing ? decode(title).split(' · ')[0] : 'Ada Celik, Calgary REALTOR®';
  const doc = `<!doctype html>
<html lang="${HTML_LANG[lang]}">
<head>
<meta charset="utf-8">
<script>if(location.protocol==='http:'&&/(^|\.)adahome\.ca$/.test(location.hostname))location.replace('https://adahome.ca'+location.pathname+location.search+location.hash)</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canon}">
${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ada Celik, REALTOR®">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${ogImg}">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
${priv ? '' : LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`).join('\n')}
<meta property="og:image:alt" content="${ogAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${ogImg}">
<meta name="robots" content="${priv ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta name="theme-color" content="#0D0D0D">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${headStyles}
${priv ? '' : schema(name, url, p, html, decode(title), decode(desc))}
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
