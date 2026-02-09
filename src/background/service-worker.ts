import type { ExtensionMessage, CaptureResult } from '@/types/academic'

// Garder le service worker actif
function keepAlive() {
  setInterval(() => {
    chrome.runtime.getPlatformInfo()
  }, 20000)
}

// Initialisation du service worker
chrome.runtime.onStartup.addListener(() => {
  // Service worker démarré
  keepAlive()
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('Academic Notes Extension installed')
  setupContextMenus()
  keepAlive()
})

// Configuration des menus contextuels (clic droit uniquement)
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-sidebar',
      title: 'Ouvrir Trading Notes',
      contexts: ['page', 'selection']
    })

    chrome.contextMenus.create({
      id: 'capture-selection',
      title: 'Capturer la sélection',
      contexts: ['selection']
    })

    chrome.contextMenus.create({
      id: 'capture-page',
      title: 'Capturer cette page',
      contexts: ['page']
    })

    chrome.contextMenus.create({
      id: 'take-screenshot',
      title: 'Prendre une capture d\'écran',
      contexts: ['page']
    })
  })
}

// Gestion des clics sur les menus contextuels
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return

  switch (info.menuItemId) {
    case 'open-sidebar':
      await chrome.sidePanel.open({ tabId: tab.id })
      break

    case 'capture-selection':
      if (info.selectionText) {
        await captureSelection(tab.id, info.selectionText)
      }
      break

    case 'capture-page':
      await capturePage(tab.id)
      break

    case 'take-screenshot':
      await takeScreenshot(tab.id)
      break
  }
})

// Gestion des commandes clavier
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return

  switch (command) {
    case 'toggle-sidebar':
      await chrome.sidePanel.open({ tabId: tab.id })
      break

    case 'quick-capture':
      await capturePage(tab.id)
      break
  }
})

// Clic sur l'icône de l'extension - Ouvrir le sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id })
    } catch (error) {
      console.error('Error opening sidepanel:', error)
    }
  }
})

// Gestion des messages entre composants
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse)
  return true // Réponse asynchrone
})

