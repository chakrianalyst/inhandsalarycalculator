/* InHand — shared layout + helpers */
const TOOLS = [
  { id: 'salary', href: 'salary-calculator.html', icon: '💼', name: 'In-Hand Salary Calculator', short: 'Salary', desc: 'CTC to monthly take-home with old vs new tax regime, PF, HRA and more.', hot: true },
  { id: 'hike', href: 'salary-hike-calculator.html', icon: '📈', name: 'Salary Hike Calculator', short: 'Hike', desc: 'See how much of your raise actually lands in your bank account.' },
  { id: 'hra', href: 'hra-calculator.html', icon: '🏠', name: 'HRA Exemption Calculator', short: 'HRA', desc: 'Calculate exempt HRA and taxable HRA under the old regime.' },
  { id: 'emi', href: 'emi-calculator.html', icon: '🏦', name: 'EMI Calculator', short: 'EMI', desc: 'Home, car and personal loan EMI with a full amortisation schedule.' },
  { id: 'sip', href: 'sip-calculator.html', icon: '🌱', name: 'SIP Calculator', short: 'SIP', desc: 'Project mutual fund SIP growth, with optional yearly step-up.' },
  { id: 'fd', href: 'fd-calculator.html', icon: '🔒', name: 'FD Calculator', short: 'FD', desc: 'Fixed deposit maturity value with flexible compounding.' },
  { id: 'gratuity', href: 'gratuity-calculator.html', icon: '🎁', name: 'Gratuity Calculator', short: 'Gratuity', desc: 'Estimate your gratuity payout from salary and years of service.' },
];

const Common = (() => {
  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const fmt = n => '₹' + inr.format(Math.round(n || 0));
  const fmtCompact = n => {
    n = Math.round(n || 0); const a = Math.abs(n);
    if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
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
        <div><h4>Calculators</h4><ul>${TOOLS.slice(0, 4).map(t => `<li><a href="${t.href}">${t.name}</a></li>`).join('')}</ul></div>
        <div><h4>More</h4><ul>${TOOLS.slice(4).map(t => `<li><a href="${t.href}">${t.name}</a></li>`).join('')}<li><a href="privacy.html">Privacy &amp; Disclaimer</a></li></ul></div>
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

  function related(activeId, n = 3) {
    const el = document.getElementById('related'); if (!el) return;
    el.innerHTML = TOOLS.filter(t => t.id !== activeId).slice(0, n).map(t =>
      `<a class="tool-card" href="${t.href}"><div class="ico">${t.icon}</div><h3>${t.name}</h3><p>${t.desc}</p><span class="go">Open →</span></a>`).join('');
  }

  function init(activeId) {
    layout(activeId); enhanceFields(); related(activeId);
  }
  initTheme();
  return { fmt, fmtCompact, num, donut, seg, init, layout, enhanceFields, related };
})();
