// Find the smallest elements whose removal stops sideways scroll on a screen.
import { startServer, launch, openApp } from './harness.mjs';
const [persona = 'np', screen = 'dashboard', width = '390'] = process.argv.slice(2);
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona, width: +width, height: +width < 600 ? 844 : 800 });
await t.page.evaluate((s) => go(s), screen); await t.page.waitForTimeout(1800);
const res = await t.page.evaluate(() => {
  const vw = document.documentElement.clientWidth, base = document.documentElement.scrollWidth, hits = [];
  const els = [...document.querySelectorAll('.screen.active *, section.active *')].filter((e) => e.getBoundingClientRect().width > 0);
  for (const el of els) {
    const prev = el.style.display; el.style.display = 'none';
    const w = document.documentElement.scrollWidth; el.style.display = prev;
    if (w <= vw && base > vw) hits.push(el);
  }
  // keep the deepest: drop any hit that contains another hit
  const deepest = hits.filter((h) => !hits.some((o) => o !== h && h.contains(o)));
  return { vw, base, deepest: deepest.map((e) => { const cs = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 70), w: Math.round(e.getBoundingClientRect().width), ws: cs.whiteSpace, display: cs.display, minW: cs.minWidth, flexShrink: cs.flexShrink, gridCols: cs.gridTemplateColumns.slice(0, 60), text: (e.innerText || '').slice(0, 50) }; }) };
});
console.log(JSON.stringify(res, null, 1));
await browser.close(); srv.close();
