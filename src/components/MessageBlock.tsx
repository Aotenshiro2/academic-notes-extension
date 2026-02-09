import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Pencil, Save, X, Trash2, GripVertical } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import type { NoteMessage } from '@/types/academic'

interface MessageBlockProps {
  message: NoteMessage
  onUpdate: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onImageClick?: (src: string) => void
  isReadOnly?: boolean
}

function MessageBlock({
  message,
  onUpdate,
  onDelete,
  onImageClick,
  isReadOnly = false
}: MessageBlockProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [originalContent, setOriginalContent] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  const startEditing = useCallback(() => {
    if (message.type !== 'text') return // Only text messages can be edited inline
    setOriginalContent(message.content)
    setIsEditing(true)
    setTimeout(() => {
      contentRef.current?.focus()
    }, 0)
  }, [message])

  const saveChanges = useCallback(async () => {
    if (!contentRef.current) return

    try {
      setIsSaving(true)
      const newContent = sanitizeHtml(contentRef.current.innerHTML)
      await onUpdate(message.id, newContent)
      setIsEditing(false)
    } catch (error) {
      console.error('Error saving message:', error)
      alert('Erreur lors de la sauvegarde')
    } finally {
      setIsSaving(false)
    }
  }, [message.id, onUpdate])

  const cancelEditing = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = originalContent
    }
    setIsEditing(false)
  }, [originalContent])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveChanges()
    }
  }, [cancelEditing, saveChanges])

  const handleDelete = useCallback(async () => {
    if (confirm('Supprimer ce message ?')) {
      await onDelete(message.id)
    }
  }, [message.id, onDelete])

  const handleClick = useCallback((e: React.MouseEvent) => {
    // For images, open lightbox
    if (message.type !== 'text' && onImageClick) {
      e.stopPropagation()
      onImageClick(message.content)
      return
    }

    // For text, start editing
    if (!isReadOnly && !isEditing) {
      startEditing()
    }
  }, [message, isEditing, isReadOnly, startEditing, onImageClick])

  // Render image message
  if (message.type !== 'text') {
    return (
      <div className="group relative mb-3">
        <img
          src={message.content}
          alt={message.metadata?.alt || 'Image'}
          className="max-w-full rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
          onClick={handleClick}
        />

        {/* Delete button for images */}
        {!isReadOnly && (
          <button
            onClick={handleDelete}
            className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            title="Supprimer cette image"
          >
            <Trash2 size={14} />
          </button>
        )}

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(message.timestamp).toLocaleString('fr-FR')}
        </div>
      </div>
    )
  }

  // Render text message
  return (
    <div className="group relative mb-3">
      {/* Edit controls */}
      {!isReadOnly && (
        <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
          <button
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="Glisser pour réorganiser"
          >
            <GripVertical size={14} />
          </button>
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        contentEditable={isEditing}
        suppressContentEditableWarning={true}
        onClick={handleClick}
        onKeyDown={isEditing ? handleKeyDown : undefined}
        className={`
          prose prose-sm max-w-none text-foreground/90 leading-relaxed rounded-lg transition-all outline-none
          ${isEditing
            ? 'border-2 border-primary/40 bg-background p-3 focus:border-primary'
            : 'cursor-pointer hover:bg-muted/30 p-2 -m-2'
          }
        `}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.content) }}
      />

      {/* Editing controls */}
      {isEditing && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={saveChanges}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          >
            <Save size={12} />
            <span>{isSaving ? '...' : 'Sauver'}</span>
          </button>
          <button
            onClick={cancelEditing}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-50"
          >
            <X size={12} />
            <span>Annuler</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 ml-auto"
          >
            <Trash2 size={12} />
            <span>Supprimer</span>
          </button>
        </div>
      )}

      {/* Timestamp (shown on hover when not editing) */}
      {!isEditing && (
        <div className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(message.timestamp).toLocaleString('fr-FR')}
        </div>
      )}
    </div>
  )
}

export default MessageBlock
