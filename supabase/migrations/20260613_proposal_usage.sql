-- Per-user daily proposal generation quota
create table if not exists proposal_usage (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  used_on   date not null default current_date,
  count     integer not null default 0,
  unique (user_id, used_on)
);

alter table proposal_usage enable row level security;

-- Users can only see and update their own rows (the Edge Function uses the
-- user's JWT so RLS applies automatically).
create policy "own rows only"
  on proposal_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
