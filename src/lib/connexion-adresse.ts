// La connexion du Carnet suit le parcours de aoknowledge.com/connexion
// (16/11/2026, consigne de Brice : « tout les formulaire devais etre mis à
// jours [...] tout ceux de notre éco-système »). Référence : le site,
// sites/Aoknowledgecom/v3/src/lib/connexion-adresse.ts et lien-connexion.ts.
//
// Le parcours : un champ email et « Continuer ». Le Carnet demande à la route
// du journal /api/connexion/adresse ce que l'écosystème sait de l'adresse.
// Une seule réponse :
//   google     un compte existe avec une identité Google ;
//   connue     un compte existe sans Google, ou un achat attend l'adresse ;
//   inconnue   ni compte ni achat : on propose d'essayer l'adresse du
//              paiement, puis « Créer un compte gratuit avec cette adresse » ;
//   rattachee  adresse secondaire d'un compte : jamais de second compte ;
//   simple     la route ne répond pas (origine pas encore sur la liste du
//              journal, réseau, limite) : l'email part quand même (repli).
//
// Brice, 16/11 : « le code à 6 chiffres n'est pas la connexion principale
// mais secondaire à la limite ». Comme sur le site, les voies principales sont
// Google pour un compte Google et le LIEN de l'email pour une adresse connue.
// Un lien d'email ne s'ouvre pas dans une extension : il revient sur une page
// du journal qui passe le jeton au Carnet (connexion-lien.ts). Le code à 6
// chiffres et le mot de passe restent des choix secondaires. Le repli (route
// indisponible) passe par signInWithOtp de Supabase, comme le site.
//
// Module pur (aucun import) : tests/connexion-adresse.test.ts le teste.

/** Le journal : les deux routes de la connexion. */
export const JOURNAL_CONNEXION = 'https://journal.aoknowledge.com'
export const ROUTE_ADRESSE = `${JOURNAL_CONNEXION}/api/connexion/adresse`
export const ROUTE_ENVOI = `${JOURNAL_CONNEXION}/api/connexion/envoi`
/**
 * Le lien de l'email du repli (Supabase, PKCE) revient sur la page de retour du
 * Carnet côté journal, qui passe le `code` à l'extension. Valable seulement une
 * fois cette adresse ajoutée aux Redirect URLs de Supabase (sinon Supabase
 * renvoie sur la Site URL, et le lien ne connecte pas le Carnet).
 */
export const URL_RETOUR_REPLI = `${JOURNAL_CONNEXION}/auth/carnet`

/** Ce que la route dit d'une adresse. */
export type Porte = 'google' | 'connue' | 'inconnue' | 'rattachee'
export type Reconnaissance = Porte | 'simple'

const PORTES: readonly string[] = ['google', 'connue', 'inconnue', 'rattachee']

/** La réponse de /api/connexion/adresse ({ reponse }) ; tout le reste : 'simple'. */
export function lireReconnaissance(v: unknown): Reconnaissance {
  const r = v && typeof v === 'object' ? (v as { reponse?: unknown }).reponse : null
  return typeof r === 'string' && PORTES.includes(r) ? (r as Porte) : 'simple'
}

/** D'où part l'email : la route du journal (Resend, avec le code) ou Supabase (repli). */
export type Voie = 'aok' | 'supabase'

/**
 * Les modèles d'email de Supabase contiennent-ils le code (`{{ .Token }}`) ?
 * Même réglage que le site (CODE_SUPABASE de son connexion-adresse.ts) : à
 * passer à true quand les modèles « Magic Link » et « Confirm signup » auront
 * le code. Ne sert qu'au repli.
 */
export const CODE_SUPABASE = false

/** L'email de cette voie contient-il sûrement le code à 6 chiffres ? */
export function codeSurDansEmail(voie: Voie): boolean {
  return voie === 'aok' || CODE_SUPABASE
}

/** Le résultat d'un envoi, vu par l'écran. */
export type Envoi =
  | { t: 'ok'; voie: Voie }
  | { t: 'delai'; secondes: number; voie: Voie } // un email vient de partir à cette adresse
  | { t: 'plafond' } // plafond d'envoi (du jour, de l'heure, ou de Supabase)
  | { t: 'rattachee' }
  | { t: 'inconnue' }
  | { t: 'erreur'; message: string }

/** La réponse de /api/connexion/envoi ; null : route indisponible (l'écran passe au repli). */
export function lireEnvoiRoute(v: unknown): Envoi | null {
  const o = v && typeof v === 'object' ? (v as { envoi?: unknown; secondes?: unknown }) : {}
  switch (o.envoi) {
    case 'ok': return { t: 'ok', voie: 'aok' }
    case 'delai': {
      const n = typeof o.secondes === 'number' && Number.isFinite(o.secondes) ? Math.round(o.secondes) : DELAI_RENVOI_S
      return { t: 'delai', secondes: Math.min(3600, Math.max(1, n)), voie: 'aok' }
    }
    case 'plafond':
    case 'limite': return { t: 'plafond' }
    case 'rattachee': return { t: 'rattachee' }
    case 'inconnue': return { t: 'inconnue' }
    case 'invalide': return { t: 'erreur', message: 'invalide' }
    default: return null
  }
}

/** Une adresse qui vaut la peine d'être demandée (le serveur revérifie). */
export function adresseValide(email: string): boolean {
  const a = email.trim()
  return a.length >= 6 && a.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)
}

/** Le code tapé ou collé (« Ton code : 123 456 ») : les chiffres seuls, 6 au plus. */
export const LONGUEUR_CODE = 6
export function codeSaisi(texte: string): string {
  return texte.replace(/\D/g, '').slice(0, LONGUEUR_CODE)
}

