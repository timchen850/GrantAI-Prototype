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

flow('backend-down-messages', async (browser, check) => {
  const t = await openApp(browser, { persona: 'visitor', backendDown: true });
  const p = t.page; const toasts = await toastSpy(p);
  await p.evaluate(() => go('signin')); await p.waitForTimeout(800);
  await p.fill('#si-email-input', 'someone@example.org'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  await p.fill('#si-pw-input', 'whatever-123'); await p.click('#si-cont-btn'); await p.waitForTimeout(2500);
  check('sign-in during an outage explains it plainly', toasts.some((m) => /can.t reach its servers/.test(m)) && !toasts.some((m) => /JSON|Unexpected token/.test(m)));
  check('auth listener re-armed after a failed sign-in', await p.evaluate(() => window._manualAuthFlow === false));
  await p.evaluate(() => go('login')); await p.waitForTimeout(600);
  await p.fill('#reg-org', 'Riverside Reading'); await p.fill('#reg-email', 'x@example.org'); await p.fill('#reg-pw', 'correct-horse-9'); await p.fill('#reg-pw2', 'correct-horse-9');
  await p.click('button:has-text("Create account")'); await p.waitForTimeout(2500);
  check('sign-up during an outage explains it plainly', toasts.filter((m) => /can.t reach its servers/.test(m)).length >= 2);
  t.errors = t.errors.filter((e) => !/status of 540/.test(e));
  return t;
});

flow('backend-down-signed-in', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' , backendDown: true });
  const p = t.page;
  const toasts = []; await p.exposeFunction('_qt3', (m) => toasts.push(m));
  await p.addInitScript(() => {});
  await p.waitForTimeout(500);
  // the first load already happened; reload with the spy installed early
  await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qt3(m); return o(m); }; });
  const posts = []; p.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/rest/v1/profiles')) posts.push(r.url()); });
  await p.evaluate(() => routeAfterAuth()); await p.waitForTimeout(1500);
  check('signed-in user is told the servers are unreachable', toasts.some((m) => /can.t reach its servers/.test(m)));
  check('no profile insert attempted while unreachable', posts.length === 0);
  check('page visible', await p.evaluate(() => document.documentElement.style.visibility !== 'hidden'));
  t.errors = t.errors.filter((e) => !/status of 540/.test(e));
  return t;
});

flow('profile-document-upload', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page; const toasts = await toastSpy(p);
  await p.evaluate(() => go('profile')); await p.waitForTimeout(1000);
  const pdf = { name: 'form-990-2025.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% qa test\n') };
  await p.setInputFiles('#pf-file-doc_990', pdf); await p.waitForTimeout(1500);
  check('upload saved as a documents row', t.db.documents.some((d) => d.kind === 'doc_990' && d.file_name === 'form-990-2025.pdf'));
  check('readiness item ticked "have"', t.db.readiness_items.some((r) => r.req_key === 'form_990' && r.status === 'have'));
  check('box shows the saved file', /form-990-2025\.pdf/.test(await p.textContent('#pf-upl-doc_990')));
  await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => go('profile')); await p.waitForTimeout(1200);
  check('saved file listed after reload', /form-990-2025\.pdf/.test(await p.textContent('#pf-upl-doc_990')));
  await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qaToast2(m); return o(m); }; });   // reload dropped the spy
  await p.setInputFiles('#pf-file-doc_financials', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await p.waitForTimeout(600);
  check('non-PDF rejected with a message', toasts.some((m) => /upload a PDF/.test(m)) && !t.db.documents.some((d) => d.kind === 'doc_financials'));
  return t;
});

