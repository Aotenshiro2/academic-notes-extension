import React, { useCallback, useEffect } from 'react'
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt?: string
  onClose: () => void
}

function ImageLightbox({ src, alt = 'Image', onClose }: ImageLightboxProps) {
  const [scale, setScale] = React.useState(1)

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
  }, [onClose])

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
    link.href = src
    link.download = `image-${Date.now()}.png`
    link.click()
  }, [src])

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
        >
          <ZoomIn size={20} />
        </button>
        <div className="w-px h-6 bg-white/20 mx-1" />
        <button
          onClick={handleDownload}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          title="Download"
        >
          <Download size={20} />
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          title="Close (Esc)"
        >
          <X size={20} />
        </button>
      </div>

      {/* Image container */}
      <div className="max-w-[90vw] max-h-[90vh] overflow-auto">
        <img
          src={src}
          alt={alt}
          className="transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center'
          }}
          draggable={false}
        />
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
        Esc pour fermer • +/- pour zoomer • Clic extérieur pour fermer
      </div>
    </div>
  )
}

export default ImageLightbox
