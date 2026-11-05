// La carte de prix d'un trade (1.8.14, brief C5 du 05/11/2026) : le sens
// choisi, le type d'ordre, le risque, le stop et le TP tapés en ticks ou en
// prix, et la lecture d'une capture du ticket d'ordre fusionnée dans la
// carte. Pur, sans autre import que instrument.ts : testé par
// tests/prix-trade.test.ts (node --test).
//
// 1. Le PRIX est ce qu'on garde. Les ticks ne sont qu'une façon de le taper,
//    convertie avec le pas de cotation du contrat (NQ, MNQ, ES, MES 0,25 ;
//    YM 1 ; RTY, M2K 0,10 ; GC 0,10 ; CL 0,01...). Instrument inconnu : pas
//    de mode ticks.
// 2. Valeur du tick, marge et valeur du trade ne se tapent pas : la valeur du
//    tick vient du contrat, et le risque en USD s'en déduit (proposé en
//    indice, jamais écrit à la place du membre).
// 3. Le sens CHOISI prime sur le sens déduit (stop face à l'entrée, sinon
//    TP face à l'entrée), partout où le Carnet s'en sert : « Lier » et le R.
// 4. Une lecture ne remplit que les champs vides ; ce que le membre a déjà
//    tapé n'est remplacé que s'il l'accepte. Rien n'est enregistré sans son
//    geste (« Enregistrer »).

import { normaliserInstrument } from './instrument.ts'
import { REDUCTION_CAPTURE } from './capture-graphique.ts'
import type { RisqueTrade, SensTrade, TradePrix, TypeOrdre } from '../types/academic'

// ── Les contrats connus ─────────────────────────────────────────────────────

/** Un contrat à terme : son pas de cotation et la valeur d'un tick pour UN contrat, en USD. */
export interface Contrat { racine: string; pas: number; valeurTick: number }

/**
 * Pas de cotation et valeur du tick (USD par contrat), spécifications du CME.
 * Les obligations (ZN, ZB) se cotent en 32es sur TradingView : laissées de
 * côté, comme les CFD et le forex (le pas dépend du broker).
 */
const CONTRATS: Record<string, [pas: number, valeurTick: number]> = {
  ES: [0.25, 12.5], MES: [0.25, 1.25],
  NQ: [0.25, 5], MNQ: [0.25, 0.5],
  YM: [1, 5], MYM: [1, 0.5],
  RTY: [0.1, 5], M2K: [0.1, 0.5],
  GC: [0.1, 10], MGC: [0.1, 1],
  SI: [0.005, 25], SIL: [0.005, 5],
  HG: [0.0005, 12.5],
  CL: [0.01, 10], MCL: [0.01, 1],
  NG: [0.001, 10],
  '6E': [0.00005, 6.25], M6E: [0.0001, 1.25],
  '6B': [0.0001, 6.25],
}

/** Le contrat d'un instrument (« NQ1! », « MNQZ2026 », « CME_MINI:ES1! ») ; null s'il n'est pas connu. */
export function contratDe(instrument: string | null | undefined): Contrat | null {
  const racine = normaliserInstrument(instrument)
  const c = racine ? CONTRATS[racine] : undefined
  return c ? { racine, pas: c[0], valeurTick: c[1] } : null
}

/** Le nombre de décimales d'un nombre tapé ou d'un pas (0,25 -> 2 ; 1 -> 0 ; 0,00005 -> 5). */
export function decimales(n: number): number {
  for (let d = 0; d <= 8; d++) {
    const x = n * 10 ** d
    if (Math.abs(Math.round(x) - x) < 1e-7) return d
  }
  return 8
}

// ── Nombres tapés ───────────────────────────────────────────────────────────

