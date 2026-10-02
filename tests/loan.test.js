// node --test tests/loan.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/loan.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('EMI: ₹50 L at 8.5% for 20 years is about ₹43,391 a month; 0% is simple division', () => {
  near(L.emi(5000000, 8.5, 240), 43391.16, 0.5); near(L.emi(120000, 0, 12), 10000, 1e-9); assert.equal(L.emi(100000, 9, 0), 0);
});

test('schedule: without prepayment the loan ends in exactly n months and interest = EMI × n − P', () => {
  const s = L.schedule({ P: 5000000, rate: 8.5, n: 240 }); assert.equal(s.months, 240); near(s.interest, L.emi(5000000, 8.5, 240) * 240 - 5000000, 1);
  near(s.years.reduce((a, y) => a + y.principal, 0), 5000000, 1); assert.equal(s.years.length, 20); assert.equal(s.bals[240], 0); near(s.paid, s.interest + 5000000, 1);
});

test('schedule: a monthly extra payment or a lump sum saves months and interest, and the balance still reaches zero', () => {
  const base = L.schedule({ P: 5000000, rate: 8.5, n: 240 });
  const extra = L.schedule({ P: 5000000, rate: 8.5, n: 240, extra: 5000 }), lump = L.schedule({ P: 5000000, rate: 8.5, n: 240, lumps: [{ month: 24, amount: 500000 }] });
  assert.ok(extra.months < 240 && extra.interest < base.interest); assert.ok(lump.months < 240 && lump.interest < base.interest);
  near(extra.years.reduce((a, y) => a + y.principal + y.prepaid, 0), 5000000, 1); near(lump.years.reduce((a, y) => a + y.principal + y.prepaid, 0), 5000000, 1);
  assert.equal(lump.years[1].prepaid, 500000); assert.equal(extra.bals[extra.months], 0);
});

test('schedule: a lump bigger than the balance only pays off what is owed', () => {
  const s = L.schedule({ P: 100000, rate: 10, n: 12, lumps: [{ month: 3, amount: 9999999 }] }); assert.equal(s.months, 3); assert.equal(s.bals[3], 0); near(s.years[0].principal + s.years[0].prepaid, 100000, 1);
});

test('affordable loan is the inverse of EMI', () => {
  const P = L.affordable(43391.16, 8.5, 240); near(P, 5000000, 5); near(L.affordable(10000, 0, 12), 120000, 1e-9); assert.equal(L.affordable(-5, 8, 12), 0);
});

test('effective rate: no fee gives the stated rate, a fee raises it', () => {
  near(L.effectiveRate(1000000, 9, 60, 0), 9, 1e-9); const e = L.effectiveRate(1000000, 9, 60, 10000); assert.ok(e > 9 && e < 10);
  const emi = L.emi(1000000, 9, 60), r = e / 1200; near(emi * (1 - Math.pow(1 + r, -60)) / r, 990000, 1);
});

test('schedule: monthly rows add up to the yearly rows', () => {
  const s = L.schedule({ P: 800000, rate: 9, n: 60, extra: 1000 }); assert.equal(s.rows.length, s.months); near(s.rows.reduce((a, r) => a + r.interest, 0), s.interest, 0.01); near(s.rows.slice(0, 12).reduce((a, r) => a + r.principal, 0), s.years[0].principal, 0.01);
});
