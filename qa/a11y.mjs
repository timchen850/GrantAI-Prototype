// axe-core accessibility audit of every screen. Usage: node a11y.mjs [personas] [width]
// Personas: visitor (public pages), np/legacy/biz (app screens), newuser (each tour and survey step).
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
  // newuser: the required tour (each step) and the survey (each step) instead of the app screens
  const stops = persona === 'visitor' ? PUBLIC : persona === 'newuser'
    ? [...Array(await t.page.evaluate(() => TUT_STEPS.length)).keys()].map((i) => ['tutorial', i]).concat([...Array(await t.page.evaluate(() => OB_STEPS.length)).keys()].map((i) => ['onboarding', i]))
    : APP;
  for (const stop of stops) {
    const screen = Array.isArray(stop) ? stop[0] : stop;
    if (Array.isArray(stop)) {
      await t.page.evaluate(([s, i]) => {
        if (s === 'tutorial') { if (window._currentScreen !== 'tutorial') go('tutorial'); tutState.unlocked = true; tutState.idx = i; tutRender('fwd'); }
        else { if (window._currentScreen !== 'onboarding') { go('onboarding'); obInit(window._grange); } obState.idx = i; obRender(); }
      }, stop);
      await t.page.waitForTimeout(stop[0] === 'tutorial' ? 3200 : 1200);
    } else { await t.page.evaluate((s) => go(s), screen); await t.page.waitForTimeout(1500); }
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
    console.log(`\n## ${persona} ${Array.isArray(stop) ? stop.join(' step ') : screen}: ${res.length} rules failing (${serious.length} serious/critical)`);
    for (const v of res) { console.log(`  [${v.impact}] ${v.id} x${v.n} — ${v.help}`); v.eg.forEach((e) => console.log('      ' + e)); }
  }
  await t.ctx.close();
}
console.log('\n## totals by rule:', JSON.stringify(totals));
await browser.close(); srv.close();
