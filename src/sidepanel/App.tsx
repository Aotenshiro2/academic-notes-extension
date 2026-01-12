import React, { useState, useEffect } from 'react'
import { 
  BookOpen, 
  Plus, 
  Search, 
  Settings, 
  Download, 
  Upload,
  Camera,
  FileText,
  Video,
  Globe,
  Filter,
  BarChart3,
  ArrowRight
} from 'lucide-react'

import Header from '@/components/Header'
import CurrentNoteView from '@/components/CurrentNoteView'
import EmptyNoteView from '@/components/EmptyNoteView'
import SimpleRichEditor from '@/components/SimpleRichEditor'
import HistoryDropdown from '@/components/HistoryDropdown'
import SkoolBanner from '@/components/SkoolBanner'
import DataMigration from '@/components/DataMigration'

import storage from '@/lib/storage'
import type { AcademicNote, Settings as SettingsType, Screenshot } from '@/types/academic'

function App() {
  // Suppression du système de vue par tabs
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [notes, setNotes] = useState<AcademicNote[]>([])
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showMigration, setShowMigration] = useState(false)
  const [editorContent, setEditorContent] = useState('')
  const [currentPageInfo, setCurrentPageInfo] = useState<{url: string, title: string} | null>(null)

  // Charger les données initiales
  useEffect(() => {
    loadData()
    loadCurrentPageInfo()
    
    // Signaler que le sidepanel est ouvert
    chrome.storage.session.set({ sidePanelOpen: true })
    
    // Écouter les messages de fermeture
    const handleMessage = (message: any) => {
      if (message.type === 'CLOSE_SIDEPANEL') {
        window.close()
      }
    }
    
    chrome.runtime.onMessage.addListener(handleMessage)
    
    // Nettoyer l'état à la fermeture
    const handleBeforeUnload = () => {
      chrome.storage.session.set({ sidePanelOpen: false })
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      chrome.storage.session.set({ sidePanelOpen: false })
    }
  }, [])

  // Charger les informations de la page courante
  async function loadCurrentPageInfo() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]
      if (currentTab) {
        setCurrentPageInfo({
          url: currentTab.url || '',
          title: currentTab.title || 'Page sans titre'
        })
      }
    } catch (error) {
      console.error('Error loading current page info:', error)
    }
  }

  async function loadData() {
    try {
      setIsLoading(true)
      const [loadedNotes, loadedSettings] = await Promise.all([
        storage.getNotes(1000), // Charger toutes les notes
        storage.getSettings()
      ])
      setNotes(loadedNotes)
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fonction pour ajouter du contenu à la note courante (maintenant avec support HTML)
  const handleAddContent = async (content: string, noteId: string | null) => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]
      
      let domain = ''
      try {
        if (currentTab?.url) {
          domain = new URL(currentTab.url).hostname
        }
      } catch (urlError) {
        console.warn('Invalid URL:', currentTab?.url)
      }

      if (noteId) {
        // Ajouter à une note existante
        const existingNote = notes.find(n => n.id === noteId)
        if (existingNote) {
          const updatedNote = {
            ...existingNote,
            content: existingNote.content + '<br><br>' + content,
            timestamp: Date.now() // Mettre à jour la date de modification
          }
          await storage.saveNote(updatedNote)
          await loadData()
        }
      } else {
        // Créer une nouvelle note
        const newNoteId = Date.now().toString()
        const newNote: AcademicNote = {
          id: newNoteId,
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''), // Titre basé sur le contenu
          content,
          url: currentTab?.url || '',
          favicon: currentTab?.favIconUrl || '',
          timestamp: Date.now(),
          type: 'manual',
          tags: [],
          concepts: [],
          screenshots: [],
          metadata: {
            domain,
            title: currentTab?.title || 'Note de trading',
            language: 'fr'
          }
        }

        await storage.saveNote(newNote)
        setCurrentNoteId(newNoteId)
        await loadData()
      }
      
      // Vider l'éditeur après ajout
      setEditorContent('')
    } catch (error) {
      console.error('Error adding content:', error)
      alert('Erreur lors de l\'ajout du contenu')
    }
  }

  // Fonction pour prendre une capture d'écran
  const handleScreenshot = async (): Promise<string | null> => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT'
      })
      return response?.dataUrl || null
    } catch (error) {
      console.error('Error taking screenshot:', error)
      return null
    }
  }

  if (isLoading) {
    return (
      <div className="sidebar-container">
        <div className="flex items-center justify-center h-full animate-fade-in-up">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Chargement de vos notes...</p>
          </div>
        </div>
      </div>
    )
  }

  // Obtenir le titre de la note courante
  const currentNote = currentNoteId ? notes.find(n => n.id === currentNoteId) : null

  return (
    <div className="sidebar-container">
      {/* Bannière promo au-dessus du header */}
      <SkoolBanner />
      
      <Header 
        onShowHistory={() => setShowHistoryDropdown(!showHistoryDropdown)}
        onNewNote={() => setCurrentNoteId(Date.now().toString())}
      />

      {/* Accès temporaire à la migration - TODO: À retirer après migration */}
      {notes.length === 0 && (
        <div className="border-b border-border px-4 py-2">
          <button
            onClick={() => setShowMigration(!showMigration)}
            className="text-sm text-primary hover:text-primary/80"
          >
            🔄 Récupérer les anciennes notes
          </button>
        </div>
      )}

      {/* Zone principale - Note courante (style Claude) */}
      <main className="content-section flex flex-col">
        {/* Contenu de la note courante */}
        <div className="flex-1 overflow-y-auto p-4">
          {showMigration ? (
            <DataMigration />
          ) : currentNoteId ? (
            <CurrentNoteView noteId={currentNoteId} />
          ) : (
            <EmptyNoteView onNewNote={() => setCurrentNoteId(Date.now().toString())} />
          )}
        </div>
        
        {/* Rich Editor bottom fixe (style Claude avec fonctionnalités) */}
        {!showMigration && (
          <div className="border-t border-border bg-background p-4">
            <SimpleRichEditor
              value={editorContent}
              onChange={setEditorContent}
              placeholder={currentNoteId ? "Ajouter du contenu à cette note..." : "Commencer une nouvelle note de trading..."}
              onInsertScreenshot={handleScreenshot}
              onSubmit={() => handleAddContent(editorContent, currentNoteId)}
              currentPageInfo={currentPageInfo || undefined}
              className="w-full"
            />
            
            {/* Actions rapides */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleAddContent(editorContent, currentNoteId)}
                  disabled={!editorContent.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                  {currentNoteId ? 'Ajouter' : 'Créer note'}
                </button>
              </div>
              
              <div className="text-xs text-muted-foreground">
                <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">⏎</kbd> pour sauvegarder, 
                <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs ml-1">⇧⏎</kbd> pour nouvelle ligne
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Dropdown historique des notes */}
      <HistoryDropdown
        isOpen={showHistoryDropdown}
        onClose={() => setShowHistoryDropdown(false)}
        notes={notes}
        currentNoteId={currentNoteId}
        onSelectNote={setCurrentNoteId}
        onNotesUpdate={loadData}
      />
    </div>
  )
}

export default App