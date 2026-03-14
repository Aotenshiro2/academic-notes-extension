import React, { useRef, useEffect, useState } from 'react'
import { X, FileText, Clock, Edit3, Check, XCircle, Trash2, FolderOpen, Folder, FolderPlus, ChevronRight, ChevronDown, GripVertical } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import storage from '@/lib/storage'
import { formatCompactDate } from '@/lib/date-utils'
import type { AcademicNote, NoteFolder } from '@/types/academic'

interface HistoryDropdownProps {
  isOpen: boolean
  onClose: () => void
  notes: AcademicNote[]
  folders: NoteFolder[]
  currentNoteId: string | null
  onSelectNote: (noteId: string) => void
  onNotesUpdate?: () => void
  onFolderCreate: (name: string) => Promise<void>
  onFolderRename: (id: string, name: string) => Promise<void>
  onFolderDelete: (id: string) => Promise<void>
  onMoveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>
}

function HistoryDropdown({
  isOpen,
  onClose,
  notes,
  folders,
  currentNoteId,
  onSelectNote,
  onNotesUpdate,
  onFolderCreate,
  onFolderRename,
  onFolderDelete,
  onMoveNoteToFolder,
}: HistoryDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Note editing / deletion
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Folder states
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')
  const [deleteFolderConfirmId, setDeleteFolderConfirmId] = useState<string | null>(null)
  const [isDeletingFolder, setIsDeletingFolder] = useState(false)

  // Drag-and-drop
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deleteConfirmId || deleteFolderConfirmId) return
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, deleteConfirmId, deleteFolderConfirmId])

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmId(null)
      setDeleteFolderConfirmId(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const truncateTitle = (title: string, maxLength = 50) =>
    title.length > maxLength ? title.slice(0, maxLength) + '…' : title

  // ---- Note CRUD ----
  const startEditingTitle = (note: AcademicNote, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingNoteId(note.id)
    setEditTitle(note.title)
  }

  const saveTitle = async (noteId: string) => {
    if (!editTitle.trim()) return
    const note = notes.find(n => n.id === noteId)
    if (note) {
      await storage.saveNote({ ...note, title: editTitle.trim() })
      setEditingNoteId(null)
      setEditTitle('')
      onNotesUpdate?.()
    }
  }

  const cancelEditing = () => { setEditingNoteId(null); setEditTitle('') }

  const handleTitleKeyDown = (e: React.KeyboardEvent, noteId: string) => {
    if (e.key === 'Enter') { e.preventDefault(); saveTitle(noteId) }
    else if (e.key === 'Escape') cancelEditing()
  }

  const confirmDeleteNote = async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await storage.deleteNote(deleteConfirmId)
      onNotesUpdate?.()
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }

  // ---- Folder CRUD ----
  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const submitNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); setNewFolderName(''); return }
    await onFolderCreate(name)
    setCreatingFolder(false)
    setNewFolderName('')
  }

  const startRenameFolder = (folder: NoteFolder, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingFolderId(folder.id)
    setRenameFolderName(folder.name)
  }

  const submitRenameFolder = async (id: string) => {
    const name = renameFolderName.trim()
    if (name) await onFolderRename(id, name)
    setRenamingFolderId(null)
    setRenameFolderName('')
  }

  const confirmDeleteFolder = async () => {
    if (!deleteFolderConfirmId) return
    setIsDeletingFolder(true)
    try { await onFolderDelete(deleteFolderConfirmId) }
    finally { setIsDeletingFolder(false); setDeleteFolderConfirmId(null) }
  }

  // ---- Drag-and-drop ----
  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    setDraggingNoteId(noteId)
    e.dataTransfer.setData('noteId', noteId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => { setDraggingNoteId(null); setDragOverFolderId(null) }

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }

  const handleDrop = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    const noteId = e.dataTransfer.getData('noteId') || draggingNoteId
    if (noteId) {
      await onMoveNoteToFolder(noteId, folderId)
      setExpandedFolders(prev => new Set([...prev, folderId]))
    }
    setDragOverFolderId(null)
    setDraggingNoteId(null)
  }

  const handleDropOnFree = async (e: React.DragEvent) => {
    e.preventDefault()
    const noteId = e.dataTransfer.getData('noteId') || draggingNoteId
    if (noteId) await onMoveNoteToFolder(noteId, null)
    setDragOverFolderId(null)
    setDraggingNoteId(null)
  }

  // ---- Computed groups ----
  const notesByFolder = (folderId: string) => notes.filter(n => n.folderId === folderId)
  const freeNotes = notes.filter(n => !n.folderId)

  // ---- Note item renderer ----
  const renderNoteItem = (note: AcademicNote) => (
    <button
      key={note.id}
      draggable
      onDragStart={e => handleDragStart(e, note.id)}
      onDragEnd={handleDragEnd}
      onClick={() => {
        if (editingNoteId !== note.id) { onSelectNote(note.id); onClose() }
      }}
      className={`group w-full p-3 text-left rounded-lg transition-colors ${
        note.id === currentNoteId
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-muted/50 border border-transparent'
      } ${draggingNoteId === note.id ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start space-x-2">
        <GripVertical size={12} className="text-muted-foreground/30 mt-1 flex-shrink-0 cursor-grab" />
        <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <FileText size={12} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-1">
            {editingNoteId === note.id ? (
              <>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => handleTitleKeyDown(e, note.id)}
                  onBlur={() => saveTitle(note.id)}
                  className="flex-1 text-sm font-medium bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  autoFocus
                />
                <button onClick={e => { e.stopPropagation(); saveTitle(note.id) }} className="p-1 text-green-600 hover:text-green-700 rounded" title="Sauvegarder" aria-label="Sauvegarder"><Check size={12} /></button>
                <button onClick={e => { e.stopPropagation(); cancelEditing() }} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Annuler" aria-label="Annuler"><XCircle size={12} /></button>
              </>
            ) : (
              <>
                <h3 className="flex-1 font-medium text-foreground text-sm truncate">{truncateTitle(note.title)}</h3>
                <button onClick={e => startEditingTitle(note, e)} className="p-1 text-muted-foreground hover:text-primary rounded opacity-0 group-hover:opacity-100" title="Modifier le titre" aria-label="Modifier le titre"><Edit3 size={12} /></button>
                <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(note.id) }} className="p-1 text-muted-foreground hover:text-destructive rounded opacity-0 group-hover:opacity-100" title="Supprimer" aria-label="Supprimer la note"><Trash2 size={12} /></button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCompactDate(note.timestamp)} • {note.metadata.domain}
          </p>
          {note.tags.length > 0 && (
            <div className="flex space-x-1 mt-1.5">
              {note.tags.slice(0, 2).map((tag, i) => (
                <span key={i} className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded">{tag}</span>
              ))}
              {note.tags.length > 2 && <span className="text-xs text-muted-foreground">+{note.tags.length - 2}</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  )

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />

      <div
        ref={dropdownRef}
        className="absolute top-0 right-0 w-80 h-full bg-background border-l border-border shadow-xl animate-slide-in flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center space-x-2">
            <Clock size={20} className="text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Historique des notes</h2>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" aria-label="Fermer l'historique">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <FileText size={48} className="text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Aucune note trouvée</p>
              <p className="text-sm text-muted-foreground/80 mt-1">Créez votre première note pour commencer</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">

              {/* ── Section Dossiers ── */}
              {(folders.length > 0 || creatingFolder) && (
                <div className="mb-1">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Dossiers</span>
                    <button
                      onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                      title="Nouveau dossier"
                      aria-label="Nouveau dossier"
                    >
                      <FolderPlus size={14} />
                    </button>
                  </div>

                  {folders.map(folder => {
                    const folderNotes = notesByFolder(folder.id)
                    const isExpanded = expandedFolders.has(folder.id)
                    const isDragOver = dragOverFolderId === folder.id

                    return (
                      <div key={folder.id}>
                        {/* Folder header */}
                        <div
                          className={`group flex items-center gap-1 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                            isDragOver
                              ? 'ring-2 ring-primary/50 bg-primary/5'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => toggleFolder(folder.id)}
                          onDragOver={e => handleDragOver(e, folder.id)}
                          onDragLeave={() => setDragOverFolderId(null)}
                          onDrop={e => handleDrop(e, folder.id)}
                        >
                          <span className="text-muted-foreground flex-shrink-0">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          {isExpanded
                            ? <FolderOpen size={14} className="text-yellow-500 flex-shrink-0" />
                            : <Folder size={14} className="text-yellow-500 flex-shrink-0" />
                          }

                          {renamingFolderId === folder.id ? (
                            <>
                              <input
                                type="text"
                                value={renameFolderName}
                                onChange={e => setRenameFolderName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); submitRenameFolder(folder.id) }
                                  else if (e.key === 'Escape') { setRenamingFolderId(null) }
                                }}
                                onBlur={() => submitRenameFolder(folder.id)}
                                className="flex-1 text-sm font-medium bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0"
                                autoFocus
                                onClick={e => e.stopPropagation()}
                              />
                              <button onClick={e => { e.stopPropagation(); submitRenameFolder(folder.id) }} className="p-1 text-green-600 hover:text-green-700 rounded flex-shrink-0" aria-label="Valider"><Check size={12} /></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm font-medium text-foreground truncate">{folder.name}</span>
                              <span className="text-xs text-muted-foreground flex-shrink-0">{folderNotes.length}</span>
                              <button
                                onClick={e => startRenameFolder(folder, e)}
                                className="p-1 text-muted-foreground hover:text-primary rounded opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                                title="Renommer"
                                aria-label="Renommer le dossier"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteFolderConfirmId(folder.id) }}
                                className="p-1 text-muted-foreground hover:text-destructive rounded opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                                title="Supprimer le dossier"
                                aria-label="Supprimer le dossier"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>

                        {/* Notes du dossier */}
                        {isExpanded && (
                          <div className="ml-4 space-y-0.5 mt-0.5">
                            {folderNotes.length === 0 ? (
                              <p className="text-xs text-muted-foreground/60 px-3 py-2 italic">Dossier vide</p>
                            ) : (
                              folderNotes.map(renderNoteItem)
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Création inline dossier */}
                  {creatingFolder && (
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <Folder size={14} className="text-yellow-500 flex-shrink-0" />
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); submitNewFolder() }
                          else if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                        }}
                        onBlur={submitNewFolder}
                        placeholder="Nom du dossier…"
                        className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Bouton créer dossier (quand aucun dossier et pas en train de créer) */}
              {folders.length === 0 && !creatingFolder && (
                <button
                  onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors border border-dashed border-border/50 mb-1"
                >
                  <FolderPlus size={14} />
                  Nouveau dossier
                </button>
              )}

              {/* ── Section Notes libres ── */}
              {freeNotes.length > 0 && (
                <div>
                  {folders.length > 0 && (
                    <div
                      className="flex items-center justify-between px-2 py-1.5 mt-1"
                      onDragOver={e => { e.preventDefault(); setDragOverFolderId('__free__') }}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={handleDropOnFree}
                    >
                      <span className={`text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                        dragOverFolderId === '__free__' ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        Notes
                      </span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {freeNotes.map(renderNoteItem)}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">
            {notes.length} note{notes.length > 1 ? 's' : ''} au total
            {folders.length > 0 && ` · ${folders.length} dossier${folders.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Confirm delete note */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onConfirm={confirmDeleteNote}
        onCancel={() => setDeleteConfirmId(null)}
        title="Supprimer la note"
        message="Cette action est irréversible."
        isLoading={isDeleting}
      />

      {/* Confirm delete folder */}
      <ConfirmDialog
        isOpen={!!deleteFolderConfirmId}
        onConfirm={confirmDeleteFolder}
        onCancel={() => setDeleteFolderConfirmId(null)}
        title="Supprimer le dossier"
        message="Le dossier sera supprimé. Les notes qu'il contient deviendront libres."
        isLoading={isDeletingFolder}
      />
    </div>
  )
}

export default HistoryDropdown
