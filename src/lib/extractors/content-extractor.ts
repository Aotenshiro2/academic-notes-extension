import { ArticleExtractor } from './article-extractor'
import { VideoExtractor } from './video-extractor'
import { PDFExtractor } from './pdf-extractor'
import type { AcademicNote, ContentType, ContentMetadata } from '@/types/academic'

export interface ExtractionResult {
  success: boolean
  note?: Omit<AcademicNote, 'id' | 'timestamp'>
  error?: string
}

/**
 * Extracteur principal qui orchestre tous les extracteurs spécialisés
 */
export class ContentExtractor {
  /**
   * Extraction intelligente du contenu selon le type de page
   */
  static async extract(): Promise<ExtractionResult> {
    try {
      const contentType = this.detectContentType()
      const baseNote = this.createBaseNote()
      
      let extractionResult

      switch (contentType) {
        case 'pdf':
          extractionResult = PDFExtractor.extract()
          break
        case 'video':
          extractionResult = VideoExtractor.extract()
          break
        case 'article':
        case 'research-paper':
          extractionResult = ArticleExtractor.extract()
          break
        default:
          extractionResult = this.extractGenericWebpage()
      }

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error
        }
      }

      // Construire la note finale
      const note: Omit<AcademicNote, 'id' | 'timestamp'> = {
        ...baseNote,
        title: extractionResult.title || baseNote.title,
        content: extractionResult.content || baseNote.content,
        summary: extractionResult.summary,
        type: contentType,
        metadata: {
          ...baseNote.metadata,
          ...extractionResult.metadata
        }
      }

      // Post-processing : enrichissement avec IA si disponible
      if (note.content && note.content.length > 200) {
        try {
          const enriched = await this.enrichWithAI(note)
          Object.assign(note, enriched)
        } catch (error) {
          console.warn('Enrichissement IA échoué:', error)
        }
      }