// Gestionnaire principal des messages
async function handleMessage(
  message: ExtensionMessage, 
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  try {
    const tabId = sender.tab?.id || message.tabId

    switch (message.type) {
      case 'CAPTURE_CURRENT_PAGE':
        if (tabId) {
          const result = await capturePage(tabId)
          sendResponse(result)
        }
        break

      case 'CAPTURE_SELECTION':
        if (tabId) {
          const result = await captureSelection(tabId, message.payload.text)
          sendResponse(result)
        }
        break

      case 'CAPTURE_SCREENSHOT':
        // Get active tab if tabId not provided (sidepanel doesn't have sender.tab)
        let screenshotTabId = tabId
        if (!screenshotTabId) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
          screenshotTabId = activeTab?.id
        }
        if (screenshotTabId) {
          try {
            // Capturer et retourner le dataUrl directement (pour l'éditeur)
            const dataUrl = await chrome.tabs.captureVisibleTab()
            sendResponse({ success: true, dataUrl })
          } catch (error) {
            sendResponse({ success: false, error: 'Erreur capture d\'écran' })
          }
        } else {
          sendResponse({ success: false, error: 'Impossible de trouver l\'onglet actif' })
        }
        break

      case 'OPEN_SIDEBAR':
        if (tabId) {
          await chrome.sidePanel.open({ tabId })
          sendResponse({ success: true })
        }
        break

      case 'SMART_CAPTURE':
        // Get current active tab if tabId not provided (sidepanel doesn't have sender.tab)
        let smartCaptureTabId = tabId
        if (!smartCaptureTabId) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
          smartCaptureTabId = activeTab?.id
        }
        if (smartCaptureTabId) {
          const result = await smartCapture(smartCaptureTabId)
          sendResponse(result)
        } else {
          sendResponse({ success: false, error: 'Impossible de trouver l\'onglet actif' })
        }
        break

      case 'EXTRACT_CONTENT':
        if (tabId) {
          const result = await extractPageContent(tabId)
          sendResponse(result)
        }
        break

      default:
        sendResponse({ error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('Error handling message:', error)
    sendResponse({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
}

// ---- FONCTIONS DE CAPTURE ----

async function capturePage(tabId: number): Promise<CaptureResult> {
  try {
    // Obtenir les informations de l'onglet
    const tab = await chrome.tabs.get(tabId)
    
    // Extraire le contenu principal
    const [{ result: contentData }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractMainContent
    })

    if (!contentData.success) {
      return { success: false, error: contentData.error }
    }

    // Créer la note académique
    const note = {
      id: Date.now().toString(),
      title: contentData.title || tab.title || 'Page sans titre',
      content: contentData.content || '',
      url: tab.url || '',
      favicon: tab.favIconUrl,
      timestamp: Date.now(),
      type: detectContentType(tab.url || '', contentData.title || ''),
      metadata: {
        domain: new URL(tab.url || '').hostname,
        title: contentData.title,
        description: contentData.description,
        author: contentData.author,
        publishDate: contentData.publishDate,
        ogImage: contentData.ogImage,
        siteName: contentData.siteName,
        language: contentData.language
      },
      tags: [],
      concepts: [],
      screenshots: []
    }

    // Sauvegarder dans IndexedDB via le content script
    await chrome.tabs.sendMessage(tabId, {
      type: 'SAVE_NOTE',
      payload: { note }
    })

    return { success: true, note }
  } catch (error) {
    console.error('Error capturing page:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur de capture' 
    }
  }
}

async function captureSelection(tabId: number, selectedText: string): Promise<CaptureResult> {
  try {
    const tab = await chrome.tabs.get(tabId)
    
    const note = {
      id: Date.now().toString(),
      title: `Sélection - ${tab.title || 'Page'}`,
      content: selectedText,
      url: tab.url || '',
      favicon: tab.favIconUrl,
      timestamp: Date.now(),
      type: 'webpage' as const,
      metadata: {
        domain: new URL(tab.url || '').hostname,
        title: tab.title
      },
      tags: ['sélection'],
      concepts: [],
      screenshots: []
    }

    await chrome.tabs.sendMessage(tabId, {
      type: 'SAVE_NOTE',
      payload: { note }
    })

    return { success: true, note }
  } catch (error) {
    console.error('Error capturing selection:', error)
    return { success: false, error: 'Erreur capture sélection' }
  }
}

async function takeScreenshot(tabId: number): Promise<CaptureResult> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab()
    const tab = await chrome.tabs.get(tabId)

    // Créer une note avec la capture d'écran
    const note = {
      id: Date.now().toString(),
      title: `Capture d'écran - ${tab.title || 'Page'}`,
      content: `![Capture d'écran](${dataUrl})`,
      url: tab.url || '',
      favicon: tab.favIconUrl,
      timestamp: Date.now(),
      type: 'webpage' as const,
      metadata: {
        domain: new URL(tab.url || '').hostname,
        title: tab.title
      },
      tags: ['capture'],
      concepts: [],
      screenshots: []
    }

    await chrome.tabs.sendMessage(tabId, {
      type: 'SAVE_NOTE',
      payload: { note }
    })

    return { success: true, note }
  } catch (error) {
    console.error('Error taking screenshot:', error)
    return { success: false, error: 'Erreur capture d\'écran' }
  }
}

async function captureScreenshotForNote(tabId: number, options: any) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab()
    
    return { 
      success: true, 
      dataUrl,
      message: 'Screenshot captured successfully'
    }
  } catch (error) {
    console.error('Error capturing screenshot for note:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur capture d\'écran' 
    }
  }
}

async function extractPageContent(tabId: number) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractMainContent
    })
    return result
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur extraction' }
  }
}

// ---- FONCTIONS D'EXTRACTION (injectées dans la page) ----