flow('browser-back-forward', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.waitForTimeout(800);
  await p.click('#dashboard .side a:has-text("Grant discovery"), #dashboard .side [onclick*="discovery"]'); await p.waitForTimeout(800);
  await p.evaluate(() => go('readiness')); await p.waitForTimeout(800);
  await p.goBack(); await p.waitForTimeout(800);
  check('Back returns to the previous screen', (await screen(p)) === 'discovery');
  await p.goBack(); await p.waitForTimeout(800);
  check('Back again reaches the dashboard', (await screen(p)) === 'dashboard');
  await p.goForward(); await p.waitForTimeout(800);
  check('Forward works', (await screen(p)) === 'discovery');
  check('URL unchanged (no stray #)', !p.url().includes('#'));
  // a signed-in user can't walk back into the public site
  await p.goBack(); await p.goBack(); await p.waitForTimeout(1000);
  check('signed-in user is never sent back to the landing page', (await screen(p)) === 'dashboard');
  // Back with the phone menu open closes the menu and stays put
  const m = await openApp(browser, { persona: 'np', width: 390, height: 844 });
  await m.page.waitForTimeout(800);
  await m.page.evaluate(() => go('discovery')); await m.page.waitForTimeout(700);
  await m.page.click('.m-burger >> visible=true'); await m.page.waitForTimeout(500);
  await m.page.goBack(); await m.page.waitForTimeout(700);
  check('Back with the phone menu open closes it and stays on the screen', (await screen(m.page)) === 'discovery' && !(await m.page.evaluate(() => document.getElementById('m-nav').classList.contains('open'))));
  await m.page.goBack(); await m.page.waitForTimeout(700);
  check('the next Back goes to the previous screen', (await screen(m.page)) === 'dashboard');
  t.errors.push(...m.errors); await m.ctx.close();
  // visitor: demo -> back -> landing
  const v = await openApp(browser, { persona: 'visitor' });
  await v.page.evaluate(() => go('demo')); await v.page.waitForTimeout(800);
  await v.page.goBack(); await v.page.waitForTimeout(800);
  check('visitor Back from the demo returns to the landing page', (await screen(v.page)) === 'landing');
  check('page scroll unlocked after leaving the demo', await v.page.evaluate(() => document.body.style.overflow === ''));
  t.errors.push(...v.errors); await v.ctx.close();
  return t;
});

// A grant listing could smuggle instructions to the AI; whatever HTML comes back,
// only plain formatting may reach the page (live draft and a restored draft).
flow('draft-html-filtered', async (browser, check) => {
  const evil = ('<h4 onclick="window.__xss=1">Need statement</h4><p>We serve <b>180 students</b> after school in East Los Angeles.<img src="x" onerror="window.__xss=2"></p>'
    + '<script>window.__xss=3</script><p style="color:red" onmouseover="window.__xss=4">Our approach pairs tutors with families [VERIFY: enrollment count] within our [VERIFY: R&D budget].</p>'
    + '<svg><image href="x" onerror="window.__xss=5"></image></svg><a href="javascript:window.__xss=6">see our report</a><iframe src="javascript:parent.__xss=7"></iframe>').repeat(3);
  const t = await openApp(browser, { persona: 'np', draftText: evil });
  const p = t.page;
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
  await p.click('#gen-btn'); await approvePlanIfShown(p); await p.waitForTimeout(7000);
  const live = await p.evaluate(() => ({ xss: window.__xss || 0, html: document.getElementById('doc-content').innerHTML }));
  check('no injected code ran', !live.xss);
  check('no handlers, scripts, images or links kept', !/onerror|onclick|onmouseover|<script|<img|<svg|<iframe|<a |javascript:|style=/i.test(live.html));
  check('headings, bold text and words kept', /<h4>Need statement<\/h4>/.test(live.html) && /<b>180 students<\/b>/.test(live.html) && live.html.includes('see our report'));
  check('double-check highlight still added', /<mark class="verify-flag"/.test(live.html));
  check('highlight text shown once-escaped (R&D, not R&amp;D)', await p.evaluate(() => [...document.querySelectorAll('#doc-content mark.verify-flag')].some((m) => m.textContent === 'R&D budget')));
  const restored = await p.evaluate((h) => {
    const k = genDraftKey(); const d = JSON.parse(localStorage.getItem(k) || '{}'); d.doc = h; localStorage.setItem(k, JSON.stringify(d));
    restoreGenDraft(); return document.getElementById('doc-content').innerHTML;
  }, evil);
  await p.waitForTimeout(500);
  check('a restored draft is filtered too', !/onerror|onclick|<img|<svg|<script/i.test(restored) && !(await p.evaluate(() => window.__xss || 0)));
  return t;
});

