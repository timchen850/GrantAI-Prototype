// QA harness for the live single-file app (../index.html).
// Serves the repo locally and runs it in Chromium with every outside dependency
// answered in the browser: jsdelivr libraries and Google Fonts come from npm
// copies, and the Supabase project (auth, REST tables, storage, edge functions)
// is a small in-memory fake. Nothing leaves the machine, so it works offline and
// never touches real user data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { buildDb, PERSONAS } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.QA_ROOT ? path.resolve(process.env.QA_ROOT) : path.resolve(HERE, '..');   // QA_ROOT: test another copy of the site
const NM = path.join(HERE, 'node_modules');
const SUPA = 'https://xewrvmqyzeiziimcmenj.supabase.co';
const STORAGE_KEY = 'sb-xewrvmqyzeiziimcmenj-auth-token';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };

export function startServer(port = +process.env.QA_PORT || 3456) {   // QA_PORT: run two suites at once
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok(srv)));
}

export async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
}

/* ───────── fonts ───────── */
function fontCss() {
  const face = (fam, pkg, file, weight, style) => `@font-face{font-family:'${fam}';font-style:${style};font-weight:${weight};font-display:swap;src:url(https://fonts.gstatic.com/qa/${pkg}/${file}) format('woff2');}`;
  const out = [];
  for (const w of [400, 500, 600, 700, 800]) out.push(face('Hanken Grotesk', 'hanken-grotesk', `hanken-grotesk-latin-${w}-normal.woff2`, w, 'normal'));
  for (const w of [500, 600]) out.push(face('Playfair Display', 'playfair-display', `playfair-display-latin-${w}-italic.woff2`, w, 'italic'));
  return out.join('\n');
}

