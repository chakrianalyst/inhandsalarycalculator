// node --test tests/invest.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../assets/invest.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('flat SIP: matches the annuity-due formula at the equivalent monthly rate', () => {
  const r = I.monthly(12), n = 180, fv = 10000 * ((Math.pow(1 + r, n) - 1) / r) * (1 + r), x = I.run({ sip: 10000, ret: 12, months: n });
  near(x.value, fv, 0.01); near(x.invested, 1800000, 0); near(x.gain, fv - 1800000, 0.01);
});

test('lump sum: grows at the yearly rate; zero return returns exactly what you put in', () => {
  near(I.run({ lump: 100000, ret: 10, months: 60 }).value, 100000 * Math.pow(1.1, 5), 0.01); near(I.run({ sip: 5000, ret: 0, months: 24 }).value, 120000, 1e-6);
});

test('step-up raises the instalment every 12 months and beats a flat SIP', () => {
  const a = I.run({ sip: 10000, step: 10, ret: 12, months: 36 }); near(a.invested, 10000 * 12 + 11000 * 12 + 12100 * 12, 0.01); near(a.lastSip, 12100, 0.001);
  assert.ok(a.value > I.run({ sip: 10000, ret: 12, months: 36 }).value);
});

test('year table adds up; a partial last year is included', () => {
  const x = I.run({ sip: 5000, step: 5, ret: 11, months: 30 }); assert.equal(x.years.length, 3); near(x.years[2].to, 2.5, 1e-9); near(x.years[2].value, x.value, 0.01); near(x.years[2].invested, x.invested, 0.01);
  near(x.years.reduce((s, y) => s + y.yearInvested, 0), x.invested, 0.01);
});

test('required SIP: running the plan with it hits the target (with and without a step-up and an existing lump)', () => {
  for (const p of [{ target: 10000000, ret: 12, months: 180, step: 0, lump: 0 }, { target: 25000000, ret: 11, months: 240, step: 8, lump: 500000 }]) {
    const s = I.requiredSip(p); near(I.run({ sip: s, step: p.step, lump: p.lump, ret: p.ret, months: p.months }).value, p.target, 0.5);
  }
  assert.equal(I.requiredSip({ target: 100000, ret: 10, months: 60, step: 0, lump: 5000000 }), 0);               // the lump alone already beats the goal
});

test('tax: equity gains above ₹1.25 L at 12.5% plus cess; short holds at 20%; slab rate; none', () => {
  near(I.tax(1125000, 'equity', 120), 1000000 * 0.125 * 1.04, 0.01); near(I.tax(100000, 'equity', 120), 0, 0); near(I.tax(100000, 'equity', 8), 20800, 0.01);
  near(I.tax(100000, 'slab', 36, 30), 31200, 0.01); assert.equal(I.tax(100000, 'none', 36), 0); assert.equal(I.tax(-5, 'equity', 36), 0);
});

test('monthly-compounding convention (ret ÷ 12 a month) gives the larger figure many online calculators show', () => {
  near(I.run({ sip: 10000, ret: 12, months: 180, nominal: true }).value, 10000 * ((Math.pow(1.01, 180) - 1) / 0.01) * 1.01, 0.01);
  assert.ok(I.run({ sip: 10000, ret: 12, months: 180, nominal: true }).value > I.run({ sip: 10000, ret: 12, months: 180 }).value);
  const p = { target: 5000000, ret: 12, months: 120, step: 5, lump: 0, nominal: true }; near(I.run({ sip: I.requiredSip(p), step: 5, ret: 12, months: 120, nominal: true }).value, 5000000, 0.5);
});
