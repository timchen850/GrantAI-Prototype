import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const width of [1440, 390]) {
  const t = await openApp(browser, { persona: 'visitor', width, height: width < 600 ? 844 : 900 });
  const p = t.page;
  await p.evaluate(() => go('demo')); await p.waitForTimeout(1500);
  for (let i = 0; i < 7; i++) {
    await p.screenshot({ path: `out/demo-${width}-${i}.png` });
    if (width < 600) {
      await p.evaluate(() => { const d = document.getElementById('demo'); const mk = (y) => ({ touches: [{ clientY: y }], changedTouches: [{ clientY: y }] });
        const ts = new Event('touchstart'); Object.assign(ts, mk(600)); d.dispatchEvent(ts);
        const te = new Event('touchend'); Object.assign(te, mk(200)); d.dispatchEvent(te); });
    } else { await p.mouse.move(700, 450); await p.mouse.wheel(0, 400); }
    await p.waitForTimeout(4200);
  }
  const cur = await p.evaluate(() => [...document.querySelectorAll('#demo .dp-screen-current')].map((e) => e.id));
  console.log(width, 'final screen', cur, 'errors', t.errors);
  await t.ctx.close();
}
await browser.close(); srv.close();
