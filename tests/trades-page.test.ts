// Les trades d'une page de plateforme, lus par la capture intelligente (1.10.0).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  plateformeDeLaPage, sourceCapture, nomDeCapture, choisirTableauTrades, famillesDe, empreinteTableau, dejaLue, noterLue,
  DUREE_DEJA_LUE_MS, LECTURES_GARDEES, compteDepuisPage, devinerCompteCapture, lotsDeLaCapture, normaliseReleve, lectureATrades,
  type TableauPage,
} from '../src/lib/trades-page.ts'
import { normaliseLecture, lireLignesApercu } from '../src/lib/documents-lecture.ts'
import type { CompteConnu } from '../src/lib/pilotage-comptes.ts'

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// Les mêmes règles que le journal (trades-envoyes.ts, sourceEnvoyee).
const RE_SOURCE_JOURNAL = /^[a-z0-9][a-z0-9:._-]{1,79}$/

const topx: CompteConnu = { id: 'tx1', nom: '50KTC-V2-123456-78901234', kind: 'prop', firmName: 'Topstep', brokerName: 'ProjectX', identifiants: ['50KTC-V2-123456-78901234', 'Combine 50K'], actif: true, sansIdentifiant: false }
const topx2: CompteConnu = { ...topx, id: 'tx2', nom: '50KTC-V2-123456-99990000', identifiants: ['50KTC-V2-123456-99990000', 'Combine 50K b'] }
const apex: CompteConnu = { id: 'a1', nom: 'APEX-514239-01', kind: 'prop', firmName: 'Apex', brokerName: 'Rithmic', identifiants: ['APEX-514239-01'], actif: true, sansIdentifiant: false }
const ibkr: CompteConnu = { id: 'o1', nom: 'IBKR', kind: 'own', firmName: '', brokerName: 'Interactive Brokers', identifiants: ['514239', 'IBKR'], actif: true, sansIdentifiant: false }
const demo: CompteConnu = { id: 'd1', nom: 'PRAC-50K-0001', kind: 'demo', firmName: '', brokerName: 'ProjectX', identifiants: ['PRAC-50K-0001'], actif: true, sansIdentifiant: false }
const comptes = [topx, topx2, apex, ibkr, demo]

const trade = (compte: string | null, i = 0) => ({
  source: 'ia:inconnu', idExterne: `e${i}`, compte, symbole: 'MNQZ6', direction: 'long', quantite: 2, prixEntree: 21450.25, prixSortie: 21462.5,
  entreLe: `2026-11-12T14:3${i}:05`, sortiLe: `2026-11-12T14:4${i}:10`, pnl: 49, devise: 'USD', frais: 1.48, dureeSec: 605,
})
const lecture = (champs: Record<string, unknown>) => normaliseLecture({ type: 'trades', methode: 'vision', confiance: 0.9, ...champs })

const trades: TableauPage = {
  entetes: ['Symbol', 'Type', 'Size', 'Entry Time', 'Exit Time', 'Entry Price', 'Exit Price', 'PnL', 'Fees'],
  lignes: [['MNQZ6', 'Long', '2', '11/12/2026 14:30:05', '11/12/2026 14:40:10', '21,450.25', '21,462.50', '$49.00', '$1.48']],
}

test('la plateforme et la source viennent de l\'adresse, jamais de la lecture', () => {
  assert.equal(plateformeDeLaPage('https://topstepx.com/trade')?.id, 'topstepx')
  assert.equal(plateformeDeLaPage('https://trader.tradovate.com/welcome')?.id, 'tradovate')
  assert.equal(plateformeDeLaPage('https://www.tradingview.com/chart/')?.id, 'tradingview')
  assert.equal(plateformeDeLaPage('https://faketradovate.com/'), null)
  assert.equal(plateformeDeLaPage('https://tradovate.com.evil.io/'), null)
  assert.equal(plateformeDeLaPage('pas une adresse'), null)
  assert.equal(sourceCapture('https://topstepx.com/trade'), 'capture:topstepx')
  assert.equal(sourceCapture('https://dashboard.topstep.com/'), 'capture:topstep')
  assert.equal(sourceCapture('https://app.broker-blanc.com/web'), 'capture:app.broker-blanc.com')
  assert.equal(sourceCapture(''), 'capture:page')
  for (const url of ['https://topstepx.com/', 'https://APP.Broker_X.com/', 'https://a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.example-tres-long.com/']) {
    assert.match(sourceCapture(url), RE_SOURCE_JOURNAL, url)
  }
})

