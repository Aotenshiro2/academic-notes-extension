// Les comptes de Pilotage, vus du Carnet (1.8.13). Pur, sans import : teste
// par tests/pilotage-comptes.test.ts.
//
// Pilotage (pilotage.aoknowledge.com) garde les comptes du trader dans le
// localStorage de SA page. Le content script du Carnet, présent sur toutes
// les pages, les y lit quand Pilotage est ouvert dans le même Chrome et les
// range dans chrome.storage.local (`pilotageComptes`) : la boîte « Importer
// mes trades » range alors les trades sur le même `compteId` que Pilotage.
// Rien n'est changé côté Pilotage.
//
// AUCUN montant ne sort de la page : seulement ce qui sert à reconnaître un
// compte (la forme `compteConnu()` de DocumentsDropDialog.tsx dans Pilotage).
//
// ATTENTION : ce module est importé par le content script, qui est un script
// CLASSIQUE (pas un module ES). Le panneau n'en importe que des TYPES
// (`import type`) : un import de valeur le ferait sortir dans un morceau
// partagé, et le content script casserait sur un `import`.

/** Un compte de Pilotage, vu de l'attribution (comme `CompteConnu` dans Pilotage). */
export type CompteConnu = {
  id: string
  nom: string
  kind: 'own' | 'prop' | 'demo'
  firmName: string
  brokerName: string
  /** Identifiants de challenge, de performance, le numéro chez le broker et le nom. */
  identifiants: string[]
  actif: boolean
  /** Le compte n'a pas encore d'identifiant à lui : un document de sa firme le lui apporte. */
  sansIdentifiant?: boolean
}

/** Ce que le content script range dans chrome.storage.local. */
export type ListeComptesPilotage = {
  comptes: CompteConnu[]
  /** Instant de la lecture (ms). */
  luLe: number
  /** L'id du compte AOK connecté à Pilotage, ou null quand il ne se lit pas. */
  userId: string | null
}

export const HOTE_PILOTAGE = 'pilotage.aoknowledge.com'
export const CLE_COMPTES_REELS = 'aok-trading-accounts-v1'
export const CLE_COMPTES_DEMO = 'aok-trading-accounts-demo-v1'
export const CLE_STOCKAGE_COMPTES = 'pilotageComptes'
/** Le projet Supabase commun au Carnet, au journal et à Pilotage. */
export const REF_SUPABASE = 'ujdqrtjanmmwidnfhkxg'

/** Les étapes où la firme a fini d'évaluer (comme FUNDED_STAGES dans Pilotage). */
const ETAPES_FINANCEES = ['funded', 'live']

const chaine = (valeur: unknown) => (typeof valeur === 'string' ? valeur : valeur === undefined || valeur === null ? '' : String(valeur))

/**
 * Un compte du localStorage de Pilotage remis à la forme `CompteConnu`, avec
 * les valeurs par défaut de `normalizeAccount` (firme « PropFirm »,
 * identifiant de challenge = le nom). null quand ce n'en est pas un.
 */
export function compteConnu(brut: unknown, genres: Array<CompteConnu['kind']>): CompteConnu | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null
  const compte = brut as Record<string, unknown>
  if (compte.kind !== 'own' && compte.kind !== 'prop' && compte.kind !== 'demo') return null
  const kind = compte.kind as CompteConnu['kind']
  if (!genres.includes(kind) || typeof compte.id !== 'string' || typeof compte.name !== 'string') return null
  const name = compte.name
  const identifier = typeof compte.identifier === 'string' && compte.identifier ? compte.identifier : ''
  const commun = {
    id: compte.id,
    kind,
    brokerName: chaine(compte.brokerName),
    actif: compte.status !== 'inactive',
  }
  if (kind !== 'prop') {
    return { ...commun, nom: name, firmName: '', identifiants: [identifier, name].filter(Boolean), sansIdentifiant: !identifier }
  }
  const challenge = chaine(compte.challengeIdentifier) || name
  const performance = chaine(compte.performanceIdentifier)
  const etape = chaine(compte.currentStage) || (compte.phase === 'funded' ? 'funded' : 'evaluation-1')
  const nom = ETAPES_FINANCEES.includes(etape) && performance ? performance : challenge || name
  return {
    ...commun,
    nom,
    firmName: chaine(compte.firmName) || 'PropFirm',
    identifiants: [challenge, performance, identifier, name].filter(Boolean),
    sansIdentifiant: !challenge || challenge === name,
  }
}

