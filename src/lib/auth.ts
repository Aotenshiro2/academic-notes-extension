import { supabase, type Session, type User } from './supabase'
import {
  ROUTE_ADRESSE, ROUTE_ENVOI, URL_RETOUR_REPLI,
  envoiDuRepli, issueCode, lireEnvoiRoute, lireReconnaissance, motDePasseRefuse,
  type Envoi, type IssueCode, type Reconnaissance,
} from './connexion-adresse'
import { noterAttente } from './connexion-lien-extension'

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
 * `email` (16/11/2026, connexion par adresse) : l'adresse tapée pré-choisit le
 * compte Google (login_hint), comme sur aoknowledge.com/connexion. Le reste du
 * parcours ne change pas.
 *
 * Prérequis Supabase dashboard :
 * - Auth > Providers > Google : activé
 * - Auth > URL Configuration > Redirect URLs : ajouter "https://*.chromiumapp.org/**"
 */
export async function signInWithGoogle(email?: string | null): Promise<{ session: Session | null; error: string | null }> {
  try {
    const redirectTo = chrome.identity.getRedirectURL('auth/callback')
    const indice = email?.trim()

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        ...(indice ? { queryParams: { login_hint: indice } } : {}),
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

// ---------------------------------------------------------------------------
// Connexion par adresse (16/11/2026) : le parcours de aoknowledge.com/connexion.
// Règles et contrat : connexion-adresse.ts (pur). Les deux routes vivent dans
// le journal, ouvertes en CORS aux seules origines de sa liste blanche : tant
// que l'origine de l'extension (chrome-extension://<id>) n'y est pas, elles
// répondent 403, la reconnaissance rend 'simple' et l'envoi passe au repli
// (signInWithOtp). Voie principale : le LIEN de l'email, passé au Carnet par
// la page de retour du journal (connexion-lien.ts). Voie secondaire : le code
// à 6 chiffres (verifyOtp). La session s'enregistre comme celle de Google
// (chrome.storage.local).
// ---------------------------------------------------------------------------

const delai = (ms: number): AbortSignal | undefined =>
  typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined

async function poster(url: string, corps: Record<string, unknown>, ms: number): Promise<unknown> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
    cache: 'no-store',
    signal: delai(ms),
  })
  if (!r.ok) return null
  return r.json().catch(() => null)
}

/** Ce que l'écosystème sait de l'adresse (une seule réponse). Ne jette pas. */
export async function reconnaitreAdresse(email: string): Promise<Reconnaissance> {
  try {
    return lireReconnaissance(await poster(ROUTE_ADRESSE, { email: email.trim() }, 6000))
  } catch {
    return 'simple'
  }
}

export type OptionsEnvoi = {
  /** Adresse inconnue : le membre a choisi « Créer un compte gratuit ». */
  creer?: boolean
  /** Case « Recevoir les nouveautés » cochée à la création. */
  newsletter?: boolean
}

/** Envoie le code de connexion (route du journal, sinon Supabase). Ne jette pas. */
export async function envoyerCode(email: string, o: OptionsEnvoi = {}): Promise<Envoi> {
  const adresse = email.trim()
  let route: Envoi | null = null
  try {
    route = lireEnvoiRoute(await poster(ROUTE_ENVOI, {
      email: adresse,
      creer: o.creer === true,
      newsletter: o.newsletter === true,
      retour: null,
      // L'origine de l'extension (chrome-extension://<id>) : le journal fait
      // pointer le lien de l'email vers sa page de retour du Carnet, qui passe
      // le jeton à l'extension (connexion-lien.ts).
      origine: typeof location !== 'undefined' ? location.origin : null,
    }, 15000))
  } catch {
    route = null
  }
  if (route) return parti(adresse, route)

  // Repli : l'email de Supabase (PKCE). Son lien revient sur la même page de
  // retour du journal, qui passe le `code` au Carnet ; il faut pour cela
  // l'adresse de cette page dans les Redirect URLs de Supabase.
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: {
        emailRedirectTo: URL_RETOUR_REPLI,
        ...(o.newsletter ? { data: { newsletter_subscribed: true } } : {}),
      },
    })
    return parti(adresse, envoiDuRepli(error))
  } catch (err) {
    return { t: 'erreur', message: err instanceof Error ? err.message : '' }
  }
}

/** Un email est parti (ou vient de partir) : le Carnet attend son lien une heure. */
async function parti(adresse: string, e: Envoi): Promise<Envoi> {
  if (e.t === 'ok' || e.t === 'delai') await noterAttente(adresse)
  return e
}

/** Vérifie le code tapé. ok : la session est ouverte et gardée par l'extension. */
export async function verifierCode(email: string, code: string): Promise<IssueCode> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
    if (!error && data.session) return { t: 'ok' }
    return error ? issueCode(error) : { t: 'erreur' }
  } catch {
    return { t: 'erreur' }
  }
}

/**
 * Inscription à la newsletter juste après la création d'un compte (route du
 * journal, la même qu'avant le 16/11). Sans session, le journal n'accepte que
 * l'adresse d'un compte créé depuis moins de 24 h qui a coché la case. Ne jette pas.
 */
export function inscrireNewsletter(email: string): void {
  fetch('https://journal-d-etude-beta.vercel.app/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  }).catch(() => {})
}

/**
 * Connexion email + mot de passe (en lien secondaire depuis le 16/11/2026).
 * `refuse` : mot de passe faux, ou compte sans mot de passe (Google, code).
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ session: Session | null; error: string | null; refuse: boolean }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return { session: null, error: error.message, refuse: motDePasseRefuse(error) }
  return { session: data.session, error: null, refuse: false }
}

// « Mot de passe oublié » (16/11/2026) : plus de lien de réinitialisation
// envoyé d'ici. Le client de l'extension est en PKCE : le lien revenait sur le
// journal avec un `?code=` que le journal ne peut pas échanger (le vérificateur
// est dans chrome.storage.local de l'extension), la page restait sur
// « Vérification du lien ». Le membre reçoit l'email de connexion à la place
// (lien, et code en second ; ConnexionCarnet), et choisit un nouveau mot de
// passe dans le journal s'il en veut un.

/**
 * Déconnexion
 */
export async function signOut(): Promise<void> {
  // scope 'local' : le defaut ('global') revoque les sessions de TOUS les
  // appareils et de toutes les apps AOK (meme projet Supabase).
  await supabase.auth.signOut({ scope: 'local' })
}

/**
 * JWT Bearer token pour les appels API journal
 */
export async function getBearerToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token ?? null
}
