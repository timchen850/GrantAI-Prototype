# Grange AI — backend & AI setup status

This project is already wired to the live Supabase project **GrangeAI**
(`xewrvmqyzeiziimcmenj`). Most of your friend's checklist is **already done** —
applied directly to the live project via the Supabase API. Here's the true
current state and the one step that's left.

---

## ✅ Already done (live right now)

| Step | Status |
|---|---|
| Supabase project created & `config.js` pointed at it | ✅ done (`xewrvmqyzeiziimcmenj`) |
| `schema.sql` + all migrations run | ✅ done — **45 tables**, RLS on every one |
| `proposal_usage` quota table | ✅ created |
| Edge Function `generate-proposal` (Gemini + Groq fallback) | ✅ **deployed & ACTIVE** |
| Edge Function `ai-chat` (grounded chatbot) | ✅ **deployed & ACTIVE** |
| Security/performance advisors | ✅ clean (one dashboard toggle, below) |

You do **not** need the Supabase CLI, and you do **not** need to create a new
project. Both Edge Functions are already deployed and responding (verified:
they correctly return `401 Unauthorized` without a login, and CORS works).

---

## 🔑 The ONE step left: add your AI API key(s) as server secrets

The functions are live but can't reach an AI model until you give them a key.
The key lives **only on the server** — never in the browser. Two ways:

### Option A — Supabase Dashboard (no CLI needed) ← recommended

1. Get a free Gemini key at **https://aistudio.google.com/apikey**.
2. In the Supabase dashboard for project `GrangeAI`, go to
   **Project Settings → Edge Functions → Secrets** (a.k.a. "Manage secrets").
3. Add a secret:
   - Name: `GEMINI_API_KEY`  Value: *(your key)*
4. (Optional but recommended) Add a free Groq key from
   **https://console.groq.com/keys** as `GROQ_API_KEY` — this is the
   privacy-safe fallback used automatically if Gemini errors or is rate-limited.
5. Save. The functions pick it up within a few seconds — no redeploy needed.

### Option B — Supabase CLI

```bash
brew install supabase/tap/supabase     # if not installed
supabase login
supabase link --project-ref xewrvmqyzeiziimcmenj
supabase secrets set GEMINI_API_KEY=your-key-here
supabase secrets set GROQ_API_KEY=your-groq-key-here   # optional fallback
```

> ⚠️ **Read `AI_STRATEGY.md` before going live with real users.** The Gemini
> **free** tier trains on your data and tells you not to submit confidential
> info — which is wrong for real nonprofit grant data. The fix is one click
> (enable billing → flips Google's policy to "no training"), and it stays
> near-free (~$2/month at real usage). Full analysis in that doc.

---

## 🔒 One dashboard toggle to flip

**Authentication → Providers/Policies → enable "Leaked password protection."**
This checks new passwords against HaveIBeenPwned. It's the only outstanding
security-advisor item and can only be set in the dashboard.

---

## How it works (so you can explain it)

```
Browser  ──Bearer JWT──▶  Edge Function (auth + per-user rate limit)
                              │  key from server secret (never in browser)
                              ▼
                          Gemini 2.5 Flash  ──(if it fails)──▶  Groq Llama-3.3-70B
                              │
                              ▼  streamed back
                          Browser renders the draft
```

- **`generate-proposal`** — the proposal generator. Streams the draft. Capped at
  **10 proposals/user/day** (`DAILY_LIMIT` in the function; failed generations
  are refunded).
- **`ai-chat`** — the in-app assistant (bottom-right bubble). Pulls the signed-in
  org's real profile, pipeline, and deadlines (RLS-scoped) so answers are
  grounded, not generic.

Both functions are in `supabase/functions/`. To change a model or the rate
limit, edit the file and redeploy (CLI `supabase functions deploy <name>`, or
ask Claude to redeploy via the Supabase tools).

---

## Test it

1. Set the `GEMINI_API_KEY` secret (above).
2. Open the site, sign in, complete onboarding.
3. Click the chat bubble (bottom-right) → ask "How do I start?" → you should get
   a grounded answer.
4. Go to Generator → pick a grant → Generate → the draft should stream in.
5. If anything fails, check **Edge Functions → Logs** in the dashboard.

| Symptom | Fix |
|---|---|
| "AI provider unavailable" / 502 | `GEMINI_API_KEY` secret not set (or both providers failing) |
| "Unauthorized" | Not signed in / JWT expired — sign out and back in |
| "Daily limit reached" | 10/day cap hit; resets at midnight UTC, or raise `DAILY_LIMIT` |
| Chatbot says "Please sign in" | Open it from inside the app while signed in |
