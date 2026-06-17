import React from 'react'

const PAGE_TITLES = {
  dashboard: 'Grange AI',
  discovery: 'Discover',
  generator: 'Draft',
  grants:    'Pipeline',
  readiness: 'Readiness',
  chat:      'Assistant',
  profile:   'Account',
}

export default function TopBar({ page, onAction }) {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        {page === 'dashboard' ? (
          <>
            <div className="topbar-logo-mark">G</div>
            <span className="topbar-title">Grange AI</span>
          </>
        ) : (
          <span className="topbar-title">{PAGE_TITLES[page]}</span>
        )}
      </div>
      <div className="topbar-right">
        {page === 'dashboard' && (
          <button className="btn-icon" onClick={() => onAction('chat')}>
            <ChatIcon />
          </button>
        )}
        {page === 'discovery' && (
          <button className="btn-icon" onClick={() => onAction('filter')}>
            <FilterIcon />
          </button>
        )}
      </div>
    </header>
  )
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
