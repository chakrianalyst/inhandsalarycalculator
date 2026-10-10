/* Layoff runway: settlement tax (worked by hand) and the month-by-month runway. */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/layoff.js'), T = require('../assets/tax.js');
const ct = x => T.computeTax(x, 'new').total, near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('settlement: the payout is taxed on top of this year’s salary (new regime, standard deduction once)', () => {
  // ₹1.5 L a month for 7 months = ₹10.5 L (₹9.75 L after the deduction: no tax, under the ₹12 L rebate).
  // Add ₹8.25 L of severance, notice pay and leave: ₹18 L taxable → 20k + 40k + 60k + 40k = ₹1.6 L, plus 4% cess = ₹1,66,400.
  const s = L.settlement({ monthly: 150000, monthsWorked: 7, severance: 450000, notice: 300000, leave: 75000, gratuity: 0 }, ct);
  near(s.tax, 166400, 1); near(s.net, 825000 - 166400, 1); assert.equal(s.taxable, 825000);
});

test('settlement: gratuity is tax-free up to ₹20 lakh, only the excess is taxed', () => {
  const a = L.settlement({ monthly: 100000, monthsWorked: 6, gratuity: 500000 }, ct); assert.equal(a.tax, 0); assert.equal(a.gratFree, 500000);
  const b = L.settlement({ monthly: 200000, monthsWorked: 6, gratuity: 2100000 }, ct); assert.equal(b.taxable, 100000); assert.equal(b.gratFree, 2000000); assert.ok(b.tax > 0);
});

test('settlement: a small payout early in the year can stay under the ₹12 lakh rebate', () => {
  const s = L.settlement({ monthly: 80000, monthsWorked: 3, severance: 240000 }, ct); assert.equal(s.tax, 0);   // ₹2.4 L + ₹2.4 L − ₹75k = ₹4.05 L
});

test('runway: months covered, with the yearly premium and a part-month at the end', () => {
  const r = L.runway(1000000, 100000, { insurance: 20000 });            // month 1 needs 1.2 L, then 1 L a month: 1.2 + 8 = 9.2 L after 9 months, 0.8 L left for month 10
  near(r.months, 9.8, 1e-9); assert.equal(r.lasts, false); assert.equal(r.bals.length, 11);
  assert.equal(L.runway(1000000, 0, {}).lasts, true);
  near(L.runway(600000, 100000, { income: 40000 }).months, 10, 1e-9);     // 60k a month from savings
});

test('runway: PF counts only when switched on, 75% after a month and the rest after twelve', () => {
  const off = L.runway(300000, 100000, { pf: 400000 }), on = L.runway(300000, 100000, { pf: 400000, pfOn: true });
  near(off.months, 3, 1e-9); near(on.months, 6, 1e-9);                   // 3 L + 3 L (75% of PF) = 6 months; the last 25% would come in month 13
  near(L.runway(300000, 50000, { pf: 400000, pfOn: true }).months, 14, 1e-9);   // 3 + 3 = 6 L → 12 months, then 1 L more in month 13 → 14
});
