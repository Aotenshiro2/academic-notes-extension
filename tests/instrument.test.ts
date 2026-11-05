import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normaliserInstrument, familleInstrument, memeFamille,
  instrumentDepuisAdresse, instrumentDepuisTitre, instrumentDuTrade,
} from '../src/lib/instrument.ts'

test('normaliser : bourse, contrat continu, échéance, NinjaTrader, suffixe de broker', () => {
  assert.equal(normaliserInstrument('CME_MINI:NQ1!'), 'NQ')
  assert.equal(normaliserInstrument('CME_MINI:MNQ1!'), 'MNQ')
  assert.equal(normaliserInstrument('NQZ5'), 'NQ')
  assert.equal(normaliserInstrument('MNQZ2025'), 'MNQ')
  assert.equal(normaliserInstrument('ESH26'), 'ES')
  assert.equal(normaliserInstrument('M2KZ5'), 'M2K')
  assert.equal(normaliserInstrument('6EZ5'), '6E')
  assert.equal(normaliserInstrument('NQ 12-25'), 'NQ')
  assert.equal(normaliserInstrument('/NQ'), 'NQ')
  assert.equal(normaliserInstrument('EURUSD.pro'), 'EURUSD')
  assert.equal(normaliserInstrument('EURUSDm'), 'EURUSD')
  assert.equal(normaliserInstrument('OANDA:XAUUSD'), 'XAUUSD')
  assert.equal(normaliserInstrument('NAS100.cash'), 'NAS100')
  assert.equal(normaliserInstrument('US30'), 'US30')
  assert.equal(normaliserInstrument('SPX500'), 'SPX500')
  assert.equal(normaliserInstrument(''), null)
  assert.equal(normaliserInstrument('  '), null)
})

test("normaliser : n'arrache pas l'échéance d'un symbole qui n'est pas un future connu", () => {
  assert.equal(normaliserInstrument('HK50'), 'HK50')
  assert.equal(normaliserInstrument('UK100'), 'UK100')
  assert.equal(normaliserInstrument('AAPL'), 'AAPL')
})

test('famille : micro et mini du même indice', () => {
  for (const [a, b] of [['NQ', 'MNQ'], ['ES', 'MES'], ['YM', 'MYM'], ['RTY', 'M2K'], ['GC', 'MGC'], ['CL', 'MCL']]) {
    assert.equal(familleInstrument(a), familleInstrument(b), `${a} et ${b}`)
    assert.ok(memeFamille(`${b}Z5`, `CME_MINI:${a}1!`))
  }
  assert.ok(!memeFamille('NQZ5', 'ESZ5'))
  assert.ok(!memeFamille('NQ', null))
  assert.equal(familleInstrument('NAS100'), 'US100')
  assert.equal(familleInstrument('US100'), 'US100')
  assert.ok(!memeFamille('NQ', 'NAS100'), 'le future et le CFD restent deux instruments')
})

test("adresse : paramètre symbol= et chemin /symbols/ de TradingView", () => {
  assert.equal(instrumentDepuisAdresse('https://www.tradingview.com/chart/AbCd/?symbol=CME_MINI%3ANQ1%21'), 'NQ')
  assert.equal(instrumentDepuisAdresse('https://fr.tradingview.com/symbols/CME_MINI-MNQ1!/'), 'MNQ')
  assert.equal(instrumentDepuisAdresse('https://www.tradingview.com/symbols/FX-EURUSD/'), 'EURUSD')
  assert.equal(instrumentDepuisAdresse('https://www.tradingview.com/chart/AbCd/'), null)
  assert.equal(instrumentDepuisAdresse('pas une adresse'), null)
})

test('titre : un instrument connu écrit en capitales, jamais un mot', () => {
  assert.equal(instrumentDepuisTitre('Exemple : séance NQ'), 'NQ')
  assert.equal(instrumentDepuisTitre('MNQZ2025 21 000,25 +0,4 % TradingView'), 'MNQ')
  assert.equal(instrumentDepuisTitre('NQ1! 20 100,25 Sans nom'), 'NQ')
  assert.equal(instrumentDepuisTitre('Plan sur GER40 et US30'), 'GER40')
  assert.equal(instrumentDepuisTitre('Tu es en forme ? les es'), null)
  assert.equal(instrumentDepuisTitre('LE PLAN DU JOUR'), null)
  assert.equal(instrumentDepuisTitre('EURUSD avant la BCE'), 'EURUSD')
})

test("trade : l'adresse d'abord, puis les titres", () => {
  assert.equal(instrumentDuTrade({ adresses: ['https://www.tradingview.com/chart/x/?symbol=CME_MINI:ES1!'], titres: ['Séance NQ'] }), 'ES')
  assert.equal(instrumentDuTrade({ adresses: ['https://www.tradingview.com/chart/x/', undefined], titres: [null, 'Séance NQ'] }), 'NQ')
  assert.equal(instrumentDuTrade({ adresses: [], titres: ['Ma journée'] }), null)
})
