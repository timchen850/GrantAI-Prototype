// Text cut off by a box that hides overflow (cards, pills, buttons). The sweep only
// sees sideways page scroll; this finds content that is silently clipped instead.
// Usage: node clipped.mjs [persona,...] [width,...]
import { startServer, launch, openApp } from './harness.mjs';
const personas = (process.argv[2] || 'visitor,np').split(',');
const widths = (process.argv[3] || '320,390,1440').split(',').map(Number);
const srv = await startServer(); const browser = await launch();
let total = 0;
for (const persona of personas) for (const width of widths) {
  const t = await openApp(browser, { persona, width, height: width < 600 ? 844 : 900 });
  const p = t.page;
  const screens = await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding', 'demo'].includes(s)));
  for (const s of screens) {
    await p.evaluate((id) => { go(id); window.scrollTo(0, 0); }, s); await p.waitForTimeout(1300);
    const bad = await p.evaluate((id) => {
      const root = document.getElementById(id); if (!root || !root.classList.contains('active')) return [];
      const out = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement; if (!el || !(el.offsetParent || el.getClientRects().length)) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        if (cs.textOverflow === 'ellipsis') continue;                   // truncation on purpose
        const r = document.createRange(); r.selectNodeContents(n); const tr = r.getBoundingClientRect();
        if (!tr.width) continue;
        for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
          const ac = getComputedStyle(a);
          if (ac.overflowX !== 'visible' || ac.overflowY !== 'visible') {
            const ar = a.getBoundingClientRect();
            if (a.scrollWidth > a.clientWidth + 1 && (ac.overflowX === 'auto' || ac.overflowX === 'scroll')) break;   // scrolls on purpose
            if (tr.right > ar.right + 2 || tr.left < ar.left - 2) out.push(`"${n.textContent.trim().slice(0, 40)}" cut by ${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}.${[...a.classList].slice(0, 2).join('.')} (${Math.round(tr.right - ar.right)}px)`);
            break;
          }
        }
      }
      return [...new Set(out)].slice(0, 6);
    }, s);
    if (bad.length) { console.log(`${persona} ${width} ${s}:`); bad.forEach((b) => console.log('  ' + b)); total += bad.length; }
  }
  await t.ctx.close();
}
console.log('\nclipped text:', total);
await browser.close(); srv.close();
