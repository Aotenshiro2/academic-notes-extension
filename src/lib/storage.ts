import Dexie from 'dexie'
import { stateSync } from './state-sync'
import { getSession } from './auth'
import { syncNoteToJournal } from './sync'
import { compressImage, estimateImageSize, prepareImageForStorage, COMPRESSION_PRESETS } from './image-utils'
import type {
  AcademicNote,
  NoteFolder,
  NoteMessage,
  NoteMessageType,
  Screenshot,
  ExtractedText,
  Settings,
  SyncStatus,
  AIConfig,
  NoteSummary
} from '@/types/academic'

/**
 * Convert legacy HTML content to NoteMessage array
 * Splits content on <br><br> separators and detects images
 */
function convertLegacyContentToMessages(content: string, noteTimestamp: number): NoteMessage[] {
  if (!content || content.trim() === '') {
    return []
  }

  const messages: NoteMessage[] = []

  // Split on double line breaks (the legacy separator)
  const segments = content.split(/<br\s*\/?>\s*<br\s*\/?>/gi)

  segments.forEach((segment, index) => {
    const trimmedSegment = segment.trim()
    if (!trimmedSegment) return

    // Check if this segment contains an image
    const imgMatch = trimmedSegment.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)

    if (imgMatch) {
      // Extract image from segment
      const imgSrc = imgMatch[1]
      const altMatch = trimmedSegment.match(/alt=["']([^"']+)["']/i)
      const alt = altMatch ? altMatch[1] : undefined

      // If there's text before the image, add it as a separate message
      const beforeImg = trimmedSegment.substring(0, imgMatch.index).trim()
      if (beforeImg && beforeImg !== '<p>' && beforeImg !== '</p>') {
        messages.push({
          id: `${noteTimestamp}-${index}-text`,
          type: 'text',
          content: beforeImg,
          timestamp: noteTimestamp + index
        })
      }

      // Add the image as a message
      messages.push({
        id: `${noteTimestamp}-${index}-img`,
        type: imgSrc.startsWith('data:') ? 'screenshot' : 'image',
        content: imgSrc,
        timestamp: noteTimestamp + index + 1,
        metadata: alt ? { alt } : undefined
      })

      // If there's text after the image, add it as a separate message
      const afterImg = trimmedSegment.substring((imgMatch.index || 0) + imgMatch[0].length).trim()
      if (afterImg && afterImg !== '<p>' && afterImg !== '</p>' && afterImg.replace(/<[^>]*>/g, '').trim()) {
        messages.push({
          id: `${noteTimestamp}-${index}-text-after`,
          type: 'text',
          content: afterImg,
          timestamp: noteTimestamp + index + 2
        })
      }
    } else {
      // Pure text segment
      const cleanText = trimmedSegment.replace(/<[^>]*>/g, '').trim()
      if (cleanText) {
        messages.push({
          id: `${noteTimestamp}-${index}`,
          type: 'text',
          content: trimmedSegment,
          timestamp: noteTimestamp + index
        })
      }
    }
  })

  return messages
}

class AcademicNotesDB extends Dexie {
  notes!: Dexie.Table<AcademicNote, string>
  screenshots!: Dexie.Table<Screenshot, string>
  extracts!: Dexie.Table<ExtractedText, string>

  constructor() {
    super('AcademicNotesDB')

    // Version 1: Original schema
    this.version(1).stores({
      notes: 'id, title, url, timestamp, type, *tags, *concepts',
      screenshots: 'id, noteId, url, timestamp',
      extracts: 'id, noteId, timestamp, source'
    })

    // Version 2: Add messages field for individual message support
    this.version(2).stores({
      notes: 'id, title, url, timestamp, type, *tags, *concepts',
      screenshots: 'id, noteId, url, timestamp',
      extracts: 'id, noteId, timestamp, source'
    }).upgrade(tx => {
      // Migrate existing notes to have messages array
      return tx.table('notes').toCollection().modify((note: AcademicNote) => {
        if (!note.messages && note.content) {
          note.messages = convertLegacyContentToMessages(note.content, note.timestamp)
        }
      })
    })

    // Version 3: Add folderId index for folder grouping
    this.version(3).stores({
      notes: 'id, title, url, timestamp, type, folderId, *tags, *concepts',
      screenshots: 'id, noteId, url, timestamp',
      extracts: 'id, noteId, timestamp, source'
    })
  }
}

const db = new AcademicNotesDB()

// Handle versionchange events (another tab/connection opened with newer version)
db.on('versionchange', () => {
  console.warn('[Storage] Database version changed by another connection, closing...')
  db.close()
})

