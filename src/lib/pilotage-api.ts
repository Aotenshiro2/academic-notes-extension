import { getBearerToken, getSession } from './auth'
import { messageAOnglet } from './message-onglet'
import { JOURNAL_API } from './sync'
import type { CompteConnu, ListeComptesPilotage } from './pilotage-comptes'
import { lireLignesApercu, normaliseLecture, normaliseQuota, type LigneApercu, type Lecture, type Quota, type TradeNormalise } from './documents-lecture'
import type { PositionImportee } from './positions-jour'
import { normaliseLectureOrdre, type LectureOrdre } from './prix-trade'

// Les trades du broker, vus du Carnet (1.8.12, élargi en 1.8.13).
//
// Les positions vivent sur le compte AOK du membre, dans le backend du journal
// (table TradeImport), rangées sur un compte de Pilotage (`compteId`). Le
// Carnet :
// - lit les positions et pose ou retire le lien (segmentRef) avec un trade de
//   la note (`/api/pilotage/trades/positions`) ;
// - importe un export du broker comme Pilotage le fait (`documents/lire` puis
//   `trades/import`) : même table, même `compteId`, ça vaut un import Pilotage.
// Jamais une saisie manuelle : ce que le membre tape (le « prévu ») reste dans
// le Carnet.

export type { PositionImportee }

type Reponse = { status: number; data: Record<string, unknown> }

