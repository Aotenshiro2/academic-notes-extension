// L'instrument d'un trade (1.8.13). Pur, sans import : teste par
// tests/instrument.test.ts (node --test).
//
// « Lier » ne propose que les positions importees du meme instrument que le
// trade de la note. La note dit sur quel graphique il a ete pris (adresse
// TradingView, titre de la page ou de la note) ; le releve du broker dit son
// contrat (NQZ5, MNQ 12-25, CME_MINI:NQ1!). Les deux se ramenent a une racine
// (« NQ »), puis a une famille : le micro et le mini d'un meme indice sont le
// meme trade vu par deux comptes (NQ et MNQ, ES et MES, YM et MYM, RTY et
// M2K, GC et MGC, CL et MCL).

const MOIS = 'FGHJKMNQUVXZ'

/** Les racines de contrats a terme dont on retire l'echeance (NQZ5, ESH2026, MNQ 12-25). */
const RACINES_FUTURES = new Set([
  'NQ', 'MNQ', 'ES', 'MES', 'YM', 'MYM', 'RTY', 'M2K', 'EMD', 'NKD',
  'GC', 'MGC', 'SI', 'SIL', 'HG', 'PL', 'PA', 'CL', 'MCL', 'QM', 'NG', 'QG', 'RB', 'HO',
  'ZB', 'ZN', 'ZF', 'ZT', 'UB', 'ZC', 'ZS', 'ZW', 'ZL', 'ZM', 'HE', 'LE',
  '6E', '6B', '6J', '6A', '6C', '6S', '6N', 'M6E', 'M6B', 'M6A',
  'BTC', 'MBT', 'ETH', 'MET', 'FDAX', 'FDXM', 'FDXS', 'FESX', 'FGBL',
])

/** Micro vers mini, et les noms de CFD d'un meme indice chez les brokers. */
const FAMILLES: Record<string, string> = {
  MNQ: 'NQ', MES: 'ES', MYM: 'YM', M2K: 'RTY', MGC: 'GC', MCL: 'CL', QM: 'CL', SIL: 'SI',
  M6E: '6E', M6B: '6B', M6A: '6A', MBT: 'BTC', MET: 'ETH', FDXM: 'FDAX', FDXS: 'FDAX',
  NAS100: 'US100', USTEC: 'US100', USTECH: 'US100', NDX100: 'US100', NSDQ100: 'US100',
  DJ30: 'US30', WS30: 'US30', DJI30: 'US30', USA30: 'US30',
  SPX500: 'US500', SP500: 'US500', USA500: 'US500',
  DE40: 'GER40', DAX40: 'GER40', GER30: 'GER40', DE30: 'GER40',
  GOLD: 'XAUUSD', SILVER: 'XAGUSD',
}

/** Ce qu'un titre peut nommer sans ambiguite (« LE », « SI » ou « PL » sont des mots). */
const NOMMES_DANS_UN_TITRE = new Set([
  'NQ', 'MNQ', 'ES', 'MES', 'YM', 'MYM', 'RTY', 'M2K', 'GC', 'MGC', 'CL', 'MCL', 'NG', '6E', '6B', 'BTC', 'ETH',
  'US100', 'NAS100', 'USTEC', 'US30', 'US500', 'SPX500', 'GER40', 'DAX40', 'DE40', 'UK100', 'JP225', 'FRA40',
  'XAUUSD', 'XAGUSD', 'GOLD',
])

const DEVISES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'MXN', 'ZAR', 'TRY', 'PLN', 'CNH', 'XAU', 'XAG'])

/** Une paire de devises (EURUSD, XAUUSD), suffixe de broker retire (EURUSDm, EURUSD.pro). */
function paire(s: string): string | null {
  const m = /^([A-Z]{3})([A-Z]{3})/.exec(s)
  return m && DEVISES.has(m[1]) && DEVISES.has(m[2]) ? m[1] + m[2] : null
}

