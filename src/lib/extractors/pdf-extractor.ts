import type { ContentMetadata } from '@/types/academic'

export interface PDFExtractResult {
  success: boolean
  title?: string
  content?: string
  metadata?: ContentMetadata
  error?: string
}

/**
 * Extracteur spécialisé pour les documents PDF
 */
export class PDFExtractor {
  static extract(): PDFExtractResult {
    try {
      const url = window.location.href
      
      if (!this.isPDF()) {
        return {
          success: false,
          error: 'Cette page ne contient pas de PDF'
        }
      }

      // Différentes approches selon le contexte
      if (this.isEmbeddedPDF()) {
        return this.extractEmbeddedPDF()
      } else if (this.isPDFViewer()) {
        return this.extractFromPDFViewer()
      } else {
        return this.extractDirectPDF(url)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur extraction PDF'
      }
    }
  }

  private static isPDF(): boolean {
    const url = window.location.href.toLowerCase()
    const contentType = document.contentType || ''
    
    return url.includes('.pdf') || 
           contentType.includes('application/pdf') ||
           this.isEmbeddedPDF() ||
           this.isPDFViewer()
  }

  private static isEmbeddedPDF(): boolean {
    return !!(document.querySelector('embed[type="application/pdf"]') ||
              document.querySelector('object[type="application/pdf"]') ||
              document.querySelector('iframe[src*=".pdf"]'))
  }

  private static isPDFViewer(): boolean {
    const hostname = window.location.hostname.toLowerCase()
    
    // Détection de viewers PDF courants
    const pdfViewers = [
      'drive.google.com/file',
      'docs.google.com/viewer',
      'mozilla.github.io/pdf.js',
      'arxiv.org/pdf',
      'researchgate.net',
      'academia.edu'
    ]
    
    return pdfViewers.some(viewer => 
      hostname.includes(viewer) || window.location.href.includes(viewer)
    )
  }

  private static extractEmbeddedPDF(): PDFExtractResult {
    const metadata: ContentMetadata = {
      domain: window.location.hostname,
      language: document.documentElement.lang || 'fr'
    }

    // Chercher l'élément PDF
    const pdfElement = document.querySelector('embed[type="application/pdf"]') ||
                      document.querySelector('object[type="application/pdf"]') ||
                      document.querySelector('iframe[src*=".pdf"]')

    if (!pdfElement) {
      return {
        success: false,
        error: 'Élément PDF non trouvé'
      }
    }

    // Extraire l'URL du PDF
    const pdfUrl = pdfElement.getAttribute('src') || 
                   pdfElement.getAttribute('data') || 
                   window.location.href

    // Titre depuis la page ou le nom du fichier
    const title = this.extractTitle(pdfUrl)
    
    // Métadonnées de base
    metadata.title = title
    metadata.description = this.getMetaContent('description')
    metadata.author = this.getMetaContent('author')

    // Extraire le contenu textuel si possible
    const content = this.extractTextContent()

    return {
      success: true,
      title,
      content,
      metadata
    }
  }

  private static extractFromPDFViewer(): PDFExtractResult {
    const metadata: ContentMetadata = {
      domain: window.location.hostname,
      language: document.documentElement.lang || 'fr'
    }

    let title = ''
    let content = ''
    
    // Google Drive PDF Viewer
    if (window.location.hostname.includes('drive.google.com')) {
      title = this.extractGoogleDriveTitle()
      content = this.extractGoogleDriveContent()
    }
    // ArXiv
    else if (window.location.hostname.includes('arxiv.org')) {
      title = this.extractArXivTitle()
      metadata.journal = 'arXiv'
      metadata.doi = this.extractArXivId()
    }
    // Mozilla PDF.js
    else if (window.location.href.includes('pdf.js') || 
             document.querySelector('#viewer')) {
      title = this.extractPDFJSTitle()
      content = this.extractPDFJSContent()
    }
    // Fallback générique
    else {
      title = document.title || this.extractTitleFromUrl(window.location.href)
      content = this.extractTextContent()
    }

    metadata.title = title
    metadata.description = this.getMetaContent('description')
    metadata.author = this.getMetaContent('author')

    return {
      success: true,
      title,
      content,
      metadata
    }
  }

