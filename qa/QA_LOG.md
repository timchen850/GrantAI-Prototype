# Grange AI — Congressional App Challenge QA log

Working branch: `claude/optimistic-rubin-xinlbi` (merge into `main` to go live on grangeai.net).
Submission deadline: Monday 2026-10-26, 12:00 p.m. ET for most districts (check yours).

## How to run the harness

```
cd qa && npm install          # Playwright + local copies of supabase-js, three.js, fonts
node smoke.mjs                # boots every test account, prints screen, console errors, queries
node sweep.mjs                # every screen x account x desktop/phone, scrolled screenshots in qa/out/
node flows.mjs                # click-through flows; checks what reached the (fake) database
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
| 11 | Landing (phone) | Stat captions ran into each other ("…working grantOf nonprofits…"): the 2-column grid had no gap. | `column-gap: 24px`. |
| 12 | Landing (phone) | Match-scoring card lost its four score bars when it stacked. | Bars container gets full width. |
| 13 | Security (phone) | Stats wrapped one per row with stray divider lines. | Proper grid: 4 across, 2×2 on phones. |
| 14 | Security | "99.9% Uptime SLA" promised a contractual guarantee; the page's own text says "we target 99.9%" (and the free Supabase plan has no SLA). | Label now "Uptime target". |
| 15 | Privacy, Terms | "Last updated June 5, 2025" — the policies were written in June 2026. | June 5, 2026. |
| 16 | Profile | Program description box was filled with the people-served number (340) and never saved; logic-model boxes and removed program tags were never saved either. Anything typed there was lost on reload. | Saved to `onboarding_answers` (`beneficiaries`, `lm_*`, `primary_programs`) and reloaded; save errors now surface. Covered by `flows.mjs`. |
| 17 | Contact | The form never sent anything: it waited 900ms and showed "Message received!". | Opens the visitor's email app with the message addressed to support, says so plainly, gives the address as a fallback; validates email; no `alert()`. |
| 18 | Assistant (desktop) | The tip bubble sat over grant cards' action buttons until closed. | Hides on scroll or after 9 seconds. |
| 19 | Generator/Manage (phone) | Pro/Starter upsell banners squeezed their text into a 120px column. | Button drops under the text on phones. |
| 20 | Onboarding | Survey save failures were silent: supabase-js reports errors in `.error` (it doesn't throw), so the user saw "Profile saved! Welcome" and landed on the dashboard with nothing saved. | Checks `.error`; on failure stays on the survey with answers intact, explains, re-enables Finish. Covered by `onboarding-save-failure`. |

## Needs Tim's decision

- **Pricing mismatch.** Landing page: Starter free / Growth $19.99 / Scale $39.99 (set June 19). In-app Pricing screen and Stripe checkout: Free / Starter $49 / Pro $149 (June 24–26). Visitors are shown lower prices than checkout charges. Pick one and I'll make both match.

## Verified working (flows.mjs, all passing)

Sign up → guided tour (normal + reduced motion) → survey → dashboard; profile save/reload;
contact hand-off; Discovery save (grant + deadline + reminders) → Draft → streamed proposal;
legacy-account type picker writes `tax_exempt_status`; deadlines done/reopen; readiness
"Have it"; onboarding save failure handling. Static audit: all 96 inline-handler functions
exist, no duplicate ids. Sweep: 0 console errors, no sideways scroll on any screen.

## Next up

- Visual review: tour, survey, sign-in steps, modals, generator output, mobile menu; `biz`/`legacy` differences.
- Other silent `.error` swallowing on writes (grant save, deadlines, readiness).
- Submission materials: README for judges, AI-use disclosure notes, demo-video script.
