import { toast } from '../lib/toast'
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
  Sparkles,
  FileText,
  FileDown,
} from 'lucide-react'

function GoogleDriveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  )
}

import CaptureInput, { type CaptureInputHandle } from '@/components/CaptureInput'
import ConfirmDialog from '@/components/ConfirmDialog'
import TabPicker from '@/components/TabPicker'
import CurrentNoteView from '@/components/CurrentNoteView'
import AnalyzeNoteDialog from '@/components/AnalyzeNoteDialog'
import ImageLightbox from '@/components/ImageLightbox'
import storage, { restoredFromBackup } from '@/lib/storage'
import { enrichirCapture } from '@/lib/capture-ia'
import { stateSync } from '@/lib/state-sync'
import { captureExternalScreen } from '@/lib/external-capture'
import { exportNoteToPDF } from '@/lib/pdf-export'
import { exportNoteToDocx } from '@/lib/docx-export'
import { exportNoteToDrive } from '@/lib/drive-export'
import { formatSmartDate, formatCompactDate } from '@/lib/date-utils'
import { splitHtmlIntoMessages, titleFromMessages } from '@/lib/html-blocks'
import { collectNoteImages } from '@/lib/note-images'
import type { AcademicNote, NoteSummary, NoteFolder, Settings as SettingsType } from '@/types/academic'

