import React from 'react'

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  discovery: 'Grant Discovery',
  generator: 'Proposal Generator',
  readiness: 'Submission Readiness',
  grants: 'Grant Management',
  profile: 'Organization Profile',
  chat: 'AI Assistant',
}

export default function TitleBar({ page, onSearch }) {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron
  const isMac = navigator.platform?.toLowerCase().includes('mac')

  return (
    <div className="titlebar" style={{ paddingLeft: isElectron && isMac ? 80 : 20 }}>
      <span className="titlebar-title">{PAGE_TITLES[page] || 'Grange AI'}</span>
      <div className="titlebar-actions">
        {onSearch && (
          <button className="btn btn-ghost btn-sm" onClick={onSearch} style={{ gap: 6 }}>
            <SearchIcon />
            <span style={{ opacity: 0.6 }}>Search</span>
            <kbd style={kbdStyle}>⌘K</kbd>
          </button>
        )}
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <NotificationBell />
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  )
}

function NotificationBell() {
  return (
    <button className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span style={{
        position: 'absolute', top: 6, right: 6,
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--accent)',
        border: '1.5px solid var(--bg-base)',
      }} />
    </button>
  )
}

const kbdStyle = {
  fontSize: 10,
  fontFamily: 'var(--font)',
  padding: '1px 5px',
  background: 'var(--glass-light)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--ink-tertiary)',
}
