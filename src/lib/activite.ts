// Activité du carnet, jour par jour (1.8.10, demande de Brice le 02/10/2026).
//
// Le panneau de l'accueil montre une case par jour sur douze mois, plus foncée
// quand l'élève a noté, capturé, parlé au mentor, jugé des trades ou rouvert
// ses notes : de quoi suivre sa régularité et avoir envie de revenir, façon
// Skool. Même lecture que le panneau « Mon activité » du picker hebdo de Brice.
//
// Module pur, sans DOM ni chrome.* : storage.ts l'appelle aussi depuis le
// service worker, au moment où il fabrique les résumés de notes.
import type { AcademicNote, ActiviteJour, NoteSummary } from '@/types/academic'

/** Les réponses du mentor sont des blocs portant ce tag (cf. note-mentorat.ts).
 *  Ce n'est pas l'élève qui les écrit : elles ne comptent pas. Ce qu'il écrit
 *  dans ce fil, en revanche, compte comme un échange avec le mentor : venir
 *  parler à son mentor sans rien noter d'autre, c'est une vraie journée. */
const TAG_MENTOR = 'mentor'

/** Avant ça, un horodatage est forcément un reste d'import ou un zéro. */
const PLANCHER = Date.UTC(2015, 0, 1)

export type CleActivite = keyof ActiviteJour

/** Une journée tous comptes faits, notes ouvertes comprises. */
export interface Journee extends ActiviteJour {
  consultees: number
}

export const JOURNEE_VIDE: Readonly<Journee> = { ecrits: 0, mentor: 0, trades: 0, jugements: 0, consultees: 0 }

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
  const compter = (ts: number | undefined, quoi: CleActivite) => {
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < PLANCHER) return
    const cle = cleJour(ts)
    const jour = jours[cle] ?? (jours[cle] = { ecrits: 0, mentor: 0, trades: 0, jugements: 0 })
    jour[quoi]++
  }

  const messages = note.messages ?? []
  // Le fil du mentor se reconnaît à ses réponses, pas à son titre (renommable)
  const filDuMentor = messages.some(m => (m.tags ?? []).includes(TAG_MENTOR))
  for (const m of messages) {
    if (m.type === 'meta') continue
    if ((m.tags ?? []).includes(TAG_MENTOR)) continue
    compter(m.timestamp, filDuMentor ? 'mentor' : 'ecrits')
  }
  // Note d'avant les blocs : un seul geste, daté de sa dernière modification
  if (messages.length === 0 && note.content) compter(note.timestamp, 'ecrits')

  // Warmups et cooldowns : du journaling à part entière, rangés avec l'écrit
  for (const w of note.warmups ?? []) compter(w.startedAt ?? w.doneAt, 'ecrits')
  for (const t of note.trades ?? []) {
    compter(t.startedAt, 'trades')
    if (t.cooldown?.doneAt) compter(t.cooldown.doneAt, 'ecrits')
  }
  for (const a of note.annotations ?? []) compter(a.createdAt, 'jugements')

  return jours
}

/** Toutes les notes réunies, plus les notes ouvertes : un total par jour. */
export function activiteDuCarnet(
  notes: Pick<NoteSummary, 'activite'>[],
  consultations: Record<string, number> = {}
): Map<string, Journee> {
  const total = new Map<string, Journee>()
  const journee = (cle: string) => {
    let j = total.get(cle)
    if (!j) { j = { ...JOURNEE_VIDE }; total.set(cle, j) }
    return j
  }
  for (const n of notes) {
    for (const [cle, a] of Object.entries(n.activite ?? {})) {
      const j = journee(cle)
      j.ecrits += a.ecrits; j.mentor += a.mentor; j.trades += a.trades; j.jugements += a.jugements
    }
  }
  for (const [cle, nb] of Object.entries(consultations)) journee(cle).consultees += nb
  return total
}

/** Intensité d'une case, de 0 (rien) à 4. Seuils fixes plutôt que relatifs au
 *  meilleur jour de l'élève : une case doit vouloir dire la même chose d'un
 *  mois sur l'autre. Repères : passer relire une note = 1, une vraie séance
 *  (warmup, quelques captures, un trade jugé) = 3 ou 4. */
export function niveauDuJour(j: Journee | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!j) return 0
  const n = j.ecrits + j.mentor + j.trades + j.jugements + j.consultees
  if (n === 0) return 0
  if (n <= 2) return 1
  if (n <= 5) return 2
  if (n <= 10) return 3
  return 4
}
