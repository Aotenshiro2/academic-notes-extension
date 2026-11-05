import { familleInstrument } from './instrument.ts'
import type { CompteConnu } from './pilotage-comptes'
import { abregerIdentifiant, libelleCompte } from './documents-attribution.ts'

// « Lier » : les positions importées à proposer pour un trade de la note
// (1.8.13, règle 1 du labo du 03/11). Pur : testé par
// tests/positions-jour.test.ts.
//
// 1. Le JOUR du trade, même pour une vieille note : le jour local de
//    `trade.startedAt`. Une position sans `fuseau` a été gardée « telle
//    qu'affichée » par la plateforme, comme de l'UTC : son jour et son heure
//    se lisent dans les champs UTC. La requête couvre donc le jour local ET le
//    jour « tel qu'affiché ».
// 2. Le même instrument (famille : NQ et MNQ...) ; les autres sont comptés et
//    masqués.
// 3. Les copies (même famille, même sens, entrées à 60 s près, comptes
//    différents) sur une seule ligne : trois comptes copiés ne sont pas des
//    doublons, c'est un seul trade.
// 4. Triées par écart à l'heure du trade.

/** Une position importée, telle que `GET /api/pilotage/trades/positions` la rend. */
export interface PositionImportee {
  positionId: string
  /** Le compte de Pilotage où elle est rangée. */
  compteId?: string | null
  /** Le numéro de compte du broker lu dans le fichier (journal 1.8.13 ; absent avant). */
  compte?: string | null
  symbole: string
  direction: string | null
  devise: string
  entreLe: string
  sortiLe: string | null
  quantite: number
  pnl: number
  prixEntree: number | null
  prixSortie: number | null
  stopPrix?: number | null
  executions?: number
  segmentRef: string | null
  /** null = heure telle qu'affichée par la plateforme (stockée comme de l'UTC). */
  fuseau: string | null
}

type PositionDatee = Pick<PositionImportee, 'entreLe' | 'fuseau'>

