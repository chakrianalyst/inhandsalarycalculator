/* Move-abroad comparison — pure functions, no DOM. Used by abroad-calculator.html and the tests.
   Takes yearly gross pay in each country, works out take-home after income tax and payroll contributions, subtracts living costs, and builds up savings in both places.
   The result is net worth in rupees after N years. Tax rules are the 2026 figures for a single person on a salary, with no dependants and no retirement-account deductions.
   They are estimates: foreign tax rules change every year and have many special cases, so users must confirm with a professional. */
(function (root) {
  const TaxIN = typeof Tax !== 'undefined' ? Tax : require('./tax.js');        // browser: global from tax.js; Node: require

  /** Tax on x with progressive bands [[upper limit, rate], ...] (last limit Infinity). */
  function progressive(x, bands) {
    let tax = 0, lo = 0;
    for (const [hi, r] of bands) { if (x > lo) tax += (Math.min(x, hi) - lo) * r; lo = hi; if (x <= hi) break; }
    return tax;
  }
  const INF = Infinity;

  /* ---------------- United States (2026, single filer) ---------------- */
  const US_FED = [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [INF, .37]], US_STD = 16100, US_SS_BASE = 184500;
  const US_STATES = {
    none: { name: 'No state income tax (Texas, Washington, Florida)', tax: () => 0 },
    CA: { name: 'California', tax: g => progressive(Math.max(0, g - 5706), [[11079, .01], [26264, .02], [41452, .04], [57542, .06], [72724, .08], [371479, .093], [445771, .103], [742953, .113], [INF, .123]]) + g * 0.012, note: 'Includes the 1.2% state disability insurance payroll tax (approximate).' },
    NY: { name: 'New York State', tax: g => progressive(Math.max(0, g - 8000), [[8500, .039], [11700, .044], [13900, .0515], [80650, .054], [215400, .059], [1077550, .0685], [5000000, .0965], [25000000, .103], [INF, .109]]) },
    NYC: { name: 'New York City (state + city)', tax: g => US_STATES.NY.tax(g) + progressive(Math.max(0, g - 8000), [[12000, .03078], [25000, .03762], [50000, .03819], [INF, .03876]]) },
    NJ: { name: 'New Jersey', tax: g => progressive(g, [[20000, .014], [35000, .0175], [40000, .035], [75000, .05525], [500000, .0637], [1000000, .0897], [INF, .1075]]) },
    MA: { name: 'Massachusetts (5% flat, approximate)', tax: g => Math.max(0, g - 4400) * 0.05 + Math.max(0, g - 1083150) * 0.04 },
    IL: { name: 'Illinois (4.95% flat, approximate)', tax: g => Math.max(0, g - 2850) * 0.0495 },
  };
  function usTax(gross, opt) {
    const fed = progressive(Math.max(0, gross - US_STD), US_FED), ss = Math.min(gross, US_SS_BASE) * 0.062, med = gross * 0.0145 + Math.max(0, gross - 200000) * 0.009, st = (US_STATES[opt.state] || US_STATES.none).tax(gross);
    const items = [['Federal income tax', fed], ['Social Security', ss], ['Medicare', med]]; if (st > 0) items.push([(US_STATES[opt.state] || {}).name + ' tax', st]);
    return pack(gross, items);
  }

  /* ---------------- Canada (2026) ---------------- */
  const CA_FED = [[58523, .14], [117045, .205], [181440, .26], [258482, .29], [INF, .33]];
  const CA_PROV = {
    ON: { name: 'Ontario', bands: [[53891, .0505], [107785, .0915], [150000, .1116], [220000, .1216], [INF, .1316]], bpa: 12989, low: .0505 },
    BC: { name: 'British Columbia', bands: [[50363, .056], [100728, .077], [115648, .105], [140430, .1229], [190405, .147], [265545, .168], [INF, .205]], bpa: 13216, low: .056 },
    AB: { name: 'Alberta', bands: [[61200, .08], [154259, .10], [185111, .12], [246813, .13], [370220, .14], [INF, .15]], bpa: 22769, low: .08 },
  };
  function caTax(gross, opt) {
    const P = CA_PROV[opt.province] || CA_PROV.ON;
    const cpp1 = 0.0595 * Math.max(0, Math.min(gross, 74600) - 3500), cpp2 = 0.04 * Math.max(0, Math.min(gross, 85000) - 74600), ei = 0.0163 * Math.min(gross, 68900);
    const cppBase = cpp1 * (4.95 / 5.95), cppEnh = cpp1 - cppBase + cpp2, taxable = Math.max(0, gross - cppEnh);                 // the enhanced CPP part is a deduction; the base part and EI earn credits
    const bpaFed = gross <= 181440 ? 16452 : gross >= 258482 ? 14829 : 16452 - (16452 - 14829) * (gross - 181440) / (258482 - 181440);
    const fed = Math.max(0, progressive(taxable, CA_FED) - 0.14 * (bpaFed + cppBase + ei));
    let prov = Math.max(0, progressive(taxable, P.bands) - P.low * (P.bpa + cppBase + ei));
    let extra = 0;
    if (opt.province === 'ON') { const s = 0.2 * Math.max(0, prov - 5818) + 0.36 * Math.max(0, prov - 7446); prov += s; extra = taxable >= 200600 ? 900 : taxable >= 72600 ? 750 : taxable >= 48600 ? 600 : taxable >= 38500 ? 450 : taxable >= 25000 ? 300 : 0; }
    const items = [['Federal income tax', fed], [P.name + ' income tax', prov + extra], ['CPP / CPP2', cpp1 + cpp2], ['Employment Insurance', ei]];
    return pack(gross, items);
  }

  /* ---------------- Australia (resident, 2026-27) ---------------- */
  function auTax(gross) {
    const inc = progressive(gross, [[18200, 0], [45000, .15], [135000, .30], [190000, .37], [INF, .45]]), medi = gross > 35014 ? gross * 0.02 : gross > 28011 ? (gross - 28011) * 0.1 : 0;
    return pack(gross, [['Income tax', inc], ['Medicare levy', medi]]);
  }

  /* ---------------- Singapore (resident, YA 2026) ---------------- */
  function sgTax(gross) {
    return pack(gross, [['Income tax', progressive(gross, [[20000, 0], [30000, .02], [40000, .035], [80000, .07], [120000, .115], [160000, .15], [200000, .18], [240000, .19], [280000, .195], [320000, .20], [500000, .22], [1000000, .23], [INF, .24]])]]);
  }

  /* ---------------- UAE and other Gulf states ---------------- */
  const aeTax = gross => pack(gross, []);

  function pack(gross, items) {
    const list = items.filter(x => x[1] > 0.5).map(([label, amt]) => ({ label, amt })), total = list.reduce((s, x) => s + x.amt, 0);
    return { gross, tax: total, net: gross - total, items: list, rate: gross > 0 ? total / gross : 0 };
  }

  /** The destinations. rent / other are typical monthly figures in local currency for one person in a 1-bedroom home, as starting estimates the user should replace. */
  const COUNTRIES = {
    US: { name: 'United States', cur: 'USD', sym: '$', fx: 96, infl: 3, tax: usTax, regions: 'state', cities: [
      { id: 'nyc', name: 'New York City', state: 'NYC', rent: 3800, other: 1900 }, { id: 'sf', name: 'San Francisco Bay Area', state: 'CA', rent: 3400, other: 1900 },
      { id: 'sea', name: 'Seattle', state: 'none', rent: 2500, other: 1700 }, { id: 'aus', name: 'Austin or Dallas (Texas)', state: 'none', rent: 1800, other: 1500 },
      { id: 'chi', name: 'Chicago', state: 'IL', rent: 2100, other: 1600 }, { id: 'bos', name: 'Boston', state: 'MA', rent: 3000, other: 1800 }, { id: 'nj', name: 'New Jersey (Jersey City)', state: 'NJ', rent: 2900, other: 1800 }] },
    CA: { name: 'Canada', cur: 'CAD', sym: 'C$', fx: 68.5, infl: 2.5, tax: caTax, cities: [
      { id: 'tor', name: 'Toronto', province: 'ON', rent: 2500, other: 1500 }, { id: 'van', name: 'Vancouver', province: 'BC', rent: 2700, other: 1500 }, { id: 'cal', name: 'Calgary', province: 'AB', rent: 1800, other: 1400 }] },
    AU: { name: 'Australia', cur: 'AUD', sym: 'A$', fx: 63, infl: 3, tax: auTax, cities: [{ id: 'syd', name: 'Sydney', rent: 2800, other: 1700 }, { id: 'mel', name: 'Melbourne', rent: 2300, other: 1600 }] },
    SG: { name: 'Singapore', cur: 'SGD', sym: 'S$', fx: 75, infl: 2.5, tax: sgTax, cities: [{ id: 'sin', name: 'Singapore', rent: 3800, other: 1600 }] },
    AE: { name: 'UAE (Dubai, Abu Dhabi)', cur: 'AED', sym: 'AED ', fx: 26.1, infl: 2.5, tax: aeTax, cities: [{ id: 'dxb', name: 'Dubai', rent: 7000, other: 4500 }, { id: 'auh', name: 'Abu Dhabi', rent: 6000, other: 4000 }] },
  };

  /** Take-home pay in the destination for a gross salary. Thresholds are held constant in real terms: when prices (idx) have risen, they rise with them. */
  function netPay(country, gross, opt, idx) {
    const k = idx || 1, r = COUNTRIES[country].tax(gross / k, opt || {});
    return { ...r, gross, tax: r.tax * k, net: gross - r.tax * k, items: r.items.map(x => ({ label: x.label, amt: x.amt * k })) };
  }

  /** p: { years,
   *       india:  { ctc, rent, other (₹ a month), growth, infl, ret (% a year), regime? },
   *       abroad: { country, opt ({state}|{province}), gross (local currency a year), rent, other (local a month), growth, infl, ret, fx (₹ per unit), dep (% a year the rupee weakens), trips (₹ a year), oneTime (₹ at the start) },
   *       parents (₹ a month, sent in both cases, rising with Indian inflation) } */
  function compare(p) {
    const I = p.india, A = p.abroad, H = Math.round(p.years), out = [];
    const base = { basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, ptState: I.ptState || 'KA', metro: true, rentMonthly: I.rent };
    let nwI = 0, nwA = 0;
    for (let t = 0; t < H; t++) {
      const ki = Math.pow(1 + I.infl / 100, t), ka = Math.pow(1 + A.infl / 100, t), fx0 = A.fx * Math.pow(1 + A.dep / 100, t), fx1 = A.fx * Math.pow(1 + A.dep / 100, t + 1);
      const ctc = I.ctc * Math.pow(1 + I.growth / 100, t), r = TaxIN.salary({ ...base, ctc, rentMonthly: I.rent * ki }), inHand = r[r.best].inHandYear;
      const spendI = (I.rent + I.other) * 12 * ki, parents = p.parents * 12 * ki, saveI = inHand - spendI - parents;
      nwI = nwI * (1 + I.ret / 100) + saveI * (1 + I.ret / 200);
      const gross = A.gross * Math.pow(1 + A.growth / 100, t), np = netPay(A.country, gross, A.opt, ka), spendA = (A.rent + A.other) * 12 * ka;
      const rupeeCosts = parents + (A.trips || 0) * ki + (t === 0 ? (A.oneTime || 0) : 0);
      const saveA = np.net - spendA - rupeeCosts / fx0;
      nwA = nwA * (1 + A.ret / 100) + saveA * (1 + A.ret / 200);
      const deflate = ki * (1 + I.infl / 100);
      out.push({ year: t + 1, indiaInHand: inHand, indiaSpend: spendI + parents, indiaSave: saveI, indiaNW: nwI, abroadNet: np.net * fx0, abroadSpend: spendA * fx0 + rupeeCosts, abroadSave: saveA * fx0, abroadSaveLocal: saveA, abroadNW: nwA * fx1, abroadNWLocal: nwA, fx: fx1, tax: np, indiaNWReal: nwI / deflate, abroadNWReal: nwA * fx1 / deflate, grossLocal: gross });
    }
    const last = out[out.length - 1] || { indiaNW: 0, abroadNW: 0 };
    let breakEven = null; for (const y of out) if (y.abroadNW >= y.indiaNW) { breakEven = y.year; break; }
    return { rows: out, years: H, diff: last.abroadNW - last.indiaNW, breakEven, indiaNW: last.indiaNW, abroadNW: last.abroadNW, indiaNWReal: last.indiaNWReal, abroadNWReal: last.abroadNWReal };
  }

  /** The yearly gross pay abroad (local currency) at which both paths end level after p.years, or null if it takes more than 10× the given pay. */
  function breakEvenSalary(p) {
    const d = g => compare({ ...p, abroad: { ...p.abroad, gross: g } }).diff;
    let lo = 0, hi = p.abroad.gross * 10 || 1e6; if (d(hi) < 0) return null; if (d(lo) >= 0) return 0;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; d(mid) < 0 ? lo = mid : hi = mid; } return (lo + hi) / 2;
  }

  const api = { progressive, COUNTRIES, US_STATES, CA_PROV, netPay, compare, breakEvenSalary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Abroad = api;
})(typeof window !== 'undefined' ? window : globalThis);
