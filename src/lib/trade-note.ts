// Lancer un trade depuis la barre d'écriture, et clore le trade actif quand on
// quitte la note (1.8.15). Sorti de sidepanel/App.tsx pour que le plein écran
// fasse EXACTEMENT la même chose que le panneau. Ici, les règles seules :
// stockage, capture et horloge sont passés en dépendances, pour les tests.
import type { AcademicNote } from '../types/academic'

/** La note de séance créée à la volée quand on lance un trade depuis l'accueil. */
export function noteDeSeance(id: string, maintenant: number): AcademicNote {
  const jour = new Date(maintenant).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  return {
    id,
    title: `Séance du ${jour}`,
    content: '',
    url: '',
    timestamp: maintenant,
    type: 'manual',
    tags: [],
    concepts: [],
    screenshots: [],
    metadata: { domain: '', title: `Séance du ${jour}`, language: 'fr' },
  }
}

export interface DependancesTrade {
  maintenant: () => number
  enregistrerNote: (note: AcademicNote) => Promise<unknown>
  demarrerTrade: (noteId: string) => Promise<string | null>
  /** Capture du graphique au lancement : lancée SANS attendre, le trade n'attend pas l'image. */
  capturerAuLancement: (noteId: string, tradeId: string) => void
}

/**
 * Lance un trade dans la note ouverte, ou dans une note de séance créée à la
 * volée. Rend la note du trade et si elle vient d'être créée (la vue l'ouvre).
 */
export async function lancerTrade(
  noteOuverte: string | null,
  dep: DependancesTrade
): Promise<{ noteId: string; creee: boolean; tradeId: string | null }> {
  let noteId = noteOuverte
  let creee = false
  if (!noteId) {
    const t = dep.maintenant()
    const note = noteDeSeance(String(t), t)
    await dep.enregistrerNote(note)
    noteId = note.id
    creee = true
  }
  const tradeId = await dep.demarrerTrade(noteId)
  if (tradeId) dep.capturerAuLancement(noteId, tradeId)
  return { noteId, creee, tradeId }
}

/** La note quittée dont il faut clore le trade actif, ou null (même note, ou aucune avant). */
export function noteQuittee(avant: string | null, apres: string | null): string | null {
  return avant && avant !== apres ? avant : null
}
