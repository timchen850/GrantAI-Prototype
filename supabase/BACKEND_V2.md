# Grange AI — Backend v2 (beginner UX, post-award, roles, RAG)

*Applied live 2026-06-13 to `xewrvmqyzeiziimcmenj`. Builds on `BACKEND.md` (v1).
Now 45 tables. Every table RLS-protected; advisors clean.*

This layer answers the specific product notes about making Grange usable by
people who have **never** done grants, and keeping them compliant **after** they
win. Each feature maps to one of those notes.

## New tables & what they're for

### "If I know nothing, what do I need before I apply?" — readiness
- **`readiness_requirements`** (reference, seeded ×10) — the convergent
  prerequisite list (IRS determination letter, EIN, bylaws, board list, org
  budget, 990, financials, mission/track record, UEI, active SAM.gov), each with
  a beginner-facing *why it matters* and *how to get it*.
- **`readiness_items`** — per-user state (have / in_progress / missing / n/a).
  `seed_readiness_for_me()` populates a user's checklist.
- **Why it matters:** research found *none* of the competitors (Instrumentl,
  Grantable, Grantboost, OpenGrants) ship an in-app readiness quiz — it's a real
  gap. This is the "before you apply" stage no one productizes.

### "Figure out what documents to gather" — per-application checklist
- **`document_types`** (reference, seeded ×10) — the recurring foundation
  "attachment kit" (determination letter, org/project budget, financials, 990,
  board list, staff bios, letters of support, org chart, logic model), each with
  *why funders want it* and *where to get it*.
- **`application_documents`** — the checklist for one grant. **Auto-seeded by a
  trigger** the moment a grant enters the pipeline (federal grants get the
  federal set, foundations the foundation set).

### "Some grants require roles — define them" — team roles
- **`role_templates`** (reference, seeded ×8) — PD/PI, Authorizing Official,
  Fiscal Officer, EBiz POC, AOR, Evaluator, Board Chair, Partner Lead — with when
  each is required and what they do.
- **`grant_roles`** — who plays each role on a given grant/proposal.

### "Make sure funds go where they should so they don't claw it back" — post-award
- **`expenditures`** — every dollar mapped to an approved budget line + category,
  with receipt link and an `allowable` flag (2 CFR 200.403).
- **`compliance_requirements`** — obligations that keep the money (spend in
  category, keep receipts, file reports on time, time-and-effort, single audit if
  $1M+). **Auto-seeded by a trigger** when an award is recorded.
- **`v_award_budget_vs_actual`** (view) — budgeted vs spent vs remaining per
  category, with an `over_budget` flag. This is the clawback guardrail: it shows
  overspend *before* it becomes a "questioned cost."

### "Analyze data and outcomes / scholarship success metrics"
- **`participant_outcomes`** — privacy-safe, **aggregate** cohort metrics (e.g.
  "2026 scholarship class: 94% college enrollment, n=50, baseline 67%"). No PII
  required. This is how you prove scholarship recipients succeeded.
- (v1 already has `outcome_records` + `logic_model_items` for proposal-time
  targets; these are the *actuals* you report against.)

