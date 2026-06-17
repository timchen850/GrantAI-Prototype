# Grange AI — AI provider strategy & analysis

*Written 2026-06-13. Based on live verification of provider docs/pricing in June 2026.
Provider rate limits change and are now account-specific — re-check your own dashboards.*

---

## TL;DR — what to actually do

1. **Build/prototype now on the Gemini free tier** with the deployed
   `generate-proposal` and `ai-chat` functions. Free, instant, good enough to
   demo. **But only with fake/sample data while on free tier** (see the privacy
   trap below).
2. **Before real nonprofits put real data in, enable billing on Gemini
   (Tier 1).** This single click flips Google's policy from "we train on your
   data" to "we don't" — and it stays *near-free* (~$2–6/month at hundreds of
   drafts). This is the most important decision in this doc.
3. **Keep Groq as the free, privacy-safe fallback** (already wired in). Groq
   never trains on your data on any tier, so it's safe even free — it just has
   tighter throughput. Our functions use Gemini first, Groq if Gemini fails.
4. **Model picks:** `gemini-2.5-flash` for proposal drafting (quality prose),
   `gemini-2.5-flash-lite` for the chatbot (fast + cheap), `llama-3.3-70b-versatile`
   on Groq as fallback for both.

---

## The one thing most people get wrong: free Gemini trains on your data

This is the single most important finding, and it's counter-intuitive:

> **Google's Gemini API _free_ tier uses your prompts and the model's responses
> to improve their products, with possible human review — and their terms
> explicitly say "do not submit sensitive, confidential, or personal
> information."** (Verified on the official Gemini API Terms, updated 2026-03-23.)

Grant applications are *full* of exactly that: beneficiary stories (sometimes
health/education data), org financials, board lists, program strategy. Pushing a
real client's draft through the **free** tier likely breaches that nonprofit's
own donor-privacy commitments and funder agreements.

**The fix is trivial and cheap:** the Gemini API **paid** tier does **not** train
on your data ("Google doesn't use your prompts or responses to improve our
products"). Just enabling billing on the Google Cloud project flips the policy.
And the cost is almost nothing (next section). So:

- **Free tier → demos, marketing copy, synthetic data only.**
- **Paid tier (billing enabled) → the moment a real org's data is involved.**

Groq is the exception: it **never** trains on customer data on **any** tier
(free included), and offers Zero-Data-Retention — which is why it's the perfect
free fallback for sensitive data.

---

## Cost reality (why "paid" is basically free)

A full grant draft is roughly 20–25K input tokens + 3–4K output tokens.

| Model | $ / 1M in | $ / 1M out | ~Cost per draft | 500 drafts/mo |
|---|---|---|---|---|
| **gemini-2.5-flash-lite** | $0.10 | $0.40 | ~$0.003 | **~$2** |
| gemini-3.1-flash-lite | $0.25 | $1.50 | ~$0.01 | ~$6 |
| gemini-2.5-flash | ~$0.30 | ~$2.50 | ~$0.015 | ~$8 |
| Groq llama-3.3-70b | $0.59 | $0.79 | ~$0.018 | ~$9 (free tier covers bursts at $0) |

At your stage, **paid-tier privacy costs hobby money.** Gemini's Tier-1 has a
natural ~$250/month spend ceiling that acts as a guardrail. The per-user
10-drafts/day cap we built into `generate-proposal` is a second guardrail.

---

## Provider scorecard (June 2026)

### 🥇 Gemini — primary
- **Models (free-tier eligible):** gemini-2.5-flash, gemini-2.5-flash-lite,
  gemini-3-flash, gemini-3.1-flash-lite, gemini-3.5-flash. (Pro models are
  paid-only.)
- **Free limits:** ~10–15 RPM, ~250K TPM, ~1,500 requests/day on Flash models
  (account-specific now — check AI Studio).
- **Data policy:** ⚠️ trains on FREE-tier data; ✅ does NOT train on PAID-tier data.
- **Why primary:** best price/quality at this scale, huge context window (fits a
  whole NOFO + past proposals), strong structured-output following.

### 🥈 Groq — free, privacy-safe fallback
- **Models:** llama-3.3-70b-versatile, llama-3.1-8b-instant, gpt-oss-120b,
  llama-4-scout.
- **Free limits:** ~30 RPM, ~6K TPM, ~1,000 requests/day (account-specific).
- **Data policy:** ✅ never trains on customer data (any tier); Zero-Data-Retention
  available; has a DPA.
- **Why fallback:** privacy-safe even on free, extremely fast — but tight
  throughput, so it's a burst/outage backup, not the primary workhorse.

### Worth knowing (not recommended as primary)
- **Cerebras** — 1M tokens/day genuinely free (gpt-oss-120b), very fast. Strong
  *second* free backup.
- **DeepSeek (direct API)** — cheapest tokens anywhere, BUT stores data in the
  PRC and trains on API data by default with no paid no-training carve-out.
  ❌ **Do not send nonprofit data to DeepSeek's direct API.** (DeepSeek/Llama
  *weights* served by US hosts like Groq/Cerebras are fine — different thing.)
