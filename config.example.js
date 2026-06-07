// ─────────────────────────────────────────────────────────────
// Grange AI — Supabase client config
//
// 1. Copy this file to `config.js`
// 2. Fill in your project URL + anon public key (Supabase dashboard →
//    Project Settings → API)
// 3. `config.js` is gitignored — never commit it.
//
// NOTE: the anon public key is SAFE to expose in the browser. It only
// grants whatever Row Level Security allows. The secret/service_role key
// must NEVER appear in this file or anywhere client-side.
// ─────────────────────────────────────────────────────────────
window.SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',
  anonKey: 'YOUR-ANON-PUBLIC-KEY',
};

// Gemini API key — get a free key at aistudio.google.com/apikey
// Dev only — move behind a Supabase Edge Function before production.
window.GEMINI_API_KEY = 'YOUR-GEMINI-API-KEY';
