import React, { useState, useEffect, useRef } from 'react'
import {
  BookOpen,
  Plus,
  Search,
  Download,
  Loader2,
  Menu,
  X,
  ExternalLink,
  SidebarClose,
  Maximize,
  Trash2,
  Check,
  Sparkles
} from 'lucide-react'

import CaptureInput, { type CaptureInputHandle } from '@/components/CaptureInput'
import ConfirmDialog from '@/components/ConfirmDialog'
import TabPicker from '@/components/TabPicker'
import CurrentNoteView from '@/components/CurrentNoteView'
import ImageLightbox from '@/components/ImageLightbox'
import AnalyzeNoteDialog from '@/components/AnalyzeNoteDialog'
import storage from '@/lib/storage'
import { stateSync } from '@/lib/state-sync'
import { exportNoteToPDF } from '@/lib/pdf-export'
import { formatSmartDate, formatCompactDate } from '@/lib/date-utils'
import type { AcademicNote, Settings as SettingsType } from '@/types/academic'

function FullscreenApp() {
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [notes, setNotes] = useState<AcademicNote[]>([])
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editorContent, setEditorContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPageInfo, setCurrentPageInfo] = useState<{url: string, title: string} | null>(null)
  const editorRef = useRef<CaptureInputHandle>(null)
  const noteDisplayRef = useRef<HTMLDivElement>(null)

  // États pour l'édition du titre
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Smart capture
  const [isSmartCapturing, setIsSmartCapturing] = useState(false)
  const [smartCaptureError, setSmartCaptureError] = useState<string | null>(null)
  const [noteRefreshTrigger, setNoteRefreshTrigger] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false)

  // Tab Picker (pour capturer depuis un autre onglet en fullscreen)
  const [tabPickerConfig, setTabPickerConfig] = useState<{
    isOpen: boolean
    onSelect: (tabId: number) => void
    onCancel: () => void
    title?: string
    description?: string
  } | null>(null)

  const selectTab = (title?: string, description?: string): Promise<number | null> => {
    return new Promise((resolve) => {
      setTabPickerConfig({
        isOpen: true,
        onSelect: (tabId: number) => { setTabPickerConfig(null); resolve(tabId) },
        onCancel: () => { setTabPickerConfig(null); resolve(null) },
        title,
        description
      })
    })
  }

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
      if (message.source !== 'fullscreen') {
        loadData()
        if (message.noteId) {
          setNoteRefreshTrigger(Date.now())
        }
      }
    })

    return () => {
      unsubscribeSync()
    }
  }, [])

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
        storage.getNotes(1000),
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

  // Fonction pour ajouter du contenu — même logique que sidepanel
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
        // Ajouter à une note existante via addMessageToNote (met à jour BOTH messages[] ET content)
        await storage.addMessageToNote(noteId, {
          type: 'text',
          content: content
        })
        await loadData()
        setNoteRefreshTrigger(Date.now())
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
        setNoteRefreshTrigger(Date.now())
      }

      setEditorContent('')
      setTimeout(() => {
        editorRef.current?.focus()
        if (noteDisplayRef.current) {
          noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
        }
      }, 100)
    } catch (error) {
      console.error('Error adding content:', error)
      alert('Erreur lors de l\'ajout du contenu')
    }
  }

  // Capture d'écran — avec Tab Picker en fullscreen
  const handleScreenshot = async (): Promise<string | null> => {
    try {
      const targetTabId = await selectTab('Capture d\'écran', 'Choisissez la page à capturer')
      if (!targetTabId) return null

      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        payload: { targetTabId }
      })
      return response?.dataUrl || null
    } catch (error) {
      console.error('Error taking screenshot:', error)
      return null
    }
  }

  // Capture intelligente — nouvelle note (avec Tab Picker en fullscreen)
  const handleSmartCapture = async () => {
    setSmartCaptureError(null)

    try {
      // Sélectionner l'onglet cible via le Tab Picker
      const targetTabId = await selectTab('Capture intelligente', 'Choisissez la page à analyser')
      if (!targetTabId) return

      setIsSmartCapturing(true)

      // Extraction du contenu depuis l'onglet cible
      const result = await chrome.runtime.sendMessage({ type: 'SMART_CAPTURE', tabId: targetTabId })
      if (!result?.success) {
        throw new Error(result?.error || 'Extraction échouée')
      }

      // Screenshot ciblé via le service worker (switch d'onglet temporaire)
      let screenshotDataUrl = ''
      try {
        const screenshotResult = await chrome.runtime.sendMessage({
          type: 'CAPTURE_SCREENSHOT',
          payload: { targetTabId }
        })
        screenshotDataUrl = screenshotResult?.dataUrl || ''
      } catch (screenshotError) {
        console.warn('Screenshot capture failed:', screenshotError)
      }

      const newNoteId = Date.now().toString()
      let noteContent = ''
      if (screenshotDataUrl) {
        noteContent += `<p><img src="${screenshotDataUrl}" alt="Capture de la page" style="max-width:100%; border-radius:8px; margin-top:8px;"/></p>`
      }
      noteContent += '<p></p><p><em>Mes notes:</em></p><p></p>'

      const newNote: AcademicNote = {
        id: newNoteId,
        title: result.pageTitle.slice(0, 80) + (result.pageTitle.length > 80 ? '...' : ''),
        content: noteContent,
        summary: result.summary || '',
        keyPoints: result.keyPoints || [],
        url: result.url,
        favicon: result.favicon,
        timestamp: Date.now(),
        type: result.contentType || 'webpage',
        tags: result.tags || [],
        concepts: result.concepts || [],
        screenshots: [],
        metadata: {
          domain: result.domain,
          title: result.pageTitle,
          author: result.author,
          description: result.description,
          ogImage: result.ogImage,
          siteName: result.siteName,
          language: 'fr'
        }
      }

      await storage.saveNote(newNote)
      setCurrentNoteId(newNoteId)
      setEditorContent('')
      await loadData()
    } catch (error) {
      console.error('Smart capture error:', error)
      setSmartCaptureError(error instanceof Error ? error.message : 'Erreur lors de la capture intelligente')
    } finally {
      setIsSmartCapturing(false)
    }
  }

  // Capture intelligente — ajouter à la note courante (avec Tab Picker + addMessageToNote)
  const handleSmartCaptureToCurrentNote = async () => {
    if (!currentNoteId) return
    setSmartCaptureError(null)

    try {
      // Sélectionner l'onglet cible via le Tab Picker
      const targetTabId = await selectTab('Capture intelligente', 'Choisissez la page à analyser')
      if (!targetTabId) return

      setIsSmartCapturing(true)

      const result = await chrome.runtime.sendMessage({ type: 'SMART_CAPTURE', tabId: targetTabId })
      if (!result?.success) {
        throw new Error(result?.error || 'Extraction échouée')
      }

      // Construire le contenu texte (résumé + points clés)
      let textContent = `<hr><p><strong>--- Capture: ${result.pageTitle} ---</strong></p>`
      if (result.summary) {
        textContent += `<p><strong>Résumé:</strong> ${result.summary}</p>`
      }
      if (result.keyPoints?.length > 0) {
        textContent += '<p><strong>Points clés:</strong></p><ul>'
        result.keyPoints.forEach((p: string) => textContent += `<li>${p}</li>`)
        textContent += '</ul>'
      }

      // Ajouter comme message (met à jour messages[] ET content)
      await storage.addMessageToNote(currentNoteId, {
        type: 'text',
        content: textContent
      })

      // Screenshot ciblé via le service worker
      try {
        const screenshotResult = await chrome.runtime.sendMessage({
          type: 'CAPTURE_SCREENSHOT',
          payload: { targetTabId }
        })
        if (screenshotResult?.dataUrl) {
          await storage.addMessageToNote(currentNoteId, {
            type: 'image',
            content: screenshotResult.dataUrl,
            metadata: { alt: 'Capture de la page' }
          })
        }
      } catch (e) {
        console.warn('Screenshot capture failed:', e)
      }

      await loadData()
      setNoteRefreshTrigger(Date.now())
      setTimeout(() => {
        if (noteDisplayRef.current) {
          noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
        }
      }, 100)
    } catch (error) {
      console.error('Smart capture to current note error:', error)
      setSmartCaptureError(error instanceof Error ? error.message : 'Erreur lors de la capture')
    } finally {
      setIsSmartCapturing(false)
    }
  }

  // Ouvrir le site web Journal d'Études
  const handleOpenWebsite = () => {
    window.open('https://journal-detudes.aoknowledge.com', '_blank')
  }

  // Retourner au sidepanel
  const handleBackToSidepanel = async () => {
    try {
      const allTabs = await chrome.tabs.query({ currentWindow: true })
      const normalTab = allTabs.find(tab =>
        tab.url && !tab.url.startsWith('chrome-extension://')
      )

      if (normalTab?.id) {
        await chrome.sidePanel.open({ tabId: normalTab.id })
        await chrome.storage.session.set({ sidePanelOpen: true })
        await chrome.tabs.update(normalTab.id, { active: true })
        window.close()
      } else {
        const newTab = await chrome.tabs.create({ url: 'chrome://newtab/' })
        if (newTab.id) {
          await chrome.sidePanel.open({ tabId: newTab.id })
          await chrome.storage.session.set({ sidePanelOpen: true })
        }
        window.close()
      }
    } catch (error) {
      console.error('Error returning to sidepanel:', error)
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

  // Supprimer une note (depuis header ou sidebar)
  const handleDeleteNote = (noteId?: string) => {
    const id = noteId || currentNoteId
    if (!id) return
    setDeleteConfirmNoteId(id)
  }

  const confirmDeleteNote = async () => {
    if (!deleteConfirmNoteId) return
    setIsDeleting(true)
    try {
      await storage.deleteNote(deleteConfirmNoteId)
      if (deleteConfirmNoteId === currentNoteId) {
        setCurrentNoteId(null)
      }
      await loadData()
    } catch (error) {
      console.error('Error deleting note:', error)
    } finally {
      setIsDeleting(false)
      setDeleteConfirmNoteId(null)
    }
  }

  // Édition du titre
  const startEditingTitle = () => {
    if (currentNote) {
      setEditedTitle(currentNote.title)
      setIsEditingTitle(true)
      setTimeout(() => titleInputRef.current?.focus(), 50)
    }
  }

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
    } catch (error) {
      console.error('Error saving title:', error)
    }
  }

  // Calculer currentNote
  const currentNote = currentNoteId ? notes.find(n => n.id === currentNoteId) : null

  const handleExportPDF = async () => {
    if (!currentNote) return
    setIsExporting(true)
    try {
      await exportNoteToPDF(currentNote)
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setIsExporting(false)
    }
  }

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
              aria-label="Fermer la sidebar"
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
              onClick={() => setCurrentNoteId(null)}
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-dashed border-border mb-2"
            >
              <Plus size={16} className="text-muted-foreground" />
              <span className="text-muted-foreground">Nouvelle note</span>
            </button>

            {filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => setCurrentNoteId(note.id)}
                className={`group w-full text-left p-3 rounded-lg transition-colors mb-1 ${
                  currentNoteId === note.id
                    ? 'bg-primary/10 border-primary/20 border'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground text-sm line-clamp-1 mb-1">
                      {note.title}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {note.content.replace(/<[^>]*>/g, '').slice(0, 100)}...
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCompactDate(note.timestamp)}
                    </div>
                  </div>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id) }}
                    className="p-1 mt-0.5 text-muted-foreground hover:text-destructive rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Supprimer"
                    aria-label="Supprimer la note"
                  >
                    <Trash2 size={14} />
                  </span>
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
                aria-label="Ouvrir la sidebar"
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
                      aria-label="Sauvegarder le titre"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setIsEditingTitle(false)}
                      className="p-1 text-muted-foreground hover:bg-muted rounded"
                      title="Annuler"
                      aria-label="Annuler la modification"
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
                  Modifié {formatSmartDate(currentNote.timestamp)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {currentNote && (
              <>
                <button
                  onClick={() => handleDeleteNote()}
                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                  title="Supprimer la note"
                  aria-label="Supprimer la note"
                >
                  <Trash2 size={18} />
                </button>
                <div className="w-px h-6 bg-border mx-1"></div>
              </>
            )}
            <button
              onClick={handleExportPDF}
              disabled={!currentNote || isExporting}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={isExporting ? "Export en cours..." : "Exporter en PDF"}
              aria-label="Exporter en PDF"
            >
              {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>

            <button
              onClick={currentNote ? () => setShowAnalyzeDialog(true) : undefined}
              disabled={!currentNote}
              className={`p-2 rounded-md transition-colors ${
                currentNote
                  ? 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10'
                  : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
              title={currentNote ? "Analyser avec une IA" : "Sélectionnez une note pour analyser"}
              aria-label="Analyser avec une IA"
            >
              <Sparkles size={18} />
            </button>

            <button
              onClick={handleNativeFullscreen}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Activer plein écran natif"
              aria-label="Plein écran"
            >
              <Maximize size={18} />
            </button>

            <button
              onClick={handleOpenWebsite}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Ouvrir Journal d'Études"
              aria-label="Ouvrir Journal d'Études"
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
        <div className="flex-1 flex min-h-0">
          <div ref={noteDisplayRef} className="flex-1 overflow-y-auto">
            {currentNote ? (
              <div className="p-8 max-w-4xl mx-auto">
                <CurrentNoteView
                  noteId={currentNoteId!}
                  onNoteUpdate={loadData}
                  refreshTrigger={noteRefreshTrigger}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                {isSmartCapturing ? (
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
                    <p className="text-muted-foreground">Analyse de la page en cours...</p>
                  </div>
                ) : (
                  <>
                    <BookOpen size={64} className="text-muted-foreground mb-6" />
                    <h3 className="text-2xl font-semibold text-foreground mb-4">
                      Bienvenue dans Trading Notes
                    </h3>
                    <p className="text-muted-foreground max-w-md mb-6">
                      Sélectionnez une note dans la sidebar ou écrivez dans la zone ci-dessous.
                    </p>
                    {smartCaptureError && (
                      <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg max-w-md">
                        <p className="text-sm text-destructive">{smartCaptureError}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hub de capture */}
        <div className="border-t border-border bg-background px-6 py-3">
          <CaptureInput
            ref={editorRef}
            value={editorContent}
            onChange={setEditorContent}
            placeholder={currentNoteId ? "Ajouter du contenu..." : "Écrivez ou capturez..."}
            onInsertScreenshot={handleScreenshot}
            onSubmit={(content) => handleAddContent(content, currentNoteId)}
            onSmartCapture={currentNoteId ? handleSmartCaptureToCurrentNote : handleSmartCapture}
            isSmartCapturing={isSmartCapturing}
            currentPageInfo={currentPageInfo || undefined}
            className="w-full max-w-4xl mx-auto"
          />
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

      <ConfirmDialog
        isOpen={!!deleteConfirmNoteId}
        onConfirm={confirmDeleteNote}
        onCancel={() => setDeleteConfirmNoteId(null)}
        title="Supprimer la note"
        message="Cette action est irréversible."
        isLoading={isDeleting}
      />

      {/* Tab Picker pour la capture ciblée depuis fullscreen */}
      {tabPickerConfig && (
        <TabPicker
          isOpen={tabPickerConfig.isOpen}
          onSelect={tabPickerConfig.onSelect}
          onCancel={tabPickerConfig.onCancel}
          title={tabPickerConfig.title}
          description={tabPickerConfig.description}
        />
      )}

      {/* Dialog d'analyse AI */}
      {currentNote && (
        <AnalyzeNoteDialog
          isOpen={showAnalyzeDialog}
          onClose={() => setShowAnalyzeDialog(false)}
          note={currentNote}
          defaultProvider={settings?.analysisProvider}
        />
      )}
    </div>
  )
}

export default FullscreenApp
