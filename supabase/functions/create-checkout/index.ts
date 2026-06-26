// Grange AI — Stripe Checkout session creator
// Called from the Pricing page when a user clicks "Start Free Trial".
// Creates a Stripe Checkout session and returns the URL to redirect to.
//
// Secrets required (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY   — from Stripe dashboard
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Stripe price lookup keys → created on first use if missing
const PRICES: Record<string, { amount: number; interval: 'month' | 'year'; nickname: string }> = {
  starter_monthly: { amount: 4900,   interval: 'month', nickname: 'Starter Monthly' },
  starter_annual:  { amount: 47040,  interval: 'year',  nickname: 'Starter Annual'  }, // $49 * 12 * 0.8
  pro_monthly:     { amount: 14900,  interval: 'month', nickname: 'Pro Monthly'      },
  pro_annual:      { amount: 143040, interval: 'year',  nickname: 'Pro Annual'       }, // $149 * 12 * 0.8
};

async function stripe(path: string, body?: Record<string, unknown>, method = 'POST') {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) opts.body = new URLSearchParams(body as Record<string, string>).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? JSON.stringify(data));
  return data;
}

async function getOrCreatePrice(lookupKey: string): Promise<string> {
  // Try to find existing price by lookup key
  const list = await stripe(`/prices/search?query=lookup_key:'${lookupKey}'&limit=1`, undefined, 'GET');
  if (list.data?.length) return list.data[0].id;

  // Create product then price
  const cfg = PRICES[lookupKey];
  const product = await stripe('/products', { name: cfg.nickname });
  const price = await stripe('/prices', {
    product: product.id,
    unit_amount: String(cfg.amount),
    currency: 'usd',
    'recurring[interval]': cfg.interval,
    lookup_key: lookupKey,
    transfer_lookup_key: 'true',
  });
  return price.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Auth: require logged-in user
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { tier, billing } = await req.json();
    if (!['starter', 'pro'].includes(tier)) return json({ error: 'Invalid tier' }, 400);
    if (!['monthly', 'annual'].includes(billing)) return json({ error: 'Invalid billing' }, 400);

    const lookupKey = `${tier}_${billing}`;
    const priceId = await getOrCreatePrice(lookupKey);

    // App URL for redirects (works locally and in prod)
    const origin = req.headers.get('origin') ?? 'https://grangeai.com';

    const session = await stripe('/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${origin}/?payment=success&tier=${tier}`,
      cancel_url: `${origin}/?payment=cancelled`,
      customer_email: user.email!,
      'metadata[user_id]': user.id,
      'metadata[tier]': tier,
      'subscription_data[metadata][user_id]': user.id,
      'subscription_data[metadata][tier]': tier,
      allow_promotion_codes: 'true',
      'billing_address_collection': 'auto',
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return json({ error: String(err) }, 500);
  }
});
