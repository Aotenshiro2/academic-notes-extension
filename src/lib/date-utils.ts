/**
 * Smart date formatting utility
 * "Aujourd'hui à HH:MM", "Hier à HH:MM", "DD mois à HH:MM"
 *
 * Langue (01/10/2026) : les mots passent par le dictionnaire (clés `date.*`)
 * et les noms de mois par la locale de la langue courante. En français, le
 * rendu est inchangé.
 */
import { t, locale } from './i18n'

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
  const loc = locale()
  const time = date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })

  if (isSameDay(date, now)) {
    return t('date.aujourdhuiA', { heure: time })
  }

  if (isYesterday(date, now)) {
    return t('date.hierA', { heure: time })
  }

  if (date.getFullYear() === now.getFullYear()) {
    const day = date.getDate()
    const month = date.toLocaleDateString(loc, { month: 'short' })
    return t('date.jourMoisA', { jour: day, mois: month, heure: time })
  }

  const day = date.getDate()
  const month = date.toLocaleDateString(loc, { month: 'short' })
  return t('date.jourMoisAnneeA', { jour: day, mois: month, annee: date.getFullYear(), heure: time })
}

/**
 * Compact smart date for sidebars/lists: "Aujourd'hui 14:30", "Hier", "15 jan."
 */
export function formatCompactDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const loc = locale()
  const time = date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })

  if (isSameDay(date, now)) {
    return time
  }

  if (isYesterday(date, now)) {
    return t('date.hier', { heure: time })
  }

  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffInDays < 7) {
    return t('date.ilYaJours', { n: diffInDays })
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(loc, { day: 'numeric', month: 'short' })
  }

  return date.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })
}
