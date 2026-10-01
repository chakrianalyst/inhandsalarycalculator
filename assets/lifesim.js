/* Life money simulation — pure functions, no DOM. Used by life-simulator.html and the tests.
   All money inputs are today's rupees; the model inflates them to the year they happen. */
(function (root) {
  const TaxEngine = typeof Tax !== 'undefined' ? Tax : require('./tax.js');          // browser: global from tax.js; Node: require
  const BORROW_RATE = 0.12;                                      // what a shortfall would cost if you had to borrow
  const FREEDOM_RATE = 0.035;                                    // withdrawal rate used for "financial freedom"

  const DEFAULT_EVENTS = {
    home:    { on: true,  age: 32, price: 8000000, dp: 20, rate: 8.5, tenure: 20 },
    wed:     { on: true,  age: 30, cost: 1500000, uplift: 25 },
    kid:     { on: true,  age: 32, cost: 300000, monthly: 15000, edu: 2500000 },
    jump:    { on: true,  age: 35, pct: 35 },
    car:     { on: true,  age: 34, cost: 1200000, every: 0 },    // every = 0 means one car only
    parents: { on: false, age: 36, monthly: 15000, yrs: 20 },
    break:   { on: false, age: 40, yrs: 1 },
  };
  const NAMES = { home: 'home purchase', wed: 'wedding', kid: 'child', jump: 'career jump', car: 'car', parents: 'support for parents', break: 'career break' };

  /** p: { age, retire, end, inflation, growth, ret (percent numbers), incomeMode:'net'|'gross', income (₹/month take-home if net, ₹/year gross if gross),
   *       living, rent (₹/month), savings (₹), events, skip (event id to leave out) } */
  function run(p) {
    const a0 = Math.round(p.age), ret = Math.max(a0 + 1, Math.round(p.retire)), end = Math.max(ret + 1, Math.round(p.end));
    const infl = p.inflation / 100, g = p.growth / 100, rr = p.ret / 100, ev = p.events || DEFAULT_EVENTS;
    const on = id => !!(ev[id] && ev[id].on) && p.skip !== id;
    const living0 = p.living * 12, rent0 = p.rent * 12, gross = p.incomeMode === 'gross';
    const taxOf = (inc, idx) => inc > 0 ? TaxEngine.computeTax(Math.max(0, inc - 75000 * idx) / idx, 'new').total * idx : 0;   // new-regime slabs, indexed to inflation
    let corp = p.savings, homeVal = 0, loan = 0, emi = 0, emiEnd = -1, rm = 0, hadHome = false, emiMonthly = 0;
    const rows = [{ a: a0, nw: corp, corp, idx: 1, home: 0 }], eventCost = {}; let free = null, crunch = null, crunchInfo = null, firstYear = null;
    const bump = (id, v) => { if (crunch === null) eventCost[id] = (eventCost[id] || 0) + v; };      // only costs up to the point the money runs out matter for diagnosis

    for (let a = a0; a < end; a++) {
      const idx = Math.pow(1 + infl, a - a0);
      let takeHome = 0;
      if (a < ret) {
        let mult = Math.pow(1 + g, a - a0); if (on('jump') && a >= ev.jump.age) mult *= 1 + ev.jump.pct / 100;
        const base = (gross ? p.income : p.income * 12) * mult;
        takeHome = gross ? base - taxOf(base, idx) : base;
        if (on('break') && a >= ev.break.age && a < ev.break.age + ev.break.yrs) takeHome = 0;
      }
      const owned = on('home') && a >= ev.home.age;
      const living = living0 * idx * (on('wed') && a >= ev.wed.age ? 1 + ev.wed.uplift / 100 : 1), rent = owned ? 0 : rent0 * idx;
      let extra = 0, one = 0, emiPaid = 0, maint = 0;
      if (on('kid') && a >= ev.kid.age && a < ev.kid.age + 22) extra += ev.kid.monthly * 12 * idx;
      if (on('parents') && a >= ev.parents.age && a < ev.parents.age + ev.parents.yrs) extra += ev.parents.monthly * 12 * idx;
      if (on('wed') && a === ev.wed.age) { one += ev.wed.cost * idx; bump('wed', ev.wed.cost * idx); }
      if (on('kid')) {
        if (a === ev.kid.age) { one += ev.kid.cost * idx; bump('kid', ev.kid.cost * idx); }
        if (a >= ev.kid.age + 18 && a < ev.kid.age + 22) { one += ev.kid.edu / 4 * idx; bump('kid', ev.kid.edu / 4 * idx); }
      }
      if (on('car') && a >= ev.car.age && (ev.car.every > 0 ? (a - ev.car.age) % ev.car.every === 0 : a === ev.car.age)) { one += ev.car.cost * idx; bump('car', ev.car.cost * idx); }
      if (on('home') && a === ev.home.age) {
        const price = ev.home.price * idx, down = price * ev.home.dp / 100; one += down; bump('home', down); loan = price - down; homeVal = price; hadHome = true;
        rm = ev.home.rate / 1200; const n = ev.home.tenure * 12; emi = rm ? loan * rm * Math.pow(1 + rm, n) / (Math.pow(1 + rm, n) - 1) : loan / n; emiEnd = a + ev.home.tenure; emiMonthly = emi;
      }
      if (owned && hadHome) {
        if (a < emiEnd) for (let m = 0; m < 12 && loan > 0; m++) { const i = loan * rm, pr = Math.min(loan, emi - i); loan -= pr; emiPaid += emi; }
        maint = homeVal * 0.01; homeVal *= 1 + infl;
      }
      const running = living + rent + extra + emiPaid + maint, flow = takeHome - running - one, r = corp < 0 ? BORROW_RATE : rr;
      if (a === a0) firstYear = { takeHome, living, rent, extra, emi: emiPaid, flow };
      corp = corp * (1 + r) + flow * (1 + r / 2);
      if (free === null && corp > 0 && corp * FREEDOM_RATE >= running) free = a + 1;
      if (crunch === null && corp < 0) { crunch = a + 1; crunchInfo = { age: a + 1, flow, takeHome, running, one, retired: a >= ret }; }
      rows.push({ a: a + 1, nw: corp + homeVal - loan, corp, idx: idx * (1 + infl), home: homeVal - loan });
    }
    return { rows, a0, ret, end, free, crunch, crunchInfo, eventCost, firstYear, emiMonthly, infl };
  }

  /** What would make a failing plan work? Each fix is tested by re-running the simulation. */
  function fixes(p) {
    const works = o => run({ ...p, ...o }).crunch === null, out = {};
    if (p.living > 0 && works({ living: 0 })) { let lo = 0, hi = p.living; for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; works({ living: mid }) ? lo = mid : hi = mid; } out.living = Math.floor(lo / 500) * 500; }
    for (let r = Math.round(p.retire) + 1; r < Math.round(p.end); r++) if (works({ retire: r })) { out.retire = r; break; }
    const S = run(p), ids = Object.keys(S.eventCost).filter(id => (p.events[id] || {}).on).sort((x, y) => S.eventCost[y] - S.eventCost[x]);
    for (const id of ids) if (works({ skip: id })) { out.skip = id; break; }
    return out;
  }

  const api = { run, fixes, DEFAULT_EVENTS, NAMES, FREEDOM_RATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LifeSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
