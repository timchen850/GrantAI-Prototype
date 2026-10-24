// Form check: on every screen, list visible <label>s that aren't tied to a field
// (clicking them does nothing) and visible fields with no label or name.
// Usage: node labels.mjs [persona,...] [width]
import { startServer, launch, openApp } from './harness.mjs';

const personas = (process.argv[2] || 'visitor,np').split(',');
const width = +(process.argv[3] || 1440);
const PORT = 3457; const srv = await startServer(PORT); const browser = await launch();
let total = 0;
for (const persona of personas) {
  const t = await openApp(browser, { persona, width, base: 'http://127.0.0.1:' + PORT + '/' });
  const p = t.page;
  const screens = await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding', 'demo'].includes(s)));
  for (const s of screens) {
    await p.evaluate((id) => go(id), s); await p.waitForTimeout(900);
    const bad = await p.evaluate((id) => {
      const root = document.getElementById(id); if (!root) return [];
      const shown = (e) => !!(e.offsetParent || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
      const out = [];
      root.querySelectorAll('label').forEach((l) => { if (l.closest('.fds-field')) return; /* landing mock-up, not a form */ if (shown(l) && !l.control) out.push('label not tied to a field: "' + l.textContent.trim().slice(0, 40) + '"'); });
      root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea').forEach((f) => {
        if (!shown(f)) return;
        const named = (f.labels && f.labels.length) || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.title;
        if (!named) out.push('field with no label: #' + (f.id || '?') + ' (placeholder "' + (f.placeholder || '') + '")');
      });
      return out;
    }, s);
    if (bad.length) { console.log(`${persona} ${s}:`); bad.forEach((b) => console.log('  ' + b)); total += bad.length; }
  }
  await t.ctx.close();
}
console.log('\nunlinked labels / unnamed fields:', total);
await browser.close(); srv.close();
