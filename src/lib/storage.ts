import Dexie from 'dexie'
import { stateSync } from './state-sync'
import type {
  AcademicNote,
  NoteMessage,
  NoteMessageType,
  Screenshot,
  ExtractedText,
  Settings,
  SyncStatus,
  AIConfig
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
  }
}

const db = new AcademicNotesDB()

// Gestion des paramètres avec Chrome Storage
const DEFAULT_SETTINGS: Settings = {
  autoCapture: false,
  aiSummaryEnabled: true,
  analysisProvider: 'chatgpt',
  defaultTags: [],
  journalSync: {
    lastSync: 0,
    pendingNotes: [],
    syncEnabled: false,
    journalAppUrl: 'https://trading-journal.app'
  },
  captureScreenshots: true,
  extractMainContent: true,
  language: 'fr'
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
      syncedAt: note.syncedAt
    }

    await db.notes.put(fullNote)

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

  async getNotes(limit = 50, offset = 0): Promise<AcademicNote[]> {
    // Tri par ID (= date de création) pour un ordre chronologique stable
    return await db.notes
      .orderBy('id')
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray()
  },

  async searchNotes(query: string): Promise<AcademicNote[]> {
    const searchTerm = query.toLowerCase()
    return await db.notes
      .filter(note => 
        note.title.toLowerCase().includes(searchTerm) ||
        note.content.toLowerCase().includes(searchTerm) ||
        note.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
        note.url.toLowerCase().includes(searchTerm)
      )
      .toArray()
  },

  async deleteNote(id: string, skipSync = false): Promise<void> {
    await db.transaction('rw', [db.notes, db.screenshots, db.extracts], async () => {
      await db.notes.delete(id)
      await db.screenshots.where('noteId').equals(id).delete()
      await db.extracts.where('noteId').equals(id).delete()
    })

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
   * Add a new message to an existing note
   */
  async addMessageToNote(
    noteId: string,
    message: Omit<NoteMessage, 'id' | 'timestamp'>
  ): Promise<string | null> {
    const note = await this.getNote(noteId)
    if (!note) return null

    const newMessage: NoteMessage = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now()
    }

    // Initialize messages array if not present
    const messages = note.messages || []
    messages.push(newMessage)

    // Also update legacy content for backward compatibility
    const contentToAdd = message.type === 'text'
      ? message.content
      : `<img src="${message.content}" alt="${message.metadata?.alt || 'Image'}" style="max-width:100%; border-radius:8px; margin-top:8px;"/>`

    const updatedContent = note.content
      ? `${note.content}<br><br>${contentToAdd}`
      : contentToAdd

    const updatedNote: AcademicNote = {
      ...note,
      messages,
      content: updatedContent,
      timestamp: Date.now()
    }

    await this.saveNote(updatedNote)
    return newMessage.id
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
          const alt = msg.metadata?.alt || 'Image'
          return `<img src="${msg.content}" alt="${alt}" style="max-width:100%; border-radius:8px; margin-top:8px;"/>`
        }
      })
      .join('<br><br>')
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

export { db }
export default storage