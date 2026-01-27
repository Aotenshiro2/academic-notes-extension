import type { AcademicNote, Settings, SyncStatus } from '@/types/academic'
import storage from '@/lib/storage'

interface SyncResponse {
  success: boolean
  data?: any
  error?: string
  statusCode?: number
}

interface AuthToken {
  token: string
  expiresAt: number
  userId?: string
}

class JournalSyncManager {
  private baseUrl: string = 'https://journal-detudes.aoknowledge.com'
  private apiBaseUrl: string = `${this.baseUrl}/api/v1`
  private authToken: AuthToken | null = null

  constructor() {
    this.loadAuthToken()
  }

  // ---- AUTHENTICATION ----
  
  private async loadAuthToken(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['authToken'])
      if (result.authToken && result.authToken.expiresAt > Date.now()) {
        this.authToken = result.authToken
      } else {
        // Token expired or not found
        this.authToken = null
        await chrome.storage.local.remove(['authToken'])
      }
    } catch (error) {
      console.error('Error loading auth token:', error)
      this.authToken = null
    }
  }

  private async saveAuthToken(token: AuthToken): Promise<void> {
    this.authToken = token
    await chrome.storage.local.set({ authToken: token })
  }

  private async clearAuthToken(): Promise<void> {
    this.authToken = null
    await chrome.storage.local.remove(['authToken'])
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Extension-Source': 'trading-notes-extension',
      'X-Extension-Version': '1.0.0'
    }

    if (this.authToken?.token) {
      headers['Authorization'] = `Bearer ${this.authToken.token}`
    }

    return headers
  }

  // ---- CORE API METHODS ----

  private async apiCall(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<SyncResponse> {
    try {
      const url = `${this.apiBaseUrl}${endpoint}`
      const options: RequestInit = {
        method,
        headers: this.getAuthHeaders(),
        credentials: 'include' // Include cookies for session-based auth
      }

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body)
      }

      const response = await fetch(url, options)
      
      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          await this.clearAuthToken()
          return { 
            success: false, 
            error: 'Authentication required', 
            statusCode: 401 
          }
        }

        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status
        }
      }

      const data = await response.json()
      return { success: true, data }

    } catch (error) {
      console.error('API call failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      }
    }
  }

  // ---- PUBLIC SYNC METHODS ----

  /**
   * Generate a temporary auth token for seamless web app access
   */
  async generateWebAppToken(): Promise<string | null> {
    try {
      if (!this.authToken) {
        console.warn('No auth token available for web app access')
        return null
      }

      const response = await this.apiCall('/auth/extension-token', 'POST', {
        purpose: 'web-app-access',
        validForMinutes: 30
      })

      if (response.success && response.data?.token) {
        return response.data.token
      }
      
      return null
    } catch (error) {
      console.error('Error generating web app token:', error)
      return null
    }
  }

  /**
   * Sync a note to Journal d'Études
   */
  async syncNoteToJournal(note: AcademicNote): Promise<SyncResponse> {
    try {
      // Convert extension note format to Journal d'Études format
      const journalNote = {
        id: note.id,
        title: note.title,
        content: note.content,
        summary: note.summary,
        url: note.url,
        favicon: note.favicon,
        timestamp: note.timestamp,
        type: note.type,
        metadata: note.metadata,
        tags: note.tags,
        concepts: note.concepts,
        source: 'extension',
        syncedAt: Date.now()
      }

      const response = await this.apiCall('/notes', 'POST', journalNote)
      
      if (response.success) {
        // Update local note with sync timestamp
        await storage.saveNote({
          ...note,
          syncedAt: Date.now()
        })

        // Remove from pending sync queue
        await this.removePendingNote(note.id)
        
        console.log(`Note ${note.id} synced to Journal d'Études`)
      }

      return response
    } catch (error) {
      console.error('Error syncing note to journal:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed'
      }
    }
  }

  /**
   * Download a note from Journal d'Études
   */
  async syncNoteFromJournal(noteId: string): Promise<SyncResponse> {
    try {
      const response = await this.apiCall(`/notes/${noteId}`)
      
      if (response.success && response.data) {
        const journalNote = response.data
        
        // Convert Journal d'Études format to extension format
        const note: AcademicNote = {
          id: journalNote.id,
          title: journalNote.title,
          content: journalNote.content,
          summary: journalNote.summary,
          url: journalNote.url || '',
          favicon: journalNote.favicon,
          timestamp: journalNote.timestamp,
          type: journalNote.type || 'manual',
          metadata: journalNote.metadata || { domain: '' },
          tags: journalNote.tags || [],
          concepts: journalNote.concepts || [],
          screenshots: journalNote.screenshots || [],
          syncedAt: Date.now()
        }

        await storage.saveNote(note)
        console.log(`Note ${noteId} synced from Journal d'Études`)
        
        return { success: true, data: note }
      }

      return response
    } catch (error) {
      console.error('Error syncing note from journal:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed'
      }
    }
  }

  /**
   * Sync all pending notes to Journal d'Études
   */
  async syncAllNotes(): Promise<{ success: boolean; synced: number; failed: number; errors: string[] }> {
    const result = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [] as string[]
    }

    try {
      const pendingNotes = await storage.getPendingNotes()
      console.log(`Syncing ${pendingNotes.length} pending notes...`)

      for (const note of pendingNotes) {
        const syncResult = await this.syncNoteToJournal(note)
        
        if (syncResult.success) {
          result.synced++
        } else {
          result.failed++
          result.errors.push(`${note.title}: ${syncResult.error}`)
        }
      }

      // Also sync recently created notes that might not be in pending queue
      const recentNotes = await storage.getNotes(10) // Last 10 notes
      const unsynced = recentNotes.filter(note => !note.syncedAt || note.timestamp > note.syncedAt)

      for (const note of unsynced) {
        const syncResult = await this.syncNoteToJournal(note)
        
        if (syncResult.success) {
          result.synced++
        } else {
          result.failed++
          result.errors.push(`${note.title}: ${syncResult.error}`)
        }
      }

      // Update last sync timestamp
      await storage.updateSyncStatus({ lastSync: Date.now() })
      
      if (result.failed > 0) {
        result.success = false
      }

      return result
    } catch (error) {
      console.error('Error in bulk sync:', error)
      return {
        success: false,
        synced: result.synced,
        failed: result.failed + 1,
        errors: [...result.errors, error instanceof Error ? error.message : 'Unknown sync error']
      }
    }
  }

  /**
   * Check sync status and permissions
   */
  async checkSyncStatus(): Promise<{ available: boolean; authenticated: boolean; error?: string }> {
    try {
      const response = await this.apiCall('/sync/status')
      
      return {
        available: response.success,
        authenticated: !!this.authToken && response.success,
        error: response.error
      }
    } catch (error) {
      return {
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  // ---- HELPER METHODS ----

  private async addPendingNote(noteId: string): Promise<void> {
    const settings = await storage.getSettings()
    const pendingNotes = [...settings.journalSync.pendingNotes]
    
    if (!pendingNotes.includes(noteId)) {
      pendingNotes.push(noteId)
      await storage.updateSyncStatus({ pendingNotes })
    }
  }

  private async removePendingNote(noteId: string): Promise<void> {
    const settings = await storage.getSettings()
    const pendingNotes = settings.journalSync.pendingNotes.filter(id => id !== noteId)
    await storage.updateSyncStatus({ pendingNotes })
  }

  /**
   * Queue a note for sync (when creating/editing offline)
   */
  async queueNoteForSync(noteId: string): Promise<void> {
    await this.addPendingNote(noteId)
    console.log(`Note ${noteId} queued for sync`)
  }

  /**
   * Get the Journal d'Études URL with auth token for seamless access
   */
  async getWebAppUrl(noteId?: string): Promise<string> {
    try {
      const webAppToken = await this.generateWebAppToken()
      const baseUrl = this.baseUrl
      
      let url = baseUrl
      
      if (noteId) {
        url += `?noteId=${noteId}&source=extension`
      } else {
        url += `?source=extension`
      }
      
      if (webAppToken) {
        url += `&token=${webAppToken}`
      }
      
      return url
    } catch (error) {
      console.error('Error generating web app URL:', error)
      // Fallback to basic URL
      return noteId 
        ? `${this.baseUrl}?noteId=${noteId}&source=extension`
        : `${this.baseUrl}?source=extension`
    }
  }
}

// Export singleton instance
export const journalSync = new JournalSyncManager()
export default journalSync