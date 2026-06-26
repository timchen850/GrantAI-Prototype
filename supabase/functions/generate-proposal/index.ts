// Grange AI — proposal generator (server-side AI proxy)
//
// Why this lives on the server: the AI API key must NEVER ship to the browser.
// This Edge Function authenticates the user, enforces a per-user daily quota,
// then calls Gemini (primary) with a Groq fallback (free, privacy-safe) if
// Gemini errors. It ALWAYS streams back in Gemini's SSE shape so the existing
// frontend parser needs no changes.
//
// Secrets required (Supabase → Project Settings → Edge Functions → Secrets):
//   GEMINI_API_KEY   (from aistudio.google.com/apikey)
//   GROQ_API_KEY     (optional fallback, from console.groq.com/keys)
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function sendEmail(userId: string, emailType: string, data: Record<string, string>) {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ user_id: userId, email_type: emailType, data }),
    });
  } catch (e) { console.error('sendEmail failed', e); }
}

const GEMINI_MODEL = 'gemini-2.5-flash'; // current, free-tier eligible, strong prose
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Monthly draft limits per tier (Pro = no cap)
const TIER_LIMITS: Record<string, number> = { free: 2, starter: 15, pro: Infinity };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Wrap text in Gemini's SSE envelope so the frontend parser
// (candidates[0].content.parts[0].text) works for the Groq path too.
const geminiChunk = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // ── 1. Authenticate ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  // ── 2. Per-user monthly rate limit (plan-aware) ──────────────
  // Fetch the user's tier from profiles
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: prof } = await sbAdmin.from('profiles').select('tier').eq('user_id', user.id).maybeSingle();
  const tier: string = (prof?.tier as string) || 'free';
  const monthlyLimit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

  const today = new Date().toISOString().slice(0, 10);
  // Sum all drafts this calendar month
  const monthStart = today.slice(0, 7) + '-01'; // YYYY-MM-01
  const { data: monthlyRows } = await sb
    .from('proposal_usage').select('id, count, used_on')
    .eq('user_id', user.id).gte('used_on', monthStart);
  const monthlyTotal: number = (monthlyRows ?? []).reduce((s: number, r: any) => s + ((r.count as number) ?? 0), 0);

  if (monthlyTotal >= monthlyLimit) {
    const upgrade = tier === 'free' ? 'Upgrade to Starter for 15 drafts/month.' : tier === 'starter' ? 'Upgrade to Pro for unlimited drafts.' : '';
    return json({ error: `Monthly limit reached (${monthlyLimit} drafts/month on ${tier} plan). ${upgrade}`.trim() }, 429);
  }

  // Increment today's row up-front to avoid races; refunded below if BOTH providers fail
  const { data: usage } = await sb
    .from('proposal_usage').select('id, count')
    .eq('user_id', user.id).eq('used_on', today).maybeSingle();
  const currentCount: number = (usage?.count as number) ?? 0;
  let usageId = usage?.id as string | undefined;
  if (usageId) {
    await sb.from('proposal_usage').update({ count: currentCount + 1 }).eq('id', usageId);
  } else {
    const { data: ins } = await sb.from('proposal_usage')
      .insert({ user_id: user.id, used_on: today, count: 1 }).select('id').single();
    usageId = ins?.id;
  }
  const refund = async () => {
    if (usageId) await sb.from('proposal_usage').update({ count: currentCount }).eq('id', usageId);
  };

  // ── 3. Parse the request (Gemini-shaped body from the frontend) ──
  let body: any;
  try { body = await req.json(); }
  catch { await refund(); return json({ error: 'Invalid JSON body' }, 400); }

  // ── 4. Primary: Gemini (stream straight through) ─────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiKey) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok && res.body) {
        // Fire proposal-ready email after streaming starts (non-blocking)
        sendEmail(user.id, 'proposal_ready', {
          grant_title: (body?.contents?.[0]?.parts?.[0]?.text || '').slice(0, 80),
        });
        return new Response(res.body, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        });
      }
      console.error('Gemini failed', res.status, await res.text().catch(() => ''));
    } catch (e) { console.error('Gemini threw', e); }
  }

  // ── 5. Fallback: Groq (translate prompt + re-emit as Gemini SSE) ──
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (groqKey) {
    try {
      const prompt = (body?.contents ?? [])
        .flatMap((c: any) => (c?.parts ?? []).map((p: any) => p?.text || ''))
        .join('\n');
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          stream: true,
          temperature: body?.generationConfig?.temperature ?? 0.7,
          max_tokens: body?.generationConfig?.maxOutputTokens ?? 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buf = '';
        const stream = new ReadableStream({
          async pull(ctrl) {
            const { done, value } = await reader.read();
            if (done) { ctrl.close(); return; }
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n'); buf = lines.pop() ?? '';
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith('data:')) continue;
              const payload = t.slice(5).trim();
              if (payload === '[DONE]') continue;
              try {
                const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                if (delta) ctrl.enqueue(encoder.encode(geminiChunk(delta)));
              } catch { /* keepalive */ }
            }
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        });
      }
      console.error('Groq failed', res.status, await res.text().catch(() => ''));
    } catch (e) { console.error('Groq threw', e); }
  }

  // ── 6. Both providers unavailable → refund the quota and report ──
  await refund();
  return json({ error: 'AI provider unavailable. Set GEMINI_API_KEY (and optionally GROQ_API_KEY) in Edge Function secrets.' }, 502);
});
