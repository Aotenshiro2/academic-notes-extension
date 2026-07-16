import React, { useCallback, useEffect } from 'react'
import { X, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt?: string
  onClose: () => void
  images?: string[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

function ImageLightbox({
  src,
  alt = 'Image',
  onClose,
  images,
  currentIndex = 0,
  onNavigate
}: ImageLightboxProps) {
  const [scale, setScale] = React.useState(1)

  const hasNavigation = images && images.length > 1 && onNavigate
  const displaySrc = images ? images[currentIndex] : src

  const goTo = useCallback((index: number) => {
    if (!images || !onNavigate) return
    const len = images.length
    onNavigate(((index % len) + len) % len) // circular navigation
    setScale(1) // reset zoom on navigate
  }, [images, onNavigate])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
    if (e.key === '+' || e.key === '=') {
      setScale(s => Math.min(s + 0.25, 3))
    }
    if (e.key === '-') {
      setScale(s => Math.max(s - 0.25, 0.5))
    }
    if (hasNavigation) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(currentIndex - 1)
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(currentIndex + 1)
      }
    }
  }, [onClose, hasNavigation, currentIndex, goTo])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const handleDownload = useCallback(() => {
    const link = document.createElement('a')
    link.href = displaySrc
    link.download = `image-${Date.now()}.png`
    link.click()
  }, [displaySrc])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Controls bar */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          title="Zoom out (-)"
          aria-label="Zoom arrière"
        >
          <ZoomOut size={20} />
        </button>
        <span className="px-2 text-white text-sm min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.min(s + 0.25, 3))}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          title="Zoom in (+)"
          aria-label="Zoom avant"
        >
          <ZoomIn size={20} />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          onClick={handleDownload}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          title="Download"
          aria-label="Télécharger l'image"
        >
          <Download size={20} />
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          title="Close (Esc)"
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation arrows */}
      {hasNavigation && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            aria-label="Image précédente"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            aria-label="Image suivante"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Image container — défile quand l'image dépasse (permet de se déplacer au zoom) */}
      <div className="overflow-auto" style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
        {/* Le zoom vit sur le WRAPPER, pas sur l'image. Sur l'image, le `max-width: 100%`
            (reset Tailwind) la plafonnait à la largeur du conteneur : au-delà d'environ
            125% le zoom n'avait plus aucun effet. Ici l'image est bornée en unités
            viewport (elle tient à 100%), et le wrapper zoomé multiplie vraiment le rendu. */}
        <div style={{ zoom: scale }}>
          <img
            src={displaySrc}
            alt={alt}
            className="block"
            style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto', height: 'auto' }}
            draggable={false}
          />
        </div>
      </div>

      {/* Footer: counter + instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        {hasNavigation && (
          <span className="text-white/80 text-sm font-medium">
            {currentIndex + 1} / {images.length}
          </span>
        )}
        <span className="text-white/50 text-xs">
          Esc pour fermer • +/- pour zoomer{hasNavigation ? ' • ←/→ pour naviguer' : ''} • Clic extérieur pour fermer
        </span>
      </div>
    </div>
  )
}

export default ImageLightbox
