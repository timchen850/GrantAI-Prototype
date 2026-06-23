# GrantBench

A labeled evaluation harness for Grange AI's AI engines — the report's
recommendation #7 ("build a GrantBench à la Harvey's BigLaw Bench and run
rubric-based LLM-as-judge evals in CI on every prompt/model change").

It catches regressions in the engines that the rubric/judge feature depends on:
the funder **rubric extraction**, the **eligibility verdict**, and the
**LLM-as-judge** scoring (`parse_rfp`, `judge_proposal` in `ai-worker`).

## What it measures

| Category | Engine exercised | Pass criterion | Gate |
|---|---|---|---|
| `rubric_extraction` | `parse_rfp` rubric | `source` stated/inferred correct; stated weights match | source ≥ 0.85, weights ≥ 0.75 |
| `eligibility_verdict` | `parse_rfp` verdict | verdict == labeled go/caution/stop | acc ≥ 0.70, **0** go↔stop confusions |
| `judge_quality` | `judge_proposal` | score lands in the labeled band (**calibration**) | ≥ 0.70 |
| `judge_discrimination` | `judge_proposal` | strong draft beats weak by the required margin | ≥ 0.80 |
| `robustness` | `judge_proposal` | injection resisted; empty/short input rejected | **1.0** (all) |

The build fails if any gate is missed. Thresholds live in `THRESHOLDS` at the
top of `run.mjs`. The `judge_quality` "in-band" rate is the report's
**calibration** metric — its benchmark guidance: **>0.85 → expand the judge's
authority** (auto-accept high-confidence sections); **<0.70 → keep tighter
human review**.

## Running locally

```bash
node grantbench/run.mjs                 # full suite
node grantbench/run.mjs --type judge_quality   # one category
node grantbench/run.mjs --quiet         # gates only, no per-case lines
```

No setup or secrets needed: it reads the project URL + **publishable (anon)**
key from `../config.js` (public by design) and authenticates a single
throwaway eval account (`grantbench@grange-test.dev`) that only ever holds
overwritten junk eval data, RLS-scoped to itself. Override via env:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GRANTBENCH_EMAIL`, `GRANTBENCH_PASSWORD`.

Exit codes: `0` all gates met · `1` a real quality regression (a gate failed) ·
`2` **inconclusive** (provider unavailable / setup error — *not* an engine
regression).

**Provider rate limits & inconclusive runs.** The engines run on a free Groq
tier with a tokens-per-minute limit. The harness paces calls
(`GRANTBENCH_PACE_MS`, default 2500) and retries transient errors a few times.
A call the provider can't serve is recorded as a **skip** (`⊘`), excluded from
the pass/total rates — a rate-limited provider is not an engine failure. If more
than 30% of cases are skipped, the whole run is **inconclusive** (exit 2) rather
than a false regression. CI treats exit 2 as a warning, not a build failure.
Bump `GRANTBENCH_PACE_MS` (e.g. `5000`) for a slower, more reliable run, or move
evals to a paid model tier (the report's "route by task / use a paid model"
guidance) to remove the limit entirely.

## The dataset

`dataset.json` holds the labeled cases. Each was **authored and then
adversarially verified** by an independent grader (a second model re-derives
the expected label and the case is dropped if it disagrees), so the gold labels
are a two-grader consensus rather than a single opinion.

> **Calibration caveat (from the report):** these gold labels stand in for human
> grades. To make the calibration metric authoritative, replace or augment the
> `judge_quality` bands with a 5–10% **human-graded** sample over time — the
> case schema already carries a per-case band you can tighten to a human score.

To regenerate/extend the dataset, re-run the `grantbench-dataset` workflow
(author → adversarial verify) and write its `cases` array to `dataset.json`.

## CI

`.github/workflows/grantbench.yml` runs on `workflow_dispatch`, on pushes that
touch the engines (`supabase/functions/ai-worker/**`, `index.html`,
`grantbench/**`), and weekly (to catch upstream **model drift**).

**Important:** edge functions are deployed out-of-band (via Supabase), not by
this repo's CI, so GrantBench evaluates whatever `ai-worker` version is
currently **live**. Run it *after* deploying a prompt/model change — or rely on
the weekly schedule — rather than treating a green check on the same commit as
proof the new prompt is live.
