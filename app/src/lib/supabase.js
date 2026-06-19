import { createClient } from '@supabase/supabase-js'

// The publishable (anon) key is safe to ship in client apps — Row Level
// Security protects the data. Same key the website serves to every browser.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xewrvmqyzeiziimcmenj.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_d-V-sZePB5xnz2MTuDIlQQ_6xSLJJW9'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'implicit', // Implicit flow for Electron: tokens come in the URL hash,
                          // no PKCE code-exchange step that can silently fail.
  },
})

export async function runAiJob(jobType, input) {
  const { data: { session } } = await sb.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const { data: job, error } = await sb.from('ai_jobs').insert({
    job_type: jobType,
    input,
    user_id: session.user.id,
    status: 'queued',
  }).select().single()

  if (error) throw error
  return job
}

export async function streamProposal(payload, onChunk) {
  const { data: { session } } = await sb.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-proposal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) throw new Error(`Stream error: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') return
        try {
          const json = JSON.parse(raw)
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) onChunk(text)
        } catch {}
      }
    }
  }
}

export async function chatWithAI(message, history = []) {
  const { data: { session } } = await sb.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ message, history }),
  })

  if (!res.ok) throw new Error(`Chat error: ${res.status}`)
  return res.json()
}
