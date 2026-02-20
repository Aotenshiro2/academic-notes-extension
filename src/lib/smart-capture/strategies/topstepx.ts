import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * Helper: extract key=value pairs from the TopStepX top bar
 * Visible as: "BAL: $49,365.82  MLL: $48,000.00  RPNL: $1,178.64  UPNL: $0.00  PROLL: $0.00"
 */
function parseTopBar(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const patterns = [
    ['BAL', /BAL[:\s]*\$?([\d,.]+)/i],
    ['MLL', /MLL[:\s]*\$?([\d,.]+)/i],
    ['RPNL', /RPNL[:\s]*\$?([\d,.]+)/i],
    ['UPNL', /UPNL[:\s]*\$?([\d,.]+)/i],
    ['PROLL', /PROLL[:\s]*\$?([\d,.]+)/i],
    ['PROPT', /PROPT[:\s]*\$?([\d,.]+)/i],
  ] as const
  for (const [key, regex] of patterns) {
    const m = text.match(regex)
    if (m) result[key] = `$${m[1]}`
  }
  return result
}

/**
 * TopStepX /trade — context pack
 * Extracts top bar stats + symbol/chart info via innerText parsing
 */
function extractTopStepXTrade(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    const title = document.title || ''

    // --- Top bar stats via regex on innerText ---
    const topBar = parseTopBar(bodyText)

    // --- Symbol from chart ---
    // Visible as "CL /MNQ" or "MNQH26 - 30s" in the chart header
    let symbol = ''
    // Try DOM selectors first
    symbol =
      document.querySelector('[class*="symbol"]')?.textContent?.trim() ||
      document.querySelector('[class*="Symbol"]')?.textContent?.trim() ||
      ''

    // Fallback: parse from innerText — look for futures patterns
    if (!symbol) {
      const symMatch = bodyText.match(/\b((?:MNQ|NQ|ES|MES|CL|GC|SI|YM|MYM|RTY|M2K|ZB|ZN|6E|6J|6B|HG)[A-Z]?\d{2})\b/)
      if (symMatch) symbol = symMatch[1]
    }
    if (!symbol) {
      const symMatch2 = bodyText.match(/\b(NQ|ES|CL|GC|MNQ|MES|YM|RTY|M2K)(?:\s*[!/]|\b)/i)
      if (symMatch2) symbol = symMatch2[1].toUpperCase()
    }
    // Last resort: title
    if (!symbol) {
      const m = title.match(/([A-Z]{2,6}(?:\d{2})?[!]?)/)
      if (m) symbol = m[1]
    }

    // --- Price from chart or innerText ---
    let price = ''
    price =
      document.querySelector('[class*="lastPrice"]')?.textContent?.trim() ||
      document.querySelector('[class*="LastPrice"]')?.textContent?.trim() ||
      ''
    // Fallback: look for price pattern near symbol in innerText
    if (!price && symbol) {
      const priceRegex = new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\d]*(\\$?[\\d,.]+\\.\\d{2})')
      const m = bodyText.match(priceRegex)
      if (m) price = m[1]
    }

    // --- Account info from table ---
    const accounts: string[] = []
    const tableRows = document.querySelectorAll('table tbody tr')
    tableRows.forEach((row, i) => {
      if (i >= 5) return
      const cells = row.querySelectorAll('td')
      const rowText = Array.from(cells).map(c => c.textContent?.trim()).filter(Boolean).join(' | ')
      if (rowText.length > 10) accounts.push(rowText)
    })

    // --- Build content ---
    const parts: string[] = []
    parts.push('<p><strong>TopStepX — Trade</strong></p>')
    if (symbol) parts.push(`<p><strong>Symbole :</strong> ${symbol}</p>`)
    if (price) parts.push(`<p><strong>Prix :</strong> ${price}</p>`)
    if (topBar.BAL) parts.push(`<p><strong>Balance :</strong> ${topBar.BAL}</p>`)
    if (topBar.MLL) parts.push(`<p><strong>Max Loss Limit :</strong> ${topBar.MLL}</p>`)
    if (topBar.RPNL) parts.push(`<p><strong>Realized P&L :</strong> ${topBar.RPNL}</p>`)
    if (topBar.UPNL) parts.push(`<p><strong>Unrealized P&L :</strong> ${topBar.UPNL}</p>`)
    if (topBar.PROPT) parts.push(`<p><strong>Profit Target :</strong> ${topBar.PROPT}</p>`)
    if (accounts.length > 0) {
      parts.push('<hr><p><strong>Comptes :</strong></p><ul>')
      accounts.forEach(a => parts.push(`<li>${a}</li>`))
      parts.push('</ul>')
    }

    const content = parts.join('\n')

    const keyPoints: string[] = []
    if (symbol && price) keyPoints.push(`${symbol} @ ${price}`)
    if (topBar.RPNL) keyPoints.push(`Realized P&L: ${topBar.RPNL}`)
    if (topBar.BAL) keyPoints.push(`Balance: ${topBar.BAL}`)
    if (topBar.MLL) keyPoints.push(`Max Loss: ${topBar.MLL}`)

    const titleParts = ['TopStepX']
    if (symbol) titleParts.push(symbol)
    if (price) titleParts.push(`@ ${price}`)

    return {
      success: content.length >= 50,
      pageTitle: titleParts.join(' '),
      content,
      summary: keyPoints.join(' · ') || 'TopStepX Trade',
      keyPoints,
      concepts: [],
      tags: ['topstepx', 'trading', symbol.toLowerCase()].filter(Boolean),
      siteName: 'TopStepX',
      extras: { symbol, price, ...topBar, accounts }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/**
 * TopStepX /stats — KPIs étudiants
 * Uses innerText regex with exact labels from the actual UI:
 * "Total PNL", "Trade Win %", "Day Win %", "Profit Factor",
 * "Avg Win / Avg Loss", "Best Day % of Total Profit"
 */
function extractTopStepXStats(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''

    // Helper: extract value after label in innerText
    const findValue = (pattern: RegExp): string => {
      const m = bodyText.match(pattern)
      return m ? m[1].trim() : ''
    }

    // --- Top bar stats ---
    const topBar = parseTopBar(bodyText)

    // --- KPIs with exact label patterns from the real UI ---
    const totalPnl = findValue(/Total (?:PNL|P&?L|Pnl)[^\n$]*?\$?([\d,.]+)/i)
    const tradeWinPct = findValue(/Trade Win\s*%[^\d]*([\d.]+\s*%?)/i)
    const dayWinPct = findValue(/Day Win\s*%[^\d]*([\d.]+\s*%?)/i)
    const profitFactor = findValue(/Profit Factor[^\d]*([\d.]+)/i)
    const bestDayPct = findValue(/Best Day\s*%[^\d]*([\d.]+\s*%?)/i)

    // Avg Win / Avg Loss — combined in one block
    let avgWin = ''
    let avgLoss = ''
    const avgMatch = bodyText.match(/Avg Win\s*\/\s*Avg Loss[^\n$]*?\$?([\d,.]+)\s+\$?([\d,.]+)/i)
    if (avgMatch) {
      avgWin = `$${avgMatch[1]}`
      avgLoss = `$${avgMatch[2]}`
    }

    // Account name
    const accountMatch = bodyText.match(/(\d+KTC[-\w]+)/i) || bodyText.match(/([\dK]+\s*TRADING\s*COMBINE[^\n]*)/i)
    const accountName = accountMatch ? accountMatch[1].trim() : ''

    // Date range
    const dateRange = findValue(/Date Range[^\n]*([\d/.-]+\s*[-–]\s*[\d/.-]+)/i) ||
                      findValue(/([\d]{2}\/[\d]{2}\/[\d]{4}\s*[-–]\s*[\d]{2}\/[\d]{2}\/[\d]{4})/i)

    // --- Build content ---
    const parts: string[] = []
    parts.push('<p><strong>TopStepX — Statistiques</strong></p>')
    if (accountName) parts.push(`<p><strong>Compte :</strong> ${accountName}</p>`)
    if (dateRange) parts.push(`<p><strong>Période :</strong> ${dateRange}</p>`)
    if (topBar.BAL) parts.push(`<p><strong>Balance :</strong> ${topBar.BAL}</p>`)
    if (topBar.RPNL) parts.push(`<p><strong>RPNL :</strong> ${topBar.RPNL}</p>`)
    if (totalPnl) parts.push(`<p><strong>Total PNL :</strong> $${totalPnl}</p>`)
    if (tradeWinPct) parts.push(`<p><strong>Trade Win % :</strong> ${tradeWinPct}</p>`)
    if (dayWinPct) parts.push(`<p><strong>Day Win % :</strong> ${dayWinPct}</p>`)
    if (profitFactor) parts.push(`<p><strong>Profit Factor :</strong> ${profitFactor}</p>`)
    if (avgWin) parts.push(`<p><strong>Avg Win :</strong> ${avgWin}</p>`)
    if (avgLoss) parts.push(`<p><strong>Avg Loss :</strong> ${avgLoss}</p>`)
    if (bestDayPct) parts.push(`<p><strong>Best Day % :</strong> ${bestDayPct}</p>`)
    if (topBar.MLL) parts.push(`<p><strong>Max Loss Limit :</strong> ${topBar.MLL}</p>`)

    const content = parts.join('\n')

    const keyPoints: string[] = []
    if (totalPnl) keyPoints.push(`Total PNL: $${totalPnl}`)
    if (tradeWinPct) keyPoints.push(`Trade Win: ${tradeWinPct}`)
    if (profitFactor) keyPoints.push(`PF: ${profitFactor}`)
    if (dayWinPct) keyPoints.push(`Day Win: ${dayWinPct}`)
    if (avgWin && avgLoss) keyPoints.push(`Avg Win/Loss: ${avgWin} / ${avgLoss}`)
    if (topBar.BAL) keyPoints.push(`Balance: ${topBar.BAL}`)

    return {
      success: content.length >= 50,
      pageTitle: accountName ? `TopStepX Stats — ${accountName}` : 'TopStepX — Stats',
      content,
      summary: keyPoints.slice(0, 4).join(' · ') || 'TopStepX Stats',
      keyPoints,
      concepts: [],
      tags: ['topstepx', 'stats', 'prop-firm'],
      siteName: 'TopStepX',
      extras: { accountName, dateRange, totalPnl, tradeWinPct, dayWinPct, profitFactor, avgWin, avgLoss, bestDayPct, ...topBar }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const topStepXTradeStrategy: SiteStrategy = {
  id: 'topstepx-trade',
  label: 'TopStepX Trade',
  match: (url: string) => /topstepx\./i.test(url) && /\/trade/i.test(url),
  priority: 20,
  func: extractTopStepXTrade
}

export const topStepXStatsStrategy: SiteStrategy = {
  id: 'topstepx-stats',
  label: 'TopStepX Stats',
  match: (url: string) => /topstepx\./i.test(url) && /\/stats/i.test(url),
  priority: 20,
  func: extractTopStepXStats
}
