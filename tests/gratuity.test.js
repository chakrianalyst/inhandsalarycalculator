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
