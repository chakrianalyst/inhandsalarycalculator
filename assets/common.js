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

const Common = (() => {
  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const fmt = n => { n = Math.round(n || 0); return (n < 0 ? '−' : '') + '₹' + inr.format(Math.abs(n)); };
  const fmtCompact = n => {
    n = Math.round(n || 0); const a = Math.abs(n), sg = n < 0 ? '−' : '';
    if (a >= 1e7) return sg + '₹' + (a / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return sg + '₹' + (a / 1e5).toFixed(2) + ' L';
    return fmt(n);
  };
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 0 : v; };

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
        <div><h4>More</h4><ul>${TOOLS.slice(6).map(t => `<li><a href="${t.href}">${t.name}</a></li>`).join('')}<li><a href="privacy.html">Privacy &amp; Disclaimer</a></li></ul></div>
      </div>
      <p class="legal">© ${new Date().getFullYear()} InHand. Calculators give estimates for educational purposes based on FY 2025-26 (AY 2026-27) rules and common salary structures; they are not tax, legal or investment advice. Your employer's actual payslip may differ.</p>
    </div></footer>`;
    document.body.insertAdjacentHTML('afterbegin', header);
    document.body.insertAdjacentHTML('beforeend', foot);
    document.getElementById('themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    document.getElementById('menuBtn').onclick = () => document.getElementById('navLinks').classList.toggle('open');
  }

  /** Upgrade every .field[data-slider] with a synced range slider. */
  function enhanceFields() {
    document.querySelectorAll('.field[data-slider]').forEach(f => {
      const n = f.querySelector('input[type=number]');
      const r = document.createElement('input');
      r.type = 'range';
      ['min', 'max', 'step'].forEach(a => { if (n.hasAttribute(a)) r.setAttribute(a, n.getAttribute(a)); });
      r.value = n.value; r.setAttribute('aria-label', (f.querySelector('label') || {}).textContent || 'slider');
      const paint = () => { const p = ((r.value - r.min) / (r.max - r.min)) * 100; r.style.setProperty('--p', Math.max(0, Math.min(100, p)) + '%'); };
      r.addEventListener('input', () => { n.value = r.value; paint(); n.dispatchEvent(new Event('input', { bubbles: true })); });
      n.addEventListener('input', () => { r.value = n.value; paint(); });
      f.appendChild(r); paint();
    });
  }

  /** Segmented control: <div class="seg" data-seg="id"><button data-v="a">..</button></div> -> getter */
  function seg(el, onChange) {
    const btns = el.querySelectorAll('button');
    let val = (el.querySelector('button.on') || btns[0]).dataset.v;
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('on')); b.classList.add('on'); val = b.dataset.v; onChange && onChange(val);
    }));
    return () => val;
  }

  const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  /** Render donut + legend. items: [{label, value}] */
  function donut(svgEl, legendEl, items, centerTop, centerBottom) {
    const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1;
    const R = 66, C = 2 * Math.PI * R; let off = 0;
    let segs = `<circle cx="85" cy="85" r="${R}" fill="none" stroke="var(--line)" stroke-width="22"/>`;
    items.forEach((it, i) => {
      const len = (Math.max(0, it.value) / total) * C;
      if (len > 0.01) segs += `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 85 85)"/>`;
      off += len;
    });
    svgEl.innerHTML = segs +
      `<text x="85" y="82" text-anchor="middle" font-size="11" opacity=".65">${centerTop || ''}</text>` +
      `<text x="85" y="101" text-anchor="middle" font-size="15" font-weight="800">${centerBottom || ''}</text>`;
    legendEl.innerHTML = items.map((it, i) =>
      `<div><span><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>${it.label}</span><b>${it.fmt ? it.fmt(it.value) : fmt(it.value)}</b></div>`).join('');
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
        `<circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--surface)" stroke="${o.series[0].color}" stroke-width="2"/>` +
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

  function init(activeId) {
    layout(activeId); enhanceFields(); related(activeId);
  }
  initTheme();
  return { fmt, fmtCompact, num, donut, seg, init, layout, enhanceFields, related, lineChart };
})();
