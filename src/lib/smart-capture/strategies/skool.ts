import type { SiteStrategy, SiteExtractResult } from '../types'

function extractSkool(): SiteExtractResult {
  try {
    const bodyText = document.body?.innerText || ''
    const title = document.title || ''

    // -----------------------------------------------------------------------
    // Lien titre du post actif — URL exacte dans le feed Skool
    // -----------------------------------------------------------------------
    const currentPath = window.location.pathname
    const postTitleLink: Element | null =
      document.querySelector(`a[href="${currentPath}"]`) ||
      document.querySelector(`a[href="${currentPath}/"]`)

    // -----------------------------------------------------------------------
    // BODY ELEMENT DETECTION — LCA + cascade de fallbacks
    // -----------------------------------------------------------------------
    let bodyEl: Element | null = null

    // === MÉTHODE 1 : LCA (Lowest Common Ancestor) ===
    //
    // L'éditeur du même post card que le lien titre partage un ancêtre
    // PLUS PROFOND (plus bas dans l'arbre DOM) que les éditeurs d'autres cards.
    // Cette méthode est agnostique à la position relative (avant ou après le lien).
    //
    // Exemple :
    //   body → feed → post-card-nawel → .ql-editor-nawel   LCA = post-card-nawel (profond ✓)
    //   body → feed → post-card-celia → .ql-editor-celia    LCA = feed (peu profond ✗)
    //
    if (postTitleLink) {
      const allEditors = Array.from(document.querySelectorAll('.ql-editor'))

      // Mapper chaque ancêtre du lien titre à sa distance depuis le lien
      // (0 = parent direct, 1 = grand-parent, 2 = arrière-grand-parent, ...)
      const titleAncestors = new Map<Element, number>()
      let cur: Element | null = postTitleLink.parentElement
      let dist = 0
      while (cur && cur !== document.documentElement) {
        titleAncestors.set(cur, dist)
        cur = cur.parentElement
        dist++
      }

      // Trouver l'éditeur dont le LCA avec le lien titre est le plus bas dans l'arbre
      // = distance la plus grande depuis le lien = même post card
      let bestEditor: Element | null = null
      let bestDist = -1

      for (const editor of allEditors) {
        let edCur: Element | null = editor.parentElement
        while (edCur && edCur !== document.documentElement) {
          const d = titleAncestors.get(edCur)
          if (d !== undefined) {
            if (d > bestDist) {
              bestDist = d
              bestEditor = editor
            }
            break
          }
          edCur = edCur.parentElement
        }
      }

      if (bestEditor) bodyEl = bestEditor
    }

    // === MÉTHODE 2 : dialog/modal ===
    let postContainer: Element | null = null
    if (!bodyEl) {
      postContainer =
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[data-testid*="post-detail"]') ||
        document.querySelector('[class*="PostDetail"]') ||
        document.querySelector('[class*="post-detail"]') ||
        document.querySelector('[data-testid="post-modal"]') ||
        document.querySelector('[class*="PostModal"]') ||
        null
      if (postContainer) {
        bodyEl = postContainer.querySelector('.ql-editor') || null
      }
    }

    // === MÉTHODE 3 : un seul .ql-editor sur la page ===
    if (!bodyEl) {
      const allEditors = document.querySelectorAll('.ql-editor')
      if (allEditors.length === 1) {
        bodyEl = allEditors[0]
      }
    }

    // === MÉTHODE 4 : autres sélecteurs CSS ===
    const searchScope = (postContainer || document.body) as HTMLElement
    if (!bodyEl) {
      bodyEl =
        searchScope.querySelector('[class*="richtext"]') ||
        searchScope.querySelector('[class*="RichText"]') ||
        searchScope.querySelector('[contenteditable="false"]') ||
        searchScope.querySelector('[data-testid="post-content"]') ||
        searchScope.querySelector('.post-content') ||
        null
    }

    // -----------------------------------------------------------------------
    // Clone + nettoyage de bodyEl
    // -----------------------------------------------------------------------
    let bodyText2 = ''
    let bodyHtml = ''

    if (bodyEl) {
      const clone = bodyEl.cloneNode(true) as HTMLElement

      // Supprimer avatars et images de profil
      clone.querySelectorAll([
        'img[class*="avatar"]', 'img[class*="Avatar"]',
        'img[class*="profile"]', 'img[class*="Profile"]',
        '[class*="avatar"] img', '[class*="Avatar"] img',
        '[class*="profile-image"]', '[class*="profileImage"]',
      ].join(', ')).forEach(el => el.remove())

      // Supprimer sections de commentaires
      clone.querySelectorAll([
        '[class*="comment"]', '[class*="Comment"]',
        '[data-testid*="comment"]',
      ].join(', ')).forEach(el => el.remove())

      bodyText2 = clone.textContent?.trim() || ''
      bodyHtml = clone.innerHTML || ''
    }

    // -----------------------------------------------------------------------
    // Group name
    // -----------------------------------------------------------------------
    let groupName = ''
    if (title.includes(' | ')) {
      groupName = title.split(' | ').pop()?.trim() || ''
    }
    if (!groupName && title.includes(' - ')) {
      groupName = title.split(' - ').pop()?.trim() || ''
    }
    if (!groupName) {
      const headerEl = document.querySelector('header') || document.querySelector('nav')
      if (headerEl) {
        const headerLinks = headerEl.querySelectorAll('a')
        for (const link of headerLinks) {
          const text = link.textContent?.trim() || ''
          if (text.length > 3 && text.length < 80 &&
              !text.toLowerCase().includes('sign') &&
              !text.toLowerCase().includes('log')) {
            groupName = text
            break
          }
        }
      }
    }
    if (!groupName) {
      groupName =
        document.querySelector('[data-testid="group-name"]')?.textContent?.trim() || ''
    }

    // -----------------------------------------------------------------------
    // Post title — document.title en premier
    // -----------------------------------------------------------------------
    let postTitle = ''

    if (title.includes(' | ')) {
      const candidate = title.split(' | ')[0]?.trim() || ''
      if (candidate && candidate !== groupName && candidate.length > 3 && candidate.length < 200) {
        postTitle = candidate
      }
    }
    if (!postTitle && title.includes(' - ')) {
      const candidate = title.split(' - ')[0]?.trim() || ''
      if (candidate && candidate !== groupName && candidate.length > 3) {
        postTitle = candidate
      }
    }
    if (!postTitle && postTitleLink) {
      const linkText = postTitleLink.textContent?.trim() || ''
      if (linkText.length > 3 && linkText.length < 200) {
        postTitle = linkText
      }
    }
    if (!postTitle && bodyEl) {
      const boldEl = bodyEl.querySelector('strong, b')
      const boldText = boldEl?.textContent?.trim() || ''
      if (boldText.length > 3 && boldText.length < 150) {
        postTitle = boldText
      }
    }

    // -----------------------------------------------------------------------
    // Author — LCA : remonter depuis le lien titre pour trouver l'auteur dans le même card
    // -----------------------------------------------------------------------
    let authorName = ''

    if (postTitleLink) {
      // Remonter depuis le lien titre jusqu'à un ancêtre contenant un lien auteur
      // (même card → même ancêtre proche → trouvé rapidement)
      let card: Element | null = postTitleLink.parentElement
      for (let i = 0; i < 15 && card && card !== document.body; i++) {
        const userLinks = card.querySelectorAll(
          'a[href*="/u/"], a[href*="/user/"], a[href*="/@"]'
        )
        for (const link of userLinks) {
          if (link === postTitleLink) continue
          const text = link.textContent?.trim() || ''
          if (text.length > 2 && text.length < 60) {
            authorName = text
            break
          }
        }
        if (authorName) break
        card = card.parentElement
      }
    }

    // Fallback global (skip nav/header/sidebar pour éviter le compte connecté)
    if (!authorName) {
      const allLinks = document.querySelectorAll(
        'a[href*="/u/"], a[href*="/user/"], a[href*="/@"]'
      )
      for (const link of allLinks) {
        if (link.closest(
          'nav, header, [class*="sidebar"], [class*="Sidebar"], ' +
          '[class*="navigation"], [class*="Navigation"], ' +
          '[class*="topbar"], [class*="Topbar"]'
        )) continue
        const text = link.textContent?.trim() || ''
        if (text.length > 2 && text.length < 60) {
          authorName = text
          break
        }
      }
    }

    if (!authorName) {
      authorName =
        document.querySelector('[data-testid="post-author"]')?.textContent?.trim() ||
        searchScope.querySelector('[class*="author"] a')?.textContent?.trim() ||
        ''
    }

    // -----------------------------------------------------------------------
    // Date
    // -----------------------------------------------------------------------
    const dateEl = searchScope.querySelector('time')
    const postDate = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || ''

    // -----------------------------------------------------------------------
    // Best-div fallback (limites conservatrices)
    // -----------------------------------------------------------------------
    if (!bodyText2 || bodyText2.length < 50) {
      const mainContent = searchScope.querySelector('main') ||
        (searchScope as Element) ||
        document.body
      const divs = (mainContent as Element).querySelectorAll('div')
      let bestDiv: Element | null = null
      let bestLen = 0
      divs.forEach(div => {
        const text = div.textContent?.trim() || ''
        const directText = Array.from(div.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent?.trim())
          .join('')
        const hasSubstantialDirectText = directText.length > 30
        const childDivs = div.querySelectorAll('div').length

        if (text.length > 100 && text.length < 8000 && childDivs < 50 &&
            (hasSubstantialDirectText || div.querySelectorAll('p, li, br').length > 0) &&
            text.length > bestLen) {
          bestLen = text.length
          bestDiv = div
        }
      })
      if (bestDiv) {
        const clone = (bestDiv as HTMLElement).cloneNode(true) as HTMLElement
        clone.querySelectorAll(
          'img[class*="avatar"], [class*="avatar"] img, img[class*="profile"]'
        ).forEach(el => el.remove())
        bodyText2 = clone.textContent?.trim() || ''
        bodyHtml = clone.innerHTML || ''
      }
    }

    // -----------------------------------------------------------------------
    // Ultimate text fallback (limité à 30 lignes pour éviter le débordement)
    // -----------------------------------------------------------------------
    if (!bodyText2 || bodyText2.length < 50) {
      const lines = bodyText.split('\n').filter(l => l.trim().length > 20)
      const titleIdx = postTitle ? lines.findIndex(l => l.includes(postTitle)) : -1
      if (titleIdx >= 0 && titleIdx < lines.length - 1) {
        bodyText2 = lines.slice(titleIdx + 1, titleIdx + 30).join('\n')
      } else {
        bodyText2 = lines.slice(0, 20).join('\n')
      }
    }

    // -----------------------------------------------------------------------
    // Engagement — regex élargi + DOM fallback pour les likes
    // -----------------------------------------------------------------------
    let likes = ''
    let commentsCount = ''

    // Likes : essayer plusieurs formats
    const likesRegex =
      bodyText.match(/(\d+)\s*(?:likes?|j['']aime|aimé|reactions?|réactions?)/i) ||
      bodyText.match(/(?:aimé|liké?)\s*(?:par\s+)?(\d+)/i)
    if (likesRegex) likes = likesRegex[1]

    // Likes DOM fallback (bouton avec count)
    if (!likes) {
      const likesEl =
        document.querySelector('[class*="like"][class*="count"]') ||
        document.querySelector('[class*="like"] [class*="count"]') ||
        document.querySelector('[aria-label*="like" i] [class*="count"]') ||
        document.querySelector('[data-testid*="like"] [class*="count"]') ||
        null
      if (likesEl) {
        likes = likesEl.textContent?.trim().match(/\d+/)?.[0] || ''
      }
    }

    const commentsMatch = bodyText.match(
      /(\d+)\s*(?:comments?|commentaires?|r\u00e9ponses?)/i
    )
    if (commentsMatch) commentsCount = commentsMatch[1]

    // -----------------------------------------------------------------------
    // Build content HTML
    // -----------------------------------------------------------------------
    const parts: string[] = []
    if (groupName) parts.push(`<p><strong>Groupe :</strong> ${groupName}</p>`)
    if (authorName) parts.push(`<p><strong>Auteur :</strong> ${authorName}</p>`)
    if (postDate) parts.push(`<p><strong>Date :</strong> ${postDate}</p>`)
    if (likes || commentsCount) {
      const engagement: string[] = []
      if (likes) engagement.push(`\u2764 ${likes}`)
      if (commentsCount) engagement.push(`\ud83d\udcac ${commentsCount}`)
      parts.push(`<p>${engagement.join('  \u00b7  ')}</p>`)
    }

    if (bodyHtml && bodyHtml.length > 50) {
      parts.push(`<hr><div>${bodyHtml.slice(0, 25000)}</div>`)
    } else if (bodyText2) {
      const paragraphs = bodyText2
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<p>${l.trim()}</p>`)
        .join('\n')
      parts.push(`<hr>${paragraphs}`)
    }

    const content = parts.join('\n')

    // Key points
    const keyPoints: string[] = []
    if (authorName) keyPoints.push(`Par : ${authorName}`)
    if (groupName) keyPoints.push(`Groupe : ${groupName}`)

    // Summary
    const summaryParts: string[] = []
    if (postTitle) summaryParts.push(postTitle)
    if (authorName) summaryParts.push(`par ${authorName}`)
    if (groupName) summaryParts.push(`dans ${groupName}`)
    const summary = summaryParts.join(' \u2014 ') || 'Post Skool'

    // Tags
    const tags = ['skool']
    if (groupName) tags.push(groupName.toLowerCase().slice(0, 30))

    const pageTitle = postTitle || `Skool \u2014 ${groupName || 'Post'}`

    return {
      success: content.length >= 50,
      pageTitle,
      content,
      summary,
      keyPoints,
      concepts: [],
      tags,
      description: bodyText2.slice(0, 300),
      author: authorName,
      siteName: 'Skool',
      extras: { groupName, likes, commentsCount, postDate }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const skoolStrategy: SiteStrategy = {
  id: 'skool',
  label: 'Skool',
  match: (url: string) => /skool\.com/i.test(url),
  priority: 10,
  func: extractSkool
}
