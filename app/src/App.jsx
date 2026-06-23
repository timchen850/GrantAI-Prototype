import React, { useState } from 'react'
import { useAuth } from './lib/auth'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Auth from './screens/Auth'
import Dashboard from './screens/Dashboard'
import Discovery from './screens/Discovery'
import Generator from './screens/Generator'
import Grants from './screens/Grants'
import Readiness from './screens/Readiness'
import Chat from './screens/Chat'
import Profile from './screens/Profile'
import ApplicationWriter from './screens/ApplicationWriter'

const SCREENS = {
  dashboard: Dashboard,
  discovery: Discovery,
  generator: Generator,
  grants: Grants,
  readiness: Readiness,
  chat: Chat,
  profile: Profile,
  'application-writer': ApplicationWriter,
}

export default function App() {
  const { session, loading } = useAuth()
  // page can be a string or { name, ...params }
  const [pageState, setPageState] = useState('dashboard')

  const pageName   = typeof pageState === 'string' ? pageState : pageState.name
  const pageParams = typeof pageState === 'string' ? {} : pageState

  // setPage accepts either a string or an object { name, ...params }
  const setPage = (target) => setPageState(target)

  if (loading) return <SplashScreen />
  if (!session) return <Auth />

  const Screen = SCREENS[pageName] || Dashboard

  return (
    <div className="app-shell">
      <TitleBar page={pageName} />
      <div className="layout">
        <Sidebar page={pageName} setPage={setPage} />
        <main className="main-content">
          <Screen setPage={setPage} pageParams={pageParams} />
        </main>
      </div>
    </div>
  )
}

function SplashScreen() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      gap: 20,
    }}>
      <div style={{
        width: 56, height: 56,
        background: 'var(--accent)',
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, fontWeight: 800, color: 'white',
        boxShadow: '0 4px 24px rgba(232,92,58,0.45)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>G</div>
      <span style={{ color: 'var(--ink-tertiary)', fontSize: 13 }}>Loading Grange AI…</span>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 24px rgba(232,92,58,0.45); }
          50% { transform: scale(1.05); box-shadow: 0 8px 32px rgba(232,92,58,0.6); }
        }
      `}</style>
    </div>
  )
}
