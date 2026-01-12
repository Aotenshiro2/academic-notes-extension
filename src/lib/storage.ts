import Dexie from 'dexie'
import type { 
  AcademicNote, 
  Screenshot, 
  ExtractedText, 
  Settings,
  SyncStatus 
} from '@/types/academic'

class AcademicNotesDB extends Dexie {
  notes!: Dexie.Table<AcademicNote, string>
  screenshots!: Dexie.Table<Screenshot, string>
  extracts!: Dexie.Table<ExtractedText, string>

  constructor() {
    super('AcademicNotesDB')
    
    this.version(1).stores({
      notes: 'id, title, url, timestamp, type, *tags, *concepts',
      screenshots: 'id, noteId, url, timestamp',
      extracts: 'id, noteId, timestamp, source'
    })
  }
}

const db = new AcademicNotesDB()

// Gestion des paramètres avec Chrome Storage
const DEFAULT_SETTINGS: Settings = {
  autoCapture: false,
  aiSummaryEnabled: true,
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
  async saveNote(note: Omit<AcademicNote, 'id'> & { id?: string }): Promise<string> {
    const id = note.id || crypto.randomUUID()
    const fullNote: AcademicNote = {
      ...note,
      id,
      timestamp: note.timestamp || Date.now()
    }
    
    await db.notes.put(fullNote)
    return id
  },

  async getNote(id: string): Promise<AcademicNote | undefined> {
    return await db.notes.get(id)
  },

  async getNotes(limit = 50, offset = 0): Promise<AcademicNote[]> {
    return await db.notes
      .orderBy('timestamp')
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

  async deleteNote(id: string): Promise<void> {
    await db.transaction('rw', [db.notes, db.screenshots, db.extracts], async () => {
      await db.notes.delete(id)
      await db.screenshots.where('noteId').equals(id).delete()
      await db.extracts.where('noteId').equals(id).delete()
    })
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
  }
}

export { db }
export default storage