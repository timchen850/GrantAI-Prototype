import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'visitor', width: 1440, height: 900 });
await t.page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
for (const y of [1300, 1700, 2100]) {
  await t.page.evaluate((yy) => window.scrollTo(0, yy), y);
  for (const wait of [500, 2500]) {
    await t.page.waitForTimeout(wait);
    const info = await t.page.evaluate(() => [...document.querySelectorAll('#landing .stat-band, #landing .stat-band *, #landing section:nth-of-type(3) *')].filter(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && e.children.length === 0 && (e.innerText||'').trim(); }).slice(0, 6).map(e => { const cs = getComputedStyle(e); let op = 1, n = e; while (n && n !== document.body) { op *= +getComputedStyle(n).opacity; n = n.parentElement; } return { t: e.innerText.trim().slice(0, 30), op: +op.toFixed(2), color: cs.color, cls: String(e.className).slice(0, 30) }; }));
    console.log('y', y, 'after', wait, JSON.stringify(info));
  }
  await t.page.screenshot({ path: `out/probe-${y}.png` });
}
await browser.close(); srv.close();
