import React from 'react'
import { t } from '@/lib/i18n'
import { BookOpen, Camera, History, Sparkles, Loader2 } from 'lucide-react'
import { formatSmartDate } from '@/lib/date-utils'
import type { NoteSummary } from '@/types/academic'
import ActivityPanel from './ActivityPanel'

interface EmptyNoteViewProps {
  onCapturePage?: () => void
  onSmartCapture?: () => void
  isCapturing?: boolean
  lastNote?: NoteSummary
  onSelectNote?: (id: string) => void
  /** Même signal que dans le menu ＋ : l'anneau arc-en-ciel dit que la capture
   *  passe par l'IA. Il n'était posé que sur le ＋, alors que c'est le MÊME
   *  geste depuis l'accueil (remonté par Brice le 01/09). */
  captureIaActive?: boolean
  /** Résumés de toutes les notes : nourrissent le panneau d'activité. Absent =
   *  pas de panneau (le plein écran n'en a pas l'usage). */
  notes?: NoteSummary[]
}

function EmptyNoteView({ onCapturePage, onSmartCapture, isCapturing = false, lastNote, onSelectNote, captureIaActive = false, notes }: EmptyNoteViewProps) {
  // Mise en page rééquilibrée avec le panneau d'activité (1.8.9) : la
  // salutation et les cartes se centrent dans la place qui reste, le panneau
  // se cale en bas, juste au-dessus de la barre d'écriture. min-h-full et pas
  // h-full : quand la barre grandit avant l'envoi, ou sur un petit écran,
  // l'accueil défile au lieu d'être coupé en haut (le justify-center d'une
  // boîte trop petite débordait des deux côtés, sans barre de défilement).
  // Sur un panneau bas, l'icône puis la phrase d'aide s'effacent d'abord.
  return (
    <div className="flex flex-col items-center min-h-full">
      <div className="flex-1 flex flex-col items-center justify-center w-full py-6 [@media(max-height:700px)]:py-2">
        {/* Salutation */}
        <div className="text-center mb-6 [@media(max-height:700px)]:mb-3">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 [@media(max-height:820px)]:hidden">
            <BookOpen size={32} className="text-primary" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            {t('accueil.titre')}
          </h2>
          <p className="text-muted-foreground max-w-md [@media(max-height:700px)]:hidden">
            {t('accueil.sous')}
          </p>
        </div>

        {/* Actions rapides */}
        <div className="space-y-3 [@media(max-height:700px)]:space-y-2 w-full max-w-md">
          {/* Bouton Capture intelligente */}
          {onSmartCapture && (
            <button
              onClick={onSmartCapture}
              className={`w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors ${captureIaActive ? 'aura-ia' : ''}`}
            >
              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles size={20} className="text-foreground" />
              </div>
              <div>
                <div className="font-medium text-foreground">{t('capture.intelligente')}</div>
                <div className="text-sm text-muted-foreground">
                  {captureIaActive ? t('capture.intelligenteSousIA') : t('capture.intelligenteSous')}
                </div>
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
                <div className="font-medium text-foreground">{isCapturing ? t('capture.enCours') : t('accueil.capturerPage')}</div>
                <div className="text-sm text-muted-foreground">{t('accueil.capturerPageSous')}</div>
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

      {/* Activité : sous la dernière carte, au-dessus de la barre d'écriture.
          Collée en bas : quand la barre grandit, ce sont la salutation et les
          cartes qui défilent dessous, le panneau reste contre la barre. Le
          décalage de 1rem (bottom, pb, -mb) couvre le padding du conteneur de
          défilement : sans lui, une carte apparaissait dans la bande sous le
          panneau. */}
      {notes && (
        <div className="sticky bottom-[-1rem] -mb-4 pb-4 w-full max-w-md pt-4 [@media(max-height:700px)]:pt-2 bg-background">
          <ActivityPanel notes={notes} />
        </div>
      )}
    </div>
  )
}

export default EmptyNoteView
