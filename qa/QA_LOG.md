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
| 2 | Dashboard (phone) | Page scrolled sideways (474px on a 390px phone): the hero's greeting and two buttons couldn't wrap. | Hero stacks under 640px; buttons wrap. |
| 3 | Generator (phone) | Page scrolled sideways (480px): a long saved-grant title stretched the `1fr` grid column. | `minmax(0, 1fr)` columns so the title truncates. |
| 4 | Dashboard (phone) | Setup steps squeezed their text into 3-word lines; the "move the button below" rule never applied. | Step text takes the full row, action goes underneath. |
| 5 | Dashboard | "Grant pipeline" said "No grants discovered yet" for users who had saved grants but no discovery results cached in this browser (new device). | Falls back to the user's tracked grants: drafting first, then saved, then submitted, with status and due-date pills. |
| 6 | Dashboard | "Proposals drafted —" while a grant was shown as Drafting. | Counts local drafts and drafting grants. |
| 7 | Assistant (phone) | The "Ask Grange" tip popped up on every screen and covered half the phone screen; closing it didn't stop the next one. The read of `sessionStorage` could throw inside `go()`. | No auto-tip on phones, launcher shrinks to the avatar, × stops tips for the session, storage access guarded. |
| 8 | Dashboard (phone) | KPI tiles stacked into 4 tall rows; journey cards into 5 tall rows. | 2×2 KPI grid and 2-column journey on phones. |
| 9 | Dashboard | Deadline day-count ran into the reminder text; "Complete profile" button shown on a complete profile. | Row gap + fixed-width count; button/copy switch to "View profile" at 100%. |
| 10 | Dashboard | Pipeline rows inserted grant titles from Grants.gov as raw HTML. | Escaped. |

## Next up

- Static audit: inline handlers that call undefined functions, missing element ids, duplicate ids.
- Screen sweep at 1440px and 390px: console errors, sideways scroll, clipped or overlapping elements, spacing.
- Core flows: sign up, onboarding, discovery search, save grant, draft proposal, deadlines, readiness.
- Submission materials: README for judges, AI-use disclosure notes, demo-video script.
