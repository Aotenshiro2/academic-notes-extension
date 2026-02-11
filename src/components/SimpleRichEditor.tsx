import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Camera, ImageIcon, Bold, Italic, List, ListOrdered, Type } from 'lucide-react'
import { compressImage, COMPRESSION_PRESETS, estimateImageSize, formatFileSize } from '@/lib/image-utils'

export interface SimpleRichEditorHandle {
  focus: () => void
  scrollIntoView: (options?: ScrollIntoViewOptions) => void
  getContent: () => string
}

interface SimpleRichEditorProps {
  value: string
  onChange: (content: string) => void
  placeholder?: string
  onInsertScreenshot?: () => Promise<string | null>
  onSubmit?: (content: string) => void
  className?: string
  currentPageInfo?: {
    url: string
    title: string
  }
}

const SimpleRichEditor = forwardRef<SimpleRichEditorHandle, SimpleRichEditorProps>(function SimpleRichEditor({
  value,
  onChange,
  placeholder = 'Écrivez votre note ici...',
  onInsertScreenshot,
  onSubmit,
  currentPageInfo,
  className = ''
}, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isEditorFocused, setIsEditorFocused] = useState(false)

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      // Scroll into view to keep focus visible
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // Re-essayer si quelque chose vole le focus (ex: re-render async d'un autre composant)
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

  // Initialiser le contenu de l'éditeur
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  // Gestionnaire de changement de contenu
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      if (html !== value) {
        onChange(html)
      }
    }
  }, [value, onChange])

  // Commandes de formatage
  const executeCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleInput()
  }, [handleInput])

  // Insertion d'image
  const insertImageAtCursor = useCallback(async (dataUrl: string) => {
    try {
      const originalSize = estimateImageSize(dataUrl)
      let processedDataUrl = dataUrl
      
      // Compresser l'image si elle est trop grande
      if (originalSize > 300000) { // 300KB
        processedDataUrl = await compressImage(dataUrl, COMPRESSION_PRESETS.preview)
        console.log(`Image compressée: ${formatFileSize(originalSize)} → ${formatFileSize(estimateImageSize(processedDataUrl))}`)
      }
      
      // Insérer l'image à la position du curseur
      const imgHtml = `<img src="${processedDataUrl}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />`
      
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
          // Pas de sélection, ajouter à la fin
          editorRef.current.insertAdjacentHTML('beforeend', imgHtml)
        }
      }
      
      handleInput()
    } catch (error) {
      console.error('Erreur lors de l\'insertion de l\'image:', error)
      // En cas d'erreur, insérer l'image originale
      const imgHtml = `<img src="${dataUrl}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px;" />`
      if (editorRef.current?.isContentEditable) {
        editorRef.current.insertAdjacentHTML('beforeend', imgHtml)
        handleInput()
      }
    }
  }, [handleInput])

  // Gestionnaire pour l'insertion d'images depuis fichier
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

  // Gestionnaire pour l'insertion de screenshots avec métadonnées
  const handleScreenshotInsert = useCallback(async () => {
    if (onInsertScreenshot) {
      const screenshotDataUrl = await onInsertScreenshot()
      if (screenshotDataUrl) {
        try {
          const originalSize = estimateImageSize(screenshotDataUrl)
          let processedDataUrl = screenshotDataUrl
          
          // Compresser l'image si elle est trop grande
          if (originalSize > 300000) { // 300KB
            processedDataUrl = await compressImage(screenshotDataUrl, COMPRESSION_PRESETS.preview)
            console.log(`Screenshot compressé: ${formatFileSize(originalSize)} → ${formatFileSize(estimateImageSize(processedDataUrl))}`)
          }
          
          // Créer le HTML avec image et métadonnées
          const currentDate = new Date().toLocaleString('fr-FR')
          const pageUrl = currentPageInfo?.url || 'Page inconnue'
          const pageTitle = currentPageInfo?.title || 'Titre inconnu'
          
          const screenshotHtml = `
            <img src="${processedDataUrl}" alt="Capture d'écran" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
            <p style="font-size: 12px; color: #666; margin-top: 4px; margin-bottom: 12px; font-style: italic;">
              📅 ${currentDate} • 🌐 ${pageTitle} (${pageUrl})
            </p>
          `
          
          // Insérer le HTML à la position du curseur avec focus forcé
          if (editorRef.current?.isContentEditable) {
            // S'assurer que l'éditeur a le focus
            editorRef.current.focus()
            
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)
              
              // Vérifier que la sélection est bien dans notre éditeur
              if (editorRef.current.contains(range.commonAncestorContainer)) {
                range.deleteContents()
                
                const tempDiv = document.createElement('div')
                tempDiv.innerHTML = screenshotHtml
                
                // Insérer tous les nœuds
                while (tempDiv.firstChild) {
                  range.insertNode(tempDiv.firstChild)
                }
                
                range.collapse(false)
                selection.removeAllRanges()
                selection.addRange(range)
              } else {
                // Sélection hors de l'éditeur, ajouter à la fin
                editorRef.current.insertAdjacentHTML('beforeend', screenshotHtml)
              }
            } else {
              // Pas de sélection, ajouter à la fin de l'éditeur
              editorRef.current.insertAdjacentHTML('beforeend', screenshotHtml)
            }
          }
          
          handleInput()
        } catch (error) {
          console.error('Erreur lors de l\'insertion du screenshot:', error)
          // En cas d'erreur, fallback vers l'ancienne méthode
          await insertImageAtCursor(screenshotDataUrl)
        }
      }
    }
  }, [onInsertScreenshot, currentPageInfo, handleInput, insertImageAtCursor])

  // Gestion du copier-coller d'images
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

  // Gestion du drag & drop
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

  // Gestion des raccourcis clavier
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Enter seul = sauvegarder la note
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // Lire le contenu directement depuis le DOM pour éviter les problèmes de stale closure
      const currentContent = editorRef.current?.innerHTML || ''
      if (onSubmit && currentContent.trim()) {
        onChange(currentContent) // Forcer la sync du state
        onSubmit(currentContent)
      }
    }
    // Shift+Enter = nouvelle ligne (comportement par défaut)
    else if (event.key === 'Enter' && event.shiftKey) {
      // Laisser le comportement par défaut se produire (nouvelle ligne)
    }
    // Ctrl/Cmd+B : Gras
    else if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault()
      executeCommand('bold')
    }
    // Ctrl/Cmd+I : Italique
    else if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
      event.preventDefault()
      executeCommand('italic')
    }
    // Ctrl/Cmd+Shift+I : Insérer image
    else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'I') {
      event.preventDefault()
      handleImageInsert()
    }
    // Ctrl/Cmd+Shift+S : Screenshot
    else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
      event.preventDefault()
      handleScreenshotInsert()
    }
  }, [executeCommand, handleImageInsert, handleScreenshotInsert, onSubmit, onChange])

  return (
    <div className={`simple-rich-editor ${className}`}>
      {/* Barre d'outils compacte style Claude */}
      <div className="toolbar flex items-center space-x-1 px-3 py-2 bg-muted/30 border border-border rounded-t-lg">
        <button
          type="button"
          onClick={() => executeCommand('bold')}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Gras (Ctrl+B)"
        >
          <Bold size={14} />
        </button>
        
        <button
          type="button"
          onClick={() => executeCommand('italic')}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Italique (Ctrl+I)"
        >
          <Italic size={14} />
        </button>
        
        <div className="w-px h-4 bg-border mx-1"></div>
        
        <button
          type="button"
          onClick={() => executeCommand('insertUnorderedList')}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Liste à puces"
        >
          <List size={14} />
        </button>
        
        <button
          type="button"
          onClick={() => executeCommand('insertOrderedList')}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Liste numérotée"
        >
          <ListOrdered size={14} />
        </button>
        
        <div className="w-px h-4 bg-border mx-1"></div>
        
        <button
          type="button"
          onClick={handleImageInsert}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Insérer image (Ctrl+Shift+I)"
        >
          <ImageIcon size={14} />
        </button>
        
        {onInsertScreenshot && (
          <button
            type="button"
            onClick={handleScreenshotInsert}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Capture d'écran (Ctrl+Shift+S)"
          >
            <Camera size={14} />
          </button>
        )}
      </div>
      
      {/* Éditeur style Claude */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsEditorFocused(true)}
        onBlur={() => setIsEditorFocused(false)}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onKeyDown={handleKeyDown}
        className={`
          min-h-[100px] max-h-[200px] overflow-y-auto px-3 py-3
          border border-border border-t-0 rounded-b-lg bg-background
          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
          text-foreground placeholder:text-muted-foreground
          ${isEditorFocused ? 'ring-2 ring-primary/20 border-primary' : ''}
        `}
        data-placeholder={placeholder}
        style={{
          fontSize: '14px',
          lineHeight: '1.6'
        }}
      />
    </div>
  )
})

export default SimpleRichEditor