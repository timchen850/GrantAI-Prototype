// Grange AI — Funded-Exemplar Library ingest (report rec #8 / Pain Point 2)
//
// Ingests an excerpt from a proposal that WON a grant into the SHARED exemplar
// store (public.exemplar_chunks). Unlike rag-ingest (the user's PRIVATE,
// RLS-scoped past-proposal store), this writes with the SERVICE_ROLE key so the
// rows are shared / not user-owned, and every authenticated user can later
// retrieve them as few-shot anchors.
//
// ADMIN-GATED: only an allowlisted admin email may ingest (curated corpus).
// Set EXEMPLAR_ADMIN_EMAILS (comma-separated) in Edge Function secrets to
// override the default. Embeds each chunk with the key-free 'gte-small' model
// (384-dim), the same embedder as the rest of the RAG stack.
//
// Body: {
//   text: string,                         // full proposal text (or use `sections`)
//   sections?: { section: string, text: string }[],  // optional per-section split
//   funder_name?: string,
//   funder_type?: 'Federal'|'Foundation'|'Corporate'|'State',
//   sector?: string,
//   award_band?: '<50k'|'50-150k'|'150-500k'|'500k+',
//   award_amount?: number,                // if given, award_band is derived
//   year_won?: number,
//   title?: string,                       // human label; auto-derived if omitted
//   section?: string,                     // section label when not using `sections`
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Same chunker as rag-ingest: overlapping chunks on natural (paragraph) boundaries.
function chunkText(text: string, size = 1100, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (buf && (buf + '\n\n' + p).length > size) { chunks.push(buf); buf = ''; }
    if (p.length > size) {
      if (buf) { chunks.push(buf); buf = ''; }
      let i = 0;
      while (i < p.length) { chunks.push(p.slice(i, i + size)); i += (size - overlap); }
      continue;
    }
    buf = buf ? buf + '\n\n' + p : p;
  }
  if (buf) chunks.push(buf);
  return chunks.slice(0, 80); // safety cap per section
}

const FUNDER_TYPES = ['Federal', 'Foundation', 'Corporate', 'State'];
function normFunderType(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return FUNDER_TYPES.find((t) => t.toLowerCase() === s) || null;
}
function bandFromAmount(amt: number): string {
  if (amt < 50000) return '<50k';
  if (amt < 150000) return '50-150k';
  if (amt < 500000) return '150-500k';
  return '500k+';
}
const BANDS = ['<50k', '50-150k', '150-500k', '500k+'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  // Admin gate — curated shared corpus, only an allowlisted email may write.
  const admins = (Deno.env.get('EXEMPLAR_ADMIN_EMAILS') || 'tchen8108@gmail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    return json({ error: 'Forbidden — exemplar ingest is admin-only.' }, 403);
  }

  let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Build the list of (section, text) units to ingest.
  const units: { section: string | null; text: string }[] = [];
  if (Array.isArray(body?.sections) && body.sections.length) {
    for (const s of body.sections) {
      const t = (s?.text || '').toString();
      if (t.trim().length >= 40) units.push({ section: s?.section ? String(s.section).slice(0, 120) : null, text: t });
    }
  } else {
    const t = (body?.text || '').toString();
    if (t.trim().length >= 80) units.push({ section: body?.section ? String(body.section).slice(0, 120) : null, text: t });
  }
  if (!units.length) return json({ error: 'Please provide `text` (≥ a paragraph) or a non-empty `sections` array.' }, 400);

  const funder_type = normFunderType(body?.funder_type);
  const sector = body?.sector ? String(body.sector).slice(0, 160) : null;
  const funder_name = body?.funder_name ? String(body.funder_name).slice(0, 200) : null;
  const year_won = Number.isFinite(+body?.year_won) ? Math.trunc(+body.year_won) : null;
  let award_band: string | null = null;
  if (body?.award_band && BANDS.includes(String(body.award_band))) award_band = String(body.award_band);
  else if (Number.isFinite(+body?.award_amount)) award_band = bandFromAmount(+body.award_amount);
  const title = (body?.title ? String(body.title)
    : [funder_name || funder_type, year_won, sector].filter(Boolean).join(' — ')).slice(0, 200) || null;

  // built-in, key-free embedder (runs locally in the edge runtime)
  let session: any;
  try { session = new (globalThis as any).Supabase.ai.Session('gte-small'); }
  catch (e) { return json({ error: 'Embedding model unavailable: ' + (e instanceof Error ? e.message : String(e)) }, 502); }

  // Service-role client => rows are shared (not user-owned); bypasses RLS.
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const exemplar_id = crypto.randomUUID();

  try {
    const rows: any[] = [];
    let ci = 0;
    for (const u of units) {
      const chunks = chunkText(u.text);
      for (const c of chunks) {
        const emb = await session.run(c, { mean_pool: true, normalize: true });
        rows.push({
          exemplar_id, title, funder_type, sector, award_band, funder_name, year_won,
          section: u.section, chunk_index: ci++, content: c,
          embedding: JSON.stringify(Array.from(emb)),
        });
      }
    }
    if (!rows.length) return json({ error: 'No usable text found.' }, 400);
    const { error: cerr } = await sbAdmin.from('exemplar_chunks').insert(rows);
    if (cerr) throw new Error(cerr.message);
    return json({ ok: true, exemplar_id, title, funder_type, sector, award_band, funder_name, year_won, chunks: rows.length });
  } catch (e) {
    // roll back partial insert for this exemplar_id
    await sbAdmin.from('exemplar_chunks').delete().eq('exemplar_id', exemplar_id);
    return json({ error: 'Could not store exemplar: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
