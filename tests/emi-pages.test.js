// The "EMI for ₹X loan" pages: every figure on them comes from the loan and tax engines, and they agree with each other.
const test = require('node:test'), assert = require('node:assert');
const Loan = require('../assets/loan.js'), Tax = require('../assets/tax.js'), EMI = require('../scripts/emi-pages.js'), CTC = require('../scripts/ctc-pages.js');
const inr = n => '₹' + new Intl.NumberFormat('en-IN').format(Math.round(n));

test('known EMIs: ₹20 lakh and ₹1 crore at 8.5% for 20 years, ₹5 lakh at 10.5% for 5 years', () => {
  assert.equal(Math.round(EMI.figures(Loan, Tax, 20).emi), 17356);
  assert.equal(Math.round(EMI.figures(Loan, Tax, 100).emi), 86782);
  assert.equal(Math.round(EMI.figures(Loan, Tax, 5).emi), 10747);
});

test('every page shows the engine EMI, total interest, a full rate grid, and a salary link that keeps the EMI within 40% of take-home', () => {
  for (const l of EMI.AMOUNTS) {
    const F = EMI.figures(Loan, Tax, l), { html, file } = EMI.emiPage(Loan, Tax, l);
    assert.equal(file, EMI.fileFor(l));
    assert.ok(html.includes(inr(F.emi)), file + ' shows the EMI'); assert.ok(html.includes(inr(F.S.interest)), file + ' shows the total interest');
    for (const r of F.K.rates) for (const t of F.K.tenures) assert.ok(html.includes(inr(Loan.emi(F.P, r, t * 12))), `${file}: grid has ${r}% for ${t} years`);
    if (F.sal) {
      assert.ok(html.includes(`href="${CTC.fileFor(F.sal.lpa)}"`), file + ' links to the matching salary page');
      const i = CTC.LPAS.indexOf(F.sal.lpa), at = lpa => { const r = Tax.salary({ ...CTC.BASE, ctc: lpa * 1e5 }); return r[r.best].inHandMonth; };
      assert.ok(at(F.sal.lpa) * 0.4 >= F.emi, file + ': that salary covers the EMI'); if (i > 0) assert.ok(at(CTC.LPAS[i - 1]) * 0.4 < F.emi, file + ': and it is the lowest that does');
    }
    assert.ok(F.X.interest < F.S.interest && F.X.months < F.S.months, file + ': paying extra saves interest and time');
    assert.match(html, /<title>[^<]{10,62} \| RupeeCheck<\/title>/, file + ' has a short title');
    assert.ok(html.includes(`emi-calculator.html?amt=${F.P}&amp;rate=${F.K.rate}&amp;yrs=${F.K.years}`), file + ' opens the calculator with the same loan');
  }
});
