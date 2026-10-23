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
// With an Approach Plan the draft only starts after approval; click it when it appears.
async function approvePlanIfShown(p, wait = 3000) {
  await p.waitForTimeout(wait);
  const b = await p.$('button:has-text("Generate with this plan")');
  if (b) { await b.click(); }
}

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

flow('draft-limit-message', async (browser, check) => {
  const LIMIT = 'Monthly limit reached (2 drafts/month on free plan). Upgrade to Starter for 15 drafts/month.';
  const t = await openApp(browser, { persona: 'np', fnOverride: { 'generate-proposal': { status: 429, body: { error: LIMIT } } } });
  const p = t.page;
  const toasts = [];
  await p.exposeFunction('_qaToast', (m) => toasts.push(m));
  await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qaToast(m); return o(m); }; });
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
  await p.click('#gen-btn'); await p.waitForTimeout(2500);
  check('monthly-limit message from the server reaches the user', toasts.includes(LIMIT));
  check('no "API error 429" jargon', !toasts.some((m) => /API error/.test(m)));
  t.errors = t.errors.filter((e) => !/429|Too Many/.test(e));
  return t;
});

flow('save-failures-are-visible', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np', failTables: ['readiness_items'] });
  const p = t.page;
  const toasts = [];
  await p.exposeFunction('_qaToast', (m) => toasts.push(m));
  await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qaToast(m); return o(m); }; });
  await p.evaluate(() => go('readiness')); await p.waitForTimeout(1500);
  await p.click('#readiness .rdy-item button:has-text("Have it")'); await p.waitForTimeout(900);
  check('failed readiness save tells the user', toasts.some((m) => /couldn.t save/i.test(m)));
  t.errors = t.errors.filter((e) => !/503|Service Unavailable/.test(e));
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
  await p.click('#gen-btn'); await approvePlanIfShown(p); await p.waitForTimeout(6000);
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

const toastSpy = async (p) => { const list = []; await p.exposeFunction('_qaToast2', (m) => list.push(m)); await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qaToast2(m); return o(m); }; }); return list; };

flow('signin-and-signout', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np', signedOut: true });
  const p = t.page;
  check('signed-out visitor sees the landing page', (await screen(p)) === 'landing');
  await p.evaluate(() => go('signin')); await p.waitForTimeout(800);
  await p.fill('#si-email-input', 'director@eastsideyouth.example.org'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  await p.fill('#si-pw-input', 'correct-horse-9'); await p.waitForTimeout(200);
  await p.click('#si-cont-btn'); await p.waitForTimeout(4500);
  check('returning user lands on the dashboard', (await screen(p)) === 'dashboard');
  check('greeting uses their org', /Director|Eastside/.test(await p.textContent('#dash-greeting') + (await p.textContent('#sidebar, .side').catch(() => ''))));
  await p.click('#dashboard .side a:has-text("Sign out"), #dashboard .side button:has-text("Sign out"), .side-foot :text("Sign out")'); await p.waitForTimeout(1200);
  check('sign out returns to the landing page', (await screen(p)) === 'landing');
  check('session removed from storage', await p.evaluate(() => !localStorage.getItem('sb-xewrvmqyzeiziimcmenj-auth-token')));
  return t;
});

flow('magic-link', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np', signedOut: true });
  const p = t.page; const toasts = await toastSpy(p);
  await p.evaluate(() => go('signin')); await p.waitForTimeout(800);
  await p.fill('#si-email-input', 'director@eastsideyouth.example.org'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  await p.click('text=Email me a sign-in link instead'); await p.waitForTimeout(800);
  check('magic link requested for the typed email', t.otpSent.includes('director@eastsideyouth.example.org'));
  check('user told to check email', toasts.some((m) => /check your email/i.test(m)));
  return t;
});

