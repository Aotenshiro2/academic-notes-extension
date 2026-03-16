import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Edit3, Check, X, Plus } from 'lucide-react'
import storage from '@/lib/storage'
import { sanitizeHtml } from '@/lib/sanitize'
import ImageLightbox from './ImageLightbox'
import MessageBlock from './MessageBlock'
import MessageDetailPanel from './MessageDetailPanel'
import type { AcademicNote, NoteMessage } from '@/types/academic'

interface CurrentNoteViewProps {
  noteId: string
  onNoteUpdate?: () => void
  refreshTrigger?: number
}

function CurrentNoteView({ noteId, onNoteUpdate, refreshTrigger }: CurrentNoteViewProps) {
  const [note, setNote] = useState<AcademicNote | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [panelMessage, setPanelMessage] = useState<NoteMessage | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

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

  // Collect all image sources from the note for lightbox navigation
  const noteImages = useMemo(() => {
    if (!note) return []
    const imgs: string[] = []

    // Images from messages
    note.messages?.forEach(msg => {
      if (msg.type === 'image' || msg.type === 'screenshot' || msg.type === 'capture') {
        imgs.push(msg.content)
      } else if (msg.type === 'text') {
        // Extract <img src="..."> from HTML content
        const matches = msg.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
        for (const m of matches) {
          if (m[1]) imgs.push(m[1])
        }
      }
    })

    // Images from legacy screenshots array
    note.screenshots?.forEach(s => {
      if (s.dataUrl && !imgs.includes(s.dataUrl)) {
        imgs.push(s.dataUrl)
      }
    })

    // If no messages, extract from legacy content
    if ((!note.messages || note.messages.length === 0) && note.content) {
      const matches = note.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
      for (const m of matches) {
        if (m[1] && !imgs.includes(m[1])) imgs.push(m[1])
      }
    }

    return imgs
  }, [note])

  const handleImageClick = useCallback((src: string) => {
    const idx = noteImages.indexOf(src)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }, [noteImages])

  // Handlers for MessageBlock
  const handleUpdateMessage = useCallback(async (messageId: string, content: string) => {
    if (!note) return
    await storage.updateMessage(noteId, messageId, { content })
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, note, onNoteUpdate])

  const saveTitle = useCallback(async () => {
    if (!note || !titleDraft.trim()) { setEditingTitle(false); return }
    await storage.saveNote({ ...note, title: titleDraft.trim() })
    setEditingTitle(false)
    await loadNote()
    onNoteUpdate?.()
  }, [note, titleDraft, onNoteUpdate])

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!note) return
    await storage.deleteMessage(noteId, messageId)
    await loadNote()
    onNoteUpdate?.()
  }, [noteId, note, onNoteUpdate])

  const handleAddTag = useCallback(async () => {
    if (!note || !tagDraft.trim()) { setAddingTag(false); setTagDraft(''); return }
    const newTag = tagDraft.trim().replace(/^#/, '')
    if (!newTag || note.tags.includes(newTag)) { setAddingTag(false); setTagDraft(''); return }
    await storage.saveNote({ ...note, tags: [...note.tags, newTag] })
    setAddingTag(false)
    setTagDraft('')
    await loadNote()
    onNoteUpdate?.()
  }, [note, tagDraft, onNoteUpdate])

  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!note) return
    await storage.saveNote({ ...note, tags: note.tags.filter(t => t !== tag) })
    await loadNote()
    onNoteUpdate?.()
  }, [note, onNoteUpdate])

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
      {/* Titre de la note */}
      <div className="flex items-center gap-2 group pb-1 border-b border-border/40">
        {editingTitle ? (
          <>
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="flex-1 text-sm font-semibold bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button onClick={saveTitle} className="p-1 text-green-600 hover:text-green-700 rounded flex-shrink-0" aria-label="Sauvegarder"><Check size={13} /></button>
            <button onClick={() => setEditingTitle(false)} className="p-1 text-muted-foreground hover:text-foreground rounded flex-shrink-0" aria-label="Annuler"><X size={13} /></button>
          </>
        ) : (
          <>
            <h2 className="flex-1 text-sm font-semibold text-foreground truncate">{note.title}</h2>
            <button
              onClick={() => { setTitleDraft(note.title); setEditingTitle(true) }}
              className="p-1 text-muted-foreground hover:text-primary rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Modifier le titre"
              aria-label="Modifier le titre"
            >
              <Edit3 size={13} />
            </button>
          </>
        )}
      </div>

      {/* Tags éditables */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        {note.tags.map((tag) => (
          <button
            key={tag}
            onClick={() => handleRemoveTag(tag)}
            className="group flex items-center gap-1 px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full hover:bg-red-500/10 hover:text-red-500 transition-colors"
            title="Supprimer ce tag"
          >
            #{tag}
            <X size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
        {addingTag ? (
          <input
            ref={tagInputRef}
            autoFocus
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onBlur={handleAddTag}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }
              if (e.key === 'Escape') { setAddingTag(false); setTagDraft('') }
            }}
            placeholder="tag..."
            className="px-2 py-0.5 text-xs bg-muted rounded-full border border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20 w-20"
          />
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-muted-foreground/60 hover:text-primary rounded-full hover:bg-muted transition-colors"
            title="Ajouter un tag"
          >
            <Plus size={10} />
            <span>tag</span>
          </button>
        )}
      </div>

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
              onImageClick={handleImageClick}
              onOpenPanel={() => setPanelMessage(message)}
            />
          ))}
        </div>
      ) : note.content ? (
        /* Fallback pour anciennes notes sans messages */
        <div className="prose prose-sm max-w-none">
          <div
            className="text-foreground/90 leading-relaxed p-3 [&_img]:cursor-zoom-in [&_img]:transition-opacity [&_img]:hover:opacity-80"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }}
            onClick={(e) => {
              const target = e.target as HTMLElement
              if (target.tagName === 'IMG') {
                e.stopPropagation()
                const src = (target as HTMLImageElement).src
                if (src) handleImageClick(src)
              }
            }}
          />
        </div>
      ) : null}

      {/* Message Detail Panel overlay */}
      {panelMessage && (
        <MessageDetailPanel
          message={panelMessage}
          onClose={() => setPanelMessage(null)}
          onUpdate={async (id, content) => {
            await handleUpdateMessage(id, content)
            setPanelMessage(null)
          }}
          onDelete={async (id) => {
            await handleDeleteMessage(id)
            setPanelMessage(null)
          }}
        />
      )}

      {/* Image Lightbox with navigation */}
      {lightboxIndex !== null && noteImages.length > 0 && (
        <ImageLightbox
          src={noteImages[lightboxIndex]}
          alt="Note image"
          onClose={() => setLightboxIndex(null)}
          images={noteImages}
          currentIndex={lightboxIndex}
          onNavigate={setLightboxIndex}
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
                  handleImageClick(screenshot.dataUrl)
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
