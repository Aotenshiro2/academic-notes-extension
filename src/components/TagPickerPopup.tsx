import React, { useState, useEffect, useRef, useCallback } from 'react'
import { fetchUserTags } from '@/lib/sync'
import type { UserTag } from '@/lib/sync'

interface TagPickerPopupProps {
  position: { top: number; bottom: number; left: number }
  currentTags: string[]
  onAdd: (tagName: string) => void
  onRemove: (tagName: string) => void
  onClose: () => void
}

function TagPickerPopup({ position, currentTags, onAdd, onRemove, onClose }: TagPickerPopupProps) {
  const [allTags, setAllTags] = useState<UserTag[]>([])
  const [inputValue, setInputValue] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchUserTags().then(setAllTags)
    inputRef.current?.focus()
  }, [])

  // Close on Escape or click outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  const handleToggleTag = useCallback((tagName: string) => {
    if (currentTags.includes(tagName)) {
      onRemove(tagName)
    } else {
      onAdd(tagName)
    }
  }, [currentTags, onAdd, onRemove])

  const handleCreateTag = useCallback(() => {
    const name = inputValue.trim().toLowerCase().replace(/^#/, '')
    if (!name) return
    if (!currentTags.includes(name)) {
      onAdd(name)
    }
    setInputValue('')
  }, [inputValue, currentTags, onAdd])

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateTag()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const filteredTags = allTags.filter(t =>
    !inputValue || t.name.toLowerCase().includes(inputValue.toLowerCase())
  )
  const canCreate = inputValue.trim() && !allTags.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase())

  // Compute position — open below button if room, above if not
  const POPUP_HEIGHT = 240
  const spaceBelow = window.innerHeight - position.bottom - 8
  const showAbove = spaceBelow < POPUP_HEIGHT && position.top > POPUP_HEIGHT
  const style: React.CSSProperties = {
    position: 'fixed',
    top: showAbove
      ? Math.max(8, position.top - 4)
      : position.bottom + 4,
    left: Math.max(8, Math.min(position.left - 120, window.innerWidth - 248 - 8)),
    transform: showAbove ? 'translateY(-100%)' : 'none',
    zIndex: 9999,
    width: 240,
  }

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-background border border-border rounded-xl shadow-lg overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Search / create input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Rechercher ou créer un tag..."
          className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Existing tags list */}
      <div className="max-h-44 overflow-y-auto py-1">
        {filteredTags.length === 0 && !canCreate && (
          <p className="px-3 py-2 text-xs text-muted-foreground/60">Aucun tag trouvé</p>
        )}
        {filteredTags.map(tag => {
          const isActive = currentTags.includes(tag.name)
          return (
            <button
              key={tag.id}
              onClick={() => handleToggleTag(tag.name)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left ${isActive ? 'bg-muted/30' : ''}`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color ?? '#3b82f6' }}
              />
              <span className={`flex-1 truncate ${isActive ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
                {tag.name}
              </span>
              {isActive && (
                <span className="text-[9px] text-muted-foreground">✓</span>
              )}
            </button>
          )
        })}

        {/* Create new tag option */}
        {canCreate && (
          <button
            onClick={handleCreateTag}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left border-t border-border/30 mt-1"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-foreground/60">Créer</span>
            <span className="font-medium text-foreground truncate">"{inputValue.trim()}"</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default TagPickerPopup
