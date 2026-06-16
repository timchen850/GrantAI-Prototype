import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

export default function Auth() {
  const { signIn, signUp, signInWithMagicLink } = useAuth()
  const { toast } = useToast()
  const [mode, setMode] = useState('signin') // signin | signup | magic
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUp(email, password, orgName)
        toast('Account created! Check your email to confirm.', 'ok')
      } else if (mode === 'magic') {
        await signInWithMagicLink(email)
        setMagicSent(true)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      toast(err.message || 'Authentication failed', 'danger')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,92,58,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 400,
        padding: 32,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52,
            background: 'var(--accent)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: 'white',
            margin: '0 auto 16px',
            boxShadow: '0 4px 20px rgba(232,92,58,0.4)',
          }}>G</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.03, marginBottom: 6 }}>
            Grange AI
          </h1>
          <p style={{ color: 'var(--ink-secondary)', fontSize: 14 }}>
            {mode === 'signup' ? 'Create your organization account' :
             mode === 'magic' ? 'Sign in without a password' :
             'Sign in to your account'}
          </p>
        </div>

        {/* Card */}
        <div className="card card-elevated" style={{ padding: 28 }}>
          {magicSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✉️</div>
              <h3 style={{ marginBottom: 8 }}>Check your email</h3>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
                We sent a magic link to <strong>{email}</strong>.
                Click it to sign in instantly.
              </p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 20 }} onClick={() => { setMagicSent(false); setMode('signin') }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {mode === 'signup' && (
                <div className="form-group">
                  <label className="form-label">Organization Name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Acme Nonprofit Foundation"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@organization.org"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              {mode !== 'magic' && (
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder={mode === 'signup' ? 'Min. 8 characters' : 'Your password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                className="btn btn-accent btn-lg"
                style={{ width: '100%', marginTop: 4 }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : null}
                {loading ? 'Please wait…' :
                 mode === 'signup' ? 'Create Account' :
                 mode === 'magic' ? 'Send Magic Link' :
                 'Sign In'}
              </button>
            </form>
          )}
        </div>

        {/* Toggle links */}
        {!magicSent && (
          <div style={{ textAlign: 'center', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mode === 'signin' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setMode('magic')} style={{ width: '100%' }}>
                  Sign in with magic link instead
                </button>
                <p style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
                  Don't have an account?{' '}
                  <button onClick={() => setMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent-bright)', fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
                Already have an account?{' '}
                <button onClick={() => setMode('signin')} style={{ background: 'none', border: 'none', color: 'var(--accent-bright)', fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>
                  Sign in
                </button>
              </p>
            )}
            {mode === 'magic' && (
              <button className="btn btn-ghost btn-sm" onClick={() => setMode('signin')} style={{ width: '100%' }}>
                Use password instead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
