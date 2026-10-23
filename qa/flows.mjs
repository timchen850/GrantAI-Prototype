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
