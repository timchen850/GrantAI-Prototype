-- Grange AI — Option 1C: license-split of the exemplar library.
-- Applied to the live project 2026-09-06 via the Supabase MCP; recorded here for
-- repo parity.
--
-- Every exemplar chunk is either:
--   'ingestable' — public-domain / permissive-CC text, safe to embed and feed the
--                  generative writer path (exemplar-search -> generate()).
--   'reference'  — EDUCATIONAL_ONLY pointers (IMLS/NEH etc.): shown to the user as
--                  reference beside the draft, NEVER embedded, NEVER fed to the
--                  model. Stored as a neutral description + source link, no
--                  copyrighted narrative text.

alter table public.exemplar_chunks
  add column if not exists usage      text not null default 'ingestable'
    check (usage in ('ingestable','reference')),
  add column if not exists source_url text;

-- The generative retrieval RPC must ONLY ever return ingestable rows. (Reference
-- rows also have embedding IS NULL, so this is belt-and-suspenders.)
drop function if exists public.match_exemplar_chunks(vector, int, text, text);
create function public.match_exemplar_chunks(
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
  license     text,
  attribution text,
  source_url  text,
  content     text,
  similarity  double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  select ec.id, ec.exemplar_id, ec.title, ec.funder_type, ec.sector,
         ec.award_band, ec.funder_name, ec.year_won, ec.section,
         ec.license, ec.attribution, ec.source_url, ec.content,
         1 - (ec.embedding <=> query_embedding) as similarity
  from public.exemplar_chunks ec
  where ec.embedding is not null
    and ec.usage = 'ingestable'
    and (filter_funder_type is null or ec.funder_type = filter_funder_type)
    and (filter_award_band  is null or ec.award_band  = filter_award_band)
  order by ec.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function public.match_exemplar_chunks(vector, int, text, text)
  to authenticated, service_role;

create index if not exists idx_exemplar_chunks_usage_type
  on public.exemplar_chunks (usage, funder_type);
