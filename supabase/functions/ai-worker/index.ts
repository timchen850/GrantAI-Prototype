// Grange AI — ai_jobs worker (structured-AI engine)
// Drains the ai_jobs queue: auth → run job through Gemini JSON-mode (Groq
// fallback) → write structured results to feature tables → mark done → notify.
// Runs under the user's JWT, so all reads/writes are RLS-scoped to that user.
// Secrets: GEMINI_API_KEY (required), GROQ_API_KEY (optional fallback).
// Body: { job_id?: uuid }  OR  { job_type: string, input: object }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEM = 'gemini-2.5-flash';
const GROQ = 'llama-3.3-70b-versatile';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function callJSON(prompt: string): Promise<any> {
  const gk = Deno.env.get('GEMINI_API_KEY');
  if (gk) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEM}:generateContent?key=${gk}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }) });
      if (res.ok) { const d = await res.json(); return JSON.parse(d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '{}'); }
      console.error('gemini json', res.status);
    } catch (e) { console.error('gemini json threw', e); }
  }
  const qk = Deno.env.get('GROQ_API_KEY');
  if (qk) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qk}` },
      body: JSON.stringify({ model: GROQ, temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Respond ONLY with one valid JSON object.' }, { role: 'user', content: prompt }] }) });
    if (res.ok) { const d = await res.json(); return JSON.parse(d?.choices?.[0]?.message?.content ?? '{}'); }
    console.error('groq json', res.status);
  }
  throw new Error('AI provider unavailable — set GEMINI_API_KEY (and optionally GROQ_API_KEY) in Edge Function secrets.');
}

async function callText(prompt: string, maxTokens = 1500): Promise<string> {
  const gk = Deno.env.get('GEMINI_API_KEY');
  if (gk) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEM}:generateContent?key=${gk}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens } }) });
      if (res.ok) { const d = await res.json(); const t = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''; if (t.trim()) return t.trim(); }
    } catch (e) { console.error('gemini text threw', e); }
  }
  const qk = Deno.env.get('GROQ_API_KEY');
  if (qk) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${qk}` },
      body: JSON.stringify({ model: GROQ, temperature: 0.6, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
    if (res.ok) { const d = await res.json(); const t = d?.choices?.[0]?.message?.content ?? ''; if (t.trim()) return t.trim(); }
  }
  throw new Error('AI provider unavailable — set GEMINI_API_KEY (and optionally GROQ_API_KEY) in Edge Function secrets.');
}

function org(p: any): string {
  if (!p) return 'No organization profile on file.';
  return [`Organization: ${p.org_name || '(unnamed)'}`, p.mission && `Mission: ${p.mission}`, p.ntee_code && `NTEE: ${p.ntee_code}`,
    p.focus_areas?.length && `Focus areas: ${p.focus_areas.join(', ')}`, p.service_geographies?.length && `Geographies: ${p.service_geographies.join(', ')}`,
    p.annual_budget && `Annual budget: $${p.annual_budget}`, `Tax status: ${p.tax_exempt_status || 'unknown'}`].filter(Boolean).join('\n');
}

