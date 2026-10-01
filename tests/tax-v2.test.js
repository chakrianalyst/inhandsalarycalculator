// node --test tests/tax-v2.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Tax = require('../assets/tax.js'), Old = require('./legacy-tax.js'), W = require('../assets/words.js');
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/* ---------- regression: new engine == frozen old engine for every legacy input ---------- */
test('salary(): identical to the pre-v2 engine across a large input grid', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
  let n = 0;
  for (let i = 0; i < 1500; i++) {
    const inp = { ctc: pick([300000, 480000, 750000, 1200000, 1800000, 2500000, 4000000, 7500000]), basicPct: pick([25, 40, 50, 60]), hraPct: pick([0, 40, 50]),
      variablePct: pick([0, 8, 15, 30]), pfCap: pick([true, false]), gratuity: pick([true, false]), employerNps: pick([0, 40000, 150000]), ptMonthly: pick([0, 200]),
      metro: pick([true, false]), rentMonthly: pick([0, 15000, 40000]), other80c: pick([0, 50000, 150000]), nps1b: pick([0, 50000]), d80: pick([0, 25000]),
      homeLoanInt: pick([0, 200000]), otherDed: pick([0, 30000]) };
    const a = Tax.salary(inp), b = Old.salary(inp);
    if (a.employerPf + a.employerNps > 750000) continue;               // v2 adds the ₹7.5L employer-contribution rule (legacy ignored it)
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