// ---- BACKUP SYSTEM (incrémental : une clé par note) ----
// Protège d'une perte IndexedDB (mise à jour Chrome, corruption, pression disque).
//
// AVANT (<= 1.6.9) : chaque saveNote reprogrammait une sauvegarde TOTALE —
// db.notes.toArray() sur toute la base, puis sérialisation complète vers
// chrome.storage.local. Renommer une note recopiait donc l'intégralité du corpus
// en mémoire, ce qui faisait tuer le processus de rendu par Chrome
// (« Out of Memory », remonté le 05/08 — y compris sur une note vide, puisque le
// coût ne dépendait pas de la note ouverte mais du poids total accumulé).
//
// MAINTENANT : on n'écrit que la note modifiée. Le balayage complet ne sert plus
// qu'à la reprise et au rattrapage périodique, et il passe par les clés primaires
// puis note par note — jamais plus d'un enregistrement en mémoire.

const NOTE_BACKUP_PREFIX = 'nb_'
const NOTE_BACKUP_INDEX = 'nb_index'

// Anciens créneaux (format <= 1.6.9), gardés en LECTURE pour la reprise ;
// supprimés dès qu'une sauvegarde incrémentale complète les remplace
const BACKUP_SLOT_KEYS = ['notes_backup_0', 'notes_backup_1'] as const
const BACKUP_TS_KEYS = ['notes_backup_ts_0', 'notes_backup_ts_1'] as const
const BACKUP_ACTIVE_KEY = 'notes_backup_active' // 0 or 1

let restoredFromBackup = false
let backupIndexCache: string[] | null = null

// Les sauvegardes s'exécutent à la queue leu leu. Deux écritures concurrentes
// lisaient l'index en même temps et se réécrivaient l'une l'autre : la note de
// la plus lente disparaissait de l'index, donc de la reprise — sa donnée restait
// en place mais plus personne n'allait la chercher.
let backupQueue: Promise<unknown> = Promise.resolve()

function queueBackup<T>(task: () => Promise<T>): Promise<T> {
  const next = backupQueue.then(task, task)
  backupQueue = next.catch(() => undefined)
  return next
}

async function getBackupIndex(): Promise<string[]> {
  if (backupIndexCache) return backupIndexCache
  const result = await chrome.storage.local.get(NOTE_BACKUP_INDEX)
  backupIndexCache = (result[NOTE_BACKUP_INDEX] as string[] | undefined) ?? []
  return backupIndexCache
}

async function setBackupIndex(ids: string[]): Promise<void> {
  backupIndexCache = ids
  await chrome.storage.local.set({ [NOTE_BACKUP_INDEX]: ids })
}

/**
 * Sauvegarde d'UNE note. Jamais bloquant : un échec de sauvegarde ne doit pas
 * faire échouer l'écriture principale, qui est déjà passée en base.
 */
async function backupNote(note: AcademicNote): Promise<boolean> {
  return queueBackup(async () => {
    try {
      await chrome.storage.local.set({ [NOTE_BACKUP_PREFIX + note.id]: note })
      const index = await getBackupIndex()
      if (!index.includes(note.id)) await setBackupIndex([...index, note.id])
      return true
    } catch (error) {
      console.warn('[Storage] Sauvegarde de la note impossible:', error)
      return false
    }
  })
}

async function removeNoteBackup(id: string): Promise<void> {
  return queueBackup(async () => {
    try {
      await chrome.storage.local.remove(NOTE_BACKUP_PREFIX + id)
      const index = await getBackupIndex()
      if (index.includes(id)) await setBackupIndex(index.filter(x => x !== id))
    } catch (error) {
      console.warn('[Storage] Retrait de la sauvegarde impossible:', error)
    }
  })
}

/**
 * Rattrapage complet, une note à la fois. Réservé au service worker : s'il meurt,
 * le panneau de l'utilisateur survit. Ne supprime les anciens créneaux qu'APRÈS un
 * passage réellement complet — on ne détruit jamais la seule sauvegarde en place.
 */
async function runFullBackup(): Promise<number> {
  let saved = 0
  try {
    const ids = (await db.notes.toCollection().primaryKeys()) as string[]
    if (ids.length === 0) return 0
    for (const id of ids) {
      const note = await db.notes.get(id)
      if (note && await backupNote(note)) saved++
    }
    // On ne supprime l'ancienne sauvegarde QUE si chaque note a réellement été
    // réécrite. `backupNote` avale ses erreurs : compter les tours de boucle
    // aurait déclaré « complet » un passage où toutes les écritures ont échoué,
    // et détruit la seule sauvegarde encore valide.
    if (saved > 0 && saved === ids.length) {
      await chrome.storage.local.remove([...BACKUP_SLOT_KEYS, ...BACKUP_TS_KEYS, BACKUP_ACTIVE_KEY])
    }
  } catch (error) {
    console.error('[Storage] Rattrapage de sauvegarde échoué:', error)
  }
  return saved
}

