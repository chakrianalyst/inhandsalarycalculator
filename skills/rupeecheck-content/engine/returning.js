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

  /** The package for year t (counted from today) when you return after r years. 'today' (default): quoted in today's money and raised every year from today. 'return': it is what you would be paid in the return year, raised from there. */
  function ctcAt(p, t, r) { const g = 1 + (p.jobGrowth || 0) / 100; return p.jobCtc * Math.pow(g, p.ctcBasis === 'return' ? Math.max(0, t - (r || 0)) : t); }

  /** The share of year t (counted from today) you are actually earning, when the first jobGap months after returning have no income. */
  function workShare(p, t, r) { const lostTotal = Math.max(0, p.jobGap || 0), k = t - (r || 0); if (!(lostTotal > 0) || k < 0) return 1; return (12 - Math.min(12, Math.max(0, lostTotal - 12 * k))) / 12; }

  /** India income for each year counted from today (t = 0, 1, ...), after tax, for a return after r years (r defaults to 0). */
  function incomeByYear(p, r) {
    const N = Math.max(0, p.planEnd - p.age), out = []; r = r || 0;
    for (let t = 0; t < N; t++) {
      const a = p.age + t; let v = 0;
      if (p.jobCtc > 0 && a < p.workUntil) { const q = TaxIN.salary({ ctc: ctcAt(p, t, r), basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 }); v = q[q.best].inHandYear * workShare(p, t, r); }
      out.push(v);
    }
    return out;
  }

  /** Provident fund and gratuity that build up while you work in India (your PF and your employer's, at the PF rate, and gratuity after five years), as one amount you receive when the job ends. Only when countPf is 'yes'. */
  function pfInflow(p, r) {
    if (p.countPf !== 'yes' || !(p.jobCtc > 0)) return null;
    const end = Math.min(p.workUntil, p.planEnd), rate = (p.pfRate == null ? 8 : p.pfRate) / 100; let pf = 0, grat = 0, years = 0;
    for (let t = r || 0; p.age + t < end; t++) {
      const basic = 0.4 * ctcAt(p, t, r) * workShare(p, t, r); pf += 0.24 * basic * Math.pow(1 + rate, end - (p.age + t) - 1); grat += 0.0481 * basic; if (workShare(p, t, r) > 0) years++;
    }
    const value = pf + (years >= 5 ? grat : 0);
    return value > 0 && end < p.planEnd && end > p.age + (r || 0) ? { age: end, value, pf, grat: years >= 5 ? grat : 0 } : null;
  }

  /** Extra spending from the life events you list, in rupees of the year it falls: 'monthly' = a monthly cost (today's money) from one age up to another, 'once' = a one-time cost at one age. Events before you return are not counted. */
  function eventSpend(p, a, t) {
    let v = 0; for (const e of p.events || []) { const amt = Number(e.amount) || 0; if (!(amt > 0)) continue;
      if (e.kind === 'monthly' && a >= e.from && a < e.to) v += amt * 12 * idxOf(p, t); else if (e.kind === 'once' && a === e.from) v += amt * idxOf(p, t); }
    return v;
  }

  /** What you hold when you return after r years, in rupees, and the retirement money you left abroad. */
  function atReturn(p, r) {
    const ra = p.retAbroad / 100, fxR = p.fx * Math.pow(1 + p.dep / 100, r); let cash = p.cash, ret = p.retire;
    for (let t = 0; t < r; t++) {
      cash = cash * (1 + ra) + p.saveYear * Math.pow(1 + (p.saveGrowth || 0) / 100, t) * (1 + ra / 2);
      ret = ret * (1 + ra) + (p.retireYear || 0) * Math.pow(1 + (p.retireGrowth || 0) / 100, t) * (1 + ra / 2);
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
    let c = c0, out = null; const ri = p.retIndia / 100, ex = extra == null ? [] : (Array.isArray(extra) ? extra : [extra]);
    for (let a = a0; a < p.planEnd; a++) {
      const t = a - p.age, spend = p.spend * 12 * (spendScale || 1) * idxOf(p, t) + eventSpend(p, a, t), inc = noJob ? 0 : income[t] || 0, inflow = ex.reduce((m, e) => m + (e.age === a ? e.value : 0), 0);
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

  /** Money you receive later because of the return year: retirement accounts left abroad (at the age you start using them) and PF and gratuity from a job in India. */
  function inflowsFor(p, h, r) { const out = []; if (h.kept > 0) out.push({ age: Math.ceil(h.keptAt), value: h.kept }); const pf = pfInflow(p, r); if (pf) out.push(pf); return out; }
  const incomeDependsOnReturn = p => p.ctcBasis === 'return' || (p.jobGap || 0) > 0;

  /** The whole analysis: one row per return year 0..maxYears. */
  function analyse(p, maxYears) {
    const rows = [], base = incomeByYear(p, 0);
    for (let r = 0; r <= (maxYears == null ? 10 : maxYears); r++) {
      const income = incomeDependsOnReturn(p) ? incomeByYear(p, r) : base, h = atReturn(p, r), inflows = inflowsFor(p, h, r), extra = h.kept > 0 ? { age: Math.ceil(h.keptAt), value: h.kept } : null, need = needed(p, h.age, income, inflows, 1);
      const noJobRun = live(p, h.age, Math.max(0, h.corpus), income, inflows, 1, true), withJob = live(p, h.age, h.corpus, income, inflows, 1, false);
      rows.push({ ...h, need, gap: h.corpus - need, ready: h.corpus >= need - 1e-6, runwayEnd: noJobRun.runOut, runwayYears: noJobRun.runOut === null ? p.planEnd - h.age : noJobRun.runOut - h.age, endWithJob: withJob.end, extra, inflows, income });
    }
    const first = rows.find(x => x.ready) || null;
    return { rows, income: rows[0].income, firstReady: first ? first.r : null };
  }

  /** The monthly spending (today's money) you could sustain if you returned after r years, given everything else. */
  function maxSpend(p, r, income) {
    income = income || incomeByYear(p, r); const h = atReturn(p, r), inflows = inflowsFor(p, h, r);
    let lo = 0, hi = 5;
    while (live(p, h.age, h.corpus, income, inflows, hi).runOut === null && hi < 1e4) hi *= 2;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; live(p, h.age, h.corpus, income, inflows, mid).runOut === null ? lo = mid : hi = mid; }
    return p.spend * lo;
  }

  /** One return year in full: what you hold, what you need, and the gap. spendScale / overrides let a caller test other spending or exchange rates. */
  function evaluate(p, r, income) {
    income = income || incomeByYear(p, r); const h = atReturn(p, r), inflows = inflowsFor(p, h, r), extra = h.kept > 0 ? { age: Math.ceil(h.keptAt), value: h.kept } : null, need = needed(p, h.age, income, inflows, 1);
    return { ...h, need, gap: h.corpus - need, ready: h.corpus >= need - 1e-6, extra, inflows };
  }

  /** Today's money to the money of the year you return: what a salary or monthly spending quoted today becomes after r years of raises or inflation. */
  function todayToReturn(p, r) { return { ctc: p.ctcBasis === 'return' ? p.jobCtc : p.jobCtc * Math.pow(1 + (p.jobGrowth || 0) / 100, r), spend: p.spend * Math.pow(1 + (p.infl || 0) / 100, r) }; }

  /** A rough guide to how fast the rupee might weaken: the gap between India's inflation and the other country's (purchasing-power idea). Not a forecast; rounded to 0.5, never below 0. */
  function rupeeDriftFromInflation(indiaInfl, abroadInfl) { return Math.max(0, Math.round(((indiaInfl || 0) - (abroadInfl || 0)) * 2) / 2); }

  /** Cautious and optimistic versions of the same inputs: each growth setting moves together by a few points (illustrative spreads, not forecasts). */
  const SCENARIOS = {
    cautious:   { label: 'Cautious',   retAbroad: -2, retIndia: -2, dep: -2, infl: +1, jobGrowth: -2, saveGrowth: -1 },
    optimistic: { label: 'Optimistic', retAbroad: +2, retIndia: +2, dep: +1, infl: -1, jobGrowth: +2, saveGrowth: +1 },
  };
  function scenario(p, key) {
    const d = SCENARIOS[key]; if (!d) return { ...p };
    const q = { ...p }; for (const k of Object.keys(d)) if (k !== 'label') q[k] = Math.max(0, (Number(p[k]) || 0) + d[k]);
    return q;
  }

  const api = { incomeByYear, pfInflow, eventSpend, atReturn, live, needed, evaluate, analyse, maxSpend, todayToReturn, rupeeDriftFromInflation, scenario, SCENARIOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Returning = api;
})(typeof window !== 'undefined' ? window : globalThis);
