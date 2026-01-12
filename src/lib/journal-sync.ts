import type { AcademicNote, SyncStatus } from '@/types/academic'
import storage from './storage'

export interface SyncResult {
  success: boolean
  syncedNotes: number
  errors: string[]
  newCanvasId?: string
}

export interface JournalNote {
  title: string
  content: string
  metadata: {
    url: string
    domain: string
    contentType: string
    extractedAt: string
    [key: string]: any
  }
  position: { x: number; y: number }
  tags: string[]
  concepts: string[]
}

/**
 * Module de synchronisation avec l'application Journal d'Études
 */
export class JournalSync {
  private static apiBaseUrl: string = ''
  private static apiKey: string = ''

  /**
   * Initialiser la configuration de sync
   */
  static async initialize(): Promise<void> {
    const settings = await storage.getSettings()
    this.apiBaseUrl = settings.journalSync.journalAppUrl
    this.apiKey = settings.journalSync.apiKey || ''
  }

  /**
   * Tester la connexion avec Journal d'Études
   */
  static async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.initialize()
      
      const response = await fetch(`${this.apiBaseUrl}/api/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        }
      })

      if (!response.ok) {
        return {
          success: false,
          error: `Erreur HTTP ${response.status}: ${response.statusText}`
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de connexion'
      }
    }
  }

  /**
   * Synchroniser toutes les notes en attente
   */
  static async syncPendingNotes(): Promise<SyncResult> {
    try {
      await this.initialize()
      
      const pendingNotes = await storage.getPendingNotes()
      if (pendingNotes.length === 0) {
        return {
          success: true,
          syncedNotes: 0,
          errors: []
        }
      }

      // Créer ou obtenir un canvas de synchronisation
      const canvasId = await this.getOrCreateSyncCanvas()
      
      const syncResults: SyncResult = {
        success: true,
        syncedNotes: 0,
        errors: [],
        newCanvasId: canvasId
      }

      // Synchroniser chaque note
      for (const note of pendingNotes) {
        try {
          await this.syncSingleNote(note, canvasId)
          syncResults.syncedNotes++
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
          syncResults.errors.push(`${note.title}: ${errorMessage}`)
        }
      }

      // Mettre à jour le statut de sync
      if (syncResults.errors.length === 0) {
        await storage.updateSyncStatus({
          lastSync: Date.now(),
          pendingNotes: [] // Vider la liste des notes en attente
        })
      } else {
        // Garder les notes qui ont échoué
        const failedNoteIds = syncResults.errors.map(error => {
          const failedNote = pendingNotes.find(n => error.startsWith(n.title))
          return failedNote?.id
        }).filter(Boolean)

        await storage.updateSyncStatus({
          lastSync: Date.now(),
          pendingNotes: failedNoteIds as string[]
        })
      }

      syncResults.success = syncResults.errors.length < pendingNotes.length / 2 // Succès si moins de 50% d'erreurs

      return syncResults
    } catch (error) {
      return {
        success: false,
        syncedNotes: 0,
        errors: [error instanceof Error ? error.message : 'Erreur de synchronisation']
      }
    }
  }

  /**
   * Synchroniser une note individuelle
   */
  static async syncSingleNote(note: AcademicNote, canvasId: string): Promise<void> {
    const journalNote = this.convertToJournalFormat(note)
    
    const response = await fetch(`${this.apiBaseUrl}/api/canvas/${canvasId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      },
      body: JSON.stringify(journalNote)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Erreur HTTP ${response.status}`)
    }
  }

  /**
   * Ajouter une note à la file de synchronisation
   */
  static async queueNoteForSync(noteId: string): Promise<void> {
    const settings = await storage.getSettings()
    
    if (!settings.journalSync.syncEnabled) {
      return
    }

    const pendingNotes = [...settings.journalSync.pendingNotes]
    if (!pendingNotes.includes(noteId)) {
      pendingNotes.push(noteId)
      
      await storage.updateSyncStatus({
        pendingNotes
      })
    }
  }

  /**
   * Obtenir ou créer un canvas de synchronisation
   */
  private static async getOrCreateSyncCanvas(): Promise<string> {
    // D'abord, essayer de trouver un canvas existant pour les notes d'extension
    const response = await fetch(`${this.apiBaseUrl}/api/canvas?type=extension`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      }
    })

    if (response.ok) {
      const canvases = await response.json()
      if (canvases.length > 0) {
        return canvases[0].id
      }
    }

    // Créer un nouveau canvas
    const createResponse = await fetch(`${this.apiBaseUrl}/api/canvas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      },
      body: JSON.stringify({
        name: 'Notes Extension Academic',
        description: 'Canvas automatique pour les notes capturées via l\'extension Academic Notes Collector',
        type: 'extension'
      })
    })

    if (!createResponse.ok) {
      throw new Error('Impossible de créer un canvas de synchronisation')
    }

    const newCanvas = await createResponse.json()
    return newCanvas.id
  }

  /**
   * Convertir une note academic en format Journal d'Études
   */
  private static convertToJournalFormat(note: AcademicNote): JournalNote {
    // Générer une position aléatoire pour le canvas
    const position = {
      x: Math.floor(Math.random() * 800) + 100,
      y: Math.floor(Math.random() * 600) + 100
    }

    // Construire le contenu avec métadonnées enrichies
    let content = note.content
    
    if (note.summary) {
      content = `**Résumé:** ${note.summary}\n\n${content}`
    }

    if (note.metadata.author) {
      content += `\n\n**Auteur:** ${note.metadata.author}`
    }

    if (note.metadata.publishDate) {
      content += `\n**Date:** ${note.metadata.publishDate}`
    }

    return {
      title: note.title,
      content,
      metadata: {
        url: note.url,
        domain: note.metadata.domain,
        contentType: note.type,
        extractedAt: new Date(note.timestamp).toISOString(),
        originalFavicon: note.favicon,
        description: note.metadata.description,
        author: note.metadata.author,
        publishDate: note.metadata.publishDate,
        language: note.metadata.language,
        extensionVersion: '1.0.0'
      },
      position,
      tags: note.tags,
      concepts: note.concepts
    }
  }

  /**
   * Synchroniser immédiatement une nouvelle note
   */
  static async syncNewNote(note: AcademicNote): Promise<SyncResult> {
    try {
      const settings = await storage.getSettings()
      
      if (!settings.journalSync.syncEnabled) {
        return {
          success: false,
          syncedNotes: 0,
          errors: ['Synchronisation désactivée']
        }
      }

      await this.initialize()
      const canvasId = await this.getOrCreateSyncCanvas()
      
      await this.syncSingleNote(note, canvasId)
      
      await storage.updateSyncStatus({
        lastSync: Date.now()
      })

      return {
        success: true,
        syncedNotes: 1,
        errors: [],
        newCanvasId: canvasId
      }
    } catch (error) {
      // En cas d'erreur, ajouter à la file d'attente
      await this.queueNoteForSync(note.id)
      
      return {
        success: false,
        syncedNotes: 0,
        errors: [error instanceof Error ? error.message : 'Erreur de synchronisation']
      }
    }
  }

  /**
   * Obtenir les statistiques de synchronisation
   */
  static async getSyncStats(): Promise<{
    lastSync: Date | null
    pendingCount: number
    totalSynced: number
    isEnabled: boolean
  }> {
    const settings = await storage.getSettings()
    const stats = await storage.getStats()
    
    return {
      lastSync: settings.journalSync.lastSync > 0 
        ? new Date(settings.journalSync.lastSync) 
        : null,
      pendingCount: settings.journalSync.pendingNotes.length,
      totalSynced: Math.max(0, stats.total.notes - settings.journalSync.pendingNotes.length),
      isEnabled: settings.journalSync.syncEnabled
    }
  }

  /**
   * Forcer une synchronisation complète
   */
  static async forceSyncAll(): Promise<SyncResult> {
    try {
      const allNotes = await storage.getNotes(1000) // Récupérer toutes les notes
      
      // Marquer toutes les notes comme en attente
      const noteIds = allNotes.map(note => note.id)
      await storage.updateSyncStatus({
        pendingNotes: noteIds
      })

      // Synchroniser
      return await this.syncPendingNotes()
    } catch (error) {
      return {
        success: false,
        syncedNotes: 0,
        errors: [error instanceof Error ? error.message : 'Erreur synchronisation forcée']
      }
    }
  }

  /**
   * Créer un lien direct vers la note dans Journal d'Études
   */
  static createJournalLink(note: AcademicNote, canvasId?: string): string {
    const baseUrl = this.apiBaseUrl || 'https://trading-journal.app'
    
    if (canvasId) {
      return `${baseUrl}/canvas/${canvasId}?search=${encodeURIComponent(note.title)}`
    }
    
    return `${baseUrl}/?search=${encodeURIComponent(note.title)}`
  }
}