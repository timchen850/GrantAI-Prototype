# Grange AI — Congressional App Challenge QA log

Working branch: `claude/optimistic-rubin-xinlbi` (merge into `main` to go live on grangeai.net).
Submission deadline: Monday 2026-10-26, 12:00 p.m. ET for most districts (check yours).

## How to run the harness

```
cd qa && npm install          # Playwright + local copies of supabase-js, three.js, fonts
node smoke.mjs                # boots every test account, prints screen, console errors, queries
node sweep.mjs                # every screen x account x desktop/phone, screenshots in qa/out/
```

The harness (`harness.mjs`, `fixtures.mjs`) runs `index.html` in Chromium with a fake
Supabase backend in the browser: no network, no real user data. Test accounts: `visitor`,
`newuser`, `np` (complete 501(c)(3) with grants and deadlines), `legacy` (type `unknown`),
`biz` (not a nonprofit), `onboarding` (half-finished survey).

## Fixed

| # | Area | Bug | Fix |
|---|------|-----|-----|
| 1 | Sign-in | Every page load ran the sign-in routine twice (Supabase fires `INITIAL_SESSION` and `SIGNED_IN` together), so every query ran twice and the dashboard rendered twice. For a new user without a profile row, the second run's insert hit the unique key and sent them back to the landing page. | `routeAfterAuth()` shares one in-flight run; `currentProfile()` re-reads the row if its insert loses a race. |

## Next up

- Static audit: inline handlers that call undefined functions, missing element ids, duplicate ids.
- Screen sweep at 1440px and 390px: console errors, sideways scroll, clipped or overlapping elements, spacing.
- Core flows: sign up, onboarding, discovery search, save grant, draft proposal, deadlines, readiness.
- Submission materials: README for judges, AI-use disclosure notes, demo-video script.
