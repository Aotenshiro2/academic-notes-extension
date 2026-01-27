import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { AcademicNote } from '@/types/academic'

/**
 * Exporte une note individuelle au format PDF.
 * Genere un PDF A4 avec en-tete (titre, date, URL, tags) et le contenu HTML rasterise.
 */
export async function exportNoteToPDF(note: AcademicNote): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  let yPos = margin

  // --- En-tete ---
  // Titre
  pdf.setFontSize(18)
  pdf.setFont('helvetica', 'bold')
  const titleLines = pdf.splitTextToSize(note.title || 'Note sans titre', contentWidth)
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
    const urlText = note.url.length > 80 ? note.url.substring(0, 80) + '...' : note.url
    pdf.setTextColor(60, 120, 200)
    pdf.text(urlText, margin, yPos)
    yPos += 5
  }

  // Tags
  if (note.tags && note.tags.length > 0) {
    pdf.setTextColor(100, 100, 100)
    pdf.text('Tags: ' + note.tags.join(', '), margin, yPos)
    yPos += 5
  }

  // Ligne de separation
  yPos += 3
  pdf.setDrawColor(220, 220, 220)
  pdf.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 8

  // --- Contenu HTML rasterise ---
  pdf.setTextColor(0, 0, 0)

  // Creer un conteneur temporaire hors-ecran pour le rendu HTML
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 650px;
    padding: 20px;
    background: white;
    color: black;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
  `

  // Ajouter des styles pour le contenu
  container.innerHTML = `
    <style>
      img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; }
      a { color: #3b82f6; text-decoration: underline; }
      p { margin: 0 0 8px 0; }
      strong, b { font-weight: 700; }
      em, i { font-style: italic; }
      ul, ol { margin: 4px 0; padding-left: 24px; }
      li { margin: 2px 0; }
      h1, h2, h3 { margin: 12px 0 6px 0; }
      blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; margin: 8px 0; color: #6b7280; }
      pre, code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    </style>
    <div>${note.content}</div>
  `

  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    const imgWidth = contentWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    // Gerer la pagination si le contenu depasse la page
    const availableHeight = pageHeight - yPos - margin

    if (imgHeight <= availableHeight) {
      // Le contenu tient sur la page courante
      pdf.addImage(imgData, 'JPEG', margin, yPos, imgWidth, imgHeight)
    } else {
      // Pagination : decouper le contenu en segments
      let remainingHeight = imgHeight
      let sourceY = 0
      const sourceWidth = canvas.width
      const sourceHeight = canvas.height
      let isFirstPage = true

      while (remainingHeight > 0) {
        const sliceAvailable = isFirstPage ? availableHeight : (pageHeight - margin * 2)
        const sliceHeight = Math.min(remainingHeight, sliceAvailable)
        const sliceSourceHeight = (sliceHeight / imgHeight) * sourceHeight

        // Creer un canvas pour la tranche
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = sourceWidth
        sliceCanvas.height = Math.ceil(sliceSourceHeight)
        const ctx = sliceCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, Math.floor(sourceY), sourceWidth, Math.ceil(sliceSourceHeight),
            0, 0, sourceWidth, Math.ceil(sliceSourceHeight)
          )

          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92)
          const pageYPos = isFirstPage ? yPos : margin

          pdf.addImage(sliceData, 'JPEG', margin, pageYPos, imgWidth, sliceHeight)
        }

        remainingHeight -= sliceHeight
        sourceY += sliceSourceHeight

        if (remainingHeight > 0) {
          pdf.addPage()
          isFirstPage = false
        }
      }
    }

    // Pied de page sur la derniere page
    pdf.setFontSize(8)
    pdf.setTextColor(180, 180, 180)
    pdf.text(
      'Trading Notes by AOKnowledge',
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )

    // Generer le nom du fichier
    const safeName = (note.title || 'note')
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50)
    const dateFile = new Date(note.timestamp).toISOString().split('T')[0]

    pdf.save(`${safeName}-${dateFile}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
