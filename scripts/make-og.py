#!/usr/bin/env python3
"""Make the per-page social share images (1200x630) in assets/og/.

Each page named in PAGES gets its own image so a link shared on LinkedIn, WhatsApp or X shows the right topic.
Pages without an image use the default assets/og.png (see scripts/build.js).
The text is evergreen on purpose: no figures that could go stale when rules change.

Run:  python3 scripts/make-og.py        (needs Pillow; reuses the skill's image maker and bundled fonts)
Then commit the new PNGs in assets/og/.
"""
import importlib.util, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('render_card', os.path.join(ROOT, 'skills', 'rupeecheck-content', 'scripts', 'render_card.py'))
rc = importlib.util.module_from_spec(spec); spec.loader.exec_module(rc)

CHIPS = ['Free', 'No signup', 'Runs in your browser']

# page file (without .html): (headline with **accent**, subtitle)
PAGES = {
    'return-calculator': ('When can you **afford to move back** to India?', 'What you would bring home after tax and costs, against what the life you want needs'),
    'abroad-calculator': ('Is moving **abroad** worth it, in rupees?', 'India against the US, Canada, UK, Germany, Australia, Singapore or UAE'),
    'salary-calculator': ('From CTC to **in-hand salary**', 'Monthly take-home with PF, tax and both regimes, FY 2026-27'),
    'sip-calculator': ('How much **SIP** gets you there?', 'Monthly SIP, lump sum or a goal, with step-up, tax and inflation'),
    'emi-calculator': ('Your loan **EMI**, and how to cut it', 'Home, car and personal loans, with prepayment and a full schedule'),
    'articles': ('Money articles that end in **your own numbers**', 'Salary, tax, loans, layoffs, retirement and moving abroad, worked out with our calculators'),
    '12-lakh-no-tax-explained': ('“No tax up to ₹12 lakh”: what it **really means**', 'Your CTC, the strip just above the limit, and the income that catches people out'),
    'compare-two-job-offers': ('Two job offers? Compare them **beyond the CTC**', 'In-hand pay, city costs, variable pay, ESOPs and raises, in money you can spend'),
    'salary-hike-in-hand-reality': ('What your hike **really adds** to your bank', 'Tax, PF and inflation all take a cut before a raise reaches you'),
    'pay-rent-to-parents-hra': ('Rent to parents for HRA: does it **still save tax**?', 'The rules, the paperwork, and the old vs new regime maths'),
    'gratuity-rules-explained': ('Gratuity: the **5-year rule** and the new labour codes', 'The formula, the rounding rule, and what changed for fixed-term staff'),
    'laid-off-in-india-money-plan': ('Laid off? A **money plan** for the first 30 days', 'Your runway, settlement tax, PF, EMIs and health cover, in order'),
    'prepay-home-loan-or-invest': ('Prepay your home loan or **invest**?', 'And why cutting the tenure beats cutting the EMI'),
    'sip-delay-cost-of-waiting': ('SIP at 25 vs 35: the **cost of waiting**', 'Compounding, step-up SIPs and what big numbers mean in today’s money'),
    'fd-interest-tax-explained': ('How much of your **FD interest** do you keep?', 'Slab rates, the rebate trap, TDS and Form 15G/15H'),
    'monthly-income-from-mutual-funds-swp': ('Monthly income from mutual funds: **how much is safe**?', 'Rising withdrawals, cautious returns, and tax on the profit part only'),
    'retire-early-india-how-much': ('How much do you need to **retire early** in India?', 'Your FIRE number, and the levers that move your retirement age'),
    'rent-or-buy-house-india': ('Rent or buy a home? **The honest maths**', 'Rental yield, break-even and the assumption most comparisons hide'),
    'is-moving-abroad-worth-it': ('Is a job abroad **really worth more**?', 'Compare savings, not salaries: the city decides as much as the country'),
    'moving-back-to-india-money-checklist': ('Moving back to India? **The money questions** first', 'Can you afford it now, what a job changes, and the RNOR window'),
    'how-to-calculate-net-worth': ('How to calculate your **net worth**', 'What to count, at what value, and the three numbers worth tracking'),
    'life-events-cost-net-worth': ('What life’s big events do to **your wealth**', 'A wedding, a home, a child, a car, and the habits that matter more'),
    'layoff-runway-calculator': ('Laid off? How long will your **money last**?', 'Savings and final settlement after tax, at your spending today and if you cut back'),
    'swp-calculator': ('How long will your **SWP** last?', 'Monthly withdrawals that rise each year, the tax on profit only, and the safe amount'),
    'fd-calculator': ('FD and RD **returns**, after tax', 'Maturity, payout, tax on interest and real return after inflation'),
    'gratuity-calculator': ('Your **gratuity**, worked out', 'The 15/26 formula, eligibility, tax and what you would get if you stay longer'),
    'hra-calculator': ('Your **HRA exemption**', 'The three-way test, the metro list and the rent needed for full exemption'),
    'fire-calculator': ('When can you **retire early**?', 'Corpus needed, earliest age, lean and fat FIRE, and a stress test'),
    'rent-vs-buy-calculator': ('**Rent or buy** a home?', 'Net worth over time, the break-even year and the tax effect'),
    'networth-calculator': ('What is your **net worth**?', 'Assets, liabilities, allocation and a health score'),
    'old-vs-new-tax-regime': ('**Old or new** tax regime?', 'FY 2026-27 slabs, deductions and the level where the old regime wins'),
    'offer-comparison': ('Which job **offer** pays more?', 'Real in-hand salary, bonus, ESOPs and rent, side by side'),
    'salary-hike-calculator': ('What does your **hike** really give you?', 'The real in-hand raise after tax and PF, and what is left after inflation'),
    'life-simulator': ('Will your money **last**?', 'Add a home, marriage, children or a career break and see in plain English'),
    'sip-for-1-crore': ('SIP for **₹1 crore**', 'Monthly SIP for 5 to 30 years at 8% to 15% a year'),
    'new-tax-regime-slabs-fy-2026-27': ('New tax regime **slabs**, FY 2026-27', 'Rates, the ₹75,000 standard deduction and the ₹12 lakh rebate'),
    'hra-exemption-rules': ('**HRA exemption** rules', 'The formula, which cities count as metro, and a worked example'),
    'professional-tax-by-state': ('**Professional tax** in India', 'What it is, what salaried people usually pay, and which states charge it'),
    'ctc-vs-in-hand-salary': ('**CTC** vs in-hand salary', 'Where the difference goes: PF, gratuity, professional tax and income tax'),
    'emi-per-lakh-table': ('**EMI per ₹1 lakh**, by rate and tenure', 'Work out any loan quickly'),
    'net-worth-by-age': ('**Net worth** by age', 'A simple benchmark, and what it does not tell you'),
}


