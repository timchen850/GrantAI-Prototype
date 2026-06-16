import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

export default function Auth() {
  const { signIn, signUp, signInWithMagicLink } = useAuth()
  const { toast } = useToast()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signup')      await signUp(email, password, orgName)
      else if (mode === 'magic')  { await signInWithMagicLink(email); setMagicSent(true) }
      else                        await signIn(email, password)
      if (mode === 'signup') toast('Check your email to confirm your account.', 'ok')
    } catch (err) {
      toast(err.message || 'Authentication failed', 'danger')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 100% 50% at 50% 0%, rgba(232,92,58,0.14) 0%, transparent 65%)',
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{
            width: 64, height: 64, background: 'var(--accent)', borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 800, color: 'white', margin: '0 auto 20px',
            boxShadow: '0 6px 28px var(--accent-glow)',
          }}>G</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.03, marginBottom: 6 }}>Grange AI</h1>
          <p style={{ color: 'var(--ink-secondary)', fontSize: 15 }}>
            {mode === 'signup' ? 'Create your account' :
             mode === 'magic'  ? 'Passwordless sign in' :
             'Welcome back'}
          </p>
        </div>

        {magicSent ? (
          <div className="card card-elevated" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
            <h2 style={{ marginBottom: 10, fontSize: 20 }}>Check your email</h2>
            <p style={{ color: 'var(--ink-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              We sent a magic link to <strong>{email}</strong>. Tap it to sign in instantly.
            </p>
            <button className="btn btn-ghost w-full" style={{ marginTop: 24 }}
              onClick={() => { setMagicSent(false); setMode('signin') }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="card card-elevated" style={{ padding: '8px 0' }}>
              {mode === 'signup' && (
                <FormRow label="Organization Name">
                  <input className="input" type="text" placeholder="Acme Foundation"
                    value={orgName} onChange={e => setOrgName(e.target.value)} required />
                </FormRow>
              )}
              <FormRow label="Email" border={mode !== 'magic'}>
                <input className="input" type="email" placeholder="you@org.org"
                  value={email} onChange={e => setEmail(e.target.value)} required
                  autoCapitalize="none" autoCorrect="off" inputMode="email" />
              </FormRow>
              {mode !== 'magic' && (
                <FormRow label="Password" border={false}>
                  <input className="input" type="password"
                    placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    minLength={mode === 'signup' ? 8 : undefined} required />
                </FormRow>
              )}
            </div>

            <button type="submit" className="btn btn-accent btn-lg w-full" style={{ marginTop: 16 }} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : null}
              {loading ? 'Please wait…' :
               mode === 'signup' ? 'Create Account' :
               mode === 'magic'  ? 'Send Magic Link' : 'Sign In'}
            </button>
          </form>
        )}

        {!magicSent && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            {mode === 'signin' && (
              <button className="btn btn-ghost w-full"
                onClick={() => setMode('magic')}>
                Sign in with magic link
              </button>
            )}
            <p style={{ fontSize: 14, color: 'var(--ink-tertiary)', textAlign: 'center' }}>
              {mode === 'signup' ? (
                <>Already have an account? <Tlink onClick={() => setMode('signin')}>Sign in</Tlink></>
              ) : (
                <>No account? <Tlink onClick={() => setMode('signup')}>Sign up free</Tlink></>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function FormRow({ label, children, border = true }) {
  return (
    <div style={{
      padding: '4px 16px 4px',
      borderBottom: border ? '1px solid var(--border)' : 'none',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, paddingTop: 10 }}>
        {label}
      </div>
      {children}
      <div style={{ height: 10 }} />
    </div>
  )
}

function Tlink({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: 'var(--accent-bright)', fontWeight: 700, cursor: 'pointer', font: 'inherit', fontSize: 14 }}>
      {children}
    </button>
  )
}
