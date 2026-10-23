import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'newuser' });
const p = t.page;
// Walk the guided tour like a user: do each step's action, then Continue.
const act = () => p.evaluate(() => {
  const visible = (b) => { const r = b.getBoundingClientRect(); if (!r.width || !r.height) return false; let n = b; while (n) { const c = getComputedStyle(n); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity < 0.05) return false; n = n.parentElement; } return true; };
  const next = document.getElementById('tut-next');
  if (tutState.unlocked && next && visible(next) && !next.disabled) { next.click(); return 'next'; }
  const go = document.getElementById('tut-go');
  if (go && visible(go)) { go.click(); return 'go'; }
  const cands = [...document.querySelectorAll('#tutorial *')].filter((e) => typeof e.onclick === 'function' && e.id !== 'tut-next' && e.id !== 'tut-back' && !e.disabled && visible(e));
  if (cands[0]) { const e = cands[0]; e.click(); return 'action:' + (e.id || e.className || e.tagName) + ':' + (e.innerText || '').trim().slice(0, 30); }
  return 'waiting';
});
let last = '';
for (let i = 0; i < 80; i++) {
  const scr = await p.evaluate(() => window._currentScreen);
  if (scr !== 'tutorial') { console.log('left tutorial ->', scr, 'after', i, 'ticks'); break; }
  const r = await act(); const idx = await p.evaluate(() => tutState.idx);
  if (r !== 'waiting' || last !== 'waiting') console.log(i, 'idx', idx, r);
  last = r;
  await p.waitForTimeout(r === 'waiting' ? 500 : 700);
}
console.log('errors', t.errors);
await browser.close(); srv.close();