flow('keyboard-and-legal-links', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np', width: 390, height: 844 });
  const p = t.page;
  await p.waitForTimeout(900);
  await p.focus('.m-burger >> visible=true'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  check('phone menu opens from the keyboard and takes focus', await p.evaluate(() => document.getElementById('m-nav').classList.contains('open') && document.getElementById('m-nav').contains(document.activeElement)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('Esc closes the phone menu and returns focus', await p.evaluate(() => !document.getElementById('m-nav').classList.contains('open') && document.activeElement.classList.contains('m-burger')));
  await p.click('#ai-chat-fab'); await p.waitForTimeout(600);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  check('Esc closes the assistant', await p.evaluate(() => !document.getElementById('ai-chat-panel').classList.contains('open')));
  const v = await openApp(browser, { persona: 'visitor' });
  const q = v.page;
  await q.evaluate(() => go('signin')); await q.waitForTimeout(800);
  await q.click('#signin a:has-text("Terms") >> visible=true'); await q.waitForTimeout(800);
  check('sign-in Terms link opens the Terms', (await screen(q)) === 'terms');
  for (const page of ['privacy', 'terms']) {
    await q.evaluate((pg) => go(pg), page); await q.waitForTimeout(800);
    const n = await q.evaluate((pg) => document.querySelectorAll('#' + pg + ' .legal-doc a[href="#"][onclick="return false;"]').length, page);
    const hs = await q.evaluate((pg) => document.querySelectorAll('#' + pg + ' .legal-doc h2').length, page);
    check(page + ': one contents link per section (' + n + ' links, ' + hs + ' sections)', n > 5 && n <= hs);
    await q.click('#' + page + ' .legal-doc a[href="#"][onclick="return false;"] >> nth=3'); await q.waitForTimeout(1200);
    const top = await q.evaluate((pg) => document.querySelectorAll('#' + pg + ' .legal-doc h2')[3].getBoundingClientRect().top, page);
    check(page + ': contents link jumps to its section', top > 40 && top < 200);
  }
  check('no stray # in the URL', !q.url().includes('#'));
  t.errors.push(...v.errors); await v.ctx.close();
  return t;
});

flow('forms-labels-and-keyboard', async (browser, check) => {
  const v = await openApp(browser, { persona: 'visitor' });
  const q = v.page;
  await q.evaluate(() => go('login')); await q.waitForTimeout(700);
  await q.click('label[for="reg-org"]');
  check('clicking a sign-up label focuses its field', await q.evaluate(() => document.activeElement.id === 'reg-org'));
  await q.fill('#reg-org', 'Hope Harbor'); await q.fill('#reg-email', 'maria@hopeharbor'); await q.fill('#reg-pw', 'longenough1'); await q.fill('#reg-pw2', 'longenough1');
  await q.press('#reg-pw2', 'Enter'); await q.waitForTimeout(400);
  check('Enter submits sign-up, and a mistyped email is caught first', /valid email/.test(await q.textContent('#toast-text')) && (await screen(q)) === 'login');
  check('password managers get the right hints', await q.evaluate(() => document.getElementById('reg-pw').autocomplete === 'new-password' && document.getElementById('si-pw-input').autocomplete === 'current-password'));
  await q.evaluate(() => go('contact')); await q.waitForTimeout(600);
  await q.click('label[for="contact-msg"]');
  check('contact labels focus their fields', await q.evaluate(() => document.activeElement.id === 'contact-msg'));
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('profile')); await p.waitForTimeout(900);
  await p.click('#profile label:has-text("Mission statement")');
  check('profile labels focus their fields', await p.evaluate(() => document.activeElement.id === 'pf-mission'));
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(800);
  await p.click('#generator label:has-text("Requested amount")');
  check('generator labels focus their fields', await p.evaluate(() => document.activeElement.id === 'gen-amount'));
  const o = await openApp(browser, { persona: 'onboarding' });
  const r = o.page;
  let chipOk = null, uploadOk = null;
  for (let i = 0; i < 6 && (chipOk === null || uploadOk === null); i++) {
    await r.evaluate((n) => { obState.idx = n; obRender(); }, i); await r.waitForTimeout(300);
    if (chipOk === null && await r.$('#ob-fields .ob-chip')) {
      const before = await r.getAttribute('#ob-fields .ob-chip >> nth=0', 'aria-pressed');
      await r.click('#ob-fields .ob-chip >> nth=0'); await r.waitForTimeout(150);
      const after = await r.getAttribute('#ob-fields .ob-chip >> nth=0', 'aria-pressed');
      chipOk = before !== after && ['true', 'false'].includes(after) && !!(await r.$('#ob-fields [role=group][aria-labelledby]'));
    }
    if (uploadOk === null && await r.$('#ob-fields .ob-upload')) {
      uploadOk = await r.evaluate(() => { const b = document.querySelector('#ob-fields .ob-upload'); return b.tabIndex === 0 && b.getAttribute('role') === 'button' && typeof b.ondrop === 'function'; });
    }
  }
  check('survey chips announce whether they are selected', chipOk === true);
  check('survey upload box works by keyboard and drag-and-drop', uploadOk !== false);
  t.errors.push(...v.errors, ...o.errors); await v.ctx.close(); await o.ctx.close();
  return t;
});

flow('manage-save-failures', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np', failTables: ['awards', 'expenditures', 'compliance_requirements'] });
  const p = t.page;
  const toasts = [];
  await p.exposeFunction('_qaToast', (m) => toasts.push(m));
  await p.evaluate(() => { const o = window.toast; window.toast = (m) => { window._qaToast(m); return o(m); }; });
  await p.evaluate(() => go('manage')); await p.waitForTimeout(1500);
  await p.selectOption('#pa-award-grant', { index: 1 });
  await p.fill('#pa-award-amt', '$40,000'); await p.click('#manage button:has-text("Mark as awarded")'); await p.waitForTimeout(1200);
  check('a failed award save says so (not "Recorded")', toasts.some((m) => /could not record/i.test(m)) && !toasts.some((m) => /^Recorded/.test(m)));
  await p.fill('#paexp-desc-aw1', 'Robotics kits'); await p.fill('#paexp-amt-aw1', '1250');
  await p.click('#manage .pa-addform:has(#paexp-desc-aw1) button'); await p.waitForTimeout(1000);
  check('a failed spending save says so', toasts.some((m) => /could not add expense/i.test(m)));
  const was = await p.evaluate(() => document.querySelector('#manage [onclick*="toggleCompliance"]')?.classList.contains('done'));
  await p.click('#manage [onclick*="toggleCompliance"]'); await p.waitForTimeout(900);
  check('a failed compliance toggle says so and stays as it was', toasts.some((m) => /couldn.t save/i.test(m)) && (await p.evaluate(() => document.querySelector('#manage [onclick*="toggleCompliance"]')?.classList.contains('done'))) === was);
  t.errors = t.errors.filter((e) => !/503|Service Unavailable|qa: forced outage/.test(e));
  return t;
});

