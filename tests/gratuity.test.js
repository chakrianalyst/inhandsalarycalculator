// node --test tests/gratuity.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../assets/gratuity.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('covered: wage × 15 ÷ 26 × years', () => { const r = G.calc({ wage: 50000, years: 10, months: 0, kind: 'covered' }); near(r.amount, 50000 * 15 / 26 * 10, 0.001); near(r.payable, r.amount, 0); assert.ok(r.eligible); });

test('part-years: more than 6 months counts as a full year; exactly 6 months does not', () => {
  assert.equal(G.calc({ wage: 40000, years: 7, months: 7, kind: 'covered' }).counted, 8); assert.equal(G.calc({ wage: 40000, years: 7, months: 6, kind: 'covered' }).counted, 7);
  assert.equal(G.calc({ wage: 40000, years: 7, months: 11, kind: 'notcovered' }).counted, 7);                   // not covered: completed years only
});

test('not covered: wage × 15 ÷ 30 × completed years', () => near(G.calc({ wage: 50000, years: 10, months: 0, kind: 'notcovered' }).amount, 250000, 0.001));

test('eligibility: 5 years normally, 1 year for fixed-term; below that nothing is payable and the wait is reported', () => {
  const a = G.calc({ wage: 50000, years: 4, months: 3, kind: 'covered' }); assert.equal(a.eligible, false); assert.equal(a.payable, 0); assert.equal(a.monthsToGo, 9);
  assert.equal(G.calc({ wage: 50000, years: 5, months: 0, kind: 'covered' }).eligible, true);
  assert.equal(G.calc({ wage: 50000, years: 1, months: 0, kind: 'covered', fixedTerm: true }).eligible, true); assert.equal(G.calc({ wage: 50000, years: 0, months: 11, kind: 'covered', fixedTerm: true }).eligible, false);
});

test('₹20 lakh cap: payable under the Act is capped and the excess is reported', () => {
  const r = G.calc({ wage: 300000, years: 30, kind: 'covered' }); near(r.payable, 2000000, 0); near(r.taxFree, 2000000, 0); near(r.aboveCap, 300000 * 15 / 26 * 30 - 2000000, 0.01);
});

test('government: a quarter of emoluments per completed six months, up to 16.5 months; fully tax-free', () => {
  const r = G.calc({ wage: 100000, years: 10, months: 5, kind: 'govt' }); assert.equal(r.counted, 10); near(r.amount, 100000 * 0.5 * 10, 0.01); assert.equal(r.taxFree, r.payable);
  near(G.calc({ wage: 100000, years: 12, months: 0, kind: 'govt' }).amount, 600000, 0.01);
  near(G.calc({ wage: 100000, years: 40, months: 0, kind: 'govt' }).amount, 1650000, 0.01);                       // 16.5 months of pay at most
});

test('50% rule: wage is lifted to half of total pay when basic is lower; ignored when switched off or already higher', () => {
  const on = G.calc({ wage: 40000, totalPay: 100000, apply50: true, years: 10, kind: 'covered' }); assert.equal(on.wage, 50000); assert.equal(on.raised, true);
  assert.equal(G.calc({ wage: 40000, totalPay: 100000, apply50: false, years: 10, kind: 'covered' }).wage, 40000); assert.equal(G.calc({ wage: 60000, totalPay: 100000, apply50: true, years: 10, kind: 'covered' }).raised, false);
});

test('projection: later exit years use a higher wage and more service', () => {
  const rows = G.projection({ wage: 50000, years: 6, months: 0, kind: 'covered' }, 8, [5, 10, 20]); assert.deepEqual(rows.map(r => r.years), [10, 20]);
  near(rows[0].wage, 50000 * Math.pow(1.08, 4), 0.01); near(rows[0].gratuity, 50000 * Math.pow(1.08, 4) * 15 / 26 * 10, 0.01);
});

test('central government: the limit is ₹25 lakh (from 1 January 2024), and it applies only to the government kind', () => {
  const gov = G.calc({ wage: 200000, years: 33, months: 0, kind: 'govt' });                 // 66 half-years × ₹50,000 = ₹33 lakh, which is also 16.5 months of pay
  near(gov.amount, Math.min(200000 / 4 * 66, 200000 * 16.5), 0.01); near(gov.amount, 3300000, 0.01); assert.equal(gov.payable, 2500000); assert.equal(gov.taxFree, 2500000); near(gov.aboveCap, 800000, 0.01); assert.equal(gov.cap, G.CAP_GOVT);
  const mid = G.calc({ wage: 150000, years: 30, months: 0, kind: 'govt' }); near(mid.payable, 150000 / 4 * 60, 0.01); assert.equal(mid.aboveCap, 0);      // ₹22.5 lakh: above the old ₹20 lakh limit, under the new one
  const priv = G.calc({ wage: 200000, years: 33, months: 0, kind: 'covered' }); assert.equal(priv.payable, 2000000); assert.equal(priv.taxFree, 2000000); assert.equal(priv.cap, G.CAP);
  const nc = G.calc({ wage: 200000, years: 33, months: 0, kind: 'notcovered' }); near(nc.payable, 200000 / 2 * 33, 0.01); assert.equal(nc.taxFree, 2000000);
  assert.equal(G.CAP, 2000000); assert.equal(G.CAP_GOVT, 2500000);
});

test('fixed-term: paid in proportion to the months served, not rounded to whole years', () => {
  const a = G.calc({ wage: 50000, years: 1, months: 3, kind: 'covered', fixedTerm: true }); near(a.counted, 1.25, 1e-9); near(a.payable, 50000 * 15 / 26 * 15 / 12, 0.01);      // 15 months
  const b = G.calc({ wage: 52000, years: 2, months: 9, kind: 'covered', fixedTerm: true }); near(b.payable, 2000 * 15 * 33 / 12, 0.01);                                      // ₹52,000 ÷ 26 = ₹2,000 a day; 33 months
  assert.equal(G.calc({ wage: 50000, years: 1, months: 7, kind: 'covered' }).eligible, false);                                                                           // without the fixed-term switch the 5-year rule stands
  assert.equal(G.calc({ wage: 40000, years: 7, months: 7, kind: 'covered' }).counted, 8);                                                                                // and permanent staff still round up after six months
});

test('close to five years: from 4 years 8 months the page can mention the 240-day reading, but nothing is payable', () => {
  const n = (y, m, o) => G.calc({ wage: 50000, years: y, months: m, kind: 'covered', ...o });
  assert.equal(n(4, 8).nearEligible, true); assert.equal(n(4, 8).payable, 0); assert.equal(n(4, 11).nearEligible, true); assert.equal(n(4, 7).nearEligible, false);
  assert.equal(n(5, 0).nearEligible, false); assert.equal(n(0, 11, { fixedTerm: true }).nearEligible, false); assert.equal(G.calc({ wage: 50000, years: 4, months: 9, kind: 'notcovered' }).nearEligible, false);
});
