-- ════════════════════════════════════════════════════════════════════
-- Grange AI — full backend build (2026-06-12)
-- Consolidated archive of migrations M1–M9, applied to the live project
-- (xewrvmqyzeiziimcmenj) via the Supabase MCP and tracked in
-- supabase_migrations.schema_migrations under these names:
--   helpers_profiles_rls_upgrade, catalog_funders_opportunities,
--   pipeline_matching_eligibility, registrations_sam_gov,
--   proposals_budgets_logic_format, deadlines_reporting_infra,
--   seed_reference_data, lockdown_trigger_functions, fk_covering_indexes
--
-- Runs on top of schema.sql (v1 base: profiles, onboarding_answers,
-- grants, proposals, documents). Idempotent: safe to re-run.
-- Feature-by-feature rationale: see ../BACKEND.md
-- ════════════════════════════════════════════════════════════════════

-- ════ M1: helpers, extended org profile, RLS hardening ════

create or replace function public.set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

alter table public.profiles
  add column if not exists ntee_code           text,
  add column if not exists tax_exempt_status   text default 'unknown'
    check (tax_exempt_status in ('unknown','501c3_pending','501c3','501c4','501c6','fiscal_sponsorship','government','tribal','other')),
  add column if not exists founded_year        int,
  add column if not exists annual_budget       numeric(14,2),
  add column if not exists staff_count         int,
  add column if not exists volunteer_count     int,
  add column if not exists website             text,
  add column if not exists phone               text,
  add column if not exists address_line1       text,
  add column if not exists address_line2       text,
  add column if not exists city                text,
  add column if not exists state               text,
  add column if not exists zip                 text,
  add column if not exists service_geographies text[] default '{}',
  add column if not exists focus_areas         text[] default '{}',
  add column if not exists populations_served  text[] default '{}',
  add column if not exists fiscal_year_end     text,
  add column if not exists contact_name        text,
  add column if not exists contact_title       text,
  add column if not exists contact_email       text,
  add column if not exists calendar_token      uuid not null default gen_random_uuid(),
  add column if not exists weekly_digest       boolean not null default true;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists trg_onboarding_updated on public.onboarding_answers;
create trigger trg_onboarding_updated before update on public.onboarding_answers
  for each row execute function public.set_updated_at();

-- RLS hardening: (select auth.uid()) is evaluated once per query, not per row
do $$
declare t text;
begin
  foreach t in array array['profiles','onboarding_answers','grants','proposals','documents'] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ════ M2: global grant catalog (shared, read-only to users) ════

