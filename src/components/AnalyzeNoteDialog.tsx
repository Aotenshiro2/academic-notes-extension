import React, { useState, useEffect, useCallback } from 'react'
import { X, Sparkles, Copy, ExternalLink, MessageSquare, GraduationCap, PenLine, Target, Check, ImageIcon, Loader2, AlertTriangle, Download, FileText, ChevronDown } from 'lucide-react'
import type { AcademicNote, AnalysisProvider, NoteFolder } from '@/types/academic'
import { formatSmartDate, formatCompactDate } from '@/lib/date-utils'
import { generateAnalysisPdfBlob, generateMultiNoteAnalysisPdfBlob } from '@/lib/pdf-export'
import { openProviderWithContent } from '@/lib/provider-injector'
import { PROVIDERS, PROVIDER_LIST } from '@/lib/analysis-providers'
import storage from '@/lib/storage'

interface AnalyzeNoteDialogProps {
  isOpen: boolean
  onClose: () => void
  note: AcademicNote
  defaultProvider?: AnalysisProvider
  availableNotes?: AcademicNote[]
  folders?: NoteFolder[]
}

// Les prompts forment une CHAÎNE, pas des variantes parallèles :
//   1. `init`   — ouvre la conversation, pose le rôle de l'IA + premier état des lieux
//   2. `update` — envoie une note dans cette conversation déjà cadrée (usage courant)
//   3. `aok`    — « ce que Brice en penserait », l'avis maison PAR OPPOSITION à l'avis
//                 générique de l'IA. Adossé à la doctrine (doctrine-aok/00-DOCTRINE.md).
type PromptType = 'init' | 'update' | 'aok' | 'custom'
type SendStatus = 'idle' | 'loading' | 'success' | 'fallback' | 'thread-fallback'
type LoadingPhase = 'preparing' | 'opening' | 'loading' | 'injecting'

