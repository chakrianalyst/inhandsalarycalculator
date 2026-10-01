// node --test tests/lifesim.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/lifesim.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const clone = o => JSON.parse(JSON.stringify(o));
const base = () => ({ age: 28, retire: 58, end: 85, inflation: 6, growth: 8, ret: 10, incomeMode: 'gross', income: 2000000, living: 40000, rent: 20000, savings: 800000, events: clone(L.DEFAULT_EVENTS) });
const real = (r, a) => { const p = r.rows.find(x => x.a === a); return p.nw / p.idx; };

test('regression: reproduces the numbers the page published before the module was extracted', () => {
  const p = base(); p.events.car.every = 8;                         // the old default replaced the car every 8 years
  const r = L.run(p); near(real(r, 58) / 1e7, 7.27, 0.01); assert.equal(r.free, 49); assert.equal(r.crunch, null);
});

test('monthly take-home mode: pay is annualised, no tax is applied', () => {
  const r = L.run({ ...base(), incomeMode: 'net', income: 100000, events: {} }); near(r.firstYear.takeHome, 1200000, 0.5);
});
test('yearly gross mode: tax is taken off (zero up to the ₹12.75 lakh effective limit, then rising)', () => {
  near(L.run({ ...base(), income: 1200000, events: {} }).firstYear.takeHome, 1200000, 0.5);
  const t = L.run({ ...base(), income: 3000000, events: {} }).firstYear.takeHome; assert.ok(t < 3000000 && t > 2300000);
});

test('a plan that spends more than it earns fails in year one and reports the shortfall', () => {
  const p = { ...base(), age: 32, retire: 45, income: 263521, living: 80000, rent: 0, savings: 500000, events: {} };      // the case that confused a real user
  const r = L.run(p); assert.equal(r.crunch, 33); near(r.crunchInfo.flow, 263521 - 960000, 1);
});
test('the same number read as monthly take-home is a healthy plan', () => {
  const r = L.run({ ...base(), age: 32, retire: 45, incomeMode: 'net', income: 263521, living: 80000, rent: 0, savings: 500000, events: {} });
  assert.equal(r.crunch, null); assert.ok(real(r, 45) > 1e7);
});

test('car: 0 means one car only; a replacement interval buys it again', () => {
  const one = L.run({ ...base(), events: { ...clone(L.DEFAULT_EVENTS), car: { on: true, age: 34, cost: 1200000, every: 0 } } });
  const two = L.run({ ...base(), events: { ...clone(L.DEFAULT_EVENTS), car: { on: true, age: 34, cost: 1200000, every: 8 } } });
  near(one.eventCost.car, 1200000 * Math.pow(1.06, 6), 1); assert.ok(two.eventCost.car > one.eventCost.car * 1.5);
});

test('home: rent stops, an EMI appears, and switching it off removes both', () => {
  const on = L.run(base()), off = L.run({ ...base(), events: { ...clone(L.DEFAULT_EVENTS), home: { ...L.DEFAULT_EVENTS.home, on: false } } });
  assert.ok(on.emiMonthly > 0); assert.equal(off.emiMonthly, 0); assert.ok(on.eventCost.home > 0); assert.equal(off.eventCost.home, undefined);
});

test('skip removes an event; spending less always leaves more at the end', () => {
  const p = base(), skipped = L.run({ ...p, skip: 'kid' }); assert.equal(skipped.eventCost.kid, undefined);
  assert.ok(real(L.run({ ...p, living: 30000 }), 85) > real(L.run({ ...p, living: 50000 }), 85));
});

test('fixes(): every suggestion actually makes a failing plan work', () => {
  const p = { ...base(), age: 30, retire: 45, incomeMode: 'net', income: 100000, living: 88000, rent: 0, savings: 300000, events: {} };
  assert.notEqual(L.run(p).crunch, null);
  const fx = L.fixes(p); assert.ok(Object.keys(fx).length > 0);
  if (fx.living !== undefined) { assert.ok(fx.living < p.living); assert.equal(L.run({ ...p, living: fx.living }).crunch, null); }
  if (fx.retire) { assert.ok(fx.retire > p.retire); assert.equal(L.run({ ...p, retire: fx.retire }).crunch, null); }
});
test('fixes(): names the event that tips a plan over, and says honestly when no single change is enough', () => {
  const off = Object.fromEntries(Object.keys(L.DEFAULT_EVENTS).map(k => [k, { ...L.DEFAULT_EVENTS[k], on: false }]));
  const only = { ...base(), age: 30, retire: 58, incomeMode: 'net', income: 120000, living: 60000, rent: 15000, savings: 200000, events: { ...off, home: { ...L.DEFAULT_EVENTS.home, on: true, age: 31, price: 30000000 } } };
  assert.notEqual(L.run(only).crunch, null); assert.equal(L.fixes(only).skip, 'home'); assert.equal(L.run({ ...only, skip: 'home' }).crunch, null);
  const crowded = { ...only, events: { ...clone(L.DEFAULT_EVENTS), home: { ...L.DEFAULT_EVENTS.home, age: 31, price: 30000000 } } };
  assert.notEqual(L.run(crowded).crunch, null); assert.deepEqual(L.fixes(crowded), {});
});
test('costs counted for diagnosis stop at the moment the money runs out', () => {
  const p = { ...base(), age: 30, retire: 58, incomeMode: 'net', income: 60000, living: 55000, rent: 0, savings: 100000 };
  const r = L.run(p); assert.notEqual(r.crunch, null); assert.ok((r.eventCost.kid || 0) < p.events.kid.edu / 2);          // the education fund is decades after the failure
});

test('odd inputs never throw or produce NaN', () => {
  for (const p of [{ ...base(), income: 0 }, { ...base(), retire: 20 }, { ...base(), end: 30 }, { ...base(), savings: 0, living: 0, rent: 0 }, { ...base(), inflation: 0, growth: 0, ret: 0 }, { ...base(), events: {} }]) {
    const r = L.run(p); assert.ok(r.rows.length > 1); assert.ok(r.rows.every(x => Number.isFinite(x.nw) && Number.isFinite(x.corp) && Number.isFinite(x.idx)));
  }
});
