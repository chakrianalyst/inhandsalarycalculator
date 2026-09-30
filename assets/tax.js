/* Indian income-tax engine — salaried individuals, FY 2025-26 (AY 2026-27).
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

  /**
   * in: {
   *  ctc, basicPct, hraPct, variablePct, pfCap(bool), gratuity(bool),
   *  employerNps (annual ₹), ptMonthly, metro(bool), rentMonthly,
   *  other80c, nps1b, d80, homeLoanInt, otherDed
   * }
   */
  function salary(inp) {
    const ctc = Math.max(0, inp.ctc);
    const basic = ctc * inp.basicPct / 100;
    const hra = basic * inp.hraPct / 100;
    const variable = ctc * inp.variablePct / 100;
    const pfWageMonthly = inp.pfCap ? Math.min(basic / 12, 15000) : basic / 12;
    const employerPf = pfWageMonthly * 12 * 0.12;
    const employeePf = employerPf;
    const gratuity = inp.gratuity ? basic * 0.0481 : 0;
    const employerNps = Math.min(inp.employerNps || 0, ctc);
    const special = Math.max(0, ctc - basic - hra - variable - employerPf - gratuity - employerNps);
    const gross = basic + hra + variable + special;      // cash / taxable salary
    const pt = (inp.ptMonthly || 0) * 12;

    // ---- New regime ----
    const newStd = 75000;
    const newNps = Math.min(employerNps, basic * 0.14);
    const newTaxable = Math.max(0, gross - newStd - newNps);
    const newTax = computeTax(newTaxable, 'new');

    // ---- Old regime ----
    const oldStd = 50000;
    let hraExempt = 0;
    const rent = (inp.rentMonthly || 0) * 12;
    if (rent > 0 && hra > 0) {
      hraExempt = Math.max(0, Math.min(hra, rent - 0.10 * basic, basic * (inp.metro ? 0.5 : 0.4)));
    }
    const c80 = Math.min(150000, employeePf + (inp.other80c || 0));
    const oldNps = Math.min(employerNps, basic * 0.10);
    const nps1b = Math.min(inp.nps1b || 0, 50000);
    const hl = Math.min(inp.homeLoanInt || 0, 200000);
    const oldDeductions = oldStd + pt + hraExempt + c80 + oldNps + nps1b + (inp.d80 || 0) + hl + (inp.otherDed || 0);
    const oldTaxable = Math.max(0, gross - oldDeductions);
    const oldTax = computeTax(oldTaxable, 'old');

    const mk = (tax, taxable, extra) => {
      const inHandYear = gross - employeePf - pt - tax.total;
      return { taxable, tax: tax.total, cess: tax.cess, surcharge: tax.surcharge, inHandYear, inHandMonth: inHandYear / 12, ...extra };
    };
    const n = mk(newTax, newTaxable, { deductions: newStd + newNps });
    const o = mk(oldTax, oldTaxable, { deductions: oldDeductions, hraExempt, c80 });
    const best = n.inHandYear >= o.inHandYear ? 'new' : 'old';
    return {
      ctc, basic, hra, variable, special, employerPf, employeePf, gratuity, employerNps, gross, pt,
      new: n, old: o, best, saving: Math.abs(n.inHandYear - o.inHandYear),
    };
  }

  return { computeTax, salary, slabTax, NEW_SLABS, OLD_SLABS };
})();
if (typeof module !== 'undefined') module.exports = Tax;
