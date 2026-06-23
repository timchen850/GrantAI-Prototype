-- Grange AI — grant discovery (pgvector) + application questions (2026-06-22)
--
-- Adds:
--   1. pgvector extension + embedding column on opportunities
--   2. match_opportunities() RPC for semantic similarity search
--   3. grant_questions table — application questions per opportunity
--   4. grant_answers table — user's answers (AI draft or manual)
--
-- Requires: pgvector extension available in Supabase (enable in Dashboard →
--   Database → Extensions → vector, or via the line below).

-- ── 1. pgvector ──────────────────────────────────────────────────────────────
create extension if not exists vector;

-- 768-dim column for Gemini text-embedding-004
alter table public.opportunities
  add column if not exists embedding vector(768);

-- IVFFlat index — cosine distance, 100 lists works well up to ~1M rows
create index if not exists idx_opportunities_embedding
  on public.opportunities
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── 2. Semantic search RPC ───────────────────────────────────────────────────
create or replace function public.match_opportunities(
  query_embedding vector(768),
  match_threshold float  default 0.35,
  match_count     int    default 25
)
returns table (
  id           uuid,
  title        text,
  funder_name  text,
  description  text,
  award_ceiling numeric,
  deadline     date,
  focus_areas  text[],
  geographies  text[],
  source       text,
  source_url   text,
  similarity   float
)
language sql stable security definer
set search_path = public
as $$
  select
    o.id,
    o.title,
    f.name              as funder_name,
    o.description,
    o.award_ceiling,
    o.deadline::date,
    o.focus_areas,
    o.geographies,
    o.source,
    o.source_url,
    1 - (o.embedding <=> query_embedding) as similarity
  from   public.opportunities o
  left join public.funders f on f.id = o.funder_id
  where  o.embedding is not null
    and  1 - (o.embedding <=> query_embedding) > match_threshold
  order by o.embedding <=> query_embedding
  limit  match_count;
$$;

-- ── 3. Grant application questions ───────────────────────────────────────────
create table if not exists public.grant_questions (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  question_text  text not null,
  question_order int  not null default 0,
  word_limit     int,
  is_essay       boolean not null default true,
  hint           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_grant_questions_opp
  on public.grant_questions(opportunity_id);

alter table public.grant_questions enable row level security;

drop policy if exists "read all"       on public.grant_questions;
drop policy if exists "service insert" on public.grant_questions;
drop policy if exists "service update" on public.grant_questions;

create policy "read all"       on public.grant_questions for select to authenticated using (true);
create policy "service insert" on public.grant_questions for insert to service_role with check (true);
create policy "service update" on public.grant_questions for update to service_role using (true);

-- ── 4. Grant application answers ─────────────────────────────────────────────
create table if not exists public.grant_answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  grant_id     uuid not null references public.grants(id) on delete cascade,
  question_id  uuid not null references public.grant_questions(id) on delete cascade,
  answer_text  text,
  status       text not null default 'empty'
               check (status in ('empty','ai_draft','edited','final')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, grant_id, question_id)
);

alter table public.grant_answers enable row level security;

drop policy if exists "own rows select" on public.grant_answers;
drop policy if exists "own rows insert" on public.grant_answers;
drop policy if exists "own rows update" on public.grant_answers;
drop policy if exists "own rows delete" on public.grant_answers;

create policy "own rows select" on public.grant_answers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.grant_answers
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows update" on public.grant_answers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.grant_answers
  for delete to authenticated using (user_id = (select auth.uid()));

drop trigger if exists trg_grant_answers_updated on public.grant_answers;
create trigger trg_grant_answers_updated
  before update on public.grant_answers
  for each row execute function public.set_updated_at();
