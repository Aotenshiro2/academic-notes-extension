// Raccord entre la capture heuristique et la capture IA (1.8.0).
//
// La règle, décidée avec Brice : AUTOMATIQUE AVEC REPLI. On tente l'IA, et on
// garde les heuristiques dès qu'on n'a pas de réponse exploitable — quota
// atteint, clé absente, réseau coupé, page trop maigre. L'élève n'a jamais de
// panne, seulement une capture moins bonne, et il n'a rien à comprendre.
//
// Le backend décide de tout (qui a droit, à quel palier, dans quel budget).
// L'extension ne connaît ni les paliers ni les prix : elle envoie et elle lit.
import { capturerAvecIA, etudierNoteAvecIA, type SortieCaptureIA } from './sync'
import { getLangueAnalyse } from './i18n'

/** Le sous-ensemble d'une capture heuristique qui nous intéresse ici. */
export interface CaptureHeuristique {
  url?: string
  pageTitle?: string
  content?: string
  summary?: string
  keyPoints?: string[]
  concepts?: string[]
  tags?: string[]
  /** Champs libres posés par la stratégie du site (ex. journalNoteIds) */
  extras?: Record<string, unknown>
}

export interface CaptureEnrichie {
  pageTitle: string
  summary: string
  keyPoints: string[]
  concepts: string[]
  tags: string[]
  /** ce que l'IA n'a pas pu lire — affiché discrètement, jamais bloquant */
  manquant: string
  /** vrai si la sortie vient du modèle, faux si on est retombé sur l'heuristique */
  parIA: boolean
}

/** HTML vers texte lisible par un modèle. Les balises coûtent des jetons et
 *  n'apportent rien : `<p><strong>Prix :</strong> 29 491</p>` se lit aussi bien
 *  en « Prix : 29 491 ». */
