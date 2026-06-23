// Grange AI — Semantic grant search
//
// Embeds the caller's org mission + focus areas with Gemini, then queries
// pgvector (match_opportunities RPC) to return semantically ranked grants.
// Returns immediately (not queued) so Discovery can show live results.
//
// Secrets: GEMINI_API_KEY (required), SUPABASE_URL / SUPABASE_ANON_KEY (auto).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMBED_MODEL = 'text-embedding-004';
const EMBED_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function embed(text: string): Promise<number[]> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(`${EMBED_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 3000) }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  });
  if (!res.ok) throw new Error(`Embed API error: ${res.status}`);
  const d = await res.json();
  const vec = d?.embedding?.values;
  if (!Array.isArray(vec)) throw new Error('No embedding in response');
  return vec;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  // Optional body overrides
  let query: string | null = null;
  let threshold = 0.35;
  let limit = 25;
  try {
    const b = await req.json();
    if (b.query)     query     = b.query;
    if (b.threshold) threshold = b.threshold;
    if (b.limit)     limit     = Math.min(Number(b.limit), 50);
  } catch { /* no body */ }

  // Build query text from org profile if no explicit query
  if (!query) {
    const { data: profile } = await sb
      .from('profiles')
      .select('org_name, mission, focus_areas, service_geographies, ntee_code, annual_budget')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return json({ error: 'Complete your organization profile first so we can match grants to your mission.' }, 422);
    }

    const parts = [
      profile.mission && `Mission: ${profile.mission}`,
      profile.focus_areas?.length && `Focus areas: ${profile.focus_areas.join(', ')}`,
      profile.service_geographies?.length && `Geographies: ${profile.service_geographies.join(', ')}`,
      profile.ntee_code && `NTEE code: ${profile.ntee_code}`,
      profile.annual_budget && `Annual budget: $${profile.annual_budget}`,
    ].filter(Boolean);

    if (parts.length === 0) {
      return json({ error: 'Add your mission statement to your profile to enable semantic grant matching.' }, 422);
    }
    query = parts.join('\n');
  }

  try {
    const vec = await embed(query);
    const { data: results, error: rpcErr } = await sb.rpc('match_opportunities', {
      query_embedding: vec,
      match_threshold: threshold,
      match_count: limit,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return json({ ok: true, results: results ?? [], query_text: query });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 502);
  }
});
