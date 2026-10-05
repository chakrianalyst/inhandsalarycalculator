# Number protocol

The reason this protocol exists: people take finance numbers seriously, and a post is public forever. A number is publishable only when it has been **run** and **checked a second way**, with its assumptions written down.

## Steps for every number
1. **Fix the scenario.** Write the inputs down (CTC, rate, years, city). Prefer round, relatable inputs (₹12 LPA, ₹50 lakh at 8.5%). One claim, one scenario.
2. **Run it:** `node engine/run.js <tool> '<json>'`. Save the output; it lists inputs, results and assumptions.
3. **Check it:** `node engine/verify.js <tool> '<json>'` with the same inputs.
4. **Read the verdict:**
   - **AGREE**: the site and an independent formula match. Publish as is.
   - **APPROXIMATE**: only a range check was possible. Round to two significant figures and say "about".
   - **UNVERIFIED**: no independent method (long-run projections such as net worth after 10 years, state and city taxes, partner income). Publish only with an "estimate or illustration" label and the assumptions, or find an official source.
   - **MISMATCH**: stop. Re-check your inputs, then the engine. Tell the user. Do not publish.
5. **Check statutory rules you quote** (a rebate limit, a cap, a list) against `site-facts.md`. If it is not there, look it up from an official source now (Income Tax Department, EPFO, the relevant tax authority) and record the source. If you cannot confirm it, leave it out.
6. **Check freshness:** the preflight says how old the engine and the exchange-rate defaults are. Say the date of any exchange rate you use.
7. **Cross-check the site's own pages** when the post links to one: the number in the post should match what a reader sees there with the same inputs. For defaults this is guaranteed; if you changed an input, say so in the post.

## Rounding
- Use `engine/fmt.js`. Indian style: ₹7,69,904; ₹7.7 L; ₹10.3 Cr.
- Round to 2 or 3 significant figures in lakh and crore. Never round in a direction that flatters the claim.
- Keep exact rupees only when exactness is the point (₹88,276 a month).
- "About" for anything approximate; "estimate" for projections.

## Comparisons must be fair
A comparison is only fair if both sides carry the same kinds of cost and saving. When comparing India and abroad, make sure retirement savings and one-off costs are counted on both sides (the abroad tool does this). State the assumption that most affects the answer (exchange rate, rent, return).

## The claims table (include it in your reply)
| Claim | Value | Run | Independent check | Assumptions / source |
|---|---|---|---|---|
| In-hand a month at ₹12 LPA | ₹88,276 | `run.js salary` | AGREE (verify.js) | 40% basic, new regime, ₹200 professional tax, Tax Year 2026-27 |
Keep one row per figure used in the content. It lets the user see at a glance why each number can be trusted, and what to update if a rule changes.

## When something does not match
- Two methods disagree: the post waits. Report both numbers and the likely cause.
- The user supplies a number that disagrees with the calculator: do not argue; check their inputs, show the working, and note that payslips differ (DA, reimbursements, insurance, other deductions).
- The tool cannot compute what the user wants: say so, and offer a clearly labelled qualitative post.
