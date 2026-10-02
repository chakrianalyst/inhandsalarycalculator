// node --test tests/abroad.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../assets/abroad.js'), Tax = require('../assets/tax.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('progressive bands', () => { near(A.progressive(60000, [[10000, 0], [50000, .1], [Infinity, .2]]), 4000 + 2000, 1e-9); assert.equal(A.progressive(0, [[10, .5], [Infinity, .9]]), 0); });

test('US: $120k in a no-income-tax state — federal, Social Security and Medicare by hand', () => {
  const r = A.netPay('US', 120000, { state: 'none' }); near(r.tax, 17570 + 7440 + 1740, 0.01); near(r.net, 93250, 0.01);
  assert.deepEqual(r.items.map(x => x.label), ['Federal income tax', 'Social Security', 'Medicare']);
});
test('US: Social Security stops at the wage base; Medicare surcharge above $200k; states add tax', () => {
  const hi = A.netPay('US', 400000, { state: 'none' }), ss = hi.items.find(x => x.label === 'Social Security').amt; near(ss, 184500 * 0.062, 0.01);
  near(hi.items.find(x => x.label === 'Medicare').amt, 400000 * 0.0145 + 200000 * 0.009, 0.01);
  for (const s of ['CA', 'NY', 'NYC', 'NJ', 'MA', 'IL']) assert.ok(A.netPay('US', 150000, { state: s }).net < A.netPay('US', 150000, { state: 'none' }).net, s);
  assert.ok(A.netPay('US', 150000, { state: 'NYC' }).net < A.netPay('US', 150000, { state: 'NY' }).net);
});
test('Canada: Alberta at C$100k by hand; Ontario costs more than Alberta; payroll caps hold', () => {
  near(A.netPay('CA', 100000, { province: 'AB' }).net, 74248, 2); assert.ok(A.netPay('CA', 100000, { province: 'ON' }).net < A.netPay('CA', 100000, { province: 'AB' }).net);
  const e = A.netPay('CA', 300000, { province: 'AB' }).items.find(x => x.label === 'Employment Insurance').amt; near(e, 0.0163 * 68900, 0.01);
});
test('Australia: A$150k = income tax 36,570 + Medicare 3,000; nothing under the tax-free threshold', () => {
  near(A.netPay('AU', 150000).tax, 39570, 0.01); assert.equal(A.netPay('AU', 18000).tax, 0);
});
test('Singapore: S$150k = 12,450 before reliefs; UAE has no income tax', () => { near(A.netPay('SG', 150000).tax, 12450, 0.01); assert.equal(A.netPay('AE', 500000).tax, 0); assert.equal(A.netPay('AE', 500000).net, 500000); });
test('tax thresholds rise with prices: the same real pay is taxed the same share', () => { const a = A.netPay('US', 120000, { state: 'none' }, 1), b = A.netPay('US', 120000 * 1.5, { state: 'none' }, 1.5); near(b.tax / 1.5, a.tax, 0.01); });

const P = () => ({ years: 10, parents: 0,
  india: { ctc: 4000000, rent: 30000, other: 30000, growth: 8, infl: 6, ret: 10, ptState: 'KA' },
  abroad: { country: 'US', opt: { state: 'none' }, gross: 120000, rent: 2000, other: 1500, growth: 4, infl: 3, ret: 7, fx: 96, dep: 3, trips: 150000, oneTime: 500000 } });

test('compare: year 1 of India matches the salary engine, and net worth builds with the interest rule', () => {
  const p = P(), c = A.compare(p), r = Tax.salary({ ctc: 4000000, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, ptState: 'KA', metro: true, rentMonthly: 30000 });
  near(c.rows[0].indiaInHand, r[r.best].inHandYear, 0.01); const save = r[r.best].inHandYear - 60 * 12 * 1000; near(c.rows[0].indiaSave, save, 0.01); near(c.rows[0].indiaNW, save * (1 + 0.1 / 2), 0.01); assert.equal(c.rows.length, 10);
});
test('compare: abroad year 1 follows the tax function, rupee costs and one-time cost', () => {
  const p = P(), c = A.compare(p), np = A.netPay('US', 120000, { state: 'none' }, 1), local = np.net - 3500 * 12 - (150000 + 500000) / 96;
  near(c.rows[0].abroadSaveLocal, local, 0.01); near(c.rows[0].abroadNWLocal, local * 1.035, 0.01); near(c.rows[0].abroadNW, local * 1.035 * 96 * 1.03, 0.5);
});
test('compare: more pay, more rupee weakness or lower rent all help the abroad path; parents remittance hurts both', () => {
  const base = A.compare(P()).diff;
  assert.ok(A.compare({ ...P(), abroad: { ...P().abroad, gross: 150000 } }).diff > base); assert.ok(A.compare({ ...P(), abroad: { ...P().abroad, dep: 6 } }).diff > base); assert.ok(A.compare({ ...P(), abroad: { ...P().abroad, rent: 1500 } }).diff > base);
  const pa = A.compare({ ...P(), parents: 20000 }); assert.ok(pa.indiaNW < A.compare(P()).indiaNW); assert.ok(pa.abroadNW < A.compare(P()).abroadNW);
});
test('compare: break-even year and break-even salary are consistent', () => {
  const p = P(), g = A.breakEvenSalary(p); assert.ok(g > 0 && g < 120000 * 10); near(A.compare({ ...p, abroad: { ...p.abroad, gross: g } }).diff, 0, 2000);
  const win = A.compare(P()); if (win.diff > 0) assert.ok(win.breakEven >= 1 && win.breakEven <= 10);
  assert.equal(A.breakEvenSalary({ ...p, abroad: { ...p.abroad, rent: 1e9 } }), null);
});

