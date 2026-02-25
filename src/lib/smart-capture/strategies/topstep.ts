import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * TopStep.com /dashboard/default — KPIs principaux
 * Balance (top nav), Path to Funding, Daily Loss Limit, Performance Tracker
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepDashboard(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    const norm = bodyText.replace(/\n/g, ' ').replace(/ {2,}/g, ' ')

    // Self-contained helper
    const findValue = (pattern: RegExp): string => {
      const m = norm.match(pattern)
      return m ? m[1].trim() : ''
    }

    // Account code (ex: 50KTC-V2-47091-50191975)
    const accountCode = bodyText.match(/(\d+KTC-[-\w]+)/)?.[1] || ''

    // Balance from top nav — "Account Balance: $49,465.60"
    const balance = findValue(/Account Balance[:\s$]*([\d,.]+)/i)

    // PATH TO FUNDING — Maximum Loss Limit
    const mll = findValue(/Maximum Loss Limit[:\s]*\$?([\d,.]+)/i)

    // OBJECTIVES — Profit Target (ex: "Profit Target ... $3,000")
    const profitTarget = findValue(/Profit Target[^$\d]*\$?([\d,.]+)/i)

    // PERSONAL RISK MANAGEMENT — Daily Loss Limit (POLL)
    const dll = findValue(/Daily Loss Limit[^$\d]*([\d,.]+)/i)

    // Consistency Target %
    const consistencyPct = findValue(/Consistency Target[^%]*([\d.]+)\s*%/i)

    // TOPSTEP TRADER PERFORMANCE TRACKER
    const winRate = findValue(/Win Rate[^\d]*([\d.]+)\s*%/i)
    const avgWin  = findValue(/Avg Winning Trade[:\s$]*([\d,.]+)/i)
    const avgLoss = findValue(/Avg Losing Trade[:\s$]*([\d,.]+)/i)

    // Build content
    const parts: string[] = []
    parts.push('<p><strong>TopStep — Dashboard</strong></p>')
    if (accountCode)    parts.push(`<p><strong>Compte :</strong> ${accountCode}</p>`)
    if (balance)        parts.push(`<p><strong>Account Balance :</strong> $${balance}</p>`)
    if (mll)            parts.push(`<p><strong>Maximum Loss Limit :</strong> $${mll}</p>`)
    if (dll)            parts.push(`<p><strong>Daily Loss Limit :</strong> $${dll}</p>`)
    if (profitTarget)   parts.push(`<p><strong>Profit Target :</strong> $${profitTarget}</p>`)
    if (consistencyPct) parts.push(`<p><strong>Consistency Target :</strong> ${consistencyPct}%</p>`)
    if (winRate)        parts.push(`<p><strong>Win Rate :</strong> ${winRate}%</p>`)
    if (avgWin)         parts.push(`<p><strong>Avg Winning Trade :</strong> $${avgWin}</p>`)
    if (avgLoss)        parts.push(`<p><strong>Avg Losing Trade :</strong> $${avgLoss}</p>`)

    const content = parts.join('\n')

    const keyPoints: string[] = [
      balance        ? `Balance: $${balance}` : '',
      mll            ? `MLL: $${mll}` : '',
      dll            ? `DLL: $${dll}` : '',
      profitTarget   ? `Target: $${profitTarget}` : '',
      winRate        ? `Win Rate: ${winRate}%` : '',
      avgWin && avgLoss ? `Avg Win/Loss: $${avgWin} / $${avgLoss}` : '',
    ].filter(Boolean) as string[]

    const pageTitle = accountCode
      ? `TopStep — ${accountCode}`
      : 'TopStep Dashboard'

    return {
      success: content.length >= 50,
      pageTitle,
      content,
      summary: [accountCode, ...keyPoints.slice(0, 3)].filter(Boolean).join(' · ') || 'TopStep Dashboard',
      keyPoints,
      concepts: [],
      tags: ['topstep', 'prop-firm', 'dashboard'],
      siteName: 'TopStep',
      extras: { accountCode, balance, mll, dll, profitTarget, consistencyPct, winRate, avgWin, avgLoss }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/**
 * TopStep.com /dashboard/accounts — liste des comptes trading
 * Table : START DATE | NAME | BUYING POWER | TYPE | SUB ID | BALANCE | STATUS | STAGE
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepAccounts(): SiteExtractResult {
  try {
    const rows: string[] = []
    let activeCount = 0
    let evalCount = 0

    const tableRows = document.querySelectorAll('table tbody tr')
    tableRows.forEach((row, i) => {
      if (i >= 15) return
      const cells = Array.from(row.querySelectorAll('td'))
      if (cells.length < 6) return
      // 0=date, 1=name, 2=buyingPower, 3=type, 4=subId, 5=balance, 6=status, 7=stage
      const name    = cells[1]?.textContent?.trim() || ''
      const balance = cells[5]?.textContent?.trim() || ''
      const status  = cells[6]?.textContent?.trim() || ''
      const stage   = cells[7]?.textContent?.trim() || ''
      if (!name) return
      rows.push(`${name} | ${balance} | ${status} | ${stage}`)
      if (/active/i.test(status)) activeCount++
      if (/evaluation/i.test(stage)) evalCount++
    })

    const parts: string[] = []
    parts.push('<p><strong>TopStep — Comptes</strong></p>')
    if (rows.length > 0) {
      parts.push('<ul>')
      rows.forEach(r => parts.push(`<li>${r}</li>`))
      parts.push('</ul>')
    }

    const content = parts.join('\n')

    const keyPoints: string[] = [
      rows.length > 0 ? `${rows.length} compte(s)` : '',
      activeCount > 0 ? `${activeCount} actif(s)` : '',
      evalCount > 0   ? `${evalCount} en évaluation` : '',
    ].filter(Boolean) as string[]

    const firstBalMatch = rows[0]?.match(/\$([\d,.]+)/)
    const balStr = firstBalMatch ? ` · $${firstBalMatch[1]}` : ''

    return {
      success: rows.length > 0,
      pageTitle: 'TopStep — Comptes',
      content,
      summary: `${rows.length} compte(s)${balStr}` || 'TopStep Accounts',
      keyPoints,
      concepts: [],
      tags: ['topstep', 'accounts', 'prop-firm'],
      siteName: 'TopStep',
      extras: { rows, activeCount, evalCount }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/**
 * TopStep.com /dashboard/profile/billing — achats & abonnements
 * Section Purchases : DATE | AMOUNT | TYPE | REFERENCE
 * Section Subscriptions : STATUS | MONTHLY PRICE | STARTING DATE | NEXT RENEW
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepBilling(): SiteExtractResult {
  try {
    const purchases: string[] = []
    const subs: string[] = []
    let lastAmount = ''

    const tables = document.querySelectorAll('table')
    tables.forEach((table) => {
      const rows = table.querySelectorAll('tbody tr')
      rows.forEach((row, i) => {
        if (i >= 12) return
        const cells = Array.from(row.querySelectorAll('td'))
        if (cells.length < 2) return

        const col0 = cells[0]?.textContent?.trim() || ''
        const col1 = cells[1]?.textContent?.trim() || ''
        const col2 = cells[2]?.textContent?.trim() || ''
        const col3 = cells[3]?.textContent?.trim() || ''

        // Purchases row: col1 contains "$XX.XX"
        if (/\$[\d,.]+/.test(col1) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(col0)) {
          purchases.push(`${col0} | ${col1} | ${col2}`)
          if (!lastAmount) lastAmount = col1
          return
        }

        // Subscriptions row: col0 = Active/Cancelled, col1 = monthly price, col3 = next renew
        if (/active|cancelled/i.test(col0) && /\$[\d,.]+/.test(col1)) {
          subs.push(`${col0} | ${col1}/mois | renouvellement: ${col3}`)
        }
      })
    })

    const parts: string[] = []
    parts.push('<p><strong>TopStep — Billing</strong></p>')
    if (purchases.length > 0) {
      parts.push('<p><strong>Achats récents :</strong></p><ul>')
      purchases.slice(0, 8).forEach(p => parts.push(`<li>${p}</li>`))
      parts.push('</ul>')
    }
    if (subs.length > 0) {
      parts.push('<p><strong>Abonnements :</strong></p><ul>')
      subs.forEach(s => parts.push(`<li>${s}</li>`))
      parts.push('</ul>')
    }

    const content = parts.join('\n')

    const keyPoints: string[] = [
      purchases.length > 0 ? `${purchases.length} achat(s)` : '',
      lastAmount ? `Dernier: ${lastAmount}` : '',
      subs.length > 0 ? `${subs.length} abonnement(s)` : '',
    ].filter(Boolean) as string[]

    return {
      success: purchases.length > 0 || subs.length > 0,
      pageTitle: 'TopStep — Billing',
      content,
      summary: keyPoints.join(' · ') || 'TopStep Billing',
      keyPoints,
      concepts: [],
      tags: ['topstep', 'billing', 'subscription'],
      siteName: 'TopStep',
      extras: { purchases, subs, lastAmount }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/**
 * TopStep.com /dashboard/payouts — historique des payouts
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepPayouts(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    const norm = bodyText.replace(/\n/g, ' ').replace(/ {2,}/g, ' ')

    const payouts: string[] = []
    let totalPaid = 0

    const tableRows = document.querySelectorAll('table tbody tr')
    tableRows.forEach((row, i) => {
      if (i >= 20) return
      const cells = Array.from(row.querySelectorAll('td'))
      if (cells.length < 2) return
      const rowText = Array.from(cells).map(c => c.textContent?.trim()).filter(Boolean).join(' | ')
      if (rowText.length < 5) return
      payouts.push(rowText)
      const amtMatch = rowText.match(/\$\s*([\d,.]+)/)
      if (amtMatch) totalPaid += parseFloat(amtMatch[1].replace(/,/g, ''))
    })

    // Fallback: regex on norm when table not found
    if (payouts.length === 0) {
      const matches = Array.from(norm.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})[^$]*\$([\d,.]+)/g))
      matches.slice(0, 10).forEach(m => {
        payouts.push(`${m[1]} | $${m[2]}`)
        totalPaid += parseFloat(m[2].replace(/,/g, ''))
      })
    }

    const totalStr = totalPaid > 0
      ? `$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : ''

    const parts: string[] = []
    parts.push('<p><strong>TopStep — Payouts</strong></p>')
    if (totalStr) parts.push(`<p><strong>Total reçu :</strong> ${totalStr}</p>`)
    if (payouts.length > 0) {
      parts.push('<ul>')
      payouts.forEach(p => parts.push(`<li>${p}</li>`))
      parts.push('</ul>')
    }

    const content = parts.join('\n')

    const keyPoints: string[] = [
      payouts.length > 0 ? `${payouts.length} payout(s)` : '',
      totalStr ? `Total: ${totalStr}` : '',
    ].filter(Boolean) as string[]

    return {
      success: payouts.length > 0,
      pageTitle: 'TopStep — Payouts',
      content,
      summary: keyPoints.join(' · ') || 'TopStep Payouts',
      keyPoints,
      concepts: [],
      tags: ['topstep', 'payout', 'prop-firm'],
      siteName: 'TopStep',
      extras: { payouts, totalPaid }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

/**
 * TopStep.com catch-all — toutes les autres pages
 * Tente d'extraire la balance et l'account code depuis la top nav.
 * Self-contained: no external helpers (chrome.scripting.executeScript requirement)
 */
function extractTopStepGeneric(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    const norm = bodyText.replace(/\n/g, ' ').replace(/ {2,}/g, ' ')

    const findValue = (pattern: RegExp): string => {
      const m = norm.match(pattern)
      return m ? m[1].trim() : ''
    }

    const accountCode = bodyText.match(/(\d+KTC-[-\w]+)/)?.[1] || ''
    const balance     = findValue(/Account Balance[:\s$]*([\d,.]+)/i)
    const url         = window.location.pathname

    const parts: string[] = []
    parts.push(`<p><strong>TopStep</strong> — ${url}</p>`)
    if (accountCode) parts.push(`<p><strong>Compte :</strong> ${accountCode}</p>`)
    if (balance)     parts.push(`<p><strong>Balance :</strong> $${balance}</p>`)

    const content = parts.join('\n')

    const keyPoints: string[] = [
      accountCode ? `Compte: ${accountCode}` : '',
      balance     ? `Balance: $${balance}` : '',
    ].filter(Boolean) as string[]

    return {
      success: content.length >= 30,
      pageTitle: accountCode ? `TopStep — ${accountCode}` : 'TopStep',
      content,
      summary: keyPoints.join(' · ') || 'TopStep',
      keyPoints,
      concepts: [],
      tags: ['topstep', 'prop-firm'],
      siteName: 'TopStep',
      extras: { accountCode, balance }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const topStepDashboardStrategy: SiteStrategy = {
  id: 'topstep-dashboard',
  label: 'TopStep Dashboard',
  match: (url: string) => /dashboard\.topstep\.com/i.test(url) && /\/dashboard\/default/i.test(url),
  priority: 20,
  func: extractTopStepDashboard
}

export const topStepAccountsStrategy: SiteStrategy = {
  id: 'topstep-accounts',
  label: 'TopStep Accounts',
  match: (url: string) => /dashboard\.topstep\.com/i.test(url) && /\/dashboard\/accounts/i.test(url),
  priority: 20,
  func: extractTopStepAccounts
}

export const topStepBillingStrategy: SiteStrategy = {
  id: 'topstep-billing',
  label: 'TopStep Billing',
  match: (url: string) => /dashboard\.topstep\.com/i.test(url) && /\/billing/i.test(url),
  priority: 20,
  func: extractTopStepBilling
}

export const topStepPayoutsStrategy: SiteStrategy = {
  id: 'topstep-payouts',
  label: 'TopStep Payouts',
  match: (url: string) => /dashboard\.topstep\.com/i.test(url) && /\/payouts/i.test(url),
  priority: 20,
  func: extractTopStepPayouts
}

export const topStepGenericStrategy: SiteStrategy = {
  id: 'topstep-generic',
  label: 'TopStep',
  match: (url: string) => /topstep\.com/i.test(url) && !/topstepx\./i.test(url),
  priority: 5,
  func: extractTopStepGeneric
}
