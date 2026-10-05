#!/usr/bin/env node
/* Indian number formatting, so figures in posts and images are never rounded by hand.
   node fmt.js 769904        -> ₹7,69,904   |   ₹7.7 L   |   ₹0.77 L (compact, one decimal)
   node fmt.js 16035677      -> ₹1.60 Cr
   As a module: const { inr, compact, pct, usd } = require('./fmt.js') */
'use strict';
const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr = x => (x < 0 ? '−' : '') + '₹' + inrFmt.format(Math.round(Math.abs(x)));                   // ₹7,69,904
const compact = (x, d) => { const a = Math.abs(x), s = x < 0 ? '−' : ''; if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(d === undefined ? (a >= 1e8 ? 1 : 2) : d) + ' Cr'; if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(d === undefined ? 1 : d) + ' L'; return inr(x); };   // ₹7.7 L, ₹1.60 Cr, ₹10.3 Cr (Cr gets 2 decimals under 10 Cr)
const pct = (x, d = 0) => x.toFixed(d) + '%';
const usd = x => '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(x));
module.exports = { inr, compact, pct, usd };
if (require.main === module) { const v = parseFloat(process.argv[2]); if (!Number.isFinite(v)) { console.error('Usage: node fmt.js <number>'); process.exit(2); } console.log(inr(v) + '   |   ' + compact(v) + '   |   ' + compact(v, 2) + '   |   ' + usd(v) + ' (if dollars)'); }
