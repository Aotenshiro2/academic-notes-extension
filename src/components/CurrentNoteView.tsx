import React, { useState, useEffect } from 'react'
import storage from '@/lib/storage'
import type { AcademicNote } from '@/types/academic'

interface CurrentNoteViewProps {
  noteId: string
}

function CurrentNoteView({ noteId }: CurrentNoteViewProps) {
  const [note, setNote] = useState<AcademicNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadNote()
  }, [noteId])

  const loadNote = async () => {
    try {
      setIsLoading(true)
      // Charger la note spécifique par ID
      const notes = await storage.getNotes(1000) // Charger toutes pour trouver celle voulue
      const foundNote = notes.find(n => n.id === noteId)
      setNote(foundNote || null)
    } catch (error) {
      console.error('Error loading note:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground mb-4">Note introuvable</p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn-secondary"
        >
          Actualiser
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Contenu de la note seulement */}
      <div className="prose prose-sm max-w-none">
        <div 
          className="text-foreground/90 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      </div>

      {/* Métadonnées supplémentaires */}
      {note.summary && (
        <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <h3 className="text-sm font-semibold text-primary mb-2">Résumé IA</h3>
          <p className="text-sm text-foreground/90">{note.summary}</p>
        </div>
      )}

      {/* Screenshots si présentes */}
      {note.screenshots.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Captures d'écran</h3>
          <div className="grid grid-cols-2 gap-3">
            {note.screenshots.map((screenshot, index) => (
              <img 
                key={index}
                src={screenshot.dataUrl} 
                alt={`Capture ${index + 1}`}
                className="rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  // TODO: Implémenter modal d'agrandissement
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default CurrentNoteView