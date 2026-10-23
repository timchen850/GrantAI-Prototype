// After a finished draft: click every visible button in the generator output and record JS errors.
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'np' });
const p = t.page;
await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3456' });
p.on('dialog', (d) => d.dismiss().catch(() => {}));
const downloads = []; p.on('download', (d) => downloads.push(d.suggestedFilename()));
const popups = []; p.on('popup', (pp) => popups.push(pp.url()));
const toasts = []; await p.exposeFunction('_qt', (m) => toasts.push(m)); await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qt(m); return o(m); }; });
await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
await p.click('#gen-btn'); await p.waitForTimeout(3000);
const ap = await p.$('button:has-text("Generate with this plan")'); if (ap) await ap.click();
await p.waitForTimeout(8000);
const labels = await p.evaluate(() => [...document.querySelectorAll('#out-doc button, #out-doc [onclick], #compliance-checklist button, #ai-disclosure button, #ai-disclosure [onclick]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0; }).map((b, i) => ({ i, oc: b.getAttribute('onclick') || '(js)', text: (b.innerText || '').trim().slice(0, 30) })));
console.log('buttons in draft view:', labels.map((l) => l.text || l.oc).join(' | '));
const problems = [];
for (const b of labels) {
  if (/genShowConfig|genShowSelect/.test(b.oc)) continue;
  const before = t.errors.length;
  await p.evaluate((i) => { const el = [...document.querySelectorAll('#out-doc button, #out-doc [onclick], #compliance-checklist button, #ai-disclosure button, #ai-disclosure [onclick]')].filter((x) => x.getBoundingClientRect().width > 0)[i]; el && el.click(); }, b.i);
  await p.waitForTimeout(900);
  const errs = t.errors.slice(before);
  if (errs.length) problems.push({ text: b.text, oc: b.oc.slice(0, 50), errs: errs.slice(0, 2) });
}
console.log('problems:', JSON.stringify(problems, null, 1));
console.log('downloads:', downloads, 'popups:', popups.length, 'toasts:', toasts.slice(-8));
const clip = await p.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message));
console.log('clipboard starts:', JSON.stringify(clip.slice(0, 80)));
await browser.close(); srv.close();
