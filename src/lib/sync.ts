import type { AcademicNote } from '@/types/academic'
import { getSession, getBearerToken } from './auth'
import { compressImage } from './image-utils'
import { supabase, SUPABASE_URL } from './supabase'

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
 * Compresse et uploade une data URL vers Supabase Storage via fetch direct.
 * Utilise le Bearer token explicitement pour éviter les problèmes d'auth
 * du client JS Supabase dans le contexte Chrome extension.
 * Retourne l'URL publique, ou null si l'upload échoue.
 * Déduplication automatique : même image = même hash = même fichier (upsert).
 */
async function uploadImageToStorage(dataUrl: string, userId: string, accessToken: string): Promise<string | null> {
  if (!dataUrl.startsWith('data:')) return null
  try {
    let compressed: string
    try {
      compressed = await compressImage(dataUrl, SYNC_IMG_OPTIONS)
    } catch {
      // Canvas indisponible (service worker MV3) — upload sans compression
      compressed = dataUrl
    }
    const hash = await shortHash(compressed)
    const { blob, ext } = dataUrlToBlob(compressed)
    const path = `${userId}/images/${hash}.${ext}`
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/extension-images/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': blob.type,
        'x-upsert': 'true',
      },
      body: blob,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      throw new Error(`${response.status} ${text}`)
    }
    return `${SUPABASE_URL}/storage/v1/object/public/extension-images/${path}`
  } catch (err) {
    console.warn('[AOK Sync] Image upload failed:', err)
    return null
  }
}

