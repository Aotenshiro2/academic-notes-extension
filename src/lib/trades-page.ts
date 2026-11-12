import type { CompteConnu } from './pilotage-comptes'
import { normaliseLecture, type Lecture, type TradeNormalise } from './documents-lecture.ts'
import { devinerCompte, lectureDemo, lotsParCompte, normerIdentifiant, type Devinette } from './documents-attribution.ts'

// Les trades d'une page de plateforme, lus par la capture intelligente
// (1.10.0, décision de Brice du 11/11). Pur : testé par
// tests/trades-page.test.ts.
//
// Le parcours : la capture intelligente regarde aussi, dans la page, s'il y a
// un tableau de trades (historique, positions fermées, ordres exécutés :
// lib/smart-capture/trades-page.ts, exécuté dans la page). S'il y en a un, la
// capture d'écran part à la même lecture que Pilotage (`documents/lire`,
// mêmes paliers, gardée au coffre comme un document déposé), les trades lus
// passent par l'aperçu de l'import (nouveaux, déjà importés sur ce compte),
// et rien n'entre sans le clic du membre. Les trades rangés vont au même
// endroit qu'un import Pilotage (`trades/import`), « Lier » les rattache
// ensuite aux trades des notes.
//
// Ce module décide : faut-il lire cette page, est-ce la même page qu'il y a
// une heure (pas une seconde lecture comptée pour rien), quel compte la page
// montre, quels lots ranger. Le DOM et les appels sont ailleurs.
//
// Porte ouverte : une stratégie de site pourra plus tard lire les trades
// DIRECTEMENT dans le tableau, sans IA (comme `lireTableau` de SimpleFX), pour
// TopStepX ou Tradovate : `lotsDeLaCapture` accepte déjà des trades
// « directs » à la place d'une lecture. Aucune stratégie ne les fournit en
// 1.10.0 (il faut de vraies pages connectées pour relever les tableaux).

// ── Les plateformes ─────────────────────────────────────────────────────────

export type PlateformeTrading = {
  id: string
  nom: string
  /** Un hôte couvre ses sous-domaines (« tradovate.com » couvre « trader.tradovate.com »). */
  hotes: string[]
}

/**
 * Les plateformes de trading que la capture reconnaît par leur adresse. Les
 * autres pages (plateformes en marque blanche d'un broker, par exemple) sont
 * lues pareil si un tableau de trades s'y trouve : l'adresse ne sert qu'à
 * nommer la source des trades. La liste commentée, avec ce qui est vérifié,
 * vit dans docs/sites-capture-intelligente.md.
 */
export const PLATEFORMES_TRADING: PlateformeTrading[] = [
  { id: 'topstepx', nom: 'TopStepX', hotes: ['topstepx.com'] },
  { id: 'topstep', nom: 'Topstep', hotes: ['topstep.com'] },
  { id: 'tradovate', nom: 'Tradovate', hotes: ['tradovate.com'] },
  { id: 'simplefx', nom: 'SimpleFX', hotes: ['simplefx.com'] },
  { id: 'tradingview', nom: 'TradingView', hotes: ['tradingview.com'] },
  { id: 'ninjatrader', nom: 'NinjaTrader', hotes: ['ninjatrader.com'] },
  { id: 'myfxbook', nom: 'MyFxBook', hotes: ['myfxbook.com'] },
  { id: 'ctrader', nom: 'cTrader', hotes: ['ctrader.com'] },
  { id: 'metatrader', nom: 'MetaTrader', hotes: ['metatrader.app', 'metatrader5.com', 'metatrader4.com', 'mql5.com'] },
  { id: 'tradelocker', nom: 'TradeLocker', hotes: ['tradelocker.com'] },
  { id: 'match-trader', nom: 'Match-Trader', hotes: ['match-trader.com'] },
  { id: 'dxtrade', nom: 'DXtrade', hotes: ['dx.trade', 'dxtrade.com'] },
  { id: 'rithmic', nom: 'Rithmic', hotes: ['rithmic.com'] },
  { id: 'wealthcharts', nom: 'WealthCharts', hotes: ['wealthcharts.com'] },
  { id: 'apex', nom: 'Apex Trader Funding', hotes: ['apextraderfunding.com'] },
  { id: 'myfundedfutures', nom: 'My Funded Futures', hotes: ['myfundedfutures.com'] },
]

