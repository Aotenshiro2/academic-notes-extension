import type { AcademicNote, NoteWarmup, TradeSegment, Annotation, TradeOutcome } from '@/types/academic'

// Reconstruit le fil COMPLET de la note en HTML pour les exports (PDF, DOCX, Drive) :
// messages + segments de trade (résultat, jugement A/B/C, cooldown) + warmups,
// dans le même ordre chronologique que l'affichage de la note. Sans ça, les exports
// ne montraient que les messages (note.content) et perdaient toute la structure trading.
// Pas d'emoji ici : le parseur PDF (jsPDF) ne sait pas les rendre.

const OUTCOME_LABEL: Record<TradeOutcome, string> = { gain: 'Gain', perte: 'Perte', be: 'Break-even' }
const CAUSE_LABEL: Record<string, string> = {
  technique: 'cause technique',
  connaissance: 'cause connaissance',
  emotionnel: 'cause émotionnelle',
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function warmupFilled(w?: NoteWarmup): boolean {
  return !!(w && (w.physical || w.emotional || w.dominantThought || w.objective || w.emotionLevel !== undefined))
}

function warmupHtml(w: NoteWarmup): string {
  const title = w.startedAt ? `Warmup · ${fmtTime(w.startedAt)}` : 'Warmup de séance'
  const lines: string[] = [`<h3>${title}</h3>`]
  const fields: Array<[string, string | undefined]> = [
    ['État physique', w.physical],
    ['État émotionnel', w.emotional],
    ['Pensée dominante', w.dominantThought],
    ['Objectif du jour', w.objective],
  ]
  for (const [label, value] of fields) {
    if (value) lines.push(`<p><strong>${label} :</strong> ${esc(value)}</p>`)
  }
  if (w.emotionLevel !== undefined) {
    lines.push(`<p><strong>Émotion accumulée au démarrage :</strong> ${w.emotionLevel}/100</p>`)
  }
  return lines.join('')
}

function tradeHtml(t: TradeSegment, n: number, annotation?: Annotation): string {
  const outcome = t.outcome ? ` — ${OUTCOME_LABEL[t.outcome]}` : t.closedAt ? '' : ' — en cours'
  const lines: string[] = [`<h3>Trade ${n} · ${fmtTime(t.startedAt)}${outcome}</h3>`]
  if (annotation) {
    const cause = annotation.causeCategory ? ` (${CAUSE_LABEL[annotation.causeCategory] ?? annotation.causeCategory})` : ''
    lines.push(`<p><em>Jugement ${annotation.grade} — « ${esc(annotation.phrase)} »${cause}</em></p>`)
  }
  const cd = t.cooldown
  if (cd && (cd.emotion || cd.error || cd.lesson)) {
    const parts: string[] = []
    if (cd.emotion) parts.push(`Émotion : ${esc(cd.emotion)}`)
    if (cd.error) parts.push(`Erreur : ${esc(cd.error)}`)
    if (cd.lesson) parts.push(`Leçon : ${esc(cd.lesson)}`)
    lines.push(`<p><strong>Cooldown</strong> — ${parts.join(' · ')}</p>`)
  }
  return lines.join('')
}

function messageHtml(content: string, isImage: boolean): string {
  if (isImage) return `<img src="${content}" alt="Capture"/>`
  const trimmed = content.trim()
  if (!trimmed) return ''
  // Les messages texte sont du HTML riche ; les parseurs d'export ignorent les
  // nœuds texte nus au niveau racine → envelopper si nécessaire.
  return trimmed.startsWith('<') ? trimmed : `<p>${trimmed}</p>`
}

/**
 * HTML complet du fil de la note, prêt pour parseHtmlToDocxBlocks / parseHtmlContent.
 */
export function buildExportHtml(note: AcademicNote): string {
  const IMAGE_TYPES = new Set(['image', 'screenshot', 'capture'])
  const parts: string[] = []

  // Warmup legacy (ancien modèle : un seul, en haut de note)
  if (warmupFilled(note.warmup)) parts.push(warmupHtml(note.warmup!))

  const messages = note.messages ?? []
  if (messages.length === 0 && !(note.trades?.length) && !(note.warmups?.length)) {
    // Ancienne note sans structure : le contenu HTML legacy tel quel
    return parts.join('') + (note.content ?? '')
  }

  const trades = note.trades ?? []
  const tradesById = new Map(trades.map(t => [t.id, t]))
  const tradeNumber = (id: string) => trades.findIndex(t => t.id === id) + 1
  const tradeAnnotation = (id: string): Annotation | undefined =>
    (note.annotations ?? []).filter(a => a.tradeRef === id).sort((a, b) => b.createdAt - a.createdAt)[0]
  const seenTrades = new Set<string>()

  const warmups = [...(note.warmups ?? [])].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
  let warmupIdx = 0
  const flushWarmupsBefore = (ts: number) => {
    while (warmupIdx < warmups.length && (warmups[warmupIdx].startedAt ?? 0) <= ts) {
      parts.push(warmupHtml(warmups[warmupIdx]))
      warmupIdx++
    }
  }

  for (const message of messages) {
    flushWarmupsBefore(message.timestamp)
    const tRef = message.tradeRef
    if (tRef && !seenTrades.has(tRef) && tradesById.has(tRef)) {
      seenTrades.add(tRef)
      const trade = tradesById.get(tRef)!
      parts.push(tradeHtml(trade, tradeNumber(tRef), tradeAnnotation(tRef)))
    }
    parts.push(messageHtml(message.content, IMAGE_TYPES.has(message.type)))
  }

  // Trades sans messages (fraîchement démarrés ou vides)
  for (const trade of trades) {
    if (!seenTrades.has(trade.id)) {
      seenTrades.add(trade.id)
      parts.push(tradeHtml(trade, tradeNumber(trade.id), tradeAnnotation(trade.id)))
    }
  }

  // Warmups postérieurs au dernier message
  while (warmupIdx < warmups.length) {
    parts.push(warmupHtml(warmups[warmupIdx]))
    warmupIdx++
  }

  return parts.filter(Boolean).join('\n')
}
