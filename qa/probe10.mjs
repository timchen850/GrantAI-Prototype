import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'np', revokedSession: true });
await t.page.waitForTimeout(6000);
console.log(JSON.stringify(await t.page.evaluate(() => ({ vis: document.documentElement.style.visibility, pending: window._authPending, screen: window._currentScreen }))));
console.log('errors', t.errors.slice(0, 3));
await t.page.screenshot({ path: 'out/revoked.png' });
await browser.close(); srv.close();
