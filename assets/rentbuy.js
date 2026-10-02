/* Rent vs buy maths — pure functions, no DOM. Used by rent-vs-buy-calculator.html and the tests.
   Both paths spend the same cash every month: whoever pays less invests the difference. The renter also invests the down payment and buying costs on day one.
   Net worth at the end: buyer = home value after selling costs − loan left + investments; renter = investments. Optional: tax on gains when everything is sold, and the home-loan tax benefit (old regime). */
(function (root) {
  /** p: { price, dpPct, rate, tenure (yrs), rent (₹ a month), app, inv, rentInc, horizon (yrs), bcost, scost, maint (% of home value a year) (all %),
   *       gainsTax (bool), loanBenefit (bool), slab (% income-tax rate, for the loan benefit and short-hold tax) } */
  function sim(p) {
    const P = p.price, dpAmt = p.dpPct / 100 * P, loan = P - dpAmt, r = p.rate / 1200, n = Math.round(p.tenure * 12), H = Math.round(p.horizon);
    const emi = n <= 0 ? 0 : r === 0 ? loan / n : loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    const buyCost = p.bcost / 100 * P, sell = p.scost / 100, inv = Math.pow(1 + p.inv / 100, 1 / 12) - 1, app = Math.pow(1 + p.app / 100, 1 / 12) - 1, maint = p.maint / 1200, rentInc = p.rentInc / 100;
    const slab = p.slab == null ? 30 : p.slab;
    let rent = p.rent, home = P, bal = loan, pBuy = 0, pRent = dpAmt + buyCost, interest = 0, putBuy = 0, putRent = dpAmt + buyCost, yInt = 0, yPrin = 0, benefit = 0;
    const years = [0], buy = [], rentNW = [], rows = [];
    const potTax = (pot, put) => { if (!p.gainsTax) return 0; const g = pot - put; return g > 125000 ? (g - 125000) * 0.125 * 1.04 : 0; };
    const homeTax = (value, years_) => { if (!p.gainsTax) return 0; const g = value * (1 - sell) - (P + buyCost); return g <= 0 ? 0 : years_ >= 2 ? g * 0.125 * 1.04 : g * (slab / 100) * 1.04; };
    const netBuy = (value, years_) => value * (1 - sell) - homeTax(value, years_) - Math.max(bal, 0) + pBuy - potTax(pBuy, putBuy);
    buy.push(netBuy(home, 0)); rentNW.push(pRent - potTax(pRent, putRent));
    for (let m = 0; m < H * 12; m++) {
      if (m > 0 && m % 12 === 0) rent *= 1 + rentInc;
      let own = home * maint;
      if (m < n) { const i = bal * r, pr = emi - i; interest += i; yInt += i; yPrin += pr; bal -= pr; own += emi; }
      home *= 1 + app; pBuy *= 1 + inv; pRent *= 1 + inv;
      if (own > rent) { pRent += own - rent; putRent += own - rent; } else { pBuy += rent - own; putBuy += rent - own; }
      if ((m + 1) % 12 === 0) {
        if (p.loanBenefit) { const b = (Math.min(yInt, 200000) + Math.min(yPrin, 150000)) * (slab / 100) * 1.04; benefit += b; pBuy += b; putBuy += b; }
        yInt = 0; yPrin = 0; const y = (m + 1) / 12;
        years.push(y); buy.push(netBuy(home, y)); rentNW.push(pRent - potTax(pRent, putRent)); rows.push({ year: y, home, loan: Math.max(bal, 0), rent });
      }
    }
    return { emi, years, buy, rentNW, interest, home, bal: Math.max(bal, 0), pBuy, pRent, H, rent0: p.rent, P, dpAmt, buyCost, benefit, rows, homeTaxAtEnd: homeTax(home, H), rentYield: P > 0 ? p.rent * 12 / P * 100 : 0 };
  }

  /** First year in which buying leaves you with at least as much as renting, or null. */
  function breakEven(s) { for (let i = 1; i < s.years.length; i++) if (s.buy[i] >= s.rentNW[i]) return s.years[i]; return null; }

  /** Yearly home appreciation (%) at which buying and renting end level at the horizon (null if no value in 0–25% does it). */
  function breakEvenAppreciation(p) {
    const d = a => { const s = sim({ ...p, app: a }); return s.buy[s.buy.length - 1] - s.rentNW[s.rentNW.length - 1]; };
    if (d(0) >= 0) return 0; if (d(25) < 0) return null; let lo = 0, hi = 25; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; d(mid) < 0 ? lo = mid : hi = mid; } return (lo + hi) / 2;
  }

  const api = { sim, breakEven, breakEvenAppreciation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RentBuy = api;
})(typeof window !== 'undefined' ? window : globalThis);
