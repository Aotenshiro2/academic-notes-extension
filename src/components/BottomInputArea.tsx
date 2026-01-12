import React, { useState } from 'react'
import { Send, Camera, Paperclip, Smile } from 'lucide-react'

interface BottomInputAreaProps {
  onAddContent: (content: string, noteId: string | null) => void
  currentNoteId: string | null
}

function BottomInputArea({ onAddContent, currentNoteId }: BottomInputAreaProps) {
  const [inputValue, setInputValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      onAddContent(inputValue, currentNoteId)
      setInputValue('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="border-t border-border bg-background p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Zone de saisie principale */}
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentNoteId ? "Ajouter du contenu à cette note..." : "Commencer une nouvelle note de trading..."}
            className="w-full min-h-[60px] max-h-[200px] px-4 py-3 pr-12 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            rows={1}
            style={{
              height: 'auto',
              minHeight: '60px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 200) + 'px'
            }}
          />
          
          {/* Bouton d'envoi */}
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute bottom-2 right-2 w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Actions rapides */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Ajouter une capture d'écran"
            >
              <Camera size={18} />
            </button>
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Attacher un fichier"
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Templates trading"
            >
              <Smile size={18} />
            </button>
          </div>
          
          <div className="text-xs text-muted-foreground">
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">⏎</kbd> pour envoyer, 
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs ml-1">⇧⏎</kbd> pour nouvelle ligne
          </div>
        </div>
      </form>
    </div>
  )
}

export default BottomInputArea