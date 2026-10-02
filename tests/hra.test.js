// node --test tests/hra.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../assets/hra.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('exempt HRA is the least of the three amounts, for 12 months', () => {
  const r = H.calc({ basicM: 50000, hraM: 25000, rentM: 28000, months: 12, pctOfBasic: 0.5 });
  near(r.a, 300000, 0); near(r.c, 336000 - 60000, 0); near(r.d, 300000, 0); near(r.exempt, 276000, 0); assert.equal(r.which, 'rent');
  near(r.taxable, 300000 - r.exempt, 0);
});

test('40% limit gives less than 50%; rent below 10% of basic gives nothing', () => {
  assert.ok(H.calc({ basicM: 50000, hraM: 30000, rentM: 40000, months: 12, pctOfBasic: 0.4 }).exempt < H.calc({ basicM: 50000, hraM: 30000, rentM: 40000, months: 12, pctOfBasic: 0.5 }).exempt);
  assert.equal(H.calc({ basicM: 50000, hraM: 20000, rentM: 4000, months: 12, pctOfBasic: 0.5 }).exempt, 0);
});

test('months: everything is for the months you paid that rent', () => {
  const full = H.calc({ basicM: 50000, hraM: 25000, rentM: 30000, months: 12, pctOfBasic: 0.5 }), six = H.calc({ basicM: 50000, hraM: 25000, rentM: 30000, months: 6, pctOfBasic: 0.5 });
  near(six.exempt, full.exempt / 2, 0.01); assert.equal(H.calc({ basicM: 50000, hraM: 25000, rentM: 30000, months: 0, pctOfBasic: 0.5 }).exempt, 0);
});

test('rent needed for the full exemption, tax saved and the PAN threshold', () => {
  const r = H.calc({ basicM: 50000, hraM: 25000, rentM: 20000, months: 12, pctOfBasic: 0.5, slab: 30 });
  near(r.rentForFull, 5000 + 25000, 0.001); near(r.tax, r.exempt * 0.3 * 1.04, 0.01); assert.equal(r.needsPan, true);
  assert.equal(H.calc({ basicM: 50000, hraM: 25000, rentM: 8000, months: 12, pctOfBasic: 0.5 }).needsPan, false);
  near(H.calc({ basicM: 50000, hraM: 25000, rentM: r.rentForFull, months: 12, pctOfBasic: 0.5 }).exempt, 300000, 0.01);
});

test('metro list depends on the financial year', () => {
  assert.equal(H.isMetro('Bengaluru', '2026'), true); assert.equal(H.isMetro('Bengaluru', '2025'), false); assert.equal(H.isMetro('Mumbai', '2025'), true); assert.equal(H.isMetro('other', '2026'), false);
});
