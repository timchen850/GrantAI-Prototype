// End-to-end flows against the fake backend: click through real tasks and check
// what reached the database. Usage: node flows.mjs [flowName,...]
import { startServer, launch, openApp } from './harness.mjs';

const FLOWS = {};
const flow = (name, fn) => { FLOWS[name] = fn; };
const answers = (db, uid) => Object.fromEntries(db.onboarding_answers.filter((r) => r.user_id === uid).map((r) => [r.question_key, r.answer]));
const UID = { np: '00000000-0000-4000-8000-000000000002', legacy: '00000000-0000-4000-8000-000000000003', biz: '00000000-0000-4000-8000-000000000004' };

flow('profile-save-roundtrip', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('profile')); await p.waitForTimeout(800);
  check('program box not filled with people-served number', (await p.inputValue('#pf-program-desc')) !== '340');
  await p.fill('#pf-program-desc', 'Four afternoons a week of robotics and tutoring for 180 middle schoolers in Boyle Heights.');
  await p.fill('#pf-inputs', '6 staff, 20 volunteer mentors, school gym');
  await p.fill('#pf-outcomes', '80% of students raise math scores by one grade level');
  await p.click('#pf-programs-tags .tg:first-child button');   // remove "After-school programs"
  await p.click('#profile button:has-text("Save changes")'); await p.waitForTimeout(900);
  const a = answers(t.db, UID.np);
  check('program description saved', a.beneficiaries?.startsWith('Four afternoons'));
  check('logic model saved', a.lm_inputs === '6 staff, 20 volunteer mentors, school gym' && a.lm_outcomes?.startsWith('80%'));
  check('removed program tag saved', Array.isArray(a.primary_programs) && !a.primary_programs.includes('After-school programs') && a.primary_programs.length === 2);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => go('profile')); await p.waitForTimeout(800);
  check('program description survives reload', (await p.inputValue('#pf-program-desc')).startsWith('Four afternoons'));
  check('logic model survives reload', (await p.inputValue('#pf-inputs')) === '6 staff, 20 volunteer mentors, school gym');
  check('tags survive reload', (await p.$$eval('#pf-programs-tags .tg', (els) => els.length)) === 2);
  return t;
});

flow('contact-form', async (browser, check) => {
  const t = await openApp(browser, { persona: 'visitor' });
  const p = t.page;
  await p.evaluate(() => go('contact')); await p.waitForTimeout(600);
  await p.click('#contact-btn'); await p.waitForTimeout(300);
  check('empty form is rejected, nothing shown as sent', !(await p.isVisible('#contact-success')));
  await p.fill('#contact-fname', 'Maria'); await p.fill('#contact-lname', 'Reyes'); await p.fill('#contact-email', 'maria@hopeharbor.org');
  await p.selectOption('#contact-topic', { index: 1 }); await p.fill('#contact-msg', 'How do I import my old proposals?');
  const href = await p.evaluate(() => contactMailtoHref({ fname: 'Maria', lname: 'Reyes', email: 'maria@hopeharbor.org', org: 'Hope Harbor', topic: 'Product question', msg: 'How do I import my old proposals?' }));
  const dec = decodeURIComponent(href);
  check('mailto goes to support with the message, name and reply address', href.startsWith('mailto:executivegrangeai@gmail.com?subject=') && dec.includes('How do I import my old proposals?') && dec.includes('Maria Reyes, Hope Harbor') && dec.includes('maria@hopeharbor.org'));
  await p.evaluate(() => submitContact()); await p.waitForTimeout(300);
  check('confirmation shown', await p.isVisible('#contact-success'));
  return t;
});


const screen = (p) => p.evaluate(() => window._currentScreen);
const NEW_UID = '00000000-0000-4000-8000-000000000001';


// Walk the guided tour like a user: do each step's action (.tut-gate-btn or a clickable
// row), then Continue once the step unlocks.
async function walkTutorial(p) {
  for (let i = 0; i < 120 && (await screen(p)) === 'tutorial'; i++) {
    const r = await p.evaluate(() => {
      const visible = (b) => { const rc = b.getBoundingClientRect(); if (!rc.width || !rc.height) return false; let n = b; while (n) { const c = getComputedStyle(n); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity < 0.05) return false; n = n.parentElement; } return true; };
      const next = document.getElementById('tut-next');
      if (tutState.unlocked && next && visible(next) && !next.disabled) { next.click(); return 'next'; }
      const go = document.getElementById('tut-go'); if (go && visible(go)) { go.click(); return 'go'; }
      const c = [...document.querySelectorAll('#tutorial .tut-gate-btn, #tutorial .tut-step *')].find((e) => (e.classList.contains('tut-gate-btn') || typeof e.onclick === 'function') && !e.closest('a') && !e.disabled && visible(e));
      if (c) { c.click(); return 'action'; }
      return 'waiting';
    });
    await p.waitForTimeout(r === 'waiting' ? 400 : 700);
  }
}

