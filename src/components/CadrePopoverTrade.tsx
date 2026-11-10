import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Le cadre des panneaux d'un trade de la note (1.8.16) : « Prix » et le lien
 * avec Pilotage. Sorti de TradePrixPopover (1.8.12) pour que les deux
 * panneaux se placent et se ferment pareil : sous la pastille, au-dessus
 * quand la place manque, jamais hors de l'écran ; Échap et clic dehors
 * ferment, sauf quand une boîte est ouverte par-dessus (`ecoute` à false).
 */

interface CadrePopoverTradeProps {
  position: { top: number; bottom: number; left: number }
  ariaLabel: string
  onClose: () => void
  /** false : une boîte est ouverte par-dessus (l'import), Échap et clic dehors ne ferment pas. */
  ecoute?: boolean
  largeurMax?: number
  children: React.ReactNode
}

function CadrePopoverTrade({ position, ariaLabel, onClose, ecoute = true, largeurMax = 340, children }: CadrePopoverTradeProps) {
  const [hauteur, setHauteur] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ecoute) return
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
  }, [onClose, ecoute])

  // La hauteur réelle, pour ne jamais déborder en bas de l'écran.
  useLayoutEffect(() => {
    const el = popupRef.current
    if (!el) return
    const mesurer = () => setHauteur(el.scrollHeight)
    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(el)
    for (const enfant of Array.from(el.children)) observateur.observe(enfant)
    return () => observateur.disconnect()
  }, [])

  const largeur = Math.min(largeurMax, window.innerWidth - 16)
  const hauteurMax = window.innerHeight - 16
  const h = Math.min(hauteur, hauteurMax)
  let top = position.bottom + 4
  if (top + h > window.innerHeight - 8) {
    const auDessus = position.top - 4 - h
    top = auDessus >= 8 ? auDessus : Math.max(8, window.innerHeight - 8 - h)
  }
  const style: React.CSSProperties = {
    position: 'fixed',
    top,
    left: Math.max(8, Math.min(position.left - largeur / 2, window.innerWidth - largeur - 8)),
    width: largeur,
    maxHeight: hauteurMax,
    overflowY: 'auto',
    zIndex: 9999,
    visibility: hauteur ? 'visible' : 'hidden',
  }

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-background border border-border rounded-xl shadow-lg p-3 space-y-2.5"
      onMouseDown={e => e.stopPropagation()}
      role="dialog"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  )
}

export default CadrePopoverTrade
