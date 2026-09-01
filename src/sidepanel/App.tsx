import { toast } from '../lib/toast'
import React, { useState, useEffect, useRef } from 'react'
import {
  Settings,
  ArrowLeft,
  Loader2,
  User,
  Sunrise,
  GraduationCap,
  LifeBuoy,
  BookOpen,
  Star,
  Link2,
  Clock,
  BadgeCheck,
  UserPlus,
  Compass
} from 'lucide-react'
import DolBar from '@/components/DolBar'
import MentoratView from '@/components/MentoratView'
import SupportView from '@/components/SupportView'
import AiConfigView from '@/components/AiConfigView'
import PlansView from '@/components/PlansView'
import ToolsView from '@/components/ToolsView'

import Header from '@/components/Header'
import CurrentNoteView from '@/components/CurrentNoteView'
import EmptyNoteView from '@/components/EmptyNoteView'
import CaptureInput, { type CaptureInputHandle } from '@/components/CaptureInput'
import HistoryDropdown from '@/components/HistoryDropdown'
import AnalyzeNoteDialog from '@/components/AnalyzeNoteDialog'
import SettingsView from '@/components/SettingsView'
import AccountView from '@/components/AccountView'
import ThemeToggle from '@/components/ThemeToggle'

import storage, { restoredFromBackup } from '@/lib/storage'
import { enrichirCapture, etudierNote } from '@/lib/capture-ia'
import { fetchAccesCaptureIA } from '@/lib/sync'
import { obtenirNoteMentorat, desepinglerSiPlusDeMentorat } from '@/lib/note-mentorat'
import { t, getLangue, setLangue, subscribeLangue, langueSuivante, infoLangue, type Langue } from '@/lib/i18n'
import { getSession } from '@/lib/auth'
import { captureExternalScreen } from '@/lib/external-capture'
import { stateSync } from '@/lib/state-sync'
import { exportNoteToPDF } from '@/lib/pdf-export'
import { exportNoteToDocx } from '@/lib/docx-export'
import { exportNoteToDrive } from '@/lib/drive-export'
import { forceSyncAll, verifySyncStatus, pullFromJournal, deleteJournalNotes } from '@/lib/sync'
import { splitHtmlIntoMessages, titleFromMessages } from '@/lib/html-blocks'
import { prepareImageForStorage } from '@/lib/image-utils'
import type { AcademicNote, NoteSummary, NoteFolder, Settings as SettingsType, Screenshot, DolLevel } from '@/types/academic'

