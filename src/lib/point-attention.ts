// Le point d'attention avant la séance (1.9.2), et le rappel du warmup.
//
// Décisions de Brice (11/11/2026, labo carnet-point-attention, proposition 1) :
// - un bloc en tête de la carte du warmup, avant les questions ;
// - il apparaît s'il y a au moins 3 jugements de la même cause sur les 14
//   derniers jours, en ne comptant que les jugements B− et en dessous ;
//   sous ce seuil, rien ne s'affiche ;
// - il reprend la phrase du jugement le plus récent de cette cause ;
// - à égalité, il montre les causes à égalité et le membre choisit ;
// - « Je le garde en tête » vaut pour la séance en cours seulement : la
//   décision vit sur le warmup, le suivant se recalcule.
// Tout se calcule dans le Carnet, sur ses notes locales : ni IA ni route.
//
// Le rappel : à l'ouverture d'une nouvelle note, une ligne discrète propose
// le warmup. Elle part quand on la ferme ou qu'on lance le warmup, et ne
// revient pas dans la même note.
//
// Règles pures, testées dans tests/point-attention.test.ts.
import type { AcademicNote, Annotation, AnnotationCause, NoteWarmup } from '../types/academic'

export const FENETRE_JOURS = 14
export const SEUIL_JUGEMENTS = 3
const JOUR_MS = 24 * 60 * 60 * 1000

/** B− et en dessous. Stockés en ASCII ('B-'). */
const GRADES_BAS = new Set(['B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'])

/** Ordre d'affichage stable des causes, comme dans la notation. */
export const CAUSES: AnnotationCause[] = ['technique', 'connaissance', 'emotionnel']

export type Jugement = Pick<Annotation, 'grade' | 'phrase' | 'causeCategory' | 'createdAt'>

export interface CauseRecurrente {
  cause: AnnotationCause
  nombre: number
  /** La phrase du jugement le plus récent de cette cause (vide si aucune n'a été écrite) */
  phrase: string
}

/**
 * Les causes à remontrer avant la séance qui commence à `debut` : une seule
 * le plus souvent, plusieurs à égalité, ou null sous le seuil. La fenêtre est
 * ancrée sur le début de la séance, pour que le point reste le même pendant
 * toute la séance (les jugements posés pendant ne le changent pas).
 */
export function calculerPointAttention(jugements: Jugement[], debut: number): CauseRecurrente[] | null {
  const depuis = debut - FENETRE_JOURS * JOUR_MS
  const parCause = new Map<AnnotationCause, { nombre: number; phrase: string; phraseLe: number }>()
  for (const j of jugements) {
    if (!j.causeCategory || !CAUSES.includes(j.causeCategory)) continue
    if (!GRADES_BAS.has(j.grade)) continue
    if (typeof j.createdAt !== 'number' || j.createdAt <= depuis || j.createdAt > debut) continue
    const c = parCause.get(j.causeCategory) ?? { nombre: 0, phrase: '', phraseLe: -Infinity }
    c.nombre++
    const phrase = (j.phrase ?? '').trim()
    if (phrase && j.createdAt > c.phraseLe) { c.phrase = phrase; c.phraseLe = j.createdAt }
    parCause.set(j.causeCategory, c)
  }
  let max = 0
  for (const c of parCause.values()) max = Math.max(max, c.nombre)
  if (max < SEUIL_JUGEMENTS) return null
  return CAUSES
    .filter(cause => parCause.get(cause)?.nombre === max)
    .map(cause => ({ cause, nombre: max, phrase: parCause.get(cause)!.phrase }))
}

/** Au-delà, un warmup n'est plus la séance en cours : pas de point d'attention. */
export const DUREE_SEANCE_MS = 12 * 60 * 60 * 1000

/**
 * Le warmup peut-il montrer le point d'attention ? Un warmup de la séance en
 * cours (lancé il y a moins de 12 h), sur lequel le membre n'a encore rien
 * décidé. Un ancien warmup ne se voit pas proposer un point calculé après coup.
 */
export function warmupAttendUnPoint(w: NoteWarmup | undefined, maintenant: number): boolean {
  if (!w?.id || typeof w.startedAt !== 'number') return false
  if (w.attention?.garde || w.attention?.fermeLe) return false
  const age = maintenant - w.startedAt
  return age >= 0 && age < DUREE_SEANCE_MS
}

// ── Le rappel du warmup ──────────────────────────────────────────────────────

/** Une note « nouvelle » : créée il y a moins d'une heure. */
export const NOTE_NOUVELLE_MS = 60 * 60 * 1000

type NotePourRappel = Pick<AcademicNote, 'id' | 'timestamp' | 'warmups' | 'warmup' | 'title' | 'tags'>

/**
 * Montrer « Un warmup avant de commencer ? » : note neuve, sans warmup, pas
 * la note du mentorat, et le membre ne l'a pas déjà fermé ni lancé ici.
 */
export function rappelWarmupAMontrer(note: NotePourRappel | undefined, maintenant: number, notesVues: string[]): boolean {
  if (!note) return false
  if (notesVues.includes(note.id)) return false
  if ((note.warmups?.length ?? 0) > 0 || note.warmup) return false
  if (note.tags?.includes('mentorat') && note.title?.trim().toLowerCase() === 'mentorat aok') return false
  const age = maintenant - note.timestamp
  return age >= 0 && age < NOTE_NOUVELLE_MS
}

/** La liste des notes où le rappel est parti, bornée aux plus récentes. */
export function ajouterNoteVue(notesVues: string[], noteId: string, max = 200): string[] {
  return [...notesVues.filter(id => id !== noteId), noteId].slice(-max)
}
