import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const width of [1440, 390]) {
  const t = await openApp(browser, { persona: 'np', width, height: width < 600 ? 844 : 900 });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  await p.click('#disc-grants-list .gcard button:has-text("AI assessment")'); await p.waitForTimeout(2000);
  const panel = await p.$('.gca.open, [id^="gca-"].open');
  if (panel) await panel.screenshot({ path: `out/assess-${width}.png` }); else console.log('no open panel');
  console.log(width, 'errors', t.errors);
  await t.ctx.close();
}
await browser.close(); srv.close();
