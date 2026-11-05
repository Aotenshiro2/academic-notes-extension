// « Envoyer un diagnostic » (1.8.14) : ce que le panneau rassemble AU GESTE du
// membre (ouvrir l'écran), et l'envoi à l'équipe par le journal
// (POST /api/carnet/diagnostic, qui le relaie sur Telegram). Les règles et le
// choix des champs sont dans diagnostic-pur.ts ; rien n'est lu ici qui
// ressemble à une note, un titre, une adresse visitée ou un texte saisi.
import storage from './storage'
import { getSession, getBearerToken } from './auth'
import { JOURNAL_API } from './sync'
import { getLangue } from './i18n'
import { getShowMeta } from './show-meta'
import { getAffichageSecours } from './affichage-secours'
import { lireDernierEnvoi, lireErreurs } from './diagnostic-traces'
import { bornerDiagnostic, cadenceLocale, construireDiagnostic, type Diagnostic } from './diagnostic-pur'

const CLE_ENVOIS = 'carnetDiagnosticEnvois'

/** La carte graphique telle que WebGL la nomme, puis le contexte rendu aussitôt. */
function lireCarteGraphique(): { contexte: 'webgl2' | 'webgl' | 'absent'; vendeur: string | null; rendu: string | null } {
  try {
    const canvas = document.createElement('canvas')
    let contexte: 'webgl2' | 'webgl' = 'webgl2'
    let gl = canvas.getContext('webgl2') as WebGLRenderingContext | null
    if (!gl) {
      contexte = 'webgl'
      gl = canvas.getContext('webgl') as WebGLRenderingContext | null
    }
    if (!gl) return { contexte: 'absent', vendeur: null, rendu: null }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const vendeur = String(info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR))
    const rendu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { contexte, vendeur, rendu }
  } catch {
    return { contexte: 'absent', vendeur: null, rendu: null }
  }
}

type DonneesAgent = {
  brands?: { brand: string; version: string }[]
  mobile?: boolean
  platform?: string
  getHighEntropyValues?: (cles: string[]) => Promise<Record<string, unknown>>
}

async function lireNavigateur() {
  const agent = (navigator as unknown as { userAgentData?: DonneesAgent }).userAgentData
  const brave = typeof (navigator as unknown as { brave?: { isBrave?: unknown } }).brave?.isBrave === 'function'
  if (!agent) return { brave, userAgent: navigator.userAgent }
  let precis: Record<string, unknown> = {}
  try {
    precis = await agent.getHighEntropyValues?.(['fullVersionList', 'platformVersion', 'architecture', 'bitness']) ?? {}
  } catch { /* la version courte suffit */ }
  return {
    marques: Array.isArray(precis.fullVersionList) ? precis.fullVersionList : agent.brands,
    brave,
    plateforme: agent.platform,
    versionPlateforme: precis.platformVersion,
    architecture: precis.architecture,
    bits: precis.bitness,
    mobile: agent.mobile,
    userAgent: navigator.userAgent,
  }
}

async function lireZoomOnglet(): Promise<number | null> {
  try {
    const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })
    return onglet?.id ? await chrome.tabs.getZoom(onglet.id) : null
  } catch {
    return null
  }
}

/** Le diagnostic, rassemblé maintenant. Exactement ce qui part, et ce que l'écran montre en détail. */
export async function collecterDiagnostic(): Promise<Diagnostic> {
  const [reglages, session, navigateur, zoomOnglet, erreurs, dernierEnvoi] = await Promise.all([
    storage.getSettings().catch(() => null),
    getSession().catch(() => null),
    lireNavigateur(),
    lireZoomOnglet(),
    lireErreurs(),
    lireDernierEnvoi(),
  ])
  let theme: string | null = null
  try { theme = localStorage.getItem('theme') } catch { /* thème système */ }
  let mouvementReduit = false
  try { mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* non */ }
  const d = construireDiagnostic({
    maintenant: Date.now(),
    version: chrome.runtime.getManifest().version,
    langue: getLangue(),
    theme,
    sombre: document.documentElement.classList.contains('dark'),
    mouvementReduit,
    reglages,
    affichageSecours: getAffichageSecours(),
    metadonnees: getShowMeta(),
    navigateur,
    gpu: lireCarteGraphique(),
    ecran: {
      dpr: window.devicePixelRatio,
      zoomOnglet,
      panneau: { l: window.innerWidth, h: window.innerHeight },
      fenetre: { l: window.outerWidth, h: window.outerHeight },
      ecran: { l: window.screen?.width, h: window.screen?.height },
      profondeur: window.screen?.colorDepth,
    },
    compte: { connecte: !!session, email: session?.user?.email ?? null },
    erreurs,
    dernierEnvoi,
  })
  return bornerDiagnostic(d)
}

export type ResultatEnvoiDiagnostic =
  | { statut: 'envoye'; restants: number }
  | { statut: 'cadence' }
  | { statut: 'non-connecte' }
  | { statut: 'erreur'; http?: number }

async function lireEnvois(): Promise<number[]> {
  try {
    const r = await chrome.storage.local.get(CLE_ENVOIS)
    return Array.isArray(r[CLE_ENVOIS]) ? r[CLE_ENVOIS] : []
  } catch {
    return []
  }
}

/**
 * Envoie le diagnostic à l'équipe. 5 par jour : le Carnet compte les siens
 * (24 h glissantes) et la route du journal a sa propre cadence (429).
 */
export async function envoyerDiagnostic(d: Diagnostic): Promise<ResultatEnvoiDiagnostic> {
  const jeton = await getBearerToken().catch(() => null)
  if (!jeton) return { statut: 'non-connecte' }
  const cadence = cadenceLocale(await lireEnvois(), Date.now())
  if (!cadence.autorise) return { statut: 'cadence' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/carnet/diagnostic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jeton}` },
      body: JSON.stringify(d),
    })
    if (res.status === 429) return { statut: 'cadence' }
    if (res.status === 401) return { statut: 'non-connecte' }
    if (!res.ok) return { statut: 'erreur', http: res.status }
    const donnees = await res.json().catch(() => ({})) as { restants?: unknown }
    const envois = [...cadence.envois, Date.now()]
    await chrome.storage.local.set({ [CLE_ENVOIS]: envois }).catch(() => { /* la route compte aussi */ })
    const restants = typeof donnees.restants === 'number' ? donnees.restants : cadenceLocale(envois, Date.now()).restants
    return { statut: 'envoye', restants }
  } catch {
    return { statut: 'erreur' }
  }
}
