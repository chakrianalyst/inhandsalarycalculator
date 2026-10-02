/* Life money simulation — pure functions, no DOM. Used by life-simulator.html and the tests.
   All money inputs are today's rupees; the model inflates them to the year they happen.

   Each year:  surplus = pay − (living costs + rent + EMI + home upkeep + child/parent costs) − one-off events
               you invest  investPct% of a positive surplus (the rest is spent); a negative surplus is drawn from savings
               savings     = savings × (1 + return) + invested × (1 + return/2)      (new money earns half a year)
   Living costs rise with inflation, plus "lifestyle creep": creep% of every REAL pay rise (pay growth above inflation) is spent. */
(function (root) {
  const TaxEngine = typeof Tax !== 'undefined' ? Tax : require('./tax.js');          // browser: global from tax.js; Node: require
  const BORROW_RATE = 0.12;                                      // what a shortfall would cost if you had to borrow
  const FREEDOM_RATE = 0.035;                                    // withdrawal rate used for "financial freedom"

  const DEFAULT_EVENTS = {
    home:    { on: true,  past: false, age: 32, price: 8000000, dp: 20, rate: 8.5, tenure: 20, value: 8000000, loan: 4000000, emi: 40000, yearsLeft: 15 },
    wed:     { on: true,  age: 30, cost: 1500000, uplift: 25 },
    kid:     { on: true,  past: false, age: 32, cost: 300000, monthly: 15000, edu: 2500000, childAge: 5, share: 15000, wedCost: 0, wedAge: 27 },
    kid2:    { on: false, age: 36, cost: 300000, monthly: 15000, edu: 2500000, wedCost: 0, wedAge: 27 },
    jump:    { on: true,  age: 35, pct: 35, every: 0 },    // every = 0 means one jump only; otherwise it repeats every N years until you stop working
    car:     { on: true,  age: 34, cost: 1200000, every: 0 },    // every = 0 means one car only
    parents: { on: false, age: 36, monthly: 15000, yrs: 20 },
    break:   { on: false, age: 40, yrs: 1 },
    pension: { on: false, age: 60, monthly: 20000 },              // pension, rent or other income that starts later, in today's rupees a month
    crash:   { on: false, age: 58, drop: 30 },                    // a market fall: your savings lose this % at the start of that year
  };
  const NAMES = { home: 'home purchase', wed: 'wedding', kid: 'child', kid2: 'second child', jump: 'career jump', car: 'car', parents: 'support for parents', break: 'career break', pension: 'pension or rental income', crash: 'market crash' };

  /** p: { age, retire, end, inflation, growth, ret (percent numbers), incomeMode:'net'|'gross', income (₹/month take-home if net, ₹/year gross if gross),
   *       living, rent (₹/month), savings (₹), investPct (0-100, default 100), creep (0-100, default 0), retReturn (% a year once you stop working, default = ret), eduInfl (% a year for higher education, default = inflation), homeGrowth (% a year home prices rise, default = inflation), events, skip (event id to leave out) } */
  function run(p) {
    const a0 = Math.round(p.age), ret = Math.max(a0 + 1, Math.round(p.retire)), end = Math.max(ret + 1, Math.round(p.end));
    const infl = p.inflation / 100, rrAfter = (p.retReturn == null ? p.ret : p.retReturn) / 100, eduInfl = (p.eduInfl == null ? p.inflation : p.eduInfl) / 100, homeG = (p.homeGrowth == null ? p.inflation : p.homeGrowth) / 100, g = p.growth / 100, rr = p.ret / 100, ev = p.events || DEFAULT_EVENTS;
    const investShare = (p.investPct == null ? 100 : Math.min(100, Math.max(0, p.investPct))) / 100, creep = Math.min(100, Math.max(0, p.creep || 0)) / 100;
    const on = id => !!(ev[id] && ev[id].on) && p.skip !== id;
    const living0 = p.living * 12, rent0 = p.rent * 12, gross = p.incomeMode === 'gross';
    const taxOf = (inc, idx) => inc > 0 ? TaxEngine.computeTax(Math.max(0, inc - 75000 * idx) / idx, 'new').total * idx : 0;   // new-regime slabs, indexed to inflation
    let corp = p.savings, homeVal = 0, loan = 0, emi = 0, emiEnd = -1, rm = 0, hadHome = false, emiMonthly = 0, creepExtra = 0, prevPay = null;
    if (on('home') && ev.home.past) { homeVal = ev.home.value; loan = ev.home.loan; rm = ev.home.rate / 1200; emi = ev.home.emi; emiEnd = a0 + ev.home.yearsLeft; hadHome = true; emiMonthly = emi; }   // already own it
    const rows = [{ a: a0, nw: corp + homeVal - loan, corp, idx: 1, home: homeVal - loan, run: 0 }], years = [], eventCost = {}; let free = null, crunch = null, crunchInfo = null, firstYear = null;
    const bump = (id, v) => { if (crunch === null) eventCost[id] = (eventCost[id] || 0) + v; };      // only costs up to the point the money runs out matter for diagnosis

    for (let a = a0; a < end; a++) {
      const idx = Math.pow(1 + infl, a - a0);
      let takeHome = 0, payFull = 0, crashLoss = 0;
      if (on('crash') && a === ev.crash.age && corp > 0) { crashLoss = corp * ev.crash.drop / 100; corp -= crashLoss; }      // the fall hits your investments before the year's money moves
      if (a < ret) {
        let mult = Math.pow(1 + g, a - a0); if (on('jump') && a >= ev.jump.age) mult *= Math.pow(1 + ev.jump.pct / 100, ev.jump.every > 0 ? Math.floor((a - ev.jump.age) / ev.jump.every) + 1 : 1);
        const base = (gross ? p.income : p.income * 12) * mult;
        payFull = gross ? base - taxOf(base, idx) : base; takeHome = payFull;
        if (on('break') && a >= ev.break.age && a < ev.break.age + ev.break.yrs) takeHome = 0;     // creep follows pay as if there were no break
      }
      const pens = on('pension') && a >= ev.pension.age ? ev.pension.monthly * 12 * idx : 0; takeHome += pens;
      // lifestyle creep: a share of every REAL raise (above inflation) becomes permanent extra spending
      if (a === a0) creepExtra = 0; else if (a < ret) creepExtra = creepExtra * (1 + infl) + creep * Math.max(0, payFull - prevPay * (1 + infl)); else creepExtra *= 1 + infl;
      if (a < ret) prevPay = payFull;

      const owned = on('home') && (ev.home.past || a >= ev.home.age);
      let living = living0 * idx * (on('wed') && a >= ev.wed.age ? 1 + ev.wed.uplift / 100 : 1) + creepExtra, rent = owned ? 0 : rent0 * idx;
      let extra = 0, one = 0, emiPaid = 0, maint = 0, relief = 0; const list = [];
      const addOne = (id, amt, today) => { one += amt; list.push({ id, amt, today }); };      // today = what the same thing costs in today's rupees
      const kid = id => {
        if (!on(id)) return; const c = ev[id], past = id === 'kid' && c.past, born = past ? a0 - c.childAge : c.age;
        if (!past) { if (a >= born && a < born + 22) extra += c.monthly * 12 * idx; if (a === born) { addOne(id, c.cost * idx, c.cost); bump(id, c.cost * idx); } }
        else if (c.share > 0 && a >= born + 22) relief += c.share * 12 * idx;                           // their costs are inside today's living costs; they stop at 22
        if (c.wedCost > 0 && a === born + c.wedAge && a >= a0) { const w = c.wedCost * idx; addOne(id + 'Wed', w, c.wedCost); bump(id, w); }          // your child's wedding
        if (a >= born + 18 && a < born + 22) { const e = c.edu / 4 * Math.pow(1 + eduInfl, a - a0); addOne(id + 'Edu', e, c.edu / 4); bump(id, e); }      // higher education, only years still to come
      };
      kid('kid'); kid('kid2'); living = Math.max(0, living - relief);
      if (on('parents') && a >= ev.parents.age && a < ev.parents.age + ev.parents.yrs) extra += ev.parents.monthly * 12 * idx;
      if (on('wed') && a === ev.wed.age) { addOne('wed', ev.wed.cost * idx, ev.wed.cost); bump('wed', ev.wed.cost * idx); }
      if (on('car') && a >= ev.car.age && (ev.car.every > 0 ? (a - ev.car.age) % ev.car.every === 0 : a === ev.car.age)) { addOne('car', ev.car.cost * idx, ev.car.cost); bump('car', ev.car.cost * idx); }
      if (on('home') && !ev.home.past && a === ev.home.age) {
        const price = ev.home.price * Math.pow(1 + homeG, a - a0), down = price * ev.home.dp / 100; addOne('home', down, ev.home.price * ev.home.dp / 100); bump('home', down); loan = price - down; homeVal = price; hadHome = true;
        rm = ev.home.rate / 1200; const n = ev.home.tenure * 12; emi = rm ? loan * rm * Math.pow(1 + rm, n) / (Math.pow(1 + rm, n) - 1) : loan / n; emiEnd = a + ev.home.tenure; emiMonthly = emi;
      }
      if (owned && hadHome) {
        if (a < emiEnd) for (let m = 0; m < 12 && loan > 0; m++) { const i = loan * rm, pr = Math.min(loan, emi - i); loan -= pr; emiPaid += emi; }
        maint = homeVal * 0.01; homeVal *= 1 + homeG;
      }
      const running = living + rent + extra + emiPaid + maint, flow = takeHome - running - one;
      const r = corp < 0 ? BORROW_RATE : a >= ret ? rrAfter : rr, invested = flow > 0 && corp >= 0 ? flow * investShare : flow;      // in debt, every spare rupee repays it
      if (a === a0) firstYear = { takeHome, living, rent, extra, emi: emiPaid, maint, one, flow, invested };
      corp = corp * (1 + r) + invested * (1 + r / 2);
      if (free === null && corp > 0 && corp * FREEDOM_RATE >= running) free = a + 1;
      if (crunch === null && corp < 0) { crunch = a + 1; crunchInfo = { age: a + 1, flow, takeHome, running, one, retired: a >= ret }; }
      rows.push({ a: a + 1, nw: corp + homeVal - loan, corp, idx: idx * (1 + infl), home: homeVal - loan, run: running });
      years.push({ a, list, crashLoss, pension: pens, idx, endIdx: idx * (1 + infl), pay: takeHome, living, rent, extra, emi: emiPaid, maint, one, running, flow, invested, corp, home: homeVal - loan, nw: corp + homeVal - loan });
    }
    return { rows, years, a0, ret, end, free, crunch, crunchInfo, eventCost, firstYear, emiMonthly, infl };
  }

  /** What would make a failing plan work? Each fix is tested by re-running the simulation. */
  function fixes(p) {
    const works = o => run({ ...p, ...o }).crunch === null, out = {};
    if (p.living > 0 && works({ living: 0 })) { let lo = 0, hi = p.living; for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; works({ living: mid }) ? lo = mid : hi = mid; } out.living = Math.floor(lo / 500) * 500; }
    for (let r = Math.round(p.retire) + 1; r < Math.round(p.end); r++) if (works({ retire: r })) { out.retire = r; break; }
    const S = run(p), ids = Object.keys(S.eventCost).filter(id => (p.events[id] || {}).on).sort((x, y) => S.eventCost[y] - S.eventCost[x]);
    for (const id of ids) if (works({ skip: id })) { out.skip = id; break; }
    if ((p.investPct == null ? 100 : p.investPct) < 100 && works({ investPct: 100 })) out.invest = true;
    if ((p.creep || 0) > 0 && works({ creep: 0 })) out.creep = true;
    return out;
  }

  const api = { run, fixes, DEFAULT_EVENTS, NAMES, FREEDOM_RATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LifeSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
