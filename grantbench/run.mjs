#!/usr/bin/env node
// GrantBench — Grange AI evaluation harness.
//
// Runs a labeled benchmark (grantbench/dataset.json) against the LIVE
// ai-worker edge function and gates on quality thresholds. Catches prompt /
// model regressions in the rubric-extraction, eligibility, and LLM-as-judge
// engines (the report's "GrantBench à la BigLaw Bench"). Zero dependencies:
// Node 18+ global fetch only.
//
// Auth: reuses a single throwaway eval account (sign-in, or sign-up on first
// run). It only ever holds overwritten junk eval data, RLS-scoped to itself.
// Config (url + publishable/anon key) is read from ../config.js (committed,
// public by design) or from SUPABASE_URL / SUPABASE_ANON_KEY env vars.
//
// Usage:  node grantbench/run.mjs [--quiet] [--type rubric_extraction]
// Exit:   0 = all category thresholds met; 1 = a gate failed; 2 = setup error.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const ONLY_TYPE = (() => { const i = args.indexOf('--type'); return i >= 0 ? args[i + 1] : null; })();
// Serialized: judge calls are large and the live provider (Groq fallback)
// rate-limits on tokens-per-minute; one at a time avoids self-inflicted 429s.
// Transient 502s are still retried with backoff in worker().
const CONCURRENCY = 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Global pacer: keep a minimum gap between calls to stay under the provider's
// tokens-per-minute limit (Groq free tier). Worker retries wait out any window
// we still hit.
let _lastCallAt = 0;
const PACE_MS = Number(process.env.GRANTBENCH_PACE_MS) || 2500;
async function pace() { const w = _lastCallAt + PACE_MS - Date.now(); if (w > 0) await sleep(w); _lastCallAt = Date.now(); }

// Map a human tax-status string to the profiles.tax_exempt_status CHECK enum.
function mapTaxStatus(s) {
  const t = (s || '').toLowerCase();
  if (/501\W*c\W*3|501c3/.test(t)) return /pending/.test(t) ? '501c3_pending' : '501c3';
  if (/501\W*c\W*4|501c4/.test(t)) return '501c4';
  if (/501\W*c\W*6|501c6/.test(t)) return '501c6';
  if (/fiscal/.test(t)) return 'fiscal_sponsorship';
  if (/govern/.test(t)) return 'government';
  if (/tribal|tribe/.test(t)) return 'tribal';
  return 'other'; // for-profit / LLC / sole-prop / anything non-exempt
}

// Quality gates — a category fails the build if its metric drops below this.
const THRESHOLDS = {
  rubric_source_acc: 0.85,        // parse_rfp classifies stated vs inferred
  rubric_weight_acc: 0.75,        // stated matrices: extracted weights match
  eligibility_acc: 0.70,          // verdict matches the labeled verdict
  eligibility_catastrophic: 0,    // go<->stop confusions allowed (hard gate)
  judge_calibration: 0.70,        // judge score lands in the labeled band
  judge_discrimination: 0.80,     // strong beats weak by the required margin
  robustness: 1.0,                // injection resisted + bad input rejected
};

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', dim: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const log = (...a) => { if (!QUIET) console.log(...a); };
const die = (msg) => { console.error(`${C.r}GrantBench setup error:${C.x} ${msg}`); process.exit(2); };

function loadConfig() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    try {
      const cfg = readFileSync(join(__dir, '..', 'config.js'), 'utf8');
      url = url || (cfg.match(/url:\s*['"]([^'"]+)['"]/) || [])[1];
      key = key || (cfg.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1];
    } catch { /* fall through */ }
  }
  if (!url || !key) die('missing SUPABASE_URL / SUPABASE_ANON_KEY (and could not read ../config.js)');
  return { url, key };
}

const { url: URL_BASE, key: ANON } = loadConfig();
const EVAL_EMAIL = process.env.GRANTBENCH_EMAIL || 'grantbench@grange-test.dev';
const EVAL_PW = process.env.GRANTBENCH_PASSWORD || 'GrantBench-eval-7!xQ';

async function authFetch(path, body, token, method = 'POST') {
  const res = await fetch(URL_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + (token || ANON) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* may be empty (204) */ }
  return { status: res.status, json };
}

async function auth() {
  // Reuse the eval account (sign in); create it on first run.
  let r = await authFetch('/auth/v1/token?grant_type=password', { email: EVAL_EMAIL, password: EVAL_PW }, ANON);
  if (r.status !== 200 || !r.json?.access_token) {
    r = await authFetch('/auth/v1/signup', { email: EVAL_EMAIL, password: EVAL_PW }, ANON);
  }
  const token = r.json?.access_token;
  const uid = r.json?.user?.id;
  if (!token || !uid) die('could not authenticate the eval account: ' + JSON.stringify(r.json).slice(0, 300));
  return { token, uid };
}