test('UK: £85k by hand (income tax 21,432 + NI 3,710.60); the personal allowance tapers above £100k; a pension gives tax relief but not NI relief', () => {
  const r = A.netPay('UK', 85000); near(r.tax, 21432 + 3710.6, 0.01); near(r.net, 85000 - 21432 - 3710.6, 0.01);
  const hi = A.netPay('UK', 110000); near(hi.items.find(x => x.label === 'Income tax').amt, 33432, 0.01); near(hi.items.find(x => x.label === 'National Insurance').amt, 3016 + 0.02 * (110000 - 50270), 0.01);
  const pen = A.netPay('UK', 85000, { retPct: 5, matchPct: 3 }); assert.ok(pen.items.find(x => x.label === 'Income tax').amt < 21432); near(pen.items.find(x => x.label === 'National Insurance').amt, 3710.6, 0.01); near(pen.contrib, 4250, 0.01); near(pen.employer, 2550, 0.01);
});
test('Germany: tariff formula continuity and the €90k example (tax class 1)', () => {
  assert.equal(A.deTariff(12000), 0); near(A.deTariff(17799), 1034, 1); near(A.deTariff(69878), 18213, 2); near(A.deTariff(100000), 0.42 * 100000 - 11135.63, 1);
  const r = A.netPay('DE', 90000); near(r.items.find(x => x.label === 'Income tax').amt, 19350, 1); assert.equal(r.items.find(x => x.label === 'Solidarity surcharge'), undefined);        // income tax below the €20,350 threshold: no surcharge
  near(r.tax - 19350, 8370 + 1170 + 0.0875 * 69750 + 0.024 * 69750, 1.5); assert.ok(A.netPay('DE', 200000).items.find(x => x.label === 'Solidarity surcharge').amt > 0);
});
test('retirement: 401(k) lowers income tax but not payroll tax, is capped, and is not part of take-home', () => {
  const r = A.netPay('US', 120000, { state: 'none', retPct: 6, matchPct: 4 }); near(r.items.find(x => x.label === 'Federal income tax').amt, 15986, 0.01); near(r.items.find(x => x.label === 'Social Security').amt, 7440, 0.01);
  near(r.net, 120000 - 15986 - 7440 - 1740 - 7200, 0.01); near(r.contrib, 7200, 0.01); near(r.employer, 4800, 0.01); near(A.netPay('US', 500000, { state: 'none', retPct: 6 }).contrib, 24500, 0.01);
  near(A.netPay('AU', 100000, { matchPct: 12 }).employer, 12000 * 0.85, 0.01); assert.equal(A.netPay('AU', 100000, { matchPct: 12 }).net, A.netPay('AU', 100000).net);
});
test('retirement balances count toward net worth on both sides; a partner adds income on both sides', () => {
  const p = P(); const none = A.compare(p), withEpf = A.compare({ ...p, india: { ...p.india, epf: true } });
  assert.ok(withEpf.indiaNW > none.indiaNW); assert.equal(withEpf.abroadNW, none.abroadNW); assert.ok(withEpf.rows[0].indiaRetire > 0);
  const ret = A.compare({ ...p, abroad: { ...p.abroad, opt: { state: 'none', retPct: 6, matchPct: 4 } } }); assert.ok(ret.rows[0].abroadRetire > 0); assert.ok(ret.abroadNW > none.abroadNW - 5e6);                           // contributions are saved, so wealth is not lost
  const par = A.compare({ ...p, partner: { on: true, indiaCtc: 1500000, abroadGross: 60000 } }); assert.ok(par.indiaNW > none.indiaNW); assert.ok(par.abroadNW > none.abroadNW);
  assert.equal(A.compare({ ...p, partner: { on: false, indiaCtc: 1500000, abroadGross: 60000 } }).diff, none.diff);
});
