import type { ExtensionMessage } from '@/types/academic'
import {
  CLE_COMPTES_DEMO, CLE_COMPTES_REELS, CLE_STOCKAGE_COMPTES, HOTE_PILOTAGE,
  comptesDepuisStockage, memeListe, userIdDepuisCookies, type ListeComptesPilotage,
} from '@/lib/pilotage-comptes'
import { proposerLaBulle } from './bulle-carnet-ui'

// IMPORTANT : ce fichier est injecté par Chrome/Brave en script CLASSIQUE
// (pas un module ES). Aucun import runtime n'est autorisé ici — seuls les
// `import type` (effacés à la compilation) le sont. Le stockage vit dans le
// service worker : ce script extrait le DOM et lui envoie les données.
// Seules exceptions : `pilotage-comptes.ts` et `bulle-carnet-ui.ts` (1.9.2),
// importés par CE SEUL point d'entrée (le reste n'en importe que des types),
// que Vite fond donc dans ce fichier. Vérifier après chaque build qu'aucun
// `import` n'apparaît dans dist/content/content-script.js.

// Écouter les messages du background script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleContentMessage(message, sendResponse)
  return true // Réponse asynchrone
})

async function handleContentMessage(message: ExtensionMessage, sendResponse: (response: any) => void) {
  try {
    switch (message.type) {
      case 'EXTRACT_CONTENT':
        const contentData = extractPageContent()
        sendResponse(contentData)
        break

      // Le panneau demande une relecture des comptes au moment du geste (1.8.13)
      case 'RELIRE_COMPTES_PILOTAGE':
        sendResponse({ liste: relireComptesPilotage ? await relireComptesPilotage() : null })
        break

      // Le panneau lance ou clôt un trade : ce que le graphique affiche (1.8.13)
      case 'LIRE_GRAPHIQUE_TV':
        sendResponse(/(^|\.)tradingview\.com$/i.test(location.hostname) ? lireGraphiqueTradingView() : null)
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
  // Content script initialisé

  // Attendre que la page soit entièrement chargée
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enableContentSelection()
    })
  } else {
    enableContentSelection()
  }

  // 1.9.2 : la bulle « Ouvrir le Carnet », sur les sites de la liste
  // (document_idle : la page est chargée)
  proposerLaBulle().catch(() => { /* rien à proposer */ })
}

// Signal de présence pour le journal AOKnowledge
document.documentElement.setAttribute('data-aok-installed', '1')

// Écouter la demande d'ouverture du panneau depuis le journal
document.addEventListener('aok:open-panel', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' })
})

// ── Les comptes de Pilotage (1.8.13) ────────────────────────────────────────
// Sur pilotage.aoknowledge.com seulement : les comptes du trader vivent dans
// le localStorage de Pilotage. On en garde de quoi les reconnaître (aucun
// montant, voir pilotage-comptes.ts) dans chrome.storage.local, pour que la
// boîte « Importer mes trades » du Carnet range au même endroit. Rien n'est
// écrit quand rien n'a changé. Rien n'est changé dans Pilotage.
//
// Relu au geste, jamais à la minuterie (règle de Brice du 05/11 : « des
// rechargements à la demande, à l'action », pas un recalcul toutes les
// 30 secondes ; la 1re version relisait toutes les 5 s) : au chargement de la
// page, quand l'onglet change de visibilité (on y arrive, on en repart après
// avoir créé un compte), et quand le panneau le demande (la boîte d'import
// s'ouvre ou le panneau reprend la main : message RELIRE_COMPTES_PILOTAGE).
let relireComptesPilotage: (() => Promise<ListeComptesPilotage | null>) | null = null
if (location.hostname === HOTE_PILOTAGE) {
  let dejaEcrit: Pick<ListeComptesPilotage, 'comptes' | 'userId'> | null = null

  relireComptesPilotage = () => new Promise(resolve => {
    // Extension rechargée ou retirée : ce script n'a plus de quoi écrire.
    if (!chrome.runtime?.id) { resolve(null); return }
    let lue: Pick<ListeComptesPilotage, 'comptes' | 'userId'>
    try {
      lue = {
        comptes: comptesDepuisStockage(localStorage.getItem(CLE_COMPTES_REELS), localStorage.getItem(CLE_COMPTES_DEMO)),
        userId: userIdDepuisCookies(document.cookie),
      }
    } catch {
      resolve(null)
      return
    }
    try {
      chrome.storage.local.get(CLE_STOCKAGE_COMPTES, resultat => {
        const actuelle = resultat?.[CLE_STOCKAGE_COMPTES] as ListeComptesPilotage | undefined
        if (actuelle && memeListe(lue, actuelle)) { dejaEcrit = lue; resolve(actuelle); return }
        if (memeListe(lue, dejaEcrit) && actuelle) { resolve(actuelle); return }
        const liste: ListeComptesPilotage = { ...lue, luLe: Date.now() }
        chrome.storage.local.set({ [CLE_STOCKAGE_COMPTES]: liste }, () => { dejaEcrit = lue; resolve(liste) })
      })
    } catch {
      resolve(null) /* contexte de l'extension perdu */
    }
  })

  void relireComptesPilotage()
  document.addEventListener('visibilitychange', () => { void relireComptesPilotage?.() })
}

