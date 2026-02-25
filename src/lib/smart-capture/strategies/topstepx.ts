import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * TopStepX /trade — context pack
 * Extracts top bar stats + symbol/chart info via innerText parsing
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepXTrade(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    const title = document.title || ''

    // Self-contained helper — must live inside func for executeScript injection
    const parseTopBar = (text: string): Record<string, string> => {
      const result: Record<string, string> = {}
      const patterns: [string, RegExp][] = [
        ['BAL',         /BAL[:\s]+\$?([\d,.]+)/i],
        ['MLL',         /MLL[:\s]+\$?([\d,.]+)/i],
        ['RPNL',        /R(?:P&L|PNL)[:\s]+\$?([\d,.]+)/i],        // RP&L: ou RPNL:
        ['UPNL',        /U(?:P&L|PNL)[:\s]+\$?([\d,.]+)/i],        // UP&L: ou UPNL:
        ['PDLL',        /PDLL[:\s]+\$?([\d,.]+)/i],                  // daily loss courant
        ['PDLL_LIMIT',  /PDLL[:\s]+\$?[\d,.]+\s+\$?([\d,.]+)/i],   // limite (2e valeur)
        ['PDPT',        /PDPT[:\s]+\$?([\d,.]+)/i],                  // daily profit courant
        ['PDPT_TARGET', /PDPT[:\s]+\$?[\d,.]+\s+\$?([\d,.]+)/i],   // target (2e valeur)
      ]
      for (const [key, regex] of patterns) {
        const m = text.match(regex)
        if (m) result[key] = `$${m[1]}`
      }
      return result
    }

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

    // --- Variation from page title (e.g. "MNQH26 $25,059.75 ▲ +1.20%") ---
    const varMatch = title.match(/[▼▲v]\s*([-+]?\d[\d.,]*%?)/)
    const changePct = varMatch?.[1] || ''

    // --- Account info from table ---
    const accounts: string[] = []
    const tableRows = document.querySelectorAll('table tbody tr')
    tableRows.forEach((row, i) => {
      if (i >= 5) return
      const cells = row.querySelectorAll('td')
      const rowText = Array.from(cells).map(c => c.textContent?.trim()).filter(Boolean).join(' | ')
      if (rowText.length > 10) accounts.push(rowText)
    })

    // Extract account name from active row cell[2] — handles custom names too
    // Prefer the active row whose balance matches the top bar BAL
    let accountName = ''
    const balNum = (topBar.BAL || '').replace(/[$,]/g, '')
    const allTableRows = Array.from(document.querySelectorAll('table tbody tr'))
    for (const row of allTableRows) {
      const cells = Array.from(row.querySelectorAll('td'))
      if (!/\bactive\b/i.test(cells[0]?.textContent || '')) continue
      if (balNum && (row.textContent || '').replace(/[$,]/g, '').includes(balNum)) {
        accountName = cells[2]?.textContent?.trim() || ''
        break
      }
      if (!accountName) accountName = cells[2]?.textContent?.trim() || ''
    }
    // Fallback: regex pattern for standard account names
    if (!accountName) accountName = bodyText.match(/\d+KTC-[-\w]+/)?.[0] || ''

    // --- Build content ---
    const parts: string[] = []
    parts.push('<p><strong>TopStepX — Trade</strong></p>')
    if (symbol) {
      const instrLine = [symbol, price ? `@ ${price}` : '', changePct ? `(${changePct})` : ''].filter(Boolean).join(' ')
      parts.push(`<p><strong>Instrument :</strong> ${instrLine}</p>`)
    }
    if (topBar.BAL)  parts.push(`<p><strong>Balance :</strong> ${topBar.BAL}</p>`)
    if (topBar.MLL)  parts.push(`<p><strong>Max Loss Limit :</strong> ${topBar.MLL}</p>`)
    if (topBar.RPNL) parts.push(`<p><strong>Realized P&L :</strong> ${topBar.RPNL}</p>`)
    if (topBar.UPNL) parts.push(`<p><strong>Unrealized P&L :</strong> ${topBar.UPNL}</p>`)
    if (topBar.PDLL_LIMIT) {
      parts.push(`<p><strong>Daily Loss :</strong> ${topBar.PDLL ?? '—'} / max ${topBar.PDLL_LIMIT}</p>`)
    } else if (topBar.PDLL) {
      parts.push(`<p><strong>Daily Loss :</strong> ${topBar.PDLL}</p>`)
    }
    if (topBar.PDPT_TARGET) {
      parts.push(`<p><strong>Daily Profit :</strong> ${topBar.PDPT ?? '—'} / target ${topBar.PDPT_TARGET}</p>`)
    } else if (topBar.PDPT) {
      parts.push(`<p><strong>Daily Profit :</strong> ${topBar.PDPT}</p>`)
    }
    if (accountName) parts.push(`<p><strong>Compte actif :</strong> ${accountName}</p>`)
    if (accounts.length > 0) {
      parts.push('<hr><p><strong>Comptes :</strong></p><ul>')
      accounts.forEach(a => parts.push(`<li>${a}</li>`))
      parts.push('</ul>')
    }

    const content = parts.join('\n')

    const keyPoints: string[] = [
      symbol && price ? `${symbol} @ ${price}${changePct ? ` (${changePct})` : ''}` : '',
      topBar.RPNL        ? `RP&L: ${topBar.RPNL}` : '',
      topBar.BAL         ? `BAL: ${topBar.BAL}` : '',
      topBar.MLL         ? `MLL: ${topBar.MLL}` : '',
      topBar.PDLL_LIMIT  ? `Daily Loss max: ${topBar.PDLL_LIMIT}` : '',
      topBar.PDPT_TARGET ? `Daily Profit target: ${topBar.PDPT_TARGET}` : '',
      accountName        ? `Compte: ${accountName}` : '',
    ].filter(Boolean) as string[]

    const titleParts = ['TopStepX']
    if (symbol) titleParts.push(symbol)
    if (price) titleParts.push(`@ ${price}`)
    if (changePct) titleParts.push(changePct)

    return {
      success: content.length >= 50,
      pageTitle: titleParts.join(' '),
      content,
      summary: keyPoints.join(' · ') || 'TopStepX Trade',
      keyPoints,
      concepts: [],
      tags: ['topstepx', 'trading', symbol.toLowerCase()].filter(Boolean),
      siteName: 'TopStepX',
      extras: { symbol, price, changePct, accountName, ...topBar, accounts }
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
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepXStats(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    // Normalize: collapse newlines to single spaces — TopStepX uses card layout
    // where label and value are on separate DOM lines in innerText
    const norm = bodyText.replace(/\n/g, ' ').replace(/ {2,}/g, ' ')

    // Self-contained helper — must live inside func for executeScript injection
    const parseTopBar = (text: string): Record<string, string> => {
      const result: Record<string, string> = {}
      const patterns: [string, RegExp][] = [
        ['BAL',         /BAL[:\s]+\$?([\d,.]+)/i],
        ['MLL',         /MLL[:\s]+\$?([\d,.]+)/i],
        ['RPNL',        /R(?:P&L|PNL)[:\s]+\$?([\d,.]+)/i],
        ['UPNL',        /U(?:P&L|PNL)[:\s]+\$?([\d,.]+)/i],
        ['PDLL',        /PDLL[:\s]+\$?([\d,.]+)/i],
        ['PDLL_LIMIT',  /PDLL[:\s]+\$?[\d,.]+\s+\$?([\d,.]+)/i],
        ['PDPT',        /PDPT[:\s]+\$?([\d,.]+)/i],
        ['PDPT_TARGET', /PDPT[:\s]+\$?[\d,.]+\s+\$?([\d,.]+)/i],
      ]
      for (const [key, regex] of patterns) {
        const m = text.match(regex)
        if (m) result[key] = `$${m[1]}`
      }
      return result
    }

    // Helper: extract value after label — uses norm (newlines collapsed) for card layouts
    const findValue = (pattern: RegExp): string => {
      const m = norm.match(pattern)
      return m ? m[1].trim() : ''
    }

    // --- Top bar stats ---
    const topBar = parseTopBar(bodyText)

    // --- KPIs — labels confirmed from real page innerText ---
    const totalPnl    = findValue(/Total P&L[^\d]*\$?([\d,.]+)/i)
    const tradeWinPct = findValue(/Trade Win\s*%[^\d]*([\d.]+\s*%?)/i)
    const dayWinPct   = findValue(/Day Win\s*%[^\d]*([\d.]+\s*%?)/i)
    const profitFactor = findValue(/Profit Factor[^\d]*([\d.]+)/i)
    // "Best Day % of Total Profit" is the real label (pattern already flexible enough)
    const bestDayPct  = findValue(/Best Day\s*%[^\d]*([\d.]+\s*%?)/i)

    // Avg Win / Avg Loss — combined label "Avg Win / Avg Loss"
    let avgWin = ''
    let avgLoss = ''
    const avgMatch = norm.match(/Avg Win\s*\/\s*Avg Loss[^$]*?\$?([\d,.]+)\s+\$?([\d,.]+)/i)
    if (avgMatch) {
      avgWin = `$${avgMatch[1]}`
      avgLoss = `$${avgMatch[2]}`
    }

    // "Total Number of Trades" — real label (not "Total Trades")
    const totalTrades = findValue(/Total Number of Trades[:\s]*([\d,]+)/i)

    // "Total Number of Lots Traded"
    const totalLots = findValue(/Total Number of Lots Traded[:\s]*([\d,.]+)/i)

    // "Most Profitable Day" — real label (not "Best Day")
    const bestDayAmt  = findValue(/Most Profitable Day[:\s]+[-$]*([\d,.]+)/i)

    // "Least Profitable Day" — real label (not "Worst Day")
    const worstDayAmt = findValue(/Least Profitable Day[:\s]+[-$]*([\d,.]+)/i)

    // "Average Trade Duration" — real label. Format: "0 sec" | "9 min 24 sec" | "21 mins"
    const avgHoldTime = findValue(/Average Trade Duration[:\s]*([\d]+\s*(?:min[s]?(?:\s+[\d]+\s*sec[s]?)?|sec[s]?))/i)

    // "Most Active Day" — real label (not "Most Traded / Best Day of Week")
    const topDayMatch = norm.match(/Most Active Day[:\s]+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i)
    const mostTradedDay = topDayMatch?.[1] || ''

    // Commissions paid
    const commissions = findValue(/Commissions?[:\s]+\$?([\d,.]+)/i)

    // Account code (50KTC-V2-...)
    const accountMatch = bodyText.match(/(\d+KTC[-\w]+)/i)
    const accountName = accountMatch ? accountMatch[1].trim() : ''

    // Custom display name: "$50K TRADING COMBINE|Pop Smoke (50KTC...)" → "Pop Smoke"
    const customNameMatch = bodyText.match(/\|([^|()\n]+?)\s*\([\d]+KTC/)
    const customName = customNameMatch?.[1]?.trim() || ''

    // Date range — 3-step approach:
    // 1. DOM: active period button (aria-current / aria-selected / class)
    // 2. DOM: any leaf element showing "MM/DD/YYYY – MM/DD/YYYY" format
    // 3. innerText fallback with broad Unicode dash match
    let dateRange = ''
    const periodBtns = Array.from(document.querySelectorAll('button'))
      .filter(btn => /^(TODAY|LAST WEEK|LAST MONTH|THIS WEEK|THIS MONTH)$/i.test(btn.textContent?.trim() || ''))
    const activeBtn = periodBtns.find(btn =>
      btn.getAttribute('aria-current') === 'true' ||
      btn.getAttribute('aria-selected') === 'true' ||
      btn.getAttribute('data-active') === 'true' ||
      /\bactive\b|\bselected\b|\bcurrent\b/i.test(btn.className)
    )
    if (activeBtn) dateRange = activeBtn.textContent?.trim() || ''
    if (!dateRange) {
      const allEls = Array.from(document.querySelectorAll('input, span, div, p'))
      for (const el of allEls) {
        if (el.children.length > 0) continue
        const t = (el as HTMLInputElement).value || el.textContent || ''
        if (/\d{1,2}\/\d{1,2}\/\d{4}.{1,5}\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) {
          dateRange = t.trim()
          break
        }
      }
    }
    if (!dateRange) {
      const m = norm.match(/([\d]{1,2}\/[\d]{1,2}\/[\d]{4}[\s\S]{1,5}[\d]{1,2}\/[\d]{1,2}\/[\d]{4})/)
      if (m) dateRange = m[1].trim()
    }

    // --- Build content ---
    const parts: string[] = []
    parts.push('<p><strong>TopStepX — Statistiques</strong></p>')
    if (accountName) {
      const accountDisplay = customName ? `${accountName} (${customName})` : accountName
      parts.push(`<p><strong>Compte :</strong> ${accountDisplay}</p>`)
    }
    if (dateRange) parts.push(`<p><strong>Période :</strong> ${dateRange}</p>`)
    if (topBar.BAL) parts.push(`<p><strong>Balance :</strong> ${topBar.BAL}</p>`)
    if (topBar.RPNL) parts.push(`<p><strong>RPNL :</strong> ${topBar.RPNL}</p>`)
    if (totalPnl) parts.push(`<p><strong>Total P&amp;L :</strong> $${totalPnl}</p>`)
    if (tradeWinPct) parts.push(`<p><strong>Trade Win % :</strong> ${tradeWinPct}</p>`)
    if (dayWinPct) parts.push(`<p><strong>Day Win % :</strong> ${dayWinPct}</p>`)
    if (profitFactor) parts.push(`<p><strong>Profit Factor :</strong> ${profitFactor}</p>`)
    if (avgWin) parts.push(`<p><strong>Avg Win :</strong> ${avgWin}</p>`)
    if (avgLoss) parts.push(`<p><strong>Avg Loss :</strong> ${avgLoss}</p>`)
    if (bestDayPct) parts.push(`<p><strong>Best Day % :</strong> ${bestDayPct}</p>`)
    if (bestDayAmt) parts.push(`<p><strong>Best Day :</strong> $${bestDayAmt}</p>`)
    if (worstDayAmt) parts.push(`<p><strong>Worst Day :</strong> -$${worstDayAmt}</p>`)
    if (totalTrades) parts.push(`<p><strong>Total Trades :</strong> ${totalTrades}</p>`)
    if (totalLots) parts.push(`<p><strong>Total Lots :</strong> ${totalLots}</p>`)
    if (avgHoldTime) parts.push(`<p><strong>Avg Hold Time :</strong> ${avgHoldTime}</p>`)
    if (mostTradedDay) parts.push(`<p><strong>Jour dominant :</strong> ${mostTradedDay}</p>`)
    if (commissions) parts.push(`<p><strong>Commissions :</strong> $${commissions}</p>`)
    if (topBar.MLL) parts.push(`<p><strong>Max Loss Limit :</strong> ${topBar.MLL}</p>`)

    const content = parts.join('\n')

    const keyPoints: string[] = []
    if (totalPnl) keyPoints.push(`Total P&L: $${totalPnl}`)
    if (tradeWinPct) keyPoints.push(`Trade Win: ${tradeWinPct}`)
    if (profitFactor) keyPoints.push(`PF: ${profitFactor}`)
    if (dayWinPct) keyPoints.push(`Day Win: ${dayWinPct}`)
    if (avgWin && avgLoss) keyPoints.push(`Avg Win/Loss: ${avgWin} / ${avgLoss}`)
    if (totalTrades) keyPoints.push(`Trades: ${totalTrades}`)
    if (bestDayAmt) keyPoints.push(`Best day: $${bestDayAmt}`)
    if (worstDayAmt) keyPoints.push(`Worst day: -$${worstDayAmt}`)
    if (avgHoldTime) keyPoints.push(`Avg hold: ${avgHoldTime}`)
    if (topBar.BAL) keyPoints.push(`Balance: ${topBar.BAL}`)

    const pageTitle = [
      'TopStepX Stats',
      customName || accountName,
      dateRange,
    ].filter(Boolean).join(' — ')

    const accountLabel = customName || accountName
    const summaryPrefix = [accountLabel, dateRange].filter(Boolean).join(' · ')
    const statsLine = keyPoints.slice(0, 4).join(' · ')
    const summary = summaryPrefix
      ? `${summaryPrefix} | ${statsLine}`
      : statsLine || 'TopStepX Stats'

    return {
      success: content.length >= 50,
      pageTitle,
      content,
      summary,
      keyPoints,
      concepts: [],
      tags: ['topstepx', 'stats', 'prop-firm'],
      siteName: 'TopStepX',
      extras: {
        accountName, customName, dateRange,
        totalPnl, tradeWinPct, dayWinPct, profitFactor,
        avgWin, avgLoss, bestDayPct,
        totalTrades, totalLots, bestDayAmt, worstDayAmt, avgHoldTime, mostTradedDay, commissions,
        ...topBar
      }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const topStepXTradeStrategy: SiteStrategy = {
  id: 'topstepx-trade',
  label: 'TopStepX Trade',
  // Priorité 20 — plus haute que les autres pour les pages /trade
  match: (url: string) => /topstepx\./i.test(url) && /\/trade/i.test(url),
  priority: 20,
  func: extractTopStepXTrade
}

export const topStepXStatsStrategy: SiteStrategy = {
  id: 'topstepx-stats',
  label: 'TopStepX Stats',
  // Priorité 20 — plus haute que les autres pour les pages /stats
  match: (url: string) => /topstepx\./i.test(url) && /\/stats/i.test(url),
  priority: 20,
  func: extractTopStepXStats
}

/**
 * TopStepX catch-all — autres pages (dashboard, account, etc.)
 * Tente d'extraire le top bar (BAL/RPNL/MLL) qui est présent sur toutes les pages.
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepXGeneric(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''

    // Self-contained helper — must live inside func for executeScript injection
    const parseTopBar = (text: string): Record<string, string> => {
      const result: Record<string, string> = {}
      const patterns: [string, RegExp][] = [
        ['BAL',         /BAL[:\s]+\$?([\d,.]+)/i],
        ['MLL',         /MLL[:\s]+\$?([\d,.]+)/i],
        ['RPNL',        /R(?:P&L|PNL)[:\s]+\$?([\d,.]+)/i],
        ['UPNL',        /U(?:P&L|PNL)[:\s]+\$?([\d,.]+)/i],
        ['PDLL',        /PDLL[:\s]+\$?([\d,.]+)/i],
        ['PDLL_LIMIT',  /PDLL[:\s]+\$?[\d,.]+\s+\$?([\d,.]+)/i],
        ['PDPT',        /PDPT[:\s]+\$?([\d,.]+)/i],
        ['PDPT_TARGET', /PDPT[:\s]+\$?[\d,.]+\s+\$?([\d,.]+)/i],
      ]
      for (const [key, regex] of patterns) {
        const m = text.match(regex)
        if (m) result[key] = `$${m[1]}`
      }
      return result
    }

    const topBar = parseTopBar(bodyText)
    const url = window.location.pathname

    const parts: string[] = []
    parts.push(`<p><strong>TopStepX</strong> — ${url}</p>`)
    if (topBar.BAL) parts.push(`<p><strong>Balance :</strong> ${topBar.BAL}</p>`)
    if (topBar.RPNL) parts.push(`<p><strong>Realized P&L :</strong> ${topBar.RPNL}</p>`)
    if (topBar.MLL) parts.push(`<p><strong>Max Loss Limit :</strong> ${topBar.MLL}</p>`)
    if (topBar.UPNL) parts.push(`<p><strong>Unrealized P&L :</strong> ${topBar.UPNL}</p>`)

    const content = parts.join('\n')
    const keyPoints = [
      topBar.BAL ? `Balance: ${topBar.BAL}` : '',
      topBar.RPNL ? `RPNL: ${topBar.RPNL}` : '',
    ].filter(Boolean)

    return {
      success: content.length >= 50,
      pageTitle: 'TopStepX',
      content,
      summary: keyPoints.join(' · ') || 'TopStepX',
      keyPoints,
      concepts: [],
      tags: ['topstepx', 'prop-firm'],
      siteName: 'TopStepX',
      extras: { ...topBar }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const topStepXGenericStrategy: SiteStrategy = {
  id: 'topstepx-generic',
  label: 'TopStepX',
  // Priorité 5 — en-dessous des stratégies spécifiques /trade et /stats
  match: (url: string) => /topstepx\./i.test(url),
  priority: 5,
  func: extractTopStepXGeneric
}
