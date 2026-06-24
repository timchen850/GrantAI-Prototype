// Grange AI — usaspending-search
// Coverage beyond open RFPs (report §2.1 / §2.5): surfaces WHO actually funds
// work like the org's, from the FREE USASpending historical federal
// assistance-award data (no API key, no auth on USASpending's side). Even when
// there is no open opportunity, this shows the agencies that have funded similar
// organizations and the realistic award sizes — the win-probability signal.
// DETERMINISTIC (no LLM, does not touch the AI provider quota).
// Body: { keywords: string[], state?: string }.  Auth: own (verify_jwt=false).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const GRANT_CODES = ['02', '03', '04', '05']; // block / formula / project grant / cooperative agreement
const FIELDS = ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Awarding Sub Agency', 'Start Date', 'End Date', 'Description'];

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function yearOf(d: string): string { const m = /^(\d{4})/.exec((d || '').toString()); return m ? m[1] : ''; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const keywords = (Array.isArray(body?.keywords) ? body.keywords : [])
    .map((k: any) => (k || '').toString().trim().slice(0, 40)).filter(Boolean).slice(0, 6);
  if (!keywords.length) return json({ error: 'Provide at least one keyword (e.g. your focus areas).' }, 400);
  const state = (body?.state || '').toString().trim().toUpperCase().slice(0, 2);

  // Last ~4 federal fiscal years of awards.
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getFullYear() - 4, 0, 1).toISOString().slice(0, 10);

  const filters: any = { award_type_codes: GRANT_CODES, keywords, time_period: [{ start_date: start, end_date: end }] };
  if (/^[A-Z]{2}$/.test(state)) filters.recipient_locations = [{ country: 'USA', state }];

  let data: any;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ filters, fields: FIELDS, page: 1, limit: 100, sort: 'Start Date', order: 'desc' }),
    });
    clearTimeout(t);
    if (!res.ok) return json({ error: 'The federal spending database is unavailable right now. Try again shortly.' }, 502);
    data = await res.json();
  } catch (_) {
    return json({ error: 'The federal spending lookup timed out. Try again shortly.' }, 502);
  }

  const rows: any[] = Array.isArray(data?.results) ? data.results : [];
  const total_found = Number(data?.page_metadata?.total) || rows.length;

  const amounts = rows.map(r => Number(r['Award Amount'])).filter(n => Number.isFinite(n) && n > 0);

  // Aggregate by sub-agency (fall back to agency) — these are the real funders.
  const agg: Record<string, { name: string; count: number; total: number; amts: number[] }> = {};
  for (const r of rows) {
    const name = ((r['Awarding Sub Agency'] || r['Awarding Agency'] || '').toString().trim()) || 'Unknown agency';
    const amt = Number(r['Award Amount']) || 0;
    (agg[name] ||= { name, count: 0, total: 0, amts: [] });
    agg[name].count++; agg[name].total += amt; if (amt > 0) agg[name].amts.push(amt);
  }
  const agencies = Object.values(agg)
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 6)
    .map(a => ({ name: a.name, count: a.count, total: Math.round(a.total), typical: median(a.amts) }));

  // A few recent distinct recipients as concrete proof.
  const seen = new Set<string>();
  const recipients: any[] = [];
  for (const r of rows) {
    const nm = (r['Recipient Name'] || '').toString().trim();
    if (!nm || seen.has(nm)) continue;
    seen.add(nm);
    recipients.push({
      name: nm,
      amount: Math.round(Number(r['Award Amount']) || 0),
      agency: (r['Awarding Sub Agency'] || r['Awarding Agency'] || '').toString().trim(),
      year: yearOf(r['Start Date']),
    });
    if (recipients.length >= 8) break;
  }

  return json({ ok: true, output: {
    total_found,
    sampled: rows.length,
    state: /^[A-Z]{2}$/.test(state) ? state : null,
    keywords,
    award_low: amounts.length ? Math.min(...amounts) : 0,
    award_median: median(amounts),
    award_high: amounts.length ? Math.max(...amounts) : 0,
    agencies,
    recipients,
  } });
});
