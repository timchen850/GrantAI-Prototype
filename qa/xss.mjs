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
  'irs-verify': { status: 200, body: { ok: true, output: { found: true, ein: '123456789', name: X('irs-name'), city: X('irs-city'), state: 'CA', status: 'active', deductibility: X('irs-ded'), subsection: '501(c)(3)', ruling_year: 2011, revoked: false, source_url: 'javascript:window.__xss=(window.__xss||[]).concat("irs-url")' } } },
  'usaspending-search': { status: 200, body: { output: { state: 'CA', sampled: 40, total_found: 312, award_low: 15000, award_median: 85000, award_high: 750000, keywords: [X('usa-kw')], agencies: [{ name: X('usa-agency'), amount: 4200000, count: 18 }], recipients: [{ name: X('usa-recipient'), amount: 250000, year: 2025, agency: X('usa-rec-agency') }] } } },
  'grant-detail': { status: 200, body: { output: { details: { 999: { awardCeiling: 50000, awardFloor: 10000, desc: X('detail-desc'), numberOfAwards: 12, eligibility: X('detail-elig') } } } } },
  'ai-chat': { status: 200, body: { reply: 'Hi ' + X('chat-reply') } },
  'ai-worker': { status: 200, body: { ok: true, output: (() => { const o = {
    score: 70, band: 'strong', verdict: 'caution', headline: X('as-headline'), why: X('as-why'), rationale: X('as-rationale'), recommendation: X('as-rec'),
    components: [{ label: X('as-comp-label'), score: 60, note: X('as-comp-note') }], eligibility: [{ label: X('el-label'), status: 'unclear', note: X('el-note') }], watch_outs: [X('as-watch')],
    verdict_headline: X('rfp-headline'), verdict_reason: X('rfp-reason'), deadline: X('rfp-deadline'), sections: [{ title: X('rfp-sec'), word_limit: 500, description: X('rfp-sec-desc') }],
    attachments: [{ name: X('rfp-att'), required: true }], formatting: [X('rfp-fmt')], ai_policy: { stance: 'restricted', note: X('rfp-ai') },
    rubric: { source: 'stated', criteria: [{ name: X('rfp-crit'), weight: 50, description: X('rfp-crit-desc') }] },
    weighted_total: 60, summary: X('judge-summary'), weakest: [X('judge-weak')], scores: [{ criterion: X('judge-crit'), weight: 50, score: 2, reasoning: X('judge-why'), fix: X('judge-fix') }],
    revised_html: '', changes: [] }; return o; })() } },
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
db.documents.push({ id: 'd-y', user_id: uid, kind: 'doc_990', file_path: uid + '/x', file_name: X('upload-name'), created_at: new Date().toISOString() });
const p = t.page;
await p.reload(); await p.waitForTimeout(2500);
const screens = await p.evaluate(() => SCREENS.filter((s) => !['tutorial', 'onboarding', 'demo'].includes(s)));
for (const s of screens) {
  await p.evaluate((id) => go(id), s).catch(() => {}); await p.waitForTimeout(1500);
  if (s === 'generator') { await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(800); }
  if (s === 'readiness') {
    await p.click('#rdy-irs-btn').catch(() => {}); await p.waitForTimeout(1500);
    await p.fill('#rdy-req-ta', 'Grant call text long enough to analyze for the sweep. Deadline December 1.').catch(() => {}); await p.click('#rdy-req-btn').catch(() => {}); await p.waitForTimeout(1800);
  }
  if (s === 'generator') {
    await p.fill('#gen-rfp-text', 'Grant call text long enough to analyze for the sweep. Deadline December 1.').catch(() => {});
    await p.click('#generator button:has-text("Analyze this call")').catch(() => {}); await p.waitForTimeout(1800);
    await p.click('#gen-btn').catch(() => {}); await p.waitForTimeout(3000);
    const ap = await p.$('button:has-text("Generate with this plan")'); if (ap) await ap.click().catch(() => {});
    await p.waitForTimeout(8000);   // draft + scorecard
  }
  if (s === 'profile') { await p.evaluate(() => { window._grange.profile.tier = 'pro'; applyRagGate?.(); loadRagDocs?.(); }); await p.waitForTimeout(800); }
  if (s === 'discovery') { await p.click('#disc-grants-list .gcard button:has-text("AI assessment") >> nth=0').catch(() => {}); await p.waitForTimeout(1500); }
}
await p.click('#ai-chat-fab').catch(() => {}); await p.waitForTimeout(500);
await p.fill('#acp-text', 'hello').catch(() => {}); await p.press('#acp-text', 'Enter').catch(() => {}); await p.waitForTimeout(1500);
await p.evaluate(() => go('dashboard')); await p.waitForTimeout(1200);
const shownAsText = await p.evaluate(() => document.body.innerText.includes('onerror='));
await p.evaluate(() => go('readiness')); await p.waitForTimeout(1200);
const irsLink = await p.evaluate(() => (document.querySelector('.rdy-irs-src') || {}).getAttribute?.('href') || '(no link)');
console.log('IRS record link:', irsLink);
const ran = await p.evaluate(() => window.__xss || []);
// control: the detector must catch markup inserted unsafely
const control = await p.evaluate((x) => new Promise((ok) => { const d = document.createElement('div'); d.innerHTML = x; document.body.appendChild(d); setTimeout(() => { ok((window.__xss || []).includes('control')); d.remove(); window.__xss = window.__xss.filter((v) => !v.startsWith('control')); }, 600); }), X('control'));
const TAGS = ['org', 'mission', 'grant-title-0', 'deadline-0', 'cmp-label', 'exp', 'doc-label', 'upload-name', 'gov-title', 'gov-agency', 'irs-name', 'usa-agency', 'usa-recipient', 'detail-desc', 'chat-reply', 'as-headline', 'as-comp-note', 'el-label', 'rfp-headline', 'rfp-sec', 'rfp-att', 'rfp-crit', 'judge-summary', 'judge-fix'];
const seen = await p.evaluate((tags) => { const txt = document.documentElement.textContent; return tags.filter((t) => txt.includes("concat('" + t + "')")); }, TAGS);
console.log('rendered as text (' + seen.length + '/' + TAGS.length + '):', TAGS.filter((t) => !seen.includes(t)).length ? 'missing ' + TAGS.filter((t) => !seen.includes(t)).join(', ') : 'all');
console.log('injected text visible as plain text somewhere:', shownAsText, '| detector works on an unsafe insert:', control);
console.log(ran.length ? 'CODE RAN from: ' + [...new Set(ran)].join(', ') : 'nothing ran: 0 injected handlers executed');
console.log('console errors:', t.errors.filter((e) => !/404|Failed to load resource/.test(e)).slice(0, 3));
await browser.close(); srv.close();
process.exit(ran.length ? 1 : 0);