const deux = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` du jour local d'un instant. */
export function cleJourLocal(instant: number): string {
  const d = new Date(instant)
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/**
 * L'instant réel d'une position. Avec un fuseau, l'instant écrit ; sans, l'heure
 * affichée par la plateforme, lue comme une heure locale du membre.
 */
export function instantPosition(p: PositionDatee): number {
  const t = Date.parse(p.entreLe)
  if (p.fuseau || !Number.isFinite(t)) return t
  const d = new Date(t)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()).getTime()
}

/** Le jour d'une position, tel que le membre l'a vécu. */
export const jourPosition = (p: PositionDatee) => cleJourLocal(instantPosition(p))

/** Combien de jours autour du jour du trade : 0 (le jour même), 3 de chaque côté, ou tout. */
export type Portee = 0 | 3 | 'tout'

/**
 * Les bornes de la requête (instants) qui couvrent les jours du trade, `ecart`
 * jours de chaque côté, en heure locale ET en heure « telle qu'affichée ».
 */
export function bornesJours(startedAt: number, ecart = 0): { depuis: number; jusqu: number } {
  const d = new Date(startedAt)
  const a = d.getFullYear(), m = d.getMonth(), j = d.getDate()
  return {
    depuis: Math.min(new Date(a, m, j - ecart).getTime(), Date.UTC(a, m, j - ecart)),
    jusqu: Math.max(new Date(a, m, j + ecart + 1).getTime(), Date.UTC(a, m, j + ecart + 1)),
  }
}

/** La position tombe-t-elle dans les jours du trade (`ecart` jours de chaque côté) ? */
export function dansLesJours(p: PositionDatee, startedAt: number, ecart = 0): boolean {
  const d = new Date(startedAt)
  const debut = cleJourLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ecart).getTime())
  const fin = cleJourLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + ecart).getTime())
  const jour = jourPosition(p)
  return jour >= debut && jour <= fin
}

/** Le compte d'une position, pour dire « comptes différents » ; null quand rien ne le dit. */
export const compteDePosition = (p: Pick<PositionImportee, 'compteId' | 'compte'>) => p.compteId || p.compte || null

/**
 * Les copies d'un même trade : même famille, même sens, entrées à `fenetreMs`
 * près, comptes différents. Une position sans compte connu n'est la copie de
 * personne qui en ait un pareil. Chaque groupe est trié par heure d'entrée.
 */
export function regrouperCopies<P extends PositionImportee>(positions: P[], fenetreMs = 60e3): P[][] {
  const groupes: P[][] = []
  const cle = (p: P) => compteDePosition(p) ?? `?${p.positionId}`
  for (const p of [...positions].sort((a, b) => instantPosition(a) - instantPosition(b))) {
    const famille = familleInstrument(p.symbole)
    const t = instantPosition(p)
    const groupe = groupes.find(g => familleInstrument(g[0].symbole) === famille
      && (g[0].direction ?? '') === (p.direction ?? '')
      && Math.abs(instantPosition(g[0]) - t) <= fenetreMs
      && !g.some(q => cle(q) === cle(p)))
    if (groupe) groupe.push(p)
    else groupes.push([p])
  }
  return groupes
}

export type Masques = Array<{ famille: string; n: number }>

/**
 * Les positions du même instrument que le trade, et les autres comptées
 * (un groupe de copies compte pour un trade). Sans instrument : tout passe.
 */
export function filtrerParInstrument<P extends PositionImportee>(positions: P[], instrument: string | null | undefined): { gardees: P[]; masques: Masques } {
  const famille = familleInstrument(instrument)
  if (!famille) return { gardees: positions, masques: [] }
  const gardees = positions.filter(p => familleInstrument(p.symbole) === famille)
  const autres = positions.filter(p => familleInstrument(p.symbole) !== famille)
  const parFamille = new Map<string, number>()
  for (const groupe of regrouperCopies(autres)) {
    const f = familleInstrument(groupe[0].symbole) ?? groupe[0].symbole
    parFamille.set(f, (parFamille.get(f) ?? 0) + 1)
  }
  const masques = [...parFamille.entries()].map(([f, n]) => ({ famille: f, n })).sort((a, b) => b.n - a.n || a.famille.localeCompare(b.famille))
  return { gardees, masques }
}

/** Les groupes, du plus proche au plus lointain de l'heure du trade. */
export function trierParEcart<P extends PositionImportee>(groupes: P[][], startedAt: number): P[][] {
  return [...groupes].sort((a, b) => Math.abs(instantPosition(a[0]) - startedAt) - Math.abs(instantPosition(b[0]) - startedAt))
}

/** Le sens d'une position du broker, dans les mots de la carte de prix ; null quand le fichier ne le dit pas. */
export const sensDePosition = (p: Pick<PositionImportee, 'direction'>): 'achat' | 'vente' | null =>
  p.direction === 'long' ? 'achat' : p.direction === 'short' ? 'vente' : null

/**
 * 1.8.14 : quand le trade a un sens (CHOISI dans la carte, sinon déduit du
 * stop), les groupes de ce sens passent devant, puis ceux dont le sens n'est
 * pas dit, puis l'autre sens. L'ordre d'écart est gardé dans chaque part ;
 * rien n'est masqué (un sens mal choisi ne cache pas le bon trade).
 */
export function trierParSens<P extends PositionImportee>(groupes: P[][], sens: 'achat' | 'vente' | null | undefined): P[][] {
  if (!sens) return groupes
  const rang = (g: P[]) => { const s = sensDePosition(g[0]); return s === sens ? 0 : s === null ? 1 : 2 }
  return groupes.map((g, i) => ({ g, i, r: rang(g) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.g)
}

/** Écart en minutes entre l'entrée de la position et le début du trade (signé). */
export const ecartMinutes = (p: PositionDatee, startedAt: number) => Math.round((instantPosition(p) - startedAt) / 60e3)

/**
 * Le nom d'un compte de position : le nom Pilotage (par `compteId`), sinon le
 * numéro du fichier abrégé (« ...0002 »), sinon null.
 */
export function nomCompteDePosition(p: Pick<PositionImportee, 'compteId' | 'compte'>, comptes: CompteConnu[]): string | null {
  const compte = p.compteId ? comptes.find(c => c.id === p.compteId) : undefined
  if (compte) return libelleCompte(compte)
  return p.compte ? abregerIdentifiant(p.compte) : null
}

/**
 * Ce que dit le broker d'un trade lié à plusieurs comptes copiés : les prix de
 * la PREMIÈRE position (la somme des tailles de comptes différents n'a pas de
 * sens), la taille d'un compte et le nombre de comptes. Le TP ne s'exporte pas.
 */
export function resumeBroker<P extends PositionImportee>(lies: P[]): {
  entree: number | null
  sortie: number | null
  stop: number | null
  taille: number
  comptes: number
  executions: number | null
} | null {
  if (!lies.length) return null
  const premiere = [...lies].sort((a, b) => instantPosition(a) - instantPosition(b))[0]
  return {
    entree: premiere.prixEntree,
    sortie: premiere.prixSortie,
    stop: typeof premiere.stopPrix === 'number' ? premiere.stopPrix : null,
    taille: premiere.quantite,
    comptes: new Set(lies.map(p => compteDePosition(p) ?? p.positionId)).size,
    executions: typeof premiere.executions === 'number' ? premiere.executions : null,
  }
}
