// Les traces gardées pour « Envoyer un diagnostic » (1.8.14), dans
// chrome.storage.local, sur l'appareil seulement :
// - l'anneau des 30 dernières erreurs (`error` et `unhandledrejection` du
//   panneau, du plein écran, du Guide et du service worker, erreurs de rendu
//   React, toasts d'erreur affichés) : message nettoyé, fichier, ligne, jamais
//   de données ; pour un toast, la clé du message, pas son texte ;
// - le déroulé du dernier envoi vers une IA (provider-injector.ts).
// Rien ne part d'ici : le diagnostic les lit au geste du membre (diagnostic.ts).
// Le service worker importe ce module : rien d'autre que diagnostic-pur.
import {
  ajouterErreur, codeToast, erreursSures, MAX_ERREURS, nettoyerMessage, normaliserTrace, premiereFrame, sourceSure,
  type ErreurNotee, type GenreErreur, type LieuErreur, type TraceEnvoi,
} from './diagnostic-pur'

export const CLE_ERREURS = 'carnetDiagnosticErreurs'
export const CLE_DERNIER_ENVOI = 'carnetDiagnosticEnvoiIA'

/** Le lieu de la page qui tourne : panneau, plein écran, Guide ou service worker. */
export function lieuDeLaPage(): LieuErreur {
  try {
    if (typeof document === 'undefined') return 'serviceWorker'
    const chemin = location.pathname
    if (chemin.includes('/fullscreen/')) return 'pleinEcran'
    if (chemin.includes('/guide/')) return 'guide'
  } catch { /* lieu par défaut */ }
  return 'panneau'
}

// Une écriture à la fois dans ce document : deux erreurs simultanées ne
// s'écrasent pas l'une l'autre (lire, ajouter, écrire).
let file: Promise<void> = Promise.resolve()
// La même erreur qui tourne en boucle : une écriture par seconde au plus.
const dernieresEcritures = new Map<string, number>()

export interface ErreurBrute {
  message?: unknown
  /** Pour un toast : la clé du message dans le dictionnaire. */
  code?: string | null
  source?: unknown
  ligne?: unknown
  colonne?: unknown
}

/** Garde une erreur dans l'anneau. Ne jette jamais, n'attend rien. */
export function noterErreur(ou: LieuErreur, genre: GenreErreur, brut: ErreurBrute): void {
  try {
    const e: ErreurNotee = {
      le: Date.now(),
      ou,
      genre,
      message: genre === 'toast' ? codeToast(brut.code) : nettoyerMessage(brut.message),
      ...(brut.source !== undefined ? { source: sourceSure(brut.source) } : {}),
      ...(typeof brut.ligne === 'number' && Number.isInteger(brut.ligne) && brut.ligne >= 0 ? { ligne: brut.ligne } : {}),
      ...(typeof brut.colonne === 'number' && Number.isInteger(brut.colonne) && brut.colonne >= 0 ? { colonne: brut.colonne } : {}),
      fois: 1,
    }
    if (!e.message) return
    const signature = `${e.ou}|${e.genre}|${e.message}|${e.source ?? ''}|${e.ligne ?? ''}`
    const maintenant = Date.now()
    if (maintenant - (dernieresEcritures.get(signature) ?? 0) < 1000) return
    if (dernieresEcritures.size > 100) dernieresEcritures.clear()
    dernieresEcritures.set(signature, maintenant)
    file = file.then(async () => {
      const r = await chrome.storage.local.get(CLE_ERREURS)
      await chrome.storage.local.set({ [CLE_ERREURS]: ajouterErreur(r[CLE_ERREURS], e, MAX_ERREURS) })
    }).catch(() => { /* une trace de diagnostic ne gêne jamais le carnet */ })
  } catch { /* idem */ }
}

/**
 * Écoute `error` et `unhandledrejection` de la page (ou du service worker).
 * À appeler une fois, au démarrage de chaque point d'entrée.
 */
export function installerCaptureErreurs(ou: LieuErreur = lieuDeLaPage()): void {
  const cible = globalThis as unknown as EventTarget
  cible.addEventListener('error', (ev: Event) => {
    const e = ev as ErrorEvent
    noterErreur(ou, 'erreur', { message: e.message || e.error, source: e.filename, ligne: e.lineno, colonne: e.colno })
  })
  cible.addEventListener('unhandledrejection', (ev: Event) => {
    const raison = (ev as PromiseRejectionEvent).reason
    noterErreur(ou, 'rejet', { message: raison, ...premiereFrame((raison as { stack?: unknown } | null)?.stack) })
  })
}

export async function lireErreurs(): Promise<ErreurNotee[]> {
  try {
    const r = await chrome.storage.local.get(CLE_ERREURS)
    return erreursSures(r[CLE_ERREURS])
  } catch {
    return []
  }
}

/**
 * Le déroulé du dernier envoi vers une IA. Un envoi qui repart sur une
 * nouvelle conversation juste après l'échec du fil choisi (AnalyzeNoteDialog)
 * le garde : `repli`.
 */
export async function noterEnvoiIA(trace: TraceEnvoi): Promise<void> {
  try {
    const r = await chrome.storage.local.get(CLE_DERNIER_ENVOI)
    const avant = normaliserTrace(r[CLE_DERNIER_ENVOI])
    const repli = !!avant && avant.mode === 'fil' && avant.erreur === 'fil' && trace.mode !== 'fil' && trace.le - avant.le < 120_000
    const sure = normaliserTrace({ ...trace, repli: trace.repli || repli })
    if (sure) await chrome.storage.local.set({ [CLE_DERNIER_ENVOI]: sure })
  } catch { /* une trace de diagnostic ne gêne jamais l'envoi */ }
}

export async function lireDernierEnvoi(): Promise<TraceEnvoi | null> {
  try {
    const r = await chrome.storage.local.get(CLE_DERNIER_ENVOI)
    return normaliserTrace(r[CLE_DERNIER_ENVOI])
  } catch {
    return null
  }
}
