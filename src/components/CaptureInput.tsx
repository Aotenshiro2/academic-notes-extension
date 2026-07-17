import React, { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Plus, ArrowUp, ImageIcon, Camera, Monitor, Sparkles, Loader2, Crosshair } from 'lucide-react'
import { compressImage, COMPRESSION_PRESETS, estimateImageSize, formatFileSize } from '@/lib/image-utils'

export interface CaptureInputHandle {
  focus: () => void
  scrollIntoView: (options?: ScrollIntoViewOptions) => void
  getContent: () => string
}

interface CaptureInputProps {
  value: string
  onChange: (content: string) => void
  placeholder?: string
  onInsertScreenshot?: () => Promise<string | null>
  onInsertExternalScreenshot?: () => Promise<string | null>
  /** Note ouverte : l'image (+ sa métadonnée date/titre/URL) part DIRECTEMENT
   *  dans la note en blocs image+meta — plus rien ne transite par l'éditeur.
   *  Retourne false si aucune note n'est ouverte → fallback insertion éditeur. */
  onScreenshotToNote?: (dataUrl: string, metaText: string) => Promise<boolean>
  onSubmit?: (content: string) => void
  onSmartCapture?: () => void
  isSmartCapturing?: boolean
  onStartTrade?: () => void
  hasActiveTrade?: boolean
  className?: string
  currentPageInfo?: {
    url: string
    title: string
  }
}

