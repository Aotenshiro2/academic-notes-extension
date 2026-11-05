import type { CompteConnu } from './pilotage-comptes'
import type { Lecture, TradeNormalise } from './documents-lecture'

// Le compte d'un export de trades (1.8.13). Pur : teste par
// tests/documents-attribution.test.ts.
//
// Porté de Pilotage (lib/documents-attribution.ts : `lectureDemo`,
// `identifiantsLus`, `rapprocherCompte`, le « nouveau compte » de
// `proposerDestination`) : le Carnet range au même endroit que Pilotage, il
// doit deviner le même compte. Dans l'ordre : le compte que le journal a
// rapproché, puis l'identifiant lu, puis la firme seule (ou la seule active),
// puis le broker ; jamais d'un document démo vers un compte réel, ni l'inverse.
//
// Deux écarts assumés avec Pilotage, parce que le Carnet ne montre pas de revue
// ligne par ligne :
// - un identifiant lu que ne porte AUCUN compte n'est jamais rangé sur un
//   autre compte de la même firme (copy trading : trois comptes Apex, Pilotage
//   n'en connaît qu'un) : c'est un compte inconnu, à créer dans Pilotage ;
// - un fichier qui porte plusieurs comptes (copie) se coupe en lots, un par
//   compte : chacun garde ses trades.

export const SEUIL_CONFIANCE = 0.6

export const normerIdentifiant = (texte: string) =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const MOTS_DEMO = new Set(['demo', 'demos', 'simulated', 'simulation', 'simule', 'simulee'])

/** Le document dit-il « démo » ? Jamais deviné : un document qui ne le dit pas est réel. */
export function lectureDemo(lecture: Lecture): boolean {
  if (lecture.typeCompte === 'demo') return true
  if (lecture.typeCompte === 'reel') return false
  const textes = [
    lecture.identifiant, lecture.broker, lecture.firme, lecture.plateforme, lecture.remarque,
    lecture.releveBroker?.identifiant, lecture.releveBroker?.broker, lecture.capture?.texte,
    ...(lecture.trades ?? []).slice(0, 5).map(trade => trade.compte),
  ]
  return textes.some(texte => typeof texte === 'string' && texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/)
    .some(mot => MOTS_DEMO.has(mot) || mot.startsWith('paper')))
}

/** Les identifiants qu'un document porte, normés. */
export function identifiantsLus(lecture: Lecture): string[] {
  return [lecture.identifiant, lecture.releveBroker?.identifiant, lecture.trades?.[0]?.compte]
    .filter((valeur): valeur is string => Boolean(valeur))
    .map(normerIdentifiant)
    .filter(valeur => valeur.length >= 3)
}

export type Rapprochement = { compteId: string | null; par: 'journal' | 'identifiant' | 'firme' | 'broker' | null }

/** Le compte que le document désigne, s'il en désigne un sans ambiguïté (Pilotage, tel quel). */
export function rapprocherCompte(lecture: Lecture, comptes: CompteConnu[]): Rapprochement {
  const demo = lectureDemo(lecture)
  const duJournal = lecture.compteId ? comptes.find(compte => compte.id === lecture.compteId) : undefined
  if (duJournal && (duJournal.kind === 'demo') === demo) return { compteId: duJournal.id, par: 'journal' }

  const identifiants = identifiantsLus(lecture)
  if (identifiants.length) {
    const trouves = comptes.filter(compte => compte.identifiants.some(identifiant => identifiants.includes(normerIdentifiant(identifiant))))
    if (trouves.length === 1) return { compteId: trouves[0].id, par: 'identifiant' }
  }

  const memeMonde = comptes.filter(compte => (compte.kind === 'demo') === demo)
  const unSeul = (candidats: CompteConnu[]) => {
    if (candidats.length === 1) return candidats[0]
    const actifs = candidats.filter(compte => compte.actif)
    return actifs.length === 1 ? actifs[0] : null
  }
  if (lecture.firme) {
    const trouve = unSeul(memeMonde.filter(compte => compte.kind === 'prop' && normerIdentifiant(compte.firmName) === normerIdentifiant(lecture.firme!)))
    if (trouve) return { compteId: trouve.id, par: 'firme' }
  }
  const broker = lecture.broker ?? lecture.releveBroker?.broker ?? null
  if (broker) {
    const trouve = unSeul(memeMonde.filter(compte => compte.brokerName && normerIdentifiant(compte.brokerName) === normerIdentifiant(broker)))
    if (trouve) return { compteId: trouve.id, par: 'broker' }
  }
  return { compteId: null, par: null }
}

export type NouveauCompte = { kind: 'own' | 'prop' | 'demo'; firme: string; identifiant: string; broker: string }

