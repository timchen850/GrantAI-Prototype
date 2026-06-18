import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export default function Auth() {
  const { signIn, signUp, signInWithMagicLink, signInWithGoogle } = useAuth()
  const { toast } = useToast()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
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

  async function handleGoogle() {
    setGoogleLoading(true)
    try { await signInWithGoogle() }
    catch (err) { toast(err.message || 'Google sign-in failed', 'danger') }
    finally { setGoogleLoading(false) }
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
          <>
            {/* Google sign-in — primary action */}
            <button
              type="button"
              disabled={googleLoading}
              onClick={handleGoogle}
              style={{
                width: '100%', height: 52,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14,
                color: '#3c4043', fontSize: 16, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {googleLoading
                ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'rgba(0,0,0,0.1)', borderTopColor: '#555' }} />
                : <GoogleIcon />}
              <span>{googleLoading ? 'Opening Google…' : 'Continue with Google'}</span>
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>or use email</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

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

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              {mode === 'signin' && (
                <button className="btn btn-ghost w-full" onClick={() => setMode('magic')}>
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
          </>
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