/** Reprise depuis les sauvegardes par note, par lots pour borner la mémoire. */
async function restoreFromNoteBackups(): Promise<number> {
  const index = await getBackupIndex()
  if (index.length === 0) return 0
  let restored = 0
  const BATCH = 10
  for (let i = 0; i < index.length; i += BATCH) {
    const keys = index.slice(i, i + BATCH).map(id => NOTE_BACKUP_PREFIX + id)
    const chunk = await chrome.storage.local.get(keys)
    const notes = Object.values(chunk).filter(Boolean) as AcademicNote[]
    if (notes.length > 0) {
      await db.notes.bulkPut(notes)
      restored += notes.length
    }
  }
  return restored
}

/**
 * Read backup notes from a specific slot. Returns null if empty/missing.
 */
async function readBackupSlot(slot: number): Promise<{ notes: AcademicNote[]; timestamp: number } | null> {
  const result = await chrome.storage.local.get([BACKUP_SLOT_KEYS[slot], BACKUP_TS_KEYS[slot]])
  const notes = result[BACKUP_SLOT_KEYS[slot]] as AcademicNote[] | undefined
  const ts = result[BACKUP_TS_KEYS[slot]] as number | undefined
  if (!notes || notes.length === 0) return null
  return { notes, timestamp: ts || 0 }
}

/**
 * Check if IndexedDB lost data and restore from chrome.storage.local backup.
 * Tries active slot first, then falls back to the other slot.
 * Returns true if restoration happened.
 */
async function checkAndRestore(): Promise<boolean> {
  try {
    const count = await db.notes.count()
    if (count > 0) return false // DB has data, nothing to restore

    // Format courant : une clé par note (lu par lots, mémoire bornée)
    const restoredCount = await restoreFromNoteBackups()
    if (restoredCount > 0) {
      restoredFromBackup = true
      console.log(`[Storage] ${restoredCount} note(s) restaurée(s) depuis la sauvegarde`)
      return true
    }

    // Repli : anciens créneaux monolithiques (<= 1.6.9)
    const result = await chrome.storage.local.get(BACKUP_ACTIVE_KEY)
    const activeSlot: number = result[BACKUP_ACTIVE_KEY] ?? 0
    const fallbackSlot = activeSlot === 0 ? 1 : 0
    const backup = await readBackupSlot(activeSlot) || await readBackupSlot(fallbackSlot)
    if (!backup) return false

    console.warn(
      `[Storage] IndexedDB empty but backup found (${backup.notes.length} notes from ${new Date(backup.timestamp).toLocaleString()}). Restoring...`
    )

    await db.notes.bulkPut(backup.notes)
    restoredFromBackup = true
    console.log(`[Storage] Restored ${backup.notes.length} notes from backup`)
    return true
  } catch (error) {
    console.error('[Storage] Restore from backup failed:', error)
    return false
  }
}

// Gestion des paramètres avec Chrome Storage
const DEFAULT_SETTINGS: Settings = {
  autoCapture: false,
  aiSummaryEnabled: true,
  analysisProvider: 'chatgpt',
  providerThreadUrls: {},
  defaultTags: [],
  folders: [],
  journalSync: {
    lastSync: 0,
    pendingNotes: [],
    syncEnabled: false,
    journalAppUrl: 'https://journal-d-etude-beta.vercel.app'
  },
  captureScreenshots: true,
  extractMainContent: true,
  language: 'fr'
}

const PREVIEW_LENGTH = 300
const SEARCH_TEXT_LENGTH = 2000
// Au-delà, une image stockée est considérée comme trop lourde et recompressée
const COMPACT_IMAGE_THRESHOLD = 400_000

/** Texte brut depuis du HTML, SANS DOM (storage tourne aussi dans le service worker). */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Poids approximatif, par longueur de chaîne : ne jamais sérialiser la note pour la mesurer. */
function approximateNoteSize(note: AcademicNote): number {
  let size = (note.content?.length ?? 0) + (note.title?.length ?? 0)
  for (const m of note.messages ?? []) size += m.content?.length ?? 0
  for (const sc of note.screenshots ?? []) size += sc.dataUrl?.length ?? 0
  return size
}

