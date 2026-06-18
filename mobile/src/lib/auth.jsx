import React, { createContext, useContext, useEffect, useState } from 'react'
import { sb } from './supabase'

const AuthContext = createContext(null)

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
        // Ensure profile row exists with Google metadata on every OAuth sign-in
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

    // Handle OAuth deep link callback (com.grangeai.app://auth-callback?code=xxx)
    let AppPlugin = null
    import('@capacitor/app').then(({ App }) => {
      AppPlugin = App
      App.addListener('appUrlOpen', async ({ url }) => {
        if (url && url.startsWith('com.grangeai.app://auth-callback')) {
          const code = new URL(url).searchParams.get('code')
          if (code) {
            try {
              await sb.auth.exchangeCodeForSession(code)
            } catch (e) {
              console.error('OAuth code exchange failed', e)
            }
          }
        }
      })
    }).catch(() => {})

    return () => {
      subscription.unsubscribe()
      AppPlugin?.removeAllListeners?.()
    }
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

  // Google OAuth via in-app browser.
  // After OAuth, Supabase redirects to com.grangeai.app://auth-callback?code=xxx.
  // The appUrlOpen listener above exchanges the code for a session.
  async function signInWithGoogle() {
    const { Browser } = await import('@capacitor/browser')
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
        redirectTo: 'com.grangeai.app://auth-callback',
      },
    })
    if (error) throw error
    await Browser.open({ url: data.url, windowName: '_self' })
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