flow('save-grant-twice-no-duplicates', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  const title = await p.evaluate(() => { const g = Object.values(window._grantsById || {})[0]; return g && g.title; });
  // the same title already saved twice (older app versions could do this)
  t.db.grants.push({ id: 'dup-1', user_id: UID.np, title, status: 'saved' }, { id: 'dup-2', user_id: UID.np, title, status: 'saved' });
  const before = t.db.grants.length;
  await p.evaluate(() => saveGrantToPipeline(Object.values(window._grantsById)[0], 'saved')); await p.waitForTimeout(800);
  check('saving a grant already in the pipeline twice adds no third copy', t.db.grants.length === before);
  return t;
});

flow('keyboard-reachable-rows', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('generator')); await p.waitForTimeout(900);
  await p.focus('#generator .gsel-row[onclick*="pickSaved"] >> nth=0'); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  check('Enter on a saved grant picks it for drafting', await p.evaluate(() => !!window._selectedGrant));
  await p.evaluate(() => go('readiness')); await p.waitForTimeout(1500);
  await p.focus('#readiness .rdy-how-t >> nth=0'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check('"How to get it" opens from the keyboard', await p.evaluate(() => { const b = document.querySelector('#readiness .rdy-how-t'); return b.getAttribute('aria-expanded') === 'true' && b.closest('.rdy-item').classList.contains('open'); }));
  await p.click('#readiness .rdy-item button:has-text("Have it") >> nth=0'); await p.waitForTimeout(600);
  check('status buttons say which one is selected', await p.evaluate(() => { const seg = document.querySelector('#readiness .rdy-item .rdy-seg'); return [...seg.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed')).join() === 'true,false,false'; }));
  await p.evaluate(() => go('manage')); await p.waitForTimeout(1500);
  const before = t.db.compliance_requirements[0].status;
  await p.focus('#manage .pa-cmp .ic >> nth=0'); await p.keyboard.press(' '); await p.waitForTimeout(900);
  check('Space checks off a compliance item', t.db.compliance_requirements[0].status !== before && (await p.getAttribute('#manage .pa-cmp .ic >> nth=0', 'aria-checked')) === String(t.db.compliance_requirements[0].status === 'satisfied'));
  const v = await openApp(browser, { persona: 'visitor' });
  await v.page.evaluate(() => go('signin')); await v.page.waitForTimeout(800);
  check('"Email me a sign-in link" is reachable by keyboard', await v.page.evaluate(() => { const e = document.querySelector('.si-resend'); return e.tabIndex === 0 && e.getAttribute('role') === 'button'; }));
  t.errors.push(...v.errors); await v.ctx.close();
  return t;
});

flow('dialog-focus', async (browser, check) => {
  const t = await openApp(browser, { persona: 'legacy' });
  const p = t.page;
  await p.evaluate(() => go('discovery')); await p.waitForTimeout(2500);
  const btn = '#disc-grants-list .gcard button:has-text("Draft proposal") >> nth=0';
  await p.focus(btn); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  const inside = () => p.evaluate(() => { const m = document.getElementById('orginfo-modal'); return !!(m && m.classList.contains('open') && m.contains(document.activeElement)); });
  check('the org-info dialog takes keyboard focus', await inside());
  let stayed = true;
  for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); if (!(await inside())) { stayed = false; break; } }
  for (let i = 0; i < 4 && stayed; i++) { await p.keyboard.press('Shift+Tab'); if (!(await inside())) stayed = false; }
  check('Tab and Shift+Tab stay inside the dialog', stayed);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('closing returns focus to the button that opened it', await p.evaluate(() => /Draft proposal/.test(document.activeElement?.textContent || '')));
  const m = await openApp(browser, { persona: 'np', width: 390, height: 844 });
  await m.page.waitForTimeout(800);
  await m.page.focus('.m-burger >> visible=true'); await m.page.keyboard.press('Enter'); await m.page.waitForTimeout(500);
  let inMenu = true;
  for (let i = 0; i < 25; i++) { await m.page.keyboard.press('Tab'); if (!(await m.page.evaluate(() => document.getElementById('m-nav').contains(document.activeElement)))) { inMenu = false; break; } }
  check('Tab stays inside the open phone menu', inMenu);
  t.errors.push(...m.errors); await m.ctx.close();
  return t;
});

flow('draft-export', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(p.url()).origin });
  await p.evaluate(() => go('generator')); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = (window._genPipeline || [])[0]; if (s) pickSaved(s.id); }); await p.waitForTimeout(800);
  await p.click('#gen-btn'); await approvePlanIfShown(p); await p.waitForTimeout(7000);
  const read = async (d) => { const fs = await import('fs'); return fs.readFileSync(await d.path(), 'utf8'); };
  await p.click('#export-btn');
  const [docDl] = await Promise.all([p.waitForEvent('download'), p.click('#exp-menu button:has-text("Word")')]);
  const doc = await read(docDl);
  console.log('    export file name:', docDl.suggestedFilename());
  check('Word export downloads a .doc named after the org', /^Eastside_Youth_Collective_.+\.doc$/.test(docDl.suggestedFilename()));
  check('Word export has the sections and no highlight markup', /<h2>Statement of Need<\/h2>/i.test(doc) && !/verify-flag|<mark/i.test(doc) && !/onerror|<script/i.test(doc));
  await p.click('#export-btn');
  const [txtDl] = await Promise.all([p.waitForEvent('download'), p.click('#exp-menu button:has-text("Plain text")')]);
  const txt = await read(txtDl);
  check('plain-text export is clean text with the sections', /Statement of Need/.test(txt) && !/<[a-z]/i.test(txt));
  await p.click('#export-btn');
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('#exp-menu button:has-text("PDF")')]);
  await pop.waitForLoadState().catch(() => {});
  check('PDF opens a print view of the proposal', /Statement of Need/.test(await pop.content()));
  await pop.close().catch(() => {});
  await p.click('button[onclick="copyProposal()"]'); await p.waitForTimeout(400);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check('Copy puts clean text on the clipboard', /Statement of Need/.test(clip) && !/<[a-z]/i.test(clip));
  return t;
});

