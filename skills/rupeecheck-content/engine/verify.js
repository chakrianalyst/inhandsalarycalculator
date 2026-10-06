#!/usr/bin/env node
/* Independent check of a scenario. It runs the tool with run.js, then recomputes the key numbers a SECOND way using plain textbook formulas written here
   (no shared code with the site's calculators). That way a bug in one method shows up as a disagreement instead of going into a post.
   Usage:  node verify.js <tool> '<json of inputs>'        (same inputs as run.js)
   Each line is one of:  AGREE (the two methods match), APPROXIMATE (only a range check was possible: round the number and say "about"),
                         UNVERIFIED (no independent method: do not publish a precise figure without an official source), MISMATCH (stop and investigate).
   Exit code 1 if anything is a MISMATCH. */
'use strict';
const { TOOLS } = require('./run.js');
const n = v => { const x = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const lines = [];
const check = (label, engine, indep, tol = 1) => lines.push({ label, engine, independent: indep, status: Math.abs(engine - indep) <= tol ? 'AGREE' : 'MISMATCH', diff: engine - indep });
const range = (label, engine, lo, hi, why) => lines.push({ label, engine, independent: `${Math.round(lo)} to ${Math.round(hi)}`, status: engine >= lo && engine <= hi ? 'APPROXIMATE' : 'MISMATCH', note: why });
const unverified = (label, why) => lines.push({ label, engine: null, independent: null, status: 'UNVERIFIED', note: why });

/* ---- independent tax, Tax Year 2026-27 (written from the slab tables, not from the site's code) ---- */
function slabTax(inc, slabs) { let tax = 0, prev = 0; for (const [lim, r] of slabs) { if (inc > prev) tax += (Math.min(inc, lim) - prev) * r; prev = lim; } return tax; }
const NEW = [[400000, 0], [800000, .05], [1200000, .10], [1600000, .15], [2000000, .20], [2400000, .25], [Infinity, .30]], OLD = [[250000, 0], [500000, .05], [1000000, .20], [Infinity, .30]];
function taxNew(taxable) { if (taxable <= 1200000) return 0; let t = Math.min(slabTax(taxable, NEW), taxable - 1200000); return t * 1.04; }     // rebate up to 12L, marginal relief just above it, 4% cess (valid below the surcharge zone of 50L)
function taxOld(taxable) { if (taxable <= 500000) return 0; return slabTax(taxable, OLD) * 1.04; }

const V = {
  salary(r) {
    const i = r.inputs, ctc = n(i.ctc), basic = ctc * n(i.basicPct) / 100;
    if (n(i.variablePct) > 0 || ctc > 5000000) return unverified('in-hand salary', 'Variable pay or a CTC above ₹50 lakh needs surcharge and payout rules this check does not rebuild. Use an official calculator for a second opinion.');
    const pfBase = i.pfCap ? Math.min(basic, 180000) : basic, erPf = pfBase * 0.12, grat = i.gratuity ? basic * 0.0481 : 0, erNps = ctc * n(i.employerNps) / 100 * 0, gross = ctc - erPf - grat - erNps;
    const pt = Math.min(2500, n(i.ptMonthly) * 12), perq = Math.max(0, erPf - 750000);
    const newTax = taxNew(Math.max(0, gross - 75000 + perq)), inHandNew = gross - erPf - pt - newTax;
    check('gross cash salary a year', r.results.grossCashSalaryYear, gross, 2); check('income tax, new regime', r.results.taxNewRegime, newTax, 2);
    check('in-hand a month, new regime', r.results.inHandMonthNewRegime, inHandNew / 12, 1);
    /* old regime, rebuilt from the rules: standard deduction, professional tax, HRA exemption, 80C (with your PF), 80D, NPS 80CCD(1B), home-loan interest */
    const other = ['d80Self', 'd80Parents', 'eduLoanInt', 'donations', 'disability', 'ltaClaim', 'otherDed'].filter(k => n(i[k]) > 0), erNpsAmt = 0;
    const hraAnnual = basic * n(i.hraPct) / 100, rentYear = n(i.rentMonthly) * 12, metro = !(i.metro === false || i.metro === 'false');
    const hraEx = Math.max(0, Math.min(hraAnnual, rentYear - 0.1 * basic, (metro ? 0.5 : 0.4) * basic)), c80 = Math.min(150000, erPf + n(i.other80c));
    const oldTaxable = Math.max(0, gross - 50000 - pt - hraEx - c80 - Math.min(25000, n(i.d80)) - Math.min(50000, n(i.nps1b)) - Math.min(200000, n(i.homeLoanInt)) + perq);
    if (!other.length && n(i.employerNps) === 0) { const oldTax = taxOld(oldTaxable); check('income tax, old regime (with your deductions)', r.results.taxOldRegime, oldTax, 2); check('in-hand a month, old regime', r.results.inHandMonthOldRegime, (gross - erPf - pt - oldTax) / 12, 1); }
    else lines.push({ label: 'old-regime tax', status: 'UNVERIFIED', note: 'Deductions of this kind (' + (other.join(', ') || 'employer NPS') + ') are not rebuilt here. Check them against an official calculator before quoting the old-regime figure.' });
    if (r.results.regimeUsed === 'new') check('in-hand a month (regime used)', r.results.inHandMonth, inHandNew / 12, 1);
    else lines.push({ label: 'in-hand a month (old regime used)', engine: r.results.inHandMonth, independent: `at least ${Math.round(inHandNew / 12)}`, status: r.results.inHandMonth >= inHandNew / 12 - 1 ? 'APPROXIMATE' : 'MISMATCH', note: 'The old regime was cheaper, so in-hand must be at least the new-regime figure.' });
  },
  regime(r) {
    const g = r.inputs.gross, nt = taxNew(Math.max(0, g - 75000));
    check('new regime tax', r.results.newRegimeTax, nt, 2); check('old regime tax with no deductions', r.results.oldRegimeTaxNoDeductions, taxOld(Math.max(0, g - 50000)), 2);
    let lo = 0, hi = g; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; taxOld(Math.max(0, g - 50000 - mid)) > nt ? lo = mid : hi = mid; }
    check('deductions needed for the old regime to cost the same', r.results.oldRegimeBreakEvenDeductions, hi, 5);
    if (g > 5000000) lines.push({ label: 'surcharge zone', status: 'UNVERIFIED', note: 'Above ₹50 lakh surcharge applies; this check ignores it.' });
  },
  sip(r) {
    const i = r.inputs, ret = n(i.ret), months = Math.floor(n(i.yrs)) * 12 + Math.floor(n(i.mon)), step = i.mode === 'lump' ? 0 : n(i.step) / 100, lump = n(i.lump), rm = i.conv === 'nom' ? ret / 1200 : Math.pow(1 + ret / 100, 1 / 12) - 1;
    const fv = s => { let v = lump; for (let m = 0; m < months; m++) v = (v + s * Math.pow(1 + step, Math.floor(m / 12))) * (1 + rm); return v; };
    let s = n(i.sip);
    if (i.mode === 'goal') { const fut = Math.pow(1 + n(i.infl) / 100, months / 12), target = i.goalIn === 'today' ? n(i.goal) * fut : n(i.goal); let lo = 0, hi = target; for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; fv(mid) < target ? lo = mid : hi = mid; } s = hi; check('monthly SIP needed', r.results.monthlySip, s, 1); check('goal amount in future rupees', r.results.goalFutureAmount, target, 1); }
    const val = fv(i.mode === 'lump' ? 0 : s); check('future value', r.results.futureValue, val, 5);
    let inv = lump; for (let m = 0; m < months; m++) inv += (i.mode === 'lump' ? 0 : s) * Math.pow(1 + step, Math.floor(m / 12)); check('total invested', r.results.totalInvested, inv, 5);
  },
  swp(r) {
    const i = r.inputs, P = n(i.corpus), w0 = n(i.wd), g = n(i.step) / 100, N = Math.max(1, Math.round(n(i.yrs)) || 1) * 12, rm = i.conv === 'nom' ? n(i.ret) / 1200 : Math.pow(1 + n(i.ret) / 100, 1 / 12) - 1;
    const sim = w => { let b = P, full = 0; for (let m = 0; m < N; m++) { const wm = w * Math.pow(1 + g, Math.floor(m / 12)); b = b * (1 + rm); if (b + 1e-9 >= wm) { b -= wm; full++; } else { b = 0; break; } } return { b, full }; };
    const own = sim(w0); check('months paid in full', r.results.monthsPaidInFull, own.full, 0); check('left at the end', r.results.leftAtEnd, own.b, 5);
    if (g === 0 && rm > 0) check('most you can take each month (annuity formula)', r.results.maxMonthlyWithdrawalThatLasts, P * rm / (1 - Math.pow(1 + rm, -N)), 1);
    else { let lo = 0, hi = P; for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; sim(mid).full === N ? lo = mid : hi = mid; } check('most you can take each month', r.results.maxMonthlyWithdrawalThatLasts, lo, 1); }
    if (i.taxk !== 'none') {                                                   // year 1: only the profit part of each withdrawal, by average cost
      const gp = Math.min(95, Math.max(0, n(i.gainPct))) / 100; let b = P, cost = P * (1 - gp), profit = 0; for (let m = 0; m < Math.min(12, N); m++) { b *= 1 + rm; const pay = Math.min(w0, b); profit += pay * (1 - cost / b); cost -= cost * pay / b; b -= pay; }
      check('profit in year 1 withdrawals', r.results.year1Profit, profit, 2);
      const tax1 = i.taxk === 'slab' ? profit * n(i.slab) / 100 * 1.04 : gp > 0 ? Math.max(0, profit - 125000) * 0.125 * 1.04 : profit * 0.2 * 1.04; check('tax in year 1', r.results.year1Tax, tax1, 2);
    }
  },
  emi(r) {
    const i = r.inputs; if (i.mode === 'afford') return unverified('affordable loan', 'Check by hand: loan = EMI × (1 − (1 + r)^−n) ÷ r.');
    const P = n(i.amt), rm = n(i.rate) / 1200, nm = Math.floor(n(i.yrs)) * 12 + Math.floor(n(i.mon)), emi = rm === 0 ? P / nm : P * rm * Math.pow(1 + rm, nm) / (Math.pow(1 + rm, nm) - 1);
    check('EMI', r.results.emi, emi, 0.5); check('total interest', r.results.totalInterest, emi * nm - P, 5); check('first EMI: interest part', r.results.firstEmiInterestSharePct, P * rm / emi * 100, 0.01);
    const extra = n(i.extra); if (extra > 0 || n(i.lump) > 0) { let bal = P, m = 0, intr = 0; while (bal > 0.5 && m < 1200) { m++; const it = bal * rm; const pay = Math.min(emi + extra, bal + it); bal -= pay - it; intr += it; if (n(i.lump) > 0 && m === Math.max(1, n(i.lumpM)) && bal > 0) bal -= Math.min(n(i.lump), bal); }
      check('months with prepayment', r.results.withPrepayment.months, m, 0); check('interest with prepayment', r.results.withPrepayment.totalInterest, intr, 5); }
  },
  fd(r) {
    const i = r.inputs; if (i.mode === 'rd') { const M = Math.floor(n(i.yrs)) * 12 + Math.floor(n(i.mon)); let mat = 0; for (let k = 1; k <= M; k++) mat += n(i.d) * Math.pow(1 + n(i.rate) / 400, 4 * (M - k + 1) / 12); check('RD maturity', r.results.maturity, mat, 1); return; }
    const per = n(i.cmp), t = n(i.yrs) + n(i.mon) / 12 + n(i.day) / 365;
    if (Number.isInteger(t * per)) check('FD maturity', r.results.maturity, n(i.p) * Math.pow(1 + n(i.rate) / 100 / per, t * per), 1); else unverified('FD maturity', 'The tenure does not end on a compounding date, so the bank-style leftover-period rule applies. Check one example by hand.');
    const base = Math.max(0, n(i.sal) - 75000), P = n(i.p), rr = n(i.rate) / 100 / per, full = Math.ceil(t - 1e-9), yearly = [];
    if (!Number.isInteger(t * per) || !Number.isInteger(per)) return unverified('tax on the interest', 'The tenure does not end on a compounding date. Check one year by hand.');
    for (let k = 1; k <= full; k++) yearly.push(P * Math.pow(1 + rr, per * Math.min(k, t)) - P * Math.pow(1 + rr, per * (k - 1)));
    if (base + Math.max(...yearly) > 5000000) return unverified('tax on the interest', 'Income above ₹50 lakh in a year brings in surcharge (with marginal relief), which this check does not rebuild. Check that year against the official tax calculator.');
    check('tax on the interest (each year on top of your income)', r.results.taxOnInterest, yearly.reduce((a, y) => a + taxNew(base + y) - taxNew(base), 0), 1);
  },
  gratuity(r) { const i = r.inputs; if (i.kind !== 'covered' || i.fixed) return unverified('gratuity', 'Only the standard covered-employee formula is rebuilt here.'); const months = Math.floor(n(i.yrs)) * 12 + Math.floor(n(i.mon)), counted = Math.floor(months / 12) + (months % 12 >= 6 ? 1 : 0), eligible = months >= 60;
    if (eligible) check('gratuity amount', r.results.amount, n(i.wage) * 15 / 26 * counted, 1); else lines.push({ label: 'eligibility', engine: r.results.eligible, independent: false, status: r.results.eligible === false ? 'AGREE' : 'MISMATCH' }); },
  hra(r) { const i = r.inputs, m = n(i.months), metro = !(i.metro === false || i.metro === 'false'), a = n(i.hra) * m, c = n(i.rent) * m - 0.1 * n(i.basic) * m, d = (metro ? 0.5 : 0.4) * n(i.basic) * m, ex = Math.max(0, Math.min(a, c, d));
    check('HRA exempt', r.results.exempt, ex, 1); check('HRA taxable', r.results.taxable, a - ex, 1); },
  fire(r) {
    const i = r.inputs, age = Math.round(n(i.age)), ra = r.results.retireAge, life = Math.max(ra + 1, Math.round(n(i.life))), netToday = Math.max(0, n(i.exp) * 12 * n(i.ratio) / 100 - n(i.pension) * 12), infl = n(i.infl) / 100, swr = (n(i.swr) || 3.5) / 100;
    const mr = Math.pow(1 + n(i.ret) / 100, 1 / 12) - 1; let c = n(i.corp), s = n(i.sav); for (let y = 0; y < ra - age; y++) { for (let m = 0; m < 12; m++) c = (c + s) * (1 + mr); s *= 1 + n(i.step) / 100; }
    check('projected corpus at retirement', r.results.projectedCorpus, c, 5);
    const swrNeed = netToday * Math.pow(1 + infl, ra - age) / swr; let last = 0; for (let a = ra; a < life; a++) last += netToday * Math.pow(1 + infl, a - age) / Math.pow(1 + n(i.postRet) / 100, a - ra);
    check('corpus needed (the larger of the two rules)', r.results.corpusNeeded, Math.max(swrNeed, last), 5);
  },
  rentbuy(r) { const i = r.inputs, P = n(i.price) * (1 - n(i.dp) / 100), rm = n(i.rate) / 1200, nm = n(i.tenure) * 12, emi = P * rm * Math.pow(1 + rm, nm) / (Math.pow(1 + rm, nm) - 1);
    check('home-loan EMI', r.results.emi, emi, 1); unverified('net worth comparison', 'Depends on many modelling choices (investing the difference, taxes, costs). State the assumptions and call it an illustration.'); },
  abroad(r) {
    const i = r.inputs, x = r.results, k = n(i.fx), H = x.years;
    check('living cost a month abroad, in rupees', x.livingCostMonthAbroadInRupees, (n(i.rentA) + n(i.otherA)) * k, 1); check('living cost a month in India', x.livingCostMonthIndia, n(i.rentI) + n(i.otherI), 1);
    const parents = n(i.parents) * 12;
    check('saved in year 1 abroad (take-home − living costs − trips − one-time move − parents)', x.savedYear1Abroad, x.takeHomeMonthAbroadInRupees * 12 - x.livingCostMonthAbroadInRupees * 12 - n(i.trips) - n(i.oneTime) - parents, 5);
    check('saved in year 1 in India (take-home − living costs − parents)', x.savedYear1India, x.takeHomeMonthIndia * 12 - x.livingCostMonthIndia * 12 - parents, 5);
    check('abroad ahead by = net worth abroad − net worth in India', x.abroadAheadBy, x.netWorthEndAbroad - x.netWorthEndIndia, 5);
    if (n(i.partner) || i.partner === true) return lines.push({ label: 'take-home pay with a partner', status: 'UNVERIFIED', note: 'Partner income is not rebuilt here.' });
    if (x.currency === 'USD') {
      const g = n(i.gross), std = 16100, B = [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]];
      const fed = d => slabTax(Math.max(0, d), B), fica = g => Math.min(g, 184500) * .062 + g * .0145 + Math.max(0, g - 200000) * .009, contrib = g * n(i.retPct) / 100;
      const upper = g - fed(g - contrib - std) - fica(g) - contrib, lower = g - fed(g - contrib - std) - fica(g) - contrib - 0.133 * g;
      range('take-home a year abroad (USD, single filer: federal tax and payroll tax rebuilt, state tax assumed 0% to 13.3%)', x.takeHomeMonthAbroadInRupees * 12 / k, lower, upper, 'Range check only: state and city tax and the retirement contribution are not rebuilt.');
    } else unverified('take-home pay abroad', 'Only the US federal and payroll tax is rebuilt here. Check ' + x.country + ' take-home against the tax authority\'s own figures before quoting it.');
    unverified('net worth after ' + H + ' years', 'A long-run projection. State the assumptions and call it an estimate.');
  },
  return(r) {
    const d = r.inputs, P = { age: n(d.age), fx: n(d.fx), dep: n(d.dep), retAbroad: n(d.retA), retIndia: n(d.retI), infl: n(d.infl), cash: n(d.cash), saveYear: n(d.saveYear), saveGrowth: n(d.saveGrowth), retire: n(d.retire), retireYear: n(d.retireYear), retireGrowth: n(d.retireGrowth),
      indiaAssets: n(d.indiaAssets), spend: n(d.spend), planEnd: Math.max(n(d.age) + 1, n(d.planEnd)), jobCtc: n(d.jobCtc), jobGrowth: n(d.jobGrowth), workUntil: n(d.workUntil), lump: n(d.lump), convCost: n(d.convCost), gainShare: n(d.gainShare), gainTax: n(d.gainTax),
      mode: d.retMode, retireTax: n(d.retireTax), penalty: n(d.penalty), retireAge: n(d.retireAge), basis: d.ctcBasis, indiaTax: n(d.indiaTax) / 100, partnerCtc: n(d.partnerCtc), partnerYears: n(d.partnerYears), hit: n(d.marketHit) / 100, gap: Math.max(0, n(d.jobGap)), countPf: d.countPf === 'yes', pfRate: n(d.pfRate) / 100,
      events: [1, 2, 3].map(i => ({ kind: d['ev' + i + 'Kind'], amount: n(d['ev' + i + 'Amt']), from: n(d['ev' + i + 'From']), to: n(d['ev' + i + 'To']) })).filter(e => e.kind && e.amount > 0) };
    const ra = P.retAbroad / 100, ri = P.retIndia / 100 * (1 - P.indiaTax), N = P.planEnd - P.age;
    let usedSite = false;                                                       // set when a salary above ₹50 lakh forces us to take that year's tax from the site (surcharge is not rebuilt here)
    const inHand = ctc => { const basic = ctc * 0.4, erPf = basic * 0.12, gross = ctc - erPf - basic * 0.0481, pt = 2400;       // 40% basic, PF on full basic, gratuity inside CTC, ₹200 a month professional tax, no rent
      const tNew = taxNew(Math.max(0, gross - 75000)), tOld = taxOld(Math.max(0, gross - 50000 - pt - Math.min(150000, erPf))); return gross - erPf - pt - Math.min(tNew, tOld); };   // the cheaper regime, as the site does
    const siteInHand = ctc => { const q = require('./tax.js').salary({ ctc, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 }); return q[q.best].inHandYear; };
    const share = (t, k) => { const j = t - k; if (!(P.gap > 0) || j < 0) return 1; return (12 - Math.min(12, Math.max(0, P.gap - 12 * j))) / 12; };       // the part of the year you are earning, when the first months after returning have no income
    const ctcOf = (t, k) => P.jobCtc * Math.pow(1 + P.jobGrowth / 100, P.basis === 'return' ? Math.max(0, t - k) : t);
    const pay = ctc => ctc > 5000000 ? (usedSite = true, siteInHand(ctc)) : inHand(ctc);
    const income = (t, k) => { let v = 0; if (P.jobCtc > 0 && P.age + t < P.workUntil) v += pay(ctcOf(t, k)) * share(t, k);
      if (P.partnerCtc > 0 && t >= k && t < k + P.partnerYears && P.age + t < P.planEnd) v += pay(P.partnerCtc * Math.pow(1 + P.jobGrowth / 100, P.basis === 'return' ? t - k : t)); return v; };       // a partner is taxed on their own and starts the year you return
    const events = (a, t) => P.events.reduce((m, e) => m + (e.kind === 'monthly' && a >= e.from && a < e.to ? e.amount * 12 * Math.pow(1 + P.infl / 100, t) : 0) + (e.kind === 'once' && a === e.from ? e.amount * Math.pow(1 + P.infl / 100, t) : 0), 0);
    const pfAt = k => { if (!P.countPf || !(P.jobCtc > 0)) return null; const end = Math.min(P.workUntil, P.planEnd); let pf = 0, gr = 0, yrs = 0;       // PF (both shares, 24% of basic) grows to the day the job ends; gratuity counts after five working years
      for (let t = k; P.age + t < end; t++) { const basic = 0.4 * ctcOf(t, k) * share(t, k); pf += 0.24 * basic * Math.pow(1 + P.pfRate, end - P.age - t - 1); gr += 0.0481 * basic; if (share(t, k) > 0) yrs++; }
      const value = pf + (yrs >= 5 ? gr : 0); return value > 0 && end < P.planEnd && end > P.age + k ? { age: end, value } : null; };
    const rows = [];
    for (let k = 0; k <= 10; k++) {
      let cash = P.cash, ret = P.retire; const fxK = P.fx * Math.pow(1 + P.dep / 100, k), age = P.age + k;
      for (let t = 0; t < k; t++) { cash = cash * (1 + ra) + P.saveYear * Math.pow(1 + P.saveGrowth / 100, t) * (1 + ra / 2); ret = ret * (1 + ra) + P.retireYear * Math.pow(1 + P.retireGrowth / 100, t) * (1 + ra / 2); }
      cash *= 1 - P.hit; ret *= 1 - P.hit;                                      // markets fall just before you convert
      const gross = cash * fxK, brought = gross - cash * P.gainShare / 100 * P.gainTax / 100 * fxK - gross * P.convCost / 100, india = P.indiaAssets * Math.pow(1 + ri, k);
      let withdrawn = 0, kept = 0, keptAt = null;
      if (P.mode === 'withdraw') withdrawn = ret * fxK * (1 - (P.retireTax + (age < 59.5 ? P.penalty : 0)) / 100) * (1 - P.convCost / 100);
      else { const yrs = Math.max(0, P.retireAge - age); kept = ret * Math.pow(1 + ra, yrs) * P.fx * Math.pow(1 + P.dep / 100, k + yrs) * (1 - P.retireTax / 100) * (1 - P.convCost / 100); keptAt = age + yrs; }
      const corpus = brought + india + withdrawn - P.lump, inflowAge = kept > 0 ? Math.ceil(keptAt) : null, pfIn = pfAt(k);
      /* the smallest starting money that never runs out: the balance after year j is c0*(1+ri)^j + S_j, so c0 must be at least -S_j/(1+ri)^j for every j (no searching needed) */
      let S = 0, need = 0;
      for (let a = age, j = 1; a < P.planEnd; a++, j++) { const t = a - P.age, net = income(t, k) + (a === inflowAge ? kept : 0) + (pfIn && pfIn.age === a ? pfIn.value : 0) - P.spend * 12 * Math.pow(1 + P.infl / 100, t) - events(a, t); S = S * (1 + ri) + net * (1 + ri / 2); need = Math.max(need, -S / Math.pow(1 + ri, j)); }
      rows.push({ k, corpus, need });
    }
    const tol = x => Math.max(1, Math.abs(x) * 1e-7), site = r.results.table;
    const compare = (label, a, b) => { if (!usedSite) return check(label, a, b, tol(b)); lines.push({ label, engine: a, independent: b, status: Math.abs(a - b) <= tol(b) ? 'APPROXIMATE' : 'MISMATCH', note: 'Checked independently except the tax on a salary above ₹50 lakh (surcharge), taken from the site.' }); };
    for (const k of [0, 3, 5, 10]) { check(`money brought home, return in ${k} years`, site[k].youBringHome, rows[k].corpus, tol(rows[k].corpus)); compare(`money needed, return in ${k} years`, site[k].youNeed, rows[k].need); }
    const first = rows.find(x => x.corpus >= x.need - 1e-6); compare('first year you are ready (-1 = none in 10 years)', r.results.firstReadyInYears === null ? -1 : r.results.firstReadyInYears, first ? first.k : -1);
    lines.push({ label: 'the assumptions behind it', status: 'APPROXIMATE', engine: null, independent: null, note: 'The maths is checked; the growth, inflation and exchange-rate settings are assumptions. Call the result an estimate and state them.' });
  },
};

