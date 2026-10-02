// node --test tests/tax-v2.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Tax = require('../assets/tax.js'), Old = require('./legacy-tax.js'), W = require('../assets/words.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/* ---------- regression: new engine == frozen old engine for every legacy input ---------- */
test('salary(): identical to the pre-v2 engine across a large input grid', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
  let n = 0;
  for (let i = 0; i < 9000; i++) {
    const inp = { ctc: pick([300000, 480000, 750000, 1200000, 1800000, 2500000, 4000000, 7500000]), basicPct: pick([25, 40, 50, 60]), hraPct: pick([0, 40, 50]),
      variablePct: pick([0, 8, 15, 30]), pfCap: pick([true, false]), gratuity: pick([true, false]), employerNps: pick([0, 40000, 150000]), ptMonthly: pick([0, 200]),
      metro: pick([true, false]), rentMonthly: pick([0, 15000, 40000]), other80c: pick([0, 50000, 150000]), nps1b: pick([0, 50000]), d80: pick([0, 25000]),
      homeLoanInt: pick([0, 200000]), otherDed: pick([0, 30000]) };
    const a = Tax.salary(inp), b = Old.salary(inp);
    if (a.employerPf + a.employerNps > 750000) continue;               // v2 adds the ₹7.5L employer-contribution rule (legacy ignored it)
    if (inp.employerNps > 0) continue;                                 // legacy deducted employer NPS twice (fixed in v2); covered by the NPS tests below
    for (const k of ['gross', 'basic', 'hra', 'special', 'employerPf', 'employeePf', 'gratuity', 'employerNps', 'pt', 'saving']) near(a[k], b[k], 0.01);
    for (const r of ['new', 'old']) for (const k of ['taxable', 'tax', 'inHandYear', 'inHandMonth', 'deductions']) near(a[r][k], b[r][k], 0.01);
    assert.equal(a.best, b.best); near(a.old.hraExempt, b.old.hraExempt, 0.01); near(a.old.c80, b.old.c80, 0.01); n++;
  }
  assert.ok(n > 1000);
});

/* ---------- structure(): % vs ₹, PF modes, balancing ---------- */
test('basic: 40% of CTC == ₹4,80,000 a year == ₹40,000 a month', () => {
  const base = { ctc: 1200000 };
  const a = Tax.structure({ ...base, basicMode: 'pct', basicVal: 40 }), b = Tax.structure({ ...base, basicMode: 'yr', basicVal: 480000 }), c = Tax.structure({ ...base, basicMode: 'mo', basicVal: 40000 });
  near(a.basic, 480000); near(b.basic, 480000); near(c.basic, 480000);
});
test('HRA: % of basic or ₹', () => {
  near(Tax.structure({ ctc: 1200000, hraMode: 'pct', hraVal: 50 }).hra, 240000); near(Tax.structure({ ctc: 1200000, hraMode: 'mo', hraVal: 15000 }).hra, 180000);
});
test('PF modes: 12% of basic, statutory minimum (₹1,800/mo), custom %, custom ₹', () => {
  const s = o => Tax.structure({ ctc: 1200000, ...o }).employerPf;
  near(s({ pfMode: 'full' }), 57600); near(s({ pfMode: 'cap' }), 21600); near(s({ pfMode: 'pct', pfVal: 10 }), 48000);
  near(s({ pfMode: 'mo', pfVal: 2000 }), 24000); near(s({ pfMode: 'yr', pfVal: 30000 }), 30000);
});
test('special allowance balances the CTC; shortfall is reported when components overshoot', () => {
  const a = Tax.structure({ ctc: 1200000, bonusMode: 'pct', bonusVal: 10, others: [{ name: 'Phone', val: 1000, mode: 'mo' }], npsMode: 'yr', npsVal: 24000, insMode: 'yr', insVal: 12000, gratuityOn: true });
  near(a.basic + a.hra + a.bonusTarget + a.otherSum + a.special + a.employerPf + a.gratuity + a.employerNps + a.insurance, 1200000); assert.equal(a.shortfall, 0);
  const b = Tax.structure({ ctc: 500000, basicMode: 'pct', basicVal: 70, hraMode: 'pct', hraVal: 60 }); assert.ok(b.shortfall > 0); assert.equal(b.special, 0);
});
test('bonus payout %: CTC allocation uses the target, cash uses the payout', () => {
  const full = Tax.structure({ ctc: 1200000, bonusMode: 'pct', bonusVal: 20, payoutPct: 100 }), half = Tax.structure({ ctc: 1200000, bonusMode: 'pct', bonusVal: 20, payoutPct: 50 });
  near(half.bonusTarget, 240000); near(half.bonus, 120000); near(half.special, full.special);
  const A = Tax.assess(full, {}), B = Tax.assess(half, {}); near(A.gross - B.gross, 120000);
});

