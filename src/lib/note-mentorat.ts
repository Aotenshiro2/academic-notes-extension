// La note « Mentorat AOK » (1.8.1).
//
// Idée de Brice : la conversation avec le mentor n'a pas besoin d'un objet
// « conversation » à part. C'est une NOTE, épinglée en tête de l'historique.
// Elle se synchronise, s'exporte et se relit comme les autres, l'élève peut y
// écrire pour lui-même entre deux échanges, et on n'a rien inventé.
//
// Comment on distingue qui parle : les réponses du mentor portent le tag
// `mentor` sur leur bloc. Tout le reste est de l'élève. Aucun type de bloc
// nouveau, aucune migration.
import storage from './storage'
import type { AcademicNote, NoteMessage } from '@/types/academic'

export const TITRE_NOTE_MENTORAT = 'Mentorat AOK'
const TAG_MENTOR = 'mentor'
const CLE_ID = 'aok_note_mentorat_id'
export const TAG_PIECE_JOINTE = 'piece-jointe'

export interface TourMentorat {
  role: 'user' | 'assistant'
  content: string
  at: number
  messageId: string
  /** note jointe depuis « Analyser cette note » : le fil n'en montre que
   *  l'en-tête, le modèle en reçoit le contenu entier */
  pieceJointe: boolean
}

/** HTML vers texte : ce qu'on renvoie au modèle et ce qu'on affiche dans le
 *  fil. Les balises coûtent des jetons et n'apportent rien à une conversation. */
