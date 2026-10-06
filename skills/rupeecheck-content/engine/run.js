#!/usr/bin/env node
/* RupeeCheck calculator runner. Runs the SAME tested calculation modules the live site uses, with the SAME defaults as the pages.
   Usage:  node run.js <tool> '<json of inputs>'      e.g.  node run.js salary '{"ctc":1500000}'
           node run.js list                            all tools and their inputs
           node run.js defaults <tool>                 the page defaults for a tool
   Output: JSON on stdout: { tool, inputs, results, assumptions, engine }. Every value in "results" is a raw number (rupees unless a unit says otherwise). */
'use strict';
const path = require('path');
const load = n => require(path.join(__dirname, n));
const Tax = load('tax.js'), Invest = load('invest.js'), Loan = load('loan.js'), Deposit = load('deposit.js'), HRA = load('hra.js'), Gratuity = load('gratuity.js'),
  Fire = load('fire.js'), RentBuy = load('rentbuy.js'), Abroad = load('abroad.js'), Returning = load('returning.js'), SWP = load('swp.js'), DEF = load('page-defaults.json'), META = load('ENGINE.json');

const n = v => { const x = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const bool = v => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';
const merge = (page, over) => { const d = { ...(DEF[page] || {}) }; for (const k of Object.keys(over || {})) d[k] = over[k]; return d; };
const round = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

const DED_KEYS = { other80c: '80C investments', nps1b: 'NPS 80CCD(1B)', d80: '80D health insurance', d80Self: '80D (self)', d80Parents: '80D (parents)', homeLoanInt: 'home-loan interest', eduLoanInt: 'education-loan interest', donations: 'donations', disability: 'disability', ltaClaim: 'LTA', otherDed: 'other deductions' };
const deductionsText = p => { const used = Object.keys(DED_KEYS).filter(k => n(p[k]) > 0).map(k => DED_KEYS[k] + ' ₹' + n(p[k])); const base = 'The old regime always includes the ₹50,000 standard deduction, professional tax, your own PF counted under 80C (cap ₹1.5 L) and any HRA exemption from the rent given'; return used.length ? base + '; extra deductions claimed: ' + used.join(', ') : base + '; no other deductions'; };

/* ---------- salary: Tax.salary exactly as the "₹X LPA" pages and the in-hand salary page build it ---------- */
function salary(o) {
  const p = { ctc: 1200000, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0, ...o };
  p.ctc = n(p.ctc); const r = Tax.salary(p), b = r[r.best];
  return { inputs: p, results: {
    regimeUsed: r.best, inHandMonth: b.inHandMonth, inHandYear: b.inHandYear, incomeTax: b.tax, inHandPctOfCtc: b.inHandYear / p.ctc * 100,
    inHandMonthNewRegime: r.new.inHandMonth, inHandMonthOldRegime: r.old.inHandMonth, taxNewRegime: r.new.tax, taxOldRegime: r.old.tax,
    employeePfYear: r.employeePf, employerPfYear: r.employerPf, gratuityYear: r.gratuity, professionalTaxYear: r.pt, grossCashSalaryYear: r.gross,
    ctcMinusInHandYear: p.ctc - b.inHandYear },
    assumptions: ['Basic ' + p.basicPct + '% of CTC, HRA ' + p.hraPct + '% of basic' + (n(p.variablePct) > 0 ? ', variable pay ' + p.variablePct + '% of CTC' : ', no bonus'), 'PF 12% of ' + (p.pfCap ? 'a capped ₹15,000 basic' : 'the full basic'), 'Gratuity inside CTC', 'Professional tax ₹' + p.ptMonthly + ' a month',
      'Rent ₹' + n(p.rentMonthly) + ' a month in a ' + (p.metro ? 'metro' : 'non-metro') + ' city (matters only for the old regime)', deductionsText(p),
      'Better of old and new regime is used for the main figure; both are listed', 'Tax Year 2026-27 rules'] };
}

/* ---------- regime: the deduction level at which the old regime stops costing more (same logic as the site's guide table) ---------- */
function breakevenDeductions(gross) {
  const newTax = Tax.computeTax(Math.max(0, gross - 75000), 'new').total;
  if (Tax.computeTax(Math.max(0, gross - 50000), 'old').total <= newTax) return 0;
  let lo = 0, hi = gross;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; Tax.computeTax(Math.max(0, gross - 50000 - mid), 'old').total > newTax ? lo = mid : hi = mid; }
  return hi;
}
function regime(o) {
  const g = n(o.gross || 1500000), ded = o.deductions === undefined ? null : n(o.deductions);
  const newTax = Tax.computeTax(Math.max(0, g - 75000), 'new').total, oldNoDed = Tax.computeTax(Math.max(0, g - 50000), 'old').total;
  const res = { newRegimeTax: newTax, oldRegimeTaxNoDeductions: oldNoDed, oldRegimeBreakEvenDeductions: breakevenDeductions(g), taxFreeUpToGrossSalary: 1275000 };
  if (ded !== null) { res.oldRegimeTaxWithDeductions = Tax.computeTax(Math.max(0, g - 50000 - ded), 'old').total; res.cheaperRegime = res.oldRegimeTaxWithDeductions < newTax ? 'old' : 'new'; }
  return { inputs: { gross: g, deductions: ded }, results: res, assumptions: ['Gross salary for a salaried person, standard deduction ₹75,000 (new) or ₹50,000 (old)', 'Deductions are on top of the standard deduction (HRA exemption, 80C, 80D, NPS, home-loan interest)', 'Tax before 4% cess is included in the totals above', 'Tax Year 2026-27'] };
}

