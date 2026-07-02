import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { Annotation, AnnotationGrade, AnnotationCause } from '@/types/academic'

interface NotationPopoverProps {
  position: { top: number; bottom: number; left: number }
  existing?: Annotation
  onSave: (grade: AnnotationGrade, phrase: string, cause: AnnotationCause | null) => void
  onClose: () => void
}

const GRADES: { value: AnnotationGrade; hint: string; selectedClass: string }[] = [
  { value: 'A', hint: 'je le reprendrais sans hésiter', selectedClass: 'border-green-600 bg-green-500/15 text-green-600 dark:text-green-400' },
  { value: 'B', hint: 'ça a marché mais c\'était flou', selectedClass: 'border-amber-600 bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { value: 'C', hint: 'forcé, émotionnel', selectedClass: 'border-red-600 bg-red-500/15 text-red-600 dark:text-red-400' },
]

const CAUSES: { value: AnnotationCause; label: string }[] = [
  { value: 'technique', label: 'technique' },
  { value: 'connaissance', label: 'connaissance' },
  { value: 'emotionnel', label: 'émotionnel' },
]

const POPUP_WIDTH = 264
const POPUP_HEIGHT = 240

function NotationPopover({ position, existing, onSave, onClose }: NotationPopoverProps) {
  const [grade, setGrade] = useState<AnnotationGrade | null>(existing?.grade ?? null)
  const [phrase, setPhrase] = useState(existing?.phrase ?? '')
  const [cause, setCause] = useState<AnnotationCause | null>(existing?.causeCategory ?? null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const canSave = grade !== null && phrase.trim().length > 0

  const handleSave = useCallback(() => {
    if (!grade || !phrase.trim()) return
    onSave(grade, phrase.trim(), cause)
    onClose()
  }, [grade, phrase, cause, onSave, onClose])

  const handleSelectGrade = (g: AnnotationGrade) => {
    setGrade(g)
    // 2 clics : le grade choisi, focus direct sur la phrase
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Position — sous l'ancre si la place le permet, au-dessus sinon
  const spaceBelow = window.innerHeight - position.bottom - 8
  const showAbove = spaceBelow < POPUP_HEIGHT && position.top > POPUP_HEIGHT
  const style: React.CSSProperties = {
    position: 'fixed',
    top: showAbove ? Math.max(8, position.top - 4) : position.bottom + 4,
    left: Math.max(8, Math.min(position.left - POPUP_WIDTH / 2, window.innerWidth - POPUP_WIDTH - 8)),
    transform: showAbove ? 'translateY(-100%)' : 'none',
    zIndex: 9999,
    width: POPUP_WIDTH,
  }

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-background border border-border rounded-xl shadow-lg p-3 space-y-2"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Grades A / B / C */}
      <div className="flex gap-2">
        {GRADES.map(g => (
          <button
            key={g.value}
            onClick={() => handleSelectGrade(g.value)}
            className={`flex-1 h-10 rounded-lg border text-base font-medium transition-colors ${
              grade === g.value
                ? g.selectedClass
                : 'border-border text-muted-foreground hover:border-border/80 hover:bg-muted/40'
            }`}
            aria-label={`Grade ${g.value} — ${g.hint}`}
          >
            {g.value}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground/70 px-0.5">
        {grade
          ? GRADES.find(g => g.value === grade)?.hint
          : 'A — sans hésiter · B — flou · C — forcé'}
      </p>

      {/* La phrase — l'exercice canonique */}
      <input
        ref={inputRef}
        value={phrase}
        onChange={e => setPhrase(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); handleSave() }
        }}
        placeholder="Pourquoi cette note ? (une phrase)"
        className="w-full px-2.5 py-1.5 text-xs bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50 placeholder:text-muted-foreground/50"
      />

      {/* Cause (optionnel) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CAUSES.map(c => (
          <button
            key={c.value}
            onClick={() => setCause(cause === c.value ? null : c.value)}
            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
              cause === c.value
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground/70 hover:text-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Enregistrer */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-muted-foreground/60">Relecture dans 14 j</span>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Noter
        </button>
      </div>
    </div>
  )
}

export default NotationPopover
