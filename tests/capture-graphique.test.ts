import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estTradingView, symboleDepuisTitreTradingView, symboleDepuisAdresseTradingView, normaliserUniteTemps,
  uniteTempsDepuisAdresse, afficherUniteTemps, lireGraphique, choisirGraphiques, raisonAMontrer,
  legendeCapture, CAPTURES_MAX, type OngletVu,
} from '../src/lib/capture-graphique.ts'

const NQ = 'https://www.tradingview.com/chart/AbCd/?symbol=CME_MINI%3ANQ1%21'
const onglet = (windowId: number, titre: string, champs: Partial<OngletVu> = {}): OngletVu =>
  ({ tabId: 100 + windowId, windowId, url: 'https://www.tradingview.com/chart/AbCd/', titre, ...champs })
// Le titre du vrai TradingView (relevé le 05/11) : triangle et vrai signe moins.
const TITRE_REEL = `NQ1! 27,885.00 ${String.fromCharCode(0x25BC)} ${String.fromCharCode(0x2212)}2.39%`

test('TradingView seulement : sous-domaines oui, autre site ou faux domaine non', () => {
  assert.equal(estTradingView('https://www.tradingview.com/chart/x/'), true)
  assert.equal(estTradingView('https://fr.tradingview.com/chart/x/'), true)
  assert.equal(estTradingView('https://tradingview.com/'), true)
  assert.equal(estTradingView('https://tradingview.com.exemple.net/'), false)
  assert.equal(estTradingView('https://www.example.com/?q=tradingview.com'), false)
  assert.equal(estTradingView('chrome://newtab/'), false)
  assert.equal(estTradingView(undefined), false)
})

test('symbole : titre de TradingView (premier mot), compteur ignoré, sinon rien', () => {
  assert.equal(symboleDepuisTitreTradingView(TITRE_REEL), 'NQ1!')
  assert.equal(symboleDepuisTitreTradingView('(2) MNQ1! 20 100,25'), 'MNQ1!')
  assert.equal(symboleDepuisTitreTradingView('EURUSD 1,0712 -0,1%'), 'EURUSD')
  assert.equal(symboleDepuisTitreTradingView('TradingView : suivez tous les marchés'), null)
  assert.equal(symboleDepuisTitreTradingView('Alerte : NQ1! croise 20 100'), null)
  assert.equal(symboleDepuisTitreTradingView(''), null)
  assert.equal(symboleDepuisAdresseTradingView(NQ), 'NQ1!')
  assert.equal(symboleDepuisAdresseTradingView('https://www.tradingview.com/symbols/CME_MINI-ES1!/'), 'ES1!')
})

test("unité de temps normalisée : texte du bouton, chiffre de la légende, libellés FR et EN", () => {
  const cas: Array<[string, string | null]> = [
    ['5s', '5s'], ['30s', '30s'], ['1m', '1m'], ['5m', '5m'], ['15m', '15m'], ['1h', '1h'], ['4h', '4h'],
    ['D', 'D'], ['1D', 'D'], ['2D', '2D'], ['W', 'W'], ['M', 'M'], ['3M', '3M'], ['12M', '12M'],
    ['5', '5m'], ['60', '1h'], ['240', '4h'], ['1440', 'D'], ['90', '90m'],
    ['5 minutes', '5m'], ['1 minute', '1m'], ['1 hour', '1h'], ['4 hours', '4h'], ['1 day', 'D'], ['1 week', 'W'], ['1 month', 'M'], ['3 months', '3M'],
    ['1 heure', '1h'], ['1 jour', 'D'], ['1 semaine', 'W'], ['1 mois', 'M'], ['3 mois', '3M'], ['30 secondes', '30s'],
    ['', null], ['xyz', null], ['0', null], ['Indicateurs', null],
  ]
  for (const [brut, attendu] of cas) assert.equal(normaliserUniteTemps(brut), attendu, brut)
  // La casse compte comme chez TradingView : m minute, M mois.
  assert.notEqual(normaliserUniteTemps('1m'), normaliserUniteTemps('1M'))
  assert.equal(uniteTempsDepuisAdresse(NQ + '&interval=15'), '15m')
  assert.equal(uniteTempsDepuisAdresse(NQ), null)
})