/* ---------- assess(): caps ---------- */
const std = Tax.structure({ ctc: 1200000 });
test('employer NPS deduction capped at 14% (new) / 10% (old) of basic', () => {
  const a = Tax.structure({ ctc: 1200000, npsMode: 'yr', npsVal: 100000 }), r = Tax.assess(a, {});
  near(r.new.deductions, 75000 + 0.14 * 480000); assert.ok(r.old.list.some(x => x[0].startsWith('Employer NPS') && Math.abs(x[1] - 48000) < 1));
});
test('80C cap ₹1.5L including employee PF + VPF', () => {
  const r = Tax.assess(std, { other80c: 200000 }); near(r.old.c80, 150000);
  const r2 = Tax.assess(Tax.structure({ ctc: 1200000, vpfMode: 'mo', vpfVal: 5000 }), { other80c: 0 }); near(r2.old.c80, 57600 + 60000);
});
test('80D caps: ₹25k self + ₹25k parents, ₹50k each if senior', () => {
  const o = x => Tax.assess(std, x).old.list.find(l => l[0].startsWith('Health'))[1];
  near(o({ d80Self: 40000, d80Parents: 40000 }), 50000); near(o({ d80Self: 40000, d80Parents: 60000, selfSenior: true, parentsSenior: true }), 90000);
});
test('home-loan interest capped at ₹2L; LTA exemption limited to the LTA component; disability capped', () => {
  near(Tax.assess(std, { homeLoanInt: 350000 }).old.list.find(l => l[0].startsWith('Home'))[1], 200000);
  const a = Tax.structure({ ctc: 1200000, others: [{ name: 'LTA', kind: 'lta', val: 50000, mode: 'yr' }] });
  near(Tax.assess(a, { ltaClaim: 90000 }).old.ltaExempt, 50000); near(Tax.assess(std, { disability: 300000 }).old.list.find(l => l[0].startsWith('Disab'))[1], 125000);
});
test('HRA exemption is the least of three limbs and zero without rent', () => {
  near(Tax.assess(std, { rentMonthly: 0, metro: true }).old.hraExempt, 0);
  near(Tax.assess(std, { rentMonthly: 20000, metro: true }).old.hraExempt, Math.min(240000, 240000 - 48000, 240000));
  near(Tax.assess(std, { rentMonthly: 20000, metro: false }).old.hraExempt, Math.min(240000, 192000, 192000));
});
test('employer PF + NPS above ₹7.5L a year becomes taxable', () => {
  const a = Tax.structure({ ctc: 20000000, basicMode: 'pct', basicVal: 50, npsMode: 'yr', npsVal: 100000 });
  const r = Tax.assess(a, {}); near(r.excess, a.employerPf + a.employerNps - 750000); assert.ok(r.excess > 0);
});

/* ---------- consistency + bonus treatment ---------- */
test('fixed monthly × 12 + bonus after tax == yearly in-hand (both regimes)', () => {
  for (const ctc of [800000, 1500000, 3000000]) {
    const r = Tax.assess(Tax.structure({ ctc, bonusMode: 'pct', bonusVal: 15 }), { ptMonthly: 200 });
    for (const k of ['new', 'old']) near(r[k].fixedMonthly * 12 + r[k].bonusAfterTax, r[k].inHandYear, 0.5);
  }
});
test('bonus is taxed at the marginal rate (bonus tax >= 0 and <= bonus)', () => {
  const r = Tax.assess(Tax.structure({ ctc: 2400000, bonusMode: 'pct', bonusVal: 20 }), {}); assert.ok(r.new.bonusTax > 0 && r.new.bonusTax < r.bonus);
});
test('break-even: at the break-even deductions old tax equals new tax; beyond it old is cheaper', () => {
  const r = Tax.assess(Tax.structure({ ctc: 2500000 }), {}), gross = r.gross, be = r.breakeven;
  const oldAt = d => Tax.computeTax(Math.max(0, gross - d), 'old').total;
  assert.ok(oldAt(be) <= r.new.tax + 1); assert.ok(oldAt(be - 5000) > r.new.tax);
});

