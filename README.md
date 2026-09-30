# InHand — money calculators for India

A fast, beautiful, dependency-free static site: in-hand salary (old vs new regime), life money simulator, net worth & health score, FIRE planner, rent vs buy, job-offer comparison, salary hike, HRA, EMI, SIP, FD and gratuity calculators.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
No build step. Deploy the folder as-is to GitHub Pages, Netlify or Cloudflare Pages.

## Structure
- `assets/tax.js` — Indian income-tax engine (FY 2025-26). Pure functions; update slabs here each Budget.
- `assets/common.js` — shared header/footer, tool registry (`TOOLS`), sliders, donut chart, interactive line chart (`Common.lineChart`).
- `assets/style.css` — design system with light/dark themes.
- `*.html` — one page per calculator, each with SEO copy and FAQ.

## Monetisation hooks
- `.ad-slot` placeholders — replace with AdSense / Ezoic units once approved.
- `.offer` blocks with `data-affiliate` — swap `href="#"` for real affiliate links (keep `rel="sponsored nofollow"`).

## Before launch
1. Replace `https://inhand.example` in canonical tags, `sitemap.xml` and `robots.txt` with your domain.
2. Add analytics and the AdSense script.
3. Re-verify tax slabs against the latest Finance Act.