test('affichage sous l\'image et légende de la capture', () => {
  assert.equal(afficherUniteTemps('5m'), '5 min')
  assert.equal(afficherUniteTemps('1h'), '1 h')
  assert.equal(afficherUniteTemps('30s'), '30 s')
  assert.equal(afficherUniteTemps('D'), 'D')
  assert.equal(afficherUniteTemps('3M'), '3M')
  assert.equal(legendeCapture('Lancement', 'NQ1!', '5m', '09:40'), 'Lancement, NQ1!, 5 min, 09:40')
  assert.equal(legendeCapture('Clôture', 'NQ1!', null, '10:05'), 'Clôture, NQ1!, 10:05')
  const pasClavier = new RegExp(`[${String.fromCharCode(0xB7, 0x2014, 0x2013)}]`)
  assert.doesNotMatch(legendeCapture('Lancement', 'NQ1!', '5m', '09:40'), pasClavier)
})

test('lire un onglet comme le vrai TradingView : titre, bouton menu, son libellé, la légende, l\'adresse', () => {
  // Le relevé du 05/11 : un seul bouton menu « 5m », aria-label « 5 minutes », légende « 5 ».
  const reel = lireGraphique(onglet(1, TITRE_REEL, { page: { symbole: 'NQ1!', intervalle: '5m', intervalleLibelle: '5 minutes', intervalleLegende: '5' } }))
  assert.equal(reel?.symbole, 'NQ1!')
  assert.equal(reel?.racine, 'NQ')
  assert.equal(reel?.uniteTemps, '5m')
  // Le titre l'emporte sur une adresse restée sur un autre symbole.
  const titre = lireGraphique(onglet(1, 'NQ1! 20 100,25', { url: 'https://www.tradingview.com/chart/x/?symbol=CME_MINI%3AES1%21' }))
  assert.equal(titre?.symbole, 'NQ1!')
  // Texte du bouton illisible : son libellé ; sans libellé : la légende ; sans légende : l'adresse.
  assert.equal(lireGraphique(onglet(1, 'NQ1! 1', { page: { intervalle: '', intervalleLibelle: '1 heure', intervalleLegende: '60' } }))?.uniteTemps, '1h')
  assert.equal(lireGraphique(onglet(1, 'NQ1! 1', { page: { intervalle: null, intervalleLibelle: null, intervalleLegende: '15' } }))?.uniteTemps, '15m')
  assert.equal(lireGraphique(onglet(1, 'NQ1! 1', { page: { intervalleLegende: 'D' } }))?.uniteTemps, 'D')
  assert.equal(lireGraphique(onglet(1, 'TradingView', { url: NQ + '&interval=60' }))?.uniteTemps, '1h')
  // Symbole par la page quand le titre ne le donne pas.
  const parPage = lireGraphique(onglet(1, 'TradingView', { page: { symbole: 'MNQ1!' } }))
  assert.equal(parPage?.famille, 'NQ')
  assert.equal(parPage?.uniteTemps, null)
  // Actif illisible : pas de capture, jamais une image au hasard.
  assert.equal(lireGraphique(onglet(1, 'TradingView')), null)
  assert.equal(lireGraphique(onglet(1, 'NQ1! 20 100', { url: 'https://www.example.com/' })), null)
})

test('choix par famille : seul le même actif passe, NQ et MNQ ensemble', () => {
  const choix = choisirGraphiques([onglet(1, 'NQ1! 20 100'), onglet(2, 'ES1! 5 900'), onglet(3, 'MNQ1! 20 100')], 'NQ', false)
  assert.equal(choix.ok, true)
  if (!choix.ok) return
  assert.deepEqual(choix.graphiques.map(g => g.windowId), [1, 3])
  assert.equal(choix.instrumentAPoser, null)
})

