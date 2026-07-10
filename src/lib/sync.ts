import type { AcademicNote } from '@/types/academic'
import { getSession, getBearerToken } from './auth'
import { compressImage } from './image-utils'

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
 * Uploade une image via le proxy du journal (POST /api/upload-image).
 * Le proxy utilise la service role Supabase côté serveur → plus de 500.
 * Déduplication automatique : même image = même hash = même fichier (upsert).
 */
async function uploadImageToStorage(dataUrl: string, userId: string, accessToken: string): Promise<string | null> {
  if (!dataUrl.startsWith('data:')) return null
  try {
    let compressed: string
    try {
      compressed = await compressImage(dataUrl, SYNC_IMG_OPTIONS)
    } catch {
      compressed = dataUrl
    }
    const hash = await shortHash(compressed)
    const { ext } = dataUrlToBlob(compressed)
    const path = `images/${hash}.${ext}`

    const response = await fetch(`${JOURNAL_API}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ imageDataUrl: compressed, path }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const { url } = await response.json()
    return url as string
  } catch (err) {
    console.warn('[AOK Sync] Image upload failed:', err)
    return null
  }
}

async function uploadHtmlImages(html: string, userId: string, accessToken: string): Promise<string> {
  const regex = /(<img[^>]+src=["'])(data:[^"']+)(["'][^>]*>)/gi
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

// Warmups à synchroniser : les entrées multi-séances + le legacy note.warmup
// (converti en entrée avec id stable pour l'idempotence côté journal)
function collectWarmups(note: AcademicNote) {
  const list = [...(note.warmups ?? [])]
  const w = note.warmup
  if (w && (w.physical || w.emotional || w.dominantThought || w.objective || w.emotionLevel !== undefined)) {
    list.unshift({ ...w, id: w.id ?? `legacy-${note.id}`, startedAt: w.startedAt ?? w.doneAt ?? note.timestamp })
  }
  return list
}

/**
 * Convertit une AcademicNote en payload pour POST /api/notes.
 * Les images base64 sont uploadées vers Supabase Storage et remplacées par leurs URLs.
 */
async function toJournalPayload(note: AcademicNote, userId: string, accessToken: string) {
  const IMAGE_TYPES = new Set(['image', 'screenshot', 'capture'])

  // Nom du dossier — import dynamique pour éviter le cycle storage → sync
  let folderName: string | null = null
  if (note.folderId) {
    try {
      const { default: storage } = await import('./storage')
      const settings = await storage.getSettings()
      folderName = settings.folders?.find(f => f.id === note.folderId)?.name ?? null
    } catch { /* nom indisponible — le dossier sera upserté à une prochaine sync */ }
  }

  // Upload séquentiel pour éviter de saturer Supabase Storage (les uploads parallèles causaient des 500)
  const processedContent = await uploadHtmlImages(note.content, userId, accessToken)
  const processedMessages: typeof note.messages = []
  for (const m of note.messages ?? []) {
    if (IMAGE_TYPES.has(m.type) && m.content.startsWith('data:')) {
      const url = await uploadImageToStorage(m.content, userId, accessToken)
      if (url) {
        processedMessages.push({ ...m, content: url })
      } else {
        // Upload échoué → placeholder texte pour ne pas faire exploser le payload
        processedMessages.push({ ...m, type: 'text' as const, content: '[Image visible dans l\'extension — upload Supabase Storage échoué]' })
      }
    } else {
      processedMessages.push(m)
    }
  }

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
    messages: processedMessages.map(m => ({ ...m, tags: m.tags ?? [] })),
    // Jugements au niveau note — persistés côté journal (NoteTag / Note.concepts)
    tags: note.tags ?? [],
    concepts: note.concepts ?? [],
    trades: note.trades ?? [],
    warmups: collectWarmups(note),
    folderId: note.folderId ?? null,
    folderName,
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

    // Pousser les annotations (notation A/B/C) — upsert idempotent par id client
    await syncAnnotations(note, token)

    return { success: true, noteId: data.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error'
    console.warn('[AOK Sync] ✗', note.title, '—', error)
    return { success: false, error }
  }
}

/**
 * Pousse les annotations d'une note vers le journal (POST /api/annotations).
 * Idempotent : l'id client (uuid) fait office de clé d'upsert côté serveur.
 * Non-bloquant : une annotation qui échoue repartira à la prochaine sync.
 */
async function syncAnnotations(note: AcademicNote, token: string): Promise<void> {
  const annotations = note.annotations ?? []
  for (const a of annotations) {
    try {
      await fetch(`${JOURNAL_API}/api/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: a.id,
          noteId: note.id, // extensionNoteId — résolu côté serveur
          messageRef: a.messageRef ?? null,
          tradeRef: a.tradeRef ?? null,
          grade: a.grade,
          phrase: a.phrase,
          causeCategory: a.causeCategory ?? null,
          reviewDueAt: a.reviewDueAt ? new Date(a.reviewDueAt).toISOString() : undefined,
          reviewedAt: a.reviewedAt ? new Date(a.reviewedAt).toISOString() : undefined,
        }),
      })
    } catch (err) {
      console.warn('[AOK Sync] Annotation sync failed:', err)
    }
  }
}

