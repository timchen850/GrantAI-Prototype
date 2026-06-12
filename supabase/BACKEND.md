# Grange AI — Backend Architecture & Feature Plan

> Built 2026-06-12 against Supabase project `GrangeAI` (`xewrvmqyzeiziimcmenj`).
> All migrations are applied to the live database and tracked in Supabase's
> migration history (`supabase_migrations.schema_migrations`). The combined SQL
> is archived in `migrations/20260612_full_backend.sql`.

## The shape of the system

The schema follows the grant lifecycle the site sells — **Get qualified →
Write the proposal → Submit & sustain** — built on three layers:

1. **Global catalog** (shared, read-only to users): `funders`,
   `opportunities`, `budget_categories`, `proposal_section_templates`.
   Written only by the service role (the discovery pipeline / AI agent).
   `opportunities` carries the RFP machinery: `rfp_text` for drafting,
   `eligibility_rules` for screening, `format_rules` for compliance,
   `required_sections` for proposal scaffolding.

2. **Per-user workspace** (RLS `user_id = auth.uid()` on every table):
   profile → programs → pipeline (`grants`) → proposals → awards → reports.

3. **AI seam** (`ai_jobs`): every AI-powered feature is a job type. The
   client inserts a job row; the AI worker (edge function — next phase)
   picks it up, writes results to the feature's tables, marks the job done,
   and drops a row in `notifications`. The frontend never waits on the
   model directly — it watches job status + target tables (Supabase
   Realtime works on both).

```
profiles ─┬─ programs ──── logic_models ── logic_model_items
          ├─ documents ─── org_facts            (the AI's knowledge base)
          ├─ registrations ── registration_steps (SAM.gov / Grants.gov)
          │
opportunities ─┬─ match_scores       (per user × opportunity)
   │           └─ eligibility_checks ── eligibility_check_items
   └─ grants (pipeline) ── proposals ─┬─ proposal_sections ── section_revisions
        │                             ├─ budgets ── budget_line_items
        │                             └─ format_check_runs ── format_check_items
        └─ awards ─┬─ award_reports
                   └─ outcome_records
deadlines ── reminders          ai_jobs · notifications · activity_log
```

---

## The 9 features (site carousel) — purpose, mechanics, why they matter

### 01 · Match scoring — `match_scores`
**What it does:** every opportunity gets a 0–100 fit score against the org,
decomposed into the four dimensions the site shows: mission, NTEE code,
geography, budget range — each with a weight and a written rationale
(`components` jsonb), plus an overall verdict (strong/good/weak/poor).
**Why it matters:** the #1 failure mode in grantseeking is wasted effort on
poor-fit applications. Foundations fund ~10% of proposals; most rejections
are fit, not quality. Scoring *before* writing is what makes "you only see
the ones worth applying for" true.
**How it works:** profile fields (`ntee_code`, `focus_areas`,
`service_geographies`, `annual_budget`) + `org_facts` vs. the opportunity's
`focus_areas`/`geographies`/`award_floor`/`award_ceiling`.
**AI hook:** `ai_jobs.job_type = 'score_match'` → writes `match_scores`.
Unique on (user, opportunity) so re-scoring upserts.

### 02 · Eligibility checks — `eligibility_checks` + `_items`
**What it does:** before a word is written, each requirement from
`opportunities.eligibility_rules` becomes a checklist row: 501(c)(3) status,
allowable costs, applicant restrictions, match/cost-share requirement —
each confirmed/failed/needs_review with `evidence` (why) and `source_quote`
(the actual RFP language).
**Why it matters:** ineligible applications are auto-rejected no matter how
good the writing is — and eligibility lives in dense RFP legalese people
skim. A hard gate here saves the 30–50 hours a doomed proposal costs.
**AI hook:** `check_eligibility` → reads rules + profile + org_facts,
writes itemized results; overall verdict gates the pipeline
(`grants.status = 'eligibility_review'` → `'drafting'`).

