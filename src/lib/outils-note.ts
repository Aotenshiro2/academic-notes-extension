// Règles pures de la rangée d'outils de la note (« Poser un DOL », « Lancer un
// warmup », « Approfondir »), sorties de sidepanel/App.tsx en 1.8.15 pour que
// le panneau latéral et le plein écran partagent EXACTEMENT les mêmes gestes.
// Aucun accès au stockage ni au réseau ici : le composant OutilsNoteRangee
// relit la note fraîche, applique ces fonctions, puis enregistre.
import type { AcademicNote, DolLevel } from '../types/academic'

/** Ce que l'étude renvoie et qui finit dans la note (sous-ensemble de SortieCaptureIA). */
export interface SortieEtudeNote {
  resume?: string
  pointsCles?: string[]
  pourToi?: string
  concepts?: string[]
  tags?: string[]
}

/** Ajoute un niveau DOL actif à la note, sans toucher aux autres. */
export function noteAvecDol(
  note: AcademicNote,
  dol: Omit<DolLevel, 'id' | 'createdAt' | 'status'>,
  id: string,
  maintenant: number
): AcademicNote {
  const entree: DolLevel = { ...dol, id, status: 'actif', createdAt: maintenant }
  return { ...note, dols: [...(note.dols ?? []), entree] }
}

/** Ajoute un warmup au fil de la note, au moment du clic. */
export function noteAvecWarmup(note: AcademicNote, id: string, maintenant: number): AcademicNote {
  return { ...note, warmups: [...(note.warmups ?? []), { id, startedAt: maintenant, doneAt: maintenant }] }
}

/** Le bloc « Étude de la note » écrit dans la note (même HTML qu'avant la 1.8.15). */
export function blocEtude(sortie: SortieEtudeNote): string {
  let bloc = '<hr><p><strong>Étude de la note</strong></p>'
  if (sortie.resume) bloc += `<p><em>${sortie.resume}</em></p>`
  if (sortie.pointsCles?.length) {
    bloc += '<p><strong>Ce qu’il faut en retenir :</strong></p><ul>'
    sortie.pointsCles.forEach(p => { bloc += `<li>${p}</li>` })
    bloc += '</ul>'
  }
  if (sortie.pourToi) bloc += `<p><strong>Pour toi :</strong> ${sortie.pourToi}</p>`
  return bloc
}

/**
 * Les concepts et tags trouvés par l'étude enrichissent la note sans écraser
 * ce que l'élève a posé à la main. null : rien à changer.
 */
export function noteEnrichieParEtude(note: AcademicNote, sortie: SortieEtudeNote): AcademicNote | null {
  if (!sortie.concepts?.length && !sortie.tags?.length) return null
  return {
    ...note,
    concepts: [...new Set([...(note.concepts ?? []), ...(sortie.concepts ?? [])])].slice(0, 12),
    tags: [...new Set([...(note.tags ?? []), ...(sortie.tags ?? [])])].slice(0, 10),
  }
}

/** Le texte brut que l'étude relit : le contenu, sinon les blocs texte du fil. */
export function contenuAEtudier(note: AcademicNote): string {
  return note.content || note.messages?.filter(m => m.type === 'text').map(m => m.content).join('\n') || ''
}
