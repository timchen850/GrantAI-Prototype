// Grange AI — RAG search (voice-grounding retrieval)
// Embeds a query with the built-in key-free 'gte-small' model and returns the
// user's most similar past-proposal chunks via match_document_chunks (RLS-scoped
// to the caller, so a user can only ever retrieve their OWN writing).
// Body: { query: string, match_count?: number, filter_kind?: string }

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
  const matchCount = Math.min(Math.max(parseInt(body?.match_count, 10) || 6, 1), 12);
  const filterKind = body?.filter_kind ? String(body.filter_kind).slice(0, 40) : null;
  // gte-small has a high baseline cosine (unrelated text ~0.65-0.71), so the
  // meaningful "this is genuinely relevant" floor sits around 0.72.
  const minSim = typeof body?.min_similarity === 'number' ? body.min_similarity : 0.72;
  if (!query.trim()) return json({ chunks: [] });

  let session: any;
  try { session = new (globalThis as any).Supabase.ai.Session('gte-small'); }
  catch (e) { return json({ chunks: [], error: 'Embedding model unavailable: ' + (e instanceof Error ? e.message : String(e)) }); }

  let emb: number[];
  try { emb = Array.from(await session.run(query, { mean_pool: true, normalize: true })); }
  catch (e) { return json({ chunks: [], error: 'Embedding failed: ' + (e instanceof Error ? e.message : String(e)) }); }

  const { data, error } = await sb.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(emb), match_count: matchCount, filter_kind: filterKind,
  });
  if (error) return json({ chunks: [], error: error.message });

  // drop weak matches so the writer is never grounded in irrelevant text
  const chunks = (data || [])
    .filter((d: any) => (d.similarity ?? 0) >= minSim)
    .map((d: any) => ({ content: d.content, source_kind: d.source_kind, similarity: Math.round((d.similarity ?? 0) * 100) / 100 }));
  return json({ chunks });
});
