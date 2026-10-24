// Long-text stress: very long organization, grant, funder and deadline names, and a long
// unbroken word, on every app screen. Reports sideways scroll and text cut off inside a box.
// Usage: node longtext.mjs [widths]
import { startServer, launch, openApp, overflowReport } from './harness.mjs';

const widths = (process.argv[2] || '320,390,1440').split(',').map(Number);
const ORG = 'The Greater Metropolitan Community Partnership for Neighborhood Revitalization and Youth Opportunity, Inc.';
const LONG = 'Strengthening Community-Based Behavioral Health Services for Underserved Rural and Frontier Populations Through Integrated Care Coordination';
const WORD = 'Supercalifragilisticexpialidociouscommunityfoundationgrantprogram';
const srv = await startServer(); let total = 0;
for (const width of widths) {
  const browser = await launch();
  const hit = (id, title, agency) => ({ id, number: 'HHS-' + id, title, agency, agencyCode: 'HHS', closeDate: '12/15/2026', oppStatus: 'posted', cfdaList: ['93.243'], grangeFocus: ['Health', 'Youth', 'Education'], eligTags: ['501(c)(3) eligible', 'Open to any applicant'] });
  const fnOverride = { 'discover-grants': { status: 200, body: { output: { hits: [hit(910001, LONG, 'Substance Abuse and Mental Health Services Administration — Center for Substance Abuse Prevention'), hit(910002, WORD, WORD)] } } } };
  const t = await openApp(browser, { persona: 'np', width, height: width < 600 ? 844 : 900, fnOverride });
  const p = t.page; const uid = t.db.profiles.find((x) => x.org_name)?.user_id;
  t.db.profiles.forEach((x) => { if (x.user_id === uid) x.org_name = ORG; });
  t.db.onboarding_answers.forEach((r) => { if (r.user_id === uid && r.question_key === 'org_name') r.answer = ORG; });
  t.db.grants.forEach((g, i) => { if (g.user_id === uid) { g.title = (i % 2 ? WORD : LONG); g.funder = 'The Robert Wood Johnson and Bill & Melinda Gates Joint Philanthropic Initiative'; } });
  t.db.deadlines.forEach((d, i) => { if (d.user_id === uid) d.title = (i % 2 ? WORD : LONG) + ': proposal due'; });
  await p.reload(); await p.waitForTimeout(2000);
  for (const s of ['dashboard', 'discovery', 'readiness', 'nonprofit-setup', 'generator', 'manage', 'deadlines', 'profile', 'plan']) {
    await p.evaluate((id) => { scrollTo(0, 0); go(id); }, s); await p.waitForTimeout(1600);
    if (s === 'generator') { await p.evaluate(() => { const g = (window._genPipeline || [])[0]; if (g) pickSaved(g.id); }); await p.waitForTimeout(800); }
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '-' + width + '-' + s + '.png', fullPage: true });
    const ov = await overflowReport(p);
    const cut = await p.evaluate((id) => {
      const out = []; const root = document.getElementById(id);
      root.querySelectorAll('*').forEach((el) => {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
        const cs = getComputedStyle(el); if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') || !el.getClientRects().length) return;
        if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX)) out.push('cut sideways: ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' "' + el.textContent.trim().slice(0, 40) + '"');
        const r = el.getBoundingClientRect();
        for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
          const acs = getComputedStyle(a); if (!/(hidden|clip)/.test(acs.overflowX + acs.overflowY)) continue;
          const ar = a.getBoundingClientRect(); if (r.right > ar.right + 2 && r.width > 0) out.push('runs past its box: ' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' "' + el.textContent.trim().slice(0, 40) + '"'); break;
        }
      });
      return [...new Set(out)].slice(0, 8);
    }, s);
    const bad = (ov.docW > ov.vw ? ['SIDEWAYS SCROLL ' + ov.docW + '>' + ov.vw + ': ' + ov.items.slice(0, 3).map((x) => x.tag + '.' + x.cls.split(' ')[0] + ' "' + x.text + '"').join('; ')] : []).concat(cut);
    if (bad.length) { console.log(width, s + ':'); bad.forEach((b) => console.log('   ' + b)); total += bad.length; }
  }
  if (t.errors.length) console.log(width, 'console errors:', t.errors.slice(0, 3));
  await t.ctx.close(); await browser.close();
}
console.log('\nlong-text problems:', total);
srv.close();
