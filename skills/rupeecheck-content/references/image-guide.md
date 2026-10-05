# Image guide

The renderer is `scripts/render_card.py`. It draws with Pillow only (no browser) in the RupeeCheck look: deep indigo gradient, soft glows, rounded panels, bold numbers, a purple highlight row for the number that matters.

Contents: [Which template](#which-template) · [Sizes](#sizes-by-platform) · [Spec examples](#spec-examples) · [Design rules](#design-rules) · [Check your work](#check-your-work) · [Alt text](#alt-text)

## Which template
| Template | Use it for | Needs |
|---|---|---|
| `compare` | Two or three things side by side (India vs abroad, old vs new regime, rent vs buy) | `columns`, `rows` (one `highlight` row for the verdict) |
| `stat` | One big number and where it comes from | `number`, `number_label`, optional `rows` |
| `myth` | A belief against the math | `myth`, `math`, `math_label` |
| `bars` | A pattern across values (SIP by years, in-hand by CTC) | `items` with `value`, `display`, one `highlight` |
| carousel | A story over several slides | `slides`: a list of any of the above |

One idea per image. If you need two numbers to explain it, use `compare`; if you need five, make a carousel.

## Sizes by platform
| Platform | Size | Notes |
|---|---|---|
| Instagram feed and carousel | `portrait` 1080×1350 | Carousels up to 6 to 8 slides; the PDF is a bonus for other uses |
| Instagram story or reel cover | `story` 1080×1920 | Keep the key number in the middle third |
| Facebook | `portrait` or `link` 1200×630 | `link` suits a post that shares a page |
| X | `landscape` 1600×900 | Shows uncropped in the feed |
| Reddit, Quora | `square` 1080×1080 | Use rarely; text tables often work better |

## Spec examples
Comparison (use `highlight: true` on exactly one row):
```json
{"template":"compare","size":"portrait","title":"Old vs new regime at **₹15 L**","subtitle":"Tax Year 2026-27, salaried",
 "columns":["New","Old"],
 "rows":[{"label":"Tax with only the standard deduction","values":["₹97,500","₹2.57 L"]},{"label":"Old wins only if deductions exceed","values":["","₹5.44 L"],"highlight":true}],
 "note":"Estimate. Deductions are on top of the standard deduction. Please confirm with a CA.","footer":"rupeecheck.in/old-vs-new-tax-regime.html"}
```
Stat:
```json
{"template":"stat","title":"₹12 LPA is **not** ₹1 lakh a month","number":"₹88,276","number_label":"reaches your bank every month",
 "rows":[{"label":"Your PF + employer PF","values":["₹1,15,200"]}],"callouts":["**₹1,38,288** of the gap is your own PF and gratuity."],"footer":"rupeecheck.in/salary-calculator.html"}
```
Carousel: `{"name":"sip-carousel","size":"portrait","footer":"...","slides":[{...},{...}]}` then `render_card.py spec.json out_folder/`.
Wrap words in `**double asterisks**` in `title` and `callouts` to colour them. Themes: `dark` (default, the brand) and `light`.

## Design rules
- **One hero number.** The number that carries the idea is the biggest thing on the image.
- **Short labels.** If a label does not fit on one line at a readable size, shorten the words, not the font.
- **Show assumptions in `note`** in one or two lines. It reads as honest, and it protects the user.
- **The address in `footer`** is the exact page the post is about.
- **Do not overfill.** Up to 4 table rows, 2 callouts. More means a carousel.
- **Contrast.** Keep the default colours; they pass contrast on the gradient.
- Do not put a real person's name, photo or salary on an image.

## Check your work
After rendering, **open the PNG and look at it**. Check: nothing is clipped or overlapping, the title does not leave a lonely last word, the highlight row is the verdict, the numbers match the run exactly, and the footer is readable. Fix the spec and re-render. For carousels, look at every slide, in order, as a reader swiping.

## Alt text
Write one sentence per image that states what it shows and the main number, for example: "Table comparing a $150k San Francisco job with a ₹40 lakh Bengaluru job: after 10 years net worth is ₹10.3 crore against ₹5.1 crore." Use the platform's alt-text field.

## If Pillow is not available
Try `pip install pillow`. If it cannot be installed, build the card as an HTML or SVG artifact with the same colours (indigo gradient, white bold numbers, a purple highlight row) and ask the user to screenshot it, and say plainly that the image maker was unavailable.
