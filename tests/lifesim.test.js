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

/* ---------- habits: how much of the spare money is invested, and lifestyle creep ---------- */
const offEvents = () => Object.fromEntries(Object.keys(L.DEFAULT_EVENTS).map(k => [k, { ...L.DEFAULT_EVENTS[k], on: false }]));
const simple = o => ({ ...base(), incomeMode: 'net', income: 150000, living: 40000, rent: 20000, savings: 800000, events: offEvents(), ...o });

test('invest share: 100% is the default; 0% leaves only the growth of existing savings; in between sits between', () => {
  const none = L.run(simple({ investPct: 0 })), half = L.run(simple({ investPct: 50 })), all = L.run(simple({ investPct: 100 })), dflt = L.run(simple({}));
  near(none.rows[1].corp, 800000 * 1.10, 0.5); assert.ok(half.rows[1].corp > none.rows[1].corp && half.rows[1].corp < all.rows[1].corp); near(dflt.rows[1].corp, all.rows[1].corp, 0.01);
  near(all.rows[1].corp, 800000 * 1.10 + (150000 * 12 - 60000 * 12) * 1.05, 1);                    // the formula quoted on the page: savings x (1+r) + invested x (1+r/2)
});
test('invest share: when in debt, every spare rupee repays it regardless of the share', () => {
  const r = L.run(simple({ savings: -500000, investPct: 0 })); assert.ok(r.rows[1].corp > r.rows[0].corp);
});
test('lifestyle creep: spends a share of REAL raises only, and grows costs relative to no creep', () => {
  const none = L.run(simple({ creep: 0 })), full = L.run(simple({ creep: 100 })), part = L.run(simple({ creep: 25 }));
  assert.ok(full.rows[10].run > part.rows[10].run && part.rows[10].run > none.rows[10].run); assert.ok(real(full, 58) < real(part, 58) && real(part, 58) < real(none, 58));
  const slow = L.run(simple({ growth: 3, creep: 100 })), slow0 = L.run(simple({ growth: 3, creep: 0 }));          // pay grows slower than inflation: no real raise, so no creep
  near(slow.rows[10].run, slow0.rows[10].run, 0.5);
});
test('lifestyle creep: a career break does not trigger a phantom raise when pay resumes', () => {
  const ev = offEvents(); ev.break = { on: true, age: 40, yrs: 1 };
  const withBreak = L.run(simple({ creep: 100, events: ev })), without = L.run(simple({ creep: 100 }));
  for (const a of [38, 45, 52]) near(withBreak.rows.find(x => x.a === a + 1).run, without.rows.find(x => x.a === a + 1).run, 0.5);
});

