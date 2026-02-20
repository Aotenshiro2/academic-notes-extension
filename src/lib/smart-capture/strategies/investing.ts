import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * Investing.com — Economic calendar + real-time prices
 * Applies calendar strategy only if on calendar page, otherwise price extraction
 */
function extractInvesting(): SiteExtractResult {
  try {
    const isCalendar = /economic-calendar|economicCalendar/i.test(window.location.href)

    if (isCalendar) {
      return extractCalendar()
    }
    return extractPrice()
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

function extractCalendar(): SiteExtractResult {
  interface CalEvent {
    time: string
    currency: string
    impact: string
    event: string
    actual: string
    forecast: string
    previous: string
  }

  const events: CalEvent[] = []
  const rows = document.querySelectorAll('#economicCalendarData tr, [class*="ec-table"] tr, table tbody tr')

  rows.forEach(row => {
    const time = row.querySelector('td:nth-child(1), [class*="time"]')?.textContent?.trim() || ''
    const currency = row.querySelector('td.flagCur, [class*="currency"], td:nth-child(2)')?.textContent?.trim() || ''

    // Impact par nombre de bulls/étoiles
    const impactEl = row.querySelector('[class*="sentiment"], [class*="bull"], [class*="impact"]')
    let impact = ''
    if (impactEl) {
      const icons = impactEl.querySelectorAll('[class*="bull"], i, svg')
      if (icons.length >= 3) impact = 'High'
      else if (icons.length === 2) impact = 'Medium'
      else if (icons.length >= 1) impact = 'Low'
      else impact = impactEl.textContent?.trim() || ''
    }

    const eventName = row.querySelector('td.event a, [class*="event"] a, td:nth-child(4) a')?.textContent?.trim() || ''
    const actual = row.querySelector('td.act, [class*="actual"], td:nth-child(5)')?.textContent?.trim() || ''
    const forecast = row.querySelector('td.fore, [class*="forecast"], td:nth-child(6)')?.textContent?.trim() || ''
    const previous = row.querySelector('td.prev, [class*="previous"], td:nth-child(7)')?.textContent?.trim() || ''

    if (eventName && eventName.length > 2) {
      events.push({ time, currency, impact, event: eventName, actual, forecast, previous })
    }
  })

  if (events.length === 0) {
    return { success: false, error: 'No events found' }
  }

  const highImpact = events.filter(e => e.impact === 'High').length

  const parts: string[] = []
  parts.push('<table style="width:100%;border-collapse:collapse;">')
  parts.push('<tr><th>Heure</th><th>Devise</th><th>Impact</th><th>Événement</th><th>Prévu</th><th>Précédent</th><th>Actuel</th></tr>')
  events.forEach(e => {
    const impactColor = e.impact === 'High' ? '#ef4444' : e.impact === 'Medium' ? '#f59e0b' : '#22c55e'
    parts.push(`<tr><td>${e.time}</td><td><strong>${e.currency}</strong></td><td style="color:${impactColor}">${e.impact}</td><td>${e.event}</td><td>${e.forecast}</td><td>${e.previous}</td><td><strong>${e.actual}</strong></td></tr>`)
  })
  parts.push('</table>')

  const content = parts.join('\n')
  const pageTitle = `Investing.com — ${events.length} events` + (highImpact > 0 ? ` (${highImpact} High)` : '')

  return {
    success: true,
    pageTitle,
    content,
    summary: pageTitle,
    keyPoints: events.filter(e => e.impact === 'High').slice(0, 8).map(e => `${e.time} ${e.currency} ${e.event}`),
    concepts: [...new Set(events.map(e => e.currency).filter(Boolean))],
    tags: ['investing', 'calendrier', 'économique'],
    siteName: 'Investing.com',
    extras: { totalEvents: events.length, highImpact }
  }
}

function extractPrice(): SiteExtractResult {
  const instrumentName =
    document.querySelector('h1[class*="instrument"]')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    ''

  const price =
    document.querySelector('[class*="instrument-price"], [data-test="instrument-price-last"]')?.textContent?.trim() ||
    document.querySelector('[class*="last-price"]')?.textContent?.trim() ||
    ''

  const change =
    document.querySelector('[data-test="instrument-price-change"]')?.textContent?.trim() ||
    document.querySelector('[class*="price-change"]')?.textContent?.trim() ||
    ''

  const changePct =
    document.querySelector('[data-test="instrument-price-change-percent"]')?.textContent?.trim() ||
    document.querySelector('[class*="price-change-percent"]')?.textContent?.trim() ||
    ''

  const parts: string[] = []
  if (instrumentName) parts.push(`<p><strong>Instrument :</strong> ${instrumentName}</p>`)
  if (price) parts.push(`<p><strong>Prix :</strong> ${price}</p>`)
  if (change || changePct) {
    const v = [change, changePct].filter(Boolean).join(' ')
    parts.push(`<p><strong>Variation :</strong> ${v}</p>`)
  }

  const content = parts.join('\n')
  const pageTitle = instrumentName && price ? `${instrumentName} @ ${price}` : instrumentName || 'Investing.com'

  return {
    success: content.length >= 50,
    pageTitle,
    content,
    summary: [instrumentName, price, changePct].filter(Boolean).join(' · '),
    keyPoints: [
      instrumentName && price ? `${instrumentName} @ ${price}` : '',
      changePct ? `Variation: ${changePct}` : '',
    ].filter(Boolean),
    concepts: [],
    tags: ['investing', instrumentName.toLowerCase().slice(0, 20)].filter(Boolean),
    siteName: 'Investing.com',
    extras: { instrumentName, price, change, changePct }
  }
}

export const investingStrategy: SiteStrategy = {
  id: 'investing',
  label: 'Investing.com',
  match: (url: string) => /investing\.com/i.test(url),
  priority: 10,
  func: extractInvesting
}