  private static extractDirectPDF(url: string): PDFExtractResult {
    const metadata: ContentMetadata = {
      domain: window.location.hostname,
      language: 'fr'
    }

    const title = this.extractTitleFromUrl(url)
    metadata.title = title

    // Pour un PDF direct, on ne peut pas extraire le contenu sans PDF.js
    const content = 'PDF direct - contenu non extractible sans bibliothèque spécialisée'

    return {
      success: true,
      title,
      content,
      metadata
    }
  }

  private static extractTitle(pdfUrl?: string): string {
    // Priorité aux métadonnées de la page
    const pageTitle = document.title
    if (pageTitle && pageTitle !== 'PDF' && !pageTitle.includes('Untitled')) {
      return pageTitle
    }

    // Extraire depuis l'URL du PDF
    if (pdfUrl) {
      return this.extractTitleFromUrl(pdfUrl)
    }

    return 'Document PDF'
  }

  private static extractTitleFromUrl(url: string): string {
    try {
      const urlParts = url.split('/')
      const filename = urlParts[urlParts.length - 1]
      
      if (filename.includes('.pdf')) {
        return decodeURIComponent(filename)
          .replace('.pdf', '')
          .replace(/[-_]/g, ' ')
          .trim()
      }
      
      return 'Document PDF'
    } catch (error) {
      return 'Document PDF'
    }
  }

  private static extractGoogleDriveTitle(): string {
    const titleElement = document.querySelector('[data-title]') ||
                        document.querySelector('.ndfHFb-c4YZDc-Wrql6b') ||
                        document.querySelector('title')
    
    return titleElement?.textContent?.replace(' - Google Drive', '') || 'Document Google Drive'
  }

  private static extractGoogleDriveContent(): string {
    // Google Drive ne rend généralement pas le contenu textuel extractible
    return 'Contenu PDF hébergé sur Google Drive'
  }

  private static extractArXivTitle(): string {
    const titleElement = document.querySelector('h1.title') ||
                        document.querySelector('.title')
    
    return titleElement?.textContent?.replace('Title:', '').trim() || 'Article arXiv'
  }

  private static extractArXivId(): string {
    const url = window.location.href
    const match = url.match(/arxiv\.org\/pdf\/(\d+\.\d+)/)
    return match ? `arXiv:${match[1]}` : ''
  }

  private static extractPDFJSTitle(): string {
    const titleElement = document.querySelector('#documentTitle') ||
                        document.querySelector('.toolbarLabel')
    
    return titleElement?.textContent?.trim() || 'Document PDF'
  }

  private static extractPDFJSContent(): string {
    // PDF.js rend le contenu dans des éléments textuels
    const textElements = document.querySelectorAll('.textLayer div')
    
    if (textElements.length > 0) {
      return Array.from(textElements)
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join(' ')
        .substring(0, 5000) // Limiter la taille
    }

    return 'Contenu PDF - extraction textuelle non disponible'
  }

  private static extractTextContent(): string {
    // Tentative d'extraction générique du contenu textuel
    const contentSelectors = [
      '.textLayer div', // PDF.js
      '.page-content',  // Générique
      'main',
      '.content'
    ]

    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector)
      if (elements.length > 0) {
        const text = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' ')
        
        if (text.length > 100) {
          return text.substring(0, 5000)
        }
      }
    }

    return 'Contenu PDF - extraction automatique non disponible'
  }

  private static getMetaContent(name: string): string {
    const selectors = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[name="citation_${name}"]`
    ]
    
    for (const selector of selectors) {
      const meta = document.querySelector(selector)
      if (meta) {
        const content = meta.getAttribute('content')
        if (content?.trim()) return content.trim()
      }
    }
    
    return ''
  }

  /**
   * Détecter si la page actuelle est un PDF
   */
  static isPDFPage(): boolean {
    return this.isPDF()
  }
}