/* ---------- payslip mode ---------- */
test('payslip mode: monthly lines become the same annual amounts', () => {
  const a = Tax.fromPayslip({ basicM: 40000, hraM: 20000, otherM: 30000, bonusYr: 100000, pfM: 4800, ptM: 200 });
  near(a.basic, 480000); near(a.hra, 240000); near(a.otherSum, 360000); near(a.employeePf, 57600); near(a.employerPf, 57600);
  const r = Tax.assess(a, { ptMonthly: 200 }); near(r.gross, 480000 + 240000 + 360000 + 100000);
});
test('payslip mode matches CTC mode when the same numbers are entered', () => {
  const c = Tax.assess(Tax.structure({ ctc: 1200000 }), { ptMonthly: 200 });
  const p = Tax.assess(Tax.fromPayslip({ basicM: c.basic / 12, hraM: c.hra / 12, otherM: c.special / 12, pfM: c.employeePf / 12 }), { ptMonthly: 200 });
  near(p.new.inHandYear, c.new.inHandYear, 1); near(p.old.inHandYear, c.old.inHandYear, 1);
});

/* ---------- words ---------- */
test('Indian number words', () => {
  const cases = { 0: 'Zero rupees only', 1: 'One rupee only', 21: 'Twenty-one rupees only', 100: 'One hundred rupees only', 999: 'Nine hundred ninety-nine rupees only',
    1000: 'One thousand rupees only', 475000: 'Four lakh seventy-five thousand rupees only', 100000: 'One lakh rupees only', 1200000: 'Twelve lakh rupees only',
    12345678: 'One crore twenty-three lakh forty-five thousand six hundred seventy-eight rupees only', 100000000: 'Ten crore rupees only', 1500000000: 'One hundred fifty crore rupees only' };
  for (const [n, w] of Object.entries(cases)) assert.equal(W.sentence(Number(n)), w);
  assert.equal(W.sentence(-475000), W.sentence(475000)); assert.equal(W.sentence(475000.9), W.sentence(475000)); assert.equal(W.sentence('abc'), 'Zero rupees only');
  assert.equal(W.group(1200000), '12,00,000'); assert.equal(W.group(123456789), '12,34,56,789');
});

/* ---------- gratuity base (basic / wages / custom / off) ---------- */
test('gratuity: on basic = 4.81% of basic (the default)', () => {
  const a = Tax.structure({ ctc: 4500000, gratMode: 'basic' }); near(a.gratuity, a.basic * 0.0481, 0.01);
});
test('gratuity: wages rule = 4.81% of wages, with wages = 50% of (CTC minus gratuity) when basic is below 50%', () => {
  const a = Tax.structure({ ctc: 4500000, gratMode: 'wages' });
  near(a.gratuity, 0.0481 * 0.5 * (4500000 - a.gratuity), 0.5); assert.ok(a.gratuity > a.basic * 0.0481);
});
test('gratuity: wages rule falls back to basic when basic is already above 50% of pay', () => {
  const a = Tax.structure({ ctc: 4500000, basicMode: 'pct', basicVal: 60, gratMode: 'wages' }); near(a.gratuity, a.basic * 0.0481, 0.01);
});
test('gratuity: custom % of basic, custom ₹, and off', () => {
  near(Tax.structure({ ctc: 4500000, gratMode: 'custom', gratCustomMode: 'pct', gratVal: 6 }).gratuity, 4500000 * 0.4 * 0.06, 0.01);
  near(Tax.structure({ ctc: 4500000, gratMode: 'custom', gratCustomMode: 'yr', gratVal: 111000 }).gratuity, 111000, 0.01);
  near(Tax.structure({ ctc: 4500000, gratMode: 'off' }).gratuity, 0, 0.01);
});
test('gratuity: any base keeps components summing to CTC, and legacy flags still work', () => {
  for (const gratMode of ['basic', 'wages', 'custom', 'off']) {
    const a = Tax.structure({ ctc: 4500000, gratMode, gratCustomMode: 'pct', gratVal: 5, hraMode: 'pct', hraVal: 80 });
    near(a.basic + a.hra + a.special + a.employerPf + a.gratuity + a.employerNps + a.insurance, 4500000, 0.5);
  }
  near(Tax.structure({ ctc: 1200000, gratuityOn: true }).gratuity, 480000 * 0.0481, 0.01); near(Tax.structure({ ctc: 1200000, gratuity: false }).gratuity, 0, 0.01);
});
test('offer-letter shape: basic + HRA + fixed allowances can use up the whole CTC once gratuity is on wages', () => {
  // generic example: A (fixed pay) = CTC - PF - gratuity must equal basic + HRA + listed allowances
  const ctc = 5000000, base = { ctc, basicMode: 'pct', basicVal: 40, hraMode: 'pct', hraVal: 80, gratMode: 'wages', pfMode: 'full' };
  const probe = Tax.structure(base), A = ctc - probe.employerPf - probe.gratuity, listed = A - probe.basic - probe.hra;
  const a = Tax.structure({ ...base, others: [{ name: 'Allowances', val: listed, mode: 'yr' }] });
  near(a.special, 0, 1); near(a.shortfall, 0, 1);
});

