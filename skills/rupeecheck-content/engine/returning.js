/* Return-to-India planning — pure functions, no DOM. Used by return-calculator.html and the tests.
   For each possible year of returning (now, in 1 year, ... in 10), it works out how much you would bring home after tax and costs, how much you need to live the life you want
   in India until the end of your plan, and whether the first covers the second. Money is in rupees of the year it happens; spending and prices rise with inflation from today. */
(function (root) {
  const TaxIN = typeof Tax !== 'undefined' ? Tax : require('./tax.js');            // browser: global from tax.js; Node: require

  /** p: {
   *   age, fx (₹ per unit of the foreign currency today), dep (% a year the rupee weakens), retAbroad (% a year on investments abroad), retIndia (% a year on money in India), infl (% India inflation),
   *   cash (foreign currency: savings and investments), saveYear (foreign currency saved each year), saveGrowth (% a year),
   *   retire (foreign currency in retirement accounts), retireYear (foreign currency added each year), indiaAssets (₹ you already hold in India),
   *   spend (₹ a month in today's money, everything in India including rent), planEnd (age), jobCtc (₹ a year, 0 = no job), jobGrowth (% a year), workUntil (age), lump (₹ one-time cost of settling back),
   *   convCost (% lost converting and transferring), gainShare (% of your investments that is gain), gainTax (% tax on that gain),
   *   retireMode ('leave' | 'withdraw'), retireTax (% tax on retirement money), penalty (% early-withdrawal penalty on withdrawing before 59½), retireAge (age you start using retirement money, 60 by default) } */
  const idxOf = (p, t) => Math.pow(1 + p.infl / 100, t);

  /** India income for each year counted from today (t = 0, 1, ...), after tax. */
  function incomeByYear(p) {
    const N = Math.max(0, p.planEnd - p.age), out = [];
    for (let t = 0; t < N; t++) {
      const a = p.age + t; let v = 0;
      if (p.jobCtc > 0 && a < p.workUntil) { const r = TaxIN.salary({ ctc: p.jobCtc * Math.pow(1 + (p.jobGrowth || 0) / 100, t), basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 }); v = r[r.best].inHandYear; }
      out.push(v);
    }
    return out;
  }

  /** What you hold when you return after r years, in rupees, and the retirement money you left abroad. */
  function atReturn(p, r) {
    const ra = p.retAbroad / 100, fxR = p.fx * Math.pow(1 + p.dep / 100, r); let cash = p.cash, ret = p.retire;
    for (let t = 0; t < r; t++) {
      cash = cash * (1 + ra) + p.saveYear * Math.pow(1 + (p.saveGrowth || 0) / 100, t) * (1 + ra / 2);
      ret = ret * (1 + ra) + (p.retireYear || 0) * (1 + ra / 2);
    }
    const gross = cash * fxR, gainTax = cash * (p.gainShare / 100) * (p.gainTax / 100) * fxR, conv = gross * (p.convCost / 100);
    const india = p.indiaAssets * Math.pow(1 + p.retIndia / 100, r), age = p.age + r;
    let withdrawn = 0, kept = 0, keptAt = null;
    if (p.retireMode === 'withdraw') { const pen = age < 59.5 ? (p.penalty || 0) : 0; withdrawn = ret * fxR * (1 - (p.retireTax + pen) / 100) * (1 - p.convCost / 100); }
    else { const yrs = Math.max(0, (p.retireAge || 60) - age); const val = ret * Math.pow(1 + ra, yrs) * p.fx * Math.pow(1 + p.dep / 100, r + yrs); kept = val * (1 - p.retireTax / 100) * (1 - p.convCost / 100); keptAt = age + yrs; }
    const corpus = gross - gainTax - conv + india + withdrawn - p.lump;
    return { r, age, fxR, cashLocal: cash, retLocal: ret, brought: gross - gainTax - conv, gainTax, conv, india, withdrawn, kept, keptAt, corpus };
  }

  /** Run life in India from age a with starting corpus c0. noJob drops the job income. Returns the age the money runs out (null if it lasts), and the corpus at the end. */
  function live(p, a0, c0, income, extra, spendScale, noJob) {
    let c = c0, out = null; const ri = p.retIndia / 100;
    for (let a = a0; a < p.planEnd; a++) {
      const t = a - p.age, spend = p.spend * 12 * (spendScale || 1) * idxOf(p, t), inc = noJob ? 0 : income[t] || 0, inflow = extra && extra.age === a ? extra.value : 0;
      c = c * (1 + ri) + (inc + inflow - spend) * (1 + ri / 2);
      if (c < -1e-6 && out === null) out = a + 1;
    }
    return { runOut: out, end: c };
  }

  /** Smallest starting corpus that lasts to planEnd (bisection; the corpus can be 0 if income covers everything). */
  function needed(p, a0, income, extra, spendScale) {
    if (live(p, a0, 0, income, extra, spendScale).runOut === null) return 0;
    let lo = 0, hi = p.spend * 12 * (spendScale || 1) * 200 + 1e9;
    for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; live(p, a0, mid, income, extra, spendScale).runOut === null ? hi = mid : lo = mid; }
    return hi;
  }

  /** The whole analysis: one row per return year 0..maxYears. */
  function analyse(p, maxYears) {
    const income = incomeByYear(p), rows = [];
    for (let r = 0; r <= (maxYears == null ? 10 : maxYears); r++) {
      const h = atReturn(p, r), extra = h.kept > 0 ? { age: Math.ceil(h.keptAt), value: h.kept } : null, need = needed(p, h.age, income, extra, 1);
      const noJobRun = live(p, h.age, Math.max(0, h.corpus), income, extra, 1, true), withJob = live(p, h.age, h.corpus, income, extra, 1, false);
      rows.push({ ...h, need, gap: h.corpus - need, ready: h.corpus >= need - 1e-6, runwayEnd: noJobRun.runOut, runwayYears: noJobRun.runOut === null ? p.planEnd - h.age : noJobRun.runOut - h.age, endWithJob: withJob.end, extra });
    }
    const first = rows.find(x => x.ready) || null;
    return { rows, income, firstReady: first ? first.r : null };
  }

  /** The monthly spending (today's money) you could sustain if you returned after r years, given everything else. */
  function maxSpend(p, r, income) {
    income = income || incomeByYear(p); const h = atReturn(p, r), extra = h.kept > 0 ? { age: Math.ceil(h.keptAt), value: h.kept } : null;
    let lo = 0, hi = 5;
    while (live(p, h.age, h.corpus, income, extra, hi).runOut === null && hi < 1e4) hi *= 2;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; live(p, h.age, h.corpus, income, extra, mid).runOut === null ? lo = mid : hi = mid; }
    return p.spend * lo;
  }

  /** One return year in full: what you hold, what you need, and the gap. spendScale / overrides let a caller test other spending or exchange rates. */
  function evaluate(p, r, income) {
    income = income || incomeByYear(p); const h = atReturn(p, r), extra = h.kept > 0 ? { age: Math.ceil(h.keptAt), value: h.kept } : null, need = needed(p, h.age, income, extra, 1);
    return { ...h, need, gap: h.corpus - need, ready: h.corpus >= need - 1e-6, extra };
  }

  const api = { incomeByYear, atReturn, live, needed, evaluate, analyse, maxSpend };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Returning = api;
})(typeof window !== 'undefined' ? window : globalThis);
