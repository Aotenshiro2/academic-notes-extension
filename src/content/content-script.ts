import type { ExtensionMessage, AcademicNote } from '@/types/academic'

// Interface pour communication avec le storage depuis le content script
let storage: any = null

// Initialisation du module storage
async function initStorage() {
  if (!storage) {
    // Importer dynamiquement le module storage
    const storageModule = await import('../lib/storage.js')
    storage = storageModule.default
  }
  return storage
}

// Écouter les messages du background script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleContentMessage(message, sendResponse)
  return true // Réponse asynchrone
})

async function handleContentMessage(message: ExtensionMessage, sendResponse: (response: any) => void) {
  try {
    await initStorage()
    
    switch (message.type) {
      case 'SAVE_NOTE':
        const result = await storage.saveNote(message.payload.note)
        sendResponse({ success: true, noteId: result })
        break

      case 'EXTRACT_CONTENT':
        const contentData = extractPageContent()
        sendResponse(contentData)
        break

      default:
        sendResponse({ error: 'Unknown content script message' })
    }
  } catch (error) {
    console.error('Content script error:', error)
    sendResponse({ 
      error: error instanceof Error ? error.message : 'Content script error' 
    })
  }
}

// Extraction intelligente du contenu de la page
function extractPageContent() {
  try {
    const result = {
      url: window.location.href,
      title: document.title,
      content: '',
      metadata: {
        domain: window.location.hostname,
        language: document.documentElement.lang || 'fr'
      }
    }

    // Métadonnées enrichies
    const metaTags = {
      description: getMetaContent('description') || getMetaContent('og:description'),
      author: getMetaContent('author') || getMetaContent('article:author'),
      publishDate: getMetaContent('article:published_time') || getMetaContent('date'),
      keywords: getMetaContent('keywords'),
      ogImage: getMetaContent('og:image'),
      siteName: getMetaContent('og:site_name'),
      articleSection: getMetaContent('article:section'),
      articleTag: getMetaContent('article:tag')
    }

    Object.assign(result.metadata, metaTags)

    // Extraction du contenu principal
    const contentExtractors = [
      () => extractFromArticle(),
      () => extractFromMain(),
      () => extractFromSelectors([
        '.content', '.post-content', '.entry-content', 
        '.article-content', '#content', '.main-content'
      ]),
      () => extractFromBody()
    ]

    for (const extractor of contentExtractors) {
      const content = extractor()
      if (content && content.trim().length > 100) {
        result.content = content
        break
      }
    }

    // Détection du type de contenu
    const contentType = detectPageType()
    
    return {
      success: true,
      ...result,
      type: contentType,
      extractedAt: Date.now()
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur extraction' 
    }
  }
}

function getMetaContent(name: string): string {
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
      if (content) return content
    }
  }
  
  return ''
}

function extractFromArticle(): string {
  const article = document.querySelector('article')
  if (!article) return ''
  
  const cleanedArticle = cleanContent(article.cloneNode(true) as Element)
  return cleanedArticle.textContent?.trim() || ''
}

function extractFromMain(): string {
  const main = document.querySelector('main, [role="main"]')
  if (!main) return ''
  
  const cleanedMain = cleanContent(main.cloneNode(true) as Element)
  return cleanedMain.textContent?.trim() || ''
}

function extractFromSelectors(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element) {
      const cleanedElement = cleanContent(element.cloneNode(true) as Element)
      const content = cleanedElement.textContent?.trim() || ''
      if (content.length > 100) return content
    }
  }
  return ''
}

function extractFromBody(): string {
  const bodyClone = document.body.cloneNode(true) as Element
  const cleanedBody = cleanContent(bodyClone)
  return cleanedBody.textContent?.trim() || ''
}

