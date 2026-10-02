// node --test tests/deposit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/deposit.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('tenure: years + months + days on a 365-day year', () => {
  near(D.tenure(1, 6, 0), 1.5, 1e-9); near(D.tenure(0, 0, 73), 0.2, 1e-9); near(D.tenure(2, 3, 10), 2 + 0.25 + 10 / 365, 1e-9);
});

test('cumulative FD: whole years match P(1+r/n)^(n t), for every compounding', () => {
  for (const n of [1, 2, 4, 12]) near(D.fd({ P: 500000, rate: 7, n, years: 5, months: 0, days: 0 }).maturity, 500000 * Math.pow(1 + 0.07 / n, 5 * n), 0.01);
});

test('cumulative FD: leftover days earn simple interest on top of the last compounded period', () => {
  const r = D.fd({ P: 100000, rate: 7, n: 4, years: 0, months: 0, days: 100 }), x = 100 / 365 * 4;      // 1.095 quarters
  near(r.maturity, 100000 * 1.0175 * (1 + 0.0175 * (x - 1)), 0.01);
  const half = D.fd({ P: 100000, rate: 6, n: 4, years: 0, months: 6, days: 0 }); near(half.maturity, 100000 * Math.pow(1.015, 2), 0.01);   // exactly two quarters
});

test('cumulative FD: longer tenure and more frequent compounding never earn less; year table adds up', () => {
  const a = D.fd({ P: 100000, rate: 7, n: 4, years: 3, months: 0, days: 0 }), b = D.fd({ P: 100000, rate: 7, n: 4, years: 3, months: 0, days: 1 }), m = D.fd({ P: 100000, rate: 7, n: 12, years: 3, months: 0, days: 0 });
  assert.ok(b.maturity > a.maturity); assert.ok(m.maturity > a.maturity);
  const s = a.schedule; assert.equal(s.length, 3); near(s.reduce((x, y) => x + y.interest, 0), a.interest, 0.01); near(s[2].close, a.maturity, 0.01); near(s[1].open, s[0].close, 0.01);
  const p = D.fd({ P: 100000, rate: 7, n: 4, years: 2, months: 6, days: 0 }); assert.equal(p.schedule.length, 3); near(p.schedule[2].to, 2.5, 1e-9); near(p.schedule[2].close, p.maturity, 0.01);
});

test('effective yield: 7% compounded quarterly is about 7.19% a year', () => {
  near(D.fd({ P: 100000, rate: 7, n: 4, years: 5, months: 0, days: 0 }).aer * 100, 7.186, 0.001);
});

test('interest payout: monthly payout is P·r/12 and the principal comes back at the end', () => {
  const r = D.payout({ P: 1200000, rate: 6, freq: 12, years: 2, months: 0, days: 0 });
  near(r.per, 6000, 1e-9); assert.equal(r.periods, 24); near(r.interest, 144000, 0.01); near(r.maturity, 1200000, 0); near(r.perYear, 72000, 1e-9);
  const odd = D.payout({ P: 1200000, rate: 6, freq: 12, years: 0, months: 3, days: 15 }); assert.equal(odd.periods, 3); assert.ok(odd.last > 0 && odd.last < odd.per);
});

test('recurring deposit: instalments compound quarterly until maturity', () => {
  const one = D.rd({ D: 10000, rate: 8, months: 1 }); near(one.maturity, 10000 * Math.pow(1.02, 4 / 12), 0.01);
  const r = D.rd({ D: 5000, rate: 7, months: 12 }); near(r.invested, 60000, 0); assert.ok(r.interest > 60000 * 0.07 * 0.5 && r.interest < 60000 * 0.07);   // about half a year of interest on average
  near(D.rd({ D: 5000, rate: 7, months: 36 }).schedule.reduce((s, y) => s + y.interest, 0), D.rd({ D: 5000, rate: 7, months: 36 }).interest, 0.01);
  near(D.rd({ D: 5000, rate: 0, months: 24 }).maturity, 120000, 0.001);
});

test('tax on interest: slab rate plus 4% cess', () => { near(D.taxOn(100000, 30), 31200, 0.001); near(D.taxOn(100000, 0), 0, 0); });
