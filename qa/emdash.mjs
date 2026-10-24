// Copy check: no em dashes (—) in anything the app can show. Renders every screen for each
// account type, plus the demo and each tour step, and searches all text in the screen (including
// collapsed guides such as "How to get it") and the placeholder, title and aria-label attributes.
// Usage: node emdash.mjs [persona,...]
import { startServer, launch, openApp } from './harness.mjs';

const personas = (process.argv[2] || 'visitor,np,legacy,biz,onboarding,newuser').split(',');
const srv = await startServer(); let total = 0;
const scan = (p, id) => p.evaluate((id) => {
  const root = document.getElementById(id); if (!root) return [];
  const out = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement && n.parentElement.closest('script,style')) continue;
    if (n.textContent.includes('—')) out.push('"' + n.textContent.trim().slice(0, 100) + '"');
  }
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
    ['placeholder', 'title', 'aria-label'].forEach((a) => { const v = el.getAttribute(a); if (v && v.includes('—')) out.push(a + '="' + v.slice(0, 100) + '"'); });
  });
  return out;
}, id);
for (const persona of personas) {
  const browser = await launch();
  const t = await openApp(browser, { persona, reducedMotion: true });
  const p = t.page;
  await p.waitForTimeout(1500);
  const stops = [];
  if (persona === 'newuser') {
    const n = await p.evaluate(() => TUT_STEPS.length);
    for (let i = 0; i < n; i++) stops.push(['tutorial', async () => { await p.evaluate((i) => { tutState.unlocked = true; tutState.idx = i; tutRender('fwd'); }, i); await p.waitForTimeout(1800); }, 'step ' + i]);
    const m = await p.evaluate(() => OB_STEPS.length);
    for (let i = 0; i < m; i++) stops.push(['onboarding', async () => { await p.evaluate((i) => { if (window._currentScreen !== 'onboarding') { go('onboarding'); obInit(window._grange); } obState.idx = i; obRender(); }, i); await p.waitForTimeout(900); }, 'step ' + i]);
  } else {
    const screens = await p.evaluate((pub) => SCREENS.filter((s) => !['tutorial', 'onboarding'].includes(s) && (pub ? PUBLIC_SCREENS.includes(s) : !PUBLIC_SCREENS.includes(s))), persona === 'visitor');
    for (const s of screens) stops.push([s, async () => { await p.evaluate((id) => go(id), s); await p.waitForTimeout(1600); if (s === 'generator') { await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(700); } }, '']);
  }
  for (const [id, show, label] of stops) {
    await show();
    const hits = await scan(p, id);
    if (hits.length) { console.log(`${persona} ${id} ${label}:`); hits.forEach((h) => console.log('  ' + h)); total += hits.length; }
  }
  if (t.errors.length) console.log(persona, 'console errors:', t.errors.slice(0, 3).join(' | '));
  await t.ctx.close(); await browser.close();
}
console.log('\nem dashes shown:', total);
srv.close();
