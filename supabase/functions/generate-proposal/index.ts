import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse';

const DAILY_LIMIT = 10; // proposals per user per day

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── 1. Authenticate ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Rate limit ─────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: usage } = await sb
    .from('proposal_usage')
    .select('id, count')
    .eq('user_id', user.id)
    .eq('used_on', today)
    .maybeSingle();

  const currentCount: number = (usage?.count as number) ?? 0;

  if (currentCount >= DAILY_LIMIT) {
    return new Response(
      JSON.stringify({ error: `Daily limit reached (${DAILY_LIMIT} proposals/day). Try again tomorrow.` }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Upsert usage row (increment before generation to prevent racing)
  if (usage) {
    await sb.from('proposal_usage').update({ count: currentCount + 1 }).eq('id', usage.id);
  } else {
    await sb.from('proposal_usage').insert({ user_id: user.id, used_on: today, count: 1 });
  }

  // ── 3. Forward to Gemini ──────────────────────────────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'Gemini API key not configured on server.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const geminiRes = await fetch(`${GEMINI_URL}&key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return new Response(errText, {
      status: geminiRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Stream Gemini's SSE response straight back to the client
  return new Response(geminiRes.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
