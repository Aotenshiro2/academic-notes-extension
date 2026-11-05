// Capture automatique du graphique au lancement et à la clôture d'un trade
// (1.8.13, brief C3). Pur, sans chrome : testé par
// tests/capture-graphique.test.ts (node --test). Le câblage Chrome (onglets,
// fenêtres, captureVisibleTab, stockage) vit dans capture-graphique-trade.ts.
//
// La règle de Brice : la capture, c'est son écran au moment du geste. Le bon
// actif, le bon trade, la bonne unité de temps, les données qu'il voyait. On
// ne va jamais chercher de données de marché, et jamais une mauvaise image :
// un onglet dont on ne sait pas lire l'actif ne se capture pas.

import { familleInstrument, instrumentDepuisAdresse, memeFamille, normaliserInstrument } from './instrument.ts'

export type MomentCapture = 'lancement' | 'cloture'

/** Une capture par fenêtre, 3 au plus (plusieurs écrans, plusieurs unités de temps). */
export const CAPTURES_MAX = 3

/** Ce que le panneau sait d'un onglet actif de TradingView. */
export interface OngletVu {
  tabId: number
  windowId: number
  url?: string
  titre?: string
  /** Fenêtre réduite : elle ne se capture pas. */
  fenetreReduite?: boolean
  /** Fenêtre au premier plan : sa capture passe en premier. */
  fenetreActive?: boolean
  /** Ce que le content script a lu dans la page (null : rien, ou pas de réponse). */
  page?: PageLue | null
}

/** La lecture brute du content script dans la page TradingView (vérifiée sur le vrai site le 05/11). */
export interface PageLue {
  /** Texte du bouton de symbole de la barre du haut (« NQ1! »). */
  symbole?: string | null
  /** Texte du bouton d'intervalle : l'actif s'il y en a plusieurs, sinon le bouton menu (« 5m », « 1h », « D »). */
  intervalle?: string | null
  /** aria-label ou data-tooltip de ce bouton (« 5 minutes », « 1 heure », « 1 day »). */
  intervalleLibelle?: string | null
  /** L'intervalle de la légende du graphique, `[class*="intervalTitle"]` (« 5 » : des minutes). */
  intervalleLegende?: string | null
}

/** Un graphique retenu : son symbole tel qu'affiché, sa famille, son unité de temps. */
export interface GraphiqueLu {
  tabId: number
  windowId: number
  url?: string
  titre?: string
  /** Le symbole tel que TradingView l'affiche, sans préfixe de bourse (« NQ1! »). */
  symbole: string
  /** La racine comparée (« NQ », « MNQ ») : c'est elle qui devient l'instrument du trade. */
  racine: string
  famille: string
  /** Forme normalisée ('5m', '1h', 'D', '3M'), null si elle n'est pas lisible. */
  uniteTemps: string | null
}

export type ChoixCapture =
  | { ok: true; graphiques: GraphiqueLu[]; instrumentAPoser: string | null }
  | { ok: false; raison: 'aucun-graphique' | 'autre-actif' | 'plusieurs-actifs'; attendu: string | null; affiches: string[] }

/** Un onglet TradingView, et rien d'autre (jamais un autre site). */
export function estTradingView(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const hote = u.hostname.toLowerCase()
    return hote === 'tradingview.com' || hote.endsWith('.tradingview.com')
  } catch {
    return false
  }
}

/** Retire le préfixe de bourse : « CME_MINI:NQ1! » -> « NQ1! ». */
function sansBourse(s: string): string {
  return s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s
}

/** Un symbole plausible : capitales, chiffres, « ! . _ & / - », au moins une lettre, et une racine lisible. */
function symboleValide(brut: string | null | undefined): string | null {
  if (!brut) return null
  const s = sansBourse(brut.trim())
  if (!s || s.length > 24) return null
  if (!/^[A-Z0-9][A-Z0-9!._&/-]*$/.test(s) || !/[A-Z]/.test(s)) return null
  if (s === 'TRADINGVIEW') return null
  return normaliserInstrument(s) ? s : null
}

/**
 * Le symbole du titre d'un onglet TradingView. Le titre d'un graphique
 * commence par le symbole affiché, puis le prix : « NQ1! 21 052,25 +0,3% ».
 * Un compteur en tête (« (2) NQ1! ... ») est ignoré. null si le premier mot
 * n'est pas un symbole (« TradingView : graphiques... », une alerte).
 */