test('le nom au coffre : capture-trades-AAAA-MM-JJ-HHMM.jpg, sans la plateforme (que la lecture prendrait pour le compte)', () => {
  assert.equal(nomDeCapture(new Date(2026, 10, 12, 9, 5).getTime()), 'capture-trades-2026-11-12-0905.jpg')
})

test('un tableau de trades fermés se lit ; des positions ouvertes, un graphique ou un tableau vide, non', () => {
  assert.deepEqual(famillesDe(trades.entetes).sort(), ['pnl', 'prix', 'quantite', 'sens', 'symbole', 'temps'])
  assert.equal(choisirTableauTrades([trades])?.tableau, trades)
  // Le rapport Performance de Tradovate, l'historique de MetaTrader, les positions clôturées de SimpleFX
  const tradovate = { entetes: ['Symbol', 'Qty', 'Buy Price', 'Sell Price', 'P/L', 'Bought Timestamp', 'Sold Timestamp', 'Duration'], lignes: [['MNQZ6', '1', '21450', '21460', '$20.00', '11/12 14:30', '11/12 14:41', '11min']] }
  const mt5 = { entetes: ['Time', 'Ticket', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'Price', 'Commission', 'Swap', 'Profit'], lignes: [['2026.11.12 09:30', '1001', 'XAUUSD', 'buy', '0.10', '2650.1', '', '', '2026.11.12 10:02', '2655.4', '0', '0', '53.00']] }
  const simplefx = { entetes: ['Instrument', 'Direction', 'Taille', 'Ouverture', 'Clôture', 'Profit'], lignes: [['US100', 'Achat', '0.5', '21450', '21470', '10.00']] }
  for (const t of [tradovate, mt5, simplefx]) assert.ok(choisirTableauTrades([t]), t.entetes.join(','))

  const ouvertes = { entetes: ['Symbol', 'Side', 'Qty', 'Avg Price', 'Unrealized P&L'], lignes: [['MNQZ6', 'Long', '2', '21450', '$12.00']] }
  const legende = { entetes: ['O', 'H', 'L', 'C', 'Vol'], lignes: [['21450', '21470', '21440', '21460', '1200']] }
  const vide = { entetes: trades.entetes, lignes: [['', '', '']] }
  const sansPnl = { entetes: ['Symbol', 'Side', 'Qty', 'Price', 'Time'], lignes: [['MNQZ6', 'Buy', '1', '21450', '14:30']] }
  assert.equal(choisirTableauTrades([ouvertes, legende, vide, sansPnl]), null)
  // Le plus fourni gagne quand la page en a plusieurs
  const court = { entetes: ['Symbol', 'Qty', 'Exit Price', 'PnL'], lignes: [['MNQZ6', '1', '21460', '20']] }
  assert.equal(choisirTableauTrades([court, trades])?.tableau, trades)
})

test('la même page, à l\'identique, ne se relit pas dans les 12 h', () => {
  const e1 = empreinteTableau(trades)
  assert.equal(e1, empreinteTableau({ entetes: [...trades.entetes], lignes: trades.lignes.map(l => [...l]) }))
  assert.notEqual(e1, empreinteTableau({ ...trades, lignes: [...trades.lignes, ['MESZ6', 'Short', '1', '', '', '', '', '$-12.50', '']] }))
  const t0 = Date.UTC(2026, 10, 12, 10)
  const liste = noterLue([], e1, t0)
  assert.equal(dejaLue(liste, e1, t0 + 60_000), true)
  assert.equal(dejaLue(liste, e1, t0 + DUREE_DEJA_LUE_MS + 1), false)
  assert.equal(dejaLue(liste, 'autre', t0), false)
  assert.equal(dejaLue(null, e1, t0), false)
  // Bornée, sans doublon, les vieilles partent
  let longue = noterLue([{ empreinte: 'vieille', quand: t0 - DUREE_DEJA_LUE_MS - 1 }], e1, t0)
  assert.deepEqual(longue.map(l => l.empreinte), [e1])
  for (let i = 0; i < LECTURES_GARDEES + 10; i++) longue = noterLue(longue, `e${i}`, t0 + i)
  assert.equal(longue.length, LECTURES_GARDEES)
  assert.equal(noterLue(noterLue([], e1, t0), e1, t0 + 5).filter(l => l.empreinte === e1).length, 1)
  assert.deepEqual(noterLue([null, { empreinte: 3 }] as never, e1, t0).map(l => l.empreinte), [e1])
})

