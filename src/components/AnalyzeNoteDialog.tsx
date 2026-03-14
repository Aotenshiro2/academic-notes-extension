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

type PromptType = 'neutral' | 'pedagogical' | 'action' | 'custom'
type SendStatus = 'idle' | 'loading' | 'success' | 'fallback' | 'thread-fallback'
type LoadingPhase = 'preparing' | 'opening' | 'loading' | 'injecting'

const PROMPTS: Record<Exclude<PromptType, 'custom'>, string> = {
  neutral: `Voici une note prise pendant un apprentissage ou une analyse.

Ton rôle :
- M'aider à clarifier ce que j'ai compris
- Mettre en évidence les idées clés
- Identifier les zones floues ou implicites
- Me proposer des pistes de réflexion, sans conclure à ma place

Contraintes :
- Ne reformule pas tout inutilement
- Ne surinterprète pas
- Si certaines informations manquent, signale-le clairement

Structure ta réponse en 3 parties maximum :
1. Ce qui est clair et bien compris
2. Ce qui mérite d'être approfondi ou questionné
3. Une ou deux questions utiles pour aller plus loin

Voici la note :
[CONTENU_DE_LA_NOTE]`,

  pedagogical: `Voici une note issue d'un cours ou d'une analyse de marché.

Adopte une posture de mentor expérimenté.
Ton objectif n'est pas d'avoir raison, mais de m'aider à mieux raisonner.

Points d'attention :
- Distingue les faits, les observations et les interprétations
- Replace les concepts dans une logique de contexte et de narration
- Signale les raccourcis mentaux possibles (espoir, anticipation excessive, biais de confirmation)

Si des éléments visuels sont présents (screenshots, graphiques) :
- Utilise-les comme supports de raisonnement
- Ne fais pas d'analyse technique exhaustive si l'information manque

Structure recommandée :
1. Lecture globale de la situation
2. Ce que le marché *devait faire* vs ce que j'ai peut-être voulu voir
3. Un axe de progression concret pour les prochaines situations similaires

Voici la note :
[CONTENU_DE_LA_NOTE]`,

  action: `Voici une note d'apprentissage ou d'analyse.

Ton rôle est de m'aider à en extraire une leçon actionnable.

Contraintes :
- Une seule leçon principale
- Pas de généralités vagues
- Pas de conseils irréalistes

Format attendu :
- Leçon centrale (1 phrase claire)
- Pourquoi cette leçon est importante
- Comment je peux la tester ou l'appliquer concrètement

Voici la note :
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
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType>('neutral')
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
      document.addEventListener('keydown', handleKeyDown)
      setStatus('idle')
      setPdfBlob(null)
      setSendMode('new')
      setLoadingPhase('preparing')
      setSelectedNoteIds([note.id])
      setShowNotePicker(false)
      setPickerFolderFilter(null)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown, note.id])

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

      // Generate PDF: combined multi-note PDF or single-note PDF (when images present)
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
      }

      const onProgress = (phase: 'opening' | 'loading' | 'injecting') => setLoadingPhase(phase)

      // Feature C: when PDF present, inject shorter prompt (instructions only)
      const injectionText = cachedBase64 ? buildInjectionPrompt() : fullPrompt

      const send = (tUrl?: string) => openProviderWithContent({
        provider: providerConfig,
        pdfBase64: cachedBase64,
        fileName: cachedFileName,
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
    { type: 'neutral', label: 'Analyse neutre', subtitle: 'Clarifier, zones floues, pistes de réflexion', icon: MessageSquare },
    { type: 'pedagogical', label: 'Mentor AOKnowledge', subtitle: 'Faits vs interprétations, biais, progression', icon: GraduationCap },
    { type: 'action', label: 'Orientée action', subtitle: 'Extraire une leçon actionnable', icon: Target },
    { type: 'custom', label: 'Prompt libre', subtitle: 'Écrivez votre propre consigne', icon: PenLine },
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
      <div className="relative bg-popover border border-border rounded-xl shadow-xl w-[420px] max-h-[90vh] overflow-hidden animate-scale-in flex flex-col">
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
                  Thread cible
                </button>
              </div>
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
                  Thread cible indisponible — une nouvelle conversation a été ouverte.
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