/* ---------- events that already exist ---------- */
test('child already born: no new one-time or monthly cost, their share of living costs stops at 22, education only for years still to come', () => {
  const ev = offEvents(); ev.kid = { ...L.DEFAULT_EVENTS.kid, on: true, past: true, childAge: 6, share: 15000, edu: 2400000 };
  const p = simple({ age: 32, retire: 58, events: ev }), withKid = L.run(p), noKid = L.run({ ...p, events: offEvents() });
  near(withKid.rows[1].run, noKid.rows[1].run, 0.5);                                                          // nothing added on top of living costs
  const a22 = 32 + 16;                                                                                        // child turns 22 at this age of the parent
  near(withKid.rows.find(x => x.a === a22 + 1).run, noKid.rows.find(x => x.a === a22 + 1).run - 15000 * 12 * Math.pow(1.06, 16), 1);
  near(withKid.eventCost.kid, 2400000 / 4 * (Math.pow(1.06, 12) + Math.pow(1.06, 13) + Math.pow(1.06, 14) + Math.pow(1.06, 15)), 5);   // ages 44-47: four education years
});
test('child already born vs planned: the existing child never double counts today\'s living costs', () => {
  const planned = offEvents(); planned.kid = { ...L.DEFAULT_EVENTS.kid, on: true, past: false, age: 32, cost: 0, monthly: 15000 };
  const existing = offEvents(); existing.kid = { ...L.DEFAULT_EVENTS.kid, on: true, past: true, childAge: 6, share: 0 };
  assert.ok(L.run(simple({ age: 32, events: planned })).firstYear.extra > 0); assert.equal(L.run(simple({ age: 32, events: existing })).firstYear.extra, 0);
});
test('a second child is a planned event and costs money only when switched on', () => {
  const ev = offEvents(); ev.kid2 = { ...L.DEFAULT_EVENTS.kid2, on: true, age: 30 };
  assert.ok(L.run(simple({ events: ev })).eventCost.kid2 > 0); assert.equal(L.run(simple({})).eventCost.kid2, undefined);
});
test('home already owned: no purchase cost, rent ignored, EMI paid for the years left, equity counted from day one', () => {
  const ev = offEvents(); ev.home = { ...L.DEFAULT_EVENTS.home, on: true, past: true, value: 8000000, loan: 4000000, emi: 40000, yearsLeft: 15, rate: 8.5 };
  const r = L.run(simple({ events: ev, rent: 25000 }));
  near(r.rows[0].nw, 800000 + 8000000 - 4000000, 0.5); assert.equal(r.firstYear.rent, 0); assert.equal(r.eventCost.home, undefined); near(r.firstYear.emi, 40000 * 12, 0.5);
  const noLoan = r.rows.find(x => x.a === 28 + 16).run, withLoan = r.rows.find(x => x.a === 28 + 10).run; assert.ok(noLoan < withLoan);   // EMI is gone after the years left
});
test('habit inputs are clamped and never produce NaN', () => {
  for (const o of [{ investPct: -50, creep: 500 }, { investPct: 500, creep: -5 }, { investPct: 0, creep: 100 }]) { const r = L.run(simple(o)); assert.ok(r.rows.every(x => Number.isFinite(x.nw) && Number.isFinite(x.run))); }
});
test('fixes(): can suggest investing everything or dropping lifestyle creep when that alone rescues the plan', () => {
  const p = simple({ age: 30, retire: 45, income: 120000, living: 70000, rent: 20000, savings: 300000, investPct: 70, creep: 0 });
  if (L.run(p).crunch === null) return;                                           // only meaningful when the plan fails
  const fx = L.fixes(p); if (fx.invest) assert.equal(L.run({ ...p, investPct: 100 }).crunch, null);
  const q = simple({ age: 30, retire: 52, income: 200000, living: 60000, rent: 20000, savings: 300000, investPct: 100, creep: 100, growth: 10, inflation: 4 });
  if (L.run(q).crunch !== null) { const fq = L.fixes(q); if (fq.creep) assert.equal(L.run({ ...q, creep: 0 }).crunch, null); }
});

/* ---------- year-by-year detail ---------- */
test('year table: one entry per simulated year, flows reconcile, and balances follow the quoted formula', () => {
  const r = L.run(simple({ investPct: 80, creep: 25 })); assert.equal(r.years.length, r.end - r.a0);
  for (const y of r.years) near(y.pay - y.running - y.one, y.flow, 0.5);
  near(r.years[0].flow, r.firstYear.flow, 0.5); near(r.years[0].corp, r.rows[1].corp, 0.5);
  for (let k = 1; k < 20; k++) near(r.years[k].corp, r.years[k - 1].corp * 1.10 + r.years[k].invested * 1.05, 1);          // savings x (1+r) + invested x (1+r/2)
  for (const y of r.years) { if (y.flow <= 0 || y.corp < 0) near(y.invested, y.flow, 0.5); else near(y.invested, y.flow * 0.8, 0.5); }
});
test('year table: retirement year has no pay, and balances match the chart rows', () => {
  const r = L.run(simple({})); const y = r.years.find(x => x.a === r.ret); assert.equal(y.pay, 0);
  r.years.forEach((x, k) => { near(x.nw, r.rows[k + 1].nw, 0.5); near(x.endIdx, r.rows[k + 1].idx, 1e-9); });
});

const offAll = () => { const e = clone(L.DEFAULT_EVENTS); Object.keys(e).forEach(k => { e[k].on = false; }); return e; };

test('a car bought in 5 years costs the inflated price, not today’s price', () => {
  const ev = offAll(); ev.car = { on: true, age: 33, cost: 1000000, every: 0 };
  const r = L.run({ ...base(), events: ev }); near(r.eventCost.car, 1000000 * Math.pow(1.06, 5), 1); near(r.years.find(y => y.a === 33).one, 1338225.58, 1);
});

