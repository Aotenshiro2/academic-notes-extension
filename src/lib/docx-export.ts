import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Header,
  Footer,
  PageNumber,
} from 'docx'
import type { AcademicNote } from '@/types/academic'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convertit une URL ou dataURL d'image en ArrayBuffer.
 * Nécessaire car docx ne supporte pas les chaînes base64 directement.
 */
async function imageUrlToArrayBuffer(src: string): Promise<{ data: ArrayBuffer; width: number; height: number } | null> {
  try {
    let dataUrl = src

    if (!src.startsWith('data:')) {
      // Image externe → fetch via canvas pour contourner CORS
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.crossOrigin = 'anonymous'
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('load failed'))
        el.src = src
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0)
      dataUrl = canvas.toDataURL('image/png')
    }

    // Extraire les dimensions depuis le dataURL
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('load failed'))
      el.src = dataUrl
    })

    // Convertir base64 → ArrayBuffer
    const base64 = dataUrl.split(',')[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return { data: bytes.buffer, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

// ─── Parser HTML → blocs docx ───────────────────────────────────────────────

type DocxBlock =
  | { type: 'text'; runs: Array<{ text: string; bold?: boolean; italic?: boolean }> }
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'image'; src: string }
  | { type: 'empty' }

function parseHtmlToDocxBlocks(html: string): DocxBlock[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const blocks: DocxBlock[] = []

  function collectRuns(
    node: Node,
    bold = false,
    italic = false,
    runs: Array<{ text: string; bold?: boolean; italic?: boolean }> = []
  ): Array<{ text: string; bold?: boolean; italic?: boolean }> {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) runs.push({ text, ...(bold && { bold }), ...(italic && { italic }) })
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toUpperCase()
      if (tag === 'BR') {
        runs.push({ text: '\n' })
        return runs
      }
      const isBold = bold || ['STRONG', 'B'].includes(tag)
      const isItalic = italic || ['EM', 'I'].includes(tag)
      for (const child of el.childNodes) collectRuns(child, isBold, isItalic, runs)
    }
    return runs
  }

  function processNode(node: Node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toUpperCase()

    if (tag === 'IMG') {
      const src = (el as HTMLImageElement).src
      if (src) blocks.push({ type: 'image', src })
      return
    }

    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
      const text = el.textContent?.trim() ?? ''
      if (text) {
        const lvl = Math.min(parseInt(tag[1]), 3) as 1 | 2 | 3
        blocks.push({ type: 'heading', text, level: lvl })
      }
      return
    }

    if (['P', 'DIV', 'LI', 'BLOCKQUOTE'].includes(tag)) {
      // Check for nested images first
      const hasImages = el.querySelector('img') !== null
      if (hasImages) {
        for (const child of el.childNodes) processNode(child)
        return
      }
      const runs = collectRuns(el)
      const text = runs.map(r => r.text).join('').trim()
      if (text) {
        blocks.push({ type: 'text', runs })
      } else {
        blocks.push({ type: 'empty' })
      }
      return
    }

    // Fallback : traiter les enfants
    for (const child of el.childNodes) processNode(child)
  }

  for (const child of doc.body.childNodes) processNode(child)

  // Dédupliquer les lignes vides consécutives
  const result: DocxBlock[] = []
  let lastEmpty = false
  for (const block of blocks) {
    if (block.type === 'empty') {
      if (!lastEmpty) { result.push(block); lastEmpty = true }
    } else {
      result.push(block)
      lastEmpty = false
    }
  }
  return result
}

// ─── Conversion blocs → éléments docx ──────────────────────────────────────

const MAX_IMG_WIDTH_EMU = 5_486_400  // ~6 pouces en EMU (English Metric Units)
const A4_HEIGHT_EMU = 9_906_000       // hauteur A4 disponible