/* ---------- swp: mirrors swp-calculator.html ---------- */
function swp(o) {
  const d = merge('swp-calculator', o), infl = n(d.infl);
  const p = { corpus: n(d.corpus), withdraw: n(d.wd), step: n(d.step), ret: n(d.ret), years: Math.max(1, Math.round(n(d.yrs)) || 1), gainPct: n(d.gainPct), taxk: d.taxk, slab: n(d.slab), nominal: d.conv === 'nom' };
  const R = SWP.run(p), y1 = R.years[0] || { withdrawn: 0, gain: 0, tax: 0 };
  return { inputs: d, results: { lastsAllYears: R.lasts, monthsPaidInFull: R.fullMonths, leftAtEnd: R.end, leftAtEndInTodaysMoney: R.end / Math.pow(1 + infl / 100, p.years),
      maxMonthlyWithdrawalThatLasts: SWP.maxWithdraw(p), monthlyWithdrawalThatKeepsCorpus: SWP.maxWithdraw(p, p.corpus), totalWithdrawn: R.totalWithdrawn, totalTax: R.totalTax,
      year1Withdrawn: y1.withdrawn, year1Profit: y1.gain, year1Tax: y1.tax, table: R.years.map(y => ({ year: y.year, monthly: y.monthly, withdrawn: y.withdrawn, tax: y.tax, leftAtEnd: y.balance })) },
    assumptions: ['Return ' + p.ret + '% a year, applied as ' + (p.nominal ? 'return ÷ 12 each month' : 'an effective yearly rate') + '; each month the money grows, then the withdrawal is paid', 'Withdrawal rises ' + p.step + '% every 12 months',
      p.taxk === 'equity' ? 'Equity fund: 20% on profit from units held up to a year, 12.5% on long-term profit above ₹1.25 lakh a year, plus 4% cess; only the profit part of each withdrawal is taxed (average cost); each 12 months is one tax year' : p.taxk === 'slab' ? 'Debt fund: profit taxed at ' + p.slab + '% plus 4% cess' : 'Tax not included',
      p.gainPct > 0 ? p.gainPct + '% of the money is already profit (held over a year)' : 'The money is invested today', 'Returns are not guaranteed; a steady return is assumed'] };
}

/* ---------- sip: mirrors sip-calculator.html ---------- */
function sip(o) {
  const d = merge('sip-calculator', o), mode = d.mode, goal = mode === 'goal', lumpMode = mode === 'lump';
  const ret = n(d.ret), months = Math.floor(n(d.yrs)) * 12 + Math.floor(n(d.mon)), step = lumpMode ? 0 : n(d.step), lump = n(d.lump), infl = n(d.infl), taxk = d.taxk, slab = n(d.slab), nominal = d.conv === 'nom';
  const fut = Math.pow(1 + infl / 100, months / 12), goalToday = goal && d.goalIn === 'today', entered = n(d.goal), target = goalToday ? entered * fut : entered;
  let s = n(d.sip); if (goal) s = Invest.requiredSip({ target, ret, months, step, lump, nominal });
  const R = Invest.run({ sip: lumpMode ? 0 : s, step, lump, ret, months, nominal }), tax = Invest.tax(R.gain, taxk, months, slab), net = R.value - tax;
  const res = { monthlySip: lumpMode ? 0 : s, futureValue: R.value, totalInvested: R.invested, wealthGained: R.gain, taxIfSoldAtEnd: tax, valueAfterTax: net, valueAfterTaxInTodaysMoney: net / Math.pow(1 + infl / 100, months / 12), lastYearMonthlySip: R.lastSip, months };
  if (goal) { res.goalFutureAmount = target; res.goalAsEnteredInTodaysPrices = goalToday ? entered : entered / fut; }
  return { inputs: d, results: res, assumptions: ['Return ' + ret + '% a year, applied as ' + (nominal ? 'return ÷ 12 each month' : 'an effective yearly rate'), 'Inflation ' + infl + '% a year', 'Step-up ' + step + '% a year', 'Returns are not guaranteed'] };
}