- **OpenRouter** — handy for trying many models; `:free` endpoints route to
  third parties whose training policies vary — check per-endpoint before sending data.
- **Mistral** — has a $0 "Experiment" plan; fine for prototyping.
- **Claude / GPT-class** — the report's first choice for raw quality. Worth it
  later for the hardest drafting if budget allows; pricier than Gemini Flash. Our
  functions are provider-agnostic enough to add one as a third tier.

---

## Compliance guardrails (bake in from day one)

These come straight from the funder-rules research and the report:

1. **Human-as-author, always.** NIH (NOT-OD-25-132, effective 2025-09-25) won't
   consider applications "substantially developed by AI" as the applicant's
   original work and caps PIs at 6 apps/year. NSF requires AI-use disclosure and
   bans reviewers from uploading proposals to AI. **Product stance: assist and
   draft, never auto-submit; force a human review step; surface each funder's AI
   policy at draft time** (we store `ai_policy`/`ai_prohibited`/`ai_disclosure_required`
   on funders & opportunities for exactly this).
2. **Never train on customer data.** Use Gemini paid (no-training) or Groq (no-
   training). Make "your data never trains shared models" a marketing promise —
   it's table stakes (Instrumentl advertises it).
3. **Ground everything; verify citations.** The report's anti-hallucination
   architecture: retrieve from the org's own docs (our `document_chunks` +
   `match_document_chunks` RAG), and verify any AI citation exists before showing it.
4. **Keep data in private namespaces.** RLS already enforces per-user isolation
   on every table, including the RAG chunks.

---

## The architecture the report recommends (and where we are on it)

> Intake → Eligibility match → Requirement extraction → Retrieval (org docs +
> funder data) → Section-by-section drafting → Compliance check → **human
> review/edit** → submission-ready export.

| Pipeline stage | Backend ready? | AI wired? |
|---|---|---|
| Intake / org profile | ✅ profiles, onboarding_answers | — |
| Eligibility match | ✅ eligibility_checks(+items), opportunities.eligibility_rules | `ai_jobs: check_eligibility` (worker TBD) |
| Requirement extraction | ✅ opportunities.required_sections/format_rules | `ai_jobs` (worker TBD) |
| Retrieval (RAG) | ✅ document_chunks + match fn (pgvector) | embedding worker TBD |
| Section drafting | ✅ proposal_sections + templates | ✅ `generate-proposal` (Gemini+Groq) |
| Compliance check | ✅ format_check_runs(+items) | partial (frontend checklist exists) |
| Human review/edit | ✅ section statuses + revisions | UI exists |
| Export | — | TBD (submission-ready package) |

**✅ Built & deployed: the `ai-worker` Edge Function** drains the `ai_jobs`
queue with five job types live — `score_match`, `check_eligibility`,
`draft_section`, `write_budget_narrative`, `build_logic_model`. Same
Gemini→Groq pattern, JSON-mode output written straight to the feature tables,
RLS-scoped to the caller. Call it from the browser via the global
`runAiJob(jobType, input)` helper (e.g. `runAiJob('score_match', { opportunity_id })`).
Verified end-to-end (auth → job row → dispatch → graceful failure without a key);
produces real structured results once `GEMINI_API_KEY` is set. Remaining types
to add later: `run_format_check`, `extract_org_facts` (needs doc embeddings),
`write_report`, `discover_opportunities`.

---

## Recommended decisions, ranked

1. **Set `GEMINI_API_KEY` now** (free tier) to light up the generator + chatbot.
2. **Add `GROQ_API_KEY`** for the free privacy-safe fallback.
3. **Before onboarding real orgs: enable Gemini billing** (flips to no-training).
   This is the gate between "demo" and "real customers."
4. **Stay on Gemini Flash + Groq**; revisit Claude/GPT for premium drafting once
   you have paying users and a quality bar to beat.
5. **Make "we never train on your data" an explicit promise** in your UI/marketing.