function extractMainContent() {
  try {
    // Extraction du contenu principal avec différentes stratégies
    let content = ''
    let title = ''
    let description = ''
    let author = ''
    let publishDate = ''
    let ogImage = ''
    let siteName = ''
    let language = document.documentElement.lang || 'fr'

    // Titre de la page
    title = document.title

    // Métadonnées Open Graph et Twitter
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
    const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content')
    const metaAuthor = document.querySelector('meta[name="author"]')?.getAttribute('content')
    const twitterDesc = document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')

    title = ogTitle || title
    description = ogDesc || metaDesc || twitterDesc || ''
    author = metaAuthor || ''
    ogImage = ogImg || ''
    siteName = ogSite || ''

    // Date de publication (formats courants)
    const pubDateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="publication_date"]',
      'meta[name="date"]',
      'time[datetime]',
      '[datetime]'
    ]

    for (const selector of pubDateSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        publishDate = element.getAttribute('content') ||
                     element.getAttribute('datetime') ||
                     element.textContent || ''
        break
      }
    }

    // Extraction du contenu principal - sélecteurs étendus pour blogs
    const contentSelectors = [
      // Sélecteurs sémantiques standards
      'article',
      'main',
      '[role="main"]',
      // Classes communes de blog/CMS
      '.post-content',
      '.entry-content',
      '.article-content',
      '.blog-content',
      '.blog-post',
      '.post-body',
      '.post',
      '.content',
      '.main-content',
      '.page-content',
      '.story-content',
      '.single-content',
      // IDs communs
      '#content',
      '#main',
      '#main-content',
      '#post',
      '#article',
      '#post-content',
      // Microdata
      '[itemprop="articleBody"]',
      '[itemprop="text"]',
      // WordPress spécifique
      '.wp-content',
      '.the-content',
      // Medium/Ghost
      '.section-content',
      '.post-full-content'
    ]

    let mainElement: Element | null = null

    for (const selector of contentSelectors) {
      mainElement = document.querySelector(selector)
      if (mainElement && mainElement.textContent && mainElement.textContent.trim().length > 100) {
        break
      }
      mainElement = null // Reset si le contenu est trop court
    }

    if (mainElement) {
      // Nettoyer le contenu (supprimer scripts, styles, nav, etc.)
      const clonedElement = mainElement.cloneNode(true) as Element

      // Supprimer les éléments indésirables
      const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.ads', '.advertisement', '.social', '.share', '.sidebar',
        '.comments', '.comment', '.related', '.recommended',
        '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]',
        // YouTube-specific selectors
        '#secondary', '#related', '#comments',
        '.ytd-compact-video-renderer',
        '.ytd-watch-next-secondary-results-renderer',
        '[class*="ytp-endscreen"]',
        '.ytd-item-section-renderer',
        '.ytd-shelf-renderer',
        '#playlist',
        '.ytd-merch-shelf-renderer',
        '.ytd-watch-flexy #secondary-inner',
        '.ytd-watch-next-secondary-results-renderer'
      ]

      unwantedSelectors.forEach(selector => {
        try {
          clonedElement.querySelectorAll(selector).forEach(el => el.remove())
        } catch { /* ignore invalid selectors */ }
      })

      content = clonedElement.textContent?.trim() || ''
    }

    // Fallback robuste : utiliser document.body.innerText si rien trouvé
    if (!content || content.length < 100) {
      // Créer un clone du body pour nettoyer
      const bodyClone = document.body.cloneNode(true) as Element

      // Supprimer les éléments non-textuels
      bodyClone.querySelectorAll('script, style, nav, header, footer, aside, noscript, iframe, svg, img, video, audio').forEach(el => el.remove())

      // Utiliser innerText pour un texte plus propre (respecte le CSS display:none)
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = bodyClone.innerHTML
      document.body.appendChild(tempDiv)
      content = tempDiv.innerText?.trim() || ''
      tempDiv.remove()

      // Si toujours vide, fallback absolu
      if (!content || content.length < 50) {
        content = document.body.innerText?.trim() || ''
      }
    }

    // Limiter la taille du contenu
    if (content.length > 15000) {
      content = content.substring(0, 15000) + '...'
    }

    return {
      success: true,
      title,
      content,
      description,
      author,
      publishDate,
      ogImage,
      siteName,
      language
    }
  } catch (error) {
    // Fallback absolu en cas d'erreur
    try {
      return {
        success: true,
        title: document.title,
        content: document.body.innerText?.substring(0, 15000) || '',
        description: '',
        author: '',
        publishDate: '',
        ogImage: '',
        siteName: '',
        language: 'fr'
      }
    } catch {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur extraction contenu'
      }
    }
  }
}

// ---- CAPTURE INTELLIGENTE (MODE GRATUIT - HEURISTIQUES) ----