/* ---------- emi: mirrors emi-calculator.html (EMI mode and "how much can I borrow") ---------- */
function emi(o) {
  const d = merge('emi-calculator', o), rate = n(d.rate), nm = Math.floor(n(d.yrs)) * 12 + Math.floor(n(d.mon));
  if (d.mode === 'afford') { const maxEmi = Math.max(0, n(d.inc) * n(d.foir) / 100 - n(d.old)); const loan = Loan.affordable(maxEmi, rate, nm); return { inputs: d, results: { maxEmi, loanYouCanAfford: loan, totalRepaid: maxEmi * nm }, assumptions: ['EMI limited to ' + d.foir + '% of income, less existing EMIs'] }; }
  const P = n(d.amt), extra = n(d.extra), lumps = n(d.lump) > 0 ? [{ month: Math.max(1, n(d.lumpM)), amount: n(d.lump) }] : [];
  const base = Loan.schedule({ P, rate, n: nm }), S = (extra > 0 || lumps.length) ? Loan.schedule({ P, rate, n: nm, extra, lumps }) : base, y1 = base.years[0];
  return { inputs: d, results: { emi: base.emi, totalInterest: base.interest, totalRepaid: base.paid, interestAsPctOfLoan: base.interest / P * 100, firstEmiInterestSharePct: base.rows[0].interest / base.emi * 100,
    year1Interest: y1.interest, year1Principal: y1.principal, months: base.months,
    withPrepayment: { months: S.months, yearsToRepay: S.months / 12, totalInterest: S.interest, interestSaved: base.interest - S.interest, yearsSaved: (base.months - S.months) / 12 } },
    assumptions: ['Fixed rate ' + rate + '% a year, monthly reducing-balance EMI', 'Excludes processing fees and insurance', extra > 0 ? 'Prepayment of ₹' + extra + ' extra every month' : 'No prepayment'] };
}

/* ---------- fd / rd ---------- */
function fd(o) {
  const d = merge('fd-calculator', o), sal = n(d.sal), ct = x => Tax.computeTax(x, 'new').total;
  const taxNote = 'Tax: each year\'s interest is added to a yearly salary or pension of ₹' + sal + ' (₹75,000 standard deduction) and taxed under the new regime, with the ₹12 lakh rebate, surcharge and 4% cess';
  if (d.mode === 'rd') { const months = Math.floor(n(d.yrs)) * 12 + Math.floor(n(d.mon)), r = Deposit.rd({ D: n(d.d), rate: n(d.rate), months }), tx = Deposit.interestTax(r.schedule.map(s => s.interest), sal, ct);
    return { inputs: d, results: { monthlyDeposit: n(d.d), invested: r.invested, maturity: r.maturity, interest: r.interest, interestByYear: r.schedule.map(s => s.interest), taxByYear: tx.years, taxOnInterest: tx.total, taxAsPctOfInterest: tx.rate * 100, keepAfterTax: r.maturity - tx.total }, assumptions: ['Rate ' + d.rate + '%, quarterly compounding on each instalment', taxNote] }; }
  const r = Deposit.fd({ P: n(d.p), rate: n(d.rate), n: n(d.cmp), years: n(d.yrs), months: n(d.mon), days: n(d.day) }), tds = bool(d.senior) ? Deposit.TDS.senior : Deposit.TDS.general;
  const tenure = Deposit.tenure(n(d.yrs), n(d.mon), n(d.day)), perYear = tenure > 0 ? r.interest / tenure : 0, tx = Deposit.interestTax(r.schedule.map(s => s.interest), sal, ct);
  return { inputs: d, results: { principal: n(d.p), maturity: r.maturity, interest: r.interest, effectiveYield: r.aer * 100, interestByYear: r.schedule.map(s => s.interest), taxByYear: tx.years, taxOnInterest: tx.total, taxAsPctOfInterest: tx.rate * 100, keepAfterTax: r.maturity - tx.total, interestPerYear: perYear, bankTdsLimitPerYear: tds, tdsApplies: perYear > tds }, assumptions: ['Rate ' + d.rate + '% compounded ' + d.cmp + ' times a year', taxNote, 'TDS limit ₹' + tds + ' of yearly interest per bank'] };
}

