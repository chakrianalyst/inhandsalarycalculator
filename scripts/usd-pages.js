/* Figures for the "US salary in Indian rupees" guide, worked out at build time by the same engines the calculators use:
   US take-home from the move-abroad engine (2026 federal tax, Social Security, Medicare and state or city tax, single filer, no 401(k)),
   rent and living costs from its city presets, and the Indian CTC that leaves the same savings from the Indian tax engine. */
const SALARIES = [80000, 100000, 120000, 150000, 180000, 200000];
const INDIA = { rent: 35000, other: 35000 };                                      // ₹ a month for one person in a metro: the move-abroad calculator's starting figures
const BASE = { basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true };
const inr = n => (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)));
const usd = n => '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n));
const lakh = n => n >= 1e7 ? '₹' + (+(n / 1e7).toFixed(2)) + ' crore' : '₹' + (+(n / 1e5).toFixed(1)) + ' lakh';
const lpa = n => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' crore a year' : '₹' + Math.round(n / 1e5) + ' LPA';

function figures(Tax, Abroad) {
  const C = Abroad.COUNTRIES.US, fx = C.fx, city = id => C.cities.find(c => c.id === id), cities = [city('aus'), city('nyc')];
  const saveIndia = ctc => { const r = Tax.salary({ ...BASE, ctc, rentMonthly: INDIA.rent }); return r[r.best].inHandMonth - INDIA.rent - INDIA.other; };
  const ctcFor = target => { if (target <= saveIndia(0)) return 0; let lo = 0, hi = 1e9; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (saveIndia(m) < target) lo = m; else hi = m; } return hi; };
  const rows = SALARIES.map(g => ({ g, inr: g * fx, by: cities.map(c => { const np = Abroad.netPay('US', g, { state: c.state }), net = np.net / 12, save = net - c.rent - c.other;
    return { city: c, net, rate: np.rate, save, saveInr: save * fx, ctc: save > 0 ? ctcFor(save * fx) : null }; }) }));
  return { fx, cities, rows, at: g => rows.find(r => r.g === g) };
}

function tokens(Tax, Abroad, table) {
  const F = figures(Tax, Abroad), [tx, ny] = F.cities, r120 = F.at(120000), r100 = F.at(100000), T = r120.by[0], N = r120.by[1];
  const t = {};
  t['{{USD_FX}}'] = '₹' + F.fx;
  t['{{USD_TX_RENT}}'] = usd(tx.rent); t['{{USD_TX_OTHER}}'] = usd(tx.other); t['{{USD_NY_RENT}}'] = usd(ny.rent); t['{{USD_NY_OTHER}}'] = usd(ny.other);
  t['{{USD_IN_COSTS}}'] = inr(INDIA.rent + INDIA.other);
  t['{{USD_TABLE}}'] = table(['Salary a year', 'In rupees a year', 'Take-home a month in Texas', 'Take-home a month in New York City'],
    F.rows.map(r => [usd(r.g), lakh(r.inr), `${usd(r.by[0].net)} (${inr(r.by[0].net * F.fx)})`, `${usd(r.by[1].net)} (${inr(r.by[1].net * F.fx)})`]));
  t['{{USD_SAVE_TABLE}}'] = table(['Salary a year', 'Saved a month in Texas', 'Indian CTC that saves as much', 'Saved a month in New York City', 'Indian CTC that saves as much'],
    F.rows.map(r => [usd(r.g), ...r.by.flatMap(b => b.save > 0 ? [inr(b.saveInr), lpa(b.ctc)] : [`${inr(b.saveInr)} (spends more than it earns)`, '—'])]));
  t['{{USD_120_INR}}'] = lakh(r120.inr);
  t['{{USD_120_TX_NET}}'] = inr(T.net * F.fx); t['{{USD_120_TX_NET_USD}}'] = usd(T.net); t['{{USD_120_TX_RATE}}'] = (T.rate * 100).toFixed(1) + '%';
  t['{{USD_120_NY_NET}}'] = inr(N.net * F.fx); t['{{USD_120_NY_RATE}}'] = (N.rate * 100).toFixed(1) + '%';
  t['{{USD_120_TX_SAVE}}'] = inr(T.saveInr); t['{{USD_120_NY_SAVE}}'] = inr(N.saveInr);
  t['{{USD_120_TX_CTC}}'] = lpa(T.ctc); t['{{USD_120_NY_CTC}}'] = lpa(N.ctc);
  t['{{USD_100_INR}}'] = lakh(r100.inr); t['{{USD_100_MONTH}}'] = inr(r100.inr / 12); t['{{USD_100_TX_NET}}'] = inr(r100.by[0].net * F.fx);
  t['{{USD_100_NY_SAVE}}'] = inr(r100.by[1].saveInr); t['{{USD_100_NY_CTC}}'] = lpa(r100.by[1].ctc);
  const neg = F.rows.filter(r => r.by[1].save <= 0).map(r => usd(r.g));
  t['{{USD_NY_NEG}}'] = neg.length ? `At ${neg.join(' and ')}, a single person in New York City spends more than they take home at these costs.` : '';
  return t;
}

module.exports = { SALARIES, INDIA, BASE, figures, tokens };
