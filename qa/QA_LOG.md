# Grange AI — Congressional App Challenge QA log

Working branch: `claude/optimistic-rubin-xinlbi` (merge into `main` to go live on grangeai.net).
Submission deadline: Monday 2026-10-26, 12:00 p.m. ET for most districts (check yours).

## How to run the harness

```
cd qa && npm install          # Playwright + local copies of supabase-js, three.js, fonts
node smoke.mjs                # boots every test account, prints screen, console errors, queries
node sweep.mjs                # every screen x account x desktop/phone, scrolled screenshots in qa/out/
node flows.mjs                # click-through flows; checks what reached the (fake) database
node a11y.mjs                 # axe-core WCAG 2 A/AA audit of every screen
node monkey.mjs [screens] [account]   # clicks every visible button, reports JS errors
node labels.mjs [accounts] [width]    # labels not tied to a field, fields with no name
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
| 34 | Performance | `logo.png` (favicon and 26px brand mark) was a 1254×1254, 1.7 MB file loaded by every visitor. | Resized to 256×256: 60 KB. |
| 35 | Sharing | No meta description or link-preview tags. | Description + Open Graph/Twitter tags. |
| 36 | Readiness, Generator | When the AI service failed or returned nothing, the funder-call reader told users "Add a Gemini API key on the server (Supabase → Edge Functions → Secrets)". | "Couldn't read that call right now, try again" (with the sample as a fallback). No setup instructions are shown to users anywhere now. |
| 37 | Generator | While the Approach Plan waited for approval ("Nothing is written until you approve"), the progress panel above it said "Draft your proposal — Working / Write the statement of need — Drafting". | Panel holds at "waiting for your approval" with drafting not started, and resumes when the plan is approved. Approve / rethink / cancel covered by `approach-plan`. |
| 38 | Landing (laptop/tablet) | At 1280px and 1024px the page was wider than the screen (1296px / 1138px): the hero's 3D tablet and the fanned deadline cards stuck out. Hidden by `body { overflow-x: hidden }` on most desktops, but iPad Safari ignores that on `body`. | `#landing { overflow-x: clip }`. Swept clean at 12 widths from 360 to 1440. |
| 39 | Sign-in | **Blank page for returning users whose saved session no longer works** (signed out on another device — Supabase's default sign-out revokes every session — or a revoked refresh token). The page hides itself while it checks a saved token and was only revealed on a successful sign-in, so it stayed white forever. | Revealed when Supabase reports no session or a sign-out, plus a 6-second backstop. Covered by `revoked-session-not-blank`. |
| 40 | Sign-in, sign-up | During a Supabase outage (e.g. the free project pausing) sign-in showed the raw parser error `Unexpected token 'p', "project paused" is not valid JSON`; other auth errors showed Supabase's raw text. A failed sign-in or sign-up also left `_manualAuthFlow` on, so the auth listener ignored later sign-ins (Google, magic link) for the rest of the visit. | `authErrorText()` gives plain messages (wrong password, unconfirmed email, existing account, rate limit, servers unreachable); every failure path re-arms the listener. Covered by `backend-down-messages`. |
| 41 | Sign-in | A signed-in user opening the site during an outage silently landed on the public site (looking signed out), after the app tried to create a new profile because the read had failed. | A failed profile read (vs. no row) skips the insert and says the servers are unreachable, or that the session expired. Covered by `backend-down-signed-in` (fails on the old code). |
| 42 | Profile | The Financial documents boxes said "Drop a file or click to upload" but only toasted "Document upload is coming soon"; the SAM.gov box just repeated "Required for federal grants". | Real uploads (click, keyboard or drag-and-drop; PDFs up to 15 MB) into the same Storage bucket and `documents` table onboarding uses; saved files are listed and tick the matching readiness item. SAM.gov box links to the guided setup in Readiness. Covered by `profile-document-upload`. |
| 43 | Generator (security) | **The AI-written draft was put on the page as raw HTML.** A grant listing or exemplar carrying hidden instructions could get the writer to return markup like `<img onerror=…>`, which ran code in the user's signed-in session (and again whenever the saved draft was restored). The polish pass only blocked a few tag names. | `safeDraftHtml()` keeps only plain formatting tags (headings, paragraphs, bold, lists, tables) with no attributes, for the streamed draft, the polish and revision passes, and restored drafts. Covered by `draft-html-filtered` (fails on the old code: the injected code ran). |
| 44 | Generator | "Double-check" highlights showed `R&amp;D` instead of `R&D` (text escaped twice). | Decoded once before escaping. Covered by `draft-html-filtered`. |
| 45 | Whole app | The browser Back button left the app (or did nothing) because screens never created history entries; 14 `href="#"` links added a stray `#` to the address. | Each screen change is a history entry; Back/Forward move between screens, never back into sign-in or the public site for a signed-in user. With the phone menu, a dialog or the phone assistant open, Back just closes it. Covered by `browser-back-forward`. |
| 46 | Sign-in, Privacy, Terms | The sign-in "Terms / Privacy Notice / Cookie Policy" links and all 23 contents links on the Privacy and Terms pages went nowhere. | They open the page and jump to the section (Cookie Policy → Privacy §5). Covered by `keyboard-and-legal-links`. |
| 47 | Phone menu, assistant | Esc didn't close the phone menu or the assistant, and the menu didn't move keyboard focus into itself. The survey and tour logos were links to nowhere. | Esc closes both and returns focus; opening the menu from the keyboard focuses its first link. Logos there are plain images. Covered by `keyboard-and-legal-links`. |
| 48 | Phone menu, uploads | During an outage the phone menu could show app links before a profile loaded; file names with `#`, `?` or spaces made bad storage paths. | Menu waits for a loaded profile; storage paths keep only safe characters (the display name is unchanged). |
| 49 | Every form | Labels weren't tied to their fields (clicking "Mission statement" did nothing; screen readers relied on placeholders), and six fields had no label at all. Found by the new `labels.mjs` check. | Each label is linked to the field after it on every screen change; the six get names. Sign-up, sign-in and contact fields also get autofill hints (`new-password`, `current-password`, `email`…), so password managers work. `labels.mjs` reports 0. |
| 50 | Sign-up | Enter didn't submit, and a mistyped email (`maria@hopeharbor`) went to the server. | Enter submits from any field; the email is checked first. Covered by `forms-labels-and-keyboard`. |
| 51 | Survey | Choice chips didn't announce whether they were selected; the upload box said "Drop a file" but ignored drops, couldn't be reached by keyboard and accepted any file type. | Chips are a labelled group with `aria-pressed`; the box takes drops and Enter/Space, and asks for a PDF. |
| 52 | Generator, Readiness, Grant management, Sign-in | Click-only rows and links (`div`/`span`) couldn't be used from the keyboard: picking a saved grant to draft, "How to get it", compliance check-offs, "Email me a sign-in link", the IRS re-check, SAM.gov "change" links, the plan trace rows. Readiness status buttons didn't say which was selected. | Each is a tab stop with a button (or checkbox) role; one shared handler makes Enter/Space click them. Status buttons and the billing / plan-option toggles use `aria-pressed`. Covered by `keyboard-reachable-rows`. |
| 53 | Grant management, saving grants | supabase-js returns errors instead of throwing, so a failed "Mark as awarded", spending entry, compliance toggle or document removal looked like it worked (or did nothing). Saving a grant whose title was already saved twice inserted yet another copy every time. | All of these check the result and say when a save fails; the pipeline lookup takes the first match instead of requiring exactly one. Covered by `manage-save-failures` and `save-grant-twice-no-duplicates`. |
| 54 | Whole site | `supabase-js` loaded as `@2` from the CDN, so any new release went live on grangeai.net untested (for example during judging). | Pinned to 2.118.0, the version `qa/` runs against. |
| 55 | Offline / installed app | The service worker served every same-site file cache-first forever, `config.js` included, and cached error responses. A changed Supabase key or URL would never reach returning visitors. | Scripts and the manifest are network-first (cache only when offline), only successful responses are cached, and the cache version is bumped to clear old entries. Checked online and offline. |
| 56 | Org-info dialog, phone menu | The "Finish your organization info" dialog didn't take keyboard focus, Tab wandered to the page behind it, and closing it left focus nowhere. Tab also escaped the open phone menu. | Focus moves into the dialog, Tab and Shift+Tab stay inside it and the menu, and closing returns focus to the button that opened it. Covered by `dialog-focus`. |
| 57 | Phone menu, toasts | The "Ask Grange" button floated on top of the open phone menu, and on desktop the assistant's tip bubble covered confirmation toasts ("Added to your pipeline"). | The button hides while the menu is open; toasts move above the tip while it shows. |

## Needs Tim's decision

- **Draft credits (needs the Supabase connector reconnected).** `generate-proposal` reads the plan from `profiles.tier`, but the live `profiles` table had no `tier` column on 2026-10-15 (migration `20260626_subscription_tiers.sql` looks unapplied), so every account is treated as Free: 2 calls a month. One click of Draft makes up to three calls (Approach Plan, the draft, the editing pass), so a free account gets one draft a month. Fix: apply the tier migration, and count one credit per draft (the app sends a draft id with every pass; the function counts the first). Workaround before recording the demo: delete your own `proposal_usage` rows for this month in the Supabase table editor.

- **Pricing mismatch.** Landing page: Starter free / Growth $19.99 / Scale $39.99 (set June 19). In-app Pricing screen and Stripe checkout: Free / Starter $49 / Pro $149 (June 24–26). Visitors are shown lower prices than checkout charges. The landing page and sign-up also promise a "14-day trial", but there's no trial in the app: new accounts start on Free, and "Start Free Trial" switches plans with no end date. Pick one set of prices (and whether there's a trial) and I'll make every screen match.

