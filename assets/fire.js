/* FIRE / early-retirement maths — pure functions, no DOM. Used by fire-calculator.html and the tests.
   Everything is in rupees of the year it happens. Spending and any pension rise with inflation from today.
   A corpus "works" at an age when it is at least spending ÷ safe-withdrawal-rate AND it also lasts to the plan end when drawn down with the post-retirement return. */
(function (root) {
  /** Corpus after `years` of investing `monthly` (rising step % every year), starting from corp0, at an effective yearly return. */
  function accumulate(monthly, years, corp0, step, ret) {
    const mr = Math.pow(1 + ret / 100, 1 / 12) - 1; let c = corp0, s = monthly;
    for (let y = 0; y < years; y++) { for (let m = 0; m < 12; m++) c = (c + s) * (1 + mr); s *= 1 + step / 100; }
    return c;
  }

  /** p: { age, life, exp0 (₹ a year today), pension (₹ a year today, from retirement), infl, swr (%), post (% return after retirement) } */
  const netToday = p => Math.max(0, p.exp0 - (p.pension || 0));
  const swrNeed = (p, a) => netToday(p) * Math.pow(1 + p.infl / 100, a - p.age) / (p.swr / 100);

  /** Corpus that lasts exactly to the plan end if you retire at age a: present value of every year's net spending at the post-retirement return. Spending is taken at the start of each year. */
  function lastNeed(p, a) {
    let pv = 0; for (let t = a; t < p.life; t++) pv += netToday(p) * Math.pow(1 + p.infl / 100, t - p.age) / Math.pow(1 + p.post / 100, t - a);
    return pv;                                            // spending comes out first, then the balance grows, so the first year's spending needs no discounting
  }
  const target = (p, a) => Math.max(swrNeed(p, a), lastNeed(p, a));

  /** Age at which the money runs out if you retire at a with corpus c (null if it lasts to the plan end). */
  function runOut(p, a, c) {
    for (let t = a; t < p.life; t++) { c = (c - netToday(p) * Math.pow(1 + p.infl / 100, t - p.age)) * (1 + p.post / 100); if (c < -1e-6) return t + 1; }
    return null;
  }

  /** Earliest age (up to maxAge) at which the corpus you will have reaches the target, or null. q: { sav, step, pre, corp0 } */
  function earliest(p, q, maxAge) { for (let a = p.age; a <= (maxAge || 80); a++) if (accumulate(q.sav, a - p.age, q.corp0, q.step, q.pre) >= target(p, a) - 1e-6) return a; return null; }

  /** Monthly investing (today's level, rising by step) needed to reach the target at retirement age a. */
  function requiredSip(p, q, a) {
    const n = a - p.age, T = target(p, a); if (accumulate(0, n, q.corp0, q.step, q.pre) >= T) return 0;
    let lo = 0, hi = 5e6; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; accumulate(mid, n, q.corp0, q.step, q.pre) >= T ? hi = mid : lo = mid; } return hi;
  }

  /** Amount you would need invested today so that, with no further investing, it grows to the target by age a ("coast FIRE"). */
  const coast = (p, q, a) => target(p, a) / Math.pow(1 + q.pre / 100, a - p.age);

  const api = { accumulate, swrNeed, lastNeed, target, runOut, earliest, requiredSip, coast };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Fire = api;
})(typeof window !== 'undefined' ? window : globalThis);
