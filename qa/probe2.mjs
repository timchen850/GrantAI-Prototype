import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const width of [1440, 390]) {
  const t = await openApp(browser, { persona: 'visitor', width, height: width < 600 ? 844 : 900 });
  await t.page.mouse.move(width / 2, 400);
  for (let i = 0; i < 6; i++) { await t.page.mouse.wheel(0, 500); await t.page.waitForTimeout(250); }
  await t.page.waitForTimeout(800);
  const st = await t.page.evaluate(() => ({ y: scrollY, behavior: getComputedStyle(document.documentElement).scrollBehavior, el: document.scrollingElement.tagName, st: document.scrollingElement.scrollTop }));
  console.log(width, 'after wheel 3000px:', JSON.stringify(st));
  await t.page.screenshot({ path: `out/wheel-${width}.png` });
  await t.ctx.close();
}
await browser.close(); srv.close();
