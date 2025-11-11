import type { ContentMetadata } from '@/types/academic'

export interface VideoExtractResult {
  success: boolean
  title?: string
  description?: string
  transcript?: string
  metadata?: ContentMetadata
  error?: string
}

/**
 * Extracteur spécialisé pour les vidéos YouTube, Vimeo et autres plateformes
 */
export class VideoExtractor {
  static extract(): VideoExtractResult {
    try {
      const platform = this.detectVideoPlatform()
      
      switch (platform) {
        case 'youtube':
          return this.extractYouTube()
        case 'vimeo':
          return this.extractVimeo()
        case 'generic':
          return this.extractGenericVideo()
        default:
          return {
            success: false,
            error: 'Plateforme vidéo non supportée'
          }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur extraction vidéo'
      }
    }
  }

  private static detectVideoPlatform(): 'youtube' | 'vimeo' | 'generic' | 'none' {
    const hostname = window.location.hostname.toLowerCase()
    const url = window.location.href.toLowerCase()
    
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube'
    }
    
    if (hostname.includes('vimeo.com')) {
      return 'vimeo'
    }
    
    // Détecter les vidéos génériques
    if (document.querySelector('video') || 
        url.includes('/video/') || 
        url.includes('/watch/')) {
      return 'generic'
    }
    
    return 'none'
  }

  private static extractYouTube(): VideoExtractResult {
    const metadata: ContentMetadata = {
      domain: 'youtube.com',
      language: document.documentElement.lang || 'fr'
    }

    // Titre de la vidéo
    const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                        document.querySelector('.watch-main-col .watch-title') ||
                        document.querySelector('[data-title]')
    
    const title = titleElement?.textContent?.trim() || document.title.replace(' - YouTube', '')

    // Description
    const descriptionElement = document.querySelector('#description yt-formatted-string') ||
                              document.querySelector('.watch-main-col .watch-description') ||
                              document.querySelector('[data-description]')
    
    const description = descriptionElement?.textContent?.trim() || ''

    // Métadonnées enrichies
    metadata.title = title
    metadata.description = description
    
    // Auteur/Chaîne
    const channelElement = document.querySelector('#channel-name a') ||
                          document.querySelector('.ytd-channel-name a') ||
                          document.querySelector('[data-channel-name]')
    
    if (channelElement) {
      metadata.author = channelElement.textContent?.trim() || ''
    }

    // Date de publication
    const dateElement = document.querySelector('#info-strings yt-formatted-string') ||
                       document.querySelector('.watch-main-col .watch-meta-item')
    
    if (dateElement) {
      metadata.publishDate = dateElement.textContent?.trim() || ''
    }

    // Durée de la vidéo
    const durationElement = document.querySelector('.ytp-time-duration') ||
                           document.querySelector('[data-duration]')
    
    if (durationElement) {
      const durationText = durationElement.textContent?.trim()
      if (durationText) {
        metadata.duration = this.parseDuration(durationText)
      }
    }

    // Miniature
    const thumbnailElement = document.querySelector('.html5-main-video') as HTMLVideoElement
    if (thumbnailElement?.poster) {
      metadata.ogImage = thumbnailElement.poster
    }

    // Tentative d'extraction des sous-titres
    const transcript = this.extractYouTubeTranscript()

    return {
      success: true,
      title,
      description,
      transcript,
      metadata
    }
  }

  private static extractVimeo(): VideoExtractResult {
    const metadata: ContentMetadata = {
      domain: 'vimeo.com',
      language: document.documentElement.lang || 'fr'
    }

    // Titre
    const titleElement = document.querySelector('.clip_info-subline--title') ||
                        document.querySelector('h1')
    
    const title = titleElement?.textContent?.trim() || document.title.replace(' on Vimeo', '')

    // Description
    const descriptionElement = document.querySelector('.clip_info-description') ||
                              document.querySelector('[data-description]')
    
    const description = descriptionElement?.textContent?.trim() || ''

    // Métadonnées
    metadata.title = title
    metadata.description = description
    
    // Auteur
    const authorElement = document.querySelector('.clip_info-subline--byline a') ||
                         document.querySelector('[data-creator]')
    
    if (authorElement) {
      metadata.author = authorElement.textContent?.trim() || ''
    }

    // Miniature
    const metaImage = this.getMetaContent('og:image') || this.getMetaContent('twitter:image')
    if (metaImage) {
      metadata.ogImage = metaImage
    }

    return {
      success: true,
      title,
      description,
      metadata
    }
  }

  private static extractGenericVideo(): VideoExtractResult {
    const metadata: ContentMetadata = {
      domain: window.location.hostname,
      language: document.documentElement.lang || 'fr'
    }

    // Utiliser les métadonnées génériques
    const title = this.getMetaContent('og:title') || document.title
    const description = this.getMetaContent('og:description') || 
                       this.getMetaContent('description') || ''
    
    metadata.title = title
    metadata.description = description
    metadata.ogImage = this.getMetaContent('og:image')

    // Chercher des éléments vidéo
    const videoElement = document.querySelector('video') as HTMLVideoElement
    if (videoElement) {
      metadata.duration = videoElement.duration || 0
    }

    return {
      success: true,
      title,
      description,
      metadata
    }
  }

  private static extractYouTubeTranscript(): string {
    try {
      // Note: L'extraction de sous-titres YouTube nécessite souvent 
      // l'API YouTube ou des techniques plus avancées
      // Ici on fait une tentative basique
      
      const transcriptElement = document.querySelector('.ytd-transcript-segment-renderer') ||
                               document.querySelector('[data-transcript]')
      
      if (transcriptElement) {
        return transcriptElement.textContent?.trim() || ''
      }

      // Chercher dans les sous-titres automatiques si activés
      const captionElements = document.querySelectorAll('.captions-text')
      if (captionElements.length > 0) {
        return Array.from(captionElements)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' ')
      }

      return ''
    } catch (error) {
      console.warn('Impossible d\'extraire les sous-titres:', error)
      return ''
    }
  }

  private static parseDuration(durationText: string): number {
    try {
      // Format: "12:34" ou "1:23:45"
      const parts = durationText.split(':').map(Number).reverse()
      let seconds = 0
      
      if (parts[0]) seconds += parts[0] // secondes
      if (parts[1]) seconds += parts[1] * 60 // minutes
      if (parts[2]) seconds += parts[2] * 3600 // heures
      
      return seconds
    } catch (error) {
      return 0
    }
  }

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
   * Détecter si la page actuelle contient une vidéo
   */
  static isVideo(): boolean {
    const hostname = window.location.hostname.toLowerCase()
    const url = window.location.href.toLowerCase()
    
    // Plateformes vidéo connues
    const videoPlatforms = [
      'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com',
      'twitch.tv', 'wistia.com', 'brightcove.com'
    ]
    
    if (videoPlatforms.some(platform => hostname.includes(platform))) {
      return true
    }

    // Indicateurs URL
    const videoUrlPatterns = [
      '/video/', '/watch/', '/v/', '/embed/', '/player/'
    ]
    
    if (videoUrlPatterns.some(pattern => url.includes(pattern))) {
      return true
    }

    // Présence d'éléments vidéo
    if (document.querySelector('video') ||
        document.querySelector('[data-video]') ||
        document.querySelector('.video-player')) {
      return true
    }

    // Métadonnées vidéo
    if (this.getMetaContent('og:type') === 'video' ||
        this.getMetaContent('twitter:card') === 'player') {
      return true
    }

    return false
  }
}