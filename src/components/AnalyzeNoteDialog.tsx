import React, { useState, useEffect, useCallback } from 'react'
import { X, Sparkles, Copy, ExternalLink, MessageSquare, GraduationCap, PenLine, Target, Check, ImageIcon } from 'lucide-react'
import type { AcademicNote } from '@/types/academic'
import { formatSmartDate } from '@/lib/date-utils'

interface AnalyzeNoteDialogProps {
  isOpen: boolean
  onClose: () => void
  note: AcademicNote
}

type PromptType = 'neutral' | 'pedagogical' | 'action' | 'custom'

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

function AnalyzeNoteDialog({ isOpen, onClose, note }: AnalyzeNoteDialogProps) {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptType>('neutral')
  const [customPrompt, setCustomPrompt] = useState('')
  const [sent, setSent] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      setSent(false)
      setUsedFallback(false)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  // Detect if note contains images
  const hasImages = note.messages?.some(m => m.type === 'image') ||
    (note.content && /<img\s/i.test(note.content))

  const getPromptText = (): string => {
    if (selectedPrompt === 'custom') return customPrompt.trim()
    return PROMPTS[selectedPrompt]
  }

  const buildFullPrompt = (): string => {
    const promptText = getPromptText()
    const noteText = noteToPlainText(note)

    if (promptText.includes('[CONTENU_DE_LA_NOTE]')) {
      return promptText.replace('[CONTENU_DE_LA_NOTE]', noteText)
    }
    return `${promptText}\n\n---\n\n${noteText}`
  }

  const handleOpenChatGPT = async () => {
    const fullPrompt = buildFullPrompt()
    if (!fullPrompt.trim()) return

    try {
      // Always copy to clipboard as backup
      await navigator.clipboard.writeText(fullPrompt)

      // Use ?q= if prompt is short enough for URL
      const encoded = encodeURIComponent(fullPrompt)
      if (encoded.length < 7000) {
        window.open(`https://chatgpt.com/?q=${encoded}`, '_blank')
        setUsedFallback(false)
      } else {
        // Fallback: open ChatGPT without pre-fill, user will paste
        window.open('https://chatgpt.com/', '_blank')
        setUsedFallback(true)
      }

      setSent(true)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const promptDisabled = selectedPrompt === 'custom' && !customPrompt.trim()

  const PROMPT_OPTIONS: { type: PromptType; label: string; subtitle: string; icon: typeof MessageSquare }[] = [
    { type: 'neutral', label: 'Analyse neutre', subtitle: 'Clarifier, zones floues, pistes de réflexion', icon: MessageSquare },
    { type: 'pedagogical', label: 'Mentor AOKnowledge', subtitle: 'Faits vs interprétations, biais, progression', icon: GraduationCap },
    { type: 'action', label: 'Orientée action', subtitle: 'Extraire une leçon actionnable', icon: Target },
    { type: 'custom', label: 'Prompt libre', subtitle: 'Écrivez votre propre consigne', icon: PenLine },
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-popover border border-border rounded-xl shadow-xl w-[420px] max-h-[90vh] overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-purple-600 dark:text-purple-400" />
            <h3 className="text-base font-semibold text-foreground">Analyser cette note</h3>
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
          {/* Prompt options */}
          <div className="px-5 space-y-2">
            <p className="text-xs text-muted-foreground mb-2">Choisissez un type d'analyse :</p>

            {PROMPT_OPTIONS.map(({ type, label, subtitle, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setSelectedPrompt(type)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  selectedPrompt === type
                    ? 'bg-purple-500/5 border-purple-500/20'
                    : 'border-border hover:bg-muted/50'
                }`}
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
              />
            )}
          </div>

          {/* Image callout */}
          {hasImages && (
            <div className="mx-5 mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
              <ImageIcon size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Images — mode assisté (V0). Glissez les images dans ChatGPT après l'ouverture.
              </p>
            </div>
          )}

          {/* ChatGPT button */}
          <div className="p-5 pt-4">
            <button
              onClick={handleOpenChatGPT}
              disabled={promptDisabled || sent}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                sent
                  ? 'bg-green-500/10 border-green-500/20'
                  : promptDisabled
                    ? 'opacity-40 bg-green-500/10 border-green-500/20'
                    : 'bg-green-500/10 hover:bg-green-500/20 border-green-500/20'
              }`}
            >
              {sent ? (
                <>
                  <Check size={16} className="text-green-600 dark:text-green-400" />
                  <span className="text-green-600 dark:text-green-400">Ouvert dans ChatGPT</span>
                </>
              ) : (
                <>
                  <ExternalLink size={16} className="text-green-600 dark:text-green-400" />
                  <span className="text-green-600 dark:text-green-400">Ouvrir dans ChatGPT</span>
                </>
              )}
            </button>
          </div>

          {/* Feedback after sending */}
          {sent && usedFallback && (
            <div className="mx-5 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-2">
              <Copy size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Le prompt est trop long pour le pré-remplissage. Il a été copié — collez avec <kbd className="px-1 py-0.5 bg-blue-500/10 rounded text-[10px] font-mono">Ctrl+V</kbd>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalyzeNoteDialog
