import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * Forex Factory — Calendar page only
 * Extracts economic events: time, currency, impact, event, forecast/previous/actual
 */
function extractForexFactoryCalendar(): SiteExtractResult {
  try {
    // Vérifier qu'on est bien sur la page calendar
    const calendarTable = document.querySelector('.calendar__table, table.calendar, [class*="calendar"]')
    if (!calendarTable) {
      return { success: false, error: 'Not on calendar page' }
    }

    interface CalendarEvent {
      time: string
      currency: string
      impact: string
      event: string
      forecast: string
      previous: string
      actual: string
    }

    const events: CalendarEvent[] = []
    const rows = calendarTable.querySelectorAll('tr.calendar__row, tr.calendar_row, tr[data-event-id], tbody tr')

    let currentTime = ''

    rows.forEach(row => {
      // Time — parfois sur une seule ligne pour plusieurs events
      const timeEl = row.querySelector('.calendar__time, .time, td:first-child')
      const timeText = timeEl?.textContent?.trim() || ''
      if (timeText) currentTime = timeText

      // Currency
      const currency = row.querySelector('.calendar__currency, .currency')?.textContent?.trim() || ''

      // Impact (High/Medium/Low)
      const impactEl = row.querySelector('.calendar__impact span, .impact span, [class*="impact"] span')
      let impact = ''
      if (impactEl) {
        const cls = impactEl.className || ''
        if (cls.includes('high') || cls.includes('red')) impact = 'High'
        else if (cls.includes('medium') || cls.includes('ora') || cls.includes('yellow')) impact = 'Medium'
        else if (cls.includes('low') || cls.includes('yel')) impact = 'Low'
        else impact = impactEl.getAttribute('title') || impactEl.textContent?.trim() || ''
      }

      // Event name
      const eventName = row.querySelector('.calendar__event-title, .event, [class*="event"] a, [class*="event"] span')?.textContent?.trim() || ''

      // Forecast, Previous, Actual
      const forecast = row.querySelector('.calendar__forecast, .forecast, [class*="forecast"]')?.textContent?.trim() || ''
      const previous = row.querySelector('.calendar__previous, .previous, [class*="previous"]')?.textContent?.trim() || ''
      const actual = row.querySelector('.calendar__actual, .actual, [class*="actual"]')?.textContent?.trim() || ''

      if (eventName && eventName.length > 2) {
        events.push({
          time: currentTime,
          currency,
          impact,
          event: eventName,
          forecast,
          previous,
          actual
        })
      }
    })

    if (events.length === 0) {
      return { success: false, error: 'No events found' }
    }

    // Compter les high impact
    const highImpact = events.filter(e => e.impact === 'High').length

    // Construire contenu HTML
    const parts: string[] = []
    parts.push('<table style="width:100%;border-collapse:collapse;">')
    parts.push('<tr><th>Heure</th><th>Devise</th><th>Impact</th><th>Événement</th><th>Prévu</th><th>Précédent</th><th>Actuel</th></tr>')
    events.forEach(e => {
      const impactColor = e.impact === 'High' ? '#ef4444' : e.impact === 'Medium' ? '#f59e0b' : '#22c55e'
      parts.push(`<tr>`)
      parts.push(`<td>${e.time}</td>`)
      parts.push(`<td><strong>${e.currency}</strong></td>`)
      parts.push(`<td style="color:${impactColor}">${e.impact}</td>`)
      parts.push(`<td>${e.event}</td>`)
      parts.push(`<td>${e.forecast}</td>`)
      parts.push(`<td>${e.previous}</td>`)
      parts.push(`<td><strong>${e.actual}</strong></td>`)
      parts.push('</tr>')
    })
    parts.push('</table>')

    const content = parts.join('\n')

    // Résumé
    const pageTitle = highImpact > 0
      ? `Forex Factory — ${events.length} events (${highImpact} High Impact)`
      : `Forex Factory — ${events.length} events`

    // Key points = high impact events
    const keyPoints = events
      .filter(e => e.impact === 'High')
      .slice(0, 8)
      .map(e => {
        const p = [e.time, e.currency, e.event].filter(Boolean).join(' ')
        return e.actual ? `${p} → ${e.actual}` : p
      })

    // Devises impliquées
    const currencies = [...new Set(events.map(e => e.currency).filter(Boolean))]

    return {
      success: true,
      pageTitle,
      content,
      summary: pageTitle,
      keyPoints,
      concepts: currencies,
      tags: ['forex-factory', 'calendrier', 'économique'],
      siteName: 'Forex Factory',
      extras: { totalEvents: events.length, highImpact, events: events.slice(0, 20) }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const forexFactoryStrategy: SiteStrategy = {
  id: 'forex-factory',
  label: 'Forex Factory Calendar',
  match: (url: string) => /forexfactory\.com/i.test(url) && /calendar/i.test(url),
  priority: 10,
  func: extractForexFactoryCalendar
}