flow('signup-tutorial-onboarding', async (browser, check) => {
  const t = await openApp(browser, { persona: 'visitor' });
  const p = t.page;
  await p.evaluate(() => go('login')); await p.waitForTimeout(500);
  await p.fill('#reg-org', 'Riverside Reading Project'); await p.fill('#reg-email', 'lead@riverside.example.org');
  await p.fill('#reg-pw', 'correct-horse-9'); await p.fill('#reg-pw2', 'correct-horse-9');
  await p.click('button:has-text("Create account")'); await p.waitForTimeout(2500);
  check('new account lands on the tutorial', (await screen(p)) === 'tutorial');
  await walkTutorial(p);
  check('tutorial hands off to onboarding', (await screen(p)) === 'onboarding');
  // fill every required field on each step with the real controls, then Continue
  for (let step = 0; step < 8 && (await screen(p)) === 'onboarding'; step++) {
    await p.evaluate(() => {
      const st = OB_STEPS[obState.idx];
      for (const f of obVisibleFields(st)) {
        if (!obFieldRequired(f) || obFieldFilled(f)) continue;
        const w = document.getElementById('ob-wrap-' + f.key); if (!w) continue;
        const chip = w.querySelector('.ob-chip');
        if (chip) { chip.click(); continue; }   // radio/multi: first option (entity type -> 501(c)(3))
        const el = w.querySelector('input, textarea, select');
        if (!el) continue;
        if (el.tagName === 'SELECT') { el.selectedIndex = 1; el.dispatchEvent(new Event('change')); }
        else { el.value = f.key === 'ein' ? '12-3456789' : f.type === 'number' ? '120' : 'Free after-school reading help for 2nd-5th graders in Riverside.'; el.dispatchEvent(new Event('input')); }
      }
    });
    // conditional fields appear after a radio click re-renders, so run the filler again
    await p.evaluate(() => {
      for (const f of obVisibleFields(OB_STEPS[obState.idx])) {
        if (!obFieldRequired(f) || obFieldFilled(f)) continue;
        const el = document.querySelector('#ob-wrap-' + f.key + ' input, #ob-wrap-' + f.key + ' textarea');
        if (el) { el.value = f.key === 'ein' ? '12-3456789' : 'California'; el.dispatchEvent(new Event('input')); }
      }
    });
    await p.click('#ob-next'); await p.waitForTimeout(700);
  }
  await p.waitForTimeout(1500);
  check('onboarding finishes on the dashboard', (await screen(p)) === 'dashboard');
  const prof = t.db.profiles.find((r) => r.user_id === NEW_UID);
  check('profile created once', t.db.profiles.filter((r) => r.user_id === NEW_UID).length === 1);
  check('onboarding_complete + tutorial_complete saved', prof?.onboarding_complete === true && prof?.tutorial_complete === true);
  check('entity type mapped to tax_exempt_status 501c3', prof?.tax_exempt_status === '501c3');
  const a = answers(t.db, NEW_UID);
  check('survey answers saved (mission, focus areas, entity type)', !!a.mission && Array.isArray(a.focus_areas) && a.focus_areas.length > 0 && a.entity_type === '501(c)(3) nonprofit');
  return t;
});

flow('tutorial-reduced-motion', async (browser, check) => {
  const t = await openApp(browser, { persona: 'newuser', reducedMotion: true });
  const p = t.page;
  check('new user starts on the tutorial', (await screen(p)) === 'tutorial');
  await walkTutorial(p);
  check('reduced-motion tour reaches onboarding', (await screen(p)) === 'onboarding');
  check('tutorial completion saved', t.db.profiles.find((r) => r.user_id === NEW_UID)?.tutorial_complete === true);
  return t;
});

flow('onboarding-save-failure', async (browser, check) => {
  const t = await openApp(browser, { persona: 'onboarding', failTables: ['onboarding_answers'] });
  const p = t.page;
  check('half-finished account resumes onboarding', (await screen(p)) === 'onboarding');
  await p.evaluate(async () => { obState.idx = OB_STEPS.length - 1; obState.answers.mission = 'Free art classes for teens.'; obState.answers.focus_areas = ['Arts']; obRender(); await obFinish(); });
  await p.waitForTimeout(800);
  check('failed save keeps the user on the survey', (await screen(p)) === 'onboarding');
  check('error explains it and Finish is usable again', /couldn.t save/i.test(await p.textContent('#ob-error')) && await p.isEnabled('#ob-next'));
  check('profile not marked complete', t.db.profiles.find((r) => r.user_id === '00000000-0000-4000-8000-000000000005')?.onboarding_complete === false);
  t.errors = t.errors.filter((e) => !/503|Service Unavailable/.test(e));   // the forced outage itself
  return t;
});

