// Besoins des membres, lot 2 (06/11/2026) : « Il me manque quelque chose »,
// ouvert depuis le Support et depuis le menu de la roue (près de « Envoyer un
// diagnostic »). Les trois appels au journal et la compression de la capture.
// Règles pures : besoins-pur.ts.
//
// Aucune minuterie : « Déjà prévu » se lit à l'ouverture du formulaire.
// Rien n'est écrit dans chrome.storage ni dans le localStorage : le brouillon
// non envoyé vit en mémoire du panneau (perdu à sa fermeture). Le texte du
// membre part tel quel, ni coupé ni reformaté. Pas de champ `page` : le
// panneau latéral n'a pas de page à lui, et l'adresse de l'onglet ouvert
// n'a pas à partir.
import { getBearerToken } from './auth'
import { JOURNAL_API } from './sync'
import {
  APP_BESOIN, CAPTURE_TAILLE_MAX, dimensionsCible, lireBesoins, phraseDuServeur,
  type BesoinPrevu,
} from './besoins-pur'
import {
  envoyerSignal, lireLivres, type BesoinLivre, type CleSignal, type IssueSignal,
} from './besoins-decouverte'

export type ReponsePrevus =
  | { etat: 'ok'; besoins: BesoinPrevu[] }
  | { etat: 'pas-encore' }
  | { etat: 'non-connecte' }
  | { etat: 'erreur' }

export type ReponseVote =
  | { etat: 'ok'; votes: number }
  | { etat: 'ferme' }
  | { etat: 'non-connecte' }
  | { etat: 'erreur' }

/** `code` null = réseau injoignable ; `phrase` null = 200 sans phrase. */
export type ReponseSignalement = { etat: 'ok'; phrase: string | null } | { etat: 'erreur'; code: number | null }

export async function sessionBesoin(): Promise<boolean> {
  return (await getBearerToken().catch(() => null)) !== null
}

export async function lirePrevus(): Promise<ReponsePrevus> {
  const jeton = await getBearerToken().catch(() => null)
  if (!jeton) return { etat: 'non-connecte' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/besoins/prevus?app=${APP_BESOIN}`, {
      headers: { 'Authorization': `Bearer ${jeton}` },
    })
    if (res.status === 404) return { etat: 'pas-encore' }
    if (res.status === 401) return { etat: 'non-connecte' }
    if (!res.ok) return { etat: 'erreur' }
    return { etat: 'ok', besoins: lireBesoins(await res.json().catch(() => null)) }
  } catch {
    return { etat: 'erreur' }
  }
}

export async function voterBesoin(besoinId: string): Promise<ReponseVote> {
  const jeton = await getBearerToken().catch(() => null)
  if (!jeton) return { etat: 'non-connecte' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/besoins/voter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jeton}` },
      body: JSON.stringify({ besoinId }),
    })
    if (res.status === 404) return { etat: 'ferme' }
    if (res.status === 401) return { etat: 'non-connecte' }
    if (!res.ok) return { etat: 'erreur' }
    const data = await res.json().catch(() => null) as { votes?: unknown } | null
    return { etat: 'ok', votes: typeof data?.votes === 'number' ? data.votes : -1 }
  } catch {
    return { etat: 'erreur' }
  }
}

/** `signal` : la clé de friction quand le formulaire s'est ouvert depuis une ligne C (besoins-decouverte.ts). */
export async function signalerBesoin(texte: string, capture?: string, signal?: CleSignal | null): Promise<ReponseSignalement> {
  const jeton = await getBearerToken().catch(() => null)
  if (!jeton) return { etat: 'erreur', code: 401 }
  try {
    const res = await fetch(`${JOURNAL_API}/api/besoins/signaler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jeton}` },
      body: JSON.stringify({ app: APP_BESOIN, texte, capture, ...(signal ? { signal } : {}) }),
    })
    if (!res.ok) return { etat: 'erreur', code: res.status }
    return { etat: 'ok', phrase: phraseDuServeur(await res.json().catch(() => null)) }
  } catch {
    return { etat: 'erreur', code: null }
  }
}