function cleanContent(element: Element): Element {
  // Supprimer les éléments indésirables
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '.navigation', '.nav', '.menu', '.sidebar', '.widget',
    '.advertisement', '.ads', '.ad', '.social', '.share',
    '.comments', '.comment', '.related', '.recommended',
    '[class*="ad-"]', '[id*="ad-"]', '[class*="advertisement"]',
    '.cookie-banner', '.popup', '.modal', '.overlay'
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

function detectPageType() {
  const url = window.location.href.toLowerCase()
  const title = document.title.toLowerCase()
  const domain = window.location.hostname.toLowerCase()

  // PDF
  if (url.includes('.pdf')) return 'pdf'
  
  // Vidéos
  if (domain.includes('youtube') || domain.includes('youtu.be') || 
      domain.includes('vimeo') || url.includes('/video/')) return 'video'
  
  // Documentation
  if (domain.includes('docs.') || url.includes('/docs/') || 
      url.includes('/documentation/') || title.includes('documentation')) return 'documentation'
  
  // Articles de recherche
  if (domain.includes('scholar.google') || domain.includes('arxiv.org') ||
      domain.includes('researchgate') || domain.includes('pubmed') ||
      title.includes('research') || title.includes('study') ||
      title.includes('journal') || getMetaContent('article:section')) return 'research-paper'
  
  // Articles de blog/news
  if (url.includes('/article/') || url.includes('/post/') || 
      url.includes('/blog/') || getMetaContent('article:published_time')) return 'article'
  
  return 'webpage'
}

// Injection de styles pour les fonctionnalités de sélection
function injectStyles() {
  if (document.getElementById('academic-notes-styles')) return

  const style = document.createElement('style')
  style.id = 'academic-notes-styles'
  style.textContent = `
    .academic-notes-highlight {
      background-color: rgba(255, 235, 59, 0.3) !important;
      border: 1px solid #ffc107 !important;
      border-radius: 2px !important;
    }
    
    .academic-notes-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: rgba(0, 0, 0, 0.1) !important;
      z-index: 10000 !important;
      cursor: crosshair !important;
    }
    
    .academic-notes-selection-box {
      position: absolute !important;
      border: 2px dashed #2196f3 !important;
      background: rgba(33, 150, 243, 0.1) !important;
      pointer-events: none !important;
    }
    
    .academic-notes-tooltip {
      position: absolute !important;
      background: #333 !important;
      color: white !important;
      padding: 8px 12px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-family: system-ui, sans-serif !important;
      z-index: 10001 !important;
      pointer-events: none !important;
    }
  `
  
  document.head.appendChild(style)
}

// Fonctionnalité de sélection de contenu
function enableContentSelection() {
  injectStyles()
  
  let isSelecting = false
  let startX = 0
  let startY = 0
  let overlay: HTMLElement | null = null
  let selectionBox: HTMLElement | null = null

  function startSelection(e: MouseEvent) {
    if (e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      
      isSelecting = true
      startX = e.clientX
      startY = e.clientY
      
      // Créer l'overlay
      overlay = document.createElement('div')
      overlay.className = 'academic-notes-overlay'
      document.body.appendChild(overlay)
      
      // Créer la box de sélection
      selectionBox = document.createElement('div')
      selectionBox.className = 'academic-notes-selection-box'
      overlay.appendChild(selectionBox)
      
      // Ajouter les event listeners
      overlay.addEventListener('mousemove', updateSelection)
      overlay.addEventListener('mouseup', endSelection)
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          cancelSelection()
        }
      })
      
      overlay.focus()
    }
  }

  function updateSelection(e: MouseEvent) {
    if (!isSelecting || !selectionBox) return
    
    const currentX = e.clientX
    const currentY = e.clientY
    
    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)
    
    selectionBox.style.left = left + 'px'
    selectionBox.style.top = top + 'px'
    selectionBox.style.width = width + 'px'
    selectionBox.style.height = height + 'px'
  }

  function endSelection(e: MouseEvent) {
    if (!isSelecting || !selectionBox) return
    
    const rect = selectionBox.getBoundingClientRect()
    
    if (rect.width > 10 && rect.height > 10) {
      // Extraire le contenu dans la zone sélectionnée
      const selectedContent = extractContentFromArea(rect)
      
      if (selectedContent.trim()) {
        // Envoyer au background script pour sauvegarde
        chrome.runtime.sendMessage({
          type: 'SAVE_NOTE',
          payload: {
            note: {
              title: `Sélection zone - ${document.title}`,
              content: selectedContent,
              url: window.location.href,
              type: 'webpage',
              metadata: {
                domain: window.location.hostname,
                selectionArea: {
                  x: rect.left,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height
                }
              },
              tags: ['sélection-zone'],
              concepts: []
            }
          }
        })
      }
    }
    
    cleanupSelection()
  }

  function cancelSelection() {
    cleanupSelection()
  }

  function cleanupSelection() {
    isSelecting = false
    if (overlay) {
      overlay.remove()
      overlay = null
    }
    selectionBox = null
  }

  function extractContentFromArea(rect: DOMRect): string {
    const elements = document.elementsFromPoint(
      rect.left + rect.width / 2, 
      rect.top + rect.height / 2
    )
    
    for (const element of elements) {
      if (element.textContent && element.textContent.trim().length > 20) {
        return element.textContent.trim()
      }
    }
    
    return ''
  }

  // Attacher l'event listener
  document.addEventListener('mousedown', startSelection, true)
}

// Initialisation du content script
function init() {
  console.log('Academic Notes content script loaded')
  
  // Attendre que la page soit entièrement chargée
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enableContentSelection()
    })
  } else {
    enableContentSelection()
  }
}

// Démarrer l'initialisation
init()