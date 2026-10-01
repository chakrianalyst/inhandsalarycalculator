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

  test('no page has duplicate element ids (including after building dynamic sections)', async () => {
    for (const f of pagesOf(SITE)) {
      const pg = await open(SITE, f);
      if (f === 'salary-calculator.html') { await pg.click('#mode [data-v=payslip]'); await pg.$$eval('details', ds => ds.forEach(d => (d.open = true))); }
      const dups = await pg.evaluate(() => { const seen = {}, d = []; document.querySelectorAll('[id]').forEach(e => { if (seen[e.id]) d.push(e.id); seen[e.id] = 1; }); return d; });
      assert.deepEqual(dups, [], f + ' has duplicate ids'); await pg.close();
    }
  });

  test('calculator pages render a real result (not the placeholder)', async () => {
    for (const f of ['index.html', 'salary-calculator.html', 'emi-calculator.html', 'sip-calculator.html', 'fd-calculator.html', 'gratuity-calculator.html', 'hra-calculator.html', 'salary-hike-calculator.html',
      'networth-calculator.html', 'life-simulator.html', 'fire-calculator.html', 'rent-vs-buy-calculator.html', 'offer-comparison.html']) {
      const pg = await open(SITE, f); const t = await pg.$eval('.hero-result .big', e => e.textContent.trim()); assert.ok(t && t !== '—', `${f}: "${t}"`); await pg.close();
    }
  });

  test('no horizontal overflow on phones (320, 360 and 390px) on any page, with every section expanded', async () => {
    const pages = pagesOf(SITE).filter(f => !/^\d+-lpa-/.test(f) || f === '12-lpa-in-hand-salary.html'); const bad = [];
    for (const w of [320, 360, 390]) for (const f of pages) {
      const pg = await browser.newPage({ viewport: { width: w, height: 800 } });
      await pg.goto(url(SITE, f) + (f === 'salary-calculator.html' ? '?bonus=10' : '')); await pg.waitForTimeout(80); await pg.$$eval('details', ds => ds.forEach(d => (d.open = true)));
      if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) bad.push(`${f}@${w}`); await pg.close();
    }
    assert.deepEqual(bad, []);
  });

  test('share link restores exact inputs from the URL', async () => {
    const pg = await browser.newPage(); await pg.goto(url(SITE, 'salary-calculator.html') + '?ctc=2400000&basic=50');
    assert.equal(await pg.inputValue('#ctc'), '24,00,000'); assert.equal(await pg.inputValue('#basic'), '50');
    const big = await pg.$eval('.hero-result .big', e => e.textContent); assert.notEqual(big, '₹88,276'); assert.ok(await pg.$('.share-btn'));
    await pg.fill('#ctc', '3000000'); await pg.waitForTimeout(450); assert.match(pg.url(), /ctc=3000000/); await pg.close();
  });

  test('salary: default is exactly ₹88,276 and the CTC is spelled out in words', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); const t = id => pg.$eval('#' + id, e => e.textContent.trim());
    assert.equal(await t('rMonth'), '₹88,276'); assert.equal(await t('ctcWords'), 'Twelve lakh rupees only');
    await pg.fill('#ctc', '475000'); assert.equal(await pg.inputValue('#ctc'), '4,75,000'); assert.equal(await t('ctcWords'), 'Four lakh seventy-five thousand rupees only');
    await pg.fill('#ctc', '15000000'); assert.equal(await t('ctcWords'), 'One crore fifty lakh rupees only'); assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('salary: % <-> ₹/yr <-> ₹/mo conversions keep the same meaning', async () => {
    const pg = await open(SITE, 'salary-calculator.html');
    await pg.click('#basicM [data-v=yr]'); assert.equal(await pg.inputValue('#basic'), '4,80,000');
    await pg.click('#basicM [data-v=mo]'); assert.equal(await pg.inputValue('#basic'), '40,000');
    await pg.click('#basicM [data-v=pct]'); assert.equal(await pg.inputValue('#basic'), '40');
    await pg.click('#basicM [data-v=yr]'); await pg.fill('#basic', '600000'); assert.equal(await pg.$eval('#v-basic', e => e.textContent), '₹6,00,000/yr'); await pg.close();
  });

  test('salary: bonus shown separately, allowance chips reduce special allowance, overshoot is flagged', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); const t = id => pg.$eval('#' + id, e => e.textContent.trim());
    await pg.$eval('#sec-bonus', e => (e.open = true)); await pg.fill('#bonus', '10'); assert.match(await t('rLbl'), /fixed pay/); assert.match(await t('rYear'), /bonus after tax/);
    await pg.fill('#bonus', '0'); await pg.$eval('#sec-other', e => (e.open = true)); const before = await t('specialRow');
    await pg.click('#ochips .chip:text("Phone")'); await (await pg.$('#orows .ov')).fill('3000'); assert.notEqual(await t('specialRow'), before);
    await pg.fill('#basic', '90'); await pg.fill('#ctc', '300000'); assert.ok((await pg.$$('#warns .warn.bad')).length >= 1); await pg.close();
  });

  test('salary: allowances, PF mode and regime survive a share link', async () => {
    const pg = await browser.newPage(); await pg.goto(url(SITE, 'salary-calculator.html') + '?basicM=yr&basic=480000&pfMode=cap&othersData=Phone~2000~mo~other&regime=old');
    assert.equal(await pg.$eval('#basicM .on', e => e.dataset.v), 'yr'); assert.equal(await pg.$eval('#pfMode .on', e => e.dataset.v), 'cap');
    assert.equal((await pg.$$('#orows .orow')).length, 1); assert.equal(await pg.$eval('#orows .nm', e => e.value), 'Phone');
    assert.match(await pg.$eval('#rPill', e => e.textContent), /Old regime selected/); await pg.close();
  });

  test('salary: gratuity base (basic / wages / custom), A + B summary, flexible-benefit chip', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); const t = id => pg.$eval('#' + id, e => e.textContent.trim());
    await pg.$eval('#sec-ret', e => (e.open = true)); assert.match(await t('ab'), /Total annual salary \(A\).*Retirals \(B\).*CTC/);
    assert.match(await t('gratInfo'), /4\.81% of basic/); const onBasic = await t('v-ret');
    await pg.click('#gratMode [data-v=wages]'); assert.match(await t('gratInfo'), /4\.81% of wages/); assert.notEqual(await t('v-ret'), onBasic);
    assert.equal(await pg.$eval('#gratCustom', e => e.hidden), true);
    await pg.click('#gratMode [data-v=custom]'); assert.equal(await pg.$eval('#gratCustom', e => e.hidden), false);
    await pg.fill('#gratc', '1,00,000'); assert.match(await t('gratInfo'), /₹1,00,000\/yr/);
    await pg.click('#gratMode [data-v=off]'); assert.match(await t('gratInfo'), /No gratuity/);
    await pg.$eval('#sec-other', e => (e.open = true)); await pg.click('#ochips .chip:text("Flexible benefit")'); assert.equal((await pg.$$('#orows .orow')).length, 1);
    assert.deepEqual(pg.errs, []); await pg.close();
    const p2 = await browser.newPage(); await p2.goto(url(SITE, 'salary-calculator.html') + '?gratMode=wages');
    assert.equal(await p2.$eval('#gratMode .on', e => e.dataset.v), 'wages'); assert.match(await p2.$eval('#gratInfo', e => e.textContent), /wages/); await p2.close();
  });

  test('salary: NPS / VPF appear as deductions, tax working matches the totals, pie shows percentages', async () => {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url(SITE, 'salary-calculator.html') + '?ctc=2500000'); await pg.waitForTimeout(200);
    const txt = sel => pg.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim()), num = x => Number(String(x).replace(/[^0-9]/g, ''));
    const plain = await txt('#pay'); assert.doesNotMatch(plain, /Employer NPS/);
    await pg.$eval('#sec-ret', e => (e.open = true)); await pg.fill('#nps', '8');
    const pay = await txt('#pay'); assert.match(pay, /Employer NPS contribution/); assert.match(pay, /Employer NPS \(goes to your NPS account\)/);
    assert.match(await txt('#npsEffect'), /take-home falls by .*income tax falls by/);
    await pg.fill('#vpf', '5,000'); assert.match(await txt('#pay'), /Voluntary PF \(VPF\)/); assert.match(await txt('#vpfEffect'), /no tax benefit in the new regime/);
    const pcs = await pg.$$eval('#legend .pc', els => els.map(e => parseFloat(e.textContent))); const sum = pcs.reduce((a, b) => a + b, 0);
    assert.ok(pcs.length >= 4 && sum > 99.4 && sum < 100.6, 'percentages sum to ' + sum);
    const calc = await txt('#taxCalc'); assert.match(calc, /Taxable income/); assert.match(calc, /Standard deduction/); assert.match(calc, /Total income tax/);
    const total = num(await pg.$$eval('#taxCalc tr', rs => rs.find(r => /^Total income tax/.test(r.innerText.trim())).innerText.match(/₹[\d,]+/)[0]));
    assert.equal(total, num((await txt('#cnS')).match(/₹[\d,]+/)[0]), 'tax working total equals the regime card');
    await pg.click('#regime [data-v=old]'); assert.match(await txt('#taxTag'), /Old regime/); assert.match(await txt('#taxCalc'), /Professional tax|Standard deduction/);
    assert.deepEqual(errs, []); await pg.close();
  });

  test('limits: percentages stop at their maximum, negatives are refused, rupee amounts stay free, links are clamped', async () => {
    const typeIn = async (pg, sel, v) => { await pg.click(sel); await pg.fill(sel, ''); await pg.keyboard.type(v); };
    const pg = await open(SITE, 'salary-calculator.html');
    await typeIn(pg, '#basic', '150'); assert.equal(await pg.inputValue('#basic'), '100'); assert.match(await pg.$eval('#sec-basic .limit-note', e => e.textContent), /Maximum is 100%/);
    await pg.$eval('#sec-hra', e => (e.open = true)); await typeIn(pg, '#hra', '250'); assert.equal(await pg.inputValue('#hra'), '100');
    await pg.$eval('#sec-bonus', e => (e.open = true)); await typeIn(pg, '#bonus', '777'); assert.equal(await pg.inputValue('#bonus'), '100');
    await typeIn(pg, '#payout', '500'); assert.equal(await pg.inputValue('#payout'), '200');
    await pg.$eval('#sec-ret', e => (e.open = true)); await typeIn(pg, '#nps', '999'); assert.equal(await pg.inputValue('#nps'), '100');
    await pg.click('#basicM [data-v=yr]'); await typeIn(pg, '#basic', '5,00,00,000'); assert.equal(await pg.inputValue('#basic'), '5,00,00,000');
    assert.deepEqual(pg.errs, []); await pg.close();
    const l = await browser.newPage(); await l.goto(url(SITE, 'salary-calculator.html') + '?basic=500&hra=900'); assert.equal(await l.inputValue('#basic'), '100'); assert.equal(await l.inputValue('#hra'), '100'); await l.close();
    const e = await open(SITE, 'emi-calculator.html');
    await typeIn(e, '#rate', '80'); assert.equal(await e.inputValue('#rate'), '30'); await typeIn(e, '#amt', '70000000'); assert.equal(await e.inputValue('#amt'), '70000000');
    await typeIn(e, '#yrs', '-5'); assert.equal(await e.inputValue('#yrs'), '1'); await e.close();
    const life = await open(SITE, 'life-simulator.html'); await typeIn(life, 'input[data-e=home][data-k=dp]', '500'); assert.equal(await life.inputValue('input[data-e=home][data-k=dp]'), '100'); await life.close();
  });

  test('accessibility: results panel is not a live region; one debounced announcer; toggle groups expose pressed state', async () => {
    const sal = await open(SITE, 'salary-calculator.html');
    assert.equal(await sal.$$eval('[aria-live]', e => e.filter(x => x.closest('section.results')).length), 0);
    assert.equal(await sal.$$eval('body > [role=status][aria-live=polite]', e => e.length), 1);
    const g = await sal.$$eval('.seg', gs => gs.every(x => x.getAttribute('role') === 'group' && [...x.querySelectorAll('button')].filter(b => b.getAttribute('aria-pressed') === 'true').length === 1)); assert.ok(g);
    await sal.fill('#ctc', '2000000'); await sal.waitForTimeout(1600);
    assert.match(await sal.$eval('body > [role=status]', e => e.textContent), /in-hand salary: ₹/i);
    assert.deepEqual(sal.errs, []); await sal.close();
  });

  test('help: "?" buttons explain jargon, work by keyboard, close on Esc, and link to their field', async () => {
    const sal = await open(SITE, 'salary-calculator.html');
    const n = await sal.$$eval('.help-btn', b => b.length); assert.ok(n >= 5, 'expected help buttons, got ' + n);
    const b = sal.locator('.help-btn').first(); await b.focus(); await sal.keyboard.press('Enter');
    assert.equal(await b.getAttribute('aria-expanded'), 'true'); assert.match(await sal.locator('.help-tip:visible').first().textContent(), /Cost to Company/);
    await sal.keyboard.press('Escape'); assert.equal(await b.getAttribute('aria-expanded'), 'false'); assert.equal(await sal.locator('.help-tip:visible').count(), 0);
    assert.match(await sal.$eval('#ctc', e => e.getAttribute('aria-describedby')), /help-ctc/);
    assert.deepEqual(sal.errs, []); await sal.close();
  });

  test('HRA city list: eight metros plus "any other city" drive the 50% / 40% limit on every page that uses it, and survive a share link', async () => {
    const sal = await open(SITE, 'salary-calculator.html'); const opts = await sal.$$eval('#city option', os => os.map(o => o.textContent));
    assert.deepEqual(opts, ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad', 'Any other city']); assert.equal(await sal.inputValue('#city'), 'Bengaluru');
    await sal.$eval('#sec-old', e => (e.open = true)); await sal.$eval('#sec-tax', e => (e.open = true)); await sal.fill('#rent', '30,000');
    assert.match(await sal.$eval('#hraInfo', e => e.textContent), /₹2,40,000 of your/);                         // 50% of ₹4.8L basic
    await sal.selectOption('#city', 'other'); assert.match(await sal.$eval('#hraInfo', e => e.textContent), /₹1,92,000 of your/);   // 40% of ₹4.8L basic
    assert.deepEqual(sal.errs, []); await sal.close();
    const link = await browser.newPage(); await link.goto(url(SITE, 'salary-calculator.html') + '?city=other'); assert.equal(await link.inputValue('#city'), 'other'); await link.close();
    const hra = await open(SITE, 'hra-calculator.html'); assert.match(await hra.$eval('#tbl', e => e.innerText), /50% of basic/); await hra.selectOption('#city', 'other'); assert.match(await hra.$eval('#tbl', e => e.innerText), /40% of basic/); await hra.close();
    const off = await open(SITE, 'offer-comparison.html'); assert.equal(await off.$$eval('select[data-cities]', e => e.length), 3); assert.equal(await off.inputValue('#city2'), 'other'); await off.close();
  });

  test('salary: payslip mode estimates tax and checks TDS', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); await pg.click('#mode [data-v=payslip]');
    assert.equal(await pg.$eval('#payMode', e => e.hidden), false); assert.equal(await pg.$eval('#ctcMode', e => e.hidden), true);
    await pg.fill('#pBasic', '1,50,000'); await pg.fill('#pHra', '75,000'); await pg.fill('#pOther', '75,000'); await pg.fill('#pTds', '0'); assert.equal(await pg.$eval('#tdsCard', e => e.hidden), true);
    await pg.fill('#pTds', '10000'); assert.equal(await pg.$eval('#tdsCard', e => e.hidden), false); assert.match(await pg.$eval('#tdsBody', e => e.textContent), /TDS/); assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('salary: old-regime deductions flip the winner and drive the break-even meter', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); await pg.fill('#ctc', '2500000');
    const before = await pg.$eval('#meterT', e => e.textContent);
    await pg.$eval('#sec-old', e => (e.open = true)); await pg.fill('#c80elss', '1,50,000'); await pg.fill('#hli', '2,00,000'); await pg.fill('#nps1b', '50,000'); await pg.fill('#d80s', '25,000'); await pg.fill('#rent', '60,000');
    assert.notEqual(await pg.$eval('#meterT', e => e.textContent), before); await pg.close();
  });

  test('life simulator: amounts have words, the plan is explained, a failing plan says why and what to fix', async () => {
    const pg = await open(SITE, 'life-simulator.html'); const t = id => pg.$eval('#' + id, e => e.innerText.replace(/\s+/g, ' ').trim());
    assert.equal(await t('incWords'), 'One lakh fifty thousand rupees only'); assert.match(await t('story'), /You take home .* a month and spend/); assert.match(await t('month'), /Left over/);
    assert.match(await t('hPill'), /lasts beyond/); assert.doesNotMatch(await pg.evaluate(() => document.body.innerText), /NaN|undefined|Infinity/);
    await pg.fill('#inc', '30,000'); await pg.fill('#expenses', '60,000');
    assert.equal(await t('hLbl'), 'Your money runs out at'); assert.match(await t('story'), /What would fix it/); assert.match(await t('month'), /Short each month/);
    assert.doesNotMatch(await pg.evaluate(() => document.body.innerText), /NaN|undefined|Infinity/);
    await pg.click('#incM [data-v=gross]'); assert.match(await t('incLabel'), /Yearly gross/); assert.match(await t('incCap'), /take home about/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('life simulator: event cards show what each event will really cost', async () => {
    const pg = await open(SITE, 'life-simulator.html'); const t = id => pg.$eval('#' + id, e => e.innerText.replace(/\s+/g, ' ').trim());
    assert.match(await t('info-home'), /upfront, then about .* a month/); assert.match(await t('info-car'), /one car only/);
    await pg.fill('input[data-e=car][data-k=every]', '8'); assert.match(await t('info-car'), /again every 8 years/);
    await pg.fill('input[data-e=home][data-k=price]', '1,00,00,000'); assert.match(await t('info-home'), /Cr/); await pg.close();
  });

  test('life simulator: a child or home that already exists is modelled as existing, not as a new event', async () => {
    const pg = await open(SITE, 'life-simulator.html'); const t = id => pg.$eval('#' + id, e => e.innerText.replace(/\s+/g, ' ').trim());
    const kid = pg.locator('.ev', { has: pg.locator('input[data-e=kid][data-k=on]') }), home = pg.locator('.ev', { has: pg.locator('input[data-e=home][data-k=on]') });
    assert.equal(await kid.getAttribute('data-past'), '0'); assert.match(await t('info-kid'), /then .* a month until/);
    await kid.locator('.toggle').click(); assert.equal(await kid.getAttribute('data-past'), '1'); assert.equal(await kid.locator('.only-planned').first().isVisible(), false); assert.equal(await kid.locator('.only-past').first().isVisible(), true);
    assert.match(await t('info-kid'), /already in your living costs/); assert.match(await t('story'), /your child/);
    await home.locator('.toggle').click(); assert.match(await t('info-home'), /You own a home worth/); assert.match(await t('month'), /Home EMI/);
    assert.deepEqual(pg.errs, []); await pg.close();
    const l = await browser.newPage(); await l.goto(url(SITE, 'life-simulator.html') + '?kid.past=1&kid.childAge=9&kid2.on=1');
    assert.equal(await l.$eval('.ev:has(input[data-e=kid][data-k=on])', e => e.dataset.past), '1'); assert.equal(await l.inputValue('input[data-e=kid][data-k=childAge]'), '9');
    assert.equal(await l.$eval('input[data-e=kid2][data-k=on]', e => e.checked), true); await l.close();
  });

  test('life simulator: habit controls change the result and are explained; future rupees are never shown alone; the method is on the page', async () => {
    const pg = await open(SITE, 'life-simulator.html'); const t = id => pg.$eval('#' + id, e => e.innerText.replace(/\s+/g, ' ').trim()), num = x => Number(String(x).replace(/[^0-9.]/g, ''));
    assert.equal(await pg.inputValue('#invest'), '80'); assert.equal(await pg.inputValue('#creep'), '25'); assert.match(await t('story'), /invest 80% of it/); assert.match(await t('month'), /You invest 80% of it/);
    const before = num((await t('hBig')).replace(/Cr.*/, ''));
    await pg.fill('#invest', '100'); await pg.fill('#creep', '0'); assert.match(await t('story'), /invest 100% of it/); assert.ok(num((await t('hBig')).replace(/Cr.*/, '')) > before, 'investing more and creeping less leaves more');
    await pg.fill('#invest', '150'); assert.equal(await pg.inputValue('#invest'), '100');
    assert.equal(await pg.$eval('#nomNote', e => e.hidden), true); await pg.click('#mode [data-v=nom]');
    assert.equal(await pg.$eval('#nomNote', e => e.hidden), false); assert.match(await t('nomNote'), /higher by age/); assert.match(await t('hSub'), /in today.s money/); assert.match(await t('kEnd2'), /in today.s money/);
    assert.equal(await pg.$eval('#howCalc', e => e.open), false); await pg.click('#howCalc > summary'); assert.match(await t('how'), /Year 1 with your numbers/); assert.match(await t('how'), /Savings: .* × 1\.\d+ \+ .* × 1\.\d+ = /);
    assert.match(await t('how'), /Left out:/); assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('life simulator: year-by-year table shows every year, marks events and retirement, follows the rupee mode, and downloads as CSV', async () => {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url(SITE, 'life-simulator.html')); await pg.waitForTimeout(200);
    const rows = async () => (await pg.$$('#yrTable tr')).length - 1, cell = (r, c) => pg.$eval(`#yrTable tr:nth-child(${r + 1}) td:nth-child(${c})`, e => e.innerText.trim());
    assert.equal(await rows(), 85 - 28); assert.match(await pg.$eval('#yrTable th:last-child', e => e.textContent), /Net worth/);
    assert.match(await cell(1, 1), /^28/); assert.match(await pg.$eval('#yrTable', e => e.innerText), /🏖️/); assert.equal(await pg.$$eval('#yrTable tr.ret', e => e.length), 1);
    assert.match(await pg.$eval('#yrTable', e => e.innerText), /🏠/);                                      // the home purchase year is flagged
    const real = await cell(30, 9); await pg.click('#mode [data-v=nom]'); assert.notEqual(await cell(30, 9), real, 'future rupees differ from today\'s money');
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnCsv')]); assert.match(dl.suggestedFilename(), /life-money-plan-future-rupees\.csv/);
    const csv = require('fs').readFileSync(await dl.path(), 'utf8').split('\n'); assert.match(csv[0], /^Age,Pay after tax/); assert.equal(csv.length, 1 + 85 - 28);
    await pg.fill('#inc', '30,000'); await pg.fill('#expenses', '60,000');                                // a failing plan: the table stops at the failure year
    assert.ok((await rows()) < 20); assert.equal(await pg.$$eval('#yrTable tr.bad', e => e.length), 2); assert.match(await pg.$eval('#yrTable', e => e.innerText), /Later years are not shown/);
    assert.deepEqual(errs, []); await pg.close();
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