/* ---------- employer NPS / VPF: tax treatment ---------- */
const inHandOf = (inp, d, k) => Tax.assess(Tax.structure(inp), d || {})[k].inHandYear;
test('employer NPS within the cap: taxable income equals cash pay minus standard deduction (no double deduction)', () => {
  const r = Tax.assess(Tax.structure({ ctc: 2500000, npsMode: 'pct', npsVal: 8 }), {});
  near(r.new.taxable, r.gross - 75000, 1);
  near(r.old.taxable, r.gross - (r.old.deductions - r.old.list.find(l => l[0].startsWith('Employer NPS'))[1]), 1);
});
test('employer NPS above the cap: only the excess becomes taxable', () => {
  const a = Tax.structure({ ctc: 2500000, npsMode: 'pct', npsVal: 20 }), r = Tax.assess(a, {});                         // 20% of basic, cap is 14% (new) / 10% (old)
  near(r.new.taxable, r.gross + (a.employerNps - 0.14 * a.basic) - 75000, 1);
  near(r.old.taxable, r.gross + (a.employerNps - 0.10 * a.basic) - (r.old.deductions - 0.10 * a.basic), 1);
});
test('opting for NPS never raises tax, and costs less take-home than the amount invested', () => {
  for (const ctc of [800000, 1500000, 2500000, 5000000]) for (const k of ['new', 'old']) {
    const none = Tax.assess(Tax.structure({ ctc }), {}), nps = Tax.assess(Tax.structure({ ctc, npsMode: 'pct', npsVal: 8 }), {});
    assert.ok(nps[k].tax <= none[k].tax + 0.01); const cost = none[k].inHandYear - nps[k].inHandYear; assert.ok(cost <= nps.employerNps + 0.01 && cost >= 0);
  }
});
test('VPF is a deduction from pay; no tax benefit in the new regime, 80C benefit in the old', () => {
  const base = { ctc: 2500000 }, v = { ...base, vpfMode: 'mo', vpfVal: 5000 };
  near(inHandOf(base, {}, 'new') - inHandOf(v, {}, 'new'), 60000, 0.5);                              // new regime: full amount comes out of take-home
  assert.ok(inHandOf(base, {}, 'old') - inHandOf(v, {}, 'old') <= 60000 + 0.5);                       // old regime: PF is already above 80C limit here, so same or smaller cost
});

/* ---------- tax breakdown ---------- */
test('breakdown: slabs add up and the steps always reproduce computeTax', () => {
  for (const regime of ['new', 'old']) for (let inc = 0; inc <= 6e7; inc += inc < 3e6 ? 12500 : 250000) {
    const b = Tax.breakdown(inc, regime), c = Tax.computeTax(inc, regime);
    near(b.rows.reduce((t, r) => t + r.tax, 0), b.slabTax, 0.01); near(b.slabTax - b.rebate + b.surcharge + b.cess, b.total, 0.5); near(b.total, c.total, 0.01);
  }
});
test('breakdown: rebate, marginal relief and surcharge are labelled correctly', () => {
  assert.equal(Tax.breakdown(1200000, 'new').kind, 'rebate'); near(Tax.breakdown(1200000, 'new').total, 0);
  assert.equal(Tax.breakdown(1230000, 'new').kind, 'relief'); assert.equal(Tax.breakdown(1500000, 'new').kind, 'none');
  assert.equal(Tax.breakdown(500000, 'old').kind, 'rebate'); assert.ok(Tax.breakdown(6000000, 'new').surcharge > 0);
});