export function symboleDepuisTitreTradingView(titre: string | null | undefined): string | null {
  if (!titre) return null
  const premier = titre.trim().replace(/^\(\d+\)\s*/, '').split(/\s+/)[0]
  return symboleValide(premier)
}

/** Le symbole de l'adresse (`?symbol=CME_MINI:NQ1!` ou `/symbols/CME_MINI-NQ1!/`), sans la bourse. */
export function symboleDepuisAdresseTradingView(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const parametre = u.searchParams.get('symbol') ?? u.searchParams.get('tvwidgetsymbol')
    if (parametre) return symboleValide(parametre.toUpperCase())
    const morceaux = u.pathname.split('/').filter(Boolean)
    const i = morceaux.indexOf('symbols')
    if (i >= 0 && morceaux[i + 1]) {
      const brut = decodeURIComponent(morceaux[i + 1]).toUpperCase()
      return symboleValide(brut.includes('-') ? brut.slice(brut.lastIndexOf('-') + 1) : brut)
    }
  } catch { /* adresse illisible */ }
  return instrumentDepuisAdresse(url)
}

/**
 * L'unité de temps sous une forme normalisée, celle que le Journal lira pour
 * choisir un HTF et un LTF : '5s', '1m', '5m', '1h', '4h', 'D', '2D', 'W',
 * 'M', '3M'. La casse compte comme chez TradingView : « m » minute, « M » mois.
 * Accepte le bouton de la barre (« 5m », « 1h », « D », « 3M »), le chiffre
 * de la légende ou de l'adresse (« 5 », « 60 », « 240 » : des minutes), et les
 * libellés longs (« 5 minutes », « 1 heure », « 1 hour »). null sinon.
 */
export function normaliserUniteTemps(brut: string | null | undefined): string | null {
  if (!brut) return null
  const s = brut.trim()
  if (!s || s.length > 16) return null
  let m: RegExpExecArray | null
  const minutes = (n: number): string | null => {
    if (!Number.isFinite(n) || n <= 0) return null
    if (n === 1440) return 'D'
    if (n % 60 === 0 && n < 1440) return `${n / 60}h`
    return `${n}m`
  }
  const avecN = (n: string | undefined, unite: string) => (!n || n === '1' ? unite : `${Number(n)}${unite}`)
  if ((m = /^(\d+)$/.exec(s))) return minutes(Number(m[1]))
  if ((m = /^(\d+)\s*(?:m|min|mn|minutes?)$/.exec(s))) return minutes(Number(m[1]))
  if ((m = /^(\d+)\s*(?:s|S|sec|secondes?|seconds?)$/.exec(s))) return Number(m[1]) > 0 ? `${Number(m[1])}s` : null
  if ((m = /^(\d+)\s*(?:h|H|heures?|hours?)$/i.exec(s))) return Number(m[1]) > 0 ? `${Number(m[1])}h` : null
  if ((m = /^(\d*)\s*(?:D|jours?|days?)$/i.exec(s)) && /[Dd]|jour|day/i.test(s)) return avecN(m[1], 'D')
  if ((m = /^(\d*)\s*(?:W|semaines?|weeks?)$/i.exec(s))) return avecN(m[1], 'W')
  if ((m = /^(\d*)\s*M$/.exec(s))) return avecN(m[1], 'M')
  if ((m = /^(\d*)\s*(?:mois|months?)$/i.exec(s))) return avecN(m[1], 'M')
  return null
}

/** L'intervalle de l'adresse (`&interval=5`), quand TradingView l'y met. */
export function uniteTempsDepuisAdresse(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return normaliserUniteTemps(new URL(url).searchParams.get('interval'))
  } catch {
    return null
  }
}

/** L'unité de temps sous l'image : '5m' -> « 5 min », '1h' -> « 1 h », 'D', 'W', '3M' tels que TradingView les écrit. */
export function afficherUniteTemps(norme: string | null | undefined): string | null {
  if (!norme) return null
  const m = /^(\d+)([smh])$/.exec(norme)
  if (!m) return norme
  return `${m[1]} ${m[2] === 'm' ? 'min' : m[2]}`
}

