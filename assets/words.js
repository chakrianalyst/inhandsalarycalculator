/* Indian number words + grouping. Works in the browser (window.IndianWords) and Node (module.exports). */
(function (root) {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const below100 = n => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
  const below1000 = n => { const h = Math.floor(n / 100), r = n % 100; return (h ? ones[h] + ' hundred' + (r ? ' ' : '') : '') + (r ? below100(r) : ''); };
  function toWords(n) {
    n = Math.floor(Math.abs(Number(n) || 0)); if (n === 0) return 'zero';
    const parts = [], crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5; const thou = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(toWords(crore) + ' crore');
    if (lakh) parts.push(below100(lakh) + ' lakh');
    if (thou) parts.push(below100(thou) + ' thousand');
    if (n) parts.push(below1000(n));
    return parts.join(' ');
  }
  function sentence(n) {
    n = Math.floor(Math.abs(Number(n) || 0)); const w = toWords(n) + (n === 1 ? ' rupee only' : ' rupees only');
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  const group = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.floor(Number(n) || 0));
  const api = { toWords, sentence, group };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IndianWords = api;
})(typeof window !== 'undefined' ? window : globalThis);
