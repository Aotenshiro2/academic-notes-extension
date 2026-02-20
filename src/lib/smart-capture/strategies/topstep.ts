import type { SiteStrategy, SiteExtractResult } from '../types'

function extractTopStepDashboard(): SiteExtractResult {
  try {
    // Nom / type de compte
    const accountName =
      document.querySelector('[class*="accountName"]')?.textContent?.trim() ||
      document.querySelector('[class*="AccountName"]')?.textContent?.trim() ||
      document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('[class*="account-title"]')?.textContent?.trim() ||
      ''

    // Helper : cherche une valeur par label text
    const findByLabel = (labels: string[]): string => {
      for (const label of labels) {
        const els = document.querySelectorAll('span, div, td, p, dt, dd, label')
        for (const el of els) {
          const text = el.textContent?.trim().toLowerCase() || ''
          if (text === label.toLowerCase() || text.startsWith(label.toLowerCase())) {
            const next = el.nextElementSibling
            if (next?.textContent?.trim()) return next.textContent.trim()
            const parent = el.parentElement
            const value = parent?.querySelector('[class*="value"], [class*="Value"], [class*="amount"], [class*="Amount"], span:last-child, div:last-child')
            if (value?.textContent?.trim() && value !== el) return value.textContent.trim()
          }
        }
      }
      return ''
    }

    // P&L du jour
    const pnl = findByLabel(['P&L', 'PnL', 'Profit', 'Daily P&L', 'Net P&L', 'Today'])

    // Solde / Balance
    const balance = findByLabel(['Balance', 'Account Balance', 'Solde', 'Equity'])

    // Drawdown
    const drawdown = findByLabel(['Drawdown', 'Max Drawdown', 'Trailing Drawdown'])

    // Max Loss restant
    const maxLoss = findByLabel(['Max Loss', 'Loss Limit', 'Daily Loss Limit', 'Max Daily Loss'])

    // Compliance / statut
    const compliance = findByLabel(['Compliance', 'Status', 'Account Status', 'Trading Status'])

    // Trades récents — cherche un tableau
    const trades: string[] = []
    const tableRows = document.querySelectorAll('table tbody tr, [class*="trade-row"], [class*="TradeRow"]')
    tableRows.forEach((row, i) => {
      if (i >= 5) return
      const cells = row.querySelectorAll('td, [class*="cell"]')
      const rowText = Array.from(cells).map(c => c.textContent?.trim()).filter(Boolean).join(' | ')
      if (rowText.length > 5) trades.push(rowText)
    })

    // Construire contenu HTML
    const parts: string[] = []
    if (accountName) parts.push(`<p><strong>Compte :</strong> ${accountName}</p>`)
    if (pnl) parts.push(`<p><strong>P&L :</strong> ${pnl}</p>`)
    if (balance) parts.push(`<p><strong>Solde :</strong> ${balance}</p>`)
    if (drawdown) parts.push(`<p><strong>Drawdown :</strong> ${drawdown}</p>`)
    if (maxLoss) parts.push(`<p><strong>Max Loss :</strong> ${maxLoss}</p>`)
    if (compliance) parts.push(`<p><strong>Compliance :</strong> ${compliance}</p>`)
    if (trades.length > 0) {
      parts.push('<hr><p><strong>Trades récents :</strong></p><ul>')
      trades.forEach(t => parts.push(`<li>${t}</li>`))
      parts.push('</ul>')
    }

    const content = parts.join('\n')

    // Key points
    const keyPoints: string[] = []
    if (pnl) keyPoints.push(`P&L: ${pnl}`)
    if (balance) keyPoints.push(`Solde: ${balance}`)
    if (drawdown) keyPoints.push(`Drawdown: ${drawdown}`)
    if (maxLoss) keyPoints.push(`Max Loss: ${maxLoss}`)
    if (compliance) keyPoints.push(`Compliance: ${compliance}`)

    const pageTitle = accountName ? `TopStep — ${accountName}` : 'TopStep Dashboard'
    const summary = keyPoints.length > 0 ? keyPoints.join(' · ') : 'TopStep Dashboard'

    return {
      success: content.length >= 50,
      pageTitle,
      content,
      summary,
      keyPoints,
      concepts: [],
      tags: ['topstep', 'prop-firm'],
      siteName: 'TopStep',
      extras: { accountName, pnl, balance, drawdown, maxLoss, compliance, trades }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const topStepStrategy: SiteStrategy = {
  id: 'topstep',
  label: 'TopStep Dashboard',
  match: (url: string) => /topstep\.com/i.test(url) && !/topstepx\./i.test(url),
  priority: 10,
  func: extractTopStepDashboard
}
