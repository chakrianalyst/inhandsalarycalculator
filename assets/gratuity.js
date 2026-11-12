/* Gratuity maths — pure functions, no DOM. Used by gratuity-calculator.html and the tests.
   Covered by the Payment of Gratuity Act: wage × 15 ÷ 26 × years, where a part-year of more than 6 months counts as a full year.
   Not covered: wage (average of the last 10 months) × 15 ÷ 30 × completed years.
   Government (CCS rules, central government civil servants): a quarter of emoluments for every completed six-month period, up to 16.5 months' pay
   and the ₹25 lakh limit that applies from 1 January 2024. PSU and bank employees are not under these rules.
   From 21 Nov 2025 (new labour codes) "wages" must be at least 50% of total pay, and fixed-term employees qualify after 1 year, paid pro rata for the time served. */
(function (root) {
  const CAP = 2000000;                     // ceiling on the amount payable under the Act, and the tax-free limit for private-sector employees
  const CAP_GOVT = 2500000;                // ceiling for central government civil servants (CCS rules) from 1 January 2024
  const NEAR_MONTHS = 56;                  // 4 years 8 months: from here some courts treat 4 years plus 240 working days as five years

  /** p: { wage (₹ a month: basic + DA), totalPay (₹ a month, optional), apply50 (bool), kind: 'covered' | 'notcovered' | 'govt', fixedTerm (bool), years, months } */
  function calc(p) {
    const y = Math.max(0, Math.floor(p.years || 0)), mo = Math.max(0, Math.min(11, Math.floor(p.months || 0))), totalMonths = y * 12 + mo;
    const floor50 = p.apply50 && p.totalPay > 0 ? p.totalPay * 0.5 : 0, wage = Math.max(p.wage || 0, floor50), raised = floor50 > (p.wage || 0);
    const gov = p.kind === 'govt', covered = p.kind === 'covered', proRata = !!p.fixedTerm && covered;
    const counted = gov ? Math.floor(totalMonths / 6) / 2 : proRata ? totalMonths / 12 : covered ? y + (mo > 6 ? 1 : 0) : y;      // fixed-term: pro rata for the months served
    const need = proRata ? 12 : 60, eligible = totalMonths >= need, cap = gov ? CAP_GOVT : CAP;
    const perYear = covered ? wage * 15 / 26 : wage * 15 / 30, amount = gov ? Math.min(perYear * counted, wage * 16.5) : perYear * counted, payable = covered || gov ? Math.min(amount, cap) : amount;
    const taxFree = gov ? payable : Math.min(payable, CAP);
    const nearEligible = covered && !proRata && !eligible && totalMonths >= NEAR_MONTHS;
    return { wage, raised, counted, eligible, nearEligible, monthsToGo: eligible ? 0 : need - totalMonths, perYear, amount, payable: eligible ? payable : 0, formula: payable, taxFree: eligible ? taxFree : 0, aboveCap: (covered || gov) && amount > cap ? amount - cap : 0, need, cap };
  }

  /** Gratuity if you stay on to each of the given total years of service, with the wage rising growth % a year. */
  function projection(p, growth, atYears) {
    return atYears.filter(t => t > Math.floor(p.years || 0) + (p.months || 0) / 12).map(t => {
      const k = t - ((p.years || 0) + (p.months || 0) / 12), r = calc({ ...p, wage: p.wage * Math.pow(1 + growth / 100, k), totalPay: (p.totalPay || 0) * Math.pow(1 + growth / 100, k), years: t, months: 0 });
      return { years: t, wage: r.wage, gratuity: r.payable };
    });
  }

  const api = { calc, projection, CAP, CAP_GOVT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Gratuity = api;
})(typeof window !== 'undefined' ? window : globalThis);
