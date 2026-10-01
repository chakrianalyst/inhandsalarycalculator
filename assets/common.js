/* InHand — shared layout + helpers */
const TOOLS = [
  { id: 'salary', href: 'salary-calculator.html', icon: '💼', name: 'In-Hand Salary Calculator', short: 'Salary', desc: 'CTC to monthly take-home with old vs new tax regime, PF, HRA and more.', hot: true },
  { id: 'lifesim', href: 'life-simulator.html', icon: '🧭', name: 'Life Money Simulator', short: 'Life Sim', desc: 'Drag life events — home, marriage, kids, career jumps — and watch your net worth unfold.', isNew: true },
  { id: 'networth', href: 'networth-calculator.html', icon: '🏆', name: 'Net Worth Calculator', short: 'Net Worth', desc: 'Add all your assets and liabilities. Get net worth, allocation and a health score.', isNew: true },
  { id: 'fire', href: 'fire-calculator.html', icon: '🔥', name: 'FIRE / Retirement Planner', short: 'FIRE', desc: 'How much do you need to retire early, and at what age can you actually do it?', isNew: true },
  { id: 'rentbuy', href: 'rent-vs-buy-calculator.html', icon: '🏡', name: 'Rent vs Buy Calculator', short: 'Rent vs Buy', desc: 'Buy a home or rent and invest the difference? See the break-even year.', isNew: true },
  { id: 'offers', href: 'offer-comparison.html', icon: '🤝', name: 'Job Offer Comparison', short: 'Offers', desc: 'Compare 2–3 job offers on real in-hand pay, bonus, ESOPs and 4-year value.', isNew: true },
  { id: 'hike', href: 'salary-hike-calculator.html', icon: '📈', name: 'Salary Hike Calculator', short: 'Hike', desc: 'See how much of your raise actually lands in your bank account.' },
  { id: 'hra', href: 'hra-calculator.html', icon: '🏠', name: 'HRA Exemption Calculator', short: 'HRA', desc: 'Calculate exempt HRA and taxable HRA under the old regime.' },
  { id: 'emi', href: 'emi-calculator.html', icon: '🏦', name: 'EMI Calculator', short: 'EMI', desc: 'Home, car and personal loan EMI with a full amortisation schedule.' },
  { id: 'sip', href: 'sip-calculator.html', icon: '🌱', name: 'SIP Calculator', short: 'SIP', desc: 'Project mutual fund SIP growth, with optional yearly step-up.' },
  { id: 'fd', href: 'fd-calculator.html', icon: '🔒', name: 'FD Calculator', short: 'FD', desc: 'Fixed deposit maturity value with flexible compounding.' },
  { id: 'gratuity', href: 'gratuity-calculator.html', icon: '🎁', name: 'Gratuity Calculator', short: 'Gratuity', desc: 'Estimate your gratuity payout from salary and years of service.' },
];

const GUIDES = [
  ['ctc-vs-in-hand-salary.html', 'CTC vs in-hand salary'],
  ['old-vs-new-tax-regime.html', 'Old vs new tax regime'],
  ['net-worth-by-age.html', 'Net worth by age'],
];

