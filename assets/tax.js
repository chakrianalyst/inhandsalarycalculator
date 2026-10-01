/* Indian income-tax engine — salaried individuals, FY 2026-27 (AY 2027-28). Slabs, standard deduction, rebate and surcharge are unchanged from FY 2025-26.
   Pure functions, no DOM. Used by the salary and hike calculators. */
const Tax = (() => {
  const NEW_SLABS = [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]];
  const OLD_SLABS = [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]];
  const SURCHARGE = [[5e7, 0.25], [2e7, 0.25], [1e7, 0.15], [5e6, 0.10]]; // descending; new regime capped at 25%
  const SURCHARGE_OLD_TOP = 0.37;

  function slabTax(income, slabs) {
    let prev = 0, tax = 0;
    for (const [limit, rate] of slabs) {
      if (income > prev) tax += (Math.min(income, limit) - prev) * rate;
      if (income <= limit) break;
      prev = limit;
    }
    return tax;
  }

  function baseTax(income, regime) {
    income = Math.max(0, income);
    if (regime === 'new') {
      const t = slabTax(income, NEW_SLABS);
      if (income <= 1200000) return 0;                 // 87A rebate (up to ₹60,000)
      return Math.min(t, income - 1200000);            // marginal relief
    }
    const t = slabTax(income, OLD_SLABS);
    return income <= 500000 ? 0 : t;                   // 87A rebate (up to ₹12,500)
  }

  function surchargeRate(income, regime) {
    if (income > 5e7) return regime === 'old' ? SURCHARGE_OLD_TOP : 0.25;
    for (const [t, r] of SURCHARGE) if (income > t) return r;
    return 0;
  }

  function taxBeforeRelief(income, regime) {
    const base = baseTax(income, regime);
    return base * (1 + surchargeRate(income, regime));
  }

  /** Total tax for a given taxable income, incl. surcharge (with marginal relief) and 4% cess. */
  function computeTax(income, regime) {
    income = Math.max(0, Math.round(income));
    const base = baseTax(income, regime);
    let withSur = taxBeforeRelief(income, regime);
    const rate = surchargeRate(income, regime);
    if (rate > 0) {
      const thresholds = [5e6, 1e7, 2e7, 5e7].filter(t => income > t);
      const T = thresholds[thresholds.length - 1];
      const atT = taxBeforeRelief(T, regime);
      withSur = Math.min(withSur, atT + (income - T));
    }
    const surcharge = Math.max(0, withSur - base);
    const cess = withSur * 0.04;
    return { base, surcharge, cess, total: withSur + cess };
  }

  /* ====================================================================================
     Salary engine v2.  Three layers, all pure functions:
       structure(inp)   CTC mode: turns % / ₹ choices into annual amounts (special allowance balances the CTC)
       fromPayslip(p)   Payslip mode: turns monthly payslip lines into the same annual amounts
       assess(a, d)     Taxes the amounts under both regimes; d = deductions / personal details
     salary(legacy)     Backward-compatible wrapper used by the hike / offer / by-CTC pages.
     ==================================================================================== */
  const K = { stdNew: 75000, stdOld: 50000, npsNew: 0.14, npsOld: 0.10, cap80c: 150000, cap1b: 50000, capHome: 200000, capDis: 125000,
              empCap: 750000, pfCeiling: 15000, pfRate: 0.12, gratuityRate: 0.0481 };
  /** annual amount from a value entered as 'pct' (of base), 'yr' or 'mo' */
  const per = (mode, v, base) => { v = Number(v) || 0; return mode === 'pct' ? (base || 0) * v / 100 : mode === 'mo' ? v * 12 : v; };

  function employerPf(inp, basic) {
    const m = inp.pfMode || (inp.pfCap ? 'cap' : 'full');
    if (m === 'full') return basic * K.pfRate;
    if (m === 'cap') return Math.min(basic / 12, K.pfCeiling) * 12 * K.pfRate;
    return per(m, inp.pfVal, basic);                      // custom: pct of basic / ₹ per year / ₹ per month
  }

  function structure(inp) {
    const ctc = Math.max(0, Number(inp.ctc) || 0);
    const basic = per(inp.basicMode || 'pct', inp.basicVal == null ? 40 : inp.basicVal, ctc);
    const hra = per(inp.hraMode || 'pct', inp.hraVal == null ? 50 : inp.hraVal, basic);
    const bonusTarget = per(inp.bonusMode || 'pct', inp.bonusVal, ctc);
    const bonus = bonusTarget * (inp.payoutPct == null ? 100 : inp.payoutPct) / 100;     // what is actually paid
    const others = (inp.others || []).map(o => ({ name: o.name || 'Allowance', kind: o.kind || 'other', amt: per(o.mode || 'yr', o.val, 0) }));
    const otherSum = others.reduce((s, o) => s + o.amt, 0);
    const pf = employerPf(inp, basic);
    const gratuity = (inp.gratuityOn != null ? inp.gratuityOn : inp.gratuity) ? basic * K.gratuityRate : 0;
    const employerNps = Math.min(per(inp.npsMode || 'yr', inp.npsVal, basic), ctc);
    const insurance = per(inp.insMode || 'yr', inp.insVal, 0);
    const vpf = per(inp.vpfMode || 'mo', inp.vpfVal, basic);
    const allocated = basic + hra + bonusTarget + otherSum + pf + gratuity + employerNps + insurance;
    const special = ctc - allocated;
    return { ctc, basic, hra, bonusTarget, bonus, others, otherSum, special: Math.max(0, special), shortfall: Math.max(0, -special),
             employerPf: pf, employeePf: pf, vpf, gratuity, employerNps, insurance, allocated };
  }

  function fromPayslip(p) {
    const m = k => (Number(p[k]) || 0) * 12;
    return { ctc: null, basic: m('basicM'), hra: m('hraM'), bonusTarget: Number(p.bonusYr) || 0, bonus: Number(p.bonusYr) || 0, others: [], otherSum: m('otherM'), special: 0, shortfall: 0,
             employerPf: p.employerPfM == null ? m('pfM') : m('employerPfM'), employeePf: m('pfM'), vpf: m('vpfM'), gratuity: 0, employerNps: m('employerNpsM'), insurance: 0, allocated: 0 };
  }

  /** Smallest total old-regime deductions at which old-regime tax <= newTax (the break-even point). */
  function breakevenOldDeductions(taxableGross, newTax) {
    if (computeTax(Math.max(0, taxableGross), 'old').total <= newTax) return 0;
    let lo = 0, hi = Math.max(0, taxableGross);
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; computeTax(Math.max(0, taxableGross - mid), 'old').total > newTax ? lo = mid : hi = mid; }
    return hi;
  }

  /**
   * d: { ptMonthly, metro, rentMonthly,
   *      other80c, nps1b, d80 (flat) | d80Self, d80Parents, selfSenior, parentsSenior,
   *      homeLoanInt, eduLoanInt, donations, disability, ltaClaim, otherDed }
   */
  function assess(a, d) {
    d = d || {};
    const pt = (Number(d.ptMonthly) || 0) * 12;
    const ltaAmt = a.others.filter(o => o.kind === 'lta').reduce((s, o) => s + o.amt, 0);
    const gross = a.basic + a.hra + a.bonus + a.otherSum + a.special;                      // cash salary actually paid
    const excess = Math.max(0, a.employerPf + a.employerNps - K.empCap);                    // employer contributions above ₹7.5L are taxable
    const taxableGross = gross + excess;

    // New regime
    const newNps = Math.min(a.employerNps, a.basic * K.npsNew);
    const newRaw = taxableGross - K.stdNew - newNps;
    // Old regime
    const rent = (Number(d.rentMonthly) || 0) * 12;
    const hraExempt = rent > 0 && a.hra > 0 ? Math.max(0, Math.min(a.hra, rent - 0.10 * a.basic, a.basic * (d.metro ? 0.5 : 0.4))) : 0;
    const ltaExempt = Math.min(Number(d.ltaClaim) || 0, ltaAmt);
    const c80 = Math.min(K.cap80c, a.employeePf + a.vpf + (Number(d.other80c) || 0));
    const oldNps = Math.min(a.employerNps, a.basic * K.npsOld), nps1b = Math.min(Number(d.nps1b) || 0, K.cap1b);
    const d80 = d.d80 != null ? Number(d.d80) || 0 : Math.min(Number(d.d80Self) || 0, d.selfSenior ? 50000 : 25000) + Math.min(Number(d.d80Parents) || 0, d.parentsSenior ? 50000 : 25000);
    const hl = Math.min(Number(d.homeLoanInt) || 0, K.capHome), edu = Number(d.eduLoanInt) || 0, don = Number(d.donations) || 0;
    const dis = Math.min(Number(d.disability) || 0, K.capDis), oth = Number(d.otherDed) || 0;
    const oldList = [['Standard deduction', K.stdOld], ['Professional tax', pt], ['HRA exemption', hraExempt], ['LTA exemption', ltaExempt], ['Section 80C (incl. your PF)', c80],
      ['Employer NPS 80CCD(2)', oldNps], ['NPS 80CCD(1B)', nps1b], ['Health insurance 80D', d80], ['Home-loan interest 24(b)', hl], ['Education-loan interest 80E', edu],
      ['Donations 80G', don], ['Disability 80DD/80U', dis], ['Other deductions', oth]].filter(x => x[1] > 0);
    const oldDed = oldList.reduce((s, x) => s + x[1], 0), oldRaw = taxableGross - oldDed;

    const mk = (regime, raw, ded, extra) => {
      const taxable = Math.max(0, raw), t = computeTax(taxable, regime), tNo = computeTax(Math.max(0, raw - a.bonus), regime);
      const fixedPay = gross - a.bonus, ptDed = pt;
      const inHandYear = gross - a.employeePf - a.vpf - ptDed - t.total;
      const bonusTax = t.total - tNo.total;
      return { taxable, tax: t.total, cess: t.cess, surcharge: t.surcharge, deductions: ded, inHandYear, inHandMonth: inHandYear / 12,
               fixedMonthly: (fixedPay - a.employeePf - a.vpf - ptDed - tNo.total) / 12, bonusTax, bonusAfterTax: a.bonus - bonusTax, monthlyTds: t.total / 12, ...extra };
    };
    const n = mk('new', newRaw, K.stdNew + newNps, {});
    const o = mk('old', oldRaw, oldDed, { hraExempt, c80, list: oldList, ltaExempt });
    const best = n.inHandYear >= o.inHandYear ? 'new' : 'old';
    return { ...a, variable: a.bonus, gross, pt, excess, ltaAmt, new: n, old: o, best, saving: Math.abs(n.inHandYear - o.inHandYear),
             breakeven: breakevenOldDeductions(taxableGross, n.tax) };
  }

  /** Legacy interface (hike calculator, offer comparison, by-CTC pages, home-page quick check). */
  function salary(inp) {
    const ctc = Math.max(0, inp.ctc);
    const a = structure({ ctc, basicMode: 'pct', basicVal: inp.basicPct, hraMode: 'pct', hraVal: inp.hraPct, bonusMode: 'pct', bonusVal: inp.variablePct,
      pfMode: inp.pfCap ? 'cap' : 'full', gratuityOn: !!inp.gratuity, npsMode: 'yr', npsVal: inp.employerNps || 0 });
    return assess(a, { ptMonthly: inp.ptMonthly, metro: inp.metro, rentMonthly: inp.rentMonthly, other80c: inp.other80c, nps1b: inp.nps1b, d80: inp.d80 || 0,
      homeLoanInt: inp.homeLoanInt, otherDed: inp.otherDed });
  }

  return { computeTax, salary, structure, fromPayslip, assess, breakevenOldDeductions, slabTax, per, NEW_SLABS, OLD_SLABS, K };
})();
if (typeof module !== 'undefined') module.exports = Tax;
