import type { AcademicNote } from '@/types/academic'
import { getSession, getBearerToken } from './auth'

const JOURNAL_API = 'https://journal-d-etude-beta.vercel.app'

export interface SyncResult {
  success: boolean
  noteId?: string
  error?: string
}

/**
 * Convertit une AcademicNote en payload pour POST /api/notes
 */
function toJournalPayload(note: AcademicNote) {
  return {
    title: note.title,
    content: note.content,
    source: 'extension',
    sourceUrl: note.url || null,
    favicon: note.favicon ?? null,
    syncedAt: new Date().toISOString(),
    messages: note.messages ?? [],
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

    const response = await fetch(`${JOURNAL_API}/api/notes`, {
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
    const error = err instanceof Error ? err.message : 'Network error'
    console.warn('[AOK Sync] ✗', note.title, '—', error)
    return { success: false, error }
  }
}

/**
 * Force-synque toutes les notes non encore synquées.
 */
export async function forceSyncAll(notes: AcademicNote[]): Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }> {
  const session = await getSession()
  if (!session) return { synced: 0, failed: 0, errors: [] }

  const unsynced = notes.filter(n => !n.syncedAt)
  let synced = 0
  let failed = 0
  const errors: Array<{ title: string; error: string }> = []

  for (const note of unsynced) {
    const result = await syncNoteToJournal(note)
    if (result.success) {
      synced++
      console.log('[AOK Sync] ✓', note.title)
    } else {
      failed++
      errors.push({ title: note.title, error: result.error ?? 'Unknown error' })
      console.warn('[AOK Sync] ✗', note.title, '—', result.error)
    }
  }

  console.log(`[AOK ForceSyncAll] Done: ${synced} synced, ${failed} failed`)
  return { synced, failed, errors }
}
