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

// Clic sur l'icône de l'extension - Toggle du panneau
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      // Récupérer l'état actuel du panneau depuis le storage de session
      const result = await chrome.storage.session.get(['sidePanelOpen'])
      const isCurrentlyOpen = result.sidePanelOpen || false

      if (isCurrentlyOpen) {
        // Panneau ouvert → Fermer
        // Envoyer un message au sidepanel pour qu'il se ferme
        try {
          await chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' })
        } catch (error) {
          // Si le message échoue (panneau déjà fermé), on met juste à jour l'état
          console.log('Sidepanel already closed or unreachable')
        }
        await chrome.storage.session.set({ sidePanelOpen: false })
      } else {
        // Panneau fermé → Ouvrir
        await chrome.sidePanel.open({ tabId: tab.id })
        await chrome.storage.session.set({ sidePanelOpen: true })
      }
    } catch (error) {
      console.error('Error toggling sidepanel:', error)
      // Fallback : essayer d'ouvrir le panneau
      await chrome.sidePanel.open({ tabId: tab.id })
      await chrome.storage.session.set({ sidePanelOpen: true })
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
        if (tabId) {
          // Si des options sont fournies, c'est pour le formulaire de note
          if (message.options) {
            const result = await captureScreenshotForNote(tabId, message.options)
            sendResponse(result)
          } else {
            const result = await takeScreenshot(tabId)
            sendResponse(result)
          }
        }
        break

      case 'OPEN_SIDEBAR':
        if (tabId) {
          await chrome.sidePanel.open({ tabId })
          sendResponse({ success: true })
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

    // Extraction du contenu principal
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-content',
      '#content',
      '.main-content'
    ]

    let mainElement: Element | null = null
    
    for (const selector of contentSelectors) {
      mainElement = document.querySelector(selector)
      if (mainElement) break
    }

    if (mainElement) {
      // Nettoyer le contenu (supprimer scripts, styles, nav, etc.)
      const clonedElement = mainElement.cloneNode(true) as Element
      
      // Supprimer les éléments indésirables
      const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 
        '.ads', '.advertisement', '.social', '.share',
        '[class*="ad"]', '[id*="ad"]'
      ]
      
      unwantedSelectors.forEach(selector => {
        clonedElement.querySelectorAll(selector).forEach(el => el.remove())
      })

      content = clonedElement.textContent?.trim() || ''
    } else {
      // Fallback : extraire tout le body en excluant nav, header, footer
      const bodyClone = document.body.cloneNode(true) as Element
      bodyClone.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove())
      content = bodyClone.textContent?.trim() || ''
    }

    // Limiter la taille du contenu
    if (content.length > 10000) {
      content = content.substring(0, 10000) + '...'
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
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur extraction contenu' 
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