/* ---------- gratuity / hra ---------- */
function gratuity(o) { const d = merge('gratuity-calculator', o), r = Gratuity.calc({ wage: n(d.wage), kind: d.kind, years: n(d.yrs), months: n(d.mon), fixedTerm: bool(d.fixed), totalPay: n(d.total) || undefined }); return { inputs: d, results: r, assumptions: ['Formula: wage × 15 ÷ 26 × completed years (covered employees)', 'New labour-code rules as built into the site. Confirm with a labour-law professional', 'Tax-free limit ₹20 lakh'] }; }
function hra(o) {
  const d = merge('hra-calculator', { metro: true, ...o }), metro = bool(d.metro), r = HRA.calc({ basicM: n(d.basic), hraM: n(d.hra), rentM: n(d.rent), months: n(d.months), pctOfBasic: metro ? 0.5 : 0.4, slab: n(d.slab) });
  return { inputs: d, results: r, assumptions: ['Old regime only', 'Exempt HRA = least of HRA received, rent − 10% of basic, and ' + (metro ? '50%' : '40%') + ' of basic', 'Metro = Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad (Income-tax Rules 2026, Rule 279)'] };
}

/* ---------- fire: mirrors fire-calculator.html ---------- */
function fire(o) {
  const d = merge('fire-calculator', o), age = Math.round(n(d.age)), ra = Math.max(age + 1, Math.round(n(d.retAge))), life = Math.max(ra + 1, Math.round(n(d.life))), ratio = n(d.ratio) / 100;
  const P = { age, life, exp0: n(d.exp) * 12 * ratio, pension: n(d.pension) * 12, infl: n(d.infl), swr: n(d.swr) || 3.5, post: n(d.postRet) }, Q = { sav: n(d.sav), step: n(d.step), pre: n(d.ret), corp0: n(d.corp) };
  const T = Fire.target(P, ra), proj = Fire.accumulate(Q.sav, ra - age, Q.corp0, Q.step, Q.pre);
  return { inputs: d, results: { retireAge: ra, corpusNeeded: T, projectedCorpus: proj, onTrack: proj >= T, shortfallOrSurplus: proj - T, earliestAgeYouCouldRetire: Fire.earliest(P, Q, Math.max(80, life - 1)), monthlySavingNeededToRetireOnTime: Fire.requiredSip(P, Q, ra), coastNumberToday: Fire.coast(P, Q, ra) },
    assumptions: ['Spending ₹' + n(d.exp) + ' a month in today\'s money, ' + n(d.infl) + '% inflation', 'Pre-retirement return ' + n(d.ret) + '%, post-retirement ' + n(d.postRet) + '%', 'Safe withdrawal rate ' + P.swr + '%, plan to age ' + life, 'Savings step up ' + n(d.step) + '% a year'] };
}

/* ---------- rent vs buy: mirrors rent-vs-buy-calculator.html ---------- */
function rentbuy(o) {
  const d = merge('rent-vs-buy-calculator', o), p = { price: n(d.price), dpPct: n(d.dp), rate: n(d.rate), tenure: n(d.tenure), rent: n(d.rent), app: n(d.app), inv: n(d.inv), rentInc: n(d.rentInc), horizon: Math.round(n(d.horizon)), bcost: n(d.bcost), scost: n(d.scost), maint: n(d.maint), gainsTax: bool(d.gtax), loanBenefit: bool(d.lben), slab: n(d.slab) };
  const s = RentBuy.sim(p), last = s.years.length - 1, b = s.buy[last], r = s.rentNW[last], k = Math.pow(1 + n(d.infl) / 100, s.H);
  return { inputs: d, results: { emi: s.emi, buyNetWorth: b, rentAndInvestNetWorth: r, buyMinusRent: b - r, winner: b >= r ? 'buy' : 'rent', buyMinusRentInTodaysMoney: (b - r) / k, breakEvenYear: RentBuy.breakEven(s), breakEvenHomePriceRisePct: RentBuy.breakEvenAppreciation(p) },
    assumptions: ['Home price rise ' + p.app + '% a year, investment return ' + p.inv + '%, rent rise ' + p.rentInc + '% a year', 'Buying cost ' + p.bcost + '%, selling cost ' + p.scost + '%, maintenance ' + p.maint + '% of home value a year', 'Both paths spend the same cash each month; the cheaper one invests the difference'] };
}

