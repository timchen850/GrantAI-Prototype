import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const persona of ['np', 'visitor']) {
  const t = await openApp(browser, { persona, backendDown: true });
  const p = t.page;
  await p.waitForTimeout(4000);
  const st = await p.evaluate(() => ({ vis: document.documentElement.style.visibility, screen: window._currentScreen }));
  console.log(persona, 'on load:', JSON.stringify(st));
  const toasts = []; await p.exposeFunction('_qt', (m) => toasts.push(m)); await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qt(m); return o(m); }; });
  if (persona === 'visitor') {
    await p.evaluate(() => go('signin')); await p.waitForTimeout(800);
    await p.fill('#si-email-input', 'someone@example.org'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
    await p.fill('#si-pw-input', 'whatever-123'); await p.click('#si-cont-btn'); await p.waitForTimeout(2500);
    console.log('  sign-in attempt toasts:', toasts, 'screen', await p.evaluate(() => window._currentScreen));
    await p.evaluate(() => go('login')); await p.waitForTimeout(500);
    await p.fill('#reg-org', 'X'); await p.fill('#reg-email', 'x@example.org'); await p.fill('#reg-pw', 'correct-horse-9'); await p.fill('#reg-pw2', 'correct-horse-9');
    await p.click('button:has-text("Create account")'); await p.waitForTimeout(2500);
    console.log('  sign-up attempt toasts:', toasts.slice(-2));
  }
  console.log('  uncaught errors:', t.errors.filter((e) => e.startsWith('pageerror')).slice(0, 4));
  await t.ctx.close();
}
await browser.close(); srv.close();
