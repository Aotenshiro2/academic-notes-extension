import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Moon } from 'lucide-react'
import type { TradeCooldown } from '@/types/academic'
import { t, type CleI18n } from '@/lib/i18n'

interface CooldownPopoverProps {
  position: { top: number; bottom: number; left: number }
  existing?: TradeCooldown
  onSave: (cooldown: TradeCooldown) => void
  onClose: () => void
}

// Clés du dictionnaire, traduites au rendu.
const FIELDS: { key: 'emotion' | 'error' | 'lesson'; label: CleI18n; hint: CleI18n }[] = [
  { key: 'emotion', label: 'cooldown.emotion', hint: 'cooldown.emotionAide' },
  { key: 'error', label: 'cooldown.erreur', hint: 'cooldown.erreurAide' },
  { key: 'lesson', label: 'cooldown.lecon', hint: 'cooldown.leconAide' },
]

const POPUP_WIDTH = 272
const POPUP_HEIGHT = 260

function CooldownPopover({ position, existing, onSave, onClose }: CooldownPopoverProps) {
  const [values, setValues] = useState<TradeCooldown>({
    emotion: existing?.emotion ?? '',
    error: existing?.error ?? '',
    lesson: existing?.lesson ?? '',
  })
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  const canSave = !!(values.emotion?.trim() || values.error?.trim() || values.lesson?.trim())

  const handleSave = useCallback(() => {
    onSave({
      emotion: values.emotion?.trim() || undefined,
      error: values.error?.trim() || undefined,
      lesson: values.lesson?.trim() || undefined,
    })
    onClose()
  }, [values, onSave, onClose])

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
      <div className="flex items-center gap-1.5">
        <Moon size={13} className="text-amber-500" />
        <span className="text-xs font-medium text-foreground">{t('trade.cooldown')}</span>
      </div>
      {FIELDS.map(f => (
        <div key={f.key}>
          <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{t(f.label)}</div>
          <textarea
            value={values[f.key] ?? ''}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            placeholder={t(f.hint)}
            rows={1}
            className="w-full px-2.5 py-1.5 text-xs bg-muted/40 border border-border rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50 placeholder:text-muted-foreground/50"
            style={{ minHeight: 30 }}
          />
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-muted-foreground/60">{t('cooldown.pasLaNote')}</span>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('cooldown.enregistrer')}
        </button>
      </div>
    </div>
  )
}

export default CooldownPopover
