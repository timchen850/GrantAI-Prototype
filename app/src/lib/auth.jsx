import React, { createContext, useContext, useEffect, useState } from 'react'
import { sb } from './supabase'

const AuthContext = createContext(null)

const SUPABASE_URL = 'https://xewrvmqyzeiziimcmenj.supabase.co'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      if (session) {
        // For any OAuth sign-in, ensure the profile row exists with Google metadata
        if (event === 'SIGNED_IN') {
          const meta = session.user.user_metadata || {}
          await sb.from('profiles').upsert({
            user_id: session.user.id,
            contact_name: meta.full_name || meta.name || null,
            contact_email: session.user.email || null,
          }, { onConflict: 'user_id', ignoreDuplicates: false })
        }
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
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
        contact_email: email,
      }, { onConflict: 'user_id' })
    }
  }

  async function signInWithMagicLink(email) {
    const { error } = await sb.auth.signInWithOtp({ email })
    if (error) throw error
  }

  // Google OAuth via Electron child BrowserWindow.
  // Uses implicit flow (flowType:'implicit' in supabase.js) so Supabase puts
  // access_token + refresh_token directly in the URL hash — no PKCE exchange needed.
  // Redirect: http://localhost:3000/auth/callback#access_token=xxx&refresh_token=xxx
  // Main process intercepts the navigation before the browser tries to connect to localhost.
  async function signInWithGoogle() {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
        redirectTo: 'http://localhost:3000/auth/callback',
      },
    })
    if (error) throw error

    // Race the OAuth popup against a 90-second timeout so loading never stays stuck.
    const callbackUrl = await Promise.race([
      window.electronAPI.openOAuthWindow(data.url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign-in timed out — please try again.')), 90000)
      ),
    ])
    if (!callbackUrl) return // user closed the window

    const url = new URL(callbackUrl)

    // Implicit flow: tokens are in the URL hash (#access_token=...&refresh_token=...)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const access_token  = hash.get('access_token')
    const refresh_token = hash.get('refresh_token')
    if (access_token) {
      const { error: ex } = await sb.auth.setSession({ access_token, refresh_token: refresh_token || '' })
      if (ex) throw ex
      return
    }

    // PKCE fallback: code in query string (?code=...)
    const code = url.searchParams.get('code')
    if (code) {
      const { error: ex } = await sb.auth.exchangeCodeForSession(code)
      if (ex) throw ex
      return
    }

    throw new Error('Google sign-in did not return a session. Please try again.')
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
      signInWithGoogle,
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
