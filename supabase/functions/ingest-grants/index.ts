// Grange AI — Grant ingestion + embedding worker
//
// Fetches open opportunities from Grants.gov public API, embeds each
// description with Gemini text-embedding-004, and upserts into
// public.opportunities so semantic search can find them.
//
// Invoke via POST (service role or admin only) — e.g. from a scheduled cron
// or from the Discovery screen's "Discover Grants" button.
//
// Secrets required:
//   GEMINI_API_KEY          — for embeddings
//   GRANTS_GOV_API_KEY      — optional; omit to use the public read endpoint
//   SUPABASE_SERVICE_ROLE_KEY — injected automatically

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMBED_MODEL = 'text-embedding-004'; // 768 dims, free-tier eligible
const EMBED_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ── Gemini embedding ─────────────────────────────────────────────────────────
async function embed(text: string): Promise<number[] | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch(`${EMBED_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: text.slice(0, 3000) }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    });
    if (!res.ok) { console.error('embed failed', res.status); return null; }
    const d = await res.json();
    return d?.embedding?.values ?? null;
  } catch (e) { console.error('embed threw', e); return null; }
}

// ── Grants.gov public search ─────────────────────────────────────────────────
// Uses the Grants.gov v2 REST API. Pass GRANTS_GOV_API_KEY in secrets if you
// have one; the endpoint also works without a key for read-only searches.
async function fetchGrantsGov(keyword = 'nonprofit community', rows = 25): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      keyword,
      oppStatuses: 'posted',
      rows: String(rows),
      startRecordNum: '0',
    });
    const apiKey = Deno.env.get('GRANTS_GOV_API_KEY');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Grants-Api-Key'] = apiKey;

    const res = await fetch(`https://api.grants.gov/v2/api/opportunities?${params}`, { headers });
    if (!res.ok) {
      console.error('grants.gov', res.status, await res.text().catch(() => ''));
      return [];
    }
    const d = await res.json();
    return d?.data?.oppHits ?? d?.hits ?? [];
  } catch (e) {
    console.error('grants.gov threw', e);
    return [];
  }
}

// Map a Grants.gov opportunity hit → our opportunities row shape
function mapGrantsGovHit(hit: any) {
  const raw = hit?._source ?? hit;
  return {
    source:             'grants_gov' as const,
    opportunity_number: raw.opportunityNumber ?? raw.number ?? null,
    title:              raw.opportunityTitle ?? raw.title ?? 'Untitled',
    description:        raw.synopsis?.synopsisDesc ?? raw.description ?? '',
    source_url:         raw.opportunityNumber
      ? `https://www.grants.gov/search-results-detail/${raw.opportunityId ?? ''}`
      : null,
    award_floor:   raw.awardCeiling ? null : null,
    award_ceiling: raw.awardCeiling ? parseFloat(raw.awardCeiling) : null,
    deadline:      raw.closeDate
      ? new Date(raw.closeDate).toISOString().slice(0, 10)
      : null,
    focus_areas:  raw.categoryExplanation ? [raw.categoryExplanation] : [],
    geographies:  [],
    status:       'open' as const,
    submission_type: 'application' as const,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  // Service-role only — never callable from the browser with the anon key
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Parse optional body params
  let keyword = 'nonprofit arts education community health';
  let rows    = 25;
  try {
    const b = await req.json();
    if (b.keyword) keyword = b.keyword;
    if (b.rows)    rows    = Math.min(Number(b.rows), 100);
  } catch { /* no body — use defaults */ }

  console.log(`Fetching up to ${rows} grants from Grants.gov…`);
  const hits = await fetchGrantsGov(keyword, rows);
  console.log(`Got ${hits.length} hits`);

  if (hits.length === 0) {
    return json({ ok: true, ingested: 0, embedded: 0,
      message: 'Grants.gov returned 0 results. Add GRANTS_GOV_API_KEY secret for higher rate limits.' });
  }

  let ingested = 0;
  let embedded = 0;

  for (const hit of hits) {
    const row = mapGrantsGovHit(hit);
    if (!row.title || row.title === 'Untitled') continue;

    // Upsert by (source, opportunity_number) or title as fallback
    const { data: existing } = await sb
      .from('opportunities')
      .select('id, embedding')
      .eq('source', 'grants_gov')
      .eq('opportunity_number', row.opportunity_number ?? '')
      .maybeSingle();

    let oppId: string;

    if (existing) {
      oppId = existing.id;
      // Only update non-embedding fields; skip re-embedding if already done
      await sb.from('opportunities').update({
        title: row.title,
        description: row.description,
        award_ceiling: row.award_ceiling,
        deadline: row.deadline,
        source_url: row.source_url,
        status: row.status,
      }).eq('id', oppId);
    } else {
      const { data: ins, error } = await sb
        .from('opportunities')
        .insert({ ...row, eligibility_rules: [], format_rules: {}, required_sections: [] })
        .select('id')
        .single();
      if (error || !ins) { console.error('insert failed', error); continue; }
      oppId = ins.id;
      ingested++;
    }

    // Embed if no embedding yet
    if (!existing?.embedding) {
      const text = `${row.title}\n${row.description}`.trim();
      const vec  = await embed(text);
      if (vec) {
        await sb.from('opportunities').update({ embedding: vec }).eq('id', oppId);
        embedded++;
      }
    }
  }

  return json({ ok: true, ingested, embedded, total_hits: hits.length });
});
