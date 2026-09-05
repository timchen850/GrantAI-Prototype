-- Grange AI — Funded-Exemplar Library (report rec #8 / Pain Point 2)
-- Applied to the live project 2026-09-05 via the Supabase MCP (apply_migration);
-- recorded here for repo parity.
--
-- A SHARED, curated corpus of excerpts from proposals that WON grants, retrieved
-- as few-shot anchors at draft time. Distinct from public.document_chunks, which
-- is the user's PRIVATE, RLS-scoped past-proposal store. This store is readable by
-- any authenticated user; writes happen only via the service_role (exemplar-ingest).
--
-- Embeddings: key-free Supabase Edge Runtime 'gte-small' (384-dim), same as the
-- existing RAG. The `vector` type lives in the extensions schema.

create table if not exists public.exemplar_chunks (
  id           bigserial primary key,
  exemplar_id  uuid not null default gen_random_uuid(),  -- one value per ingested proposal
  title        text,             -- human label, e.g. 'Weingart 2024 — Youth education'
  funder_type  text,             -- 'Federal' | 'Foundation' | 'Corporate' | 'State'
  sector       text,             -- e.g. 'Youth education', or NTEE
  award_band   text,             -- '<50k' | '50-150k' | '150-500k' | '500k+'
  funder_name  text,
  year_won     int,
  section      text,             -- which proposal section this chunk is from
  chunk_index  int,
  content      text not null,
  embedding    vector(384),
  created_at   timestamptz not null default now()
);

alter table public.exemplar_chunks enable row level security;

-- Shared read for any authenticated user; NO insert/update/delete policy for
-- authenticated => they cannot write. service_role bypasses RLS, so the
-- admin-gated exemplar-ingest edge fn (service key) is the only writer.
drop policy if exists "read exemplars" on public.exemplar_chunks;
create policy "read exemplars" on public.exemplar_chunks
  for select to authenticated using (true);

-- IVFFlat cosine index, matching the document_chunks pattern.
create index if not exists idx_exemplar_chunks_embedding
  on public.exemplar_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Cheap btree to help the funder_type / award_band filters.
create index if not exists idx_exemplar_chunks_filters
  on public.exemplar_chunks (funder_type, award_band);

-- Similarity search over the shared store. NOT user-scoped. SECURITY DEFINER +
-- locked search_path so the `vector` operators resolve regardless of caller path.
create or replace function public.match_exemplar_chunks(
  query_embedding    vector,
  match_count        int  default 4,
  filter_funder_type text default null,
  filter_award_band  text default null
)
returns table (
  id          bigint,
  exemplar_id uuid,
  title       text,
  funder_type text,
  sector      text,
  award_band  text,
  funder_name text,
  year_won    int,
  section     text,
  content     text,
  similarity  double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  select ec.id, ec.exemplar_id, ec.title, ec.funder_type, ec.sector,
         ec.award_band, ec.funder_name, ec.year_won, ec.section, ec.content,
         1 - (ec.embedding <=> query_embedding) as similarity
  from public.exemplar_chunks ec
  where ec.embedding is not null
    and (filter_funder_type is null or ec.funder_type = filter_funder_type)
    and (filter_award_band  is null or ec.award_band  = filter_award_band)
  order by ec.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function public.match_exemplar_chunks(vector, int, text, text)
  to authenticated, service_role;