// Fonction injectée pour extraire le contenu structuré par heuristiques
function extractStructuredContent() {
  try {
    // 1. Résumé = meta description ou premier paragraphe significatif
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content')
    const metaOgDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content')

    // Chercher le premier paragraphe significatif
    const paragraphs = document.querySelectorAll('article p, main p, .content p, .post-content p, .entry-content p, p')
    let firstSignificantP = ''
    for (const p of paragraphs) {
      const text = p.textContent?.trim() || ''
      if (text.length > 80) {
        firstSignificantP = text.slice(0, 400)
        break
      }
    }

    const summary = metaOgDesc || metaDesc || firstSignificantP || document.title

    // 2. Points clés = titres H2/H3 du CONTENU PRINCIPAL UNIQUEMENT
    // D'abord trouver le conteneur principal
    const mainContainer = document.querySelector('article') ||
                          document.querySelector('main') ||
                          document.querySelector('[role="main"]') ||
                          document.querySelector('.post-content') ||
                          document.querySelector('.entry-content') ||
                          document.querySelector('.article-content') ||
                          document.querySelector('.blog-content') ||
                          document.querySelector('#content')

    // Liste noire complète des termes de sidebar/navigation/réseaux sociaux
    const blacklistTerms = [
      // Navigation
      'related', 'comments', 'share', 'subscribe', 'newsletter',
      'suivez', 'partager', 'also read', 'see also', 'à lire',
      'menu', 'navigation', 'footer', 'header', 'sidebar',
      'contact', 'about', 'à propos',
      // Réseaux sociaux
      'instagram', 'facebook', 'twitter', 'tiktok', 'linkedin', 'youtube',
      'pinterest', 'snapchat', 'discord', 'whatsapp', 'telegram',
      // Widgets sidebar
      'publications recommandées', 'articles similaires', 'articles récents',
      'recommended', 'popular posts', 'trending', 'recent posts',
      'archives', 'catégories', 'categories', 'tags',
      'recherche', 'search', 'widget'
    ]

    const isBlacklisted = (text: string): boolean => {
      const lower = text.toLowerCase()
      return blacklistTerms.some(term => lower.includes(term))
    }

    let headings: string[] = []

    if (mainContainer) {
      // Extraire H2/H3 SEULEMENT du conteneur principal avec filtre strict
      headings = Array.from(mainContainer.querySelectorAll('h2, h3'))
        .map(h => h.textContent?.trim())
        .filter((text): text is string =>
          !!text &&
          text.length > 5 &&
          text.length < 150 &&
          !isBlacklisted(text)
        )
        .slice(0, 8)
    }

    // PAS DE FALLBACK GLOBAL SUR h2, h3 (ça capture la sidebar!)
    // Si pas de headings, aller DIRECTEMENT aux paragraphes

    if (headings.length === 0) {
      // Extraire les premières phrases significatives des paragraphes du contenu principal
      const contentParagraphs = (mainContainer || document).querySelectorAll('p')
      headings = Array.from(contentParagraphs)
        .map(p => p.textContent?.trim())
        .filter((text): text is string =>
          !!text &&
          text.length > 80 &&
          !isBlacklisted(text)
        )
        .slice(0, 5)
        .map(text => {
          // Prendre la première phrase significative
          const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0]
          return firstSentence?.trim() || text.slice(0, 120) + '...'
        })
    }

    // 3. Concepts = texte en gras/strong + liens importants
    const bolds = Array.from(document.querySelectorAll('article strong, article b, main strong, main b, .content strong, .content b'))
      .map(el => el.textContent?.trim())
      .filter((t): t is string => !!t && t.length > 2 && t.length < 60)

    const importantLinks = Array.from(document.querySelectorAll('article a, main a, .content a'))
      .map(a => a.textContent?.trim())
      .filter((t): t is string => !!t && t.length > 3 && t.length < 50 && !t.startsWith('http'))

    const concepts = [...new Set([...bolds, ...importantLinks])].slice(0, 10)

    // 4. Tags = meta keywords ou catégories/tags de la page
    const metaKeywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content')
    let tags: string[] = []

    if (metaKeywords) {
      tags = metaKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 1 && k.length < 30)
    }

    // Chercher aussi les tags/catégories dans la page
    if (tags.length === 0) {
      const tagElements = document.querySelectorAll('.tag, .tags a, .category, .categories a, [rel="tag"]')
      tags = Array.from(tagElements)
        .map(el => el.textContent?.trim().toLowerCase())
        .filter((t): t is string => !!t && t.length > 1 && t.length < 30)
    }

    tags = [...new Set(tags)].slice(0, 6)

    // 5. Contenu principal
    let content = ''
    const contentSelectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '.content', '#content']

    for (const selector of contentSelectors) {
      const el = document.querySelector(selector)
      if (el) {
        const clone = el.cloneNode(true) as Element
        // Remove unwanted elements including YouTube-specific ones
        const unwantedSelectors = [
          'script', 'style', 'nav', 'aside', 'footer', '.ads', '.comments',
          // YouTube-specific
          '#secondary', '#related', '.ytd-compact-video-renderer',
          '.ytd-watch-next-secondary-results-renderer', '[class*="ytp-endscreen"]',
          '.ytd-item-section-renderer', '.ytd-shelf-renderer', '#playlist',
          '.ytd-merch-shelf-renderer'
        ]
        unwantedSelectors.forEach(sel => {
          try { clone.querySelectorAll(sel).forEach(e => e.remove()) } catch {}
        })
        content = clone.textContent?.trim() || ''
        if (content.length > 100) break
      }
    }

    if (!content || content.length < 100) {
      content = document.body.innerText?.trim() || ''
    }

    // Limiter la taille
    if (content.length > 10000) {
      content = content.substring(0, 10000) + '...'
    }

    return {
      success: true,
      title: document.title,
      content,
      summary,
      keyPoints: headings,
      concepts,
      tags,
      description: metaOgDesc || metaDesc || '',
      author: document.querySelector('meta[name="author"]')?.getAttribute('content') || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      siteName: document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || ''
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur extraction'
    }
  }
}

