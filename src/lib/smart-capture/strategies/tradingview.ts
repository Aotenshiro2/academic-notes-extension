import type { SiteStrategy, SiteExtractResult } from '../types'

function extractTradingView(): SiteExtractResult {
  try {
    const title = document.title || ''
    const bodyText = document.body?.innerText || ''

    // --- Parse document.title ---
    // Format typique : "NQ1! 24 858,50 ▼ 0.39% — TradingView"
    // ou : "MNQH26 $24,854.00 ▲ 0.41% — TradingView"
    // ou ancien format : "NQ1! 24 858,50 v 0.39% Trading (Main)"
    let symbol = ''
    let price = ''
    let changePct = ''

    // Pattern 1 : "SYMBOL PRICE ▼/▲/v CHANGE% ..."
    // ▼ = U+25BC, ▲ = U+25B2 — TradingView utilise ces triangles dans le titre de l'onglet
    // Format FR : "NQ1! 25 067,50 ▼ 0.39% — TradingView"
    // Format EN : "MNQH26 $24,854.00 ▲ 0.41% — TradingView"
    const titleMatch = title.match(/^([A-Z0-9!./]+)\s+([$\d\s.,]+?)\s+[v▼▲]\s*([-+\d.,]+%?)/)
    if (titleMatch) {
      symbol = titleMatch[1].trim()
      price = titleMatch[2].trim()
      changePct = titleMatch[3].trim()
    }

    // Pattern 2 : "SYMBOL ..." — symbol uniquement, PAS de prix
    if (!symbol) {
      const m2 = title.match(/^([A-Z0-9!./]+)\s+\$?([\d,. ]+)/)
      if (m2) {
        symbol = m2[1].trim()
        // Prix non extrait du titre
      }
    }

    // Pattern 3b : "SYMBOL — Description" (company name pages, no price)
    if (!symbol) {
      const m3b = title.match(/^([A-Z0-9!./]{2,10})\s+[—\-–]/)
      if (m3b) symbol = m3b[1].trim()
    }

    // Fallback : premier mot du titre en majuscules
    if (!symbol) {
      const m3 = title.match(/^([A-Z0-9!./]{2,10})/)
      if (m3) symbol = m3[1]
    }

    // --- Variation depuis le titre ou DOM ---
    // Supporte v, ▼ (U+25BC), ▲ (U+25B2)
    if (!changePct) {
      const pctMatch = title.match(/[v▼▲]\s*([-+]?[\d.,]+%?)/)
      if (pctMatch) changePct = pctMatch[1]
    }

    // --- Fallback sélecteurs DOM (au cas où certains marchent) ---
    if (!symbol) {
      symbol =
        document.querySelector('[data-symbol-short]')?.getAttribute('data-symbol-short') ||
        document.querySelector('[data-symbol-short]')?.textContent?.trim() ||
        document.querySelector('.pane-legend-title__highlight')?.textContent?.trim() ||
        ''
    }

    // --- Prix live depuis le DOM (override du titre si trouvé) ---
    // Sélecteurs DOM directs
    let livePrice =
      document.querySelector('[data-name="quotes-axis-label"]')?.textContent?.trim() ||
      document.querySelector('.js-symbol-last')?.textContent?.trim() ||
      document.querySelector('[class*="lastPrice"]')?.textContent?.trim() ||
      ''

    // Ancre .pane-legend-title__highlight → prix live dans la légende du chart
    // La légende affiche en temps réel le prix courant du graphique
    if (!livePrice) {
      const anchor = document.querySelector('.pane-legend-title__highlight')
      if (anchor) {
        let el: Element | null = anchor
        for (let i = 0; i < 8 && el; i++) {
          const text = el.textContent || ''
          // Extraire tous les grands nombres du container (au moins 4 chiffres au total)
          const nums = Array.from(text.matchAll(/\b(\d[\d\s,.]{3,})\b/g))
            .map(m => m[1].trim().replace(/\s+$/, ''))
            .filter(n => (n.match(/\d/g) || []).length >= 3)
          if (nums.length >= 1) {
            // Le dernier grand nombre dans la légende = prix live le plus récent
            livePrice = nums[nums.length - 1]
            break
          }
          el = el.parentElement
        }
      }
    }

    // Override le prix du titre si une source DOM a trouvé le prix live
    if (livePrice) price = livePrice

    // --- OHLC de la légende (1.8.0) --------------------------------------
    // La capture du 30/08/2026 sortait « Prix : — » alors que la légende
    // affichait « O29 635,50 H29 811,50 B29 436,25 C29 491,75 » juste sous le
    // symbole. C'est la seule VRAIE donnée de marché de la page, et la plus
    // stable : le sélecteur du prix live change à chaque refonte, la légende
    // OHLC non. TradingView en français écrit B (bas) là où l'anglais met L.
    const ohlc = (() => {
      const m = bodyText.match(
        /\bO\s*([\d   ,.]+?)\s+H\s*([\d   ,.]+?)\s+[LB]\s*([\d   ,.]+?)\s+C\s*([\d   ,.]+?)(?:\s|$)/
      )
      if (!m) return null
      const n = (s: string) => s.trim().replace(/[  ]/g, ' ').replace(/\s+/g, ' ')
      return { o: n(m[1]), h: n(m[2]), l: n(m[3]), c: n(m[4]) }
    })()
    // La clôture de la bougie courante EST le prix courant.
    if (!price && ohlc) price = ohlc.c

    // --- Timeframe ---
    // Chercher dans les boutons de la toolbar
    const timeframe = (() => {
      // Essai sélecteur DOM — #header-toolbar-intervals est stable dans TradingView
      const active =
        document.querySelector('#header-toolbar-intervals .isActive')?.textContent?.trim() ||
        document.querySelector('#header-toolbar-intervals [class*="isActive"]')?.textContent?.trim() ||
        document.querySelector('#header-toolbar-intervals [aria-checked="true"]')?.textContent?.trim() ||
        // aria-pressed="true" dans certaines versions de la toolbar
        document.querySelector('#header-toolbar-intervals [aria-pressed="true"]')?.textContent?.trim() ||
        ''
      if (active) return active.toUpperCase()

      // Fallback: regex sur le titre de la page
      // Format possible : "NQ1! | 1M", "NQ1!, 15 — TradingView", "NQ1! 4H …"
      const tfMatch =
        title.match(/[|,]\s*(\d+[mhHdDwWM]|[DWMQ])\b/) ||
        title.match(/\b(\d{1,3}[mhHd]|[DWMQ])\s*[-—]/)
      if (tfMatch) return tfMatch[1].toUpperCase()

      return ''
    })()

    // --- Exchange / contrat ---
    // Visible comme "Contrats à terme NASDAQ 100 E-MINI - 1 - CME"
    let exchange = ''
    let contractInfo = ''

    // Chercher dans innerText
    const contractMatch = bodyText.match(/(Contrats?\s+[àa]\s+terme\s+[^\n]+)/i) ||
                          bodyText.match(/(Futures?\s+[^\n]+(?:CME|NYMEX|CBOT|ICE|EUREX))/i)
    if (contractMatch) {
      contractInfo = contractMatch[1].trim().slice(0, 100)
      const exMatch = contractInfo.match(/(CME|NYMEX|CBOT|ICE|EUREX|COMEX|NYSE|NASDAQ)/)
      if (exMatch) exchange = exMatch[1]
    }

    // Fallback DOM
    if (!exchange) {
      exchange = document.querySelector('[class*="exchangeTitle"]')?.textContent?.trim() || ''
    }

    // --- Heure chart (timezone du graphique, ex: 05:38 UTC-5) ---
    // TradingView affiche l'heure du graphique dans la status bar en bas à droite
    const chartTime = (() => {
      // Essai DOM avec des attributs stables
      const clockEl =
        document.querySelector('[data-name="clock"]') ||
        document.querySelector('[class*="clock"]')
      const clockText = clockEl?.textContent?.trim() || ''
      if (clockText && /\d{1,2}:\d{2}/.test(clockText)) return clockText

      // Fallback bodyText : "HH:MM:SS UTC-5" ou "HH:MM UTC-5"
      // Ce pattern est spécifique à la status bar TradingView
      const m = bodyText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\s*(UTC[+-]\d{1,2})\b/i)
      if (m) return `${m[1]} ${m[2]}`

      return ''
    })()

    // --- Heure système (timezone du navigateur / utilisateur) ---
    const systemTimeWithTz = (() => {
      const now = new Date()
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const off = -now.getTimezoneOffset() / 60
      const tz = `UTC${off >= 0 ? '+' : ''}${off}`
      return `${time} ${tz}`
    })()

    // --- Session ETH / RTH ---
    // ATTENTION : "ETH" dans bodyText peut être Ethereum (crypto), pas la session.
    // On cherche ETH/RTH uniquement dans la légende du pane principal (qui affiche
    // "SYMBOL, INTERVAL, ETH" quand Extended Hours est actif), pas dans tout le bodyText.
    const session = (() => {
      // La légende du pane principal contient "SYMBOL, INTERVAL" + éventuellement "ETH"
      const legendText =
        document.querySelector('.pane-legend')?.textContent ||
        document.querySelector('[class*="pane-legend"]')?.textContent ||
        document.querySelector('[class*="legend-source"]')?.textContent ||
        ''

      // ETH/RTH apparaissent dans la légende après le symbole et l'interval
      if (/\bETH\b/.test(legendText)) return 'ETH'
      if (/\bRTH\b/.test(legendText)) return 'RTH'

      // Fallback bodyText — mais uniquement si ETH/RTH est dans un contexte chart
      // (précédé d'un interval comme "1H", "4H", "1D", "15"…)
      const ctxMatch = bodyText.match(/\b(?:\d+[HhMmDd]|Daily|Weekly)\s+(ETH|RTH)\b/)
      if (ctxMatch) return ctxMatch[1]

      return ''
    })()

    // --- Indicateurs ---
    const indicators: string[] = []
    document.querySelectorAll('.study .pane-legend-title__description, [class*="study"] [class*="legendTitle"]').forEach(el => {
      const text = el.textContent?.trim()
      if (text && text.length > 1 && text.length < 80) indicators.push(text)
    })

    // --- Contrat futures ---
    const futuresContract = (() => {
      const m = title.match(/([A-Z]{2,6}\d{0,2}!)/)
      if (m) return m[1]
      if (symbol && symbol.includes('!')) return symbol
      return ''
    })()

    // --- Construire le titre note : "NQ1! 4H @ 24 858,50" ---
    const titleParts: string[] = []
    if (symbol) titleParts.push(symbol)
    if (timeframe) titleParts.push(timeframe)
    if (price) titleParts.push(`@ ${price}`)
    const pageTitle = titleParts.join(' ') || title || 'TradingView'

    // --- Résumé ---
    const summaryParts: string[] = []
    if (symbol) summaryParts.push(symbol)
    if (timeframe) summaryParts.push(`TF: ${timeframe}`)
    if (price) summaryParts.push(`Prix: ${price}`)
    if (changePct) summaryParts.push(`Var: ${changePct}`)
    if (exchange) summaryParts.push(`Exchange: ${exchange}`)
    if (futuresContract && futuresContract !== symbol) summaryParts.push(`Contrat: ${futuresContract}`)
    const summary = summaryParts.join(' · ') || 'TradingView'

    // --- Contenu HTML — context pack ---
    const parts: string[] = []
    parts.push(`<p><strong>Symbole :</strong> ${symbol || '—'}</p>`)
    if (timeframe) parts.push(`<p><strong>Timeframe :</strong> ${timeframe}</p>`)
    parts.push(`<p><strong>Prix :</strong> ${price || '—'}</p>`)
    if (ohlc) parts.push(`<p><strong>OHLC :</strong> O ${ohlc.o} · H ${ohlc.h} · B ${ohlc.l} · C ${ohlc.c}</p>`)
    if (changePct) parts.push(`<p><strong>Variation :</strong> ${changePct}</p>`)
    if (chartTime) parts.push(`<p><strong>Heure chart :</strong> ${chartTime}</p>`)
    parts.push(`<p><strong>Heure utilisateur :</strong> ${systemTimeWithTz}</p>`)
    if (session) parts.push(`<p><strong>Session :</strong> ${session}</p>`)
    if (exchange) parts.push(`<p><strong>Exchange :</strong> ${exchange}</p>`)
    if (contractInfo) parts.push(`<p><strong>Contrat :</strong> ${contractInfo}</p>`)
    if (indicators.length > 0) parts.push(`<p><strong>Indicateurs :</strong> ${indicators.join(', ')}</p>`)
    // Le travail de l'élève (niveaux tracés, zones, outils de position) n'est
    // pas dans le DOM : il est dans le graphe. La capture d'écran l'accompagne
    // et c'est elle qui porte l'analyse, pas ce bloc de métadonnées.
    parts.push(
      `<p><em>Les niveaux, zones et outils tracés sur ce graphique ne sont pas lisibles dans la page : ils sont sur la capture d'écran jointe.</em></p>`
    )

    const content = parts.join('\n')

    // Points clés — 1.8.0 : plus d'horloges.
    // La capture du 30/08/2026 sortait « Timeframe: D », « Chart Time:
    // 11:47:55 UTC-4 », « User Time: 17:47 UTC+2 » comme points clés. Ce sont
    // des lectures d'horloge, pas des enseignements ; elles restent dans le
    // bloc de métadonnées ci-dessus, où elles ont leur place.
    const keyPoints: string[] = []
    if (symbol && price) keyPoints.push(`${symbol} @ ${price}`)
    else if (symbol) keyPoints.push(symbol)
    if (ohlc) keyPoints.push(`O ${ohlc.o} · H ${ohlc.h} · B ${ohlc.l} · C ${ohlc.c}`)
    if (changePct) keyPoints.push(`Variation : ${changePct}`)
    if (timeframe) keyPoints.push(`Unité de temps : ${timeframe}`)
    if (session) keyPoints.push(`Session : ${session}`)
    if (contractInfo) keyPoints.push(contractInfo)
    if (indicators.length > 0) keyPoints.push(`Indicateurs : ${indicators.join(', ')}`)

    // Tags auto
    const tags = ['tradingview']
    if (symbol) tags.push(symbol.toLowerCase())
    if (timeframe) tags.push(timeframe.toLowerCase())

    return {
      // Succès si on a au minimum le symbole ou le prix
      success: !!(symbol || price),
      pageTitle,
      content,
      summary,
      keyPoints,
      concepts: indicators.slice(0, 5),
      tags,
      siteName: 'TradingView',
      extras: { symbol, price, ohlc, changePct, timeframe, chartTime, systemTime: systemTimeWithTz, session, exchange, futuresContract, contractInfo, indicators }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const tradingViewStrategy: SiteStrategy = {
  id: 'tradingview',
  label: 'TradingView',
  match: (url: string) => /tradingview\.com/i.test(url),
  priority: 10,
  func: extractTradingView
}