// ─── Suite du 06/11 : signaux de friction (C) et besoins livrés (D) ──────────

/**
 * Le signal d'un refus ou d'une impasse, une fois, en silence, seulement
 * connecté (règles : besoins-decouverte.ts). Jamais attendu par l'appelant.
 */
export function signalerFriction(cle: CleSignal, contexte?: Record<string, unknown>): Promise<IssueSignal> {
  return envoyerSignal(cle, contexte, { api: JOURNAL_API, jeton: () => getBearerToken().catch(() => null) })
}

/**
 * GET /api/besoins/livres?app=extension, lu une fois à l'ouverture de l'écran
 * Versions du Guide. Pas de session, route pas encore en ligne, réseau : liste
 * vide (la section reste cachée).
 */
export async function chargerLivres(): Promise<BesoinLivre[]> {
  const jeton = await getBearerToken().catch(() => null)
  if (!jeton) return []
  try {
    const res = await fetch(`${JOURNAL_API}/api/besoins/livres?app=${APP_BESOIN}`, {
      headers: { 'Authorization': `Bearer ${jeton}` },
    })
    if (!res.ok) return []
    return lireLivres(await res.json().catch(() => null))
  } catch {
    return []
  }
}

// ─── Brouillon (mémoire du panneau seulement) ────────────────────────────────

export interface CaptureBesoin { dataUrl: string; largeur: number; hauteur: number }
export interface Brouillon { texte: string; capture: CaptureBesoin | null }

let brouillon: Brouillon = { texte: '', capture: null }

export const memoireBrouillon = {
  lire: (): Brouillon => brouillon,
  ecrire: (b: Brouillon) => { brouillon = b },
}

// ─── Capture : fichier ou presse-papiers, compressée ici ─────────────────────

export type ResultatCapture = { ok: true; capture: CaptureBesoin } | { ok: false; raison: 'format' | 'lourde' }

/** La première image d'un collage (Ctrl+V), ou null. */
export function imageCollee(donnees: DataTransfer | null): File | null {
  if (!donnees) return null
  for (const item of Array.from(donnees.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

/** WebP (Chrome sait l'écrire), JPEG à défaut. */
function encoder(canvas: HTMLCanvasElement, qualite: number): string {
  const webp = canvas.toDataURL('image/webp', qualite)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', qualite)
}

/** 1600 px au plus grand côté, sous 1,5 Mo : qualité qui baisse, puis taille. */
export async function compresserCapture(fichier: Blob): Promise<ResultatCapture> {
  if (fichier.type && !fichier.type.startsWith('image/')) return { ok: false, raison: 'format' }
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(fichier)
  } catch {
    return { ok: false, raison: 'format' }
  }
  try {
    if (!bmp.width || !bmp.height) return { ok: false, raison: 'format' }
    let echelle = 1
    for (let tour = 0; tour < 4; tour++) {
      const { largeur, hauteur } = dimensionsCible(bmp.width, bmp.height, echelle)
      const canvas = document.createElement('canvas')
      canvas.width = largeur
      canvas.height = hauteur
      const ctx = canvas.getContext('2d')
      if (!ctx) return { ok: false, raison: 'format' }
      // Fond blanc : un PNG transparent ne doit pas virer au noir en JPEG.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, largeur, hauteur)
      ctx.drawImage(bmp, 0, 0, largeur, hauteur)
      for (const qualite of [0.85, 0.7, 0.55]) {
        const dataUrl = encoder(canvas, qualite)
        if (dataUrl.length <= CAPTURE_TAILLE_MAX) return { ok: true, capture: { dataUrl, largeur, hauteur } }
      }
      echelle *= 0.75
    }
    return { ok: false, raison: 'lourde' }
  } finally {
    bmp.close()
  }
}