/**
 * Ce qu'on lit d'un onglet : le symbole (titre d'abord, il suit le graphique
 * en direct ; puis la page ; puis l'adresse, qui peut garder le symbole
 * d'ouverture), l'unité de temps (texte du bouton d'intervalle, actif ou
 * menu ; puis son aria-label ou son data-tooltip ; puis l'intervalle de la
 * légende ; puis l'adresse). null si le symbole n'est pas lisible : on ne
 * capture pas un graphique dont on ne sait pas l'actif.
 */
export function lireGraphique(o: OngletVu): GraphiqueLu | null {
  if (!estTradingView(o.url)) return null
  const symbole = symboleDepuisTitreTradingView(o.titre)
    ?? symboleValide(o.page?.symbole?.trim().toUpperCase())
    ?? symboleDepuisAdresseTradingView(o.url)
  const racine = normaliserInstrument(symbole)
  const famille = familleInstrument(symbole)
  if (!symbole || !racine || !famille) return null
  const uniteTemps = normaliserUniteTemps(o.page?.intervalle)
    ?? normaliserUniteTemps(o.page?.intervalleLibelle)
    ?? normaliserUniteTemps(o.page?.intervalleLegende)
    ?? uniteTempsDepuisAdresse(o.url)
  return { tabId: o.tabId, windowId: o.windowId, url: o.url, titre: o.titre, symbole, racine, famille, uniteTemps }
}

/**
 * Les graphiques à capturer.
 * - `attendu` : l'instrument du trade (celui posé, sinon celui de la note) ;
 *   seuls les graphiques de la même famille passent (NQ et MNQ ensemble).
 * - sans `attendu`, une seule famille affichée : c'est elle ; `peutPoser` dit
 *   si elle devient l'instrument du trade (faux quand le membre a choisi
 *   « tous les instruments »). Plusieurs familles : on ne devine pas.
 * Une fenêtre réduite ne compte pas ; une capture par fenêtre, la fenêtre au
 * premier plan d'abord, 3 au plus.
 */
export function choisirGraphiques(onglets: OngletVu[], attendu: string | null | undefined, peutPoser: boolean): ChoixCapture {
  const vus = new Set<number>()
  const lus: GraphiqueLu[] = []
  const tries = [...onglets].sort((a, b) => Number(!!b.fenetreActive) - Number(!!a.fenetreActive))
  for (const o of tries) {
    if (o.fenetreReduite || vus.has(o.windowId)) continue
    const g = lireGraphique(o)
    if (!g) continue
    vus.add(o.windowId)
    lus.push(g)
  }
  const affiches = [...new Set(lus.map(g => g.famille))]
  const cible = attendu ? normaliserInstrument(attendu) : null
  if (cible) {
    const graphiques = lus.filter(g => memeFamille(g.racine, cible))
    if (graphiques.length === 0) {
      return { ok: false, raison: lus.length ? 'autre-actif' : 'aucun-graphique', attendu: cible, affiches }
    }
    return { ok: true, graphiques: graphiques.slice(0, CAPTURES_MAX), instrumentAPoser: null }
  }
  if (lus.length === 0) return { ok: false, raison: 'aucun-graphique', attendu: null, affiches }
  if (affiches.length > 1) return { ok: false, raison: 'plusieurs-actifs', attendu: null, affiches }
  return { ok: true, graphiques: lus.slice(0, CAPTURES_MAX), instrumentAPoser: peutPoser ? lus[0].racine : null }
}

/**
 * Faut-il dire pourquoi il n'y a pas de capture ? Seulement si TradingView est
 * ouvert quelque part (Brice, 05/11) : aucun onglet TradingView, c'est un
 * membre qui ne s'en sert pas, on ne lui dit rien à chaque trade. Ouvert sur
 * un autre actif, ou derrière un autre site : le message dit pourquoi.
 */
export function raisonAMontrer(choix: ChoixCapture, tradingViewOuvert: boolean): 'aucun-graphique' | 'autre-actif' | 'plusieurs-actifs' | null {
  if (!tradingViewOuvert || !('raison' in choix)) return null
  return choix.raison
}

/** Le texte sous l'image : « Lancement, NQ1!, 5 min, 09:40 » (unité de temps omise si elle n'est pas lue). */
export function legendeCapture(moment: string, symbole: string, uniteTemps: string | null | undefined, heure: string): string {
  const unite = afficherUniteTemps(uniteTemps)
  return [moment, symbole, unite, heure].filter(Boolean).join(', ')
}
