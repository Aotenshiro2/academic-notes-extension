import React from 'react'
import { 
  FileText, 
  Video, 
  Globe, 
  BookOpen, 
  File, 
  ExternalLink,
  Calendar,
  Tag,
  Hash,
  MoreVertical,
  Trash2,
  Eye
} from 'lucide-react'
import type { AcademicNote, ContentType } from '@/types/academic'
import storage from '@/lib/storage'
import { sanitizeHtml } from '@/lib/sanitize'

interface NotesListProps {
  notes: AcademicNote[]
  onRefresh: () => void
  onNoteSelect?: (note: AcademicNote) => void
  onLoadMore?: () => void
  hasMoreNotes?: boolean
  isLoadingMore?: boolean
}

function NotesList({ notes, onRefresh, onNoteSelect, onLoadMore, hasMoreNotes, isLoadingMore }: NotesListProps) {
  const getContentTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'article': return <FileText size={16} className="text-primary" />
      case 'research-paper': return <BookOpen size={16} className="text-green-600" />
      case 'video': return <Video size={16} className="text-red-600" />
      case 'pdf': return <File size={16} className="text-orange-600" />
      case 'documentation': return <BookOpen size={16} className="text-purple-600" />
      default: return <Globe size={16} className="text-muted-foreground" />
    }
  }

  const getContentTypeLabel = (type: ContentType) => {
    const labels = {
      article: 'Article',
      'research-paper': 'Recherche',
      video: 'Vidéo',
      pdf: 'PDF',
      documentation: 'Doc',
      webpage: 'Web'
    }
    return labels[type] || 'Web'
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 1) {
      return 'Il y a quelques minutes'
    } else if (diffInHours < 24) {
      return `Il y a ${Math.floor(diffInHours)}h`
    } else if (diffInHours < 168) {
      return `Il y a ${Math.floor(diffInHours / 24)}j`
    } else {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short'
      })
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette note ?')) {
      try {
        await storage.deleteNote(noteId)
        onRefresh()
      } catch (error) {
        console.error('Error deleting note:', error)
      }
    }
  }

  const handleOpenUrl = (url: string) => {
    chrome.tabs.create({ url })
  }

  const truncateContent = (content: string, maxLength: number = 150) => {
    // Extraire le texte du contenu HTML pour la prévisualisation
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = content
    const textContent = tempDiv.textContent || tempDiv.innerText || ''
    
    if (textContent.length <= maxLength) return textContent
    return textContent.substring(0, maxLength).trim() + '...'
  }

  const renderContent = (content: string) => {
    // Si le contenu contient du HTML (images), on le rend avec dangerouslySetInnerHTML
    if (content.includes('<img') || content.includes('</p>') || content.includes('<strong>')) {
      const truncatedContent = content.length > 300 ? content.substring(0, 300) + '...' : content
      return (
        <div
          className="text-sm text-foreground/80 leading-relaxed rich-content-preview"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(truncatedContent) }}
        />
      )
    }
    // Sinon, contenu texte simple
    return (
      <p className="text-sm text-foreground/80 leading-relaxed">
        {truncateContent(content)}
      </p>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <BookOpen size={48} className="text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Aucune note</h3>
          <p className="text-muted-foreground mb-4 max-w-sm">
            Commencez par capturer du contenu depuis n'importe quelle page web.
          </p>
          <div className="text-sm text-muted-foreground/80">
            Utilisez les boutons de capture ci-dessus ou les raccourcis clavier.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="p-4 space-y-3">
        {notes.map((note, index) => (
          <div 
            key={note.id} 
            className="note-card group cursor-pointer animate-fade-in-up" 
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => onNoteSelect?.(note)}
          >
            {/* En-tête de la note */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {getContentTypeIcon(note.type)}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate" title={note.title}>
                    {note.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
                    <span className="bg-muted px-2 py-0.5 rounded-full font-medium">
                      {getContentTypeLabel(note.type)}
                    </span>
                    <span>{note.metadata.domain}</span>
                    <Calendar size={12} />
                    <span>{formatDate(note.timestamp)}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 aoknowledge-transition">
                {onNoteSelect && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onNoteSelect(note)
                    }}
                    className="p-1.5 rounded-md hover:bg-primary/10 aoknowledge-transition"
                    title="Voir/Éditer la note"
                  >
                    <Eye size={14} className="text-primary" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenUrl(note.url)
                  }}
                  className="p-1.5 rounded-md hover:bg-muted aoknowledge-transition"
                  title="Ouvrir la page source"
                >
                  <ExternalLink size={14} className="text-muted-foreground" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteNote(note.id)
                  }}
                  className="p-1.5 rounded-md hover:bg-destructive/10 aoknowledge-transition"
                  title="Supprimer la note"
                >
                  <Trash2 size={14} className="text-destructive" />
                </button>
              </div>
            </div>

            {/* Contenu de la note */}
            <div className="mb-3">
              {renderContent(note.content)}
            </div>

            {/* Résumé AI (si disponible) */}
            {note.summary && (
              <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <p className="text-xs text-primary font-semibold mb-1">Résumé IA</p>
                <p className="text-sm text-foreground/90">
                  {truncateContent(note.summary, 100)}
                </p>
              </div>
            )}

            {/* Tags et concepts */}
            <div className="flex flex-wrap gap-1.5">
              {note.tags.length > 0 && (
                <>
                  {note.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="tag">
                      <Tag size={10} className="mr-1" />
                      {tag}
                    </span>
                  ))}
                  {note.tags.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{note.tags.length - 3} tags
                    </span>
                  )}
                </>
              )}
              
              {note.concepts.length > 0 && (
                <>
                  {note.concepts.slice(0, 2).map((concept, index) => (
                    <span key={index} className="concept-tag">
                      <Hash size={10} className="mr-1" />
                      {concept}
                    </span>
                  ))}
                  {note.concepts.length > 2 && (
                    <span className="text-xs text-muted-foreground">
                      +{note.concepts.length - 2} concepts
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Métadonnées supplémentaires */}
            {(note.metadata.author || note.metadata.publishDate) && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                  {note.metadata.author && (
                    <span>👤 {note.metadata.author}</span>
                  )}
                  {note.metadata.publishDate && (
                    <span>📅 {new Date(note.metadata.publishDate).toLocaleDateString('fr-FR')}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {/* Bouton Charger plus */}
        {onLoadMore && hasMoreNotes && (
          <div className="p-4 text-center border-t border-border">
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore ? 'Chargement...' : 'Charger plus de notes'}
            </button>
          </div>
        )}
        
        {/* Message fin de liste */}
        {!hasMoreNotes && notes.length > 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm border-t border-border">
            📚 Toutes vos notes sont affichées
          </div>
        )}
      </div>
    </div>
  )
}

export default NotesList