import storage from './storage'
import { compressImage } from './image-utils'
import { instrumentDuTrade } from './instrument.ts'
import { messageAOnglet } from './message-onglet'
import { t, locale } from './i18n'
import {
  choisirGraphiques, estTradingView, legendeCapture, lireGraphique, raisonAMontrer,
  type GraphiqueLu, type MomentCapture, type OngletVu, type PageLue,
} from './capture-graphique.ts'

/**
 * Capture automatique du graphique au lancement et à la clôture d'un trade
 * (1.8.13, brief C3). Appelée SANS attendre (`void`) par le geste du membre :
 * le trade se lance ou se clôt tout de suite, la capture suit.
 *
 * Les onglets ACTIFS de TradingView de toutes les fenêtres non réduites, de
 * la même famille que l'instrument du trade (NQ et MNQ ensemble) ; une
 * capture par fenêtre, 3 au plus ; jamais un autre site, jamais une mauvaise
 * image : un onglet qui change entre la lecture et la capture est écarté.
 * Rien n'est demandé au marché : la capture est l'écran du membre, avec les
 * données qu'il voyait. Le Carnet ne touche jamais au graphique (ni symbole,
 * ni unité de temps).
 *
 * Rend null quand il n'y a rien à dire (réglage coupé, trade introuvable),
 * sinon le nombre de captures posées et le message discret à montrer.
 */
export interface ResultatCaptureGraphique {
  faites: number
  message: string | null
  /** Poids des images posées (octets du JPEG), pour l'essai. */
  poids: number[]
}

/** Largeur max et qualité : le poids synchronisé vers le journal reste modeste. */
const LARGEUR_MAX = 1600
const QUALITE = 0.75
/** Chrome refuse plus de 2 captureVisibleTab par seconde. */
const ECART_CAPTURES_MS = 600

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Un onglet TradingView est-il ouvert quelque part, actif ou non ? Sinon le membre ne s'en sert pas. */
async function tradingViewOuvert(): Promise<boolean> {
  try {
    const tous = await chrome.tabs.query({ url: ['*://*.tradingview.com/*'] })
    return tous.some(o => estTradingView(o.url))
  } catch {
    return false
  }
}

async function ongletsTradingView(): Promise<OngletVu[]> {
  const [onglets, fenetres] = await Promise.all([
    chrome.tabs.query({ url: ['*://*.tradingview.com/*'], active: true }),
    chrome.windows.getAll({}),
  ])
  const parId = new Map(fenetres.map(f => [f.id, f]))
  const vus = onglets
    .filter(o => typeof o.id === 'number' && estTradingView(o.url))
    .map(o => {
      const f = parId.get(o.windowId)
      return {
        tabId: o.id!,
        windowId: o.windowId,
        url: o.url,
        titre: o.title,
        fenetreReduite: f?.state === 'minimized',
        fenetreActive: !!f?.focused,
      } satisfies OngletVu
    })
  // Ce que la page affiche (symbole, intervalle, légende), demandé au geste.
  const pages = await Promise.all(vus.map(o => (o.fenetreReduite ? null : messageAOnglet<PageLue>(o.tabId, { type: 'LIRE_GRAPHIQUE_TV' }))))
  return vus.map((o, i) => ({ ...o, page: pages[i] }))
}

/** L'onglet est-il toujours celui qu'on a lu (actif, même actif) ? Sinon la capture montrerait autre chose. */
async function toujoursLeMeme(g: GraphiqueLu): Promise<boolean> {
  try {
    const [actif] = await chrome.tabs.query({ active: true, windowId: g.windowId })
    if (!actif || actif.id !== g.tabId) return false
    const relu = lireGraphique({ tabId: g.tabId, windowId: g.windowId, url: actif.url, titre: actif.title })
    // Titre illisible à cet instant (chargement, alerte) : même adresse exigée.
    return relu ? relu.famille === g.famille : actif.url === g.url
  } catch {
    return false
  }
}