flow('discovery-save-and-draft', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  const cards = await p.$$('#disc-grants-list .gcard');
  check('discovery shows grant cards', cards.length > 0);
  const before = t.db.grants.length;
  const saveBtn = await p.$('#disc-grants-list .gcard button:has-text("Save")');
  check('a card has a Save button', !!saveBtn);
  if (saveBtn) { await saveBtn.click(); await p.waitForTimeout(1200); }
  check('Save adds the grant to the pipeline', t.db.grants.length === before + 1);
  const g = t.db.grants[t.db.grants.length - 1];
  check('saved grant has status saved', g?.status === 'saved');
  if (g?.deadline) check('deadline + reminders created for the saved grant', t.db.deadlines.some((d) => d.grant_id === g.id && d.kind === 'proposal') && t.db.reminders.length > 0);
  await p.click('#disc-grants-list .gcard button:has-text("Draft proposal")'); await p.waitForTimeout(1500);
  check('Draft proposal opens the generator', (await screen(p)) === 'generator');
  check('drafted grant marked drafting in the pipeline', t.db.grants.some((r) => r.status === 'drafting' && r.user_id === UID.np));
  await p.click('#gen-btn'); await p.waitForTimeout(6000);
  const out = await p.evaluate(() => (document.getElementById('out-doc')?.innerText || '').slice(0, 400));
  check('generator streams a draft with section headings', /Statement of Need/.test(out));
  check('generate-proposal edge function was called', t.fnLog.includes('generate-proposal'));
  return t;
});

flow('legacy-type-picker', async (browser, check) => {
  const t = await openApp(browser, { persona: 'legacy' });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  await p.click('#disc-grants-list .gcard button:has-text("Draft proposal")'); await p.waitForTimeout(800);
  check('reminder dialog opens before drafting', await p.isVisible('#orginfo-modal.open'));
  check('dialog asks for organization type', await p.isVisible('#oi-type-sel'));
  check('EIN on file pre-selects 501(c)(3)', (await p.inputValue('#oi-type-sel')) === '501(c)(3) nonprofit');
  await p.click('#orginfo-modal button:has-text("Save")'); await p.waitForTimeout(900);
  const prof = t.db.profiles.find((r) => r.user_id === UID.legacy);
  check('type saved to profiles.tax_exempt_status', prof?.tax_exempt_status === '501c3');
  check('entity_type answer saved', answers(t.db, UID.legacy).entity_type === '501(c)(3) nonprofit');
  if (await p.isVisible('#orginfo-modal.open')) { await p.click('#orginfo-modal button:has-text("Continue anyway")'); await p.waitForTimeout(1200); }
  check('continue anyway proceeds to the generator', (await screen(p)) === 'generator');
  return t;
});

flow('deadlines-done-and-reopen', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('deadlines')); await p.waitForTimeout(1200);
  await p.click('#deadlines button:has-text("Mark done")'); await p.waitForTimeout(900);
  const done = t.db.deadlines.filter((d) => d.status === 'done');
  check('Mark done saves status done', done.length === 2 && done.every((d) => d.completed_at));
  await p.click('#deadlines button:has-text("Reopen")'); await p.waitForTimeout(900);
  check('Reopen restores one to upcoming', t.db.deadlines.filter((d) => d.status === 'done').length === 1);
  return t;
});

flow('readiness-mark-have', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('readiness')); await p.waitForTimeout(1500);
  const btn = await p.$('#readiness button[onclick*="rdySet(\'bylaws"][onclick*="have"]') || await p.$('#readiness .rdy-item button:has-text("Have it")');
  check('a Have it button exists', !!btn);
  const key = btn ? (await btn.getAttribute('onclick')).match(/rdySet\('([^']+)'/)[1] : '';
  if (btn) { await btn.click(); await p.waitForTimeout(900); }
  check('Have it saved to readiness_items', t.db.readiness_items.some((r) => r.req_key === key && r.status === 'have'));
  return t;
});

const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(FLOWS);
const srv = await startServer(); const browser = await launch();
let fails = 0;
for (const name of only) {
  const results = [];
  const check = (label, ok) => results.push([label, !!ok]);
  let t;
  try { t = await FLOWS[name](browser, check); } catch (e) { results.push(['threw: ' + e.message.split('\n')[0], false]); }
  const errs = t ? t.errors : [];
  if (errs.length) results.push([`console errors: ${errs.slice(0, 3).join(' | ')}`, false]);
  console.log(`\n## ${name}`);
  for (const [label, ok] of results) { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails++; }
  if (t) await t.ctx.close();
}
console.log(`\n${fails ? fails + ' FAILED' : 'all passed'}`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
