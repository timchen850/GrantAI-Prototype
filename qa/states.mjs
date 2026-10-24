// Screenshot the states a demo walks through that a plain screen sweep never reaches:
// each tour step, each survey step, sign-in steps, the phone menu, dialogs and a
// finished draft. Usage: node states.mjs [width] [group,...]  -> out/state-<w>-<name>.png
import { startServer, launch, openApp, fillGenForm } from './harness.mjs';

const width = +(process.argv[2] || 1440);
const groups = process.argv[3] ? process.argv[3].split(',') : ['tour', 'survey', 'signin', 'menu', 'dialogs', 'draft'];
const H = width < 600 ? 844 : 900;
const srv = await startServer(); const browser = await launch();
const shot = (p, name) => p.screenshot({ path: `out/state-${width}-${name}.png` });
const errs = [];

if (groups.includes('tour')) {
  const t = await openApp(browser, { persona: 'newuser', width, height: H });
  const p = t.page;
  for (let i = 0; i < 160 && (await p.evaluate(() => window._currentScreen)) === 'tutorial'; i++) {
    const before = await p.evaluate(() => tutState.idx);
    const r = await p.evaluate(() => {
      const visible = (b) => { const rc = b.getBoundingClientRect(); if (!rc.width || !rc.height) return false; let n = b; while (n) { const c = getComputedStyle(n); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity < 0.05) return false; n = n.parentElement; } return true; };
      const next = document.getElementById('tut-next');
      if (tutState.unlocked && next && visible(next) && !next.disabled) return 'next';
      const go = document.getElementById('tut-go'); if (go && visible(go)) { go.click(); return 'go'; }
      const c = [...document.querySelectorAll('#tutorial .tut-gate-btn, #tutorial .tut-step *')].find((e) => (e.classList.contains('tut-gate-btn') || typeof e.onclick === 'function') && !e.closest('a') && !e.disabled && visible(e));
      if (c) { c.click(); return 'action'; }
      return 'waiting';
    });
    if (r === 'next') { await p.waitForTimeout(600); await shot(p, `tour-${before}`); await p.click('#tut-next'); await p.waitForTimeout(900); }
    else await p.waitForTimeout(r === 'waiting' ? 400 : 800);
  }
  errs.push(...t.errors); await t.ctx.close();
}

if (groups.includes('survey')) {
  const t = await openApp(browser, { persona: 'onboarding', width, height: H });
  const p = t.page;
  for (let i = 0; i < 6; i++) {
    await p.evaluate((n) => { obState.idx = n; obRender(); window.scrollTo(0, 0); }, i);
    await p.waitForTimeout(500); await shot(p, `survey-${i}`);
  }
  await p.evaluate(() => { obState.idx = 0; obRender(); }); await p.click('#ob-next'); await p.waitForTimeout(500);
  await shot(p, 'survey-validation');
  errs.push(...t.errors); await t.ctx.close();
}

if (groups.includes('signin')) {
  const t = await openApp(browser, { persona: 'visitor', width, height: H });
  const p = t.page;
  await p.evaluate(() => go('signin')); await p.waitForTimeout(900);
  const email = await p.$('#si-email input[type=email], #si-email input');
  if (email) { await email.fill('director@eastsideyouth.example.org'); await p.keyboard.press('Enter'); await p.waitForTimeout(1300); }
  await shot(p, 'signin-password');
  const pw = await p.$('#si-pw-input');
  if (pw) { await pw.fill('correct-horse-9'); await p.waitForTimeout(200); await p.click('#si-cont-btn'); await p.waitForTimeout(2200); await shot(p, 'signin-success'); await p.waitForTimeout(1500); }
  console.log('signin landed on', await p.evaluate(() => window._currentScreen));
  errs.push(...t.errors); await t.ctx.close();
}

if (groups.includes('menu')) {
  for (const persona of ['visitor', 'np']) {
    const t = await openApp(browser, { persona, width, height: H });
    const p = t.page;
    const btn = await p.$('.nav-burger:visible, .m-burger:visible, button[aria-label*="menu" i]:visible, .mnav-toggle:visible');
    if (btn) { await btn.click(); await p.waitForTimeout(700); await shot(p, `menu-${persona}`); }
    else console.log('no menu button found for', persona);
    errs.push(...t.errors); await t.ctx.close();
  }
}

if (groups.includes('dialogs')) {
  const t = await openApp(browser, { persona: 'legacy', width, height: H });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  await p.click('#disc-grants-list .gcard button:has-text("Draft proposal")'); await p.waitForTimeout(900);
  await shot(p, 'dialog-orginfo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const assess = await p.$('#disc-grants-list .gcard button:has-text("AI assessment")');
  if (assess) { await assess.click(); await p.waitForTimeout(2500); await shot(p, 'dialog-assess'); }
  errs.push(...t.errors); await t.ctx.close();
}

if (groups.includes('draft')) {
  const t = await openApp(browser, { persona: 'np', width, height: H });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  await p.click('#disc-grants-list .gcard button:has-text("Draft proposal")'); await p.waitForTimeout(1500);
  await shot(p, 'draft-config');
  await fillGenForm(p); await p.click('#gen-btn'); await p.waitForTimeout(3000); await shot(p, 'draft-plan');
  const ap = await p.$('button:has-text("Generate with this plan")'); if (ap) await ap.click();
  await p.waitForTimeout(9000);
  await shot(p, 'draft-done');
  await p.evaluate(() => { const o = document.getElementById('out-doc'); if (o) o.scrollIntoView({ block: 'start' }); }); await p.waitForTimeout(400);
  await shot(p, 'draft-doc');
  errs.push(...t.errors); await t.ctx.close();
}

console.log('console errors:', errs.length ? errs : 'none');
await browser.close(); srv.close();
