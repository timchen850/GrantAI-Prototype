// axe-core accessibility audit of every screen. Usage: node a11y.mjs [personas] [width]
import path from 'node:path';
import { startServer, launch, openApp } from './harness.mjs';
const AXE = path.resolve('node_modules/axe-core/axe.min.js');
const personas = (process.argv[2] || 'visitor,np').split(',');
const width = +(process.argv[3] || 1440);
const PUBLIC = ['landing', 'login', 'signin', 'demo', 'privacy', 'terms', 'security', 'contact'];
const APP = ['dashboard', 'discovery', 'readiness', 'nonprofit-setup', 'generator', 'manage', 'deadlines', 'profile', 'plan'];
const srv = await startServer(); const browser = await launch();
const totals = {};
for (const persona of personas) {
  const t = await openApp(browser, { persona, width, height: width < 600 ? 844 : 900 });
  await t.page.addScriptTag({ path: AXE });
  for (const screen of persona === 'visitor' ? PUBLIC : APP) {
    await t.page.evaluate((s) => go(s), screen); await t.page.waitForTimeout(1500);
    const audit = () => t.page.evaluate(async (s) => {
      const r = await axe.run('#' + s, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, eg: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join('').trim().slice(0, 110)) }));
    }, screen);
    let res = await audit();
    // Contrast is measured on what's painted: text caught mid fade-in reads as too light.
    // Look again once animations have settled and keep only what still fails.
    if (res.some((v) => v.id === 'color-contrast')) { await t.page.waitForTimeout(2500); res = await audit(); }
    for (const v of res) { totals[v.id] = (totals[v.id] || 0) + v.n; }
    const serious = res.filter((v) => ['critical', 'serious'].includes(v.impact));
    console.log(`\n## ${persona} ${screen}: ${res.length} rules failing (${serious.length} serious/critical)`);
    for (const v of res) { console.log(`  [${v.impact}] ${v.id} x${v.n} — ${v.help}`); v.eg.forEach((e) => console.log('      ' + e)); }
  }
  await t.ctx.close();
}
console.log('\n## totals by rule:', JSON.stringify(totals));
await browser.close(); srv.close();
