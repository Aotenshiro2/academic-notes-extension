import React, { useRef, useEffect, useState } from 'react'
import { X, FileText, Clock, Edit3, Check, XCircle, Trash2 } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import storage from '@/lib/storage'
import { formatCompactDate } from '@/lib/date-utils'
import type { AcademicNote } from '@/types/academic'

interface HistoryDropdownProps {
  isOpen: boolean
  onClose: () => void
  notes: AcademicNote[]
  currentNoteId: string | null
  onSelectNote: (noteId: string) => void
  onNotesUpdate?: () => void
}

function HistoryDropdown({ isOpen, onClose, notes, currentNoteId, onSelectNote, onNotesUpdate }: HistoryDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deleteConfirmId) return
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose, deleteConfirmId])

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmId(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const truncateTitle = (title: string, maxLength = 50) => {
    return title.length > maxLength ? title.slice(0, maxLength) + '...' : title
  }

  // Commencer l'édition d'un titre
  const startEditingTitle = (note: AcademicNote, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingNoteId(note.id)
    setEditTitle(note.title)
  }

  // Sauvegarder le titre modifié
  const saveTitle = async (noteId: string) => {
    if (!editTitle.trim()) return
    
    try {
      const note = notes.find(n => n.id === noteId)
      if (note) {
        const updatedNote = { ...note, title: editTitle.trim() }
        await storage.saveNote(updatedNote)
        setEditingNoteId(null)
        setEditTitle('')
        onNotesUpdate?.()
      }
    } catch (error) {
      console.error('Error saving title:', error)
    }
  }

  // Annuler l'édition
  const cancelEditing = () => {
    setEditingNoteId(null)
    setEditTitle('')
  }

  // Gestion des touches pour l'édition
  const handleTitleKeyDown = (e: React.KeyboardEvent, noteId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle(noteId)
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  const handleDeleteNote = (noteId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setDeleteConfirmId(noteId)
  }

  const confirmDeleteNote = async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await storage.deleteNote(deleteConfirmId)
      onNotesUpdate?.()
    } catch (error) {
      console.error('Error deleting note:', error)
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      
      {/* Dropdown panel */}
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
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            aria-label="Fermer l'historique"
          >
            <X size={18} />
          </button>
        </div>

        {/* Liste des notes */}
        <div className="flex-1 overflow-y-auto p-2">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText size={48} className="text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Aucune note trouvée</p>
              <p className="text-sm text-muted-foreground/80 mt-1">
                Créez votre première note pour commencer
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => {
                      if (editingNoteId !== note.id) {
                        onSelectNote(note.id)
                        onClose()
                      }
                    }}
                    className={`group w-full p-3 text-left rounded-lg transition-colors ${
                      note.id === currentNoteId
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-muted/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileText size={14} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          {editingNoteId === note.id ? (
                            <>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => handleTitleKeyDown(e, note.id)}
                                onBlur={() => saveTitle(note.id)}
                                className="flex-1 text-sm font-medium bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                autoFocus
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); saveTitle(note.id); }}
                                className="p-1 text-green-600 hover:text-green-700 rounded transition-colors"
                                title="Sauvegarder"
                                aria-label="Sauvegarder le titre"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                                title="Annuler"
                                aria-label="Annuler la modification"
                              >
                                <XCircle size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <h3 className="flex-1 font-medium text-foreground text-sm truncate">
                                {truncateTitle(note.title)}
                              </h3>
                              <button
                                onClick={(e) => startEditingTitle(note, e)}
                                className="p-1 text-muted-foreground hover:text-primary rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="Modifier le titre"
                                aria-label="Modifier le titre"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteNote(note.id, e)}
                                className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="Supprimer la note"
                                aria-label="Supprimer la note"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatCompactDate(note.timestamp)} • {note.metadata.domain}
                        </p>
                        {note.tags.length > 0 && (
                          <div className="flex space-x-1 mt-2">
                            {note.tags.slice(0, 2).map((tag, index) => (
                              <span 
                                key={index}
                                className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {note.tags.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{note.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Footer avec statistiques */}
        <div className="border-t border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">
            {notes.length} note{notes.length > 1 ? 's' : ''} au total
          </p>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onConfirm={confirmDeleteNote}
        onCancel={() => setDeleteConfirmId(null)}
        title="Supprimer la note"
        message="Cette action est irréversible."
        isLoading={isDeleting}
      />
    </div>
  )
}

export default HistoryDropdown