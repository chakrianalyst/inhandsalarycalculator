/* Gratuity maths — pure functions, no DOM. Used by gratuity-calculator.html and the tests.
   Covered by the Payment of Gratuity Act: wage × 15 ÷ 26 × years, where a part-year of more than 6 months counts as a full year.
   Not covered: wage (average of the last 10 months) × 15 ÷ 30 × completed years.
   Government (CCS rules): a quarter of emoluments for every completed six-month period, up to 16.5 months' pay and the ₹20 lakh limit.
   From 21 Nov 2025 (new labour codes) "wages" must be at least 50% of total pay, and fixed-term employees qualify after 1 year. */
(function (root) {
  const CAP = 2000000;                     // ceiling on the amount payable under the Act, and the tax-free limit for private-sector employees

  /** p: { wage (₹ a month: basic + DA), totalPay (₹ a month, optional), apply50 (bool), kind: 'covered' | 'notcovered' | 'govt', fixedTerm (bool), years, months } */
  function calc(p) {
    const y = Math.max(0, Math.floor(p.years || 0)), mo = Math.max(0, Math.min(11, Math.floor(p.months || 0))), totalMonths = y * 12 + mo;
    const floor50 = p.apply50 && p.totalPay > 0 ? p.totalPay * 0.5 : 0, wage = Math.max(p.wage || 0, floor50), raised = floor50 > (p.wage || 0);
    const gov = p.kind === 'govt', covered = p.kind === 'covered', counted = gov ? Math.floor(totalMonths / 6) / 2 : covered ? y + (mo > 6 ? 1 : 0) : y;
    const need = p.fixedTerm && covered ? 12 : 60, eligible = totalMonths >= need;
    const perYear = covered ? wage * 15 / 26 : wage * 15 / 30, amount = gov ? Math.min(perYear * counted, wage * 16.5) : perYear * counted, payable = covered || gov ? Math.min(amount, CAP) : amount;
    const taxFree = p.kind === 'govt' ? payable : Math.min(payable, CAP);
    return { wage, raised, counted, eligible, monthsToGo: eligible ? 0 : need - totalMonths, perYear, amount, payable: eligible ? payable : 0, formula: payable, taxFree: eligible ? taxFree : 0, aboveCap: (covered || gov) && amount > CAP ? amount - CAP : 0, need };
  }

  /** Gratuity if you stay on to each of the given total years of service, with the wage rising growth % a year. */
  function projection(p, growth, atYears) {
    return atYears.filter(t => t > Math.floor(p.years || 0) + (p.months || 0) / 12).map(t => {
      const k = t - ((p.years || 0) + (p.months || 0) / 12), r = calc({ ...p, wage: p.wage * Math.pow(1 + growth / 100, k), totalPay: (p.totalPay || 0) * Math.pow(1 + growth / 100, k), years: t, months: 0 });
      return { years: t, wage: r.wage, gratuity: r.payable };
    });
  }

  const api = { calc, projection, CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Gratuity = api;
})(typeof window !== 'undefined' ? window : globalThis);
