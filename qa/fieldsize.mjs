// iPhone Safari zooms the page when a field under 16px gets focus: list any on phone screens.
// Usage: node fieldsize.mjs
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const small = new Map();
for (const persona of ['visitor', 'np', 'onboarding']) {
  const t = await openApp(browser, { persona, width: 390, height: 844});
  const p = t.page;
  const screens = persona === 'onboarding' ? ['onboarding'] : await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding', 'demo'].includes(s)));
  for (const s of screens) {
    if (persona !== 'onboarding') { await p.evaluate((id) => go(id), s); await p.waitForTimeout(800); }
    if (s === 'generator') { await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(600); }
    const r = await p.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea')].filter((e) => e.offsetParent).map((e) => [e.id || e.className || e.tagName, parseFloat(getComputedStyle(e).fontSize)]).filter(([, f]) => f < 16));
    r.forEach(([id, f]) => small.set(id, f));
  }
  await t.ctx.close();
}
console.log(small.size, 'fields under 16px on phones:'); console.log([...small].map(([k, v]) => k + ' ' + v + 'px').join('\n'));
await browser.close(); srv.close();
