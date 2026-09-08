-- Grange AI — exemplar library provenance (NIH-alignment guardrail).
-- Applied to the live project 2026-09-06 via the Supabase MCP; recorded here for
-- repo parity.
--
-- The corpus research (deep-research report) is emphatic that a federal agency
-- POSTING a grantee's narrative "as a sample" does NOT place it in the public
-- domain — the authoring nonprofit retains copyright. So only genuinely
-- license-clean sources (Public Domain, or permissive CC like ogrants.org's
-- CC BY 4.0 proposal files) may be ingested, and CC BY REQUIRES attribution.
-- Every chunk therefore carries its license + attribution.

alter table public.exemplar_chunks add column if not exists license     text;
alter table public.exemplar_chunks add column if not exists attribution text;

-- Recreate the search RPC to surface license + attribution (return signature
-- changes, so drop first).
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
  content     text,
  similarity  double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  select ec.id, ec.exemplar_id, ec.title, ec.funder_type, ec.sector,
         ec.award_band, ec.funder_name, ec.year_won, ec.section,
         ec.license, ec.attribution, ec.content,
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
