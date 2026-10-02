/* HRA exemption (section 10(13A), old regime) — pure functions, no DOM. Used by hra-calculator.html and the tests.
   Exempt HRA = the least of: HRA received, rent paid − 10% of basic, and 50% (metro) or 40% of basic. All amounts are for the months you paid that rent. */
(function (root) {
  const METROS_2026 = ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad'];      // 50% limit from FY 2026-27 (Income-tax Rules 2026)
  const METROS_OLD = METROS_2026.slice(0, 4);                                                                         // 50% limit until FY 2025-26

  /** p: { basicM, hraM, rentM (₹ a month), months (1-12), pctOfBasic (0.5 or 0.4), slab (% income-tax rate, optional) } */
  function calc(p) {
    const k = Math.max(0, Math.min(12, p.months == null ? 12 : p.months)), b = p.basicM * k, h = p.hraM * k, r = p.rentM * k;
    const a = h, c = Math.max(0, r - 0.1 * b), d = b * p.pctOfBasic, exempt = Math.max(0, Math.min(a, c, d)), min = Math.min(a, c, d);
    const which = min === a ? 'hra' : min === c ? 'rent' : 'basic';
    const full = Math.min(a, d), rentForFull = k > 0 ? (0.1 * b + full) / k : 0;          // rent a month at which the rent test stops being the limit
    const tax = exempt * ((p.slab || 0) / 100) * 1.04;
    return { a, c, d, exempt, taxable: h - exempt, which, rentForFull, tax, rentAnnual: r, needsPan: r > 100000 };
  }
  const isMetro = (city, fy) => (fy === '2025' ? METROS_OLD : METROS_2026).includes(city);

  const api = { calc, isMetro, METROS_2026, METROS_OLD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HRA = api;
})(typeof window !== 'undefined' ? window : globalThis);