const hoteDe = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** La plateforme d'une adresse, ou null. */
export function plateformeDeLaPage(url: string): PlateformeTrading | null {
  const hote = hoteDe(url)
  if (!hote) return null
  return PLATEFORMES_TRADING.find(p => p.hotes.some(h => hote === h || hote.endsWith(`.${h}`))) ?? null
}

/**
 * La source des trades rangés depuis une capture : « capture:topstepx », ou
 * « capture:<hôte> » pour une plateforme que la liste ne connaît pas. Elle
 * vient de l'adresse, jamais de ce que l'IA a lu : deux captures de la même
 * page donnent la même source, et le journal y reconnaît ses doublons (clé
 * (userId, source, idExterne) rangée sur le compte). Forme acceptée par le
 * journal : lettres, chiffres, « : . _ - », 80 caractères au plus.
 */
export function sourceCapture(url: string): string {
  const plateforme = plateformeDeLaPage(url)
  if (plateforme) return `capture:${plateforme.id}`
  const hote = (hoteDe(url) ?? '').replace(/[^a-z0-9.-]/g, '').slice(0, 60)
  return `capture:${hote || 'page'}`
}

/** Le nom du document au coffre : « capture-trades-2026-11-12-1432.jpg » (heure locale). */
export function nomDeCapture(instant: number): string {
  const d = new Date(instant)
  const deux = (n: number) => String(n).padStart(2, '0')
  return `capture-trades-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}.jpg`
}

// ── Le tableau de la page ────────────────────────────────────────────────────

/** Un tableau relevé dans la page (DOM : en-têtes et quelques lignes, rien ne sort du Carnet). */
export type TableauPage = { entetes: string[]; lignes: string[][] }

/** Ce que le détecteur rend de la page (lib/smart-capture/trades-page.ts). */
export type ReleveTradesPage = {
  tableaux: TableauPage[]
  /** Les mots de la page qui peuvent être un compte (lettres et chiffres, ou un long nombre). */
  jetons: string[]
  /** Les mêmes, lus seulement dans ce qui est sélectionné (le compte choisi dans un menu). */
  jetonsSelection: string[]
  /** Le texte de l'en-tête et des zones « compte » de la page, borné. */
  texteCompte: string
}

// Des mots entiers : `\b` ne voit pas les lettres accentuées (« Quantité »),
// d'où les bornes écrites à la main.
const mot = (motifs: string) => new RegExp(`(?<![a-zà-ÿ])(${motifs})(?![a-zà-ÿ])`, 'i')
const FAMILLES: Record<string, RegExp> = {
  symbole: mot('symbols?|symbole|instruments?|contract|contrat|ticker|market|marché|marche|actif|asset|product|produit'),
  sens: mot('side|sens|direction|b/s|buy/sell|achat/vente|long/short|type'),
  quantite: mot('qty|quantity|quantité|quantite|size|taille|volume|lots?|contracts|contrats|units?'),
  prix: mot('price|prix|entry|exit|entrée|entree|sortie|open|close|ouverture|clôture|cloture|fill|avg'),
  pnl: /(p\s*&\s*l|p\/l|(?<![a-z])pnl(?![a-z])|profit|r[ée]sultat|(?<![a-z])gain(?![a-z])|(?<![a-z])net(?![a-z])|(?<!un)reali[sz]ed|r[ée]alis)/i,
  temps: mot('time|date|heure|opened|closed|timestamp'),
}
// Un trade FERMÉ : une sortie, une clôture, un résultat réalisé (« unrealized »
// et « non réalisé » disent le contraire).
const SORTIE = /(exit|sortie|close|cl[ôo]tur|sold|vendu|(?<!un)reali[sz]ed|(?<!non[\s-])r[ée]alis)/i
const OUVERT = /(unreali[sz]ed|latent|floating|non[\s-]r[ée]alis|open p)/i

export type ChoixTableau = { tableau: TableauPage; familles: string[]; score: number } | null

const chaines = (v: unknown, max: number, long: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map(x => x.slice(0, long)) : []

/** Le relevé tel que le service worker l'a rendu, vérifié ; null s'il ne se lit pas. */
export function normaliseReleve(brut: unknown): ReleveTradesPage | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null
  const r = brut as Record<string, unknown>
  const tableaux = (Array.isArray(r.tableaux) ? r.tableaux : []).slice(0, 12).flatMap((t): TableauPage[] => {
    if (!t || typeof t !== 'object') return []
    const o = t as Record<string, unknown>
    const entetes = chaines(o.entetes, 24, 80)
    const lignes = (Array.isArray(o.lignes) ? o.lignes : []).slice(0, 60).map(l => chaines(l, 24, 80))
    return entetes.length && lignes.length ? [{ entetes, lignes }] : []
  })
  return {
    tableaux,
    jetons: chaines(r.jetons, 600, 40),
    jetonsSelection: chaines(r.jetonsSelection, 120, 40),
    texteCompte: typeof r.texteCompte === 'string' ? r.texteCompte.slice(0, 3000) : '',
  }
}