flow('manage-award-and-spend', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('manage')); await p.waitForTimeout(1500);
  await p.selectOption('#pa-award-grant', { index: 1 });
  await p.fill('#pa-award-amt', '$40,000'); await p.click('#manage button:has-text("Mark as awarded")'); await p.waitForTimeout(1500);
  check('award recorded with the amount', t.db.awards.length === 2 && t.db.awards.some((a) => Number(a.amount_awarded) === 40000));
  const gid = t.db.awards.find((a) => Number(a.amount_awarded) === 40000)?.grant_id;
  check('grant marked awarded', t.db.grants.find((g) => g.id === gid)?.status === 'awarded');
  await p.fill('#paexp-desc-aw1', 'Robotics kits'); await p.fill('#paexp-amt-aw1', '1250');
  await p.click('#manage .pa-addform:has(#paexp-desc-aw1) button'); await p.waitForTimeout(1200);
  check('expense saved against the award', t.db.expenditures.some((e) => e.award_id === 'aw1' && Number(e.amount) === 1250 && e.description === 'Robotics kits'));
  const before = t.db.compliance_requirements[0].status;
  await p.click('#manage [onclick*="toggleCompliance"]'); await p.waitForTimeout(900);
  check('compliance item toggles', t.db.compliance_requirements[0].status !== before);
  return t;
});

flow('draft-outcome-and-assistant', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
  await p.click('#gen-btn'); await approvePlanIfShown(p); await p.waitForTimeout(7000);
  const won = await p.$('button:has-text("Won")');
  check('outcome tracker offered after a draft', !!won);
  if (won) { await won.click(); await p.waitForTimeout(1200); }
  check('outcome saved as won', t.db.draft_outcomes.some((o) => o.status === 'won'));
  await p.click('#ai-chat-fab'); await p.waitForTimeout(700);
  await p.fill('#acp-text', 'How should I open the need statement?'); await p.click('#ai-chat-panel button[onclick*="acpSend"]').catch(async () => { await p.press('#acp-text', 'Enter'); });
  await p.waitForTimeout(2500);
  check('assistant replies in the chat', /Lead with your outcomes/.test(await p.textContent('#acp-log')));
  return t;
});

flow('irs-check-and-call-analysis', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page; const toasts = await toastSpy(p);
  await p.evaluate(() => go('readiness')); await p.waitForTimeout(1500);
  await p.click('#rdy-irs-btn'); await p.waitForTimeout(1800);
  check('IRS result shows the organization', /EASTSIDE YOUTH COLLECTIVE/i.test(await p.textContent('#readiness')));
  const ta = await p.$('#readiness textarea');
  if (ta) { await ta.fill('The Ahmanson Foundation invites proposals from 501(c)(3) organizations in Los Angeles County for youth education programs. Deadline: December 1.'); }
  await p.click('#rdy-req-btn'); await p.waitForTimeout(2500);
  const txt = (await p.textContent('#readiness')).replace(/\s+/g, ' ');
  check('call analysis responds without breaking the page', !/undefined|NaN|\[object Object\]/.test(txt));
  check('no server-setup instructions shown to users', !/API key|Edge Functions|Secrets/.test(txt));
  return t;
});

flow('approach-plan', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
  await p.click('#gen-btn'); await p.waitForTimeout(3000);
  const btn = await p.$('button:has-text("Generate with this plan")');
  check('approach plan shown for approval before writing', !!btn);
  await p.screenshot({ path: 'out/plan-1440.png' });
  const planText = await p.evaluate(() => document.querySelector('.plan-btn')?.closest('div')?.parentElement?.innerText || '');
  check('plan shows its sections', /Statement of Need/.test(planText) && /Program Design/.test(planText));
  await p.click('button:has-text("Rethink the plan")'); await p.waitForTimeout(3000);
  check('rethink builds a new plan', !!(await p.$('button:has-text("Generate with this plan")')));
  await p.click('button:has-text("Generate with this plan")'); await p.waitForTimeout(7000);
  const out = await p.evaluate(() => (document.getElementById('out-doc')?.innerText || ''));
  check('approved plan leads to a draft', /Statement of Need/.test(out) && /Program Description/.test(out));
  // cancel path
  await p.evaluate(() => genShowConfig()); await p.waitForTimeout(500);
  await p.click('#gen-btn'); await p.waitForTimeout(3000);
  await p.click('button:has-text("Cancel")'); await p.waitForTimeout(800);
  check('cancel returns to the setup form', await p.evaluate(() => getComputedStyle(document.querySelector('.gen-config')).display !== 'none'));
  return t;
});

flow('revoked-session-not-blank', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np', revokedSession: true });
  const p = t.page;
  await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ vis: document.documentElement.style.visibility, screen: window._currentScreen }));
  check('page is visible within 2.5s when the saved session was revoked', st.vis !== 'hidden');
  check('visitor lands on the public site, ready to sign in again', st.screen === 'landing');
  t.errors = t.errors.filter((e) => !/400 \(Bad Request\)/.test(e));   // the refresh being refused is the scenario itself
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
