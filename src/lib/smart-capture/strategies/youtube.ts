import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * YouTube — extraction (auto-suffisante, injectée par executeScript).
 *
 * Corrigé en 1.8.0. La capture du 30/08/2026 sur une vidéo de The Futur ne
 * ramenait QUE le titre, répété trois fois, plus la chaîne et la position de
 * lecture : la description, pourtant affichée sous la vidéo, était perdue.
 *
 * Deux causes, deux correctifs :
 *
 *  1. Les sélecteurs visaient `yt-formatted-string`, qui date d'avant la
 *     refonte de l'interface : la description vit maintenant dans
 *     `yt-attributed-string` / `.yt-core-attributed-string`, et elle est de
 *     toute façon tronquée par le « ...more » tant que personne ne déplie.
 *     On la lit donc À LA SOURCE, dans le JSON `ytInitialPlayerResponse` que
 *     YouTube pose dans un <script> de la page. Le texte d'un <script> est
 *     lisible depuis le monde isolé de l'extension, contrairement aux
 *     variables globales de la page. On récupère la description ENTIÈRE, non
 *     tronquée, plus la durée et la chaîne.
 *
 *  2. Le contenu reconstruit répétait le titre, que l'appelant affiche déjà.
 *     Il ne porte plus que ce que l'appelant n'a pas : position de lecture,
 *     lien horodaté, description et transcription.
 */