async function dispatch(sb: any, uid: string, jobType: string, input: any): Promise<any> {
  const profile = (await sb.from('profiles').select('*').eq('user_id', uid).maybeSingle()).data;

  if (jobType === 'score_match') {
    const opp = (await sb.from('opportunities').select('*').eq('id', input.opportunity_id).maybeSingle()).data;
    if (!opp) throw new Error('opportunity not found');
    const out = await callJSON(`Score how well this nonprofit fits this funding opportunity. Output JSON: {"overall":<int 0-100>,"verdict":"strong|good|weak|poor","components":[{"key":"mission|ntee|geography|budget_range","score":<int>,"weight":<0-1>,"rationale":"<text>"}]}. Be honest and specific.\n\nORG:\n${org(profile)}\n\nOPPORTUNITY:\nTitle: ${opp.title}\nFocus: ${(opp.focus_areas || []).join(', ')}\nGeographies: ${(opp.geographies || []).join(', ')}\nAward: ${opp.award_floor || '?'}-${opp.award_ceiling || '?'}\nDescription: ${(opp.description || '').slice(0, 1200)}`);
    await sb.from('match_scores').upsert({ user_id: uid, opportunity_id: input.opportunity_id, overall: Math.max(0, Math.min(100, Math.round(out.overall || 0))), verdict: out.verdict || null, components: out.components || [], model_version: GEM, scored_at: new Date().toISOString() }, { onConflict: 'user_id,opportunity_id' });
    return { overall: Math.round(out.overall || 0), verdict: out.verdict };
  }

  if (jobType === 'check_eligibility') {
    const opp = (await sb.from('opportunities').select('*').eq('id', input.opportunity_id).maybeSingle()).data;
    if (!opp) throw new Error('opportunity not found');
    const rules = Array.isArray(opp.eligibility_rules) ? opp.eligibility_rules : [];
    const out = await callJSON(`Screen this org against each grant requirement using ONLY the org profile. Output JSON: {"overall_status":"eligible|ineligible|needs_review","items":[{"requirement":"<text>","status":"confirmed|failed|needs_review","evidence":"<why>","source_quote":"<the requirement text>"}]}\n\nORG:\n${org(profile)}\n\nREQUIREMENTS:\n${JSON.stringify(rules)}`);
    const check = (await sb.from('eligibility_checks').insert({ user_id: uid, opportunity_id: input.opportunity_id, grant_id: input.grant_id || null, overall_status: out.overall_status || 'needs_review', checked_at: new Date().toISOString(), model_version: GEM }).select('id').single()).data;
    if (check?.id && Array.isArray(out.items)) await sb.from('eligibility_check_items').insert(out.items.map((it: any, i: number) => ({ check_id: check.id, user_id: uid, requirement: it.requirement || '', status: it.status || 'unknown', evidence: it.evidence || null, source_quote: it.source_quote || null, sort_order: i })));
    return { overall_status: out.overall_status, item_count: (out.items || []).length, check_id: check?.id };
  }

  if (jobType === 'draft_section') {
    const section = (await sb.from('proposal_sections').select('*').eq('proposal_id', input.proposal_id).eq('section_key', input.section_key).maybeSingle()).data;
    const tmpl = (await sb.from('proposal_section_templates').select('*').eq('key', input.section_key).maybeSingle()).data;
    const proposal = (await sb.from('proposals').select('*, grants(opportunity_id), programs(name,description)').eq('id', input.proposal_id).maybeSingle()).data;
    let oppText = '';
    if (proposal?.grants?.opportunity_id) {
      const opp = (await sb.from('opportunities').select('title,description,rfp_text').eq('id', proposal.grants.opportunity_id).maybeSingle()).data;
      if (opp) oppText = `FUNDER: ${opp.title}\n${(opp.rfp_text || opp.description || '').slice(0, 1800)}`;
    }
    const limit = section?.word_limit ? `Keep under ~${section.word_limit} words.` : 'Keep it tight and concrete.';
    const text = await callText(`You are an expert grant writer drafting ONE proposal section in the org's voice ("we"). Ground every claim in the org data; never invent statistics or dollar amounts. ${limit}\n\nSECTION: ${tmpl?.title || input.section_key}\nGOAL: ${tmpl?.description || ''}\nGUIDANCE: ${tmpl?.ai_prompt_hint || ''}\n\nORG:\n${org(profile)}\n${proposal?.programs ? `PROGRAM: ${proposal.programs.name} — ${proposal.programs.description || ''}` : ''}\n${oppText}\n\nWrite the section (prose only, no heading).`);
    if (section) await sb.from('proposal_sections').update({ content: text, status: 'ai_draft' }).eq('id', section.id);
    else await sb.from('proposal_sections').insert({ proposal_id: input.proposal_id, user_id: uid, section_key: input.section_key, title: tmpl?.title || input.section_key, content: text, status: 'ai_draft' });
    return { chars: text.length, section_key: input.section_key };
  }

  if (jobType === 'write_budget_narrative') {
    const budget = (await sb.from('budgets').select('*').eq('id', input.budget_id).maybeSingle()).data;
    if (!budget) throw new Error('budget not found');
    const items = (await sb.from('budget_line_items').select('*').eq('budget_id', input.budget_id).order('sort_order')).data || [];
    const cats: any = {}; ((await sb.from('budget_categories').select('key,label')).data || []).forEach((c: any) => cats[c.key] = c.label);
    const out = await callJSON(`Write a justification for EACH budget line (necessary, reasonable, tied to the project per 2 CFR 200.403) plus a 2-3 sentence intro. Output JSON: {"narrative_intro":"<text>","lines":[{"id":"<id>","justification":"<text>"}]}\n\nORG:\n${org(profile)}\n\nLINE ITEMS:\n${items.map((i: any) => `id=${i.id} | ${cats[i.category_key] || i.category_key} | ${i.description} | $${i.amount}`).join('\n')}`);
    await sb.from('budgets').update({ narrative_intro: out.narrative_intro || null }).eq('id', input.budget_id);
    for (const ln of (out.lines || [])) if (ln.id) await sb.from('budget_line_items').update({ justification: ln.justification, justification_status: 'ai_draft' }).eq('id', ln.id);
    return { lines_written: (out.lines || []).length };
  }

  if (jobType === 'build_logic_model') {
    const program = input.program_id ? (await sb.from('programs').select('*').eq('id', input.program_id).maybeSingle()).data : null;
    const out = await callJSON(`Build a logic model for this nonprofit program. Output JSON: {"items":[{"column_type":"input|activity|output|outcome_short|outcome_mid|outcome_long|impact","content":"<text>","metric":"<text>","target_value":"<text>","measurement_tool":"<text>"}],"evaluation_plan":"<text>"}. Include several rows per column; outcome rows must have metric, target_value, measurement_tool.\n\nORG:\n${org(profile)}\n${program ? `PROGRAM: ${program.name} — ${program.description || ''}\nPopulation: ${program.population_served || ''}` : ''}`);
    const lm = (await sb.from('logic_models').insert({ user_id: uid, program_id: input.program_id || null, proposal_id: input.proposal_id || null, evaluation_plan: out.evaluation_plan || null }).select('id').single()).data;
    if (lm?.id && Array.isArray(out.items)) await sb.from('logic_model_items').insert(out.items.map((it: any, i: number) => ({ logic_model_id: lm.id, user_id: uid, column_type: it.column_type, content: it.content, metric: it.metric || null, target_value: it.target_value || null, measurement_tool: it.measurement_tool || null, sort_order: i })));
    return { logic_model_id: lm?.id, item_count: (out.items || []).length };
  }

  if (jobType === 'assess_grant') {
    // Inline assessment for a discovery grant (no catalog row, ephemeral).
    const g = input.grant || {};
    const out = await callJSON(`You are a grant advisor deciding whether this nonprofit should pursue this grant. Be honest and concrete; don't invent facts about the org.\n\nORG:\n${org(profile)}\n\nGRANT:\nFunder: ${g.funder || ''}\nTitle: ${g.title || ''}\nType: ${g.type || ''}\nAmount: ${g.amount || ''}\nDeadline: ${g.deadlineLabel || g.deadline || ''}\nDescription: ${(g.desc || g.description || '').slice(0, 1400)}\n\nOutput JSON: {"score":<int 0-100 fit>,"verdict":"strong|good|weak|poor","rationale":"<1-2 sentence why>","eligibility":[{"label":"<requirement, e.g. 501(c)(3) status>","status":"likely|unclear|unlikely","note":"<short>"}],"recommendation":"<one concrete next step>"}. For eligibility infer the usual gates (501c3, geography, applicant type, budget fit) from what you know; use "unclear" when the org profile lacks the info.`);
    return { score: Math.max(0, Math.min(100, Math.round(out.score || 0))), verdict: out.verdict || null, rationale: out.rationale || '', eligibility: out.eligibility || [], recommendation: out.recommendation || '' };
  }

  if (jobType === 'answer_question') {
    // Write a persuasive argumentative essay answer for one grant application question.
    const question = (await sb.from('grant_questions').select('*, opportunities(title, description, rfp_text)').eq('id', input.question_id).maybeSingle()).data;
    if (!question) throw new Error('question not found');

    const grant = input.grant_id
      ? (await sb.from('grants').select('*, opportunities(title, description, funder_id, focus_areas, geographies)').eq('id', input.grant_id).maybeSingle()).data
      : null;

    const opp = question.opportunities || grant?.opportunities;
    const wordGuide = question.word_limit ? `Stay between ${Math.round(question.word_limit * 0.85)}–${question.word_limit} words.` : 'Aim for 400–600 words unless the question calls for more.';
    const hint = question.hint ? `Hint from the funder: "${question.hint}"` : '';

    const prompt = `You are an expert grant writer answering ONE application question on behalf of a nonprofit. Write in the organization's voice ("we"/"our"). Ground every claim in the org data — never invent statistics, dollar amounts, or outcomes that aren't stated. Make a clear, specific argument for why this organization deserves the funding. ${wordGuide}

ORGANIZATION:
${org(profile)}

GRANT:
Funder: ${opp?.title || 'Unknown funder'}
Description: ${(opp?.description || opp?.rfp_text || '').slice(0, 1000)}

APPLICATION QUESTION:
${question.question_text}
${hint}

Write the answer now (prose only — no headings, no bullet points, no meta-commentary about the answer).`;

    const text = await callText(prompt, question.word_limit ? question.word_limit * 8 : 4000);

    // Upsert the answer
    await sb.from('grant_answers').upsert({
      user_id: uid,
      grant_id: input.grant_id,
      question_id: input.question_id,
      answer_text: text,
      status: 'ai_draft',
    }, { onConflict: 'user_id,grant_id,question_id' });

    return { chars: text.length, question_id: input.question_id };
  }

  throw new Error(`unsupported job_type: ${jobType}`);
}

