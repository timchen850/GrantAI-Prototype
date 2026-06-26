import React, { useState } from 'react'
import { useAuth } from '../lib/auth'
import { sb } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xewrvmqyzeiziimcmenj.supabase.co'

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    desc: 'Get started with the basics — no credit card needed.',
    cta: 'Get Started',
    ctaStyle: 'ghost',
    features: [
      { label: 'Readiness checker', included: true },
      { label: 'Grant discovery', note: '5 results', included: true },
      { label: 'AI draft sections', note: '2 / month', included: true },
      { label: 'Funder AI policy warnings', included: true },
      { label: 'RAG over your past proposals', included: false },
      { label: 'Post-award compliance tracker', included: false },
      { label: 'Team roles / multi-user', included: false },
      { label: 'Export (submission-ready)', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    desc: 'For growing nonprofits ready to scale their grant pipeline.',
    cta: 'Start Free Trial',
    ctaStyle: 'accent',
    badge: 'Most Popular',
    features: [
      { label: 'Readiness checker', included: true },
      { label: 'Grant discovery', note: 'Unlimited', included: true },
      { label: 'AI draft sections', note: '15 / month', included: true },
      { label: 'Funder AI policy warnings', included: true },
      { label: 'RAG over your past proposals', included: false },
      { label: 'Post-award compliance tracker', included: true },
      { label: 'Team roles / multi-user', included: false },
      { label: 'Export (submission-ready)', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    desc: 'Full platform access for serious grant-seeking organizations.',
    cta: 'Start Free Trial',
    ctaStyle: 'accent',
    features: [
      { label: 'Readiness checker', included: true },
      { label: 'Grant discovery', note: 'Unlimited + federal live feed', included: true },
      { label: 'AI draft sections', note: 'Unlimited', included: true },
      { label: 'Funder AI policy warnings', included: true },
      { label: 'RAG over your past proposals', included: true },
      { label: 'Post-award compliance tracker', included: true },
      { label: 'Team roles / multi-user', included: true },
      { label: 'Export (submission-ready)', included: true },
    ],
  },
]

export default function Pricing() {
  const { profile, updateProfile } = useAuth()
  const currentTier = profile?.tier || 'free'
  const [billing, setBilling] = useState('monthly')
  const [switching, setSwitching] = useState(null)

  async function selectTier(tierId) {
    if (tierId === currentTier) return
    // Free tier — no payment needed
    if (tierId === 'free') {
      setSwitching('free')
      try { await updateProfile({ tier: 'free' }) } finally { setSwitching(null) }
      return
    }
    setSwitching(tierId)
    try {
      const { data: { session } } = await sb.auth.getSession()
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ tier: tierId, billing }),
        }
      )
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Could not start checkout. Please try again.')
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div style={{ padding: '40px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          display: 'inline-block',
          background: 'var(--accent-dim)',
          color: 'var(--accent-bright)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          borderRadius: 'var(--r-pill)',
          border: '1px solid rgba(232,92,58,0.25)',
          marginBottom: 16,
        }}>
          Pricing
        </div>
        <h1 style={{
          fontSize: 36,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
          marginBottom: 12,
        }}>
          Simple, transparent pricing
        </h1>
        <p style={{ color: 'var(--ink-secondary)', fontSize: 16, maxWidth: 480, margin: '0 auto 28px' }}>
          Built for nonprofits at every stage. Start free and upgrade when you're ready.
        </p>

        {/* Billing toggle */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--bg-elevated2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-pill)',
          padding: 4,
          gap: 4,
        }}>
          {['monthly', 'annual'].map(b => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              style={{
                padding: '6px 18px',
                borderRadius: 'var(--r-pill)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all var(--dur) var(--ease)',
                background: billing === b ? 'var(--accent)' : 'transparent',
                color: billing === b ? '#fff' : 'var(--ink-secondary)',
              }}
            >
              {b === 'monthly' ? 'Monthly' : 'Annual'}
              {b === 'annual' && (
                <span style={{
                  marginLeft: 6,
                  fontSize: 10,
                  background: 'rgba(255,255,255,0.2)',
                  padding: '1px 6px',
                  borderRadius: 99,
                }}>
                  −20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}>
        {TIERS.map(tier => {
          const price = billing === 'annual'
            ? Math.round(tier.price * 0.8)
            : tier.price
          const isHighlighted = tier.id === 'starter'
          const isCurrent = tier.id === currentTier

          return (
            <div
              key={tier.id}
              style={{
                position: 'relative',
                borderRadius: 'var(--r-xl)',
                border: isHighlighted
                  ? '1px solid rgba(232,92,58,0.45)'
                  : '1px solid var(--border)',
                background: isHighlighted
                  ? 'linear-gradient(145deg, rgba(232,92,58,0.08) 0%, var(--bg-elevated) 100%)'
                  : 'var(--bg-elevated)',
                padding: '28px 24px 24px',
                boxShadow: isHighlighted ? 'var(--shadow-glow), var(--shadow-lg)' : 'var(--shadow)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              {/* Badge */}
              {tier.badge && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '4px 14px',
                  borderRadius: 'var(--r-pill)',
                  boxShadow: '0 2px 12px rgba(232,92,58,0.5)',
                  whiteSpace: 'nowrap',
                }}>
                  {tier.badge}
                </div>
              )}

              {/* Tier name */}
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: isHighlighted ? 'var(--accent-bright)' : 'var(--ink-secondary)',
                marginBottom: 10,
              }}>
                {tier.name}
              </div>

              {/* Price */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 42, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                  ${price}
                </span>
                {tier.price > 0 && (
                  <span style={{ color: 'var(--ink-tertiary)', fontSize: 14 }}>/mo</span>
                )}
              </div>
              {billing === 'annual' && tier.price > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginBottom: 4 }}>
                  Billed ${price * 12}/year
                </div>
              )}

              <p style={{ color: 'var(--ink-secondary)', fontSize: 13, lineHeight: 1.5, marginBottom: 24, minHeight: 40 }}>
                {tier.desc}
              </p>

              {/* Current plan indicator or CTA */}
              {isCurrent ? (
                <div style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated2)',
                  color: 'var(--ink-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center',
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block', flexShrink: 0 }} />
                  Your current plan
                </div>
              ) : (
                <button
                  onClick={() => selectTier(tier.id)}
                  disabled={switching === tier.id}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: 'var(--r)',
                    border: tier.id === 'free' ? '1px solid var(--border)' : 'none',
                    background: tier.id === 'free' ? 'transparent' : 'var(--accent)',
                    color: tier.id === 'free' ? 'var(--ink-secondary)' : '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: switching === tier.id ? 'wait' : 'pointer',
                    transition: 'all var(--dur) var(--ease)',
                    marginBottom: 24,
                    boxShadow: tier.id !== 'free' ? '0 2px 12px rgba(232,92,58,0.35)' : 'none',
                    opacity: switching === tier.id ? 0.7 : 1,
                  }}
                  onMouseEnter={e => { if (tier.id !== 'free') e.currentTarget.style.background = 'var(--accent-bright)' }}
                  onMouseLeave={e => { if (tier.id !== 'free') e.currentTarget.style.background = 'var(--accent)' }}
                >
                  {switching === tier.id ? 'Switching…' : tier.id === 'free' ? 'Switch to Free' : tier.cta}
                </button>
              )}

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

              {/* Feature list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tier.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 18, height: 18, flexShrink: 0,
                      borderRadius: '50%',
                      background: f.included ? 'var(--ok-dim)' : 'var(--bg-elevated3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {f.included
                        ? <CheckIcon color="var(--ok)" />
                        : <XIcon color="var(--ink-disabled)" />
                      }
                    </div>
                    <span style={{
                      fontSize: 13,
                      color: f.included ? 'var(--ink-secondary)' : 'var(--ink-tertiary)',
                      flex: 1,
                    }}>
                      {f.label}
                      {f.note && f.included && (
                        <span style={{
                          marginLeft: 6,
                          fontSize: 11,
                          color: isHighlighted ? 'var(--accent-bright)' : 'var(--ink-tertiary)',
                          background: isHighlighted ? 'var(--accent-dim)' : 'var(--bg-elevated3)',
                          padding: '1px 7px',
                          borderRadius: 'var(--r-pill)',
                        }}>
                          {f.note}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <p style={{
        textAlign: 'center',
        marginTop: 40,
        fontSize: 13,
        color: 'var(--ink-tertiary)',
      }}>
        All plans include a 14-day free trial. No credit card required to start.
      </p>
    </div>
  )
}

function CheckIcon({ color }) {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon({ color }) {
  return (
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