/* ---------- move abroad: mirrors abroad-calculator.html ---------- */
const GROSS_DEFAULT = { US: 120000 };
function abroad(o) {
  const d0 = merge('abroad-calculator', o), key = String(d0.country || 'US').toUpperCase(), c = Abroad.COUNTRIES[key];
  if (!c) throw new Error('Unknown country ' + key + '. Use one of: ' + Object.keys(Abroad.COUNTRIES).join(', '));
  const city = c.cities.find(x => x.id === (d0.city || c.cities[0].id)) || c.cities[0], partner = bool(d0.partner), has = k => o && o[k] !== undefined;
  if (!has('gross') && !GROSS_DEFAULT[key]) throw new Error('Give the yearly salary abroad as "gross" (in ' + c.cur + ') for ' + c.name);
  const f2 = partner ? [1.3, 1.7] : [1, 1];
  const d = { ...d0, country: key, city: city.id, gross: has('gross') ? n(o.gross) : GROSS_DEFAULT[key],
    fx: has('fx') ? n(o.fx) : c.fx, iA: has('iA') ? n(o.iA) : c.infl, retPct: has('retPct') ? n(o.retPct) : c.retire.emp, matchPct: has('matchPct') ? n(o.matchPct) : c.retire.match,
    rentA: has('rentA') ? n(o.rentA) : Math.round(city.rent * f2[0]), otherA: has('otherA') ? n(o.otherA) : Math.round(city.other * f2[1]) };
  if (partner) { if (!has('rentI')) d.rentI = Math.round(n(DEF['abroad-calculator'].rentI) * 1.3); if (!has('otherI')) d.otherI = Math.round(n(DEF['abroad-calculator'].otherI) * 1.7); }
  if (!has('pGross')) d.pGross = Math.round(d.gross / 2);
  const P = { years: +d.years, parents: n(d.parents),
    india: { ctc: n(d.ctc), rent: n(d.rentI), other: n(d.otherI), growth: n(d.gI), infl: n(d.iI), ret: n(d.rI), epf: bool(d.epf) },
    partner: { on: partner, indiaCtc: n(d.pCtc), abroadGross: n(d.pGross) },
    abroad: { country: key, opt: { state: city.state, province: city.province, retPct: n(d.retPct), matchPct: n(d.matchPct) }, gross: n(d.gross), rent: n(d.rentA), other: n(d.otherA), growth: n(d.gA), infl: n(d.iA), ret: n(d.rA), fx: n(d.fx), dep: n(d.dep), trips: n(d.trips), oneTime: n(d.oneTime) } };
  const R = Abroad.compare(P), rows = R.rows, last = rows[rows.length - 1], y1 = rows[0], be = Abroad.breakEvenSalary(P), k = P.abroad.fx;
  const rent80 = Abroad.compare({ ...P, abroad: { ...P.abroad, rent: P.abroad.rent * 0.8 } }).diff - R.diff;
  return { inputs: d, results: { country: c.name, city: city.name, currency: c.cur, years: R.years,
    takeHomeMonthAbroadInRupees: y1.abroadNet / 12, takeHomeMonthIndia: y1.indiaInHand / 12, livingCostMonthAbroadInRupees: (P.abroad.rent + P.abroad.other) * k, livingCostMonthIndia: P.india.rent + P.india.other,
    savedYear1Abroad: y1.abroadSave, savedYear1India: y1.indiaSave, netWorthEndAbroad: last.abroadNW, netWorthEndIndia: last.indiaNW, abroadAheadBy: last.abroadNW - last.indiaNW,
    netWorthEndAbroadInTodaysMoney: last.abroadNWReal, netWorthEndIndiaInTodaysMoney: last.indiaNWReal, retirementPartAbroad: last.abroadRetire, retirementPartIndia: last.indiaRetire,
    movingPullsAheadInYear: R.breakEven, breakEvenSalaryAbroadLocalCurrency: be, offeredSalaryLocalCurrency: P.abroad.gross, rentCut20PctAddsToNetWorth: Math.abs(rent80) },
    assumptions: ['Single earner' + (partner ? ' plus a working partner' : ''), c.cur + ' → ₹' + k + ', rupee weakens ' + P.abroad.dep + '% a year', 'Rent ' + c.sym + P.abroad.rent + ' and other costs ' + c.sym + P.abroad.other + ' a month abroad; ₹' + P.india.rent + ' + ₹' + P.india.other + ' in India', 'Salary growth ' + P.abroad.growth + '% abroad vs ' + P.india.growth + '% in India', 'Investment return ' + P.abroad.ret + '% abroad vs ' + P.india.ret + '% in India', 'Retirement savings (' + c.retire.name + ' and EPF) counted in net worth', 'One-time move cost ₹' + P.abroad.oneTime + ', trips home ₹' + P.abroad.trips + ' a year'] };
}