function versTexte(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li>/gi, '- ')
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

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Texte brut vers HTML de bloc, en gardant les paragraphes. */
export function versHtml(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .map(p => `<p>${echapper(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

async function idMemorise(): Promise<string | null> {
  try {
    const v = await chrome.storage.local.get(CLE_ID)
    return typeof v?.[CLE_ID] === 'string' ? v[CLE_ID] : null
  } catch {
    return null
  }
}

async function memoriserId(id: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [CLE_ID]: id })
  } catch {
    /* pas bloquant : on retrouvera la note par son titre */
  }
}

/**
 * La note de mentorat, créée si elle n'existe pas encore.
 *
 * On la retrouve d'abord par l'identifiant mémorisé, puis par son titre — un
 * élève qui a effacé son stockage local ou synchronisé depuis une autre
 * machine ne doit pas se retrouver avec deux notes de mentorat.
 */
export async function obtenirNoteMentorat(): Promise<AcademicNote> {
  const memorise = await idMemorise()
  if (memorise) {
    const existante = await storage.getNote(memorise)
    if (existante) return existante
  }

  const resumes = await storage.getNoteSummaries(1000)
  const parTitre = resumes.find(n => n.title.trim().toLowerCase() === TITRE_NOTE_MENTORAT.toLowerCase())
  if (parTitre) {
    const complete = await storage.getNote(parTitre.id)
    if (complete) {
      await memoriserId(complete.id)
      // Une note retrouvée par son titre a pu perdre son épinglage (import,
      // synchro depuis une autre machine) : on le repose.
      if (!complete.pinned) {
        await storage.saveNote({ ...complete, pinned: true })
        return { ...complete, pinned: true }
      }
      return complete
    }
  }

  const id = Date.now().toString()
  const note: AcademicNote = {
    id,
    title: TITRE_NOTE_MENTORAT,
    content: '',
    summary: 'Ton fil avec le mentor. Écris ce que tu veux ici, rien ne part tant que tu ne le demandes pas.',
    keyPoints: [],
    url: '',
    timestamp: Date.now(),
    type: 'webpage',
    tags: ['mentorat'],
    concepts: [],
    pinned: true,
    screenshots: [],
    metadata: { domain: 'aoknowledge.com', title: TITRE_NOTE_MENTORAT, language: 'fr' },
  }
  await storage.saveNote(note)
  await memoriserId(id)
  return note
}

/** La note de mentorat SI elle existe. Ne la crée pas — sert aux cas où on
 *  veut agir sur une note existante sans en fabriquer une au passage. */
export async function trouverNoteMentorat(): Promise<AcademicNote | null> {
  const memorise = await idMemorise()
  if (memorise) {
    const existante = await storage.getNote(memorise)
    if (existante) return existante
  }
  const resumes = await storage.getNoteSummaries(1000)
  const parTitre = resumes.find(n => n.title.trim().toLowerCase() === TITRE_NOTE_MENTORAT.toLowerCase())
  return parTitre ? await storage.getNote(parTitre.id) : null
}

/**
 * Retire l'épinglage quand le compte n'a plus le mentorat (déconnexion, fin
 * d'abonnement).
 *
 * On ne SUPPRIME rien et on ne CACHE rien : cette note contient ce que l'élève
 * a écrit lui-même, et faire disparaître ses propres mots parce qu'un
 * abonnement s'arrête serait une faute. Mais l'épinglage, lui, est un privilège
 * de la fonction active : sans mentorat, la note redescend simplement dans
 * l'ordre chronologique au lieu de tenir la première place à vie.
 *
 * Le bouton « Demander au mentor » reste de toute façon refusé côté serveur.
 */
export async function desepinglerSiPlusDeMentorat(): Promise<void> {
  const note = await trouverNoteMentorat()
  if (note?.pinned) await storage.saveNote({ ...note, pinned: false })
}

/** Le fil, tel qu'on le renvoie au modèle et qu'on l'affiche. Les images et
 *  les blocs `meta` sont ignorés : ils n'ont rien à faire dans un dialogue. */
export function lireConversation(note: AcademicNote): TourMentorat[] {
  return (note.messages ?? [])
    .filter((m: NoteMessage) => m.type === 'text')
    .map((m: NoteMessage) => ({
      role: (m.tags ?? []).includes(TAG_MENTOR) ? ('assistant' as const) : ('user' as const),
      content: versTexte(m.content),
      at: m.timestamp,
      messageId: m.id,
      pieceJointe: (m.tags ?? []).includes(TAG_PIECE_JOINTE),
    }))
    .filter(t => t.content.length > 0)
}

/** Ce que l'élève a écrit DEPUIS la dernière réponse du mentor.
 *
 *  C'est ce qui part quand il clique « demander au mentor », et pas seulement
 *  la dernière ligne : on écrit dans un carnet par petits bouts, on réfléchit,
 *  puis on demande une fois. Ça colle à l'usage et ça évite de payer trois
 *  appels pour une seule pensée. */
export function enAttenteDeReponse(tours: TourMentorat[]): TourMentorat[] {
  const dernierMentor = tours.map(t => t.role).lastIndexOf('assistant')
  return tours.slice(dernierMentor + 1).filter(t => t.role === 'user')
}

/** Ajoute un tour de l'élève. Gratuit : aucun appel au modèle. */
export async function ecrireTourEleve(noteId: string, texte: string): Promise<void> {
  await storage.addMessageToNote(noteId, { type: 'text', content: versHtml(texte) })
}

/** Ajoute la réponse du mentor, marquée par son tag. */
export async function ecrireReponseMentor(noteId: string, texte: string): Promise<void> {
  await storage.addMessageToNote(noteId, {
    type: 'text',
    content: versHtml(texte),
    tags: [TAG_MENTOR],
  })
}

/**
 * Joindre une note au fil, depuis « Analyser cette note ».
 *
 * Le bloc contient DEUX choses : une première ligne qui dit qu'une note a été
 * jointe, et le contenu complet en dessous. Le fil n'affiche que la première
 * ligne — recopier une note entière dans une conversation la rendrait
 * illisible — mais le modèle, lui, reçoit tout : c'est le même bloc, et
 * `lireConversation` ne tronque rien.
 *
 * Aucun jeton ne part à ce moment-là. Le mentor ne verra cette note que
 * lorsque l'élève cliquera « Demander au mentor ».
 */
export async function joindreNoteAuMentor(
  noteId: string,
  titre: string,
  contenu: string
): Promise<void> {
  const entete = `Note jointe : ${titre}`
  await storage.addMessageToNote(noteId, {
    type: 'text',
    content: versHtml(`${entete}\n\n${contenu}`),
    tags: [TAG_PIECE_JOINTE],
  })
}

/** Ce que le FIL affiche d'un tour : tout, sauf pour une pièce jointe dont on
 *  ne montre que l'en-tête. Le modèle, lui, reçoit `content` en entier. */
export function apercuDuTour(tour: TourMentorat, estPieceJointe: boolean): string {
  if (!estPieceJointe) return tour.content
  const [premiere] = tour.content.split('\n')
  return premiere || tour.content.slice(0, 120)
}
