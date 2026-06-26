// Grange AI — RAG ingest (voice-grounding)
// Takes a past proposal / writing sample, chunks it, embeds each chunk with the
// built-in key-free Supabase Edge Runtime 'gte-small' model (384-dim), and stores
// the chunks (RLS-scoped to the user) so the writer can later ground drafts in
// the org's own voice. NO external API key, NO training on user data.
// Body: { text: string, label?: string, kind?: string, file_name?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Split text into overlapping chunks on natural (paragraph) boundaries.
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
  return chunks.slice(0, 80); // safety cap per document
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  // RAG is a Pro-only feature
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: prof } = await sbAdmin.from('profiles').select('tier').eq('user_id', user.id).maybeSingle();
  if ((prof?.tier as string) !== 'pro') {
    return json({ error: 'RAG (Past Proposals) is a Pro plan feature. Upgrade to unlock it.' }, 403);
  }

  let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const text = (body?.text || '').toString();
  const label = (body?.label || 'Past proposal').toString().slice(0, 200);
  const kind = (body?.kind || 'past_proposal').toString().slice(0, 40);
  const fileName = body?.file_name ? String(body.file_name).slice(0, 200) : null;
  if (text.trim().length < 80) return json({ error: 'Please add at least a paragraph of text.' }, 400);

  const chunks = chunkText(text);
  if (!chunks.length) return json({ error: 'No usable text found.' }, 400);

  // built-in, key-free embedder (runs locally in the edge runtime)
  let session: any;
  try { session = new (globalThis as any).Supabase.ai.Session('gte-small'); }
  catch (e) { return json({ error: 'Embedding model unavailable: ' + (e instanceof Error ? e.message : String(e)) }, 502); }

  // record the source document first
  const { data: doc, error: derr } = await sb.from('documents')
    .insert({ user_id: user.id, kind, label, file_name: fileName, mime_type: 'text/plain', size_bytes: text.length, extracted: true })
    .select('id').single();
  if (derr || !doc) return json({ error: 'Could not save the document: ' + (derr?.message || '') }, 500);

  try {
    const rows: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const emb = await session.run(chunks[i], { mean_pool: true, normalize: true });
      rows.push({ user_id: user.id, document_id: doc.id, source_kind: kind, chunk_index: i, content: chunks[i], embedding: JSON.stringify(Array.from(emb)), token_count: Math.round(chunks[i].length / 4) });
    }
    const { error: cerr } = await sb.from('document_chunks').insert(rows);
    if (cerr) throw new Error(cerr.message);
    return json({ ok: true, document_id: doc.id, label, chunks: rows.length });
  } catch (e) {
    // roll back the orphan document row if embedding/storing failed
    await sb.from('document_chunks').delete().eq('document_id', doc.id);
    await sb.from('documents').delete().eq('id', doc.id);
    return json({ error: 'Could not store embeddings: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
