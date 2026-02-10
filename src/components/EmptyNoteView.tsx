import React from 'react'
import { BookOpen, Camera, History, Sparkles, Loader2 } from 'lucide-react'
import { formatSmartDate } from '@/lib/date-utils'
import type { AcademicNote } from '@/types/academic'

interface EmptyNoteViewProps {
  onCapturePage?: () => void
  onSmartCapture?: () => void
  isCapturing?: boolean
  lastNote?: AcademicNote
  onSelectNote?: (id: string) => void
}

function EmptyNoteView({ onCapturePage, onSmartCapture, isCapturing = false, lastNote, onSelectNote }: EmptyNoteViewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12">
      {/* Salutation */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Prêt à prendre des notes ?
        </h2>
        <p className="text-muted-foreground max-w-md">
          Écrivez dans la zone ci-dessous ou capturez cette page.
        </p>
      </div>

      {/* Actions rapides */}
      <div className="space-y-3 w-full max-w-md">
        {/* Bouton Capture intelligente */}
        {onSmartCapture && (
          <button
            onClick={onSmartCapture}
            className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-purple-200 dark:border-purple-800/30 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="font-medium text-foreground">Capture intelligente</div>
              <div className="text-sm text-muted-foreground">Résumé + points clés de la page</div>
            </div>
          </button>
        )}

        {/* Bouton Capture */}
        {onCapturePage && (
          <button
            onClick={onCapturePage}
            disabled={isCapturing}
            className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              {isCapturing
                ? <Loader2 size={20} className="text-green-600 dark:text-green-400 animate-spin" />
                : <Camera size={20} className="text-green-600 dark:text-green-400" />
              }
            </div>
            <div>
              <div className="font-medium text-foreground">{isCapturing ? 'Capture en cours...' : 'Capturer cette page'}</div>
              <div className="text-sm text-muted-foreground">Screenshot + titre et URL</div>
            </div>
          </button>
        )}

        {/* Carte dernière conversation */}
        {lastNote && onSelectNote && (
          <button
            onClick={() => onSelectNote(lastNote.id)}
            className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <History size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground truncate">{lastNote.title}</div>
              <div className="text-sm text-muted-foreground">
                {formatSmartDate(lastNote.timestamp)}
                {lastNote.metadata?.domain && ` • ${lastNote.metadata.domain}`}
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

export default EmptyNoteView
