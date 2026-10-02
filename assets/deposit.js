/* Fixed and recurring deposit maths — pure functions, no DOM. Used by fd-calculator.html and the tests.
   Indian banks compound a cumulative FD every n-th of a year, and pay simple interest for the days left over at the end.
   Tenure is years + months + days, with days counted on a 365-day year. */
(function (root) {
  const tenure = (y, m, d) => (Number(y) || 0) + (Number(m) || 0) / 12 + (Number(d) || 0) / 365;

  /** Value of a cumulative FD after tau years: whole compounding periods compound, the leftover fraction earns simple interest. */
  function fdValue(P, rate, n, tau) {
    const x = tau * n, k = Math.floor(x + 1e-9), rem = Math.max(0, x - k), i = rate / n;
    return P * Math.pow(1 + i, k) * (1 + i * rem);
  }

  /** Cumulative FD. p: { P, rate (% a year), n (compoundings a year), years, months, days } */
  function fd(p) {
    const r = p.rate / 100, t = tenure(p.years, p.months, p.days), maturity = t > 0 ? fdValue(p.P, r, p.n, t) : p.P;
    const schedule = [], full = Math.ceil(t - 1e-9);
    for (let y = 1; y <= full; y++) { const a = Math.min(y, t), open = y === 1 ? p.P : fdValue(p.P, r, p.n, y - 1), close = fdValue(p.P, r, p.n, a); schedule.push({ year: y, to: a, open, interest: close - open, close }); }
    return { t, maturity, interest: maturity - p.P, aer: t > 0 ? Math.pow(maturity / p.P, 1 / t) - 1 : 0, schedule, value: tau => fdValue(p.P, r, p.n, tau) };
  }

  /** FD that pays interest out (not compounded). freq = payouts a year (12, 4, 2, 1). Interest for the leftover part of a period is paid at maturity. */
  function payout(p) {
    const r = p.rate / 100, t = tenure(p.years, p.months, p.days), periods = Math.floor(t * p.freq + 1e-9), per = p.P * r / p.freq, rem = Math.max(0, t * p.freq - periods);
    const last = per * rem, total = per * periods + last;
    return { t, per, periods, last, interest: total, maturity: p.P, perYear: p.P * r, aer: t > 0 ? total / p.P / t : 0 };
  }

  /** Recurring deposit: D every month for M months, each instalment compounding quarterly until maturity (the usual bank method). */
  function rd(p) {
    const r = p.rate / 100, M = Math.round(p.months), q = 4; let maturity = 0;
    for (let i = 1; i <= M; i++) maturity += p.D * Math.pow(1 + r / q, q * (M - i + 1) / 12);
    const invested = p.D * M, schedule = [];
    for (let y = 1; y <= Math.ceil(M / 12); y++) {
      const m = Math.min(12 * y, M); let v = 0; for (let i = 1; i <= m; i++) v += p.D * Math.pow(1 + r / q, q * (m - i + 1) / 12);
      const pm = 12 * (y - 1); let pv = 0; for (let i = 1; i <= pm; i++) pv += p.D * Math.pow(1 + r / q, q * (pm - i + 1) / 12);
      schedule.push({ year: y, to: m / 12, open: pv, interest: v - pv - p.D * (m - pm), close: v, deposited: p.D * m });
    }
    return { months: M, invested, maturity, interest: maturity - invested, schedule };
  }

  /** Tax on interest at a slab rate (%), plus 4% cess. */
  const taxOn = (interest, slab) => interest * (slab / 100) * 1.04;

  const api = { tenure, fdValue, fd, payout, rd, taxOn, TDS: { general: 50000, senior: 100000 } };      // yearly interest above which a bank deducts TDS (from 1 April 2025)
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Deposit = api;
})(typeof window !== 'undefined' ? window : globalThis);
