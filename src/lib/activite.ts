// Activité du carnet, jour par jour (1.8.9, demande de Brice le 02/10/2026).
//
// Le panneau de l'accueil montre une case par jour sur douze mois, plus foncée
// quand l'élève a noté, capturé ou jugé des trades : de quoi suivre sa
// régularité et avoir envie de revenir, façon Skool. Même lecture que le
// panneau « Mon activité » du picker hebdo de Brice.
//
// Module pur, sans DOM ni chrome.* : storage.ts l'appelle aussi depuis le
// service worker, au moment où il fabrique les résumés de notes.
import type { AcademicNote, ActiviteJour, NoteSummary } from '@/types/academic'

/** Les réponses du mentor sont des blocs de la note « Mentorat AOK » portant
 *  ce tag (cf. note-mentorat.ts) : ce n'est pas l'élève qui les a écrites. */
const TAG_MENTOR = 'mentor'

/** Avant ça, un horodatage est forcément un reste d'import ou un zéro. */
const PLANCHER = Date.UTC(2015, 0, 1)

/** Clé d'une journée en heure LOCALE : une note prise à 23h30 compte pour ce
 *  soir-là, pas pour le lendemain en UTC. */
export function cleJour(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

/** Ce que l'élève a fait dans UNE note, jour par jour. */
export function activiteDeLaNote(note: AcademicNote): Record<string, ActiviteJour> {
  const jours: Record<string, ActiviteJour> = {}
  const compter = (ts: number | undefined, i: 0 | 1 | 2) => {
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < PLANCHER) return
    const cle = cleJour(ts)
    const jour = jours[cle] ?? (jours[cle] = [0, 0, 0])
    jour[i]++
  }

  const messages = note.messages ?? []
  for (const m of messages) {
    if (m.type === 'meta') continue
    if ((m.tags ?? []).includes(TAG_MENTOR)) continue
    compter(m.timestamp, 0)
  }
  // Note d'avant les blocs : un seul geste, daté de sa dernière modification
  if (messages.length === 0 && note.content) compter(note.timestamp, 0)

  // Warmups et cooldowns : du journaling à part entière, rangés avec l'écrit
  for (const w of note.warmups ?? []) compter(w.startedAt ?? w.doneAt, 0)
  for (const t of note.trades ?? []) {
    compter(t.startedAt, 1)
    if (t.cooldown?.doneAt) compter(t.cooldown.doneAt, 0)
  }
  for (const a of note.annotations ?? []) compter(a.createdAt, 2)

  return jours
}

/** Toutes les notes réunies : un total par jour. */
export function activiteDuCarnet(notes: Pick<NoteSummary, 'activite'>[]): Map<string, ActiviteJour> {
  const total = new Map<string, ActiviteJour>()
  for (const n of notes) {
    for (const [cle, [e, t, j]] of Object.entries(n.activite ?? {})) {
      const jour = total.get(cle)
      if (jour) { jour[0] += e; jour[1] += t; jour[2] += j }
      else total.set(cle, [e, t, j])
    }
  }
  return total
}

/** Intensité d'une case, de 0 (rien) à 4. Seuils fixes plutôt que relatifs au
 *  meilleur jour de l'élève : une case doit vouloir dire la même chose d'un
 *  mois sur l'autre. Repères : une note rapide = 1, une vraie séance (warmup,
 *  quelques captures, un trade jugé) = 3 ou 4. */
export function niveauDuJour(jour: ActiviteJour | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!jour) return 0
  const n = jour[0] + jour[1] + jour[2]
  if (n === 0) return 0
  if (n <= 2) return 1
  if (n <= 5) return 2
  if (n <= 10) return 3
  return 4
}