create table if not exists public.funders (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  funder_type   text not null default 'foundation'
    check (funder_type in ('federal','state','local','foundation','corporate','community_foundation','other')),
  ein           text,
  website       text,
  giving_focus  text[],
  geographies   text[],
  annual_giving numeric(16,2),
  accepts_unsolicited boolean,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.opportunities (
  id                  uuid primary key default gen_random_uuid(),
  funder_id           uuid references public.funders(id) on delete set null,
  title               text not null,
  opportunity_number  text,
  source              text not null default 'manual'
    check (source in ('grants_gov','sam_gov','foundation_990','state_portal','manual','ai_discovered')),
  source_url          text,
  status              text not null default 'open'
    check (status in ('forecasted','open','closing_soon','closed','archived')),
  submission_type     text not null default 'proposal'
    check (submission_type in ('proposal','loi','application','concept_note')),
  description         text,
  rfp_text            text,
  focus_areas         text[] default '{}',
  geographies         text[] default '{}',
  populations         text[] default '{}',
  award_floor         numeric(14,2),
  award_ceiling       numeric(14,2),
  total_program_funding numeric(16,2),
  expected_awards     int,
  cost_share_required boolean default false,
  cost_share_pct      numeric(5,2),
  loi_deadline        date,
  deadline            date,
  deadline_time       text,
  rolling             boolean not null default false,
  eligibility_rules   jsonb not null default '[]'::jsonb,
  format_rules        jsonb not null default '{}'::jsonb,
  required_sections   jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.budget_categories (
  key         text primary key,
  label       text not null,
  description text,
  sort_order  int not null default 0,
  is_direct   boolean not null default true
);

create table if not exists public.proposal_section_templates (
  key            text primary key,
  title          text not null,
  description    text,
  ai_prompt_hint text,
  typical_length text,
  sort_order     int not null default 0
);

create index if not exists idx_opportunities_status   on public.opportunities(status);
create index if not exists idx_opportunities_deadline on public.opportunities(deadline);
create index if not exists idx_opportunities_funder   on public.opportunities(funder_id);

alter table public.funders enable row level security;
alter table public.opportunities enable row level security;
alter table public.budget_categories enable row level security;
alter table public.proposal_section_templates enable row level security;

drop policy if exists "read catalog" on public.funders;
create policy "read catalog" on public.funders for select to authenticated using (true);
drop policy if exists "read catalog" on public.opportunities;
create policy "read catalog" on public.opportunities for select to authenticated using (true);
drop policy if exists "read catalog" on public.budget_categories;
create policy "read catalog" on public.budget_categories for select to authenticated using (true);
drop policy if exists "read catalog" on public.proposal_section_templates;
create policy "read catalog" on public.proposal_section_templates for select to authenticated using (true);

drop trigger if exists trg_funders_updated on public.funders;
create trigger trg_funders_updated before update on public.funders
  for each row execute function public.set_updated_at();
drop trigger if exists trg_opportunities_updated on public.opportunities;
create trigger trg_opportunities_updated before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ════ M3: user pipeline, match scoring, eligibility, programs ════

alter table public.grants
  add column if not exists opportunity_id   uuid references public.opportunities(id) on delete set null,
  add column if not exists amount_requested numeric(14,2),
  add column if not exists next_action      text,
  add column if not exists notes            text,
  add column if not exists archived         boolean not null default false,
  add column if not exists submitted_at     timestamptz,
  add column if not exists decided_at       timestamptz,
  add column if not exists updated_at       timestamptz not null default now();

do $$
begin
  if exists (select 1 from information_schema.constraint_column_usage
             where table_schema='public' and table_name='grants' and constraint_name='grants_status_check') then
    alter table public.grants drop constraint grants_status_check;
  end if;
end $$;
alter table public.grants add constraint grants_status_check check (status in
  ('discovered','saved','eligibility_review','drafting','internal_review',
   'submitted','awarded','declined','withdrawn'));

drop trigger if exists trg_grants_updated on public.grants;
create trigger trg_grants_updated before update on public.grants
  for each row execute function public.set_updated_at();
create index if not exists idx_grants_user_status on public.grants(user_id, status);
create index if not exists idx_grants_opportunity on public.grants(opportunity_id);

create table if not exists public.programs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  description         text,
  population_served   text,
  geography           text,
  annual_participants int,
  annual_budget       numeric(14,2),
  outcomes_summary    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
drop trigger if exists trg_programs_updated on public.programs;
create trigger trg_programs_updated before update on public.programs
  for each row execute function public.set_updated_at();
create index if not exists idx_programs_user on public.programs(user_id);

create table if not exists public.match_scores (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  overall        int not null check (overall between 0 and 100),
  components     jsonb not null default '[]'::jsonb,
  verdict        text check (verdict in ('strong','good','weak','poor')),
  model_version  text,
  scored_at      timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
create index if not exists idx_match_scores_user on public.match_scores(user_id, overall desc);
create index if not exists idx_match_scores_opp  on public.match_scores(opportunity_id);

create table if not exists public.eligibility_checks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  grant_id       uuid references public.grants(id) on delete cascade,
  overall_status text not null default 'pending'
    check (overall_status in ('pending','eligible','ineligible','needs_review')),
  checked_at     timestamptz,
  model_version  text,
  created_at     timestamptz not null default now()
);
create table if not exists public.eligibility_check_items (
  id            uuid primary key default gen_random_uuid(),
  check_id      uuid not null references public.eligibility_checks(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  requirement   text not null,
  status        text not null default 'unknown'
    check (status in ('confirmed','failed','needs_review','unknown')),
  evidence      text,
  source_quote  text,
  sort_order    int not null default 0
);
create index if not exists idx_elig_checks_user on public.eligibility_checks(user_id);
create index if not exists idx_elig_items_check on public.eligibility_check_items(check_id);

create table if not exists public.org_facts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fact_key    text not null,
  fact_value  text not null,
  source_doc  uuid references public.documents(id) on delete set null,
  confidence  numeric(3,2) check (confidence between 0 and 1),
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, fact_key)
);
create index if not exists idx_org_facts_user on public.org_facts(user_id);

create table if not exists public.funder_relationships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  funder_id       uuid not null references public.funders(id) on delete cascade,
  stage           text not null default 'prospect'
    check (stage in ('prospect','applied','funded','declined','lapsed','recurring')),
  first_funded_at date,
  last_contact_at date,
  total_received  numeric(14,2) default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, funder_id)
);
drop trigger if exists trg_funder_rel_updated on public.funder_relationships;
create trigger trg_funder_rel_updated before update on public.funder_relationships
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['programs','match_scores','eligibility_checks',
    'eligibility_check_items','org_facts','funder_relationships'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ════ M4 · FEATURE 3: SAM.gov & Grants.gov setup ════

create table if not exists public.registrations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  registration_type text not null default 'sam_gov'
    check (registration_type in ('sam_gov','grants_gov','state_portal','other')),
  status            text not null default 'not_started'
    check (status in ('not_started','in_progress','submitted','active','expired','rejected')),
  uei               text,
  cage_code         text,
  ein               text,
  legal_name        text,
  dba_name          text,
  physical_address  jsonb,
  validations       jsonb not null default '{}'::jsonb,
  activated_at      date,
  expires_at        date,
  portal_username   text,           -- NEVER store passwords
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, registration_type)
);
drop trigger if exists trg_registrations_updated on public.registrations;
create trigger trg_registrations_updated before update on public.registrations
  for each row execute function public.set_updated_at();

