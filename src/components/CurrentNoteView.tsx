import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, Save, X } from 'lucide-react'
import storage from '@/lib/storage'
import type { AcademicNote } from '@/types/academic'

interface CurrentNoteViewProps {
  noteId: string
  onNoteUpdate?: () => void
}

function CurrentNoteView({ noteId, onNoteUpdate }: CurrentNoteViewProps) {
  const [note, setNote] = useState<AcademicNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [originalContent, setOriginalContent] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNote()
  }, [noteId])

  // Réinitialiser le mode édition quand on change de note
  useEffect(() => {
    setIsEditing(false)
  }, [noteId])

  const loadNote = async () => {
    try {
      setIsLoading(true)
      const notes = await storage.getNotes(1000)
      const foundNote = notes.find(n => n.id === noteId)
      setNote(foundNote || null)
    } catch (error) {
      console.error('Error loading note:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Activer le mode édition
  const startEditing = useCallback(() => {
    if (note) {
      setOriginalContent(note.content)
      setIsEditing(true)
      // Focus sur le contenu après le rendu
      setTimeout(() => {
        contentRef.current?.focus()
      }, 0)
    }
  }, [note])

  // Sauvegarder les modifications
  const saveChanges = async () => {
    if (!note || !contentRef.current) return

    try {
      setIsSaving(true)
      const newContent = contentRef.current.innerHTML
      const updatedNote: AcademicNote = {
        ...note,
        content: newContent,
        timestamp: Date.now()
      }
      await storage.saveNote(updatedNote)
      setNote(updatedNote)
      setIsEditing(false)
      onNoteUpdate?.()
    } catch (error) {
      console.error('Error saving note:', error)
      alert('Erreur lors de la sauvegarde')
    } finally {
      setIsSaving(false)
    }
  }

  // Annuler l'édition
  const cancelEditing = useCallback(() => {
    if (contentRef.current && note) {
      contentRef.current.innerHTML = originalContent
    }
    setIsEditing(false)
  }, [originalContent, note])

  // Gérer les touches clavier
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveChanges()
    }
  }, [cancelEditing])

  // Sauvegarde au blur (clic en dehors) - seulement si on est en mode édition
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Vérifier si le clic est sur un bouton de contrôle
    const relatedTarget = e.relatedTarget as HTMLElement
    if (relatedTarget?.closest('[data-edit-controls]')) {
      return // Ne pas sauvegarder si on clique sur les boutons
    }

    if (isEditing) {
      saveChanges()
    }
  }, [isEditing])

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
      {/* Header avec boutons de contrôle */}
      <div className="flex justify-end" data-edit-controls>
        {!isEditing ? (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Cliquer pour éditer cette note"
          >
            <Pencil size={12} />
            <span>Éditer</span>
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={saveChanges}
              disabled={isSaving}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              <span>{isSaving ? '...' : 'Sauver'}</span>
            </button>
            <button
              onClick={cancelEditing}
              disabled={isSaving}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-50 transition-colors"
            >
              <X size={12} />
            </button>
            <span className="text-xs text-muted-foreground ml-2">
              Échap annuler · Ctrl+S sauver
            </span>
          </div>
        )}
      </div>

      {/* Contenu de la note - édition inline */}
      <div className="prose prose-sm max-w-none">
        <div
          ref={contentRef}
          contentEditable={isEditing}
          suppressContentEditableWarning={true}
          onClick={!isEditing ? startEditing : undefined}
          onKeyDown={isEditing ? handleKeyDown : undefined}
          onBlur={isEditing ? handleBlur : undefined}
          className={`
            text-foreground/90 leading-relaxed rounded-lg transition-all outline-none
            ${isEditing
              ? 'border-2 border-primary/40 bg-background p-3 focus:border-primary'
              : 'cursor-pointer hover:bg-muted/30 p-3 -m-3'
            }
          `}
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
      {note.screenshots && note.screenshots.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Captures d'écran</h3>
          <div className="grid grid-cols-2 gap-3">
            {note.screenshots.map((screenshot, index) => (
              <img
                key={index}
                src={screenshot.dataUrl}
                alt={`Capture ${index + 1}`}
                className="rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
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
