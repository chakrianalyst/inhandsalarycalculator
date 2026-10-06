// node --test tests/swp.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/swp.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const P = o => ({ corpus: 1000000, withdraw: 10000, step: 0, ret: 12, years: 10, gainPct: 0, taxk: 'none', slab: 0, ...o });

test('no growth: ₹12 lakh at ₹1 lakh a month pays exactly 12 months, then runs out', () => {
  const R = S.run(P({ corpus: 1200000, withdraw: 100000, ret: 0, years: 2 }));
  assert.equal(R.fullMonths, 12); assert.equal(R.lasts, false); assert.equal(R.out, 13); near(R.totalWithdrawn, 1200000, 0.01); assert.equal(R.end, 0);
  const L = S.run(P({ corpus: 1200000, withdraw: 100000, ret: 0, years: 1 })); assert.equal(L.lasts, true); near(L.end, 0, 0.01);
});

test('level withdrawals match the annuity formula, and the largest safe withdrawal finds it', () => {
  const i = Math.pow(1.12, 1 / 12) - 1, n = 120, w = 1000000 * i / (1 - Math.pow(1 + i, -n));         // payment at the end of each month
  assert.equal(S.run(P({ withdraw: w - 1 })).lasts, true); assert.equal(S.run(P({ withdraw: w + 1 })).lasts, false);
  near(S.run(P({ withdraw: w })).end, 0, 1); near(S.maxWithdraw(P()), w, 0.5);
});

test('withdrawing only the growth leaves the starting amount untouched', () => {
  const i = Math.pow(1.12, 1 / 12) - 1, R = S.run(P({ withdraw: 1000000 * i, years: 25 }));
  near(R.end, 1000000, 0.01); assert.equal(R.lasts, true); near(S.maxWithdraw(P({ years: 25 }), 1000000), 1000000 * i, 0.5);
});

test('step-up raises the monthly amount every 12 months', () => {
  const R = S.run(P({ step: 10, years: 3, withdraw: 5000 }));
  near(R.years[0].monthly, 5000, 0.001); near(R.years[1].monthly, 5500, 0.001); near(R.years[2].monthly, 6050, 0.001); near(R.years[1].withdrawn, 66000, 0.001);
});

test('only the gain part of each withdrawal is taxed (average cost)', () => {
  const i = Math.pow(1.12, 1 / 12) - 1, bal = 1000000 * (1 + i);                                     // first month, half of the corpus is already profit
  const R = S.run(P({ gainPct: 50, years: 1 / 12, taxk: 'slab', slab: 30 }));
  const gain = 10000 * (1 - 500000 / bal); near(R.totalGain, gain, 0.001); near(R.totalTax, gain * 0.3 * 1.04, 0.001);
  const fresh = S.run(P({ years: 1 / 12 })); near(fresh.totalGain, 10000 * (1 - 1000000 / bal), 0.001);   // money invested today: only this month's growth is a gain
});

test('equity: short-term (20%) in the first 12 months, long-term (12.5% above ₹1.25 lakh) after; already-held units are long-term', () => {
  const R = S.run(P({ corpus: 10000000, withdraw: 80000, years: 3, taxk: 'equity' }));
  near(R.years[0].tax, R.years[0].gain * 0.2 * 1.04, 0.01); near(R.years[1].tax, Math.max(0, R.years[1].gain - 125000) * 0.125 * 1.04, 0.01);
  const H = S.run(P({ corpus: 10000000, withdraw: 80000, years: 1, taxk: 'equity', gainPct: 40 })); near(H.years[0].tax, Math.max(0, H.years[0].gain - 125000) * 0.125 * 1.04, 0.01);
  near(S.yearTax(100000, 0, 'equity'), 0, 0); near(S.yearTax(225000, 0, 'equity'), 13000, 0.001); near(S.yearTax(0, 0, 'none'), 0, 0);
});

test('tax does not change the balance, only what reaches you', () => {
  const a = S.run(P({ taxk: 'none' })), b = S.run(P({ taxk: 'slab', slab: 30, gainPct: 30 })), c = S.run(P({ taxk: 'none', gainPct: 30 }));
  near(b.end, c.end, 0.001); assert.ok(b.totalTax > 0); near(b.years[0].net, b.years[0].withdrawn - b.years[0].tax, 0.001); near(a.end, c.end, 0.001);
});
