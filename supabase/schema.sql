-- ════════════════════════════════════════════════════════════════════
-- Grange AI — database schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Safe to re-run: every statement is idempotent.
--
-- Design notes:
--   • Every table carries user_id (FK -> auth.users) and has RLS ON with a
--     `user_id = auth.uid()` policy, so a user can only ever touch their
--     own rows — enforced by Postgres, not by the client.
--   • A trigger auto-creates a profiles row the moment a user signs up.
--   • grants / proposals are STUBS for now (prototype) but real tables.
-- ════════════════════════════════════════════════════════════════════

-- ─── PROFILES ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  org_name            text,
  ein                 text,
  mission             text,
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── ONBOARDING ANSWERS ─────────────────────────────────────────────
-- One row per (user, question). `answer` is jsonb so multi-selects
-- (focus areas, funding types) and scalars both fit. Upsert on the
-- unique pair to let users revise answers.
create table if not exists public.onboarding_answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_key text not null,
  answer       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, question_key)
);

-- ─── GRANTS (stub) ──────────────────────────────────────────────────
create table if not exists public.grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  funder     text,
  amount     text,
  deadline   date,
  status     text not null default 'discovered',  -- discovered|saved|drafting|submitted|awarded|rejected
  created_at timestamptz not null default now()
);

-- ─── PROPOSALS (stub) ───────────────────────────────────────────────
create table if not exists public.proposals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  grant_id   uuid references public.grants(id) on delete set null,
  content    text,
  status     text not null default 'draft',  -- draft|in_review|final|submitted
  created_at timestamptz not null default now()
);

-- ─── DOCUMENTS (metadata for uploads in Storage) ────────────────────
create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text,        -- '990' | 'program_summary' | 'determination_letter' | ...
  file_path  text,        -- path inside the `documents` storage bucket
  file_name  text,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles           enable row level security;
alter table public.onboarding_answers enable row level security;
alter table public.grants             enable row level security;
alter table public.proposals          enable row level security;
alter table public.documents          enable row level security;

-- One self-access policy per table. Dropped-then-created so re-runs are clean.
do $$
declare t text;
begin
  foreach t in array array['profiles','onboarding_answers','grants','proposals','documents']
  loop
    execute format('drop policy if exists "own rows select" on public.%I;', t);
    execute format('drop policy if exists "own rows insert" on public.%I;', t);
    execute format('drop policy if exists "own rows update" on public.%I;', t);
    execute format('drop policy if exists "own rows delete" on public.%I;', t);

    execute format($f$create policy "own rows select" on public.%I
      for select to authenticated using (auth.uid() = user_id);$f$, t);
    execute format($f$create policy "own rows insert" on public.%I
      for insert to authenticated with check (auth.uid() = user_id);$f$, t);
    execute format($f$create policy "own rows update" on public.%I
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);$f$, t);
    execute format($f$create policy "own rows delete" on public.%I
      for delete to authenticated using (auth.uid() = user_id);$f$, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- Reads org_name from the signup metadata if the client passed it.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, org_name, contact_name, contact_email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'org_name',
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.email
  )
  on conflict (user_id) do update
    set
      contact_name  = coalesce(excluded.contact_name,  profiles.contact_name),
      contact_email = coalesce(excluded.contact_email, profiles.contact_email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── keep updated_at fresh on profiles / onboarding_answers ─────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists onboarding_touch on public.onboarding_answers;
create trigger onboarding_touch before update on public.onboarding_answers
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- STORAGE: private `documents` bucket + per-user folder isolation
-- Files are stored under `<user_id>/<filename>`; the policy checks that
-- the first path segment equals the caller's uid.
-- ════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "own files all" on storage.objects;
create policy "own files all" on storage.objects
  for all to authenticated
  using      (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
