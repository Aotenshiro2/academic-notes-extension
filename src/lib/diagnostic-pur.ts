// « Envoyer un diagnostic » (1.8.14) : les règles pures, sans chrome ni DOM.
// Aucun import : testées par tests/diagnostic.test.ts (node --test).
//
// Brice, 05/11 : « il faut qu'il puisse remonter d'une manière ou d'une autre
// ses data [...] pour vraiment le régler grâce aux infos de sa machine ». Deux
// cas : le fantôme au survol d'une image chez Franky (composition : carte
// graphique, navigateur, zoom ?) et l'envoi du PDF vers ChatGPT qui ne passe
// qu'une fois sur 5 chez Flow (quel champ, quelle voie ?). Un diagnostic
// envoyé par le membre, à son geste. Jamais de télémétrie permanente.
//
// Ce qui part est choisi ICI, champ par champ (liste blanche) : un réglage
// ajouté demain ne part pas tant qu'on ne l'a pas écrit dans
// construireDiagnostic. Jamais un contenu de note, un titre, une adresse
// visitée, un texte saisi, une clé ni un jeton.

export const SCHEMA_DIAGNOSTIC = 1
/** L'anneau des erreurs gardé en local (chrome.storage.local). */
export const MAX_ERREURS = 30
/** La route du journal refuse au-delà de 32 Ko : on reste en deçà. */
export const OCTETS_MAX = 30 * 1024
/** 5 envois par jour et par compte, comme la route du journal. */
export const ENVOIS_PAR_JOUR = 5
const JOUR_MS = 86_400_000
const MAX_MESSAGE = 200

// ── Erreurs ─────────────────────────────────────────────────────────────────

export type LieuErreur = 'panneau' | 'pleinEcran' | 'guide' | 'serviceWorker'
export type GenreErreur = 'erreur' | 'rejet' | 'rendu' | 'toast'

const LIEUX: LieuErreur[] = ['panneau', 'pleinEcran', 'guide', 'serviceWorker']
const GENRES: GenreErreur[] = ['erreur', 'rejet', 'rendu', 'toast']

export interface ErreurNotee {
  /** Dernière fois qu'elle est arrivée (ms). */
  le: number
  ou: LieuErreur
  genre: GenreErreur
  /** Le message nettoyé. Pour un toast, la clé du message affiché, jamais son texte. */
  message: string
  /** Le fichier de l'extension (« chunks/index-abc.js »), jamais l'adresse d'une page. */
  source?: string
  ligne?: number
  colonne?: number
  /** Combien de fois : la même erreur ne prend qu'une place dans l'anneau. */
  fois: number
}

function entier(v: unknown, max: number): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined
}

// Controles, zero-largeur, separateurs de ligne, marques de direction, BOM ;
// guillemets typographiques. Construits par leurs codes : le source reste en ASCII.
const car = (n: number) => String.fromCharCode(n)
const plage = (a: number, b: number) => `${car(a)}-${car(b)}`
const INVISIBLES = new RegExp(`[${plage(0x00, 0x1f)}${plage(0x7f, 0x9f)}${plage(0x200b, 0x200f)}${plage(0x2028, 0x202e)}${plage(0x2060, 0x2064)}${car(0xfeff)}]`, 'g')
const paire = (o: number, f: number) => `${car(o)}([^${car(f)}]*)${car(f)}`
const ENTRE_GUILLEMETS = new RegExp(`"([^"]*)"|'([^']*)'|\`([^\`]*)\`|${paire(0xab, 0xbb)}|${paire(0x201c, 0x201d)}|${paire(0x2018, 0x2019)}`, 'g')

function sansControle(s: string): string {
  return s.replace(INVISIBLES, ' ')
}

/**
 * Le message d'une erreur, sans ce qui pourrait venir de l'élève ou de la page.
 * Une erreur JavaScript cite parfois ce qu'elle lisait : un JSON illisible
 * montre son début (« Unexpected token 'B', "Biais haus"... »), une image qui
 * ne charge pas montre son adresse (une data URL, donc l'image elle-même).
 * Restent : le texte de l'erreur, les noms courts entre guillemets (une
 * propriété : « reading 'map' ») et les chemins de NOTRE code.
 */
