/* Figures for the offer-letter guides, worked out at build time by the Indian tax engine with the same typical structure as the
   ₹X LPA pages (40% basic, HRA 50% of basic, gratuity inside CTC, ₹200 a month professional tax, whichever regime leaves more):
   - 12% PF vs a fixed ₹1,800 PF, at each CTC
   - the CTC that gives a monthly in-hand amount (the salary calculator worked backwards) */
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
  return t;
}

module.exports = { PF_CTCS, TARGETS, pfRow, ctcFor, tokens };
