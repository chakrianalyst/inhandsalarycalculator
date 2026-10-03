/* Generates the "₹X LPA in-hand salary" pages + hub from the real tax engine. */
const LPAS = [...Array.from({ length: 28 }, (_, i) => i + 3), 35, 40, 45, 50];   // 3..30, 35, 40, 45, 50
const BASE = { basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 };
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const f = n => { n = Math.round(n); return (n < 0 ? '−' : '') + '₹' + inr.format(Math.abs(n)); };
const fileFor = l => `${l}-lpa-in-hand-salary.html`;

function breakevenDeductions(Tax, gross) {       // old-regime deductions (beyond std) needed for old tax to equal new tax
  const newTax = Tax.computeTax(Math.max(0, gross - 75000), 'new').total;
  if (Tax.computeTax(Math.max(0, gross - 50000), 'old').total <= newTax) return 0;
  let lo = 0, hi = gross;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; Tax.computeTax(Math.max(0, gross - 50000 - mid), 'old').total > newTax ? lo = mid : hi = mid; }
  return hi;
}

function head({ file, title, desc, h1, crumb }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | RupeeCheck</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="https://inhand.example/${file}">
<link rel="stylesheet" href="assets/style.css">
<script>try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<main>
  <div class="container page-hero">
    <div class="crumbs"><a href="index.html">Home</a> › <a href="in-hand-salary-by-ctc.html">Salary by CTC</a> › ${crumb}</div>
    <h1>${h1}</h1>`;
}
const tail = `
</main>
<script src="assets/tax.js"></script>
<script src="assets/common.js"></script>
<script>Common.init('salary');</script>
</body>
</html>
`;

function ctcPage(Tax, lpa) {
  const ctc = lpa * 100000, r = Tax.salary({ ...BASE, ctc }), n = r.new, o = r.old, b = r[r.best];
  const idx = LPAS.indexOf(lpa), prev = LPAS[idx - 1], next = LPAS[idx + 1];
  const rp = prev ? Tax.salary({ ...BASE, ctc: prev * 1e5 }) : null, rn = next ? Tax.salary({ ...BASE, ctc: next * 1e5 }) : null;
  const pct = Math.round(b.inHandYear / ctc * 100), be = breakevenDeductions(Tax, r.gross);
  const file = fileFor(lpa), title = `₹${lpa} LPA CTC In-Hand Salary (Monthly Take-Home) FY 2026-27`;
  const desc = `Monthly in-hand salary for ₹${lpa} LPA CTC is about ${f(b.inHandMonth)} (${r.best} regime). See PF, tax, and old vs new regime breakdown for FY 2026-27.`;
  const faq = [
    [`What is the in-hand salary for ₹${lpa} LPA?`, `On a ₹${lpa} lakh CTC, your monthly in-hand salary is about ${f(b.inHandMonth)} under the ${r.best} regime (${f(n.inHandMonth)} new vs ${f(o.inHandMonth)} old with no deductions claimed), assuming 40% basic, PF on full basic, and Karnataka professional tax (${f(r.pt)} a year).`],
    [`How much income tax is payable on ₹${lpa} LPA?`, n.tax === 0 ? `Nothing under the new regime: taxable income of ${f(n.taxable)} is within the ₹12 lakh rebate limit. Under the old regime with no deductions, tax would be ${f(o.tax)}.` : `About ${f(n.tax)} a year under the new regime (taxable income ${f(n.taxable)}) and ${f(o.tax)} under the old regime with no deductions claimed, including 4% cess.`],
    [`Which tax regime is better at ₹${lpa} LPA?`, be === 0 ? `The old regime does not beat the new regime at this income with typical deductions, so the new regime is the better choice.` : `The new regime is better unless you can claim about ${f(be)} or more in old-regime deductions (HRA, 80C, 80D, home-loan interest and similar) on top of the standard deduction.`],
  ];
  const row = (a, x, y, cls = '') => `<tr class="${cls}"><td>${a}</td><td>${f(x)}</td><td>${f(y)}</td></tr>`;
  const steps = [`Start with an annual CTC of <strong>${f(ctc)}</strong>.`, `Remove employer PF (${f(r.employerPf)}) and gratuity (${f(r.gratuity)}), which are not paid as cash: gross salary is <strong>${f(r.gross)}</strong>.`,
    `Subtract your own PF (${f(r.employeePf)}) and professional tax (${f(r.pt)}).`, `Subtract income tax: <strong>${f(b.tax)}</strong> under the ${r.best} regime.`, `What is left, <strong>${f(b.inHandYear)}</strong> a year, is about <strong>${f(b.inHandMonth)}</strong> a month.`];
  const sib = LPAS.filter(x => x !== lpa).map(x => `<a class="tool-card" href="${fileFor(x)}" style="padding:14px 16px"><h3 style="font-size:.95rem">₹${x} LPA</h3><span class="go">In-hand →</span></a>`).join('');
  const body = `
    <p>A CTC of ₹${lpa} lakh per annum gives a monthly in-hand salary of about <strong>${f(b.inHandMonth)}</strong> in FY 2026-27, which is ${pct}% of your CTC. Here is exactly how that number is reached.</p>
  </div>
  <div class="container" style="max-width:880px">
    <div class="hero-result"><div class="lbl">Monthly in-hand on ₹${lpa} LPA (${r.best} regime)</div><div class="big">${f(b.inHandMonth)}</div><div class="sub">${f(b.inHandYear)} per year · ${pct}% of CTC</div><span class="pill">Best regime: ${r.best === 'new' ? 'New' : 'Old'}${r.saving >= 1 ? ' — saves ' + f(r.saving) + '/yr' : ''}</span></div>
    <div class="card" style="margin-bottom:18px"><h2 class="card-title">Old vs new regime (yearly)</h2><div class="tbl-wrap"><table class="tbl">
      <tr><th></th><th>New regime</th><th>Old regime</th></tr>
      ${row('Gross salary', r.gross, r.gross)}${row('Deductions claimed', n.deductions, o.deductions, 'pos')}${row('Taxable income', n.taxable, o.taxable)}
      ${row('Income tax + cess', -n.tax, -o.tax, 'neg')}${row('Employee PF', -r.employeePf, -r.employeePf, 'neg')}${row('Professional tax', -r.pt, -r.pt, 'neg')}
      ${row('In-hand per year', n.inHandYear, o.inHandYear, 'total')}${row('In-hand per month', n.inHandMonth, o.inHandMonth, 'total')}</table></div></div>
    <div class="offer" style="margin:0 0 18px"><div><b>Your numbers differ?</b><small>Change basic %, rent, variable pay and deductions in the full calculator.</small></div><a class="btn btn-primary btn-sm" href="salary-calculator.html?ctc=${ctc}">Customise this →</a></div>
  </div>
  <div class="container"><div class="ad-slot"></div></div>
  <article class="container prose">
    <h2>How ₹${lpa} LPA becomes ${f(b.inHandMonth)} a month</h2>
    <ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <p>These figures assume 40% basic salary, PF on the full basic, gratuity inside CTC, professional tax of ₹200 a month (${f(r.pt)} a year; your state may differ), a metro city and no other deductions. Your payslip can differ if your employer structures pay differently.</p>
    ${rp || rn ? `<h2>What a raise would mean</h2><ul>${rp ? `<li>From ₹${prev} LPA to ₹${lpa} LPA adds about <strong>${f(b.inHandMonth - rp[rp.best].inHandMonth)}</strong> a month in-hand.</li>` : ''}${rn ? `<li>From ₹${lpa} LPA to ₹${next} LPA adds about <strong>${f(rn[rn.best].inHandMonth - b.inHandMonth)}</strong> a month in-hand.</li>` : ''}</ul>` : ''}
    <h2>Frequently asked questions</h2>
    <div class="faq">${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <p style="margin-top:22px"><a class="btn btn-primary" href="salary-calculator.html?ctc=${ctc}">Open the full salary calculator →</a></p>
  </article>
  <div class="container section"><div class="section-head"><h2>In-hand salary at other CTCs</h2></div><div class="tool-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${sib}</div></div>`;
  return { file, html: head({ file, title, desc, h1: `₹${lpa} LPA CTC: In-Hand Salary <span class="grad-text">per month</span>`, crumb: `₹${lpa} LPA` }) + body + tail };
}

function hubPage(Tax) {
  const rows = LPAS.map(l => { const r = Tax.salary({ ...BASE, ctc: l * 1e5 }), b = r[r.best];
    return `<tr><td><a href="${fileFor(l)}">₹${l} LPA</a></td><td>${f(r.new.inHandMonth)}</td><td>${f(r.old.inHandMonth)}</td><td>${f(b.tax)}</td><td>${r.best === 'new' ? 'New' : 'Old'}</td></tr>`; }).join('');
  const file = 'in-hand-salary-by-ctc.html', title = 'In-Hand Salary by CTC Chart (₹3 LPA to ₹50 LPA) FY 2026-27';
  const desc = 'Monthly in-hand salary for every CTC from ₹3 LPA to ₹50 LPA in India, under the new and old tax regimes, for FY 2026-27.';
  return { file, html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | RupeeCheck</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="https://inhand.example/${file}">
<link rel="stylesheet" href="assets/style.css">
<script>try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<main>
  <div class="container page-hero"><div class="crumbs"><a href="index.html">Home</a> › Salary by CTC</div>
    <h1>In-Hand Salary by CTC <span class="grad-text">(₹3 – ₹50 LPA)</span></h1>
    <p>Find your monthly take-home for any CTC. Click a row for the full breakdown, or use the <a href="salary-calculator.html">custom calculator</a>.</p></div>
  <div class="container" style="max-width:880px"><div class="card"><div class="tbl-wrap"><table class="tbl">
    <tr><th>CTC</th><th>Monthly in-hand (new)</th><th>Monthly in-hand (old)</th><th>Yearly tax</th><th>Better</th></tr>${rows}</table></div>
    <p style="margin-top:14px;font-size:.85rem;color:var(--muted)">Assumes 40% basic, PF on full basic, gratuity inside CTC, ₹200 a month professional tax, metro city, and no deductions claimed under the old regime. Tax Year 2026-27 (FY 2026-27).</p></div></div>
</main>
<script src="assets/tax.js"></script>
<script src="assets/common.js"></script>
<script>Common.init('salary');</script>
</body>
</html>
` };
}

module.exports = { LPAS, ctcPage, hubPage, breakevenDeductions, fileFor, BASE };