function main(argv) {
  const [tool, ...rest] = argv; if (!tool || !TOOLS[tool]) { console.error('Usage: node verify.js <tool> \'<json>\'   tools: ' + Object.keys(TOOLS).join(', ')); process.exit(2); }
  const out = TOOLS[tool](rest.join(' ').trim() ? JSON.parse(rest.join(' ')) : {}), res = { inputs: out.inputs, results: JSON.parse(JSON.stringify(out.results)) };
  V[tool](res);
  const fmt = v => v === null || v === undefined ? '-' : typeof v === 'number' ? (Math.abs(v) >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000) : v;
  let bad = 0; for (const l of lines) { if (l.status === 'MISMATCH') bad++; console.log(`${l.status.padEnd(11)} ${l.label}` + (l.engine !== null ? `\n            site ${fmt(l.engine)}  |  independent ${fmt(l.independent)}` : '') + (l.note ? `\n            ${l.note}` : '')); }
  console.log(bad ? `\n${bad} MISMATCH: do not publish these numbers until the cause is found.` : '\nNo mismatches. Publish AGREE numbers as they are; round APPROXIMATE ones and say "about"; UNVERIFIED ones need an official source or a clear "illustration" label.');
  process.exit(bad ? 1 : 0);
}
module.exports = { V, lines, check };
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error('Error: ' + e.message); process.exit(1); } }