async function uploadHtmlImages(html: string, userId: string, accessToken: string): Promise<string> {
  const regex = /(<img[^>]+src=")(data:[^"]+)("[^>]*>)/gi
  const matches = [...html.matchAll(regex)]
  let result = html
  for (const match of matches) {
    const url = await uploadImageToStorage(match[2], userId, accessToken)
    if (url) {
      result = result.replace(match[0], `${match[1]}${url}${match[3]}`)
    } else {
      // Upload échoué : retirer le <img> pour éviter un payload 413
      // L'image reste dans IndexedDB (source de vérité locale)
      result = result.replace(match[0], '')
    }
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
async function toJournalPayload(note: AcademicNote, userId: string, accessToken: string) {
  const IMAGE_TYPES = new Set(['image', 'screenshot', 'capture'])

  const [processedContent, processedMessages] = await Promise.all([
    uploadHtmlImages(note.content, userId, accessToken),
    Promise.all(
      (note.messages ?? []).map(async (m) => {
        if (IMAGE_TYPES.has(m.type) && m.content.startsWith('data:')) {
          const url = await uploadImageToStorage(m.content, userId, accessToken)
          if (url) return { ...m, content: url }
          // Upload échoué → placeholder texte pour ne pas faire exploser le payload
          return { ...m, type: 'text' as const, content: '[Image visible dans l\'extension — upload Supabase Storage échoué]' }
        }
        return m
      })
    ),
  ])

  // Fallback : si content est vide (Smart Capture), reconstruire depuis les messages texte
  let finalContent = processedContent
  if (!finalContent && processedMessages.length > 0) {
    finalContent = processedMessages
      .filter(m => m.type === 'text')
      .map(m => `<p>${m.content}</p>`)
      .join('\n')
  }

  return {
    title: note.title,
    content: finalContent,
    source: 'extension',
    sourceUrl: note.url || null,
    favicon: note.favicon ?? null,
    lastSyncAt: new Date().toISOString(),
    messages: processedMessages,
    folderId: note.folderId ?? null,
    createdAt: new Date(note.timestamp).toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    extensionNoteId: note.id,
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

    const payload = await toJournalPayload(note, session.user.id, token)

    // Filet de sécurité : si le payload dépasse 3 MB, vider les messages pour éviter HTTP 413
    let body = JSON.stringify(payload)
    if (body.length > 3_000_000) {
      console.warn(`[AOK Sync] Payload trop lourd (${Math.round(body.length / 1024)} KB), messages retirés : ${note.title}`)
      body = JSON.stringify({ ...payload, messages: [] })
    }

    const response = await fetch(`${JOURNAL_API}/api/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Extension-Source': 'trading-notes-extension',
      },
      body,
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
 * Exclut les notes marquées syncExcluded: true.
 */
export async function forceSyncAll(
  notes: AcademicNote[],
  onSynced?: (noteId: string) => Promise<void>
): Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }> {
  const session = await getSession()
  if (!session) return { synced: 0, failed: 0, errors: [] }

  const unsynced = notes.filter(n => !n.lastSyncAt && !n.syncExcluded)
  let synced = 0
  let failed = 0
  const errors: Array<{ title: string; error: string }> = []

  for (const note of unsynced) {
    const result = await syncNoteToJournal(note)
    if (result.success) {
      synced++
      if (onSynced) await onSynced(note.id).catch(() => {})
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

/**
 * Récupère toutes les notes depuis le journal et les convertit en AcademicNote.
 * Utilisé pour restaurer les notes dans une nouvelle installation de l'extension.
 */
export async function pullFromJournal(): Promise<{ notes: AcademicNote[]; error?: string }> {
  const [session, token] = await Promise.all([getSession(), getBearerToken()])
  if (!token || !session) {
    return { notes: [], error: 'Non connecté — reconnecte-toi dans le compte.' }
  }

  try {
    const response = await fetch(`${JOURNAL_API}/api/notes`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Extension-Source': 'trading-notes-extension',
      },
    })

    if (!response.ok) {
      return { notes: [], error: `Erreur journal : HTTP ${response.status}` }
    }

    const journalNotes: any[] = await response.json()

    const notes: AcademicNote[] = journalNotes
      .filter((jn: any) => !jn.deletedAt)
      .map((jn: any) => {
        const url = jn.sourceUrl ?? ''
        let domain = ''
        try { domain = url ? new URL(url).hostname : '' } catch { /* ignore */ }

        return {
          id: jn.extensionNoteId ?? crypto.randomUUID(),
          title: jn.title ?? 'Note sans titre',
          content: jn.content ?? '',
          messages: (jn.messages ?? [])
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
            .map((m: any) => ({
              id: m.id ?? crypto.randomUUID(),
              type: (m.type ?? 'text') as import('@/types/academic').NoteMessageType,
              content: m.content ?? '',
              timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
            })),
          url,
          favicon: jn.favicon ?? undefined,
          timestamp: jn.createdAt ? new Date(jn.createdAt).getTime() : Date.now(),
          lastSyncAt: Date.now(),
          type: 'webpage' as const,
          metadata: { domain },
          tags: [],
          concepts: [],
        }
      })

    return { notes }
  } catch (err) {
    return { notes: [], error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

export interface VerifySyncResult {
  confirmed: number         // dans l'extension ET dans le journal (actif) ✓
  pending: number           // dans l'extension, jamais synquée, pas exclue ○
  missing: number           // dans l'extension, avait lastSyncAt, absente du journal ✗
  locallyExcluded: number   // dans l'extension, exclue manuellement (syncExcluded, pas dans journal) ⊗
  journalExcluded: number   // dans l'extension, supprimée du journal (deletedAt) → auto-exclue −
  journalOrphans: number    // dans le journal (actif) MAIS absente de l'extension ⚠ (supprimée de l'ext.)
  missingNotes: AcademicNote[]
  verifyError?: string
}

/**
 * Vérifie l'état réel de la sync en comparant les notes locales avec le journal.
 * Permet de détecter les notes "synquées localement" mais absentes du journal (ex: ancien backend).
 * Met automatiquement à jour syncExcluded pour les notes supprimées côté journal.
 */
export async function verifySyncStatus(
  notes: AcademicNote[],
  updateNote: (id: string, changes: Partial<AcademicNote>) => Promise<void>
): Promise<VerifySyncResult> {
  const [session, token] = await Promise.all([getSession(), getBearerToken()])
  if (!token || !session) {
    return { confirmed: 0, pending: 0, missing: 0, locallyExcluded: 0, journalExcluded: 0, journalOrphans: 0, missingNotes: [], verifyError: 'Non connecté — reconnecte-toi dans le compte.' }
  }

  // Scanner toutes les notes (avec ou sans URL — extensionNoteId est la clé primaire)
  const notesWithUrl = notes
  const localUrlSet = new Set(notes.filter(n => n.url).map(n => n.url))
  console.log(`[AOK Verify] Total notes : ${notes.length} (${localUrlSet.size} URLs uniques)`)

  try {
    const response = await fetch(`${JOURNAL_API}/api/notes?format=sourceUrls`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!response.ok) {
      const detail = `HTTP ${response.status}`
      console.warn('[AOK Verify] Journal unreachable:', detail)
      return { confirmed: 0, pending: 0, missing: 0, locallyExcluded: 0, journalExcluded: 0, journalOrphans: 0, missingNotes: [], verifyError: `Journal inaccessible (${detail}) — reconnecte-toi.` }
    }

    const journalNotes: Array<{ sourceUrl: string | null; extensionNoteId: string | null; deletedAt: string | null }> = await response.json()
    // Confirmed = note active dans le journal (par extensionNoteId prioritaire, sinon par URL)
    const confirmedNoteIds = new Set(journalNotes.filter(n => !n.deletedAt && n.extensionNoteId).map(n => n.extensionNoteId as string))
    const confirmedUrls = new Set(journalNotes.filter(n => !n.deletedAt && n.sourceUrl).map(n => n.sourceUrl as string))
    const excludedNoteIds = new Set(journalNotes.filter(n => n.deletedAt && n.extensionNoteId).map(n => n.extensionNoteId as string))
    const excludedUrls = new Set(journalNotes.filter(n => n.deletedAt && n.sourceUrl).map(n => n.sourceUrl as string))
    console.log(`[AOK Verify] Journal : ${journalNotes.length} notes (${confirmedNoteIds.size} actives par ID, ${confirmedUrls.size} actives par URL)`)

    // Notes actives dans le journal (par URL) mais absentes de l'extension (supprimées de l'ext.)
    const journalOrphans = [...confirmedUrls].filter(url => !localUrlSet.has(url)).length

    const missingNotes: AcademicNote[] = []
    let confirmed = 0, pending = 0, locallyExcluded = 0, journalExcluded = 0

    for (const note of notesWithUrl) {
      // Vérifier si la note est dans le journal (par ID en priorité, sinon par URL)
      const isConfirmed = confirmedNoteIds.has(note.id) || confirmedUrls.has(note.url)
      const isExcluded = excludedNoteIds.has(note.id) || excludedUrls.has(note.url)

      if (isConfirmed) {
        confirmed++
        // Réconcilier l'état local avec la réalité du journal (source de vérité)
        const updates: Partial<AcademicNote> = {}
        if (!note.lastSyncAt) updates.lastSyncAt = Date.now()
        if (note.syncExcluded) updates.syncExcluded = false
        if (Object.keys(updates).length > 0) await updateNote(note.id, updates)
      } else if (isExcluded) {
        journalExcluded++
        if (!note.syncExcluded) await updateNote(note.id, { syncExcluded: true })
      } else if (note.lastSyncAt) {
        missingNotes.push(note)    // était synquée, a disparu du journal → à re-synquer
      } else if (note.syncExcluded) {
        locallyExcluded++          // exclue manuellement par l'utilisateur
      } else {
        pending++                  // jamais synquée, pas exclue
      }
    }

    console.log(`[AOK Verify] confirmed=${confirmed} pending=${pending} missing=${missingNotes.length} locallyExcluded=${locallyExcluded} journalExcluded=${journalExcluded} journalOrphans=${journalOrphans}`)
    return { confirmed, pending, missing: missingNotes.length, locallyExcluded, journalExcluded, journalOrphans, missingNotes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur réseau'
    console.warn('[AOK Verify] Error:', err)
    return { confirmed: 0, pending: 0, missing: 0, locallyExcluded: 0, journalExcluded: 0, journalOrphans: 0, missingNotes: [], verifyError: `Erreur : ${msg}` }
  }
}
