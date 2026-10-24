// clipped.mjs for states a plain screen visit never reaches: approach plan, finished draft,
// export menu, Grant management, an open AI assessment, a funder-call analysis. Usage: node clipped-states.mjs
import { startServer, launch, openApp, fillGenForm } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const check = (p) => p.evaluate(() => {
  const root = document.getElementById(window._currentScreen); const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || !(el.offsetParent || el.getClientRects().length)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) continue;
    const r = document.createRange(); r.selectNodeContents(n); const tr = r.getBoundingClientRect(); if (!tr.width) continue;
    if (tr.right > innerWidth + 1) { out.push('"' + n.textContent.trim().slice(0, 30) + '" past the screen edge'); continue; }
    for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflowX !== 'visible' || ac.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect();
        if (ac.overflowX === 'auto' || ac.overflowX === 'scroll') break;
        if (tr.right > ar.right + 2) out.push('"' + n.textContent.trim().slice(0, 30) + '" cut by ' + a.className.toString().slice(0, 30));
        break;
      }
    }
  }
  return [...new Set(out)].slice(0, 8);
});
for (const w of [320, 390, 768]) {
  const t = await openApp(browser, { persona: 'np', width: w, height: 844});
  const p = t.page;
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
  const cfg = await check(p);
  await fillGenForm(p); await p.click('#gen-btn'); await p.waitForTimeout(3000);
  const plan = await check(p);
  const ap = await p.$('button:has-text("Generate with this plan")'); if (ap) await ap.click();
  await p.waitForTimeout(8000);
  const done = await check(p);
  await p.click('#export-btn').catch(() => {}); await p.waitForTimeout(300);
  const menu = await check(p);
  await p.evaluate(() => go('manage')); await p.waitForTimeout(1500);
  const manage = await check(p);
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  await p.click('#disc-grants-list .gcard button:has-text("AI assessment") >> nth=0').catch(() => {}); await p.waitForTimeout(2500);
  const assess = await check(p);
  await p.evaluate(() => go('readiness')); await p.waitForTimeout(1500);
  await p.fill('#rdy-req-ta', 'The Ahmanson Foundation invites proposals from 501(c)(3) organizations in Los Angeles County. A 1:1 cash match is required. Deadline: December 1.');
  await p.click('#rdy-req-btn'); await p.waitForTimeout(2500);
  const callRead = await check(p);
  console.log(w, JSON.stringify({ cfg, plan, done, menu, manage, assess, callRead }));
  await t.ctx.close();
}
await browser.close(); srv.close();
