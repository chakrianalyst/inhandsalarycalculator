/* Investment projection maths (SIP and lump sum) — pure functions, no DOM. Used by sip-calculator.html and the tests.
   The yearly return is treated as an effective yearly rate, converted to the equivalent monthly rate. Each SIP instalment goes in at the start of its month. */
(function (root) {
  const monthly = ret => Math.pow(1 + ret / 100, 1 / 12) - 1;

  /** p: { sip (₹ a month), step (% rise every 12 months), lump (₹ invested on day one), ret (% a year), months, nominal (true: ret ÷ 12 each month, as many online calculators do; default: ret is the effective yearly rate) } */
  function run(p) {
    const r = p.nominal ? p.ret / 1200 : monthly(p.ret), M = Math.max(0, Math.round(p.months)), step = (p.step || 0) / 100; let v = p.lump || 0, inv = p.lump || 0, s = p.sip || 0; const years = [], vals = [v], invs = [inv];
    let yi = 0, yv0 = v, yinv0 = inv;
    for (let m = 1; m <= M; m++) {
      if (m > 1 && (m - 1) % 12 === 0) s *= 1 + step;
      v = (v + s) * (1 + r); inv += s; vals.push(v); invs.push(inv);
      if (m % 12 === 0 || m === M) { years.push({ year: Math.ceil(m / 12), to: m / 12, sip: s, invested: inv, value: v, yearInvested: inv - yinv0, gain: v - inv }); yv0 = v; yinv0 = inv; }
    }
    return { value: v, invested: inv, gain: v - inv, years, vals, invs, lastSip: s };
  }

  /** The SIP you must start with (₹ a month, rising by step % a year) to reach target, given any lump already invested. */
  function requiredSip(p) {
    const unit = run({ sip: 1, step: p.step, lump: 0, ret: p.ret, months: p.months, nominal: p.nominal }).value, have = run({ sip: 0, step: 0, lump: p.lump || 0, ret: p.ret, months: p.months, nominal: p.nominal }).value;
    return unit > 0 ? Math.max(0, (p.target - have) / unit) : 0;
  }

  /** Tax if everything is sold at the end. kind: 'equity' (12.5% on gains above ₹1.25 lakh; 20% when held up to a year), 'slab' (your slab rate), 'none'. Cess 4% on top. */
  function tax(gain, kind, months, slab) {
    if (gain <= 0 || kind === 'none') return 0;
    if (kind === 'slab') return gain * (slab || 0) / 100 * 1.04;
    return months <= 12 ? gain * 0.2 * 1.04 : Math.max(0, gain - 125000) * 0.125 * 1.04;
  }

  const api = { monthly, run, requiredSip, tax };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Invest = api;
})(typeof window !== 'undefined' ? window : globalThis);
