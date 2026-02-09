import jsPDF from 'jspdf'
import type { AcademicNote } from '@/types/academic'

/**
 * Remplace les caractères Unicode non supportés par des équivalents ASCII
 * jsPDF avec Helvetica ne supporte que Latin-1 (ISO-8859-1)
 */
function sanitizeTextForPdf(text: string): string {
  // Map des remplacements courants (utilisant les codes Unicode pour éviter les problèmes de parsing)
  const replacements = new Map<string, string>([
    // Emojis courants
    ['\u{1F4C8}', '[UP]'],      // 📈
    ['\u{1F4C9}', '[DOWN]'],    // 📉
    ['\u{2705}', '[OK]'],       // ✅
    ['\u{274C}', '[X]'],        // ❌
    ['\u{26A0}\u{FE0F}', '[!]'],// ⚠️
    ['\u{1F534}', '(R)'],       // 🔴
    ['\u{1F7E2}', '(G)'],       // 🟢
    ['\u{1F7E1}', '(Y)'],       // 🟡
    ['\u{1F4B0}', '$'],         // 💰
    ['\u{1F4CA}', '[CHART]'],   // 📊
    ['\u{1F4DD}', '[NOTE]'],    // 📝
    ['\u{1F3AF}', '[TARGET]'],  // 🎯
    ['\u{2B50}', '*'],          // ⭐
    ['\u{1F525}', '[HOT]'],     // 🔥
    ['\u{1F4A1}', '[IDEA]'],    // 💡
    ['\u{1F44D}', '[+1]'],      // 👍
    ['\u{1F44E}', '[-1]'],      // 👎
    ['\u{1F680}', '[ROCKET]'],  // 🚀
    ['\u{1F48E}', '[GEM]'],     // 💎
    ['\u{26A1}', '[FLASH]'],    // ⚡
    ['\u{1F512}', '[LOCK]'],    // 🔒
    ['\u{1F513}', '[UNLOCK]'],  // 🔓
    ['\u{1F4C5}', '[DATE]'],    // 📅
    ['\u{23F0}', '[TIME]'],     // ⏰
    ['\u{1F3C6}', '[TROPHY]'],  // 🏆
    ['\u{1F4AA}', '[STRONG]'],  // 💪
    ['\u{1F914}', '[?]'],       // 🤔
    ['\u{1F600}', ':)'],        // 😀
    ['\u{1F60A}', ':)'],        // 😊
    ['\u{1F622}', ':('],        // 😢
    ['\u{1F621}', ':['],        // 😡
    // Symboles
    ['\u2022', '-'],            // •
    ['\u2192', '->'],           // →
    ['\u2190', '<-'],           // ←
    ['\u2191', '^'],            // ↑
    ['\u2193', 'v'],            // ↓
    ['\u2194', '<->'],          // ↔
    ['\u2713', '[v]'],          // ✓
    ['\u2717', '[x]'],          // ✗
    ['\u2026', '...'],          // …
    ['\u2014', '-'],            // —
    ['\u2013', '-'],            // –
    ['\u201C', '"'],            // "
    ['\u201D', '"'],            // "
    ['\u2018', "'"],            // '
    ['\u2019', "'"],            // '
    ['\u20AC', 'EUR'],          // €
    ['\u00A3', 'GBP'],          // £
    ['\u00A5', 'JPY'],          // ¥
    ['\u20BF', 'BTC'],          // ₿
    ['\u00A9', '(c)'],          // ©
    ['\u00AE', '(R)'],          // ®
    ['\u2122', '(TM)'],         // ™
    ['\u00B0', ' deg'],         // °
    ['\u00B1', '+/-'],          // ±
    ['\u00D7', 'x'],            // ×
    ['\u00F7', '/'],            // ÷
    ['\u2264', '<='],           // ≤
    ['\u2265', '>='],           // ≥
    ['\u2260', '!='],           // ≠
    ['\u2248', '~='],           // ≈
    ['\u221E', 'inf'],          // ∞
    ['\u00BD', '1/2'],          // ½
    ['\u00BC', '1/4'],          // ¼
    ['\u00BE', '3/4'],          // ¾
    ['\u2153', '1/3'],          // ⅓
    ['\u2154', '2/3'],          // ⅔
    ['\u25B3', '^'],            // △
    ['\u25BD', 'v'],            // ▽
    ['\u25B2', '^'],            // ▲
    ['\u25BC', 'v'],            // ▼
    ['\u25C6', '*'],            // ◆
    ['\u25C7', '*'],            // ◇
    ['\u25A0', '[#]'],          // ■
    ['\u25A1', '[ ]'],          // □
    ['\u25CF', '*'],            // ●
    ['\u25CB', 'o'],            // ○
  ])

  let result = text

  // Appliquer les remplacements connus
  for (const [unicode, ascii] of replacements) {
    result = result.replaceAll(unicode, ascii)
  }

  // Supprimer les autres caractères non-Latin-1 (codes > 255)
  // en les remplaçant par un espace (plus discret que '?')
  result = result.replace(/[^\x00-\xFF]/g, ' ')

  // Nettoyer les espaces multiples
  result = result.replace(/  +/g, ' ')

  return result
}

