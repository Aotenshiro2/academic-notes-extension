import {
  bornesJours, dansLesJours, filtrerParInstrument, instantPosition, regrouperCopies, resumeBroker, sensDePosition,
  trierParEcart, trierParSens, type Masques, type Portee, type PositionImportee,
} from './positions-jour.ts'
import { rDuPrix } from './prix-trade.ts'

/**
 * Ce que la pastille « Prix » d'un trade dit après le mot (1.8.17, retour de
 * Cédric du 10/11 : sur un trade importé, « il y a pas le prix d'entrée »).
 * Le R quand il est connu (« Prix · +2 R », comme en 1.8.16) ; sinon le prix
 * d'entrée, tapé dans « Prix » ou, à défaut, celui du trade du broker lié ;
 * sinon rien (« Prix » seul).
 */
export function complementPastillePrix(
  r: number | undefined,
  entreeTapee: number | undefined,
  lies: PositionImportee[]
): { r: number } | { entree: number } | null {
  if (r !== undefined) return { r }
  if (entreeTapee !== undefined && Number.isFinite(entreeTapee)) return { entree: entreeTapee }
  const broker = lies.find(p => p.prixEntree !== null && Number.isFinite(p.prixEntree))?.prixEntree
  return broker != null ? { entree: broker } : null
}

// Relier un trade de la note à un trade importé de Pilotage (1.8.16, demande
// de Brice du 10/11/2026, en séance avec Cédric). Pur : testé par
// tests/lien-trade.test.ts.
//
// Le mécanisme ne change pas (1.8.12, élargi en 1.8.13) : les positions
// importées vivent sur le compte AOK (table TradeImport du journal), le lien
// est leur `segmentRef` = l'id du trade de la note, posé et retiré par
// `PATCH /api/pilotage/trades/positions`. Rien n'est gardé dans la note : le
// Carnet relit les liens au geste (ouvrir la note, lier, délier).
//
// 1. L'état de l'icône lien de la rangée : UNE requête par note ouverte, qui
//    couvre les jours de ses trades clos, 3 jours de chaque côté (la portée
//    de « Voir les autres jours »).
// 2. Les candidats : libres, du jour du trade (ou des jours autour), même
//    instrument, copies groupées ; le sens choisi devant, puis l'heure la
//    plus proche.

/** Combien de jours de chaque côté des trades de la note pour lire leurs liens. */
export const ECART_LIENS = 3

/** Combien de trades du broker la liste courte montre au jour du trade, avant « Voir les autres ». */
export const LISTE_COURTE = 5

/**
 * Les bornes de la requête qui lit les liens des trades CLOS d'une note :
 * du jour du premier au jour du dernier, `ecart` jours de chaque côté. null :
 * aucun trade clos, rien à lire.
 */
export function bornesDesTrades(trades: Array<{ startedAt: number; closedAt?: number }> | null | undefined, ecart = ECART_LIENS): { depuis: number; jusqu: number } | null {
  const clos = (trades ?? []).filter(t => t.closedAt && Number.isFinite(t.startedAt))
  if (!clos.length) return null
  const premier = Math.min(...clos.map(t => t.startedAt))
  const dernier = Math.max(...clos.map(t => t.startedAt))
  return { depuis: bornesJours(premier, ecart).depuis, jusqu: bornesJours(dernier, ecart).jusqu }
}

/** Les positions liées à un trade de la note (ses copies comprises), de la plus ancienne à la plus récente. */
export function liesAuTrade<P extends Pick<PositionImportee, 'segmentRef' | 'entreLe' | 'fuseau'>>(positions: P[] | null | undefined, tradeId: string): P[] {
  return (positions ?? []).filter(p => p.segmentRef === tradeId).sort((a, b) => instantPosition(a) - instantPosition(b))
}

/**
 * Les trades du broker à proposer pour un trade de la note : libres, dans les
 * jours de la portée, du même instrument (les autres sont comptés dans
 * `masques`), copies sur une seule ligne, le sens du trade devant puis du
 * plus proche au plus lointain de son heure.
 */
export function candidatsALier<P extends PositionImportee>(
  positions: P[],
  o: { startedAt: number; instrument: string | null | undefined; sens: 'achat' | 'vente' | null | undefined; portee: Portee },
): { groupes: P[][]; masques: Masques } {
  const libres = positions.filter(p => !p.segmentRef && (o.portee === 'tout' || dansLesJours(p, o.startedAt, o.portee)))
  const { gardees, masques } = filtrerParInstrument(libres, o.instrument)
  return { groupes: trierParSens(trierParEcart(regrouperCopies(gardees), o.startedAt), o.sens), masques }
}

/**
 * Le R que dit le broker : sa première position (entrée, sortie, stop exporté)
 * et son sens. null quand l'export ne donne pas le stop (le cas courant) ou
 * le sens.
 */
export function rDuBroker(lies: PositionImportee[]): number | null {
  const b = resumeBroker(lies)
  if (!b) return null
  const premiere = [...lies].sort((x, y) => instantPosition(x) - instantPosition(y))[0]
  const sens = sensDePosition(premiere)
  if (!sens || b.entree === null || b.sortie === null || b.stop === null) return null
  return rDuPrix({ sens, entree: b.entree, sortie: b.sortie, stop: b.stop })
}
