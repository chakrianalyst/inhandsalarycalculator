/* Articles quote numbers worked out with the calculators. These tests recompute every key figure with the same engines,
   so a change to a tax rule or a formula that makes an article wrong fails here instead of going live. Page-only tools
   (job offers, salary hike page, layoff page, life simulator, net worth) are checked in the browser smoke tests. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const Tax = require(path.join(ROOT, 'assets', 'tax.js')), HRA = require(path.join(ROOT, 'assets', 'hra.js')), G = require(path.join(ROOT, 'assets', 'gratuity.js')), L = require(path.join(ROOT, 'assets', 'layoff.js'));
const R = require(path.join(ROOT, 'skills', 'rupeecheck-content', 'engine', 'run.js')).TOOLS;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const inr = n => '₹' + new Intl.NumberFormat('en-IN').format(Math.round(n));
const lakh = (n, d = 1) => '₹' + (n / 1e5).toFixed(d) + ' L', crore = (n, d = 2) => '₹' + (n / 1e7).toFixed(d) + ' Cr';
const BASE = { basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 };
const sal = (ctc, o) => Tax.salary({ ...BASE, ctc, ...o });
const newTax = gross => Tax.computeTax(Math.max(0, gross - 75000), 'new').total;
const ARTICLES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && /<meta name="rc-article"/.test(read(f)));

function expectIn(file, values) {                       // prose may say "₹5.30 crore" where a card says "₹5.30 Cr": both count
  const h = read(file).replace(/ crore/g, ' Cr').replace(/ lakh/g, ' L'), missing = values.filter(v => !h.includes(v));
  assert.deepEqual(missing, [], `${file} is missing figures the calculators give`);
}

test('there is one article for every calculator, and each is complete', () => {
  const common = read('assets/common.js'), tools = [...common.matchAll(/\{ id: '([a-z]+)', group/g)].map(m => m[1]);
  const covered = ARTICLES.map(f => read(f).match(/<meta name="rc-article" content="([a-z]+)"/)[1]);
  for (const t of tools) assert.ok(covered.includes(t), 'no article for ' + t);
  for (const f of ARTICLES) {
    const h = read(f), tool = h.match(/<meta name="rc-article" content="([a-z]+)"/)[1];
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, f + ': one h1');
    assert.ok(h.includes(`Common.init('${tool}')`), f + ': highlights its calculator');
    for (const part of ['class="tldr"', 'class="scenario"', 'class="faq"', 'class="disclaim"', '{{MORE_ARTICLES}}', '{{READ_MINS}}', '<p class="dek">'])
      assert.ok(h.includes(part), `${f}: has ${part}`);
    const tf = tools.length && common.match(new RegExp(`id: '${tool}'[^}]*href: '([^']+)'`))[1];
    assert.ok(h.includes(`href="${tf}`), f + ': links to its calculator ' + tf);
  }
});

test('₹12 lakh article', () => {
  const f = '12-lakh-no-tax-explained.html';
  expectIn(f, [inr(sal(1200000).new.inHandMonth), inr(sal(1200000).old.inHandMonth), inr(sal(1360000).new.inHandMonth), inr(sal(1440000).new.inHandMonth), inr(sal(1440000).new.tax),
    inr(sal(1400000).new.tax), inr(sal(1400000, { employerNps: 56000 }).new.inHandMonth), inr(sal(1500000).new.inHandMonth), inr(Tax.computeTax(1250000, 'new').total),
    ...[1280000, 1300000, 1325000, 1345000, 1350000, 1400000].flatMap(g => [inr(newTax(g)), inr(g - newTax(g))]), inr(sal(1200000).gross)]);
  assert.equal(sal(1366000).new.tax, 0); assert.ok(sal(1367000).new.tax > 0, 'zero-tax CTC limit is about ₹13.66 lakh');
});

test('salary hike article', () => {
  const f = 'salary-hike-in-hand-reality.html';
  expectIn(f, [1000000, 1300000, 2000000, 2600000, 3000000, 3900000].map(c => inr(sal(c).new.inHandMonth)));
  expectIn(f, [inr(sal(2600000).new.tax - sal(2000000).new.tax), inr((sal(2600000).new.inHandMonth - sal(2000000).new.inHandMonth))]);
});

test('HRA to parents article', () => {
  const f = 'pay-rent-to-parents-hra.html', x = HRA.calc({ basicM: 60000, hraM: 30000, rentM: 25000, months: 12, pctOfBasic: 0.5 });
  const a = R.salary({ ctc: 1800000, rentMonthly: 25000, metro: true }).results, b = R.salary({ ctc: 1800000, rentMonthly: 25000, metro: true, d80: 25000, other80c: 63600, nps1b: 50000 }).results;
  const c = R.salary({ ctc: 3000000, rentMonthly: 60000, metro: true, d80: 25000, other80c: 6000, nps1b: 50000 }).results;
  expectIn(f, [inr(x.exempt), inr(x.taxable), inr(a.inHandMonthNewRegime), inr(a.inHandMonthOldRegime), inr((a.inHandMonthNewRegime - a.inHandMonthOldRegime) * 12), inr((b.inHandMonthNewRegime - b.inHandMonthOldRegime) * 12),
    inr(c.inHandMonthNewRegime), inr(c.inHandMonthOldRegime), inr((c.inHandMonthOldRegime - c.inHandMonthNewRegime) * 12), inr(Tax.computeTax(900000 - 75000 + 720000 * 0.7, 'new').total)]);
});

test('gratuity article', () => {
  const g = p => G.calc({ kind: 'covered', months: 0, ...p });
  expectIn('gratuity-rules-explained.html', [inr(g({ wage: 50000, years: 10 }).payable), inr(g({ wage: 50000, years: 5 }).payable), inr(g({ wage: 50000, years: 7, months: 5 }).payable), inr(g({ wage: 50000, years: 7, months: 7 }).payable),
    inr(g({ wage: 40000, years: 6 }).payable), inr(g({ wage: 40000, years: 6, totalPay: 120000, apply50: true }).payable), inr(g({ wage: 50000, years: 2, fixedTerm: true }).payable), inr(g({ wage: 50000, years: 10, kind: 'notcovered' }).payable)]);
  assert.equal(g({ wage: 50000, years: 4, months: 11 }).payable, 0);
});

test('layoff article: settlement tax by month', () => {
  const ct = x => Tax.computeTax(x, 'new').total, s = m => L.settlement({ monthly: 150000, monthsWorked: m, severance: 300000, notice: 300000, leave: 50000, gratuity: 0 }, ct);
  assert.equal(s(2).tax, 0); expectIn('laid-off-in-india-money-plan.html', [inr(s(7).tax), inr(s(12).tax)]);
});

test('home loan article', () => {
  const e = j => R.emi({ amt: 5000000, rate: 8.5, yrs: 20, ...j }).results, f = 'prepay-home-loan-or-invest.html';
  expectIn(f, [inr(e({}).emi), lakh(e({}).totalInterest), inr(e({}).year1Principal), lakh(e({ extra: 5000 }).withPrepayment.interestSaved), lakh(e({ extra: 10000 }).withPrepayment.interestSaved), lakh(e({ lump: 500000, lumpM: 24 }).withPrepayment.interestSaved)]);
  const sip = (s, ret, y, m) => R.sip({ mode: 'sip', sip: s, ret, yrs: y, mon: m, step: 0, taxk: 'equity' }).results.valueAfterTax;
  expectIn(f, [8.5, 10, 12].flatMap(r => [lakh(sip(5000, r, 20, 0)), lakh(sip(48391, r, 4, 5))]));
});

test('SIP article', () => {
  const s = j => R.sip({ mode: 'sip', ret: 12, step: 0, taxk: 'none', ...j }).results, f = 'sip-delay-cost-of-waiting.html';
  const target = s({ sip: 10000, yrs: 35 }).futureValue, goal = y => R.sip({ mode: 'goal', goal: Math.round(target), goalIn: 'future', ret: 12, yrs: y, step: 0, taxk: 'none' }).results.monthlySip;
  expectIn(f, [crore(target), crore(s({ sip: 10000, yrs: 30 }).futureValue), crore(s({ sip: 10000, yrs: 25 }).futureValue), inr(goal(30)), inr(goal(25)), inr(s({ sip: 10000, yrs: 20, step: 10 }).lastYearMonthlySip),
    lakh(s({ sip: 10000, yrs: 35 }).valueAfterTaxInTodaysMoney), inr(R.sip({ mode: 'goal', goal: 10000000, goalIn: 'today', ret: 12, yrs: 20, step: 0, infl: 6 }).results.monthlySip)]);
});

test('FD article', () => {
  const d = j => R.fd({ p: 1000000, rate: 7, yrs: 5, ...j }).results, f = 'fd-interest-tax-explained.html';
  expectIn(f, [inr(d({ sal: 1500000 }).taxOnInterest), inr(d({ sal: 2500000 }).taxOnInterest), inr(d({ sal: 1275000 }).taxOnInterest), inr(d({ sal: 1275000 }).taxByYear[0]), inr(d({ sal: 0 }).interest), inr(d({ sal: 0 }).interestByYear[0]),
    inr(R.fd({ p: 5000000, rate: 7.5, yrs: 5, sal: 600000, senior: true }).results.interestByYear[0])]);
  assert.equal(d({ sal: 600000 }).taxOnInterest, 0);
});

test('SWP article', () => {
  const s = j => R.swp({ corpus: 10000000, wd: 50000, step: 6, ret: 10, yrs: 25, gainPct: 0, taxk: 'equity', ...j }).results, f = 'monthly-income-from-mutual-funds-swp.html';
  expectIn(f, [inr(s({}).maxMonthlyWithdrawalThatLasts), inr(s({}).year1Profit), inr(s({}).year1Tax), lakh(s({}).leftAtEnd)]);
  assert.equal(s({}).lastsAllYears, true); assert.equal(s({ wd: 60000 }).lastsAllYears, false); assert.equal(s({ ret: 8 }).lastsAllYears, false);
});

test('FIRE article', () => {
  const fi = j => R.fire(j).results, f = 'retire-early-india-how-much.html';
  expectIn(f, [crore(fi({}).corpusNeeded), crore(fi({}).projectedCorpus), inr(fi({}).monthlySavingNeededToRetireOnTime), crore(fi({ exp: 40000 }).corpusNeeded), crore(fi({ exp: 100000 }).corpusNeeded), crore(fi({ infl: 7 }).corpusNeeded),
    crore(fi({ ratio: 70 }).corpusNeeded), crore(fi({ ratio: 150 }).corpusNeeded), crore(fi({ retAge: 50 }).corpusNeeded), crore(fi({}).coastNumberToday)]);
  assert.equal(fi({}).earliestAgeYouCouldRetire, 48); assert.equal(fi({ sav: 80000 }).earliestAgeYouCouldRetire, 44);
});

test('rent vs buy article', () => {
  const r = j => R.rentbuy(j).results, f = 'rent-or-buy-house-india.html';
  expectIn(f, [crore(r({}).buyNetWorth), crore(r({}).rentAndInvestNetWorth), inr(r({}).emi), lakh(-r({ app: 6, inv: 10 }).buyMinusRentInTodaysMoney), lakh(r({ rent: 45000, app: 6, inv: 10 }).buyMinusRentInTodaysMoney), lakh(r({ rent: 50000, app: 6, inv: 10 }).buyMinusRentInTodaysMoney)]);
  assert.equal(r({ rent: 45000, app: 6, inv: 10 }).breakEvenYear, 8);
});

test('abroad article', () => {
  const a = j => R.abroad(j).results, f = 'is-moving-abroad-worth-it.html';
  expectIn(f, [inr(a({}).takeHomeMonthAbroadInRupees), inr(a({}).takeHomeMonthIndia), lakh(-a({}).abroadAheadBy), inr(a({ city: 'aus', rentA: 1800, otherA: 1500 }).takeHomeMonthAbroadInRupees),
    crore(a({ city: 'aus', rentA: 1800, otherA: 1500 }).abroadAheadBy), crore(a({ ctc: 2500000 }).abroadAheadBy)]);
});

test('return to India article', () => {
  const t = j => R.return(j).results.table[0], f = 'moving-back-to-india-money-checklist.html';
  expectIn(f, [crore(t({}).youBringHome), crore(t({}).youNeed), crore(-t({}).gap), crore(t({ jobCtc: 2500000, jobGap: 6 }).gap)]);
  assert.equal(R.return({}).results.firstReadyInYears, 2);
});