function messageDe(raison: 'aucun-graphique' | 'autre-actif' | 'plusieurs-actifs', attendu: string | null, affiches: string[]): string {
  if (raison === 'autre-actif' && attendu) return t('captureAuto.pasCetActif', { instrument: attendu })
  if (raison === 'plusieurs-actifs') return t('captureAuto.plusieursActifs', { actifs: affiches.join(', ') })
  return attendu ? t('captureAuto.pasCetActif', { instrument: attendu }) : t('captureAuto.aucunGraphique')
}

export async function capturerGraphiqueDuTrade(noteId: string, tradeId: string, moment: MomentCapture): Promise<ResultatCaptureGraphique | null> {
  try {
    const reglages = await storage.getSettings()
    if (reglages.captureGraphiqueTrade === false) return null
    const note = await storage.getNote(noteId)
    const trade = note?.trades?.find(tr => tr.id === tradeId)
    if (!note || !trade) return null

    // L'instrument attendu : celui posé sur le trade, sinon celui que dit la
    // note (même règle que « Lier »). Rien du tout : le graphique affiché le
    // donne, s'il n'y en a qu'un. Chaîne vide = « tous les instruments »
    // choisi par le membre : on capture si un seul actif est affiché, sans
    // rien poser.
    let attendu: string | null = null
    let peutPoser = false
    if (trade.instrument) {
      attendu = trade.instrument
    } else if (trade.instrument === undefined) {
      const blocs = (note.messages ?? []).filter(m => m.tradeRef === trade.id)
      attendu = instrumentDuTrade({
        adresses: [...blocs.map(m => m.metadata?.sourceUrl), note.url],
        titres: [...blocs.map(m => m.metadata?.sourceTitle), note.title, note.metadata?.title],
      })
      peutPoser = attendu === null
    }

    const choix = choisirGraphiques(await ongletsTradingView(), attendu, peutPoser)
    // `in` et pas `!choix.ok` : sans strictNullChecks, TypeScript ne resserre pas l'union sur un booléen.
    // Pas de capture : un message seulement si TradingView est ouvert quelque part (Brice, 05/11).
    if ('raison' in choix) {
      const raison = raisonAMontrer(choix, await tradingViewOuvert())
      return { faites: 0, message: raison ? messageDe(raison, choix.attendu, choix.affiches) : null, poids: [] }
    }
    if (choix.instrumentAPoser) await storage.setTradeInstrument(noteId, tradeId, choix.instrumentAPoser)

    const instant = moment === 'cloture' ? (trade.closedAt ?? Date.now()) : trade.startedAt
    const heure = new Date(instant).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    const libelle = moment === 'cloture' ? t('captureAuto.cloture') : t('captureAuto.lancement')
    const poids: number[] = []
    for (const [i, g] of choix.graphiques.entries()) {
      if (i > 0) await pause(ECART_CAPTURES_MS)
      try {
        if (!(await toujoursLeMeme(g))) continue
        const brute = await chrome.tabs.captureVisibleTab(g.windowId, { format: 'jpeg', quality: 90 })
        if (!(await toujoursLeMeme(g))) continue
        const image = await compressImage(brute, { maxWidth: LARGEUR_MAX, maxHeight: 100_000, quality: QUALITE, format: 'jpeg' })
        const legende = legendeCapture(libelle, g.symbole, g.uniteTemps, heure)
        await storage.addMessageToNote(noteId, {
          type: 'image',
          content: image,
          tradeRef: tradeId,
          auto: moment,
          uniteTemps: g.uniteTemps,
          metadata: { alt: legende, sourceUrl: g.url, sourceTitle: g.titre },
        })
        poids.push(Math.round(((image.split(',')[1] ?? '').length * 3) / 4))
      } catch (e) {
        console.warn('[capture auto] fenêtre non capturée', e)
      }
    }
    return { faites: poids.length, message: poids.length ? null : t('captureAuto.echec'), poids }
  } catch (e) {
    console.warn('[capture auto]', e)
    return null
  }
}
