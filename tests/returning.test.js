// node --test tests/returning.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../assets/returning.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const P = (o) => ({ age: 40, fx: 1, dep: 0, retAbroad: 0, retIndia: 0, infl: 0, cash: 10000000, saveYear: 0, saveGrowth: 0, retire: 0, retireYear: 0, indiaAssets: 0, spend: 50000, planEnd: 60, jobCtc: 0, jobGrowth: 0, workUntil: 60, lump: 0,
  convCost: 0, gainShare: 0, gainTax: 0, retireMode: 'leave', retireTax: 0, penalty: 0, retireAge: 60, ...o });

test('no growth, no job: you need spending × years, and the runway is where the money runs out', () => {
  const r = R.analyse(P(), 0).rows[0]; near(r.corpus, 1e7, 0); near(r.need, 50000 * 12 * 20, 2); assert.equal(r.ready, false); near(r.gap, 1e7 - 12e6, 2); assert.equal(r.runwayEnd, 57); assert.equal(r.runwayYears, 17);
  assert.equal(R.analyse(P({ cash: 12000000 }), 0).rows[0].ready, true);
});

test('a job that covers spending until the end needs no corpus at all', () => {
  const p = P({ cash: 0, spend: 20000, jobCtc: 3000000 }), r = R.analyse(p, 0).rows[0]; assert.equal(r.need, 0); assert.equal(r.ready, true);
});

test('what you bring home: savings add up, the exchange rate multiplies, conversion cost and gains tax come off, one-time costs come off', () => {
  const p = P({ cash: 1000000, saveYear: 200000, fx: 2, gainShare: 50, gainTax: 20, convCost: 1, lump: 100000, indiaAssets: 500000 }), h = R.atReturn(p, 3);
  near(h.cashLocal, 1600000, 0.01); near(h.brought, 1600000 * 2 - 1600000 * 0.5 * 0.2 * 2 - 3200000 * 0.01, 0.01); near(h.corpus, h.brought + 500000 - 100000, 0.01);
});

test('growth and the rupee: returns compound abroad, a weaker rupee raises the rupee value', () => {
  const a = R.atReturn(P({ cash: 1000000, retAbroad: 10, fx: 1, dep: 0 }), 2), b = R.atReturn(P({ cash: 1000000, retAbroad: 10, fx: 1, dep: 5 }), 2);
  near(a.cashLocal, 1210000, 0.01); near(b.brought, 1210000 * 1.05 * 1.05, 0.5);
});

test('retirement account: withdrawing early pays tax and the penalty; after 59½ only tax; leaving it counts later at age 60', () => {
  const w = R.atReturn(P({ retire: 1000000, fx: 2, retireMode: 'withdraw', retireTax: 20, penalty: 10, age: 45 }), 0); near(w.withdrawn, 1000000 * 2 * 0.7, 0.01);
  const late = R.atReturn(P({ retire: 1000000, fx: 2, retireMode: 'withdraw', retireTax: 20, penalty: 10, age: 62 }), 0); near(late.withdrawn, 1000000 * 2 * 0.8, 0.01);
  const k = R.atReturn(P({ retire: 1000000, fx: 2, retireMode: 'leave', retireTax: 20, age: 45 }), 0); assert.equal(k.withdrawn, 0); assert.equal(k.keptAt, 60); near(k.kept, 1600000, 0.01); assert.equal(k.corpus, k.brought + k.india);
});

test('money left abroad for later lowers what you need at return', () => {
  const none = R.analyse(P({ planEnd: 70 }), 0).rows[0].need, kept = R.analyse(P({ planEnd: 70, retire: 3000000 }), 0).rows[0].need; near(none - kept, 3000000, 5);
});

test('waiting helps when you keep saving: the first ready year is found, earlier years are not ready, and the gap grows with each year', () => {
  const p = P({ cash: 5000000, saveYear: 1500000, planEnd: 70 }), a = R.analyse(p, 10); assert.ok(a.firstReady > 0 && a.firstReady <= 10);
  for (const r of a.rows) assert.equal(r.ready, r.r >= a.firstReady); assert.ok(a.rows[10].gap > a.rows[0].gap);
});