/** Les familles de colonnes d'un tableau (symbole, sens, quantité, prix, P&L, temps). */
export function famillesDe(entetes: string[]): string[] {
  return Object.entries(FAMILLES).filter(([, re]) => entetes.some(e => re.test(e))).map(([nom]) => nom)
}

/**
 * Le tableau de trades de la page, s'il y en a un : des colonnes d'instrument
 * et de P&L, au moins quatre familles, une ligne au moins, et des signes de
 * trades FERMÉS (une sortie, deux prix ou deux heures). Un tableau de
 * positions ouvertes seules (P&L latent, aucune sortie) n'est pas lu : la
 * lecture de Pilotage n'en tire aucun trade, la lecture serait comptée pour
 * rien.
 */
export function choisirTableauTrades(tableaux: TableauPage[]): ChoixTableau {
  let meilleur: ChoixTableau = null
  for (const tableau of tableaux) {
    if (!tableau.lignes.some(l => l.some(c => c.trim()))) continue
    const familles = famillesDe(tableau.entetes)
    if (!familles.includes('symbole') || !familles.includes('pnl') || familles.length < 4) continue
    const prix = tableau.entetes.filter(e => FAMILLES.prix.test(e)).length
    const temps = tableau.entetes.filter(e => FAMILLES.temps.test(e)).length
    const sortie = tableau.entetes.some(e => SORTIE.test(e))
    const ouvert = tableau.entetes.some(e => OUVERT.test(e))
    if (ouvert && !sortie) continue
    if (!sortie && prix < 2 && temps < 2) continue
    const score = familles.length * 100 + tableau.lignes.length
    if (!meilleur || score > meilleur.score) meilleur = { tableau, familles, score }
  }
  return meilleur
}

// ── La même page, déjà lue ───────────────────────────────────────────────────

