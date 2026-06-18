import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    ),
    title: 'Discover grants instantly',
    desc: 'AI matches open opportunities to your mission in seconds.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
      </svg>
    ),
    title: 'Write proposals with one click',
    desc: 'Full drafts in your voice — ready to submit, not just ready to edit.',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: 'Track every deadline',
    desc: 'Pipeline view keeps you compliant and never lets a grant slip.',
  },
]

export default function Auth() {
  const { signIn, signUp, signInWithMagicLink, signInWithGoogle } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)
  const { toast } = useToast()
  const [mode, setMode] = useState('signup') // signup | signin | magic
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
    <div style={styles.root}>
      {/* Left panel — brand */}
      <div style={styles.left}>
        {/* Background glow blobs */}
        <div style={styles.blob1} />
        <div style={styles.blob2} />

        {/* Logo */}
        <div style={styles.logoWrap}>
          <div style={styles.logoMark}>G</div>
          <span style={styles.logoText}>Grange AI</span>
        </div>

        <div style={styles.leftContent}>
          <h1 style={styles.headline}>
            The grant writer<br />your nonprofit<br />always needed.
          </h1>
          <p style={styles.subhead}>
            Find, write, and track grants — all in one place.
          </p>

          <div style={styles.features}>
            {FEATURES.map((f, i) => (
              <div key={i} style={styles.featureRow}>
                <div style={styles.featureIcon}>{f.icon}</div>
                <div>
                  <div style={styles.featureTitle}>{f.title}</div>
                  <div style={styles.featureDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.leftFooter}>
          Free to start · No credit card required
        </div>
      </div>

      {/* Right panel — form */}
      <div style={styles.right}>
        <div style={styles.formPanel}>
          {magicSent ? (
            <MagicSent email={email} onBack={() => { setMagicSent(false); setMode('signin') }} />
          ) : (
            <>
              {/* Google sign-in — primary CTA */}
              <button
                type="button"
                disabled={googleLoading}
                style={styles.googleBtn}
                onClick={async () => {
                  setGoogleLoading(true)
                  try { await signInWithGoogle() }
                  catch (err) { toast(err.message || 'Google sign-in failed', 'danger') }
                  finally { setGoogleLoading(false) }
                }}
              >
                {googleLoading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#333' }} /> : <GoogleIcon />}
                <span>{googleLoading ? 'Opening Google…' : 'Continue with Google'}</span>
              </button>

              <div style={styles.divider}>
                <span style={styles.dividerLine} />
                <span style={styles.dividerText}>or use email</span>
                <span style={styles.dividerLine} />
              </div>

              {/* Mode toggle */}
              {mode !== 'magic' && (
                <div style={styles.toggle}>
                  <button
                    style={{ ...styles.toggleBtn, ...(mode === 'signup' ? styles.toggleActive : {}) }}
                    onClick={() => setMode('signup')}
                    type="button"
                  >
                    Create account
                  </button>
                  <button
                    style={{ ...styles.toggleBtn, ...(mode === 'signin' ? styles.toggleActive : {}) }}
                    onClick={() => setMode('signin')}
                    type="button"
                  >
                    Sign in
                  </button>
                </div>
              )}

              {mode === 'magic' && (
                <div style={{ marginBottom: 28 }}>
                  <h2 style={styles.formTitle}>Magic link</h2>
                  <p style={styles.formSub}>We'll email you a one-click sign-in link.</p>
                </div>
              )}

              <form onSubmit={handleSubmit} style={styles.form}>
                {mode === 'signup' && (
                  <Field
                    label="Organization name"
                    type="text"
                    placeholder="Acme Nonprofit Foundation"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    required
                    autoFocus
                  />
                )}

                <Field
                  label="Email"
                  type="email"
                  placeholder="you@organization.org"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus={mode !== 'signup'}
                />

                {mode !== 'magic' && (
                  <Field
                    label="Password"
                    type="password"
                    placeholder={mode === 'signup' ? 'Min. 8 characters' : 'Your password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                  />
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={styles.submitBtn}
                >
                  {loading
                    ? <span className="spinner" />
                    : mode === 'signup' ? 'Create Account'
                    : mode === 'magic' ? 'Send Magic Link'
                    : 'Sign In'}
                </button>
              </form>

              {/* Secondary actions */}
              <div style={styles.secondaryActions}>
                {mode === 'signin' && (
                  <button style={styles.ghostLink} type="button" onClick={() => setMode('magic')}>
                    Sign in without password ›
                  </button>
                )}
                {mode === 'magic' && (
                  <button style={styles.ghostLink} type="button" onClick={() => setMode('signin')}>
                    ‹ Use password instead
                  </button>
                )}
                {mode === 'signup' && (
                  <p style={styles.legalNote}>
                    By creating an account you agree to our{' '}
                    <span style={{ color: 'var(--ink-secondary)' }}>Terms of Service</span>
                    {' '}and{' '}
                    <span style={{ color: 'var(--ink-secondary)' }}>Privacy Policy</span>.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={styles.fieldLabel}>{label}</label>
      <input className="input" {...props} style={styles.fieldInput} />
    </div>
  )
}

function MagicSent({ email, onBack }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={styles.magicIcon}>✉️</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, letterSpacing: -0.03 }}>
        Check your email
      </h2>
      <p style={{ color: 'var(--ink-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
        We sent a magic link to<br />
        <strong style={{ color: 'var(--ink)' }}>{email}</strong>
      </p>
      <button style={styles.ghostLink} type="button" onClick={onBack}>
        ‹ Back to sign in
      </button>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    background: 'var(--bg-base)',
    overflow: 'hidden',
  },

  // ── Left panel ──
  left: {
    flex: '0 0 420px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    padding: '40px 44px',
    borderRight: '1px solid var(--border)',
    overflow: 'hidden',
  },
  blob1: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(232,92,58,0.18) 0%, transparent 70%)',
    top: -120,
    left: -80,
    pointerEvents: 'none',
  },
  blob2: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(232,92,58,0.09) 0%, transparent 70%)',
    bottom: 40,
    right: -60,
    pointerEvents: 'none',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 64,
    position: 'relative',
    zIndex: 1,
  },
  logoMark: {
    width: 36,
    height: 36,
    background: 'var(--accent)',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 800,
    color: '#fff',
    boxShadow: '0 4px 16px rgba(232,92,58,0.4)',
    flexShrink: 0,
  },
  logoText: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: -0.02,
  },
  leftContent: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  headline: {
    fontSize: 30,
    fontWeight: 760,
    letterSpacing: -0.04,
    lineHeight: 1.2,
    marginBottom: 14,
  },
  subhead: {
    fontSize: 15,
    color: 'var(--ink-secondary)',
    lineHeight: 1.5,
    marginBottom: 44,
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  featureRow: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'rgba(232,92,58,0.12)',
    border: '1px solid rgba(232,92,58,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-bright)',
    flexShrink: 0,
    marginTop: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 3,
    letterSpacing: -0.01,
  },
  featureDesc: {
    fontSize: 12.5,
    color: 'var(--ink-secondary)',
    lineHeight: 1.5,
  },
  leftFooter: {
    fontSize: 12,
    color: 'var(--ink-tertiary)',
    position: 'relative',
    zIndex: 1,
  },

  // ── Right panel ──
  right: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 48px',
  },
  formPanel: {
    width: '100%',
    maxWidth: 380,
  },

  // Toggle tabs
  toggle: {
    display: 'flex',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    padding: 3,
    marginBottom: 28,
  },
  toggleBtn: {
    flex: 1,
    padding: '9px 0',
    background: 'none',
    border: 'none',
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 500,
    color: 'var(--ink-secondary)',
    cursor: 'pointer',
    transition: 'all 150ms',
    fontFamily: 'inherit',
    letterSpacing: -0.01,
  },
  toggleActive: {
    background: 'var(--bg-elevated3)',
    color: 'var(--ink)',
    fontWeight: 600,
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  },

  formTitle: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.03,
    marginBottom: 6,
  },
  formSub: {
    fontSize: 14,
    color: 'var(--ink-secondary)',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ink-secondary)',
    letterSpacing: 0,
  },
  fieldInput: {
    height: 42,
    fontSize: 14,
  },
  submitBtn: {
    marginTop: 4,
    height: 44,
    width: '100%',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    color: '#fff',
    fontSize: 14.5,
    fontWeight: 650,
    cursor: 'pointer',
    letterSpacing: -0.01,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 4px 14px rgba(232,92,58,0.35)',
    transition: 'opacity 150ms, transform 80ms',
    fontFamily: 'inherit',
  },

  googleBtn: {
    width: '100%',
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 'var(--r-sm)',
    color: '#3c4043',
    fontSize: 14.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: -0.01,
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    transition: 'box-shadow 120ms, background 120ms',
    marginBottom: 0,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '18px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  dividerText: {
    fontSize: 12,
    color: 'var(--ink-tertiary)',
    whiteSpace: 'nowrap',
  },

  secondaryActions: {
    marginTop: 18,
    textAlign: 'center',
  },
  ghostLink: {
    background: 'none',
    border: 'none',
    color: 'var(--ink-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    transition: 'color 120ms',
  },
  legalNote: {
    fontSize: 12,
    color: 'var(--ink-tertiary)',
    lineHeight: 1.6,
  },

  magicIcon: {
    fontSize: 40,
    marginBottom: 18,
  },
}
