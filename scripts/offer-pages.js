/* Figures for the offer-letter guides, worked out at build time by the Indian tax engine with the same typical structure as the
   ₹X LPA pages (40% basic, HRA 50% of basic, gratuity inside CTC, ₹200 a month professional tax, whichever regime leaves more):
   - 12% PF vs a fixed ₹1,800 PF, at each CTC
   - the CTC that gives a monthly in-hand amount (the salary calculator worked backwards)
   - an offer letter's breakup, line by line, for a ₹18 LPA offer with 10% variable pay
   - variable pay: the fixed monthly in-hand, and the variable after tax, at each CTC
   - joining bonus: what is left after tax, at each CTC and bonus size */
const CTC = require('./ctc-pages.js');
const PF_CTCS = [5, 8, 10, 12, 15, 18, 20, 25, 30, 40, 50];                        // ₹ lakh
const TARGETS = [30000, 40000, 50000, 60000, 75000, 80000, 100000, 125000, 150000, 200000, 250000, 300000];   // ₹ a month in hand
const inr = n => (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)));
const lpaTxt = n => '₹' + (+(n / 1e5).toFixed(1)) + ' LPA';

function pfRow(Tax, lakh) {
  const ctc = lakh * 1e5, full = Tax.salary({ ...CTC.BASE, ctc, pfCap: false }), cap = Tax.salary({ ...CTC.BASE, ctc, pfCap: true });
  const f = full[full.best].inHandMonth, c = cap[cap.best].inHandMonth;
  return { lakh, full: f, cap: c, more: c - f, pfLess: (full.employeePf + full.employerPf) - (cap.employeePf + cap.employerPf), basic: full.basic };
}

/** The lowest CTC whose monthly in-hand reaches `target` (bisection on the same engine the calculator uses). */
function ctcFor(Tax, target) {
  const inHand = ctc => { const r = Tax.salary({ ...CTC.BASE, ctc }); return r[r.best].inHandMonth; };
  let lo = 0, hi = 2e8; for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (inHand(m) < target) lo = m; else hi = m; } return hi;
}

const VP_CTCS = [10, 15, 20, 25, 30, 40], VP_PCT = 15;
const JB_CTCS = [10, 12, 15, 20, 30], JB_SIZES = [100000, 200000, 300000, 500000];
const sal = (Tax, ctc, x) => { const r = Tax.salary({ ...CTC.BASE, ctc, ...x }); return { r, b: r[r.best] }; };
/** Tax a joining bonus adds on top of a full year's salary, in the new regime (the one that leaves more with no deductions). */
function joiningBonus(Tax, ctc, bonus) {
  const { r } = sal(Tax, ctc), taxable = r.new.taxable;
  const before = Tax.computeTax(taxable, 'new').total, after = Tax.computeTax(taxable + bonus, 'new').total;
  return { tax: after - before, net: bonus - (after - before) };
}