/**
 * Force-synque toutes les notes non encore synquées.
 * Exclut les notes marquées syncExcluded: true (sauf si includeExcluded=true).
 */
export async function forceSyncAll(
  notes: AcademicNote[],
  onSynced?: (noteId: string) => Promise<void>,
  options?: { includeExcluded?: boolean }
): Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }> {
  const session = await getSession()
  if (!session) return { synced: 0, failed: 0, errors: [] }

  const unsynced = notes.filter(n => !n.lastSyncAt && (options?.includeExcluded || !n.syncExcluded))
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
 * Supprime toutes les notes de l'utilisateur dans le journal en ligne.
 * Utilisé avant "Reconstruire le journal" pour repartir sur une base propre.
 */
export async function deleteJournalNotes(): Promise<{ ok: boolean; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { ok: false, error: 'Non connecté — reconnecte-toi dans le compte.' }

  try {
    const res = await fetch(`${JOURNAL_API}/api/notes`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Extension-Source': 'trading-notes-extension',
      },
    })
    if (!res.ok) return { ok: false, error: `Erreur serveur (${res.status})` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/**
 * Récupère toutes les notes depuis le journal et les convertit en AcademicNote.
 * Utilisé pour restaurer les notes dans une nouvelle installation de l'extension.
 */
export async function pullFromJournal(): Promise<{
  notes: AcademicNote[]
  folders?: { id: string; name: string; createdAt: number }[]
  error?: string
}> {
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
          tags: Array.isArray(jn.tags) ? jn.tags.filter((t: unknown) => typeof t === 'string') : [],
          concepts: Array.isArray(jn.concepts) ? jn.concepts.filter((c: unknown) => typeof c === 'string') : [],
          trades: Array.isArray(jn.trades) ? jn.trades : [],
          warmups: Array.isArray(jn.warmups) ? jn.warmups.filter((w: unknown) => w && typeof w === 'object') : undefined,
          folderId: typeof jn.folderId === 'string' ? jn.folderId : undefined,
        }
      })

    // Dossiers — pour restaurer l'arborescence complète côté extension
    let folders: { id: string; name: string; createdAt: number }[] = []
    try {
      const foldersRes = await fetch(`${JOURNAL_API}/api/folders`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (foldersRes.ok) {
        const journalFolders: any[] = await foldersRes.json()
        folders = journalFolders
          .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
          .map(f => ({
            id: f.id,
            name: f.name,
            createdAt: f.createdAt ? new Date(f.createdAt).getTime() : Date.now(),
          }))
      }
    } catch { /* pas bloquant — les notes restent importables sans l'arborescence */ }

    return { notes, folders }
  } catch (err) {
    return { notes: [], folders: [], error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

export interface UserTag {
  id: string
  name: string
  color: string
  category?: string | null
}

/**
 * Fetch all tags for the current user from the journal.
 * Used by the tag picker in MessageBlock.
 */
export async function fetchUserTags(): Promise<UserTag[]> {
  const token = await getBearerToken()
  if (!token) return []
  try {
    const res = await fetch(`${JOURNAL_API}/api/tags`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
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