export function nettoyerMessage(brut: unknown): string {
  let m = ''
  if (typeof brut === 'string') m = brut
  else if (brut instanceof Error) m = `${brut.name}: ${brut.message}`
  else if (brut && typeof brut === 'object' && typeof (brut as { message?: unknown }).message === 'string') m = (brut as { message: string }).message
  else if (brut != null) { try { m = String(brut) } catch { m = '' } }
  m = sansControle(m.split('\n')[0])
  m = m.replace(/\bdata:[\w/+.-]*[;,]\S*/gi, '<donnees>')
  m = m.replace(/\bblob:\S+/gi, '<donnees>')
  // Adresses : celles de l'extension gardent leur chemin (c'est notre code), les autres disparaissent.
  m = m.replace(/\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s'"<>()]+/gi, u => {
    const ext = /^chrome-extension:\/\/[a-p]{32}\/([^?#\s]*)/i.exec(u)
    return ext ? `ext:${ext[1]}` : '<adresse>'
  })
  m = m.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
  m = m.replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, '<jeton>')
  m = m.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
  // Sans « / » : un chemin de notre code (chunks/...) n'est pas un jeton.
  m = m.replace(/[A-Za-z0-9+_=-]{32,}/g, '<jeton>')
  m = m.replace(/\d{6,}/g, '<n>')
  // Entre guillemets (droits, typographiques, chevrons) : un nom court reste, le reste est un texte.
  m = m.replace(ENTRE_GUILLEMETS, (tout, ...groupes) => {
    const dedans = groupes.slice(0, 6).find(g => typeof g === 'string') ?? ''
    return /^[\w$.#:<>-]{0,40}$/.test(dedans) ? tout : '<texte>'
  })
  m = m.replace(/\s+/g, ' ').trim()
  return m.length > MAX_MESSAGE ? `${m.slice(0, MAX_MESSAGE - 3)}...` : m
}

/** Le fichier de l'extension d'où vient une erreur, jamais l'adresse d'une page. */
export function sourceSure(brut: unknown): string | undefined {
  if (typeof brut !== 'string' || !brut.trim()) return undefined
  const ext = /^chrome-extension:\/\/[a-p]{32}\/([^?#\s]{1,160})/i.exec(brut.trim())
  return ext ? ext[1] : '<page>'
}

/** Fichier, ligne et colonne de la première ligne d'une pile d'appels. */
export function premiereFrame(pile: unknown): { source?: string; ligne?: number; colonne?: number } {
  if (typeof pile !== 'string') return {}
  const m = /((?:chrome-extension|https?):\/\/[^\s()]+?):(\d+):(\d+)/.exec(pile)
  if (!m) return {}
  return { source: sourceSure(m[1]), ligne: entier(Number(m[2]), 10_000_000), colonne: entier(Number(m[3]), 10_000_000) }
}

/** La clé d'un toast, telle qu'on la garde : une clé du dictionnaire, sinon « hors-dictionnaire ». */
export function codeToast(cle: unknown): string {
  return typeof cle === 'string' && /^[\w.-]{1,60}$/.test(cle) ? cle : 'hors-dictionnaire'
}

function estErreurNotee(v: unknown): v is ErreurNotee {
  const e = v as ErreurNotee
  return !!e && typeof e === 'object' && typeof e.le === 'number' && LIEUX.includes(e.ou) && GENRES.includes(e.genre)
    && typeof e.message === 'string' && typeof e.fois === 'number'
}

/**
 * Ajoute une erreur à l'anneau : la plus récente en dernier, 30 au plus. La
 * même erreur (lieu, genre, message, fichier, ligne) ne prend qu'une place :
 * elle remonte en dernier et son compteur `fois` augmente. Une erreur qui
 * tourne en boucle ne chasse donc pas les autres.
 */
export function ajouterErreur(anneau: unknown, e: ErreurNotee, max = MAX_ERREURS): ErreurNotee[] {
  const liste = (Array.isArray(anneau) ? anneau : []).filter(estErreurNotee)
  const meme = (a: ErreurNotee) => a.ou === e.ou && a.genre === e.genre && a.message === e.message
    && a.source === e.source && a.ligne === e.ligne
  const avant = liste.find(meme)
  const reste = liste.filter(a => !meme(a))
  reste.push(avant ? { ...e, fois: Math.min(avant.fois + e.fois, 99_999) } : e)
  return reste.slice(-max)
}

/** L'anneau relu, chaque entrée bornée (ce que le stockage local rend n'est pas garanti). */
export function erreursSures(anneau: unknown): ErreurNotee[] {
  return (Array.isArray(anneau) ? anneau : []).filter(estErreurNotee).slice(-MAX_ERREURS).map(e => ({
    le: e.le,
    ou: e.ou,
    genre: e.genre,
    message: e.genre === 'toast' ? codeToast(e.message) : nettoyerMessage(e.message),
    ...(typeof e.source === 'string' && (e.source === '<page>' || /^[\w./@-]{1,160}$/.test(e.source)) ? { source: e.source } : {}),
    ...(entier(e.ligne, 10_000_000) !== undefined ? { ligne: e.ligne } : {}),
    ...(entier(e.colonne, 10_000_000) !== undefined ? { colonne: e.colonne } : {}),
    fois: entier(e.fois, 99_999) ?? 1,
  }))
}

// ── Carte graphique et écran ────────────────────────────────────────────────

const RENDU_LOGICIEL = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|basic render driver|software (?:rasterizer|renderer)/i

/** Vrai si la carte graphique annoncée est un rendu logiciel (pas de vraie carte, ou pilote absent). */
export function renduLogiciel(...textes: (string | null | undefined)[]): boolean {
  return textes.some(t => typeof t === 'string' && RENDU_LOGICIEL.test(t))
}

const ECHELLES = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4]
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/**
 * Le zoom du panneau, ESTIMÉ. `devicePixelRatio` = échelle du système
 * (Windows : 100 %, 125 %, 150 %...) fois le zoom de Chrome, et aucune API ne
 * donne l'un sans l'autre dans un panneau latéral. On lit donc le cas le plus
 * simple : un ratio qui tombe sur une échelle du système = zoom 100 % ; sinon
 * la plus petite échelle qui donne un zoom de Chrome connu. Un indice, pas une
 * mesure : le message le dit « estimé ».
 */
export function zoomEstime(dpr: number): { zoom: number; echelle: number } | null {
  if (typeof dpr !== 'number' || !Number.isFinite(dpr) || dpr <= 0) return null
  const proche = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance
  const echelle = ECHELLES.find(s => proche(dpr, s, 0.01))
  if (echelle) return { zoom: 1, echelle }
  for (const s of ECHELLES) {
    const z = ZOOMS.find(x => proche(dpr / s, x, 0.015))
    if (z) return { zoom: z, echelle: s }
  }
  return null
}

// ── Le dernier envoi vers une IA ────────────────────────────────────────────

export type TypePage = 'nouvelle' | 'conversation' | 'autre'

/**
 * Le genre de page ouverte chez le fournisseur, jamais son identifiant :
 * conversation existante (ChatGPT /c/..., Claude /chat/..., Gemini /app/...,
 * Perplexity /search/...), nouvelle conversation, ou autre. `projet` : un
 * projet ou un GPT de ChatGPT (/g/...).
 */
export function typePage(adresse: string): { page: TypePage; projet: boolean } {
  let chemin = ''
  try { chemin = new URL(adresse).pathname } catch { return { page: 'autre', projet: false } }
  const s = chemin.split('/').filter(Boolean)
  const projet = s[0] === 'g' || s[0] === 'project' || s[0] === 'projects'
  const i = s.findIndex(x => x === 'c' || x === 'chat' || x === 'search')
  if (i >= 0 && s[i + 1]) return { page: 'conversation', projet }
  if (s[0] === 'app' && s[1]) return { page: 'conversation', projet }
  if (s.length === 0 || ['new', 'app', 'chat', 'project'].includes(s[s.length - 1]) || (s[0] === 'g' && s.length <= 2)) {
    return { page: 'nouvelle', projet }
  }
  return { page: 'autre', projet }
}

export type VoieEnvoi = 'champ' | 'champ-remplace' | 'depot' | 'collage'
const VOIES: VoieEnvoi[] = ['champ', 'champ-remplace', 'depot', 'collage']

export interface VoieEssayee {
  voie: VoieEnvoi
  /** Le fichier a été confié à la page par cette voie. */
  donne: boolean
  /** La pièce jointe est apparue dans la page. */
  vu: boolean
  ms: number
  /** La voie a levé une exception. */
  erreur?: boolean
}

/** Ce que rend la fonction injectée dans la page du fournisseur (provider-injector.ts). */
export interface TraceInjection {
  stabiliteMs: number | null
  stabiliteAtteinte: boolean
  /** Les boutons qui révèlent le champ fichier (Claude, Gemini...) : cliqués avec succès, ou null si sans objet. */
  declencheurs: boolean | null
  champsVus: { id: string; accept: string }[]
  voies: VoieEssayee[]
}

export interface TraceEnvoi {
  le: number
  fournisseur: string
  /** prefill : texte seul dans l'adresse ; injection : nouvelle conversation ; fil : la conversation choisie par le membre. */
  mode: 'prefill' | 'injection' | 'fil'
  page: TypePage
  projet: boolean
  fichiers: { pdf: number; autres: number }
  stabilite: { ms: number; atteinte: boolean } | null
  declencheurs: boolean | null
  champsVus: { id: string; accept: string }[]
  voies: VoieEssayee[]
  pdfUploaded: boolean
  pdfNonVu: boolean
  imageOnly: boolean
  promptFilled: boolean
  durees: { chargement: number | null; attente: number | null; injection: number | null; total: number }
  /** Ce qui a échoué avant la fin (« fil » : la conversation choisie n'a pas pu servir). */
  erreur: string | null
  /** L'envoi a dû repartir sur une nouvelle conversation après l'échec du fil. */
  repli: boolean
}

function ms(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 3_600_000) : null
}

function court(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = sansControle(v).replace(/\s+/g, ' ').trim()
  if (!s) return null
  return s.length > max ? `${s.slice(0, max - 3)}...` : s
}

/** Un champ fichier vu dans la page : son id (s'il ressemble à un id) et ce qu'il accepte. */
function champSur(v: unknown): { id: string; accept: string } | null {
  if (!v || typeof v !== 'object') return null
  const c = v as { id?: unknown; accept?: unknown }
  const id = typeof c.id === 'string' && /^[\w:.-]{1,60}$/.test(c.id) ? c.id : ''
  const accept = typeof c.accept === 'string' ? (court(c.accept, 120) ?? '').replace(/[^\w/.*,+ -]/g, '') : ''
  return { id, accept }
}

/** Le dernier envoi relu ou à écrire, borné champ par champ. */
export function normaliserTrace(brut: unknown): TraceEnvoi | null {
  if (!brut || typeof brut !== 'object') return null
  const t = brut as Record<string, unknown>
  if (typeof t.le !== 'number' || !Number.isFinite(t.le) || t.le <= 0) return null
  const fournisseur = typeof t.fournisseur === 'string' && /^[a-z]{2,20}$/.test(t.fournisseur) ? t.fournisseur : 'inconnu'
  const mode = t.mode === 'prefill' || t.mode === 'fil' ? t.mode : 'injection'
  const page: TypePage = t.page === 'nouvelle' || t.page === 'conversation' ? t.page : 'autre'
  const fichiers = (t.fichiers ?? {}) as Record<string, unknown>
  const stab = t.stabilite as { ms?: unknown; atteinte?: unknown } | null | undefined
  const durees = (t.durees ?? {}) as Record<string, unknown>
  const voies = (Array.isArray(t.voies) ? t.voies : []).slice(0, 8).flatMap((v): VoieEssayee[] => {
    const x = v as Record<string, unknown>
    if (!x || !VOIES.includes(x.voie as VoieEnvoi)) return []
    return [{ voie: x.voie as VoieEnvoi, donne: x.donne === true, vu: x.vu === true, ms: ms(x.ms) ?? 0, ...(x.erreur === true ? { erreur: true } : {}) }]
  })
  return {
    le: t.le,
    fournisseur,
    mode,
    page,
    projet: t.projet === true,
    fichiers: { pdf: entier(fichiers.pdf, 20) ?? 0, autres: entier(fichiers.autres, 20) ?? 0 },
    stabilite: stab && ms(stab.ms) !== null ? { ms: ms(stab.ms) as number, atteinte: stab.atteinte === true } : null,
    declencheurs: typeof t.declencheurs === 'boolean' ? t.declencheurs : null,
    champsVus: (Array.isArray(t.champsVus) ? t.champsVus : []).slice(0, 8).map(champSur).filter((c): c is { id: string; accept: string } => !!c),
    voies,
    pdfUploaded: t.pdfUploaded === true,
    pdfNonVu: t.pdfNonVu === true,
    imageOnly: t.imageOnly === true,
    promptFilled: t.promptFilled === true,
    durees: { chargement: ms(durees.chargement), attente: ms(durees.attente), injection: ms(durees.injection), total: ms(durees.total) ?? 0 },
    erreur: typeof t.erreur === 'string' && /^[\w-]{1,40}$/.test(t.erreur) ? t.erreur : null,
    repli: t.repli === true,
  }
}

/** Combien de fichiers partent, par genre : jamais leur nom (celui de la note en est tiré). */
export function compterFichiers(fichiers: { mime?: string }[]): { pdf: number; autres: number } {
  const pdf = fichiers.filter(f => f.mime === 'application/pdf').length
  return { pdf, autres: fichiers.length - pdf }
}

// ── Le diagnostic ───────────────────────────────────────────────────────────

export interface Taille { l: number; h: number }

/** Ce que le panneau rassemble au geste (diagnostic.ts), brut. */
export interface EntreesDiagnostic {
  maintenant: number
  version: string
  langue: string
  /** localStorage « theme » : light, dark ou system. */
  theme: string | null
  sombre: boolean
  mouvementReduit: boolean
  /** Les réglages du Carnet, tels quels : seuls quelques champs en sortent. */
  reglages: unknown
  affichageSecours: boolean
  metadonnees: boolean
  navigateur: {
    marques?: unknown
    brave?: boolean
    plateforme?: unknown
    versionPlateforme?: unknown
    architecture?: unknown
    bits?: unknown
    mobile?: unknown
    userAgent?: unknown
  }
  gpu: { contexte?: unknown; vendeur?: unknown; rendu?: unknown }
  ecran: { dpr?: unknown; zoomOnglet?: unknown; panneau?: unknown; fenetre?: unknown; ecran?: unknown; profondeur?: unknown }
  compte: { connecte: boolean; email?: unknown }
  erreurs: unknown
  dernierEnvoi: unknown
}

export interface Diagnostic {
  schema: typeof SCHEMA_DIAGNOSTIC
  genereLe: string
  carnet: {
    version: string
    langue: string
    theme: 'clair' | 'sombre' | 'systeme'
    sombre: boolean
    mouvementReduit: boolean
    reglages: {
      captureAuto: boolean
      captures: boolean
      captureGraphiqueTrade: boolean
      extraction: boolean
      metadonnees: boolean
      affichageSecours: boolean
      noterD: boolean
      syncCoupee: boolean
      fournisseurIA: string | null
      /** Les fournisseurs pour lesquels une conversation cible est réglée : jamais son adresse. */
      filsIA: string[]
    }
  }
  navigateur: {
    marques: { marque: string; version: string }[]
    brave: boolean
    plateforme: string | null
    versionPlateforme: string | null
    architecture: string | null
    bits: string | null
    mobile: boolean | null
    /** Seulement sans userAgentData (navigateur ancien ou hors Chromium). */
    userAgent: string | null
  }
  gpu: { contexte: 'webgl2' | 'webgl' | 'absent'; vendeur: string | null; rendu: string | null; renduLogiciel: boolean }
  ecran: {
    dpr: number | null
    zoomEstime: number | null
    echelleSysteme: number | null
    /** Le zoom de l'onglet actif (chrome.tabs.getZoom), pas celui du panneau. */
    zoomOnglet: number | null
    panneau: Taille | null
    fenetre: Taille | null
    ecran: Taille | null
    profondeur: number | null
  }
  compte: { connecte: boolean; email: string | null }
  erreurs: ErreurNotee[]
  dernierEnvoiIA: TraceEnvoi | null
}

const FOURNISSEURS = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok', 'other']

function taille(v: unknown): Taille | null {
  if (!v || typeof v !== 'object') return null
  const t = v as { l?: unknown; h?: unknown }
  const l = entier(typeof t.l === 'number' ? Math.round(t.l) : t.l, 100_000)
  const h = entier(typeof t.h === 'number' ? Math.round(t.h) : t.h, 100_000)
  return l === undefined || h === undefined ? null : { l, h }
}

function nombre(v: unknown, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v * 1000) / 1000 : null
}

