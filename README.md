# InHand — money calculators for India

A fast, beautiful, dependency-free static site: in-hand salary (old vs new regime), life money simulator, net worth & health score, FIRE planner, rent vs buy, job-offer comparison, salary hike, HRA, EMI, SIP, FD and gratuity calculators.

## Quick start
```
npm run build              # builds the publishable site into _site/
python3 -m http.server 8000 --directory _site   # open http://localhost:8000
npm run verify             # tax tests + build + SEO/link checks + browser smoke tests
```
**New here? Read [LAUNCH.md](LAUNCH.md)** for the no-code steps to go live, rank on Google and earn money.

All launch settings (domain, email, analytics, AdSense, affiliate links) live in one file: `site.config.json`.

## What the build does (`scripts/build.js`)
Stamps your domain into canonical/sitemap, adds favicon + Open Graph/Twitter tags + FAQ rich-result data, generates the
"₹X LPA in-hand salary" pages from the tax engine, writes `sitemap.xml`, `robots.txt`, `ads.txt`, and prints a launch checklist.
Ad boxes and affiliate boxes stay hidden until real IDs/links are configured.

## Test
```
npm test              # tax engine: known values, rebate/marginal relief, monotonicity sweep
npm run check         # built site: titles, descriptions, canonicals, links, JSON-LD, sitemap
npm run test:browser  # Playwright: every page loads, results render, share links, ads/affiliate/consent behaviour
```
CI runs all of these on every push (`.github/workflows/ci.yml`); a failing check blocks deployment.

## Deploy
`.github/workflows/pages.yml` publishes `_site/` to GitHub Pages on every push to `main`.
One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

## Structure
- `assets/tax.js` — Indian income-tax engine (FY 2026-27). Pure functions; update slabs here each Budget.
- `assets/common.js` — shared header/footer, tool registry (`TOOLS`), sliders, donut chart, interactive line chart (`Common.lineChart`).
- `assets/style.css` — design system with light/dark themes.
- `*.html` — one page per calculator, each with SEO copy and FAQ.

