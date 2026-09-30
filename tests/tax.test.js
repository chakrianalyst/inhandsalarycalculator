// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Tax = require('../assets/tax.js');

const tax = (income, regime) => Math.round(Tax.computeTax(income, regime).total);

test('new regime: known values (FY 2025-26)', () => {
  assert.equal(tax(400000, 'new'), 0);
  assert.equal(tax(1200000, 'new'), 0);          // 87A rebate
  assert.equal(tax(1275000, 'new'), 74100);      // just past the rebate, no marginal relief left
  assert.equal(tax(1300000, 'new'), 78000);
  assert.equal(tax(2400000, 'new'), 312000);
});

test('new regime: marginal relief just above ₹12L never exceeds the extra income', () => {
  for (let inc = 1200001; inc <= 1280000; inc += 1000) {
    assert.ok(tax(inc, 'new') <= Math.ceil((inc - 1200000) * 1.04) + 1, `income ${inc}`);
  }
});

test('old regime: known values', () => {
  assert.equal(tax(250000, 'old'), 0);
  assert.equal(tax(500000, 'old'), 0);           // 87A rebate
  assert.equal(tax(1000000, 'old'), 117000);     // (12,500 + 1,00,000) * 1.04
});

test('surcharge with marginal relief at ₹50L (new regime)', () => {
  assert.equal(tax(5100000, 'new'), 1227200);    // relief caps the jump over ₹50L
});

for (const regime of ['new', 'old']) {
  test(`${regime} regime: tax is monotonic and never grows faster than income`, () => {
    let prev = 0, prevInc = 0;
    for (let inc = 0; inc <= 3e8; inc += inc < 2e7 ? 25000 : 500000) {
      const t = Tax.computeTax(inc, regime).total;
      assert.ok(t >= prev - 1e-6, `tax dropped at ${inc}`);
      assert.ok(t - prev <= (inc - prevInc) * 1.5 * 1.04 + 1, `tax jumped at ${inc}`);   // marginal rate <= 37% + cess
      prev = t; prevInc = inc;
    }
  });
}

test('salary: in-hand is below CTC/12 and both regimes are returned', () => {
  const base = { ctc: 1200000, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 };
  const r = Tax.salary(base);
  assert.ok(r[r.best].inHandMonth < 1200000 / 12);
  assert.ok(r.new.inHandMonth > 0 && r.old.inHandMonth > 0);
  assert.equal(r.best, 'new');                                   // no deductions claimed -> new regime wins
  assert.ok(Math.abs(r.gross + r.employerPf + r.gratuity + r.employerNps - r.ctc) < 1);   // CTC fully accounted for
});

test('salary: heavy old-regime deductions can flip the best regime', () => {
  const r = Tax.salary({ ctc: 2500000, basicPct: 50, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200,
    metro: true, rentMonthly: 60000, other80c: 100000, nps1b: 50000, d80: 50000, homeLoanInt: 200000 });
  assert.ok(r.old.taxable < r.new.taxable);
});

test('salary: HRA exemption is the least of the three limbs', () => {
  const r = Tax.salary({ ctc: 1200000, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 0, metro: true, rentMonthly: 20000 });
  const basic = 480000, hra = 240000, rent = 240000;
  assert.equal(Math.round(r.old.hraExempt), Math.round(Math.min(hra, rent - 0.1 * basic, 0.5 * basic)));
});
