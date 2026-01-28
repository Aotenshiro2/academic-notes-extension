import React, { useState, useEffect, useRef } from 'react'
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
  ArrowLeft,
  Sparkles,
  Loader2
} from 'lucide-react'

import Header from '@/components/Header'
import CurrentNoteView from '@/components/CurrentNoteView'
import EmptyNoteView from '@/components/EmptyNoteView'
import SimpleRichEditor, { type SimpleRichEditorHandle } from '@/components/SimpleRichEditor'
import HistoryDropdown from '@/components/HistoryDropdown'
import SkoolBanner from '@/components/SkoolBanner'
import DataMigration from '@/components/DataMigration'
import SettingsView from '@/components/SettingsView'

import storage from '@/lib/storage'
import { exportNoteToPDF } from '@/lib/pdf-export'
import type { AcademicNote, Settings as SettingsType, Screenshot } from '@/types/academic'

function App() {
  // Suppression du système de vue par tabs
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [notes, setNotes] = useState<AcademicNote[]>([])
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showMigration, setShowMigration] = useState(false)
  const [editorContent, setEditorContent] = useState('')
  const editorRef = useRef<SimpleRichEditorHandle>(null)
  const [currentPageInfo, setCurrentPageInfo] = useState<{url: string, title: string} | null>(null)
  const [isSmartCapturing, setIsSmartCapturing] = useState(false)
  const [smartCaptureError, setSmartCaptureError] = useState<string | null>(null)
  const [noteRefreshTrigger, setNoteRefreshTrigger] = useState(0)

  // Charger les données initiales
  useEffect(() => {
    loadData()
    loadCurrentPageInfo()

    // Signaler que le sidepanel est ouvert
    chrome.storage.session.set({ sidePanelOpen: true })

    // Écouter les messages de fermeture
    const handleMessage = (message: any) => {
      if (message.type === 'CLOSE_SIDEPANEL') {
        // Mettre à jour l'état avant de fermer
        chrome.storage.session.set({ sidePanelOpen: false }).then(() => {
          window.close()
        })
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    // Écouter les changements d'onglet actif pour mettre à jour les infos de la page
    const handleTabActivated = () => {
      loadCurrentPageInfo()
    }

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      // Mettre à jour si l'URL ou le titre change
      if (changeInfo.url || changeInfo.title) {
        loadCurrentPageInfo()
      }
    }

    chrome.tabs.onActivated.addListener(handleTabActivated)
    chrome.tabs.onUpdated.addListener(handleTabUpdated)

    // Nettoyer l'état à la fermeture
    const handleBeforeUnload = () => {
      chrome.storage.session.set({ sidePanelOpen: false })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
      chrome.tabs.onActivated.removeListener(handleTabActivated)
      chrome.tabs.onUpdated.removeListener(handleTabUpdated)
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
          // Mettre à jour les métadonnées si on est sur une page différente
          const shouldUpdateMetadata = currentTab?.url && currentTab.url !== existingNote.url

          const updatedNote = {
            ...existingNote,
            content: existingNote.content + '<br><br>' + content,
            timestamp: Date.now(),
            // Mettre à jour l'URL et métadonnées si on est sur une nouvelle page
            ...(shouldUpdateMetadata && {
              url: currentTab.url || existingNote.url,
              favicon: currentTab.favIconUrl || existingNote.favicon,
              metadata: {
                ...existingNote.metadata,
                domain,
                title: currentTab.title || existingNote.metadata?.title || 'Note'
              }
            })
          }
          await storage.saveNote(updatedNote)
          await loadData()
          setNoteRefreshTrigger(Date.now()) // Force CurrentNoteView à recharger
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
        setNoteRefreshTrigger(Date.now()) // Force CurrentNoteView à recharger
      }
      
      setEditorContent('')
      // Focus l'editeur apres que React ait fini le render
      setTimeout(() => {
        editorRef.current?.focus()
      }, 0)
    } catch (error) {
      console.error('Error adding content:', error)
      alert('Erreur lors de l\'ajout du contenu')
    }
  }

  // Fonction pour créer une nouvelle note vide
  const handleNewNote = async () => {
    try {
      const newNoteId = Date.now().toString()
      const newNote: AcademicNote = {
        id: newNoteId,
        title: 'Nouvelle note',
        content: '',
        url: '',
        favicon: '',
        timestamp: Date.now(),
        type: 'manual',
        tags: [],
        concepts: [],
        screenshots: [],
        metadata: {
          domain: '',
          title: 'Nouvelle note',
          language: 'fr'
        }
      }

      await storage.saveNote(newNote)
      setCurrentNoteId(newNoteId)
      await loadData()
    } catch (error) {
      console.error('Error creating new note:', error)
      alert('Erreur lors de la création de la note')
    }
  }

  // Fonction pour capturer la page actuelle et créer une note avec screenshot
  const handleCapturePage = async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]

      if (!currentTab) {
        alert('Impossible de récupérer les informations de la page')
        return
      }

      let domain = ''
      try {
        if (currentTab.url) {
          domain = new URL(currentTab.url).hostname.replace('www.', '')
        }
      } catch (urlError) {
        console.warn('Invalid URL:', currentTab.url)
      }

      // Capturer le screenshot de la page
      let screenshotDataUrl = ''
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab()
      } catch (screenshotError) {
        console.warn('Screenshot capture failed:', screenshotError)
        // Continue sans screenshot si la capture échoue
      }

      // Créer une note avec les infos de la page + screenshot
      const newNoteId = Date.now().toString()
      const pageTitle = currentTab.title || 'Page sans titre'

      // Contenu enrichi avec screenshot
      let content = `<p><strong>${pageTitle}</strong></p><p><a href="${currentTab.url}" target="_blank">${currentTab.url}</a></p>`
      if (screenshotDataUrl) {
        content += `<p><img src="${screenshotDataUrl}" alt="Capture de ${domain}" style="max-width:100%; border-radius:8px; margin-top:8px;"/></p>`
      }
      content += '<p></p>'

      const newNote: AcademicNote = {
        id: newNoteId,
        title: pageTitle.slice(0, 50) + (pageTitle.length > 50 ? '...' : ''),
        content,
        url: currentTab.url || '',
        favicon: currentTab.favIconUrl || '',
        timestamp: Date.now(),
        type: 'webpage',
        tags: [],
        concepts: [],
        screenshots: [],
        metadata: {
          domain,
          title: pageTitle,
          language: 'fr'
        }
      }

      await storage.saveNote(newNote)
      setCurrentNoteId(newNoteId)
      await loadData()
    } catch (error) {
      console.error('Error capturing page:', error)
      alert('Erreur lors de la capture de la page')
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

  // Fonction de capture intelligente (mode gratuit - extraction heuristique)
  const handleSmartCapture = async () => {
    setIsSmartCapturing(true)
    setSmartCaptureError(null)

    try {
      // Extraction du contenu structuré via service worker (heuristiques, pas d'IA)
      const result = await chrome.runtime.sendMessage({ type: 'SMART_CAPTURE' })

      if (!result?.success) {
        throw new Error(result?.error || 'Extraction échouée')
      }

      // Créer la note directement avec les données extraites par heuristiques
      const newNoteId = Date.now().toString()

      // Construire le contenu HTML de la note
      let noteContent = ''

      // Résumé
      if (result.summary) {
        noteContent += `<p><strong>Résumé:</strong> ${result.summary}</p>`
      }

      // Points clés (si disponibles)
      if (result.keyPoints && result.keyPoints.length > 0) {
        noteContent += '<p><strong>Points clés:</strong></p><ul>'
        result.keyPoints.forEach((point: string) => {
          noteContent += `<li>${point}</li>`
        })
        noteContent += '</ul>'
      }

      // Espace pour les notes personnelles
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
      await loadData()
    } catch (error) {
      console.error('Smart capture error:', error)
      setSmartCaptureError(error instanceof Error ? error.message : 'Erreur lors de la capture intelligente')
    } finally {
      setIsSmartCapturing(false)
    }
  }

  // Fonction pour exporter la note courante en PDF
  const handleExportPDF = async () => {
    if (!currentNote) return
    try {
      await exportNoteToPDF(currentNote)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Erreur lors de l\'export PDF')
    }
  }

  // Fonction pour ouvrir la vue fullscreen de l'extension
  const handleFullscreen = async () => {
    try {
      // URL de la page fullscreen de l'extension
      const extensionUrl = chrome.runtime.getURL('src/fullscreen/index.html')
      
      // Ajouter l'ID de la note courante si disponible
      const fullUrl = currentNoteId 
        ? `${extensionUrl}?noteId=${currentNoteId}`
        : extensionUrl
      
      // Ouvrir dans un nouvel onglet
      await chrome.tabs.create({ url: fullUrl })
      
      // Fermer le sidepanel automatiquement pour éviter la fragmentation
      chrome.storage.session.set({ sidePanelOpen: false })
      window.close()
    } catch (error) {
      console.error('Error opening fullscreen view:', error)
      alert('Erreur lors de l\'ouverture de la vue étendue')
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
        onNewNote={handleNewNote}
        onFullscreen={handleFullscreen}
        onExportPDF={currentNote ? handleExportPDF : undefined}
        onSettings={() => setShowSettings(!showSettings)}
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
          {showSettings ? (
            <div className="space-y-4">
              {/* Header avec bouton retour */}
              <div className="flex items-center space-x-3 pb-3 border-b border-border">
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title="Retour"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-lg font-semibold text-foreground">Paramètres</h2>
              </div>
              <SettingsView
                settings={settings!}
                onChange={async (newSettings) => {
                  await storage.saveSettings(newSettings)
                  const updated = await storage.getSettings()
                  setSettings(updated)
                }}
                onExport={async () => {
                  const data = await storage.exportData()
                  const blob = new Blob([data], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `trading-notes-backup-${new Date().toISOString().split('T')[0]}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                onImport={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const text = await file.text()
                    const result = await storage.importData(text)
                    if (result.success) {
                      alert('Import réussi !')
                      await loadData()
                    } else {
                      alert('Erreur import : ' + result.error)
                    }
                  }
                }}
                onSyncToJournal={() => {
                  alert('Sync Journal non implémenté')
                }}
              />
            </div>
          ) : showMigration ? (
            <DataMigration />
          ) : currentNoteId ? (
            <CurrentNoteView noteId={currentNoteId} onNoteUpdate={loadData} refreshTrigger={noteRefreshTrigger} />
          ) : (
            <>
              {isSmartCapturing && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Analyse de la page en cours...</p>
                  </div>
                </div>
              )}
              {smartCaptureError && !isSmartCapturing && (
                <div className="mx-4 mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{smartCaptureError}</p>
                </div>
              )}
              {!isSmartCapturing && (
                <EmptyNoteView
                  onCapturePage={handleCapturePage}
                  onSmartCapture={handleSmartCapture}
                  lastNote={notes.length > 0 ? notes[0] : undefined}
                  onSelectNote={setCurrentNoteId}
                />
              )}
            </>
          )}
        </div>
        
        {/* Rich Editor bottom fixe (style Claude avec fonctionnalités) */}
        {!showMigration && (
          <div className="border-t border-border bg-background p-4">
            <SimpleRichEditor
              ref={editorRef}
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