flow('demo-keyboard', async (browser, check) => {
  const t = await openApp(browser, { persona: 'visitor' });
  const p = t.page;
  await p.click('#landing button:has-text("demo"), #landing a:has-text("demo"), #landing [onclick*="go(\'demo\')"] >> visible=true').catch(async () => { await p.evaluate(() => go('demo')); });
  await p.waitForTimeout(800);
  const cur = () => p.evaluate(() => [...document.querySelectorAll('#demo .dp-screen-current')].map((e) => [...e.parentNode.children].indexOf(e)).join());
  const start = await cur();
  let moved = false;
  for (let i = 0; i < 12 && !moved; i++) { await p.keyboard.press('ArrowDown'); await p.waitForTimeout(700); moved = (await cur()) !== start; }
  check('arrow keys advance the demo without clicking into it first', moved);
  return t;
});

flow('profile-photo-logo', async (browser, check) => {
  const t = await openApp(browser, { persona: 'np' });
  const p = t.page;
  await p.evaluate(() => go('profile')); await p.waitForTimeout(900);
  // a transparent, wide wordmark-style PNG (what many nonprofits have as a logo)
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#c34426'; x.fillRect(20, 60, 560, 80); return c.toDataURL('image/png').split(',')[1]; });
  await p.setInputFiles('#pf-photo-input', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const url = localStorage.getItem(orgPhotoKey()); if (!url) return null;
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const px = (a, b) => [...x.getImageData(a, b, 1, 1).data].slice(0, 3);
    return { corner: px(4, 4), leftEdge: px(30, 128), rightEdge: px(226, 128), aboveBand: px(128, 100) };
  });
  check('photo saved', !!r);
  check('transparent areas come out white, not black', r && r.corner.every((v) => v > 240));
  const red = (c) => c[0] > 150 && c[1] < 120;
  check('a wide logo is shown whole, not cropped (both ends visible, space above it)', r && red(r.leftEdge) && red(r.rightEdge) && r.aboveBand.every((v) => v > 240));
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