function App() {
  // Suppression du système de vue par tabs
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [showMentorat, setShowMentorat] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [showAiConfig, setShowAiConfig] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [showTools, setShowTools] = useState(false)
  // Ferme tous les écrans (une seule vue à la fois)
  const closeAllViews = () => {
    setShowSettings(false)
    setShowAccount(false)
    setShowMentorat(false)
    setShowSupport(false)
    setShowAiConfig(false)
    setShowPlans(false)
    setShowTools(false)
  }

  // Ouvrir une note referme l ecran en cours. Sans ca, choisir une note
  // depuis l historique alors qu on etait dans le mentorat laissait l ecran
  // mentorat au premier plan, par-dessus la note qu on venait de demander.
  const ouvrirNote = (id: string) => {
    closeAllViews()
    setCurrentNoteId(id)
  }

  // Menu pop-up du bouton ⚙️ — le hub des écrans secondaires (retour Brice
  // 28/08) : un petit menu plutôt qu'un écran-fleuve à scroller
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const settingsMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!settingsMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setSettingsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [settingsMenuOpen])
  // Résumés, pas les notes complètes : charger 1000 notes entières (donc toutes
  // les images en base64) à chaque rafraîchissement saturait la mémoire
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editorContent, setEditorContent] = useState('')
  const editorRef = useRef<CaptureInputHandle>(null)
  const noteDisplayRef = useRef<HTMLDivElement>(null) // Ref pour la zone d'affichage des notes
  const [currentPageInfo, setCurrentPageInfo] = useState<{url: string, title: string} | null>(null)
  const [isSmartCapturing, setIsSmartCapturing] = useState(false)
  const [smartCaptureError, setSmartCaptureError] = useState<string | null>(null)
  const [noteRefreshTrigger, setNoteRefreshTrigger] = useState(0)
  // Capture IA et étude (1.8.0). Ces deux drapeaux ne servent QU'À AFFICHER —
  // l'aura sur « Capture intelligente », le bouton d'approfondissement sous le
  // résumé. Le serveur re-vérifie le droit et le budget à chaque appel : un
  // client bidouillé ne contourne rien.
  const [captureIaActive, setCaptureIaActive] = useState(false)
  const [etudeOuverte, setEtudeOuverte] = useState(false)
  const [etudeEnCours, setEtudeEnCours] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false)
  // Note complète chargée UNIQUEMENT le temps de l'analyse, puis relâchée
  const [analyzeNote, setAnalyzeNote] = useState<AcademicNote | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  // L'email du compte connecté, affiché en tête du menu des paramètres. On
  // sait ainsi d'un coup d'œil AVEC QUEL COMPTE on travaille : plusieurs
  // emails coexistent (perso, aoknowledge, celui du Skool) et se tromper de
  // compte veut dire synchroniser dans le mauvais journal.
  const [emailConnecte, setEmailConnecte] = useState<string | null>(null)

  // Langue d'usage. Le drapeau du pied de panneau la fait tourner ; toutes les
  // vues ouvertes suivent sans rechargement, comme pour l'affichage des métas.
  const [langue, setLangueLocale] = useState<Langue>(getLangue)
  useEffect(() => subscribeLangue(setLangueLocale), [])

  // Relit la session. Appelée à l'ouverture ET au retour de l'écran Compte :
  // sans ça, on se connectait et le panneau continuait d'afficher « Visiteur »
  // jusqu'à la prochaine réouverture.
  const rafraichirAuth = () => {
    getSession()
      .then(s => { setIsAuthed(!!s); setEmailConnecte(s?.user?.email ?? null) })
      .catch(() => { setIsAuthed(false); setEmailConnecte(null) })
  }

  // Notes qui ne sont pas encore dans le journal (hors exclues volontaires)
  const pendingSyncCount = notes.filter(n => !n.lastSyncAt && !n.syncExcluded).length

  // Rattrapage automatique : l'auto-sync à la sauvegarde échoue en silence si la
  // session est absente/expirée à ce moment-là, et RIEN ne réessayait ensuite —
  // les notes restaient « à synchroniser » jusqu'au clic manuel (bug signalé par
  // Brice le 17/07). Ici : dès que le panel s'ouvre connecté avec des notes en
  // attente, on les renvoie en arrière-plan (une seule tentative par ouverture).
  const autoRetryDoneRef = useRef(false)
  useEffect(() => {
    if (autoRetryDoneRef.current || isAuthed !== true || pendingSyncCount === 0) return
    autoRetryDoneRef.current = true
    const pending = notes.filter(n => !n.lastSyncAt && !n.syncExcluded)
    console.log(`[AOK AutoSync] Rattrapage de ${pending.length} note(s) en attente`)
    forceSyncAll(pending, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }))
      .then(r => { if (r.synced > 0) loadData() })
      .catch(err => console.warn('[AOK AutoSync] Rattrapage échoué:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, pendingSyncCount])

  // Ce à quoi le compte a droit (1.8.0). Une seule question au backend à la
  // connexion. `captureIaActive` exige aussi qu'il reste du budget : allumer
  // l'aura alors que le quota est épuisé promettrait quelque chose qu'on ne
  // tiendrait pas, et la capture retomberait sur les heuristiques.
  useEffect(() => {
    if (isAuthed !== true) {
      setEtudeOuverte(false)
      setCaptureIaActive(false)
      // Déconnecté : la note « Mentorat AOK » n'est ni supprimée ni cachée —
      // elle contient ce que l'élève a écrit — mais elle perd son épinglage et
      // redescend dans l'ordre chronologique. Tenir la première place à vie
      // pour une fonction fermée n'aurait aucun sens.
      desepinglerSiPlusDeMentorat().then(() => loadData()).catch(() => { /* pas bloquant */ })
      return
    }
    let vivant = true
    fetchAccesCaptureIA(settings?.modeleEtude ?? null)
      .then(({ acces }) => {
        if (!vivant || !acces) return
        setEtudeOuverte(Boolean(acces.etude))
        setCaptureIaActive(Boolean(acces.capture && acces.autorise))
        // La note « Mentorat AOK » est creee des l ouverture pour ceux qui y
        // ont droit, pas seulement quand on visite l ecran mentorat : elle est
        // epinglee en tete de l historique, elle doit donc y etre AVANT qu on
        // la cherche. Les comptes sans mentorat n heritent pas d une note
        // qu ils ne peuvent pas utiliser.
        if (acces.etude) {
          obtenirNoteMentorat()
            .then(() => loadData())
            .catch(err => console.warn('[mentorat] note indisponible', err))
        } else {
          // Connecté mais sans mentorat (niveau libre, abonnement terminé) :
          // même règle que la déconnexion, on désépingle sans rien effacer.
          desepinglerSiPlusDeMentorat().then(() => loadData()).catch(() => { /* pas bloquant */ })
        }
      })
      .catch(() => { /* le serveur tranchera de toute façon */ })
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

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

    // Listen to sync events from other views (fullscreen, other sidepanel windows, etc.)
    const unsubscribeSync = stateSync.subscribe((message) => {
      // Reload data when notes are modified in another window/view
      if (!stateSync.isOwnMessage(message)) {
        loadData()
        // Also trigger refresh if a specific note was updated
        if (message.noteId) {
          setNoteRefreshTrigger(Date.now())
          // Scroll to bottom after remote reload (nouveau contenu ajouté en bas)
          setTimeout(() => {
            if (noteDisplayRef.current) {
              noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
            }
          }, 150)
        }
      }
    })

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
      unsubscribeSync()
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

      // État d'auth pour l'indicateur de sync (non bloquant)
      rafraichirAuth()

      // Warn user if data was restored from backup
      if (restoredFromBackup) {
        console.warn('[App] Notes restored from backup after IndexedDB data loss')
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fonction pour ajouter du contenu à la note courante (maintenant avec support HTML)
  // Screenshot avec une note ouverte : image + bloc meta DIRECTEMENT dans la note
  // (contrat 0.1.2 — une métadonnée n'est jamais du contenu, et l'éditeur reste propre).
  // Retourne false si aucune note ouverte → CaptureInput garde son flux éditeur.
  const handleScreenshotToNote = async (dataUrl: string, metaText: string): Promise<boolean> => {
    if (!currentNoteId) return false
    await storage.addMessageToNote(currentNoteId, {
      type: 'image',
      content: dataUrl,
      metadata: { alt: 'Capture d\'écran' }
    })
    await storage.addMessageToNote(currentNoteId, { type: 'meta', content: metaText })
    await loadData()
    setNoteRefreshTrigger(Date.now())
    return true
  }

  const handleAddContent = async (content: string, noteId: string | null) => {
    try {
      // Une image collée/glissée dans la barre doit devenir son PROPRE bloc :
      // noyée dans un bloc texte, elle n'avait pas de poubelle au survol et le
      // bloc devenait impossible à supprimer (retour utilisateur 04/08).
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
        // Créer une nouvelle note (vide : les blocs sont posés juste après,
        // addMessageToNote entretient messages[] ET content)
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
      setNoteRefreshTrigger(Date.now()) // Force CurrentNoteView à recharger

      setEditorContent('')
      // Focus l'editeur et scroll la zone d'affichage vers le bas pour voir les messages récents
      setTimeout(() => {
        editorRef.current?.focus()
        // Scroller la zone d'affichage des notes vers le bas
        if (noteDisplayRef.current) {
          noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
        }
      }, 100) // Délai légèrement plus long pour laisser le temps au contenu de se mettre à jour
    } catch (error) {
      console.error('Error adding content:', error)
      toast.error('Erreur lors de l\'ajout du contenu')
    }
  }

  // Fonction pour retourner à l'accueil (au lieu de créer une note vide)
  const handleGoHome = () => {
    setCurrentNoteId(null)
  }

  // « Poser un DOL » depuis la rangée dockée au-dessus de la barre d'envoi :
  // ajoute le niveau à la note ouverte puis force son rechargement
  const handleAddDolFromBar = async (dol: Omit<DolLevel, 'id' | 'createdAt' | 'status'>) => {
    if (!currentNoteId) return
    const fresh = await storage.getNote(currentNoteId)
    if (!fresh) return
    const entry: DolLevel = { ...dol, id: crypto.randomUUID(), status: 'actif', createdAt: Date.now() }
    await storage.saveNote({ ...fresh, dols: [...(fresh.dols ?? []), entry] })
    setNoteRefreshTrigger(Date.now())
    await loadData()
  }

  // Bouton rituel du header : lance un warmup. Depuis l'accueil (aucune note ouverte),
  // il crée une note de séance à la volée et y pose le warmup ; dans une note, il ajoute
  // simplement un warmup au fil. Remplace l'ancien écran RitualView (sans vraie UX).
  const handleRitualWarmup = async () => {
    const warmupEntry = { id: crypto.randomUUID(), startedAt: Date.now(), doneAt: Date.now() }
    if (!currentNoteId) {
      const newNoteId = Date.now().toString()
      const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      const newNote: AcademicNote = {
        id: newNoteId,
        title: `Séance du ${today}`,
        content: '',
        url: '',
        timestamp: Date.now(),
        type: 'manual',
        tags: [],
        concepts: [],
        screenshots: [],
        warmups: [warmupEntry],
        metadata: { domain: '', title: `Séance du ${today}`, language: 'fr' },
      }
      await storage.saveNote(newNote)
      setCurrentNoteId(newNoteId)
    } else {
      // Note ouverte : relire la version fraîche pour ne rien écraser, puis ajouter
      const fresh = await storage.getNote(currentNoteId)
      if (fresh) {
        await storage.saveNote({ ...fresh, warmups: [...(fresh.warmups ?? []), warmupEntry] })
      }
    }
    await loadData()
    setNoteRefreshTrigger(Date.now())
  }

  // ---- Trades ----
  // Fermer/quitter la note clôt silencieusement le segment actif
  const prevNoteIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevNoteIdRef.current
    if (prev && prev !== currentNoteId) {
      storage.closeActiveTrade(prev).catch(() => {})
    }
    prevNoteIdRef.current = currentNoteId
  }, [currentNoteId])

  // Démarrer un trade : dans la note courante, ou dans une note de séance créée à la volée
  const handleStartTrade = async () => {
    try {
      let noteId = currentNoteId
      if (!noteId) {
        const newNoteId = Date.now().toString()
        const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
        const newNote: AcademicNote = {
          id: newNoteId,
          title: `Séance du ${today}`,
          content: '',
          url: '',
          timestamp: Date.now(),
          type: 'manual',
          tags: [],
          concepts: [],
          screenshots: [],
          metadata: { domain: '', title: `Séance du ${today}`, language: 'fr' }
        }
        await storage.saveNote(newNote)
        noteId = newNoteId
        setCurrentNoteId(newNoteId)
      }
      await storage.startTrade(noteId)
      await loadData()
      setNoteRefreshTrigger(Date.now())
      setTimeout(() => {
        editorRef.current?.focus()
        if (noteDisplayRef.current) {
          noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
        }
      }, 100)
    } catch (error) {
      console.error('Error starting trade:', error)
    }
  }

  // ---- Folder handlers ----
  const handleFolderCreate = async (name: string, parentId?: string) => {
    await storage.saveFolder({ id: crypto.randomUUID(), name, createdAt: Date.now(), ...(parentId ? { parentId } : {}) })
    await loadData()
  }

  const handleFolderRename = async (id: string, name: string) => {
    const existing = folders.find(f => f.id === id)
    if (existing) await storage.saveFolder({ ...existing, name })
    await loadData()
  }

  const handleFolderDelete = async (id: string) => {
    await storage.deleteFolder(id)
    await loadData()
  }

  const handleMoveNoteToFolder = async (noteId: string, folderId: string | null) => {
    await storage.moveNoteToFolder(noteId, folderId)
    await loadData()
  }

  // Fonction pour capturer la page actuelle et créer une note avec screenshot
  const handleCapturePage = async () => {
    setIsCapturing(true)
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]

      if (!currentTab) {
        toast.error('Impossible de récupérer les informations de la page')
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
        screenshotDataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 })
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
        const optimized = await prepareImageForStorage(screenshotDataUrl)
        content += `<p><img src="${optimized}" alt="Capture de ${domain}" style="max-width:100%; border-radius:8px; margin-top:8px;"/></p>`
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
      toast.error('Erreur lors de la capture de la page')
    } finally {
      setIsCapturing(false)
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

  // Capture d'une app externe (Zoom, desktop, etc.) via getDisplayMedia
  const handleExternalScreenshot = async (): Promise<string | null> => {
    try {
      return await captureExternalScreen()
    } catch (error) {
      // L'utilisateur a annulé le sélecteur ou la permission a été refusée
      if ((error as DOMException)?.name !== 'NotAllowedError') {
        console.error('Erreur capture externe:', error)
      }
      return null
    }
  }

  // Capture intelligente. Les heuristiques extraient, l'IA trie ensuite si le
  // compte y a droit (1.8.0). Repli silencieux sur les heuristiques dès que
  // l'IA ne répond pas : quota atteint, hors ligne, clé absente. L'élève n'a
  // jamais de panne, seulement une capture moins bonne.
  const handleSmartCapture = async () => {
    setIsSmartCapturing(true)
    setSmartCaptureError(null)

    try {
      // Extraction du contenu structuré via service worker (heuristiques)
      const result = await chrome.runtime.sendMessage({ type: 'SMART_CAPTURE' })

      if (!result?.success) {
        throw new Error(result?.error || 'Extraction échouée')
      }

      // Capturer le screenshot de la page
      let screenshotDataUrl = ''
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 })
      } catch (screenshotError) {
        console.warn('Screenshot capture failed:', screenshotError)
      }

      // Passe secrétaire : le modèle trie ce que la page dit vraiment. Sur un
      // graphique, c'est le screenshot qui porte l'analyse, pas le DOM.
      const enrichi = await enrichirCapture(result, screenshotDataUrl || null)

      const newNoteId = Date.now().toString()
      const titreNote = enrichi.pageTitle || result.pageTitle || 'Capture'

      const newNote: AcademicNote = {
        id: newNoteId,
        title: titreNote.slice(0, 80) + (titreNote.length > 80 ? '...' : ''),
        content: '',
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

      // 1. Screenshot en premier (image message)
      if (screenshotDataUrl) {
        await storage.addMessageToNote(newNoteId, {
          type: 'image',
          content: screenshotDataUrl,
          metadata: { alt: 'Capture de la page' }
        })
      }

      // 2. Contenu structuré (text message)
      // Le titre n'est PAS repris ici : la note l'affiche déjà en tête, et le
      // redonner était la cause de la triple répétition vue en 1.7.1.
      let textContent = ''
      if (enrichi.summary) {
        textContent += `<p><em>${enrichi.summary}</em></p>`
      }
      if (enrichi.keyPoints.length > 0) {
        textContent += '<p><strong>Points clés :</strong></p><ul>'
        enrichi.keyPoints.forEach((p: string) => { textContent += `<li>${p}</li>` })
        textContent += '</ul>'
      }
      if (enrichi.manquant) {
        textContent += `<p><em>Non capturé : ${enrichi.manquant}</em></p>`
      }
      if (result.content) {
        textContent += `<hr>${result.content}`
      }
      if (textContent.trim()) {
        await storage.addMessageToNote(newNoteId, { type: 'text', content: textContent })
      }

      // 3. Images extraites par la stratégie (ex: post Skool)
      const extractedImages = result.extras?.images as { src: string; alt: string }[] | undefined
      if (extractedImages?.length) {
        for (const img of extractedImages) {
          await storage.addMessageToNote(newNoteId, {
            type: 'image',
            content: img.src,
            metadata: { alt: img.alt, sourceUrl: result.url }
          })
        }
      }

      setCurrentNoteId(newNoteId)
      setEditorContent('')
      await loadData()
    } catch (error) {
      console.error('Smart capture error:', error)
      setSmartCaptureError(error instanceof Error ? error.message : t('smart.echec'))
    } finally {
      setIsSmartCapturing(false)
    }
  }

  // Fonction de capture intelligente pour ajouter à la note courante
  const handleSmartCaptureToCurrentNote = async () => {
    if (!currentNoteId) return
    setIsSmartCapturing(true)
    setSmartCaptureError(null)

    try {
      const result = await chrome.runtime.sendMessage({ type: 'SMART_CAPTURE' })
      if (!result?.success) {
        throw new Error(result?.error || 'Extraction échouée')
      }

      // Le screenshot est pris AVANT le tri : sur un graphique, c'est lui qui
      // porte l'analyse, et la passe secrétaire doit pouvoir le lire.
      let screenshotDataUrl = ''
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 })
      } catch (e) {
        console.warn('Screenshot capture failed:', e)
      }

      const enrichi = await enrichirCapture(result, screenshotDataUrl || null)

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
      if (result.content) {
        textContent += `<hr>${result.content}`
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

      // Le screenshot, déjà pris plus haut, rejoint la note comme bloc image
      try {
        if (screenshotDataUrl) {
          await storage.addMessageToNote(currentNoteId, {
            type: 'image',
            content: screenshotDataUrl,
            metadata: { alt: 'Capture de la page' }
          })
        }
      } catch (e) {
        console.warn('Screenshot capture failed:', e)
      }

      await loadData()
      setNoteRefreshTrigger(Date.now())
      // Scroller vers le bas pour voir le nouveau contenu
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

  // Exports : toujours relire la note depuis le storage — le state `notes` de
  // l'App peut être en retard sur les dernières éditions (warmup, cooldown…)
  const freshCurrentNote = async () =>
    currentNote ? (await storage.getNote(currentNote.id)) ?? null : null

  // Fonction pour exporter la note courante en PDF
  const handleExportPDF = async () => {
    const fresh = await freshCurrentNote()
    if (!fresh) return
    setIsExporting(true)
    try {
      await exportNoteToPDF(fresh)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      toast.error('Erreur lors de l\'export PDF')
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
      toast.error('Erreur lors de l\'export Google Docs')
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
      toast.error('Erreur lors de l\'ouverture de la vue étendue')
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

  const handleOpenAnalyze = async () => {
    if (!currentNoteId) return
    const full = await storage.getNote(currentNoteId)
    if (!full) return
    setAnalyzeNote(full)
    setShowAnalyzeDialog(true)
  }

  // 2e temps de la capture (1.8.0) : l'étude. Relit la note dans le cadre de
  // l'académie et écrit la lecture DANS la note, contrairement à « Analyser »
  // qui envoie la note vers l'IA personnelle de l'élève et laisse la réponse
  // là-bas. Les deux gardent leur raison d'être.
  //
  // Volontairement déclenchée à la main : la lecture n'est voulue qu'une fois
  // sur cinq, et elle vaut le plus au moment de la relecture, deux semaines
  // après la capture, pas dans la seconde qui suit.
  const handleEtudierNote = async () => {
    if (!currentNoteId || etudeEnCours) return
    const full = await storage.getNote(currentNoteId)
    if (!full) return

    setEtudeEnCours(true)
    try {
      // On relit le contenu BRUT de la note, pas un résumé : au banc, la
      // meilleure trouvaille venait de la lecture du tableau brut.
      const image = full.messages?.find(m => m.type === 'image')?.content ?? null
      const { sortie, refus, message } = await etudierNote(
        {
          url: full.url,
          pageTitle: full.title,
          content: full.content || full.messages?.filter(m => m.type === 'text').map(m => m.content).join('\n') || '',
          summary: full.summary,
          keyPoints: full.keyPoints,
          concepts: full.concepts,
          tags: full.tags,
        },
        image,
        currentNoteId,
        settings.modeleEtude ?? null
      )

      if (refus === 'reservee') {
        toast.info(message || 'L’étude fait partie du Carnet Premium.')
        setShowMentorat(true)
        return
      }
      if (refus || !sortie) {
        toast.error(message || t('note.etudeIndisponible'))
        return
      }

      let bloc = '<hr><p><strong>Étude de la note</strong></p>'
      if (sortie.resume) bloc += `<p><em>${sortie.resume}</em></p>`
      if (sortie.pointsCles?.length) {
        bloc += '<p><strong>Ce qu’il faut en retenir :</strong></p><ul>'
        sortie.pointsCles.forEach(p => { bloc += `<li>${p}</li>` })
        bloc += '</ul>'
      }
      if (sortie.pourToi) bloc += `<p><strong>Pour toi :</strong> ${sortie.pourToi}</p>`
      await storage.addMessageToNote(currentNoteId, { type: 'text', content: bloc })

      // Les concepts et tags trouvés par l'étude enrichissent la note sans
      // écraser ce que l'élève a posé à la main.
      if (sortie.concepts?.length || sortie.tags?.length) {
        await storage.saveNote({
          ...full,
          concepts: [...new Set([...(full.concepts ?? []), ...(sortie.concepts ?? [])])].slice(0, 12),
          tags: [...new Set([...(full.tags ?? []), ...(sortie.tags ?? [])])].slice(0, 10),
        })
      }

      await loadData()
      setNoteRefreshTrigger(Date.now())
      toast.success(t('note.etudeAjoutee'))
    } catch (e) {
      console.error('[etude]', e)
      toast.error(t('note.etudeIndisponible'))
    } finally {
      setEtudeEnCours(false)
    }
  }

  return (
    <div className="sidebar-container">
      <Header
        onShowHistory={() => setShowHistoryDropdown(!showHistoryDropdown)}
        onHome={handleGoHome}
        onFullscreen={handleFullscreen}
        onExportPDF={currentNote ? handleExportPDF : undefined}
        onExportDocx={currentNote ? handleExportDocx : undefined}
        onExportDrive={currentNote ? handleExportDrive : undefined}
        onAnalyze={currentNote ? handleOpenAnalyze : undefined}
        isExporting={isExporting}
      />

      {/* Zone principale - Note courante (style Claude) */}
      <main className="content-section flex flex-col">
        {/* Contenu de la note courante */}
        <div ref={noteDisplayRef} className="flex-1 overflow-y-auto p-4">
          {showSupport ? (
            <SupportView onBack={() => setShowSupport(false)} />
          ) : showMentorat ? (
            <MentoratView
              onBack={() => setShowMentorat(false)}
              onOpenAccount={() => { closeAllViews(); setShowAccount(true) }}
              onOpenSupport={() => { closeAllViews(); setShowSupport(true) }}
              onOpenPlans={() => { closeAllViews(); setShowPlans(true) }}
            />
          ) : showAiConfig ? (
            <AiConfigView
              settings={settings!}
              onChange={async (newSettings) => {
                await storage.saveSettings(newSettings)
                const updated = await storage.getSettings()
                setSettings(updated)
              }}
              onBack={() => setShowAiConfig(false)}
            />
          ) : showPlans ? (
            <PlansView onBack={() => setShowPlans(false)} />
          ) : showTools ? (
            <ToolsView onBack={() => setShowTools(false)} />
          ) : showAccount ? (
            <AccountView
              notes={notes}
              settings={settings!}
              onSettingsChange={async (newSettings) => {
                await storage.saveSettings(newSettings)
                const updated = await storage.getSettings()
                setSettings(updated)
              }}
              onSyncAll={async () => {
                const result = await forceSyncAll(notes, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }))
                await loadData()
                return result
              }}
              onVerifySync={async () => {
                const result = await verifySyncStatus(notes, (id, changes) => storage.updateNote(id, changes))
                await loadData()
                return result
              }}
              onResyncMissing={(missingNotes) => {
                // Reset lastSyncAt sur les notes manquantes puis les synquer
                return Promise.all(missingNotes.map(n => storage.updateNote(n.id, { lastSyncAt: undefined })))
                  .then(() => forceSyncAll(
                    missingNotes.map(n => ({ ...n, lastSyncAt: undefined })),
                    (id) => storage.updateNote(id, { lastSyncAt: Date.now() })
                  ))
              }}
              onForceResyncAll={async () => {
                // Reset lastSyncAt sur TOUTES les notes (inclut les exclues via includeExcluded)
                await Promise.all(notes.map(n => storage.updateNote(n.id, { lastSyncAt: undefined })))
                const freshNotes = notes.map(n => ({ ...n, lastSyncAt: undefined }))
                const result = await forceSyncAll(freshNotes, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }), { includeExcluded: true })
                await loadData()
                return result
              }}
              onRebuildJournal={async () => {
                // Supprime toutes les notes dans le journal, reset les flags, re-sync complet
                const { ok, error } = await deleteJournalNotes()
                if (!ok) return { synced: 0, failed: 0, errors: [{ title: 'Journal', error: error ?? 'Erreur inconnue' }] }
                await Promise.all(notes.map(n => storage.updateNote(n.id, { lastSyncAt: undefined, syncExcluded: false })))
                const freshNotes = notes.map(n => ({ ...n, lastSyncAt: undefined, syncExcluded: false }))
                const result = await forceSyncAll(freshNotes, (id) => storage.updateNote(id, { lastSyncAt: Date.now() }))
                await loadData()
                return result
              }}
              onPullFromJournal={async () => {
                const { notes: journalNotes, folders: journalFolders, error } = await pullFromJournal()
                if (error) return { imported: 0, skipped: 0, error }
                // Restaurer d'abord l'arborescence des dossiers (ids stables).
                // Racines AVANT sous-dossiers : saveFolder refuse un parentId
                // dont le parent n'existe pas encore localement.
                const knownFolders = new Map(folders.map(f => [f.id, f]))
                const sortedFolders = [...(journalFolders ?? [])].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))
                for (const folder of sortedFolders) {
                  const known = knownFolders.get(folder.id)
                  if (!known) {
                    await storage.saveFolder(folder)
                  } else if ((known.parentId ?? null) !== (folder.parentId ?? null)) {
                    // Hiérarchie changée côté journal (autre appareil) → répercuter
                    await storage.saveFolder({ ...known, parentId: folder.parentId })
                  }
                }
                const existingIds = new Set(notes.map(n => n.id))
                const existingUrls = new Set(notes.map(n => n.url).filter(Boolean))
                let imported = 0
                let skipped = 0
                for (const note of journalNotes) {
                  if (existingIds.has(note.id) || (note.url && existingUrls.has(note.url))) {
                    skipped++
                  } else {
                    await storage.saveNote(note)
                    imported++
                  }
                }
                await loadData()
                return { imported, skipped }
              }}
              onBack={() => { setShowAccount(false); rafraichirAuth() }}
            />
          ) : showSettings ? (
            <div className="space-y-4">
              {/* Header avec bouton retour */}
              <div className="flex items-center space-x-3 pb-3 border-b border-border">
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title="Retour"
                  aria-label="Retour"
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
                  a.download = `carnet-du-trader-backup-${new Date().toISOString().split('T')[0]}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                onImport={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const text = await file.text()
                    const result = await storage.importData(text)
                    if (result.success) {
                      toast.success('Import réussi !')
                      await loadData()
                    } else {
                      toast.error('Erreur import : ' + result.error)
                    }
                  }
                }}
                onSyncToJournal={() => {
                  toast.info('Sync Journal non implémenté')
                }}
              />
            </div>
          ) : currentNoteId ? (
            <CurrentNoteView
              noteId={currentNoteId}
              onNoteUpdate={loadData}
              refreshTrigger={noteRefreshTrigger}
              onEtudier={handleEtudierNote}
              etudeOuverte={etudeOuverte}
              etudeEnCours={etudeEnCours}
            />
          ) : (
            <>
              {isSmartCapturing && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{t('smart.analyse')}</p>
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
                  isCapturing={isCapturing}
                  lastNote={notes.length > 0
                    ? notes.reduce((latest, n) => n.timestamp > latest.timestamp ? n : latest)
                    : undefined
                  }
                  onSelectNote={ouvrirNote}
                />
              )}
            </>
          )}
        </div>
        
        {/* Lanceurs de rituel — dockés au-dessus de la barre d'envoi : en
            flottant au milieu du panneau ils gênaient la lecture (Brice 28/08) */}
        {currentNoteId && !showSettings && !showAccount && !showMentorat && !showSupport && !showAiConfig && !showPlans && !showTools && (
          <div className="bg-background px-4 pt-1.5 flex flex-wrap items-center gap-1">
            <DolBar
              dols={[]}
              onAdd={handleAddDolFromBar}
              onCycleStatus={() => {}}
              onDelete={() => {}}
            />
            <button
              onClick={handleRitualWarmup}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-blue-600/80 dark:text-blue-400/80 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
              title="Lancer un warmup — il s'ajoute dans le fil au moment du clic"
            >
              <Sunrise size={13} className="flex-shrink-0" />
              Lancer un warmup
            </button>
          </div>
        )}

        {/* Hub de capture — masqué dans l'écran support : il a sa propre
            saisie, la double barre était illisible (retour Brice 28/08) */}
        {!showSupport && (
          <div className="bg-background px-4 pt-3 pb-1">
            <CaptureInput
              ref={editorRef}
              value={editorContent}
              onChange={setEditorContent}
              placeholder={currentNoteId ? "Ajouter du contenu..." : "Écrivez ou capturez..."}
              onInsertScreenshot={handleScreenshot}
              onInsertExternalScreenshot={handleExternalScreenshot}
              onScreenshotToNote={handleScreenshotToNote}
              onSubmit={(content) => handleAddContent(content, currentNoteId)}
              onSmartCapture={currentNoteId ? handleSmartCaptureToCurrentNote : handleSmartCapture}
              isSmartCapturing={isSmartCapturing}
              captureIaActive={captureIaActive}
              onStartTrade={handleStartTrade}
              hasActiveTrade={!!currentNote?.hasOpenTrade}
              currentPageInfo={currentPageInfo || undefined}
              className="w-full"
            />
          </div>
        )}

        {/* Footer utilitaire */}
        <div className="px-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground/60 select-none">v{chrome.runtime.getManifest().version}</span>
              <span className="text-muted-foreground/30">|</span>
              {/* Le drapeau était décoratif depuis toujours. Il fait maintenant
                  tourner les langues disponibles — un cycle plutôt qu'une
                  bascule, pour que le geste reste juste quand il y en aura
                  quatre. */}
              <button
                onClick={() => setLangue(langueSuivante())}
                className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded transition-colors"
                title={`${t('sync.langue')} : ${infoLangue(langue).nom} — ${infoLangue(langueSuivante(langue)).nom}`}
                aria-label={`${t('sync.langue')} : ${infoLangue(langue).nom}`}
              >
                <span className="text-[11px] leading-none flex-shrink-0" aria-hidden="true">
                  {infoLangue(langue).drapeau}
                </span>
                {langue.toUpperCase()}
              </button>
              <span className="text-muted-foreground/30">|</span>
              {/* État de sync — l'échec silencieux de sync ne doit plus JAMAIS être invisible */}
              <button
                onClick={() => { closeAllViews(); setShowAccount(true) }}
                className={`px-1.5 py-0.5 text-[10px] rounded-full transition-colors ${
                  isAuthed === false
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium'
                    : pendingSyncCount > 0
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
                title={
                  isAuthed === false
                    ? 'Non connecté — les notes ne partent pas vers le journal. Cliquer pour se connecter.'
                    : pendingSyncCount > 0
                      ? `${pendingSyncCount} note${pendingSyncCount > 1 ? 's' : ''} pas encore dans le journal. Cliquer pour synchroniser.`
                      : 'Toutes les notes sont dans le journal'
                }
              >
                {isAuthed === false
                  ? '⚠ sync hors ligne'
                  : pendingSyncCount > 0
                    ? `${pendingSyncCount} à synchroniser`
                    : '✓ sync'}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle compact />
              {/* Footer allégé (retour Brice 28/08) : « Nous contacter » supprimé
                  (le support intégré le remplace), Guide et « Évaluez-nous »
                  déménagés dans Paramètres > Aide */}
              <button
                onClick={() => { setShowSupport(!showSupport); setShowMentorat(false); setShowAccount(false); setShowSettings(false) }}
                className={`p-1.5 hover:text-foreground hover:bg-muted rounded-md transition-colors ${showSupport ? 'text-blue-500 bg-muted' : 'text-muted-foreground'}`}
                title="Contacter le support"
                aria-label="Contacter le support"
              >
                <LifeBuoy size={14} />
              </button>
              <button
                onClick={() => { setShowMentorat(!showMentorat); setShowSupport(false); setShowAccount(false); setShowSettings(false) }}
                className={`p-1.5 hover:text-foreground hover:bg-muted rounded-md transition-colors ${showMentorat ? 'text-purple-500 bg-muted' : 'text-muted-foreground'}`}
                title="Mode mentorat"
                aria-label="Mode mentorat"
              >
                <GraduationCap size={14} />
              </button>
              <div className="relative" ref={settingsMenuRef}>
                <button
                  onClick={() => setSettingsMenuOpen(o => !o)}
                  className={`p-1.5 hover:text-foreground hover:bg-muted rounded-md transition-colors ${showSettings || settingsMenuOpen ? 'text-foreground bg-muted' : 'text-muted-foreground'}`}
                  title={t('menu.aide')}
                  aria-label={t('menu.aide')}
                  aria-haspopup="menu"
                  aria-expanded={settingsMenuOpen}
                >
                  <Settings size={14} />
                </button>
                {settingsMenuOpen && (() => {
                  const item = 'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-foreground hover:bg-muted transition-colors'
                  const open = (setter: (v: boolean) => void) => () => { setSettingsMenuOpen(false); closeAllViews(); setter(true) }
                  const tab = (url: string) => () => { setSettingsMenuOpen(false); chrome.tabs.create({ url }) }
                  return (
                    <div className="absolute bottom-8 right-0 z-50 w-52 rounded-lg border border-border bg-popover shadow-lg p-1" role="menu">
                      {/* Qui est connecté. En tête de menu parce que c'est la
                          question qu'on se pose avant de cliquer sur quoi que
                          ce soit ici : plusieurs comptes coexistent, et se
                          tromper veut dire synchroniser dans le mauvais
                          journal. Cliquer ouvre le compte. */}
                      <button
                        onClick={open(setShowAccount)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
                        role="menuitem"
                        title={emailConnecte ?? t('menu.seConnecter')}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isAuthed ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] leading-tight text-foreground truncate">
                            {emailConnecte ?? t('menu.visiteur')}
                          </span>
                          <span className="block text-[10px] leading-tight text-muted-foreground">
                            {isAuthed ? t('menu.connecte') : t('menu.nonConnecte')}
                          </span>
                        </span>
                      </button>
                      <div className="my-1 border-t border-border/60" />
                      <button onClick={open(setShowSettings)} className={item} role="menuitem">
                        <Settings size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.parametres')}
                      </button>
                      <button onClick={open(setShowAiConfig)} className={item} role="menuitem">
                        <Link2 size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.configurerIA')}
                      </button>
                      <button onClick={open(setShowAccount)} className={item} role="menuitem">
                        <User size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.compte')}
                      </button>
                      <div className="my-1 border-t border-border/60" />
                      <button onClick={tab(chrome.runtime.getURL('src/guide/index.html'))} className={item} role="menuitem">
                        <BookOpen size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.bonnesPratiques')}
                      </button>
                      <button onClick={tab(chrome.runtime.getURL('src/guide/index.html') + '#versions')} className={item} role="menuitem">
                        <Clock size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.versions')}
                      </button>
                      <div className="my-1 border-t border-border/60" />
                      <button onClick={open(setShowPlans)} className={item} role="menuitem">
                        <BadgeCheck size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.forfait')}
                      </button>
                      <button
                        onClick={async () => {
                          setSettingsMenuOpen(false)
                          try {
                            await navigator.clipboard.writeText('https://chromewebstore.google.com/detail/trading-notes-by-aoknowle/phajegonlmgnjkkfdooedoddnmgpheic')
                            toast.success('Lien de l\'extension copié — partage-le !')
                          } catch {
                            toast.error('Copie impossible.')
                          }
                        }}
                        className={item}
                        role="menuitem"
                      >
                        <UserPlus size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.inviter')}
                      </button>
                      <button onClick={open(setShowTools)} className={item} role="menuitem">
                        <Compass size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.autresOutils')}
                      </button>
                      <button onClick={tab('https://chromewebstore.google.com/detail/trading-notes-by-aoknowle/phajegonlmgnjkkfdooedoddnmgpheic/reviews')} className={item} role="menuitem">
                        <Star size={13} className="text-muted-foreground flex-shrink-0" />
                        {t('menu.evaluer')}
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>
        </div>
      </main>

      {/* Dropdown historique des notes */}
      <HistoryDropdown
        isOpen={showHistoryDropdown}
        onClose={() => setShowHistoryDropdown(false)}
        notes={notes}
        folders={folders}
        currentNoteId={currentNoteId}
        onSelectNote={ouvrirNote}
        onNotesUpdate={loadData}
        onFolderCreate={handleFolderCreate}
        onFolderRename={handleFolderRename}
        onFolderDelete={handleFolderDelete}
        onMoveNoteToFolder={handleMoveNoteToFolder}
      />

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

export default App