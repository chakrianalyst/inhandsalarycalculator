/* Layoff runway maths — pure functions, no DOM. Used by layoff-runway-calculator.html and the tests.
   Settlement: severance, notice pay and leave encashment are taxed as salary (the cautious reading: parts of severance and leave
   encashment can be tax-free, but we do not count that). Gratuity is tax-free up to ₹20 lakh. The extra tax is what the payout adds
   on top of the salary already earned this financial year, under the new regime, with the ₹75,000 standard deduction.
   Runway: month 1 is the first month without salary. Each month the spending is paid from the money you have, less any income;
   the health-insurance premium is paid in month 1 and every 12 months. PF, if you choose to count it, arrives as the EPF rules
   allow after a job loss: 75% after one month without work, the rest after twelve. Savings are assumed to earn nothing. */
(function (root) {
  const STD = 75000, GRAT_FREE = 2000000;

  /** p: { monthly (gross salary a month), monthsWorked (months of salary this financial year), severance, notice, leave, gratuity } in ₹ before tax.
      computeTax(taxableIncome) → total tax for the year (Tax.computeTax(x, 'new').total on the site). */
  function settlement(p, computeTax) {
    const n = v => Math.max(0, Number(v) || 0);
    const severance = n(p.severance), notice = n(p.notice), leave = n(p.leave), gratuity = n(p.gratuity);
    const gratTaxable = Math.max(0, gratuity - GRAT_FREE), taxable = severance + notice + leave + gratTaxable;
    const earned = n(p.monthly) * n(p.monthsWorked), before = Math.max(0, earned - STD), after = Math.max(0, earned + taxable - STD);
    const tax = Math.max(0, computeTax(after) - computeTax(before)), gross = severance + notice + leave + gratuity;
    return { gross, taxable, gratFree: gratuity - gratTaxable, tax, net: gross - tax, rate: taxable > 0 ? tax / taxable : 0, earned };
  }

  /** How long `cash` lasts at `spend` a month. o: { insurance (yearly premium), income (a month, after tax), pf (balance), pfOn, maxMonths }.
      Returns months covered (a fraction for the last part-month), whether it lasts the whole span, and the balance after each month. */
  function runway(cash, spend, o) {
    o = o || {}; const M = o.maxMonths || 120, ins = Math.max(0, o.insurance || 0), inc = Math.max(0, o.income || 0), pf = o.pfOn ? Math.max(0, o.pf || 0) : 0;
    let bal = Math.max(0, cash); const bals = [bal];
    for (let m = 1; m <= M; m++) {
      if (pf) { if (m === 2) bal += pf * 0.75; if (m === 13) bal += pf * 0.25; }
      const out = Math.max(0, spend) + ((m - 1) % 12 === 0 ? ins : 0) - inc;
      if (out > 0 && bal < out) { bals.push(0); return { months: m - 1 + bal / out, lasts: false, bals }; }
      bal -= out; bals.push(bal);
    }
    return { months: M, lasts: true, bals };
  }

  const api = { settlement, runway, GRAT_FREE, STD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Layoff = api;
})(typeof window !== 'undefined' ? window : globalThis);
