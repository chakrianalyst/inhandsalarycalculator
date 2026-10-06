/* SWP (systematic withdrawal plan) maths — pure functions, no DOM. Used by swp-calculator.html and the tests.
   Each month the money grows by the monthly rate, then that month's withdrawal is paid out. The withdrawal can rise every 12 months.
   Tax: each withdrawal sells units. Only the part above what those units cost is a gain (average cost), so early withdrawals are mostly your own money.
   Equity funds: gains on units held more than a year are taxed at 12.5% above ₹1.25 lakh a year, gains on units held up to a year at 20%.
   Debt funds: gains are added to your income and taxed at your slab rate. Cess of 4% on top. Each 12 months of the plan is treated as one tax year. */
(function (root) {
  const monthly = ret => Math.pow(1 + ret / 100, 1 / 12) - 1;
  const LTCG_FREE = 125000, LTCG = 0.125, STCG = 0.20, CESS = 1.04;

  /** Tax for one year of withdrawals. lt / st = long- and short-term gains in that year (₹). */
  function yearTax(lt, st, kind, slab) {
    if (kind === 'equity') return (Math.max(0, lt - LTCG_FREE) * LTCG + Math.max(0, st) * STCG) * CESS;
    if (kind === 'slab') return Math.max(0, lt + st) * (slab || 0) / 100 * CESS;
    return 0;
  }

  /** p: { corpus (₹ invested today), withdraw (₹ a month in the first year), step (% rise every 12 months), ret (% a year), years,
   *       gainPct (% of the corpus that is already profit; then the units are treated as held over a year), taxk ('none' | 'equity' | 'slab'), slab (%), nominal (true: ret ÷ 12 a month) } */
  function run(p) {
    const r = p.nominal ? p.ret / 1200 : monthly(p.ret), M = Math.max(0, Math.round(p.years * 12)), step = (p.step || 0) / 100, gp = Math.min(100, Math.max(0, p.gainPct || 0)) / 100;
    let bal = Math.max(0, p.corpus), cost = bal * (1 - gp), w = Math.max(0, p.withdraw), full = 0, paidMonths = 0;
    let yW = 0, yLT = 0, yST = 0, yStart = bal, totW = 0, totTax = 0, totGain = 0;
    const years = [], bals = [bal];
    for (let m = 1; m <= M; m++) {
      if (m > 1 && (m - 1) % 12 === 0) w *= 1 + step;
      bal *= 1 + r;
      const pay = Math.min(w, bal), frac = bal > 0 ? pay / bal : 0, costOut = cost * frac, gain = pay - costOut;
      cost -= costOut; bal -= pay; if (pay > 0) paidMonths = m;
      yW += pay; if (gp > 0 || m > 12) yLT += gain; else yST += gain;               // units bought today: sold within 12 months is short-term
      if (pay >= w - 0.5 && full === m - 1) full = m;                                  // months paid in full, from the start
      if (bal < 0.5) bal = 0;
      bals.push(bal);
      if (m % 12 === 0 || m === M || bal === 0) {
        const tax = yearTax(yLT, yST, p.taxk, p.slab);
        years.push({ year: Math.ceil(m / 12), months: m - (Math.ceil(m / 12) - 1) * 12, monthly: w, withdrawn: yW, gain: yLT + yST, tax, net: yW - tax, start: yStart, balance: bal });
        totW += yW; totTax += tax; totGain += yLT + yST; yW = 0; yLT = 0; yST = 0; yStart = bal;
        if (bal === 0) break;
      }
    }
    const lasts = full === M;
    return { months: M, paidMonths, fullMonths: full, lasts, out: lasts ? null : full + 1,                       // out = the month in which the money could no longer pay the full amount
              end: bal, totalWithdrawn: totW, totalTax: totTax, totalGain: totGain, years, bals, firstMonthly: Math.max(0, p.withdraw), lastMonthly: w };
  }

  /** The largest first-year monthly withdrawal (rising by step) that lasts the whole plan, or that also leaves `keep` (₹) at the end. */
  function maxWithdraw(p, keep) {
    const ok = w => { const R = run({ ...p, withdraw: w }); return R.lasts && R.end >= (keep || 0) - 0.5; };
    let lo = 0, hi = Math.max(1, p.corpus); if (!ok(0)) return 0;
    for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; ok(mid) ? lo = mid : hi = mid; }
    return lo;
  }

  const api = { monthly, run, maxWithdraw, yearTax, LTCG_FREE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SWP = api;
})(typeof window !== 'undefined' ? window : globalThis);
