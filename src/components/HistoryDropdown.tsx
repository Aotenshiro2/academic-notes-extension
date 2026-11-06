import React, { useState } from 'react'
import { X, Clock } from 'lucide-react'
import HistoriqueNotes from './HistoriqueNotes'
import { t } from '@/lib/i18n'
import type { NoteSummary, NoteFolder } from '@/types/academic'

// Le tiroir « Historique » du panneau latéral. Son contenu (recherche, tags,
// dossiers, glisser-déposer) est HistoriqueNotes, le même que la barre
// latérale du plein écran depuis la 1.8.15. Ici : l'ouverture par-dessus le
// panneau, la fermeture (fond assombri, croix, choix d'une note), et ce que
// le tiroir garde d'une ouverture à l'autre (dossiers et tags dépliés). La
// recherche et les filtres, eux, repartent de zéro à chaque ouverture.

interface HistoryDropdownProps {
  isOpen: boolean
  onClose: () => void
  notes: NoteSummary[]
  folders: NoteFolder[]
  currentNoteId: string | null
  onSelectNote: (noteId: string) => void
  onNotesUpdate?: () => void | Promise<void>
  /** Une note vient d'être supprimée : le panneau la referme si c'était celle ouverte. */
  onNoteSupprimee?: (noteId: string) => void
}

function HistoryDropdown({
  isOpen,
  onClose,
  notes,
  folders,
  currentNoteId,
  onSelectNote,
  onNotesUpdate,
  onNoteSupprimee,
}: HistoryDropdownProps) {
  const dossiersOuverts = useState<Set<string>>(new Set())
  const tousLesTags = useState(false)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Un clic hors du tiroir le ferme (les boîtes de confirmation passent au-dessus de ce fond) */}
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />

      <div className="absolute top-0 right-0 w-80 h-full bg-background border-l border-border shadow-xl animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center space-x-2">
            <Clock size={20} className="text-muted-foreground" />
            <h2 className="font-semibold text-foreground">{t('entete.historique')}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" aria-label={t('historique.fermer')}>
            <X size={18} />
          </button>
        </div>

        <HistoriqueNotes
          notes={notes}
          folders={folders}
          currentNoteId={currentNoteId}
          onSelectNote={(id) => { onSelectNote(id); onClose() }}
          onNotesUpdate={onNotesUpdate}
          onNoteSupprimee={onNoteSupprimee}
          souvenirs={{ dossiersOuverts, tousLesTags }}
        />
      </div>
    </div>
  )
}

export default HistoryDropdown