create table if not exists public.registration_steps (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  step_key        text not null,
  label           text not null,
  detail          text,
  status          text not null default 'todo' check (status in ('todo','in_progress','done','blocked','na')),
  sort_order      int not null default 0,
  completed_at    timestamptz
);
create index if not exists idx_reg_steps_reg on public.registration_steps(registration_id);

create or replace function public.seed_registration_steps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.registration_type = 'sam_gov' then
    insert into public.registration_steps (registration_id, user_id, step_key, label, detail, sort_order) values
      (new.id, new.user_id, 'legal_name_irs',  'Verify legal name against IRS records', 'Name must match your IRS CP-575/147C letter exactly — mismatches cause 4–6 week TIN-validation delays.', 1),
      (new.id, new.user_id, 'usps_address',    'Validate physical address with USPS',   'SAM.gov rejects addresses that do not match USPS standardized format.', 2),
      (new.id, new.user_id, 'obtain_uei',      'Obtain Unique Entity ID (UEI)',          'Issued instantly at SAM.gov once entity details validate.', 3),
      (new.id, new.user_id, 'full_registration','Complete full SAM.gov entity registration', 'Required for federal awards (not just the UEI). Includes reps & certs, banking (EFT), and points of contact.', 4),
      (new.id, new.user_id, 'notarized_letter','Submit notarized letter if requested',   'SAM may require a notarized letter confirming the Entity Administrator.', 5),
      (new.id, new.user_id, 'annual_renewal',  'Calendar the annual renewal',            'SAM registrations expire every 365 days; expired registration blocks submission and payment.', 6);
  elsif new.registration_type = 'grants_gov' then
    insert into public.registration_steps (registration_id, user_id, step_key, label, detail, sort_order) values
      (new.id, new.user_id, 'sam_active',      'Confirm active SAM.gov registration',    'Grants.gov pulls entity data from SAM — SAM must be ACTIVE first.', 1),
      (new.id, new.user_id, 'create_account',  'Create Grants.gov account',              'Individual account tied to the organization via UEI.', 2),
      (new.id, new.user_id, 'add_profile',     'Add organization applicant profile',     'Links your login to the entity using the UEI.', 3),
      (new.id, new.user_id, 'ebiz_poc',        'EBiz POC authorizes roles',              'The E-Business Point of Contact (from SAM) must grant the AOR role.', 4),
      (new.id, new.user_id, 'aor_confirmed',   'Confirm Authorized Organization Representative (AOR)', 'Only an AOR can legally submit federal applications.', 5),
      (new.id, new.user_id, 'workspace_test',  'Create a test Workspace',                'Verify you can open application packages before a real deadline.', 6);
  end if;
  return new;
end; $$;
drop trigger if exists trg_seed_registration_steps on public.registrations;
create trigger trg_seed_registration_steps after insert on public.registrations
  for each row execute function public.seed_registration_steps();

