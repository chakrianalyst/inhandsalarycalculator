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

const sitemap = [];
for (const [file, raw] of Object.entries(pages)) {
  let html = raw;
  for (const [k, v] of Object.entries(tokens)) html = html.split(k).join(v);
  html = html.split(PLACEHOLDER).join(siteUrl);
  const title = strip((html.match(/<title>([\s\S]*?)<\/title>/) || [, file])[1]);
  const desc = strip((html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1]);
  const url = `${siteUrl}/${file === 'index.html' ? '' : file}`;
  const faqs = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(m => ({ '@type': 'Question', name: strip(m[1]), acceptedAnswer: { '@type': 'Answer', text: strip(m[2]) } }));
  const extra = [
    `<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">`,
    `<link rel="manifest" href="manifest.webmanifest">`,
    `<meta name="theme-color" content="#5b4bff">`,
    cfg.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}">` : '',
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(cfg.siteName)}">`,
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}"><meta property="og:image" content="${siteUrl}/assets/og.png">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${siteUrl}/assets/og.png">`,
    `<meta name="robots" content="${file === '404.html' ? 'noindex' : 'index,follow,max-image-preview:large'}">`,
    faqs.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs })}</script>` : '',
  ].filter(Boolean).join('\n');
  html = html.replace('</head>', extra + '\n</head>');
  html = html.replace('<script src="assets/common.js"></script>', '<script src="assets/site.js"></script>\n<script src="assets/common.js"></script>');
  if (!html.includes('assets/site.js')) html = html.replace('</body>', '<script src="assets/site.js"></script>\n</body>');
  fs.writeFileSync(path.join(OUT, file), html);
  if (file !== '404.html') sitemap.push({ url, file });
}

// ---------- assets + static files ----------
(function copy(src, dst) { for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name);
  e.isDirectory() ? (fs.mkdirSync(d, { recursive: true }), copy(s, d)) : fs.copyFileSync(s, d); } })(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
if (fs.existsSync(path.join(ROOT, 'manifest.webmanifest'))) fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(OUT, 'manifest.webmanifest'));

const pub = { siteName: cfg.siteName, siteUrl, gaId: (cfg.analytics || {}).gaId || '', adsenseClient: (cfg.adsense || {}).client || '', adsenseSlot: (cfg.adsense || {}).slot || '',
  affiliates: Object.fromEntries(Object.entries(cfg.affiliates || {}).filter(([, v]) => v)) };
fs.writeFileSync(path.join(OUT, 'assets', 'site.js'), `window.SITE = ${JSON.stringify(pub)};\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemap.map(s => `  <url><loc>${s.url}</loc><lastmod>${today}</lastmod></url>`).join('\n') + `\n</urlset>\n`);
if (pub.adsenseClient) fs.writeFileSync(path.join(OUT, 'ads.txt'), `google.com, ${pub.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);

// ---------- launch checklist ----------
const todo = [];
if (siteUrl === PLACEHOLDER) todo.push('siteUrl is still the placeholder — set your real domain in site.config.json');
if (/@inhand\.example$/.test(cfg.contactEmail || '')) todo.push('contactEmail is still the placeholder — set a real address (AdSense requires a working contact)');
if (!pub.adsenseClient) todo.push('AdSense not configured (ads are hidden) — add adsense.client after approval');
if (!pub.gaId) todo.push('Google Analytics not configured — add analytics.gaId');
const missing = Object.keys(cfg.affiliates || {}).filter(k => !cfg.affiliates[k]);
if (missing.length) todo.push(`${missing.length} affiliate link(s) empty — those "offer" boxes stay hidden: ${missing.join(', ')}`);
console.log(`Built ${Object.keys(pages).length} pages -> _site/  (${siteUrl})`);
if (todo.length) console.log('\nLaunch checklist:\n' + todo.map(t => '  ⚠ ' + t).join('\n'));
