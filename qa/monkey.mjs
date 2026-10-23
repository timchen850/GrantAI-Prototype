// Click every visible button on each app screen (fresh screen each time) and record JS errors.
import { startServer, launch, openApp } from './harness.mjs';
const SKIP = /signOut|tutReplay|tutExit|mNav|goHome|^go\(|window\.print/;
const screens = (process.argv[2] || 'dashboard,discovery,readiness,nonprofit-setup,generator,manage,deadlines,profile,plan').split(',');
const persona = process.argv[3] || 'np';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona });
const p = t.page;
await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3456' });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
p.on('download', () => {});
let total = 0; const problems = [];
for (const scr of screens) {
  await p.evaluate((s) => go(s), scr); await p.waitForTimeout(1500);
  const labels = await p.evaluate((s) => [...document.querySelectorAll('#' + s + ' button, #' + s + ' [onclick]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((b, i) => ({ i, oc: b.getAttribute('onclick') || '(js)', text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 30) })), scr);
  for (const b of labels) {
    if (SKIP.test(b.oc)) continue;
    await p.evaluate((s) => { if (window._currentScreen !== s) go(s); }, scr).catch(() => {}); await p.waitForTimeout(300);
    const before = t.errors.length;
    const ok = await p.evaluate(([s, i]) => { const el = [...document.querySelectorAll('#' + s + ' button, #' + s + ' [onclick]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[i]; if (!el) return false; el.click(); return true; }, [scr, b.i]);
    if (!ok) continue;
    total++;
    await p.waitForTimeout(900);
    const still = await p.evaluate(() => typeof go === 'function').catch(() => false);
    if (!still) {
      problems.push({ scr, text: b.text, oc: b.oc.slice(0, 60), left: p.url() });
      await p.goto('http://127.0.0.1:3456/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
      continue;
    }
    const errs = t.errors.slice(before).filter((e) => e.startsWith('pageerror') || /TypeError|ReferenceError|is not a function|Cannot read/.test(e));
    if (errs.length) problems.push({ scr, text: b.text, oc: b.oc.slice(0, 60), errs: errs.slice(0, 2) });
    await p.keyboard.press('Escape').catch(() => {});
  }
}
console.log('buttons clicked:', total, 'with JS errors:', problems.length);
problems.forEach((x) => console.log(JSON.stringify(x)));
await browser.close(); srv.close();
