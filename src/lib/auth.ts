import { supabase, type Session, type User } from './supabase'

/**
 * Obtenir la session courante (null si non connecté)
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Obtenir l'utilisateur courant (null si non connecté)
 */
export async function getUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Connexion Google via chrome.identity.launchWebAuthFlow() + Supabase PKCE
 *
 * Flow :
 * 1. Supabase génère l'URL OAuth Google avec code_challenge PKCE
 * 2. chrome.identity.launchWebAuthFlow() ouvre la popup Google
 * 3. Supabase redirige vers chromiumapp.org avec le code
 * 4. On extrait le code et on échange pour une session
 *
 * Prérequis Supabase dashboard :
 * - Auth > Providers > Google : activé
 * - Auth > URL Configuration > Redirect URLs : ajouter "https://*.chromiumapp.org/**"
 */
export async function signInWithGoogle(): Promise<{ session: Session | null; error: string | null }> {
  try {
    const redirectTo = chrome.identity.getRedirectURL('auth/callback')

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })

    if (oauthError || !data?.url) {
      return { session: null, error: oauthError?.message ?? 'OAuth URL generation failed' }
    }

    // Ouvrir la popup OAuth
    const redirectUrl: string = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: data.url, interactive: true },
        (responseUrl) => {
          if (chrome.runtime.lastError || !responseUrl) {
            reject(chrome.runtime.lastError?.message ?? 'Auth popup closed')
          } else {
            resolve(responseUrl)
          }
        }
      )
    })

    // Extraire le code PKCE depuis l'URL de retour
    const url = new URL(redirectUrl)
    const code = url.searchParams.get('code')

    if (!code) {
      return { session: null, error: 'No auth code in callback URL' }
    }

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      return { session: null, error: exchangeError.message }
    }

    return { session: sessionData.session, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { session: null, error: msg }
  }
}

/**
 * Déconnexion
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * JWT Bearer token pour les appels API journal
 */
export async function getBearerToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token ?? null
}
