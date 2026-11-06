// L'Historique des notes (recherche, « à trier », tags, dossiers), le même
// dans le tiroir du panneau latéral et la barre latérale du plein écran
// (1.8.15, choix de Brice : option A). Règles pures, sorties de
// HistoryDropdown.tsx et testées dans tests/historique.test.ts. Le rendu :
// components/HistoriqueNotes.tsx.
import type { NoteFolder, NoteSummary } from '../types/academic'

type NoteListee = Pick<NoteSummary, 'title' | 'tags' | 'messageTags' | 'searchText' | 'annotationCount'>

export interface FiltresHistorique {
  recherche: string
  tag: string | null
  aTrierSeulement: boolean
}

/** Non triée = aucun tag ET aucun jugement posé : la matière brute à reprendre. */
export function estATrier(n: Pick<NoteSummary, 'tags' | 'annotationCount'>): boolean {
  return (n.tags?.length ?? 0) === 0 && n.annotationCount === 0
}

/** Le tag est sur la note ou sur l'un de ses blocs. */
export function porteLeTag(n: Pick<NoteSummary, 'tags' | 'messageTags'>, tag: string): boolean {
  return n.tags.includes(tag) || n.messageTags.includes(tag)
}

export function filtresActifs(f: FiltresHistorique): boolean {
  return !!f.recherche.trim() || !!f.tag || f.aTrierSeulement
}

/** Recherche (titre, tags, tags des blocs, texte), tag choisi, « à trier ». */
export function filtrerNotes<T extends NoteListee>(notes: T[], f: FiltresHistorique): T[] {
  const q = f.recherche.toLowerCase().trim()
  return notes.filter(n =>
    (!q ||
      n.title.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q)) ||
      n.messageTags.some(t => t.toLowerCase().includes(q)) ||
      n.searchText.toLowerCase().includes(q)) &&
    (!f.tag || porteLeTag(n, f.tag)) &&
    (!f.aTrierSeulement || estATrier(n))
  )
}

/** Combien de tags se montrent avant « +N » : ils s'accumulent avec le temps. */
export const TAGS_VISIBLES = 6

/** Tous les tags (note et blocs), du plus utilisé au moins utilisé ; un tag compte une fois par note. */
export function tagsParUsage(notes: Pick<NoteSummary, 'tags' | 'messageTags'>[]): string[] {
  const compte = new Map<string, number>()
  for (const n of notes) {
    for (const t of new Set<string>([...n.tags, ...n.messageTags])) compte.set(t, (compte.get(t) ?? 0) + 1)
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
}

/** Sous-dossiers, 1 niveau max : les racines au premier niveau. */
export function dossiersRacines(dossiers: NoteFolder[]): NoteFolder[] {
  return dossiers.filter(d => !d.parentId)
}

export function sousDossiers(dossiers: NoteFolder[], parentId: string): NoteFolder[] {
  return dossiers.filter(d => d.parentId === parentId)
}

/** Un dossier neuf ; un nom vide n'en fait pas (null). */
export function nouveauDossier(nom: string, id: string, maintenant: number, parentId?: string): NoteFolder | null {
  const propre = nom.trim()
  if (!propre) return null
  return { id, name: propre, createdAt: maintenant, ...(parentId ? { parentId } : {}) }
}