const Common = (() => {
  const SITE = window.SITE || {};
  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const fmt = n => { n = Math.round(n || 0); return (n < 0 ? '−' : '') + '₹' + inr.format(Math.abs(n)); };
  const fmtCompact = n => {
    n = Math.round(n || 0); const a = Math.abs(n), sg = n < 0 ? '−' : '';
    if (a >= 1e7) return sg + '₹' + (a / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return sg + '₹' + (a / 1e5).toFixed(2) + ' L';
    return fmt(n);
  };
  const num = id => { const v = parseFloat(String(document.getElementById(id).value).replace(/,/g, '')); return isNaN(v) ? 0 : v; };
  const raw = el => String(el.value).replace(/,/g, '');

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch (e) {}
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  }

  function layout(activeId) {
    const links = TOOLS.map(t => `<a href="${t.href}" class="${t.id === activeId ? 'active' : ''}">${t.short}</a>`).join('');
    const header = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header"><div class="container nav">
      <a href="index.html" class="logo" aria-label="InHand home"><div class="logo-mark">₹</div><span>In<b>Hand</b></span></a>
      <nav class="nav-links" id="navLinks" aria-label="Main">${links}</nav>
      <div class="nav-actions">
        <button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode" title="Toggle theme">🌓</button>
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">☰</button>
      </div>
    </div></header>`;
    const foot = `
    <footer class="site-footer"><div class="container">
      <div class="foot-grid">
        <div><a href="index.html" class="logo"><div class="logo-mark">₹</div><span>In<b>Hand</b></span></a>
          <p>Fast, free, private money calculators for India. Everything runs in your browser — your numbers never leave your device.</p></div>
        <div><h4>Calculators</h4><ul>${TOOLS.slice(0, 6).map(t => `<li><a href="${t.href}">${t.name}</a></li>`).join('')}</ul></div>
        <div><h4>More</h4><ul>${TOOLS.slice(6).map(t => `<li><a href="${t.href}">${t.name}</a></li>`).join('')}<li><a href="in-hand-salary-by-ctc.html">Salary by CTC chart</a></li></ul></div>
        <div><h4>Learn &amp; about</h4><ul>${GUIDES.map(g => `<li><a href="${g[0]}">${g[1]}</a></li>`).join('')}<li><a href="methodology.html">How we calculate</a></li><li><a href="about.html">About</a></li><li><a href="contact.html">Contact</a></li><li><a href="privacy.html">Privacy &amp; Disclaimer</a></li></ul></div>
      </div>
      <p class="legal">© ${new Date().getFullYear()} InHand. Calculators give estimates for educational purposes based on FY 2026-27 (AY 2027-28) rules and common salary structures; they are not tax, legal or investment advice. Your employer's actual payslip may differ.</p>
    </div></footer>`;
    document.body.insertAdjacentHTML('afterbegin', header);
    document.body.insertAdjacentHTML('beforeend', foot);
    document.getElementById('themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    document.getElementById('menuBtn').onclick = () => document.getElementById('navLinks').classList.toggle('open');
  }

  const IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  /** Upgrade every .field[data-slider] with a synced range slider (works with comma-formatted money inputs). */
  function enhanceFields() {
    document.querySelectorAll('.field[data-slider]').forEach(f => {
      const n = f.querySelector('input[type=number], input[data-money]'); if (!n || f.querySelector('input[type=range]')) return;
      const money = n.dataset.money !== undefined;
      const r = document.createElement('input');
      r.type = 'range';
      ['min', 'max', 'step'].forEach(a => { if (n.hasAttribute(a)) r.setAttribute(a, n.getAttribute(a)); });
      r.value = raw(n); r.setAttribute('aria-label', (f.querySelector('label') || {}).textContent || 'slider');
      const paint = () => { const p = ((r.value - r.min) / (r.max - r.min)) * 100; r.style.setProperty('--p', Math.max(0, Math.min(100, p)) + '%'); };
      r.addEventListener('input', () => { n.value = money ? IN.format(+r.value) : r.value; paint(); n.dispatchEvent(new Event('input', { bubbles: true })); });
      n.addEventListener('input', () => { r.value = raw(n); paint(); });
      f.appendChild(r); paint();
    });
  }

  /** Comma-formatted (Indian grouping) text input with an optional words caption (data-words="captionElementId"). */
  function attachMoney(el, opts) {
    opts = opts || {}; if (el._money) return; el._money = true;
    el.type = 'text'; el.setAttribute('inputmode', opts.decimals ? 'decimal' : 'numeric'); el.setAttribute('autocomplete', 'off');
    const dec = () => typeof opts.decimals === 'function' ? opts.decimals() : !!opts.decimals;
    const cap = el.dataset.words ? document.getElementById(el.dataset.words) : null;
    const fmtVal = () => {
      let r = String(el.value).replace(/[^\d.]/g, '');
      const mx = typeof opts.max === 'function' ? opts.max() : opts.max, cap = mx != null ? mx : 1e11;
      if (dec()) { const i = r.indexOf('.'); if (i >= 0) r = r.slice(0, i + 1) + r.slice(i + 1).replace(/\./g, '').slice(0, 2); if (parseFloat(r) > cap) { r = String(cap); flash(el, `Maximum is ${cap}${mx != null ? '%' : ''}`); } return r; }
      r = r.split('.')[0].slice(0, 12); if (r && parseInt(r, 10) > cap) { r = String(cap); flash(el, `Maximum is ${IN.format(cap)}`); } return r ? IN.format(parseInt(r, 10)) : '';
    };
    const words = () => { if (cap) { const n = parseFloat(raw(el)); cap.textContent = n > 0 && window.IndianWords ? window.IndianWords.sentence(n) : ''; } };
    el.addEventListener('input', () => {
      const pos = el.selectionStart == null ? el.value.length : el.selectionStart, before = el.value.slice(0, pos).replace(/[^\d.]/g, '').length, nv = fmtVal();
      if (nv !== el.value) { el.value = nv; let c = 0, i = 0; if (before) for (i = 0; i < nv.length && c < before; i++) if (/[\d.]/.test(nv[i])) c++; try { el.setSelectionRange(i, i); } catch (e) {} }
      words();
    });
    el.value = fmtVal(); words();
  }

  /* ---------- Input limits: percentages stop at their maximum, negatives are refused, ₹ amounts stay free ---------- */
  function flash(el, msg) {
    if (document.activeElement !== el) return;                                   // stay quiet when values are restored from a link
    const wrap = el.closest('.input-wrap') || el, anchor = wrap.parentElement && wrap.parentElement.classList.contains('dual-row') ? wrap.parentElement : wrap;   // below the whole field
    let n = anchor.parentElement.querySelector(':scope > .limit-note');
    if (!n) { n = document.createElement('div'); n.className = 'limit-note'; n.setAttribute('role', 'status'); anchor.insertAdjacentElement('afterend', n); }
    n.textContent = msg; wrap.classList.add('limit-hit'); clearTimeout(n._t);
    n._t = setTimeout(() => { n.remove(); wrap.classList.remove('limit-hit'); }, 2600);
  }
  function limitsOf(el) {
    const w = el.closest('.input-wrap'), pre = w && w.querySelector('.pre'), suf = w && w.querySelector('.suf');
    const money = !!(pre && /₹/.test(pre.textContent)), pct = !!(suf && /%/.test(suf.textContent));
    const mx = el.getAttribute('max'), mn = el.getAttribute('min');
    return { money, pct, max: mx !== null && mx !== '' ? parseFloat(mx) : (pct ? 100 : null), min: mn !== null && mn !== '' ? parseFloat(mn) : null };
  }
  function initLimits() {
    document.addEventListener('input', e => {                                    // capture phase: runs before any page calculates
      const el = e.target; if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;
      const L = limitsOf(el), v = parseFloat(el.value); if (isNaN(v)) return;
      if (!L.money && L.max !== null && v > L.max) { el.value = L.max; flash(el, `Maximum is ${L.max}${L.pct ? '%' : ''}`); }
      else if (v < 0 && (L.min === null || L.min >= 0)) { el.value = L.min === null ? 0 : L.min; flash(el, 'Negative values are not allowed'); }
    }, true);
    document.addEventListener('change', e => {                                   // when the field is left: lift values below the minimum
      const el = e.target; if (!el || el.tagName !== 'INPUT' || el.type !== 'number' || el.value === '') return;
      const L = limitsOf(el), v = parseFloat(el.value);
      if (!L.money && L.min !== null && v < L.min) { el.value = L.min; flash(el, `Minimum is ${L.min}${L.pct ? '%' : ''}`); el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, true);
  }

  /** Set a formatted input programmatically (fires the normal input pipeline). */
  function setVal(el, v) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }

  /** Segmented control: <div class="seg" id="x"><button data-v="a">..</button></div> -> getter (always reads the DOM) */
  function seg(el, onChange) {
    const btns = el.querySelectorAll('button');
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange && onChange(b.dataset.v);
    }));
    return () => (el.querySelector('button.on') || btns[0]).dataset.v;
  }
  function segSet(el, v) { const b = [...el.querySelectorAll('button')].find(x => x.dataset.v === String(v)); if (b) { el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); } }

  const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  /** Render donut + legend. items: [{label, value}] */
  function donut(svgEl, legendEl, items, centerTop, centerBottom, opts) {
    opts = opts || {};
    const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1;
    const pct = v => +(Math.max(0, v) / total * 100).toFixed(1), val = it => it.fmt ? it.fmt(it.value) : fmt(it.value);
    const R = 66, C = 2 * Math.PI * R; let off = 0;
    let segs = `<circle cx="85" cy="85" r="${R}" fill="none" stroke="var(--line)" stroke-width="22"/>`;
    items.forEach((it, i) => {
      const len = (Math.max(0, it.value) / total) * C;
      if (len > 0.01) segs += `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 85 85)"><title>${it.label}: ${val(it)} (${pct(it.value)}%)</title></circle>`;
      off += len;
    });
    svgEl.innerHTML = segs +
      `<text x="85" y="82" text-anchor="middle" font-size="11" opacity=".65">${centerTop || ''}</text>` +
      `<text x="85" y="101" text-anchor="middle" font-size="15" font-weight="800">${centerBottom || ''}</text>`;
    legendEl.innerHTML = items.map((it, i) =>
      `<div><span><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>${it.label}</span><b>${val(it)}${opts.pct ? `<span class="pc">${pct(it.value)}%</span>` : ''}</b></div>`).join('');
  }

  /** Interactive multi-series line chart.
   *  o = { xs:[num], series:[{name,color,ys,dash?}], xfmt, yfmt, markers:[{x,label}], area?:bool, height? } */
  function lineChart(host, o) {
    const W = 640, H = o.height || 300, m = { l: 62, r: 14, t: 18, b: 30 };
    const xs = o.xs, all = o.series.flatMap(s => s.ys).filter(Number.isFinite);
    let lo = Math.min(0, ...all), hi = Math.max(...all); if (hi <= lo) hi = lo + 1;
    const span = hi - lo, st0 = span / 5, mag = Math.pow(10, Math.floor(Math.log10(st0))), nm = st0 / mag;
    const step = (nm < 1.5 ? 1 : nm < 3 ? 2 : nm < 7 ? 5 : 10) * mag;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const X = v => m.l + (v - x0) / ((x1 - x0) || 1) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const axis = v => { const a = Math.abs(v), sg = v < 0 ? '−' : '', t = (x, d) => String(+x.toFixed(d));
      return a >= 1e7 ? sg + '₹' + t(a / 1e7, a >= 1e8 ? 0 : 1) + ' Cr' : a >= 1e5 ? sg + '₹' + t(a / 1e5, a >= 1e6 ? 0 : 1) + ' L' : fmt(v); };
    const yf = o.yfmt || fmtCompact, yt = o.yfmt || axis, xf = o.xfmt || (v => v);
    let g = '';
    for (let v = lo; v <= hi + step / 2; v += step)
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" ${Math.abs(v) < step / 1000 ? 'stroke-width="1.6"' : 'stroke-dasharray="3 4"'}/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${yt(v)}</text>`;
    const xstep = [1, 2, 5, 10, 20, 25, 50].find(n => (x1 - x0) / n <= 7) || 50;
    xs.filter(x => Math.abs(x - x0) % xstep === 0).forEach(x => g += `<text x="${X(x)}" y="${H - 9}" text-anchor="middle" font-size="10" fill="var(--muted)">${xf(x)}</text>`);
    let lines = '';
    o.series.forEach((s, si) => {
      const segs = []; let cur = [];
      xs.forEach((x, i) => { if (Number.isFinite(s.ys[i])) cur.push([x, s.ys[i]]); else if (cur.length) { segs.push(cur); cur = []; } });
      if (cur.length) segs.push(cur);
      segs.forEach(sg => {
        const pts = sg.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
        if (o.area && si === 0) lines += `<path d="M${X(sg[0][0])},${Y(Math.max(lo, 0))} L${pts.join(' L')} L${X(sg[sg.length - 1][0])},${Y(Math.max(lo, 0))} Z" fill="${s.color}" opacity=".10"/>`;
        lines += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="6 5"' : ''}/>`;
      });
    });
    let marks = '';
    (o.markers || []).forEach((mk, k) => {
      const i = xs.indexOf(mk.x); if (i < 0) return;
      const cx = X(mk.x), cy = Y(o.series[0].ys[i]);
      marks += `<line x1="${cx}" x2="${cx}" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-dasharray="2 4" opacity=".45"/>` +
        (Number.isFinite(cy) ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--surface)" stroke="${o.series[0].color}" stroke-width="2"/>` : '') +
        `<text x="${cx}" y="${m.t - 5 + (k % 2) * 0}" text-anchor="middle" font-size="13">${mk.label}</text>`;
    });
    const legend = o.series.length > 1 || o.legend ? `<div class="lc-legend">${o.series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>` : '';
    host.classList.add('lc');
    host.innerHTML = legend + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label || 'Chart'}">${g}${lines}${marks}<g class="hv"></g><rect class="ov" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg><div class="lc-tip" hidden></div>`;
    const svg = host.querySelector('svg'), tip = host.querySelector('.lc-tip'), hv = host.querySelector('.hv');
    const move = e => {
      const r = svg.getBoundingClientRect(), px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * W;
      let bi = 0, bd = 1e18; xs.forEach((x, i) => { const d = Math.abs(X(x) - px); if (d < bd) { bd = d; bi = i; } });
      const cx = X(xs[bi]);
      hv.innerHTML = `<line x1="${cx}" x2="${cx}" y1="${m.t}" y2="${H - m.b}" stroke="var(--brand)" opacity=".5"/>` + o.series.filter(s => Number.isFinite(s.ys[bi])).map(s => `<circle cx="${cx}" cy="${Y(s.ys[bi])}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
      tip.hidden = false;
      tip.innerHTML = `<b>${o.xlabel ? o.xlabel(xs[bi]) : xf(xs[bi])}</b>` + o.series.map(s => `<div><span><i style="background:${s.color}"></i>${s.name}</span><span>${Number.isFinite(s.ys[bi]) ? yf(s.ys[bi]) : '—'}</span></div>`).join('');
      const tx = cx / W * r.width, tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(r.width - tw - 4, tx + 12 + tw > r.width ? tx - tw - 12 : tx + 12)) + 'px';
      tip.style.top = (legend ? 34 : 6) + 'px';
    };
    const leave = () => { hv.innerHTML = ''; tip.hidden = true; };
    const ov = host.querySelector('.ov');
    ov.addEventListener('mousemove', move); ov.addEventListener('mouseleave', leave);
    ov.addEventListener('touchstart', move, { passive: true }); ov.addEventListener('touchmove', move, { passive: true }); ov.addEventListener('touchend', leave);
  }

  function related(activeId, n = 3) {
    const el = document.getElementById('related'); if (!el) return;
    el.innerHTML = TOOLS.filter(t => t.id !== activeId).slice(0, n).map(t =>
      `<a class="tool-card" href="${t.href}"><div class="ico">${t.icon}</div><h3>${t.name}</h3><p>${t.desc}</p><span class="go">Open →</span></a>`).join('');
  }


  /* ---------- Runtime services: consent, ads, analytics, affiliates, sharing ---------- */
  const consent = () => { try { return localStorage.getItem('inhand-consent'); } catch (e) { return null; } };
  function loadScript(src, attrs) { const el = document.createElement('script'); el.async = true; el.src = src; Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); return el; }
  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }

  function startThirdParties() {
    if (consent() === 'no') return;
    if (SITE.gaId) {
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(SITE.gaId));
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', SITE.gaId, { anonymize_ip: true });
    }
    if (SITE.adsenseClient) loadScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(SITE.adsenseClient), { crossorigin: 'anonymous' });
  }
  function consentBanner() {
    if (!(SITE.gaId || SITE.adsenseClient) || consent()) return;
    const b = document.createElement('div'); b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie notice');
    b.innerHTML = `<p>We use cookies for anonymous analytics and to show ads that keep these tools free. Your calculator inputs never leave your device. <a href="privacy.html">Learn more</a></p><div><button class="btn btn-ghost btn-sm" data-c="no">Decline</button><button class="btn btn-primary btn-sm" data-c="yes">Accept</button></div>`;
    b.addEventListener('click', e => { const c = e.target.dataset && e.target.dataset.c; if (!c) return; try { localStorage.setItem('inhand-consent', c); } catch (x) {} b.remove(); if (c === 'yes') startThirdParties(); });
    document.body.appendChild(b);
  }
  /** Ad placeholders -> real units only when AdSense is configured AND the visitor hasn't declined; otherwise removed. */
  function placeAds() {
    const slots = document.querySelectorAll('.ad-slot');
    slots.forEach(el => {
      if (SITE.adsenseClient && SITE.adsenseSlot && consent() !== 'no') {
        el.className = 'ad-live'; el.textContent = '';
        const ins = document.createElement('ins'); ins.className = 'adsbygoogle'; ins.style.display = 'block';
        ins.setAttribute('data-ad-client', SITE.adsenseClient); ins.setAttribute('data-ad-slot', SITE.adsenseSlot);
        ins.setAttribute('data-ad-format', 'auto'); ins.setAttribute('data-full-width-responsive', 'true'); el.appendChild(ins);
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      } else el.remove();      // never show an empty "Advertisement" box to visitors
    });
  }
  /** Affiliate boxes: use the configured link; hide the whole box if none is set. */
  function placeAffiliates() {
    document.querySelectorAll('[data-affiliate]').forEach(a => {
      const url = (SITE.affiliates || {})[a.dataset.affiliate], box = a.closest('.offer');
      if (!url) { if (box) box.remove(); return; }
      a.href = url; a.target = '_blank'; a.rel = 'sponsored nofollow noopener';
      if (box && !box.querySelector('.disc')) { const d = document.createElement('small'); d.className = 'disc'; d.textContent = 'Sponsored · we may earn a commission at no cost to you.'; box.querySelector('div').appendChild(d); }
      a.addEventListener('click', () => track('affiliate_click', { offer: a.dataset.affiliate, page: location.pathname }));
    });
  }

  /* ---------- Shareable state: inputs <-> URL query (?ctc=1800000&...) ---------- */
  const state = (() => {
    const controls = () => [...document.querySelectorAll('input[id], input[data-e], select[id]')].filter(i => i.type !== 'range' || i.dataset.e);
    const key = el => el.id || (el.dataset.e + '.' + el.dataset.k);
    const segs = () => [...document.querySelectorAll('.seg[id]')];
    const segVal = sg => (sg.querySelector('button.on') || sg.querySelector('button')).dataset.v;
    const defaults = new Map(); let ready = false, timer = null;
    const val = el => el.type === 'checkbox' ? el.checked : (el.dataset.money !== undefined ? raw(el) : el.value);
    function snapshot() { controls().forEach(el => { if (!defaults.has(el)) defaults.set(el, val(el)); }); segs().forEach(sg => { if (!defaults.has(sg)) defaults.set(sg, segVal(sg)); }); }
    function write() {
      snapshot(); const p = new URLSearchParams();
      controls().forEach(el => { const v = val(el); if (v !== defaults.get(el)) p.set(key(el), el.type === 'checkbox' ? (v ? '1' : '0') : v); });
      segs().forEach(sg => { if (segVal(sg) !== defaults.get(sg)) p.set(sg.id, segVal(sg)); });
      try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : '')); } catch (e) {}
    }
    function restore() {
      snapshot(); const p = new URLSearchParams(location.search); if (![...p.keys()].length) return;
      controls().forEach(el => { const k = key(el); if (!p.has(k)) return; const v = p.get(k);
        if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v.slice(0, 400);
        el.dispatchEvent(new Event('input', { bubbles: true })); });
      segs().forEach(sg => { if (!p.has(sg.id)) return; const b = [...sg.querySelectorAll('button')].find(x => x.dataset.v === p.get(sg.id)); if (b) { sg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); } });
    }
    function watch() { if (ready) return; ready = true; snapshot();
      const later = () => { clearTimeout(timer); timer = setTimeout(write, 300); };
      document.addEventListener('input', later); document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.seg')) later(); }); }
    return { restore, watch, write };
  })();
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200); }
  function addShare() {
    const hero = document.querySelector('.results .hero-result, .hero-result'); if (!hero || hero.querySelector('.share-btn') || !document.querySelector('input[id]')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'share-btn'; b.innerHTML = '🔗 Share'; b.setAttribute('aria-label', 'Share these results');
    b.onclick = async () => { state.write(); const url = location.href;
      try { if (navigator.share) { await navigator.share({ title: document.title, url }); track('share', { method: 'native' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(url); toast('Link copied — it restores your exact numbers'); track('share', { method: 'copy' }); } catch (e) { toast('Copy the address bar link to share'); } };
    hero.appendChild(b);
  }
  function a11y() {
    const m = document.querySelector('main'); if (m && !m.id) m.id = 'main';
    if (!document.querySelector('.site-header h1') && document.querySelector('h1')) return;
  }
  window.addEventListener('unhandledrejection', e => { try { track('js_error', { msg: String(e.reason).slice(0, 100) }); } catch (x) {} });
  window.addEventListener('error', e => { try { track('js_error', { msg: String(e.message).slice(0, 100), src: (e.filename || '').split('/').pop() }); } catch (x) {} });

  /** <select data-cities data-default="Bengaluru"> becomes the HRA city list: the metro cities plus "Any other city". */
  function fillCities() {
    document.querySelectorAll('select[data-cities]').forEach(sel => {
      if (sel.options.length || typeof Tax === 'undefined') return;
      sel.innerHTML = Tax.METRO_CITIES.map(c => `<option value="${c}">${c}</option>`).join('') + '<option value="other">Any other city</option>';
      sel.value = sel.dataset.default || 'other';
    });
  }
  function init(activeId) {
    layout(activeId); a11y(); initLimits(); fillCities(); document.querySelectorAll('input[data-money]').forEach(e => attachMoney(e)); state.restore(); enhanceFields(); related(activeId);
    placeAds(); placeAffiliates(); addShare(); consentBanner(); startThirdParties();
    window.addEventListener('load', () => { state.watch(); let used = false; document.addEventListener('input', () => { if (!used) { used = true; track('calculator_used', { tool: activeId }); } }); });
  }
  initTheme();
  return { fmt, fmtCompact, num, raw, fillCities, attachMoney, setVal, segSet, donut, seg, init, layout, enhanceFields, related, lineChart, restore: state.restore, track, toast };
})();