/** De quoi pré-remplir « nouveau compte » dans Pilotage (comme sa revue de documents). */
export function nouveauCompte(lecture: Lecture): NouveauCompte {
  const broker = lecture.broker ?? lecture.releveBroker?.broker ?? ''
  const firme = lecture.firme ?? ''
  return {
    kind: lectureDemo(lecture) ? 'demo' : firme || !broker ? 'prop' : 'own',
    firme,
    identifiant: lecture.identifiant ?? lecture.releveBroker?.identifiant ?? lecture.trades?.[0]?.compte ?? '',
    broker,
  }
}

/** L'adresse de Pilotage qui ouvre le formulaire « nouveau compte » pré-rempli (TradingAccountsWorkspace.tsx). */
export function adresseNouveauCompte(nouveau: NouveauCompte, base = 'https://pilotage.aoknowledge.com'): string {
  const params = new URLSearchParams({ add: nouveau.kind })
  if (nouveau.firme) params.set('firme', nouveau.firme)
  if (nouveau.identifiant) params.set('identifiant', nouveau.identifiant)
  if (nouveau.broker) params.set('broker', nouveau.broker)
  return `${base}/comptes?${params.toString()}`
}

export type Devinette = {
  /** Le compte deviné, ou null : « Quel compte ? ». */
  compteId: string | null
  par: Rapprochement['par']
  /** Rien de sûr : lecture peu fiable ou aucun compte trouvé. */
  doute: boolean
  /** Un identifiant lu qu'aucun compte de Pilotage ne porte : de quoi le créer. */
  inconnu: NouveauCompte | null
  demo: boolean
}

/** Le compte d'un lot de trades, deviné d'après le fichier ; question seulement en cas de doute. */
export function devinerCompte(lecture: Lecture, comptes: CompteConnu[]): Devinette {
  const demo = lectureDemo(lecture)
  const rapproche = rapprocherCompte(lecture, comptes)
  const identifiants = identifiantsLus(lecture)
  const trouve = rapproche.compteId ? comptes.find(compte => compte.id === rapproche.compteId) : undefined
  // Par la firme ou le broker seuls, alors que le fichier dit un identifiant que ce compte ne porte pas :
  // c'est un autre compte de la même firme (copie), jamais celui-ci.
  const autreCompte = !!trouve && (rapproche.par === 'firme' || rapproche.par === 'broker') && identifiants.length > 0 && !trouve.sansIdentifiant
  const compteId = autreCompte ? null : rapproche.compteId
  return {
    compteId,
    par: compteId ? rapproche.par : null,
    doute: !compteId || lecture.confiance < SEUIL_CONFIANCE,
    inconnu: !compteId && identifiants.length > 0 ? nouveauCompte(lecture) : null,
    demo,
  }
}

/** Les comptes de « Quel compte ? » : les réels, et les démo seulement pour un document démo. */
export function comptesProposes(comptes: CompteConnu[], demo: boolean): CompteConnu[] {
  return comptes.filter(compte => compte.kind !== 'demo' || demo)
}

export type LotLu = { compteLu: string | null; lecture: Lecture }

/**
 * Un lot par compte du fichier (copy trading : le même export porte les trades
 * de trois comptes). Un seul compte, ou aucun : la lecture telle quelle.
 */
export function lotsParCompte(lecture: Lecture): LotLu[] {
  const trades = lecture.trades ?? []
  const parCompte = new Map<string, TradeNormalise[]>()
  for (const trade of trades) {
    const cle = (trade.compte ?? '').trim()
    const liste = parCompte.get(cle)
    if (liste) liste.push(trade)
    else parCompte.set(cle, [trade])
  }
  if (parCompte.size <= 1) return [{ compteLu: [...parCompte.keys()][0] || lecture.identifiant || null, lecture }]
  return [...parCompte.entries()].map(([cle, liste]) => ({
    compteLu: cle || null,
    lecture: { ...lecture, compteId: null, identifiant: cle || null, releveBroker: undefined, trades: liste, empreintes: [] },
  }))
}

/** « ...0002 » : la fin d'un identifiant long, assez pour le reconnaître. */
export function abregerIdentifiant(identifiant: string): string {
  const net = identifiant.trim()
  return net.length > 10 ? `...${net.slice(-4)}` : net
}

/**
 * Le nom d'un compte à l'écran : la firme et la fin de son identifiant pour
 * une propfirm (« Apex ...0002 »), le nom que le membre lui a donné sinon.
 */
export function libelleCompte(compte: CompteConnu): string {
  if (compte.kind !== 'prop') return compte.nom
  if (compte.sansIdentifiant) {
    return normerIdentifiant(compte.nom).includes(normerIdentifiant(compte.firmName)) ? compte.nom : `${compte.firmName} ${compte.nom}`
  }
  return `${compte.firmName} ${abregerIdentifiant(compte.nom)}`.trim()
}
