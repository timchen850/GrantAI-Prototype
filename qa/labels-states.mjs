// Like labels.mjs, but for fields that only appear after a click: the assistant, Discover's
// "Assess" and "Analyze full call" panels, the SAM.gov setup steps, the award and spending forms.
// Usage: node labels-states.mjs [width]
import { startServer, launch, openApp } from './harness.mjs';

const width = +(process.argv[2] || 1440);
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'np', width });
const p = t.page;
const scan = (where) => p.evaluate((w) => {
  const shown = (e) => !!(e.offsetParent || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const out = [];
  document.querySelectorAll('label').forEach((l) => { if (l.closest('.fds-field')) return; if (shown(l) && (!l.control || l.control.tagName === 'BUTTON')) out.push(w + ': label not tied to a field: "' + l.textContent.trim().slice(0, 40) + '"'); });
  document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea').forEach((f) => {
    if (!shown(f)) return;
    const named = (f.labels && f.labels.length) || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.title;
    if (!named) out.push(w + ': field with no label: #' + (f.id || '?') + ' (placeholder "' + (f.placeholder || '') + '")');
  });
  return out;
}, where);
const bad = new Set();
const add = (list) => list.forEach((x) => bad.add(x));

await p.evaluate(() => go('dashboard')); await p.waitForTimeout(1200);
await p.evaluate(() => { const panel = document.getElementById('ai-chat-panel'); if (!panel || !panel.classList.contains('open')) window.acpToggle?.(); }); await p.waitForTimeout(700);
add(await scan('assistant'));
await p.evaluate(() => window.acpToggle?.()); await p.waitForTimeout(400);

await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
const id = await p.evaluate(() => { const b = document.querySelector('#disc-grants-list .gc-full-btn'); return b ? (b.getAttribute('onclick').match(/analyzeFullCall\('([^']+)'/) || [])[1] : null; });
if (id) {
  await p.evaluate((x) => analyzeFullCall(x), id); await p.waitForTimeout(600); add(await scan('discover full call'));
  await p.evaluate((x) => assessGrant(x), id); await p.waitForTimeout(1500); add(await scan('discover assess'));
}

await p.evaluate(() => go('readiness')); await p.waitForTimeout(1500);
for (const [need, path] of [['yes', 'grants_only'], ['yes', 'full'], ['no', null]]) {
  await p.evaluate(([n, pa]) => { samSetNeed(n); if (pa) samSetPath(pa); }, [need, path]); await p.waitForTimeout(500);
  add(await scan('SAM.gov ' + need + (path ? '/' + path : '')));
}

await p.evaluate(() => go('manage')); await p.waitForTimeout(1500);
add(await scan('manage forms'));

for (const b of bad) console.log('  ' + b);
console.log('\nunlinked labels / unnamed fields after clicks:', bad.size);
await browser.close(); srv.close();
