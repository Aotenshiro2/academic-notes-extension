// Besoins des membres, lot 2 (06/11/2026) : les règles pures du bouton « Il me
// manque quelque chose » (sans chrome.*, sans DOM, testées dans
// tests/besoins.test.ts). Les appels et la compression vivent dans besoins.ts.
//
// Contrat d'API commun à tous les outils AOK (routes du journal) :
//   POST /api/besoins/signaler  { app: 'extension', texte, page?, capture? } -> { ok, phrase }
//   GET  /api/besoins/prevus?app=extension                                   -> { besoins: [...] }
//   POST /api/besoins/voter     { besoinId }                                 -> { ok, votes }
import type { CleI18n } from './i18n'

export const APP_BESOIN = 'extension'

export interface BesoinPrevu {
  id: string
  titre: string
  statut: 'planifie' | 'en_cours'
  votes: number
  aVote: boolean
}

export const TEXTE_MIN = 5
export const TEXTE_MAX = 4000
export const PREVUS_MAX = 8
/** Plus grand côté de la capture après compression, en pixels. */
export const CAPTURE_COTE_MAX = 1600
/** 1,5 Mo, compté sur la data URL entière : plus strict que le poids de l'image seule. */
export const CAPTURE_TAILLE_MAX = 1_500_000

/** Le serveur refuse un texte vide ou trop long ; on n'envoie pas ce qu'il refuserait. Le texte part tel quel. */
export function texteEnvoyable(texte: string): boolean {
  return texte.trim().length >= TEXTE_MIN && texte.length <= TEXTE_MAX
}

/** Les cartes telles que le journal les décrit ; ce qui ne se lit pas est écarté. */
export function lireBesoins(brut: unknown): BesoinPrevu[] {
  const liste = brut && typeof brut === 'object' ? (brut as { besoins?: unknown }).besoins : null
  if (!Array.isArray(liste)) return []
  return liste
    .flatMap((b): BesoinPrevu[] => {
      if (!b || typeof b !== 'object') return []
      const x = b as Record<string, unknown>
      if (typeof x.id !== 'string' || typeof x.titre !== 'string') return []
      return [{
        id: x.id,
        titre: x.titre,
        statut: x.statut === 'en_cours' ? 'en_cours' : 'planifie',
        votes: typeof x.votes === 'number' && Number.isFinite(x.votes) ? x.votes : 0,
        aVote: x.aVote === true,
      }]
    })
    .slice(0, PREVUS_MAX)
}

/** Le message court à montrer pour une réponse du serveur (null = réseau coupé). */
export function cleMessageSignalement(code: number | null): CleI18n {
  switch (code) {
    case null: return 'besoin.erreurReseau'
    case 400: return 'besoin.erreur400'
    case 401: return 'besoin.erreur401'
    case 404: return 'besoin.erreur404'
    case 413: return 'besoin.erreur413'
    case 429: return 'besoin.erreur429'
    case 503: return 'besoin.erreur503'
    default: return 'besoin.erreurAutre'
  }
}

/** 200 sans phrase : c'est enregistré, on ne fait pas renvoyer (doublon). */
export function phraseDuServeur(donnees: unknown): string | null {
  const phrase = donnees && typeof donnees === 'object' ? (donnees as { phrase?: unknown }).phrase : undefined
  return typeof phrase === 'string' && phrase.trim() ? phrase : null
}

/** Dimensions cibles d'une capture : 1600 px au plus grand côté, jamais agrandie. */
export function dimensionsCible(largeur: number, hauteur: number, echelle = 1): { largeur: number; hauteur: number } {
  const base = Math.min(1, CAPTURE_COTE_MAX / Math.max(largeur, hauteur)) * echelle
  return { largeur: Math.max(1, Math.round(largeur * base)), hauteur: Math.max(1, Math.round(hauteur * base)) }
}