/**
 * Le diagnostic, champ par champ, à partir de ce que le panneau a rassemblé.
 * Tout ce qui n'est pas nommé ici reste sur l'appareil.
 */
export function construireDiagnostic(e: EntreesDiagnostic): Diagnostic {
  const r = (e.reglages && typeof e.reglages === 'object' ? e.reglages : {}) as Record<string, unknown>
  const sync = (r.journalSync && typeof r.journalSync === 'object' ? r.journalSync : {}) as Record<string, unknown>
  const fils = r.providerThreadUrls && typeof r.providerThreadUrls === 'object' ? r.providerThreadUrls as Record<string, unknown> : {}
  const marquesBrutes = Array.isArray(e.navigateur.marques) ? e.navigateur.marques : []
  const marques = marquesBrutes.slice(0, 6).flatMap(m => {
    const x = m as { brand?: unknown; version?: unknown; marque?: unknown }
    const marque = court(x.brand ?? x.marque, 60)
    const version = court(x.version, 40)
    if (!marque || /not.?a.?brand/i.test(marque)) return []
    return [{ marque, version: version ?? '' }]
  })
  const vendeur = court(e.gpu.vendeur, 200)
  const rendu = court(e.gpu.rendu, 300)
  const dpr = nombre(e.ecran.dpr, 20)
  const zoom = dpr === null ? null : zoomEstime(dpr)
  const email = court(e.compte.email, 200)
  const theme = e.theme === 'light' ? 'clair' : e.theme === 'dark' ? 'sombre' : 'systeme'
  return {
    schema: SCHEMA_DIAGNOSTIC,
    genereLe: new Date(e.maintenant).toISOString(),
    carnet: {
      version: court(e.version, 20) ?? 'inconnue',
      langue: court(e.langue, 10) ?? 'fr',
      theme,
      sombre: e.sombre === true,
      mouvementReduit: e.mouvementReduit === true,
      reglages: {
        captureAuto: r.autoCapture === true,
        captures: r.captureScreenshots === true,
        captureGraphiqueTrade: r.captureGraphiqueTrade !== false,
        extraction: r.extractMainContent === true,
        metadonnees: e.metadonnees === true,
        affichageSecours: e.affichageSecours === true,
        noterD: r.notationJusquaD === true,
        syncCoupee: sync.syncCoupee === true,
        fournisseurIA: typeof r.analysisProvider === 'string' && FOURNISSEURS.includes(r.analysisProvider) ? r.analysisProvider : null,
        filsIA: Object.keys(fils).filter(k => FOURNISSEURS.includes(k) && typeof fils[k] === 'string' && (fils[k] as string).trim() !== ''),
      },
    },
    navigateur: {
      marques,
      brave: e.navigateur.brave === true,
      plateforme: court(e.navigateur.plateforme, 40),
      versionPlateforme: court(e.navigateur.versionPlateforme, 40),
      architecture: court(e.navigateur.architecture, 20),
      bits: court(e.navigateur.bits, 10),
      mobile: typeof e.navigateur.mobile === 'boolean' ? e.navigateur.mobile : null,
      userAgent: marques.length === 0 ? court(e.navigateur.userAgent, 300) : null,
    },
    gpu: {
      contexte: e.gpu.contexte === 'webgl2' || e.gpu.contexte === 'webgl' ? e.gpu.contexte : 'absent',
      vendeur,
      rendu,
      renduLogiciel: renduLogiciel(vendeur, rendu),
    },
    ecran: {
      dpr,
      zoomEstime: zoom?.zoom ?? null,
      echelleSysteme: zoom?.echelle ?? null,
      zoomOnglet: nombre(e.ecran.zoomOnglet, 10),
      panneau: taille(e.ecran.panneau),
      fenetre: taille(e.ecran.fenetre),
      ecran: taille(e.ecran.ecran),
      profondeur: entier(e.ecran.profondeur, 64) ?? null,
    },
    compte: { connecte: e.compte.connecte === true, email: e.compte.connecte === true ? email : null },
    erreurs: erreursSures(e.erreurs),
    dernierEnvoiIA: normaliserTrace(e.dernierEnvoi),
  }
}

function octets(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Le diagnostic sous la limite de la route : les erreurs les plus anciennes tombent d'abord. */
export function bornerDiagnostic(d: Diagnostic, max = OCTETS_MAX): Diagnostic {
  let sortie = d
  while (octets(JSON.stringify(sortie)) > max && sortie.erreurs.length > 0) {
    sortie = { ...sortie, erreurs: sortie.erreurs.slice(1) }
  }
  return sortie
}

/**
 * La cadence côté Carnet (la route du journal a la sienne) : 5 envois sur 24 h
 * glissantes. `envois` = les instants des envois réussis.
 */
export function cadenceLocale(envois: unknown, maintenant: number, limite = ENVOIS_PAR_JOUR): { autorise: boolean; restants: number; envois: number[] } {
  const recents = (Array.isArray(envois) ? envois : [])
    .filter((x): x is number => typeof x === 'number' && x <= maintenant && maintenant - x < JOUR_MS)
    .sort((a, b) => a - b)
    .slice(-limite)
  return { autorise: recents.length < limite, restants: Math.max(0, limite - recents.length), envois: recents }
}
