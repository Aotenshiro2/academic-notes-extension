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
  ArrowRight,
  Menu,
  X,
  ExternalLink,
  SidebarClose,
  Maximize
} from 'lucide-react'

import SimpleRichEditor from '@/components/SimpleRichEditor'
import storage from '@/lib/storage'
import type { AcademicNote, Settings as SettingsType, Screenshot } from '@/types/academic'

function FullscreenApp() {
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [notes, setNotes] = useState<AcademicNote[]>([])
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editorContent, setEditorContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPageInfo, setCurrentPageInfo] = useState<{url: string, title: string} | null>(null)

  // URL params pour récupérer l'ID de note
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const noteIdFromUrl = urlParams.get('noteId')
    if (noteIdFromUrl) {
      setCurrentNoteId(noteIdFromUrl)
    }
    
    loadData()
    loadCurrentPageInfo()
  }, [])

  // Charger les informations de la page courante (onglet actif)
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
        storage.getNotes(1000), // Charger toutes les notes pour la fullscreen
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

  // Fonction pour ajouter du contenu à la note courante
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
            timestamp: Date.now()
          }
          await storage.saveNote(updatedNote)
          await loadData()
        }
      } else {
        // Créer une nouvelle note
        const newNoteId = Date.now().toString()
        const newNote: AcademicNote = {
          id: newNoteId,
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
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
      
      // Vider l'éditeur après ajout avec délai pour ne pas interférer avec le focus
      setTimeout(() => {
        setEditorContent('')
      }, 100)
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

  // Ouvrir le site web Journal d'Études
  const handleOpenWebsite = () => {
    window.open('https://journal-detudes.aoknowledge.com', '_blank')
  }

  // Retourner au sidepanel
  const handleBackToSidepanel = async () => {
    try {
      // Obtenir tous les onglets pour trouver un onglet normal (pas extension)
      const allTabs = await chrome.tabs.query({ currentWindow: true })
      
      // Trouver le premier onglet qui n'est pas une extension
      const normalTab = allTabs.find(tab => 
        tab.url && !tab.url.startsWith('chrome-extension://')
      )
      
      if (normalTab?.id) {
        // Ouvrir le sidepanel sur un onglet normal
        await chrome.sidePanel.open({ tabId: normalTab.id })
        await chrome.storage.session.set({ sidePanelOpen: true })
        
        // Activer cet onglet
        await chrome.tabs.update(normalTab.id, { active: true })
        
        // Fermer cet onglet fullscreen
        window.close()
      } else {
        // Si pas d'onglet normal, créer un nouvel onglet
        const newTab = await chrome.tabs.create({ url: 'chrome://newtab/' })
        if (newTab.id) {
          await chrome.sidePanel.open({ tabId: newTab.id })
          await chrome.storage.session.set({ sidePanelOpen: true })
        }
        window.close()
      }
    } catch (error) {
      console.error('Error returning to sidepanel:', error)
      // Fallback: au moins fermer cet onglet
      window.close()
    }
  }

  // Activer le fullscreen HTML5 natif
  const handleNativeFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  // Filtrer les notes selon la recherche
  const filteredNotes = notes.filter(note => 
    !searchQuery || 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const currentNote = currentNoteId ? notes.find(n => n.id === currentNoteId) : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement de vos notes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 border-r border-border bg-background overflow-hidden flex flex-col`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-semibold text-foreground">Trading Notes</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-md hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
          
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Rechercher dans vos notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Liste des notes */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <button
              onClick={() => setCurrentNoteId(Date.now().toString())}
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-dashed border-border mb-2"
            >
              <Plus size={16} className="text-muted-foreground" />
              <span className="text-muted-foreground">Nouvelle note</span>
            </button>
            
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => setCurrentNoteId(note.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors mb-1 ${
                  currentNoteId === note.id 
                    ? 'bg-primary/10 border-primary/20 border' 
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="font-medium text-foreground text-sm line-clamp-1 mb-1">
                  {note.title}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {note.content.replace(/<[^>]*>/g, '').slice(0, 100)}...
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(note.timestamp).toLocaleDateString('fr-FR')}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Zone principale */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between bg-background">
          <div className="flex items-center space-x-4">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md hover:bg-muted"
                title="Ouvrir la sidebar"
              >
                <Menu size={16} />
              </button>
            )}
            
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {currentNote ? currentNote.title : 'Trading Notes - Vue Étendue'}
              </h2>
              {currentNote && (
                <p className="text-sm text-muted-foreground">
                  Modifié le {new Date(currentNote.timestamp).toLocaleDateString('fr-FR')} à {new Date(currentNote.timestamp).toLocaleTimeString('fr-FR')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {/* TODO: Export */}}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Exporter"
            >
              <Download size={18} />
            </button>
            
            <button
              onClick={handleNativeFullscreen}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Activer plein écran natif"
            >
              <Maximize size={18} />
            </button>
            
            <button
              onClick={handleOpenWebsite}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Ouvrir Journal d'Études"
            >
              <ExternalLink size={18} />
            </button>
            
            <div className="w-px h-6 bg-border mx-2"></div>
            
            <button
              onClick={handleBackToSidepanel}
              className="px-3 py-2 text-sm bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-md transition-colors flex items-center space-x-2"
              title="Retour au mode compact"
            >
              <SidebarClose size={16} />
              <span>Mode compact</span>
            </button>
          </div>
        </div>

        {/* Contenu principal */}
        <div className="flex-1 flex">
          {/* Zone d'affichage de note */}
          <div className="flex-1 overflow-y-auto">
            {currentNote ? (
              <div className="p-8 max-w-4xl mx-auto">
                <div className="prose prose-lg max-w-none">
                  <div 
                    className="text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: currentNote.content }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <BookOpen size={64} className="text-muted-foreground mb-6" />
                <h3 className="text-2xl font-semibold text-foreground mb-4">
                  Bienvenue dans Trading Notes
                </h3>
                <p className="text-muted-foreground max-w-md mb-6">
                  Sélectionnez une note dans la sidebar ou créez-en une nouvelle pour commencer.
                </p>
                <button
                  onClick={() => setCurrentNoteId(Date.now().toString())}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Créer une nouvelle note
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Rich Editor bottom */}
        <div className="border-t border-border bg-background p-6">
          <SimpleRichEditor
            value={editorContent}
            onChange={setEditorContent}
            placeholder={currentNoteId ? "Ajouter du contenu à cette note..." : "Commencer une nouvelle note de trading..."}
            onInsertScreenshot={handleScreenshot}
            onSubmit={() => handleAddContent(editorContent, currentNoteId)}
            currentPageInfo={currentPageInfo || undefined}
            className="w-full max-w-4xl mx-auto"
          />
          
          {/* Actions */}
          <div className="flex items-center justify-between mt-4 max-w-4xl mx-auto">
            <button
              onClick={() => handleAddContent(editorContent, currentNoteId)}
              disabled={!editorContent.trim()}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              {currentNoteId ? 'Ajouter à la note' : 'Créer nouvelle note'}
            </button>
            
            <div className="text-sm text-muted-foreground">
              <kbd className="bg-muted px-2 py-1 rounded text-xs">⏎</kbd> pour sauvegarder, 
              <kbd className="bg-muted px-2 py-1 rounded text-xs ml-2">⇧⏎</kbd> pour nouvelle ligne
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FullscreenApp