# Grange AI

**Grant help for organizations that can't afford a grant writer.** Grange AI finds the grants an
organization actually qualifies for, checks whether it's ready to apply, drafts the proposal in the
organization's own voice, and tracks deadlines and compliance after a win.

Live at **[grangeai.net](https://grangeai.net)**.

## The problem

Most small nonprofits, community groups and small businesses have no one whose job is finding and
writing grants. Federal and foundation applications are long, eligibility rules are hard to read, and
a missed registration (an EIN, a 501(c)(3) letter, a SAM.gov account) can sink an application before
anyone reads it. Grange AI walks a first-time applicant through the whole process.

## What it does

| Step | What the user gets |
|---|---|
| **Profile** | A short survey (or a Form 990 upload) builds one organization profile that every later step reads from. Works for registered nonprofits, fiscal sponsees, businesses, governments and groups that haven't incorporated yet. |
| **Discover** | Live federal opportunities from Grants.gov, filtered by the organization's type and focus areas, with a 0–100 match score; past federal awards to similar organizations from USASpending.gov; curated funders that don't require nonprofit status. |
| **Prepare** | A readiness checklist (documents funders ask for), an IRS status check, a guided SAM.gov setup, and a step-by-step path for groups that want to become a nonprofit or use a fiscal sponsor. An AI read of a specific funder's call says whether to apply and what it requires. |
| **Write** | A proposal generator that streams a full draft, grounded in the profile, a library of openly licensed winning proposals, and the user's own past proposals. Facts it couldn't confirm are highlighted for the user to check. An editing pass strips generic "AI voice". |
| **Manage** | Deadlines with staged reminders, and after an award: a compliance checklist and spending tracked against the budget. |

An in-app assistant answers questions about the current screen, and a guided tour introduces each step.

## How it's built

- **Front end:** [`index.html`](index.html), a single-page app in plain HTML, CSS and JavaScript
  (no framework, no build step), hosted on Cloudflare Pages. `three.js` drives the sign-in visuals.
- **Back end:** [Supabase](https://supabase.com): Postgres with row-level security on every user
  table, Auth (email/password, magic link, Google), Storage for uploaded documents, and Edge Functions
  in TypeScript ([`supabase/functions/`](supabase/functions)). The browser only holds the public
  publishable key; AI and API keys live in the functions.
- **Data sources:** Grants.gov Search and Opportunity APIs, USASpending.gov, and ProPublica's Nonprofit
  Explorer (IRS data), all called server-side.
- **AI:** Google Gemini for drafting, scoring and the assistant, with Groq (Llama 3.3 70B) as the
  fallback. Retrieval uses `gte-small` embeddings in pgvector. [`grantbench/`](grantbench) is a
  labeled evaluation suite for the scoring and judging prompts.
- **Schema:** [`supabase/schema.sql`](supabase/schema.sql) and [`supabase/migrations/`](supabase/migrations).
- [`app/`](app) and [`mobile/`](mobile) hold an earlier React/Vite build packaged for desktop (Electron)
  and phones (Capacitor). The live site is `index.html`.

## Run it locally

```bash
python3 -m http.server 3456      # then open http://localhost:3456
```

`config.js` points at the hosted Supabase project. To run against your own, follow
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

## Tests

[`qa/`](qa) runs the app in a headless browser against a fake Supabase backend, so it works offline and
never touches real data:

```bash
cd qa && npm install
node flows.mjs    # sign-up → tour → survey → dashboard, save a grant, draft a proposal, deadlines, readiness …
node sweep.mjs    # every screen at desktop and phone widths: console errors, sideways scroll, screenshots
node audit.mjs    # every inline handler calls a defined function; no duplicate or missing element ids
```

## Use of AI in building this project

Much of this codebase was written with **Claude Code**, Anthropic's AI coding assistant. Every commit
it helped write carries a `Co-Authored-By: Claude` trailer in the git history (70 of the first 80
commits), so the record of which changes involved AI is public and exact. The app itself also uses AI
at runtime (Gemini and Groq, above) to draft and score proposals.