/** Virgule ou point, espaces ignorés ; vide = absent (undefined) ; null = illisible ou négatif. */
export function lireNombre(brut: string): number | undefined | null {
  const s = brut.trim().replace(/\s/g, '').replace(',', '.')
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ── Ticks et prix ───────────────────────────────────────────────────────────

export type ModeSaisie = 'prix' | 'ticks'

export const signeDuSens = (s: SensTrade) => (s === 'achat' ? 1 : -1)

/**
 * Le prix d'un stop ou d'un TP tapé en ticks : à `ticks` pas de l'entrée, sous
 * l'entrée pour le stop d'un achat, au-dessus pour son TP (l'inverse en vente).
 * null quand il manque l'entrée, le sens ou un nombre de ticks valable.
 */
export function prixDepuisTicks(o: {
  entree: number | null | undefined; ticks: number | null | undefined; pas: number; cote: 'stop' | 'tp'; sens: SensTrade | null | undefined
}): number | null {
  const { entree, ticks, pas, cote, sens } = o
  if (typeof entree !== 'number' || typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks < 0) return null
  if (!sens || !(pas > 0)) return null
  const vers = (cote === 'tp' ? 1 : -1) * signeDuSens(sens)
  const prix = Number((entree + vers * ticks * pas).toFixed(Math.max(decimales(pas), decimales(entree))))
  return prix > 0 ? prix : null
}

/** Le nombre de ticks entre l'entrée et un prix (toujours positif) ; null s'il manque l'un des deux. */
export function ticksDepuisPrix(entree: number | null | undefined, prix: number | null | undefined, pas: number): number | null {
  if (typeof entree !== 'number' || typeof prix !== 'number' || !(pas > 0)) return null
  const ticks = Math.abs(prix - entree) / pas
  return Math.abs(ticks - Math.round(ticks)) < 1e-6 ? Math.round(ticks) : Math.round(ticks * 1000) / 1000
}

// ── Le sens ─────────────────────────────────────────────────────────────────

export type OrigineSens = 'choisi' | 'deduit'

/**
 * Le sens du trade : celui que le membre a CHOISI, sinon déduit du stop
 * (sous l'entrée = achat), sinon du TP (au-dessus = achat), sinon null.
 */
export function sensDuPrix(prix: Pick<TradePrix, 'sens' | 'entree' | 'stop' | 'tp'> | null | undefined): { sens: SensTrade; origine: OrigineSens } | null {
  if (!prix) return null
  if (prix.sens === 'achat' || prix.sens === 'vente') return { sens: prix.sens, origine: 'choisi' }
  const { entree, stop, tp } = prix
  if (typeof entree !== 'number') return null
  if (typeof stop === 'number' && stop !== entree) return { sens: stop < entree ? 'achat' : 'vente', origine: 'deduit' }
  if (typeof tp === 'number' && tp !== entree) return { sens: tp > entree ? 'achat' : 'vente', origine: 'deduit' }
  return null
}

/**
 * Le prix moyen de sortie : les partiels (prix et taille) puis la sortie pour
 * le reste de la taille. Sans partiel, la sortie. null quand les tailles ne
 * permettent pas de pondérer.
 */
function sortieMoyenne(prix: TradePrix): number | null {
  const partiels = prix.partiels ?? []
  if (partiels.length === 0) return typeof prix.sortie === 'number' ? prix.sortie : null
  if (typeof prix.taille !== 'number' || !(prix.taille > 0) || partiels.some(p => typeof p.taille !== 'number')) return null
  const pris = partiels.reduce((s, p) => s + (p.taille as number), 0)
  const reste = prix.taille - pris
  if (reste < -1e-9) return null
  if (reste > 1e-9 && typeof prix.sortie !== 'number') return null
  const somme = partiels.reduce((s, p) => s + p.prix * (p.taille as number), 0) + (reste > 1e-9 ? (prix.sortie as number) * reste : 0)
  return somme / prix.taille
}

/**
 * Le R du trade d'après la carte : (sortie - entrée) x sens / |entrée - stop|,
 * deux décimales, avec le sens CHOISI s'il y en a un. null s'il manque un prix
 * ou si le risque est nul.
 */
export function rDuPrix(prix: TradePrix | null | undefined): number | null {
  if (!prix) return null
  const s = sensDuPrix(prix)
  const { entree, stop } = prix
  const sortie = sortieMoyenne(prix)
  if (!s || typeof entree !== 'number' || typeof stop !== 'number' || sortie === null) return null
  const risque = Math.abs(entree - stop)
  if (!(risque > 0)) return null
  const r = Math.round((((sortie - entree) * signeDuSens(s.sens)) / risque) * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

/**
 * Le risque en USD que la carte permet de déduire : |entrée - stop| / pas x
 * valeur du tick x taille, deux décimales. null quand il manque un morceau ou
 * que le contrat est inconnu. Un indice : le membre tape le sien s'il veut.
 */
export function risqueDeduitUSD(prix: Pick<TradePrix, 'entree' | 'stop' | 'taille'>, contrat: Contrat | null): number | null {
  const { entree, stop, taille } = prix
  if (!contrat || typeof entree !== 'number' || typeof stop !== 'number' || typeof taille !== 'number' || !(taille > 0)) return null
  const ticks = Math.abs(entree - stop) / contrat.pas
  if (!(ticks > 0)) return null
  return Math.round(ticks * contrat.valeurTick * taille * 100) / 100
}

// ── La lecture d'une capture ────────────────────────────────────────────────

/** Ce que rend `POST /api/carnet/lire-ordre` du journal, nettoyé : null = pas lisible. */
export interface LectureOrdre {
  sens: SensTrade | null
  typeOrdre: TypeOrdre | null
  entree: number | null
  stop: number | null
  tp: number | null
  taille: number | null
  risque: RisqueTrade | null
  partiels: { prix: number; taille?: number }[]
  instrument: string | null
  /** De 0 à 1. */
  confiance: number
  remarque: string | null
}

const objet = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const positif = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e9 ? v : null)

export const PARTIELS_LUS_MAX = 10

/** La forme que la carte attend, quoi que le journal ait rendu : une valeur douteuse devient null, jamais devinée. */
export function normaliseLectureOrdre(valeur: unknown): LectureOrdre {
  const b = objet(valeur) ?? {}
  const r = objet(b.risque)
  const montant = r ? positif(r.montant) : null
  const unite = r?.unite === 'USD' || r?.unite === '%' ? r.unite : null
  const partiels = Array.isArray(b.partiels)
    ? b.partiels.flatMap(p => {
      const q = objet(p)
      const prix = q ? positif(q.prix) : null
      if (prix === null) return []
      const taille = positif(q.taille)
      return [taille === null ? { prix } : { prix, taille }]
    }).slice(0, PARTIELS_LUS_MAX)
    : []
  const confiance = typeof b.confiance === 'number' && Number.isFinite(b.confiance) ? Math.min(1, Math.max(0, b.confiance)) : 0
  const texte = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return {
    sens: b.sens === 'achat' || b.sens === 'vente' ? b.sens : null,
    typeOrdre: b.typeOrdre === 'marche' || b.typeOrdre === 'limite' || b.typeOrdre === 'stop' ? b.typeOrdre : null,
    entree: positif(b.entree),
    stop: positif(b.stop),
    tp: positif(b.tp),
    taille: positif(b.taille),
    risque: montant !== null && unite !== null && !(unite === '%' && montant > 100) ? { montant, unite } : null,
    partiels,
    instrument: texte(b.instrument, 20),
    confiance,
    remarque: texte(b.remarque, 300),
  }
}

/** La lecture n'a rien rendu de sûr (aucun champ à remplir). */
export const lectureVide = (l: LectureOrdre) =>
  l.sens === null && l.typeOrdre === null && l.entree === null && l.stop === null && l.tp === null
  && l.taille === null && l.risque === null && l.partiels.length === 0

/** Ce que le membre a tapé dans la carte, stop et TP EN PRIX (la carte convertit ses ticks avant). */
export interface Saisie {
  entree: string
  stop: string
  tp: string
  taille: string
  sortie: string
  risque: string
  uniteRisque: 'USD' | '%'
  sens: SensTrade | null
  typeOrdre: TypeOrdre | null
  partiels: { prix: string; taille: string }[]
}

export type ChampLu = 'sens' | 'typeOrdre' | 'entree' | 'stop' | 'tp' | 'taille' | 'risque' | 'partiels'

/**
 * Fusionne une lecture dans la saisie. Un champ vide prend la valeur lue
 * (`remplis`) ; une valeur tapée identique reste ; une valeur tapée
 * DIFFÉRENTE n'est remplacée qu'avec `remplacer` (sinon elle est dans
 * `conflits` et la carte demande). La sortie n'est jamais lue : un ticket
 * d'ordre ne la dit pas.
 */
export function fusionnerLecture(
  saisie: Saisie, lecture: LectureOrdre, o: { remplacer?: boolean; ecrire: (n: number) => string },
): { saisie: Saisie; remplis: ChampLu[]; conflits: ChampLu[] } {
  const sortie: Saisie = { ...saisie, partiels: saisie.partiels.map(p => ({ ...p })) }
  const remplis: ChampLu[] = []
  const conflits: ChampLu[] = []
  const decider = (champ: ChampLu, vide: boolean, pareil: boolean, poser: () => void) => {
    if (pareil) return
    if (vide || o.remplacer) { poser(); remplis.push(champ); return }
    conflits.push(champ)
  }

  if (lecture.sens !== null) decider('sens', saisie.sens === null, saisie.sens === lecture.sens, () => { sortie.sens = lecture.sens })
  if (lecture.typeOrdre !== null) {
    decider('typeOrdre', saisie.typeOrdre === null, saisie.typeOrdre === lecture.typeOrdre, () => { sortie.typeOrdre = lecture.typeOrdre })
  }
  for (const champ of ['entree', 'stop', 'tp', 'taille'] as const) {
    const lu = lecture[champ]
    if (lu === null) continue
    const tape = lireNombre(saisie[champ])
    decider(champ, tape === undefined, typeof tape === 'number' && Math.abs(tape - lu) < 1e-9, () => { sortie[champ] = o.ecrire(lu) })
  }
  if (lecture.risque !== null) {
    const { montant, unite } = lecture.risque
    const tape = lireNombre(saisie.risque)
    decider('risque', tape === undefined, typeof tape === 'number' && Math.abs(tape - montant) < 1e-9 && saisie.uniteRisque === unite, () => {
      sortie.risque = o.ecrire(montant)
      sortie.uniteRisque = unite
    })
  }
  if (lecture.partiels.length > 0) {
    const vides = saisie.partiels.every(p => !p.prix.trim() && !p.taille.trim())
    const pareils = saisie.partiels.length === lecture.partiels.length && saisie.partiels.every((p, i) =>
      lireNombre(p.prix) === lecture.partiels[i].prix && (lireNombre(p.taille) ?? undefined) === lecture.partiels[i].taille)
    decider('partiels', vides, pareils, () => {
      sortie.partiels = lecture.partiels.map(p => ({ prix: o.ecrire(p.prix), taille: p.taille === undefined ? '' : o.ecrire(p.taille) }))
    })
  }
  return { saisie: sortie, remplis, conflits }
}

// ── La capture envoyée ──────────────────────────────────────────────────────

/** Les images que l'IA lit telles quelles ; les autres sont redessinées en JPEG avant l'envoi. */
export const TYPES_IMAGE_LUS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** La limite du journal (4,4 Mo de base64, sous la limite de corps de Vercel). */
export const BASE64_MAX = 4_400_000
/** Au-delà, la capture est réduite avant l'envoi, comme la capture automatique du graphique. */
export const BASE64_A_REDUIRE = 1_500_000

/**
 * La réduction à appliquer avant un envoi : `essai` 0 = premier envoi, réduite
 * comme la capture automatique du graphique (REDUCTION_CAPTURE) seulement si
 * elle est lourde ou d'un type que l'IA ne lit pas ; 1 = après un 413, plus
 * fort. null = envoyer telle quelle.
 */
export function reductionAvantEnvoi(o: { longueurBase64: number; type: string; essai: 0 | 1 }): { maxWidth: number; quality: number } | null {
  if (o.essai === 1) return { maxWidth: 1200, quality: 0.6 }
  if (o.longueurBase64 > BASE64_A_REDUIRE || !TYPES_IMAGE_LUS.includes(o.type)) {
    return { maxWidth: REDUCTION_CAPTURE.largeur, quality: REDUCTION_CAPTURE.qualite }
  }
  return null
}