function tokens(Tax, table) {
  const rows = PF_CTCS.map(l => pfRow(Tax, l)), at = l => rows.find(r => r.lakh === l), t = {};
  t['{{PF_TABLE}}'] = table(['CTC', '12% PF: in hand a month', 'Fixed ₹1,800 PF: in hand a month', 'More in hand', 'Less into PF a year'],
    rows.map(r => [`<a href="${CTC.fileFor(r.lakh)}">₹${r.lakh} LPA</a>`, inr(r.full), inr(r.cap), '+' + inr(r.more), inr(r.pfLess)]));
  for (const l of [10, 12, 18, 20, 25]) { const r = at(l); t[`{{PF_${l}_FULL}}`] = inr(r.full); t[`{{PF_${l}_CAP}}`] = inr(r.cap); t[`{{PF_${l}_MORE}}`] = inr(r.more); t[`{{PF_${l}_LESS}}`] = inr(r.pfLess); t[`{{PF_${l}_BASIC_MO}}`] = inr(r.basic / 12); }
  t['{{PF_5_MORE}}'] = inr(at(5).more);
  const need = TARGETS.map(m => ({ m, ctc: ctcFor(Tax, m) }));
  t['{{LPA_TABLE}}'] = table(['In hand a month', 'CTC you need', 'CTC a month (÷ 12)'], need.map(x => [inr(x.m), lpaTxt(x.ctc), inr(x.ctc / 12)]));
  const n = m => need.find(x => x.m === m).ctc;
  for (const m of [50000, 80000, 100000, 150000]) { t[`{{LPA_${m}}}`] = lpaTxt(n(m)); }
  const r45 = Tax.salary({ ...CTC.BASE, ctc: 450000 }); t['{{LPA_45_INHAND}}'] = inr(r45[r45.best].inHandMonth);
  const r12 = Tax.salary({ ...CTC.BASE, ctc: 1200000 }); t['{{LPA_12_INHAND}}'] = inr(r12[r12.best].inHandMonth);

  // An offer letter's breakup: ₹18 LPA with 10% variable pay
  { const { r, b } = sal(Tax, 1800000, { variablePct: 10 }), mo = n => inr(n / 12);
    t['{{OL_TABLE}}'] = table(['Part of your CTC', 'A year', 'A month', 'When you get it'], [
      ['Basic salary', inr(r.basic), mo(r.basic), 'Every month'], ['House rent allowance (HRA)', inr(r.hra), mo(r.hra), 'Every month'],
      ['Special allowance', inr(r.special), mo(r.special), 'Every month'], ['Variable pay (target)', inr(r.bonusTarget), '–', 'Once or twice a year, if targets are met'],
      ['Employer PF', inr(r.employerPf), mo(r.employerPf), 'Into your PF account'], ['Gratuity', inr(r.gratuity), '–', 'When you leave, after 5 years'],
      ['<b>Total: your CTC</b>', '<b>' + inr(r.ctc) + '</b>', '<b>' + mo(r.ctc) + '</b>', '']]);
    const fixedGross = r.basic + r.hra + r.special, salTax = b.tax - b.bonusTax;
    Object.assign(t, { '{{OL_CTC_MO}}': mo(r.ctc), '{{OL_GROSS_MO}}': mo(fixedGross), '{{OL_EPF_MO}}': mo(r.employeePf), '{{OL_PT_MO}}': mo(r.pt), '{{OL_TAX_MO}}': mo(salTax),
      '{{OL_INHAND}}': inr(b.fixedMonthly), '{{OL_VAR}}': inr(r.bonusTarget), '{{OL_VAR_AFTER}}': inr(b.bonusAfterTax), '{{OL_GAP}}': inr(r.ctc / 12 - b.fixedMonthly) }); }

  // Variable pay at each CTC
  const vp = VP_CTCS.map(l => { const v = sal(Tax, l * 1e5, { variablePct: VP_PCT }), p = sal(Tax, l * 1e5, { variablePct: VP_PCT, payoutPct: 70 }), z = sal(Tax, l * 1e5);
    return { l, target: v.r.bonusTarget, fixed: v.b.fixedMonthly, after: v.b.bonusAfterTax, tax: v.b.bonusTax, at70: p.b.bonusAfterTax, allFixed: z.b.inHandMonth }; });
  t['{{VP_TABLE}}'] = table(['CTC', `Variable pay (${VP_PCT}%)`, 'Fixed in hand a month', 'Variable after tax, if all paid', 'If 70% is paid'],
    vp.map(x => [`<a href="${CTC.fileFor(x.l)}">₹${x.l} LPA</a>`, inr(x.target), inr(x.fixed), inr(x.after), inr(x.at70)]));
  for (const x of vp) { t[`{{VP_${x.l}_FIXED}}`] = inr(x.fixed); t[`{{VP_${x.l}_TARGET}}`] = inr(x.target); t[`{{VP_${x.l}_AFTER}}`] = inr(x.after); t[`{{VP_${x.l}_TAX}}`] = inr(x.tax);
    t[`{{VP_${x.l}_70}}`] = inr(x.at70); t[`{{VP_${x.l}_ALLFIXED}}`] = inr(x.allFixed); t[`{{VP_${x.l}_LESS}}`] = inr(x.allFixed - x.fixed); t[`{{VP_${x.l}_TAXPCT}}`] = Math.round(x.tax / x.target * 100) + '%'; }
  { const s80 = sal(Tax, 2000000, { variablePct: VP_PCT, payoutPct: 80 }); t['{{VP_20_80}}'] = inr(s80.b.bonusAfterTax); t['{{VP_20_80_GROSS}}'] = inr(s80.r.bonus); }

  // Joining bonus after tax
  t['{{JB_TABLE}}'] = table(['CTC', ...JB_SIZES.map(j => `${lakhTxt(j)} bonus`)], JB_CTCS.map(l => [`<a href="${CTC.fileFor(l)}">₹${l} LPA</a>`, ...JB_SIZES.map(j => inr(joiningBonus(Tax, l * 1e5, j).net))]));
  for (const l of JB_CTCS) for (const j of JB_SIZES) { const x = joiningBonus(Tax, l * 1e5, j), k = `${l}_${j / 1e5}`; t[`{{JB_${k}_NET}}`] = inr(x.net); t[`{{JB_${k}_TAX}}`] = inr(x.tax); }
  return t;
}
const lakhTxt = n => '₹' + (n / 1e5) + ' lakh';

module.exports = { PF_CTCS, TARGETS, VP_CTCS, JB_CTCS, JB_SIZES, pfRow, ctcFor, joiningBonus, tokens };