do $$
declare t text;
begin
  foreach t in array array['registrations','registration_steps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ════ M5 · FEATURES 4-7: drafting, budget, logic model, format check ════

alter table public.proposals
  add column if not exists title      text,
  add column if not exists program_id uuid references public.programs(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if exists (select 1 from information_schema.constraint_column_usage
             where table_schema='public' and table_name='proposals' and constraint_name='proposals_status_check') then
    alter table public.proposals drop constraint proposals_status_check;
  end if;
end $$;
alter table public.proposals add constraint proposals_status_check check (status in
  ('draft','in_review','final','submitted','archived'));
drop trigger if exists trg_proposals_updated on public.proposals;
create trigger trg_proposals_updated before update on public.proposals
  for each row execute function public.set_updated_at();

create table if not exists public.proposal_sections (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  section_key text not null,
  title       text not null,
  content     text,
  word_limit  int,
  page_limit  numeric(5,2),
  status      text not null default 'empty'
    check (status in ('empty','ai_drafting','ai_draft','edited','final')),
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  unique (proposal_id, section_key)
);
drop trigger if exists trg_sections_updated on public.proposal_sections;
create trigger trg_sections_updated before update on public.proposal_sections
  for each row execute function public.set_updated_at();
create index if not exists idx_sections_proposal on public.proposal_sections(proposal_id, sort_order);

create table if not exists public.section_revisions (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.proposal_sections(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text,
  source      text not null default 'user' check (source in ('user','ai','restore')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_revisions_section on public.section_revisions(section_id, created_at desc);

create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  total_amount numeric(14,2) not null default 0,
  indirect_rate numeric(5,2),
  narrative_intro text,
  updated_at   timestamptz not null default now(),
  unique (proposal_id)
);
drop trigger if exists trg_budgets_updated on public.budgets;
create trigger trg_budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();

create table if not exists public.budget_line_items (
  id            uuid primary key default gen_random_uuid(),
  budget_id     uuid not null references public.budgets(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_key  text not null references public.budget_categories(key),
  description   text not null,
  quantity      numeric(10,2) default 1,
  unit_cost     numeric(14,2) default 0,
  amount        numeric(14,2) not null default 0,
  justification text,
  justification_status text not null default 'empty'
    check (justification_status in ('empty','ai_draft','edited','final')),
  sort_order    int not null default 0
);
create index if not exists idx_line_items_budget on public.budget_line_items(budget_id, sort_order);

create or replace function public.recalc_budget_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  bid := coalesce(new.budget_id, old.budget_id);
  update public.budgets
     set total_amount = coalesce((select sum(amount) from public.budget_line_items where budget_id = bid), 0)
   where id = bid;
  return coalesce(new, old);
end; $$;
drop trigger if exists trg_recalc_budget on public.budget_line_items;
create trigger trg_recalc_budget after insert or update of amount or delete on public.budget_line_items
  for each row execute function public.recalc_budget_total();

create table if not exists public.logic_models (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  program_id      uuid references public.programs(id) on delete cascade,
  proposal_id     uuid references public.proposals(id) on delete cascade,
  evaluation_plan text,
  narrative       text,
  updated_at      timestamptz not null default now(),
  check (program_id is not null or proposal_id is not null)
);
drop trigger if exists trg_logic_models_updated on public.logic_models;
create trigger trg_logic_models_updated before update on public.logic_models
  for each row execute function public.set_updated_at();

create table if not exists public.logic_model_items (
  id             uuid primary key default gen_random_uuid(),
  logic_model_id uuid not null references public.logic_models(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  column_type    text not null check (column_type in
    ('input','activity','output','outcome_short','outcome_mid','outcome_long','impact')),
  content        text not null,
  metric         text,
  target_value   text,
  measurement_tool text,
  sort_order     int not null default 0
);
create index if not exists idx_lm_items_model on public.logic_model_items(logic_model_id, column_type, sort_order);

create table if not exists public.format_check_runs (
  id             uuid primary key default gen_random_uuid(),
  proposal_id    uuid not null references public.proposals(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  overall_status text not null default 'pending'
    check (overall_status in ('pending','compliant','issues_found')),
  run_at         timestamptz not null default now()
);
create table if not exists public.format_check_items (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.format_check_runs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rule_key   text not null,
  label      text not null,
  expected   text,
  actual     text,
  status     text not null default 'unknown'
    check (status in ('pass','fail','warning','unknown')),
  sort_order int not null default 0
);
create index if not exists idx_fmt_items_run on public.format_check_items(run_id);

do $$
declare t text;
begin
  foreach t in array array['proposal_sections','section_revisions','budgets',
    'budget_line_items','logic_models','logic_model_items',
    'format_check_runs','format_check_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ════ M6 · FEATURES 8-9 + infrastructure ════

create table if not exists public.deadlines (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  grant_id        uuid references public.grants(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete cascade,
  kind            text not null default 'proposal'
    check (kind in ('proposal','loi','report','renewal','registration_renewal','meeting','custom')),
  title           text not null,
  due_date        date not null,
  due_time        text,
  status          text not null default 'upcoming'
    check (status in ('upcoming','done','missed','cancelled')),
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_deadlines_user_due on public.deadlines(user_id, status, due_date);

create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  deadline_id   uuid not null references public.deadlines(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  offset_days   int not null,
  scheduled_for date not null,
  channel       text not null default 'in_app' check (channel in ('in_app','email','both')),
  sent_at       timestamptz,
  unique (deadline_id, offset_days, channel)
);
create index if not exists idx_reminders_pending on public.reminders(scheduled_for) where sent_at is null;

create or replace function public.create_default_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
declare d int;
begin
  foreach d in array array[30, 14, 7] loop
    if new.due_date - d >= current_date then
      insert into public.reminders (deadline_id, user_id, offset_days, scheduled_for, channel)
      values (new.id, new.user_id, d, new.due_date - d, 'both')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists trg_default_reminders on public.deadlines;
create trigger trg_default_reminders after insert on public.deadlines
  for each row execute function public.create_default_reminders();

create table if not exists public.awards (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  grant_id            uuid not null references public.grants(id) on delete cascade,
  funder_id           uuid references public.funders(id) on delete set null,
  amount_awarded      numeric(14,2),
  award_number        text,
  period_start        date,
  period_end          date,
  reporting_frequency text default 'custom'
    check (reporting_frequency in ('monthly','quarterly','semiannual','annual','final_only','custom')),
  renewal_status      text not null default 'not_applicable'
    check (renewal_status in ('not_applicable','eligible','queued','applied','renewed','lost')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (grant_id)
);
drop trigger if exists trg_awards_updated on public.awards;
create trigger trg_awards_updated before update on public.awards
  for each row execute function public.set_updated_at();

create table if not exists public.award_reports (
  id             uuid primary key default gen_random_uuid(),
  award_id       uuid not null references public.awards(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  report_type    text not null default 'interim'
    check (report_type in ('interim','final','financial','progress','renewal_application')),
  period_start   date,
  period_end     date,
  due_date       date,
  status         text not null default 'upcoming'
    check (status in ('upcoming','drafting','ai_draft','in_review','submitted','accepted')),
  content        text,
  funds_utilized_pct numeric(5,2),
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_reports_award on public.award_reports(award_id, due_date);

create or replace function public.report_deadline_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.due_date is not null and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date) then
    insert into public.deadlines (user_id, grant_id, kind, title, due_date)
    select new.user_id, a.grant_id, 'report',
           initcap(new.report_type) || ' report — ' || coalesce(g.title,'award'),
           new.due_date
    from public.awards a left join public.grants g on g.id = a.grant_id
    where a.id = new.award_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_report_deadline on public.award_reports;
create trigger trg_report_deadline after insert or update of due_date on public.award_reports
  for each row execute function public.report_deadline_sync();

create table if not exists public.outcome_records (
  id           uuid primary key default gen_random_uuid(),
  award_id     uuid not null references public.awards(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  objective    text not null,
  metric       text,
  target_value text,
  actual_value text,
  met          boolean,
  as_of        date not null default current_date,
  notes        text
);
create index if not exists idx_outcomes_award on public.outcome_records(award_id);

create table if not exists public.ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  job_type    text not null check (job_type in
    ('score_match','check_eligibility','validate_registration','draft_section',
     'draft_full_proposal','write_budget_narrative','build_logic_model',
     'run_format_check','extract_org_facts','write_report','discover_opportunities')),
  status      text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  input       jsonb not null default '{}'::jsonb,
  output      jsonb,
  error       text,
  model       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ai_jobs_queue on public.ai_jobs(status, created_at) where status in ('queued','running');
create index if not exists idx_ai_jobs_user on public.ai_jobs(user_id, created_at desc);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'info'
    check (kind in ('info','deadline','new_match','draft_ready','eligibility','report_due','renewal','system')),
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_unread on public.notifications(user_id, created_at desc) where read_at is null;

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_user on public.activity_log(user_id, created_at desc);

alter table public.documents
  add column if not exists mime_type   text,
  add column if not exists size_bytes  bigint,
  add column if not exists extracted   boolean not null default false,
  add column if not exists label       text;

do $$
declare t text;
begin
  foreach t in array array['deadlines','reminders','awards','award_reports',
    'outcome_records','ai_jobs','notifications','activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create or replace view public.v_upcoming_deadlines
with (security_invoker = true) as
select d.id, d.user_id, d.kind, d.title, d.due_date, d.due_time, d.status,
       (d.due_date - current_date) as days_left,
       g.title as grant_title, g.funder as grant_funder
from public.deadlines d
left join public.grants g on g.id = d.grant_id
where d.status = 'upcoming'
order by d.due_date;

create or replace view public.v_pipeline
with (security_invoker = true) as
select g.id, g.user_id, g.title, g.funder, g.status, g.deadline,
       g.amount_requested, g.next_action, g.archived,
       o.title as opportunity_title, o.award_ceiling, o.submission_type,
       m.overall as match_score, m.verdict as match_verdict
from public.grants g
left join public.opportunities o on o.id = g.opportunity_id
left join public.match_scores m on m.opportunity_id = g.opportunity_id and m.user_id = g.user_id
where g.archived = false;

-- ════ M7: reference data (budget categories, section templates,
--          sample funders + opportunities) ════
-- See the applied migration `seed_reference_data` in Supabase migration
-- history for the full seed bodies (2 CFR 200 categories, 8 section
-- templates, 4 funders, 4 opportunities with eligibility/format rules).

-- ════ M8: advisor fixes — lock trigger functions out of the RPC surface ════
do $$
declare f text;
begin
  foreach f in array array['set_updated_at','handle_new_user','create_default_reminders',
    'seed_registration_steps','recalc_budget_total','report_deadline_sync'] loop
    execute format('revoke execute on function public.%I() from public, anon, authenticated', f);
  end loop;
end $$;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'touch_updated_at') then
    execute 'alter function public.touch_updated_at() set search_path = public';
    execute 'revoke execute on function public.touch_updated_at() from public, anon, authenticated';
  end if;
end $$;

-- ════ M9: covering indexes for FK columns ════
create index if not exists idx_award_reports_user   on public.award_reports(user_id);
create index if not exists idx_awards_user          on public.awards(user_id);
create index if not exists idx_awards_funder        on public.awards(funder_id);
create index if not exists idx_line_items_user      on public.budget_line_items(user_id);
create index if not exists idx_line_items_category  on public.budget_line_items(category_key);
create index if not exists idx_budgets_user         on public.budgets(user_id);
create index if not exists idx_deadlines_grant      on public.deadlines(grant_id);
create index if not exists idx_deadlines_registration on public.deadlines(registration_id);
create index if not exists idx_documents_user       on public.documents(user_id);
create index if not exists idx_elig_items_user      on public.eligibility_check_items(user_id);
create index if not exists idx_elig_checks_grant    on public.eligibility_checks(grant_id);
create index if not exists idx_elig_checks_opp      on public.eligibility_checks(opportunity_id);
create index if not exists idx_fmt_items_user       on public.format_check_items(user_id);
create index if not exists idx_fmt_runs_proposal    on public.format_check_runs(proposal_id);
create index if not exists idx_fmt_runs_user        on public.format_check_runs(user_id);
create index if not exists idx_funder_rel_funder    on public.funder_relationships(funder_id);
create index if not exists idx_lm_items_user        on public.logic_model_items(user_id);
create index if not exists idx_logic_models_program on public.logic_models(program_id);
create index if not exists idx_logic_models_proposal on public.logic_models(proposal_id);
create index if not exists idx_logic_models_user    on public.logic_models(user_id);
create index if not exists idx_org_facts_source     on public.org_facts(source_doc);
create index if not exists idx_outcomes_user        on public.outcome_records(user_id);
create index if not exists idx_sections_user        on public.proposal_sections(user_id);
create index if not exists idx_proposals_grant      on public.proposals(grant_id);
create index if not exists idx_proposals_program    on public.proposals(program_id);
create index if not exists idx_proposals_user       on public.proposals(user_id);
create index if not exists idx_reg_steps_user       on public.registration_steps(user_id);
create index if not exists idx_reminders_user       on public.reminders(user_id);
create index if not exists idx_revisions_user       on public.section_revisions(user_id);
