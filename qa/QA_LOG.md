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
| 21 | Generator | The "Grange is writing your proposal" panel could end stuck on "Draft your proposal — Working": its prep animation is timed (~3s) and a fast AI response finished first, then the queued steps flipped it back. | `finish()`/`fail()` cancel queued steps and complete the prep phases. |
| 22 | Phone menu | Signed-in menu had no Grant management, Pricing or tour; on the Pricing screen it showed the visitor menu ("Sign in", "Start free") to signed-in users. | Menu keyed on being signed in; matches the desktop sidebar. |
| 23 | Dialogs | The Ask Grange button (z-index 9000) floated over every dialog (z-index 1000), covering "Finish now" on phones; the tip stayed beside the org-info dialog. | Hidden while a dialog is open; tip dismissed when the dialog opens. |
| 24 | Generator (phone) | Draft header squeezed the funder name into 3 lines and cut off Export. | Header wraps under 560px. |
| 25 | Tour | "100%" wrapped its % sign under the number (grid item); step 3/5 guide bubbles could revert to the "tap the document" hint after it was tapped (900ms/800ms timer race); step 5 still said "due soon" after scheduling. | Ring on one line; timers check state; label updates. |
| 26 | Discovery | "Eligibility read" heading had no space above it in the AI assessment panel. | Top margin. |
| 27 | Generator | Failed drafts showed "Generation failed: API error 429": the function sends `{ error: "<text>" }` but the app read `error.message`, so the monthly-limit notice ("Monthly limit reached… Upgrade to Starter…") never reached the user; outages showed raw status codes. | `genErrorText()` passes the server's message through and words 401/5xx/offline plainly. Covered by `draft-limit-message`. |
| 28 | Discovery | When the AI service failed, the assessment panel told users to "Add a Gemini API key on the server (Supabase → Edge Functions → Secrets)". | Plain "isn't available right now, try again" message; detail goes to the console. |
| 29 | Accessibility | axe-core (WCAG 2 A/AA) flagged 91 elements: the brand accent `#d94f30` was 4.1:1 as text on white and on white button labels, 3.5:1 on its tint; success green and warning text just under 4.5:1; faded completed deadlines at 2.8:1; legal-page links distinguishable by color only; 4 unlabeled selects; 5 scroll areas unreachable by keyboard. | `--accent` `#c34426`, `--ok` `#2b7449`, `--warn-ink` `#8a5f13` (same look, all ≥4.5:1); tinted pills use `--accent-ink`; completed deadlines struck through instead of faded; legal links underlined; selects labelled; scroll areas focusable. Now 0 violations on every screen, all accounts, desktop and phone (`qa/a11y.mjs`). |
| 30 | Tour (phone) | The guide's speech bubble ran off the right edge on every step ("Three strong matches surfaced fr…"): it was centred on the orb, which sits at the screen edge when it points at Continue. | Bubble nudged back on screen, arrow still points at the orb; checked at 390px and 360px on every step. |
| 31 | Toasts | Messages slid in under the Ask Grange button, which covered their ends. | Raised above it on the screens that show it; full-width on phones. |
| 32 | Dashboard | A returning user with a complete profile and tracked grants was told "Complete your profile and run grant discovery to get started." | Subtitle reflects what they're tracking / whether the profile is done. |
| 33 | Readiness, nonprofit path, Pricing | Status buttons and plan changes ignored `.error`: a failed save looked saved, and "Start Free Trial" said "Plan updated to Pro!" even when the database rejected it. | Failures show "Couldn't save that" / "Couldn't change your plan"; the plan only changes locally after the database accepts it. Covered by `save-failures-are-visible`. |

## Needs Tim's decision

- **Draft credits (needs the Supabase connector reconnected).** `generate-proposal` reads the plan from `profiles.tier`, but the live `profiles` table had no `tier` column on 2026-10-15 (migration `20260626_subscription_tiers.sql` looks unapplied), so every account is treated as Free: 2 calls a month. One click of Draft makes up to three calls (Approach Plan, the draft, the editing pass), so a free account gets one draft a month. Fix: apply the tier migration, and count one credit per draft (the app sends a draft id with every pass; the function counts the first). Workaround before recording the demo: delete your own `proposal_usage` rows for this month in the Supabase table editor.

- **Pricing mismatch.** Landing page: Starter free / Growth $19.99 / Scale $39.99 (set June 19). In-app Pricing screen and Stripe checkout: Free / Starter $49 / Pro $149 (June 24–26). Visitors are shown lower prices than checkout charges. Pick one and I'll make both match.

## Verified working (flows.mjs, all passing)

Sign up → guided tour (normal + reduced motion) → survey → dashboard; profile save/reload;
contact hand-off; Discovery save (grant + deadline + reminders) → Draft → streamed proposal;
legacy-account type picker writes `tax_exempt_status`; deadlines done/reopen; readiness
"Have it"; onboarding save failure handling. Static audit: all 96 inline-handler functions
exist, no duplicate ids. Sweep: 0 console errors, no sideways scroll on any screen.

- **Plans and billing (after Monday).** "Start Free Trial" sets `profiles.tier` straight from the browser with no payment ("Stripe to be wired later"), and row-level security lets any user update their own `tier`, so anyone could give themselves Pro once the column exists. Before charging: let only the Stripe webhook set `tier` (for example `revoke update (tier) on profiles from authenticated`), fix `stripe-webhook` (it needs `verify_jwt` off with Stripe signature checking, and it updates by `id` instead of `user_id`).

## Next up

- Visual review: tour, survey, sign-in steps, modals, generator output, mobile menu; `biz`/`legacy` differences.
- Other silent `.error` swallowing on writes (grant save, deadlines, readiness).
- Submission materials: README for judges, AI-use disclosure notes, demo-video script.
