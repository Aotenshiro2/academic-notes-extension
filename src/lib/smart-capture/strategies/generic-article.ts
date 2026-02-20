import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * GenericArticle — Fallback amélioré pour Wordpress, Notion, blogs, etc.
 * Extraction ciblée main/article content avec nettoyage sidebar/nav/footer
 */
function extractGenericArticle(): SiteExtractResult {
  try {
    // --- Find main content container ---
    // Prioritise specific body selectors (avoid full article/main which include layout noise)
    const mainEl =
      document.querySelector('[itemprop="articleBody"]') ||
      document.querySelector('.entry-content') ||
      document.querySelector('.post-content') ||
      document.querySelector('.post-body') ||
      document.querySelector('.article-body') ||
      document.querySelector('.article-content') ||
      document.querySelector('.wp-block-post-content') ||
      document.querySelector('.blog-post-content') ||
      document.querySelector('.blog-content') ||
      document.querySelector('.notion-page-content') ||
      document.querySelector('[class*="article-body"]') ||
      document.querySelector('[class*="page-body"]') ||
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('#content')

    if (!mainEl) {
      return { success: false, error: 'No main content container found' }
    }

    // --- Title ---
    const title =
      document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.title ||
      ''

    // --- Author ---
    const author =
      document.querySelector('[rel="author"]')?.textContent?.trim() ||
      document.querySelector('[class*="author"] a')?.textContent?.trim() ||
      document.querySelector('[class*="Author"]')?.textContent?.trim() ||
      document.querySelector('meta[name="author"]')?.getAttribute('content') ||
      ''

    // --- Date ---
    const date =
      document.querySelector('time')?.getAttribute('datetime') ||
      document.querySelector('time')?.textContent?.trim() ||
      document.querySelector('[class*="date"]')?.textContent?.trim() ||
      ''

    // --- Clean content ---
    const clone = mainEl.cloneNode(true) as HTMLElement
    clone.querySelectorAll(
      'script, style, nav, aside, footer, ' +
      'header, .post-header, .entry-header, .article-header, ' +
      '.post-meta, .entry-meta, .article-meta, .post-info, .entry-info, ' +
      '.author-box, .author-bio, .author-info, [class*="author-card"], ' +
      '.related-posts, .related, .post-navigation, .nav-links, .pagination, ' +
      '.breadcrumb, [class*="breadcrumb"], ' +
      '[class*="widget"], .widget, ' +
      '.wp-block-categories, .wp-block-tag-cloud, .wp-block-latest-posts, ' +
      '.share-buttons, [class*="sharing"], [class*="social-share"], ' +
      '.ads, .ad, .comments, .comment-section, .sidebar, ' +
      '.share, .social, [class*="related"], [class*="recommend"], ' +
      '[class*="newsletter"], [class*="subscribe"], [class*="popup"], ' +
      'iframe, [class*="cookie"], [class*="banner"]'
    ).forEach(el => el.remove())

    const bodyText = clone.textContent?.trim() || ''
    const bodyHtml = clone.innerHTML || ''

    if (bodyText.length < 50) {
      return { success: false, error: 'Content too short' }
    }

    // --- Extract headings as key points ---
    const keyPoints: string[] = []
    const blacklist = ['related', 'comments', 'share', 'instagram', 'facebook', 'twitter', 'recommended', 'tags', 'sidebar']
    clone.querySelectorAll('h2, h3').forEach(el => {
      const text = el.textContent?.trim() || ''
      if (text.length > 5 && text.length < 150) {
        const lower = text.toLowerCase()
        if (!blacklist.some(b => lower.includes(b))) {
          keyPoints.push(text)
        }
      }
    })

    // Fallback to first paragraphs if no headings
    if (keyPoints.length === 0) {
      clone.querySelectorAll('p').forEach(el => {
        if (keyPoints.length >= 5) return
        const text = el.textContent?.trim() || ''
        if (text.length > 80) {
          const firstSentence = text.split(/[.!?]/)[0]?.trim()
          if (firstSentence && firstSentence.length > 20) {
            keyPoints.push(firstSentence.slice(0, 150))
          }
        }
      })
    }

    // --- Summary ---
    const summary =
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      bodyText.slice(0, 300)

    // --- Concepts (bold text + important links) ---
    const concepts: string[] = []
    const seen = new Set<string>()
    clone.querySelectorAll('strong, b').forEach(el => {
      const text = el.textContent?.trim() || ''
      if (text.length > 2 && text.length < 60 && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase())
        concepts.push(text)
      }
    })

    // --- Tags from meta ---
    const tags: string[] = []
    const kwMeta = document.querySelector('meta[name="keywords"]')?.getAttribute('content')
    if (kwMeta) {
      kwMeta.split(',').forEach(t => {
        const tag = t.trim().toLowerCase()
        if (tag.length > 1 && tag.length < 30) tags.push(tag)
      })
    }
    // Also check tag elements
    if (tags.length === 0) {
      document.querySelectorAll('.tag, .tags a, .category, [rel="tag"]').forEach(el => {
        const text = el.textContent?.trim().toLowerCase() || ''
        if (text.length > 1 && text.length < 30 && !tags.includes(text)) {
          tags.push(text)
        }
      })
    }

    // --- OG Image ---
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''
    const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || ''

    // --- Build content HTML ---
    const parts: string[] = []
    if (title) parts.push(`<p><strong>${title}</strong></p>`)
    if (author) parts.push(`<p><strong>Auteur :</strong> ${author}</p>`)
    if (date) parts.push(`<p><strong>Date :</strong> ${date}</p>`)
    if (keyPoints.length > 0) {
      parts.push('<p><strong>Points clés :</strong></p><ul>')
      keyPoints.slice(0, 5).forEach(k => parts.push(`<li>${k}</li>`))
      parts.push('</ul>')
    }
    parts.push(`<hr><div>${bodyHtml.slice(0, 10000)}</div>`)

    const content = parts.join('\n')

    return {
      success: true,
      pageTitle: title || 'Article',
      content,
      summary: typeof summary === 'string' ? summary : '',
      keyPoints: keyPoints.slice(0, 8),
      concepts: concepts.slice(0, 10),
      tags: tags.slice(0, 6),
      description: typeof summary === 'string' ? summary : '',
      author,
      ogImage,
      siteName,
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const genericArticleStrategy: SiteStrategy = {
  id: 'generic-article',
  label: 'Article générique',
  match: (_url: string) => {
    // Lowest priority fallback — matches any page that has an article/main element
    // The registry sorts by priority, so this only triggers if no other strategy matched
    return true
  },
  priority: -10,
  func: extractGenericArticle
}
