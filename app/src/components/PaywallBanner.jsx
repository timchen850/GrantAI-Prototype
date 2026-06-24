import React from 'react'

/**
 * Inline "upgrade to unlock" banner for Pro/Starter-only features.
 * Does NOT block the feature — purely decorative/informational for now.
 */
export default function PaywallBanner({ feature, plan = 'Pro', setPage, style }) {
  return (
    <div style={{
      borderRadius: 'var(--r-xl)',
      border: '1px dashed rgba(232,92,58,0.35)',
      background: 'linear-gradient(135deg, rgba(232,92,58,0.06) 0%, var(--bg-elevated) 100%)',
      padding: '20px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      ...style,
    }}>
      {/* Lock icon */}
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        borderRadius: 12,
        background: 'rgba(232,92,58,0.12)',
        border: '1px solid rgba(232,92,58,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <LockIcon />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>
            {feature}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--accent-bright)',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(232,92,58,0.25)',
            padding: '2px 7px',
            borderRadius: 'var(--r-pill)',
          }}>
            {plan}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-tertiary)', margin: 0, lineHeight: 1.4 }}>
          Upgrade to {plan} to unlock this feature.
        </p>
      </div>

      <button
        onClick={() => setPage?.('pricing')}
        style={{
          flexShrink: 0,
          padding: '8px 16px',
          borderRadius: 'var(--r)',
          border: '1px solid rgba(232,92,58,0.4)',
          background: 'transparent',
          color: 'var(--accent-bright)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all var(--dur) var(--ease)',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-dim)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        View Plans →
      </button>
    </div>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
