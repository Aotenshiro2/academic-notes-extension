import React, { useState, useRef, useCallback, useMemo } from 'react'
import { Save, X, Trash2, GripVertical, ChevronUp, FileText } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { formatSmartDate } from '@/lib/date-utils'
import type { NoteMessage } from '@/types/academic'

const COLLAPSE_THRESHOLD = 800 // characters of plain text
const PREVIEW_LENGTH = 250 // characters shown in preview

interface MessageBlockProps {
  message: NoteMessage
  onUpdate: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onImageClick?: (src: string) => void
  onOpenPanel?: () => void
  isReadOnly?: boolean
}

function MessageBlock({
  message,
  onUpdate,
  onDelete,
  onImageClick,
  onOpenPanel,
  isReadOnly = false
}: MessageBlockProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [originalContent, setOriginalContent] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  // Detect if this text message is long enough to collapse
  const { isLongText, plainText, estimatedLines } = useMemo(() => {
    if (message.type !== 'text') return { isLongText: false, plainText: '', estimatedLines: 0 }
    // Decode HTML entities + strip tags via a temporary element
    const tmp = document.createElement('div')
    tmp.innerHTML = message.content
    const plain = (tmp.textContent || tmp.innerText || '').trim()
    return {
      isLongText: plain.length > COLLAPSE_THRESHOLD,
      plainText: plain,
      estimatedLines: Math.ceil(plain.length / 80)
    }
  }, [message.content, message.type])

  // Extract title + body excerpt for the collapsed pill
  const { previewTitle, previewExcerpt } = useMemo(() => {
    if (!isLongText) return { previewTitle: '', previewExcerpt: '' }
    const tmp = document.createElement('div')
    tmp.innerHTML = message.content
    // Title: first <strong> tag (the page title we inject in smart capture)
    const title = tmp.querySelector('strong')?.textContent?.trim() || ''
    // Excerpt: text after <hr> (the actual page body)
    const hrEl = tmp.querySelector('hr')
    let excerpt = ''
    if (hrEl?.nextElementSibling) {
      excerpt = (hrEl.nextElementSibling.textContent || '').trim().slice(0, 130)
    }
    // Fallback: skip past the title in plainText
    if (!excerpt && plainText) {
      const startIdx = title ? plainText.indexOf(title) + title.length : 0
      excerpt = plainText.slice(startIdx).trim().slice(0, 130)
    }
    return { previewTitle: title.slice(0, 65), previewExcerpt: excerpt.trim() }
  }, [message.content, isLongText, plainText])

  const startEditing = useCallback(() => {
    if (message.type !== 'text') return
    setIsCollapsed(false) // Always expand before editing
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
      // Re-collapse if still long after edit
      setIsCollapsed(true)
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
    setIsCollapsed(true)
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
    // For standalone image messages, open lightbox
    if (message.type !== 'text' && onImageClick) {
      e.stopPropagation()
      onImageClick(message.content)
      return
    }

    // For images embedded inside text content (<img> in HTML), open lightbox
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG' && onImageClick && !isEditing) {
      e.stopPropagation()
      const src = (target as HTMLImageElement).src
      if (src) {
        onImageClick(src)
        return
      }
    }

    // For text, start editing (only if not collapsed)
    if (!isReadOnly && !isEditing && (!isLongText || !isCollapsed)) {
      startEditing()
    }
  }, [message, isEditing, isReadOnly, isLongText, isCollapsed, startEditing, onImageClick])

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
            aria-label="Supprimer cette image"
          >
            <Trash2 size={14} />
          </button>
        )}

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground mt-1">
          {formatSmartDate(message.timestamp)}
        </div>
      </div>
    )
  }

  // Render collapsed long text — compact pill style
  if (isLongText && isCollapsed && !isEditing) {
    return (
      <div className="group relative mb-3 block w-full max-w-[240px]">
        <div
          onClick={() => onOpenPanel ? onOpenPanel() : setIsCollapsed(false)}
          className="cursor-pointer rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden"
        >
          {/* Title + excerpt */}
          <div className="px-2.5 pt-2 pb-1 min-h-[36px]">
            {previewTitle && (
              <p className="text-[11px] font-semibold text-foreground/80 truncate leading-snug mb-0.5">
                {previewTitle}
              </p>
            )}
            {previewExcerpt && (
              <p className="text-[10px] text-foreground/50 leading-relaxed line-clamp-2">
                {previewExcerpt}
              </p>
            )}
            {!previewTitle && !previewExcerpt && (
              <p className="text-[10px] text-foreground/50 leading-relaxed line-clamp-3">
                {plainText.slice(0, 120)}
              </p>
            )}
          </div>
          {/* Footer badge */}
          <div className="flex items-center gap-1 px-2.5 py-1 border-t border-border/30">
            <FileText size={9} className="text-muted-foreground/40 flex-shrink-0" />
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50 truncate">
              {estimatedLines} lignes
            </span>
          </div>
        </div>

        {/* Delete button */}
        {!isReadOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete() }}
            className="absolute -top-1.5 -right-1.5 p-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Supprimer ce message"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    )
  }

  // Render text message (normal or expanded long text)
  return (
    <div className="group relative mb-3">
      {/* Edit controls */}
      {!isReadOnly && (
        <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
          <button
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            title="Glisser pour r\u00e9organiser"
            aria-label="R\u00e9organiser"
          >
            <GripVertical size={14} />
          </button>
        </div>
      )}

      {/* Collapse header for expanded long text — sticky so it stays visible while scrolling */}
      {isLongText && !isEditing && (
        <div className="sticky top-0 z-10 flex items-center justify-between mb-2 py-1 bg-background/90 backdrop-blur-sm rounded border-b border-border/20">
          <button
            onClick={() => setIsCollapsed(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileText size={12} />
            <span className="font-medium">Contenu coll\u00e9</span>
            <ChevronUp size={12} />
          </button>
          <span className="text-[10px] text-muted-foreground/50 pr-1">~{estimatedLines} lignes</span>
        </div>
      )}

      {/* Content */}
      <div
        className={isLongText && !isEditing ? 'border-l-2 border-border/40 pl-3 overflow-hidden' : ''}
      >
        <div
          ref={contentRef}
          contentEditable={isEditing}
          suppressContentEditableWarning={true}
          onClick={handleClick}
          onKeyDown={isEditing ? handleKeyDown : undefined}
          className={`
            prose prose-sm max-w-none text-foreground/90 leading-relaxed rounded-lg transition-all outline-none
            [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:hover:opacity-80
            [&_*]:max-w-full
            ${isEditing
              ? 'border-2 border-primary/40 bg-background p-3 focus:border-primary'
              : 'cursor-pointer hover:bg-muted/30 p-2 -m-2'
            }
          `}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.content) }}
        />
      </div>

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
          {formatSmartDate(message.timestamp)}
        </div>
      )}
    </div>
  )
}

export default MessageBlock