function FullscreenApp() {
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  // Résumés uniquement : cf. sidepanel/App.tsx
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
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
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  // Validation du titre sur blur ET sur clic : verrou anti double-écriture
  const savingTitle = useRef(false)

  // Smart capture
  const [isSmartCapturing, setIsSmartCapturing] = useState(false)
  const [smartCaptureError, setSmartCaptureError] = useState<string | null>(null)
  const [noteRefreshTrigger, setNoteRefreshTrigger] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false)
  // Note complète chargée seulement le temps de l'analyse, puis relâchée
  const [analyzeNote, setAnalyzeNote] = useState<AcademicNote | null>(null)

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

  const [initialLightboxIndex, setInitialLightboxIndex] = React.useState<number | undefined>(undefined)
  const [imageViewMode, setImageViewMode] = React.useState<{ images: string[]; currentIndex: number } | null>(null)
  const [imageViewIndex, setImageViewIndex] = React.useState(0)

  // URL params pour récupérer l'ID de note (et index lightbox depuis sidepanel)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)

    // Mode image viewer — ouvert depuis le sidepanel via clic image
    if (urlParams.get('imageView') === '1') {
      chrome.storage.session.get('pendingImageView').then(async (result) => {
        const data = result.pendingImageView as { noteId: string; currentIndex: number } | undefined
        if (!data) return
        chrome.storage.session.remove('pendingImageView')
        const note = await storage.getNote(data.noteId)
        if (!note) return
        setImageViewMode({ images: collectNoteImages(note), currentIndex: data.currentIndex })
        setImageViewIndex(data.currentIndex)
      })
      return
    }

    const noteIdFromUrl = urlParams.get('noteId')
    if (noteIdFromUrl) {
      setCurrentNoteId(noteIdFromUrl)
    }
    const lightboxIndexFromUrl = urlParams.get('lightboxIndex')
    if (lightboxIndexFromUrl !== null) {
      setInitialLightboxIndex(parseInt(lightboxIndexFromUrl))
    }

    loadData()
    loadCurrentPageInfo()

    // Listen to sync events from other views (sidepanel, other fullscreen windows, etc.)
    const unsubscribeSync = stateSync.subscribe((message) => {
      if (!stateSync.isOwnMessage(message)) {
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
        storage.getNoteSummaries(1000),
        storage.getSettings()
      ])
      setNotes(loadedNotes)
      setFolders(loadedSettings.folders ?? [])
      setSettings(loadedSettings)

      // Diagnostic mémoire : c'est ce chiffre qui dit si la correction tient
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      if (mem) {
        console.log(
          `[AOK Mémoire] ${loadedNotes.length} notes · tas ${Math.round(mem.usedJSHeapSize / 1048576)} Mo ` +
          `/ ${Math.round(mem.jsHeapSizeLimit / 1048576)} Mo`
        )
      }

      if (restoredFromBackup) {
        console.warn('[FullscreenApp] Notes restored from backup after IndexedDB data loss')
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fonction pour ajouter du contenu — même logique que sidepanel
  const handleAddContent = async (content: string, noteId: string | null) => {
    try {
      // Cf. sidepanel : chaque image de la barre de capture devient son propre
      // bloc, sinon elle n'est pas supprimable individuellement
      const blocks = splitHtmlIntoMessages(content)
      if (blocks.length === 0) return

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

      let targetNoteId = noteId
      if (!targetNoteId) {
        // Créer une nouvelle note (vide : les blocs sont posés juste après)
        const newNoteId = Date.now().toString()
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
        const newNote: AcademicNote = {
          id: newNoteId,
          title: titleFromMessages(blocks, `Note du ${today}`),
          content: '',
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
        targetNoteId = newNoteId
        setCurrentNoteId(newNoteId)
      }

      for (const block of blocks) {
        await storage.addMessageToNote(targetNoteId, block)
      }

      await loadData()
      setNoteRefreshTrigger(Date.now())

      setEditorContent('')
      setTimeout(() => {
        editorRef.current?.focus()
        if (noteDisplayRef.current) {
          noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
        }
      }, 100)
    } catch (error) {
      console.error('Error adding content:', error)
      toast.error('Erreur lors de l\'ajout du contenu')
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

      // Passe secrétaire, avec repli silencieux sur les heuristiques (1.8.0)
      const enrichi = await enrichirCapture(result, screenshotDataUrl || null)

      const newNoteId = Date.now().toString()
      const titreNote = enrichi.pageTitle || result.pageTitle || 'Capture'
      let noteContent = ''
      if (screenshotDataUrl) {
        noteContent += `<p><img src="${screenshotDataUrl}" alt="Capture de la page" style="max-width:100%; border-radius:8px; margin-top:8px;"/></p>`
      }
      if (enrichi.manquant) {
        noteContent += `<p><em>Non capturé : ${enrichi.manquant}</em></p>`
      }
      noteContent += '<p></p><p><em>Mes notes:</em></p><p></p>'

      const newNote: AcademicNote = {
        id: newNoteId,
        title: titreNote.slice(0, 80) + (titreNote.length > 80 ? '...' : ''),
        content: noteContent,
        summary: enrichi.summary,
        keyPoints: enrichi.keyPoints,
        url: result.url,
        favicon: result.favicon,
        timestamp: Date.now(),
        type: result.contentType || 'webpage',
        tags: enrichi.tags,
        concepts: enrichi.concepts,
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

      // Le screenshot d'abord : sur un graphique, c'est lui qui porte
      // l'analyse, et la passe secrétaire doit pouvoir le lire.
      let apercu = ''
      try {
        const r = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', payload: { targetTabId } })
        apercu = r?.dataUrl || ''
      } catch (e) {
        console.warn('Screenshot capture failed:', e)
      }

      const enrichi = await enrichirCapture(result, apercu || null)

      // Construire le contenu texte (résumé + points clés)
      let textContent = `<hr><p><strong>--- Capture : ${enrichi.pageTitle || result.pageTitle} ---</strong></p>`
      if (enrichi.summary) {
        textContent += `<p><strong>Résumé :</strong> ${enrichi.summary}</p>`
      }
      if (enrichi.keyPoints.length > 0) {
        textContent += '<p><strong>Points clés :</strong></p><ul>'
        enrichi.keyPoints.forEach((p: string) => textContent += `<li>${p}</li>`)
        textContent += '</ul>'
      }
      if (enrichi.manquant) {
        textContent += `<p><em>Non capturé : ${enrichi.manquant}</em></p>`
      }

      // Ajouter comme message (met à jour messages[] ET content)
      await storage.addMessageToNote(currentNoteId, {
        type: 'text',
        content: textContent
      })

      // Images extraites par la stratégie (ex: post Skool)
      const extractedImages = result.extras?.images as { src: string; alt: string }[] | undefined
      if (extractedImages?.length) {
        for (const img of extractedImages) {
          await storage.addMessageToNote(currentNoteId, {
            type: 'image',
            content: img.src,
            metadata: { alt: img.alt, sourceUrl: result.url }
          })
        }
      }

      // Le screenshot, déjà pris plus haut pour la passe secrétaire, rejoint
      // la note comme bloc image. Une seule prise : deux basculements d'onglet
      // pour la même capture se voyaient à l'écran.
      if (apercu) {
        await storage.addMessageToNote(currentNoteId, {
          type: 'image',
          content: apercu,
          metadata: { alt: 'Capture de la page' }
        })
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

  // Capture d'une app externe (Zoom, desktop, etc.) via getDisplayMedia
  const handleExternalScreenshot = async (): Promise<string | null> => {
    try {
      return await captureExternalScreen()
    } catch (error) {
      if ((error as DOMException)?.name !== 'NotAllowedError') {
        console.error('Erreur capture externe:', error)
      }
      return null
    }
  }

  // Ouvrir le site web Journal d'Études
  const handleOpenWebsite = () => {
    chrome.tabs.create({ url: 'https://journal.aoknowledge.com' })
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
    if (savingTitle.current) return
    savingTitle.current = true
    try {
      // Note fraîche : saveNote réécrit tout l'enregistrement, un state périmé
      // écraserait ce qui a été sauvegardé entre-temps
      const fresh = await storage.getNote(currentNoteId)
      if (!fresh) return
      await storage.saveNote({ ...fresh, title: newTitle })
      await loadData()
    } catch (error) {
      console.error('[FullscreenApp] Renommage impossible:', error)
      toast.error(error instanceof Error ? error.message : 'Impossible de renommer la note')
    } finally {
      setIsEditingTitle(false)
      savingTitle.current = false
    }
  }

  // Calculer currentNote
  const currentNote = currentNoteId ? notes.find(n => n.id === currentNoteId) : null

  // La note complète est relue à l'export : le state ne porte que des résumés
  const freshCurrentNote = async () =>
    currentNoteId ? (await storage.getNote(currentNoteId)) ?? null : null

  const handleOpenAnalyze = async () => {
    const full = await freshCurrentNote()
    if (!full) return
    setAnalyzeNote(full)
    setShowAnalyzeDialog(true)
  }

  const handleExportPDF = async () => {
    const fresh = await freshCurrentNote()
    if (!fresh) return
    setIsExporting(true)
    try {
      await exportNoteToPDF(fresh)
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportDocx = async () => {
    const fresh = await freshCurrentNote()
    if (!fresh) return
    setIsExporting(true)
    try {
      await exportNoteToDocx(fresh)
    } catch (error) {
      console.error('Error exporting DOCX:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportDrive = async () => {
    const fresh = await freshCurrentNote()
    if (!fresh) return
    setIsExporting(true)
    try {
      await exportNoteToDrive(fresh)
    } catch (error) {
      console.error('Error exporting to Drive:', error)
      toast.error('Erreur lors de l\'export Google Drive : ' + (error instanceof Error ? error.message : 'Erreur inconnue'))
    } finally {
      setIsExporting(false)
    }
  }

  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showExportMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

  // Filtrer les notes selon le dossier actif et la recherche
  const filteredNotes = notes
    .filter(note => activeFolderId === null || note.folderId === activeFolderId)
    .filter(note =>
      !searchQuery ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.searchText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    )

  // Mode image viewer (ouvert depuis le sidepanel via clic image)
  if (imageViewMode) {
    return (
      <div className="fixed inset-0 bg-black">
        <ImageLightbox
          src={imageViewMode.images[imageViewIndex]}
          alt="Image"
          images={imageViewMode.images}
          currentIndex={imageViewIndex}
          onNavigate={setImageViewIndex}
          onClose={() => window.close()}
        />
      </div>
    )
  }

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
            <h1 className="text-lg font-semibold text-foreground">Le Carnet du Trader</h1>
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

          {/* Folder filter pills */}
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              <button
                onClick={() => setActiveFolderId(null)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeFolderId === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Toutes
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolderId(f.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors truncate max-w-[120px] ${
                    activeFolderId === f.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  title={f.name}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
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
                      {note.preview.slice(0, 100)}...
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
                  Le Carnet du Trader - Vue Étendue
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
            <div ref={exportMenuRef} className="relative">
              <button
                onClick={() => { if (currentNote && !isExporting) setShowExportMenu(p => !p) }}
                disabled={!currentNote || isExporting}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={isExporting ? 'Export en cours…' : 'Exporter la note'}
                aria-label="Exporter la note"
              >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1">
                  <button
                    onClick={() => { setShowExportMenu(false); handleExportPDF() }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <FileDown size={14} className="text-red-500 flex-shrink-0" />
                    Exporter en PDF
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); handleExportDocx() }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <FileText size={14} className="text-blue-500 flex-shrink-0" />
                    Google Docs (.docx)
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); handleExportDrive() }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <GoogleDriveIcon size={14} />
                    Google Drive
                  </button>
                </div>
              )}
            </div>

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
                  initialLightboxIndex={initialLightboxIndex}
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
                      Bienvenue dans Le Carnet du Trader
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
            onInsertExternalScreenshot={handleExternalScreenshot}
            onSubmit={(content) => handleAddContent(content, currentNoteId)}
            onSmartCapture={currentNoteId ? handleSmartCaptureToCurrentNote : handleSmartCapture}
            isSmartCapturing={isSmartCapturing}
            currentPageInfo={currentPageInfo || undefined}
            className="w-full max-w-4xl mx-auto"
          />
        </div>
      </div>

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
      {analyzeNote && (
        <AnalyzeNoteDialog
          isOpen={showAnalyzeDialog}
          onClose={() => { setShowAnalyzeDialog(false); setAnalyzeNote(null) }}
          note={analyzeNote}
          defaultProvider={settings?.analysisProvider}
          availableNotes={notes}
          folders={folders}
        />
      )}
    </div>
  )
}

export default FullscreenApp
