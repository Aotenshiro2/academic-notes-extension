/**
 * State synchronization between sidepanel and fullscreen views using BroadcastChannel
 */

const SYNC_CHANNEL = 'academic-notes-sync'

export type SyncMessageType =
  | 'NOTE_CREATED'
  | 'NOTE_UPDATED'
  | 'NOTE_DELETED'
  | 'NOTES_BULK_UPDATE'

export interface SyncMessage {
  type: SyncMessageType
  noteId?: string
  noteIds?: string[]
  timestamp: number
  source: 'sidepanel' | 'fullscreen' | 'background'
}

type SyncListener = (message: SyncMessage) => void

class StateSync {
  private channel: BroadcastChannel | null = null
  private listeners: Set<SyncListener> = new Set()
  private instanceId: string

  constructor() {
    this.instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.initChannel()
  }

  private initChannel() {
    try {
      this.channel = new BroadcastChannel(SYNC_CHANNEL)
      this.channel.onmessage = (event) => {
        const message = event.data as SyncMessage
        // Notify all listeners
        this.listeners.forEach(listener => {
          try {
            listener(message)
          } catch (error) {
            console.error('Error in sync listener:', error)
          }
        })
      }
    } catch (error) {
      console.warn('BroadcastChannel not supported, falling back to storage events')
      // Fallback for environments without BroadcastChannel support
      this.setupStorageFallback()
    }
  }

  private setupStorageFallback() {
    // Use chrome.storage.onChanged as fallback
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'session' && changes.syncEvent) {
          const message = changes.syncEvent.newValue as SyncMessage
          if (message) {
            this.listeners.forEach(listener => {
              try {
                listener(message)
              } catch (error) {
                console.error('Error in sync listener:', error)
              }
            })
          }
        }
      })
    }
  }

  /**
   * Broadcast a sync message to all other views
   */
  broadcast(message: Omit<SyncMessage, 'timestamp'>) {
    const fullMessage: SyncMessage = {
      ...message,
      timestamp: Date.now()
    }

    if (this.channel) {
      this.channel.postMessage(fullMessage)
    } else if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      // Fallback to storage
      chrome.storage.session.set({ syncEvent: fullMessage })
    }
  }

  /**
   * Broadcast that a note was created
   */
  noteCreated(noteId: string, source: SyncMessage['source'] = 'sidepanel') {
    this.broadcast({ type: 'NOTE_CREATED', noteId, source })
  }

  /**
   * Broadcast that a note was updated
   */
  noteUpdated(noteId: string, source: SyncMessage['source'] = 'sidepanel') {
    this.broadcast({ type: 'NOTE_UPDATED', noteId, source })
  }

  /**
   * Broadcast that a note was deleted
   */
  noteDeleted(noteId: string, source: SyncMessage['source'] = 'sidepanel') {
    this.broadcast({ type: 'NOTE_DELETED', noteId, source })
  }

  /**
   * Broadcast that multiple notes were updated
   */
  notesBulkUpdate(noteIds: string[], source: SyncMessage['source'] = 'sidepanel') {
    this.broadcast({ type: 'NOTES_BULK_UPDATE', noteIds, source })
  }

  /**
   * Subscribe to sync messages
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Close the broadcast channel
   */
  close() {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    this.listeners.clear()
  }
}

// Singleton instance
export const stateSync = new StateSync()

export default stateSync
