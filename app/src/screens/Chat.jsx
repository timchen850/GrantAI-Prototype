import React, { useState, useRef, useEffect } from 'react'
import { chatWithAI } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const STARTERS = [
  'What grants should I prioritize this quarter?',
  'Help me strengthen my needs statement',
  'What are common reasons grants get rejected?',
  'How do I write a compelling executive summary?',
  'What should my budget narrative include?',
]

export default function Chat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm Grange, your AI grant advisor. I know your organization — ${profile?.org_name || 'your nonprofit'} — and can help with grant strategy, proposal writing, funder research, and compliance. What's on your mind?`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { role: 'user', content: msg }
    const history = messages.slice(1) // exclude system greeting
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const { reply } = await chatWithAI(msg, history)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I\'m having trouble connecting right now. Please try again in a moment.',
      }])
    }
    setLoading(false)
  }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: 16, flexShrink: 0 }}>
        <div>
          <h1 className="page-title">AI Assistant</h1>
          <p className="page-subtitle">Your personal grant advisor, powered by Grange AI</p>
        </div>
      </div>

      {/* Messages */}
      <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m, i) => (
            <Message key={i} message={m} />
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Avatar role="assistant" />
              <div style={{ padding: '10px 14px', background: 'var(--glass-mid)', borderRadius: '4px 14px 14px 14px', border: '1px solid var(--border)' }}>
                <TypingIndicator />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Starters */}
        {messages.length === 1 && (
          <div style={{ padding: '0 24px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STARTERS.map(s => (
              <button
                key={s}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12 }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <input
            ref={inputRef}
            className="input"
            style={{ flex: 1 }}
            placeholder="Ask Grange anything about grants…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={loading}
          />
          <button
            className="btn btn-accent"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{ flexShrink: 0 }}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function Message({ message }) {
  const isUser = message.role === 'user'
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
    }}>
      <Avatar role={message.role} />
      <div style={{
        maxWidth: '75%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
        background: isUser ? 'var(--accent)' : 'var(--glass-mid)',
        border: `1px solid ${isUser ? 'rgba(232,92,58,0.4)' : 'var(--border)'}`,
        fontSize: 13.5,
        lineHeight: 1.65,
        color: isUser ? 'white' : 'var(--ink)',
        userSelect: 'text',
        whiteSpace: 'pre-wrap',
      }}>
        {message.content}
      </div>
    </div>
  )
}

function Avatar({ role }) {
  return (
    <div style={{
      width: 30,
      height: 30,
      borderRadius: '50%',
      background: role === 'user' ? 'var(--glass-strong)' : 'var(--accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 700,
      color: 'white',
      flexShrink: 0,
    }}>
      {role === 'user' ? '👤' : 'G'}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--ink-tertiary)',
            animation: `bounce 1.2s ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  )
}
