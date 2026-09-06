-- Grange AI — outcome feedback loop (the compounding "training" lever).
-- Applied to the live project 2026-09-05 via the Supabase MCP (apply_migration);
-- recorded here for repo parity.
--
-- Per-user win/loss capture on generated drafts: over time this both measures the
-- product's real success rate AND lets WON drafts (with consent) be promoted into
-- the shared funded-exemplar library, so retrieval improves where we win.

create table if not exists public.draft_outcomes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  draft_uid            text not null,        -- client-generated, ties to the localStorage draft
  grant_id             uuid,                 -- optional; no FK (generator grants are often transient)
  program              text,
  funder_name          text,
  funder_type          text,
  sector               text,
  award_amount         numeric,
  award_band           text,
  proposal_type        text,
  status               text not null default 'submitted'
                         check (status in ('submitted','won','lost','pending')),
  decided_at           timestamptz,
  share_consent        boolean not null default false,  -- user OK to use the won draft as an exemplar
  promoted_exemplar_id uuid,                 -- set once ingested into exemplar_chunks
  draft_text           text,                 -- snapshot, so a won draft can be promoted later
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, draft_uid)
);

alter table public.draft_outcomes enable row level security;

drop policy if exists "own outcomes select" on public.draft_outcomes;
drop policy if exists "own outcomes insert" on public.draft_outcomes;
drop policy if exists "own outcomes update" on public.draft_outcomes;
drop policy if exists "own outcomes delete" on public.draft_outcomes;
create policy "own outcomes select" on public.draft_outcomes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own outcomes insert" on public.draft_outcomes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own outcomes update" on public.draft_outcomes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own outcomes delete" on public.draft_outcomes
  for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists idx_draft_outcomes_user_status
  on public.draft_outcomes (user_id, status);

drop trigger if exists trg_draft_outcomes_updated on public.draft_outcomes;
create trigger trg_draft_outcomes_updated
  before update on public.draft_outcomes
  for each row execute function public.set_updated_at();