// ── Le graphique affiché sur TradingView (1.8.13, capture automatique) ──────
// Le panneau lit le symbole dans le titre de l'onglet ; il demande ici, au
// moment du lancement ou de la clôture d'un trade (jamais en continu), ce que
// la page affiche. Texte brut seulement : le panneau le normalise
// (capture-graphique.ts). Sélecteurs défensifs : chacun dans un try, null si rien.
//
// VÉRIFIÉ sur le vrai site le 05/11 (tradingview.com/chart, sans compte, NQ1!
// en 5 min) :
// - symbole : `#header-toolbar-symbol-search` a pour texte « NQ1! » ; le
//   titre de l'onglet commence par « NQ1! 27,885.00 ... » ;
// - unité de temps : sans favoris, `#header-toolbar-intervals` ne contient
//   qu'UN bouton menu (classe `menuBtn-...`), texte « 5m », aria-label et
//   data-tooltip « 5 minutes », ni aria-checked ni aria-pressed. Avec des
//   favoris il y a plusieurs boutons : on prend l'actif ;
// - légende : pas de `data-name` ; classes à suffixe aléatoire :
//   `[class*="legendMainSourceWrapper"]` contient `[class*="mainTitle"]`
//   (« NASDAQ 100 E-mini Futures »), `[class*="intervalTitle"]` (« 5 ») et
//   `[class*="exchangeTitle"]` (« CME »).
// Non vérifié : l'interface avec des favoris (plusieurs boutons, lequel est
// marqué actif), un compte connecté, une mise en page à plusieurs graphiques.
// Si rien n'est trouvé : le symbole vient du titre, l'unité vaut null.
function texteDe(el: Element | null | undefined): string | null {
  const s = el?.textContent?.replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, 80) : null
}

interface GraphiqueTradingViewLu {
  symbole: string | null
  /** Texte du bouton d'intervalle : l'actif s'il y en a plusieurs, sinon le bouton menu (« 5m »). */
  intervalle: string | null
  /** aria-label ou data-tooltip de ce bouton (« 5 minutes », « 1 heure »). */
  intervalleLibelle: string | null
  /** L'intervalle de la légende du graphique (« 5 » : des minutes). */
  intervalleLegende: string | null
}

function lireGraphiqueTradingView(): GraphiqueTradingViewLu {
  const lu: GraphiqueTradingViewLu = { symbole: null, intervalle: null, intervalleLibelle: null, intervalleLegende: null }
  try {
    lu.symbole = texteDe(document.querySelector('#header-toolbar-symbol-search'))
  } catch { /* rien */ }
  try {
    const barre = document.querySelector('#header-toolbar-intervals')
    if (barre) {
      const boutons = Array.from(barre.querySelectorAll('button, [role="button"]'))
      // a) plusieurs boutons (favoris) : l'actif ; b) sinon le bouton menu.
      const actif = boutons.length > 1
        ? barre.querySelector('[aria-checked="true"], [aria-pressed="true"], [class*="isActive"]')
        : null
      const bouton = actif ?? barre.querySelector('[class*="menuBtn"]') ?? (boutons.length === 1 ? boutons[0] : null)
      if (bouton) {
        lu.intervalle = texteDe(bouton)
        // c) son aria-label ou son data-tooltip, en secours.
        lu.intervalleLibelle = bouton.getAttribute('aria-label') || bouton.getAttribute('data-tooltip') || null
      }
    }
  } catch { /* rien */ }
  try {
    const legende = document.querySelector('[class*="legendMainSourceWrapper"]')
    lu.intervalleLegende = texteDe(legende?.querySelector('[class*="intervalTitle"]'))
  } catch { /* rien */ }
  return lu
}

// Démarrer l'initialisation
init()