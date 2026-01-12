import React from 'react'
import { Sparkles, Plus, BookOpen, Camera } from 'lucide-react'

interface CaptureControlsProps {
  onNewNote?: () => void
}

function CaptureControls({ onNewNote }: CaptureControlsProps) {
  return (
    <div className="px-4 py-4 bg-muted/20 border-b border-border">
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-6 h-6 bg-primary/10 rounded-lg flex items-center justify-center">
          <BookOpen size={14} className="text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Capture de notes</h3>
      </div>
      
      {onNewNote && (
        <div className="mb-4">
          <button
            onClick={onNewNote}
            className="btn-primary w-full h-11 space-x-2"
            title="Créer une nouvelle note"
          >
            <Plus size={18} />
            <span className="font-medium">Nouvelle note</span>
          </button>
        </div>
      )}

      <div className="p-3 bg-card border border-border/50 rounded-lg shadow-soft">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-2">Fonctionnalités intelligentes :</p>
            <div className="space-y-1">
              <p>✨ Édition riche avec images intégrées</p>
              <p>🎯 Glisser-déposer d'images instantané</p>
              <p>📸 Captures d'écran depuis l'éditeur</p>
              <p className="flex items-center space-x-1 pt-1">
                <span>⌨️ Raccourci :</span>
                <kbd className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border text-xs font-mono">
                  Ctrl+Shift+A
                </kbd>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CaptureControls