/** Un appel au journal avec le jeton du Carnet. null : pas de session ; status 0 : réseau. */
async function appeler(methode: 'GET' | 'POST' | 'PATCH', chemin: string, corps?: unknown): Promise<Reponse | null> {
  const token = await getBearerToken()
  if (!token) return null
  try {
    const res = await fetch(`${JOURNAL_API}${chemin}`, {
      method: methode,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data: data && typeof data === 'object' ? data as Record<string, unknown> : {} }
  } catch {
    return { status: 0, data: {} }
  }
}

const messageDe = (r: Reponse) => (typeof r.data.error === 'string' && r.data.error ? r.data.error : null)

// ── Positions et liens ───────────────────────────────────────────────────────

/** Les positions dont l'entrée tombe entre `depuis` et `jusqu` (instants) ; sans bornes, toutes. */
export async function fetchPositions(bornes?: { depuis: number; jusqu: number }): Promise<{ positions?: PositionImportee[]; error?: 'non-connecte' | 'reseau' }> {
  const q = bornes
    ? `?depuis=${encodeURIComponent(new Date(bornes.depuis).toISOString())}&jusqu=${encodeURIComponent(new Date(bornes.jusqu).toISOString())}`
    : ''
  const r = await appeler('GET', `/api/pilotage/trades/positions${q}`)
  if (!r || r.status === 401) return { error: 'non-connecte' }
  if (r.status < 200 || r.status >= 300) return { error: 'reseau' }
  return { positions: Array.isArray(r.data.positions) ? r.data.positions as PositionImportee[] : [] }
}

export type ErreurLien = 'non-connecte' | 'introuvable' | 'deja-lie' | 'copie-liee' | 'reseau'

// Résultats à plat (pas d'union) : le projet compile sans `strict`, où `if (!r.ok)` ne rétrécit pas une union.

/** ok : `liees` sur `total` positions liées ; sinon `error`. `ancienJournal` : le journal en ligne n'a pas la forme 1.8.13. */
export type ResultatLien = { ok: boolean; liees: number; total: number; error?: ErreurLien; autrePositionId?: string; ancienJournal: boolean }

const erreurDe = (r: Reponse | null): ErreurLien =>
  !r || r.status === 401 ? 'non-connecte' : r.status === 404 ? 'introuvable' : 'reseau'

/** Le lien d'UNE position (forme de la 1.8.12). 409 : ce trade du Carnet est déjà lié ailleurs. */
export async function lierUnePosition(positionId: string, segmentRef: string | null): Promise<{ ok: boolean; error?: ErreurLien; autrePositionId?: string }> {
  const r = await appeler('PATCH', '/api/pilotage/trades/positions', segmentRef ? { action: 'lier', positionId, segmentRef } : { action: 'delier', positionId })
  if (r && r.status >= 200 && r.status < 300) return { ok: true }
  if (r?.status === 409) return { ok: false, error: 'deja-lie', autrePositionId: typeof r.data.positionId === 'string' ? r.data.positionId : undefined }
  return { ok: false, error: erreurDe(r) }
}

/**
 * Lie toutes les positions d'un trade (les copies) d'un coup :
 * `{ action: 'lier', positionIds, segmentRef, ajouter: true }` (journal 1.8.13).
 * Un journal plus ancien refuse cette forme (400) : on retombe sur un lien un
 * par un (`positionId`), qui n'en accepte qu'un par trade ; `liees` le dit.
 */
export async function lierPositions(positionIds: string[], segmentRef: string): Promise<ResultatLien> {
  const total = positionIds.length
  const r = await appeler('PATCH', '/api/pilotage/trades/positions', { action: 'lier', positionIds, segmentRef, ajouter: true })
  if (r && r.status >= 200 && r.status < 300) return { ok: true, liees: total, total, ancienJournal: false }
  if (r?.status === 409) {
    return { ok: false, liees: 0, total, error: 'copie-liee', autrePositionId: typeof r.data.positionId === 'string' ? r.data.positionId : undefined, ancienJournal: false }
  }
  if (r?.status !== 400) return { ok: false, liees: 0, total, error: erreurDe(r), ancienJournal: false }

  let liees = 0
  let premierRefus: { error: ErreurLien; autrePositionId?: string } | null = null
  for (const positionId of positionIds) {
    const un = await lierUnePosition(positionId, segmentRef)
    if (un.ok) liees++
    else {
      premierRefus ??= { error: un.error ?? 'reseau', autrePositionId: un.autrePositionId }
      if (un.error === 'non-connecte' || un.error === 'reseau') break
    }
  }
  if (liees === 0) return { ok: false, liees, total, error: premierRefus?.error ?? 'reseau', autrePositionId: premierRefus?.autrePositionId, ancienJournal: true }
  return { ok: true, liees, total, ancienJournal: true }
}

/**
 * Délie tout le trade : `{ action: 'delier', segmentRef }` (journal 1.8.13) ;
 * sur un journal plus ancien (400), position par position.
 */
export async function delierTrade(segmentRef: string, positionIds: string[]): Promise<{ ok: boolean; error?: ErreurLien; ancienJournal: boolean }> {
  const r = await appeler('PATCH', '/api/pilotage/trades/positions', { action: 'delier', segmentRef })
  if (r && r.status >= 200 && r.status < 300) return { ok: true, ancienJournal: false }
  if (r?.status !== 400) return { ok: false, error: erreurDe(r), ancienJournal: false }
  for (const positionId of positionIds) {
    const un = await lierUnePosition(positionId, null)
    if (!un.ok) return { ok: false, error: un.error, ancienJournal: true }
  }
  return { ok: true, ancienJournal: true }
}

// ── Import d'un export du broker ─────────────────────────────────────────────

/** Ce que Pilotage dit de ses comptes au journal, pour le rapprochement. */
export type CompteEnvoye = { id: string; nom: string; firmName?: string; brokerName?: string; identifiants?: string[] }

export const comptesEnvoyes = (comptes: CompteConnu[]): CompteEnvoye[] => comptes.map(compte => ({
  id: compte.id,
  nom: compte.nom,
  ...(compte.firmName ? { firmName: compte.firmName } : {}),
  ...(compte.brokerName ? { brokerName: compte.brokerName } : {}),
  identifiants: compte.identifiants,
}))

/** 4,4 Mo de base64 au plus par document (limite de corps de Vercel). */
export const TAILLE_MAX_BASE64 = 4_400_000

/** ok : `lecture` ; sinon `erreur` et le message du journal. `quota` dans les deux cas quand il est rendu. */
export type ResultatLecture = {
  ok: boolean
  lecture?: Lecture
  quota: Quota | null
  erreur?: 'non-connecte' | 'epuisees' | 'trop-lourd' | 'indisponible' | 'refus' | 'reseau'
  message?: string | null
}

/** Un document lu par le journal, gardé dans le coffre (`garder: true`), comme le dépôt de Pilotage. */
export async function lireDocument(demande: { nom: string; type: string; data: string; comptes: CompteEnvoye[] }): Promise<ResultatLecture> {
  const r = await appeler('POST', '/api/pilotage/documents/lire', { ...demande, garder: true })
  if (!r || r.status === 401) return { ok: false, erreur: 'non-connecte', message: null, quota: null }
  const quota = normaliseQuota(r.data.quota)
  if (r.status >= 200 && r.status < 300) return { ok: true, lecture: normaliseLecture(r.data.lecture, r.data.empreintes), quota }
  const erreur = r.status === 0 ? 'reseau'
    : r.status === 429 ? 'epuisees'
    : r.status === 413 ? 'trop-lourd'
    : r.status === 503 ? 'indisponible'
    : 'refus'
  return { ok: false, erreur, message: messageDe(r), quota }
}

// ── « Lire une capture » du ticket d'ordre (1.8.14) ─────────────────────────

/** ok : `lecture` ; sinon `erreur` et le message du journal. `quota` dans les deux cas quand il est rendu. */
export type ResultatLectureOrdre = {
  ok: boolean
  lecture?: LectureOrdre
  quota: Quota | null
  erreur?: 'non-connecte' | 'epuisees' | 'trop-lourd' | 'indisponible' | 'refus' | 'reseau'
  message?: string | null
}

/**
 * Une capture du panneau d'ordre (ou de l'outil Position de TradingView) lue
 * par le journal : `POST /api/carnet/lire-ordre` { image: data URL }. Même
 * moteur et même compteur que les documents de Pilotage (une lecture du
 * palier) ; 429 quand le quota est épuisé, 413 quand la capture est trop
 * lourde. Rien n'est écrit : la carte se remplit, le membre enregistre.
 */
export async function lireOrdre(image: string): Promise<ResultatLectureOrdre> {
  const r = await appeler('POST', '/api/carnet/lire-ordre', { image })
  if (!r || r.status === 401) return { ok: false, erreur: 'non-connecte', message: null, quota: null }
  const quota = normaliseQuota(r.data.quota)
  if (r.status >= 200 && r.status < 300) return { ok: true, lecture: normaliseLectureOrdre(r.data.lecture), quota }
  const erreur = r.status === 0 ? 'reseau'
    : r.status === 429 ? 'epuisees'
    : r.status === 413 ? 'trop-lourd'
    : r.status === 503 || r.status === 404 ? 'indisponible'
    : 'refus'
  return { ok: false, erreur, message: messageDe(r), quota }
}

export type DemandeImport = {
  /** Les trades lus (avec leur `source`), ou l'export tel quel quand la lecture n'a pas eu lieu. */
  trades?: TradeNormalise[]
  source?: string
  csv?: string
  fichier: string
  compteId: string
  /** Nom IANA : les heures « telles qu'affichées » du fichier sont lues dans ce fuseau. */
  fuseau: string
}

export type { LigneApercu }

export type ApercuImport = { lus: number; nouveaux: number; dejaConnus: number; erreurs: string[]; colonnesADire: boolean; lignes: LigneApercu[] }

export type ResultatImport<T> = { ok: boolean; valeur?: T; erreur?: 'non-connecte' | 'refus' | 'reseau'; message?: string | null }

const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function lireApercu(data: Record<string, unknown>): ApercuImport {
  return {
    lus: nombre(data.lus),
    nouveaux: nombre(data.nouveaux),
    dejaConnus: nombre(data.dejaConnus),
    erreurs: Array.isArray(data.erreurs) ? data.erreurs.filter((e): e is string => typeof e === 'string') : [],
    // Un CSV inconnu : le journal rend ses en-têtes et attend qu'on lui dise les colonnes (écran de Pilotage).
    colonnesADire: Array.isArray(data.entetes) && nombre(data.lus) === 0,
    lignes: lireLignesApercu(data.apercu),
  }
}

/** `liees` : les positions que le journal a rattachées tout seul à un trade du Carnet (même instrument, même moment). */
async function importer(demande: DemandeImport, confirmer: boolean): Promise<ResultatImport<ApercuImport & { importes: number; liees: number }>> {
  const r = await appeler('POST', '/api/pilotage/trades/import', confirmer ? { ...demande, confirmer: true } : demande)
  if (!r || r.status === 401) return { ok: false, erreur: 'non-connecte', message: null }
  if (r.status === 0) return { ok: false, erreur: 'reseau', message: null }
  if (r.status < 200 || r.status >= 300) return { ok: false, erreur: 'refus', message: messageDe(r) }
  return { ok: true, valeur: { ...lireApercu(r.data), importes: nombre(r.data.importes), liees: nombre(r.data.liees) } }
}

/**
 * Des trades viennent d'être rangés (1.10.0) : les notes ouvertes relisent
 * leurs liens avec Pilotage (le journal a pu en poser tout seul). Un
 * événement de la page, au geste : ni relecture en fond ni délai.
 */
export const EVENEMENT_TRADES_RANGES = 'carnet:trades-ranges'
export const annoncerTradesRanges = () => window.dispatchEvent(new Event(EVENEMENT_TRADES_RANGES))

/** L'aperçu : rien n'est écrit (nouveaux, déjà connus). */
export const apercuImport = (demande: DemandeImport) => importer(demande, false)
/** La confirmation : les nouvelles exécutions entrent, regroupées en positions. */
export const confirmerImport = (demande: DemandeImport) => importer(demande, true)

export const fuseauDuNavigateur = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  } catch {
    return 'Europe/Paris'
  }
}