      return {
        success: true,
        note
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur extraction contenu'
      }
    }
  }

  /**
   * Détecter le type de contenu de la page actuelle
   */
  private static detectContentType(): ContentType {
    const url = window.location.href.toLowerCase()
    const hostname = window.location.hostname.toLowerCase()
    const title = document.title.toLowerCase()

    // PDF
    if (PDFExtractor.isPDFPage()) {
      return 'pdf'
    }

    // Vidéo
    if (VideoExtractor.isVideo()) {
      return 'video'
    }

    // Documentation
    if (hostname.includes('docs.') || 
        url.includes('/docs/') || 
        url.includes('/documentation/') ||
        title.includes('documentation') ||
        title.includes('api reference') ||
        title.includes('guide')) {
      return 'documentation'
    }

    // Article de recherche
    if (hostname.includes('scholar.google') ||
        hostname.includes('arxiv.org') ||
        hostname.includes('researchgate') ||
        hostname.includes('pubmed') ||
        hostname.includes('ieee') ||
        title.includes('research') ||
        title.includes('study') ||
        title.includes('journal') ||
        this.getMetaContent('citation_title') ||
        this.getMetaContent('article:section')) {
      return 'research-paper'
    }

    // Article (blog, news, etc.)
    if (ArticleExtractor.isArticle()) {
      return 'article'
    }

    // Page web générique
    return 'webpage'
  }

  /**
   * Créer une note de base avec les informations communes
   */
  private static createBaseNote(): Omit<AcademicNote, 'id' | 'timestamp'> {
    const url = window.location.href
    const domain = window.location.hostname
    
    return {
      title: document.title || 'Page sans titre',
      content: '',
      url,
      favicon: this.getFavicon(),
      type: 'webpage',
      metadata: {
        domain,
        language: document.documentElement.lang || 'fr',
        title: document.title,
        description: this.getMetaContent('description'),
        ogImage: this.getMetaContent('og:image'),
        siteName: this.getMetaContent('og:site_name')
      },
      tags: [],
      concepts: []
    }
  }

  /**
   * Extraction pour les pages web génériques
   */
  private static extractGenericWebpage() {
    try {
      const content = this.extractMainContent()
      const title = document.title
      const description = this.getMetaContent('description') || 
                         this.getMetaContent('og:description')

      return {
        success: true,
        title,
        content,
        metadata: {
          domain: window.location.hostname,
          title,
          description,
          language: document.documentElement.lang || 'fr',
          ogImage: this.getMetaContent('og:image'),
          siteName: this.getMetaContent('og:site_name')
        }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur extraction page web'
      }
    }
  }

  /**
   * Extraction du contenu principal d'une page générique
   */
  private static extractMainContent(): string {
    const contentSelectors = [
      'main',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      'article',
      '.post',
      '.entry'
    ]

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        const cleanedElement = this.cleanContent(element.cloneNode(true) as Element)
        const content = cleanedElement.textContent?.trim() || ''
        
        if (content.length > 100) {
          return content.substring(0, 8000) // Limiter la taille
        }
      }
    }

    // Fallback : body entier nettoyé
    const bodyClone = document.body.cloneNode(true) as Element
    const cleanedBody = this.cleanContent(bodyClone)
    const content = cleanedBody.textContent?.trim() || ''
    
    return content.substring(0, 8000)
  }

  /**
   * Nettoyer le contenu HTML
   */
  private static cleanContent(element: Element): Element {
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside',
      '.navigation', '.nav', '.menu', '.sidebar', '.widget',
      '.advertisement', '.ads', '.ad', '.social', '.share',
      '.comments', '.comment', '.related', '.recommended',
      '.cookie-banner', '.popup', '.modal', '.overlay',
      '[class*="ad-"]', '[id*="ad-"]'
    ]

    unwantedSelectors.forEach(selector => {
      element.querySelectorAll(selector).forEach(el => el.remove())
    })

    return element
  }

  /**
   * Enrichissement avec IA (Chrome AI si disponible)
   */
  private static async enrichWithAI(note: Omit<AcademicNote, 'id' | 'timestamp'>) {
    try {
      // Vérifier la disponibilité de Chrome AI
      if (typeof window !== 'undefined' && 'ai' in window) {
        const ai = (window as any).ai
        
        if (ai && ai.canCreateTextSession) {
          const canCreate = await ai.canCreateTextSession()
          
          if (canCreate === 'readily') {
            const session = await ai.createTextSession()
            
            // Générer un résumé
            if (!note.summary && note.content.length > 500) {
              const summaryPrompt = `Résume ce contenu en français en 2-3 phrases clés :\n\n${note.content.substring(0, 2000)}`
              const summary = await session.prompt(summaryPrompt)
              note.summary = summary.trim()
            }

            // Extraire des concepts clés
            if (note.concepts.length === 0) {
              const conceptsPrompt = `Extrais 3-5 concepts clés académiques de ce contenu (mots-clés séparés par des virgules) :\n\n${note.content.substring(0, 1500)}`
              const conceptsResponse = await session.prompt(conceptsPrompt)
              const concepts = conceptsResponse.split(',')
                .map(c => c.trim())
                .filter(c => c.length > 2 && c.length < 30)
                .slice(0, 5)
              
              note.concepts = concepts
            }

            // Générer des tags automatiques
            if (note.tags.length === 0) {
              const tagsPrompt = `Génère 2-3 tags pertinents pour classer ce contenu (mots-clés courts séparés par des virgules) :\n\n${note.title}\n${note.metadata.description || ''}`
              const tagsResponse = await session.prompt(tagsPrompt)
              const tags = tagsResponse.split(',')
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 2 && t.length < 20)
                .slice(0, 3)
              
              note.tags = [...note.tags, ...tags]
            }

            session.destroy()
          }
        }
      }
    } catch (error) {
      console.warn('Enrichissement IA non disponible:', error)
    }

    return note
  }

  /**
   * Obtenir le favicon de la page
   */
  private static getFavicon(): string | undefined {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel*="icon"]')
    if (favicon?.href) {
      return favicon.href
    }
    
    // Fallback vers favicon.ico
    return `${window.location.protocol}//${window.location.hostname}/favicon.ico`
  }

  /**
   * Obtenir le contenu d'une métadonnée
   */
  private static getMetaContent(name: string): string {
    const selectors = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[name="twitter:${name}"]`,
      `meta[property="twitter:${name}"]`
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
   * Extraction rapide pour capture instantanée
   */
  static quickExtract(): ExtractionResult {
    try {
      const baseNote = this.createBaseNote()
      const contentPreview = this.extractMainContent().substring(0, 1000)
      
      return {
        success: true,
        note: {
          ...baseNote,
          content: contentPreview,
          type: this.detectContentType()
        }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Erreur extraction rapide'
      }
    }
  }
}