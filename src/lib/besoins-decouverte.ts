// Besoins des membres, suite du 06/11/2026 : la découverte (pistes A, B, C, D)
// et les signaux de friction (« Refus + impasses », choix de Brice). Règles
// pures (sans chrome.*, sans DOM obligatoire), testées dans
// tests/besoins-decouverte.test.ts. Le branchement est dans besoins.ts.
//
// - A : l'entrée du Support dans le pied du panneau dit « Aide et idées ».
// - B : une bulle la montre UNE fois ; fermée ou cliquée, elle ne revient plus
//   (mémoire du navigateur sous try/catch : le panneau marche sans).
// - C : au moment d'un refus ou d'une impasse, un SIGNAL (clé de la liste
//   fermée du contrat, contexte court permis, une fois à l'événement) et une
//   ligne qui ouvre « Il me manque quelque chose » pré-rempli ; la demande part
//   alors avec `signal: <clé>`.
// - D : « Livré grâce à vos demandes » dans l'écran Versions du Guide.
//
// Règle du diagnostic du Carnet : aucun contenu (ni note, ni trade, ni texte
// libre) et JAMAIS l'adresse d'une page visitée. La plateforme d'une capture
// ne part que si elle est dans la liste connue ci-dessous, sinon « autre ».
// Le Carnet n'envoie un signal qu'avec un compte connecté : sans compte, rien
// ne sort du navigateur (politique de confidentialité, section 1).

/** Les textes (A VALIDER PAR BRICE) sont dans i18n.ts, clés `besoin.aide*`, `besoin.friction*`, `besoin.livres*`. */

export type CleSignal = 'carnet.capture_impossible' | 'carnet.sync_echec' | 'carnet.export_echec'

/** Le contexte permis pour chaque clé (contrat du 06/11) ; tout le reste est retiré. */
export const CONTEXTE_PERMIS: Record<CleSignal, readonly string[]> = {
  'carnet.capture_impossible': ['plateforme', 'raison'],
  'carnet.sync_echec': ['code'],
  'carnet.export_echec': ['format'],
}

/** Une valeur de contexte : 60 caractères au plus (contrat). */
export const CONTEXTE_MAX = 60
const FORME_CLE = /^[a-z]+[.][a-z0-9_]{1,64}$/

/** Les caractères de contrôle deviennent des espaces. */
function sansControle(texte: string): string {
  return Array.from(texte, ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('')
}

/** Le contexte réduit à ce que le contrat permet : noms permis, valeurs courtes sur une ligne, vides retirées. */
export function contexteBorne(cle: CleSignal, contexte?: Record<string, unknown>): Record<string, string> | undefined {
  if (!contexte) return undefined
  const sortie: Record<string, string> = {}
  for (const nom of CONTEXTE_PERMIS[cle] ?? []) {
    const valeur = contexte[nom]
    if (typeof valeur !== 'string' && typeof valeur !== 'number') continue
    const propre = sansControle(String(valeur)).replace(/\s+/g, ' ').trim().slice(0, CONTEXTE_MAX).trim()
    if (propre) sortie[nom] = propre
  }
  return Object.keys(sortie).length ? sortie : undefined
}

/**
 * Les plateformes connues (celles de la capture intelligente,
 * smart-capture/registry.ts), par domaine. Une capture ailleurs dit « autre » :
 * l'adresse visitée ne part jamais.
 */
const PLATEFORMES: Array<{ nom: string; domaines: string[] }> = [
  { nom: 'tradingview', domaines: ['tradingview.com'] },
  { nom: 'youtube', domaines: ['youtube.com', 'youtu.be'] },
  { nom: 'topstepx', domaines: ['topstepx.com'] },
  { nom: 'topstep', domaines: ['topstep.com'] },
  { nom: 'tradovate', domaines: ['tradovate.com'] },
  { nom: 'simplefx', domaines: ['simplefx.com'] },
  { nom: 'skool', domaines: ['skool.com'] },
  { nom: 'forexfactory', domaines: ['forexfactory.com'] },
  { nom: 'investing', domaines: ['investing.com'] },
  { nom: 'gmail', domaines: ['mail.google.com'] },
  { nom: 'outlook', domaines: ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com'] },
  { nom: 'journal', domaines: ['journal.aoknowledge.com', 'journal-d-etude-beta.vercel.app'] },
]

/** Le nom d'une plateforme connue pour cette adresse, sinon « autre » (pages du navigateur, sites inconnus, adresse illisible). */
export function plateformeDe(url: string | undefined | null): string {
  let hote = ''
  try {
    const lue = new URL(url ?? '')
    if (lue.protocol !== 'https:' && lue.protocol !== 'http:') return 'autre'
    hote = lue.hostname.toLowerCase()
  } catch {
    return 'autre'
  }
  const trouvee = PLATEFORMES.find(p => p.domaines.some(d => hote === d || hote.endsWith(`.${d}`)))
  return trouvee ? trouvee.nom : 'autre'
}

/**
 * Un code court pour une synchronisation en échec, tiré du message d'erreur
 * de sync.ts : le statut HTTP seul (« 413 »), « session », « reseau » ou
 * « autre ». Le texte du message (réponse du serveur, titre de note) ne part
 * jamais.
 */
export function codeDeSync(erreur: string | undefined | null): string {
  const texte = String(erreur ?? '')
  const http = /\bHTTP\s*(\d{3})\b/i.exec(texte) ?? /\((\d{3})\)/.exec(texte)
  if (http) return http[1]
  if (/unauthori[sz]ed|not authenticated|session/i.test(texte)) return 'session'
  if (/network|failed to fetch|reseau|réseau/i.test(texte)) return 'reseau'
  return 'autre'
}

export type OptionsSignal = {
  api: string
  jeton: () => Promise<string | null>
  envoi?: typeof fetch
}

export type IssueSignal = 'envoye' | 'deja' | 'ignore'

const dejaEnvoyes = new Set<string>()

/** Pour les tests : repartir d'un panneau neuf. */
export function oublierSignauxEnvoyes() {
  dejaEnvoyes.clear()
}

/**
 * Envoie le signal UNE fois par ouverture du panneau (même clé, même
 * contexte), sans rien attendre ni rien montrer, et seulement avec un compte
 * connecté. Jamais d'erreur levée ; un échec n'est jamais relancé.
 */
export async function envoyerSignal(cle: CleSignal, contexte: Record<string, unknown> | undefined, options: OptionsSignal): Promise<IssueSignal> {
  try {
    if (!FORME_CLE.test(cle) || !(cle in CONTEXTE_PERMIS)) return 'ignore'
    const borne = contexteBorne(cle, contexte)
    const corps = { app: 'extension', cle, ...(borne ? { contexte: borne } : {}) }
    const empreinte = JSON.stringify(corps)
    if (dejaEnvoyes.has(empreinte)) return 'deja'
    const jeton = await options.jeton().catch(() => null)
    // Sans compte, rien ne sort du navigateur : pas de signal (et il pourra partir plus tard, connecté).
    if (!jeton) return 'ignore'
    dejaEnvoyes.add(empreinte)
    await (options.envoi ?? fetch)(`${options.api}/api/besoins/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jeton}` },
      body: JSON.stringify(corps),
    })
    return 'envoye'
  } catch {
    // Route absente, réseau coupé : ignoré, jamais relancé.
    return 'ignore'
  }
}

