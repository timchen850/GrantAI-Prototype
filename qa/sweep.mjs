// Visit every screen for each test account at desktop and phone widths.
// Records console errors and sideways overflow, and captures what a person sees
// while scrolling: viewport-sized tiles (out/<persona>-<width>-<screen>.tN.png).
// Usage: node sweep.mjs [personas] [widths] [screens] [maxTiles]
//   e.g. node sweep.mjs np 390 discovery,manage 4
import fs from 'node:fs';
import { startServer, launch, openApp, overflowReport } from './harness.mjs';

const PUBLIC = ['landing', 'login', 'signin', 'demo', 'privacy', 'terms', 'security', 'contact'];
const APP = ['dashboard', 'discovery', 'readiness', 'nonprofit-setup', 'generator', 'manage', 'deadlines', 'profile', 'plan'];
const personas = (process.argv[2] || 'visitor,np,legacy,biz').split(',');
const widths = (process.argv[3] || '1440,390').split(',').map(Number);
const only = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null;
const maxTiles = +(process.argv[5] || 12);

async function captureTiles(page, prefix) {
  for (const f of fs.readdirSync('out')) if (f.startsWith(prefix.slice(4) + '.t')) fs.unlinkSync('out/' + f);
  const { h, vh } = await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; return { h: document.documentElement.scrollHeight, vh: innerHeight }; });
  let n = 0;
  for (let y = 0; y < h && n < maxTiles; y += vh, n++) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(1100);   // let scroll-triggered reveals and count-ups run
    await page.screenshot({ path: `${prefix}.t${n}.png` });
  }
  await page.evaluate(() => { window.scrollTo(0, 0); document.documentElement.style.scrollBehavior = ''; });
  return n;
}

const srv = await startServer(); const browser = await launch();
const results = [];
for (const persona of personas) {
  for (const width of widths) {
    const t = await openApp(browser, { persona, width, height: width < 600 ? 844 : 900 });
    const screens = (persona === 'visitor' ? PUBLIC : APP).filter((s) => !only || only.includes(s));
    for (const screen of screens) {
      const before = t.errors.length;
      await t.page.evaluate((s) => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); go(s); }, screen);
      await t.page.waitForTimeout(1800);
      const active = await t.page.evaluate(() => window._currentScreen);
      const ov = await overflowReport(t.page);
      const tiles = await captureTiles(t.page, `out/${persona}-${width}-${screen}`);
      const r = { persona, width, screen, active, errors: t.errors.slice(before), docW: ov.docW, vw: ov.vw, overflow: ov.items, tiles };
      results.push(r);
      const flag = (r.errors.length ? ` ERR×${r.errors.length}` : '') + (ov.docW > ov.vw ? ` SIDEWAYS(${ov.docW}>${ov.vw})` : '') + (active !== screen ? ` landed:${active}` : '');
      console.log(`${persona.padEnd(8)} ${String(width).padEnd(5)} ${screen.padEnd(16)}${flag || ' ok'}  [${tiles} tiles]`);
      for (const e of r.errors) console.log('     ' + e.slice(0, 220));
    }
    if (t.external.length) console.log('  external requests:', [...new Set(t.external)].slice(0, 5));
    await t.ctx.close();
  }
}
fs.writeFileSync('out/sweep.json', JSON.stringify(results, null, 2));
await browser.close(); srv.close();
