// La bulle « Ouvrir le Carnet » sur les plateformes (1.9.2).
//
// Décision de Brice (11/11/2026) : le Carnet ne peut pas s'ouvrir tout seul,
// Chrome exige un geste. Quand le membre arrive sur une de ses plateformes de
// trading, une petite bulle en bas à droite lui propose d'ouvrir le Carnet, et
// un clic ouvre le panneau. Les sites se règlent dans les réglages.
// - Par défaut : les plateformes que le Carnet sait lire.
// - Une fois par onglet, et pas si le panneau est déjà ouvert dans la fenêtre.
// - × ferme la bulle pour l'onglet ; « Ne plus proposer ici » retire le site.
// - Aucune permission nouvelle : le content script tourne déjà partout.
//
// Qui fait quoi :
// - le service worker pose la liste de départ à l'installation et à la mise
//   à jour, décide (une fois par onglet, panneau fermé), traduit, ouvre le
//   panneau sur le clic et retire un site ;
// - le content script (content/bulle-carnet-ui.ts) lit la liste dans
//   chrome.storage.local et ne réveille le service worker que sur un site de
//   la liste. Script classique, il ne peut pas importer ce fichier (partagé,
//   il y deviendrait un `import`) : il garde une copie de `hoteDansListe`,
//   comparée à celle-ci dans tests/bulle-carnet.test.ts ;
// - l'écran des réglages (components/BulleReglages.tsx) lit et écrit la même clé.
//
// Règles pures, testées dans tests/bulle-carnet.test.ts.

/** chrome.storage.local : { actif, sites } */
export const CLE_BULLE = 'bulleCarnet'
/** chrome.storage.session : les onglets où la bulle a déjà été proposée */
export const CLE_BULLE_ONGLETS = 'bulleOnglets'

export interface ReglagesBulle {
  actif: boolean
  /** Noms d'hôte, sans « www. » ; un site couvre ses sous-domaines. */
  sites: string[]
}

/** Les textes de la bulle, traduits par le service worker. */
export interface TextesBulle {
  titre: string
  ouvrir: string
  nePlusProposer: string
  fermer: string
  cliqueIcone: string
  retire: string
}

/** Les plateformes que le Carnet sait lire (smart-capture/strategies). */
export const SITES_BULLE_DEFAUT: { hote: string; nom: string }[] = [
  { hote: 'topstepx.com', nom: 'TopStepX' },
  { hote: 'dashboard.topstep.com', nom: 'Topstep' },
  { hote: 'trader.tradovate.com', nom: 'Tradovate' },
  { hote: 'app.simplefx.com', nom: 'SimpleFX' },
  { hote: 'tradingview.com', nom: 'TradingView' },
]

export function reglagesBulleDefaut(): ReglagesBulle {
  return { actif: true, sites: SITES_BULLE_DEFAUT.map(s => s.hote) }
}

/** Un nom d'hôte propre (minuscules, sans « www. »), depuis un hôte ou une adresse http(s). */
export function normaliserHote(entree: string): string | null {
  let h = (entree ?? '').trim().toLowerCase()
  if (!h) return null
  if (h.includes('://')) {
    try {
      const u = new URL(h)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      h = u.hostname
    } catch { return null }
  }
  h = h.replace(/^www\./, '').replace(/\.$/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(h) ? h : null
}

/** Le site est-il dans la liste ? Une entrée couvre ses sous-domaines. */
export function hoteDansListe(hostname: string, sites: string[]): boolean {
  const h = normaliserHote(hostname)
  if (!h) return false
  return sites.some(s => h === s || h.endsWith('.' + s))
}

/** Ce qui est stocké, relu prudemment. Rien de stocké : la liste de départ. */
export function lireReglagesBulle(brut: unknown): ReglagesBulle {
  if (!brut || typeof brut !== 'object') return reglagesBulleDefaut()
  const r = brut as { actif?: unknown; sites?: unknown }
  const sites = Array.isArray(r.sites)
    ? [...new Set(r.sites.map(s => (typeof s === 'string' ? normaliserHote(s) : null)).filter((s): s is string => !!s))]
    : reglagesBulleDefaut().sites
  return { actif: r.actif !== false, sites }
}

/** « Ajouter ce site » : le site de l'onglet, s'il n'est pas déjà couvert. */
export function ajouterSite(r: ReglagesBulle, entree: string): ReglagesBulle {
  const h = normaliserHote(entree)
  if (!h || hoteDansListe(h, r.sites)) return r
  return { ...r, sites: [...r.sites, h] }
}

/**
 * Retire un site. Depuis la bulle, l'hôte de la page : toutes les entrées qui
 * le couvrent partent (« tradingview.com » pour fr.tradingview.com). Depuis
 * les réglages, l'entrée elle-même.
 */
export function retirerSite(r: ReglagesBulle, hostname: string): ReglagesBulle {
  const h = normaliserHote(hostname)
  if (!h) return r
  return { ...r, sites: r.sites.filter(s => !(h === s || h.endsWith('.' + s))) }
}

/** Le nom affiché : celui de la plateforme connue, sinon l'hôte. */
export function nomSite(hote: string): string {
  return SITES_BULLE_DEFAUT.find(s => s.hote === hote)?.nom ?? hote
}

/** Toutes les plateformes de départ sont-elles dans la liste ? */
export function departComplet(sites: string[]): boolean {
  return reglagesBulleDefaut().sites.every(s => sites.includes(s))
}

/** « Remettre les plateformes de départ » : celles qui manquent reviennent, les ajouts du membre restent. */
export function remettreDepart(r: ReglagesBulle): ReglagesBulle {
  return { ...r, sites: [...r.sites, ...reglagesBulleDefaut().sites.filter(s => !r.sites.includes(s))] }
}

// ── Une fois par onglet ──────────────────────────────────────────────────────

function lireOnglets(brut: unknown): number[] {
  return Array.isArray(brut) ? brut.filter((n): n is number => typeof n === 'number') : []
}

export function ongletDejaPropose(brut: unknown, tabId: number): boolean {
  return lireOnglets(brut).includes(tabId)
}

/** Ajoute l'onglet, en gardant les plus récents (les numéros d'onglet ne reviennent pas). */
export function marquerOnglet(brut: unknown, tabId: number, max = 200): number[] {
  return [...lireOnglets(brut).filter(n => n !== tabId), tabId].slice(-max)
}
