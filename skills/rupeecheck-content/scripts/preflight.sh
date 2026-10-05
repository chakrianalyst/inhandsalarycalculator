#!/usr/bin/env bash
# Checks that this skill can do its job in the current environment, and warns when its numbers may be out of date.
# Run it first:  bash scripts/preflight.sh
cd "$(dirname "$0")/.." || exit 1
ok=1
say() { printf '%-8s %s\n' "$1" "$2"; }
if command -v node >/dev/null 2>&1; then say OK "node $(node --version): the calculators and the checker can run"; else say MISSING "node: try 'pip install nodejs-wheel-binaries' or the environment's package manager. Without it you cannot run the site's calculators, so do not publish precise numbers."; ok=0; fi
if python3 -c "import PIL" >/dev/null 2>&1; then say OK "Pillow $(python3 -c 'import PIL;print(PIL.__version__)'): images can be made"; else say MISSING "Pillow: try 'pip install pillow'. If that fails, build the card as an HTML or SVG artifact for the user to screenshot."; ok=0; fi
[ -f assets/fonts/DejaVuSans-Bold.ttf ] && say OK "bundled fonts found (the ₹ sign renders)" || { say MISSING "fonts in assets/fonts"; ok=0; }
if command -v node >/dev/null 2>&1 && [ -f engine/ENGINE.json ]; then
  node -e "
    const m=require('./engine/ENGINE.json'), now=new Date(), days=d=>Math.round((now-new Date(d))/864e5);
    const built=days(m.builtOn), fx=days(m.fxDefaultsDate);
    console.log('INFO     engine built '+m.builtOn+' from commit '+(m.sourceCommit||'?')+' for tax year '+m.taxYear+'; exchange-rate defaults dated '+m.fxDefaultsDate);
    if (built>90) console.log('WARN     the engine is '+built+' days old. Tax rules may have changed (the Budget is in February). Ask the user for an updated skill before publishing tax numbers.');
    if (fx>30) console.log('WARN     the exchange-rate defaults are '+fx+' days old. For any foreign-currency post, ask the user for today\'s rate or say which date the rate is from.');
    const y=now.getFullYear(), mo=now.getMonth()+1, startYear=parseInt(m.taxYear,10), cur = mo>=4 ? y : y-1;
    if (cur>startYear) console.log('WARN     a new tax year (starting April '+cur+') has begun since this engine was built. Do not publish tax numbers until the skill is updated.');
  "
fi
[ "$ok" = 1 ] && echo "READY    all tools available" || echo "LIMITED  some tools are missing: see above, and tell the user what you could not check"