export type IssueCode = { t: 'ok' } | { t: 'faux' } | { t: 'trop' } | { t: 'erreur' }

type ErreurAuth = { status?: number; code?: string; message?: string } | null | undefined

/**
 * Le refus de verifyOtp. GoTrue rend le même `otp_expired` (« Token has expired
 * or is invalid ») pour un code faux, expiré ou remplacé par un plus récent.
 */
export function issueCode(e: ErreurAuth): IssueCode {
  if (!e) return { t: 'ok' }
  const message = typeof e.message === 'string' ? e.message : ''
  if (e.status === 429 || /rate limit/i.test(message) || e.code === 'over_request_rate_limit') return { t: 'trop' }
  if (e.code === 'otp_expired' || e.status === 403 || /expired|invalid/i.test(message)) return { t: 'faux' }
  return { t: 'erreur' }
}

/** Secondes avant de pouvoir redemander un email à la même adresse (réglage Supabase par défaut). */
export const DELAI_RENVOI_S = 60

export type IssueEnvoi =
  | { t: 'ok' }
  | { t: 'delai'; secondes: number } // un email vient de partir à cette adresse
  | { t: 'plafond' } // plafond d'envoi du projet atteint
  | { t: 'erreur'; message: string }

/**
 * Le résultat d'un envoi de Supabase (signInWithOtp, mot de passe oublié),
 * d'après son erreur (null : envoyé). Le même code `over_email_send_rate_limit`
 * couvre le délai par adresse (« after 47 seconds ») et le plafond du projet
 * (« email rate limit exceeded ») : le message seul les distingue.
 */
export function issueEnvoi(e: ErreurAuth): IssueEnvoi {
  if (!e) return { t: 'ok' }
  const message = typeof e.message === 'string' ? e.message : ''
  const n = /after\s+(\d+)\s*seconds?/i.exec(message)
  if (n) return { t: 'delai', secondes: Math.min(3600, Math.max(1, Number(n[1]))) }
  if (/for security purposes/i.test(message)) return { t: 'delai', secondes: DELAI_RENVOI_S }
  if (
    e.status === 429 ||
    e.code === 'over_email_send_rate_limit' ||
    e.code === 'over_request_rate_limit' ||
    /rate limit/i.test(message)
  ) {
    return { t: 'plafond' }
  }
  return { t: 'erreur', message }
}

/** L'envoi du repli (signInWithOtp), dans la forme de l'écran. */
export function envoiDuRepli(e: ErreurAuth): Envoi {
  const i = issueEnvoi(e)
  if (i.t === 'ok') return { t: 'ok', voie: 'supabase' }
  if (i.t === 'delai') return { t: 'delai', secondes: i.secondes, voie: 'supabase' }
  return i
}

/** Refus du mot de passe : compte créé avec Google ou par code, donc sans mot de passe, ou mot de passe faux. */
export function motDePasseRefuse(e: ErreurAuth): boolean {
  return Boolean(e) && (e?.code === 'invalid_credentials' || e?.message === 'Invalid login credentials')
}

/** Adresse Gmail (gmail.com, googlemail.com) : « Continuer avec Google » la connecte sans email. */
export function estGmail(email: string): boolean {
  const a = email.trim().toLowerCase()
  const i = a.lastIndexOf('@')
  if (i < 1) return false
  const domaine = a.slice(i + 1)
  return domaine === 'gmail.com' || domaine === 'googlemail.com'
}

/** La clé d'une adresse pour le décompte (même adresse, autre casse : même délai). */
export function cleAdresse(email: string): string {
  return email.trim().toLowerCase()
}

/** La sortie « Écris-nous » : l'objet est prérempli, l'adresse du membre n'est JAMAIS dans le lien. */
export const SUPPORT = 'support@aoknowledge.com'
export const OBJET_SUPPORT = "Je n'arrive pas à me connecter au Carnet"
export function lienEcrisNous(): string {
  return `mailto:${SUPPORT}?subject=${encodeURIComponent(OBJET_SUPPORT)}`
}

/** Le nom de l'email attendu, selon la voie (objets des modèles, mot pour mot, comme le site). */
export const SUJET_AOK = 'Ton code de connexion AO Knowledge'
export const SUJET_SUPABASE_LIEN = 'Ton lien de connexion AO Knowledge'
export const SUJET_SUPABASE_INSCRIPTION = 'Confirme ton adresse pour entrer chez AO Knowledge'

// ---------------------------------------------------------------- Les écrans

/** Les écrans de la connexion du Carnet (mêmes portes que le site). */
export type EcranConnexion = 'adresse' | 'verif' | 'google' | 'boite' | 'inconnue' | 'rattachee'

/** Après « Continuer » : la porte de la réponse, ou l'envoi de l'email (connue, ou la route ne répond pas). */
export function suiteReconnaissance(r: Reconnaissance): 'google' | 'inconnue' | 'rattachee' | 'envoi' {
  if (r === 'google' || r === 'inconnue' || r === 'rattachee') return r
  return 'envoi'
}

/**
 * Créer un compte (porte « inconnue », le Carnet est un produit d'appel : le
 * geste le plus simple de l'écran). Un Gmail : Google crée le compte en un
 * clic, sans email à attendre ; une autre adresse : le lien part par email.
 */
export function suiteCreation(email: string): 'google' | 'envoi' {
  return estGmail(email) ? 'google' : 'envoi'
}

/** Après un envoi : la route peut encore renvoyer vers une porte (adresse rattachée, ou inconnue sans « créer »). */
export function ecranApresEnvoi(e: Envoi): 'rattachee' | 'inconnue' | 'boite' {
  if (e.t === 'rattachee') return 'rattachee'
  if (e.t === 'inconnue') return 'inconnue'
  return 'boite'
}