### 03 · SAM.gov & Grants.gov setup — `registrations` + `registration_steps`
**What it does:** tracks federal registration state per portal: UEI, CAGE,
EIN, legal name, registered address, `validations` jsonb (IRS name/TIN
match, USPS address standardization, UEI format), activation/expiry dates.
Inserting a registration **auto-seeds the official checklist** (6 steps for
SAM.gov, 6 for Grants.gov — EBiz POC, AOR authorization, etc. — via trigger).
**Why it matters:** the site's claim is precise: IRS legal-name/TIN
mismatches and non-USPS-standard addresses are the top causes of SAM.gov
validation failures, which take 4–6 weeks to resolve — long enough to miss
a deadline outright. SAM also expires every 365 days, and an expired
registration blocks both submission *and payment*. `expires_at` feeds a
`registration_renewal` deadline with the standard reminder ladder.
**AI hook:** `validate_registration` → pre-checks name/address formatting
against IRS/USPS conventions and writes `validations`.

### 04 · Blank page → first draft — `proposals` + `proposal_sections` + `section_revisions`
**What it does:** a proposal is an ordered set of sections scaffolded from
`opportunities.required_sections` (falling back to the 8 standard
`proposal_section_templates`: executive summary, org background, statement
of need, project description, goals & objectives, evaluation,
sustainability, budget narrative — each template carries an `ai_prompt_hint`).
Sections track word/page limits and a human-in-the-loop status:
`empty → ai_drafting → ai_draft → edited → final`. Every save snapshots to
`section_revisions` (source: user/ai/restore).
**Why it matters:** this is the core product. A grant writer needs 30–50
hours per full federal narrative; the draft engine collapses that to
minutes by writing from structured org truth (profile + `org_facts` +
`programs`) against the funder's own `rfp_text` — not from a generic prompt.
**AI hook:** `draft_section` / `draft_full_proposal`.

### 05 · Budget & budget narrative — `budgets` + `budget_line_items` (+ `budget_categories`)
**What it does:** line items under the nine 2 CFR 200 / SF-424A federal
categories (personnel, fringe, travel, equipment, supplies, contractual,
construction, other, indirect — seeded with definitions and justification
guidance). Each line carries its own `justification` text with a status.
A trigger keeps `budgets.total_amount` in sync on every insert/update/delete.
**Why it matters:** budget–narrative misalignment is a classic
administrative rejection: a line item in the spreadsheet that never appears
in the narrative (or vice versa) reads as sloppiness to reviewers. Because
the narrative is *generated from the line items themselves*, the two can't
drift — that's the site's exact promise.
**AI hook:** `write_budget_narrative` → fills `justification` per line +
`narrative_intro`, using category-specific guidance from `budget_categories`.

### 06 · Logic model & outcomes — `logic_models` + `logic_model_items`
**What it does:** the standard evaluation chain — inputs → activities →
outputs → outcomes (short/mid/long) → impact — as structured rows, each
with `metric`, `target_value`, `measurement_tool`. The model belongs to a
`program` or a `proposal`, and renders as both a diagram and prose
(`narrative`, `evaluation_plan`).
**Why it matters:** federal and major foundation RFPs require a logic model
and measurable objectives; small nonprofits routinely lose points here
because it's evaluation-methodology work, not writing work. Structured
items also become the *measurement contract* the org reports against after
winning (see 09) — one source of truth from proposal to final report.
**AI hook:** `build_logic_model` → drafts the chain from the program
description; user edits targets; goals/objectives and evaluation sections
in the proposal pull from the same rows.

### 07 · Compliance & format check — `format_check_runs` + `_items`
**What it does:** itemized verification of a proposal against
`opportunities.format_rules`: page limit, font + size, margins, line
spacing, file format, naming convention, required attachments — each item
pass/fail/warning with expected vs. actual.
**Why it matters:** administrative disqualification is the silent killer —
proposals rejected unread over a margin or a missing attachment. Federal
programs enforce this mechanically. The check is cheap, the failure mode is
total loss; that asymmetry is the whole feature.
**AI hook:** `run_format_check` → parses rules from `rfp_text` into
`format_rules` and audits the assembled document + `documents` vault
against the attachment list.

### 08 · Deadline tracking — `deadlines` + `reminders`
**What it does:** one calendar across every date type: proposals, LOIs,
reports, renewals, registration expirations, meetings. Inserting a deadline
**auto-creates 30/14/7-day reminders** (trigger, exactly the site's
promise), channel in_app/email/both. `v_upcoming_deadlines` powers the
dashboard with computed `days_left`. `profiles.calendar_token` is reserved
for a personal ICS feed URL (calendar-sync edge function, next phase).
**Why it matters:** grant calendars compound — proposal dates beget report
dates beget renewal dates. Lean teams run on personal calendars; one missed
interim report can cost both the current award and next year's renewal.
**Mechanics, no AI needed:** report due-dates auto-sync to deadlines via
trigger; the reminder worker (cron edge function) reads
`reminders where sent_at is null and scheduled_for <= today` and writes
`notifications` / sends email.