function lireListe(brut: string | null, genres: Array<CompteConnu['kind']>): CompteConnu[] {
  if (!brut) return []
  try {
    const liste = JSON.parse(brut)
    if (!Array.isArray(liste)) return []
    return liste.map(entree => compteConnu(entree, genres)).filter((c): c is CompteConnu => c !== null)
  } catch {
    return []
  }
}

/** Les comptes réels puis les démo, tels que les deux clés de Pilotage les gardent. */
export function comptesDepuisStockage(reels: string | null, demo: string | null): CompteConnu[] {
  return [...lireListe(reels, ['own', 'prop']), ...lireListe(demo, ['demo'])]
}

/** Base64 « url » (sans bourrage) en texte UTF-8. */
function depuisBase64Url(texte: string): string {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/')
  const binaire = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return new TextDecoder().decode(octets)
}

function idDeSession(valeur: string): string | null {
  let texte = valeur
  try { texte = decodeURIComponent(texte) } catch { /* déjà décodé */ }
  if (texte.startsWith('base64-')) texte = depuisBase64Url(texte.slice('base64-'.length))
  const session = JSON.parse(texte)
  // Les anciennes versions de supabase-js gardaient un tableau [access_token, refresh_token, ...].
  const user = session && typeof session === 'object' && !Array.isArray(session) ? (session as { user?: { id?: unknown } }).user : null
  if (user && typeof user.id === 'string' && user.id) return user.id
  const jeton = Array.isArray(session) ? session[0] : (session as { access_token?: unknown })?.access_token
  if (typeof jeton === 'string' && jeton.split('.').length === 3) {
    const charge = JSON.parse(depuisBase64Url(jeton.split('.')[1]))
    if (charge && typeof charge.sub === 'string' && charge.sub) return charge.sub
  }
  return null
}

/**
 * L'id du compte AOK connecté à Pilotage, lu dans le cookie de session de
 * @supabase/ssr (`sb-<ref>-auth-token`, JSON éventuellement en « base64- » et
 * coupé en morceaux `.0`, `.1`...). Seul `user.id` (ou le `sub` du jeton) en
 * sort. null quand il ne se lit pas.
 */
export function userIdDepuisCookies(cookies: string | null | undefined, ref = REF_SUPABASE): string | null {
  if (!cookies) return null
  const valeurs = new Map<string, string>()
  for (const morceau of cookies.split(';')) {
    const egal = morceau.indexOf('=')
    if (egal < 0) continue
    valeurs.set(morceau.slice(0, egal).trim(), morceau.slice(egal + 1).trim())
  }
  const bases = new Set<string>()
  for (const nom of valeurs.keys()) {
    const m = /^(sb-[A-Za-z0-9]+-auth-token)(\.\d+)?$/.exec(nom)
    if (m) bases.add(m[1])
  }
  const ordre = [...bases].sort((a, b) => Number(b.includes(ref)) - Number(a.includes(ref)))
  for (const base of ordre) {
    let valeur = valeurs.get(base)
    if (valeur === undefined) {
      const morceaux: string[] = []
      for (let i = 0; valeurs.has(`${base}.${i}`); i++) morceaux.push(valeurs.get(`${base}.${i}`)!)
      valeur = morceaux.join('')
    }
    if (!valeur) continue
    try {
      const id = idDeSession(valeur)
      if (id) return id
    } catch { /* morceau illisible : on essaie le suivant */ }
  }
  return null
}

/** Même liste (comptes et propriétaire), sans regarder l'heure de lecture. */
export function memeListe(a: Pick<ListeComptesPilotage, 'comptes' | 'userId'> | null | undefined, b: Pick<ListeComptesPilotage, 'comptes' | 'userId'> | null | undefined): boolean {
  if (!a || !b) return false
  return a.userId === b.userId && JSON.stringify(a.comptes) === JSON.stringify(b.comptes)
}
