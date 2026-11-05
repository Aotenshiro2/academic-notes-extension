// Ce que le journal rend d'un document lu (1.8.13). Pur, sans import : porté
// de Pilotage (lib/documents-api.ts, `normaliseLecture`, et lib/offres.ts,
// `normaliseQuota`) pour que le Carnet lise la même chose de la même façon.
//
// `POST /api/pilotage/documents/lire` : un document par appel (base64). Le
// journal le reconnaît sans aide quand il peut (CSV connus, PDF Tradovate,
// relevé MetaTrader), sinon il le fait lire (« lecture intelligente »,
// comptée selon le palier). Tout ce qu'il rend passe par `normaliseLecture` :
// un champ absent ou mal formé ne doit jamais faire tomber la boîte d'import.

export type TypeLecture =
  | 'trades'
  | 'mouvements-compte'
  | 'facture'
  | 'releve-bancaire'
  | 'releve-broker'
  | 'capture-tableau'
  | 'autre'
  | 'illisible'

export type MethodeLecture = 'csv' | 'nom' | 'texte' | 'vision'

/** Un trade lu par le journal (mêmes champs que ses lecteurs CSV, instants en ISO). */
export type TradeNormalise = {
  source: string
  idExterne: string
  /** Le numéro de compte chez le broker, quand le fichier le dit. */
  compte: string | null
  symbole: string
  direction: 'long' | 'short' | null
  quantite: number
  prixEntree: number | null
  prixSortie: number | null
  entreLe: string
  sortiLe: string | null
  pnl: number
  devise: string
  frais: number | null
  dureeSec: number | null
  fuseau?: string | null
  stopPrix?: number | null
}

export type Periode = { debut: string; fin: string }

export type Lecture = {
  type: TypeLecture
  methode: MethodeLecture
  /** De 0 à 1. */
  confiance: number
  /** Le compte de Pilotage rapproché par le journal, d'après les `comptes` envoyés. */
  compteId: string | null
  firme: string | null
  broker: string | null
  identifiant: string | null
  periode: Periode | null
  devise: string | null
  remarque: string | null
  plateforme?: string | null
  typeCompte?: 'demo' | 'reel' | null
  /** Une empreinte par fait lu, la même d'un format à l'autre (le CSV et le PDF d'un même rapport). */
  empreintes: string[]
  trades?: TradeNormalise[]
  /** Présents seulement pour compter les faits (doublons) : le Carnet n'écrit que des trades. */
  mouvements?: unknown[]
  operations?: unknown[]
  facture?: Record<string, unknown>
  releveBroker?: { broker: string; identifiant: string | null }
  capture?: { texte: string | null }
}

export type Palier = 'libre' | 'premium' | 'equipe'

/** Le compteur des lectures intelligentes (30 jours glissants). `limite` null : sans limite. */
export type Quota = { utilisees: number; limite: number | null; offertes: number; jusquAu: string | null; palier: Palier | null }

export const LECTURES_LIBRE = 10
export const LECTURES_PREMIUM = 200

const TYPES: TypeLecture[] = ['trades', 'mouvements-compte', 'facture', 'releve-bancaire', 'releve-broker', 'capture-tableau', 'autre', 'illisible']
const METHODES: MethodeLecture[] = ['csv', 'nom', 'texte', 'vision']
const PALIERS: Palier[] = ['libre', 'premium', 'equipe']

const texte = (valeur: unknown) => (typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null)
const nombre = (valeur: unknown) => (typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null)
const objet = (valeur: unknown) => (valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? valeur as Record<string, unknown> : null)
const jour = (valeur: unknown) => {
  const brut = texte(valeur)
  return brut && /^\d{4}-\d{2}-\d{2}/.test(brut) ? brut.slice(0, 10) : null
}

function periodeDe(valeur: unknown): Periode | null {
  const brut = objet(valeur)
  if (!brut) return null
  const debut = jour(brut.debut)
  const fin = jour(brut.fin) ?? debut
  if (!debut || !fin) return null
  return debut <= fin ? { debut, fin } : { debut: fin, fin: debut }
}

