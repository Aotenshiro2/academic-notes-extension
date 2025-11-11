import type { ContentMetadata } from '@/types/academic'

export interface ArticleExtractResult {
  success: boolean
  title?: string
  content?: string
  summary?: string
  metadata?: ContentMetadata
  error?: string
}

/**
 * Extracteur spécialisé pour les articles académiques et de blog
 */
export class ArticleExtractor {
  static extract(): ArticleExtractResult {
    try {
      const metadata = this.extractMetadata()
      const content = this.extractMainContent()
      const title = this.extractTitle()
      
      if (!content || content.length < 100) {
        return {
          success: false,
          error: 'Contenu insuffisant pour constituer un article'
        }
      }

      return {
        success: true,
        title,
        content,
        metadata,
        summary: this.generateQuickSummary(content)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur extraction article'
      }
    }
  }

  private static extractTitle(): string {
    // Priorité aux métadonnées structurées
    const ogTitle = this.getMetaContent('og:title')
    const twitterTitle = this.getMetaContent('twitter:title')
    const articleTitle = document.querySelector('article h1, .article-title, .post-title')?.textContent?.trim()
    
    return ogTitle || twitterTitle || articleTitle || document.title
  }

  private static extractMetadata(): ContentMetadata {
    const metadata: ContentMetadata = {
      domain: window.location.hostname,
      language: document.documentElement.lang || 'fr'
    }

    // Métadonnées Open Graph et Twitter Cards
    metadata.title = this.getMetaContent('og:title') || document.title
    metadata.description = this.getMetaContent('og:description') || 
                          this.getMetaContent('description') ||
                          this.getMetaContent('twitter:description')
    metadata.ogImage = this.getMetaContent('og:image') || this.getMetaContent('twitter:image')
    metadata.siteName = this.getMetaContent('og:site_name')

    // Métadonnées d'article
    metadata.author = this.extractAuthor()
    metadata.publishDate = this.extractPublishDate()
    metadata.keywords = this.getMetaContent('keywords')?.split(',').map(k => k.trim())

    // Métadonnées académiques spécifiques
    metadata.journal = this.getMetaContent('citation_journal_title')
    metadata.doi = this.getMetaContent('citation_doi')
    
    // Tentative d'extraction du nombre de citations
    const citationElement = document.querySelector('[class*="citation"], [class*="cited"]')
    if (citationElement) {
      const citationText = citationElement.textContent || ''
      const citationMatch = citationText.match(/(\d+)\s*citations?/i)
      if (citationMatch) {
        metadata.citations = parseInt(citationMatch[1])
      }
    }

    return metadata
  }

  private static extractAuthor(): string {
    const authorSelectors = [
      'meta[name="author"]',
      'meta[name="citation_author"]',
      'meta[property="article:author"]',
      '.author',
      '.byline',
      '.article-author',
      '[rel="author"]'
    ]

    for (const selector of authorSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        const content = element.getAttribute('content') || element.textContent
        if (content?.trim()) {
          return content.trim()
        }
      }
    }

    return ''
  }

  private static extractPublishDate(): string {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="publication_date"]',
      'meta[name="date"]',
      'meta[name="citation_publication_date"]',
      'time[datetime]',
      '.publish-date',
      '.publication-date',
      '.date'
    ]

    for (const selector of dateSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        const dateValue = element.getAttribute('content') || 
                         element.getAttribute('datetime') || 
                         element.textContent

        if (dateValue?.trim()) {
          return dateValue.trim()
        }
      }
    }

    return ''
  }

  private static extractMainContent(): string {
    // Sélecteurs prioritaires pour articles académiques
    const contentSelectors = [
      'article',
      '.article-content',
      '.entry-content',
      '.post-content',
      '.content',
      'main',
      '[role="main"]',
      '.main-content',
      '#content'
    ]

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        const cleanedContent = this.cleanContent(element.cloneNode(true) as Element)
        const textContent = cleanedContent.textContent?.trim() || ''
        
        if (textContent.length > 200) {
          return textContent
        }
      }
    }

    // Fallback: nettoyer le body entier
    const bodyClone = document.body.cloneNode(true) as Element
    const cleanedBody = this.cleanContent(bodyClone)
    return cleanedBody.textContent?.trim() || ''
  }

  private static cleanContent(element: Element): Element {
    // Éléments à supprimer complètement
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside',
      '.navigation', '.nav', '.menu', '.sidebar', '.widget',
      '.advertisement', '.ads', '.ad', '.social', '.share',
      '.comments', '.comment', '.related', '.recommended',
      '.cookie-banner', '.popup', '.modal', '.overlay',
      '.newsletter', '.subscription', '.signup',
      '[class*="ad-"]', '[id*="ad-"]', '[class*="advertisement"]'
    ]

    unwantedSelectors.forEach(selector => {
      element.querySelectorAll(selector).forEach(el => el.remove())
    })

    // Nettoyer les attributs pour réduire la taille
    element.querySelectorAll('*').forEach(el => {
      const attributesToKeep = ['href', 'src', 'alt', 'title']
      Array.from(el.attributes).forEach(attr => {
        if (!attributesToKeep.includes(attr.name)) {
          el.removeAttribute(attr.name)
        }
      })
    })

    return element
  }

  private static generateQuickSummary(content: string): string {
    if (content.length < 500) return ''

    // Extraction simple des premières phrases significatives
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20)
    
    if (sentences.length < 2) return ''

    // Prendre les 2-3 premières phrases représentatives
    const summary = sentences.slice(0, 3).join('. ').trim()
    
    return summary.length > 200 ? summary.substring(0, 200) + '...' : summary + '.'
  }

  private static getMetaContent(name: string): string {
    const selectors = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[name="twitter:${name}"]`,
      `meta[property="twitter:${name}"]`,
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
   * Détecter si la page actuelle est un article
   */
  static isArticle(): boolean {
    const url = window.location.href.toLowerCase()
    const title = document.title.toLowerCase()
    
    // Indicateurs URL
    const urlIndicators = [
      '/article/', '/post/', '/blog/', '/news/', '/story/',
      '/research/', '/study/', '/paper/', '/publication/'
    ]
    
    if (urlIndicators.some(indicator => url.includes(indicator))) {
      return true
    }

    // Métadonnées structurées
    if (this.getMetaContent('article:published_time') ||
        this.getMetaContent('article:author') ||
        this.getMetaContent('citation_title')) {
      return true
    }

    // Éléments HTML caractéristiques
    if (document.querySelector('article') ||
        document.querySelector('.article-content') ||
        document.querySelector('[class*="post-content"]')) {
      return true
    }

    // Mots-clés dans le titre
    const titleIndicators = [
      'article', 'study', 'research', 'analysis', 'review',
      'journal', 'publication', 'paper'
    ]
    
    if (titleIndicators.some(indicator => title.includes(indicator))) {
      return true
    }

    return false
  }
}