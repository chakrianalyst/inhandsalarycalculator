/* Loan maths — pure functions, no DOM. Used by emi-calculator.html and the tests.
   Standard reducing-balance loan: interest each month is the monthly rate times the balance owed. */
(function (root) {
  /** Monthly EMI for principal P, annual rate (%), n months. */
  function emi(P, rate, n) {
    if (n <= 0) return 0; const r = rate / 1200;
    return r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  }

  /** Month-by-month repayment. p: { P, rate, n, extra (₹ more every month), lumps: [{ month, amount }] (one-time prepayments, paid after that month's EMI) }.
   *  Returns totals, a yearly table and the balance at the end of every month. */
  function schedule(p) {
    const r = p.rate / 1200, e = emi(p.P, p.rate, p.n), extra = Math.max(0, p.extra || 0), lumps = (p.lumps || []).filter(l => l.amount > 0 && l.month > 0);
    let bal = p.P, m = 0, interest = 0, paid = 0; const years = [], bals = [p.P], rows = []; let cur = null;
    while (bal > 0.5 && m < 1200) {
      m++; const i = bal * r; let pay = Math.min(e + extra, bal + i); const pr = pay - i; bal -= pr; interest += i; paid += pay;
      let pre = 0; for (const l of lumps) if (l.month === m && bal > 0) { pre += Math.min(l.amount, bal); } bal -= pre; paid += pre;
      if (bal < 0.5) bal = 0;
      const y = Math.ceil(m / 12); if (!cur || cur.year !== y) { cur = { year: y, principal: 0, interest: 0, prepaid: 0, balance: 0 }; years.push(cur); }
      cur.principal += pr; cur.interest += i; cur.prepaid += pre; cur.balance = bal; bals.push(bal); rows.push({ month: m, interest: i, principal: pr, prepaid: pre, balance: bal });
    }
    return { emi: e, months: m, interest, paid, years, bals, rows };
  }

  /** The largest loan a given EMI can repay over n months at rate (%). */
  function affordable(maxEmi, rate, n) {
    const r = rate / 1200; if (maxEmi <= 0 || n <= 0) return 0;
    return r === 0 ? maxEmi * n : maxEmi * (1 - Math.pow(1 + r, -n)) / r;
  }

  /** Yearly rate (%) you really pay once an upfront fee is deducted from what you receive: the rate at which the EMIs are worth P − fee. */
  function effectiveRate(P, rate, n, fee) {
    if (!(fee > 0) || n <= 0) return rate; const e = emi(P, rate, n), net = P - fee; let lo = 0, hi = 1;
    const pv = r => r === 0 ? e * n : e * (1 - Math.pow(1 + r, -n)) / r;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; pv(mid) > net ? lo = mid : hi = mid; }
    return lo * 1200;
  }

  const api = { emi, schedule, affordable, effectiveRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Loan = api;
})(typeof window !== 'undefined' ? window : globalThis);
