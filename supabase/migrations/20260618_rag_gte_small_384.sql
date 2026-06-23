-- RAG voice-grounding: switch document_chunks embeddings from vector(768)
-- (Gemini text-embedding-004) to vector(384) for the key-free Supabase Edge
-- Runtime 'gte-small' embedder. Applied to the live project 2026-06-18 via the
-- Supabase MCP (apply_migration); recorded here for repo parity.
--
-- The table was empty, so the column swap is non-destructive. RLS policies live
-- on the table (not the column) and survive. match_document_chunks takes an
-- untyped `vector` arg, so it needs no change.

drop index if exists public.idx_doc_chunks_embedding;
alter table public.document_chunks drop column if exists embedding;
alter table public.document_chunks add column embedding vector(384);
create index idx_doc_chunks_embedding
  on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