/**
 * La racine d'un symbole, telle qu'on la compare : « CME_MINI:NQ1! » -> « NQ »,
 * « MNQZ5 » -> « MNQ », « NQ 12-25 » -> « NQ », « EURUSD.pro » -> « EURUSD ».
 * null quand il n'y a rien a lire.
 */
export function normaliserInstrument(brut: string | null | undefined): string | null {
  if (!brut) return null
  let s = brut.trim().toUpperCase()
  // Prefixe de bourse (TradingView, CQG) : ce qui suit le dernier deux-points.
  if (s.includes(':')) s = s.slice(s.lastIndexOf(':') + 1)
  s = s.replace(/^[/@]+/, '')
  // NinjaTrader : « NQ 12-25 », « ES DEC25 » : le premier mot.
  s = s.split(/\s+/)[0] ?? ''
  // Contrat continu de TradingView : « NQ1! ».
  s = s.replace(/\d+!$/, '')
  const fx = paire(s)
  if (fx) return fx
  // Suffixe de broker apres un separateur : « NAS100.cash », « US30_CASH ».
  const sep = /^([A-Z0-9]{2,})[._-]/.exec(s)
  if (sep) s = sep[1]
  const echeance = new RegExp(`^([A-Z0-9]{1,4}?)([${MOIS}])(\\d{1,2}|\\d{4})$`).exec(s)
  if (echeance && RACINES_FUTURES.has(echeance[1])) s = echeance[1]
  return /[A-Z]/.test(s) ? s : null
}

/** La famille d'un instrument : MNQ et NQ donnent « NQ ». */
export function familleInstrument(brut: string | null | undefined): string | null {
  const racine = normaliserInstrument(brut)
  return racine ? FAMILLES[racine] ?? racine : null
}

export function memeFamille(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = familleInstrument(a)
  return fa !== null && fa === familleInstrument(b)
}

/** Le symbole d'une adresse : `?symbol=CME_MINI:NQ1!` ou `/symbols/CME_MINI-NQ1!/` (TradingView). */
export function instrumentDepuisAdresse(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  let url: URL
  try { url = new URL(adresse) } catch { return null }
  const parametre = url.searchParams.get('symbol') ?? url.searchParams.get('tvwidgetsymbol')
  if (parametre) return normaliserInstrument(parametre)
  if (/tradingview\.com$/i.test(url.hostname)) {
    const morceaux = url.pathname.split('/').filter(Boolean)
    const i = morceaux.indexOf('symbols')
    if (i >= 0 && morceaux[i + 1]) {
      const brut = decodeURIComponent(morceaux[i + 1])
      return normaliserInstrument(brut.includes('-') ? brut.slice(brut.lastIndexOf('-') + 1) : brut)
    }
  }
  return null
}

/** Le premier instrument connu ecrit EN CAPITALES dans un titre (« Seance NQ », « MNQZ2025 21 000 »). */
export function instrumentDepuisTitre(titre: string | null | undefined): string | null {
  if (!titre) return null
  for (const mot of titre.split(/[^A-Za-z0-9!:._/@-]+/)) {
    if (!mot || mot !== mot.toUpperCase() || !/[A-Z]/.test(mot)) continue
    const racine = normaliserInstrument(mot)
    if (racine && (NOMMES_DANS_UN_TITRE.has(racine) || paire(racine))) return racine
  }
  return null
}

/** L'instrument d'un trade : les adresses d'abord (graphiques), puis les titres. */
export function instrumentDuTrade(sources: { adresses: Array<string | null | undefined>; titres: Array<string | null | undefined> }): string | null {
  for (const adresse of sources.adresses) {
    const lu = instrumentDepuisAdresse(adresse)
    if (lu) return lu
  }
  for (const titre of sources.titres) {
    const lu = instrumentDepuisTitre(titre)
    if (lu) return lu
  }
  return null
}
