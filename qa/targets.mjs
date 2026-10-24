// Controls smaller than 24x24 on phones (WCAG 2.5.8). Inline links inside sentences are exempt.
// Usage: node targets.mjs
import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
const found = new Map();
for (const persona of ['visitor', 'np']) {
  const t = await openApp(browser, { persona, width: 390, height: 844});
  const p = t.page;
  const screens = await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding', 'demo'].includes(s)));
  for (const s of screens) {
    await p.evaluate((id) => go(id), s); await p.waitForTimeout(900);
    const r = await p.evaluate((id) => {
      const out = [];
      document.querySelectorAll(`#${id} button, #${id} a[href], #${id} [role=button], #${id} [role=checkbox], #${id} input[type=checkbox], .m-burger, #ai-chat-fab`).forEach((e) => {
        if (!(e.offsetParent || e.getClientRects().length)) return;
        const r = e.getBoundingClientRect(); if (!r.width) return;
        // inline text links inside a sentence are exempt (WCAG 2.5.8 inline exception)
        if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.parentElement && /P|LI|SPAN|DIV/.test(e.parentElement.tagName) && (e.parentElement.textContent || '').trim().length > (e.textContent || '').trim().length + 20) return;
        if (r.width < 24 || r.height < 24) out.push([(e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30), Math.round(r.width) + 'x' + Math.round(r.height), e.className.toString().split(' ')[0]]);
      });
      return out;
    }, s);
    r.forEach(([l, sz, c]) => found.set(c + ' | ' + l, sz + ' (' + s + ')'));
  }
  await t.ctx.close();
}
console.log(found.size, 'controls under 24x24 on phones:'); [...found].slice(0, 40).forEach(([k, v]) => console.log('  ' + k + '  ' + v));
await browser.close(); srv.close();