/**
 * Types pour le parsing du contenu
 */
interface ContentBlock {
  type: 'text' | 'image' | 'heading' | 'linebreak'
  content: string
  level?: number // Pour les headings (1, 2, 3)
  bold?: boolean
  italic?: boolean
}

/**
 * Charge une image et retourne ses dimensions
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/**
 * Convertit une image en base64 via canvas (pour les images externes)
 */
async function imageToBase64(img: HTMLImageElement): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Cannot get canvas context')
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

/**
 * Parse le contenu HTML pour extraire texte et images séparément
 */
function parseHtmlContent(html: string): ContentBlock[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const blocks: ContentBlock[] = []

  let currentTextBuffer = ''
  let currentBold = false
  let currentItalic = false

  function flushTextBuffer() {
    if (currentTextBuffer.trim()) {
      blocks.push({
        type: 'text',
        content: currentTextBuffer.trim(),
        bold: currentBold,
        italic: currentItalic
      })
    }
    currentTextBuffer = ''
  }

  function processNode(node: Node, inheritBold = false, inheritItalic = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (text) {
        currentBold = inheritBold
        currentItalic = inheritItalic
        currentTextBuffer += text
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      const tagName = element.tagName.toUpperCase()

      // Gestion des images
      if (tagName === 'IMG') {
        flushTextBuffer()
        const src = (element as HTMLImageElement).src
        if (src) {
          blocks.push({ type: 'image', content: src })
        }
        return
      }

      // Gestion des headings
      if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)) {
        flushTextBuffer()
        const level = parseInt(tagName.charAt(1))
        const text = element.textContent?.trim() || ''
        if (text) {
          blocks.push({ type: 'heading', content: text, level })
        }
        blocks.push({ type: 'linebreak', content: '' })
        return
      }

      // Gestion des sauts de ligne
      if (tagName === 'BR') {
        currentTextBuffer += '\n'
        return
      }

      // Gestion des blocs qui ajoutent un saut de ligne après
      const isBlockElement = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE'].includes(tagName)

      // Détecter bold/italic
      const isBold = inheritBold || ['STRONG', 'B'].includes(tagName)
      const isItalic = inheritItalic || ['EM', 'I'].includes(tagName)

      // Si on change de style, flush le buffer
      if (isBold !== currentBold || isItalic !== currentItalic) {
        flushTextBuffer()
      }

      // Traiter les enfants
      for (const child of element.childNodes) {
        processNode(child, isBold, isItalic)
      }

      // Ajouter un saut de ligne après les éléments de bloc
      if (isBlockElement) {
        flushTextBuffer()
        blocks.push({ type: 'linebreak', content: '' })
      }
    }
  }

  processNode(doc.body)
  flushTextBuffer()

  // Nettoyer les linebreaks consécutifs
  const cleanedBlocks: ContentBlock[] = []
  let lastWasLinebreak = false
  for (const block of blocks) {
    if (block.type === 'linebreak') {
      if (!lastWasLinebreak) {
        cleanedBlocks.push(block)
        lastWasLinebreak = true
      }
    } else {
      cleanedBlocks.push(block)
      lastWasLinebreak = false
    }
  }

  return cleanedBlocks
}

/**
 * Exporte une note individuelle au format PDF.
 * Utilise une approche hybride: texte natif (sélectionnable) + images intégrées
 */
