# Launch guide (no coding needed)

Everything technical is done. These are the steps only **you** can do, because they need your accounts.
Do them in order; each one is independent, so you can stop at any point and the site still works.

> You only ever edit **one file**: `site.config.json` (open it on GitHub → pencil icon → edit → "Commit changes").
> The site rebuilds and republishes itself within a couple of minutes.

## 1. Put the site online (free)
1. Merge the pull request into `main` (green "Merge pull request" button on GitHub).
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Wait ~2 minutes. Your site is live at `https://<your-username>.github.io/inhandsalarycalculator/`.
   (Private repo? GitHub Pages needs a paid plan for private repos — use Netlify or Cloudflare Pages instead: "Import from GitHub", build command `node scripts/build.js`, publish directory `_site`.)

## 2. Get a real domain (recommended — needed for AdSense)
1. Buy a domain (about ₹700–1,000/year) from any registrar (GoDaddy, Namecheap, Cloudflare, etc.). A short, memorable name like `inhandcalc.in` works.
2. Repo → **Settings → Pages → Custom domain** → enter it → follow the DNS instructions GitHub shows → tick **Enforce HTTPS**.
3. In `site.config.json` set `"siteUrl": "https://yourdomain.in"` and `"contactEmail": "you@yourdomain.in"`.
   This updates every canonical link, the sitemap, share images and the Contact page automatically.

## 3. Get found on Google (free)
1. Go to **search.google.com/search-console** → Add property → *URL prefix* → your domain.
2. Choose the *HTML tag* verification, copy only the code inside `content="…"`, and paste it into `"googleSiteVerification"` in `site.config.json`. Commit, wait 2 minutes, click **Verify**.
3. In Search Console → **Sitemaps** → submit `sitemap.xml`.
4. Patience: new sites usually take 2–8 weeks to start appearing and 3–6 months to build traffic. The 30+ "₹X LPA in-hand salary" pages are built to catch the searches people actually make.

## 4. Measure visitors (free)
1. **analytics.google.com** → create a GA4 property → Data stream → Web → copy the **Measurement ID** (looks like `G-ABC123XYZ`).
2. Paste it into `"analytics": { "gaId": "…" }`. A cookie notice appears automatically.

## 5. Earn from ads (Google AdSense)
1. Apply at **adsense.google.com** with your domain. You need the live site plus About, Contact and Privacy pages (all included). Approval usually takes days to a few weeks.
2. After approval: copy your publisher ID (`ca-pub-…`) into `"adsense": { "client": "…" }`.
3. In AdSense create a **Display ad unit** ("responsive"), copy its numeric slot ID into `"slot"`.
4. `ads.txt` is generated for you. Until approved, no ad boxes are shown to visitors.

## 6. Earn from affiliate links
1. Join affiliate programs relevant to each tool (credit cards and loans, mutual-fund or broker platforms, FD / savings platforms, insurance, job portals, rent-payment apps). Options include affiliate networks (for example Cuelinks, vCommission, Admitad) or partner programs run directly by lenders and fintech companies. Read each program's terms.
2. Paste each tracking link into the matching key under `"affiliates"`:
   `home-loan` (Rent vs Buy, EMI) · `mutual-funds` (SIP, FIRE, hike) · `fd` · `tax-saving` (salary) · `wealth` (net worth, life simulator) · `career` (offer comparison, gratuity) · `rent` (HRA).
3. Any link you leave empty simply hides that box. Links are labelled "Sponsored" automatically.

## 7. Tell people
- Post the tools where people already ask these questions (finance communities, LinkedIn, WhatsApp groups of colleagues). Be helpful, not spammy.
- Every result has a **Share** button that copies a link restoring the exact numbers.

## Keeping it reliable
- Every change is tested automatically (tax maths, every page, links, SEO tags). A broken build is never published.
- **Every February after the Union Budget:** tax slabs can change. Ask Claude to "update the tax rules for the new Budget" — the rules live in `assets/tax.js` with tests.
- On **1 April**, update the "FY 2026-27" labels (Claude can do this).
- Run the full check yourself anytime: `npm run verify` (needs Node 20).

## Honest expectations
Calculator sites grow slowly then compound: the first months earn little; traffic and income rise as more pages are indexed and trusted. The strongest levers are (1) fixing any wrong numbers quickly, (2) adding more useful tools and guides, and (3) good affiliate placements beside results.
