// Grange AI — Funded-Exemplar Library search (report rec #8 / Pain Point 2)
//
// Embeds a query with the key-free 'gte-small' model and returns the closest
// excerpts from the SHARED funded-exemplar store (public.exemplar_chunks) via
// match_exemplar_chunks. NOT user-scoped — every authenticated user retrieves
// from the same curated corpus of proposals that WON similar grants, to use as
// few-shot anchors at draft time.
//
// Body: {
//   query: string,
//   match_count?: number,          // default 4, clamped 1..8
//   filter_funder_type?: string,   // 'Federal'|'Foundation'|'Corporate'|'State'
//   filter_award_band?: string,    // '<50k'|'50-150k'|'150-500k'|'500k+'
//   min_similarity?: number,       // cosine floor, default 0.82 (exemplar-tuned; see below)
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const query = (body?.query || '').toString().slice(0, 4000);
  const matchCount = Math.min(Math.max(parseInt(body?.match_count, 10) || 4, 1), 8);
  const filterFunderType = body?.filter_funder_type ? String(body.filter_funder_type).slice(0, 40) : null;
  const filterAwardBand = body?.filter_award_band ? String(body.filter_award_band).slice(0, 40) : null;
  // gte-small has a high baseline cosine, and grant proposals share so much
  // boilerplate vocabulary that even off-topic proposals score ~0.78-0.81. The
  // floor for EXEMPLARS (cross-org, cross-topic winning text) therefore sits
  // higher than the 0.72 used for the user's own same-voice past writing:
  // verified against real EPA narrative embeddings, related ~0.87-0.89 vs
  // unrelated ~0.78-0.81, so 0.82 separates them. Tunable via min_similarity;
  // revisit as the corpus grows more sector-diverse.
  const minSim = typeof body?.min_similarity === 'number' ? body.min_similarity : 0.82;
  if (!query.trim()) return json({ chunks: [] });

  let session: any;
  try { session = new (globalThis as any).Supabase.ai.Session('gte-small'); }
  catch (e) { return json({ chunks: [], error: 'Embedding model unavailable: ' + (e instanceof Error ? e.message : String(e)) }); }

  let emb: number[];
  try { emb = Array.from(await session.run(query, { mean_pool: true, normalize: true })); }
  catch (e) { return json({ chunks: [], error: 'Embedding failed: ' + (e instanceof Error ? e.message : String(e)) }); }

  const { data, error } = await sb.rpc('match_exemplar_chunks', {
    query_embedding: JSON.stringify(emb),
    match_count: matchCount,
    filter_funder_type: filterFunderType,
    filter_award_band: filterAwardBand,
  });
  if (error) return json({ chunks: [], error: error.message });

  const chunks = (data || [])
    .filter((d: any) => (d.similarity ?? 0) >= minSim)
    .map((d: any) => ({
      content: d.content,
      title: d.title,
      section: d.section,
      funder_name: d.funder_name,
      funder_type: d.funder_type,
      sector: d.sector,
      award_band: d.award_band,
      year_won: d.year_won,
      license: d.license,
      attribution: d.attribution,
      similarity: Math.round((d.similarity ?? 0) * 100) / 100,
    }));
  return json({ chunks });
});
