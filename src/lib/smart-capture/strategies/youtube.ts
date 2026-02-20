import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * YouTube — Enhanced extraction (self-contained)
 * Transcription > description, currentTime + timestamp URL, chapters
 * Never includes sidebar/recommendations
 */
function extractYouTube(): SiteExtractResult {
  try {
    // --- Title (multiple fallbacks) ---
    let title = ''
    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('#title h1') ||
      document.querySelector('h1.title') ||
      document.querySelector('[itemprop="name"]')
    if (titleEl?.textContent?.trim()) {
      title = titleEl.textContent.trim()
    }
    if (!title) {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      if (ogTitle) title = ogTitle
    }
    if (!title) {
      const docTitle = document.title
      if (docTitle && docTitle !== 'YouTube' && docTitle.length > 8) {
        title = docTitle.replace(/\s*-\s*YouTube$/i, '').trim()
      }
    }

    // --- Author ---
    const channelEl =
      document.querySelector('#channel-name a') ||
      document.querySelector('.ytd-channel-name a')
    const author = channelEl?.textContent?.trim() || ''

    // --- Description ---
    const descEl =
      document.querySelector('#description-inline-expander yt-formatted-string') ||
      document.querySelector('#description yt-formatted-string') ||
      document.querySelector('#description')
    const description = descEl?.textContent?.trim() || ''

    // --- Transcript (if panel is open) ---
    let transcript = ''
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
    if (!transcript) {
      const captionEls = document.querySelectorAll('.captions-text, .ytp-caption-segment')
      if (captionEls.length > 0) {
        transcript = Array.from(captionEls)
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .join(' ')
      }
    }

    // --- Current playback time from URL param 't' ---
    // video.currentTime is inaccessible from the page context (YouTube embeds video in
    // an isolated iframe). Instead, read the 't' parameter that YouTube writes to the
    // URL when the user pauses or seeks (e.g. youtube.com/watch?v=xxx&t=150).
    let currentTime = 0
    try {
      const tParam = new URL(window.location.href).searchParams.get('t')
      if (tParam) currentTime = parseInt(tParam, 10) || 0
    } catch { /* ignore */ }

    // urlWithTimestamp = current URL (already contains ?t= if YouTube set it)
    const urlWithTimestamp = window.location.href

    // --- Chapters from description timestamps ---
    const chapters: string[] = []
    if (description) {
      const timestampRegex = /(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]?\s*)([^\n]+)/g
      let match
      while ((match = timestampRegex.exec(description)) !== null) {
        const ch = match[1].trim()
        if (ch.length > 3 && ch.length < 100) chapters.push(ch)
      }
    }

    // --- Key points from transcript ---
    let transcriptKeyPoints: string[] = []
    if (transcript && transcript.length > 200) {
      const sentences = transcript
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s =>
          s.length > 40 && s.length < 200 &&
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
      if (sentences.length > 0) {
        const step = Math.max(1, Math.floor(sentences.length / 5))
        for (let i = 0; i < sentences.length && transcriptKeyPoints.length < 5; i += step) {
          transcriptKeyPoints.push(sentences[i].slice(0, 150))
        }
      }
    }

    // --- Description key points (fallback) ---
    let descriptionKeyPoints: string[] = []
    if (description && transcriptKeyPoints.length === 0 && chapters.length === 0) {
      descriptionKeyPoints = description
        .split('\n')
        .map(line => line.trim())
        .filter(line =>
          line.length > 30 && line.length < 150 &&
          !line.startsWith('http') &&
          !line.match(/^\d{1,2}:\d{2}/) &&
          !line.toLowerCase().includes('subscribe') &&
          !line.toLowerCase().includes('follow me') &&
          !line.toLowerCase().includes('instagram') &&
          !line.toLowerCase().includes('twitter') &&
          !line.toLowerCase().includes('discord') &&
          !line.toLowerCase().includes('patreon')
        )
        .slice(0, 5)
    }

    // --- Build key points (priority: chapters > transcript > description) ---
    let keyPoints: string[] = []
    if (chapters.length > 0) {
      keyPoints = chapters.slice(0, 8)
    } else if (transcriptKeyPoints.length > 0) {
      keyPoints = transcriptKeyPoints
    } else if (descriptionKeyPoints.length > 0) {
      keyPoints = descriptionKeyPoints
    }

    // --- Content = transcript > description ---
    const mainContent = transcript || description || ''

    // --- Format timestamp for display ---
    const formatTime = (s: number): string => {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      return `${m}:${String(sec).padStart(2, '0')}`
    }

    // --- Build HTML content ---
    const parts: string[] = []
    parts.push(`<p><strong>${title || 'Vidéo YouTube'}</strong></p>`)
    if (author) parts.push(`<p><strong>Chaîne :</strong> ${author}</p>`)
    if (currentTime > 0) {
      parts.push(`<p><strong>Position :</strong> ${formatTime(currentTime)}</p>`)
      parts.push(`<p><a href="${urlWithTimestamp}">Lien avec timestamp</a></p>`)
    }
    if (chapters.length > 0) {
      parts.push('<p><strong>Chapitres :</strong></p><ul>')
      chapters.slice(0, 8).forEach(ch => parts.push(`<li>${ch}</li>`))
      parts.push('</ul>')
    }
    if (mainContent) {
      parts.push(`<hr><p>${mainContent.slice(0, 8000)}</p>`)
    }

    const content = parts.join('\n')

    // --- Summary ---
    const summary = author ? `Vidéo de ${author}: ${title}` : title || 'Vidéo YouTube'

    // --- OG Image ---
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''

    return {
      success: content.length >= 50,
      pageTitle: title || 'Vidéo YouTube',
      content,
      summary,
      keyPoints,
      concepts: [],
      tags: ['youtube', author.toLowerCase().slice(0, 30)].filter(Boolean),
      description: description.slice(0, 300),
      author,
      ogImage,
      siteName: 'YouTube',
      extras: { currentTime, urlWithTimestamp, hasTranscript: transcript.length > 0, chaptersCount: chapters.length }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const youtubeStrategy: SiteStrategy = {
  id: 'youtube',
  label: 'YouTube',
  match: (url: string) => /youtube\.com\/watch|youtu\.be\//i.test(url),
  priority: 10,
  func: extractYouTube
}
