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
        '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]'
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

    // 2. Points clés = titres H2 et H3
    const headings = Array.from(document.querySelectorAll('article h2, article h3, main h2, main h3, .content h2, .content h3, h2, h3'))
      .map(h => h.textContent?.trim())
      .filter((text): text is string => !!text && text.length > 3 && text.length < 150)
      .slice(0, 8)

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
        clone.querySelectorAll('script, style, nav, aside, footer, .ads, .comments').forEach(e => e.remove())
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

          if (ytData.transcript) {
            content = ytData.transcript
            summary = `Vidéo de ${author}: ${pageTitle}`
            keyPoints = ['Transcription disponible']
          } else if (ytData.description) {
            content = ytData.description
            summary = ytData.description.slice(0, 300)
            keyPoints = ['Pas de transcription - description extraite']
          }
        }
      } catch (error) {
        console.warn('YouTube extraction failed:', error)
      }
    }

    // Extraction structurée par heuristiques pour les pages web
    if (!content || content.length < 50) {
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

    // Dernier recours: extraction simple
    if (!content || content.length < 50) {
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

    if (!content || content.length < 50) {
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
    // Title
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                    document.querySelector('#title h1')
    const title = titleEl?.textContent?.trim() || document.title.replace(' - YouTube', '')

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

    return {
      title,
      author,
      description,
      transcript: transcript || ''
    }
  } catch (error) {
    return {
      title: document.title,
      author: '',
      description: '',
      transcript: ''
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