async function smartCapture(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId)
    const url = tab.url || ''
    const isYouTube = url.includes('youtube.com/watch') || url.includes('youtu.be/')

    let pageTitle = tab.title || 'Page sans titre'
    let content = ''
    let summary = ''
    let keyPoints: string[] = []
    let concepts: string[] = []
    let tags: string[] = []
    let description = ''
    let author = ''
    let ogImage = ''
    let siteName = ''

    if (isYouTube) {
      // Pour YouTube, extraire la transcription/description
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractYouTubeContent
        })
        const ytData = results?.[0]?.result
        if (ytData) {
          pageTitle = ytData.title || pageTitle
          author = ytData.author || ''
          description = ytData.description || ''

          // Priorité des points clés:
          // 1. Chapitres (timestamps dans description)
          // 2. Points clés de la transcription (si disponible)
          // 3. Points clés extraits de la description
          if (ytData.chapters && ytData.chapters.length > 0) {
            keyPoints = ytData.chapters.slice(0, 8)
          } else if (ytData.transcriptKeyPoints && ytData.transcriptKeyPoints.length > 0) {
            keyPoints = ytData.transcriptKeyPoints
          } else if (ytData.descriptionKeyPoints && ytData.descriptionKeyPoints.length > 0) {
            keyPoints = ytData.descriptionKeyPoints
          }

          // Contenu = transcription ou description
          content = ytData.transcript || ytData.description || ''
          summary = author ? `Vidéo de ${author}: ${pageTitle}` : pageTitle
        }
      } catch (error) {
        console.warn('YouTube extraction failed:', error)
      }
    }

    // Extraction structurée par heuristiques pour les pages web (PAS pour YouTube)
    // Car extractStructuredContent() capture les titres des vidéos recommandées
    if (!isYouTube && (!content || content.length < 50)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractStructuredContent
        })
        const data = results?.[0]?.result

        if (data?.success) {
          pageTitle = data.title || pageTitle
          content = data.content || ''
          summary = data.summary || ''
          keyPoints = data.keyPoints || []
          concepts = data.concepts || []
          tags = data.tags || []
          description = data.description || ''
          author = data.author || ''
          ogImage = data.ogImage || ''
          siteName = data.siteName || ''
        }
      } catch (error) {
        console.warn('Structured extraction failed:', error)
      }
    }

    // Dernier recours: extraction simple - MAIS PAS POUR YOUTUBE
    // YouTube a une UI complexe, innerText capture des éléments d'interface
    if (!isYouTube && (!content || content.length < 50)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({
            text: document.body?.innerText?.trim() || '',
            title: document.title
          })
        })
        const simple = results?.[0]?.result
        if (simple?.text && simple.text.length > 50) {
          content = simple.text.substring(0, 10000)
          pageTitle = simple.title || pageTitle
          summary = content.slice(0, 300)
        }
      } catch (error) {
        console.warn('Simple extraction failed:', error)
      }
    }

    // Pour YouTube, si content est toujours vide, utiliser les meta OG tags
    if (isYouTube && (!content || content.length < 50)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
            const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
            const channelName = document.querySelector('link[itemprop="name"]')?.getAttribute('content') ||
                               document.querySelector('#channel-name')?.textContent?.trim()
            return { ogTitle, ogDesc, channelName }
          }
        })
        const meta = results?.[0]?.result
        if (meta) {
          pageTitle = meta.ogTitle || pageTitle
          description = meta.ogDesc || description
          author = meta.channelName || author
          content = description || pageTitle
          summary = author
            ? `Vidéo de ${author}: ${pageTitle}`
            : `Vidéo YouTube: ${pageTitle}`
        }
      } catch (error) {
        console.warn('YouTube meta extraction failed:', error)
      }
    }

    // Si toujours pas de contenu pour YouTube, extraction robuste du titre
    if (isYouTube && (!content || content.length < 50)) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            // Essayer plusieurs méthodes pour obtenir le titre
            const docTitle = document.title
            // Ne pas accepter "YouTube" seul
            if (docTitle && docTitle !== 'YouTube' && docTitle.length > 8) {
              return docTitle.replace(/\s*-\s*YouTube$/i, '').trim()
            }
            // Essayer og:title
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
            if (ogTitle) return ogTitle
            // Essayer le h1
            const h1 = document.querySelector('h1')?.textContent?.trim()
            if (h1 && h1 !== 'YouTube' && h1.length > 3) return h1
            return null
          }
        })
        const extractedTitle = results?.[0]?.result
        if (extractedTitle) {
          pageTitle = extractedTitle
          content = extractedTitle
          summary = `Vidéo YouTube: ${extractedTitle}`
        }
      } catch (error) {
        console.warn('YouTube title extraction failed:', error)
      }
    }

    // Ultime fallback - si pageTitle est toujours "YouTube" ou vide
    if (isYouTube && (!pageTitle || pageTitle === 'YouTube' || pageTitle === 'Page sans titre')) {
      summary = 'Vidéo YouTube (titre non disponible - attendez le chargement complet)'
      content = summary
      pageTitle = 'Vidéo YouTube'
    }

    // Erreur seulement si pas YouTube et pas de contenu
    if (!isYouTube && (!content || content.length < 50)) {
      return {
        success: false,
        error: 'Contenu insuffisant. Vérifiez que la page est bien chargée.'
      }
    }

    let domain = ''
    try {
      domain = new URL(url).hostname.replace('www.', '')
    } catch { /* ignore */ }

    // Retourner les données structurées directement (pas besoin d'IA)
    return {
      success: true,
      content,
      pageTitle,
      url,
      favicon: tab.favIconUrl || '',
      domain,
      isYouTube,
      contentType: detectContentType(url, pageTitle),
      // Données structurées extraites par heuristiques
      summary,
      keyPoints,
      concepts,
      tags,
      description,
      author,
      ogImage,
      siteName
    }
  } catch (error) {
    console.error('Error in smart capture:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la capture intelligente'
    }
  }
}

