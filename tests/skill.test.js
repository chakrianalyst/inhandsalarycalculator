/* The RupeeCheck content skill (skills/rupeecheck-content) computes with copies of the site's own calculation code.
   These tests make sure the copies never drift from the site, that the runner reproduces the site's defaults, and that the independent checker really catches errors. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SKILL = path.join(ROOT, 'skills', 'rupeecheck-content'), ENG = path.join(SKILL, 'engine');
const run = require(path.join(ENG, 'run.js')), V = require(path.join(ENG, 'verify.js')), fmt = require(path.join(ENG, 'fmt.js'));
const Tax = require(path.join(ROOT, 'assets', 'tax.js'));

test('skill engine is an exact copy of the site (run: node scripts/build-skill.js)', () => {
  const r = spawnSync('node', [path.join(ROOT, 'scripts', 'build-skill.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('SKILL.md has valid frontmatter and stays a sensible size', () => {
  const md = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8'), m = md.match(/^---\nname: ([a-z0-9-]+)\ndescription: ([\s\S]*?)\n---\n/);
  assert.ok(m, 'frontmatter'); assert.equal(m[1], 'rupeecheck-content'); assert.ok(m[2].length <= 1024, 'description is ' + m[2].length + ' characters');
  assert.ok(md.split('\n').length < 500, 'SKILL.md under 500 lines');
  for (const f of ['voices-and-platforms', 'creative-playbook', 'number-protocol', 'site-facts', 'compliance', 'image-guide']) assert.ok(md.includes('references/' + f + '.md'), f + ' is linked from SKILL.md');
  for (const f of ['voices-and-platforms', 'creative-playbook', 'number-protocol', 'site-facts', 'compliance', 'image-guide']) assert.ok(fs.existsSync(path.join(SKILL, 'references', f + '.md')), f);
});

test('runner reproduces the figures the site and its guides show', () => {
  const s = run.TOOLS.salary({}); assert.equal(Math.round(s.results.inHandMonth), 88276); assert.equal(s.results.regimeUsed, 'new');
  const r = run.TOOLS.regime({ gross: 1500000 }).results; assert.equal(Math.round(r.newRegimeTax), 97500); assert.ok(Math.abs(r.oldRegimeBreakEvenDeductions - 543750) < 5);
  const sip = run.TOOLS.sip({ mode: 'goal', goalIn: 'future', goal: 10000000, yrs: 10, ret: 12 }).results; assert.equal(Math.round(sip.monthlySip), 44636);
  const e = run.TOOLS.emi({ amt: 5000000, rate: 8.5, yrs: 20, extra: 5000 }).results; assert.equal(Math.round(e.emi), 43391); assert.ok(Math.abs(e.withPrepayment.yearsToRepay - 15.58) < 0.01); assert.equal(Math.round(e.withPrepayment.interestSaved / 1e5), 14);
  const a = run.TOOLS.abroad({ city: 'sf', gross: 150000, ctc: 4000000 }).results; assert.equal(Math.round(a.takeHomeMonthAbroadInRupees), 769904); assert.equal((a.netWorthEndAbroad / 1e7).toFixed(1), '10.3'); assert.equal((a.rentCut20PctAddsToNetWorth / 1e7).toFixed(2), '1.70');
  assert.equal(Math.round(run.TOOLS.salary({ ctc: 1200000 }).results.inHandMonth), Math.round(Tax.salary({ ctc: 1200000, basicPct: 40, hraPct: 50, variablePct: 0, pfCap: false, gratuity: true, employerNps: 0, ptMonthly: 200, metro: true, rentMonthly: 0 }).new.inHandMonth));
});

test('independent checker agrees on every default and sample scenario, and says so honestly when it cannot check', () => {
  const scen = [['salary', {}], ['salary', { ctc: 2000000 }], ['salary', { ctc: 800000 }], ['regime', { gross: 2000000 }], ['sip', { mode: 'goal', goalIn: 'today', goal: 5000000, yrs: 15, ret: 11, step: 8 }], ['sip', {}], ['emi', { amt: 3000000, rate: 9, yrs: 15, extra: 3000, lump: 200000, lumpM: 12 }],
    ['fd', {}], ['fd', { mode: 'rd' }], ['gratuity', {}], ['hra', {}], ['fire', {}], ['rentbuy', {}], ['abroad', { city: 'sf', gross: 150000 }], ['abroad', { country: 'UK', gross: 90000 }], ['return', {}]];
  for (const [tool, inp] of scen) {
    const r = spawnSync('node', [path.join(ENG, 'verify.js'), tool, JSON.stringify(inp)], { encoding: 'utf8' });
    assert.equal(r.status, 0, tool + ' ' + JSON.stringify(inp) + '\n' + r.stdout + r.stderr); assert.ok(/AGREE|APPROXIMATE|UNVERIFIED/.test(r.stdout), tool);
  }
});

test('the checker catches a wrong number (it would stop a bad post)', () => {
  V.lines.length = 0; const good = run.TOOLS.emi({ amt: 5000000, rate: 8.5, yrs: 20 }); const bad = JSON.parse(JSON.stringify(good)); bad.results.emi += 50;
  V.V.emi({ inputs: bad.inputs, results: bad.results }); assert.ok(V.lines.some(l => l.status === 'MISMATCH'), 'a ₹50 error in the EMI must be flagged');
  V.lines.length = 0; const s = run.TOOLS.salary({}); s.results.taxNewRegime += 500; V.V.salary({ inputs: s.inputs, results: s.results }); assert.ok(V.lines.some(l => l.status === 'MISMATCH'), 'a wrong tax figure must be flagged'); V.lines.length = 0;
});

test('Indian number formatting', () => {
  assert.equal(fmt.inr(769904), '₹7,69,904'); assert.equal(fmt.compact(769904), '₹7.7 L'); assert.equal(fmt.compact(102908560), '₹10.3 Cr'); assert.equal(fmt.compact(16035677), '₹1.60 Cr'); assert.equal(fmt.compact(8954238), '₹89.5 L'); assert.equal(fmt.inr(-1500), '−₹1,500'); assert.equal(fmt.usd(113088), '$113,088');
});

test('the runner rejects bad input clearly instead of returning a number', () => {
  const r = spawnSync('node', [path.join(ENG, 'run.js'), 'abroad', JSON.stringify({ country: 'UK' })], { encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /gross/);
  const r2 = spawnSync('node', [path.join(ENG, 'run.js'), 'nope'], { encoding: 'utf8' }); assert.notEqual(r2.status, 0);
});

test('image maker renders every template when Pillow is available', { skip: spawnSync('python3', ['-c', 'import PIL']).status !== 0 && 'Pillow not installed' }, () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rc-card-')), S = path.join(SKILL, 'scripts', 'render_card.py');
  const specs = { compare: { template: 'compare', title: 'A **vs** B', columns: ['A', 'B'], rows: [{ label: 'x', values: ['₹1 L', '₹2 L'] }, { label: 'y', values: ['₹3 Cr', '₹4 Cr'], highlight: true }], footer: 'rupeecheck.in' },
    stat: { template: 'stat', title: 'T', number: '₹88,276', number_label: 'a month', rows: [{ label: 'a', values: ['₹1'] }] }, myth: { template: 'myth', size: 'square', title: 'T', myth: 'm', math: '₹1', math_label: 'l' }, bars: { template: 'bars', size: 'landscape', title: 'T', items: [{ label: 'a', value: 2, display: '2' }, { label: 'b', value: 1, display: '1', highlight: true }] } };
  for (const [k, spec] of Object.entries(specs)) { const sp = path.join(tmp, k + '.json'), out = path.join(tmp, k + '.png'); fs.writeFileSync(sp, JSON.stringify(spec)); execFileSync('python3', [S, sp, out]); const b = fs.readFileSync(out); assert.equal(b.slice(1, 4).toString(), 'PNG', k); assert.ok(b.length > 20000, k + ' looks empty'); }
  const sp = path.join(tmp, 'car.json'); fs.writeFileSync(sp, JSON.stringify({ name: 'c', size: 'portrait', slides: [specs.myth, specs.stat] })); execFileSync('python3', [S, sp, path.join(tmp, 'car')]); assert.ok(fs.existsSync(path.join(tmp, 'car', 'c-02.png')) && fs.existsSync(path.join(tmp, 'car', 'c.pdf')));
  fs.rmSync(tmp, { recursive: true, force: true });
});
