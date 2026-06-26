// Grange AI — Stripe webhook handler
// Stripe calls this after successful payments to upgrade the user's tier.
//
// Secrets required:
//   STRIPE_SECRET_KEY       — from Stripe dashboard
//   STRIPE_WEBHOOK_SECRET   — from Stripe dashboard (Webhooks → signing secret)
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function verifyStripeSignature(body: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;

  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computedHex === sig;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.text();
  const sigHeader = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  if (webhookSecret) {
    const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
    if (!valid) return json({ error: 'Invalid signature' }, 400);
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const type = event.type as string;
  const obj = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;

  if (type === 'checkout.session.completed') {
    const userId = (obj.metadata as Record<string, string>)?.user_id;
    const tier = (obj.metadata as Record<string, string>)?.tier;
    if (userId && tier) {
      await supabase.from('profiles').update({ tier }).eq('id', userId);
      console.log(`Upgraded user ${userId} to ${tier}`);
    }
  }

  if (type === 'customer.subscription.deleted') {
    // Subscription cancelled — drop back to free
    const meta = (obj.metadata as Record<string, string>) ?? {};
    const userId = meta.user_id;
    if (userId) {
      await supabase.from('profiles').update({ tier: 'free' }).eq('id', userId);
      console.log(`Downgraded user ${userId} to free (subscription cancelled)`);
    }
  }

  return json({ received: true });
});
