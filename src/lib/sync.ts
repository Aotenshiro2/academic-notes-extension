import type { AcademicNote } from '@/types/academic'
import { getSession, getBearerToken } from './auth'
import { compressImage } from './image-utils'
import { supabase } from './supabase'

const JOURNAL_API = 'https://journal-d-etude-beta.vercel.app'

// ── Image upload helpers ──────────────────────────────────────────────────────

const SYNC_IMG_OPTIONS = { maxWidth: 1200, maxHeight: 800, quality: 0.85, format: 'jpeg' as const }

async function shortHash(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const bytes = atob(b64)
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return { blob: new Blob([buf], { type: mime }), ext: mime.includes('png') ? 'png' : 'jpg' }
}

/**
 * Compresse et uploade une data URL vers Supabase Storage.
 * Retourne l'URL publique, ou null si l'upload échoue (fallback silencieux).
 * Déduplication automatique : même image = même hash = même fichier (upsert).
 */
async function uploadImageToStorage(dataUrl: string, userId: string): Promise<string | null> {
  if (!dataUrl.startsWith('data:')) return null
  try {
    const compressed = await compressImage(dataUrl, SYNC_IMG_OPTIONS)
    const hash = await shortHash(compressed)
    const { blob, ext } = dataUrlToBlob(compressed)
    const path = `${userId}/images/${hash}.${ext}`
    const { error } = await supabase.storage
      .from('extension-images')
      .upload(path, blob, { upsert: true, contentType: blob.type })
    if (error) throw error
    const { data } = supabase.storage.from('extension-images').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.warn('[AOK Sync] Image upload failed:', err)
    return null
  }
}

async function uploadHtmlImages(html: string, userId: string): Promise<string> {
  const regex = /(<img[^>]+src=")(data:[^"]+)("[^>]*>)/gi
  const matches = [...html.matchAll(regex)]
  let result = html
  for (const match of matches) {
    const url = await uploadImageToStorage(match[2], userId)
    if (url) result = result.replace(match[0], `${match[1]}${url}${match[3]}`)
  }
  return result
}

export interface SyncResult {
  success: boolean
  noteId?: string
  error?: string
}

/**
 * Convertit une AcademicNote en payload pour POST /api/notes.
 * Les images base64 sont uploadées vers Supabase Storage et remplacées par leurs URLs.
 */
async function toJournalPayload(note: AcademicNote, userId: string) {
  const IMAGE_TYPES = new Set(['image', 'screenshot', 'capture'])

  const [processedContent, processedMessages] = await Promise.all([
    uploadHtmlImages(note.content, userId),
    Promise.all(
      (note.messages ?? []).map(async (m) =>
        IMAGE_TYPES.has(m.type) && m.content.startsWith('data:')
          ? { ...m, content: (await uploadImageToStorage(m.content, userId)) ?? m.content }
          : m
      )
    ),
  ])

  return {
    title: note.title,
    content: processedContent,
    source: 'extension',
    sourceUrl: note.url || null,
    favicon: note.favicon ?? null,
    syncedAt: new Date().toISOString(),
    messages: processedMessages,
    folderId: note.folderId ?? null,
  }
}

/**
 * Synque une note vers le canvas dédié du journal.
 * Si la note avec la même sourceUrl existe déjà, elle est mise à jour (upsert serveur).
 * Non-bloquant : les erreurs sont loggées mais ne bloquent pas saveNote().
 */
export async function syncNoteToJournal(note: AcademicNote): Promise<SyncResult> {
  try {
    const [session, token] = await Promise.all([getSession(), getBearerToken()])
    if (!token || !session) {
      return { success: false, error: 'Not authenticated' }
    }

    // Charger la session dans l'état interne du client Supabase
    // → nécessaire pour que storage.upload() parte avec le bon JWT (auth RLS)
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    })

    const response = await fetch(`${JOURNAL_API}/api/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Extension-Source': 'trading-notes-extension',
      },
      body: JSON.stringify(await toJournalPayload(note, session.user.id)),
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
