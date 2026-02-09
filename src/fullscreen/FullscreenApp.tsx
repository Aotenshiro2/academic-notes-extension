import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  Maximize,
  Trash2,
  Check
} from 'lucide-react'

import SimpleRichEditor, { SimpleRichEditorHandle } from '@/components/SimpleRichEditor'
import ImageLightbox from '@/components/ImageLightbox'
import storage from '@/lib/storage'
import { stateSync } from '@/lib/state-sync'
import { sanitizeHtml } from '@/lib/sanitize'
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
  const editorRef = useRef<SimpleRichEditorHandle>(null)
  const noteDisplayRef = useRef<HTMLDivElement>(null) // Ref pour la zone d'affichage des notes
  const contentEditableRef = useRef<HTMLDivElement>(null) // Ref pour le contenu éditable

  // États pour l'édition
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [isEditingContent, setIsEditingContent] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // URL params pour récupérer l'ID de note
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const noteIdFromUrl = urlParams.get('noteId')
    if (noteIdFromUrl) {
      setCurrentNoteId(noteIdFromUrl)
    }

    loadData()
    loadCurrentPageInfo()

    // Listen to sync events from other views (sidepanel, etc.)
    const unsubscribeSync = stateSync.subscribe((message) => {
      // Reload data when notes are modified in another view
      if (message.source !== 'fullscreen') {
        loadData()
      }
    })

    return () => {
      unsubscribeSync()
    }
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
      
      // Vider l'éditeur et refocus après ajout
      setEditorContent('')
      setTimeout(() => {
        editorRef.current?.focus()
        // Scroller la zone d'affichage des notes vers le bas
        if (noteDisplayRef.current) {
          noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
        }
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

  // Supprimer une note
  const handleDeleteNote = async () => {
    if (!currentNoteId) return
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette note ? Cette action est irréversible.')) {
      try {
        await storage.deleteNote(currentNoteId)
        setCurrentNoteId(null)
        await loadData()
        stateSync.broadcast({ type: 'NOTE_DELETED', noteId: currentNoteId, source: 'fullscreen' })
      } catch (error) {
        console.error('Error deleting note:', error)
        alert('Erreur lors de la suppression de la note')
      }
    }
  }

  // Commencer l'édition du titre
  const startEditingTitle = () => {
    if (currentNote) {
      setEditedTitle(currentNote.title)
      setIsEditingTitle(true)
      setTimeout(() => titleInputRef.current?.focus(), 50)
    }
  }

  // Sauvegarder le titre
  const saveTitle = async () => {
    if (!currentNoteId || !currentNote) return
    const newTitle = editedTitle.trim()
    if (!newTitle) {
      setIsEditingTitle(false)
      return
    }
    try {
      const updatedNote = { ...currentNote, title: newTitle }
      await storage.saveNote(updatedNote)
      setIsEditingTitle(false)
      await loadData()
      stateSync.broadcast({ type: 'NOTE_UPDATED', noteId: currentNoteId, source: 'fullscreen' })
    } catch (error) {
      console.error('Error saving title:', error)
      alert('Erreur lors de la sauvegarde du titre')
    }
  }

  // Calculer currentNote avant les callbacks qui l'utilisent
  const currentNote = currentNoteId ? notes.find(n => n.id === currentNoteId) : null

  // Commencer l'édition du contenu
  const startEditingContent = useCallback(() => {
    if (currentNote) {
      setEditedContent(currentNote.content)
      setIsEditingContent(true)
      setTimeout(() => {
        contentEditableRef.current?.focus()
      }, 0)
    }
  }, [currentNote])

  // Sauvegarder le contenu
  const saveContent = useCallback(async () => {
    if (!currentNoteId || !currentNote) return
    try {
      const newContent = contentEditableRef.current
        ? sanitizeHtml(contentEditableRef.current.innerHTML)
        : editedContent
      const updatedNote = { ...currentNote, content: newContent, timestamp: Date.now() }
      await storage.saveNote(updatedNote)
      setIsEditingContent(false)
      await loadData()
      stateSync.broadcast({ type: 'NOTE_UPDATED', noteId: currentNoteId, source: 'fullscreen' })
    } catch (error) {
      console.error('Error saving content:', error)
      alert('Erreur lors de la sauvegarde du contenu')
    }
  }, [currentNoteId, currentNote, editedContent])

  // Handler de clic sur le contenu
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Si clic sur une image, ouvrir le lightbox
    if (target.tagName === 'IMG') {
      e.stopPropagation()
      e.preventDefault()
      const imgSrc = (target as HTMLImageElement).src
      if (imgSrc) {
        setLightboxImage(imgSrc)
      }
      return
    }

    // Sinon, activer le mode édition
    if (!isEditingContent) {
      startEditingContent()
    }
  }, [isEditingContent, startEditingContent])

  // Handler de clavier pour le contenu
  const handleContentKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditingContent(false)
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveContent()
    }
  }, [saveContent])

  // Handler de blur pour sauvegarde automatique
  const handleContentBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement
    // Ne pas sauvegarder si on clique sur les boutons de contrôle
    if (relatedTarget?.closest('[data-edit-controls]')) {
      return
    }
    if (isEditingContent) {
      saveContent()
    }
  }, [isEditingContent, saveContent])

  // Filtrer les notes selon la recherche
  const filteredNotes = notes.filter(note => 
    !searchQuery || 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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
              {currentNote ? (
                isEditingTitle ? (
                  <div className="flex items-center space-x-2">
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTitle()
                        if (e.key === 'Escape') setIsEditingTitle(false)
                      }}
                      className="text-lg font-semibold bg-transparent border-b-2 border-primary outline-none text-foreground min-w-[200px]"
                    />
                    <button
                      onClick={saveTitle}
                      className="p-1 text-primary hover:bg-primary/10 rounded"
                      title="Sauvegarder"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setIsEditingTitle(false)}
                      className="p-1 text-muted-foreground hover:bg-muted rounded"
                      title="Annuler"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <h2
                    className="text-lg font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                    onClick={startEditingTitle}
                    title="Cliquer pour modifier le titre"
                  >
                    {currentNote.title}
                  </h2>
                )
              ) : (
                <h2 className="text-lg font-semibold text-foreground">
                  Trading Notes - Vue Étendue
                </h2>
              )}
              {currentNote && !isEditingTitle && (
                <p className="text-sm text-muted-foreground">
                  Modifié le {new Date(currentNote.timestamp).toLocaleDateString('fr-FR')} à {new Date(currentNote.timestamp).toLocaleTimeString('fr-FR')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2" data-edit-controls>
            {currentNote && (
              <>
                <button
                  onClick={handleDeleteNote}
                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                  title="Supprimer la note"
                >
                  <Trash2 size={18} />
                </button>
                <div className="w-px h-6 bg-border mx-1"></div>
              </>
            )}
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
          <div ref={noteDisplayRef} className="flex-1 overflow-y-auto">
            {currentNote ? (
              <div className="p-8 max-w-4xl mx-auto">
                {/* Boutons de contrôle en mode édition */}
                {isEditingContent && (
                  <div className="mb-4 flex items-center justify-between" data-edit-controls>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Mode édition</span>
                      <span className="text-xs text-muted-foreground">
                        Échap annuler · Ctrl+S sauver
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={saveContent}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center space-x-2"
                      >
                        <Check size={16} />
                        <span>Sauvegarder</span>
                      </button>
                      <button
                        onClick={() => setIsEditingContent(false)}
                        className="px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors flex items-center space-x-2"
                      >
                        <X size={16} />
                        <span>Annuler</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="prose prose-lg max-w-none">
                  <div
                    ref={contentEditableRef}
                    contentEditable={isEditingContent}
                    suppressContentEditableWarning={true}
                    onClick={handleContentClick}
                    onKeyDown={isEditingContent ? handleContentKeyDown : undefined}
                    onBlur={isEditingContent ? handleContentBlur : undefined}
                    className={`
                      text-foreground leading-relaxed rounded-lg transition-all outline-none
                      ${isEditingContent
                        ? 'border-2 border-primary/40 bg-background p-4 focus:border-primary min-h-[300px]'
                        : 'cursor-pointer hover:bg-muted/30 p-4 -m-4'
                      }
                      [&_img]:cursor-zoom-in [&_img]:transition-opacity [&_img]:hover:opacity-80
                    `}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentNote.content) }}
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
            ref={editorRef}
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

      {/* Image Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage}
          alt="Note image"
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  )
}

export default FullscreenApp