test('maximum spending: spending that much just lasts, a little more does not', () => {
  const p = P({ cash: 8000000 }), m = R.maxSpend(p, 0); near(m, 8000000 / (20 * 12), 3); const inc = R.incomeByYear(p), h = R.atReturn(p, 0);
  assert.equal(R.live(p, h.age, h.corpus, inc, null, m / p.spend * 0.999).runOut, null); assert.notEqual(R.live(p, h.age, h.corpus, inc, null, m / p.spend * 1.02).runOut, null);
});

test('inflation raises spending every year; income uses the salary engine', () => {
  const p = P({ infl: 6, spend: 50000 }); near(R.live(p, 40, 0, [], null, 1).end, -(50000 * 12) * ((Math.pow(1.06, 20) - 1) / 0.06), 5);
  const inc = R.incomeByYear(P({ jobCtc: 4000000, jobGrowth: 0, workUntil: 45, planEnd: 50 })); assert.equal(inc.length, 10); assert.ok(inc[0] > 2000000 && inc[4] > 0 && inc[5] === 0);
});

test('evaluate matches analyse for the same year', () => { const p = P({ cash: 5000000, saveYear: 1500000, planEnd: 70 }), a = R.analyse(p, 5).rows[3], e = R.evaluate(p, 3); near(e.corpus, a.corpus, 0.01); near(e.need, a.need, 0.01); assert.equal(e.ready, a.ready); });

test('retirement contributions can rise each year; at 0% they are flat (the old behaviour)', () => {
  const flat = R.atReturn(P({ retire: 0, retireYear: 100, fx: 1 }), 3).retLocal, up = R.atReturn(P({ retire: 0, retireYear: 100, retireGrowth: 10, fx: 1 }), 3).retLocal;
  near(flat, 300, 0.001); near(up, 100 + 110 + 121, 0.001); assert.equal(R.atReturn(P({ retire: 5, retireYear: 100 }), 2).retLocal, R.atReturn(P({ retire: 5, retireYear: 100, retireGrowth: 0 }), 2).retLocal);
});

test('today to return: a package and spending quoted today grow by the raise and by inflation', () => {
  const t = R.todayToReturn(P({ jobCtc: 2500000, jobGrowth: 7, spend: 100000, infl: 6 }), 10); near(t.ctc, 2500000 * Math.pow(1.07, 10), 0.01); near(t.spend, 100000 * Math.pow(1.06, 10), 0.01);
  const now = R.todayToReturn(P({ jobCtc: 2500000, spend: 100000 }), 0); assert.equal(now.ctc, 2500000); assert.equal(now.spend, 100000);
});

test('rupee drift guide: India inflation minus the other country, rounded to 0.5, never below 0', () => {
  assert.equal(R.rupeeDriftFromInflation(6, 2.5), 3.5); assert.equal(R.rupeeDriftFromInflation(6, 3), 3); assert.equal(R.rupeeDriftFromInflation(3, 6), 0); assert.equal(R.rupeeDriftFromInflation(6, 2.7), 3.5);
});

test('scenarios: cautious moves every growth setting down (or inflation up), optimistic the other way, and the order of results follows', () => {
  const p = P({ retAbroad: 7, retIndia: 9, dep: 3, infl: 6, jobGrowth: 7, saveGrowth: 3, cash: 5000000, saveYear: 500000, jobCtc: 2000000, spend: 80000, planEnd: 80, fx: 90 });
  const c = R.scenario(p, 'cautious'), o = R.scenario(p, 'optimistic');
  assert.deepEqual([c.retAbroad, c.retIndia, c.dep, c.infl, c.jobGrowth, c.saveGrowth], [5, 7, 1, 7, 5, 2]); assert.deepEqual([o.retAbroad, o.retIndia, o.dep, o.infl, o.jobGrowth, o.saveGrowth], [9, 11, 4, 5, 9, 4]);
  assert.equal(c.cash, p.cash); assert.equal(R.scenario(p, 'nothing').dep, 3);
  const g = x => R.evaluate(x, 5).gap; assert.ok(g(c) < g(p) && g(p) < g(o));
  assert.equal(R.scenario(P({ dep: 1, infl: 0, jobGrowth: 1, saveGrowth: 0 }), 'cautious').dep, 0);          // never below zero
});