async function blocksToParagraphs(blocks: DocxBlock[]): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'empty':
        paragraphs.push(new Paragraph({ text: '' }))
        break

      case 'text': {
        const runs = block.runs.map(r =>
          new TextRun({
            text: r.text,
            bold: r.bold,
            italics: r.italic,
            font: 'Calibri',
            size: 22, // 11pt en half-points
          })
        )
        paragraphs.push(new Paragraph({ children: runs }))
        break
      }

      case 'heading': {
        const levelMap: Record<1 | 2 | 3, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
        }
        paragraphs.push(
          new Paragraph({
            text: block.text,
            heading: levelMap[block.level],
          })
        )
        break
      }

      case 'image': {
        const result = await imageUrlToArrayBuffer(block.src)
        if (!result) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: '[Image non disponible]', italics: true, color: '999999' })],
            })
          )
          break
        }

        const { data, width, height } = result
        // Calculer les dimensions en EMU (1 pixel ≈ 9525 EMU à 96 DPI)
        const pixelToEmu = 9525
        let wEmu = width * pixelToEmu
        let hEmu = height * pixelToEmu

        // Limiter la largeur à la zone imprimable
        if (wEmu > MAX_IMG_WIDTH_EMU) {
          hEmu = Math.round((hEmu / wEmu) * MAX_IMG_WIDTH_EMU)
          wEmu = MAX_IMG_WIDTH_EMU
        }
        // Limiter la hauteur à la page
        if (hEmu > A4_HEIGHT_EMU) {
          wEmu = Math.round((wEmu / hEmu) * A4_HEIGHT_EMU)
          hEmu = A4_HEIGHT_EMU
        }

        paragraphs.push(
          new Paragraph({
            children: [
              new ImageRun({
                data,
                transformation: { width: Math.round(wEmu / 9525), height: Math.round(hEmu / 9525) },
                type: 'png',
              }),
            ],
          })
        )
        break
      }
    }
  }

  return paragraphs
}

// ─── Export public ───────────────────────────────────────────────────────────

/**
 * Exporte une note au format .docx (compatible Google Docs, Word, LibreOffice).
 * Déclenche un téléchargement dans le navigateur.
 */
export async function exportNoteToDocx(note: AcademicNote): Promise<void> {
  const dateStr = new Date(note.timestamp).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // En-tête : titre + métadonnées
  const headerParagraphs: Paragraph[] = [
    new Paragraph({
      text: note.title || 'Note sans titre',
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: dateStr, color: '888888', size: 18, font: 'Calibri' }),
      ],
    }),
  ]

  if (note.url) {
    headerParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Source : ', bold: true, size: 18, font: 'Calibri', color: '555555' }),
          new TextRun({ text: note.url, size: 18, font: 'Calibri', color: '2563EB' }),
        ],
      })
    )
  }

  if (note.tags && note.tags.length > 0) {
    headerParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Tags : ', bold: true, size: 18, font: 'Calibri', color: '555555' }),
          new TextRun({ text: note.tags.join(', '), size: 18, font: 'Calibri' }),
        ],
      })
    )
  }

  // Séparateur
  headerParagraphs.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDDDDD', space: 8 },
      },
      text: '',
    })
  )

  // Contenu
  const blocks = parseHtmlToDocxBlocks(note.content)
  const contentParagraphs = await blocksToParagraphs(blocks)

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1.2),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Trading Notes by AOKnowledge',
                    color: 'AAAAAA',
                    size: 16,
                    font: 'Calibri',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', color: 'AAAAAA', size: 16, font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.CURRENT], color: 'AAAAAA', size: 16, font: 'Calibri' }),
                  new TextRun({ text: ' / ', color: 'AAAAAA', size: 16, font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: 'AAAAAA', size: 16, font: 'Calibri' }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [...headerParagraphs, ...contentParagraphs],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)

  const safeName = (note.title || 'note')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
  const dateFile = new Date(note.timestamp).toISOString().split('T')[0]

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}-${dateFile}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
