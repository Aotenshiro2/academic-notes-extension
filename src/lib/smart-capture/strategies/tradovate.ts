import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * Tradovate — stats trading (premier jet, à affiner)
 * P&L, win rate, stats générales
 */
function extractTradovate(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''

    // Primary: regex on innerText (resilient to obfuscated SPA classes)
    const findValue = (pattern: RegExp): string => {
      const m = bodyText.match(pattern)
      return m ? m[1].trim() : ''
    }

    // Secondary: DOM label traversal fallback
    const findByLabel = (labels: string[]): string => {
      const els = document.querySelectorAll('span, div, td, p, dt, dd, label')
      for (const label of labels) {
        for (const el of els) {
          const text = el.textContent?.trim().toLowerCase() || ''
          if (text === label.toLowerCase() || text.startsWith(label.toLowerCase())) {
            const next = el.nextElementSibling
            if (next?.textContent?.trim()) return next.textContent.trim()
            const parent = el.parentElement
            const value = parent?.querySelector('[class*="value"], [class*="Value"], span:last-child, div:last-child')
            if (value?.textContent?.trim() && value !== el) return value.textContent.trim()
          }
        }
      }
      return ''
    }

    const totalPnl =
      findValue(/Total\s+P[&N]?L[:\s]*\$?([-\d,.]+)/i) ||
      findByLabel(['Total P&L', 'Net P&L', 'Realized P&L', 'Total Profit'])
    const winRate =
      findValue(/Win\s+(?:Rate|%)[:\s]*([\d.]+\s*%?)/i) ||
      findByLabel(['Win Rate', 'Win %', 'Winning'])
    const totalTrades =
      findValue(/(?:Total\s+)?(?:Trades?|Number of Trades)[:\s]*(\d+)/i) ||
      findByLabel(['Total Trades', 'Trades', 'Number of Trades'])
    const profitFactor =
      findValue(/Profit\s+Factor[:\s]*([\d.]+)/i) ||
      findByLabel(['Profit Factor', 'PF'])
    const avgTrade =
      findValue(/Avg(?:erage)?\s+(?:Trade|P[&N]?L)[:\s]*\$?([-\d,.]+)/i) ||
      findByLabel(['Avg Trade', 'Average Trade', 'Avg P&L'])
    const biggestWin =
      findValue(/(?:Biggest|Largest|Best)\s+(?:Win|Trade)[:\s]*\$?([-\d,.]+)/i) ||
      findByLabel(['Biggest Win', 'Largest Win', 'Best Trade'])
    const biggestLoss =
      findValue(/(?:Biggest|Largest|Worst)\s+(?:Loss|Trade)[:\s]*\$?([-\d,.]+)/i) ||
      findByLabel(['Biggest Loss', 'Largest Loss', 'Worst Trade'])
    const drawdown =
      findValue(/(?:Max\s+)?Drawdown[:\s]*\$?([-\d,.]+)/i) ||
      findByLabel(['Drawdown', 'Max Drawdown'])

    // Symbole si disponible (page de trading)
    let symbol =
      document.querySelector('[class*="symbol"]')?.textContent?.trim() ||
      document.querySelector('[class*="instrument"]')?.textContent?.trim() ||
      ''
    if (!symbol) {
      const symMatch = bodyText.match(/\b((?:MNQ|NQ|ES|MES|CL|GC|SI|YM|MYM|RTY|M2K)[A-Z]?\d{2})\b/)
      if (symMatch) symbol = symMatch[1]
    }

    let price =
      document.querySelector('[class*="lastPrice"]')?.textContent?.trim() ||
      document.querySelector('[class*="last-price"]')?.textContent?.trim() ||
      ''
    if (!price && symbol) {
      const safeSym = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pm = bodyText.match(new RegExp(safeSym + '[^\\d\\n]{0,20}\\$?([\\d,.]+\\.\\d{2})'))
      if (pm) price = pm[1]
    }

    const parts: string[] = []
    parts.push('<p><strong>Tradovate</strong></p>')
    if (symbol) parts.push(`<p><strong>Symbole :</strong> ${symbol}</p>`)
    if (price) parts.push(`<p><strong>Prix :</strong> ${price}</p>`)
    if (totalPnl) parts.push(`<p><strong>Total P&L :</strong> ${totalPnl}</p>`)
    if (winRate) parts.push(`<p><strong>Win Rate :</strong> ${winRate}</p>`)
    if (totalTrades) parts.push(`<p><strong>Trades :</strong> ${totalTrades}</p>`)
    if (profitFactor) parts.push(`<p><strong>Profit Factor :</strong> ${profitFactor}</p>`)
    if (avgTrade) parts.push(`<p><strong>Trade moyen :</strong> ${avgTrade}</p>`)
    if (biggestWin) parts.push(`<p><strong>Plus gros gain :</strong> ${biggestWin}</p>`)
    if (biggestLoss) parts.push(`<p><strong>Plus grosse perte :</strong> ${biggestLoss}</p>`)
    if (drawdown) parts.push(`<p><strong>Drawdown :</strong> ${drawdown}</p>`)

    const content = parts.join('\n')

    const keyPoints: string[] = []
    if (totalPnl) keyPoints.push(`P&L: ${totalPnl}`)
    if (winRate) keyPoints.push(`Win Rate: ${winRate}`)
    if (profitFactor) keyPoints.push(`PF: ${profitFactor}`)
    if (totalTrades) keyPoints.push(`Trades: ${totalTrades}`)

    const pageTitle = symbol ? `Tradovate — ${symbol}` : 'Tradovate Stats'

    return {
      success: content.length >= 50,
      pageTitle,
      content,
      summary: keyPoints.join(' · ') || 'Tradovate',
      keyPoints,
      concepts: [],
      tags: ['tradovate', 'trading'],
      siteName: 'Tradovate',
      extras: { totalPnl, winRate, totalTrades, profitFactor, avgTrade, biggestWin, biggestLoss, drawdown, symbol, price }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const tradovateStrategy: SiteStrategy = {
  id: 'tradovate',
  label: 'Tradovate',
  match: (url: string) => /tradovate\.com/i.test(url),
  priority: 10,
  func: extractTradovate
}