function toSummary(note: AcademicNote): NoteSummary {
  const messages = note.messages ?? []
  const messageTags = new Set<string>()
  let preview = ''
  let imageCount = 0

  for (const m of messages) {
    for (const t of m.tags ?? []) messageTags.add(t)
    if (m.type === 'text') {
      if (preview.length < SEARCH_TEXT_LENGTH) {
        const chunk = stripHtmlToText(m.content.slice(0, SEARCH_TEXT_LENGTH))
        if (chunk) preview += (preview ? ' ' : '') + chunk
      }
    } else if (m.type !== 'meta') {
      imageCount++
    }
  }

  if (!preview && note.content) preview = stripHtmlToText(note.content)
  const searchText = preview.slice(0, SEARCH_TEXT_LENGTH)
  imageCount += note.screenshots?.length ?? 0

  return {
    id: note.id,
    title: note.title,
    timestamp: note.timestamp,
    url: note.url,
    favicon: note.favicon,
    type: note.type,
    tags: note.tags ?? [],
    concepts: note.concepts ?? [],
    folderId: note.folderId,
    lastSyncAt: note.lastSyncAt,
    syncExcluded: note.syncExcluded,
    metadata: note.metadata ?? { domain: '', title: note.title, language: 'fr' },
    summary: note.summary,
    annotationCount: note.annotations?.length ?? 0,
    preview: preview.slice(0, PREVIEW_LENGTH),
    searchText,
    messageTags: [...messageTags],
    imageCount,
    hasOpenTrade: (note.trades ?? []).some(t => !t.closedAt),
    sizeBytes: approximateNoteSize(note)
  }
}

