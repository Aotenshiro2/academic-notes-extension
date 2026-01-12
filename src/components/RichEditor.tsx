import React, { useCallback, useRef, useEffect } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import { Camera, ImageIcon } from 'lucide-react'
import { compressImage, COMPRESSION_PRESETS, estimateImageSize, formatFileSize } from '@/lib/image-utils'

interface RichEditorProps {
  value: string
  onChange: (content: string) => void
  placeholder?: string
  onInsertScreenshot?: () => Promise<string | null>
  className?: string
}

function RichEditor({
  value,
  onChange,
  placeholder = 'Écrivez votre note ici...',
  onInsertScreenshot,
  className = ''
}: RichEditorProps) {
  const quillRef = useRef<ReactQuill>(null)

  // Configuration des modules Quill
  const modules = {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        ['link', 'image'],
        ['clean'],
        ['screenshot-button'] // Bouton personnalisé pour les screenshots
      ],
      handlers: {
        'image': handleImageInsert,
        'screenshot-button': handleScreenshotInsert
      }
    },
    imageResize: {
      parchment: 'quill/dist/quill',
      modules: ['Resize', 'DisplaySize', 'Toolbar']
    }
  }

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent',
    'link', 'image',
    'clean'
  ]

  // Gestionnaire pour l'insertion d'images depuis le presse-papiers ou fichier
  function handleImageInsert() {
    const input = document.createElement('input')
    input.setAttribute('type', 'file')
    input.setAttribute('accept', 'image/*')
    
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = async () => {
          if (reader.result) {
            const originalDataUrl = reader.result as string
            const originalSize = estimateImageSize(originalDataUrl)
            
            try {
              // Compresser l'image si elle est trop grande
              let processedDataUrl = originalDataUrl
              if (originalSize > 500000) { // 500KB
                processedDataUrl = await compressImage(originalDataUrl, COMPRESSION_PRESETS.preview)
                console.log(`Image compressée: ${formatFileSize(originalSize)} → ${formatFileSize(estimateImageSize(processedDataUrl))}`)
              }
              
              const quill = quillRef.current?.getEditor()
              if (quill) {
                const range = quill.getSelection(true)
                quill.insertEmbed(range.index, 'image', processedDataUrl)
                quill.setSelection(range.index + 1)
              }
            } catch (error) {
              console.error('Erreur lors de la compression de l\'image:', error)
              // En cas d'erreur, insérer l'image originale
              const quill = quillRef.current?.getEditor()
              if (quill) {
                const range = quill.getSelection(true)
                quill.insertEmbed(range.index, 'image', originalDataUrl)
                quill.setSelection(range.index + 1)
              }
            }
          }
        }
        reader.readAsDataURL(file)
      }
    }
    
    input.click()
  }

  // Gestionnaire pour l'insertion de screenshots
  async function handleScreenshotInsert() {
    if (onInsertScreenshot) {
      const screenshotDataUrl = await onInsertScreenshot()
      if (screenshotDataUrl) {
        try {
          // Compresser la capture d'écran
          const compressedDataUrl = await compressImage(screenshotDataUrl, COMPRESSION_PRESETS.preview)
          const originalSize = estimateImageSize(screenshotDataUrl)
          const compressedSize = estimateImageSize(compressedDataUrl)
          
          console.log(`Screenshot compressé: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}`)
          
          const quill = quillRef.current?.getEditor()
          if (quill) {
            const range = quill.getSelection(true)
            quill.insertEmbed(range.index, 'image', compressedDataUrl)
            quill.setSelection(range.index + 1)
          }
        } catch (error) {
          console.error('Erreur lors de la compression du screenshot:', error)
          // En cas d'erreur, insérer le screenshot original
          const quill = quillRef.current?.getEditor()
          if (quill) {
            const range = quill.getSelection(true)
            quill.insertEmbed(range.index, 'image', screenshotDataUrl)
            quill.setSelection(range.index + 1)
          }
        }
      }
    }
  }

  // Fonction pour insérer une image par programmation avec compression
  const insertImage = useCallback(async (dataUrl: string) => {
    try {
      const originalSize = estimateImageSize(dataUrl)
      let processedDataUrl = dataUrl
      
      // Compresser l'image si elle est trop grande
      if (originalSize > 300000) { // 300KB
        processedDataUrl = await compressImage(dataUrl, COMPRESSION_PRESETS.preview)
        console.log(`Image collée compressée: ${formatFileSize(originalSize)} → ${formatFileSize(estimateImageSize(processedDataUrl))}`)
      }
      
      const quill = quillRef.current?.getEditor()
      if (quill) {
        const range = quill.getSelection(true)
        quill.insertEmbed(range.index, 'image', processedDataUrl)
        quill.setSelection(range.index + 1)
      }
    } catch (error) {
      console.error('Erreur lors de la compression de l\'image collée:', error)
      // En cas d'erreur, insérer l'image originale
      const quill = quillRef.current?.getEditor()
      if (quill) {
        const range = quill.getSelection(true)
        quill.insertEmbed(range.index, 'image', dataUrl)
        quill.setSelection(range.index + 1)
      }
    }
  }, [])

  // Gestion du copier-coller d'images
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
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
                await insertImage(reader.result as string)
              }
            }
            reader.readAsDataURL(file)
          }
          break
        }
      }
    }

    const quillElement = quillRef.current?.getEditor()?.root
    if (quillElement) {
      quillElement.addEventListener('paste', handlePaste)
      return () => quillElement.removeEventListener('paste', handlePaste)
    }
  }, [insertImage])

  // Gestion du drag & drop d'images
  useEffect(() => {
    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      const files = event.dataTransfer?.files
      if (files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          if (file.type.startsWith('image/')) {
            const reader = new FileReader()
            reader.onload = async () => {
              if (reader.result) {
                await insertImage(reader.result as string)
              }
            }
            reader.readAsDataURL(file)
          }
        }
      }
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
    }

    const quillElement = quillRef.current?.getEditor()?.root
    if (quillElement) {
      quillElement.addEventListener('drop', handleDrop)
      quillElement.addEventListener('dragover', handleDragOver)
      return () => {
        quillElement.removeEventListener('drop', handleDrop)
        quillElement.removeEventListener('dragover', handleDragOver)
      }
    }
  }, [insertImage])

  // Gestion des raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+I : Insérer une image depuis fichier
      if (event.ctrlKey && event.shiftKey && event.key === 'I') {
        event.preventDefault()
        handleImageInsert()
      }
      
      // Ctrl+Shift+S : Prendre une capture d'écran
      if (event.ctrlKey && event.shiftKey && event.key === 'S') {
        event.preventDefault()
        handleScreenshotInsert()
      }
    }

    const quillElement = quillRef.current?.getEditor()?.root
    if (quillElement) {
      quillElement.addEventListener('keydown', handleKeyDown)
      return () => quillElement.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div className={`rich-editor-container ${className}`}>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
        className="rich-editor"
      />
      
      {/* Barre d'outils supplémentaire pour les screenshots */}
      {onInsertScreenshot && (
        <div className="flex items-center space-x-2 mt-2 p-2 bg-gray-50 border border-gray-200 rounded-md">
          <button
            type="button"
            onClick={handleScreenshotInsert}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            title="Prendre une capture d'écran"
          >
            <Camera size={14} />
            <span>Screenshot</span>
          </button>
          
          <button
            type="button"
            onClick={handleImageInsert}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            title="Insérer une image"
          >
            <ImageIcon size={14} />
            <span>Image</span>
          </button>
          
          <div className="text-xs text-gray-500 ml-2">
            <p>• Glisser-déposer ou coller des images directement</p>
            <p>• <kbd className="bg-gray-200 px-1 rounded">Ctrl+Shift+I</kbd> : Insérer image</p>
            <p>• <kbd className="bg-gray-200 px-1 rounded">Ctrl+Shift+S</kbd> : Screenshot</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default RichEditor