### 09 · Reporting & renewals — `awards` + `award_reports` + `outcome_records`
**What it does:** when a grant is won, the award record carries the project
period and reporting frequency. Reports (interim/final/financial/progress/
renewal_application) get due dates that auto-create deadlines. The org logs
`outcome_records` (objective, target vs. actual, met?) as the period runs —
the dashboard the site shows ("Outcomes met 8/9, funds utilized 72%") is a
straight read of these rows. `awards.renewal_status` runs the renewal queue;
`funder_relationships` (CRM-lite: stage, totals, last contact) carries the
relationship across cycles.
**Why it matters:** renewals are the cheapest money in grantseeking — the
funder already said yes once, and renewal win-rates dwarf cold-application
rates. Funders consistently say poor reporting is why they drop grantees.
Closing the loop (report → relationship → renewal) turns one-time wins into
recurring revenue, which is the difference between a prototype and a
product nonprofits won't cancel.
**AI hook:** `write_report` → drafts the narrative *from* `outcome_records`
+ the original proposal's logic model.

---

## Features added beyond the carousel (necessary connective tissue)

| Addition | Why it's necessary |
|---|---|
| `org_facts` | The AI's structured knowledge base about the org — mined from uploaded 990s/budgets (`extract_org_facts` job), user-verifiable (`verified` flag). This is what makes drafts *specific* instead of generic. |
| `programs` | Funding requests are *for a program*; logic models, outcomes, and narratives hang off it. Without it every proposal re-describes the program from scratch. |
| `funder_relationships` | Renewals & repeat funding are relationship plays; tracks stage, totals received, last contact. |
| `ai_jobs` | The single seam where the model plugs in. Job types: `score_match, check_eligibility, validate_registration, draft_section, draft_full_proposal, write_budget_narrative, build_logic_model, run_format_check, extract_org_facts, write_report, discover_opportunities`. |
| `notifications` | In-app inbox; the email/digest worker reads the same rows. `profiles.weekly_digest` is the opt-in. |
| `activity_log` | Audit trail (`grant.saved`, `proposal.submitted`…) — cheap now, painful to retrofit. |
| Views `v_pipeline`, `v_upcoming_deadlines` | Dashboard queries in one select; `security_invoker` so RLS still applies. |

## Security model

- **RLS on every table.** User tables: own-rows-only via
  `user_id = (select auth.uid())` (subselect form so Postgres evaluates it
  once per query — advisor-clean). Catalog tables: SELECT for
  `authenticated`, writes only via service role.
- Trigger functions are `security definer` with pinned `search_path`, and
  EXECUTE is revoked from `public/anon/authenticated` (not callable via RPC).
- Child tables carry a denormalized `user_id` so RLS never needs joins.
- `registrations.portal_username` only — **never store portal passwords**.
- Storage: private `documents` bucket, paths `<uid>/<filename>` (unchanged).
- Advisors: security + performance lints clean except one dashboard-level
  toggle — enable **leaked password protection** (Auth → Passwords) when
  plan allows.

## What the next phase (AI integration) plugs into

1. One **edge function worker**: poll/claim `ai_jobs` (status `queued` →
   `running`), call the model with the job's `input` ids, write the feature
   tables, set `succeeded` + `output`, insert a notification.
2. A **reminder cron**: daily, send due `reminders`, stamp `sent_at`.
3. An **ICS feed** endpoint keyed by `profiles.calendar_token`.
4. **Frontend wiring**: dashboard reads `v_pipeline` /
   `v_upcoming_deadlines` / `notifications`; discovery reads
   `opportunities` + `match_scores`; generator reads/writes
   `proposal_sections`.

## Verification record (2026-06-12)

Smoke-tested live with a real user id, in one transaction (then cleaned up):
grant insert → deadline insert produced exactly 3 reminders (30/14/7);
`sam_gov` registration produced its 6 checklist steps; 4 budget line items
totalling $201,000 recalculated `budgets.total_amount` correctly; an interim
report with a due date auto-created its calendar deadline; both views
resolved. All advisors green (see above).