const PROMPTS: Record<Exclude<PromptType, 'custom'>, string> = {
  // 1. À envoyer une seule fois, au début d'une conversation. Pose le cadre et le rôle
  //    pour que les débriefs suivants (`update`) puissent rester courts.
  init: `Je suis un trader formé chez Ao Knowledge. Dans cette conversation, je vais te partager au fil du temps mes notes de séance, prises avec l'extension Le Carnet du Trader.

TON RÔLE
Tu es un partenaire de raisonnement, pas un gourou.
- Tu ne donnes jamais de signal, jamais de prévision, jamais de validation de stratégie.
- Tu m'aides à voir ce que je ne vois pas : mes angles morts, mes raccourcis, l'écart entre ce que le marché faisait et ce que j'ai voulu y voir.
- Tu distingues toujours les faits (ce qui est écrit dans ma note), mes interprétations, et tes hypothèses. Quand une information manque, tu le dis au lieu de combler.

COMMENT LIRE MES NOTES
- Une note = une séance. Elle peut contenir des trades numérotés (heure, résultat), des captures d'écran, des tags et des concepts.
- Un jugement A/B/C porte sur la QUALITÉ DE MA DÉCISION, jamais sur le résultat : A = je le reprendrais sans hésiter, B = c'était flou, C = c'était forcé. Un trade gagnant peut être noté C, un trade perdant peut être noté A. Ne confonds jamais les deux : c'est le cœur de la méthode.
- Un « warmup » est mon état avant de trader (physique, émotionnel, pensée dominante, objectif de séance).
- Un « cooldown » est mon débrief juste après un trade (émotion, erreur, leçon).
- Un « DOL » (Draw on Liquidity) est le niveau de liquidité vers lequel j'attends que le prix soit attiré.

CE QUE J'ATTENDS
- Ne me reformule pas ma note : je l'ai écrite, je la connais.
- Ne conclus pas à ma place.
- Pose-moi les questions qui me font avancer.

POUR COMMENCER
Confirme en une phrase que tu as compris ton rôle, puis fais un premier état des lieux à partir de la note ci-dessous : ce que tu comprends de ma façon de travailler, ce qui ressort de cette séance, et les zones où il te manque de l'information pour m'aider vraiment.

[CONTENU_DE_LA_NOTE]`,

  // 2. L'usage courant : une note de plus dans une conversation déjà cadrée par `init`.
  //    Court volontairement — le cadre est déjà posé, on demande une MISE À JOUR.
  update: `Voici ma nouvelle note de séance. Fais-moi une mise à jour, pas une analyse repartie de zéro.

Dis-moi :
1. Les points qui ressortent de cette séance.
2. Ce qui a évolué depuis mes notes précédentes : progrès réels, régressions, ce que je répète.
3. Mes angles morts : ce que je ne vois pas, ce que j'évite, ce que je répète sans le nommer.

Contraintes :
- Appuie-toi sur ce que tu as déjà vu de moi dans cette conversation.
- Si tu vois un écart entre mes jugements A/B/C et mes résultats, signale-le.
- Termine par UNE seule chose à travailler en priorité à la prochaine séance.

[CONTENU_DE_LA_NOTE]`,

  // 3. L'avis maison. Le point n'est PAS d'avoir un deuxième avis de l'IA : c'est de
  //    confronter son avis générique à la doctrine Ao Knowledge, qui est jointe au
  //    message. D'où la consigne explicite de signaler les divergences.
  aok: `Je veux l'avis d'Ao Knowledge — mon académie — sur ma note.

Deux documents sont joints à ce message : ma note, et « Doctrine Ao Knowledge ». La doctrine contient le socle technique SMC/ICT tel qu'on l'enseigne, notre pédagogie, la méthode de mentorat, la doctrine de coaching de Brice et sa manière de parler.

CE QUE JE TE DEMANDE
- Reprends ma note à la lumière de cette doctrine, pas de ta culture générale du trading.
- Là où la doctrine dit quelque chose de précis (définition d'un concept, critère d'invalidation, ordre de lecture du marché), applique-la, même si ton avis diffère.
- Là où ton avis d'IA s'écarterait de la doctrine, DIS-LE explicitement : « spontanément j'aurais dit X, la doctrine dit Y ». C'est cet écart qui m'intéresse le plus.
- Là où la doctrine ne dit rien sur mon cas, dis-le franchement plutôt que d'inventer une position maison. Un « ce n'est pas cadré chez nous » est utile ; une réponse fabriquée ne l'est pas.

LA FORME COMPTE AUTANT QUE LE FOND
Réponds en respectant la section « voix » de la doctrine. Pas de ton coach ni LinkedIn, pas de promesse de résultat, pas de motivation artificielle, pas de formules creuses. Tutoiement. Nuance avant le tranchant. Une opinion argumentée, pas de complaisance : 1 à 3 axes maximum.

Et le rappel qui prime sur tout : on ne juge jamais une décision à son résultat.

[CONTENU_DE_LA_NOTE]`
}

function noteToPlainText(note: AcademicNote): string {
  const parts: string[] = []

  parts.push(`Titre : ${note.title}`)
  if (note.url) parts.push(`Source : ${note.url}`)
  parts.push(`Date : ${formatSmartDate(note.timestamp)}`)

  if (note.summary) {
    parts.push(`\nRésumé :\n${note.summary}`)
  }

  if (note.keyPoints && note.keyPoints.length > 0) {
    parts.push(`\nPoints clés :`)
    note.keyPoints.forEach(p => parts.push(`- ${p}`))
  }

  if (note.messages && note.messages.length > 0) {
    const textMessages = note.messages
      .filter(m => m.type === 'text')
      .map(m => m.content.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean)

    if (textMessages.length > 0) {
      parts.push(`\nContenu :\n${textMessages.join('\n\n')}`)
    }
  } else if (note.content) {
    const plainContent = note.content.replace(/<[^>]*>/g, '').trim()
    if (plainContent) {
      parts.push(`\nContenu :\n${plainContent}`)
    }
  }

  if (note.tags.length > 0) {
    parts.push(`\nTags : ${note.tags.join(', ')}`)
  }

  if (note.concepts.length > 0) {
    parts.push(`\nConcepts : ${note.concepts.join(', ')}`)
  }

  return parts.join('\n')
}

