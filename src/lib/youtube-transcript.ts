/**
 * YouTube transcript extraction with DOM scraping + fallback strategies.
 * Designed to run inside a content script context (has access to page DOM).
 */

export interface TranscriptSegment {
  text: string
  startTime?: number
}

export interface TranscriptResult {
  success: boolean
  transcript?: string
  segments?: TranscriptSegment[]
  error?: string
}

/**
 * Extract YouTube video ID from current URL
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v')
    }
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1)
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Strategy 1: DOM scraping — extract transcript from YouTube's transcript panel.
 * This requires the transcript panel to already be open or we attempt to open it.
 */
export function extractTranscriptFromDOM(): TranscriptResult {
  try {
    // Check if transcript panel is already open
    const transcriptSegments = document.querySelectorAll(
      'ytd-transcript-segment-renderer, ' +
      'ytd-transcript-segment-list-renderer .segment, ' +
      '[class*="transcript"] .segment-text'
    )

    if (transcriptSegments.length > 0) {
      const segments: TranscriptSegment[] = []
      transcriptSegments.forEach(el => {
        const text = el.querySelector('.segment-text, yt-formatted-string')?.textContent?.trim() ||
                     el.textContent?.trim() || ''
        if (text) {
          const timeEl = el.querySelector('.segment-timestamp, .segment-start-offset')
          const startTime = timeEl ? parseTimestamp(timeEl.textContent?.trim() || '') : undefined
          segments.push({ text, startTime })
        }
      })

      if (segments.length > 0) {
        return {
          success: true,
          transcript: segments.map(s => s.text).join(' '),
          segments
        }
      }
    }

    // Try looking for captions currently displayed on the video
    const captionWindow = document.querySelector('.ytp-caption-window-container')
    if (captionWindow) {
      const captionText = captionWindow.textContent?.trim()
      if (captionText) {
        return {
          success: true,
          transcript: captionText
        }
      }
    }

    return { success: false, error: 'Transcript panel not found in DOM' }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'DOM extraction failed'
    }
  }
}

/**
 * Strategy 2: Fetch transcript via YouTube's internal API (no API key needed).
 * Uses the same endpoint YouTube's frontend uses to load transcripts.
 */
export async function extractTranscriptFromInternalAPI(videoId: string): Promise<TranscriptResult> {
  try {
    // Fetch the video page to get the serialized player data
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!pageResponse.ok) {
      return { success: false, error: `Failed to fetch video page: ${pageResponse.status}` }
    }

    const html = await pageResponse.text()

    // Extract captions data from ytInitialPlayerResponse
    const captionsMatch = html.match(/"captions":\s*(\{.*?"captionTracks".*?\})\s*,\s*"videoDetails"/)
    if (!captionsMatch) {
      return { success: false, error: 'No captions data found in page' }
    }

    let captionsData: any
    try {
      // Find the full captions JSON block
      const jsonStr = extractJsonBlock(html, '"captions":')
      captionsData = JSON.parse(jsonStr)
    } catch {
      return { success: false, error: 'Failed to parse captions data' }
    }

    const tracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks || tracks.length === 0) {
      return { success: false, error: 'No caption tracks available' }
    }

    // Prefer French, then English, then first available
    const track = tracks.find((t: any) => t.languageCode === 'fr') ||
                  tracks.find((t: any) => t.languageCode === 'en') ||
                  tracks[0]

    if (!track?.baseUrl) {
      return { success: false, error: 'No usable caption track URL' }
    }

    // Fetch the transcript XML
    const transcriptResponse = await fetch(track.baseUrl)
    if (!transcriptResponse.ok) {
      return { success: false, error: 'Failed to fetch transcript data' }
    }

    const transcriptXml = await transcriptResponse.text()
    const segments = parseTranscriptXml(transcriptXml)

    if (segments.length === 0) {
      return { success: false, error: 'Empty transcript' }
    }

    return {
      success: true,
      transcript: segments.map(s => s.text).join(' '),
      segments
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal API extraction failed'
    }
  }
}

/**
 * Main orchestrator: tries DOM scraping first, then internal API.
 */
export async function getYouTubeTranscript(videoId: string): Promise<TranscriptResult> {
  // Strategy 1: DOM scraping (instant, no network)
  const domResult = extractTranscriptFromDOM()
  if (domResult.success && domResult.transcript && domResult.transcript.length > 50) {
    return domResult
  }

  // Strategy 2: Internal API (network, but no API key needed)
  const apiResult = await extractTranscriptFromInternalAPI(videoId)
  if (apiResult.success) {
    return apiResult
  }

  return {
    success: false,
    error: 'Impossible d\'extraire la transcription. La vidéo n\'a peut-être pas de sous-titres disponibles.'
  }
}

// --- Helpers ---

function parseTimestamp(text: string): number {
  const parts = text.split(':').map(Number).reverse()
  let seconds = 0
  if (parts[0]) seconds += parts[0]
  if (parts[1]) seconds += parts[1] * 60
  if (parts[2]) seconds += parts[2] * 3600
  return seconds
}

function parseTranscriptXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  const regex = /<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g
  let match

  while ((match = regex.exec(xml)) !== null) {
    const startTime = parseFloat(match[1])
    const text = decodeXmlEntities(match[2]).trim()
    if (text) {
      segments.push({ text, startTime })
    }
  }

  return segments
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, ' ')
}

function extractJsonBlock(html: string, prefix: string): string {
  const startIdx = html.indexOf(prefix)
  if (startIdx === -1) throw new Error('Prefix not found')

  // Find the opening brace after prefix
  const braceStart = html.indexOf('{', startIdx)
  if (braceStart === -1) throw new Error('No opening brace')

  let depth = 0
  let i = braceStart
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}') depth--
    if (depth === 0) break
  }

  return html.substring(braceStart, i + 1)
}
