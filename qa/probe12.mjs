import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'visitor', backendDown: true });
const p = t.page; const T0 = Date.now();
const toasts = []; await p.exposeFunction('_qt', (m) => toasts.push(((Date.now() - T0) / 1000).toFixed(1) + 's ' + m)); await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qt(m); return o(m); }; });
p.on('request', (r) => { if (r.url().includes('supabase.co')) console.log('  req', ((Date.now() - T0) / 1000).toFixed(1) + 's', r.method(), r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 70)); });
await p.evaluate(() => go('signin')); await p.waitForTimeout(800);
await p.fill('#si-email-input', 'someone@example.org'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
console.log('step visible:', await p.evaluate(() => [...document.querySelectorAll('.si-step')].filter((e) => getComputedStyle(e).display !== 'none' && e.classList.contains('on') || e.classList.contains('active')).map((e) => e.id)));
await p.fill('#si-pw-input', 'whatever-123'); await p.click('#si-cont-btn');
for (let i = 0; i < 15; i++) { await p.waitForTimeout(1000); }
console.log('btn:', await p.textContent('#si-cont-btn'), '| manualFlow:', await p.evaluate(() => window._manualAuthFlow), '| siBusy?', await p.evaluate(() => typeof siBusy !== 'undefined' ? siBusy : 'n/a'));
console.log('toasts:', toasts);
await browser.close(); srv.close();
