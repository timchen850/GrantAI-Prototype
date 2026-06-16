import React, { useState, useEffect } from 'react'
import { useAuth } from './lib/auth'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import Auth from './screens/Auth'
import Dashboard from './screens/Dashboard'
import Discovery from './screens/Discovery'
import Generator from './screens/Generator'
import Grants from './screens/Grants'
import Readiness from './screens/Readiness'
import Chat from './screens/Chat'
import Profile from './screens/Profile'

const SCREENS = {
  dashboard: Dashboard,
  discovery: Discovery,
  generator: Generator,
  grants:    Grants,
  readiness: Readiness,
  chat:      Chat,
  profile:   Profile,
}

// Full-screen pages that manage their own chrome (no topbar/tabbar)
const FULL_SCREEN = new Set(['chat'])

export default function App() {
  const { session, loading } = useAuth()
  const [page, setPage] = useState('dashboard')

  // Lock body scroll for mobile
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
  }, [])

  if (loading) return <Splash />
  if (!session) return <Auth />

  const Screen = SCREENS[page] || Dashboard
  const isFullScreen = FULL_SCREEN.has(page)

  if (isFullScreen) {
    return (
      <div className="app-shell">
        <Screen setPage={setPage} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar page={page} onAction={action => {
        if (action === 'chat') setPage('chat')
      }} />
      <Screen setPage={setPage} />
      <TabBar page={page} setPage={setPage} />
    </div>
  )
}

function Splash() {
  return (
    <div style={{
      height: '100dvh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', gap: 20,
    }}>
      <div style={{
        width: 72, height: 72, background: 'var(--accent)', borderRadius: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 34, fontWeight: 800, color: 'white',
        boxShadow: '0 6px 28px var(--accent-glow)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>G</div>
      <span style={{ color: 'var(--ink-tertiary)', fontSize: 14, fontFamily: 'var(--font)' }}>Loading…</span>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 6px 28px rgba(232,92,58,0.4); }
          50%       { transform: scale(1.05); box-shadow: 0 8px 36px rgba(232,92,58,0.65); }
        }
      `}</style>
    </div>
  )
}