// YouTube-specific content extraction (injected into page)
function extractYouTubeContent() {
  try {
    // Title - multiple fallbacks pour être robuste
    let title = ''

    // 1. Essayer les éléments DOM spécifiques à YouTube
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                    document.querySelector('#title h1') ||
                    document.querySelector('h1.title') ||
                    document.querySelector('[itemprop="name"]')
    if (titleEl?.textContent?.trim()) {
      title = titleEl.textContent.trim()
    }

    // 2. Fallback: meta og:title
    if (!title) {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      if (ogTitle) {
        title = ogTitle
      }
    }

    // 3. Fallback: document.title (nettoyer " - YouTube")
    if (!title) {
      const docTitle = document.title
      // Vérifier que ce n'est pas juste "YouTube"
      if (docTitle && docTitle !== 'YouTube' && docTitle.length > 8) {
        title = docTitle.replace(/\s*-\s*YouTube$/i, '').trim()
      }
    }

    // 4. Si toujours vide, utiliser un placeholder
    if (!title) {
      title = ''
    }

    // Author
    const channelEl = document.querySelector('#channel-name a') ||
                      document.querySelector('.ytd-channel-name a')
    const author = channelEl?.textContent?.trim() || ''

    // Description
    const descEl = document.querySelector('#description-inline-expander yt-formatted-string') ||
                   document.querySelector('#description yt-formatted-string') ||
                   document.querySelector('#description')
    const description = descEl?.textContent?.trim() || ''

    // Try transcript extraction from DOM
    let transcript = ''

    // Check if transcript panel is already open
    const segments = document.querySelectorAll(
      'ytd-transcript-segment-renderer .segment-text,' +
      'ytd-transcript-segment-renderer yt-formatted-string'
    )

    if (segments.length > 0) {
      transcript = Array.from(segments)
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join(' ')
    }

    // Also try captions window
    if (!transcript) {
      const captionElements = document.querySelectorAll('.captions-text, .ytp-caption-segment')
      if (captionElements.length > 0) {
        transcript = Array.from(captionElements)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' ')
      }
    }

    // Extract chapters/timestamps from description
    const chapters: string[] = []
    if (description) {
      // Pattern: "0:00 Introduction" or "00:00 - Title" or "[0:00] Title" or "0:00:00 Title"
      const timestampRegex = /(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]?\s*)([^\n]+)/g
      let match
      while ((match = timestampRegex.exec(description)) !== null) {
        const chapterTitle = match[1].trim()
        if (chapterTitle.length > 3 && chapterTitle.length < 100) {
          chapters.push(chapterTitle)
        }
      }
    }

    // Extract key points from transcript (significant sentences)
    let transcriptKeyPoints: string[] = []
    if (transcript && transcript.length > 200) {
      // Split into sentences, filter significant ones
      const sentences = transcript
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s =>
          s.length > 40 &&
          s.length < 200 &&
          // Filter out common promotional phrases
          !s.toLowerCase().includes('subscribe') &&
          !s.toLowerCase().includes('like this video') &&
          !s.toLowerCase().includes('click the bell') &&
          !s.toLowerCase().includes('hit the like') &&
          !s.toLowerCase().includes('leave a comment') &&
          !s.toLowerCase().includes('check out my') &&
          !s.toLowerCase().includes('link in the description') &&
          !s.toLowerCase().includes('abonnez') &&
          !s.toLowerCase().includes('likez')
        )

      // Take distributed samples from the transcript for better coverage
      if (sentences.length > 0) {
        const step = Math.max(1, Math.floor(sentences.length / 5))
        for (let i = 0; i < sentences.length && transcriptKeyPoints.length < 5; i += step) {
          transcriptKeyPoints.push(sentences[i].slice(0, 150))
        }
      }
    }

    // Generate key points from description if no transcript and no chapters
    let descriptionKeyPoints: string[] = []
    if (description && transcriptKeyPoints.length === 0 && chapters.length === 0) {
      descriptionKeyPoints = description
        .split('\n')
        .map(line => line.trim())
        .filter(line =>
          line.length > 30 &&
          line.length < 150 &&
          !line.startsWith('http') &&
          !line.match(/^\d{1,2}:\d{2}/) && // Exclude timestamp lines
          !line.toLowerCase().includes('subscribe') &&
          !line.toLowerCase().includes('follow me') &&
          !line.toLowerCase().includes('instagram') &&
          !line.toLowerCase().includes('twitter') &&
          !line.toLowerCase().includes('discord') &&
          !line.toLowerCase().includes('patreon')
        )
        .slice(0, 5)
    }

    return {
      title,
      author,
      description,
      transcript: transcript || '',
      chapters,
      transcriptKeyPoints,
      descriptionKeyPoints
    }
  } catch (error) {
    return {
      title: document.title,
      author: '',
      description: '',
      transcript: '',
      chapters: [],
      transcriptKeyPoints: []
    }
  }
}

// ---- UTILITAIRES ----

function detectContentType(url: string, title: string): import('@/types/academic').ContentType {
  if (url.includes('.pdf')) return 'pdf'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'video'
  if (title.toLowerCase().includes('research') || 
      title.toLowerCase().includes('study') ||
      title.toLowerCase().includes('journal')) return 'research-paper'
  if (url.includes('docs.') || url.includes('documentation')) return 'documentation'
  if (url.includes('article') || url.includes('blog')) return 'article'
  
  return 'webpage'
}

keepAlive()