// API du stockage
export const storage = {
  // ---- NOTES ----
  async saveNote(note: Omit<AcademicNote, 'id'> & { id?: string }, skipSync = false): Promise<string> {
    const isNew = !note.id
    const id = note.id || crypto.randomUUID()
    const fullNote: AcademicNote = {
      ...note,
      id,
      timestamp: note.timestamp || Date.now(),
      lastSyncAt: note.lastSyncAt
    }

    try {
      await db.notes.put(fullNote)
    } catch (error) {
      const isQuotaError = error instanceof DOMException && (
        error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      )
      if (isQuotaError) {
        console.error('[Storage] Quota IndexedDB dépassé — supprime des anciennes notes pour libérer de l\'espace')
        throw new Error('Espace de stockage insuffisant. Supprime des anciennes notes.')
      }
      console.error('[Storage] saveNote failed:', error)
      throw error
    }

    // Sauvegarde de CETTE note uniquement (voir le bloc BACKUP SYSTEM ci-dessus)
    void backupNote(fullNote)

    // Cloud sync vers Journal d'Études (non-bloquant)
    if (isNew && !fullNote.lastSyncAt) {
      // Nouvelle note : sync initiale
      getSession().then(session => {
        if (session) {
          syncNoteToJournal(fullNote).then(result => {
            if (result.success) {
              db.notes.update(id, { lastSyncAt: Date.now() }).catch(() => {})
            } else {
              console.warn('[AOK Sync] Failed:', result.error, '— note:', fullNote.title)
            }
          }).catch((err) => {
            console.error('[AOK Sync] Exception:', err)
          })
        }
      }).catch(() => {})
    } else if (!isNew && fullNote.lastSyncAt && !skipSync) {
      // Note modifiée déjà synquée : propager les modifications vers le journal
      getSession().then(session => {
        if (session) {
          syncNoteToJournal(fullNote).then(result => {
            if (!result.success) {
              console.warn('[AOK Sync] Re-sync failed:', result.error, '— note:', fullNote.title)
            }
          }).catch(err => console.error('[AOK Sync] Re-sync exception:', err))
        }
      }).catch(() => {})
    }

    // Broadcast sync event to other views
    if (!skipSync) {
      if (isNew) {
        stateSync.noteCreated(id)
      } else {
        stateSync.noteUpdated(id)
      }
    }

    return id
  },

  async getNote(id: string): Promise<AcademicNote | undefined> {
    return await db.notes.get(id)
  },

  async updateNote(id: string, changes: Partial<AcademicNote>): Promise<void> {
    await db.notes.update(id, changes)
  },

  async getNotes(limit = 50, offset = 0): Promise<AcademicNote[]> {
    try {
      // Tri par ID (= date de création) pour un ordre chronologique stable
      const notes = await db.notes
        .orderBy('id')
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray()

      // If DB is empty on first load, try to restore from backup
      if (notes.length === 0 && offset === 0 && !restoredFromBackup) {
        const restored = await checkAndRestore()
        if (restored) {
          // Re-query after restoration
          return await db.notes
            .orderBy('id')
            .reverse()
            .offset(offset)
            .limit(limit)
            .toArray()
        }
      }

      return notes
    } catch (error) {
      console.error('[Storage] getNotes failed:', error)
      // Attempt restore from backup on DB error
      if (!restoredFromBackup) {
        try {
          const activeResult = await chrome.storage.local.get(BACKUP_ACTIVE_KEY)
          const activeSlot: number = activeResult[BACKUP_ACTIVE_KEY] ?? 0
          const fallbackSlot = activeSlot === 0 ? 1 : 0
          const backup = await readBackupSlot(activeSlot) || await readBackupSlot(fallbackSlot)
          if (backup) {
            console.warn(`[Storage] Returning ${backup.notes.length} notes from backup (DB error fallback)`)
            restoredFromBackup = true
            return backup.notes.slice(offset, offset + limit)
          }
        } catch (backupError) {
          console.error('[Storage] Backup fallback also failed:', backupError)
        }
      }
      return []
    }
  },

  /**
   * Résumés des notes pour les listes : le curseur Dexie déserialise UNE note à
   * la fois, on n'en garde que la version allégée. Le corpus complet (donc toutes
   * les images en base64) n'est jamais matérialisé en mémoire — c'était la cause
   * des plantages « Out of Memory ».
   */
  async getNoteSummaries(limit = 1000, offset = 0): Promise<NoteSummary[]> {
    try {
      const summaries: NoteSummary[] = []
      await db.notes
        .orderBy('id')
        .reverse()
        .offset(offset)
        .limit(limit)
        .each(note => { summaries.push(toSummary(note)) })

      if (summaries.length === 0 && offset === 0 && !restoredFromBackup) {
        const restored = await checkAndRestore()
        if (restored) {
          const retry: NoteSummary[] = []
          await db.notes
            .orderBy('id')
            .reverse()
            .offset(offset)
            .limit(limit)
            .each(note => { retry.push(toSummary(note)) })
          return retry
        }
      }

      return summaries
    } catch (error) {
      console.error('[Storage] getNoteSummaries failed:', error)
      return []
    }
  },

  /** Notes complètes pour une poignée d'identifiants (synchro, analyse, export). */
  async getNotesByIds(ids: string[]): Promise<AcademicNote[]> {
    const notes: AcademicNote[] = []
    for (const id of ids) {
      const note = await db.notes.get(id)
      if (note) notes.push(note)
    }
    return notes
  },

  async searchNotes(query: string): Promise<NoteSummary[]> {
    const searchTerm = query.toLowerCase()
    const results: NoteSummary[] = []
    await db.notes.each(note => {
      const match =
        note.title.toLowerCase().includes(searchTerm) ||
        note.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
        note.url.toLowerCase().includes(searchTerm)
      if (match) { results.push(toSummary(note)); return }
      // Repli sur le texte, sans jamais parcourir le base64 des images
      const summary = toSummary(note)
      if (summary.searchText.toLowerCase().includes(searchTerm)) results.push(summary)
    })
    return results
  },

  /**
   * Poids du corpus, mesuré par curseur (une note à la fois). Sert à objectiver
   * la saturation mémoire : sans chiffre, on corrige à l'aveugle.
   */
  async computeStorageStats(): Promise<{
    noteCount: number
    totalBytes: number
    imageBytes: number
    imageCount: number
    heaviest: { id: string; title: string; bytes: number }[]
  }> {
    let noteCount = 0
    let totalBytes = 0
    let imageBytes = 0
    let imageCount = 0
    const heaviest: { id: string; title: string; bytes: number }[] = []

    await db.notes.each(note => {
      noteCount++
      const bytes = approximateNoteSize(note)
      totalBytes += bytes
      for (const m of note.messages ?? []) {
        if (m.type !== 'text' && m.type !== 'meta') {
          imageCount++
          imageBytes += m.content?.length ?? 0
        }
      }
      for (const sc of note.screenshots ?? []) {
        imageCount++
        imageBytes += sc.dataUrl?.length ?? 0
      }
      heaviest.push({ id: note.id, title: note.title, bytes })
      heaviest.sort((a, b) => b.bytes - a.bytes)
      if (heaviest.length > 5) heaviest.length = 5
    })

    return { noteCount, totalBytes, imageBytes, imageCount, heaviest }
  },

  /**
   * « Compacter mes notes » : recompresse les images trop lourdes et purge le
   * doublon base64 du champ historique `content`.
   *
   * Traite note par note (jamais db.notes.toArray()) — sinon la réparation
   * provoquerait exactement le plantage qu'elle doit corriger. Écrit en direct
   * via db.notes.put : on ne veut ni re-synchroniser vers le journal, ni
   * déclencher un rechargement de l'interface à chaque note.
   */
  async compactNotes(
    onProgress?: (done: number, total: number) => void
  ): Promise<{ notes: number; changed: number; before: number; after: number }> {
    const ids = (await db.notes.toCollection().primaryKeys()) as string[]
    let before = 0
    let after = 0
    let changed = 0

    for (let i = 0; i < ids.length; i++) {
      const note = await db.notes.get(ids[i])
      if (!note) continue

      const sizeBefore = approximateNoteSize(note)
      before += sizeBefore
      let touched = false

      // Les notes d'avant les blocs gardent tout dans `content` : les convertir
      // d'abord, sinon purger `content` perdrait leurs images
      if (!note.messages && note.content) {
        note.messages = convertLegacyContentToMessages(note.content, note.timestamp)
        touched = true
      }

      for (const message of note.messages ?? []) {
        if (message.type === 'text' || message.type === 'meta') continue
        if (!message.content?.startsWith('data:image')) continue
        if (estimateImageSize(message.content) <= COMPACT_IMAGE_THRESHOLD) continue
        try {
          const compressed = await compressImage(message.content, COMPRESSION_PRESETS.screenshot)
          if (compressed.length < message.content.length) {
            message.content = compressed
            touched = true
          }
        } catch (error) {
          console.warn('[Storage] Recompression impossible pour un bloc:', error)
        }
      }

      // `content` ne doit plus porter de base64 : les blocs font foi
      if (note.messages && note.messages.length > 0) {
        const rebuilt = this.messagesToHtml(note.messages)
        if (rebuilt !== note.content) {
          note.content = rebuilt
          touched = true
        }
      }

      if (touched) {
        await db.notes.put(note)
        void backupNote(note)
        changed++
      }

      after += approximateNoteSize(note)
      onProgress?.(i + 1, ids.length)
    }

    return { notes: ids.length, changed, before, after }
  },

  async deleteNote(id: string, skipSync = false): Promise<void> {
    try {
      await db.transaction('rw', [db.notes, db.screenshots, db.extracts], async () => {
        await db.notes.delete(id)
        await db.screenshots.where('noteId').equals(id).delete()
        await db.extracts.where('noteId').equals(id).delete()
      })
    } catch (error) {
      console.error('[Storage] deleteNote failed:', error)
      throw error
    }

    void removeNoteBackup(id)

    // Broadcast sync event to other views
    if (!skipSync) {
      stateSync.noteDeleted(id)
    }
  },

  // ---- SCREENSHOTS ----
  async saveScreenshot(screenshot: Omit<Screenshot, 'id'> & { id?: string }): Promise<string> {
    const id = screenshot.id || crypto.randomUUID()
    const fullScreenshot: Screenshot = {
      ...screenshot,
      id,
      timestamp: screenshot.timestamp || Date.now()
    }
    
    await db.screenshots.put(fullScreenshot)
    return id
  },

  async getScreenshots(noteId: string): Promise<Screenshot[]> {
    return await db.screenshots
      .where('noteId')
      .equals(noteId)
      .toArray()
  },

  // ---- EXTRACTED TEXT ----
  async saveExtractedText(extract: Omit<ExtractedText, 'id'> & { id?: string }): Promise<string> {
    const id = extract.id || crypto.randomUUID()
    const fullExtract: ExtractedText = {
      ...extract,
      id,
      timestamp: extract.timestamp || Date.now()
    }
    
    await db.extracts.put(fullExtract)
    return id
  },

  async getExtracts(noteId: string): Promise<ExtractedText[]> {
    return await db.extracts
      .where('noteId')
      .equals(noteId)
      .toArray()
  },

  // ---- SETTINGS ----
  async getSettings(): Promise<Settings> {
    try {
      const result = await chrome.storage.local.get('settings')
      return { ...DEFAULT_SETTINGS, ...result.settings }
    } catch (error) {
      console.error('Error loading settings:', error)
      return DEFAULT_SETTINGS
    }
  },

  async saveSettings(settings: Partial<Settings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings()
      const newSettings = { ...currentSettings, ...settings }
      await chrome.storage.local.set({ settings: newSettings })
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  },

  // ---- SYNC STATUS ----
  async updateSyncStatus(status: Partial<SyncStatus>): Promise<void> {
    const settings = await this.getSettings()
    const newSyncStatus = { ...settings.journalSync, ...status }
    await this.saveSettings({ journalSync: newSyncStatus })
  },

  async getPendingNotes(): Promise<AcademicNote[]> {
    const settings = await this.getSettings()
    const pendingIds = settings.journalSync.pendingNotes
    
    if (pendingIds.length === 0) return []
    
    return await db.notes
      .where('id')
      .anyOf(pendingIds)
      .toArray()
  },

  // ---- EXPORT/IMPORT ----
  async exportData(): Promise<string> {
    const [notes, screenshots, extracts, settings] = await Promise.all([
      db.notes.toArray(),
      db.screenshots.toArray(),
      db.extracts.toArray(),
      this.getSettings()
    ])

    return JSON.stringify({
      notes,
      screenshots,
      extracts,
      settings,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    }, null, 2)
  },

  async importData(jsonData: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = JSON.parse(jsonData)
      
      await db.transaction('rw', [db.notes, db.screenshots, db.extracts], async () => {
        if (data.notes) await db.notes.bulkPut(data.notes)
        if (data.screenshots) await db.screenshots.bulkPut(data.screenshots)
        if (data.extracts) await db.extracts.bulkPut(data.extracts)
      })
      
      if (data.settings) {
        await this.saveSettings(data.settings)
      }

      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  },

  async clearAll(): Promise<void> {
    await db.delete()
    await chrome.storage.local.clear()
  },

  // ---- STATS ----
  async getStats() {
    const [notesCount, screenshotsCount, extractsCount] = await Promise.all([
      db.notes.count(),
      db.screenshots.count(),
      db.extracts.count()
    ])

    const recentNotes = await db.notes
      .where('timestamp')
      .above(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 jours
      .count()

    return {
      total: {
        notes: notesCount,
        screenshots: screenshotsCount,
        extracts: extractsCount
      },
      recent: {
        notes: recentNotes
      }
    }
  },

  // ---- MESSAGE HELPERS ----
  /**
   * Add a new message to an existing note.
   *
   * options.afterMessageId : insère le bloc juste APRÈS ce message au lieu de
   * l'ajouter en fin de fil (annotation a posteriori, ex. du texte sous une
   * image en relecture). Le bloc inséré prend le timestamp du voisin + 1 ms :
   * tout ce qui ordonne par date (exports, sync journal, ancrage des warmups)
   * le garde à sa position dans le fil au lieu de le renvoyer en fin.
   */
  async addMessageToNote(
    noteId: string,
    message: Omit<NoteMessage, 'id' | 'timestamp'>,
    options?: { afterMessageId?: string }
  ): Promise<string | null> {
    const note = await this.getNote(noteId)
    if (!note) return null

    // Segment de trade actif → le bloc s'y rattache automatiquement
    const activeTrade = (note.trades ?? []).find(t => !t.closedAt)

    // Toute image passe par la compression AVANT d'entrer en base : c'est le
    // seul goulot commun à la barre de capture, aux captures d'écran et à la
    // capture intelligente (qui, elle, ne compressait rien du tout).
    const content = message.type !== 'text' && message.type !== 'meta'
      ? await prepareImageForStorage(message.content)
      : message.content

    // Point d'ancrage d'une insertion (options.afterMessageId)
    const anchorIdx = options?.afterMessageId
      ? (note.messages ?? []).findIndex(m => m.id === options.afterMessageId)
      : -1
    const anchor = anchorIdx >= 0 ? note.messages![anchorIdx] : undefined

    const newMessage: NoteMessage = {
      ...message,
      content,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: anchor ? anchor.timestamp + 1 : Date.now(),
      // Bloc inséré : hérite du trade de son voisin (jamais du trade en cours —
      // une annotation de relecture n'appartient pas au trade actif). Bloc
      // ajouté en fin de fil : rattaché au trade actif, comme avant.
      ...(anchor
        ? (anchor.tradeRef && !message.tradeRef ? { tradeRef: anchor.tradeRef } : {})
        : (activeTrade && !message.tradeRef ? { tradeRef: activeTrade.id } : {}))
    }

    // Initialize messages array if not present
    const messages = note.messages || []
    if (anchor) {
      messages.splice(anchorIdx + 1, 0, newMessage)
    } else {
      messages.push(newMessage)
    }

    // Also update legacy content for backward compatibility.
    // Type 'meta' : JAMAIS dans content — une métadonnée n'est pas du contenu
    // (contrat 0.1.2), elle ne vit que comme bloc masquable dans messages[].
    // Une image n'est JAMAIS recopiée en base64 dans `content` : elle y pesait
    // une seconde fois pour rien (le rendu et les exports lisent messages[]).
    const contentToAdd = message.type === 'meta'
      ? ''
      : message.type === 'text'
        ? message.content
        : `<p data-block="image">[${message.metadata?.alt || 'Image'}]</p>`

    const updatedContent = contentToAdd
      ? (note.content ? `${note.content}<br><br>${contentToAdd}` : contentToAdd)
      : note.content

    const updatedNote: AcademicNote = {
      ...note,
      messages,
      content: updatedContent,
      timestamp: Date.now()
    }

    await this.saveNote(updatedNote)
    return newMessage.id
  },

  // ---- TRADES (segments) ----
  /** Démarre un segment de trade dans la note ; clôt l'actif s'il y en a un. */
  async startTrade(noteId: string): Promise<string | null> {
    const note = await this.getNote(noteId)
    if (!note) return null
    const now = Date.now()
    const trades = (note.trades ?? []).map(t => t.closedAt ? t : { ...t, closedAt: now })
    const newTrade = { id: crypto.randomUUID(), startedAt: now }
    await this.saveNote({ ...note, trades: [...trades, newTrade] })
    return newTrade.id
  },

  /** Clôt un segment (outcome optionnel : gain/perte/be). */
  async closeTrade(noteId: string, tradeId: string, outcome?: import('@/types/academic').TradeOutcome): Promise<void> {
    const note = await this.getNote(noteId)
    if (!note) return
    const trades = (note.trades ?? []).map(t =>
      t.id === tradeId ? { ...t, closedAt: t.closedAt ?? Date.now(), ...(outcome ? { outcome } : {}) } : t
    )
    await this.saveNote({ ...note, trades })
  },

  /** Clôt silencieusement le segment actif (fermeture/changement de note). */
  async closeActiveTrade(noteId: string): Promise<void> {
    const note = await this.getNote(noteId)
    if (!note) return
    const active = (note.trades ?? []).find(t => !t.closedAt)
    if (!active) return
    await this.closeTrade(noteId, active.id)
  },

  /**
   * Update a specific message in a note
   */
  async updateMessage(
    noteId: string,
    messageId: string,
    updates: Partial<Omit<NoteMessage, 'id'>>
  ): Promise<boolean> {
    const note = await this.getNote(noteId)
    if (!note || !note.messages) return false

    const messageIndex = note.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return false

    note.messages[messageIndex] = {
      ...note.messages[messageIndex],
      ...updates
    }

    // Rebuild legacy content from messages
    note.content = this.messagesToHtml(note.messages)
    note.timestamp = Date.now()

    await this.saveNote(note)
    return true
  },

  /**
   * Delete a specific message from a note
   */
  async deleteMessage(noteId: string, messageId: string): Promise<boolean> {
    const note = await this.getNote(noteId)
    if (!note || !note.messages) return false

    const messageIndex = note.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return false

    note.messages.splice(messageIndex, 1)

    // Rebuild legacy content from remaining messages
    note.content = this.messagesToHtml(note.messages)
    note.timestamp = Date.now()

    await this.saveNote(note)
    return true
  },

  /**
   * Convert messages array to HTML content (for backward compatibility)
   */
  messagesToHtml(messages: NoteMessage[]): string {
    return messages
      .map(msg => {
        if (msg.type === 'text') {
          return msg.content
        } else {
          // Marqueur, PAS l'image : le base64 vit déjà dans messages[]. Le
          // réinjecter ici doublait le poids de chaque note (cf. compactNotes).
          const alt = msg.metadata?.alt || 'Image'
          return `<p data-block="image">[${alt}]</p>`
        }
      })
      .join('<br><br>')
  },

  // ---- FOLDERS ----

  async getFolders(): Promise<NoteFolder[]> {
    const settings = await this.getSettings()
    return settings.folders ?? []
  },

  async saveFolder(folder: NoteFolder): Promise<void> {
    const settings = await this.getSettings()
    const folders = settings.folders ?? []
    const idx = folders.findIndex(f => f.id === folder.id)
    if (idx >= 0) {
      folders[idx] = folder
    } else {
      folders.push(folder)
    }
    await this.saveSettings({ folders })
  },

  async deleteFolder(id: string): Promise<void> {
    const settings = await this.getSettings()
    const folders = (settings.folders ?? []).filter(f => f.id !== id)
    await this.saveSettings({ folders })
    // Détacher toutes les notes qui appartiennent à ce dossier
    await db.notes.where('folderId').equals(id).modify({ folderId: undefined })
  },

  async moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
    const note = await this.getNote(noteId)
    if (!note) return
    const updatedNote: AcademicNote = {
      ...note,
      folderId: folderId ?? undefined
    }
    await this.saveNote(updatedNote)
  },

  /**
   * Update the tags on a specific message (message-level tags → MessageTag)
   */
  async updateMessageTags(noteId: string, messageId: string, tags: string[]): Promise<boolean> {
    const note = await this.getNote(noteId)
    if (!note || !note.messages) return false

    const messageIndex = note.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return false

    note.messages[messageIndex] = { ...note.messages[messageIndex], tags }
    note.content = this.messagesToHtml(note.messages)
    note.timestamp = Date.now()

    await this.saveNote(note)
    return true
  },

  /**
   * Ensure a note has messages array (migrate on-demand)
   */
  async ensureNoteHasMessages(noteId: string): Promise<AcademicNote | null> {
    const note = await this.getNote(noteId)
    if (!note) return null

    if (!note.messages && note.content) {
      note.messages = convertLegacyContentToMessages(note.content, note.timestamp)
      await db.notes.put(note)
    }

    return note
  }
}

export { db, runFullBackup, restoredFromBackup }
export default storage