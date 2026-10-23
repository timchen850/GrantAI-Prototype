import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const persona of (process.argv[2] || 'visitor,newuser,np,legacy,biz,onboarding').split(',')) {
  const t = await openApp(browser, { persona });
  await t.page.waitForTimeout(1500);
  const st = await t.page.evaluate(() => ({ screen: window._currentScreen, active: [...document.querySelectorAll('.screen.active, section.active')].map(e => e.id), vis: document.documentElement.style.visibility }));
  console.log(`\n## ${persona}:`, JSON.stringify(st));
  console.log('errors:', t.errors.length ? t.errors : 'none');
  console.log('external:', t.external.length ? [...new Set(t.external)].slice(0, 8) : 'none');
  console.log('rest:', t.restLog.slice(0, 12).join(' ; '));
  console.log('fn:', t.fnLog.join(','));
  await t.page.screenshot({ path: `out/smoke-${persona}.png` });
  await t.ctx.close();
}
await browser.close(); srv.close();
