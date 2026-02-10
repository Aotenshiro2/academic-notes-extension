/**
 * Smart date formatting utility
 * "Aujourd'hui à HH:MM", "Hier à HH:MM", "DD mois à HH:MM"
 */

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return isSameDay(date, yesterday)
}

/**
 * Full smart date: "Aujourd'hui à 14:30", "Hier à 09:15", "15 jan. à 14:30"
 */
export function formatSmartDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  if (isSameDay(date, now)) {
    return `Aujourd'hui à ${time}`
  }

  if (isYesterday(date, now)) {
    return `Hier à ${time}`
  }

  if (date.getFullYear() === now.getFullYear()) {
    const day = date.getDate()
    const month = date.toLocaleDateString('fr-FR', { month: 'short' })
    return `${day} ${month} à ${time}`
  }

  const day = date.getDate()
  const month = date.toLocaleDateString('fr-FR', { month: 'short' })
  return `${day} ${month} ${date.getFullYear()} à ${time}`
}

/**
 * Compact smart date for sidebars/lists: "Aujourd'hui 14:30", "Hier", "15 jan."
 */
export function formatCompactDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  if (isSameDay(date, now)) {
    return time
  }

  if (isYesterday(date, now)) {
    return `Hier ${time}`
  }

  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffInDays < 7) {
    return `${diffInDays}j`
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
