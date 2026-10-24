import { startServer, launch, openApp, fillGenForm } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'np', failFunctions: true });
const p = t.page;
p.on('console', (m) => { if (m.type() !== 'error') console.log('   [console.' + m.type() + ']', m.text().slice(0, 160)); });
await p.exposeFunction('_qaLog', (s) => console.log('   toast @' + ((Date.now() - T0) / 1000).toFixed(1) + 's:', s));
await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qaLog(m); return o(m); }; });
await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
const T0 = Date.now();
await fillGenForm(p); await p.click('#gen-btn');
for (let i = 0; i < 25; i++) { await p.waitForTimeout(1000); }
console.log('fn calls:', t.fnLog.join(', '));
console.log('state:', JSON.stringify(await p.evaluate(() => ({ generating: typeof generating !== 'undefined' ? generating : '?', plan: document.getElementById('ap-sub')?.textContent, planShown: document.getElementById('agent-plan')?.classList.contains('show') }))));
await browser.close(); srv.close();
