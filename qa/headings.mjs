// Every screen has exactly one main heading (h1 or role=heading level 1) for screen-reader users.
// Usage: node headings.mjs
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const persona of ['visitor', 'np']) {
  const t = await openApp(browser, { persona});
  const p = t.page;
  const screens = await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding'].includes(s)));
  for (const s of screens) {
    await p.evaluate((id) => go(id), s); await p.waitForTimeout(900);
    const r = await p.evaluate(() => { const vis = (e) => !!(e.offsetParent || e.getClientRects().length); const h1 = [...document.querySelectorAll('h1, [role=heading][aria-level="1"]')].filter(vis).map((e) => e.textContent.trim().slice(0, 40)); const first = [...document.querySelectorAll('h1,h2,h3')].find(vis); return { h1, first: first ? first.tagName + ' ' + first.textContent.trim().slice(0, 30) : null }; });
    if (r.h1.length !== 1) console.log(persona, s, 'h1 count', r.h1.length, JSON.stringify(r.h1), 'first heading:', r.first);
  }
  await t.ctx.close();
}
console.log('screens checked; any listed above lack exactly one main heading');
await browser.close(); srv.close();