test('HRA metro list: the eight cities of the Income-tax Rules 2026 (FY 2026-27)', () => {
  assert.deepEqual(Tax.METRO_CITIES, ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad']);
});

test('state professional tax: slabs from the published tables', () => {
  const P = Tax.professionalTax;
  assert.equal(P('KA', 24999), 0); assert.equal(P('KA', 100000), 2500);
  assert.equal(P('MH', 8000), 2100); assert.equal(P('MH', 50000), 2500);
  assert.equal(P('TG', 18000), 1800); assert.equal(P('TG', 90000), 2400);
  assert.equal(P('GJ', 5000), 0); assert.equal(P('GJ', 100000), 2400);
  assert.equal(P('MP', 40000), 2500);
  assert.equal(Tax.professionalTax('MH', 20000, true), 0, 'women up to ₹25,000 in Maharashtra pay nothing'); assert.equal(Tax.professionalTax('MH', 25000, true), 0); assert.equal(Tax.professionalTax('MH', 25001, true), 2500); assert.equal(Tax.professionalTax('MH', 20000, false), 2500);
  assert.equal(P('WB', 20000), 0); assert.equal(P('WB', 20001), 1200); assert.equal(P('WB', 50000), 1680); assert.equal(P('WB', 100000), 2040); assert.equal(P('WB', 100001), 2496, 'West Bengal schedule from 1 Oct 2026');
  assert.equal(P('KL', 10000), 1200); assert.equal(P('KL', 15000), 1500); assert.equal(P('KL', 20000), 2000); assert.equal(P('KL', 25000), 2500); assert.equal(P('KL', 50000), 2500, 'Kerala charges by half-year pay, up to ₹1,250 per half-year'); assert.equal(P('NONE', 90000), 0); assert.equal(P('TN', 90000), null);
  const a = Tax.structure({ ctc: 1200000 });
  assert.equal(Tax.assess(a, { ptState: 'KA' }).pt, 2500); assert.equal(Tax.assess(a, { ptState: '', ptMonthly: 100 }).pt, 1200);
  assert.equal(Tax.assess(a, { ptState: 'NONE', ptMonthly: 200 }).pt, 0);
});

test('Tax.salary forwards payout % and state PT; city → state mapping', () => {
  const a = Tax.salary({ ctc: 2000000, basicPct: 40, hraPct: 50, variablePct: 20, gratuity: true, ptMonthly: 200, metro: true, rentMonthly: 0 }), b = Tax.salary({ ctc: 2000000, basicPct: 40, hraPct: 50, variablePct: 20, gratuity: true, ptMonthly: 200, metro: true, rentMonthly: 0, payoutPct: 50 });
  assert.ok(b.new.inHandYear < a.new.inHandYear); assert.equal(Tax.salary({ ctc: 1200000, basicPct: 40, hraPct: 50, ptMonthly: 200, ptState: 'NONE', metro: true }).pt, 0); assert.equal(Tax.CITY_PT.Bengaluru, 'KA');
});

test('pages that quote the default ₹12 L example agree with the engine (Karnataka professional tax)', () => {
  const fs = require('fs'), r = Tax.salary({ ctc: 1200000, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, ptState: 'KA', metro: true, rentMonthly: 0 });
  const inr = n => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
  const guide = fs.readFileSync(__dirname + '/../ctc-vs-in-hand-salary.html', 'utf8');
  assert.ok(guide.includes(inr(r[r.best].inHandMonth)), 'guide monthly in-hand'); assert.ok(guide.includes(inr(r[r.best].inHandYear)), 'guide yearly in-hand'); assert.ok(guide.includes(inr(r.pt)), 'guide professional tax');
});

test('other payslip deductions (cab, lunch, ESPP): lower take-home by exactly that amount, change no tax, and apply to both regimes', () => {
  const a = Tax.structure({ ctc: 2400000, bonusMode: 'pct', bonusVal: 10 }), base = Tax.assess(a, { ptMonthly: 200, rentMonthly: 20000 }), ded = Tax.assess(a, { ptMonthly: 200, rentMonthly: 20000, postTaxYear: 60000 });
  for (const k of ['new', 'old']) { near(ded[k].inHandYear, base[k].inHandYear - 60000, 0.01); near(ded[k].fixedMonthly, base[k].fixedMonthly - 5000, 0.01); assert.equal(ded[k].tax, base[k].tax); assert.equal(ded[k].otherDed, 60000); }
  assert.equal(ded.best, base.best); near(ded.saving, base.saving, 0.01); assert.equal(Tax.assess(a, { postTaxYear: -5 }).new.otherDed, 0);
});