/** La phrase pré-remplie posée devant un brouillon déjà commencé, sans le perdre ni la doubler. */
export function composerPrerempli(prerempli: string, brouillon: string): string {
  if (!brouillon.trim()) return prerempli
  if (brouillon.includes(prerempli.trim())) return brouillon
  return `${prerempli}\n\n${brouillon}`
}

// ─── B : la bulle de découverte, une seule fois ──────────────────────────────

export const CLE_BULLE = 'aok-aide-bulle-vue'

type Lecteur = Pick<Storage, 'getItem'>
type Ecrivain = Pick<Storage, 'setItem'>

function stockageLocal(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Vue (fermée ou cliquée) ? Stockage illisible : tenue pour vue, plutôt que remontrée à chaque ouverture. */
export function bulleDejaVue(stockage: Lecteur | null = stockageLocal()): boolean {
  if (!stockage) return true
  try {
    return stockage.getItem(CLE_BULLE) === '1'
  } catch {
    return true
  }
}

export function marquerBulleVue(stockage: Ecrivain | null = stockageLocal()) {
  try {
    stockage?.setItem(CLE_BULLE, '1')
  } catch {
    /* stockage refusé : la bulle se ferme quand même pour ce panneau */
  }
}

// ─── D : les besoins livrés ──────────────────────────────────────────────────

export interface BesoinLivre { id: string; titre: string; livreLe: string | null; personnes: number }

export const LIVRES_MAX = 10

/** Les cartes livrées telles que le journal les décrit ; ce qui ne se lit pas est écarté. */
export function lireLivres(brut: unknown): BesoinLivre[] {
  const liste = brut && typeof brut === 'object' ? (brut as { besoins?: unknown }).besoins : null
  if (!Array.isArray(liste)) return []
  return liste
    .flatMap((b): BesoinLivre[] => {
      if (!b || typeof b !== 'object') return []
      const x = b as Record<string, unknown>
      if (typeof x.id !== 'string' || typeof x.titre !== 'string' || !x.titre.trim()) return []
      return [{
        id: x.id,
        titre: x.titre,
        livreLe: typeof x.livre_le === 'string' && !Number.isNaN(Date.parse(x.livre_le)) ? x.livre_le : null,
        personnes: typeof x.personnes === 'number' && Number.isFinite(x.personnes) && x.personnes > 0 ? Math.round(x.personnes) : 0,
      }]
    })
    .slice(0, LIVRES_MAX)
}
