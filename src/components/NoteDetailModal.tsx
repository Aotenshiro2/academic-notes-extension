import React, { useState, useEffect } from 'react'
import { X, Save, Edit3, ExternalLink, Calendar, Tag, Hash, Globe, Trash2 } from 'lucide-react'
import type { AcademicNote, ContentType } from '@/types/academic'
import SimpleRichEditor from './SimpleRichEditor'
import storage from '@/lib/storage'
import { sanitizeHtml } from '@/lib/sanitize'

interface NoteDetailModalProps {
  note: AcademicNote | null
  isOpen: boolean
  onClose: () => void
  onSave: (updatedNote: AcademicNote) => void
  onDelete: (noteId: string) => void
  onInsertScreenshot?: () => Promise<string | null>
}

function NoteDetailModal({
  note,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onInsertScreenshot
}: NoteDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedContent, setEditedContent] = useState('')
  const [editedTags, setEditedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Réinitialiser les données quand la note change
  useEffect(() => {
    if (note) {
      setEditedTitle(note.title)
      setEditedContent(note.content)
      setEditedTags([...note.tags])
      setIsEditing(false)
    }
  }, [note])

  const getContentTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'article': return <Globe size={16} className="text-blue-600" />
      case 'research-paper': return <Globe size={16} className="text-green-600" />
      case 'video': return <Globe size={16} className="text-red-600" />
      case 'pdf': return <Globe size={16} className="text-orange-600" />
      case 'documentation': return <Globe size={16} className="text-purple-600" />
      default: return <Globe size={16} className="text-gray-600" />
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleSave = async () => {
    if (!note) return

    try {
      setIsSaving(true)
      
      const updatedNote: AcademicNote = {
        ...note,
        title: editedTitle.trim() || 'Note sans titre',
        content: editedContent.trim(),
        tags: editedTags.filter(tag => tag.trim() !== '')
      }

      await storage.saveNote(updatedNote)
      onSave(updatedNote)
      setIsEditing(false)
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Erreur lors de la sauvegarde de la note')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!note) return
    
    if (confirm('Êtes-vous sûr de vouloir supprimer cette note définitivement ?')) {
      try {
        await storage.deleteNote(note.id)
        onDelete(note.id)
        onClose()
      } catch (error) {
        console.error('Erreur lors de la suppression:', error)
        alert('Erreur lors de la suppression de la note')
      }
    }
  }

  const handleAddTag = () => {
    if (newTag.trim() && !editedTags.includes(newTag.trim())) {
      setEditedTags([...editedTags, newTag.trim()])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setEditedTags(editedTags.filter(tag => tag !== tagToRemove))
  }

  const handleOpenUrl = () => {
    if (note?.url) {
      chrome.tabs.create({ url: note.url })
    }
  }

  if (!isOpen || !note) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-3">
            {getContentTypeIcon(note.type)}
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                  placeholder="Titre de la note"
                />
              ) : (
                <h2 className="text-lg font-semibold text-gray-900">{note.title}</h2>
              )}
              <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                <span>{note.metadata.domain}</span>
                <Calendar size={12} />
                <span>{formatDate(note.timestamp)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Actions */}
            {note.url && (
              <button
                onClick={handleOpenUrl}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Ouvrir la page source"
              >
                <ExternalLink size={16} />
              </button>
            )}
            
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditedTitle(note.title)
                    setEditedContent(note.content)
                    setEditedTags([...note.tags])
                  }}
                  className="px-3 py-1.5 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  title="Éditer cette note"
                >
                  <Edit3 size={14} />
                  <span>Éditer</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  title="Supprimer cette note"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contenu */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6">
            {/* Contenu de la note */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Contenu</h3>
              {isEditing ? (
                <SimpleRichEditor
                  value={editedContent}
                  onChange={setEditedContent}
                  placeholder="Contenu de la note..."
                  onInsertScreenshot={onInsertScreenshot}
                  className="border border-gray-200 rounded-lg"
                />
              ) : (
                <div className="prose max-w-none">
                  {note.content.includes('<img') || note.content.includes('<p>') || note.content.includes('<strong>') ? (
                    <div
                      className="text-gray-700 leading-relaxed rich-content-preview"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }}
                    />
                  ) : (
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Tags</h3>
              {isEditing ? (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Ajouter un tag"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    >
                      Ajouter
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editedTags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                      >
                        <Tag size={12} />
                        <span>{tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {note.tags.length > 0 ? (
                    note.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                      >
                        <Tag size={12} />
                        <span>{tag}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">Aucun tag</span>
                  )}
                </div>
              )}
            </div>

            {/* Concepts */}
            {note.concepts.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Concepts</h3>
                <div className="flex flex-wrap gap-2">
                  {note.concepts.map((concept, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center space-x-1 px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full"
                    >
                      <Hash size={12} />
                      <span>{concept}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Résumé AI */}
            {note.summary && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Résumé IA</h3>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-blue-800 text-sm leading-relaxed">{note.summary}</p>
                </div>
              </div>
            )}

            {/* Métadonnées */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Informations</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Type :</span> {note.type}
                  </div>
                  <div>
                    <span className="font-medium">Domaine :</span> {note.metadata.domain}
                  </div>
                  {note.metadata.author && (
                    <div>
                      <span className="font-medium">Auteur :</span> {note.metadata.author}
                    </div>
                  )}
                  {note.metadata.publishDate && (
                    <div>
                      <span className="font-medium">Publié :</span> {new Date(note.metadata.publishDate).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NoteDetailModal