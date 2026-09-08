// Grange AI — discover-grants
// Server-side Grants.gov search2 aggregator. The browser is CORS-blocked from
// calling api.grants.gov directly (every client call silently failed, leaving
// users with only the curated list) — so we proxy it here and, while we're at
// it, fire SEVERAL targeted queries and union them for far higher recall than a
// single jammed-keyword query. Returns raw oppHits (the client maps them) each
// annotated with grangeFocus = the focus area(s) whose query surfaced it.
// DETERMINISTIC (no LLM). Body: { focus_areas[], primary_programs[], mission }.
// Auth: own (verify_jwt=false).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const GOV = 'https://api.grants.gov/v1/api/search2';

async function govQuery(term: string, extra?: Record<string, unknown>): Promise<any[]> {
  const body: Record<string, unknown> = Object.assign({ rows: 60, startRecordNum: 0, oppStatuses: 'forecasted|posted' }, extra || {});
  const t = (term || '').toString().trim().slice(0, 60);
  if (t) body.keyword = t;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(GOV, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d?.data?.oppHits) ? d.data.oppHits : [];
  } catch (_) { return []; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const fa = (Array.isArray(body?.focus_areas) ? body.focus_areas : []).map((x: any) => (x || '').toString().trim()).filter(Boolean);
  const programs = (Array.isArray(body?.primary_programs) ? body.primary_programs : []).map((x: any) => (x || '').toString().trim()).filter(Boolean);
  const mission = (body?.mission || '').toString();
  const missionKw = mission.split(/\W+/).filter((w: string) => w.length > 5).slice(0, 3);

  // Entity type decides which eligibility sweeps run. Registered nonprofits (and
  // fiscal sponsees, who apply under a sponsor's exemption) get the 501(c)(3)
  // sweep; everyone else gets the non-nonprofit-friendly sweeps. Everyone always
  // gets the "unrestricted" sweep. Each eligibility sweep tags its hits so the
  // UI can say WHY a grant is shown. Grants.gov applicant-eligibility codes.
  const status = (body?.tax_exempt_status || '').toString().trim().toLowerCase();
  const isNonprofit = ['501c3', '501c4', '501c6', 'fiscal_sponsorship'].includes(status);
  const ELIG: Record<string, string> = {
    '12': '501(c)(3) eligible',
    '13': 'No 501(c)(3) required',
    '21': 'Open to individuals',
    '22': 'Open to for-profits',
    '23': 'Open to small business',
    '25': 'See eligibility',
    '99': 'Open to any applicant',
  };
  const eligCodes = isNonprofit ? ['12', '99'] : ['13', '22', '23', '25', '99'];

  // Up to 6 distinct topical term queries (focus areas carry their focus tag).
  const terms: { k: string; tag: string | null }[] = [];
  const seen = new Set<string>();
  const add = (t: string, tag: string | null) => {
    const k = (t || '').toString().trim(), low = k.toLowerCase();
    if (k.length > 2 && !seen.has(low) && terms.length < 6) { seen.add(low); terms.push({ k, tag }); }
  };
  fa.forEach((f: string) => add(f, f));
  programs.forEach((p: string) => add(p, null));
  missionKw.forEach((m: string) => add(m, null));

  type Hit = { h: any; tag: string | null; elig: string | null };
  const queries: Promise<Hit[]>[] = terms.map(t =>
    govQuery(t.k).then(hits => hits.map(h => ({ h, tag: t.tag, elig: null }))));
  if (!queries.length) queries.push(govQuery('community').then(hits => hits.map(h => ({ h, tag: null, elig: null }))));
  // eligibility sweeps for this entity type — each tags its hits with WHY eligible
  for (const code of eligCodes) {
    queries.push(govQuery('', { eligibilities: code }).then(hits => hits.map(h => ({ h, tag: null, elig: ELIG[code] || null }))));
  }

  const results = await Promise.all(queries);
  const byId: Record<string, any> = {};
  const out: any[] = [];
  let totalRaw = 0;
  for (const arr of results) {
    for (const { h, tag, elig } of arr) {
      totalRaw++;
      const id = h?.id || h?.number;
      if (!id) continue;
      if (byId[id]) {
        if (tag && !byId[id].grangeFocus.includes(tag)) byId[id].grangeFocus.push(tag);
        if (elig && !byId[id].eligTags.includes(elig)) byId[id].eligTags.push(elig);
      } else {
        h.grangeFocus = tag ? [tag] : [];
        h.eligTags = elig ? [elig] : [];
        byId[id] = h; out.push(h);
      }
    }
  }

  return json({ ok: true, output: { hits: out.slice(0, 120), distinct: out.length, total_raw: totalRaw, queries: queries.length, entity: isNonprofit ? 'nonprofit' : 'non_nonprofit' } });
});
