// Is the tour guide bubble fully on screen on each step (phone)?
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const width of [390, 360]) {
  const t = await openApp(browser, { persona: 'newuser', width, height: 800 });
  const p = t.page; const bad = []; let checks = 0;
  for (let i = 0; i < 160 && (await p.evaluate(() => window._currentScreen)) === 'tutorial'; i++) {
    const r = await p.evaluate(() => {
      const visible = (b) => { const rc = b.getBoundingClientRect(); if (!rc.width || !rc.height) return false; let n = b; while (n) { const c = getComputedStyle(n); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity < 0.05) return false; n = n.parentElement; } return true; };
      const next = document.getElementById('tut-next');
      if (tutState.unlocked && next && visible(next) && !next.disabled) return 'next';
      const go = document.getElementById('tut-go'); if (go && visible(go)) { go.click(); return 'go'; }
      const c = [...document.querySelectorAll('#tutorial .tut-gate-btn, #tutorial .tut-step *')].find((e) => (e.classList.contains('tut-gate-btn') || typeof e.onclick === 'function') && !e.closest('a') && !e.disabled && visible(e));
      if (c) { c.click(); return 'action'; } return 'waiting';
    });
    await p.waitForTimeout(r === 'waiting' ? 400 : 1100);   // let the guide finish moving
    const br = await p.evaluate(() => { const b = document.getElementById('tut-guide-bubble'); const g = document.getElementById('tut-guide'); if (!g.classList.contains('show') || !b.textContent) return null; const x = b.getBoundingClientRect(); return { l: Math.round(x.left), r: Math.round(x.right), vw: innerWidth, t: b.textContent.slice(0, 40), idx: tutState.idx }; });
    if (br) { checks++; if (br.l < 0 || br.r > br.vw) bad.push(br); }
    if (r === 'next') { await p.click('#tut-next'); await p.waitForTimeout(900); }
  }
  console.log(width, 'bubble checks:', checks, 'off-screen:', bad.length ? JSON.stringify(bad.slice(0, 4)) : 'none', 'errors:', t.errors.length);
  await t.ctx.close();
}
await browser.close(); srv.close();