test('trade sans instrument : une seule famille affichée devient l\'instrument ; plusieurs : on ne devine pas', () => {
  const un = choisirGraphiques([onglet(1, 'MNQ1! 20 100'), onglet(2, 'NQ1! 20 100')], null, true)
  assert.equal(un.ok && un.instrumentAPoser, 'MNQ')
  assert.equal(un.ok && un.graphiques.length, 2)
  const tous = choisirGraphiques([onglet(1, 'NQ1! 20 100')], null, false)
  assert.equal(tous.ok && tous.instrumentAPoser, null)
  const deux = choisirGraphiques([onglet(1, 'NQ1! 20 100'), onglet(2, 'ES1! 5 900')], null, true)
  assert.deepEqual(deux, { ok: false, raison: 'plusieurs-actifs', attendu: null, affiches: ['NQ', 'ES'] })
})

test('plusieurs fenêtres : une capture par fenêtre, la fenêtre active d\'abord, 3 au plus, réduite écartée', () => {
  const onglets = [
    onglet(1, 'NQ1! 20 100', { page: { intervalle: '1h' } }),
    onglet(2, 'NQ1! 20 100', { page: { intervalle: '5m' }, fenetreActive: true }),
    onglet(3, 'NQ1! 20 100', { fenetreReduite: true }),
    onglet(4, 'NQ1! 20 100'),
    onglet(5, 'NQ1! 20 100'),
    { ...onglet(2, 'NQ1! 20 100'), tabId: 999 },
  ]
  const choix = choisirGraphiques(onglets, 'NQ', false)
  assert.equal(choix.ok, true)
  if (!choix.ok) return
  assert.equal(choix.graphiques.length, CAPTURES_MAX)
  assert.deepEqual(choix.graphiques.map(g => g.windowId), [2, 1, 4])
  assert.deepEqual(choix.graphiques.map(g => g.uniteTemps), ['5m', '1h', null])
})

test('aucune correspondance : pas de capture, la raison pour le message', () => {
  assert.deepEqual(choisirGraphiques([onglet(1, 'ES1! 5 900')], 'NQ', false), { ok: false, raison: 'autre-actif', attendu: 'NQ', affiches: ['ES'] })
  assert.deepEqual(choisirGraphiques([], 'NQ', false), { ok: false, raison: 'aucun-graphique', attendu: 'NQ', affiches: [] })
  assert.deepEqual(choisirGraphiques([onglet(1, 'TradingView')], null, true), { ok: false, raison: 'aucun-graphique', attendu: null, affiches: [] })
  // Un autre site, même avec un titre qui ressemble : écarté.
  const autreSite = choisirGraphiques([onglet(1, 'NQ1! 20 100', { url: 'https://www.example.com/' })], 'NQ', false)
  assert.equal(autreSite.ok, false)
})

test('message : rien si aucun TradingView n\'est ouvert, la raison sinon, rien quand la capture est faite', () => {
  const autreActif = choisirGraphiques([onglet(1, 'ES1! 5 900')], 'NQ', false)
  assert.equal(raisonAMontrer(autreActif, true), 'autre-actif')
  // TradingView ouvert derrière un autre site : aucun onglet actif à lire, le message le dit.
  assert.equal(raisonAMontrer(choisirGraphiques([], 'NQ', false), true), 'aucun-graphique')
  // Aucun onglet TradingView : le membre ne s'en sert pas, on ne dit rien.
  assert.equal(raisonAMontrer(choisirGraphiques([], 'NQ', false), false), null)
  assert.equal(raisonAMontrer(choisirGraphiques([], null, true), false), null)
  assert.equal(raisonAMontrer(choisirGraphiques([onglet(1, 'NQ1! 20 100')], 'NQ', false), true), null)
})
