import React from 'react'
import { useAuth } from '../lib/auth'

const NAV = [
  {
    section: 'MAIN',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: HomeIcon },
      { id: 'discovery', label: 'Grant Discovery', icon: SearchIcon },
      { id: 'generator', label: 'Proposal AI', icon: WriteIcon },
    ],
  },
  {
    section: 'MANAGE',
    items: [
      { id: 'grants', label: 'Grants', icon: FolderIcon },
      { id: 'readiness', label: 'Readiness', icon: ChecklistIcon },
      { id: 'chat', label: 'AI Assistant', icon: ChatIcon },
    ],
  },
  {
    section: 'ACCOUNT',
    items: [
      { id: 'profile', label: 'Organization', icon: OrgIcon },
      { id: 'pricing', label: 'Pricing', icon: PricingIcon },
    ],
  },
]

export default function Sidebar({ page, setPage }) {
  const { profile, signOut } = useAuth()
  const initials = profile?.org_name
    ? profile.org_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">G</div>
        <span className="sidebar-logo-text">Grange AI</span>
      </div>

      <nav style={{ flex: 1, overflow: 'hidden auto' }}>
        {NAV.map(group => (
          <div key={group.section} className="sidebar-section">
            <div className="sidebar-section-label">{group.section}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >
                <item.icon className="nav-icon" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Plan badge */}
      <div
        onClick={() => setPage('pricing')}
        style={{
          margin: '0 8px 8px',
          padding: '10px 12px',
          borderRadius: 'var(--r)',
          border: '1px solid rgba(232,92,58,0.25)',
          background: 'linear-gradient(135deg, rgba(232,92,58,0.08) 0%, transparent 100%)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'background var(--dur-fast)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,92,58,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(232,92,58,0.08) 0%, transparent 100%)'}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-tertiary)', marginBottom: 2 }}>
            Current Plan
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-secondary)' }}>Free</div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--accent-bright)',
          padding: '4px 8px',
          borderRadius: 'var(--r-pill)',
          background: 'var(--accent-dim)',
          border: '1px solid rgba(232,92,58,0.2)',
        }}>
          Upgrade
        </span>
      </div>

      <div className="sidebar-footer">
        <div className="user-pill" onClick={() => setPage('profile')}>
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{profile?.org_name || 'My Organization'}</div>
            <div className="user-org">{profile?.email || ''}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); signOut() }}
            title="Sign out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-tertiary)', padding: 4, borderRadius: 6, flexShrink: 0 }}
          >
            <SignOutIcon />
          </button>
        </div>
      </div>
    </aside>
  )
}

/* ── Icon components ── */
function HomeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}

function WriteIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  )
}

function FolderIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function ChecklistIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}

function ChatIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function OrgIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>
  )
}

function PricingIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