const NOTIF: Record<string, { kind: string; title: string }> = {
  score_match: { kind: 'new_match', title: 'Match score ready' },
  check_eligibility: { kind: 'eligibility', title: 'Eligibility check complete' },
  draft_section: { kind: 'draft_ready', title: 'AI draft ready' },
  write_budget_narrative: { kind: 'draft_ready', title: 'Budget narrative drafted' },
  build_logic_model: { kind: 'draft_ready', title: 'Logic model built' },
  answer_question: { kind: 'draft_ready', title: 'Essay answer drafted' },
};

const EMAIL: Record<string, { email_type: string; step_name: string }> = {
  score_match:           { email_type: 'ai_step_complete', step_name: 'Match Score' },
  check_eligibility:     { email_type: 'eligibility_result', step_name: 'Eligibility Check' },
  draft_section:         { email_type: 'ai_step_complete', step_name: 'Section Draft' },
  write_budget_narrative:{ email_type: 'ai_step_complete', step_name: 'Budget Narrative' },
  build_logic_model:     { email_type: 'ai_step_complete', step_name: 'Logic Model' },
  answer_question:       { email_type: 'ai_step_complete', step_name: 'Essay Answer' },
};

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: aerr } = await sb.auth.getUser();
  if (aerr || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  let jobId: string | undefined = body.job_id;
  let jobType: string = body.job_type;
  let input: any = body.input || {};
  if (jobId) {
    const j = (await sb.from('ai_jobs').select('*').eq('id', jobId).maybeSingle()).data;
    if (!j) return json({ error: 'job not found' }, 404);
    jobType = j.job_type; input = j.input || {};
  } else {
    if (!jobType) return json({ error: 'job_type or job_id required' }, 400);
    jobId = (await sb.from('ai_jobs').insert({ user_id: user.id, job_type: jobType, input, status: 'queued' }).select('id').single()).data?.id;
  }
  await sb.from('ai_jobs').update({ status: 'running', started_at: new Date().toISOString(), model: GEM }).eq('id', jobId);

  try {
    const output = await dispatch(sb, user.id, jobType, input);
    await sb.from('ai_jobs').update({ status: 'succeeded', output, finished_at: new Date().toISOString() }).eq('id', jobId);
    const n = NOTIF[jobType];
    if (n) await sb.from('notifications').insert({ user_id: user.id, kind: n.kind, title: n.title, body: `Job ${jobType} finished.`, link: '/dashboard' });

    // Fire email notification (non-blocking)
    const em = EMAIL[jobType];
    if (em) {
      const emailData: Record<string, string> = { step_name: em.step_name };
      if (jobType === 'check_eligibility' && output) {
        emailData.overall_status = output.overall_status || '';
        const opp = input.opportunity_id
          ? (await sb.from('opportunities').select('title').eq('id', input.opportunity_id).maybeSingle()).data
          : null;
        if (opp?.title) emailData.grant_title = opp.title;
      }
      sendEmail(user.id, em.email_type, emailData);
    }

    return json({ ok: true, job_id: jobId, job_type: jobType, output });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('ai_jobs').update({ status: 'failed', error: msg, finished_at: new Date().toISOString() }).eq('id', jobId);
    return json({ ok: false, job_id: jobId, error: msg }, 502);
  }
});