test('le compte que la page montre : un mot entier, la sélection d\'abord, jamais un prix', () => {
  const vide = { jetons: [], jetonsSelection: [], texteCompte: '' }
  assert.deepEqual(compteDepuisPage({ ...vide, jetons: ['50KTC-V2-123456-78901234', '21450.25'] }, comptes), { compteId: 'tx1', plusieurs: false })
  // Un prix « 514239.5 » ou « 51,4239 » ne désigne pas le compte 514239 ; le mot entier, si.
  assert.deepEqual(compteDepuisPage({ ...vide, jetons: ['514239.5'] }, comptes), { compteId: null, plusieurs: false })
  assert.deepEqual(compteDepuisPage({ ...vide, jetons: ['514239'] }, comptes), { compteId: 'o1', plusieurs: false })
  // Le menu des comptes liste tout : la page ne tranche pas, sauf par ce qui est sélectionné.
  const menu = { jetons: ['50KTC-V2-123456-78901234', '50KTC-V2-123456-99990000'], jetonsSelection: [], texteCompte: '' }
  assert.deepEqual(compteDepuisPage(menu, comptes), { compteId: null, plusieurs: true })
  assert.deepEqual(compteDepuisPage({ ...menu, jetonsSelection: ['50KTC-V2-123456-99990000'] }, comptes), { compteId: 'tx2', plusieurs: false })
  // Écrit en plusieurs mots dans l'en-tête
  assert.deepEqual(compteDepuisPage({ ...vide, texteCompte: 'Compte : APEX 514239 01 · Solde 50 000' }, comptes), { compteId: 'a1', plusieurs: false })
  // Un nom sans chiffre (« IBKR », « Combine 50K » trop court ou banal) ne suffit jamais
  assert.deepEqual(compteDepuisPage({ ...vide, jetons: ['IBKR'], texteCompte: 'IBKR' }, comptes), { compteId: null, plusieurs: false })
})

test('le compte d\'un lot : la page d\'abord, le doute quand la lecture la contredit', () => {
  const lue = lecture({ identifiant: 'APEX-514239-01', trades: [trade('APEX-514239-01')] })
  // Sans la page : la lecture, comme l'import
  assert.equal(devinerCompteCapture(lue, comptes, null).compteId, 'a1')
  // La page et la lecture d'accord : sûr, « vu sur la page »
  const accord = devinerCompteCapture(lue, comptes, { compteId: 'a1', plusieurs: false })
  assert.deepEqual([accord.compteId, accord.par, accord.doute], ['a1', 'page', false])
  // Elles se contredisent : la page propose, le membre confirme
  const contre = devinerCompteCapture(lue, comptes, { compteId: 'tx1', plusieurs: false })
  assert.deepEqual([contre.compteId, contre.par, contre.doute], ['tx1', 'page', true])
  // La lecture ne dit rien : la page suffit
  const muette = devinerCompteCapture(lecture({ trades: [trade(null)] }), comptes, { compteId: 'tx1', plusieurs: false })
  assert.deepEqual([muette.compteId, muette.doute, muette.inconnu], ['tx1', false, null])
  // Un compte démo vu sur la page, un document qui ne dit pas démo : à confirmer
  const mondes = devinerCompteCapture(lecture({ trades: [trade(null)] }), comptes, { compteId: 'd1', plusieurs: false })
  assert.deepEqual([mondes.compteId, mondes.doute, mondes.demo], ['d1', true, true])
})

test('les lots : la source de la page partout, un lot par compte lu, la page seulement pour un lot unique', () => {
  const page = { compteId: 'tx1', plusieurs: false }
  const un = lotsDeLaCapture({ lecture: lecture({ trades: [trade(null, 0), trade(null, 1)] }), comptes, page, source: 'capture:topstepx' })
  assert.equal(un.length, 1)
  assert.ok(un[0].trades.every(t => t.source === 'capture:topstepx'))
  assert.equal(un[0].devinette.compteId, 'tx1')
  // Une page qui liste deux comptes copiés : deux lots, chacun son compte lu, la page ne devine rien
  const deux = lotsDeLaCapture({ lecture: lecture({ trades: [trade('APEX-514239-01', 0), trade('50KTC-V2-123456-99990000', 1)] }), comptes, page, source: 'capture:x' })
  assert.deepEqual(deux.map(l => l.devinette.compteId), ['a1', 'tx2'])
  assert.ok(deux.every(l => l.devinette.par !== 'page'))
  // Rien à ranger : positions ouvertes, tableau de bord, illisible
  assert.deepEqual(lotsDeLaCapture({ lecture: normaliseLecture({ type: 'capture-tableau' }), comptes, page, source: 'capture:x' }), [])
  assert.deepEqual(lotsDeLaCapture({ lecture: null, comptes, page, source: 'capture:x' }), [])
  assert.equal(lectureATrades(normaliseLecture({ type: 'trades', trades: [] })), false)
  assert.equal(lectureATrades(lecture({ trades: [trade(null)] })), true)
  // Porte ouverte : des trades lus sans IA remplacent la lecture
  const directs = lotsDeLaCapture({ lecture: null, directs: [trade(null, 3) as never], comptes, page, source: 'capture:topstepx' })
  assert.equal(directs.length, 1)
  assert.equal(directs[0].trades[0].source, 'capture:topstepx')
})