### "Give general advice" — guidance content
- **`guidance_articles`** (reference, seeded ×6) — plain-English glossary + how-to
  ("What is a grant?", "Where do I start?", "What's a determination letter?",
  "SAM.gov & UEI", "How do I not have to give the money back?", "Is it easier in
  Grange or the funder's site?"). Powers contextual help and the chatbot.

### Funder AI policy (surface the rules)
- `funders`/`opportunities` gain `ai_policy`, `ai_policy_url`,
  `ai_disclosure_required`, `ai_prohibited`. Federal funders seeded with the
  NIH/NSF posture so the app can warn users at draft time.

### RAG — institutional memory (the report's moat)
- **`document_chunks`** — chunks of the org's own past proposals/boilerplate with
  768-dim embeddings (pgvector, moved to the `extensions` schema).
- **`match_document_chunks(query_embedding, k, kind)`** — RLS-scoped similarity
  search; a user can only ever retrieve their *own* chunks.

## Auto-seeding triggers (verified live)
- New **grant** → its `application_documents` checklist.
- New **award** → its `compliance_requirements`.
- New **deadline** → 30/14/7-day reminders (v1).
- New **registration** → SAM.gov/Grants.gov step checklist (v1).
- New **award_report** with a due date → a calendar deadline (v1).

## Correction applied
- Budget category `indirect`: de-minimis indirect rate updated **10% → 15%**
  (2024 revision to 2 CFR 200). The report predates this.

## "Is it easier through grangeai.net or the funder's site?"
Product answer, encoded in guidance + the chatbot's system prompt: **do the hard
80% in Grange** (discover → eligibility → documents → draft → compliance check),
then **submit on the funder's official portal**. Federal grants *must* go through
Grants.gov, and many funders prohibit automated submission — so "submission-ready
export," not auto-submit, is the safe product boundary (matches the report).

---

## Report reconciliation (what your friend's report got right / needs updating)

The report is strong and well-sourced. Verified-correct highlights: the
automatable-vs-human split, rejection driven by avoidable errors (Grants.gov
50-char filename rule confirmed), RAG-over-your-own-docs as the real moat, NIH
NOT-OD-25-132 and the human-as-author imperative, Instrumentl's $55M Summit
Partners raise.

**The one thing to add (it's now in `AI_STRATEGY.md`):** the report says "use a
frontier API (Claude/GPT)" but you want free Gemini/Groq. The critical nuance the
report doesn't cover is the **Gemini free-tier data-training trap** — free Gemini
trains on your data and warns against confidential info, so real grant data needs
**Gemini paid (no-training, still near-free)** or **Groq (no-training even
free)**. That's the single most important provider decision and it's now
documented and wired (Gemini primary + Groq fallback).

---

## v2.1 — AI worker + grant-data integrity (2026-06-13)

### `ai-worker` Edge Function — the structured-AI engine
Deployed & ACTIVE. Drains the `ai_jobs` queue; runs under the user's JWT
(RLS-scoped). Five job types live, each Gemini JSON-mode (Groq fallback) →
writes results to feature tables → marks the job done → drops a notification:

| job_type | reads | writes |
|---|---|---|
| `score_match` | profile + opportunity | `match_scores` (0-100 + per-dimension rationale) |
| `check_eligibility` | profile + opportunity.eligibility_rules | `eligibility_checks` + `_items` |
| `draft_section` | profile + program + opportunity + section template | `proposal_sections.content` |
| `write_budget_narrative` | budget + line items + categories | `budgets.narrative_intro` + per-line `justification` |
| `build_logic_model` | profile + program | `logic_models` + `logic_model_items` |

Client helper (in `index.html`): `await runAiJob('score_match', { opportunity_id })`.
Verified end-to-end: auth gate (401), job creation, state transitions, and
graceful failure when no API key — real output once `GEMINI_API_KEY` is set.

### Grant-data integrity — curated list cut from 37 → 9 (honest)
A 10-agent verification swept every curated foundation against its official
site. Finding: **28 of 37 were invitation-only or discontinued**, and every
specific deadline was fabricated. Showing them to beginners with a "Draft
proposal" button is misleading. Action: removed the 28 non-applyable funders;
kept the 9 with a genuine public application door, each relabeled honestly
(Rolling / LOI year-round / Expression of interest / Opens annually).

**Kept (applyable):** Walton (K-12 LOI), RWJF (open CFPs), W.K. Kellogg (LOI
year-round), California Community Foundation (rolling, LA), Walton (Environment
LOI), Bob Woodruff (rolling, veterans), Open Society (by program/LOI), Robin
Hood (EOI year-round, NYC), Echoing Green (annual fellowship).

**Strategic implication (important):** most big-name foundations are
invitation-only — they are NOT the applyable market for small nonprofits. The
genuinely open opportunities are (1) **federal grants** (Grants.gov, already
pulled live), (2) **community foundations**, and (3) **smaller funders with open
applications**. Discovery should lean on those, not marquee foundation names.
A future discovery upgrade should ingest open-application funders (e.g. via
Candid/IRS 990-PF data) rather than hand-curated big foundations.
