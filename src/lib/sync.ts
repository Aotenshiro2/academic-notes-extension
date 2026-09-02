import type { AcademicNote } from '@/types/academic'
import { getSession, getBearerToken } from './auth'
import { compressImage } from './image-utils'

import { getLangue } from './i18n'
const JOURNAL_API = 'https://journal-d-etude-beta.vercel.app'

// ── Image upload helpers ──────────────────────────────────────────────────────

const SYNC_IMG_OPTIONS = { maxWidth: 1200, maxHeight: 800, quality: 0.85, format: 'jpeg' as const }

async function shortHash(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Cache local des uploads (hash → URL) ─────────────────────────────────────
// Avant : CHAQUE sync recompressait et re-téléversait TOUTES les images d'une
// note, même déjà en ligne (le serveur dédupliquait, mais le payload partait
// quand même) → « Tout renvoyer » et les re-syncs étaient interminables.
// chrome.storage.local (et pas localStorage) : le service worker synque aussi.
const UPLOAD_CACHE_KEY = 'aokUploadedImages'
const UPLOAD_CACHE_MAX = 1000

async function getUploadCache(): Promise<Record<string, string>> {
  try {
    const r = await chrome.storage.local.get(UPLOAD_CACHE_KEY)
    return (r[UPLOAD_CACHE_KEY] as Record<string, string>) ?? {}
  } catch { return {} }
}

async function rememberUpload(hash: string, url: string): Promise<void> {
  try {
    const cache = await getUploadCache()
    cache[hash] = url
    const keys = Object.keys(cache)
    if (keys.length > UPLOAD_CACHE_MAX) {
      // Purge simple des plus anciens (ordre d'insertion des clés)
      for (const k of keys.slice(0, keys.length - UPLOAD_CACHE_MAX)) delete cache[k]
    }
    await chrome.storage.local.set({ [UPLOAD_CACHE_KEY]: cache })
  } catch { /* cache best-effort */ }
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
    // Cache sur l'image BRUTE : évite compression ET upload si déjà envoyée
    const origHash = await shortHash(dataUrl)
    const cached = (await getUploadCache())[origHash]
    if (cached) return cached

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
    await rememberUpload(origHash, url as string)
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

  // Nom du dossier (+ son parent éventuel, sous-dossiers 1 niveau) — import
  // dynamique pour éviter le cycle storage → sync
  let folderName: string | null = null
  let folderParentId: string | null = null
  let folderParentName: string | null = null
  if (note.folderId) {
    try {
      const { default: storage } = await import('./storage')
      const settings = await storage.getSettings()
      const folder = settings.folders?.find(f => f.id === note.folderId)
      folderName = folder?.name ?? null
      if (folder?.parentId) {
        folderParentId = folder.parentId
        folderParentName = settings.folders?.find(f => f.id === folder.parentId)?.name ?? null
      }
    } catch { /* nom indisponible — le dossier sera upserté à une prochaine sync */ }
  }

  // Upload séquentiel pour éviter de saturer Supabase Storage (les uploads parallèles causaient des 500)
  const processedContent = await uploadHtmlImages(note.content, userId, accessToken)
  const processedMessages: typeof note.messages = []
  for (const m of note.messages ?? []) {
    // Contrat 0.1.2 : un bloc texte vide ne part JAMAIS vers le journal
    // (l'audit du 17/07 a trouvé 59 blocs vides en base — 8 % du texte)
    if (m.type === 'text' && !m.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) {
      continue
    }
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
    dols: note.dols ?? [],
    folderId: note.folderId ?? null,
    folderName,
    // Toujours présents (null = racine) : côté journal, parentId n'est mis à
    // jour QUE quand le champ existe dans le payload — l'envoyer permet aussi
    // de dé-nester un dossier redevenu racine.
    folderParentId,
    folderParentName,
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

/** Ce qu'il faut savoir d'une note pour décider de la synchroniser (résumé suffisant). */
export type SyncCandidate = Pick<AcademicNote, 'id' | 'title' | 'url' | 'lastSyncAt' | 'syncExcluded'>

/**
 * Force-synque toutes les notes non encore synquées.
 * Exclut les notes marquées syncExcluded: true (sauf si includeExcluded=true).
 */
export async function forceSyncAll(
  notes: SyncCandidate[],
  onSynced?: (noteId: string) => Promise<void>,
  options?: { includeExcluded?: boolean }
): Promise<{ synced: number; failed: number; errors: Array<{ title: string; error: string }> }> {
  const session = await getSession()
  if (!session) return { synced: 0, failed: 0, errors: [] }

  const unsynced = notes.filter(n => !n.lastSyncAt && (options?.includeExcluded || !n.syncExcluded))
  let synced = 0
  let failed = 0
  const errors: Array<{ title: string; error: string }> = []

  const { default: storage } = await import('./storage')

  for (const candidate of unsynced) {
    // La note complète est relue ICI, une à la fois : l'appelant ne manipule que
    // des résumés, sinon tout le corpus (images comprises) tiendrait en mémoire
    const note = await storage.getNote(candidate.id)
    if (!note) {
      failed++
      errors.push({ title: candidate.title, error: 'Note introuvable en base' })
      continue
    }
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
  folders?: { id: string; name: string; createdAt: number; parentId?: string }[]
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
          dols: Array.isArray(jn.dols) ? jn.dols.filter((d: unknown) => d && typeof d === 'object') : undefined,
          folderId: typeof jn.folderId === 'string' ? jn.folderId : undefined,
        }
      })

    // Dossiers — pour restaurer l'arborescence complète côté extension
    let folders: { id: string; name: string; createdAt: number; parentId?: string }[] = []
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
            ...(typeof f.parentId === 'string' && f.parentId ? { parentId: f.parentId } : {}),
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
  missingNotes: SyncCandidate[]
  verifyError?: string
}

/**
 * Vérifie l'état réel de la sync en comparant les notes locales avec le journal.
 * Permet de détecter les notes "synquées localement" mais absentes du journal (ex: ancien backend).
 * Met automatiquement à jour syncExcluded pour les notes supprimées côté journal.
 */
export async function verifySyncStatus(
  notes: SyncCandidate[],
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

    const missingNotes: SyncCandidate[] = []
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

// ── Mode mentorat ─────────────────────────────────────────────────────────────

/** Miroir de MentoratBrief côté journal (src/lib/mentorat-brief.ts) */
export interface MentoratBriefData {
  periodDays: number
  generatedAt: string
  trades: {
    total: number
    gain: number
    perte: number
    be: number
    open: number
    graded: number
    grades: Record<'A' | 'B' | 'C', number>
    causes: Record<'technique' | 'connaissance' | 'emotionnel', number>
    calibration: Record<'A' | 'B' | 'C', { gain: number; perte: number; be: number }>
  }
  warmups: {
    count: number
    avgEmotion: number | null
    cShareAfterHighEmotion: number | null
    cShareAfterLowEmotion: number | null
  }
  cooldowns: { count: number; topErrors: { text: string; count: number }[] }
  noteGrades: Record<'A' | 'B' | 'C', number>
  concepts: { name: string; count: number }[]
  monthly: { month: string; A: number; B: number; C: number }[]
  reviewBacklog: number
  text: string
}

/**
 * Récupère le brief compressé de l'élève connecté (étape 1 du mode mentorat).
 * Calculé côté backend depuis la base — le condensé qu'un prompt copié ne
 * peut pas produire.
 */
/**
 * Le cadrage par dossiers du mentorat, lu au moment de l'appel plutot que
 * passe de main en main : c'est une preference, pas un argument, et un seul
 * ecran la choisit. Meme logique que `getLangue()` juste au-dessus.
 *
 * Lecture directe du storage : importer `storage` ici creerait un cycle.
 */
async function cadrageMentorat(): Promise<string[]> {
  try {
    const { settings } = await chrome.storage.local.get('settings')
    const liste = settings?.mentoratDossiers
    return Array.isArray(liste) ? liste.filter((d: unknown): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

export async function fetchMentoratBrief(days = 90): Promise<{ brief?: MentoratBriefData; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté — connecte-toi dans le compte.' }
  try {
    const dossiers = await cadrageMentorat()
    const cadre = dossiers.length ? `&dossiers=${encodeURIComponent(dossiers.join(','))}` : ''
    const res = await fetch(`${JOURNAL_API}/api/mentorat/brief?days=${days}${cadre}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return { error: `Brief indisponible (HTTP ${res.status})` }
    return { brief: await res.json() as MentoratBriefData }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

export interface MentoratAccessData {
  entitled: boolean
  reason: 'manuel' | 'liveclub' | 'skool-vip' | 'skool-premium' | 'carnet-premium' | null
}

/** Le mode mentorat est-il ouvert pour ce compte ? (le backend décide) */
export async function fetchMentoratAccess(): Promise<{ access?: MentoratAccessData; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/mentorat/access`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return { error: `Vérification impossible (HTTP ${res.status})` }
    return { access: await res.json() as MentoratAccessData }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

export interface MentoratPlanData {
  id: string
  periodDays: number
  plan: string
  status: string
  createdAt: string
}

/** Le dernier plan d'évolution proposé/validé de l'élève */
export async function fetchLastMentoratPlan(): Promise<{ plan?: MentoratPlanData | null; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté — connecte-toi dans le compte.' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/mentorat/plan`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return { error: `Plan indisponible (HTTP ${res.status})` }
    const data = await res.json()
    return { plan: data.plan ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/** Génère une PROPOSITION de plan (notre IA propose, Brice valide) */
export async function generateMentoratPlan(days = 90): Promise<{ plan?: string; status?: string; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté — connecte-toi dans le compte.' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/mentorat/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ days, dossiers: await cadrageMentorat() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error ?? `Plan indisponible (HTTP ${res.status})` }
    return { plan: data.plan, status: data.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/** Retire un jugement côté journal (la sync n'efface jamais d'elle-même) */
export async function deleteJournalAnnotation(annotationId: string): Promise<void> {
  try {
    const token = await getBearerToken()
    if (!token) return
    await fetch(`${JOURNAL_API}/api/annotations`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: annotationId }),
    })
  } catch { /* best effort — la note locale est déjà retirée */ }
}

// ── Support IA ────────────────────────────────────────────────────────────────

export async function sendSupportMessage(message: string, threadId?: string | null): Promise<{ threadId?: string; reply?: string; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté — connecte-toi dans le compte pour contacter le support.' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/support/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ message, threadId: threadId ?? undefined, app: 'extension' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error ?? `Support indisponible (HTTP ${res.status})` }
    return { threadId: data.threadId, reply: data.reply }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/**
 * « Parler à un humain » : marque le fil escaladé. Si le backend a pu envoyer
 * l'email serveur à l'équipe (`notified`), le client n'a RIEN d'autre à faire ;
 * sinon il retombe sur le mailto v1 avec l'adresse renvoyée.
 */
export async function escalateSupport(threadId?: string | null): Promise<{ email?: string; notified?: boolean; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { email: 'brice.d@aoknowledge.com', notified: false }
  try {
    const res = await fetch(`${JOURNAL_API}/api/support/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ threadId: threadId ?? undefined }),
    })
    const data = await res.json().catch(() => ({}))
    return { email: data.email ?? 'brice.d@aoknowledge.com', notified: data.notified === true }
  } catch {
    return { email: 'brice.d@aoknowledge.com', notified: false }
  }
}

/**
 * Le dernier fil de support de l'utilisateur, pour ROUVRIR la conversation au
 * lieu de repartir de zéro : c'est par là qu'arrivent les réponses humaines
 * posées depuis le cockpit.
 */
export async function fetchSupportThread(): Promise<{
  threadId: string | null
  messages: { role: string; content: string; at?: string }[]
}> {
  const token = await getBearerToken()
  if (!token) return { threadId: null, messages: [] }
  try {
    const res = await fetch(`${JOURNAL_API}/api/support/thread`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return { threadId: null, messages: [] }
    const data = await res.json().catch(() => ({}))
    return {
      threadId: typeof data.threadId === 'string' ? data.threadId : null,
      messages: Array.isArray(data.messages) ? data.messages : [],
    }
  } catch {
    return { threadId: null, messages: [] }
  }
}

// ── Capture intelligente IA (1.8.0) ──────────────────────────────────────────
//
// Deux temps, deux routes. Le SECRÉTAIRE trie ce que la page dit vraiment ;
// l'ÉTUDE relit la note dans le cadre de l'académie et n'est demandée que par
// un geste de l'élève.
//
// Règle du client : on essaie l'IA, et on RETOMBE sur les heuristiques dès
// qu'on n'a pas un 200. Quota atteint, clé morte, réseau coupé : la capture
// marche quand même, en moins bien. Le backend décide de tout, l'extension
// n'a jamais à savoir qui a droit à quoi.

export type NiveauIA = 'club' | 'premium' | 'libre' | 'aucun'

export interface ModeleEtudeAffiche {
  id: string
  nom: string
  detail: string
  /** palier minimum qui le débloque */
  requis: 'libre' | 'premium' | 'club'
  debloque: boolean
  /** ordre de grandeur d'études restantes dans le budget ; null si sans plafond */
  etudesRestantes: number | null
}

export interface AccesCaptureIA {
  niveau: NiveauIA
  capture: boolean
  etude: boolean
  autorise: boolean
  motif?: string
  message?: string | null
  /** part du quota consommée sur 30 jours glissants, 0 à 1 — pour la jauge */
  part: number
  /** compte maison : pas de jauge à afficher */
  sansPlafond?: boolean
  /** catalogue des modèles d'étude, avec ce que le palier débloque */
  modeles?: ModeleEtudeAffiche[]
  /** le modèle qui sera réellement employé, après arbitrage du serveur */
  modeleActif?: string | null
  modeleDefaut?: string
}

/** Ce que le compte a le droit de faire, où en est sa jauge, et quels modèles
 *  son palier débloque. `prefere` n'est qu'une proposition : le serveur répond
 *  avec le modèle qu'il emploiera réellement. */
export async function fetchAccesCaptureIA(prefere?: string | null): Promise<{ acces?: AccesCaptureIA; error?: string }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté' }
  try {
    const q = prefere ? `?modele=${encodeURIComponent(prefere)}` : ''
    const res = await fetch(`${JOURNAL_API}/api/capture/acces${q}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return { error: `Vérification impossible (HTTP ${res.status})` }
    return { acces: await res.json() as AccesCaptureIA }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

export interface SortieCaptureIA {
  titre: string
  resume: string
  pointsCles: string[]
  concepts: string[]
  tags: string[]
  /** secrétaire seulement : ce qui n'a pas pu être lu */
  manquant?: string
  /** étude seulement : la lecture dans le cadre */
  pourToi?: string
  famille?: string
  avecImage?: boolean
  budget?: { part: number; niveau: NiveauIA; etude: boolean }
}

export interface DemandeCaptureIA {
  url: string
  contenu: string
  /** data URL du screenshot, ou URL publique si la note est déjà synchronisée */
  image?: string | null
  noteId?: string
  /** modèle préféré pour l'étude — une PROPOSITION, le serveur tranche */
  modele?: string | null
  /** langue d'usage : la sortie du modèle la suit */
  langue?: string | null
  /** Canvas du journal : ids des vraies notes visibles — le serveur les
   *  résout en contenu réel (famille maison qui lit le journal) */
  journalNoteIds?: string[]
  /** Liens tracés entre les cartes du canvas (source, cible) */
  journalLiens?: [string, string][]
}

async function posterCapture(
  chemin: string,
  d: DemandeCaptureIA
): Promise<{ sortie?: SortieCaptureIA; error?: string; statut?: number }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté' }
  try {
    const res = await fetch(`${JOURNAL_API}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(d),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}`, statut: res.status }
    }
    return { sortie: data as SortieCaptureIA, statut: res.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}

/** 1er temps — le secrétaire. Échec = l'appelant garde ses heuristiques. */
export function capturerAvecIA(d: DemandeCaptureIA) {
  return posterCapture('/api/capture', d)
}

/** 2e temps — l'étude. Déclenchée par le bouton, jamais automatiquement. */
export function etudierNoteAvecIA(d: DemandeCaptureIA) {
  return posterCapture('/api/capture/analyse', d)
}

// ── Mentorat conversationnel (1.8.1) ─────────────────────────────────────────
//
// Le fil vit dans la note épinglée « Mentorat AOK », côté extension : le
// serveur ne stocke rien, il répond à un tour. Écrire dans la note est gratuit
// et n'appelle jamais cette route ; seul le bouton « demander au mentor » le
// fait. Même grammaire que la capture, où le secrétaire écrit et l'étude
// demande.

export interface TourConversation {
  role: 'user' | 'assistant'
  content: string
}

export async function demanderAuMentor(
  messages: TourConversation[],
  days = 90
): Promise<{ reply?: string; error?: string; statut?: number }> {
  const token = await getBearerToken()
  if (!token) return { error: 'Non connecté' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/mentorat/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ messages, days, langue: getLangue(), dossiers: await cadrageMentorat() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { error: typeof data.message === 'string' ? data.message : `HTTP ${res.status}`, statut: res.status }
    }
    return { reply: typeof data.reply === 'string' ? data.reply : '', statut: res.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur réseau' }
  }
}