/* ---------- return to India: mirrors return-calculator.html ---------- */
function returning(o) {
  const d = merge('return-calculator', o), P = { age: n(d.age), fx: n(d.fx), dep: n(d.dep), retAbroad: n(d.retA), retIndia: n(d.retI), infl: n(d.infl), cash: n(d.cash), saveYear: n(d.saveYear), saveGrowth: n(d.saveGrowth),
    retire: n(d.retire), retireYear: n(d.retireYear), retireGrowth: n(d.retireGrowth), ctcBasis: d.ctcBasis, indiaTax: n(d.indiaTax), partnerCtc: n(d.partnerCtc), partnerYears: n(d.partnerYears), marketHit: n(o.marketHit), jobGap: n(d.jobGap), countPf: d.countPf, pfRate: n(d.pfRate), events: [1, 2, 3].map(i => ({ kind: d['ev' + i + 'Kind'], amount: n(d['ev' + i + 'Amt']), from: n(d['ev' + i + 'From']), to: n(d['ev' + i + 'To']) })), indiaAssets: n(d.indiaAssets), spend: n(d.spend), planEnd: Math.max(n(d.age) + 1, n(d.planEnd)), jobCtc: n(d.jobCtc), jobGrowth: n(d.jobGrowth), workUntil: n(d.workUntil), lump: n(d.lump),
    convCost: n(d.convCost), gainShare: n(d.gainShare), gainTax: n(d.gainTax), retireMode: d.retMode, retireTax: n(d.retireTax), penalty: n(d.penalty), retireAge: n(d.retireAge) };
  const A = Returning.analyse(P, 10);
  return { inputs: d, results: { firstReadyInYears: A.firstReady, table: A.rows.map(r => ({ returnInYears: r.r, age: r.age, youBringHome: r.corpus, youNeed: r.need, gap: r.gap, ready: r.ready })) },
    assumptions: ['Spending ₹' + P.spend + ' a month in today\'s money in India', 'Rupee weakens ' + P.dep + '% a year', 'Returns ' + P.retAbroad + '% abroad, ' + P.retIndia + '% in India, inflation ' + P.infl + '%', 'Plan runs to age ' + P.planEnd, (P.ctcBasis === 'return' ? 'The package is what you would be paid in the year you return. ' : '') + (P.jobGap > 0 ? P.jobGap + ' months without income after returning. ' : '') + (P.indiaTax > 0 ? P.indiaTax + '% tax on the return in India. ' : '') + (P.partnerCtc > 0 ? 'Partner earns ₹' + P.partnerCtc + ' (today\'s money) for ' + P.partnerYears + ' years after you return. ' : '') + (P.marketHit > 0 ? 'Investments abroad fall ' + P.marketHit + '% just before returning. ' : '') + (P.countPf === 'yes' ? 'PF and gratuity counted as savings (PF at ' + P.pfRate + '%). ' : '') + P.events.filter(e => e.kind && e.amount > 0).map(e => (e.kind === 'monthly' ? '₹' + e.amount + ' a month from age ' + e.from + ' to ' + e.to : '₹' + e.amount + ' once at age ' + e.from) + ' (today\'s money). ').join('') + 'Savings abroad rise ' + P.saveGrowth + '% a year, retirement contributions ' + (P.retireGrowth || 0) + '% a year, India salary raise ' + P.jobGrowth + '% a year' + (P.ctcBasis === 'return' ? ' (from the year you return)' : ' (the package is in today\'s money and grows from today)')] };
}