function extractYouTube(): SiteExtractResult {
  try {
    const propre = (s: string | null | undefined): string => (s ?? '').trim()

    // --- Source de vérité : le JSON du lecteur ---------------------------
    // On ne parse pas tout le blob (plusieurs centaines de Ko) : on va
    // chercher les trois champs utiles au motif, puis on les déséchappe en
    // les repassant par JSON.parse, qui gère \n, \" et \uXXXX.
    const depuisLeJson = (): { description: string; duree: number; auteur: string; titre: string } => {
      const vide = { description: '', duree: 0, auteur: '', titre: '' }
      try {
        const script = Array.from(document.querySelectorAll('script')).find(
          s => (s.textContent ?? '').includes('ytInitialPlayerResponse')
        )
        const txt = script?.textContent
        if (!txt) return vide
        const lire = (cle: string): string => {
          const m = new RegExp('"' + cle + '":"((?:[^"\\\\]|\\\\.)*)"').exec(txt)
          if (!m) return ''
          try {
            return JSON.parse('"' + m[1] + '"')
          } catch {
            return ''
          }
        }
        return {
          description: lire('shortDescription'),
          duree: parseInt(lire('lengthSeconds'), 10) || 0,
          auteur: lire('author'),
          titre: lire('title'),
        }
      } catch {
        return vide
      }
    }
    const json = depuisLeJson()

    // --- Titre ------------------------------------------------------------
    let title = propre(
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ??
        document.querySelector('#title h1')?.textContent ??
        document.querySelector('h1.title')?.textContent ??
        document.querySelector('[itemprop="name"]')?.textContent
    )
    if (!title) title = json.titre
    if (!title) title = propre(document.querySelector('meta[property="og:title"]')?.getAttribute('content'))
    if (!title) {
      const t = document.title
      if (t && t !== 'YouTube' && t.length > 8) title = t.replace(/\s*-\s*YouTube$/i, '').trim()
    }

    // --- Chaîne -----------------------------------------------------------
    const author =
      propre(document.querySelector('#channel-name a')?.textContent) ||
      propre(document.querySelector('.ytd-channel-name a')?.textContent) ||
      json.auteur

    // --- Description : JSON d'abord, DOM ensuite, meta en dernier ---------
    let description = json.description
    if (!description) {
      const cible =
        document.querySelector('#description-inline-expander yt-attributed-string') ||
        document.querySelector('#description-inline-expander .yt-core-attributed-string') ||
        document.querySelector('#description .yt-core-attributed-string') ||
        document.querySelector('#description-inline-expander') ||
        document.querySelector('#description yt-formatted-string') ||
        document.querySelector('#description')
      description = propre(cible?.textContent).replace(/\s*\.{3}\s*(more|plus)\s*$/i, '')
    }
    if (!description) {
      description = propre(document.querySelector('meta[name="description"]')?.getAttribute('content'))
    }

    // --- Transcription (si le panneau est ouvert) -------------------------
    let transcript = ''
    const segments = document.querySelectorAll(
      'ytd-transcript-segment-renderer .segment-text,' +
        'ytd-transcript-segment-renderer yt-formatted-string'
    )
    if (segments.length > 0) {
      transcript = Array.from(segments).map(el => propre(el.textContent)).filter(Boolean).join(' ')
    }
    if (!transcript) {
      const sousTitres = document.querySelectorAll('.captions-text, .ytp-caption-segment')
      if (sousTitres.length > 0) {
        transcript = Array.from(sousTitres).map(el => propre(el.textContent)).filter(Boolean).join(' ')
      }
    }

    // --- Position de lecture, via le paramètre t de l'URL -----------------
    // video.currentTime est inaccessible depuis le monde isolé ; YouTube
    // écrit `t` dans l'URL quand l'utilisateur met en pause ou se déplace.
    let currentTime = 0
    try {
      const t = new URL(window.location.href).searchParams.get('t')
      if (t) currentTime = parseInt(t, 10) || 0
    } catch {
      /* ignore */
    }
    const urlWithTimestamp = window.location.href

    // --- Chapitres : timestamps EN DÉBUT DE LIGNE seulement ---------------
    // L'ancien motif attrapait n'importe quelle ligne contenant une heure,
    // y compris en plein milieu d'une phrase. On garde l'horodatage avec le
    // libellé : un chapitre sans son heure ne sert à rien pour y revenir.
    const chapters: string[] = []
    if (description) {
      const motif = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–—:]?\s*(.+?)\s*$/gm
      let m: RegExpExecArray | null
      while ((m = motif.exec(description)) !== null) {
        const libelle = m[2].trim()
        if (libelle.length > 2 && libelle.length < 120) chapters.push(`${m[1]} ${libelle}`)
      }
    }

    // --- Points clés depuis la transcription ------------------------------
    const transcriptKeyPoints: string[] = []
    if (transcript && transcript.length > 200) {
      const phrases = transcript
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(
          s =>
            s.length > 40 &&
            s.length < 200 &&
            !/subscribe|like this video|click the bell|hit the like|leave a comment|check out my|link in the description|abonnez|likez/i.test(s)
        )
      if (phrases.length > 0) {
        const pas = Math.max(1, Math.floor(phrases.length / 5))
        for (let i = 0; i < phrases.length && transcriptKeyPoints.length < 5; i += pas) {
          transcriptKeyPoints.push(phrases[i].slice(0, 150))
        }
      }
    }

    // --- Points clés depuis la description (repli) ------------------------
    let descriptionKeyPoints: string[] = []
    if (description && transcriptKeyPoints.length === 0 && chapters.length === 0) {
      descriptionKeyPoints = description
        .split('\n')
        .map(l => l.trim())
        .filter(
          l =>
            l.length > 30 &&
            l.length < 200 &&
            !l.startsWith('http') &&
            !/^\d{1,2}:\d{2}/.test(l) &&
            !/subscribe|follow me|instagram|twitter|discord|patreon|tiktok|abonne/i.test(l)
        )
        .slice(0, 5)
    }

    let keyPoints: string[] = []
    if (chapters.length > 0) keyPoints = chapters.slice(0, 8)
    else if (transcriptKeyPoints.length > 0) keyPoints = transcriptKeyPoints
    else if (descriptionKeyPoints.length > 0) keyPoints = descriptionKeyPoints

    const mainContent = transcript || description || ''

    const formatTime = (s: number): string => {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      return `${m}:${String(sec).padStart(2, '0')}`
    }

    // --- Contenu ----------------------------------------------------------
    // Ni le titre ni le résumé : l'appelant les affiche déjà en tête de note.
    // Les redonner ici était la cause de la triple répétition du titre.
    const parts: string[] = []
    if (author) parts.push(`<p><strong>Chaîne :</strong> ${author}</p>`)
    if (json.duree > 0) parts.push(`<p><strong>Durée :</strong> ${formatTime(json.duree)}</p>`)
    if (currentTime > 0) {
      parts.push(`<p><strong>Position :</strong> ${formatTime(currentTime)}</p>`)
      parts.push(`<p><a href="${urlWithTimestamp}">Lien avec timestamp</a></p>`)
    }
    if (mainContent) {
      parts.push(`<hr><p>${mainContent.slice(0, 8000).replace(/\n/g, '<br>')}</p>`)
    }
    const content = parts.join('\n')

    return {
      success: content.length >= 50 || Boolean(description),
      pageTitle: title || 'Vidéo YouTube',
      content,
      summary: author ? `Vidéo de ${author} : ${title}` : title || 'Vidéo YouTube',
      keyPoints,
      concepts: [],
      tags: ['youtube', author.toLowerCase().slice(0, 30)].filter(Boolean),
      description: description.slice(0, 300),
      author,
      ogImage: propre(document.querySelector('meta[property="og:image"]')?.getAttribute('content')),
      siteName: 'YouTube',
      extras: {
        currentTime,
        urlWithTimestamp,
        dureeSecondes: json.duree,
        hasTranscript: transcript.length > 0,
        chaptersCount: chapters.length,
        descriptionDepuisJson: Boolean(json.description),
        descriptionLongueur: description.length,
      },
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
  func: extractYouTube,
}
