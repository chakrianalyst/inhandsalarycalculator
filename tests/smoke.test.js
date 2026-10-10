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
    cfg.adsense = { client: 'ca-pub-1234567890', slot: '111' }; cfg.analytics = { gaId: 'G-TEST123', umamiId: '0b9e6c1e-1111-4a2b-9c3d-123456789abc' }; cfg.affiliates = { 'home-loan': 'https://partner.example/loan?ref=x' };
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
      'networth-calculator.html', 'life-simulator.html', 'fire-calculator.html', 'rent-vs-buy-calculator.html', 'offer-comparison.html', 'swp-calculator.html']) {
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
    await pg.$eval('#sec-ret', e => (e.open = true)); assert.match(await t('ab'), /Paid to you as salary.*Employer PF & gratuity.*CTC/);
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
    await pg.$eval('#sec-tax', e => (e.open = true)); await pg.fill('#sal', '30,00,000'); await pg.waitForTimeout(150); assert.match(await pg.$eval('#facts', e => e.innerText), /Tax on the interest is about ₹64,705 \(31\.2% of it\)/);
    assert.equal(await pg.$eval('#warns', e => e.textContent), '');                                    // ₹5 L earns at most about ₹47,000 a year: under the ₹50,000 TDS limit
    await pg.fill('#p', '2000000'); assert.match(await pg.$eval('#warns', e => e.textContent), /TDS/);
    assert.match(await pg.$eval('#facts', e => e.textContent), /After tax and rising prices, your money grows/); assert.match(await pg.$eval('.hero-result', e => e.textContent), /After tax on the interest, you keep/);
    assert.equal(await pg.$('#inputs input[type=range]'), null, 'no sliders'); assert.ok(await pg.$$eval('#inputs .help-btn', x => x.length) >= 5, 'every question has ? help');
    await pg.click('label[for=mode] + .help-btn'); assert.deepEqual(await pg.$$eval('#help-mode .help-line b', b => b.map(x => x.textContent)), ['Interest added: ', 'Interest paid out: ', 'Recurring deposit: '], 'each option in the ? note sits on its own line');
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
    const pg = await open(SITE, 'sip-calculator.html'); const hero = () => pg.$eval('.hero-result', e => e.innerText), kp = () => pg.$eval('#facts', e => e.innerText);
    assert.match(await hero(), /₹47,59,314/); assert.match(await pg.$eval('#delayTbl', e => e.innerText), /5 years later/);
    await pg.fill('#step', '10'); assert.match(await hero(), /₹82,74,718/); assert.match(await pg.$eval('#yrTbl', e => e.innerText), /₹11,000/);
    await pg.fill('#step', '0'); await pg.fill('#yrs', '1'); await pg.fill('#mon', '6'); assert.match(await hero(), /1 year 6 months/);
    await pg.click('#tenChips [data-t="15"]'); assert.equal(await pg.inputValue('#yrs'), '15');
    await pg.$eval('#sec-tax', e => (e.open = true)); await pg.selectOption('#taxk', 'equity'); assert.match(await kp(), /If you sell everything at the end, tax is about/); await pg.selectOption('#taxk', 'none');
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
    assert.match(await txt('#hero'), /You can retire at[\s\S]*Age 48/); assert.match(await txt('#facts'), /₹5\.30 Cr to retire at 45/); assert.match(await txt('#facts'), /₹1\.17 Cr short/);
    assert.equal(await pg.$('section[aria-label=Inputs] input[type=range]'), null, 'no sliders'); assert.equal(await pg.$$eval('section[aria-label=Inputs] .help-btn', x => x.length) >= 7, true, 'every question has ? help');
    assert.match(await txt('#styles'), /Lean[\s\S]*Regular[\s\S]*Fat/); assert.match(await txt('#coast'), /Coast|invested today/); assert.equal((await pg.$$('#grid tr')).length, 4);
    await pg.$eval('details.adv', e => (e.open = true)); await pg.fill('#pension', '30,000'); assert.match(await txt('#facts'), /need on the day you retire: ₹2\./);        // a ₹30,000 pension roughly halves the corpus
    await pg.fill('#pension', '0'); await pg.fill('#sav', '2,00,000'); assert.match(await txt('#facts'), /on track to retire at 45/);
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('each page agrees with itself: the headline matches the table, chart and lists below it (FD, SIP, FIRE)', async () => {
    const d = x => parseInt(String(x).replace(/[^0-9]/g, ''), 10), T = (pg, s) => pg.$eval(s, e => e.innerText.replace(/\s+/g, ' ').trim());
    const lastRow = pg => pg.$$eval('#yrTbl tr', r => r.slice(-1)[0].innerText.split('\t')), col = (pg, name) => pg.$$eval('#yrTbl tr', (r, n) => r[0].innerText.split('\t').map(h => h.toLowerCase()).indexOf(n), name);
    for (const q of ['', '?mode=rd', '?yrs=0&mon=6&day=10', '?p=70000000&sal=0&yrs=10']) {
      const pg = await open(SITE, 'fd-calculator.html' + q); assert.equal(d((await lastRow(pg)).slice(-1)[0]), d(await T(pg, '#mv')), 'FD table ends at the headline ' + q);
      const keep = (await T(pg, '#hPill')).match(/keep (₹[\d,]+)/); if (keep) assert.ok((await T(pg, '#facts')).includes(keep[1]), 'FD facts repeat what you keep ' + q); await pg.close();
    }
    for (const q of ['', '?step=10', '?mode=lump&lump=500000', '?lump=200000', '?mode=goal&step=10']) {
      const pg = await open(SITE, 'sip-calculator.html' + q), row = await lastRow(pg), first = await pg.$$eval('#yrTbl tr', r => r[1].innerText.split('\t'));
      if (q.includes('goal')) assert.equal(d(first[await col(pg, 'sip that year')]), d(await T(pg, '#fv')), 'goal SIP is the year-1 SIP');
      else assert.equal(d(row[await col(pg, 'value')]), d(await T(pg, '#fv')), 'SIP table ends at the headline ' + q);
      const ls = (await T(pg, '#facts')).match(/(?:reaches|SIP is) (₹[\d,]+) a month/); if (ls) assert.equal(d(ls[1]), d(row[await col(pg, 'sip that year')]), 'last-year SIP matches the table ' + q); await pg.close();
    }
    for (const q of ['', '?sav=200000', '?retAge=50', '?exp=100000']) {
      const pg = await open(SITE, 'fire-calculator.html' + q), reg = await pg.$$eval('#styles tr', r => r.map(x => x.innerText.split('\t')).find(x => /Regular/.test(x[0]))), num = (await T(pg, '#fPill')).match(/₹[\d.]+ (?:Cr|L)/)[0];
      assert.equal(reg[2], num, 'FIRE number matches the lean/fat table ' + q); assert.equal(reg[3], await T(pg, '#fBig'), 'earliest age matches the table ' + q); assert.ok((await T(pg, '#facts')).includes(num)); await pg.close();
    }
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
    assert.match(await hero(), /If you return now[\s\S]*Short by ₹1\.05 Cr[\s\S]*Earliest you can afford it: in 2 years \(age 38\)/); assert.equal((await pg.$$('#yrTbl tr')).length, 12); assert.match(await txt('#yrTbl'), /Not yet[\s\S]*Not yet[\s\S]*✓ Ready/);
    assert.match(await txt('#kpis'), /Without a job, money lasts[\s\S]*17 years/); assert.match(await txt('#homeTbl'), /Tax on your profits[\s\S]*Money you start life in India with/); assert.match(await txt('#homeTbl'), /left abroad/);
    await pg.selectOption('#when', '3'); assert.match(await txt('#hero'), /If you return in 3 years \(age 39\)[\s\S]*to spare/);
    await pg.$eval('#sec-tax', e => (e.open = true)); assert.equal(await pg.isVisible('#penalty'), false); await pg.selectOption('#retMode', 'withdraw'); assert.equal(await pg.isVisible('#penalty'), true); assert.match(await txt('#homeTbl'), /cashed out/);
    await pg.fill('#jobCtc', '30,00,000'); assert.match(await hero(), /You can afford to return now/); await pg.fill('#jobCtc', '0'); await pg.selectOption('#retMode', 'leave');
    await pg.selectOption('#country', 'AE'); assert.equal(await pg.inputValue('#fx'), '26.1'); assert.match(await txt('#cashL'), /AED/); assert.equal((await pg.$$('#grid tr')).length, 5);
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'return-calculator.html') + '?spend=60000'); await lk.waitForTimeout(300); assert.equal(await lk.inputValue('#spend'), '60,000'); assert.match(await lk.$eval('#hero', e => e.innerText), /You can afford to return now/); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Return to India calculator: growth settings are up front, today-to-return lines, rupee drift guide, scenario range, share link keeps them', async () => {
    const pg = await open(SITE, 'return-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText);
    for (const id of ['jobGrowth', 'saveGrowth', 'retireGrowth']) assert.equal(await pg.isVisible('#' + id), true, id + ' should be visible without opening the advanced box');
    assert.equal(await pg.inputValue('#retireGrowth'), '0');
    await pg.selectOption('#when', '10'); await pg.fill('#jobCtc', '25,00,000');
    assert.match(await txt('#ctcAt'), /49[\d.]* ?L[\s\S]*when you return in 10 years/); assert.match(await txt('#spAt'), /2,68,627[\s\S]*when you return in 10 years/);
    await pg.selectOption('#when', '0'); assert.equal(await txt('#spAt'), ''); assert.match(await txt('#ctcAt'), /today’s pay, used as it is because you return now/);
    assert.equal(await pg.$eval('#ctcBasis', (a, b) => !!(a.compareDocumentPosition(document.getElementById(b)) & Node.DOCUMENT_POSITION_FOLLOWING), 'jobCtc'), true);          // the choice of how to read the amount comes before the amount
    await pg.$eval('#sec-fx', e => (e.open = true)); await pg.selectOption('#country', 'DE'); assert.match(await txt('#depSug'), /India 6% minus Germany 2\.5%[\s\S]*3\.5%/); await pg.click('#useDrift'); assert.equal(await pg.inputValue('#dep'), '3.5'); assert.equal(await pg.isVisible('#useDrift'), false);
    await pg.fill('#dep', '1'); assert.equal(await pg.isVisible('#useDrift'), true); await pg.fill('#jobCtc', '26,00,000'); await pg.click('#useDrift'); assert.equal(await pg.inputValue('#dep'), '3.5');   // a tap right after editing another field still works
    const rows = await pg.$$eval('#range tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ').trim())); assert.equal(rows.length, 4); assert.match(rows[1], /^Cautious/); assert.match(rows[2], /^Your settings/); assert.match(rows[3], /^Optimistic/);
    const gap = r => { const m = r.match(/([+−])₹([\d.,]+) ?(L|Cr)\s*$/); const v = parseFloat(m[2].replace(/,/g, '')) * (m[3] === 'Cr' ? 100 : 1); return m[1] === '−' ? -v : v; };
    assert.ok(gap(rows[1]) < gap(rows[2]) && gap(rows[2]) < gap(rows[3]), rows.join(' | '));
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'return-calculator.html') + '?retireGrowth=5&jobGrowth=9&saveGrowth=6'); await lk.waitForTimeout(300);
    assert.equal(await lk.inputValue('#retireGrowth'), '5'); assert.equal(await lk.inputValue('#jobGrowth'), '9'); assert.equal(await lk.inputValue('#saveGrowth'), '6'); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Return to India calculator: package basis, job gap, PF, life events and their warnings, kept in the share link', async () => {
    const pg = await open(SITE, 'return-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText), need = async () => (await txt('#yrTbl')).replace(/\s+/g, ' ');
    await pg.$eval('#sec-job', e => (e.open = true)); await pg.selectOption('#when', '5'); await pg.fill('#spend', '2,50,000'); await pg.fill('#jobCtc', '24,00,000'); await pg.fill('#planEnd', '80');
    assert.equal(await pg.isVisible('#pfRate'), false); assert.equal(await pg.isVisible('#ev1Amt'), false);
    const base = await need();
    await pg.fill('#jobGap', '9'); assert.notEqual(await need(), base); await pg.fill('#jobGap', '0'); assert.equal(await need(), base);                       // the gap changes the answer and clearing it restores the old one
    await pg.selectOption('#ctcBasis', 'return'); assert.match(await txt('#ctcL'), /as of the year you return/); assert.match(await txt('#ctcAt'), /what you would be paid when you return in 5 years\. That is about [\s\S]*today’s money/); assert.match(await txt('#ptL'), /as of the year you return/); assert.notEqual(await need(), base); await pg.selectOption('#ctcBasis', 'today'); assert.equal(await need(), base);
    await pg.selectOption('#countPf', 'yes'); assert.equal(await pg.isVisible('#pfRate'), true); assert.notEqual(await need(), base); assert.match(await txt('#homeTbl'), /PF and gratuity from your job in India, received at age 60/);
    await pg.selectOption('#countPf', 'no'); assert.equal(await need(), base);
    await pg.selectOption('#ev1Kind', 'monthly'); assert.equal(await pg.isVisible('#ev1To'), true); assert.match(await txt('#ev1FromL'), /From age/); await pg.fill('#ev1Amt', '30,000'); await pg.fill('#ev1From', '45'); await pg.fill('#ev1To', '50'); assert.notEqual(await need(), base);
    await pg.fill('#ev1To', '44'); assert.match(await txt('#warns'), /Life event 1 ends before it starts/);
    await pg.selectOption('#ev1Kind', 'once'); assert.equal(await pg.isVisible('#ev1To'), false); assert.match(await txt('#ev1FromL'), /At age/); await pg.selectOption('#ev1Kind', '');
    await pg.fill('#jobCtc', '0'); await pg.selectOption('#countPf', 'yes'); assert.match(await txt('#warns'), /PF and gratuity count only when you enter a package/);
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'return-calculator.html') + '?jobGap=8&ctcBasis=return&countPf=yes&pfRate=7&ev2Kind=once&ev2Amt=500000&ev2From=47'); await lk.waitForTimeout(300);
    assert.equal(await lk.inputValue('#jobGap'), '8'); assert.equal(await lk.inputValue('#ctcBasis'), 'return'); assert.equal(await lk.inputValue('#countPf'), 'yes'); assert.equal(await lk.inputValue('#pfRate'), '7'); assert.equal(await lk.inputValue('#ev2Kind'), 'once'); assert.equal(await lk.inputValue('#ev2Amt'), '5,00,000'); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('Return to India calculator: tax on India returns, partner pay, market fall card, and the share link', async () => {
    const pg = await open(SITE, 'return-calculator.html'); const txt = sel => pg.$eval(sel, e => e.innerText), table = async () => (await txt('#yrTbl')).replace(/\s+/g, ' ');
    await pg.$eval('#sec-job', e => (e.open = true)); await pg.$eval('#sec-tax', e => (e.open = true)); await pg.fill('#spend', '2,00,000'); await pg.fill('#planEnd', '80'); await pg.selectOption('#when', '4');
    const base = await table(); assert.equal(await pg.isVisible('#partnerYears'), false); assert.equal(await pg.inputValue('#indiaTax'), '0');
    await pg.fill('#indiaTax', '25'); assert.notEqual(await table(), base); await pg.fill('#indiaTax', '0'); assert.equal(await table(), base);
    await pg.fill('#partnerCtc', '18,00,000'); assert.equal(await pg.isVisible('#partnerYears'), true); assert.match(await txt('#ptAt'), /when you return in 4 years/); assert.notEqual(await table(), base);
    await pg.fill('#partnerYears', '0'); assert.match(await txt('#warns'), /partner works for 0 years/); assert.equal(await table(), base); await pg.fill('#partnerCtc', '0'); assert.equal(await table(), base);
    const rows = await pg.$$eval('#shock tr', t => t.map(r => r.innerText.replace(/\s+/g, ' ').trim())); assert.equal(rows.length, 4); assert.match(rows[1], /^As you entered/); assert.match(rows[2], /^−20%/); assert.match(rows[3], /^−35%/);
    const gap = r => { const m = r.match(/([+−])₹([\d.,]+) ?(L|Cr)\s*$/); const v = parseFloat(m[2].replace(/,/g, '')) * (m[3] === 'Cr' ? 100 : 1); return m[1] === '−' ? -v : v; };
    assert.ok(gap(rows[1]) > gap(rows[2]) && gap(rows[2]) > gap(rows[3]), rows.join(' | '));
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'return-calculator.html') + '?indiaTax=18&partnerCtc=1500000&partnerYears=9'); await lk.waitForTimeout(300);
    assert.equal(await lk.inputValue('#indiaTax'), '18'); assert.equal(await lk.inputValue('#partnerCtc'), '15,00,000'); assert.equal(await lk.inputValue('#partnerYears'), '9'); await lk.close();
    assert.deepEqual(pg.errs, []); await pg.close();
  });

  test('home hero: headline rotates through calculators, keeps one h1, dots switch it and the button follows', async () => {
    let pg = await open(SITE, 'index.html');
    assert.equal(await pg.$$eval('h1', x => x.length), 1); assert.match(await pg.$eval('#rot .on', e => e.textContent), /bank account/);
    assert.equal(await pg.$$eval('#rotDots button', x => x.length), await pg.$$eval('#rot > *', x => x.length));
    await pg.click('#rotDots button:nth-child(2)'); await pg.waitForTimeout(600);
    assert.match(await pg.$eval('#rot .on', e => e.textContent), /Laid off/); assert.equal(await pg.$eval('#rotCta', e => e.getAttribute('href')), 'layoff-runway-calculator.html');
    await pg.close();
    // it really rotates on its own: on a desktop with the mouse resting in the (screen-filling) hero, and on a phone after a tap
    pg = await open(SITE, 'index.html'); await pg.mouse.move(100, 600); await pg.waitForTimeout(5600);
    assert.notEqual(await pg.$eval('#rotCta', e => e.getAttribute('href')), 'salary-calculator.html', 'headline rotates with the mouse in the hero'); await pg.close();
    const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ph.goto(url(SITE, 'index.html')); await ph.tap('#rot'); await ph.waitForTimeout(5600);
    assert.notEqual(await ph.$eval('#rotCta', e => e.getAttribute('href')), 'salary-calculator.html', 'headline keeps rotating on a phone after a tap'); await ph.close();
    pg = await open(SITE, 'index.html');
    for (const href of await pg.$$eval('#rotDots button', (b) => b.map((_, i) => i))) { await pg.click(`#rotDots button:nth-child(${href + 1})`); const h = await pg.$eval('#rotCta', e => e.getAttribute('href')); assert.ok(require('fs').existsSync(require('path').join(SITE, h)), h); }
    await pg.close();
  });

  test('articles: fit a phone, link to working prefilled calculators, and show the figures they quote', async () => {
    const arts = pagesOf(SITE).filter(f => /rc-article/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
    assert.equal(arts.length, 16);
    const links = new Set();
    for (const f of arts) {
      const pg = await open(SITE, f, 390);
      assert.deepEqual(pg.errs, [], f); assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), f + ' scrolls sideways at 390px');
      assert.match(await pg.$eval('.art-meta', e => e.textContent), /\d+ min read.*Updated \d+ \w+ 2026/, f);
      assert.equal(await pg.$$eval('.section .tool-grid .art-card', x => x.length), 3, f + ' has 3 more articles');
      for (const h of await pg.$$eval('article a[href*="?"]', a => a.map(x => x.getAttribute('href')))) links.add(h);
      await pg.close();
    }
    for (const h of links) { const pg = await open(SITE, h); assert.deepEqual(pg.errs, [], h); await pg.close(); }       // every prefilled calculator link opens cleanly
    const shows = async (h, sel, re) => { const pg = await open(SITE, h); await pg.waitForTimeout(300); assert.match(await pg.$eval(sel, e => e.innerText), re, h); await pg.close(); };
    await shows('offer-comparison.html?n0=Bengaluru%20%E2%82%B920%20L&ctc0=2000000&var0=10&bonus0=0&esop0=0&rent0=28000&oth0=4000&n1=Mumbai%20%E2%82%B924%20L&ctc1=2400000&var1=20&rent1=45000&oth1=6000&hz=1', '#bars', /₹1,01,558[\s\S]*₹1,04,873/);
    await shows('offer-comparison.html?n0=Bengaluru%20%E2%82%B920%20L&ctc0=2000000&var0=10&bonus0=0&esop0=0&rent0=28000&oth0=4000&n1=Mumbai%20%E2%82%B924%20L&ctc1=2400000&var1=20&rent1=45000&oth1=6000&hz=1&pay=60', '#hero', /₹40,406/);
    await shows('offer-comparison.html?n0=Startup&ctc0=1800000&var0=0&bonus0=150000&esop0=400000&rent0=30000&oth0=4000&n1=Big%20company&ctc1=2200000&var1=10&bonus1=0&esop1=0&rent1=30000&oth1=4000&hz=4', '#hero', /₹1,50,026/);
    await shows('salary-hike-calculator.html?ctc=1800000&hike=6', '#kpis', /-0\.9%/);
    await shows('salary-hike-calculator.html?ctc=1360000&hmode=ctc&newctc=1440000', '.hero-result', /₹1,00,073 → ₹1,00,063/);
    await shows('layoff-runway-calculator.html?monthly=80000&severance=160000&notice=80000&leave=30000&savings=200000&pf=300000&essentials=30000&emi=0&other=20000&otherCut=8000&insurance=18000', '#kpis', /₹4\.70 L[\s\S]*11 months/);
    await shows('life-simulator.html', '.hero-result', /₹5\.65 Cr/);
    await shows('life-simulator.html?kid.on=0', '.hero-result', /₹6\.87 Cr/);
    await shows('life-simulator.html?creep=50', '.hero-result', /₹4\.53 Cr/);
    await shows('networth-calculator.html', '.hero-result', /₹60,15,000/);
    await shows('abroad-calculator.html?country=DE&city=ber&gross=75000&rentA=1300&otherA=1300', '.hero-result', /₹1,71,16,958/);
    await shows('return-calculator.html?jobCtc=2500000&jobGap=6', '.hero-result', /₹2\.05 Cr to spare/);
    await shows('salary-calculator.html?ctc=3000000&rent=60000&c80ppf=6000&d80s=25000&nps1b=50000', 'body', /₹1,87,297/);
    await shows('salary-calculator.html?ctc=1400000&nps=10', 'body', /₹98,355/);
    await shows('gratuity-calculator.html?wage=40000&yrs=6&total=120000', '.hero-result', /₹2,07,692/);
    // the hub lists every article, the home page features eight, and each calculator links to its article
    let pg = await open(SITE, 'articles.html'); assert.equal(await pg.$$eval('.art-card', x => x.length), 16); await pg.close();
    pg = await open(SITE, 'index.html'); assert.equal(await pg.$$eval('#articles .art-card', x => x.length), 8); await pg.close();
    pg = await open(SITE, 'emi-calculator.html'); assert.equal(await pg.$eval('.read-card', e => e.getAttribute('href')), 'prepay-home-loan-or-invest.html'); await pg.close();
    pg = await open(SITE, 'offer-comparison.html'); assert.equal(await pg.$eval('.read-card', e => e.getAttribute('href')), 'compare-two-job-offers.html'); await pg.close();
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
    await pg.$eval('details.adv', e => (e.open = true)); await pg.fill('#invest', '100'); await pg.fill('#creep', '0'); assert.match(await t('story'), /invest 100% of it/); assert.ok(num((await t('hBig')).replace(/Cr.*/, '')) > before, 'investing more and creeping less leaves more');
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

  test('content-skill runner shows the same numbers as the live pages (so posts match what readers see)', async () => {
    const run = require(path.join(ROOT, 'skills', 'rupeecheck-content', 'engine', 'run.js')), digits = s => parseInt(String(s).replace(/[^0-9]/g, ''), 10);
    const sal = await open(SITE, 'salary-calculator.html'); await sal.waitForTimeout(200);
    assert.equal(digits(await sal.textContent('#rMonth')), Math.round(run.TOOLS.salary({}).results.inHandMonth), 'salary page default vs runner'); await sal.close();
    const sip = await open(SITE, 'sip-calculator.html'); await sip.waitForTimeout(200);
    assert.equal(digits(await sip.textContent('#fv')), Math.round(run.TOOLS.sip({}).results.futureValue), 'SIP default'); await sip.close();
    const emi = await open(SITE, 'emi-calculator.html'); await emi.waitForTimeout(200);
    assert.equal(digits(await emi.textContent('#emi')), Math.round(run.TOOLS.emi({}).results.emi), 'EMI default'); await emi.close();
    const ab = await open(SITE, 'abroad-calculator.html'); await ab.waitForTimeout(200); await ab.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await ab.selectOption('#city', 'sf'); await ab.fill('#gross', '150000'); await ab.waitForTimeout(450);
    const k = await ab.$$eval('#kpis .kpi .v', e => e.map(x => x.textContent)), R = run.TOOLS.abroad({ city: 'sf', gross: 150000 }).results;
    assert.equal(digits(k[0]), Math.round(R.takeHomeMonthAbroadInRupees), 'abroad take-home'); assert.equal(digits(k[1]), Math.round(R.livingCostMonthAbroadInRupees), 'abroad living costs'); assert.equal(digits(k[2]), Math.round(R.savedYear1Abroad), 'abroad year-1 savings');
    assert.equal(k[3].replace(/[^0-9.]/g, ''), (R.netWorthEndAbroad / 1e7).toFixed(2), 'abroad net worth in crore'); await ab.close();
  });

  test('phone: every calculator keeps its answer in a floating bar while you type, and it follows the result', async () => {
    for (const f of ['sip-calculator.html', 'emi-calculator.html', 'fd-calculator.html', 'hra-calculator.html', 'gratuity-calculator.html', 'salary-hike-calculator.html', 'offer-comparison.html', 'fire-calculator.html',
      'swp-calculator.html', 'rent-vs-buy-calculator.html', 'networth-calculator.html', 'life-simulator.html', 'abroad-calculator.html', 'return-calculator.html']) {
      const pg = await open(SITE, f, 390); await pg.waitForTimeout(250);
      assert.equal(await pg.isVisible('#mBarAuto'), true, f + ': bar shows while the result is below');
      assert.equal(await pg.$eval('#mBarAuto b', e => e.textContent), await pg.$eval('.hero-result .big', e => e.textContent.trim()), f + ': bar shows the same answer');
      assert.deepEqual(pg.errs, [], f); await pg.close();
    }
    const pg = await open(SITE, 'sip-calculator.html', 390); await pg.fill('#sip', '20,000'); await pg.waitForTimeout(200);
    assert.equal(await pg.$eval('#mBarAuto b', e => e.textContent), await pg.$eval('#fv', e => e.textContent.trim()), 'bar updates as you type');
    await pg.$eval('.hero-result', e => e.scrollIntoView()); await pg.waitForTimeout(300); assert.equal(await pg.$eval('#mBarAuto', e => e.classList.contains('show')), false, 'hidden once the result is on screen');
    await pg.close();
    const d = await open(SITE, 'sip-calculator.html', 1280); assert.equal(await d.isVisible('#mBarAuto'), false, 'no bar on desktop, where the result sits beside the form'); await d.close();
  });

  test('the Share button never covers the result headline, on phone or desktop', async () => {
    for (const w of [390, 1280]) for (const f of ['index.html', 'rent-vs-buy-calculator.html', 'abroad-calculator.html', 'hra-calculator.html', 'return-calculator.html', 'life-simulator.html']) {
      const pg = await open(SITE, f, w); await pg.waitForTimeout(250);
      const hit = await pg.evaluate(() => { const s = document.querySelector('.share-btn').getBoundingClientRect(); const out = [];
        document.querySelectorAll('.hero-result .lbl, .hero-result .big').forEach(e => { const r = document.createRange(); r.selectNodeContents(e); for (const b of r.getClientRects()) if (b.right > s.left + 1 && b.left < s.right && b.bottom > s.top + 1 && b.top < s.bottom) { out.push(e.textContent); break; } }); return out; });
      assert.deepEqual(hit, [], `${f} at ${w}px`); await pg.close();
    }
  });

  test('phone tables keep each amount on one line and say when they scroll sideways', async () => {
    const pg = await open(SITE, 'return-calculator.html', 390); await pg.waitForTimeout(300);
    const tall = await pg.$$eval('#yrTbl td.nw', tds => tds.filter(td => { const r = document.createRange(); r.selectNodeContents(td); return r.getClientRects().length > 1; }).length);
    assert.equal(tall, 0, 'no amount wraps'); assert.equal(await pg.$eval('#yrTbl', t => t.parentElement.scrollWidth <= t.parentElement.clientWidth + 4), true, 'the return table fits a phone');
    assert.match(await pg.$eval('#yrTbl tr:nth-child(2) td', e => e.innerText), /Now\s*Age 36/); await pg.close();
    const rb = await open(SITE, 'rent-vs-buy-calculator.html', 390); await rb.waitForTimeout(300);
    assert.equal(await rb.$eval('#grid', t => t.closest('.tbl-wrap').nextElementSibling.hidden), false, 'wide grid shows the swipe hint'); await rb.close();
    const em = await open(SITE, 'emi-calculator.html', 390); await em.waitForTimeout(300);
    assert.equal(await em.$eval('#sched', t => t.closest('.tbl-wrap').nextElementSibling.hidden), true, 'a table that fits has no hint'); await em.close();
  });

  test('results say what they mean: return year, HRA regime, rent vs buy assumption, life-sim amounts, net worth sample, third offer', async () => {
    const ret = await open(SITE, 'return-calculator.html'); await ret.waitForTimeout(250);
    assert.equal(await ret.textContent('#hLbl'), 'If you return now'); assert.match(await ret.textContent('#kpiHead'), /^If you return now \(age 36\)/);
    await ret.selectOption('#when', '3'); await ret.waitForTimeout(250); assert.match(await ret.textContent('#kpiHead'), /^If you return in 3 years \(age 39\)/); await ret.close();
    const hra = await open(SITE, 'hra-calculator.html'); assert.equal(await hra.isVisible('#regimeNote'), true); assert.match(await hra.textContent('#hPill'), /old regime: you save/); await hra.close();
    const rb = await open(SITE, 'rent-vs-buy-calculator.html'); await rb.waitForTimeout(250); assert.equal(await rb.isVisible('#investNote'), true, 'renting wins by default, so the note shows');
    await rb.fill('#app', '12'); await rb.waitForTimeout(250); assert.match(await rb.textContent('#vTitle'), /buying/i); assert.equal(await rb.isVisible('#investNote'), false, 'no note when buying wins'); await rb.close();
    const ls = await open(SITE, 'life-simulator.html'); await ls.waitForTimeout(250); assert.match(await ls.textContent('#timeline .tl-head'), /Your net worth then/); await ls.close();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }), nw = await ctx.newPage(); await nw.goto(url(SITE, 'networth-calculator.html')); await nw.waitForTimeout(250);
    assert.equal(await nw.isVisible('#sampleNote'), true, 'first visit: sample numbers are labelled');
    await nw.click('#startOwn'); await nw.waitForTimeout(150); assert.equal(await nw.isVisible('#sampleNote'), false); assert.equal(await nw.inputValue('#inc'), '');
    await nw.reload(); await nw.waitForTimeout(200); assert.equal(await nw.isVisible('#sampleNote'), false, 'stays cleared after a reload'); await ctx.close();
    const of = await open(SITE, 'offer-comparison.html', 390); assert.equal(await of.isVisible('#card2'), false, 'unused Offer C is hidden on a phone');
    await of.click('label:has(#third)'); await of.waitForTimeout(150); assert.equal(await of.isVisible('#card2'), true);
    const xs = await of.$$eval('#hz, #pay, #cinf', e => e.map(x => Math.round(x.closest('.field').getBoundingClientRect().left))); assert.equal(new Set(xs).size, 1, 'settings stack in one column on a phone'); await of.close();
  });

  test('header fits every screen: popular links plus "All tools", which opens the full list and closes with Escape', async () => {
    for (const w of [1440, 1366, 1280, 1024, 390]) {
      const pg = await open(SITE, 'salary-calculator.html', w);
      const right = await pg.evaluate(() => Math.max(...[...document.querySelectorAll('header *')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().right)));
      assert.ok(right <= w, `header fits at ${w}px (rightmost ${right})`);
      assert.equal(await pg.isVisible('.nav-quick'), w > 900, `popular links at ${w}px`);
      await pg.click('#menuBtn'); assert.equal(await pg.$$eval('#navLinks a', a => a.filter(x => x.offsetParent).length), 17, `all 16 calculators and the articles listed at ${w}px`);
      assert.equal(await pg.getAttribute('#menuBtn', 'aria-expanded'), 'true');
      await pg.keyboard.press('Escape'); assert.equal(await pg.isVisible('#navLinks'), false); await pg.close();
    }
  });

  test('chart labels stay readable on a phone', async () => {
    const pg = await open(SITE, 'fire-calculator.html', 390); await pg.waitForTimeout(250);
    const px = await pg.$$eval('.lc svg text', t => t.filter(x => x.textContent.trim()).map(x => x.getBoundingClientRect().height));
    assert.ok(px.length > 4 && Math.min(...px) >= 11, 'axis labels at least 11 px tall: ' + px.map(Math.round).join(','));
    await pg.setViewportSize({ width: 1280, height: 900 }); await pg.waitForTimeout(300);
    assert.ok(Math.min(...await pg.$$eval('.lc svg text', t => t.filter(x => x.textContent.trim()).map(x => x.getBoundingClientRect().height))) >= 11, 'and after resizing to desktop');
    await pg.close();
  });

  test('audit round 3: FIRE caption, FD tax from your income, abroad table adds up, salary old-regime label, HRA tip, home groups, life-sim assumptions', async () => {
    const fire = await open(SITE, 'fire-calculator.html'); await fire.waitForTimeout(250);
    assert.match(await fire.textContent('#chartCap'), /plan to retire at 45\. Your money would run out at about age 77\. Retiring at 48 instead makes it last to 90/);
    assert.equal(await fire.textContent('#fPill'), 'Your FIRE number: ₹5.30 Cr to retire at 45', 'both answers sit in the result box, so the share picture carries them');
    await fire.click('.share-btn'); await fire.waitForSelector('.share-img[src^="data:"]'); await fire.close();
    const fd = await open(SITE, 'fd-calculator.html'); await fd.$eval('#sec-tax', e => (e.open = true)); const before = await fd.textContent('#facts');
    await fd.fill('#sal', '0'); await fd.waitForTimeout(200); assert.match(await fd.textContent('#facts'), /No tax on this interest: your income stays within the ₹12 lakh rebate/); assert.notEqual(await fd.textContent('#facts'), before);
    await fd.fill('#p', '7,00,00,000'); await fd.waitForTimeout(200);                           // a big deposit with no other income: the interest itself climbs the slabs (and crosses ₹50 L, so surcharge)
    assert.match(await fd.textContent('#facts'), /Tax on the interest is about ₹74,70,907/); await fd.close();
    const ab = await open(SITE, 'abroad-calculator.html'); await ab.waitForTimeout(250);
    const last = await ab.$$eval('#payTbl tr:last-child td', t => t.map(x => x.textContent)); const card = await ab.$$eval('#kpis .kpi', k => k[2].innerText);
    assert.equal(last[0], 'Saved in year 1'); assert.ok(card.includes(last[2]) && card.includes(last[1]), 'table ends at the card’s numbers: ' + last.join(' | ') + ' vs ' + card); await ab.close();
    const sal = await open(SITE, 'salary-calculator.html'); await sal.waitForTimeout(200);
    assert.match(await sal.$eval('#sec-old summary', e => e.innerText), /None added yet/); assert.match(await sal.textContent('#oldAuto'), /₹50,000 standard deduction, your PF of ₹57,600/);
    await sal.$eval('#sec-old', e => (e.open = true)); await sal.fill('#c80elss', '50,000'); await sal.waitForTimeout(200); assert.match(await sal.$eval('#sec-old summary', e => e.innerText), /₹50,000 added/);
    assert.ok(await sal.$eval('#city', e => !!e.closest('#sec-old')), 'city sits with rent in the HRA part'); await sal.close();
    const hra = await open(SITE, 'hra-calculator.html'); await hra.waitForTimeout(200); assert.match(await hra.textContent('#tips'), /₹24,000 over the year[\s\S]*save only about ₹7,488 in tax/); await hra.close();
    const ix = await open(SITE, 'index.html'); assert.deepEqual(await ix.$$eval('#toolGrid .tool-group', g => g.map(x => x.textContent)), ['Salary & tax', 'Loans & savings', 'Big life decisions']);
    assert.equal(await ix.$$eval('#toolGrid .tag', t => t.filter(x => x.textContent === 'New').length), 1); assert.equal(await ix.inputValue('#q'), '12,00,000');
    assert.equal(await ix.$$eval('#guideGrid .tool-card p', p => p.length), await ix.$$eval('#guideGrid .tool-card', c => c.length), 'every guide card has a line'); await ix.close();
    const ls = await open(SITE, 'life-simulator.html', 390); await ls.waitForTimeout(250); assert.equal(await ls.$eval('details.adv', d => d.open), false);
    assert.match(await ls.textContent('#assumSum'), /Pay \+8% a year, prices \+6%, return 10%, you invest 80%/); await ls.close();
  });

  test('SWP calculator: matches the content-skill runner, taxes only the profit part, says when the money runs out, and restores from a share link', async () => {
    const run = require(path.join(ROOT, 'skills', 'rupeecheck-content', 'engine', 'run.js')), digits = s => parseInt(String(s).replace(/[^0-9]/g, ''), 10), R = run.TOOLS.swp({}).results;
    const pg = await open(SITE, 'swp-calculator.html'); await pg.waitForTimeout(250); const t = id => pg.$eval('#' + id, e => e.innerText.replace(/\s+/g, ' ').trim());
    assert.equal(await t('hLbl'), 'Your money lasts'); assert.match(await t('hSub'), /Taking ₹50,000 a month, raised 5% every year/);
    assert.match(await t('hPill'), new RegExp('^Left after 25 years: ' + (R.leftAtEnd >= 1e7 ? '₹' + (R.leftAtEnd / 1e7).toFixed(2) + ' Cr' : '₹' + (R.leftAtEnd / 1e5).toFixed(2) + ' L')));
    assert.equal(await pg.$$eval('#inputs .help-btn', x => x.length), 5, 'every question has a ? help button');
    assert.match(await t('facts'), new RegExp('use it all up in exactly 25 years, you could start at ₹' + Math.round(R.maxMonthlyWithdrawalThatLasts).toLocaleString('en-IN')));
    assert.equal(await pg.$('#inputs input[type=range]'), null, 'no sliders: people type the numbers');
    const lasts = await t('hBig'), rows = await pg.$$eval('#yrTbl tr', r => r.length - 1);           // the table runs as long as the headline says the money lasts
    assert.match(await t('yrNote'), new RegExp('runs out after ' + lasts.replace(' years', ' years( \\d+ months?)?'))); assert.equal(rows, parseInt(lasts) + 1);
    assert.equal(await pg.isVisible('#taxCard'), false, 'tax is left out by default'); assert.equal(await pg.inputValue('#taxk'), 'none');
    await pg.$eval('#sec-tax', e => (e.open = true)); await pg.selectOption('#taxk', 'equity'); await pg.waitForTimeout(150);
    assert.match(await t('taxNote'), /only ₹27,188 of it \(4\.5%\) is profit[\s\S]*Tax in year 1: ₹5,655/); assert.match(await t('chartCap'), /grows for the first \d+ years/);
    assert.match(await t('facts'), /reaches your bank in the first year, after tax/);
    await pg.fill('#wd', '60,000'); await pg.waitForTimeout(250); assert.equal(await t('hBig'), '20 years');
    assert.match(await t('hPill'), /^Runs out 4 years 8 months before your 25 years\. To last, start at ₹/);
    assert.match(await t('warns'), /^$|balance falls/); await pg.$eval('#sec-tax', e => (e.open = true)); await pg.selectOption('#taxk', 'none'); await pg.waitForTimeout(150); assert.equal(await pg.isVisible('#taxCard'), false);
    assert.deepEqual(pg.errs, []); await pg.close();
    const s2 = await browser.newPage(); await s2.goto(url(SITE, 'swp-calculator.html') + '?corpus=5000000&wd=40000&step=0&ret=8&yrs=20'); await s2.waitForTimeout(250);
    const i = Math.pow(1.08, 1 / 12) - 1, ann = 5000000 * i / (1 - Math.pow(1 + i, -240)); assert.equal(await s2.inputValue('#wd'), '40,000');
    assert.match(await s2.$eval('#facts', e => e.innerText), new RegExp('₹' + Math.floor(ann).toLocaleString('en-IN') + '|₹' + Math.round(ann).toLocaleString('en-IN'))); await s2.close();
  });

  test('next-step nudges carry the numbers to the next calculator once, and desktop columns stay side by side', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } }), go = async (from, pick) => { const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
      await pg.goto(url(SITE, from)); await pg.waitForTimeout(200); await Promise.all([pg.waitForNavigation(), pg.click(`#nudge a[data-i="${pick || 0}"]`)]); await pg.waitForTimeout(250); return pg; };
    let pg = await go('salary-calculator.html', 2);
    assert.match(pg.url(), /sip-calculator\.html\?sip=26500$/); assert.equal(await pg.inputValue('#sip'), '26,500'); assert.match(await pg.$eval('#handoffNote', e => e.innerText), /Filled in from your salary\. 30% of your monthly in-hand pay/);
    await pg.reload(); await pg.waitForTimeout(200); assert.equal(await pg.inputValue('#sip'), '26,500'); assert.equal(await pg.$('#handoffNote'), null, 'the note shows only once'); assert.deepEqual(pg.errs, []); await pg.close();
    pg = await go('hra-calculator.html');                                                     // the salary page fills its payslip fields late: the numbers must still land
    assert.deepEqual(await Promise.all(['pBasic', 'pHra', 'pOther', 'pPf', 'rent'].map(i => pg.inputValue('#' + i))), ['50,000', '25,000', '0', '6,000', '28,000']); assert.equal(await pg.isVisible('#payMode'), true); await pg.close();
    pg = await go('fire-calculator.html'); assert.match(pg.url(), /swp-calculator\.html\?corpus=\d+&wd=\d+&(step=6&ret=8|ret=8&step=6)&yrs=45/); assert.ok(await pg.$('#handoffNote')); await pg.close();
    pg = await go('networth-calculator.html'); assert.equal(await pg.inputValue('#corp'), '27,70,000'); assert.ok(await pg.$('#handoffNote')); await pg.close();
    pg = await go('abroad-calculator.html'); assert.equal(await pg.inputValue('#country'), 'US'); assert.equal(await pg.inputValue('#cash'), '0'); assert.notEqual(await pg.inputValue('#saveYear'), '60,000'); await pg.close();
    for (const f of ['salary-hike-calculator.html', 'return-calculator.html']) { pg = await go(f); assert.match(pg.url(), /(sip|swp)-calculator\.html\?/); assert.deepEqual(pg.errs, [], f); await pg.close(); }
    pg = await ctx.newPage(); await pg.goto(url(SITE, 'sip-calculator.html')); await pg.waitForTimeout(150); assert.equal(await pg.$('#handoffNote'), null, 'plain visits get no note'); await pg.close(); await ctx.close();
    const d = await open(SITE, 'return-calculator.html', 1366);
    assert.deepEqual(await d.evaluate(() => [...document.querySelector('.tool-layout').children].map(k => getComputedStyle(k).position)), ['sticky', 'static']);
    await d.evaluate(() => scrollTo({ top: 2600, behavior: 'instant' })); await d.waitForTimeout(200);
    const r = await d.evaluate(() => innerHeight - document.querySelector('.tool-layout').children[0].getBoundingClientRect().bottom); assert.ok(r >= 0 && r < 40, 'the inputs stay in view beside the results, not a blank strip: ' + r); await d.close();
  });

  test('share my result: a picture of the result (not the inputs) with the calculator link, in a window that closes with Escape', async () => {
    for (const [f, w] of [['salary-calculator.html', 390], ['swp-calculator.html', 1280], ['index.html', 390]]) {
      const pg = await open(SITE, f, w); await pg.click('.share-btn'); await pg.waitForSelector('.share-sheet .share-img[src^="data:image/png"]');
      const img = await pg.$eval('.share-img', i => new Promise(r => { const x = new Image(); x.onload = () => r([x.naturalWidth, x.naturalHeight]); x.src = i.src; }));
      assert.deepEqual(img, [1080, 1350], f); assert.equal(await pg.$eval('.share-sheet', e => e.getAttribute('aria-modal')), 'true');
      assert.equal(await pg.evaluate(() => document.activeElement.dataset.a), 'img', 'focus moves into the window');
      await pg.keyboard.press('Escape'); assert.equal(await pg.$('.share-sheet'), null); assert.equal(await pg.evaluate(() => document.activeElement.className), 'share-btn', 'focus returns to Share');
      assert.deepEqual(pg.errs, [], f); await pg.close();
    }
    const pg = await open(SITE, 'salary-calculator.html', 390); await pg.click('.share-btn'); await pg.waitForSelector('.share-img[src^="data:"]');
    await pg.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'null' }).catch(() => {});
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.share-sheet [data-a=img]')]); assert.equal(dl.suggestedFilename(), 'rupeecheck-salary.png');
    await pg.waitForSelector('.toast'); assert.match(await pg.textContent('.toast'), /Picture saved/);
    const clip = await pg.evaluate(() => Promise.race([navigator.clipboard.readText().catch(() => null), new Promise(r => setTimeout(() => r(null), 500))])); if (clip !== null) assert.equal(clip, 'https://rupeecheck.in/salary-calculator.html', 'the bare calculator link, never the typed numbers');
    await pg.close();
  });

  test('analytics (Umami): sets no cookies and never receives the numbers in the address', async () => {
    const http = require('http'), srv = http.createServer((q, r) => { const f = path.join(LIVE, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
    const pg = await browser.newPage(); const sent = [];
    await pg.exposeFunction('__sent', x => sent.push(x));
    await pg.route('https://cloud.umami.is/script.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.umami = { track(a, b) { const p = { url: location.href, referrer: document.referrer };
      const out = typeof a === 'function' ? a(p) : { ...p, name: a, data: b };   /* a strict fake: it ignores every privacy setting, so only the site's own code keeps the address clean */ window.__sent(JSON.stringify(out)); } };` }));
    await pg.route(/googletagmanager|googlesyndication/, r => r.abort());
    await pg.goto(base + 'salary-calculator.html'); await pg.waitForTimeout(300); await pg.goto(base + 'sip-calculator.html?sip=26500&yrs=20'); await pg.waitForTimeout(400);
    const tag = await pg.$eval('script[src="https://cloud.umami.is/script.js"]', e => ({ id: e.dataset.websiteId, auto: e.dataset.autoTrack, search: e.dataset.excludeSearch, dnt: e.dataset.doNotTrack, dom: e.dataset.domains }));
    assert.deepEqual(tag, { id: '0b9e6c1e-1111-4a2b-9c3d-123456789abc', auto: 'false', search: 'true', dnt: 'true', dom: 'rupeecheck.in' });
    await pg.fill('#sip', '30,000'); await pg.waitForTimeout(500);
    const all = sent.map(x => JSON.parse(x)), views = all.filter(x => !x.name);
    assert.ok(views.some(v => v.url === '/sip-calculator.html'), 'a pageview with the bare path: ' + JSON.stringify(all));
    assert.ok(all.some(x => x.name === 'calculator_used'), 'events are counted');
    assert.ok(!JSON.stringify(all).includes('26500') && !JSON.stringify(all).includes('?'), 'nothing after "?" ever leaves: ' + JSON.stringify(all));
    assert.deepEqual(await pg.context().cookies(base), []); await pg.close(); srv.close();
  });

  test('analytics: counts reading paths and how calculators are used, with page, option and field names only', async t => {
    const http = require('http'), srv = http.createServer((q, r) => { const f = path.join(LIVE, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
    const pg = await browser.newPage(); pg.setDefaultTimeout(10000); const sent = []; t.after(() => { srv.close(); pg.close().catch(() => {}); });
    await pg.addInitScript(() => { try { localStorage.setItem('inhand-consent', 'no'); } catch (e) {} });                     // no cookie banner over the buttons
    await pg.exposeFunction('__sent', x => sent.push(x));
    await pg.route('https://cloud.umami.is/script.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.umami = { track(a, b) { const out = typeof a === 'function' ? a({ url: location.href }) : { name: a, data: b }; window.__sent(JSON.stringify(out)); } };` }));
    await pg.route(/googletagmanager|googlesyndication/, r => r.abort());
    const stay = () => pg.evaluate(() => document.addEventListener('click', e => e.preventDefault()));           // count the click, don't leave the page
    await pg.goto(base + 'prepay-home-loan-or-invest.html'); await pg.waitForTimeout(400); await stay();
    await pg.click('.scenario a.btn >> nth=1'); await pg.$eval('article .faq', e => e.scrollIntoView());
    for (let i = 0; i < 30 && !sent.some(x => x.includes('article_read')); i++) await pg.waitForTimeout(100);
    await pg.goto(base + 'emi-calculator.html'); await pg.waitForTimeout(400); await stay(); await pg.click('.read-card');
    await pg.goto(base); await pg.waitForTimeout(400); await stay(); await pg.click('#rotCta'); await pg.click('#articles .art-card >> nth=0'); await pg.waitForTimeout(300);
    await pg.goto(base + 'salary-calculator.html'); await pg.waitForTimeout(400);
    await pg.fill('#ctc', '15,43,210'); await pg.fill('#ctc', '15,43,219'); await pg.click('#regime button[data-v=old]'); await pg.click('#regime button[data-v=old]');
    await pg.evaluate(() => { [...document.querySelectorAll('details')].find(d => !d.closest('.faq') && !d.open).open = true; document.querySelector('.faq details').open = true; }); await pg.waitForTimeout(300);
    const ev = sent.map(x => JSON.parse(x)).filter(x => x.name), by = n => ev.filter(x => x.name === n).map(x => x.data);
    assert.deepEqual(by('field_changed'), [{ tool: 'salary', field: 'ctc' }], 'a field is counted once, by name');
    assert.deepEqual(by('option_chosen'), [{ tool: 'salary', control: 'regime', choice: 'old' }]);
    assert.equal(by('section_opened').length, 1); assert.equal(by('section_opened')[0].tool, 'salary'); assert.equal(by('faq_opened').length, 1);
    assert.ok(!/1543|15,43/.test(JSON.stringify(ev)), 'typed values never leave: ' + JSON.stringify(ev));
    // the owner's switch: #notrack stops counting this browser on every page, #track turns it back on
    await pg.goto(base + 'index.html#notrack'); await pg.waitForTimeout(300);
    assert.equal(await pg.$('script[src="https://cloud.umami.is/script.js"]'), null, 'no analytics after #notrack'); assert.equal(await pg.evaluate(() => location.hash), '');
    await pg.goto(base + 'sip-calculator.html'); await pg.waitForTimeout(300); assert.equal(await pg.$('script[src="https://cloud.umami.is/script.js"]'), null, 'still off on other pages');
    await pg.goto(base + 'fd-calculator.html#track'); await pg.waitForTimeout(300); assert.ok(await pg.$('script[src="https://cloud.umami.is/script.js"]'), 'back on after #track');
    assert.deepEqual(by('article_to_calculator'), [{ article: 'prepay-home-loan-or-invest.html', tool: 'emi-calculator.html', prefilled: 'yes' }]);
    assert.deepEqual(by('article_read'), [{ article: 'prepay-home-loan-or-invest.html' }]);
    assert.deepEqual(by('calculator_to_article'), [{ tool: 'emi', article: 'prepay-home-loan-or-invest.html' }]);
    assert.deepEqual(by('hero_cta'), [{ to: 'salary-calculator.html' }]);
    assert.equal(by('article_card').length, 1); assert.equal(by('article_card')[0].from, 'home');
    assert.ok(!/\.html\?|\?[a-z0-9]+=/i.test(JSON.stringify(ev)) && !JSON.stringify(ev).includes('5000000'), 'no prefilled numbers leave: ' + JSON.stringify(ev));
    await pg.close(); srv.close();
  });

  test('Return to India: answers "if we return now" first, shows what closes the gap, year buttons by the result, job-search months up front', async () => {
    const pg = await open(SITE, 'return-calculator.html', 390); const txt = sel => pg.$eval(sel, e => e.innerText.replace(/\s+/g, ' '));
    assert.equal(await pg.isVisible('#jobGap'), true, 'months to find a job sits in the main form');
    assert.match(await txt('#gridNote'), /weaker rupee has stopped helping/);
    assert.match(await txt('#fix'), /How to close the ₹1\.05 Cr gap[\s\S]*Spend about ₹1,11,000 a month[\s\S]*Work in India at about ₹7,00,000 a year[\s\S]*Return in 2 years/);
    await pg.click('#fixL button[data-act=jobCtc]'); await pg.waitForTimeout(250);
    assert.equal(await pg.inputValue('#jobCtc'), '7,00,000'); assert.match(await txt('#hero'), /to spare/); assert.equal(await pg.isVisible('#fix'), false, 'covered: the card goes away');
    await pg.fill('#jobCtc', '0'); await pg.waitForTimeout(200); await pg.click('#fixL button[data-act=spend]'); await pg.waitForTimeout(250); assert.equal(await pg.inputValue('#spend'), '1,11,000'); assert.match(await txt('#hero'), /to spare/);
    await pg.fill('#spend', '1,50,000'); await pg.waitForTimeout(200); await pg.click('#whenChips [data-w="2"]'); await pg.waitForTimeout(250);
    assert.equal(await pg.inputValue('#when'), '2'); assert.match(await txt('#hero'), /If you return in 2 years \(age 38\)[\s\S]*₹82\.03 L to spare/); assert.equal(await pg.$eval('#whenChips [data-w="2"]', b => b.classList.contains('on')), true);
    assert.equal(await pg.$eval('#whenChips', e => e.scrollHeight <= 48), true, 'the year buttons stay on one row on a phone');
    assert.deepEqual(pg.errs, []); await pg.close();
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'return-calculator.html') + '?when=3'); await lk.waitForTimeout(300); assert.equal(await lk.$eval('#whenChips [data-w="3"]', b => b.classList.contains('on')), true); await lk.close();
  });

  test('Layoff runway: settlement after tax, runway today and cut back, job-search check, PF as a last resort, quick picks and share link', async () => {
    const pg = await open(SITE, 'layoff-runway-calculator.html', 390); const txt = sel => pg.$eval(sel, e => e.innerText.replace(/\s+/g, ' '));
    assert.match(await txt('#hero'), /Your money lasts 9 months[\s\S]*Cut back to ₹80,000 and it lasts 12 months[\s\S]*Covers a 6-month job search with 3 months to spare/);
    assert.match(await txt('#setTbl'), /Tax on the payout \(estimate\) − ₹1,30,000 Settlement after tax ₹5,20,000[\s\S]*Money you can use now ₹10,20,000/);   // ₹6.5 L on top of ₹10.5 L of salary: ₹1.25 L + 4% cess
    assert.match(await txt('#tips'), /^Cutting “everything else”[\s\S]*Your PF, as a last resort/, 'PF is offered last');
    await pg.click('.chips[data-for=severance] .chip[data-n="3"]'); await pg.waitForTimeout(200); assert.equal(await pg.inputValue('#severance'), '4,50,000');
    await pg.click('label.toggle:has(#pfOn)'); await pg.waitForTimeout(200); assert.equal(await pg.isChecked('#pfOn'), true); assert.match(await txt('#kpis'), /PF counted/);
    await pg.fill('#savings', '0'); await pg.fill('#severance', '0'); await pg.fill('#notice', '0'); await pg.fill('#leave', '0'); await pg.click('label.toggle:has(#pfOn)'); await pg.waitForTimeout(200);
    assert.match(await txt('#hero'), /Under a month/); assert.doesNotMatch(await txt('main'), /NaN|undefined|Infinity/);
    assert.deepEqual(pg.errs, []); await pg.close();
    const lk = await browser.newPage(); await lk.goto(url(SITE, 'layoff-runway-calculator.html') + '?savings=1500000&search=9&pfOn=1'); await lk.waitForTimeout(300);
    assert.equal(await lk.inputValue('#savings'), '15,00,000'); assert.equal(await lk.isChecked('#pfOn'), true); assert.match(await lk.$eval('#hero', e => e.innerText), /9-month job search/); await lk.close();
  });

  test('teardown', async () => { await browser.close(); fs.rmSync(LIVE, { recursive: true, force: true }); });
}
