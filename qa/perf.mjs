// Load timing with 4x CPU throttling (a mid-range phone): long tasks and key milestones.
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const persona of ['visitor', 'np']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await ctx.close();
  const t = await openApp(browser, { persona, width: 390, height: 844, base: 'about:blank#' }).catch(() => null);
  if (t) await t.ctx.close();
  // fresh page with throttling applied before navigation
  const t2 = await openApp(browser, { persona, width: 390, height: 844, base: 'http://127.0.0.1:3456/?qa=1' });
  const cdp = await t2.ctx.newCDPSession(t2.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await t2.page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); });
  const t0 = Date.now();
  await t2.page.reload({ waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  await t2.page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); });
  await t2.page.waitForTimeout(4000);
  const m = await t2.page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, longTasks: window.__lt.sort((a, b) => b - a).slice(0, 6), screen: window._currentScreen }; });
  console.log(persona, 'reload wall', loadMs + 'ms', JSON.stringify(m));
  await t2.ctx.close();
}
await browser.close(); srv.close();
