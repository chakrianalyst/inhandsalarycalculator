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
    const ded = opt.ded || 0, fed = progressive(Math.max(0, gross - ded - US_STD), US_FED), ss = Math.min(gross, US_SS_BASE) * 0.062, med = gross * 0.0145 + Math.max(0, gross - 200000) * 0.009, st = (US_STATES[opt.state] || US_STATES.none).tax(gross - ded);
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
    const cppBase = cpp1 * (4.95 / 5.95), cppEnh = cpp1 - cppBase + cpp2, taxable = Math.max(0, gross - cppEnh - (opt.ded || 0));                 // the enhanced CPP part is a deduction; the base part and EI earn credits
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

  /* ---------------- United Kingdom (England, 2026/27) ---------------- */
  function ukTax(gross, opt) {
    const g = gross - (opt.ded || 0), pa = Math.max(0, 12570 - Math.max(0, (gross - 100000) / 2)), taxable = Math.max(0, g - pa);       // the personal allowance shrinks £1 for every £2 over £100k
    const inc = progressive(taxable, [[37700, .20], [125140, .40], [INF, .45]]), ni = 0.08 * Math.max(0, Math.min(gross, 50270) - 12570) + 0.02 * Math.max(0, gross - 50270);
    return pack(gross, [['Income tax', inc], ['National Insurance', ni]]);
  }

  /* ---------------- Germany (2026, tax class 1, no children, no church tax) ---------------- */
  function deTariff(z) {                                    // income tax on taxable income z (§32a EStG, 2026)
    z = Math.floor(Math.max(0, z));
    if (z <= 12348) return 0;
    if (z <= 17799) { const y = (z - 12348) / 10000; return Math.floor((914.51 * y + 1400) * y); }
    if (z <= 69878) { const x = (z - 17799) / 10000; return Math.floor((173.10 * x + 2397) * x + 1034.87); }
    if (z <= 277825) return Math.floor(0.42 * z - 11135.63);
    return Math.floor(0.45 * z - 19470.38);
  }
  function deTax(gross) {
    const pension = 0.093 * Math.min(gross, 101400), unemp = 0.013 * Math.min(gross, 101400), health = 0.0875 * Math.min(gross, 69750), care = 0.024 * Math.min(gross, 69750);
    const zve = gross - 1230 - 36 - pension - health - care, inc = deTariff(zve), soli = inc <= 20350 ? 0 : Math.min(0.055 * inc, 0.119 * (inc - 20350));
    return pack(gross, [['Income tax', inc], ['Solidarity surcharge', soli], ['Pension insurance', pension], ['Health insurance', health], ['Long-term care insurance', care], ['Unemployment insurance', unemp]]);
  }

  /* ---------------- UAE and other Gulf states ---------------- */
  const aeTax = gross => pack(gross, []);

  function pack(gross, items) {
    const list = items.filter(x => x[1] > 0.5).map(([label, amt]) => ({ label, amt })), total = list.reduce((s, x) => s + x.amt, 0);
    return { gross, tax: total, net: gross - total, items: list, rate: gross > 0 ? total / gross : 0 };
  }

  /** The destinations. rent / other are typical monthly figures in local currency for one person in a 1-bedroom home, as starting estimates the user should replace. */
  const COUNTRIES = {
    US: { name: 'United States', cur: 'USD', sym: '$', fx: 96, infl: 3, tax: usTax, retire: { name: '401(k)', emp: 6, match: 4, cap: 24500, deductible: true, note: 'Employee contributions are pre-tax up to $24,500.' }, cities: [
      { id: 'nyc', name: 'New York City', state: 'NYC', rent: 3800, other: 1900 }, { id: 'sf', name: 'San Francisco Bay Area', state: 'CA', rent: 3400, other: 1900 },
      { id: 'sea', name: 'Seattle', state: 'none', rent: 2500, other: 1700 }, { id: 'aus', name: 'Austin or Dallas (Texas)', state: 'none', rent: 1800, other: 1500 },
      { id: 'chi', name: 'Chicago', state: 'IL', rent: 2100, other: 1600 }, { id: 'bos', name: 'Boston', state: 'MA', rent: 3000, other: 1800 }, { id: 'nj', name: 'New Jersey (Jersey City)', state: 'NJ', rent: 2900, other: 1800 }] },
    CA: { name: 'Canada', cur: 'CAD', sym: 'C$', fx: 68.5, infl: 2.5, tax: caTax, retire: { name: 'RRSP', emp: 5, match: 4, cap: 33810, capPct: 18, deductible: true, note: 'Contributions are tax-deductible up to 18% of pay and C$33,810.' }, cities: [
      { id: 'tor', name: 'Toronto', province: 'ON', rent: 2500, other: 1500 }, { id: 'van', name: 'Vancouver', province: 'BC', rent: 2700, other: 1500 }, { id: 'cal', name: 'Calgary', province: 'AB', rent: 1800, other: 1400 }] },
    AU: { name: 'Australia', cur: 'AUD', sym: 'A$', fx: 63, infl: 3, tax: auTax, retire: { name: 'superannuation', emp: 0, match: 12, matchTax: 15, note: 'Employers add 12% on top of salary, taxed at 15% inside the fund. It is locked until about 60.' }, cities: [{ id: 'syd', name: 'Sydney', rent: 2800, other: 1700 }, { id: 'mel', name: 'Melbourne', rent: 2300, other: 1600 }] },
    SG: { name: 'Singapore', cur: 'SGD', sym: 'S$', fx: 75, infl: 2.5, tax: sgTax, retire: { name: 'CPF', emp: 0, match: 0, note: 'Work-pass holders do not pay into the CPF, so nothing is added here. Citizens and PRs do.' }, cities: [{ id: 'sin', name: 'Singapore', rent: 3800, other: 1600 }] },
    AE: { name: 'UAE (Dubai, Abu Dhabi)', cur: 'AED', sym: 'AED ', fx: 26.1, infl: 2.5, tax: aeTax, retire: { name: 'savings plan', emp: 0, match: 0, note: 'Expats get an end-of-service gratuity instead of a pension; it is not counted here.' }, cities: [{ id: 'dxb', name: 'Dubai', rent: 7000, other: 4500 }, { id: 'auh', name: 'Abu Dhabi', rent: 6000, other: 4000 }] },
    UK: { name: 'United Kingdom (England)', cur: 'GBP', sym: '£', fx: 127.3, infl: 3, tax: ukTax, retire: { name: 'workplace pension', emp: 5, match: 3, deductible: true, note: 'Employee pension contributions get tax relief. The legal minimum is 8% in total.' }, cities: [
      { id: 'lon', name: 'London', rent: 2300, other: 1500 }, { id: 'man', name: 'Manchester', rent: 1300, other: 1300 }] },
    DE: { name: 'Germany', cur: 'EUR', sym: '€', fx: 108.7, infl: 2.5, tax: deTax, retire: { name: 'private pension', emp: 0, match: 0, note: 'The state pension you pay into is not an asset you can draw on, so it is not counted.' }, cities: [
      { id: 'ber', name: 'Berlin', rent: 1300, other: 1300 }, { id: 'muc', name: 'Munich', rent: 1800, other: 1400 }, { id: 'fra', name: 'Frankfurt', rent: 1500, other: 1400 }] },
  };

  /** Take-home pay in the destination for a gross salary. Thresholds are held constant in real terms: when prices (idx) have risen, they rise with them. */
  function netPay(country, gross, opt, idx) {
    const k = idx || 1, o = opt || {}, c = COUNTRIES[country], g = gross / k, R = c.retire || {};
    const cap = Math.min(R.cap || Infinity, R.capPct ? g * R.capPct / 100 : Infinity), contrib = Math.min(g * (o.retPct || 0) / 100, cap);
    const employer = g * (o.matchPct || 0) / 100 * (1 - (R.matchTax || 0) / 100);
    const r = c.tax(g, { ...o, ded: R.deductible ? contrib : 0 });
    return { ...r, gross, tax: r.tax * k, net: (g - r.tax - contrib) * k, contrib: contrib * k, employer: employer * k, items: r.items.map(x => ({ label: x.label, amt: x.amt * k })) };
  }

  /** p: { years,
   *       india:  { ctc, rent, other (₹ a month), growth, infl, ret (% a year), epf (count PF as savings) },
   *       abroad: { country, opt ({state}|{province}, retPct, matchPct), gross (local currency a year), rent, other (local a month), growth, infl, ret, fx (₹ per unit), dep (% a year the rupee weakens), trips (₹ a year), oneTime (₹ at the start) },
   *       partner: { on, indiaCtc (₹), abroadGross (local currency) } (optional),
   *       parents (₹ a month, sent in both cases, rising with Indian inflation) } */
  const EPF_RATE = 8.25;
  function compare(p) {
    const I = p.india, A = p.abroad, H = Math.round(p.years), out = [], pt = p.partner && p.partner.on ? p.partner : null;
    const base = { basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true };
    let nwI = 0, nwA = 0, retI = 0, retA = 0;
    for (let t = 0; t < H; t++) {
      const ki = Math.pow(1 + I.infl / 100, t), ka = Math.pow(1 + A.infl / 100, t), fx0 = A.fx * Math.pow(1 + A.dep / 100, t), fx1 = A.fx * Math.pow(1 + A.dep / 100, t + 1);
      const gi = Math.pow(1 + I.growth / 100, t), ga = Math.pow(1 + A.growth / 100, t);
      const r = TaxIN.salary({ ...base, ctc: I.ctc * gi, rentMonthly: I.rent * ki }), b1 = r[r.best]; let inHand = b1.inHandYear, pf = r.employeePf + r.employerPf;
      if (pt && pt.indiaCtc > 0) { const q = TaxIN.salary({ ...base, ctc: pt.indiaCtc * gi, rentMonthly: 0 }); inHand += q[q.best].inHandYear; pf += q.employeePf + q.employerPf; }
      const spendI = (I.rent + I.other) * 12 * ki, parents = p.parents * 12 * ki, saveI = inHand - spendI - parents;
      nwI = nwI * (1 + I.ret / 100) + saveI * (1 + I.ret / 200);
      if (I.epf) retI = retI * (1 + EPF_RATE / 100) + pf * (1 + EPF_RATE / 200);
      const gross = A.gross * ga, np = netPay(A.country, gross, A.opt, ka); let net = np.net, contrib = np.contrib + np.employer;
      if (pt && pt.abroadGross > 0) { const q = netPay(A.country, pt.abroadGross * ga, A.opt, ka); net += q.net; contrib += q.contrib + q.employer; }
      const spendA = (A.rent + A.other) * 12 * ka, rupeeCosts = parents + (A.trips || 0) * ki + (t === 0 ? (A.oneTime || 0) : 0);
      const saveA = net - spendA - rupeeCosts / fx0;
      nwA = nwA * (1 + A.ret / 100) + saveA * (1 + A.ret / 200); retA = retA * (1 + A.ret / 100) + contrib * (1 + A.ret / 200);
      const deflate = ki * (1 + I.infl / 100), indiaNW = nwI + retI, abroadNW = (nwA + retA) * fx1;
      out.push({ year: t + 1, indiaInHand: inHand, indiaSpend: spendI + parents, indiaSave: saveI, indiaRetire: retI, indiaNW, abroadNet: net * fx0, abroadSpend: spendA * fx0 + rupeeCosts, abroadSave: saveA * fx0, abroadSaveLocal: saveA, abroadRetire: retA * fx1, abroadNW, abroadNWLocal: nwA + retA, fx: fx1, tax: np, indiaNWReal: indiaNW / deflate, abroadNWReal: abroadNW / deflate, grossLocal: gross });
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

  const api = { progressive, COUNTRIES, US_STATES, CA_PROV, netPay, compare, breakEvenSalary, deTariff, EPF_RATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Abroad = api;
})(typeof window !== 'undefined' ? window : globalThis);
