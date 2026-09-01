import { toast } from '../lib/toast'
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Save, X, Trash2, GripVertical, ChevronUp, FileText, Tag } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { formatSmartDate } from '@/lib/date-utils'
import storage from '@/lib/storage'
import TagPickerPopup from './TagPickerPopup'
import ConfirmDialog from './ConfirmDialog'
import type { NoteMessage } from '@/types/academic'

const COLLAPSE_THRESHOLD = 800 // characters of plain text
const PREVIEW_LENGTH = 250 // characters shown in preview

interface MessageBlockProps {
  message: NoteMessage
  noteId: string
  onUpdate: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onTagsUpdate?: () => void
  onImageClick?: (src: string) => void
  onOpenPanel?: () => void
  isReadOnly?: boolean
}

function MessageBlock({
  message,
  noteId,
  onUpdate,
  onDelete,
  onTagsUpdate,
  onImageClick,
  onOpenPanel,
  isReadOnly = false
}: MessageBlockProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [originalContent, setOriginalContent] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ top: 0, bottom: 0, left: 0 })
  // Bouton « tag » flottant proposé sur une sélection (n'ouvre PAS le picker tout seul :
  // sinon la sélection est perdue et souligner / copier / clic droit devient impossible)
  const [tagHint, setTagHint] = useState<{ top: number; bottom: number; left: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      excerpt = (hrEl.nextElementSibling.textContent || '').trim().slice(0, 700)
    }
    // Fallback: skip past the title in plainText
    if (!excerpt && plainText) {
      const startIdx = title ? plainText.indexOf(title) + title.length : 0
      excerpt = plainText.slice(startIdx).trim().slice(0, 700)
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
      toast.error('Erreur lors de la sauvegarde')
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
      if (pickerOpen) return
      e.preventDefault()
      cancelEditing()
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveChanges()
    }
  }, [cancelEditing, saveChanges])

  // Confirmation via une vraie boîte de l'app (jamais `confirm()` natif : le
  // navigateur laisse l'utilisateur cocher « ne plus afficher », ce qui rendait
  // la suppression définitivement impossible sans aller dans les réglages Chrome)
  const handleDelete = useCallback(() => setConfirmDelete(true), [])

  const confirmDeleteNow = useCallback(async () => {
    setConfirmDelete(false)
    await onDelete(message.id)
  }, [message.id, onDelete])

  // Sur une sélection, on propose seulement un petit bouton « tag » : la sélection
  // reste intacte, donc souligner (Ctrl+U), copier/coller et le clic droit marchent.
  const handleMouseUp = useCallback(() => {
    if (!isEditing) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return setTagHint(null)
    if (!contentRef.current) return
    const range = selection.getRangeAt(0)
    if (!contentRef.current.contains(range.commonAncestorContainer)) return setTagHint(null)
    const rect = range.getBoundingClientRect()
    setTagHint({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
  }, [isEditing])

  // Ouvre le picker depuis le bouton flottant (mousedown neutralisé en amont pour
  // que le clic ne détruise pas la sélection en cours)
  const openTagPicker = useCallback(() => {
    if (tagHint) setPickerPosition(tagHint)
    setTagHint(null)
    setPickerOpen(true)
  }, [tagHint])

  // Le bouton disparaît dès que la sélection est vidée (clic ailleurs, Échap…)
  useEffect(() => {
    if (!tagHint) return
    const onSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) setTagHint(null)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [tagHint])

  useEffect(() => {
    if (!isEditing) setTagHint(null)
  }, [isEditing])

  const handleAddTag = useCallback(async (tagName: string) => {
    const current = message.tags ?? []
    if (current.includes(tagName)) return
    await storage.updateMessageTags(noteId, message.id, [...current, tagName])
    onTagsUpdate?.()
  }, [noteId, message.id, message.tags, onTagsUpdate])

  const handleRemoveTag = useCallback(async (tagName: string) => {
    const current = message.tags ?? []
    await storage.updateMessageTags(noteId, message.id, current.filter(t => t !== tagName))
    onTagsUpdate?.()
  }, [noteId, message.id, message.tags, onTagsUpdate])

  const handleClick = useCallback((e: React.MouseEvent) => {
    // For standalone image messages, open lightbox
    if (message.type !== 'text' && message.type !== 'meta' && onImageClick) {
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

  // Render meta message — métadonnée de capture (date, titre, URL) : ligne
  // discrète, pas de tags, pas d'édition ; suppression possible
  // Rôle du bloc dans une capture : décide du titre et de l'accent.
  const roleBloc = message.metadata?.bloc

  if (message.type === 'meta') {
    return (
      <div className="group relative flex items-start gap-1.5">
        <p className="flex-1 text-[11px] italic text-muted-foreground/60 leading-relaxed break-all">
          {message.content}
        </p>
        {!isReadOnly && (
          <button
            onClick={handleDelete}
            className="p-1 text-muted-foreground/40 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Supprimer cette métadonnée"
            aria-label="Supprimer cette métadonnée"
          >
            <Trash2 size={11} />
          </button>
        )}
        <ConfirmDialog
          isOpen={confirmDelete}
          title="Supprimer cette métadonnée ?"
          message="La ligne de contexte (date, page, URL) sera retirée de la note."
          onConfirm={confirmDeleteNow}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    )
  }

  // Render image message
  if (message.type !== 'text') {
    return (
      <div className="group relative">
        <img
          src={message.content}
          alt={message.metadata?.alt || 'Image'}
          loading="lazy"
          decoding="async"
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

        {/* Pied de bloc : heure + tags sur une seule ligne */}
        <MessageFooter
          timestamp={message.timestamp}
          tags={message.tags}
          isReadOnly={isReadOnly}
          onRemoveTag={handleRemoveTag}
          onOpenPicker={(rect) => {
            setPickerPosition({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
            setPickerOpen(true)
          }}
        />

        {pickerOpen && (
          <TagPickerPopup
            position={pickerPosition}
            currentTags={message.tags ?? []}
            onAdd={handleAddTag}
            onRemove={handleRemoveTag}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {/* BUG FIX 1.6.7 : le dialog n'était rendu que dans la branche texte —
            cliquer la poubelle d'une image ne montrait RIEN (suppression impossible) */}
        <ConfirmDialog
          isOpen={confirmDelete}
          title="Supprimer cette image ?"
          message="L'image sera retirée de la note. Action définitive."
          onConfirm={confirmDeleteNow}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    )
  }

  // Render collapsed long text — tuile portrait 3:4 façon chip « PASTED » de
  // Claude Desktop (inspiration Brice 28/08) : petite carte, texte brut
  // minuscule qui remplit la tuile, badge en bas à gauche.
  if (isLongText && isCollapsed && !isEditing) {
    return (
      <div className="group relative block w-fit">
        <div
          onClick={() => onOpenPanel ? onOpenPanel() : setIsCollapsed(false)}
          className="cursor-pointer rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden w-[132px] h-[140px] flex flex-col p-2.5"
        >
          <p className="flex-1 overflow-hidden text-[9px] text-foreground/50 leading-snug break-words">
            {plainText.slice(0, 320)}
          </p>
          <div className="mt-1.5 flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-background/70 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              <FileText size={8} className="flex-shrink-0" />
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

        {/* BUG FIX 1.6.7 : même manque que la branche image — sans dialog ici,
            supprimer un long texte replié était silencieusement impossible */}
        <ConfirmDialog
          isOpen={confirmDelete}
          title="Supprimer ce bloc ?"
          message="Ce contenu sera retiré de la note. Action définitive."
          onConfirm={confirmDeleteNow}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    )
  }

  // Render text message (normal or expanded long text)
  return (
    <div className="group relative">
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

      {/* Contenu. Un bloc de capture (points clés, résumé) porte son titre et
          son accent : passés de carte à bloc, ils se noyaient dans le fil
          (retour Brice, 01/09). Même palette que les anciennes cartes. */}
      <div
        className={[
          isLongText && !isEditing ? 'border-l-2 border-border/40 pl-3 overflow-hidden' : '',
          roleBloc === 'points-cles' ? 'p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg' : '',
          roleBloc === 'resume' ? 'p-3 bg-primary/5 border border-primary/20 rounded-lg' : '',
        ].filter(Boolean).join(' ')}
      >
        {roleBloc && (
          <h3 className={`text-sm font-semibold mb-2 ${
            roleBloc === 'points-cles' ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
          }`}>
            {roleBloc === 'points-cles' ? 'Points clés' : 'Résumé'}
          </h3>
        )}
        <div
          ref={contentRef}
          contentEditable={isEditing}
          suppressContentEditableWarning={true}
          onClick={handleClick}
          onMouseUp={!isReadOnly ? handleMouseUp : undefined}
          onKeyDown={isEditing ? handleKeyDown : undefined}
          className={`
            prose prose-sm max-w-none text-foreground/90 leading-relaxed rounded-lg transition-all outline-none
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
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

      {/* Bouton « tag » flottant sur la sélection — onMouseDown neutralisé pour ne pas
          casser la sélection ; il n'apparaît que si l'utilisateur sélectionne du texte */}
      {tagHint && !pickerOpen && (
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={openTagPicker}
          className="fixed z-50 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-border bg-popover text-foreground shadow-lg hover:bg-muted transition-colors -translate-x-1/2"
          style={{ top: Math.max(tagHint.top - 34, 4), left: tagHint.left }}
          title="Taguer la sélection"
        >
          <Tag size={11} />
          Taguer
        </button>
      )}

      {pickerOpen && (
        <TagPickerPopup
          position={pickerPosition}
          currentTags={message.tags ?? []}
          onAdd={handleAddTag}
          onRemove={handleRemoveTag}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Supprimer ce bloc ?"
        message="Ce contenu sera retiré de la note. Action définitive."
        onConfirm={confirmDeleteNow}
        onCancel={() => setConfirmDelete(false)}
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

      {/* Pied de bloc : heure + tags + suppression, sur une seule ligne */}
      {!isEditing && (
        <MessageFooter
          timestamp={message.timestamp}
          tags={message.tags}
          isReadOnly={isReadOnly}
          onRemoveTag={handleRemoveTag}
          onOpenPicker={(rect) => {
            setPickerPosition({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 })
            setPickerOpen(true)
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

interface MessageFooterProps {
  timestamp: number
  tags?: string[]
  isReadOnly: boolean
  onRemoveTag: (tag: string) => void
  onOpenPicker: (rect: DOMRect) => void
  /** Absent = pas de suppression depuis le pied (l'image a sa poubelle en surimpression) */
  onDelete?: () => void
}

/**
 * Pied de bloc unique : heure + tags + « + tag » + suppression sur UNE ligne,
 * toujours SOUS le bloc, quel que soit son type.
 *
 * Avant : les tags étaient au-dessus d'un bloc texte mais en dessous d'un bloc
 * image (les deux rangées se télescopaient quand les deux blocs se suivaient),
 * et la rangée de tags était rendue même vide pour réserver sa place — ce qui
 * empilait rangée de tags + ligne d'heure + marges et cassait la lecture
 * suivie du texte (retour Brice 04/08). Deuxième passe (28/08) : même la
 * ligne unique de 16 px doublait la hauteur des messages courts — sans tags,
 * le pied sort du flux et devient une pastille en surimpression au survol ;
 * la rangée en flux ne subsiste que quand des tags existent.
 */
function MessageFooter({ timestamp, tags, isReadOnly, onRemoveTag, onOpenPicker, onDelete }: MessageFooterProps) {
  if (isReadOnly && (!tags || tags.length === 0)) return null

  // Sans tags, le pied ne prend AUCUNE place dans le flux : chaque bloc
  // réservait 16 px + l'espacement pour une ligne vide la plupart du temps,
  // ce qui doublait la hauteur des messages d'une ligne et donnait un rendu
  // « chat aéré » au lieu d'un document (retour Brice 28/08). Les commandes
  // (date, + tag, poubelle) deviennent une pastille en surimpression au
  // survol — zéro décalage de mise en page (même leçon que le bouton d'envoi
  // de la capture bar).
  // ⚠️ Révélation par OPACITÉ, jamais par display : basculer le display au
  // survol laissait des artefacts de peinture (zone basse fantôme en
  // surimpression du texte, vidéo Brice du 29/08). L'opacité se compose sur
  // le GPU sans re-peindre la zone.
  if (!tags || tags.length === 0) {
    return (
      <div className="absolute -top-2.5 right-0 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border bg-popover shadow-sm text-[10px] text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
        <span>{formatSmartDate(timestamp)}</span>
        <button
          onClick={e => { e.stopPropagation(); onOpenPicker(e.currentTarget.getBoundingClientRect()) }}
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-primary/40 hover:text-primary transition-colors"
          aria-label="Ajouter un tag"
        >
          + tag
        </button>
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-0.5 text-muted-foreground/50 hover:text-red-500 rounded transition-colors"
            title="Supprimer ce bloc"
            aria-label="Supprimer ce bloc"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    )
  }

  // Avec tags : l'horodatage ne réserve PLUS de place dans la ligne (l'espace
  // vide avant les tags était incohérent, retour Brice 29/08) — il rejoint la
  // pastille en surimpression, comme pour les blocs sans tag.
  return (
    <>
      <span className="absolute -top-2.5 right-0 z-20 px-2 py-0.5 rounded-md border border-border bg-popover shadow-sm text-[10px] text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
        {formatSmartDate(timestamp)}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[16px] text-[10px] text-muted-foreground">
      {(tags ?? []).map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full border"
          style={{
            background: 'rgba(59,130,246,0.12)',
            borderColor: 'rgba(59,130,246,0.35)',
            color: '#3b82f6',
          }}
        >
          {tag}
          {!isReadOnly && (
            <button
              onClick={e => { e.stopPropagation(); onRemoveTag(tag) }}
              className="hover:text-red-400 transition-colors leading-none"
              aria-label={`Retirer le tag ${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!isReadOnly && (
        // « + tag » seulement au survol du bloc : une pastille sur chaque bloc
        // cassait la lecture (retour Brice 17/07)
        <button
          onClick={e => { e.stopPropagation(); onOpenPicker(e.currentTarget.getBoundingClientRect()) }}
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground/50 hover:border-primary/40 hover:text-primary transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Ajouter un tag"
        >
          + tag
        </button>
      )}
      {!isReadOnly && onDelete && (
        // Filet de sécurité : sans cette poubelle, un bloc texte ne contenant
        // qu'une image était indéboulonnable (le clic ouvre la lightbox, jamais
        // l'édition — et « Supprimer » n'existe qu'en mode édition)
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="ml-auto p-0.5 text-muted-foreground/50 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="Supprimer ce bloc"
          aria-label="Supprimer ce bloc"
        >
          <Trash2 size={11} />
        </button>
      )}
      </div>
    </>
  )
}

export default MessageBlock