const TOOLS = { salary, regime, sip, swp, emi, fd, gratuity, hra, fire, rentbuy, abroad, return: returning };
const DEFAULT_PAGE = { sip: 'sip-calculator', swp: 'swp-calculator', emi: 'emi-calculator', fd: 'fd-calculator', gratuity: 'gratuity-calculator', hra: 'hra-calculator', fire: 'fire-calculator', rentbuy: 'rent-vs-buy-calculator', abroad: 'abroad-calculator', return: 'return-calculator' };
const HELP = { salary: 'ctc, basicPct, hraPct, variablePct, pfCap, gratuity, employerNps, ptMonthly, metro, rentMonthly; old-regime deductions: other80c, nps1b, d80, homeLoanInt, eduLoanInt, donations, disability', regime: 'gross (yearly gross salary), deductions (optional, beyond the standard deduction)', sip: 'mode (sip|lump|goal), sip, lump, ret, yrs, mon, step, infl, taxk (none|equity|slab), slab, conv (eff|nom), goal, goalIn (today|future)',
  swp: 'corpus, wd (monthly withdrawal in year 1), step (% rise a year), ret, yrs, gainPct (% of the money already profit), taxk (equity|slab|none), slab, conv (eff|nom), infl',
  emi: 'mode (emi|afford), amt, rate, yrs, mon, extra (prepay a month), lump, lumpM; afford: inc, foir, old', fd: 'mode (fd|rd), p, d (RD monthly), rate, yrs, mon, day, cmp, sal (yearly salary or pension; 0 if the interest is the only income), senior', gratuity: 'wage, yrs, mon, kind (covered|notcovered|govt), fixed, total', hra: 'basic, hra, rent (monthly), months, metro, slab',
  fire: 'age, retAge, exp (monthly), corp, sav (monthly), step, ret, infl, postRet, swr, life, pension, ratio', rentbuy: 'price, dp, rate, tenure, rent, app, inv, rentInc, horizon, bcost, scost, maint, infl, gtax, lben, slab',
  abroad: 'country (US|CA|AU|SG|AE|UK|DE), city, gross (local currency), ctc, years, rentA, otherA, rentI, otherI, fx, dep, gA, gI, rA, rI, iA, iI, oneTime, trips, parents, partner, retPct, matchPct, epf', return: 'age, cash, saveYear, saveGrowth, retire, retireYear, retireGrowth, ctcBasis (today|return), indiaTax (% of the return in India), partnerCtc and partnerYears (a partner package in today money and the years they work after you return), marketHit (a % fall in investments abroad just before you return, a stress test), jobGap (months), countPf (yes|no), pfRate, ev1Kind/ev2Kind/ev3Kind (none, once or monthly; use an empty string for none) with ev1Amt, ev1From, ev1To, indiaAssets, spend, jobCtc, workUntil, planEnd, lump, fx, dep, retA, retI, infl, retMode' };

function main(argv) {
  const [tool, ...rest] = argv;
  if (!tool || tool === 'list') { console.log(JSON.stringify({ engine: META, tools: HELP }, null, 2)); return; }
  if (tool === 'defaults') { const t = rest[0]; console.log(JSON.stringify(DEF[DEFAULT_PAGE[t]] || { note: 'built-in defaults in run.js' }, null, 2)); return; }
  if (!TOOLS[tool]) { console.error('Unknown tool "' + tool + '". Run: node run.js list'); process.exit(2); }
  let over = {}; const raw = rest.join(' ').trim(); if (raw) { try { over = JSON.parse(raw); } catch (e) { console.error('Inputs must be JSON, for example \'{"ctc":1500000}\''); process.exit(2); } }
  const out = TOOLS[tool](over);
  const clean = x => Array.isArray(x) ? x.map(clean) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clean(v)])) : round(x);
  console.log(JSON.stringify({ tool, inputs: out.inputs, results: clean(out.results), assumptions: out.assumptions, engine: { builtOn: META.builtOn, taxYear: META.taxYear, fxDefaultsDate: META.fxDefaultsDate, sourceCommit: META.sourceCommit } }, null, 2));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error('Error: ' + e.message); process.exit(1); } }
module.exports = { TOOLS, breakevenDeductions };