export async function exportNoteToPDF(note: AcademicNote): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let yPos = margin

  // Configuration de base
  const lineHeight = 5 // mm par ligne de texte
  const paragraphSpacing = 3 // mm entre paragraphes

  // Helper pour vérifier si on a besoin d'une nouvelle page
  function checkNewPage(neededHeight: number): void {
    if (yPos + neededHeight > pageHeight - margin) {
      pdf.addPage()
      yPos = margin
    }
  }

  // --- En-tête ---
  // Titre
  pdf.setFontSize(18)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  const sanitizedTitle = sanitizeTextForPdf(note.title || 'Note sans titre')
  const titleLines = pdf.splitTextToSize(sanitizedTitle, contentWidth)
  pdf.text(titleLines, margin, yPos + 6)
  yPos += titleLines.length * 8 + 4

  // Date
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(120, 120, 120)
  const dateStr = new Date(note.timestamp).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  pdf.text(dateStr, margin, yPos)
  yPos += 5

  // URL source
  if (note.url) {
    const rawUrl = note.url.length > 80 ? note.url.substring(0, 80) + '...' : note.url
    const urlText = sanitizeTextForPdf(rawUrl)
    pdf.setTextColor(60, 120, 200)
    pdf.text(urlText, margin, yPos)
    yPos += 5
  }

  // Tags
  if (note.tags && note.tags.length > 0) {
    pdf.setTextColor(100, 100, 100)
    const tagsText = sanitizeTextForPdf('Tags: ' + note.tags.join(', '))
    pdf.text(tagsText, margin, yPos)
    yPos += 5
  }

  // Ligne de séparation
  yPos += 3
  pdf.setDrawColor(220, 220, 220)
  pdf.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 8

  // --- Contenu ---
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(11)

  const blocks = parseHtmlContent(note.content)

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        // Configurer le style
        const fontStyle = block.bold && block.italic ? 'bolditalic' :
                          block.bold ? 'bold' :
                          block.italic ? 'italic' : 'normal'
        pdf.setFont('helvetica', fontStyle)
        pdf.setFontSize(11)

        // Sanitiser et découper le texte en lignes
        const sanitizedContent = sanitizeTextForPdf(block.content)
        const lines = pdf.splitTextToSize(sanitizedContent, contentWidth)

        for (const line of lines) {
          checkNewPage(lineHeight)
          pdf.text(line, margin, yPos)
          yPos += lineHeight
        }
        break
      }

      case 'heading': {
        const fontSize = block.level === 1 ? 16 : block.level === 2 ? 14 : 12
        const headingHeight = fontSize * 0.5 + 3

        checkNewPage(headingHeight)

        yPos += 2 // Espace avant le heading
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(fontSize)
        const sanitizedHeading = sanitizeTextForPdf(block.content)
        pdf.text(sanitizedHeading, margin, yPos)
        yPos += headingHeight

        // Reset font
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(11)
        break
      }

      case 'linebreak': {
        yPos += paragraphSpacing
        break
      }

      case 'image': {
        try {
          // Charger l'image
          const img = await loadImage(block.content)

          // Convertir en base64 si nécessaire (pour éviter les problèmes CORS)
          let imgData = block.content
          if (!block.content.startsWith('data:')) {
            try {
              imgData = await imageToBase64(img)
            } catch {
              // Si la conversion échoue, utiliser l'URL directement
              imgData = block.content
            }
          }

          // Calculer les dimensions
          const aspectRatio = img.naturalHeight / img.naturalWidth
          let imgWidth = Math.min(contentWidth, 160) // Max 160mm de large
          let imgHeight = imgWidth * aspectRatio

          // Si l'image est trop haute pour une page, la redimensionner
          const maxImgHeight = pageHeight - margin * 2 - 10
          if (imgHeight > maxImgHeight) {
            imgHeight = maxImgHeight
            imgWidth = imgHeight / aspectRatio
          }

          // Vérifier si l'image tient sur la page courante
          // Si non, aller à la page suivante AVANT d'ajouter l'image
          const availableSpace = pageHeight - yPos - margin
          if (imgHeight > availableSpace) {
            pdf.addPage()
            yPos = margin
          }

          // Ajouter l'image
          pdf.addImage(imgData, 'JPEG', margin, yPos, imgWidth, imgHeight)
          yPos += imgHeight + 5 // 5mm d'espacement après l'image

        } catch (error) {
          // Si l'image ne peut pas être chargée, ajouter un placeholder texte
          console.warn('Could not load image:', block.content, error)
          checkNewPage(lineHeight)
          pdf.setTextColor(150, 150, 150)
          pdf.setFont('helvetica', 'italic')
          pdf.text('[Image non disponible]', margin, yPos)
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
          yPos += lineHeight
        }
        break
      }
    }
  }

  // --- Pied de page sur toutes les pages ---
  const totalPages = pdf.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)
    pdf.setFontSize(8)
    pdf.setTextColor(180, 180, 180)
    pdf.text(
      `Trading Notes by AOKnowledge - Page ${i}/${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

  // Générer le nom du fichier
  const safeName = (note.title || 'note')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
  const dateFile = new Date(note.timestamp).toISOString().split('T')[0]

  pdf.save(`${safeName}-${dateFile}.pdf`)
}
