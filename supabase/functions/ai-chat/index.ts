// Grange AI — grounded grant-advisor chatbot (server-side)
//
// Powers the in-app AI assistant. Authenticates the user, pulls their REAL
// org profile + pipeline + deadlines from the database (so answers are
// grounded, not generic), builds a grant-expert system prompt, and calls
// Gemini (primary) → Groq (fallback). Returns plain JSON { reply }.
//
// Secrets: GEMINI_API_KEY (required), GROQ_API_KEY (optional fallback).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash-lite'; // fast + cheap for chat
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SYSTEM = `You are Grange, a warm, plain-spoken grant advisor inside the Grange AI app.
Your users are often small nonprofits who have NEVER applied for a grant. Explain like a patient mentor: short paragraphs, no jargon without a one-line definition, concrete next steps.

Hard rules:
- Use the ORGANIZATION CONTEXT below to personalize. If a fact isn't there, ask for it rather than inventing it.
- NEVER invent specific grant names, dollar amounts, or deadlines. For live opportunities tell the user to open the Discovery tab (which pulls real grants from Grants.gov) or check the funder's official site.
- You assist; the user is always the author. For anything they'll submit, remind them to review and substantially revise — some funders (e.g. NIH) reject AI-written applications.
- For "how do I not lose the money / clawback" questions: spend only within approved budget categories, keep every receipt, never miss a report deadline (2 CFR 200.403).
- Keep replies under ~180 words unless asked for more.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const message: string = (body?.message ?? '').toString().slice(0, 4000);
  const history: Array<{ role: string; content: string }> = Array.isArray(body?.history) ? body.history.slice(-8) : [];
  if (!message.trim()) return json({ error: 'Empty message' }, 400);

  // ── Ground the model in the user's real data (RLS keeps it their own) ──
  let ctx = 'No organization profile yet — gently encourage the user to complete onboarding.';
  try {
    const [{ data: profile }, { data: deadlines }, { data: grants }] = await Promise.all([
      sb.from('profiles').select('org_name,mission,ntee_code,focus_areas,service_geographies,annual_budget,staff_count,tax_exempt_status').eq('user_id', user.id).maybeSingle(),
      sb.from('v_upcoming_deadlines').select('title,due_date,days_left').order('due_date').limit(5),
      sb.from('grants').select('title,funder,status').eq('user_id', user.id).limit(8),
    ]);
    if (profile?.org_name || profile?.mission) {
      const lines = [
        `Organization: ${profile.org_name || '(unnamed)'}`,
        profile.mission ? `Mission: ${profile.mission}` : '',
        profile.focus_areas?.length ? `Focus areas: ${profile.focus_areas.join(', ')}` : '',
        profile.service_geographies?.length ? `Serves: ${profile.service_geographies.join(', ')}` : '',
        profile.tax_exempt_status ? `Tax status: ${profile.tax_exempt_status}` : '',
        profile.annual_budget ? `Annual budget: $${profile.annual_budget}` : '',
      ].filter(Boolean);
      if (grants?.length) lines.push(`Grants in pipeline: ${grants.map((g: any) => `${g.title || g.funder} (${g.status})`).join('; ')}`);
      if (deadlines?.length) lines.push(`Upcoming deadlines: ${deadlines.map((d: any) => `${d.title} in ${d.days_left} days`).join('; ')}`);
      ctx = lines.join('\n');
    }
  } catch (_) { /* fall back to generic context */ }

  const fullPrompt = `${SYSTEM}\n\n=== ORGANIZATION CONTEXT ===\n${ctx}\n\n=== CONVERSATION ===\n` +
    history.map((h) => `${h.role === 'assistant' ? 'Grange' : 'User'}: ${h.content}`).join('\n') +
    `\nUser: ${message}\nGrange:`;

  // ── Gemini primary ──
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 700 } }) });
      if (res.ok) {
        const d = await res.json();
        const reply = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
        if (reply.trim()) return json({ reply: reply.trim(), model: GEMINI_MODEL });
      } else { console.error('Gemini chat failed', res.status, await res.text().catch(() => '')); }
    } catch (e) { console.error('Gemini chat threw', e); }
  }

  // ── Groq fallback ──
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: GROQ_MODEL, temperature: 0.6, max_tokens: 700,
          messages: [{ role: 'system', content: SYSTEM + '\n\nORGANIZATION CONTEXT:\n' + ctx },
            ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
            { role: 'user', content: message }] }) });
      if (res.ok) {
        const d = await res.json();
        const reply = d?.choices?.[0]?.message?.content ?? '';
        if (reply.trim()) return json({ reply: reply.trim(), model: GROQ_MODEL });
      } else { console.error('Groq chat failed', res.status, await res.text().catch(() => '')); }
    } catch (e) { console.error('Groq chat threw', e); }
  }

  return json({ error: 'AI assistant unavailable. Set GEMINI_API_KEY (and optionally GROQ_API_KEY) in Edge Function secrets.' }, 502);
});
