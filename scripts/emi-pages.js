/* Generates the "EMI for ₹X lakh loan" pages from the real loan engine (assets/loan.js) and the tax engine (for the salary you need). */
const CTC = require('./ctc-pages.js');
// Small loans are usually car or personal loans; from ₹15 lakh up they are usually home loans. Each kind gets its own typical rate, tenure and grid.
const KINDS = {
  small: { name: 'car or personal loan', rate: 10.5, years: 5, rates: [9, 10, 10.5, 11, 12, 14, 16], tenures: [1, 2, 3, 5, 7] },
  home: { name: 'home loan', rate: 8.5, years: 20, rates: [7.5, 8, 8.5, 9, 9.5, 10], tenures: [10, 15, 20, 25, 30] },
};
const AMOUNTS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];              // in lakh
const FOIR = 0.4;                                                                     // lenders usually let all EMIs take up to 40–50% of take-home; 40% is the careful end
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const f = n => { n = Math.round(n); return (n < 0 ? '−' : '') + '₹' + inr.format(Math.abs(n)); };
const cr = n => n >= 1e7 ? '₹' + (+(n / 1e7).toFixed(2)) + ' Cr' : '₹' + (+(n / 1e5).toFixed(2)) + ' L';
const kindOf = l => (l <= 10 ? 'small' : 'home');
const label = l => (l >= 100 ? `₹${l / 100} crore` : `₹${l} lakh`);
const fileFor = l => `emi-for-${l >= 100 ? l / 100 + '-crore' : l + '-lakh'}-loan.html`;
const yrs = n => n + (n === 1 ? ' year' : ' years');
const span = m => { const y = Math.floor(m / 12), r = m % 12; return [y && yrs(y), r && r + (r === 1 ? ' month' : ' months')].filter(Boolean).join(' '); };

/** The lowest CTC (from the in-hand salary pages) whose take-home keeps this EMI within 40% of it. */
function salaryFor(Tax, emi) {
  for (const l of CTC.LPAS) { const r = Tax.salary({ ...CTC.BASE, ctc: l * 1e5 }); if (r[r.best].inHandMonth * FOIR >= emi) return { lpa: l, inHand: r[r.best].inHandMonth }; }
  return null;
}

function figures(Loan, Tax, l) {
  const K = KINDS[kindOf(l)], P = l * 1e5, n = K.years * 12, S = Loan.schedule({ P, rate: K.rate, n });
  const extra = Math.max(500, Math.round(S.emi * 0.1 / 500) * 500), X = Loan.schedule({ P, rate: K.rate, n, extra });
  return { K, P, n, S, emi: S.emi, extra, X, need: S.emi / FOIR, sal: salaryFor(Tax, S.emi), y1: S.years[0] };
}