test('le relevé de la page est vérifié avant d\'être lu', () => {
  assert.equal(normaliseReleve(null), null)
  assert.equal(normaliseReleve([1, 2]), null)
  const r = normaliseReleve({ tableaux: [trades, { entetes: [], lignes: [['x']] }, 'bidule', { entetes: ['a'], lignes: 'x' }], jetons: ['A1234', 7], texteCompte: 42 })!
  assert.deepEqual(r.tableaux, [trades])
  assert.deepEqual(r.jetons, ['A1234'])
  assert.deepEqual(r.jetonsSelection, [])
  assert.equal(r.texteCompte, '')
})

test('les lignes de l\'aperçu du journal : vérifiées, « nouveau » par défaut, une ligne douteuse écartée', () => {
  const lignes = lireLignesApercu([
    { symbole: 'MNQZ6', direction: 'long', quantite: 2, entreLe: '2026-11-12T13:30:05.000Z', sortiLe: '2026-11-12T13:40:10.000Z', prixEntree: 21450.25, prixSortie: 21462.5, pnl: 49, devise: 'USD', nouveau: false },
    { symbole: 'MESZ6', direction: 'bidule', quantite: 'x', entreLe: '2026-11-12T13:50:00.000Z', sortiLe: 'pas une date', pnl: -12.5, devise: 'eur' },
    { symbole: '', entreLe: '2026-11-12T13:30:05.000Z' },
    { symbole: 'NQ', entreLe: 'hier' },
    'rien',
  ])
  assert.equal(lignes.length, 2)
  assert.equal(lignes[0].nouveau, false)
  assert.deepEqual([lignes[1].direction, lignes[1].quantite, lignes[1].sortiLe, lignes[1].devise, lignes[1].nouveau], [null, 0, null, 'EUR', true])
  assert.deepEqual(lireLignesApercu(undefined), [])
})

test('le relevé dans la page reste autonome (exécuté par chrome.scripting) ; aucune minuterie ; aucune permission nouvelle', () => {
  const releve = lire('src/lib/smart-capture/trades-page.ts')
  assert.doesNotMatch(releve, /^import\s/m)
  for (const chemin of ['src/lib/trades-page.ts', 'src/lib/use-trades-page.ts', 'src/components/TradesDeLaPage.tsx', 'src/lib/smart-capture/trades-page.ts']) {
    assert.doesNotMatch(lire(chemin), /\bset(Interval|Timeout)\s*\(/, `${chemin} lance une minuterie`)
  }
  const manifest = JSON.parse(lire('public/manifest.json'))
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'unlimitedStorage', 'activeTab', 'tabs', 'contextMenus', 'scripting', 'identity', 'notifications', 'alarms'])
  assert.deepEqual(manifest.host_permissions, ['<all_urls>'])
  // Le content script n'en importe rien (script classique, sans import)
  assert.doesNotMatch(lire('src/content/content-script.ts'), /trades-page/)
})

test('chaque texte des trades de la page en français et en anglais, sans tiret cadratin', () => {
  const source = lire('src/lib/i18n.ts')
  const fr = source.slice(source.indexOf('const FR = {'), source.indexOf('export type CleI18n'))
  const en = source.slice(source.indexOf('const EN:'), source.indexOf('const DICO'))
  const cles = [...fr.matchAll(/'((?:tradesPage\.[A-Za-z0-9]+)|guide\.confidentialite11)'/g)].map(m => m[1])
  assert.ok(cles.length >= 30, String(cles.length))
  for (const cle of cles) {
    assert.ok(en.includes(`'${cle}'`), `${cle} manque en anglais`)
    const ligne = fr.slice(fr.indexOf(`'${cle}'`)).split('\n')[0] + en.slice(en.indexOf(`'${cle}'`)).split('\n')[0]
    assert.doesNotMatch(ligne, new RegExp(String.fromCharCode(0x2014)), `${cle} : tiret cadratin`)
  }
  assert.match(lire('src/guide/GuideApp.tsx'), /version: '1\.10\.0'/)
})
