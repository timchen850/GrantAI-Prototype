// Visit every screen for each test account at desktop and phone widths.
// Records console errors, sideways overflow and a full-page screenshot per screen.
// Usage: node sweep.mjs [personas] [widths] [screens]   e.g. node sweep.mjs np 390 discovery,manage
import fs from 'node:fs';
import { startServer, launch, openApp, overflowReport } from './harness.mjs';

const PUBLIC = ['landing', 'login', 'signin', 'demo', 'privacy', 'terms', 'security', 'contact'];
const APP = ['dashboard', 'discovery', 'readiness', 'nonprofit-setup', 'generator', 'manage', 'deadlines', 'profile', 'plan'];
const personas = (process.argv[2] || 'visitor,np,legacy,biz').split(',');
const widths = (process.argv[3] || '1440,390').split(',').map(Number);
const only = process.argv[4] ? process.argv[4].split(',') : null;

const srv = await startServer(); const browser = await launch();
const results = [];
for (const persona of personas) {
  for (const width of widths) {
    const t = await openApp(browser, { persona, width, height: width < 600 ? 844 : 900 });
    const screens = (persona === 'visitor' ? PUBLIC : APP).filter((s) => !only || only.includes(s));
    for (const screen of screens) {
      const before = t.errors.length;
      await t.page.evaluate((s) => { window.scrollTo(0, 0); go(s); }, screen);
      await t.page.waitForTimeout(1800);
      const active = await t.page.evaluate(() => window._currentScreen);
      const ov = await overflowReport(t.page);
      const file = `out/${persona}-${width}-${screen}.png`;
      await t.page.screenshot({ path: file, fullPage: true });
      const r = { persona, width, screen, active, errors: t.errors.slice(before), docW: ov.docW, vw: ov.vw, overflow: ov.items, file };
      results.push(r);
      const flag = (r.errors.length ? ` ERR×${r.errors.length}` : '') + (ov.docW > ov.vw ? ` SIDEWAYS(${ov.docW}>${ov.vw})` : '') + (ov.items.length ? ` overflow×${ov.items.length}` : '') + (active !== screen ? ` landed:${active}` : '');
      console.log(`${persona.padEnd(8)} ${String(width).padEnd(5)} ${screen.padEnd(16)}${flag || ' ok'}`);
    }
    if (t.external.length) console.log('  external requests:', [...new Set(t.external)].slice(0, 5));
    await t.ctx.close();
  }
}
fs.writeFileSync('out/sweep.json', JSON.stringify(results, null, 2));
await browser.close(); srv.close();
