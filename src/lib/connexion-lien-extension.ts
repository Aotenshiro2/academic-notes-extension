import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { issueCode } from './connexion-adresse'
import {
  CLE_ATTENTE, attenteValide, lireDemandeLien, memeAdresse, origineLienPermise,
  type DemandeLien, type ReponseLien,
} from './connexion-lien'

// Le lien de l'email connecte le Carnet (1.10.1) : la page de retour du journal
// passe le jeton au service worker, qui le vérifie avec le client Supabase de
// l'extension (session gardée dans chrome.storage.local, comme Google). Règles
// et garde : connexion-lien.ts (pur). L'écran « Regarde ta boîte » voit la
// session arriver (chrome.storage.onChanged), sans minuterie.

/** L'écran vient d'envoyer un lien à cette adresse : le Carnet l'attend une heure. */
export async function noterAttente(email: string): Promise<void> {
  try { await chrome.storage.local.set({ [CLE_ATTENTE]: { email: email.trim(), a: Date.now() } }) } catch { /* stockage indisponible */ }
}

/** Connecté (lien, Google, code ou mot de passe) : plus rien à attendre. */
export async function oublierAttente(): Promise<void> {
  try { await chrome.storage.local.remove(CLE_ATTENTE) } catch { /* stockage indisponible */ }
}

/** Vérifie le jeton du lien (ou le code PKCE du repli) et ouvre la session du Carnet. Ne jette pas. */
export async function connecterParLien(d: DemandeLien): Promise<ReponseLien> {
  let attente = null
  try {
    const lu = await chrome.storage.local.get(CLE_ATTENTE)
    attente = attenteValide(lu?.[CLE_ATTENTE], Date.now())
  } catch { attente = null }
  if (!attente) return { ok: false, raison: 'pas-attendu' }

  try {
    const { data, error } = d.t === 'jeton'
      ? await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: d.type as EmailOtpType })
      : await supabase.auth.exchangeCodeForSession(d.code)
    if (error || !data?.session) {
      const i = issueCode(error)
      return { ok: false, raison: i.t === 'faux' ? 'expire' : i.t === 'trop' ? 'trop' : 'erreur' }
    }
    // Le compte doit être celui qui attendait : un lien d'un autre compte ne connecte pas ce Carnet.
    if (!memeAdresse(data.session.user?.email, attente.email)) {
      await supabase.auth.signOut({ scope: 'local' })
      return { ok: false, raison: 'autre-compte' }
    }
    await oublierAttente()
    return { ok: true }
  } catch {
    return { ok: false, raison: 'erreur' }
  }
}

/**
 * À appeler au chargement du service worker (au premier niveau : Chrome le
 * réveille pour ce message). Seules les pages de `externally_connectable`
 * peuvent écrire au Carnet, et la garde le revérifie.
 */
export function ecouterLiensDeConnexion(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessageExternal) return
  chrome.runtime.onMessageExternal.addListener((message, expediteur, repondre) => {
    if (!origineLienPermise(expediteur.origin, expediteur.url)) return false
    const demande = lireDemandeLien(message)
    if (!demande) return false
    void connecterParLien(demande).then(repondre)
    return true // réponse asynchrone
  })
}