// ── Les comptes de Pilotage lus par le content script ───────────────────────

// La même clé que CLE_STOCKAGE_COMPTES (pilotage-comptes.ts) : recopiée ici
// parce que le panneau ne doit importer AUCUNE valeur de ce module (voir son
// en-tête : il est fondu dans le content script).
const CLE_COMPTES = 'pilotageComptes'

export type EtatComptesPilotage =
  | { etat: 'chargement' }
  /** Pilotage n'a jamais été ouvert dans ce Chrome (ou la liste est vide). */
  | { etat: 'aucun' }
  /** La liste vient d'un autre compte AOK que celui du Carnet. */
  | { etat: 'autre-compte' }
  | { etat: 'pret'; comptes: CompteConnu[] }

/** L'état de la liste pour le compte AOK connecté au Carnet (`userId`, null si inconnu). */
export function etatComptes(liste: ListeComptesPilotage | null | undefined, userId: string | null): EtatComptesPilotage {
  if (!liste || !Array.isArray(liste.comptes) || !liste.comptes.length) return { etat: 'aucun' }
  if (liste.userId && userId && liste.userId !== userId) return { etat: 'autre-compte' }
  return { etat: 'pret', comptes: liste.comptes }
}

export async function lireListeComptes(): Promise<ListeComptesPilotage | null> {
  try {
    const r = await chrome.storage.local.get(CLE_COMPTES)
    return (r?.[CLE_COMPTES] as ListeComptesPilotage | undefined) ?? null
  } catch {
    return null
  }
}

