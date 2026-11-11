// Le menu du clic droit (et Alt+Maj+C) confie son geste au panneau (1.9.1).
//
// Avant, « Capturer cette page », « Capturer la sélection » et « Prendre une
// capture d'écran » passaient par de vieilles fonctions du service worker :
// elles enregistraient une note à l'ancien format (texte brut, sans capture
// d'écran ni blocs), sans ouvrir le panneau et sans montrer la note. Pour le
// membre, rien ne se passait.
//
// Désormais le service worker ouvre le panneau (un clic dans le menu est un
// geste qui permet sidePanel.open) et lui laisse la demande dans
// chrome.storage.session. Le panneau fait alors EXACTEMENT ce que font ses
// propres boutons : un panneau déjà ouvert voit la demande arriver
// (storage.onChanged), un panneau qui s'ouvre la lit à son démarrage.
// Règles pures ici, testées dans tests/demandes-panneau.test.ts ; le câblage
// du panneau : use-demandes-panneau.ts.

export const CLE_DEMANDE_PANNEAU = 'demandePanneau'

/** Au-delà, une demande restée en attente (panneau jamais ouvert) est ignorée. */
export const DUREE_DEMANDE_MS = 60_000

interface DemandeBase {
  tabId: number
  windowId: number
  /** Date.now() au moment du clic : sert à dater et à ne jamais traiter deux fois. */
  at: number
}

export type DemandePanneau =
  | (DemandeBase & { type: 'capture-intelligente' })
  | (DemandeBase & { type: 'capture-ecran' })
  | (DemandeBase & { type: 'selection'; texte: string; url: string; titre: string })

const TYPES = ['capture-intelligente', 'capture-ecran', 'selection'] as const

/**
 * La demande à traiter, ou null : forme inattendue, trop vieille, ou destinée
 * au panneau d'une autre fenêtre (chaque fenêtre a son propre panneau).
 * `fenetre` null = fenêtre inconnue, on ne filtre pas.
 */
export function demandeValide(valeur: unknown, maintenant: number, fenetre: number | null): DemandePanneau | null {
  if (!valeur || typeof valeur !== 'object') return null
  const d = valeur as Record<string, unknown>
  if (!TYPES.includes(d.type as (typeof TYPES)[number])) return null
  if (typeof d.tabId !== 'number' || typeof d.windowId !== 'number' || typeof d.at !== 'number') return null
  const age = maintenant - d.at
  if (age < 0 || age > DUREE_DEMANDE_MS) return null
  if (fenetre !== null && d.windowId !== fenetre) return null
  if (d.type === 'selection') {
    if (typeof d.texte !== 'string' || !d.texte.trim()) return null
    return {
      type: 'selection', tabId: d.tabId, windowId: d.windowId, at: d.at,
      texte: d.texte, url: typeof d.url === 'string' ? d.url : '', titre: typeof d.titre === 'string' ? d.titre : '',
    }
  }
  return { type: d.type as 'capture-intelligente' | 'capture-ecran', tabId: d.tabId, windowId: d.windowId, at: d.at }
}

/** Clé de dédoublonnage : une même demande ne se traite qu'une fois par panneau. */
export function cleDemande(d: DemandePanneau): string {
  return `${d.type}:${d.tabId}:${d.at}`
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Le texte sélectionné, en HTML sûr : un paragraphe par bloc séparé d'une
 * ligne vide, les retours simples gardés. Rien de la page n'est interprété.
 */
export function selectionEnHtml(texte: string): string {
  return texte
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(bloc => bloc.trim())
    .filter(Boolean)
    .map(bloc => `<p>${echapper(bloc).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** La ligne de source posée sous une sélection ou une capture d'écran. */
export function ligneSource(titre: string, url: string, quand: string): string {
  const page = titre || url
  return url && page !== url ? `📅 ${quand} • 🌐 ${page} (${url})` : `📅 ${quand} • 🌐 ${page}`
}
