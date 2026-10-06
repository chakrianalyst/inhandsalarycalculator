# Site facts

Everything here is true of RupeeCheck as of the engine build date in `engine/ENGINE.json`. If a claim you want to make is not here, verify it before using it.

Contents: [About the site](#about-the-site) · [Pages](#pages-by-topic) · [Rules inside the engine](#rules-inside-the-engine) · [What the site does not do](#what-the-site-does-not-do) · [Words to use and avoid](#words-to-use-and-avoid)

## About the site
- **Name and address:** RupeeCheck, https://rupeecheck.in. Free, no signup.
- **Privacy, stated accurately:** calculations run in the visitor's browser, and what they type is not sent to the site's servers. Some tools keep entries in the browser's own storage. The Share button creates a link that contains the entered numbers in its address.
- **Not yet reviewed by a chartered accountant.** The methodology page says so. Never write "CA-verified" or "expert-approved".
- **Tax year language:** the Income-tax Act, 2025 applies from 1 April 2026 and calls the period a *tax year*. Write "Tax Year 2026-27 (FY 2026-27)". The older "AY 2027-28" is outdated.
- Estimates for education; not tax or investment advice.

## Pages by topic
Base address https://rupeecheck.in/ followed by the file name.
| Topic | Calculator page | Related guide pages |
|---|---|---|
| CTC to in-hand salary | `salary-calculator.html` | `ctc-vs-in-hand-salary.html`, `in-hand-salary-by-ctc.html`, and one page per salary such as `12-lpa-in-hand-salary.html` (3 to 30 LPA, then 35, 40, 45, 50) |
| Old vs new regime | `salary-calculator.html` | `old-vs-new-tax-regime.html`, `new-tax-regime-slabs-fy-2026-27.html` |
| HRA | `hra-calculator.html` | `hra-exemption-rules.html` |
| Professional tax | field inside the salary calculator | `professional-tax-by-state.html` |
| SIP and goals | `sip-calculator.html` | `sip-for-1-crore.html` |
| SWP (monthly withdrawals) | `swp-calculator.html` | Only the profit part of each withdrawal is taxed (average cost). Equity: 20% within a year, then 12.5% above ₹1.25 lakh of long-term profit a year. The withdrawal is in year-1 rupees and rises by the step-up each year. |
| Home loan EMI | `emi-calculator.html` | `emi-per-lakh-table.html` |
| FD and RD | `fd-calculator.html` | Tax on the interest is worked out from the visitor's yearly salary or pension (`sal`, 0 if the interest is their only income): each year's interest is added on top and taxed under the new regime, so the ₹12 lakh rebate, the higher slabs, surcharge and cess all apply. A big deposit with no other income is not tax-free. |
| Gratuity | `gratuity-calculator.html` | |
| FIRE | `fire-calculator.html` | |
| Rent vs buy | `rent-vs-buy-calculator.html` | |
| Move abroad | `abroad-calculator.html` | |
| Return to India | `return-calculator.html` | Money fields are in **today's** rupees and grow to the return year: spending by India inflation, a job package by the yearly raise (so ₹25 LPA today is about ₹49 LPA after 10 years at 7%). Savings abroad rise by their own yearly percentage. Optional realism settings: months without income after returning, whether the package is today's money or the return-year pay, counting PF and gratuity as savings (cautious default: off), and up to three life events (a one-time or monthly cost in today's money). Also: a blended tax rate on what money earns in India (default 0%, which flatters results), a partner's package in India (taxed on their own, starting the year you return), and a stress card showing 20% and 35% falls in investments abroad just before returning. The tool's maths is checked independently (`verify.js return`); the growth, inflation and exchange-rate settings are assumptions, so call results estimates. |
| Job offers | `offer-comparison.html` | |
| Salary hike | `salary-hike-calculator.html` | |
| Net worth | `networth-calculator.html` | `net-worth-by-age.html` |
| Life plan simulator | `life-simulator.html` | |
Not runnable in the engine (qualitative content only, or numbers supplied by the user): life simulator, net worth, offer comparison. Salary hike = run `salary` at the old and new CTC.

## Rules inside the engine
Built in and tested. Quote them as written; confirm anything beyond them from an official source.
- **New regime slabs (Tax Year 2026-27):** nil to ₹4 L; 5% to ₹8 L; 10% to ₹12 L; 15% to ₹16 L; 20% to ₹20 L; 25% to ₹24 L; 30% above. 4% cess on the tax.
- **Standard deduction:** ₹75,000 (new regime), ₹50,000 (old regime).
- **Rebate:** taxable income up to ₹12 L pays no tax in the new regime (marginal relief just above). So salary up to about **₹12.75 L** (₹12 L plus the ₹75,000 standard deduction), for a salaried person with no other income. Old regime: rebate up to ₹5 L taxable.
- **Surcharge:** 10% above ₹50 L, 15% above ₹1 crore, 25% above ₹2 crore; the new regime stays capped at 25%, the old regime goes to 37% above ₹5 crore.
- **HRA (old regime only):** exempt amount = least of HRA received, rent − 10% of basic, and 50% (metro) or 40% of basic. Eight metros: Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad (Income-tax Rules, 2026, Rule 279, notified 20 March 2026, in force 1 April 2026).
- **Employer NPS:** up to 14% of basic (new regime) or 10% (old regime). Own NPS extra deduction up to ₹50,000 (old regime).
- **PF:** 12% of basic from employee and employer. In the salary tool PF defaults to the full basic. **In the old regime the salary tool automatically counts your own PF under Section 80C** (cap ₹1.5 L) and deducts professional tax, so its "old regime, no deductions" figure is not the standard deduction alone (₹12 LPA: ₹78,284 a month, not about ₹76,800). Describe it as "old regime with only your PF under 80C", never as "no deductions".
- **Professional tax:** at most ₹2,500 a year by law. The site asks the user for the monthly amount on their payslip (default ₹200).
- **Gratuity:** wage × 15 ÷ 26 × completed years (rounded up at 6 months). Eligible after 5 years of continuous service for covered employees; the labour-code changes for fixed-term employees are built in but still need professional confirmation. Tax-free limit ₹20 lakh.
- **Equity gains:** 12.5% above ₹1.25 lakh a year after one year; 20% on short-term gains.
- **FD interest TDS:** ₹50,000 a year (₹1,00,000 for senior citizens) per bank.
- **Abroad figures (2026):** US single filer standard deduction $16,100, Social Security wage base $184,500, 401(k) limit $24,500; Canada, UK, Germany, Australia, Singapore and UAE rules as in `engine/abroad.js`. State, provincial and city taxes are simplified.
- **Exchange-rate defaults, dated in `ENGINE.json`:** US$ ≈ ₹96, C$ 68.5, A$ ~63, S$ ~75, AED 26.1, £ 127.3, € 108.7. Always state the date when using one.

## What the site does not do
Say nothing that suggests otherwise.
- It does not use purchasing-power parity; the abroad tool uses the rent and living costs the user enters, with city starting estimates.
- It does not model state professional-tax slabs, dearness allowance, healthcare inflation in FIRE, or a partner's tax beyond the simple partner option.
- It does not recommend investments, funds or insurance, and affiliate links are not active yet.
- It does not guarantee any outcome: projections are scenarios under stated assumptions.

## Words to use and avoid
- Use: "estimate", "under these assumptions", "about", "in-hand", "Tax Year 2026-27", "free, no signup, runs in your browser".
- Avoid: "exactly", "guaranteed", "always", "never leaves your browser", "CA-verified", "advice", "best", "should buy".
