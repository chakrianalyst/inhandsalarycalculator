#!/usr/bin/env node
/* Quality gate for the built site (_site): SEO tags, links, structured data, sitemap. Exit 1 on errors. */
const fs = require('fs'), path = require('path');
const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', '_site'));
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site.config.json'), 'utf8'));
const siteUrl = (cfg.siteUrl || '').replace(/\/+$/, '');
const errors = [], warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`), warn = (f, m) => warns.push(`${f}: ${m}`);
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));
const titles = new Map();

for (const f of files) {
  const h = fs.readFileSync(path.join(DIR, f), 'utf8');
  const title = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1], desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!title) err(f, 'missing <title>'); else { if (title.length > 75) warn(f, `long title (${title.length})`); if (titles.has(title)) err(f, `duplicate title with ${titles.get(title)}`); titles.set(title, f); }
  if (!desc) err(f, 'missing meta description'); else if (desc.length < 50 || desc.length > 175) warn(f, `description length ${desc.length}`);
  const canon = (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (!canon) err(f, 'missing canonical'); else if (!canon.startsWith(siteUrl)) err(f, `canonical ${canon} does not start with ${siteUrl}`);
  if ((h.match(/<h1[ >]/g) || []).length !== 1 && f !== 'index.html') err(f, `expected exactly one <h1>, found ${(h.match(/<h1[ >]/g) || []).length}`);
  if (f !== '404.html' && !/property="og:image"/.test(h)) err(f, 'missing og:image');
  const og = (h.match(/property="og:image" content="([^"]*)"/) || [])[1];                      // the share image must exist in the built site, or links shared from this page show nothing
  if (og && og.startsWith(siteUrl + '/') && !fs.existsSync(path.join(DIR, og.slice(siteUrl.length + 1)))) err(f, `og:image file not found: ${og}`);
  if (!/assets\/site\.js/.test(h)) err(f, 'site.js (public config) not injected');
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch (e) { err(f, 'invalid JSON-LD: ' + e.message); } }
  if (/\{\{[A-Z_]+\}\}/.test(h)) err(f, 'unreplaced {{TOKEN}}');
  if (!/inhand\.example/.test(siteUrl) && /inhand\.example/.test(h)) err(f, 'placeholder domain inhand.example left in the page');
  if (/href="index\.html"/.test(h)) err(f, 'links to index.html; the home page should be linked as /');
  for (const m of h.matchAll(/<a\b[^>]*\bhref="#"[^>]*>/g)) if (!/data-affiliate/.test(m[0])) err(f, 'dead link href="#"');
  for (const m of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1]; if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(u) || u.includes('${')) continue;   // external / in-page / JS template
    const target = path.join(DIR, u.split('#')[0].split('?')[0] || f);
    if (!fs.existsSync(target)) err(f, `broken link/asset: ${u}`);
  }
}
const sm = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8'), locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
for (const f of files.filter(x => x !== '404.html')) if (!locs.includes(`${siteUrl}/${f === 'index.html' ? '' : f}`)) err('sitemap.xml', `missing ${f}`);
if (!/Sitemap:/.test(fs.readFileSync(path.join(DIR, 'robots.txt'), 'utf8'))) err('robots.txt', 'no Sitemap line');
for (const a of ['favicon.svg', 'og.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) if (!fs.existsSync(path.join(DIR, 'assets', a))) err('assets', 'missing ' + a);
if (!fs.existsSync(path.join(DIR, 'manifest.webmanifest'))) err('manifest', 'missing');

warns.forEach(w => console.log('  warn  ' + w));
errors.forEach(e => console.log('  ERROR ' + e));
console.log(`Checked ${files.length} pages: ${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
