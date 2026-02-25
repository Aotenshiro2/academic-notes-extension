import type { AcademicNote } from '@/types/academic'
import { getSession, getBearerToken } from './auth'

const JOURNAL_API = 'https://journal-d-etude-beta.vercel.app/api'
const SYNC_CANVAS_ID = 'notes-extension-academic'

export interface SyncResult {
  success: boolean
  noteId?: string
  error?: string
}

/**
 * Convertit une AcademicNote en payload pour POST /api/canvas/[canvasId]/notes
 */
function toJournalPayload(note: AcademicNote) {
  return {
    title: note.title,
    content: note.content,
    mainTakeaway: note.summary ?? '',
    source: 'extension',
    sourceUrl: note.url || null,
    favicon: note.favicon ?? null,
    syncedAt: new Date().toISOString(),
    // position auto-calculée côté serveur
  }
}

/**
 * Synque une note vers le canvas dédié du journal.
 * Si la note avec la même sourceUrl existe déjà, elle est mise à jour (upsert serveur).
 * Non-bloquant : les erreurs sont loggées mais ne bloquent pas saveNote().
 */
export async function syncNoteToJournal(note: AcademicNote): Promise<SyncResult> {
  try {
    const token = await getBearerToken()
    if (!token) {
      return { success: false, error: 'Not authenticated' }
    }

    const response = await fetch(`${JOURNAL_API}/canvas/${SYNC_CANVAS_ID}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Extension-Source': 'trading-notes-extension',
      },
      body: JSON.stringify(toJournalPayload(note)),
    })

    if (response.status === 401) {
      return { success: false, error: 'Unauthorized — session expired' }
    }

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `HTTP ${response.status}: ${text}` }
    }

    const data = await response.json()
    return { success: true, noteId: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * Retourne l'ID du canvas dédié à la sync de l'extension.
 * Le canvas est auto-créé côté serveur à la première note.
 */
export function getSyncCanvasId(): string {
  return SYNC_CANVAS_ID
}

/**
 * Force-synque toutes les notes non encore synquées.
 */
export async function forceSyncAll(notes: AcademicNote[]): Promise<{ synced: number; failed: number }> {
  const session = await getSession()
  if (!session) return { synced: 0, failed: 0 }

  const unsynced = notes.filter(n => !n.syncedAt)
  let synced = 0
  let failed = 0

  for (const note of unsynced) {
    const result = await syncNoteToJournal(note)
    if (result.success) synced++
    else failed++
  }

  return { synced, failed }
}
