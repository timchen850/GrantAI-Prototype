import React, { useState, useRef, useEffect } from 'react'
import { chatWithAI } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const STARTERS = [
  'What grants should I prioritize?',
  'Help me write a stronger needs statement',
  'What do funders look for in budgets?',
  'How do I follow up after rejection?',
]

export default function Chat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hi! I'm Grange, your AI grant advisor. I know your organization — ${profile?.org_name || 'your nonprofit'} — and can help with strategy, writing, funder research, and compliance. What's on your mind?`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const { reply } = await chatWithAI(msg, messages.slice(1))
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Having trouble connecting. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      paddingTop: 'var(--safe-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,16,0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, background: 'var(--accent)', borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 18, color: 'white',
        }}>G</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Grange Assistant</div>
          <div style={{ fontSize: 12, color: 'var(--ok)' }}>● Online</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '16px',
        WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10,
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-end',
          }}>
            {m.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: 'white', flexShrink: 0, marginBottom: 2,
              }}>G</div>
            )}
            <div style={{
              maxWidth: '78%',
              padding: '11px 14px',
              borderRadius: m.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--glass-mid)',
              border: `1px solid ${m.role === 'user' ? 'rgba(232,92,58,0.4)' : 'var(--border)'}`,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: m.role === 'user' ? 'white' : 'var(--ink)',
              whiteSpace: 'pre-wrap',
              userSelect: 'text', WebkitUserSelect: 'text',
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'white', flexShrink: 0 }}>G</div>
            <div style={{ padding: '12px 16px', background: 'var(--glass-mid)', border: '1px solid var(--border)', borderRadius: '4px 18px 18px 18px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-tertiary)', animation: `bounce 1.2s ${i*0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Starter chips */}
        {messages.length === 1 && !loading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {STARTERS.map(s => (
              <button key={s} className="btn btn-ghost btn-sm" style={{ fontSize: 13 }} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px',
        background: 'rgba(10,10,16,0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <input
          className="input"
          style={{ flex: 1, borderRadius: 20, padding: '10px 16px' }}
          placeholder="Ask Grange anything…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          disabled={loading}
        />
        <button
          className="btn btn-accent"
          style={{ borderRadius: 20, padding: '10px 18px', flexShrink: 0 }}
          onClick={() => send()}
          disabled={!input.trim() || loading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