/** Rappelé à chaque nouvelle lecture du content script (Pilotage ouvert dans un autre onglet). */
export function ecouterListeComptes(rappel: (liste: ListeComptesPilotage | null) => void): () => void {
  const ecoute = (changes: Record<string, chrome.storage.StorageChange>, zone: string) => {
    if (zone === 'local' && CLE_COMPTES in changes) rappel((changes[CLE_COMPTES].newValue as ListeComptesPilotage | undefined) ?? null)
  }
  try { chrome.storage.onChanged.addListener(ecoute) } catch { return () => {} }
  return () => { try { chrome.storage.onChanged.removeListener(ecoute) } catch { /* rien */ } }
}

/** L'id du compte AOK connecté au Carnet, ou null. */
export async function userIdCarnet(): Promise<string | null> {
  try {
    return (await getSession())?.user?.id ?? null
  } catch {
    return null
  }
}

export const ADRESSE_PILOTAGE = 'https://pilotage.aoknowledge.com'

/**
 * Relecture des comptes au moment du geste (1.8.13, règle de Brice du 05/11 :
 * à l'action, jamais à la minuterie) : chaque onglet Pilotage ouvert relit
 * son localStorage tout de suite et range la liste ; `ecouterListeComptes` la
 * reçoit. Sans onglet Pilotage, ou sans réponse, la dernière liste rangée
 * reste celle de la boîte. Rend la liste d'un onglet qui a répondu, ou null.
 */
export async function demanderRelectureComptesPilotage(): Promise<ListeComptesPilotage | null> {
  let onglets: chrome.tabs.Tab[] = []
  try {
    onglets = await chrome.tabs.query({ url: `${ADRESSE_PILOTAGE}/*` })
  } catch {
    return null
  }
  const reponses = await Promise.all(onglets
    .filter(o => typeof o.id === 'number')
    .map(o => messageAOnglet<{ liste: ListeComptesPilotage | null }>(o.id!, { type: 'RELIRE_COMPTES_PILOTAGE' }, 1500)))
  return reponses.find(r => r?.liste)?.liste ?? null
}

/** Ouvre une page de Pilotage dans un nouvel onglet (le panneau reste là). */
export function ouvrirPilotage(chemin = '/comptes'): void {
  const url = chemin.startsWith('http') ? chemin : `${ADRESSE_PILOTAGE}${chemin}`
  try {
    chrome.tabs.create({ url })
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/** L'écran Compte du Carnet (connexion), demandé depuis une boîte ou un panneau. */
export const EVENEMENT_OUVRIR_COMPTE = 'carnet:ouvrir-compte'
export const demanderConnexion = () => window.dispatchEvent(new Event(EVENEMENT_OUVRIR_COMPTE))
