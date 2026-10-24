// Tab through a screen and report focusable elements with no visible focus indicator.
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const [persona, scr] of (process.argv[2] ? process.argv[2].split(',').map((x) => x.split(':')) : [['visitor', 'landing'], ['visitor', 'login'], ['np', 'discovery'], ['np', 'profile']])) {
  const t = await openApp(browser, { persona });
  const p = t.page;
  await p.evaluate((s) => { go(s); window.scrollTo(0, 0); document.activeElement?.blur(); }, scr); await p.waitForTimeout(1200);
  const noRing = new Map(); let n = 0;
  for (let i = 0; i < 45; i++) {
    await p.keyboard.press('Tab'); await p.waitForTimeout(60);
    const r = await p.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      return { key: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ')[0], text: (el.innerText || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 30), ring, scr: window._currentScreen };
    });
    if (!r) continue; n++;
    if (!r.ring) noRing.set(r.key, r.text);
  }
  console.log(`\n## ${persona} ${scr}: ${n} tab stops, ${noRing.size} without a visible focus style`);
  [...noRing].slice(0, 12).forEach(([k, v]) => console.log('   ', k, JSON.stringify(v)));
  await t.ctx.close();
}
await browser.close(); srv.close();