export function htmlVersTexte(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Le texte envoyé au modèle : ce que la stratégie du site a déjà trié.
 *  On n'envoie PAS la page brute : les stratégies savent où regarder, et
 *  10 000 caractères de menus coûtent des jetons pour dégrader la réponse. */
function payload(h: CaptureHeuristique): string {
  const morceaux: string[] = []
  if (h.url) morceaux.push(`URL : ${h.url}`)
  if (h.pageTitle) morceaux.push(`Titre : ${h.pageTitle}`)
  if (h.summary) morceaux.push(`Résumé heuristique : ${h.summary}`)
  if (h.keyPoints?.length) morceaux.push(`Éléments relevés :\n${h.keyPoints.map(p => `- ${p}`).join('\n')}`)
  if (h.content) {
    morceaux.push('')
    morceaux.push(htmlVersTexte(h.content))
  }
  // La transcription vidéo (YouTube) voyage à part : dans la note elle a son
  // bloc horodaté, ici le modèle reçoit le texte aplati. 9 000 caractères,
  // pour laisser la place au reste sous le plafond serveur de 12 000.
  const transcription = typeof h.extras?.transcriptionTexte === 'string'
    ? (h.extras.transcriptionTexte as string)
    : ''
  if (transcription) {
    morceaux.push('')
    morceaux.push('Transcription de la vidéo :')
    morceaux.push(transcription.slice(0, 9000))
  }
  return morceaux.join('\n')
}

function repli(h: CaptureHeuristique): CaptureEnrichie {
  return {
    pageTitle: h.pageTitle ?? '',
    summary: h.summary ?? '',
    keyPoints: h.keyPoints ?? [],
    concepts: h.concepts ?? [],
    tags: h.tags ?? [],
    manquant: '',
    parIA: false,
  }
}

/**
 * 1er temps : le secrétaire. Rend toujours un résultat exploitable — celui du
 * modèle s'il a répondu, celui des heuristiques sinon.
 *
 * `screenshot` est la data URL renvoyée par captureVisibleTab. Le backend ne
 * la joint que sur les familles où elle apporte quelque chose (graphique,
 * plateforme) : ailleurs elle coûterait ~1 200 jetons pour redire le texte.
 */
export async function enrichirCapture(
  h: CaptureHeuristique,
  screenshot?: string | null
): Promise<CaptureEnrichie> {
  const contenu = payload(h)
  if (!h.url || (contenu.length < 40 && !screenshot)) return repli(h)

  // Canvas du journal : les ids des vraies notes partent avec la demande,
  // le serveur les résout en contenu réel (famille maison qui LIT le journal)
  const journalNoteIds = Array.isArray(h.extras?.journalNoteIds)
    ? (h.extras!.journalNoteIds as string[])
    : undefined
  const journalLiens = Array.isArray(h.extras?.journalLiens)
    ? (h.extras!.journalLiens as [string, string][])
    : undefined

  const { sortie, error } = await capturerAvecIA({
    url: h.url,
    contenu,
    image: screenshot ?? null,
    langue: getLangueAnalyse(),
    journalNoteIds,
    journalLiens,
  })
  if (!sortie) {
    if (error) console.info('[capture IA] repli sur les heuristiques :', error)
    return repli(h)
  }

  return {
    // Le titre du modèle ne remplace celui de la page que s'il en propose un.
    pageTitle: sortie.titre || h.pageTitle || '',
    summary: sortie.resume || h.summary || '',
    keyPoints: sortie.pointsCles?.length ? sortie.pointsCles : (h.keyPoints ?? []),
    concepts: sortie.concepts?.length ? sortie.concepts : (h.concepts ?? []),
    // Les tags de la page (meta keywords, catégories) valent ceux du modèle :
    // on garde les deux, dédoublonnés, plafonnés.
    tags: [...new Set([...(sortie.tags ?? []), ...(h.tags ?? [])])].slice(0, 8),
    manquant: sortie.manquant ?? '',
    parIA: true,
  }
}

/**
 * Tags automatiques sur une note DÉJÀ remplie (demande Brice, 17/09/2026) :
 * la capture intelligente sait taguer une page, mais rien ne savait taguer
 * une note existante sans capturer quoi que ce soit. Même passe secrétaire,
 * même gating et mêmes budgets serveur (famille « relecture »).
 *
 * UN clic = UN appel, au coût borné quelle que soit la taille de la note :
 * tout le texte (10 000 caractères max) + un ÉCHANTILLON de 3 images
 * (début / milieu / fin — une leçon change de sujet en route, la première
 * capture ne suffit pas, remarque Brice du 18/09). On récolte les tags ET
 * les concepts : ce sont eux qui font remonter la note dans le journal.
 * Renvoie null si l'IA n'a rien donné — pas de tags inventés en repli.
 */
export async function suggererTagsNote(note: {
  title?: string
  tags?: string[]
  concepts?: string[]
  messages?: { type: string; content: string }[]
}): Promise<{ tags: string[]; concepts: string[] } | null> {
  const textes: string[] = []
  const imagesNote: string[] = []
  for (const m of note.messages ?? []) {
    if (m.type === 'text' && textes.join('\n').length < 10_000) textes.push(htmlVersTexte(m.content))
    if (m.type === 'image' && m.content.startsWith('data:')) imagesNote.push(m.content)
  }
  // Échantillon début / milieu / fin, dédoublonné (une note à 1 ou 2 images
  // donne 1 ou 2 entrées, pas des doublons)
  const echantillon = [...new Set([
    imagesNote[0],
    imagesNote[Math.floor(imagesNote.length / 2)],
    imagesNote[imagesNote.length - 1],
  ].filter(Boolean))] as string[]

  const contenu = [
    note.title ? `Titre de la note : ${note.title}` : '',
    textes.join('\n').slice(0, 10_000),
  ].filter(Boolean).join('\n\n')
  if (contenu.length < 60 && echantillon.length === 0) return null

  const { sortie } = await capturerAvecIA({
    url: 'https://note-locale.carnet/tags',
    contenu,
    images: echantillon,
    langue: getLangueAnalyse(),
  })
  if (!sortie) return null
  const tags = [...new Set([...(note.tags ?? []), ...(sortie.tags ?? [])])].slice(0, 10)
  const concepts = [...new Set([...(note.concepts ?? []), ...(sortie.concepts ?? [])])].slice(0, 12)
  if (tags.length === (note.tags ?? []).length && concepts.length === (note.concepts ?? []).length) return null
  return { tags, concepts }
}

export interface EtudeRendue {
  sortie?: SortieCaptureIA
  /** 'reservee' quand le palier ne l'ouvre pas — le client affiche l'upgrade */
  refus?: 'reservee' | 'quota' | 'erreur'
  message?: string
}

/**
 * 2e temps : l'étude. Déclenchée par le bouton « Étudier la note », jamais
 * automatiquement — la lecture n'est voulue qu'une fois sur cinq, et elle vaut
 * le plus au moment de la relecture, deux semaines plus tard.
 *
 * Elle relit le contenu BRUT de la note, pas le résumé du secrétaire : la
 * meilleure trouvaille du banc venait de la lecture du tableau brut, qu'un
 * résumé aurait lissée.
 */
export async function etudierNote(
  h: CaptureHeuristique,
  screenshot?: string | null,
  noteId?: string,
  modelePrefere?: string | null
): Promise<EtudeRendue> {
  if (!h.url) return { refus: 'erreur', message: 'Cette note n’a pas de source à étudier.' }

  const { sortie, error, statut } = await etudierNoteAvecIA({
    url: h.url,
    contenu: payload(h),
    image: screenshot ?? null,
    noteId,
    modele: modelePrefere ?? null,
    langue: getLangueAnalyse(),
  })
  if (sortie) return { sortie }
  if (statut === 403) return { refus: 'reservee', message: error }
  if (statut === 429) return { refus: 'quota', message: error }
  return { refus: 'erreur', message: error ?? 'Étude indisponible.' }
}
