// Le lien de connexion de l'email connecte le Carnet (1.10.1, 16/11/2026).
//
// Brice, 16/11 : « le code à 6 chiffres n'est pas la connexion principale mais
// secondaire à la limite ». Les voies principales sont celles du site :
// Google pour un compte Google, le LIEN de l'email pour une adresse connue.
//
// Un lien d'email ne s'ouvre pas dans une extension (un lien chrome-extension://
// est retiré ou bloqué par les messageries). Le chemin retenu :
//   1. le Carnet demande l'email à la route du journal (/api/connexion/envoi),
//      depuis son origine chrome-extension://<id> ; il note qu'il attend un
//      lien pour cette adresse (CLE_ATTENTE, une heure au plus) ;
//   2. le journal fait pointer le lien de l'email vers SA page de retour du
//      Carnet (https://journal.aoknowledge.com/auth/carnet, à coder côté
//      journal), le jeton dans le fragment : #token_hash=...&type=... ;
//   3. cette page ne consomme PAS le jeton : elle le passe à l'extension par
//      chrome.runtime.sendMessage(<id>, ...), permis par `externally_connectable`
//      (manifest : la seule origine du journal) ;
//   4. le service worker du Carnet vérifie le jeton lui-même
//      (verifyOtp({ token_hash, type })) : le Carnet a SA session, distincte de
//      celle du navigateur (pas de jeton de rafraîchissement partagé).
// Le repli (route indisponible, email de Supabase en PKCE) passe un `code` :
// exchangeCodeForSession, avec le vérificateur que le Carnet a lui-même gardé.
//
// Garde : origine de l'expéditeur sur la liste, forme du message, et le Carnet
// doit attendre un lien (envoyé depuis cet écran dans l'heure) ; après la
// vérification, l'adresse du compte doit être celle qui attendait.
//
// Module pur (aucun import) : tests/connexion-lien.test.ts le teste.

/** Le type du message que la page de retour du journal envoie à l'extension. */
export const MESSAGE_LIEN = 'carnet:connexion-lien'

/** Les pages qui ont le droit de passer un lien au Carnet (même liste que `externally_connectable`). */
export const ORIGINES_LIEN: readonly string[] = ['https://journal.aoknowledge.com']

/** La page de retour du lien côté journal (à coder dans le journal). */
export const PAGE_RETOUR_LIEN = 'https://journal.aoknowledge.com/auth/carnet'

/**
 * La session du Carnet dans chrome.storage.local : la clé par défaut de
 * supabase-js (`sb-<projet>-auth-token`) avec le préfixe `sb_` de l'adaptateur
 * de supabase.ts. L'écran la regarde arriver (chrome.storage.onChanged).
 */
export const CLE_SESSION_CARNET = 'sb_sb-ujdqrtjanmmwidnfhkxg-auth-token'

/** Ce que le Carnet attend : l'adresse à qui le lien vient de partir, et quand. */
export const CLE_ATTENTE = 'carnet-connexion-attendue'
/** Un lien de Supabase vaut une heure : au-delà, le Carnet n'attend plus rien. */
export const DUREE_ATTENTE_MS = 60 * 60 * 1000

export type Attente = { email: string; a: number }

export const TYPES_LIEN: readonly string[] = ['magiclink', 'signup', 'email', 'invite']

export type DemandeLien =
  | { t: 'jeton'; tokenHash: string; type: string }
  | { t: 'code'; code: string }

/** L'expéditeur est-il une page de la liste ? (sender.origin, sinon l'origine de sender.url) */
export function origineLienPermise(origine: string | null | undefined, url?: string | null): boolean {
  let o = typeof origine === 'string' && origine ? origine : null
  if (!o && typeof url === 'string') {
    try { o = new URL(url).origin } catch { o = null }
  }
  return o !== null && ORIGINES_LIEN.includes(o)
}

/** Le message de la page de retour, vérifié ; null : on l'ignore. */
export function lireDemandeLien(v: unknown): DemandeLien | null {
  if (!v || typeof v !== 'object') return null
  const m = v as { type?: unknown; token_hash?: unknown; otpType?: unknown; code?: unknown }
  if (m.type !== MESSAGE_LIEN) return null
  if (typeof m.token_hash === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(m.token_hash)) {
    const type = typeof m.otpType === 'string' && TYPES_LIEN.includes(m.otpType) ? m.otpType : 'magiclink'
    return { t: 'jeton', tokenHash: m.token_hash, type }
  }
  if (typeof m.code === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(m.code)) return { t: 'code', code: m.code }
  return null
}

/** L'attente notée par l'écran, si elle vaut encore (une heure). */
export function attenteValide(v: unknown, maintenant: number): Attente | null {
  if (!v || typeof v !== 'object') return null
  const a = v as { email?: unknown; a?: unknown }
  if (typeof a.email !== 'string' || !a.email || typeof a.a !== 'number') return null
  if (maintenant - a.a < 0 || maintenant - a.a > DUREE_ATTENTE_MS) return null
  return { email: a.email, a: a.a }
}

/** Même adresse, quelle que soit la casse. */
export function memeAdresse(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== ''
}

/** La réponse du Carnet à la page de retour. */
export type ReponseLien =
  | { ok: true }
  | { ok: false; raison: 'pas-attendu' | 'expire' | 'trop' | 'autre-compte' | 'erreur' }