test('career jump can repeat: pay compounds one jump every N years until retirement', () => {
  const once = offAll(), rep = offAll(); once.jump = { on: true, age: 32, pct: 20, every: 0 }; rep.jump = { on: true, age: 32, pct: 20, every: 4 };
  const A = L.run({ ...base(), incomeMode: 'net', income: 100000, events: once }), B = L.run({ ...base(), incomeMode: 'net', income: 100000, events: rep });
  const pay = (r, age) => r.years.find(y => y.a === age).pay, g = Math.pow(1.08, 40 - 28);
  near(pay(A, 40), 1200000 * g * 1.2, 1); near(pay(B, 40), 1200000 * g * 1.2 * 1.2 * 1.2, 1);       // jumps at 32, 36, 40
  near(pay(B, 31), pay(A, 31), 0.001);
});

test('education inflation: fees rise at their own rate; defaults to general inflation; home price rise is separate too', () => {
  const ev = offAll(); ev.kid = { ...L.DEFAULT_EVENTS.kid, on: true, past: false, age: 30, cost: 0, monthly: 0, edu: 4000000 };
  const same = L.run({ ...base(), events: ev }), fast = L.run({ ...base(), events: ev, eduInfl: 10 });
  near(same.eventCost.kid, 1000000 * [48, 49, 50, 51].reduce((s, a) => s + Math.pow(1.06, a - 28), 0), 5);
  near(fast.eventCost.kid, 1000000 * [48, 49, 50, 51].reduce((s, a) => s + Math.pow(1.10, a - 28), 0), 5);
  const hv = offAll(); hv.home = { ...L.DEFAULT_EVENTS.home, on: true, past: false, age: 33, price: 8000000, dp: 100 };
  near(L.run({ ...base(), events: hv, homeGrowth: 9 }).eventCost.home, 8000000 * Math.pow(1.09, 5), 1); near(L.run({ ...base(), events: hv }).eventCost.home, 8000000 * Math.pow(1.06, 5), 1);
});

test('pension / rental income starts at its age, grows with inflation, and adds to spare money', () => {
  const ev = offAll(); ev.pension = { on: true, age: 60, monthly: 20000 };
  const r = L.run({ ...base(), events: ev }), y = r.years.find(x => x.a === 60);
  near(y.pension, 20000 * 12 * Math.pow(1.06, 32), 1); assert.equal(r.years.find(x => x.a === 59).pension, 0);
  const none = L.run({ ...base(), events: offAll() }); assert.ok(r.rows[r.rows.length - 1].nw > none.rows[none.rows.length - 1].nw);
});

test('return after retirement: a lower rate applies only once you stop working', () => {
  const ev = offAll(), a = L.run({ ...base(), events: ev }), b = L.run({ ...base(), events: ev, retReturn: 6 });
  near(a.rows.find(x => x.a === 58).nw, b.rows.find(x => x.a === 58).nw, 0.001); assert.ok(b.rows[b.rows.length - 1].nw < a.rows[a.rows.length - 1].nw);
});

test('market crash: savings fall by the chosen % at the start of that year, only the savings', () => {
  const ev = offAll(); ev.crash = { on: true, age: 50, drop: 30 };
  const base0 = L.run({ ...base(), events: offAll() }), c = L.run({ ...base(), events: ev });
  near(c.years.find(x => x.a === 49).corp, base0.years.find(x => x.a === 49).corp, 0.001);
  near(c.years.find(x => x.a === 50).crashLoss, base0.years.find(x => x.a === 49).corp * 0.3, 1); assert.ok(c.rows[c.rows.length - 1].nw < base0.rows[base0.rows.length - 1].nw);
});

test('child’s wedding: inflated cost in the year the child reaches that age (planned and existing child)', () => {
  const ev = offAll(); ev.kid = { ...L.DEFAULT_EVENTS.kid, on: true, past: false, age: 30, cost: 0, monthly: 0, edu: 0, wedCost: 2000000, wedAge: 27 };
  near(L.run({ ...base(), events: ev }).eventCost.kid, 2000000 * Math.pow(1.06, 29), 1);               // age 57
  ev.kid = { ...ev.kid, past: true, childAge: 10, share: 0, edu: 0 };
  near(L.run({ ...base(), events: ev }).eventCost.kid, 2000000 * Math.pow(1.06, 17), 1);               // 28 + (27-10)
});