def render(slug, headline, sub, out):
    W, H, pad = 1200, 630, 80
    th = rc.THEMES['dark']
    cv = rc.Canvas(W, H, th)
    rc.header(cv, {}, W, pad - 8)                                          # brand mark and name
    def block(c, y0):                                                      # headline and subtitle; returns where they end
        y = rc.draw_rich(c, pad, y0, headline, 76, True, th['text'], th['accent'], W - 2 * pad, 1.1, 3, 52, balance=True)
        return rc.draw_rich(c, pad, y + 14, sub, 32, False, th['muted'], th['text'], W - 2 * pad, 1.3, 2, 22)
    h = block(rc.Canvas(W, H, th), 0)                                      # measure on a scratch canvas, then centre the block between the brand and the chips
    block(cv, 150 + max(0, (H - pad - 60 - 150 - h) / 2))
    x = pad
    for c in CHIPS:
        f = rc.font(24, True)
        w = cv.width(c, f) + 44
        cv.rrect((x, H - pad - 22, x + w, H - pad + 36), 29, fill=th['panel'])
        cv.text((x + 22, H - pad + 7), c, f, th['text'], 'lm')
        x += w + 14
    cv.save(out)


def main(argv):
    out_dir = os.path.join(ROOT, 'assets', 'og')
    os.makedirs(out_dir, exist_ok=True)
    only = set(argv)
    for slug, (headline, sub) in PAGES.items():
        if only and slug not in only:
            continue
        render(slug, headline, sub, os.path.join(out_dir, slug + '.png'))
        print('assets/og/%s.png' % slug)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
