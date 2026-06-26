import React, { createContext, useContext, useEffect, useState } from 'react'
import { sb } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const initialized = React.useRef(false)

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      initialized.current = true
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      // Ignore events that arrive before getSession() completes to prevent
      // the landing page from flashing before the real session is known.
      if (!initialized.current) return
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data } = await sb.from('profiles').select('*').eq('user_id', userId).single()
      setProfile(data)
    } catch {}
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email, password, orgName) {
    const { data, error } = await sb.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      await sb.from('profiles').upsert({
        user_id: data.user.id,
        org_name: orgName,
        email,
      })
    }
  }

  async function signInWithMagicLink(email) {
    const { error } = await sb.auth.signInWithOtp({ email })
    if (error) throw error
  }

  async function signOut() {
    await sb.auth.signOut()
  }

  async function updateProfile(updates) {
    if (!session) return
    const { data, error } = await sb.from('profiles')
      .upsert({ ...updates, user_id: session.user.id })
      .select().single()
    if (error) throw error
    setProfile(data)
    return data
  }

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      loading,
      signIn,
      signUp,
      signInWithMagicLink,
      signOut,
      updateProfile,
      refetchProfile: () => session && fetchProfile(session.user.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
