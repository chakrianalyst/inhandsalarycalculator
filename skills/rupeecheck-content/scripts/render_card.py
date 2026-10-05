#!/usr/bin/env python3
"""Make RupeeCheck result cards, comparison tables, bar charts and carousels as PNG images.

Needs only Pillow (pip install pillow) and the fonts in assets/fonts, so it works without a browser.

Usage
  python3 render_card.py spec.json out.png          one image
  python3 render_card.py spec.json out_folder/      a carousel (spec has "slides"): one PNG per slide plus a PDF

A spec is JSON. Common fields (all optional except template):
  template   "compare" | "stat" | "myth" | "bars"
  size       "portrait" 1080x1350 (Instagram, Facebook)  | "square" 1080x1080 | "landscape" 1600x900 (X)
             | "link" 1200x630 (link previews) | "story" 1080x1920
  theme      "dark" (default, the brand look) | "light"
  title      headline. Wrap words in **double asterisks** to colour them.
  subtitle   one line under the headline
  footer     the line at the bottom, usually the page address, e.g. "rupeecheck.in/sip-calculator.html"
  note       small print, usually the assumptions
  callouts   list of short lines shown under the main block (use **bold** for emphasis)
  page       "1/6" style marker (carousels set this automatically)

  compare:  columns ["San Francisco","Bengaluru"], rows [{"label": "...", "values": ["..",".."], "highlight": true}]
  stat:     number "₹88,276", number_label "a month", rows [{"label":"Employer PF","values":["₹57,600"]}]
  myth:     myth "₹12 LPA = ₹1 lakh a month", math "₹88,276", math_label "what actually reaches your bank"
  bars:     items [{"label":"10 years","value":44636,"display":"₹44,636 a month","highlight":false}]
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'assets', 'fonts')
SS = 2                                                    # draw at 2x and shrink, so edges and text are smooth
SIZES = {'portrait': (1080, 1350), 'square': (1080, 1080), 'landscape': (1600, 900), 'link': (1200, 630), 'story': (1080, 1920)}
THEMES = {
    'dark': dict(bg1=(26, 22, 80), bg2=(75, 58, 208), glow1=(61, 85, 214), glow2=(139, 92, 246), text=(255, 255, 255), muted=(207, 198, 250), accent=(196, 181, 253),
                 pop=(253, 230, 138), panel=(255, 255, 255, 30), line=(255, 255, 255, 48), hi1=(124, 107, 255), hi2=(192, 132, 252), hitext=(255, 255, 255), bar=(255, 255, 255, 70)),
    'light': dict(bg1=(246, 247, 251), bg2=(236, 233, 255), glow1=(196, 181, 253), glow2=(167, 139, 250), text=(18, 20, 43), muted=(91, 96, 128), accent=(91, 75, 255),
                  pop=(180, 83, 9), panel=(255, 255, 255, 235), line=(18, 20, 43, 30), hi1=(91, 75, 255), hi2=(168, 85, 247), hitext=(255, 255, 255), bar=(91, 75, 255, 60)),
}


def font(px, bold=False):
    for p in [os.path.join(FONTS, 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'), '/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''),
              '/usr/share/fonts/truetype/liberation/LiberationSans-%s.ttf' % ('Bold' if bold else 'Regular')]:
        if os.path.exists(p):
            return ImageFont.truetype(p, int(px * SS))
    return ImageFont.load_default()


class Canvas:
    def __init__(self, w, h, th):
        self.w, self.h, self.s, self.th = w * SS, h * SS, SS, th
        img = Image.new('RGB', (self.w, self.h))
        d = ImageDraw.Draw(img)
        for y in range(self.h):                                            # soft top-left to bottom-right feel via vertical blend
            t = y / max(1, self.h - 1)
            d.line([(0, y), (self.w, y)], fill=tuple(int(th['bg1'][i] + (th['bg2'][i] - th['bg1'][i]) * t) for i in range(3)))
        img = img.convert('RGBA')
        for (cx, cy, r, col) in [(0.92, 0.0, 0.55, th['glow1']), (1.0, 1.0, 0.6, th['glow2'])]:
            glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow)
            R = int(r * max(self.w, self.h))
            gd.ellipse([int(cx * self.w) - R, int(cy * self.h) - R, int(cx * self.w) + R, int(cy * self.h) + R], fill=col + (150 if th['text'][0] > 200 else 110,))
            img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(R // 3)))
        self.img = img

    def px(self, v):
        return int(v * SS)

    def rrect(self, box, radius, fill=None, gradient=None):
        x0, y0, x1, y1 = [self.px(v) for v in box]
        layer = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
        if gradient:
            g = Image.new('RGBA', (x1 - x0, y1 - y0))
            gd = ImageDraw.Draw(g)
            for i in range(x1 - x0):
                t = i / max(1, x1 - x0 - 1)
                gd.line([(i, 0), (i, y1 - y0)], fill=tuple(int(gradient[0][k] + (gradient[1][k] - gradient[0][k]) * t) for k in range(3)) + (255,))
            mask = Image.new('L', g.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, x1 - x0 - 1, y1 - y0 - 1], radius=self.px(radius), fill=255)
            layer.paste(g, (x0, y0), mask)
        else:
            ImageDraw.Draw(layer).rounded_rectangle([x0, y0, x1, y1], radius=self.px(radius), fill=fill)
        self.img = Image.alpha_composite(self.img, layer)

    def line(self, x0, y0, x1, y1, fill, width=2):
        layer = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).line([self.px(x0), self.px(y0), self.px(x1), self.px(y1)], fill=fill, width=self.px(width))
        self.img = Image.alpha_composite(self.img, layer)

    def text(self, xy, s, fnt, fill, anchor='la'):
        d = ImageDraw.Draw(self.img)
        d.text((self.px(xy[0]), self.px(xy[1])), s, font=fnt, fill=fill, anchor=anchor)

    def width(self, s, fnt):
        return ImageDraw.Draw(self.img).textlength(s, font=fnt) / SS

    def save(self, path):
        out = self.img.convert('RGB').resize((self.w // SS, self.h // SS), Image.LANCZOS)
        out.save(path, 'PNG', optimize=True)
        return out


def segments(s):                                                         # "a **b** c" -> [("a ", False), ("b", True), (" c", False)]
    parts = re.split(r'(\*\*.+?\*\*)', s)
    return [(p[2:-2], True) if p.startswith('**') and p.endswith('**') else (p, False) for p in parts if p]


def tokens(s):                                                           # [(word, accent, space_before)]: spaces only where the text has them, so "**today**;" stays tight
    out, pending = [], False
    for txt, acc in segments(s):
        for part in re.split(r'(\s+)', txt):
            if not part:
                continue
            if part.isspace():
                pending = True
            else:
                out.append((part, acc, pending and bool(out))); pending = False
    return out


def wrap(cv, s, fnt, max_w):                                             # lines of [(word, accent, space_before)] that fit max_w
    lines, cur, cur_w = [], [], 0
    sp = cv.width(' ', fnt)
    for w, acc, spb in tokens(s):
        ww = cv.width(w, fnt)
        gap = sp if (cur and spb) else 0
        if cur and cur_w + gap + ww > max_w:
            lines.append(cur); cur, cur_w, gap = [], 0, 0
            spb = False
        cur_w += gap + ww
        cur.append((w, acc, spb if cur else False))
    if cur:
        lines.append(cur)
    return lines


def plain(line):
    return ''.join((' ' if sp else '') + w for w, _, sp in line)


def draw_rich(cv, x, y, s, size, bold, color, accent, max_w, line_gap=1.12, max_lines=None, min_size=18, align='left', balance=False):
    """Draw wrapped text with **accent** words. Shrinks the font until it fits max_lines. Returns the y below the text."""
    sz = size
    while True:
        f = font(sz, bold); lines = wrap(cv, s, f, max_w)
        if (max_lines is None or len(lines) <= max_lines) or sz <= min_size:
            break
        sz -= 2
    if balance and len(lines) > 1:                                         # narrowest width that keeps the same line count: no lonely last word
        lo, hi = max_w * 0.45, max_w
        for _ in range(14):
            mid = (lo + hi) / 2
            if len(wrap(cv, s, f, mid)) <= len(lines): hi = mid
            else: lo = mid
        lines = wrap(cv, s, f, hi)
    lh = sz * line_gap
    sp = cv.width(' ', f)
    for ln in lines:
        total = sum(cv.width(w, f) + (sp if spb else 0) for w, _, spb in ln)
        cx = x if align == 'left' else x + (max_w - total) / 2
        for w, acc, spb in ln:
            if spb:
                cx += sp
            cv.text((cx, y), w, f, accent if acc else color)
            cx += cv.width(w, f)
        y += lh
    return y


def header(cv, spec, W, pad):
    th = cv.th
    cv.rrect((pad, pad, pad + 54, pad + 54), 14, gradient=((91, 75, 255), (192, 132, 252)))
    cv.text((pad + 27, pad + 29), '₹', font(34, True), (255, 255, 255), 'mm')
    cv.text((pad + 70, pad + 28), 'RupeeCheck', font(34, True), th['text'], 'lm')
    if spec.get('page'):
        cv.text((W - pad, pad + 28), spec['page'], font(26, True), th['muted'], 'rm')
    return pad + 54


def footer(cv, spec, W, H, pad):
    th, y = cv.th, H - pad
    if spec.get('footer'):
        f = font(30, True)
        label = 'Try your own numbers: '
        sz = 30
        while cv.width(label + spec['footer'], font(sz, True)) > W - 2 * pad and sz > 18:
            sz -= 1
        f = font(sz, True)
        cv.text((pad, y), label, f, th['text'], 'ls')
        cv.text((pad + cv.width(label, f), y), spec['footer'], f, th['accent'], 'ls')
        y -= sz + 26
    if spec.get('note'):
        f = font(21); lines = wrap(cv, spec['note'], f, W - 2 * pad)
        y -= len(lines) * 21 * 1.4
        yy = y + 21 * 1.15
        for ln in lines:
            cv.text((pad, yy), plain(ln), f, th['muted'], 'ls'); yy += 21 * 1.4
        y -= 14
    return y


def title_block(cv, spec, W, pad, y):
    th = cv.th
    tsz = 66 if W <= 1100 else 60
    if spec.get('title'):
        y = draw_rich(cv, pad, y, spec['title'], tsz * (0.9 if W > 1300 else 1), True, th['text'], th['accent'], W - 2 * pad, 1.1, 2, 44, balance=True)
    if spec.get('subtitle'):
        y = draw_rich(cv, pad, y + 20, spec['subtitle'], 29, False, th['muted'], th['text'], W - 2 * pad, 1.3, 2, 20)
    return y + 22


def callouts(cv, spec, W, pad, y, bottom):
    th = cv.th
    for c in spec.get('callouts', []):
        if y > bottom - 40:
            break
        y = draw_rich(cv, pad, y, c, 29, False, th['text'], th['pop'], W - 2 * pad, 1.3, 3, 20) + 10
    return y


def table(cv, spec, W, pad, y, bottom):
    th = cv.th
    cols = spec.get('columns', []); rows = spec.get('rows', []); nvals = max([len(r['values']) for r in rows] + [len(cols), 1])
    x0, x1 = pad, W - pad; inner = 34
    label_w = (x1 - x0 - 2 * inner) * (0.40 if nvals >= 2 else 0.55); val_w = (x1 - x0 - 2 * inner - label_w) / nvals
    head_h = 62 if cols else 12
    avail = bottom - y - 10 - head_h - 24
    rh = max(70, min(118, avail / max(1, len(rows))))
    total_h = head_h + rh * len(rows) + 12
    cv.rrect((x0, y, x1, y + total_h), 30, fill=th['panel'])
    if cols:
        for i, c in enumerate(cols):
            cv.text((x0 + inner + label_w + val_w * (i + 1), y + head_h / 2 + 6), c.upper(), font(22, True), th['muted'], 'rm')
    cy = y + head_h
    for r in rows:
        hi = r.get('highlight')
        if hi:
            cv.rrect((x0 + 10, cy + 4, x1 - 10, cy + rh - 4), 24, gradient=(th['hi1'], th['hi2']))
        elif r is not rows[0] or cols:
            cv.line(x0 + inner, cy, x1 - inner, cy, th['line'], 2)
        lab = font(30 if not hi else 30, hi)
        sz = 30
        while cv.width(r['label'], font(sz, hi)) > label_w - 10 and sz > 18:
            sz -= 1
        cv.text((x0 + inner + (10 if hi else 0), cy + rh / 2 + 2), r['label'], font(sz, hi), th['hitext'] if hi else th['text'], 'lm')
        for i, v in enumerate(r['values']):
            vs = 44 if hi is not True else 46
            while cv.width(v, font(vs, True)) > val_w - 14 and vs > 20:
                vs -= 1
            cv.text((x0 + inner + label_w + val_w * (i + 1) - (10 if hi else 0), cy + rh / 2 + 2), v, font(vs, True), th['hitext'] if hi else th['text'], 'rm')
        cy += rh
    return y + total_h + 26


def tpl_compare(cv, spec, W, H, pad):
    y = header(cv, spec, W, pad) + 44
    y = title_block(cv, spec, W, pad, y)
    bottom = footer(cv, spec, W, H, pad)
    y = table(cv, spec, W, pad, y + 6, bottom - 120 if spec.get('callouts') else bottom)
    callouts(cv, spec, W, pad, y, bottom)


def tpl_stat(cv, spec, W, H, pad):
    th = cv.th
    y = header(cv, spec, W, pad) + 44
    y = title_block(cv, spec, W, pad, y)
    bottom = footer(cv, spec, W, H, pad)
    num = spec.get('number', '')
    sz = 190
    while cv.width(num, font(sz, True)) > W - 2 * pad and sz > 60:
        sz -= 4
    rows = spec.get('rows', [])
    used = sz * 1.0 + (70 if spec.get('number_label') else 0) + (len(rows) * 86 + 60 if rows else 0) + (60 * len(spec.get('callouts', [])) + 20 if spec.get('callouts') else 0)
    free = (bottom - y) - used
    if free > 200 and not rows:                                            # a lone number: centre it in the space and let it breathe
        y += free * 0.32
    cv.text((pad, y + sz * 0.88), num, font(sz, True), th['text'], 'ls')
    y += sz * 1.0
    if spec.get('number_label'):
        y = draw_rich(cv, pad, y + 6, spec['number_label'], 34, False, th['muted'], th['pop'], W - 2 * pad, 1.25, 2, 20) + 10
    if rows:
        y = table(cv, {'rows': rows}, W, pad, y + 14, bottom - (120 if spec.get('callouts') else 0))
    callouts(cv, spec, W, pad, y + (14 if not rows else 0), bottom)


def tpl_myth(cv, spec, W, H, pad):
    th = cv.th
    y = header(cv, spec, W, pad) + 44
    y = title_block(cv, spec, W, pad, y)
    bottom = footer(cv, spec, W, H, pad)
    inner = W - 2 * pad - 68
    m = spec.get('math', ''); big = H > 1250
    msz = 170 if big else 130; mfs = 56 if big else 48
    while cv.width(m, font(msz, True)) > inner and msz > 50:
        msz -= 4
    myth_lines = wrap(cv, spec.get('myth', ''), font(mfs, True), inner)
    p1 = 70 + len(myth_lines) * (mfs * 1.17) + 36
    p2 = 70 + msz * 1.0 + (70 if spec.get('math_label') else 20) + 28
    extra = max(0, (bottom - y) - (p1 + p2 + 24) - (130 if spec.get('callouts') else 40))
    y += extra * 0.4
    cv.rrect((pad, y, W - pad, y + p1), 30, fill=th['panel'])
    cv.text((pad + 34, y + 38), 'THE MYTH', font(24, True), th['muted'], 'lm')
    draw_rich(cv, pad + 34, y + 72, spec.get('myth', ''), mfs, True, th['muted'], th['pop'], inner, 1.17, 3, 24)
    y2 = y + p1 + 24
    cv.rrect((pad, y2, W - pad, y2 + p2), 30, gradient=(th['hi1'], th['hi2']))
    cv.text((pad + 34, y2 + 38), 'THE MATH', font(24, True), (255, 255, 255), 'lm')
    cv.text((pad + 34, y2 + 70 + msz * 0.85), m, font(msz, True), (255, 255, 255), 'ls')
    if spec.get('math_label'):
        draw_rich(cv, pad + 34, y2 + 78 + msz, spec['math_label'], 28, False, (255, 255, 255), (255, 255, 255), inner, 1.25, 2, 18)
    callouts(cv, spec, W, pad, y2 + p2 + 28, bottom)


def tpl_bars(cv, spec, W, H, pad):
    th = cv.th
    y = header(cv, spec, W, pad) + 44
    y = title_block(cv, spec, W, pad, y)
    bottom = footer(cv, spec, W, H, pad)
    items = spec.get('items', []); mx = max([i['value'] for i in items] + [1])
    avail = bottom - y - (110 if spec.get('callouts') else 20)
    rh = max(80, min(130, avail / max(1, len(items))))
    lab_w = 210
    for it in items:
        hi = it.get('highlight')
        cv.text((pad, y + rh * 0.34), it['label'], font(30, True), th['text'], 'lm')
        bx0, bx1 = pad + lab_w, W - pad
        bw = max(18, (bx1 - bx0) * it['value'] / mx)
        cv.rrect((bx0, y + rh * 0.12, bx1, y + rh * 0.56), 14, fill=th['panel'])
        cv.rrect((bx0, y + rh * 0.12, bx0 + bw, y + rh * 0.56), 14, gradient=(th['hi1'], th['hi2']) if hi else ((th['accent'], th['accent']) if th['text'][0] < 100 else (th['hi1'], th['hi1'])))
        cv.text((bx0 + 8, y + rh * 0.84), it.get('display', ''), font(26, hi), th['pop'] if hi else th['muted'], 'lm')
        y += rh
    callouts(cv, spec, W, pad, y + 26, bottom)


TEMPLATES = {'compare': tpl_compare, 'table': tpl_compare, 'stat': tpl_stat, 'myth': tpl_myth, 'bars': tpl_bars}


def render(spec, path):
    W, H = SIZES[spec.get('size', 'portrait')]
    th = THEMES[spec.get('theme', 'dark')]
    cv = Canvas(W, H, th)
    pad = 72 if W <= 1100 else 80
    TEMPLATES[spec.get('template', 'compare')](cv, spec, W, H, pad)
    return cv.save(path)


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 2
    spec = json.load(open(argv[0], encoding='utf-8')); out = argv[1]
    if 'slides' in spec:                                                   # carousel
        os.makedirs(out, exist_ok=True)
        base = spec.get('name', 'slide'); imgs = []; n = len(spec['slides'])
        for i, sl in enumerate(spec['slides'], 1):
            s = {**{k: v for k, v in spec.items() if k not in ('slides', 'name')}, **sl, 'page': '%d/%d' % (i, n)}
            p = os.path.join(out, '%s-%02d.png' % (base, i)); imgs.append(render(s, p)); print(p)
        pdf = os.path.join(out, base + '.pdf'); imgs[0].save(pdf, save_all=True, append_images=imgs[1:]); print(pdf)
    else:
        render(spec, out); print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
