import React, { useState, useEffect, useCallback } from 'react'
import storage from '@/lib/storage'
import { sanitizeHtml } from '@/lib/sanitize'
import ImageLightbox from './ImageLightbox'
import MessageBlock from './MessageBlock'
import type { AcademicNote } from '@/types/academic'

interface CurrentNoteViewProps {
  noteId: string
  onNoteUpdate?: () => void
  refreshTrigger?: number
}

function CurrentNoteView({ noteId, onNoteUpdate, refreshTrigger }: CurrentNoteViewProps) {
  const [note, setNote] = useState<AcademicNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // Recharger la note quand noteId ou refreshTrigger change
  useEffect(() => {
    loadNote()
  }, [noteId, refreshTrigger])


  const loadNote = async () => {
    try {
      setIsLoading(true)
      // Use ensureNoteHasMessages to migrate on-demand if needed
      const noteWithMessages = await storage.ensureNoteHasMessages(noteId)
      setNote(noteWithMessages)
    } catch (error) {
      console.error('Error loading note:', error)
      // Fallback to simple get
      const notes = await storage.getNotes(1000)
      const foundNote = notes.find(n => n.id === noteId)
      setNote(foundNote || null)
    } finally {
      setIsLoading(false)
    }
  }

  // Handlers for MessageBlock
  const handleUpdateMessage = useCallback(async (messageId: string, content: string) => {
    if (!note) return
    await storage.updateMessage(noteId, messageId, { content })
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, note, onNoteUpdate])

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!note) return
    await storage.deleteMessage(noteId, messageId)
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, note, onNoteUpdate])

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
      {/* Résumé */}
      {note.summary && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <h3 className="text-sm font-semibold text-primary mb-2">Résumé</h3>
          <p className="text-sm text-foreground/90">{note.summary}</p>
        </div>
      )}

      {/* Points clés - EN HAUT avant le contenu */}
      {note.keyPoints && note.keyPoints.length > 0 && (
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">Points clés</h3>
          <ul className="space-y-1.5">
            {note.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-foreground/90">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contenu de la note — blocs messages */}
      {note.messages && note.messages.length > 0 ? (
        <div className="space-y-3">
          {note.messages.map(message => (
            <MessageBlock
              key={message.id}
              message={message}
              onUpdate={handleUpdateMessage}
              onDelete={handleDeleteMessage}
              onImageClick={setLightboxImage}
            />
          ))}
        </div>
      ) : note.content ? (
        /* Fallback pour anciennes notes sans messages */
        <div className="prose prose-sm max-w-none">
          <div
            className="text-foreground/90 leading-relaxed p-3 [&_img]:cursor-zoom-in [&_img]:transition-opacity [&_img]:hover:opacity-80"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }}
          />
        </div>
      ) : null}

      {/* Image Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage}
          alt="Note image"
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Concepts */}
      {note.concepts.length > 0 && (
        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">Concepts</h3>
          <div className="flex flex-wrap gap-1.5">
            {note.concepts.map((concept, index) => (
              <span
                key={index}
                className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full"
              >
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {note.tags.map((tag, index) => (
            <span
              key={index}
              className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full"
            >
              #{tag}
            </span>
          ))}
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
                className="rounded-lg border border-border cursor-zoom-in hover:opacity-80 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxImage(screenshot.dataUrl)
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