/* ───────── fake JWT / session ───────── */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp, session_id: 'qa' })}.qa-signature`;
  return { access_token, token_type: 'bearer', expires_in: 3600 * 24, expires_at: exp, refresh_token: 'qa-refresh', user };
}

/* ───────── PostgREST-ish query engine ───────── */
function parseVal(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v; }
function matchOne(row, col, expr) {
  const i = expr.indexOf('.'); const op = expr.slice(0, i); let v = expr.slice(i + 1);
  const neg = op === 'not'; let rop = op;
  if (neg) { const j = v.indexOf('.'); rop = v.slice(0, j); v = v.slice(j + 1); }
  const cell = row[col];
  let r;
  switch (rop) {
    case 'eq': r = String(cell) === String(parseVal(v)) || (cell === null && v === 'null'); break;
    case 'neq': r = String(cell) !== String(v); break;
    case 'is': r = v === 'null' ? cell == null : String(cell) === v; break;
    case 'in': { const list = v.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')); r = list.includes(String(cell)); break; }
    case 'gt': r = cell > v; break; case 'gte': r = cell >= v; break;
    case 'lt': r = cell < v; break; case 'lte': r = cell <= v; break;
    case 'like': case 'ilike': { const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', rop === 'ilike' ? 'i' : ''); r = re.test(String(cell ?? '')); break; }
    default: r = true;
  }
  return neg ? !r : r;
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'or', 'and', 'columns']);
function filterRows(rows, sp) {
  return rows.filter((row) => { for (const [k, v] of sp) { if (RESERVED.has(k)) continue; if (!matchOne(row, k, v)) return false; } return true; });
}
function embed(db, rows, select) {
  const m = [...String(select || '').matchAll(/([a-z_]+)\(([^)]*)\)/g)];
  if (!m.length) return rows;
  return rows.map((r) => {
    const o = { ...r };
    for (const [, rel] of m) { const fk = rel.replace(/s$/, '') + '_id'; o[rel] = (db[rel] || []).find((x) => String(x.id) === String(r[fk])) || null; }
    return o;
  });
}
// The live tables' unique keys (from the Supabase schema), so duplicate inserts fail the way they do in production.
const UNIQUE = { profiles: [['user_id']], onboarding_answers: [['user_id', 'question_key']], readiness_items: [['user_id', 'req_key']], draft_outcomes: [['user_id', 'draft_uid']] };
// The live check constraints the app writes against (from supabase/migrations + the live schema).
const CHECKS = {
  profiles: { tax_exempt_status: ['unknown', '501c3_pending', '501c3', '501c4', '501c6', 'fiscal_sponsorship', 'government', 'tribal', 'other'] },
  grants: { status: ['discovered', 'saved', 'eligibility_review', 'drafting', 'internal_review', 'submitted', 'awarded', 'declined', 'withdrawn'] },
  deadlines: { kind: ['proposal', 'loi', 'report', 'renewal', 'registration_renewal', 'meeting', 'custom'], status: ['upcoming', 'done', 'missed', 'cancelled'] },
};
const checkViolation = (table, row) => Object.entries(CHECKS[table] || {}).find(([col, ok]) => col in row && row[col] != null && !ok.includes(row[col]));
const checkFail = (route, table, col) => route.fulfill({ status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: '23514', message: `new row for relation "${table}" violates check constraint "${table}_${col}_check"`, details: null, hint: null }) });
function restHandler(db, log, failTables = []) {
  return async (route) => {
    await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 60));   // real network latency, so races show up
    { const tb = new URL(route.request().url()).pathname.split('/').pop();
      if (failTables.includes(tb) && route.request().method() !== 'GET') { log.push(`${route.request().method()} ${tb} -> 503 (forced)`); return route.fulfill({ status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 'PGRST000', message: 'qa: forced outage', details: null, hint: null }) }); } }
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split('/').pop();
    const sp = [...url.searchParams.entries()]; const method = req.method(); const h = req.headers();
    const prefer = h['prefer'] || ''; const wantObj = (h['accept'] || '').includes('vnd.pgrst.object');
    db[table] = db[table] || [];
    let rows; let status = 200;
    if (method === 'GET' || method === 'HEAD') {
      rows = filterRows(db[table], sp);
      const order = url.searchParams.get('order');
      if (order) { const [c, dir] = order.split(',')[0].split('.'); rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const lim = +url.searchParams.get('limit') || 0; if (lim) rows = rows.slice(0, lim);
      rows = embed(db, rows, url.searchParams.get('select'));
    } else if (method === 'POST') {
      let body = req.postDataJSON(); body = Array.isArray(body) ? body : [body];
      for (const b of body) { const v = checkViolation(table, b); if (v) { log.push(`POST ${table} -> 400 check ${v[0]}=${b[v[0]]}`); return checkFail(route, table, v[0]); } }
      const conflict = (url.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
      const upsert = prefer.includes('merge-duplicates') || prefer.includes('ignore-duplicates');
      rows = body.map((b) => {
        if (upsert && conflict.length) {
          const ex = db[table].find((r) => conflict.every((c) => String(r[c]) === String(b[c])));
          if (ex) { if (!prefer.includes('ignore-duplicates')) Object.assign(ex, b, { updated_at: new Date().toISOString() }); return ex; }
        }
        const dup = (UNIQUE[table] || []).find((cols) => db[table].some((r) => cols.every((c) => String(r[c]) === String(b[c]))));
        if (dup) return { __conflict: dup };
        const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...b };
        db[table].push(row); return row;
      });
      const clash = rows.find((r) => r.__conflict);
      if (clash) {
        log.push(`POST ${table} -> 409 duplicate (${clash.__conflict})`);
        return route.fulfill({ status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: '23505', message: `duplicate key value violates unique constraint "${table}_${clash.__conflict.join('_')}_key"`, details: null, hint: null }) });
      }
      status = 201;
    } else if (method === 'PATCH') {
      const body = req.postDataJSON();
      const v = checkViolation(table, body); if (v) { log.push(`PATCH ${table} -> 400 check ${v[0]}=${body[v[0]]}`); return checkFail(route, table, v[0]); }
      rows = filterRows(db[table], sp); rows.forEach((r) => Object.assign(r, body));
    } else if (method === 'DELETE') {
      rows = filterRows(db[table], sp); db[table] = db[table].filter((r) => !rows.includes(r));
    }
    log.push(`${method} ${table}?${url.search.slice(1, 160)} -> ${rows.length}`);
    const ret = method === 'GET' || method === 'HEAD' || prefer.includes('return=representation');
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
    if (wantObj) {
      if (rows.length !== 1) return route.fulfill({ status: 406, headers, body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null }) });
      return route.fulfill({ status: status === 201 ? 201 : 200, headers, body: JSON.stringify(rows[0]) });
    }
    if (!ret) return route.fulfill({ status: method === 'POST' ? 201 : 204, headers, body: '' });
    return route.fulfill({ status, headers, body: JSON.stringify(rows) });
  };
}

/* ───────── edge functions ───────── */
const SAMPLE_DRAFT = '<h4>Executive Summary</h4><p>Eastside Youth Collective requests $25,000 to expand its after-school STEM program from 120 to 180 students in East Los Angeles.</p>' +
  '<h4>Statement of Need</h4><p>Only 38% of eighth graders in our service area meet state math standards [VERIFY: district data]. Families report few free programs after 3 p.m.</p>' +
  '<h4>Program Description</h4><p>Students meet four afternoons a week for hands-on robotics, coding and tutoring led by trained mentors.</p>' +
  '<h4>Evaluation</h4><p>We track attendance, pre/post math assessments and family surveys each semester.</p>' +
  '<h4>Budget Overview</h4><p>Mentor stipends $14,000; materials $6,000; transportation $5,000.</p>';
const SAMPLE_PLAN = { overview: 'Lead with the math-proficiency gap in Boyle Heights, then show how four afternoons a week of hands-on STEM closes it.',
  sections: [
    { title: 'Statement of Need', approach: 'Open with the 38% proficiency figure and what families told us.', why: 'Reviewers fund documented need.', options: [{ label: 'Lead with data' }, { label: 'Lead with a family story' }], question: '' },
    { title: 'Program Design', approach: 'Walk through a week of the program.', why: 'Shows the program is concrete.', options: [], question: 'How many mentors will work with each group?' },
    { title: 'Evaluation', approach: 'Pre/post assessments and attendance.', why: 'The funder asks for measurable outcomes.', options: [], question: '' },
    { title: 'Budget', approach: 'Tie each line to an activity.', why: 'Clear budgets score higher.', options: [], question: '' } ] };
function sse(text) {
  const parts = text.match(/.{1,120}/gs) || [];
  return parts.map((p) => 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: p }] } }] }) + '\n\n').join('') + 'data: [DONE]\n\n';
}
function govHits() {
  const t = (d) => { const x = new Date(Date.now() + d * 864e5); return `${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}/${x.getFullYear()}`; };
  return [
    { id: 351001, number: 'ED-GRANTS-2026-01', title: '21st Century Community Learning Centers: Out-of-School Time STEM Expansion', agency: 'Department of Education', agencyCode: 'ED', closeDate: t(45), oppStatus: 'posted', cfdaList: ['84.287'], grangeFocus: ['Education', 'Youth'], eligTags: ['501(c)(3) eligible'] },
    { id: 351002, number: 'HHS-2026-ACF', title: 'Community Health Workers for Youth Mental Health Prevention', agency: 'Department of Health and Human Services', agencyCode: 'HHS', closeDate: t(20), oppStatus: 'posted', cfdaList: ['93.243'], grangeFocus: ['Health', 'Youth'], eligTags: ['501(c)(3) eligible'] },
    { id: 351003, number: 'USDA-NIFA-2026', title: 'Community Food Projects Competitive Grant Program', agency: 'Department of Agriculture', agencyCode: 'USDA', closeDate: t(70), oppStatus: 'posted', cfdaList: ['10.225'], grangeFocus: ['Food Security'], eligTags: ['501(c)(3) eligible', 'Open to small business'] },
    { id: 351004, number: 'NEA-2027-ART', title: 'Grants for Arts Projects: Arts Education', agency: 'National Endowment for the Arts', agencyCode: 'NEA', closeDate: '', oppStatus: 'forecasted', cfdaList: ['45.024'], grangeFocus: ['Arts', 'Education'], eligTags: ['501(c)(3) eligible'] },
    { id: 351005, number: 'DOL-ETA-2026', title: 'YouthBuild Workforce Training Grants', agency: 'Department of Labor', agencyCode: 'DOL', closeDate: t(9), oppStatus: 'posted', cfdaList: ['17.274'], grangeFocus: ['Workforce', 'Youth'], eligTags: ['501(c)(3) eligible', 'Open to any applicant'] },
    { id: 351006, number: 'EPA-OEJ-2026', title: 'Environmental Justice Collaborative Problem-Solving Cooperative Agreement Program', agency: 'Environmental Protection Agency', agencyCode: 'EPA', closeDate: t(33), oppStatus: 'posted', cfdaList: ['66.306'], grangeFocus: ['Environment', 'Community Development'], eligTags: ['501(c)(3) eligible'] },
  ];
}
function fnHandler(fnLog, opts) {
  return async (route) => {
    const req = route.request(); const name = new URL(req.url()).pathname.split('/').pop();
    let body = {}; try { body = req.postDataJSON() || {}; } catch (_) {}
    fnLog.push(name);
    const json = (o, status = 200) => route.fulfill({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if (opts.failFunctions) return json({ error: 'qa: forced failure' }, 500);
    if (opts.fnOverride && opts.fnOverride[name]) { const o = opts.fnOverride[name]; return json(o.body, o.status); }
    switch (name) {
      case 'discover-grants': return json({ output: { hits: govHits() } });
      case 'grant-detail': { const d = {}; (body.ids || []).forEach((id, i) => { d[id] = { awardCeiling: 50000 * (i + 1), awardFloor: 10000, desc: 'Supports community organizations that run programs in this area. Applicants describe need, approach, evaluation and budget.', numberOfAwards: 12, eligibility: 'Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education' }; }); return json({ output: { details: d } }); }
      case 'usaspending-search': return json({ output: { state: 'CA', sampled: 40, total_found: 312, award_low: 15000, award_median: 85000, award_high: 750000, keywords: ['youth', 'education'], agencies: [{ name: 'Department of Education', amount: 4200000, count: 18 }, { name: 'Department of Health and Human Services', amount: 2100000, count: 9 }], recipients: [{ name: 'Boys & Girls Club of East LA', amount: 250000, year: 2025, agency: 'ED' }, { name: 'LA Youth Network', amount: 120000, year: 2024, agency: 'HHS' }] } });
      case 'generate-proposal': {
        const prompt = JSON.stringify(body.contents || '');
        const isPlan = /PLAN of how you will approach/.test(prompt);
        const text = isPlan ? JSON.stringify(SAMPLE_PLAN) : (opts.draftText || SAMPLE_DRAFT);
        return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' }, body: sse(text) });
      }
      case 'ai-chat': return json({ reply: 'Lead with your outcomes: 180 students served, 38% math proficiency baseline. Ask for $25,000 and tie each budget line to an activity.' });
      case 'ai-worker': {
        const out = body.job_type === 'assess_grant' ? { score: 78, band: 'strong', verdict: 'Worth applying', headline: 'Strong fit for your after-school STEM work', why: 'Your mission, location and budget match what this funder supports.', rationale: 'Funds out-of-school programs for low-income youth in your region.', recommendation: 'Apply. Lead with your attendance and math-score outcomes.', components: [{ label: 'Mission', score: 90, note: 'Youth education' }, { label: 'Geography', score: 85, note: 'Serves your county' }, { label: 'Budget', score: 60, note: 'Award is large for your budget' }], eligibility: [{ label: '501(c)(3) status', status: 'likely', note: 'Confirmed' }, { label: 'Matching funds', status: 'unclear', note: '1:1 match may be required' }], watch_outs: ['Check whether a 1:1 match is required.'] } : {};
        return json({ ok: true, job: { id: randomUUID(), status: 'done', output: out }, output: out });
      }
      case 'irs-verify': return json({ output: { ein: body.ein, name: 'EASTSIDE YOUTH COLLECTIVE', city: 'LOS ANGELES', state: 'CA', status: 'active', deductibility: 'Contributions are deductible', subsection: '501(c)(3)', ruling_year: 2011, revoked: false } });
      case 'exemplar-search': case 'rag-search': return json({ chunks: [] });
      default: return json({ ok: true });
    }
  };
}

/* ───────── page factory ───────── */
export async function openApp(browser, { persona = 'np', width = 1440, height = 900, screen = null, failFunctions = false, failTables = [], fnOverride = {}, draftText = null, signedOut = false, revokedSession = false, backendDown = false, reducedMotion = false, base = 'http://127.0.0.1:' + (+process.env.QA_PORT || 3456) + '/' } = {}) {
  const P = PERSONAS[persona];
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const db = buildDb(persona);
  const restLog = [], fnLog = [], errors = [], external = [];
  let authUser = signedOut ? null : P.user;   // who the fake auth server thinks is signed in
  // Anything off-box that no route below answers is unexpected: record it and fail it fast.
  // (Playwright runs the most recently registered matching route first, so this goes first.)
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => { external.push(r.request().url()); r.abort(); });
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2*', (r) => r.fulfill({ path: path.join(NM, '@supabase/supabase-js/dist/umd/supabase.js'), contentType: 'text/javascript' }));
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.158.0/**', (r) => r.fulfill({ path: path.join(NM, 'three/build/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: fontCss(), contentType: 'text/css' }));
  await ctx.route('https://fonts.gstatic.com/qa/**', (r) => { const [pkg, file] = new URL(r.request().url()).pathname.split('/').slice(-2); r.fulfill({ path: path.join(NM, '@fontsource', pkg, 'files', file), contentType: 'font/woff2' }); });
  await ctx.route(SUPA + '/rest/v1/**', restHandler(db, restLog, failTables));
  await ctx.route(SUPA + '/functions/v1/**', fnHandler(fnLog, { failFunctions, fnOverride, draftText }));
  await ctx.route(SUPA + '/storage/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'documents/qa', signedURL: '/qa-signed' }) }));
  await ctx.route(SUPA + '/auth/v1/**', async (r) => {
    const u = new URL(r.request().url()); const p = u.pathname.replace('/auth/v1', '');
    const json = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/user') return authUser ? json(authUser) : json({ code: 401, msg: 'no user' }, 401);
    if (p === '/token' && revokedSession && u.searchParams.get('grant_type') === 'refresh_token') return json({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
    if (p === '/token') { authUser = P.user || PERSONAS.np.user; return json(makeSession(authUser)); }
    if (p === '/otp') { otpSent.push(JSON.parse(r.request().postData() || '{}').email); return json({}); }
    if (p === '/signup') { authUser = P.user || PERSONAS.newuser.user; return json(makeSession(authUser)); }
    if (p === '/logout') { authUser = null; return r.fulfill({ status: 204, body: '' }); }
    return json({});
  });
  if (backendDown) {   // registered last, so it wins over every Supabase route above
    // A paused Supabase project: every API answers with an error page.
    await ctx.route(SUPA + '/**', (r) => r.fulfill({ status: 540, contentType: 'text/plain', body: 'project paused' }));
  }
  const otpSent = [];
  if (P.user && !signedOut) {
    const sess = makeSession(P.user); if (revokedSession) { sess.expires_at = Math.floor(Date.now() / 1000) - 3600; authUser = null; }
    const s = JSON.stringify(sess);
    await ctx.addInitScript(([k, v, tut]) => { try { if (sessionStorage.getItem('qa_seeded')) return; sessionStorage.setItem('qa_seeded', '1'); localStorage.setItem(k, v); if (tut) localStorage.setItem('grange_tut_' + tut, '1'); } catch (_) {} }, [STORAGE_KEY, s, P.tutorialDone ? P.user.id : '']);   // once per tab, so a reload after sign-out stays signed out
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(base + (screen ? '#' + screen : ''), { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return { ctx, page, db, restLog, fnLog, errors, external, otpSent };
}

/* Elements that stick out past the viewport (the usual cause of sideways scroll on phones). */
export async function overflowReport(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth; const out = [];
    const docW = document.documentElement.scrollWidth;
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (r.right > vw + 1 || r.left < -1) {
        // skip children of a horizontally scrolling container (intentional)
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) { const pcs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(pcs.overflowX)) { clipped = true; break; } p = p.parentElement; }
        if (!clipped) out.push({ tag: el.tagName.toLowerCase(), id: el.id, cls: String(el.className).slice(0, 60), left: Math.round(r.left), right: Math.round(r.right), text: (el.innerText || '').trim().slice(0, 40) });
      }
    });
    // keep only the outermost offenders
    return { vw, docW, items: out.slice(0, 25) };
  });
}

/* Scroll through the page so scroll-triggered reveals run before a full-page screenshot. */
export async function revealAll(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
  });
}
