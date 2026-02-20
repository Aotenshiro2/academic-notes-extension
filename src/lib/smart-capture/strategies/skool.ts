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
    // POST CARD DETECTION — structural sibling pattern (no .ql-editor)
    //
    // En remontant depuis postTitleLink, le premier ancêtre qui a des
    // frères/sœurs de même tag = un élément répété = une card du feed.
    // Ce container est borné au post actif — pas de débordement possible.
    // -----------------------------------------------------------------------
    let postCard: Element | null = null

    if (postTitleLink) {
      let el: Element | null = postTitleLink.parentElement
      for (let i = 0; i < 25 && el && el !== document.body; i++) {
        const parent = el.parentElement
        if (parent && parent !== document.body) {
          const sameTagSiblings = Array.from(parent.children)
            .filter(c => c.tagName === el!.tagName && c !== el)
          if (sameTagSiblings.length >= 1) {
            const text = el.textContent?.trim() || ''
            if (text.length > 100) {
              postCard = el
              break
            }
          }
        }
        el = el?.parentElement ?? null
      }
    }

    // -----------------------------------------------------------------------
    // Content extraction from bounded post card
    // -----------------------------------------------------------------------
    let bodyText2 = ''
    let bodyHtml = ''

    // -----------------------------------------------------------------------
    // Images du post — collectées depuis le DOM live (avant le clone)
    // -----------------------------------------------------------------------
    const AVATAR_SCOPE =
      '[class*="comment"], [class*="Comment"], ' +
      '[class*="reply"], [class*="Reply"], ' +
      '[class*="reaction"], [class*="Reaction"], ' +
      '[class*="avatar"], [class*="Avatar"], ' +
      '[class*="author"], [class*="Author"], ' +
      '[class*="member"], [class*="Member"], ' +
      '[class*="sidebar"], [class*="Sidebar"], ' +
      '[class*="topbar"], [class*="Topbar"], ' +
      'nav, header'

    const postImages: { src: string; alt: string }[] = []
    if (postCard) {
      postCard.querySelectorAll('img').forEach((img: HTMLImageElement) => {
        // 1. Rejeter si dans un conteneur avatar/comment/sidebar
        if (img.closest(AVATAR_SCOPE)) return

        // 2. Résoudre lazy-load
        const realSrc =
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src') ||
          img.getAttribute('data-lazy') ||
          img.getAttribute('data-original') ||
          img.src || ''
        if (!realSrc || realSrc.startsWith('data:image/gif') || realSrc.startsWith('data:image/svg')) return

        // 3. Rejeter par class de l'img elle-même
        const cls = img.className || ''
        if (/avatar|Avatar|profile|Profile|member|Member/i.test(cls)) return

        // 4. Rejeter par URL (patterns avatar CDN)
        if (/\/avatar[s]?\/|\/profile[s]?\/|\/user[s]?\/|\/thumb\/|\/icon\//i.test(realSrc)) return

        // 5. Filtres de taille
        const w = img.naturalWidth || img.width || 0
        const h = img.naturalHeight || img.height || 0
        if (w > 0 && w < 80) return
        if (h > 0 && h < 80) return
        // Carré ou quasi-carré < 250px → avatar
        if (w > 0 && h > 0) {
          const ratio = Math.abs(w - h) / Math.max(w, h)
          if (ratio < 0.15 && Math.max(w, h) < 250) return
        }
        // Portrait < 300px → photo de profil sidebar
        if (w > 0 && h > 0 && h > w && Math.max(w, h) < 300) return

        postImages.push({ src: realSrc, alt: img.alt || 'Image du post' })
      })
    }

    if (postCard) {
      const clone = postCard.cloneNode(true) as HTMLElement

      // Supprimer avatars et images de profil
      clone.querySelectorAll([
        'button',
        'img[class*="avatar"]', 'img[class*="Avatar"]',
        'img[class*="profile"]', 'img[class*="Profile"]',
        '[class*="avatar"] img', '[class*="Avatar"] img',
        '[class*="profile-image"]', '[class*="profileImage"]',
      ].join(', ')).forEach(el => el.remove())

      // Supprimer sections de commentaires
      clone.querySelectorAll([
        '[class*="comment"]', '[class*="Comment"]',
        '[class*="reply"]', '[class*="Reply"]',
        '[data-testid*="comment"]',
      ].join(', ')).forEach(el => el.remove())

      bodyText2 = clone.textContent?.trim().slice(0, 8000) || ''
      bodyHtml = clone.innerHTML || ''
    }

    // searchScope = post card si trouvé, sinon page entière
    const searchScope = (postCard || document.body) as HTMLElement

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

    // -----------------------------------------------------------------------
    // Author — walk up depuis le lien titre pour trouver l'auteur dans le même card
    // -----------------------------------------------------------------------
    let authorName = ''

    if (postTitleLink) {
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

    // Fallback global (skip nav/header/sidebar)
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
    // Fallback minimal si postCard non trouvé (max 10 lignes après le titre)
    // -----------------------------------------------------------------------
    if (!bodyText2) {
      const lines = bodyText.split('\n').filter(l => l.trim().length > 20)
      const titleIdx = postTitle ? lines.findIndex(l => l.includes(postTitle)) : -1
      bodyText2 = titleIdx >= 0
        ? lines.slice(titleIdx + 1, titleIdx + 10).join('\n')
        : lines.slice(0, 10).join('\n')
    }

    // -----------------------------------------------------------------------
    // Engagement
    // -----------------------------------------------------------------------
    let likes = ''
    let commentsCount = ''

    const likesRegex =
      bodyText.match(/(\d+)\s*(?:likes?|j['']aime|aimé|reactions?|réactions?)/i) ||
      bodyText.match(/(?:aimé|liké?)\s*(?:par\s+)?(\d+)/i)
    if (likesRegex) likes = likesRegex[1]

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
      extras: { groupName, likes, commentsCount, postDate, images: postImages }
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