const CaptureInput = forwardRef<CaptureInputHandle, CaptureInputProps>(function CaptureInput({
  value,
  onChange,
  placeholder = 'Écrivez ou capturez...',
  onInsertScreenshot,
  onInsertExternalScreenshot,
  onScreenshotToNote,
  onSubmit,
  onSmartCapture,
  isSmartCapturing = false,
  onStartTrade,
  hasActiveTrade = false,
  currentPageInfo,
  className = ''
}, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const [isCapturingExternal, setIsCapturingExternal] = useState(false)

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      let attempts = 0
      const interval = setInterval(() => {
        attempts++
        if (document.activeElement === el || attempts > 10) {
          clearInterval(interval)
          return
        }
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
    },
    scrollIntoView: (options?: ScrollIntoViewOptions) => {
      editorRef.current?.scrollIntoView(options || { behavior: 'smooth', block: 'nearest' })
    },
    getContent: () => {
      return editorRef.current?.innerHTML || ''
    }
  }))

  // Sync content with value prop
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  // Close menu on click outside
  useEffect(() => {
    if (!isMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isMenuOpen])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      if (html !== value) {
        onChange(html)
      }
    }
  }, [value, onChange])

  const hasContent = useMemo(() => {
    const stripped = value.replace(/<[^>]*>/g, '').trim()
    const hasImages = value.includes('<img')
    return stripped.length > 0 || hasImages
  }, [value])

  // Image insertion at cursor
  const insertImageAtCursor = useCallback(async (dataUrl: string) => {
    try {
      const originalSize = estimateImageSize(dataUrl)
      let processedDataUrl = dataUrl

      if (originalSize > 1500000) {
        processedDataUrl = await compressImage(dataUrl, COMPRESSION_PRESETS.full)
        console.log(`Image compressée: ${formatFileSize(originalSize)} → ${formatFileSize(estimateImageSize(processedDataUrl))}`)
      }

      const imgHtml = `<img src="${processedDataUrl}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />`

      if (editorRef.current?.isContentEditable) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          range.deleteContents()
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = imgHtml
          const imgNode = tempDiv.firstChild
          if (imgNode) {
            range.insertNode(imgNode)
            range.collapse(false)
            selection.removeAllRanges()
            selection.addRange(range)
          }
        } else {
          editorRef.current.insertAdjacentHTML('beforeend', imgHtml)
        }
      }

      handleInput()
    } catch (error) {
      console.error('Erreur insertion image:', error)
      const imgHtml = `<img src="${dataUrl}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;" />`
      if (editorRef.current?.isContentEditable) {
        editorRef.current.insertAdjacentHTML('beforeend', imgHtml)
        handleInput()
      }
    }
  }, [handleInput])

  // File picker for images
  const handleImageInsert = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = async () => {
          if (reader.result) {
            await insertImageAtCursor(reader.result as string)
          }
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }, [insertImageAtCursor])

  // Capture écran externe (Zoom, app desktop, etc.) via getDisplayMedia
  const handleExternalScreenshotInsert = useCallback(async () => {
    if (!onInsertExternalScreenshot) return
    setIsCapturingExternal(true)
    try {
      const dataUrl = await onInsertExternalScreenshot()
      if (dataUrl) {
        try {
          const originalSize = estimateImageSize(dataUrl)
          let processedDataUrl = dataUrl
          if (originalSize > 1500000) {
            processedDataUrl = await compressImage(dataUrl, COMPRESSION_PRESETS.screenshot)
          }
          const currentDate = new Date().toLocaleString('fr-FR')
          // Note ouverte → blocs image+meta directement dans la note, éditeur intact
          if (onScreenshotToNote && await onScreenshotToNote(processedDataUrl, `📅 ${currentDate} • 🖥️ Capture externe`)) {
            return
          }
          const screenshotHtml = `
            <img src="${processedDataUrl}" alt="Capture externe" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
            <p style="font-size: 12px; color: #666; margin-top: 4px; margin-bottom: 12px; font-style: italic;">
              📅 ${currentDate} • 🖥️ Capture externe
            </p>
          `
          if (editorRef.current?.isContentEditable) {
            editorRef.current.focus()
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)
              if (editorRef.current.contains(range.commonAncestorContainer)) {
                range.deleteContents()
                const tempDiv = document.createElement('div')
                tempDiv.innerHTML = screenshotHtml
                while (tempDiv.firstChild) range.insertNode(tempDiv.firstChild)
                range.collapse(false)
                selection.removeAllRanges()
                selection.addRange(range)
              } else {
                editorRef.current.insertAdjacentHTML('beforeend', screenshotHtml)
              }
            } else {
              editorRef.current.insertAdjacentHTML('beforeend', screenshotHtml)
            }
          }
          handleInput()
        } catch (error) {
          console.error('Erreur insertion capture externe:', error)
          await insertImageAtCursor(dataUrl)
        }
      }
    } finally {
      setIsCapturingExternal(false)
    }
  }, [onInsertExternalScreenshot, handleInput, insertImageAtCursor])

  // Screenshot with metadata
  const handleScreenshotInsert = useCallback(async () => {
    if (onInsertScreenshot) {
      setIsCapturingScreenshot(true)
      try {
      const screenshotDataUrl = await onInsertScreenshot()
      if (screenshotDataUrl) {
        try {
          const originalSize = estimateImageSize(screenshotDataUrl)
          let processedDataUrl = screenshotDataUrl

          if (originalSize > 1500000) {
            processedDataUrl = await compressImage(screenshotDataUrl, COMPRESSION_PRESETS.screenshot)
          }

          const currentDate = new Date().toLocaleString('fr-FR')
          const pageUrl = currentPageInfo?.url || 'Page inconnue'
          const pageTitle = currentPageInfo?.title || 'Titre inconnu'

          // Note ouverte → blocs image+meta directement dans la note, éditeur intact
          if (onScreenshotToNote && await onScreenshotToNote(processedDataUrl, `📅 ${currentDate} • 🌐 ${pageTitle} (${pageUrl})`)) {
            return
          }

          const screenshotHtml = `
            <img src="${processedDataUrl}" alt="Capture d'écran" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
            <p style="font-size: 12px; color: #666; margin-top: 4px; margin-bottom: 12px; font-style: italic;">
              📅 ${currentDate} • 🌐 ${pageTitle} (${pageUrl})
            </p>
          `

          if (editorRef.current?.isContentEditable) {
            editorRef.current.focus()
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)
              if (editorRef.current.contains(range.commonAncestorContainer)) {
                range.deleteContents()
                const tempDiv = document.createElement('div')
                tempDiv.innerHTML = screenshotHtml
                while (tempDiv.firstChild) {
                  range.insertNode(tempDiv.firstChild)
                }
                range.collapse(false)
                selection.removeAllRanges()
                selection.addRange(range)
              } else {
                editorRef.current.insertAdjacentHTML('beforeend', screenshotHtml)
              }
            } else {
              editorRef.current.insertAdjacentHTML('beforeend', screenshotHtml)
            }
          }

          handleInput()
        } catch (error) {
          console.error('Erreur insertion screenshot:', error)
          await insertImageAtCursor(screenshotDataUrl)
        }
      }
      } finally {
        setIsCapturingScreenshot(false)
      }
    }
  }, [onInsertScreenshot, currentPageInfo, handleInput, insertImageAtCursor])

  // Paste images
  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        event.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = async () => {
            if (reader.result) {
              await insertImageAtCursor(reader.result as string)
            }
          }
          reader.readAsDataURL(file)
        }
        break
      }
    }
  }, [insertImageAtCursor])

  // Drag & drop images
  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    const files = event.dataTransfer?.files
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = async () => {
            if (reader.result) {
              await insertImageAtCursor(reader.result as string)
            }
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }, [insertImageAtCursor])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
  }, [])

  // Submit handler
  const handleSubmitClick = useCallback(() => {
    const currentContent = editorRef.current?.innerHTML || ''
    if (onSubmit && currentContent.replace(/<[^>]*>/g, '').trim().length > 0 || currentContent.includes('<img')) {
      onChange(currentContent)
      onSubmit(currentContent)
    }
  }, [onSubmit, onChange])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const currentContent = editorRef.current?.innerHTML || ''
      if (onSubmit && currentContent.trim()) {
        onChange(currentContent)
        onSubmit(currentContent)
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault()
      document.execCommand('bold')
      handleInput()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
      event.preventDefault()
      document.execCommand('italic')
      handleInput()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
      event.preventDefault()
      document.execCommand('underline')
      handleInput()
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'I') {
      event.preventDefault()
      handleImageInsert()
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
      event.preventDefault()
      handleScreenshotInsert()
    }
  }, [handleImageInsert, handleScreenshotInsert, onSubmit, onChange, handleInput])

  return (
    <div className={`capture-input relative ${className}`}>
      {/* Capsule container */}
      <div className={`
        flex items-end
        border rounded-2xl
        bg-card
        transition-all duration-200
        ${isFocused ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border hover:border-muted-foreground/30'}
      `}>
        {/* ContentEditable area */}
        <div className="flex-1 min-w-0">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onKeyDown={handleKeyDown}
            className="min-h-[44px] max-h-[160px] overflow-y-auto pl-4 pr-1 py-3 focus:outline-none text-foreground text-sm leading-relaxed"
            data-placeholder={placeholder}
          />
        </div>

        {/* Right buttons: trade, + and send */}
        <div className="flex-shrink-0 flex items-center gap-1 self-end pb-2.5 pr-2.5">
          {/* Trade button — démarre un segment (clôt l'actif s'il y en a un) */}
          {onStartTrade && (
            <button
              type="button"
              onClick={onStartTrade}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                transition-all duration-200
                ${hasActiveTrade
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10'
                }
              `}
              title={hasActiveTrade ? 'Trade en cours — cliquer démarre le suivant' : 'Je prends un trade'}
              aria-label="Démarrer un trade"
            >
              <Crosshair size={16} />
            </button>
          )}

          {/* Plus button */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                transition-all duration-200
                ${isMenuOpen
                  ? 'bg-muted text-foreground rotate-45'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }
              `}
              title="Ajouter un fichier ou capture"
              aria-label="Ajouter un fichier ou capture"
            >
              <Plus size={18} />
            </button>

            {/* Popover menu */}
            {isMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 z-50 animate-scale-in">
                <div className="bg-popover border border-border rounded-xl shadow-lg p-1.5 min-w-[220px]">
                  <button
                    onClick={() => { handleImageInsert(); setIsMenuOpen(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <ImageIcon size={18} className="text-blue-500 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-medium">Image</div>
                      <div className="text-xs text-muted-foreground">Depuis vos fichiers</div>
                    </div>
                  </button>

                  {onInsertScreenshot && (
                    <button
                      onClick={() => { handleScreenshotInsert(); setIsMenuOpen(false) }}
                      disabled={isCapturingScreenshot}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {isCapturingScreenshot
                        ? <Loader2 size={18} className="text-emerald-500 flex-shrink-0 animate-spin" />
                        : <Camera size={18} className="text-emerald-500 flex-shrink-0" />
                      }
                      <div className="text-left">
                        <div className="font-medium">{isCapturingScreenshot ? 'Capture...' : 'Capture d\'écran'}</div>
                        <div className="text-xs text-muted-foreground">Photo de la page</div>
                      </div>
                    </button>
                  )}

                  {onInsertExternalScreenshot && (
                    <button
                      onClick={() => { handleExternalScreenshotInsert(); setIsMenuOpen(false) }}
                      disabled={isCapturingExternal}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {isCapturingExternal
                        ? <Loader2 size={18} className="text-orange-500 flex-shrink-0 animate-spin" />
                        : <Monitor size={18} className="text-orange-500 flex-shrink-0" />
                      }
                      <div className="text-left">
                        <div className="font-medium">{isCapturingExternal ? 'Capture...' : 'Capture externe'}</div>
                        <div className="text-xs text-muted-foreground">Zoom, app desktop...</div>
                      </div>
                    </button>
                  )}

                  {onSmartCapture && (
                    <button
                      onClick={() => { onSmartCapture(); setIsMenuOpen(false) }}
                      disabled={isSmartCapturing}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {isSmartCapturing
                        ? <Loader2 size={18} className="text-purple-500 flex-shrink-0 animate-spin" />
                        : <Sparkles size={18} className="text-purple-500 flex-shrink-0" />
                      }
                      <div className="text-left">
                        <div className="font-medium">{isSmartCapturing ? 'Capture...' : 'Capture intelligente'}</div>
                        <div className="text-xs text-muted-foreground">Résumé + points clés</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={!hasContent}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center
              transition-all duration-200
              ${hasContent
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'text-muted-foreground/40 cursor-not-allowed'
              }
            `}
            title="Envoyer (Entrée)"
            aria-label="Envoyer"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>

      {/* Keyboard hints - visible on focus only */}
      {isFocused && (
        <div className="flex items-center justify-end px-3 pt-1.5">
          <div className="text-[11px] text-muted-foreground/60">
            <kbd className="bg-muted/50 px-1 py-0.5 rounded text-[10px]">⏎</kbd> envoyer
            <span className="mx-1.5">·</span>
            <kbd className="bg-muted/50 px-1 py-0.5 rounded text-[10px]">⇧⏎</kbd> nouvelle ligne
          </div>
        </div>
      )}
    </div>
  )
})

export default CaptureInput
