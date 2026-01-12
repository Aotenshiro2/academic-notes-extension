import React from 'react'
import { BookOpen, PenTool, Camera, FileText } from 'lucide-react'

interface EmptyNoteViewProps {
  onNewNote: () => void
}

function EmptyNoteView({ onNewNote }: EmptyNoteViewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12">
      {/* Salutation style Claude */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <BookOpen size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Prêt à prendre des notes de trading ?
        </h2>
        <p className="text-muted-foreground max-w-md">
          Commencez une nouvelle note pour capturer vos analyses, setups et idées de trading.
        </p>
      </div>

      {/* Actions rapides style Claude */}
      <div className="space-y-3 w-full max-w-md">
        <button
          onClick={onNewNote}
          className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <PenTool size={20} className="text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">Démarrer une nouvelle note</div>
            <div className="text-sm text-muted-foreground">Créer une note vierge pour vos analyses</div>
          </div>
        </button>

        <button
          onClick={onNewNote}
          className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Camera size={20} className="text-green-600" />
          </div>
          <div>
            <div className="font-medium text-foreground">Capturer cette page</div>
            <div className="text-sm text-muted-foreground">Sauvegarder le contenu de la page actuelle</div>
          </div>
        </button>

        <button
          onClick={onNewNote}
          className="w-full flex items-center space-x-3 p-4 text-left rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText size={20} className="text-blue-600" />
          </div>
          <div>
            <div className="font-medium text-foreground">Template Setup Trading</div>
            <div className="text-sm text-muted-foreground">Utiliser un modèle prédéfini</div>
          </div>
        </button>
      </div>

      {/* Message d'aide */}
      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground">
          Utilisez la zone de saisie en bas pour commencer à écrire
        </p>
      </div>
    </div>
  )
}

export default EmptyNoteView