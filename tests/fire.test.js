// node --test tests/fire.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../assets/fire.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const P = { age: 30, life: 90, exp0: 720000, pension: 0, infl: 6, swr: 3.5, post: 8 }, Q = { sav: 50000, step: 8, pre: 11, corp0: 1500000 };

test('accumulate: matches a flat SIP formula, and zero years returns the starting corpus', () => {
  const r = Math.pow(1.1, 1 / 12) - 1; near(F.accumulate(10000, 10, 0, 0, 10), 10000 * ((Math.pow(1 + r, 120) - 1) / r) * (1 + r), 0.01); near(F.accumulate(5000, 0, 123456, 8, 10), 123456, 0);
});

test('withdrawal-rule corpus: spending at retirement ÷ SWR, inflated from today; a pension reduces it', () => {
  near(F.swrNeed(P, 45), 720000 * Math.pow(1.06, 15) / 0.035, 0.01); near(F.swrNeed({ ...P, pension: 240000 }, 45), 480000 * Math.pow(1.06, 15) / 0.035, 0.01); assert.equal(F.swrNeed({ ...P, pension: 9e9 }, 45), 0);
});

test('lasting corpus: retiring with exactly that corpus ends at about zero at the plan end; slightly less runs out', () => {
  for (const a of [40, 45, 55]) {
    const need = F.lastNeed(P, a); assert.equal(F.runOut(P, a, need), null); assert.notEqual(F.runOut(P, a, need * 0.98), null);
  }
});

test('target is the larger of the two rules, and rises with retirement age', () => {
  assert.ok(F.target(P, 45) >= F.swrNeed(P, 45) - 1e-6 && F.target(P, 45) >= F.lastNeed(P, 45) - 1e-6);
  assert.ok(F.target({ ...P, post: 5, swr: 5 }, 45) > F.swrNeed({ ...P, post: 5, swr: 5 }, 45) - 1);                       // low returns: the lasting rule binds
  assert.ok(F.target(P, 50) > F.target(P, 45));
});

test('earliest age: the corpus at that age reaches the target and the year before did not', () => {
  const a = F.earliest(P, Q); assert.ok(a > P.age && a <= 80);
  assert.ok(F.accumulate(Q.sav, a - P.age, Q.corp0, Q.step, Q.pre) >= F.target(P, a) - 1e-6); assert.ok(F.accumulate(Q.sav, a - 1 - P.age, Q.corp0, Q.step, Q.pre) < F.target(P, a - 1));
  assert.equal(F.earliest(P, { ...Q, sav: 0, corp0: 0 }), null);
});

test('required SIP: investing it reaches the target; investing a little less does not', () => {
  const s = F.requiredSip(P, Q, 50); near(F.accumulate(s, 20, Q.corp0, Q.step, Q.pre), F.target(P, 50), 1); assert.ok(F.accumulate(s * 0.97, 20, Q.corp0, Q.step, Q.pre) < F.target(P, 50));
  assert.equal(F.requiredSip(P, { ...Q, corp0: 1e10 }, 50), 0);
});

test('coast number: grows to the target with no more investing', () => { const c = F.coast(P, Q, 50); near(F.accumulate(0, 20, c, 0, Q.pre), F.target(P, 50), 0.5); });
