# Connecting Grange AI to a Supabase account

Follow these steps once to wire the app to your friend's Supabase project.
Everything is free-tier compatible.

---

## Step 1 — Create a Supabase project

1. Go to https://supabase.com and sign in (or create a free account).
2. Click **New project**, pick a name (e.g. `grange-ai`), choose a region
   close to your users, set a database password, and hit **Create project**.
3. Wait ~1 minute for it to spin up.

---

## Step 2 — Copy your project credentials into config.js

1. In the Supabase dashboard, go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **anon / public** key (the long `eyJ…` string under "Project API keys").
4. Open `config.js` in this repo (copy from `config.example.js` if it doesn't exist):

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',   // ← paste here
  anonKey: 'YOUR-ANON-PUBLIC-KEY',                // ← paste here
};
```

`config.js` is gitignored — it will never be committed.

---

## Step 3 — Run the database schema

1. In the Supabase dashboard, click **SQL Editor → New query**.
2. Paste the contents of `schema.sql` and click **Run**.
3. Then paste the contents of `supabase/migrations/20260613_proposal_usage.sql`
   and click **Run**.

This creates all the tables (profiles, onboarding_answers, grants, proposal_usage)
and enables Row Level Security on each.

---

## Step 4 — Enable Google OAuth (optional but recommended)

1. In the dashboard, go to **Authentication → Providers → Google**.
2. Toggle it **on**.
3. Follow the on-screen instructions to create a Google OAuth client ID + secret
   at https://console.cloud.google.com (takes ~5 minutes).
4. Paste the client ID and secret back into Supabase and save.

Without this step, email/password and magic-link sign-in still work.

---

## Step 5 — Install the Supabase CLI

```bash
# macOS / Linux
brew install supabase/tap/supabase

# Windows (PowerShell, run as admin)
winget install Supabase.CLI
```

Verify: `supabase --version`

---

## Step 6 — Log in and link the project

```bash
supabase login
# Opens a browser tab — approve access.

supabase link --project-ref YOUR-PROJECT-REF
# YOUR-PROJECT-REF is the subdomain from your Supabase URL
# e.g. if the URL is https://abcdefgh.supabase.co, the ref is abcdefgh
```

---

## Step 7 — Set the Gemini API key as a server secret

Get a free Gemini API key at https://aistudio.google.com/apikey, then:

```bash
supabase secrets set GEMINI_API_KEY=YOUR-GEMINI-KEY-HERE
```

The key never touches the browser. The Edge Function reads it via
`Deno.env.get('GEMINI_API_KEY')`.

---

## Step 8 — Deploy the Edge Function

```bash
supabase functions deploy generate-proposal
```

That's it. The function is now live at:
`https://YOUR-PROJECT-REF.supabase.co/functions/v1/generate-proposal`

The frontend already points to this URL automatically using
`window.SUPABASE_CONFIG.url`.

---

## Step 9 — Test it

Open `index.html` in a browser (or your local dev server), sign up /
sign in, complete onboarding, and generate a proposal. The request goes:

```
Browser → Supabase Edge Function (auth check + rate limit) → Gemini → back
```

If anything fails, open the Supabase dashboard → **Edge Functions →
generate-proposal → Logs** to see what went wrong.

---

## Rate limit

Each user can generate **10 proposals per day**. The count resets at
midnight UTC. To change the limit, edit `DAILY_LIMIT` at the top of
`supabase/functions/generate-proposal/index.ts` and redeploy:

```bash
supabase functions deploy generate-proposal
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Unauthorized" on generation | User is not signed in, or JWT expired — sign out and back in |
| "Daily limit reached" | Wait until midnight UTC, or raise `DAILY_LIMIT` and redeploy |
| "Gemini API key not configured" | Re-run Step 7 (`supabase secrets set …`) |
| Blank draft, no error | Check Edge Function logs in the Supabase dashboard |
| Google sign-in fails | Verify OAuth redirect URL in Google Cloud Console matches your domain |
