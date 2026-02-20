import React, { useState, useRef, useMemo } from 'react'
import { X, Edit3, Trash2, Save } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import type { NoteMessage } from '@/types/academic'

interface MessageDetailPanelProps {
  message: NoteMessage
  onClose: () => void
  onUpdate: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  isReadOnly?: boolean
}

function MessageDetailPanel({
  message,
  onClose,
  onUpdate,
  onDelete,
  isReadOnly = false
}: MessageDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Extract title from first <strong> tag in content
  const panelTitle = useMemo(() => {
    const tmp = document.createElement('div')
    tmp.innerHTML = message.content
    return tmp.querySelector('strong')?.textContent?.trim() || ''
  }, [message.content])

  const saveChanges = async () => {
    if (!contentRef.current) return
    setIsSaving(true)
    await onUpdate(message.id, sanitizeHtml(contentRef.current.innerHTML))
    setIsSaving(false)
    setIsEditing(false)
    onClose()
  }

  const handleDelete = async () => {
    if (confirm('Supprimer ce message ?')) {
      await onDelete(message.id)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveChanges()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[89] bg-black/20"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-0 z-[90] flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 min-h-[52px]">
          <div className="flex-1 min-w-0 mr-3">
            {panelTitle ? (
              <p className="text-sm font-semibold text-foreground truncate">{panelTitle}</p>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Contenu captur\u00e9</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isReadOnly && !isEditing && (
              <>
                <button
                  onClick={() => {
                    setIsEditing(true)
                    setTimeout(() => contentRef.current?.focus(), 0)
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  <Edit3 size={12} />
                  <span>Modifier</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors"
                  aria-label="Supprimer"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
            {isEditing && (
              <>
                <button
                  onClick={saveChanges}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Save size={12} />
                  <span>{isSaving ? '...' : 'Sauver'}</span>
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  Annuler
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={contentRef}
            contentEditable={isEditing}
            suppressContentEditableWarning={true}
            onKeyDown={isEditing ? handleKeyDown : undefined}
            className={`
              prose prose-sm max-w-none text-foreground/90 leading-relaxed outline-none
              [&_img]:max-w-full [&_img]:rounded-lg [&_*]:max-w-full
              [&_p]:mb-3 [&_p]:mt-0
              [&_div]:mb-2
              [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer [&_a]:hover:text-blue-600
              [&_strong]:font-semibold [&_b]:font-semibold
              [&_ul]:my-2 [&_li]:mb-1
              [&_hr]:my-4 [&_hr]:border-border/40
              ${isEditing
                ? 'border border-primary/40 rounded-lg p-3 focus:border-primary bg-background'
                : ''
              }
            `}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.content) }}
          />
        </div>
      </div>
    </>
  )
}

export default MessageDetailPanel
