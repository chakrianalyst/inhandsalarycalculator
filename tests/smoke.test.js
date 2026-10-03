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
    for (const f of ['index.html', 'salary-calculator.html', 'emi-calculator.html', 'sip-calculator.html', 'fd-calculator.html', 'abroad-calculator.html', 'return-calculator.html', 'gratuity-calculator.html', 'hra-calculator.html', 'salary-hike-calculator.html',
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

  test('salary: default (₹200 a month professional tax) is exactly ₹88,276 and the CTC is spelled out in words', async () => {
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
    await pg.$eval('#sec-bonus', e => (e.open = true)); await pg.fill('#bonus', '10'); assert.match(await t('rLbl'), /fixed pay/); assert.match(await t('rYear'), /before tax, ₹[\d,]+ after tax/);
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
    await typeIn(e, '#rate', '80'); assert.equal(await e.inputValue('#rate'), '36'); await typeIn(e, '#amt', '70000000'); assert.equal((await e.inputValue('#amt')).replace(/,/g, ''), '70000000');
    await typeIn(e, '#yrs', '-5'); assert.equal(await e.inputValue('#yrs'), '0'); await e.close();
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

  test('professional tax: one plain field in rupees a month, limited to the legal cap, no state picker', async () => {
    const sal = await open(SITE, 'salary-calculator.html'); await sal.$eval('#sec-tax', e => (e.open = true));
    assert.equal(await sal.inputValue('#pt'), '200'); assert.equal(await sal.$('#ptState'), null, 'no state picker'); assert.equal(await sal.$('#ptWoman'), null);
    const t = async id => (await sal.textContent('#' + id)).trim();
    assert.equal(await t('rMonth'), '₹88,276');
    await sal.fill('#pt', '0'); await sal.waitForTimeout(250); assert.equal(await t('rMonth'), '₹88,476', 'no professional tax adds ₹200 a month');
    await sal.fill('#pt', '500'); await sal.waitForTimeout(250); assert.equal(await t('rMonth'), '₹88,268', '₹500 a month is limited to ₹2,500 a year');
    assert.deepEqual(sal.errs, []); await sal.close();
  });

  test('polish: PF label, regime saving in the badge, bonus chips, mobile bar above the cookie banner', async () => {
    const sal = await open(SITE, 'salary-calculator.html'); await sal.fill('#ctc', '2000000');
    assert.match(await sal.$eval('#pfMode', e => e.textContent), /Capped at ₹15,000 basic/);
    assert.match(await sal.$eval('#rPill', e => e.textContent), /best for you\)( · saves you ₹[\d,]+\/yr)?$/);
    await sal.close();
    const bon = await browser.newPage(); await bon.goto(url(SITE, 'salary-calculator.html') + '?bonus=10'); await bon.waitForTimeout(300);
    assert.match(await bon.$eval('#rChips', e => e.textContent), /Fixed pay: ₹[\d,]+\/mo.*Bonus after tax: ₹[\d,]+\/yr/); await bon.close();
    const live = await browser.newPage({ viewport: { width: 390, height: 800 } }); await live.goto(url(LIVE, 'salary-calculator.html')); await live.waitForSelector('.consent');
    await live.evaluate(() => window.scrollTo(0, 900)); await live.waitForTimeout(500);
    const [mb, cb] = await live.evaluate(() => [document.querySelector('.m-bar').getBoundingClientRect(), document.querySelector('.consent').getBoundingClientRect()]);
    assert.ok(mb.bottom <= cb.top + 1, `m-bar ${mb.bottom} overlaps banner ${cb.top}`); await live.close();
  });

  test('life sim: age sliders start at your age, career jump can repeat, education and home price rise have their own inputs', async () => {
    const life = await open(SITE, 'life-simulator.html'); await life.fill('#age', '35');
    assert.equal(await life.$eval('input[data-e=car][data-k=age]', e => +e.min), 35); assert.equal(await life.$eval('input[data-e=wed][data-k=age]', e => +e.value), 35);
    assert.ok(await life.$eval('input[data-e=jump][data-k=every]', e => !!e)); assert.ok(await life.$eval('#eduInfl', e => e.value === '10')); assert.equal(await life.inputValue('#homeG'), '');
    await life.fill('input[data-e=jump][data-k=every]', '4'); assert.match(await life.$eval('#info-jump', e => e.textContent), /again every 4 years/);
    assert.deepEqual(life.errs, []); await life.close();
  });

  test('life sim: pension, market crash, child wedding, post-retirement return, and Plan A vs this plan', async () => {
    const life = await open(SITE, 'life-simulator.html');
    for (const sel of ['input[data-e=pension][data-k=monthly]', 'input[data-e=crash][data-k=drop]', 'input[data-e=kid][data-k=wedCost]', '#retRet']) assert.ok(await life.$(sel), sel);
    assert.equal(await life.isVisible('#planTbl'), false);
    await life.click('#planSave'); assert.equal(await life.isVisible('#planTbl'), true);
    const endRow = () => life.$eval('#planTbl tbody tr:nth-child(3)', e => e.innerText);
    await life.fill('#retire', '52'); assert.match(await life.$eval('#planTbl tbody tr:first-child', e => e.innerText), /Age 58\s+Age 52/);
    assert.ok(await life.$eval('#chart', e => e.textContent.includes('Plan A net worth')));
    await life.click('#planClear'); assert.equal(await life.isVisible('#planTbl'), false);
    await life.$eval('.ev:has(input[data-e=crash][data-k=on]) input[data-k=on]', e => e.click()); assert.match(await life.$eval('#info-crash', e => e.textContent), /fall by 30%/);
    assert.deepEqual(life.errs, []); await life.close();
  });

  test('life sim year table: events show the inflated price in that year (and today’s price beside it); Today’s money view divides it back', async () => {
    const life = await open(SITE, 'life-simulator.html');
    const txt = await life.$$eval('#yrTable tr', rs => (rs.find(r => /🚗/.test(r.textContent)) || { innerText: '' }).innerText); assert.match(txt, /×1\.\d\d/); assert.match(txt, /Car[^\n]*₹[\d.]+ ?(L|Cr)[^\n]*today/); 
    const m = txt.match(/×(\d\.\d+)/); assert.ok(+m[1] > 1.2, 'price level should be well above 1 for a car bought years from now');
    await life.click('#yrMode button[data-v=real]'); assert.match(await life.$$eval('#yrTable tr', rs => (rs.find(r => /🚗/.test(r.textContent)) || { innerText: '' }).innerText), /Car[^\n]*at that year/);
    assert.deepEqual(life.errs, []); await life.close();
  });

  test('salary: allowance chips stay readable (dark text on a light chip, not hero-chip styling)', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); await pg.$eval('#sec-other', e => (e.open = true));
    const [c, bg] = await pg.$eval('#ochips .chip', e => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
    assert.notEqual(c, 'rgb(255, 255, 255)'); assert.notEqual(bg, 'rgba(255, 255, 255, 0.18)'); await pg.close();
  });

  test('FD calculator: tenure in years/months/days, interest payout, RD, tax and real return', async () => {
    const pg = await open(SITE, 'fd-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText);
    assert.match(await hero(), /₹7,07,389/);                                                       // ₹5 L, 7%, quarterly, 5 years
    await pg.fill('#yrs', '0'); await pg.fill('#mon', '6'); await pg.fill('#day', '0'); assert.match(await hero(), /₹5,17,653/);      // exactly two quarters
    await pg.fill('#day', '10'); const withDays = await hero(); assert.doesNotMatch(withDays, /₹5,17,653/); assert.match(await pg.$eval('#tenHint', e => e.textContent), /6 months 10 days/);
    await pg.click('#tenChips [data-t="1,0,0"]'); assert.equal(await pg.inputValue('#yrs'), '1'); assert.equal(await pg.inputValue('#mon'), '0');
    await pg.click('#mode [data-v=payout]'); assert.match(await hero(), /every month[\s\S]*₹2,917/);
    await pg.click('#mode [data-v=rd]'); assert.equal(await pg.isVisible('#fDays'), false); assert.equal(await pg.isVisible('#d'), true);
    await pg.click('#mode [data-v=fd]'); await pg.fill('#yrs', '5'); await pg.fill('#mon', '0'); await pg.fill('#day', '0');
    await pg.$eval('#sec-tax', e => (e.open = true)); await pg.selectOption('#slab', '30'); assert.match(await pg.$eval('#kpis', e => e.innerText), /Tax on interest \(30%\)/);
    assert.equal(await pg.$eval('#warns', e => e.textContent), '');                                    // ₹5 L earns at most about ₹47,000 a year: under the ₹50,000 TDS limit
    await pg.fill('#p', '2000000'); assert.match(await pg.$eval('#warns', e => e.textContent), /TDS/);
    assert.match(await pg.$eval('.hero-result', e => e.textContent), /Real return after tax and inflation/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('EMI calculator: tenure in years and months, extra payments, fee, month view and loan eligibility', async () => {
    const pg = await open(SITE, 'emi-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText), kp = () => pg.$eval('#kpis', e => e.innerText);
    assert.match(await hero(), /₹43,391/); assert.match(await kp(), /₹54,13,879/);
    await pg.fill('#yrs', '1'); await pg.fill('#mon', '6'); assert.match(await pg.$eval('#tenHint', e => e.textContent), /18 months/); assert.match(await hero(), /1 year 6 months/);
    await pg.click('#typeChips .chip:text("Home")'); assert.equal(await pg.inputValue('#yrs'), '20');
    await pg.$eval('#sec-pre', e => (e.open = true)); await pg.fill('#extra', '5,000'); assert.match(await kp(), /Interest you save[\s\S]*₹13,89,250/); assert.match(await kp(), /4 years 5 months sooner/);
    await pg.fill('#extra', '0'); await pg.fill('#lump', '5,00,000'); await pg.fill('#lumpM', '24'); assert.match(await hero(), /prepaid after month 24/);
    await pg.$eval('#sec-fee', e => (e.open = true)); await pg.fill('#fee', '1'); assert.match(await hero(), /Rate you really pay with the fee: 8\.\d\d%/);
    await pg.click('#view [data-v=month]'); assert.ok((await pg.$$('#sched tr')).length > 100);
    await pg.click('#mode [data-v=afford]'); assert.match(await hero(), /borrow up to[\s\S]*₹46,09,234/); assert.equal(await pg.isVisible('#balChart'), false);
    await pg.fill('#yrs', '0'); await pg.fill('#mon', '0'); assert.match(await pg.$eval('#warns', e => e.textContent), /at least 1 month/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('SIP calculator: monthly SIP, step-up, lump sum, goal planner, tax, delay table and convention', async () => {
    const pg = await open(SITE, 'sip-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText), kp = () => pg.$eval('#kpis', e => e.innerText);
    assert.match(await hero(), /₹47,59,314/); assert.match(await pg.$eval('#delayTbl', e => e.innerText), /5 years later/);
    await pg.fill('#step', '10'); assert.match(await hero(), /₹82,74,718/); assert.match(await pg.$eval('#yrTbl', e => e.innerText), /₹11,000/);
    await pg.fill('#step', '0'); await pg.fill('#yrs', '1'); await pg.fill('#mon', '6'); assert.match(await hero(), /1 year 6 months/);
    await pg.click('#tenChips [data-t="15"]'); assert.equal(await pg.inputValue('#yrs'), '15');
    await pg.$eval('#sec-tax', e => (e.open = true)); await pg.selectOption('#taxk', 'equity'); assert.match(await kp(), /Estimated tax/); await pg.selectOption('#taxk', 'none');
    await pg.selectOption('#conv', 'nom'); assert.match(await hero(), /₹50,45,/); await pg.selectOption('#conv', 'eff');
    await pg.click('#mode [data-v=lump]'); await pg.fill('#lump', '5,00,000'); assert.match(await hero(), /grow to[\s\S]*₹27,36,783/); assert.equal(await pg.isVisible('#sip'), false);
    await pg.click('#mode [data-v=goal]'); await pg.fill('#lump', '0'); assert.match(await hero(), /monthly SIP of[\s\S]*₹/);
    await pg.fill('#yrs', '0'); await pg.fill('#mon', '0'); assert.match(await pg.$eval('#warns', e => e.textContent), /at least 1 month/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Gratuity calculator: years and months, part-year rule, eligibility, 50% rule, government, projection', async () => {
    const pg = await open(SITE, 'gratuity-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText);
    assert.match(await hero(), /₹2,88,462/);
    await pg.fill('#mon', '7'); assert.match(await hero(), /₹3,17,308/); assert.match(await pg.$eval('#svcHint', e => e.textContent), /counts as 11 years/);
    await pg.fill('#mon', '6'); assert.match(await hero(), /₹2,88,462/);                              // exactly 6 months does not round up
    await pg.fill('#yrs', '3'); assert.match(await hero(), /not payable yet/); assert.match(await pg.$eval('#gNote', e => e.textContent), /away/);
    await pg.$eval('#ftRow input', e => e.click()); assert.match(await hero(), /Estimated gratuity/);                               // fixed-term: eligible after 1 year
    await pg.$eval('#ftRow input', e => e.click()); await pg.fill('#yrs', '10'); await pg.fill('#mon', '0');
    await pg.$eval('#sec-50', e => (e.open = true)); await pg.fill('#total', '1,50,000'); assert.match(await hero(), /₹4,32,692/); assert.match(await pg.$eval('#gNote', e => e.textContent), /half of your total pay/);
    assert.ok((await pg.$$('#projTbl tr')).length > 2);
    await pg.click('#kind [data-v=govt]'); assert.equal(await pg.isVisible('#ftRow'), false); assert.match(await pg.$eval('#gNote', e => e.textContent), /fully tax-free/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('HRA calculator: three-way test, financial-year metro list, months, rent needed, tax saved', async () => {
    const pg = await open(SITE, 'hra-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText);
    assert.match(await hero(), /₹2,76,000/); assert.match(await hero(), /Metro: 50% of basic/); assert.match(await pg.$eval('#tips', e => e.textContent), /limited by rent/);
    await pg.click('#fy [data-v="2025"]'); assert.match(await hero(), /Non-metro: 40% of basic/);                      // Bengaluru was not a metro for FY 2025-26
    await pg.click('#fy [data-v="2026"]'); await pg.fill('#months', '6'); assert.match(await hero(), /₹1,38,000/); assert.match(await hero(), /6 months/); await pg.fill('#months', '12');
    await pg.fill('#rent', '4,000'); assert.match(await pg.$eval('#warns', e => e.textContent), /not more than 10%/);
    await pg.fill('#rent', '30,000'); assert.match(await pg.$eval('#warns', e => e.textContent), /landlord’s PAN/); assert.match(await pg.$eval('#kpis', e => e.innerText), /Tax you save/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Salary hike calculator: % or new CTC, inflation check, keep per ₹100, projection', async () => {
    const pg = await open(SITE, 'salary-hike-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText), kp = () => pg.$eval('#kpis', e => e.innerText);
    assert.match(await hero(), /\+₹11,060/); assert.match(await kp(), /After inflation[\s\S]*8\.5%/); assert.match(await kp(), /per extra ₹100 of CTC[\s\S]*₹88/);
    assert.equal((await pg.$$('#proj tr')).length, 7);
    await pg.click('#hmode [data-v=ctc]'); assert.equal(await pg.isVisible('#hike'), false); await pg.fill('#newctc', '10,50,000'); assert.match(await pg.$eval('#warns', e => e.textContent), /below inflation/);
    await pg.fill('#newctc', '9,00,000'); assert.match(await pg.$eval('#warns', e => e.textContent), /pay cut/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Offer comparison: horizon, yearly raise, variable payout, city-based professional tax and a tie', async () => {
    const pg = await open(SITE, 'offer-comparison.html'); const hero = () => pg.$eval('#hero', e => e.innerText);
    assert.match(await hero(), /Best offer over 4 years/); const four = await hero();
    await pg.selectOption('#hz', '1'); assert.match(await hero(), /Best offer over 1 year/); assert.notEqual(await hero(), four);
    await pg.selectOption('#hz', '4'); await pg.fill('#g0', '0'); await pg.fill('#g1', '0'); const flat = await pg.$eval('#tbl', e => e.innerText); assert.match(flat, /Yearly raise\s+0%\s+0%/);
    await pg.fill('#pay', '50'); assert.notEqual(await pg.$eval('#tbl', e => e.innerText), flat);                  // lower variable payout changes the numbers
    for (const i of [0, 1]) { await pg.fill('#ctc' + i, '2000000'); await pg.fill('#var' + i, '0'); await pg.fill('#bonus' + i, '0'); await pg.fill('#esop' + i, '0'); await pg.fill('#rent' + i, '0'); await pg.fill('#oth' + i, '0'); await pg.selectOption('#city' + i, 'Bengaluru'); }
    assert.match(await hero(), /Too close to call/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('FIRE calculator: lasting-corpus target, lean/fat styles, coast number, stress test and pension', async () => {
    const pg = await open(SITE, 'fire-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText);
    assert.match(await txt('#hero'), /Age 48/); assert.match(await txt('.kpis'), /₹5\.30 Cr/); assert.match(await txt('#verdict'), /short at 45/);
    assert.match(await txt('#styles'), /Lean[\s\S]*Regular[\s\S]*Fat/); assert.match(await txt('#coast'), /Coast|invested today/); assert.equal((await pg.$$('#grid tr')).length, 4);
    await pg.$eval('details.adv', e => (e.open = true)); await pg.fill('#pension', '30,000'); assert.match(await txt('.kpis'), /Corpus needed[\s\S]*₹2\./);        // a ₹30,000 pension roughly halves the corpus
    await pg.fill('#pension', '0'); await pg.fill('#sav', '2,00,000'); assert.match(await txt('#verdict'), /on track/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Rent vs buy: tax options, rent yield, break-even appreciation and sensitivity grid', async () => {
    const pg = await open(SITE, 'rent-vs-buy-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText);
    assert.match(await txt('#hero'), /renting & investing wins by/); assert.match(await txt('.kpis'), /Rent yield[\s\S]*3\.36%/); assert.match(await txt('.kpis'), /prices rise faster than[\s\S]*9\.\d%/);
    assert.equal((await pg.$$('#grid tr')).length, 5); assert.match(await txt('#note'), /Capital-gains tax is included/);
    const before = await txt('#hero'); await pg.$eval('details.adv', e => (e.open = true)); await pg.$eval('#lben', e => e.click()); assert.notEqual(await txt('#hero'), before); assert.equal(await pg.isVisible('#fSlab'), true); assert.match(await txt('#tbl'), /Home-loan tax benefit received/);
    await pg.fill('#rent', '100,000'); assert.match(await pg.$eval('#yieldHint', e => e.textContent), /high for India/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Net worth: Indian grouping on amounts, EMI burden, card dues insight, and saved snapshots with export', async () => {
    const ctx = await browser.newContext(); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url(SITE, 'networth-calculator.html')); await pg.waitForTimeout(200);
    assert.equal(await pg.inputValue('#inc'), '18,00,000'); assert.equal(await pg.$eval('.item input.val', e => e.value), '3,50,000');
    assert.match(await pg.$eval('#parts', e => e.innerText), /EMI burden/); assert.match(await pg.$eval('#insights', e => e.innerText), /EMIs take 37%/); assert.match(await pg.$eval('#insights', e => e.innerText), /cards and dues/);
    assert.equal(await pg.isVisible('#btnCsv'), false); await pg.click('#btnSnap'); assert.equal(await pg.isVisible('#btnCsv'), true); assert.equal((await pg.$$('#histTbl tr')).length, 2);
    await pg.fill('.item input.val', '4,50,000'); assert.match(await pg.$eval('#kA', e => e.textContent), /₹1,01,20,000/);
    await pg.reload(); await pg.waitForTimeout(200); assert.equal((await pg.$$('#histTbl tr')).length, 2);          // the snapshot survives a reload
    await pg.click('#histTbl button[data-d]'); assert.equal((await pg.$$('#histTbl tr')).length, 0);
    assert.deepEqual(errs, []); await ctx.close();
  });

  test('salary: other payslip deductions (cab, lunch, ESPP) lower in-hand by that amount after tax, show in the breakdown, and survive a share link', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); const t = id => pg.$eval('#' + id, e => e.textContent.trim());
    assert.equal(await t('rMonth'), '₹88,276'); await pg.$eval('#sec-ded', e => (e.open = true));
    await pg.click('#dchips .chip:text("Cab")'); await pg.fill('#drows .orow:nth-child(1) .ov', '3,000'); assert.equal(await t('rMonth'), '₹85,276');
    await pg.click('#dchips .chip:text("Lunch")'); await pg.fill('#drows .orow:nth-child(2) .ov', '2,000'); assert.equal(await t('rMonth'), '₹83,276');
    assert.match(await pg.$eval('#pay', e => e.innerText), /Cab \/ transport[\s\S]*Lunch \/ cafeteria/); assert.match(await t('dedTotal'), /Total: ₹5,000 a month/); assert.match(await pg.$eval('#rChips', e => e.textContent), /₹5,000\/mo of other deductions/);
    await pg.click('#drows .orow:nth-child(2) .x'); assert.equal(await t('rMonth'), '₹85,276');
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'salary-calculator.html') + '?dedData=' + encodeURIComponent('Cab~3000~mo')); await lk.waitForTimeout(300); assert.equal(await lk.$eval('#rMonth', e => e.textContent.trim()), '₹85,276'); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Move abroad calculator: country and city presets, tax breakdown, break-even, grid and share link', async () => {
    const pg = await open(SITE, 'abroad-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText), hero = () => txt('#hero');
    assert.match(await hero(), /After 10 years[\s\S]*behind[\s\S]*staying in India/); assert.equal(await pg.inputValue('#rentA'), '3,800'); assert.match(await txt('#payTbl'), /Income tax[\s\S]*Take-home pay/);
    assert.match(await txt('#tips'), /\$12\d,\d\d\d a year/); assert.equal((await pg.$$('#grid tr')).length, 5); assert.equal((await pg.$$('#yrTbl tr')).length, 11);
    await pg.selectOption('#country', 'AE'); assert.equal(await pg.inputValue('#fx'), '26.1'); assert.equal(await pg.inputValue('#rentA'), '7,000'); assert.match(await hero(), /ahead of staying in India/);
    await pg.selectOption('#country', 'CA'); assert.deepEqual(await pg.$$eval('#city option', o => o.map(x => x.textContent)), ['Toronto', 'Vancouver', 'Calgary']);
    await pg.selectOption('#country', 'US'); await pg.selectOption('#city', 'aus'); assert.match(await hero(), /ahead of staying in India/);       // Texas: no state income tax, cheaper rent
    await pg.selectOption('#years', '5'); assert.match(await hero(), /After 5 years/); await pg.click('#mode [data-v=real]'); assert.match(await hero(), /today’s money/);
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'abroad-calculator.html') + '?country=CA&city=cal&rentA=2000'); await lk.waitForTimeout(300); assert.equal(await lk.inputValue('#city'), 'cal'); assert.equal(await lk.inputValue('#rentA'), '2,000'); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Move abroad: UK and Germany presets, pensions, partner toggle and provident fund', async () => {
    const pg = await open(SITE, 'abroad-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText), hero = () => txt('#hero');
    assert.deepEqual(await pg.$$eval('#country option', o => o.map(x => x.value)), ['US', 'CA', 'AU', 'SG', 'AE', 'UK', 'DE']);
    await pg.selectOption('#country', 'UK'); assert.equal(await pg.inputValue('#fx'), '127.3'); assert.equal(await pg.inputValue('#gross'), '85,000'); assert.equal(await pg.inputValue('#rentA'), '2,300'); assert.equal(await pg.inputValue('#retPct'), '5');
    assert.match(await txt('#payTbl'), /National Insurance|PF, payroll/); await pg.selectOption('#country', 'DE'); assert.equal(await pg.inputValue('#city') , 'ber'); assert.equal(await pg.inputValue('#retPct'), '0'); assert.match(await txt('#kpis'), /Take-home each month/);
    await pg.selectOption('#country', 'US'); const solo = await hero(); const rent = await pg.inputValue('#rentA');
    await pg.$eval('#partner', e => e.click()); assert.equal(await pg.isVisible('#pCtc'), true); assert.notEqual(await pg.inputValue('#rentA'), rent); assert.notEqual(await hero(), solo);
    await pg.$eval('#partner', e => e.click()); assert.equal(await pg.inputValue('#rentA'), rent); assert.equal(await hero(), solo);                           // switching off restores the single-person costs
    await pg.$eval('#sec-ret', e => (e.open = true)); await pg.$eval('#epf', e => e.click()); assert.notEqual(await hero(), solo); assert.match(await txt('#kpis'), /Of which in pensions/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Return to India calculator: best year, runway, bringing money home, retirement choice, sensitivity and share link', async () => {
    const pg = await open(SITE, 'return-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText), hero = () => txt('#hero');
    assert.match(await hero(), /In 2 years/); assert.equal((await pg.$$('#yrTbl tr')).length, 12); assert.match(await txt('#yrTbl'), /Not yet[\s\S]*Not yet[\s\S]*✓ Ready/);
    assert.match(await txt('#kpis'), /Without a job, money lasts[\s\S]*17 years/); assert.match(await txt('#homeTbl'), /Tax on your profits[\s\S]*Money you start life in India with/); assert.match(await txt('#homeTbl'), /left abroad/);
    await pg.selectOption('#when', '3'); assert.match(await txt('#hero'), /Returning in 3 years: covered/);
    await pg.$eval('#sec-tax', e => (e.open = true)); assert.equal(await pg.isVisible('#penalty'), false); await pg.selectOption('#retMode', 'withdraw'); assert.equal(await pg.isVisible('#penalty'), true); assert.match(await txt('#homeTbl'), /cashed out/);
    await pg.fill('#jobCtc', '30,00,000'); assert.match(await hero(), /Now/); await pg.fill('#jobCtc', '0'); await pg.selectOption('#retMode', 'leave');
    await pg.selectOption('#country', 'AE'); assert.equal(await pg.inputValue('#fx'), '26.1'); assert.match(await txt('#cashL'), /AED/); assert.equal((await pg.$$('#grid tr')).length, 5);
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'return-calculator.html') + '?spend=60000'); await lk.waitForTimeout(300); assert.equal(await lk.inputValue('#spend'), '60,000'); assert.match(await lk.$eval('#hero', e => e.innerText), /Now/); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('readable colours: green, red and brand text meet 4.5:1 on their surfaces in light and dark; index quick check agrees with the salary page', async () => {
    for (const theme of ['light', 'dark']) {
      const pg = await browser.newPage({ colorScheme: theme }); await pg.goto(url(SITE, 'sip-calculator.html')); await pg.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      const ratios = await pg.evaluate(() => {
        const lum = c => { const m = c.match(/[\d.]+/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
        const mk = (cls, parentCls) => { const host = document.createElement('div'); host.className = parentCls; const e = document.createElement('div'); e.className = cls; e.textContent = 'x'; host.appendChild(e); document.querySelector('.results').appendChild(host); const col = getComputedStyle(e).color; let p = e, bg = 'rgb(255,255,255)'; while (p) { const c = getComputedStyle(p).backgroundColor; if (c !== 'rgba(0, 0, 0, 0)') { bg = c; break; } p = p.parentElement; } host.remove(); const a = lum(col), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
        const link = document.querySelector('.tool-card .go, .go') || document.querySelector('a'); const lc = getComputedStyle(link).color, lb = getComputedStyle(document.body).backgroundColor; const a = lum(lc), b = lum(lb === 'rgba(0, 0, 0, 0)' ? 'rgb(255,255,255)' : lb);
        return { good: mk('v', 'kpi good'), bad: mk('v', 'kpi bad'), link: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
      assert.ok(ratios.good >= 4.5, `${theme} green ${ratios.good}`); assert.ok(ratios.bad >= 4.5, `${theme} red ${ratios.bad}`); assert.ok(ratios.link >= 4.4, `${theme} brand text ${ratios.link}`); await pg.close();
    }
    const ix = await open(SITE, 'index.html'); await ix.fill('#q', '1200000'); await ix.waitForTimeout(200); const quick = await ix.$eval('#qOut', e => e.textContent); await ix.close();
    assert.match(quick, /88,276/);
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
    const nom = await cell(30, 10); await pg.click('#yrMode [data-v=real]'); assert.notEqual(await cell(30, 10), nom, 'future rupees differ from today\'s money'); await pg.click('#yrMode [data-v=nom]');
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#btnCsv')]); assert.match(dl.suggestedFilename(), /life-money-plan-future-rupees\.csv/);
    const csv = require('fs').readFileSync(await dl.path(), 'utf8').split('\n'); assert.match(csv[0], /^Age,Prices \(x today\),Pay after tax/); assert.equal(csv.length, 1 + 85 - 28);
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

  test('crafted share links cannot run script (names and every field are escaped)', async () => {
    const P = '<img src=x onerror="window.__x=1">';
    const cases = [['salary-calculator.html', { othersData: P + '~5000~mo~other', dedData: P + '~5000~mo', ctc: '1500000' }], ['offer-comparison.html', { n0: P, n1: P, n2: P }]];
    for (const f of pagesOf(SITE).filter(x => !/^\d|ctc-by/.test(x))) if (!cases.some(c => c[0] === f)) cases.push([f, null]);
    for (const [f, q] of cases) {
      const pg = await browser.newPage(); await pg.addInitScript(() => { window.__x = 0; });
      let query = q; if (!query) { await pg.goto(url(SITE, f)); query = Object.fromEntries(await pg.$$eval('input[id]', els => els.filter(e => e.type === 'text' || e.type === 'search' || !e.type).map(e => e.id))
        .then(ids => ids.map(i => [i, P]))); }
      await pg.goto(url(SITE, f) + '?' + new URLSearchParams(query).toString()); await pg.waitForTimeout(500);
      assert.equal(await pg.evaluate(() => window.__x), 0, f + ' ran injected script'); await pg.close();
    }
  });

  test('extreme inputs never show NaN or Infinity on any calculator', async () => {
    for (const f of pagesOf(SITE).filter(x => /calculator|simulator|offer-comparison/.test(x) && !/^\d/.test(x))) for (const mode of ['zero', 'blank', 'huge', 'neg']) {
      const pg = await open(SITE, f); await pg.waitForTimeout(150);
      await pg.evaluate(m => { document.querySelectorAll('details').forEach(d => d.open = true);
        document.querySelectorAll('input[id]:not([type=range]):not([type=checkbox]):not([type=hidden])').forEach(el => { if (el.type === 'text' && !el.dataset.money && !/^[0-9.,]*$/.test(el.value)) return;
          el.value = m === 'zero' ? '0' : m === 'blank' ? '' : m === 'huge' ? '99999999999999' : '-500'; el.dispatchEvent(new Event('input', { bubbles: true })); }); }, mode);
      await pg.waitForTimeout(250);
      const bad = await pg.evaluate(() => (document.body.innerText.match(/.{0,25}(NaN|Infinity|undefined|\[object).{0,15}/g) || []).slice(0, 3));
      assert.deepEqual(bad, [], f + ' (' + mode + ') shows ' + bad.join(' | ')); assert.deepEqual(pg.errs, [], f + ' (' + mode + ') threw'); await pg.close();
    }
  });

  test('guide pages show engine-computed figures, link to their calculators, and are listed on the home page', async () => {
    const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
    const must = { 'new-tax-regime-slabs-fy-2026-27.html': ['₹97,500', '₹12.75 lakh', '₹4,75,800'], 'sip-for-1-crore.html': ['₹44,636', '₹1,23,299'], 'emi-per-lakh-table.html': ['₹900', '₹2,076'], 'professional-tax-by-state.html': ['₹2,500 a year', '₹200 a month'], 'hra-exemption-rules.html': ['Bengaluru', 'Ahmedabad', '₹15,000'] };
    for (const [f, bits] of Object.entries(must)) { const h = read(f); assert.ok(!h.includes('{{'), f + ' has an unfilled placeholder'); bits.forEach(b => assert.ok(h.includes(b), f + ' missing ' + b)); }
    const pg = await open(SITE, 'index.html'); assert.equal(await pg.$eval('#toolCount', e => e.textContent), String(await pg.evaluate(() => TOOLS.length)));
    for (const f of Object.keys(must)) assert.ok(await pg.$(`#guideGrid a[href="${f}"]`), f + ' not listed on home page');
    await pg.close();
    const sal = await open(SITE, 'salary-calculator.html'); assert.ok(await sal.$('.guide-links a[href="professional-tax-by-state.html"]'), 'salary page links to the guides'); await sal.close();
  });

  test('net worth: live explanations, emergency-fund toggle, and the donut highlight and breakdown', async () => {
    const pg = await open(SITE, 'networth-calculator.html'); await pg.waitForTimeout(250);
    await pg.fill('#exp', '60000'); await pg.waitForTimeout(300);
    await pg.click('[data-tip=liquid]'); const tip = await pg.textContent('#kpiTip');
    assert.match(tip, /Cash & bank ₹4,70,000 \+ Fixed income ₹4,00,000 \+ Stocks & funds ₹9,00,000 = ₹17,70,000/); assert.match(tip, /Not counted.*Retirement ₹10,00,000/);
    assert.match(await pg.textContent('#emNote'), /₹4,70,000 = 7\.8 months/);
    await pg.click('#assets details:nth-child(2) summary'); await pg.click('#assets details:nth-child(2) .em >> nth=0'); await pg.waitForTimeout(150);
    assert.match(await pg.textContent('#emNote'), /₹8,70,000 = 14\.5 months.*Fixed deposits/, 'switching an FD on adds it to the emergency fund');
    await pg.click('#legend .lrow[data-i="3"]');
    const sub = await pg.$$eval('#legend .lsub:not([hidden]) li', l => l.map(x => x.textContent.replace(/\s+/g, ' ')));
    assert.deepEqual(sub.map(x => x.split('₹')[0]), ['EPF', 'PPF', 'NPS']); assert.match(sub[0], /65%/);
    assert.equal(await pg.$eval('#donut', e => e.classList.contains('hl')), true, 'pinned slice highlights the chart');
    assert.deepEqual(await pg.$$eval('#donut text', t => t.map(x => x.textContent)), ['Retirement', '₹10.00 L', '10% of total']);
    await pg.close();
  });

  test('result cards say what the number is per', async () => {
    const pg = await open(SITE, 'salary-hike-calculator.html'); await pg.waitForTimeout(200);
    assert.match(await pg.textContent('#gain'), /a month$/); assert.match(await pg.textContent('#gainSub'), /over a full year/); assert.match(await pg.textContent('#hPill'), /Monthly take-home/);
    await pg.close();
  });

  test('SIP goal can be entered in today\'s prices or in future rupees', async () => {
    const pg = await open(SITE, 'sip-calculator.html'); await pg.click('#mode button[data-v=goal]'); await pg.waitForTimeout(150);
    await pg.fill('#goal', '1,00,00,000'); await pg.fill('#ret', '12'); await pg.fill('#yrs', '12'); await pg.fill('#mon', '0'); await pg.fill('#step', '0'); await pg.fill('#lump', '0'); await pg.waitForTimeout(250);
    const sip = async () => parseInt((await pg.textContent('#fv')).replace(/[^0-9]/g, ''));
    assert.equal(await pg.$eval('#goalIn button.on', e => e.dataset.v), 'today', 'defaults to what it costs today');
    assert.match(await pg.textContent('#goalNote'), /at today’s prices will cost about ₹2\.01 Cr in 12 years/); const today = await sip();
    await pg.click('#goalIn button[data-v=future]'); await pg.waitForTimeout(200); const future = await sip();
    assert.ok(Math.abs(today / future - Math.pow(1.06, 12)) < 0.01, 'today-price goal needs about 1.06^12 times the SIP'); assert.match(await pg.textContent('#goalNote'), /worth about ₹49\.7/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('review fixes: slider values for screen readers, no Google Fonts, accurate privacy wording', async () => {
    const pg = await open(SITE, 'salary-calculator.html'); await pg.waitForTimeout(200);
    assert.match(await pg.$eval('.field[data-slider] input[type=range]', e => e.getAttribute('aria-valuetext')), /^₹[\d,]+$/);
    assert.deepEqual(pg.errs, []); await pg.close();
    for (const f of pagesOf(SITE)) { const h = fs.readFileSync(path.join(SITE, f), 'utf8'); assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(h), f + ' still loads Google Fonts'); }
    const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'); assert.ok(!/never leaves your browser/i.test(home) && /not sent to our servers/.test(home));
    const methodology = fs.readFileSync(path.join(SITE, 'methodology.html'), 'utf8'); assert.match(methodology, /Rule 279/); assert.match(methodology, /Not yet reviewed by a chartered accountant/);
    assert.ok(!/AY 2027-28/.test(fs.readdirSync(SITE).filter(x => x.endsWith('.html')).map(x => fs.readFileSync(path.join(SITE, x), 'utf8')).join('')), 'old assessment-year wording is gone');
  });

  test('search appearance: home title fits in a result, and favicons are available in the formats Google reads', async () => {
    const h = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), title = (h.match(/<title>([^<]*)<\/title>/) || [])[1].replace(/&amp;/g, '&');
    assert.ok(title.length <= 60, 'home title is ' + title.length + ' characters: ' + title);
    assert.match(h, /rel="icon" href="favicon\.ico"/); assert.match(h, /rel="icon" href="assets\/icon-192\.png"/); assert.match(h, /rel="icon" href="assets\/favicon\.svg"/);
    const ico = fs.readFileSync(path.join(SITE, 'favicon.ico')); assert.equal(ico.readUInt16LE(2), 1, 'valid ICO header'); assert.equal(ico[6], 48);
  });

  test('teardown', async () => { await browser.close(); fs.rmSync(LIVE, { recursive: true, force: true }); });
}
