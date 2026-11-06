import { toast } from '../lib/toast'
import React, { useState, useEffect, useRef } from 'react'
import OutilsNoteRangee from '@/components/OutilsNoteRangee'
import EcransCarnet from '@/components/EcransCarnet'
import PiedCarnet from '@/components/PiedCarnet'

import Header from '@/components/Header'
import CurrentNoteView from '@/components/CurrentNoteView'
import EmptyNoteView from '@/components/EmptyNoteView'
import { noterConsultation } from '@/lib/consultations'
import CaptureInput, { type CaptureInputHandle } from '@/components/CaptureInput'
import HistoryDropdown from '@/components/HistoryDropdown'
import AnalyzeNoteDialog from '@/components/AnalyzeNoteDialog'

import storage, { restoredFromBackup } from '@/lib/storage'
import { enrichirCapture } from '@/lib/capture-ia'
import { poserBlocsDeCapture, poserCaptureDansNote, enregistrerNoteDeLaPage } from '@/lib/capture-blocs'
import { t } from '@/lib/i18n'
import { captureExternalScreen } from '@/lib/external-capture'
import { stateSync } from '@/lib/state-sync'
import { exportNoteToPDF } from '@/lib/pdf-export'
import { exportNoteToDocx } from '@/lib/docx-export'
import { exportNoteToDrive } from '@/lib/drive-export'
import { useTradeNote } from '@/lib/use-trade-note'
import { useEcransCarnet } from '@/lib/use-ecrans-carnet'
import { useSessionCarnet, useAccesCompte } from '@/lib/use-session-carnet'
import { useTravailDeFond } from '@/lib/use-travail-fond'
import { splitHtmlIntoMessages, titleFromMessages } from '@/lib/html-blocks'
import { plateformeOnglet } from '@/lib/besoins'
import type { AcademicNote, NoteSummary, NoteFolder, Settings as SettingsType } from '@/types/academic'

