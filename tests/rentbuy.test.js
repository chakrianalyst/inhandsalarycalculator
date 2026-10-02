// node --test tests/rentbuy.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../assets/rentbuy.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const base = { price: 10000000, dpPct: 20, rate: 8.5, tenure: 20, rent: 28000, app: 5, inv: 11, rentInc: 6, horizon: 20, bcost: 6, scost: 2, maint: 1 };

/* the engine exactly as the page had it before tax options existed, kept here as an oracle */
function legacy(c) {
  const P = c.price, dpAmt = c.dpPct / 100 * P, loan = P - dpAmt, r = c.rate / 1200, n = Math.round(c.tenure * 12), H = Math.round(c.horizon);
  const emi = r === 0 ? loan / n : loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1), buyCost = c.bcost / 100 * P, sell = c.scost / 100;
  const inv = Math.pow(1 + c.inv / 100, 1 / 12) - 1, app = Math.pow(1 + c.app / 100, 1 / 12) - 1, maint = c.maint / 1200, rentInc = c.rentInc / 100;
  let rent = c.rent, home = P, bal = loan, pBuy = 0, pRent = dpAmt + buyCost, interest = 0; const buy = [P * (1 - sell) - loan], rentNW = [pRent];
  for (let m = 0; m < H * 12; m++) {
    if (m > 0 && m % 12 === 0) rent *= 1 + rentInc; let own = home * maint;
    if (m < n) { const i = bal * r; interest += i; bal -= emi - i; own += emi; }
    home *= 1 + app; pBuy *= 1 + inv; pRent *= 1 + inv; if (own > rent) pRent += own - rent; else pBuy += rent - own;
    if ((m + 1) % 12 === 0) { buy.push(home * (1 - sell) - Math.max(bal, 0) + pBuy); rentNW.push(pRent); }
  }
  return { buy, rentNW, interest, emi };
}

test('with tax options off, the engine reproduces the page’s earlier numbers', () => {
  for (const c of [base, { ...base, horizon: 10, app: 8 }, { ...base, rate: 0, dpPct: 50, horizon: 30, tenure: 15 }, { ...base, rent: 90000, app: 2, inv: 14 }]) {
    const a = R.sim(c), b = legacy(c); near(a.buy[a.buy.length - 1], b.buy[b.buy.length - 1], 0.01); near(a.rentNW[a.rentNW.length - 1], b.rentNW[b.rentNW.length - 1], 0.01); near(a.interest, b.interest, 0.01); near(a.emi, b.emi, 0.001);
    assert.equal(a.buy.length, a.years.length);
  }
});

test('capital-gains tax lowers both net worths; home tax uses 12.5% on gains over cost incl. buying costs', () => {
  const a = R.sim(base), t = R.sim({ ...base, gainsTax: true });
  assert.ok(t.buy[20] < a.buy[20]); assert.ok(t.rentNW[20] < a.rentNW[20]); const gain = a.home * 0.98 - (10000000 + 600000); near(t.homeTaxAtEnd, gain * 0.125 * 1.04, 0.01);
  assert.equal(R.sim({ ...base, gainsTax: true, horizon: 20, app: 0 }).homeTaxAtEnd, 0);                         // no gain, no tax
});

test('home-loan tax benefit raises the buyer’s net worth and is capped at ₹2 L interest + ₹1.5 L principal a year', () => {
  const a = R.sim(base), b = R.sim({ ...base, loanBenefit: true, slab: 30 }); assert.ok(b.buy[20] > a.buy[20]); near(b.rentNW[20], a.rentNW[20], 0.01);
  assert.ok(b.benefit > 0 && b.benefit <= 20 * 350000 * 0.3 * 1.04 + 1);
});

test('break-even year and break-even appreciation', () => {
  const s = R.sim({ ...base, app: 9 }); assert.ok(R.breakEven(s) <= 20);
  const g = R.breakEvenAppreciation(base); assert.ok(g > 0 && g < 25); const at = R.sim({ ...base, app: g }); near(at.buy[20], at.rentNW[20], 1);
  assert.equal(R.breakEven(R.sim({ ...base, app: 0, horizon: 5 })), null);
});

test('rent yield is rent × 12 ÷ price', () => near(R.sim(base).rentYield, 3.36, 0.001));