/** La forme que la boîte attend, quoi que le journal ait rendu. `empreintes` à côté de la lecture se lit aussi. */
export function normaliseLecture(valeur: unknown, empreintesAPart?: unknown): Lecture {
  const brut = objet(valeur) ?? {}
  const type = TYPES.find(entree => entree === brut.type) ?? 'autre'
  const confiance = nombre(brut.confiance)
  const typeCompte = texte(brut.typeCompte)
  const empreintes = Array.isArray(brut.empreintes) ? brut.empreintes : Array.isArray(empreintesAPart) ? empreintesAPart : []
  const lecture: Lecture = {
    type,
    methode: METHODES.find(entree => entree === brut.methode) ?? 'texte',
    confiance: confiance === null ? 0 : Math.min(1, Math.max(0, confiance)),
    compteId: texte(brut.compteId),
    firme: texte(brut.firme),
    broker: texte(brut.broker),
    identifiant: texte(brut.identifiant),
    periode: periodeDe(brut.periode),
    devise: texte(brut.devise)?.toUpperCase() ?? null,
    remarque: texte(brut.remarque),
    plateforme: texte(brut.plateforme),
    typeCompte: typeCompte === 'demo' || typeCompte === 'reel' ? typeCompte
      : /^(demo|paper|simulated)$/i.test(typeCompte ?? '') ? 'demo'
      : /^(real|reel|live)$/i.test(typeCompte ?? '') ? 'reel' : null,
    empreintes: empreintes.filter((e): e is string => typeof e === 'string' && e.length > 0),
  }
  if (Array.isArray(brut.trades)) {
    lecture.trades = brut.trades.filter(trade => objet(trade) && texte((trade as Record<string, unknown>).entreLe)) as TradeNormalise[]
  }
  if (Array.isArray(brut.mouvements)) lecture.mouvements = brut.mouvements.filter(objet)
  if (Array.isArray(brut.operations)) lecture.operations = brut.operations.filter(objet)
  const facture = objet(brut.facture)
  if (facture) lecture.facture = facture
  const releve = objet(brut.releveBroker)
  if (releve) lecture.releveBroker = { broker: texte(releve.broker) ?? lecture.broker ?? '', identifiant: texte(releve.identifiant) ?? lecture.identifiant }
  const capture = objet(brut.capture)
  if (capture) lecture.capture = { texte: texte(capture.texte) }
  return lecture
}

/** Le compteur rendu par une lecture (200) ou son refus (429) ; null quand il ne se lit pas. */
export function normaliseQuota(valeur: unknown): Quota | null {
  const brut = objet(valeur)
  if (!brut) return null
  const palier = PALIERS.find(p => p === brut.palier) ?? null
  const utilisees = nombre(brut.utilisees)
  if (utilisees !== null) {
    const limite = nombre(brut.limite)
    return {
      utilisees: Math.max(0, utilisees),
      limite: palier === 'equipe' || brut.limite === null ? null : limite ?? (palier === 'premium' ? LECTURES_PREMIUM : LECTURES_LIBRE),
      offertes: Math.max(0, nombre(brut.offertes) ?? 0),
      jusquAu: texte(brut.jusquAu),
      palier,
    }
  }
  // L'ancienne forme du journal (avant les paliers).
  const lus = nombre(brut.lusParIaAujourdhui)
  const limite = nombre(brut.limite)
  if (lus === null || limite === null) return null
  return { utilisees: lus, limite: brut.sansPlafond === true ? null : limite, offertes: 0, jusquAu: null, palier: null }
}

/** Les offertes de la première semaine sont-elles encore là ? */
export function offertesActives(quota: Quota, maintenant = Date.now()): boolean {
  if (quota.offertes <= 0 || !quota.jusquAu) return false
  const fin = Date.parse(quota.jusquAu)
  return Number.isFinite(fin) && fin > maintenant
}

/** Ce qui reste : les offertes encore valables plus le reste du mois ; null sans limite. */
export function lecturesRestantes(quota: Quota, maintenant = Date.now()): number | null {
  if (quota.limite === null) return null
  return Math.max(0, quota.limite - quota.utilisees) + (offertesActives(quota, maintenant) ? quota.offertes : 0)
}

/** Lu sans aide (CSV connu, export reconnu) ou par une lecture intelligente. */
export const lectureIntelligente = (lecture: Pick<Lecture, 'methode'>) => lecture.methode === 'texte' || lecture.methode === 'vision'
