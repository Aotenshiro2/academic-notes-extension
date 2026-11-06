// Les écrans du Carnet (Compte, Paramètres, Mentorat, Support, Mon forfait...)
// et ce que montre le pied, partagés par le panneau latéral et le plein écran
// (1.8.15). Règles pures, sans React ni chrome.* : testées dans
// tests/ecrans-carnet.test.ts. L'état vit dans lib/use-ecrans-carnet.ts, le
// rendu dans components/EcransCarnet.tsx et components/PiedCarnet.tsx.
//
// Avant la 1.8.15, le panneau tenait un booléen par écran (showSettings,
// showAccount...) et le plein écran n'avait aucun de ces écrans. Une seule vue
// à la fois : c'était déjà la règle du panneau (closeAllViews), elle devient la
// forme même de l'état.
import type { CleI18n } from './i18n'
import type { CleSignal } from './besoins-decouverte'
import type { NoteSummary } from '../types/academic'

export type EcranCarnet =
  | 'compte'
  | 'reglages'
  | 'configIA'
  | 'mentorat'
  | 'support'
  | 'forfait'
  | 'outils'
  | 'diagnostic'

/** Le seul réglage vers lequel un écran sait pointer (le diagnostic vers l'affichage de secours). */
export type FocusReglage = 'affichageSecours'

export interface EtatEcrans {
  ecran: EcranCarnet | null
  /** Support ouvert directement sur « Il me manque quelque chose » (menu de la roue, ligne d'une friction). */
  supportBesoin: boolean
  /** Paramètres ouverts sur un réglage précis. */
  focusReglage?: FocusReglage
}

export const AUCUN_ECRAN: EtatEcrans = { ecran: null, supportBesoin: false }

/** Ouvre un écran, et lui seul. */
export function ouvrirEcran(
  ecran: EcranCarnet,
  options: { supportBesoin?: boolean; focusReglage?: FocusReglage } = {}
): EtatEcrans {
  return {
    ecran,
    supportBesoin: ecran === 'support' && Boolean(options.supportBesoin),
    ...(ecran === 'reglages' && options.focusReglage ? { focusReglage: options.focusReglage } : {}),
  }
}

/**
 * Les boutons du pied (« Aide et idées », Mentorat) : un clic ouvre l'écran,
 * un second le referme. Le Support ouvert ainsi part sur le chat.
 */
export function basculerEcran(etat: EtatEcrans, ecran: EcranCarnet): EtatEcrans {
  return etat.ecran === ecran ? AUCUN_ECRAN : ouvrirEcran(ecran)
}

/** La ligne et la phrase pré-remplie de chaque friction (piste C du 06/11). Textes : i18n.ts. */
export const LIGNES_FRICTION: Record<CleSignal, { phrase: CleI18n; prerempli: CleI18n }> = {
  'carnet.capture_impossible': { phrase: 'besoin.frictionCapture', prerempli: 'besoin.frictionCapturePrerempli' },
  'carnet.sync_echec': { phrase: 'besoin.frictionSync', prerempli: 'besoin.frictionSyncPrerempli' },
  'carnet.export_echec': { phrase: 'besoin.frictionExport', prerempli: 'besoin.frictionExportPrerempli' },
}

/** Les notes pas encore dans le journal, hors celles exclues volontairement de la synchronisation. */
export function notesEnAttenteDeSync(notes: Pick<NoteSummary, 'lastSyncAt' | 'syncExcluded'>[]): number {
  return notes.filter(n => !n.lastSyncAt && !n.syncExcluded).length
}

/** La pastille de synchronisation du pied. null = session pas encore lue. */
export type EtatPastilleSync = 'horsLigne' | 'aFaire' | 'ok'

export function etatPastilleSync(connecte: boolean | null, enAttente: number): EtatPastilleSync {
  if (connecte === false) return 'horsLigne'
  return enAttente > 0 ? 'aFaire' : 'ok'
}

/** La note la plus récente, pour la carte « dernière note » de l'accueil. */
export function noteLaPlusRecente<T extends Pick<NoteSummary, 'timestamp'>>(notes: T[]): T | undefined {
  return notes.length > 0 ? notes.reduce((recente, n) => (n.timestamp > recente.timestamp ? n : recente)) : undefined
}