- **Plans and billing (after Monday).** "Start Free Trial" sets `profiles.tier` straight from the browser with no payment ("Stripe to be wired later"), and row-level security lets any user update their own `tier`, so anyone could give themselves Pro once the column exists. Before charging: let only the Stripe webhook set `tier` (for example `revoke update (tier) on profiles from authenticated`), fix `stripe-webhook` (it needs `verify_jwt` off with Stripe signature checking, and it updates by `id` instead of `user_id`).
- **Security page claims (before judging).** The Security page says data is "backed up daily with point-in-time recovery… stored in a geographically separate region. Backup restoration is tested quarterly", that services "run across multiple availability zones" with "automated failover", that there are separate "production, staging, development" environments, a WAF, audit logging and regular penetration tests. On the free Supabase plan with one project, several of these are probably not true today (point-in-time recovery is a paid add-on). Suggest keeping what Supabase and Cloudflare do provide (TLS, encryption at rest, row-level security, bcrypt password hashing, Cloudflare's network) and removing or softening the rest, e.g. "We plan to add…". Your call; I haven't changed the wording.

## Verified working (flows.mjs, all passing)

Sign up → guided tour (normal + reduced motion) → survey → dashboard; returning sign-in with
password → dashboard → sign out (session cleared); magic-link request; profile save/reload;
contact hand-off; Discovery save (grant + deadline + reminders) → Draft → streamed proposal →
outcome "Won" saved; assistant chat reply; IRS check; funder-call analysis; record an award,
log spending, toggle compliance; legacy-account type picker writes `tax_exempt_status`;
deadlines done/reopen; readiness "Have it"; failure paths (survey save, readiness save,
monthly draft limit, revoked session, full backend outage); Approach Plan approve / rethink / cancel;
profile document upload; browser Back/Forward; AI draft HTML filtered (live and restored); Esc closes
the phone menu and assistant; sign-in and Privacy/Terms contents links; labels and Enter on forms; keyboard use of rows,
checklists and toggles; failed Grant management saves are reported. Static audit: all 96 inline-handler functions
exist, no duplicate ids. Sweep: 0 console errors, no sideways scroll on any screen at 12 widths
(360–1440). Monkey test: 350 buttons clicked across all accounts, 0 JS errors. Accessibility: 0 axe violations.

## Next up

- Server-side (needs Supabase connector): apply `profiles.tier` migration, count one credit per draft in `generate-proposal`, revoke `match_exemplar_chunks` from anon, fix `stripe-webhook`.
- Pricing decision from Tim, then make landing and in-app pricing match.
