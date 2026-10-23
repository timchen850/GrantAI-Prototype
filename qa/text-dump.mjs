// Dump the visible text of every screen (plus tour + survey steps) for proofreading.
import fs from 'node:fs';
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
let out = '';
const grab = async (p, label) => { out += `\n\n=== ${label}\n` + await p.evaluate(() => document.querySelector('.screen.active, section.active')?.innerText || document.body.innerText); };
for (const [persona, screens] of [['visitor', ['landing', 'login', 'signin', 'demo', 'privacy', 'terms', 'security', 'contact']], ['np', ['dashboard', 'discovery', 'readiness', 'generator', 'manage', 'deadlines', 'profile', 'plan']], ['biz', ['nonprofit-setup', 'readiness', 'discovery']]]) {
  const t = await openApp(browser, { persona });
  for (const s of screens) { await t.page.evaluate((x) => go(x), s); await t.page.waitForTimeout(1400); await grab(t.page, persona + ' ' + s); }
  await t.ctx.close();
}
const t = await openApp(browser, { persona: 'onboarding' });
for (let i = 0; i < 6; i++) { await t.page.evaluate((n) => { obState.idx = n; obRender(); }, i); await t.page.waitForTimeout(200); await grab(t.page, 'survey ' + i); }
await t.page.evaluate(() => { go('tutorial'); tutInit(window._grange); }); 
for (let i = 0; i < 7; i++) { await t.page.evaluate((n) => { tutState.idx = n; tutState.unlocked = true; tutRender('fwd'); }, i); await t.page.waitForTimeout(600); await grab(t.page, 'tour ' + i); }
await t.ctx.close();
fs.writeFileSync('out/all-text.txt', out);
console.log('chars', out.length);
await browser.close(); srv.close();
