import React, { useState } from 'react'
import { X, Save, Tag } from 'lucide-react'
import type { Screenshot } from '@/types/academic'
import SimpleRichEditor from './SimpleRichEditor'

interface NewNoteFormProps {
  onSave: (title: string, content: string, tags: string[]) => void
  onCancel: () => void
}

function NewNoteForm({ onSave, onCancel }: NewNoteFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleInsertScreenshot = async (): Promise<string | null> => {
    try {
      // Envoyer un message au service worker pour capturer l'écran
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        options: { format: 'png', quality: 85 }
      })
      
      if (response?.success && response?.dataUrl) {
        return response.dataUrl
      }
      return null
    } catch (error) {
      console.error('Error capturing screenshot:', error)
      return null
    }
  }


  const handleSave = () => {
    if (content.trim()) {
      onSave(title.trim(), content.trim(), tags)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave()
    }
  }

  return (
    <div className="px-4 py-3 border-b bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Nouvelle note</h3>
        <button
          onClick={onCancel}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Annuler"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Titre */}
        <div>
          <input
            type="text"
            placeholder="Titre de la note (optionnel)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Contenu */}
        <div>
          <SimpleRichEditor
            value={content}
            onChange={setContent}
            placeholder="Écrivez votre note ici..."
            onInsertScreenshot={handleInsertScreenshot}
            className="border border-gray-200 rounded-lg focus-within:border-blue-500"
          />
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <Tag size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Ajouter un tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              className="flex-1 p-1 text-sm border border-gray-200 rounded focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleAddTag}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Ajouter
            </button>
          </div>
          
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                >
                  <span>{tag}</span>
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>


        {/* Boutons d'action */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-gray-500">
            Ctrl+Enter pour sauvegarder
          </div>
          <div className="flex space-x-2">
            <button
              onClick={onCancel}
              className="px-3 py-1 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!content.trim()}
              className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} />
              <span>Sauvegarder</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NewNoteForm