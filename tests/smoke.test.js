/* Browser smoke tests. Builds the site, loads every page in Chromium, exercises key behaviours.
 * Needs Playwright:  npm i --no-save playwright && npx playwright install chromium
 * (set CHROME_PATH to use an existing Chromium binary)                                          */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { test('playwright not installed', { skip: true }, () => {}); }
if (chromium) {
  const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, '_site'), LIVE = path.join(ROOT, '_site_live');
  const run = env => execFileSync('node', [path.join(ROOT, 'scripts', 'build.js')], { env: { ...process.env, ...env }, stdio: 'pipe' });
  let browser;
  const url = (dir, f) => 'file://' + path.join(dir, f);
  const pagesOf = dir => fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  const open = async (dir, f, w = 1280) => { const pg = await browser.newPage({ viewport: { width: w, height: 900 } }); pg.errs = [];
    pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/fonts|ERR_|net::/.test(m.text()) && pg.errs.push(m.text()));
    await pg.goto(url(dir, f)); await pg.waitForTimeout(150); return pg; };

  test('setup', async () => {
    run({});
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
    cfg.adsense = { client: 'ca-pub-1234567890', slot: '111' }; cfg.analytics = { gaId: 'G-TEST123' }; cfg.affiliates = { 'home-loan': 'https://partner.example/loan?ref=x' };
    const tmp = path.join(ROOT, '_test-config.json'); fs.writeFileSync(tmp, JSON.stringify(cfg));
    run({ SITE_CONFIG: tmp, OUT_DIR: LIVE }); fs.unlinkSync(tmp);
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  });

  test('every page loads without JS errors and has an h1', async () => {
    for (const f of pagesOf(SITE)) { const pg = await open(SITE, f); assert.deepEqual(pg.errs, [], f); assert.ok(await pg.$('h1'), f + ' has no h1'); await pg.close(); }
  });

  test('calculator pages render a real result (not the placeholder)', async () => {
    for (const f of ['index.html', 'salary-calculator.html', 'emi-calculator.html', 'sip-calculator.html', 'fd-calculator.html', 'gratuity-calculator.html', 'hra-calculator.html', 'salary-hike-calculator.html',
      'networth-calculator.html', 'life-simulator.html', 'fire-calculator.html', 'rent-vs-buy-calculator.html', 'offer-comparison.html']) {
      const pg = await open(SITE, f); const t = await pg.$eval('.hero-result .big', e => e.textContent.trim()); assert.ok(t && t !== '—', `${f}: "${t}"`); await pg.close();
    }
  });

  test('no horizontal overflow on mobile', async () => {
    for (const f of ['index.html', 'salary-calculator.html', 'life-simulator.html', 'offer-comparison.html', 'fire-calculator.html', 'rent-vs-buy-calculator.html', 'networth-calculator.html', '12-lpa-in-hand-salary.html', 'in-hand-salary-by-ctc.html']) {
      const pg = await open(SITE, f, 390); assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, f); await pg.close();
    }
  });

  test('share link restores exact inputs from the URL', async () => {
    const pg = await browser.newPage(); await pg.goto(url(SITE, 'salary-calculator.html') + '?ctc=2400000&basicPct=50');
    assert.equal(await pg.inputValue('#ctc'), '2400000'); assert.equal(await pg.inputValue('#basicPct'), '50');
    const big = await pg.$eval('.hero-result .big', e => e.textContent); assert.notEqual(big, '₹88,276'); assert.ok(await pg.$('.share-btn'));
    await pg.fill('#ctc', '3000000'); await pg.waitForTimeout(450); assert.match(pg.url(), /ctc=3000000/); await pg.close();
  });

  test('life simulator restores event settings from the URL', async () => {
    const pg = await browser.newPage(); await pg.goto(url(SITE, 'life-simulator.html') + '?home.on=0&jump.age=41');
    assert.equal(await pg.$eval('input[data-e=home][data-k=on]', e => e.checked), false); assert.equal(await pg.inputValue('input[data-e=jump][data-k=age]'), '41'); await pg.close();
  });

  test('unconfigured site shows no ad boxes, affiliate boxes or cookie banner', async () => {
    const pg = await open(SITE, 'emi-calculator.html'); assert.equal((await pg.$$('.ad-slot')).length, 0); assert.equal((await pg.$$('.offer')).length, 0);
    assert.equal((await pg.$$('.consent')).length, 0); await pg.close();
  });

  test('configured site: ad unit, sponsored affiliate link, cookie banner, decline', async () => {
    const ctx = await browser.newContext();                       // one visitor = one browser profile (localStorage is shared)
    const pg = await ctx.newPage(); await pg.goto(url(LIVE, 'emi-calculator.html')); await pg.waitForTimeout(150);
    assert.ok(await pg.$('.ad-live ins.adsbygoogle')); const a = await pg.$('.offer a'); assert.ok(a);
    assert.equal(await a.getAttribute('href'), 'https://partner.example/loan?ref=x'); assert.match(await a.getAttribute('rel'), /sponsored/);
    assert.ok(await pg.$('.consent')); await pg.click('.consent [data-c=no]'); assert.equal((await pg.$$('.consent')).length, 0);
    const pg2 = await ctx.newPage(); await pg2.goto(url(LIVE, 'emi-calculator.html')); await pg2.waitForTimeout(150);
    assert.equal((await pg2.$$('.consent')).length, 0, 'choice is remembered'); assert.equal((await pg2.$$('.ad-live')).length, 0, 'ads removed after decline');
    await ctx.close();
  });

  test('teardown', async () => { await browser.close(); fs.rmSync(LIVE, { recursive: true, force: true }); });
}
