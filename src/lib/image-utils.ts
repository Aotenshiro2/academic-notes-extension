/**
 * Utilitaires pour la gestion et l'optimisation des images
 */

export interface ImageCompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  format?: 'jpeg' | 'png' | 'webp'
}

/**
 * Compresse une image depuis un Data URL.
 * Utilise OffscreenCanvas + createImageBitmap — compatibles service workers MV3
 * et contextes de page normaux (popup, content script).
 */
export async function compressImage(
  dataUrl: string,
  options: ImageCompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 1200,
    maxHeight = 800,
    quality = 0.8,
    format = 'jpeg'
  } = options

  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: mime })

  const bitmap = await createImageBitmap(blob)
  const { width, height } = calculateDimensions(bitmap.width, bitmap.height, maxWidth, maxHeight)

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Impossible de créer le contexte OffscreenCanvas')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const compressed = await canvas.convertToBlob({ type: `image/${format}`, quality })

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Erreur FileReader'))
    reader.readAsDataURL(compressed)
  })
}

/**
 * Calcule les nouvelles dimensions en conservant le ratio d'aspect
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight

  let width = originalWidth
  let height = originalHeight

  if (width > maxWidth) {
    width = maxWidth
    height = width / aspectRatio
  }

  if (height > maxHeight) {
    height = maxHeight
    width = height * aspectRatio
  }

  return { width: Math.round(width), height: Math.round(height) }
}

/**
 * Estime la taille d'une image en base64
 */
export function estimateImageSize(dataUrl: string): number {
  // Enlever le préfixe data:image/...;base64,
  const base64String = dataUrl.split(',')[1] || dataUrl
  
  // Calculer la taille approximative (base64 ajoute ~33% de overhead)
  return Math.round((base64String.length * 3) / 4)
}

/**
 * Convertit une taille en octets en format lisible
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Vérifie si un Data URL est une image valide
 */
export function isValidImageDataUrl(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/')) {
    return false
  }

  const validTypes = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'svg']
  const mimeType = dataUrl.split(';')[0].replace('data:image/', '')
  
  return validTypes.includes(mimeType.toLowerCase())
}

/**
 * Extrait le type MIME d'un Data URL d'image
 */
export function getImageMimeType(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/([^;]+)/)
  return match ? `image/${match[1]}` : null
}

/**
 * Options de compression par défaut pour différents contextes
 */
export const COMPRESSION_PRESETS = {
  thumbnail: {
    maxWidth: 300,
    maxHeight: 200,
    quality: 0.7,
    format: 'jpeg' as const
  },
  preview: {
    maxWidth: 600,
    maxHeight: 400,
    quality: 0.8,
    format: 'jpeg' as const
  },
  full: {
    maxWidth: 1200,
    maxHeight: 800,
    quality: 0.85,
    format: 'jpeg' as const
  },
  screenshot: {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.92,
    format: 'jpeg' as const
  }
} as const