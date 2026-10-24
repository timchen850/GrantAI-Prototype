// Visible-text check: on every screen, find words that only appear when code prints a
// missing value ("undefined", "null", "NaN", "[object Object]", a stray "false").
// Usage: node junktext.mjs [persona,...] [width]
import { startServer, launch, openApp } from './harness.mjs';

const personas = (process.argv[2] || 'visitor,np,legacy,biz,onboarding').split(',');
const width = +(process.argv[3] || 1440);
const srv = await startServer(); let total = 0;
for (const persona of personas) {
  const browser = await launch();
  const t = await openApp(browser, { persona, width });
  const p = t.page;
  const screens = await p.evaluate((pub) => SCREENS.filter((s) => !['tutorial', 'demo'].includes(s) && (pub ? PUBLIC_SCREENS.includes(s) : !PUBLIC_SCREENS.includes(s))), persona === 'visitor');
  for (const s of screens) {
    await p.evaluate((id) => go(id), s); await p.waitForTimeout(1500);
    if (s === 'generator') { await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(700); }
    const hits = await p.evaluate((id) => {
      const root = document.getElementById(id); if (!root) return [];
      const out = [];
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement; if (!el || !(el.offsetParent || el.getClientRects().length) || el.closest('script,style,textarea,code,pre')) continue;
        const m = n.textContent.match(/\b(undefined|null|NaN|\[object Object\]|false|true)\b/);
        if (m) out.push(m[1] + ' in "' + n.textContent.trim().slice(0, 80) + '"');
      }
      root.querySelectorAll('input, textarea').forEach((f) => { if (/^(undefined|null|NaN|\[object Object\])$/.test(f.value)) out.push('field #' + f.id + ' = ' + f.value); });
      return out;
    }, s);
    if (hits.length) { console.log(`${persona} ${s}:`); hits.forEach((h) => console.log('  ' + h)); total += hits.length; }
  }
  await t.ctx.close(); await browser.close();
}
console.log('\nmissing-value words shown:', total);
srv.close();
