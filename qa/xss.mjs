// Stored-XSS sweep: put markup that runs code into every user- or data-controlled text
// field the fake backend returns (profile, answers, grants, deadlines, awards, documents,
// Grants.gov results), visit every screen and open the main panels, and check nothing ran.
// Usage: node xss.mjs [width]
import { startServer, launch, openApp } from './harness.mjs';
const width = +(process.argv[2] || 1440);
const srv = await startServer(); const browser = await launch();
const X = (tag) => `<img src=x onerror="window.__xss=(window.__xss||[]).concat('${tag}')">"'><svg onload="window.__xss=(window.__xss||[]).concat('${tag}-svg')">`;
const t = await openApp(browser, { persona: 'np', width, fnOverride: {
  'discover-grants': { status: 200, body: { output: { hits: [{ id: 999, number: X('gov-number'), title: 'Youth ' + X('gov-title'), agency: X('gov-agency'), agencyCode: 'ED', closeDate: '12/01/2026', oppStatus: 'posted', cfdaList: [X('cfda')], grangeFocus: [X('focus')], eligTags: [X('elig')] }] } } },
  'irs-verify': { status: 200, body: { output: { ein: '123456789', name: X('irs-name'), city: X('irs-city'), state: 'CA', status: 'active', deductibility: X('irs-ded'), subsection: '501(c)(3)', ruling_year: 2011, revoked: false } } },
} });
const db = t.db;
const uid = db.profiles[0].user_id;
// poison everything the backend hands back
db.profiles.forEach((r) => { r.org_name = 'Org ' + X('org'); r.mission = 'Mission ' + X('mission'); r.ein = '12-3456789'; });
db.onboarding_answers.forEach((r) => { if (typeof r.answer === 'string') r.answer = r.answer + X('ans-' + r.question_key); if (Array.isArray(r.answer)) r.answer = r.answer.concat([X('ans-' + r.question_key)]); });
db.grants.forEach((g, i) => { g.title = 'Grant ' + X('grant-title-' + i); g.funder = X('grant-funder-' + i); g.amount = X('grant-amount-' + i); });
db.deadlines.forEach((d, i) => { d.title = 'Due ' + X('deadline-' + i); });
db.awards.forEach((a) => { a.name = X('award'); });
db.compliance_requirements.forEach((c) => { c.label = X('cmp-label'); c.detail = X('cmp-detail'); });
db.expenditures.forEach((e) => { e.description = X('exp'); });
db.documents.push({ id: 'd-x', user_id: uid, kind: 'past_proposal', label: X('doc-label'), file_name: X('doc-file'), created_at: new Date().toISOString() });
db.documents.push({ id: 'd-y', user_id: uid, kind: 'form_990', file_path: uid + '/x', file_name: X('upload-name'), created_at: new Date().toISOString() });
const p = t.page;
await p.reload(); await p.waitForTimeout(2500);
const screens = await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding', 'demo'].includes(s)));
for (const s of screens) {
  await p.evaluate((id) => go(id), s).catch(() => {}); await p.waitForTimeout(1500);
  if (s === 'generator') { await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(800); }
  if (s === 'readiness') { await p.click('#rdy-irs-btn').catch(() => {}); await p.waitForTimeout(1500); }
  if (s === 'profile') { await p.evaluate(() => { window._grange.profile.tier = 'pro'; applyRagGate?.(); loadRagDocs?.(); }); await p.waitForTimeout(800); }
  if (s === 'discovery') { await p.click('#disc-grants-list .gcard button:has-text("AI assessment") >> nth=0').catch(() => {}); await p.waitForTimeout(1500); }
}
await p.click('#ai-chat-fab').catch(() => {}); await p.waitForTimeout(500);
await p.evaluate(() => go('dashboard')); await p.waitForTimeout(1200);
const shownAsText = await p.evaluate(() => document.body.innerText.includes('onerror='));
const ran = await p.evaluate(() => window.__xss || []);
// control: the detector must catch markup inserted unsafely
const control = await p.evaluate((x) => new Promise((ok) => { const d = document.createElement('div'); d.innerHTML = x; document.body.appendChild(d); setTimeout(() => { ok((window.__xss || []).includes('control')); d.remove(); window.__xss = window.__xss.filter((v) => !v.startsWith('control')); }, 600); }), X('control'));
console.log('injected text visible as plain text somewhere:', shownAsText, '| detector works on an unsafe insert:', control);
console.log(ran.length ? 'CODE RAN from: ' + [...new Set(ran)].join(', ') : 'nothing ran: 0 injected handlers executed');
console.log('console errors:', t.errors.filter((e) => !/404|Failed to load resource/.test(e)).slice(0, 3));
await browser.close(); srv.close();
process.exit(ran.length ? 1 : 0);
