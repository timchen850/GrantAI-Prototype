// Grange AI — grant-detail
// Grants.gov search2 returns only index records (no award size or description),
// so after discovery renders we enrich the TOP cards with real detail via
// fetchOpportunity (server-side; the browser is CORS-blocked from grants.gov).
// DETERMINISTIC (no LLM). Body: { ids: string[] } (numeric Grants.gov opp ids).
// Auth: own (verify_jwt=false).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const GOV = 'https://api.grants.gov/v1/api/fetchOpportunity';

// Strip tags + decode the common HTML entities Grants.gov emits (&amp; LAST so we
// never double-decode). Rendered via textContent client-side, so this is display
// quality, not safety.
function cleanText(str: unknown, max: number): string {
  return String(str || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

async function detail(id: string): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(GOV, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ opportunityId: Number(id) }), signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const d = await r.json();
    const s = (d && d.data && d.data.synopsis) || {};
    const desc = cleanText(s.synopsisDesc, 420);
    const eligDesc = cleanText(s.applicantEligibilityDesc, 240);
    const numAwards = (s.numberOfAwards != null && s.numberOfAwards !== '') ? String(s.numberOfAwards).slice(0, 24) : null;
    const cs = s.costSharing;
    const costShareRequired = cs === true || String(cs).toLowerCase() === 'yes' || String(cs).toLowerCase() === 'true';
    return {
      awardCeiling: Number(s.awardCeiling) || 0,
      awardFloor: Number(s.awardFloor) || 0,
      estimatedFunding: Number(s.estimatedFunding) || 0,
      numberOfAwards: numAwards,
      costShareRequired,
      desc,
      eligibility: eligDesc || null,
    };
  } catch (_) { return null; }
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

  const ids = [...new Set((Array.isArray(body?.ids) ? body.ids : [])
    .map((x: any) => (x || '').toString().replace(/\D/g, ''))
    .filter(Boolean))].slice(0, 15) as string[];
  if (!ids.length) return json({ ok: true, output: { details: {} } });

  const results = await Promise.all(ids.map(id => detail(id).then(v => ({ id, v }))));
  const details: Record<string, any> = {};
  for (const { id, v } of results) if (v) details[id] = v;

  return json({ ok: true, output: { details, requested: ids.length, resolved: Object.keys(details).length } });
});