/** FNV-1a 32 bits, en hexadécimal : l'empreinte des lignes d'un tableau (reste dans le Carnet). */
export function empreinteTableau(tableau: TableauPage): string {
  const texte = [tableau.entetes.join('\u0001'), ...tableau.lignes.map(l => l.join('\u0001'))].join('\u0002')
  let h = 0x811c9dc5
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export type LectureFaite = { empreinte: string; quand: number }

/** 12 h : la même page relue dans la journée ne recompte pas une lecture. */
export const DUREE_DEJA_LUE_MS = 12 * 60 * 60 * 1000
export const LECTURES_GARDEES = 50
export const CLE_LECTURES_FAITES = 'carnet-trades-page-lues'

/** Ce tableau, à l'identique, a-t-il été lu il y a moins de 12 h ? */
export function dejaLue(liste: LectureFaite[] | null | undefined, empreinte: string, maintenant: number): boolean {
  return (liste ?? []).some(l => l.empreinte === empreinte && maintenant - l.quand >= 0 && maintenant - l.quand < DUREE_DEJA_LUE_MS)
}

/** La liste avec cette lecture, sans les vieilles, bornée. */
export function noterLue(liste: LectureFaite[] | null | undefined, empreinte: string, maintenant: number): LectureFaite[] {
  const gardees = (Array.isArray(liste) ? liste : [])
    .filter(l => l && typeof l.empreinte === 'string' && typeof l.quand === 'number')
    .filter(l => l.empreinte !== empreinte && maintenant - l.quand < DUREE_DEJA_LUE_MS)
  return [...gardees, { empreinte, quand: maintenant }].slice(-LECTURES_GARDEES)
}

// ── Le compte que la page montre ─────────────────────────────────────────────

/** Les identifiants d'un compte assez distinctifs pour être cherchés dans une page : 4 signes au moins, dont un chiffre. */
function identifiantsDistinctifs(compte: CompteConnu): string[] {
  return [...new Set(compte.identifiants.map(normerIdentifiant))].filter(id => id.length >= 4 && /\d/.test(id))
}

export type ComptePage = { compteId: string | null; plusieurs: boolean }

function comptesVus(jetons: string[], texte: string, comptes: CompteConnu[]): string[] {
  const normes = new Set(jetons.map(normerIdentifiant).filter(Boolean))
  const texteNorme = normerIdentifiant(texte)
  return comptes
    .filter(compte => identifiantsDistinctifs(compte).some(id =>
      normes.has(id)
      // Un identifiant long, lettres ET chiffres, se cherche aussi dans le texte
      // de l'en-tête (« 50K Combine 12345 » écrit en plusieurs mots).
      || (id.length >= 8 && /[a-z]/.test(id) && texteNorme.includes(id))))
    .map(compte => compte.id)
}

/**
 * Le compte de Pilotage que la page montre (numéro ou nom du compte visible) :
 * d'abord ce qui est sélectionné (le compte choisi dans le menu de la
 * plateforme), puis toute la page. Un seul compte reconnu : c'est lui ;
 * plusieurs (la liste de tous les comptes d'un menu) : la page ne tranche pas.
 * Les jetons sont des mots entiers : un prix (« 51 423.90 ») ne se confond pas
 * avec un numéro de compte (« 514239 »).
 */
export function compteDepuisPage(releve: Pick<ReleveTradesPage, 'jetons' | 'jetonsSelection' | 'texteCompte'>, comptes: CompteConnu[]): ComptePage {
  const choisis = comptesVus(releve.jetonsSelection, '', comptes)
  if (choisis.length === 1) return { compteId: choisis[0], plusieurs: false }
  const vus = comptesVus(releve.jetons, releve.texteCompte, comptes)
  if (vus.length === 1) return { compteId: vus[0], plusieurs: false }
  return { compteId: null, plusieurs: vus.length > 1 || choisis.length > 1 }
}

export type DevinetteCapture = Omit<Devinette, 'par'> & { par: Devinette['par'] | 'page' }

/**
 * Le compte d'un lot de la capture. La page d'abord (ce qu'elle montre est
 * exact), la lecture ensuite (ce que l'IA a lu sur l'image, le rapprochement
 * du journal) ; quand les deux se contredisent, ou qu'un compte démo et un
 * document réel se croisent, la page propose et le membre confirme.
 */
export function devinerCompteCapture(lecture: Lecture, comptes: CompteConnu[], page: ComptePage | null): DevinetteCapture {
  const lue = devinerCompte(lecture, comptes)
  const compte = page?.compteId ? comptes.find(c => c.id === page.compteId) : undefined
  if (!compte) return lue
  const contredit = !!lue.compteId && lue.compteId !== compte.id
  const mondes = (compte.kind === 'demo') !== lectureDemo(lecture)
  return {
    compteId: compte.id,
    par: 'page',
    doute: contredit || mondes,
    inconnu: null,
    demo: compte.kind === 'demo' || lue.demo,
  }
}

// ── Les lots à ranger ───────────────────────────────────────────────────────

export type LotCapture = {
  cle: string
  compteLu: string | null
  trades: TradeNormalise[]
  source: string
  devinette: DevinetteCapture
}

/**
 * Les lots de la capture, un par compte lu (une page qui liste les trades de
 * plusieurs comptes copiés). La page ne devine le compte que d'un lot unique.
 * Tous les trades prennent la source de la page (`sourceCapture`).
 * `directs` (porte ouverte, voir l'en-tête) : des trades lus dans le tableau
 * sans IA, à la place de la lecture.
 */
export function lotsDeLaCapture(e: {
  lecture: Lecture | null
  directs?: TradeNormalise[] | null
  comptes: CompteConnu[]
  page: ComptePage | null
  source: string
}): LotCapture[] {
  const lecture = e.directs?.length
    ? normaliseLecture({ type: 'trades', methode: 'csv', confiance: 1, trades: e.directs })
    : e.lecture
  if (!lecture || !lecture.trades?.length) return []
  const parCompte = lotsParCompte(lecture).filter(l => l.lecture.trades?.length)
  return parCompte.map((l, rang) => ({
    cle: `lot-${rang}`,
    compteLu: l.compteLu,
    trades: l.lecture.trades!.map(t => ({ ...t, source: e.source })),
    source: e.source,
    devinette: devinerCompteCapture(l.lecture, e.comptes, parCompte.length === 1 ? e.page : null),
  }))
}

/** Les trades d'une lecture : fermés et rendus, ou rien (positions ouvertes, tableau de bord, illisible). */
export const lectureATrades = (lecture: Lecture | null | undefined) => !!lecture && (lecture.trades?.length ?? 0) > 0