function buildMultiNoteText(notes: AcademicNote[]): string {
  return notes
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((n, i) => `=== Note ${i + 1} : ${n.title} ===\n${noteToPlainText(n)}`)
    .join('\n\n')
}

function AnalyzeNoteDialog({
  isOpen,
  onClose,
  note,
  defaultProvider = 'chatgpt',
  availableNotes = [],
  folders = [],
}: AnalyzeNoteDialogProps) {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType>('update')
  const [customPrompt, setCustomPrompt] = useState('')
  const [provider, setProvider] = useState<AnalysisProvider>(defaultProvider)
  const [status, setStatus] = useState<SendStatus>('idle')
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [providerThreadUrls, setProviderThreadUrls] = useState<Partial<Record<AnalysisProvider, string>>>({})
  const [sendMode, setSendMode] = useState<'new' | 'thread'>('new')
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('preparing')

  // Multi-note picker state
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([note.id])
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [pickerFolderFilter, setPickerFolderFilter] = useState<string | null>(null)

  const isMultiNote = selectedNoteIds.length > 1

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      setStatus('idle')
      setPdfBlob(null)
      setSendMode('new')
      setLoadingPhase('preparing')
      setSelectedNoteIds([note.id])
      setShowNotePicker(false)
      setPickerFolderFilter(null)
    }
  }, [isOpen, note.id])

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  // Sync provider with settings when dialog opens
  useEffect(() => {
    if (isOpen) setProvider(defaultProvider)
  }, [isOpen, defaultProvider])

  // Load thread URLs from settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      storage.getSettings().then(s => {
        setProviderThreadUrls(s.providerThreadUrls || {})
      })
    }
  }, [isOpen])

  // Reset sendMode to 'new' if the selected provider has no thread URL
  useEffect(() => {
    if (!providerThreadUrls[provider]) {
      setSendMode('new')
    }
  }, [provider, providerThreadUrls])

  if (!isOpen) return null

  const providerConfig = PROVIDERS[provider]
  const hasThreadUrl = !!(providerThreadUrls[provider])

  const noteHasImages = (n: AcademicNote) =>
    n.messages?.some(m => m.type === 'image' || m.type === 'screenshot') ||
    (n.content && /<img\s/i.test(n.content)) ||
    (n.screenshots && n.screenshots.length > 0)

  const hasImages = isMultiNote
    ? availableNotes.filter(n => selectedNoteIds.includes(n.id)).some(noteHasImages)
    : noteHasImages(note)

  const getPromptText = (): string => {
    if (selectedPrompt === 'custom') return customPrompt.trim()
    return PROMPTS[selectedPrompt]
  }

  // Le prompt d'ouverture part AVEC la note (et son PDF) : il cadre la conversation
  // ET sert de premier état des lieux. Il se comporte donc comme les autres.
  const isOpener = selectedPrompt === 'init'

  // L'avis Ao Knowledge joint la doctrine EN PLUS de la note : les deux partent ensemble.
  // (Première version : la doctrine remplaçait la note, en supposant qu'elle était déjà
  // dans la conversation. Mauvaise idée — l'élève perdait sa note sans le voir.)
  const isDoctrine = selectedPrompt === 'aok'

  const buildFullPrompt = (): string => {
    const promptText = getPromptText()

    if (isMultiNote) {
      const selectedNotes = availableNotes.filter(n => selectedNoteIds.includes(n.id))
      const notesText = buildMultiNoteText(selectedNotes)
      if (promptText.includes('[CONTENU_DE_LA_NOTE]')) {
        return promptText.replace('[CONTENU_DE_LA_NOTE]', notesText)
      }
      return `${promptText}\n\n---\n\n${notesText}`
    }

    const noteText = noteToPlainText(note)
    if (promptText.includes('[CONTENU_DE_LA_NOTE]')) {
      return promptText.replace('[CONTENU_DE_LA_NOTE]', noteText)
    }
    return `${promptText}\n\n---\n\n${noteText}`
  }

  // Feature C: when PDF is uploaded, inject only the analysis instructions
  // to avoid duplicate content (text prompt + PDF have the same content)
  const buildInjectionPrompt = (): string => {
    const promptText = getPromptText()
    let pdfNote: string
    if (isMultiNote) {
      const selectedNotes = availableNotes
        .filter(n => selectedNoteIds.includes(n.id))
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
      const notesList = selectedNotes.map((n, i) => `- Note ${i + 1} : ${n.title}`).join('\n')
      pdfNote = `(Le contenu de ${selectedNotes.length} notes est dans le document PDF joint :\n${notesList})`
    } else {
      pdfNote = '(Voir le document PDF joint pour le contenu de la note.)'
    }
    if (promptText.includes('[CONTENU_DE_LA_NOTE]')) {
      return promptText.replace('[CONTENU_DE_LA_NOTE]', pdfNote)
    }
    return `${promptText}\n\n---\n\n${pdfNote}`
  }

  const handleAnalyze = async () => {
    const fullPrompt = buildFullPrompt()
    if (!fullPrompt.trim()) return

    setStatus('loading')

    const threadUrl = sendMode === 'thread' ? (providerThreadUrls[provider] || undefined) : undefined

    try {
      // Always copy full prompt to clipboard as backup
      await navigator.clipboard.writeText(fullPrompt)

      // Les fichiers joints, dans l'ordre : la note d'abord (c'est le sujet), la
      // doctrine ensuite (c'est la référence). Les deux partent ensemble.
      const files: { base64: string; name: string; mime: string }[] = []

      // 1) La note en PDF — comme pour tous les prompts, seulement si elle a des images
      let cachedBase64: string | null = null
      let cachedFileName = ''
      if (hasImages) {
        let blob: Blob
        if (isMultiNote) {
          const selectedNotes = availableNotes
            .filter(n => selectedNoteIds.includes(n.id))
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp)
          blob = await generateMultiNoteAnalysisPdfBlob(selectedNotes)
          cachedFileName = `notes-${selectedNoteIds.length}.pdf`
        } else {
          blob = await generateAnalysisPdfBlob(note)
          cachedFileName = `${(note.title || 'note')
            .replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 40)}.pdf`
        }
        setPdfBlob(blob)
        const arrayBuffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        cachedBase64 = btoa(binary)
        files.push({ base64: cachedBase64, name: cachedFileName, mime: 'application/pdf' })
      }

      // 2) La doctrine (livrée dans le bundle), uniquement pour l'avis Ao Knowledge
      if (isDoctrine) {
        const res = await fetch(chrome.runtime.getURL('doctrine-ao-knowledge.md'))
        const text = await res.text()
        // Encodage octet par octet : un spread sur ~78 Ko ferait sauter la pile d'appels
        const docBytes = new TextEncoder().encode(text)
        let docBinary = ''
        for (let i = 0; i < docBytes.length; i++) docBinary += String.fromCharCode(docBytes[i])
        files.push({ base64: btoa(docBinary), name: 'doctrine-ao-knowledge.md', mime: 'text/markdown' })
      }

      const onProgress = (phase: 'opening' | 'loading' | 'injecting') => setLoadingPhase(phase)

      // Feature C: quand la note part en PDF, le prompt ne répète pas son contenu
      const injectionText = cachedBase64 ? buildInjectionPrompt() : fullPrompt

      const send = (tUrl?: string) => openProviderWithContent({
        provider: providerConfig,
        files,
        promptText: injectionText,
        threadUrl: tUrl,
        onProgress,
      })

      try {
        const result = await send(threadUrl)
        setStatus(hasImages ? (result.pdfUploaded ? 'success' : 'fallback') : 'success')
      } catch (err) {
        if (err instanceof Error && err.message === 'THREAD_INJECTION_FAILED') {
          setStatus('thread-fallback')
          await send(undefined)
        } else {
          throw err
        }
      }
    } catch (error) {
      console.error(`Error sending to ${providerConfig.label}:`, error)
      setStatus('fallback')
    }
  }

  const handleDownloadPdf = () => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title || 'note'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleNoteSelection = (noteId: string, checked: boolean) => {
    if (noteId === note.id) return // current note always selected
    if (checked) {
      setSelectedNoteIds(prev => [...prev, noteId])
    } else {
      setSelectedNoteIds(prev => prev.filter(id => id !== noteId))
    }
  }

  const selectFolder = (folderId: string) => {
    const folderNoteIds = availableNotes.filter(n => n.folderId === folderId).map(n => n.id)
    setSelectedNoteIds(prev => [...new Set([...prev, ...folderNoteIds])])
  }

  const promptDisabled = selectedPrompt === 'custom' && !customPrompt.trim()
  const isLoading = status === 'loading'

  const PHASE_MESSAGES: Record<LoadingPhase, string> = {
    preparing: 'Préparation du contexte...',
    opening:   `Ouverture de ${providerConfig.label}...`,
    loading:   `Chargement de ${providerConfig.label}...`,
    injecting: 'Injection du prompt...',
  }

  const PHASE_PROGRESS: Record<LoadingPhase, string> = {
    preparing: '10%',
    opening:   '35%',
    loading:   '70%',
    injecting: '95%',
  }

  const PROMPT_OPTIONS: { type: PromptType; label: string; subtitle: string; icon: typeof MessageSquare }[] = [
    { type: 'custom', label: 'Prompt libre', subtitle: 'Écris ta propre consigne', icon: PenLine },
    { type: 'init', label: '1. Lancer la conversation', subtitle: 'Pose le rôle de l\'IA + premier état des lieux', icon: MessageSquare },
    { type: 'update', label: '2. Débriefer une séance', subtitle: 'Dans une conversation déjà lancée : évolutions et angles morts', icon: Target },
    { type: 'aok', label: '3. L\'avis Ao Knowledge', subtitle: 'Ce qu\'on en penserait, nous — pas l\'avis générique de l\'IA', icon: GraduationCap },
  ]

  const pickerNotes = availableNotes.filter(n =>
    !pickerFolderFilter || n.folderId === pickerFolderFilter
  )

  const buttonLabel = isMultiNote
    ? `Analyser les ${selectedNoteIds.length} notes`
    : 'Analyser'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-popover border border-border rounded-xl shadow-xl w-[420px] max-h-[90vh] overflow-hidden animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-purple-600 dark:text-purple-400" />
            <h3 className="text-base font-semibold text-foreground">
              {isMultiNote ? `Analyser ${selectedNoteIds.length} notes` : 'Analyser cette note'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">

          {/* ── Note picker ── */}
          {availableNotes.length > 1 && (
            <div className="px-5 mb-3">
              <button
                onClick={() => setShowNotePicker(!showNotePicker)}
                disabled={isLoading}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-foreground">
                    {selectedNoteIds.length} note{selectedNoteIds.length > 1 ? 's' : ''} incluse{selectedNoteIds.length > 1 ? 's' : ''}
                  </span>
                </div>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-150 ${showNotePicker ? 'rotate-180' : ''}`} />
              </button>

              {showNotePicker && (
                <div className="mt-1 border border-border rounded-lg overflow-hidden">
                  {/* Folder filter pills */}
                  {folders.length > 0 && (
                    <div className="flex flex-wrap gap-1 p-2 border-b border-border">
                      <button
                        onClick={() => setPickerFolderFilter(null)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${pickerFolderFilter === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                      >
                        Toutes
                      </button>
                      {folders.map(f => (
                        <button
                          key={f.id}
                          onClick={() => setPickerFolderFilter(f.id)}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors truncate max-w-[90px] ${pickerFolderFilter === f.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                          title={f.name}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Folder quick-select */}
                  {pickerFolderFilter && (
                    <button
                      onClick={() => selectFolder(pickerFolderFilter)}
                      className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-b border-border transition-colors"
                    >
                      + Sélectionner tout « {folders.find(f => f.id === pickerFolderFilter)?.name} »
                    </button>
                  )}

                  {/* Note list */}
                  <div className="max-h-48 overflow-y-auto divide-y divide-border/30">
                    {pickerNotes.map(n => (
                      <label
                        key={n.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          n.id === note.id ? 'bg-muted/30' : 'hover:bg-muted/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedNoteIds.includes(n.id)}
                          onChange={e => toggleNoteSelection(n.id, e.target.checked)}
                          disabled={n.id === note.id}
                          className="rounded flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{n.title}</p>
                          <p className="text-[10px] text-muted-foreground">{formatCompactDate(n.timestamp)}</p>
                        </div>
                        {n.id === note.id && (
                          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">actuelle</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompt options */}
          <div className="px-5 space-y-2">
            <p className="text-xs text-muted-foreground mb-2">Choisissez un type d'analyse :</p>

            {PROMPT_OPTIONS.map(({ type, label, subtitle, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setSelectedPrompt(type)}
                disabled={isLoading}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  selectedPrompt === type
                    ? 'bg-purple-500/5 border-purple-500/20'
                    : 'border-border hover:bg-muted/50'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon size={18} className={selectedPrompt === type ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'} />
                <div>
                  <div className="text-sm font-medium text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground">{subtitle}</div>
                </div>
              </button>
            ))}

            {selectedPrompt === 'custom' && (
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Écrivez votre prompt ici..."
                className="w-full mt-2 p-3 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/40 resize-none"
                rows={3}
                autoFocus
                disabled={isLoading}
              />
            )}
          </div>

          {/* Provider selector */}
          <div className="px-5 mt-4">
            <div className="flex items-center gap-3">
              <label htmlFor="provider-select" className="text-xs text-muted-foreground whitespace-nowrap">
                Provider :
              </label>
              <select
                id="provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as AnalysisProvider)}
                disabled={isLoading}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {PROVIDER_LIST.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Thread mode segmented control */}
          {hasThreadUrl && (
            <div className="px-5 mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Envoyer dans :</span>
              <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setSendMode('new')}
                  disabled={isLoading}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                    sendMode === 'new'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Nouvelle conv.
                </button>
                <button
                  onClick={() => setSendMode('thread')}
                  disabled={isLoading}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                    sendMode === 'thread'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Conv. existante
                </button>
              </div>
            </div>
          )}

          {/* Prompt d'ouverture : rappeler qu'il ne sert qu'une fois par conversation */}
          {isOpener && status === 'idle' && (
            <div className="mx-5 mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex items-start gap-2">
              <MessageSquare size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                À envoyer une seule fois, pour ouvrir la conversation : ta note part avec et
                sert de premier état des lieux. Ensuite, utilise « 2. Débriefer une séance »
                dans cette même conversation.
              </p>
            </div>
          )}

          {/* Image info callout — single note only */}
          {hasImages && status === 'idle' && (
            <div className="mx-5 mt-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg flex items-start gap-2">
              <ImageIcon size={14} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Images détectées — un PDF sera généré et envoyé automatiquement.
              </p>
            </div>
          )}

          {/* Multi-note info callout */}
          {isMultiNote && status === 'idle' && (
            <div className="mx-5 mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex items-start gap-2">
              <FileText size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {selectedNoteIds.length} notes incluses —{' '}
                {hasImages
                  ? 'un PDF combiné sera généré avec toutes les images.'
                  : 'envoyées en texte concaténé (aucune image détectée).'}
              </p>
            </div>
          )}

          {/* Action button */}
          <div className="p-5 pt-4">
            <button
              onClick={handleAnalyze}
              disabled={promptDisabled || status !== 'idle'}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                status === 'success'
                  ? 'bg-green-500/10 border-green-500/20'
                  : status === 'fallback' || status === 'thread-fallback'
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : promptDisabled
                      ? 'opacity-40 bg-muted border-border'
                      : 'bg-purple-500/10 hover:bg-purple-500/15 border-purple-500/20'
              }`}
            >
              {status === 'loading' && (
                <>
                  <Loader2 size={16} className="text-purple-600 dark:text-purple-400 animate-spin" />
                  <span className="text-purple-600 dark:text-purple-400">{PHASE_MESSAGES[loadingPhase]}</span>
                </>
              )}
              {status === 'idle' && (
                <>
                  <ExternalLink size={16} className="text-purple-600 dark:text-purple-400" />
                  <span className="text-purple-600 dark:text-purple-400">{buttonLabel}</span>
                </>
              )}
              {status === 'success' && (
                <>
                  <Check size={16} className="text-green-600 dark:text-green-400" />
                  <span className="text-green-600 dark:text-green-400">
                    {isMultiNote
                      ? hasImages
                        ? `PDF combiné envoyé (${selectedNoteIds.length} notes)`
                        : `${selectedNoteIds.length} notes envoyées`
                      : hasImages ? 'PDF envoyé' : 'Envoyé'}
                  </span>
                </>
              )}
              {(status === 'fallback' || status === 'thread-fallback') && (
                <>
                  <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-600 dark:text-amber-400">Ouvert</span>
                </>
              )}
            </button>
          </div>

          {/* Progress bar */}
          {status === 'loading' && (
            <div className="mx-5 -mt-3 mb-3">
              <div className="h-0.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500/50 rounded-full animate-pulse transition-[width] duration-700 ease-in-out"
                  style={{ width: PHASE_PROGRESS[loadingPhase] }}
                />
              </div>
            </div>
          )}

          {/* Fallback feedback */}
          {status === 'fallback' && (
            <div className="mx-5 mb-4 space-y-2">
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
                <Copy size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Le prompt a été copié — collez avec <kbd className="px-1 py-0.5 bg-amber-500/10 rounded text-[10px] font-mono">Ctrl+V</kbd>.
                  {pdfBlob && ' Glissez le PDF ci-dessous dans la conversation.'}
                </p>
              </div>
              {pdfBlob && (
                <button
                  onClick={handleDownloadPdf}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
                >
                  <Download size={14} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Télécharger le PDF</span>
                </button>
              )}
            </div>
          )}

          {/* Thread fallback feedback */}
          {status === 'thread-fallback' && (
            <div className="mx-5 mb-4 space-y-2">
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Conv. existante indisponible — une nouvelle conversation a été ouverte.
                  {pdfBlob && ' Glissez le PDF ci-dessous dans la conversation.'}
                </p>
              </div>
              {pdfBlob && (
                <button
                  onClick={handleDownloadPdf}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
                >
                  <Download size={14} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Télécharger le PDF</span>
                </button>
              )}
            </div>
          )}

          {/* Success feedback */}
          {status === 'success' && (
            <div className="mx-5 mb-4 p-3 bg-green-500/5 border border-green-500/20 rounded-lg flex items-center gap-2">
              <Copy size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-300">
                Le prompt a aussi été copié dans le presse-papier.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalyzeNoteDialog
