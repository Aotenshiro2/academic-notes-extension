import React from 'react'
import { BookOpen, Camera, History } from 'lucide-react'
import type { AcademicNote } from '@/types/academic'

interface EmptyNoteViewProps {
  onCapturePage?: () => void
  lastNote?: AcademicNote
  onSelectNote?: (id: string) => void
}

// Fonction pour formater le temps relatif
function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diffInSeconds = Math.floor((now - timestamp) / 1000)

  if (diffInSeconds < 60) return "À l'instant"
  if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} min`
  if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)}h`
  if (diffInSeconds < 172800) return 'Hier'
  return `Il y a ${Math.floor(diffInSeconds / 86400)} jours`
}

function EmptyNoteView({ onCapturePage, lastNote, onSelectNote }: EmptyNoteViewProps) {
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
        {/* Bouton Capture */}
        {onCapturePage && (
          <button
            onClick={onCapturePage}
            className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Camera size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="font-medium text-foreground">Capturer cette page</div>
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
                {formatTimeAgo(lastNote.timestamp)}
                {lastNote.metadata?.domain && ` • ${lastNote.metadata.domain}`}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Message d'aide */}
      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground">
          💡 Écrivez directement dans la zone en bas pour créer une note
        </p>
      </div>
    </div>
  )
}

export default EmptyNoteView