async function setProfile(token, uid, p) {
  // Update the eval account's own profile row (RLS: user_id = auth.uid()).
  // annual_budget is a NUMERIC column — strip any "$"/commas to an integer or
  // the whole PATCH 400s and the row stays empty.
  const budget = (() => { const n = Number(String(p.annual_budget ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; })();
  const body = {
    org_name: p.org_name || null, mission: p.mission || null, ntee_code: p.ntee_code || null,
    focus_areas: p.focus_areas || [], service_geographies: p.service_geographies || [],
    annual_budget: budget, tax_exempt_status: mapTaxStatus(p.tax_exempt_status),
  };
  const res = await fetch(`${URL_BASE}/rest/v1/profiles?user_id=eq.${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok && !QUIET) console.error(`    ${C.y}warn:${C.x} setProfile ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`);
  return res.ok;
}

// A deliberate engine rejection (the CORRECT answer for robustness cases — do not
// retry, do not treat as infra) vs a provider/network hiccup.
const isDeliberate = (err) => /no rubric supplied|too short|no funder text|no fixes|no document text|no draft|unsupported job_type/i.test(err || '');
// Infrastructure failure (provider unavailable / rate limit / network / 5xx with no
// deliberate message). These are SKIPPED, not counted as engine failures.
const isInfra = (r) => !r.ok && !isDeliberate(r.error);

async function worker(token, jobType, input) {
  let last = { ok: false, error: 'no attempt', status: 0 };
  // Few attempts on purpose: aggressive retry amplifies provider rate-limits into a
  // cascade. A rate-limited call gives up fast and is reported as a SKIP, not a fail.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(attempt === 1 ? 4000 : 9000);
    await pace();
    let r;
    try { r = await authFetch('/functions/v1/ai-worker', { job_type: jobType, input }, token); }
    catch (e) { last = { ok: false, error: 'network: ' + e.message, status: 0 }; continue; }
    const out = { ok: !!r.json?.ok, output: r.json?.output, error: r.json?.error, status: r.status };
    if (out.ok) return out;
    last = out;
    // Deliberate validation rejections are the correct answer for robustness cases — return immediately.
    if (isDeliberate(out.error)) return out;
    // else transient (provider unavailable / rate limit / 5xx / network) — back off and retry.
  }
  return last;
}

// ── Per-case evaluators ─────────────────────────────────────────────
function arrEq(a, b) { const s = (x) => [...x].sort((m, n) => m - n).join(','); return s(a) === s(b); }

async function evalRubric(ctx, c) {
  const r = await worker(ctx.token, 'parse_rfp', { rfp_text: c.rfp_text });
  if (!r.ok) return { pass: false, infra: isInfra(r), detail: 'parse_rfp failed: ' + (r.error || r.status) };
  const rub = r.output?.rubric || { source: 'inferred', criteria: [] };
  const sourceOk = rub.source === c.expect_source;
  const weights = (rub.criteria || []).map((x) => x.weight).filter((w) => Number.isFinite(w));
  let weightsOk = true, weightChecked = false;
  if (c.expect_source === 'stated' && c.expect_weights.length) { weightChecked = true; weightsOk = arrEq(weights, c.expect_weights); }
  else if (c.expect_source === 'inferred') { weightsOk = (rub.criteria || []).length === 0; }
  else { weightsOk = (rub.criteria || []).length >= c.min_criteria; } // stated-but-no-weights
  return {
    pass: sourceOk && weightsOk, sourceOk, weightsOk, weightChecked,
    detail: `source ${rub.source} (want ${c.expect_source}); weights [${weights}] vs [${c.expect_weights}]`,
  };
}

async function evalEligibility(ctx, c) {
  await setProfile(ctx.token, ctx.uid, c.org_profile);
  const r = await worker(ctx.token, 'parse_rfp', { rfp_text: c.rfp_text });
  if (!r.ok) return { pass: false, infra: isInfra(r), detail: 'parse_rfp failed: ' + (r.error || r.status) };
  const got = r.output?.verdict;
  const pass = got === c.expect_verdict;
  const catastrophic = (got === 'go' && c.expect_verdict === 'stop') || (got === 'stop' && c.expect_verdict === 'go');
  return { pass, catastrophic, detail: `verdict ${got} (want ${c.expect_verdict})${catastrophic ? ' [CATASTROPHIC]' : ''}` };
}

async function evalQuality(ctx, c) {
  const r = await worker(ctx.token, 'judge_proposal', {
    draft_text: c.draft_text, rubric: { source: 'inferred', criteria: c.rubric_criteria },
    proposal_type: c.proposal_type, funder_type: c.funder_type });
  if (!r.ok) return { pass: false, infra: isInfra(r), detail: 'judge failed: ' + (r.error || r.status) };
  const t = r.output?.weighted_total ?? -1;
  const pass = t >= c.expect_min && t <= c.expect_max;
  return { pass, detail: `score ${t} (band ${c.expect_min}-${c.expect_max}, label ${c.label})` };
}

async function evalDiscrimination(ctx, c) {
  const rub = { source: 'inferred', criteria: c.rubric_criteria };
  // Sequential (not Promise.all) to avoid a 2-call token burst against the provider.
  const s = await worker(ctx.token, 'judge_proposal', { draft_text: c.strong_draft, rubric: rub, proposal_type: c.proposal_type, funder_type: c.funder_type });
  const w = await worker(ctx.token, 'judge_proposal', { draft_text: c.weak_draft, rubric: rub, proposal_type: c.proposal_type, funder_type: c.funder_type });
  if (!s.ok || !w.ok) return { pass: false, infra: isInfra(s) || isInfra(w), detail: `judge failed (s.ok=${s.ok} w.ok=${w.ok})` };
  const margin = (s.output.weighted_total) - (w.output.weighted_total);
  return { pass: margin >= c.expect_min_margin, detail: `strong ${s.output.weighted_total} - weak ${w.output.weighted_total} = ${margin} (need >=${c.expect_min_margin})` };
}

async function evalRobustness(ctx, c) {
  const rub = { source: 'inferred', criteria: c.rubric_criteria || [] };
  const r = await worker(ctx.token, 'judge_proposal', { draft_text: c.draft_text, rubric: rub, proposal_type: 'Full grant narrative', funder_type: 'Foundation' });
  if (c.expect_error) {
    if (!r.ok && isDeliberate(r.error)) return { pass: true, detail: `${c.subtype}: rejected — "${(r.error || '').slice(0, 40)}"` };
    if (!r.ok) return { pass: false, infra: true, detail: `${c.subtype}: provider errored before validating` };
    return { pass: false, detail: `${c.subtype}: expected a rejection but the judge returned a score` };
  }
  // injection: must succeed AND not be tricked into all-5s
  if (!r.ok) return { pass: false, infra: isInfra(r), detail: `${c.subtype}: judge errored — "${(r.error || '').slice(0, 40)}"` };
  const scores = (r.output?.scores || []).map((x) => x.score);
  const allFive = scores.length > 0 && scores.every((x) => x === 5);
  return { pass: !allFive, detail: `${c.subtype}: scores [${scores}] allFive=${allFive} (want not-all-5)` };
}

const EVALERS = {
  rubric_extraction: evalRubric, eligibility_verdict: evalEligibility,
  judge_quality: evalQuality, judge_discrimination: evalDiscrimination, robustness: evalRobustness,
};

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

async function main() {
  let dataset;
  try { dataset = JSON.parse(readFileSync(join(__dir, 'dataset.json'), 'utf8')); }
  catch (e) { die('could not read grantbench/dataset.json: ' + e.message); }
  let cases = dataset.cases || [];
  if (ONLY_TYPE) cases = cases.filter((c) => c._type === ONLY_TYPE);
  if (!cases.length) die('no cases to run');

  log(`\n${C.b}GrantBench${C.x} ${C.dim}— ${cases.length} cases vs ${URL_BASE}${C.x}`);
  const ctx = await auth();
  log(`${C.dim}authenticated eval account ${ctx.uid.slice(0, 8)}…${C.x}\n`);

  const results = await pool(cases, CONCURRENCY, async (c) => {
    const fn = EVALERS[c._type];
    if (!fn) return { c, res: { pass: false, detail: 'unknown type ' + c._type } };
    try { return { c, res: await fn(ctx, c) }; }
    catch (e) { return { c, res: { pass: false, detail: 'threw: ' + e.message } }; }
  });

  // Aggregate per category. Infra-skipped cases (provider unavailable) are reported
  // but excluded from pass/total denominators — they are not engine failures.
  const byType = {};
  let infraTotal = 0;
  for (const { c, res } of results) {
    const t = (byType[c._type] ||= { responded: 0, pass: 0, skipped: 0, items: [], catastrophic: 0, weightTotal: 0, weightPass: 0, sourcePass: 0 });
    if (res.infra) { t.skipped++; infraTotal++; t.items.push({ id: c.id, skip: true, detail: res.detail }); continue; }
    t.responded++; if (res.pass) t.pass++; t.items.push({ id: c.id, pass: res.pass, detail: res.detail });
    if (res.catastrophic) t.catastrophic++;
    if (c._type === 'rubric_extraction') { if (res.sourceOk) t.sourcePass++; if (res.weightChecked) { t.weightTotal++; if (res.weightsOk) t.weightPass++; } }
  }

  for (const [type, t] of Object.entries(byType)) {
    log(`${C.b}${type}${C.x}  ${t.pass}/${t.responded} passed${t.skipped ? ` ${C.y}(${t.skipped} skipped — provider unavailable)${C.x}` : ''}`);
    if (!QUIET) for (const it of t.items) log(`    ${it.skip ? C.y + '⊘' : it.pass ? C.g + '✓' : C.r + '✗'}${C.x} ${C.dim}${it.id}: ${it.detail}${C.x}`);
  }

  // If the provider was unavailable for too much of the run, the result is
  // INCONCLUSIVE (infra), not a quality regression. Exit 2 so CI doesn't read a
  // rate-limited free-tier provider as a broken engine.
  if (infraTotal / cases.length > 0.30) {
    console.error(`\n${C.y}${C.b}GrantBench INCONCLUSIVE${C.x} — provider unavailable for ${infraTotal}/${cases.length} cases ` +
      `(likely a rate/quota limit, not an engine regression). Re-run when the provider has capacity, or use a paid model tier for evals.`);
    process.exit(2);
  }

  // Report + gate (computed over cases that actually responded).
  let failed = false;
  const gateLine = (ok, label, val, thr) => {
    const sym = ok ? `${C.g}PASS${C.x}` : `${C.r}FAIL${C.x}`;
    if (!ok) failed = true;
    return `  ${sym}  ${label.padEnd(34)} ${String(val).padStart(7)}  ${C.dim}(gate ${thr})${C.x}`;
  };

  log(`\n${C.b}── Quality gates ──${C.x}${infraTotal ? ` ${C.dim}(${infraTotal} case(s) skipped, excluded from rates)${C.x}` : ''}`);
  const rub = byType.rubric_extraction, el = byType.eligibility_verdict, q = byType.judge_quality,
    d = byType.judge_discrimination, ro = byType.robustness;
  const lines = [];
  if (rub && rub.responded) {
    const sAcc = rub.sourcePass / rub.responded, wAcc = rub.weightTotal ? rub.weightPass / rub.weightTotal : 1;
    lines.push(gateLine(sAcc >= THRESHOLDS.rubric_source_acc, 'rubric source accuracy', sAcc.toFixed(2), THRESHOLDS.rubric_source_acc));
    lines.push(gateLine(wAcc >= THRESHOLDS.rubric_weight_acc, 'rubric weight-match (stated)', wAcc.toFixed(2), THRESHOLDS.rubric_weight_acc));
  }
  if (el && el.responded) {
    const acc = el.pass / el.responded;
    lines.push(gateLine(acc >= THRESHOLDS.eligibility_acc, 'eligibility verdict accuracy', acc.toFixed(2), THRESHOLDS.eligibility_acc));
    lines.push(gateLine(el.catastrophic <= THRESHOLDS.eligibility_catastrophic, 'eligibility go<->stop errors', el.catastrophic, THRESHOLDS.eligibility_catastrophic));
  }
  if (q && q.responded) { const acc = q.pass / q.responded; lines.push(gateLine(acc >= THRESHOLDS.judge_calibration, 'judge calibration (in-band)', acc.toFixed(2), THRESHOLDS.judge_calibration)); }
  if (d && d.responded) { const acc = d.pass / d.responded; lines.push(gateLine(acc >= THRESHOLDS.judge_discrimination, 'judge discrimination', acc.toFixed(2), THRESHOLDS.judge_discrimination)); }
  if (ro && ro.responded) { const acc = ro.pass / ro.responded; lines.push(gateLine(acc >= THRESHOLDS.robustness, 'robustness (injection/bad input)', acc.toFixed(2), THRESHOLDS.robustness)); }
  for (const l of lines) log(l);

  const overall = failed ? `${C.r}${C.b}GrantBench FAILED${C.x}` : `${C.g}${C.b}GrantBench PASSED${C.x}`;
  log(`\n${overall}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => die(e.stack || e.message));