function App() {
  // Suppression du système de vue par tabs
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  // Les écrans (Compte, Paramètres, Mentorat, Support, « Mon forfait »...),
  // une seule vue à la fois, et le pied qui les ouvre : partagés avec le plein
  // écran depuis la 1.8.15 (use-ecrans-carnet, EcransCarnet, PiedCarnet).
  // « Importer mes trades » (1.8.13) est une ligne du menu de la roue, plus une
  // carte de l'accueil. Brice, le 05/11 : la carte chargeait une interface qui
  // se veut épurée, et l'import n'a pas besoin d'être au premier plan.
  const ecrans = useEcransCarnet()
  const { connecte: isAuthed, email: emailConnecte, relireSession: rafraichirAuth } = useSessionCarnet()

  // Ouvrir une note referme l ecran en cours. Sans ca, choisir une note
  // depuis l historique alors qu on etait dans le mentorat laissait l ecran
  // mentorat au premier plan, par-dessus la note qu on venait de demander.
  const ouvrirNote = (id: string) => {
    ecrans.fermer()
    setCurrentNoteId(id)
    // Relire une note est une activité (panneau de l'accueil, 1.8.10)
    void noterConsultation(id)
  }

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
  const [isExporting, setIsExporting] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false)
  // Note complète chargée UNIQUEMENT le temps de l'analyse, puis relâchée
  const [analyzeNote, setAnalyzeNote] = useState<AcademicNote | null>(null)

  // Ce à quoi le compte a droit (1.8.0) : l'aura sur « Capture intelligente »
  // et le bouton « Approfondir » de la rangée du bas. Ne sert QU'À AFFICHER,
  // le serveur re-vérifie le droit et le budget à chaque appel.
  const acces = useAccesCompte(isAuthed, settings?.modeleEtude)
  const captureIaActive = acces.captureIa
  const etudeOuverte = acces.etude

  // Le travail de fond (rattrapage de la sync, compteurs d'activité, note
  // « Mentorat AOK ») : partagé avec le plein écran depuis la 1.8.15, et fait
  // par une seule vue à la fois (lib/use-travail-fond).
  useTravailDeFond({ connecte: isAuthed, acces, notes, notesChargees: !isLoading, recharger: loadData })

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
  // (1.8.15 : le même geste en plein écran, voir poserCaptureDansNote.)
  const handleScreenshotToNote = async (dataUrl: string, metaText: string): Promise<boolean> => {
    if (!currentNoteId) return false
    await poserCaptureDansNote(currentNoteId, dataUrl, metaText)
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
      toast.error(t('pleinEcran.erreurAjout'))
    }
  }

  // Fonction pour retourner à l'accueil (au lieu de créer une note vide)
  const handleGoHome = () => {
    // Ferme aussi les écrans (mentorat, support, forfait…) : le + du header
    // depuis l'écran mentorat ne faisait rien de visible (retour Brice 02/09)
    ecrans.fermer()
    setCurrentNoteId(null)
  }

  // ---- Trades ---- (1.8.15 : partagé avec le plein écran, voir lib/use-trade-note)
  // Quitter la note clôt silencieusement son trade actif ; « Lancer un trade »
  // démarre dans la note ouverte, ou dans une note de séance créée à la volée.
  const { lancer: lancerTradeNote } = useTradeNote(currentNoteId, {
    ouvrirNote: setCurrentNoteId,
    rafraichir: async () => { await loadData(); setNoteRefreshTrigger(Date.now()) },
  })
  const handleStartTrade = async () => {
    if (!(await lancerTradeNote())) return
    setTimeout(() => {
      editorRef.current?.focus()
      if (noteDisplayRef.current) {
        noteDisplayRef.current.scrollTop = noteDisplayRef.current.scrollHeight
      }
    }, 100)
  }

  // Les dossiers (créer, renommer, supprimer, déplacer une note) se gèrent
  // dans l'Historique lui-même depuis la 1.8.15 (HistoriqueNotes, partagé
  // avec le plein écran) : le panneau relit seulement ses notes.

  // « Capturer cette page » (carte de l'accueil) : une note neuve avec la
  // capture de l'onglet actif. La note elle-même : lib/capture-page (1.8.15,
  // partagée avec le plein écran, qui capture l'onglet choisi).
  const handleCapturePage = async () => {
    setIsCapturing(true)
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentTab = tabs[0]

      if (!currentTab) {
        toast.error(t('panneau.infosPageImpossible'))
        return
      }

      // Capturer le screenshot de la page (la note se fait sans s'il échoue)
      let screenshotDataUrl: string | null = null
      try {
        screenshotDataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 })
      } catch (screenshotError) {
        console.warn('Screenshot capture failed:', screenshotError)
      }

      const newNoteId = await enregistrerNoteDeLaPage(currentTab, screenshotDataUrl)
      setCurrentNoteId(newNoteId)
      await loadData()
    } catch (error) {
      console.error('Error capturing page:', error)
      toast.error(t('panneau.erreurCapturePage'))
      // Piste C : la capture de la page a échoué (plateforme connue ou « autre »).
      void plateformeOnglet().then(plateforme => ecrans.frictionIci('carnet.capture_impossible', { plateforme, raison: 'page' }))
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
        throw new Error(result?.error || t('pleinEcran.extractionEchouee'))
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

      // Les blocs sont posés par `poserBlocsDeCapture`, la MÊME fonction que
      // pour une capture dans une note déjà ouverte : c'est ce qui garantit
      // que la deuxième capture ressemble à la première.
      await poserBlocsDeCapture(newNoteId, enrichi, result, screenshotDataUrl || null, { premiere: true })

      setCurrentNoteId(newNoteId)
      setEditorContent('')
      await loadData()
    } catch (error) {
      console.error('Smart capture error:', error)
      setSmartCaptureError(error instanceof Error ? error.message : t('smart.echec'))
      // Piste C : la capture intelligente n'a rien pu extraire (le message d'erreur ne part pas).
      void plateformeOnglet().then(plateforme => ecrans.frictionIci('carnet.capture_impossible', { plateforme, raison: 'extraction' }))
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
        throw new Error(result?.error || t('pleinEcran.extractionEchouee'))
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

      // La MÊME séquence que pour une note vide : image, points clés, résumé,
      // texte. C'est tout l'intérêt d'avoir sorti la fonction — la deuxième
      // capture ne peut plus diverger de la première.
      await poserBlocsDeCapture(currentNoteId, enrichi, result, screenshotDataUrl || null, { premiere: false })

      // Le résumé et les points clés de la note suivent la DERNIÈRE capture :
      // ce sont eux qui alimentent l'aperçu dans la liste et dans le journal,
      // et « Approfondir » ne dépend plus d'eux pour exister.
      const noteAvant = await storage.getNote(currentNoteId)
      if (noteAvant) {
        await storage.saveNote({
          ...noteAvant,
          summary: enrichi.summary || noteAvant.summary,
          keyPoints: enrichi.keyPoints.length ? enrichi.keyPoints : noteAvant.keyPoints,
          concepts: Array.from(new Set([...(noteAvant.concepts ?? []), ...enrichi.concepts])),
        })
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
      setSmartCaptureError(error instanceof Error ? error.message : t('pleinEcran.erreurCapture'))
      void plateformeOnglet().then(plateforme => ecrans.frictionIci('carnet.capture_impossible', { plateforme, raison: 'extraction' }))
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
      toast.error(t('panneau.erreurPdf'))
      ecrans.frictionIci('carnet.export_echec', { format: 'pdf' })
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
      toast.error(t('panneau.erreurDocs'))
      ecrans.frictionIci('carnet.export_echec', { format: 'docx' })
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
      toast.error(t('pleinEcran.erreurDrive', { erreur: error instanceof Error ? error.message : t('pleinEcran.erreurInconnue') }))
      ecrans.frictionIci('carnet.export_echec', { format: 'drive' })
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
      toast.error(t('panneau.erreurVueEtendue'))
    }
  }

  if (isLoading) {
    return (
      <div className="sidebar-container">
        <div className="flex items-center justify-center h-full animate-fade-in-up">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">{t('pleinEcran.chargement')}</p>
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
        {/* overflow-x-hidden (1.8.12) : la vidéo de Franky montre une barre de
            défilement horizontale sous le fil, donc un fil décalable de
            quelques pixels sur le côté. Rien ne doit dépasser en largeur
            (images et contenu en max-w-full) : on coupe ce défilement. */}
        <div ref={noteDisplayRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {ecrans.ecran ? (
            // Les écrans (Compte, Paramètres, Mentorat, Support...) : les
            // mêmes qu'en plein écran depuis la 1.8.15 (EcransCarnet).
            <EcransCarnet
              ecrans={ecrans}
              notes={notes}
              folders={folders}
              settings={settings!}
              onReglages={setSettings}
              recharger={loadData}
              relireSession={rafraichirAuth}
            />
          ) : currentNoteId ? (
            <CurrentNoteView
              noteId={currentNoteId}
              onNoteUpdate={loadData}
              refreshTrigger={noteRefreshTrigger}
            />
          ) : (
            <EmptyNoteView
              onCapturePage={handleCapturePage}
              onSmartCapture={handleSmartCapture}
              isCapturing={isCapturing}
              analyseEnCours={isSmartCapturing}
              erreurCapture={smartCaptureError}
              captureIaActive={captureIaActive}
              onSelectNote={ouvrirNote}
              notes={notes}
            />
          )}
        </div>

        {/* Lanceurs de rituel — dockés au-dessus de la barre d'envoi : en
            flottant au milieu du panneau ils gênaient la lecture (Brice 28/08) */}
        {currentNoteId && !ecrans.ecran && (
          <OutilsNoteRangee
            noteId={currentNoteId}
            etudeOuverte={etudeOuverte}
            modeleEtude={settings?.modeleEtude ?? null}
            onChange={async () => { await loadData(); setNoteRefreshTrigger(Date.now()) }}
            onEtudeReservee={() => ecrans.ouvrir('mentorat')}
            className="bg-background px-4 pt-1.5"
          />
        )}

        {/* Hub de capture — masqué dans l'écran support : il a sa propre
            saisie, la double barre était illisible (retour Brice 28/08) */}
        {ecrans.ecran !== 'support' && (
          <div className="bg-background px-4 pt-3 pb-1">
            <CaptureInput
              ref={editorRef}
              value={editorContent}
              onChange={setEditorContent}
              placeholder={currentNoteId ? t('capture.placeholderNote') : t('capture.placeholder')}
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

        {/* Le pied et le menu de la roue (1.8.15 : les mêmes qu'en plein écran) */}
        <PiedCarnet
          ecrans={ecrans}
          connecte={isAuthed}
          email={emailConnecte}
          notes={notes}
          className="px-4"
        />
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
        onNoteSupprimee={(id) => { if (id === currentNoteId) setCurrentNoteId(null) }}
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