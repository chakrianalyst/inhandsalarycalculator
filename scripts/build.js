#!/usr/bin/env node
/* Builds the deployable site into ./_site
 *  - stamps your real domain (site.config.json) into canonical URLs / sitemap
 *  - injects favicon, manifest, Open Graph / Twitter tags, FAQ rich-result schema
 *  - generates the "₹X LPA in-hand salary" pages from the tax engine
 *  - writes assets/site.js (public config), robots.txt, sitemap.xml, ads.txt
 *  - prints a launch checklist of anything still unconfigured
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, '_site');
const cfg = JSON.parse(fs.readFileSync(process.env.SITE_CONFIG ? path.resolve(process.env.SITE_CONFIG) : path.join(ROOT, 'site.config.json'), 'utf8'));
const Tax = require('../assets/tax.js'), CTC = require('./ctc-pages.js');

const PLACEHOLDER = 'https://inhand.example';
const siteUrl = (cfg.siteUrl || PLACEHOLDER).replace(/\/+$/, '');
const today = new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

// ---------- gather pages ----------
const pages = {};                                   // filename -> html
for (const f of fs.readdirSync(ROOT)) if (f.endsWith('.html')) pages[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
const hub = CTC.hubPage(Tax); pages[hub.file] = hub.html;
for (const l of CTC.LPAS) { const p = CTC.ctcPage(Tax, l); pages[p.file] = p.html; }

// ---------- articles: any page with <meta name="rc-article" ...> is listed on the Articles hub and linked from its calculator ----------
const GROUPS = [['pay', 'Salary, tax & work'], ['save', 'Loans & savings'], ['plan', 'Big life decisions']];
const articles = Object.entries(pages).filter(([, h]) => /<meta name="rc-article"/.test(h)).map(([file, h]) => {
  const m = h.match(/<meta name="rc-article" content="([^"]*)" data-group="([^"]*)" data-icon="([^"]*)" data-date="([^"]*)">/);
  if (!m) throw new Error(file + ': rc-article meta must be <meta name="rc-article" content="tool" data-group="pay|save|plan" data-icon="…" data-date="YYYY-MM-DD">');
  const body = (h.match(/<article[\s\S]*?<\/article>/) || [''])[0], words = strip(body).split(' ').length;
  return { file, tool: m[1], group: m[2], icon: m[3], date: m[4], title: strip((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, file])[1]), dek: strip((h.match(/<p class="dek">([\s\S]*?)<\/p>/) || [, ''])[1]), mins: Math.max(3, Math.round(words / 220)), headline: strip((h.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]).replace(/ \| .*$/, '') };
}).sort((a, b) => GROUPS.findIndex(g => g[0] === a.group) - GROUPS.findIndex(g => g[0] === b.group) || a.file.localeCompare(b.file));
const artCard = a => `<a class="tool-card art-card" href="${a.file}"><div class="ico" aria-hidden="true">${a.icon}</div><h3>${a.title}</h3><p>${a.dek}</p><span class="meta">${a.mins} min read</span><span class="go">Read →</span></a>`;
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
for (const a of articles) {
  const more = [...articles.filter(x => x !== a && x.group === a.group), ...articles.filter(x => x.group !== a.group)].slice(0, 3);
  pages[a.file] = pages[a.file].split('{{READ_MINS}}').join(String(a.mins)).split('{{UPDATED_ON}}').join(fmtDate(a.date)).split('{{MORE_ARTICLES}}').join(more.map(artCard).join(''))
    .replace('</head>', `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: a.headline, description: a.dek, datePublished: a.date, dateModified: a.date, author: { '@type': 'Organization', name: cfg.siteName, url: siteUrl }, publisher: { '@type': 'Organization', name: cfg.siteName }, mainEntityOfPage: `${siteUrl}/${a.file}` })}</script>\n</head>`);
}

// ---------- tokens + per-page head/scripts ----------
const tokens = { '{{SITE_NAME}}': cfg.siteName, '{{CONTACT_EMAIL}}': cfg.contactEmail, '{{SITE_URL}}': siteUrl, '{{UPDATED}}': today };
function regimeTable() {
  const rows = [10, 12.75, 15, 20, 25, 30, 40, 50].map(l => {
    const gross = Math.round(l * 1e5), be = CTC.breakevenDeductions(Tax, gross);
    return `<tr><td>₹${l} lakh</td><td>${be ? '₹' + new Intl.NumberFormat('en-IN').format(Math.round(be / 1000) * 1000) : 'Never'}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl"><tr><th>Gross salary</th><th>Old regime wins only if deductions exceed</th></tr>${rows}</table></div>`;
}
tokens['{{REGIME_TABLE}}'] = regimeTable();
// ---------- guide tables (computed from the same tested engines the calculators use) ----------
const Invest = require('../assets/invest.js'), Loan = require('../assets/loan.js'), HRA = require('../assets/hra.js');
const nf = n => new Intl.NumberFormat('en-IN').format(Math.round(n));
const table = (head, rows) => `<div class="tbl-wrap"><table class="tbl"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
const lak = n => n >= 1e7 ? (n / 1e7) + ' crore' : (n / 1e5) + ' lakh';
tokens['{{NEW_SLAB_TABLE}}'] = table(['Taxable income', 'Tax rate'], Tax.NEW_SLABS.map(([lim, r], i, a) => [i === 0 ? 'Up to ₹' + lak(lim) : i === a.length - 1 ? 'Above ₹' + lak(a[i - 1][0]) : '₹' + lak(a[i - 1][0]) + ' to ₹' + lak(lim), r === 0 ? 'Nil' : Math.round(r * 100) + '%']));
tokens['{{NEW_TAX_EXAMPLES}}'] = table(['Gross salary', 'Taxable after ₹75,000', 'Income tax a year', 'Per month'], [8, 10, 12, 12.75, 15, 20, 25, 30, 50].map(l => { const g = l * 1e5, t = Tax.computeTax(Math.max(0, g - 75000), 'new').total; return ['₹' + l + ' lakh', '₹' + nf(Math.max(0, g - 75000)), t ? '₹' + nf(t) : 'Nil', t ? '₹' + nf(t / 12) : 'Nil']; }));
tokens['{{SIP_TABLE}}'] = table(['Years', ...[8, 10, 12, 15].map(r => r + '% a year')], [5, 10, 15, 20, 25, 30].map(y => [y, ...[8, 10, 12, 15].map(r => '₹' + nf(Invest.requiredSip({ target: 1e7, ret: r, months: y * 12, step: 0, lump: 0, nominal: false })))]));
tokens['{{EMI_TABLE}}'] = table(['Interest rate', ...[1, 3, 5, 10, 15, 20].map(y => y + (y === 1 ? ' year' : ' years'))], [7, 8, 9, 10, 11, 12, 14, 15].map(r => [r + '%', ...[1, 3, 5, 10, 15, 20].map(y => '₹' + nf(Loan.emi(1e5, r, y * 12)))]));
tokens['{{HRA_METROS}}'] = HRA.METROS_2026.join(', ');
tokens['{{ARTICLE_CARDS}}'] = GROUPS.map(([g, name]) => articles.some(a => a.group === g) ? `<h3 class="tool-group">${name}</h3>` + articles.filter(a => a.group === g).map(artCard).join('') : '').join('');
tokens['{{ARTICLE_FEATURED}}'] = ['no-tax', 'laid-off', 'moving-back', 'rent-or-buy', 'sip-delay', 'retire-early', 'prepay-home', 'compare-two'].map(k => articles.find(a => a.file.includes(k))).filter(Boolean).map(artCard).join('');
tokens['{{ARTICLE_COUNT}}'] = String(articles.length);


const sitemap = [];
for (const [file, raw] of Object.entries(pages)) {
  let html = raw;
  for (const [k, v] of Object.entries(tokens)) html = html.split(k).join(v);
  html = html.split(PLACEHOLDER).join(siteUrl);
  const title = strip((html.match(/<title>([\s\S]*?)<\/title>/) || [, file])[1]);
  const desc = strip((html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1]);
  const url = `${siteUrl}/${file === 'index.html' ? '' : file}`;
  const ogImage = `${siteUrl}/assets/${fs.existsSync(path.join(ROOT, 'assets', 'og', file.replace(/\.html$/, '.png'))) ? 'og/' + file.replace(/\.html$/, '.png') : 'og.png'}`;   // a page-specific share image if one exists (scripts/make-og.py), else the default
  const faqs = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(m => ({ '@type': 'Question', name: strip(m[1]), acceptedAnswer: { '@type': 'Answer', text: strip(m[2]) } }));
  const extra = [
    `<link rel="icon" href="favicon.ico" sizes="48x48">`,
    `<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">`,
    `<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">`,
    `<link rel="manifest" href="manifest.webmanifest">`,
    `<meta name="theme-color" content="#5b4bff">`,
    cfg.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}">` : '',
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(cfg.siteName)}">`,
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}"><meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${ogImage}">`,
    `<meta name="robots" content="${file === '404.html' ? 'noindex' : 'index,follow,max-image-preview:large'}">`,
    faqs.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs })}</script>` : '',
  ].filter(Boolean).join('\n');
  html = html.replace('</head>', extra + '\n</head>');
  html = html.replace('<script src="assets/common.js"></script>', '<script src="assets/site.js"></script>\n<script src="assets/common.js"></script>');
  if (!html.includes('assets/site.js')) html = html.replace('</body>', '<script src="assets/site.js"></script>\n</body>');
  html = html.replace(/href="index\.html"/g, 'href="/"');                       // links to the home page go to rupeecheck.in/, not /index.html
  fs.writeFileSync(path.join(OUT, file), html);
  if (file !== '404.html') sitemap.push({ url, file });
}

// ---------- assets + static files ----------
(function copy(src, dst) { for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name);
  e.isDirectory() ? (fs.mkdirSync(d, { recursive: true }), copy(s, d)) : fs.copyFileSync(s, d); } })(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
if (fs.existsSync(path.join(ROOT, 'favicon.ico'))) fs.copyFileSync(path.join(ROOT, 'favicon.ico'), path.join(OUT, 'favicon.ico'));          // browsers and Google also look for this path
if (fs.existsSync(path.join(ROOT, 'manifest.webmanifest'))) fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(OUT, 'manifest.webmanifest'));

const pub = { siteName: cfg.siteName, siteUrl, gaId: (cfg.analytics || {}).gaId || '', umamiId: (cfg.analytics || {}).umamiId || '', adsenseClient: (cfg.adsense || {}).client || '', adsenseSlot: (cfg.adsense || {}).slot || '',
  affiliates: Object.fromEntries(Object.entries(cfg.affiliates || {}).filter(([, v]) => v)), articles: articles.map(a => ({ href: a.file, title: a.title, tool: a.tool, icon: a.icon })) };
fs.writeFileSync(path.join(OUT, 'assets', 'site.js'), `window.SITE = ${JSON.stringify(pub)};\n`);
if (siteUrl !== PLACEHOLDER && !/github\.io$/.test(new URL(siteUrl).hostname)) fs.writeFileSync(path.join(OUT, 'CNAME'), new URL(siteUrl).hostname + '\n');      // GitHub Pages custom domain
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemap.map(s => `  <url><loc>${s.url}</loc><lastmod>${today}</lastmod></url>`).join('\n') + `\n</urlset>\n`);
if (pub.adsenseClient) fs.writeFileSync(path.join(OUT, 'ads.txt'), `google.com, ${pub.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

// ---------- launch checklist ----------
const todo = [];
if (siteUrl === PLACEHOLDER) todo.push('siteUrl is still the placeholder — set your real domain in site.config.json');
if (/@inhand\.example$/.test(cfg.contactEmail || '')) todo.push('contactEmail is still the placeholder — set a real address (AdSense requires a working contact)');
if (!pub.adsenseClient) todo.push('AdSense not configured (ads are hidden) — add adsense.client after approval');
if (!pub.gaId && !pub.umamiId) todo.push('Analytics not configured — add analytics.umamiId (cookie-free, no banner) or analytics.gaId');
const missing = Object.keys(cfg.affiliates || {}).filter(k => !cfg.affiliates[k]);
if (missing.length) todo.push(`${missing.length} affiliate link(s) empty — those "offer" boxes stay hidden: ${missing.join(', ')}`);
console.log(`Built ${Object.keys(pages).length} pages -> _site/  (${siteUrl})`);
if (todo.length) console.log('\nLaunch checklist:\n' + todo.map(t => '  ⚠ ' + t).join('\n'));
