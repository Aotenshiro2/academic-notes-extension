import type { SiteStrategy, SiteExtractResult } from '../types'

function extractTradingView(): SiteExtractResult {
  try {
    const title = document.title || ''
    const bodyText = document.body?.innerText || ''

    // --- Parse document.title ---
    // Format typique : "NQ1! 24 858,50 v 0.39% Trading (Main)"
    // ou : "MNQH26 $24,854.00 v -0.41%"
    let symbol = ''
    let price = ''
    let changePct = ''

    // Pattern 1 : "SYMBOL PRICE v CHANGE% ..."
    const titleMatch = title.match(/^([A-Z0-9!./]+)\s+([$\d\s.,]+?)\s+v\s+([-+\d.,]+%?)/)
    if (titleMatch) {
      symbol = titleMatch[1].trim()
      price = titleMatch[2].trim()
      changePct = titleMatch[3].trim()
    }

    // Pattern 2 : "SYMBOL PRICE" (with or without $, with or without trailing text)
    // Handles European format (spaces in numbers: "24 858,50") and end-of-string
    if (!symbol) {
      const m2 = title.match(/^([A-Z0-9!./]+)\s+\$?([\d,. ]+)/)
      if (m2) {
        symbol = m2[1].trim()
        price = m2[2].trim()
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
    if (!changePct) {
      const pctMatch = title.match(/v\s*([-+]?[\d.,]+%?)/)
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

    if (!price) {
      price =
        document.querySelector('.js-symbol-last')?.textContent?.trim() ||
        document.querySelector('[class*="lastPrice"]')?.textContent?.trim() ||
        ''
    }

    // Fallback: scan innerText for a price near the symbol (handles obfuscated SPAs)
    if (!price && symbol) {
      const safeSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const nearSymbol = bodyText.match(new RegExp(safeSym + '[^\\d\\n]{0,30}\\$?([\\d,.]+\\.\\d{2})'))
      if (nearSymbol) price = nearSymbol[1]
    }

    // --- Timeframe ---
    // Chercher dans les boutons de la toolbar
    const timeframe = (() => {
      // Essai sélecteur DOM
      const active =
        document.querySelector('#header-toolbar-intervals .isActive')?.textContent?.trim() ||
        document.querySelector('#header-toolbar-intervals [class*="isActive"]')?.textContent?.trim() ||
        document.querySelector('#header-toolbar-intervals [aria-checked="true"]')?.textContent?.trim() ||
        ''
      if (active) return active.toUpperCase()

      // Fallback: regex sur innerText pour le titre contenant le TF
      // Le titre peut contenir "NQ1! | 1M" ou similaire dans certaines configs
      const tfMatch = title.match(/\|\s*(\d+[mhHdDwWM]|[DWMQ])\s/)
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
    if (changePct) parts.push(`<p><strong>Variation :</strong> ${changePct}</p>`)
    if (exchange) parts.push(`<p><strong>Exchange :</strong> ${exchange}</p>`)
    if (contractInfo) parts.push(`<p><strong>Contrat :</strong> ${contractInfo}</p>`)
    if (indicators.length > 0) parts.push(`<p><strong>Indicateurs :</strong> ${indicators.join(', ')}</p>`)

    const content = parts.join('\n')

    // Key points
    const keyPoints: string[] = []
    if (symbol && price) keyPoints.push(`${symbol} @ ${price}`)
    if (changePct) keyPoints.push(`Variation: ${changePct}`)
    if (timeframe) keyPoints.push(`Timeframe: ${timeframe}`)
    if (contractInfo) keyPoints.push(contractInfo)
    if (indicators.length > 0) keyPoints.push(`Indicateurs: ${indicators.join(', ')}`)

    // Tags auto
    const tags = ['tradingview']
    if (symbol) tags.push(symbol.toLowerCase())
    if (timeframe) tags.push(timeframe.toLowerCase())

    return {
      success: content.length >= 50,
      pageTitle,
      content,
      summary,
      keyPoints,
      concepts: indicators.slice(0, 5),
      tags,
      siteName: 'TradingView',
      extras: { symbol, price, changePct, timeframe, exchange, futuresContract, contractInfo, indicators }
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