function emiPage(Loan, Tax, l) {
  const F = figures(Loan, Tax, l), { K, P, n, S, emi, extra, X, need, sal, y1 } = F, file = fileFor(l), amt = label(l);
  const kindTitle = kindOf(l) === 'home' ? 'Home Loan' : 'Loan (Car or Personal)';
  const title = `EMI for ${amt.replace('lakh', 'Lakh').replace('crore', 'Crore')} ${kindTitle} by Rate and Tenure`;
  const desc = `EMI on a ${amt} ${K.name} at ${K.rate}% for ${yrs(K.years)} is ${f(emi)} a month. See EMIs from ${K.rates[0]}% to ${K.rates[K.rates.length - 1]}%, total interest, and the salary you need.`;
  const grid = `<tr><th>Interest rate</th>${K.tenures.map(t => `<th>${yrs(t)}</th>`).join('')}</tr>` + K.rates.map(r => `<tr class="${r === K.rate ? 'sel' : ''}"><td>${r}%</td>${K.tenures.map(t => `<td>${f(Loan.emi(P, r, t * 12))}</td>`).join('')}</tr>`).join('');
  const ten = `<tr><th>Tenure</th><th>EMI</th><th>Total interest</th><th>Total you repay</th></tr>` + K.tenures.map(t => { const e = Loan.emi(P, K.rate, t * 12); return `<tr class="${t === K.years ? 'sel' : ''}"><td>${yrs(t)}</td><td>${f(e)}</td><td>${cr(e * t * 12 - P)}</td><td>${cr(e * t * 12)}</td></tr>`; }).join('');
  const short = K.tenures[0], long = K.tenures[K.tenures.length - 1], eS = Loan.emi(P, K.rate, short * 12), eL = Loan.emi(P, K.rate, long * 12);
  const salLine = sal ? `To keep this EMI within 40% of your take-home, you need about <strong>${f(need)}</strong> a month in hand. That is roughly a <a href="${CTC.fileFor(sal.lpa)}">₹${sal.lpa} LPA</a> salary.` : `To keep this EMI within 40% of your take-home, you need about <strong>${f(need)}</strong> a month in hand, more than a ₹50 LPA salary gives. Borrowers usually add a co-applicant's income.`;
  const faq = [
    [`What is the EMI for a ${amt} loan?`, `At ${K.rate}% for ${yrs(K.years)}, the EMI on ${amt} is ${f(emi)} a month. At ${K.rates[0]}% it is ${f(Loan.emi(P, K.rates[0], n))}, and at ${K.rates[K.rates.length - 1]}% it is ${f(Loan.emi(P, K.rates[K.rates.length - 1], n))}.`],
    [`How much interest will I pay on ${amt}?`, `About ${f(S.interest)} over ${yrs(K.years)} at ${K.rate}%, so you repay ${f(S.paid)} in total. A ${short}-year tenure cuts the interest to ${f(eS * short * 12 - P)}, with a higher EMI of ${f(eS)}.`],
    [`What salary do I need for a ${amt} loan?`, sal ? `Lenders usually want all your EMIs to stay within 40 to 50% of your take-home pay. Keeping ${f(emi)} within 40% needs about ${f(need)} a month in hand, roughly a ₹${sal.lpa} LPA salary. Existing EMIs reduce how much you can borrow.` : `Keeping ${f(emi)} within 40% of take-home needs about ${f(need)} a month in hand. Most people add a co-applicant's income for a loan this size.`],
    [`How can I reduce the interest on ${amt}?`, `Pay a little extra every month. Adding ${f(extra)} to the ${f(emi)} EMI saves about ${f(S.interest - X.interest)} of interest and ends the loan ${span(S.months - X.months)} sooner, at ${K.rate}% over ${yrs(K.years)}.`],
  ];
  const sib = AMOUNTS.filter(x => x !== l).map(x => `<a class="tool-card" href="${fileFor(x)}" style="padding:14px 16px"><h3 style="font-size:.95rem">${label(x)}</h3><span class="go">EMI →</span></a>`).join('');
  const html = `<!doctype html>
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
    <div class="crumbs"><a href="index.html">Home</a> › <a href="emi-per-lakh-table.html">EMI tables</a> › ${amt} loan</div>
    <h1>EMI for a ${amt} loan <span class="grad-text">per month</span></h1>
    <p>The monthly EMI on ${amt} at every common interest rate and tenure, what the loan really costs, and the salary you need for it. Worked out with the same reducing-balance formula banks use.</p>
  </div>
  <div class="container" style="max-width:880px">
    <div class="hero-result"><div class="lbl">EMI on ${amt} at ${K.rate}% for ${yrs(K.years)}</div><div class="big">${f(emi)}<span class="per">a month</span></div><div class="sub">A typical ${K.name}. You repay ${f(S.paid)} in total, ${f(S.interest)} of it interest.</div><span class="pill">Salary needed: about ${f(need)} a month in hand</span></div>
    <div class="card" style="margin-bottom:18px"><h2 class="card-title">💡 Good to know</h2><ul class="facts">
      <li>In the first year, <b>${f(y1.interest)}</b> of your EMIs goes to interest and only ${f(y1.principal)} reduces the loan.</li>
      <li>A ${short}-year loan costs <b>${f(eS)}</b> a month; stretching it to ${yrs(long)} lowers the EMI to ${f(eL)} but adds <b>${cr(eL * long * 12 - eS * short * 12)}</b> of interest.</li>
      <li>Paying <b>${f(extra)}</b> extra each month saves about <b>${f(S.interest - X.interest)}</b> of interest and ends the loan ${span(S.months - X.months)} sooner.</li>
      <li>${salLine}</li>
    </ul></div>
    <div class="card" style="margin-bottom:18px"><h2 class="card-title">📋 EMI on ${amt} by rate and tenure</h2><div class="tbl-wrap"><table class="tbl">${grid}</table></div>
      <p class="cap" style="margin-top:10px">Monthly EMI, reducing-balance interest. The highlighted row is the typical ${K.name} rate.</p></div>
    <div class="card" style="margin-bottom:18px"><h2 class="card-title">⏳ What the tenure costs you, at ${K.rate}%</h2><div class="tbl-wrap"><table class="tbl">${ten}</table></div></div>
    <div class="offer" style="margin:0 0 18px"><div><b>Your rate or tenure is different?</b><small>Add extra payments, a processing fee, or check the loan you can afford.</small></div><a class="btn btn-primary btn-sm" href="emi-calculator.html?amt=${P}&amp;rate=${K.rate}&amp;yrs=${K.years}&amp;mon=0">Customise this →</a></div>
  </div>
  <article class="container prose">
    <h2>How the EMI on ${amt} is worked out</h2>
    <p>EMI = P × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> − 1). Here P is ${f(P)}, r is the monthly rate (${K.rate}% ÷ 12 = ${(K.rate / 12).toFixed(4)}%) and n is ${n} monthly instalments. Each month the bank charges interest on what you still owe, and the rest of the EMI reduces the loan. That is why early EMIs are mostly interest.</p>
    <p>Rates change with your credit score, the lender and the type of loan. ${kindOf(l) === 'home' ? 'Most home loans are on a floating rate, so the EMI or the tenure can change when rates move. Prepaying a floating-rate home loan usually carries no fee for individuals.' : 'Car loans are usually cheaper than personal loans, which are unsecured. Some lenders charge a fee for prepaying, so check before you pay extra.'}</p>
    <h2>Frequently asked questions</h2>
    <div class="faq">${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <p class="note-small">Figures are estimates for illustration and use monthly reducing-balance EMIs. Processing fees, insurance and taxes are not included. Check the exact terms with your lender.</p>
  </article>
  <div class="container section"><div class="section-head"><h2>EMI on other loan amounts</h2></div><div class="tool-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${sib}</div></div>
</main>
<script src="assets/tax.js"></script>
<script src="assets/common.js"></script>
<script>Common.init('emi');</script>
</body>
</html>
`;
  return { file, html };
}

/** Links to every amount page, for the EMI-per-lakh guide. */
const links = () => `<div class="tool-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${AMOUNTS.map(x => `<a class="tool-card" href="${fileFor(x)}" style="padding:14px 16px"><h3 style="font-size:.95rem">${label(x)}</h3><span class="go">EMI →</span></a>`).join('')}</div>`;

module.exports = { AMOUNTS, KINDS, emiPage, figures, fileFor, label, links, salaryFor };
