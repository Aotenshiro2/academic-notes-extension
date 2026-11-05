// La carte de prix enrichie (1.8.14, brief C5) : conversion ticks / prix par
// instrument, sens choisi prioritaire (R, « Lier »), lecture d'une capture
// nettoyée, fusion dans la carte sans écraser ce que le membre a tapé, sauf
// s'il accepte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contratDe, decimales, fusionnerLecture, lectureVide, lireNombre, normaliseLectureOrdre, prixDepuisTicks, rDuPrix,
  reductionAvantEnvoi, risqueDeduitUSD, sensDuPrix, ticksDepuisPrix, BASE64_A_REDUIRE,
  type LectureOrdre, type Saisie,
} from '../src/lib/prix-trade.ts'
import { REDUCTION_CAPTURE } from '../src/lib/capture-graphique.ts'
import { trierParSens, sensDePosition, type PositionImportee } from '../src/lib/positions-jour.ts'

const ecrire = (n: number) => String(n).replace('.', ',')

test('contrats : le pas de cotation et la valeur du tick par instrument, micro compris', () => {
  const pas = (i: string) => contratDe(i)?.pas ?? null
  assert.equal(pas('NQ1!'), 0.25)
  assert.equal(pas('CME_MINI:MNQ1!'), 0.25)
  assert.equal(pas('ESZ2026'), 0.25)
  assert.equal(pas('MES'), 0.25)
  assert.equal(pas('YM1!'), 1)
  assert.equal(pas('RTY'), 0.1)
  assert.equal(pas('M2K'), 0.1)
  assert.equal(pas('GC1!'), 0.1)
  assert.equal(pas('CL'), 0.01)
  assert.equal(pas('6E'), 0.00005)
  assert.equal(contratDe('NQ')?.valeurTick, 5)
  assert.equal(contratDe('MNQZ5')?.valeurTick, 0.5)
  assert.equal(contratDe('ES')?.valeurTick, 12.5)
  // Inconnus : pas de mode ticks.
  for (const inconnu of ['EURUSD', 'US100', 'XAUUSD', 'ZN', '', null, undefined]) assert.equal(contratDe(inconnu), null, String(inconnu))
  assert.equal(decimales(0.25), 2)
  assert.equal(decimales(1), 0)
  assert.equal(decimales(0.00005), 5)
})

test('ticks vers prix : du côté du sens, au pas de l instrument, sans traîne de flottant', () => {
  // L'outil « Position courte » de Brice (ES) : entrée 7611,25, 254 ticks de chaque côté.
  const es = contratDe('ES1!')!.pas
  assert.equal(prixDepuisTicks({ entree: 7611.25, ticks: 254, pas: es, cote: 'stop', sens: 'vente' }), 7674.75)
  assert.equal(prixDepuisTicks({ entree: 7611.25, ticks: 254, pas: es, cote: 'tp', sens: 'vente' }), 7547.75)
  // Le panneau d'ordre de Brice (NQ, achat limite 27 287) : 166 ticks de stop, 254 de TP.
  const nq = contratDe('NQ1!')!.pas
  assert.equal(prixDepuisTicks({ entree: 27287, ticks: 166, pas: nq, cote: 'stop', sens: 'achat' }), 27245.5)
  assert.equal(prixDepuisTicks({ entree: 27287, ticks: 254, pas: nq, cote: 'tp', sens: 'achat' }), 27350.5)
  // YM au point, GC au dixième, CL au centième, 6E au demi-pip.
  assert.equal(prixDepuisTicks({ entree: 44000, ticks: 40, pas: 1, cote: 'stop', sens: 'achat' }), 43960)
  assert.equal(prixDepuisTicks({ entree: 2650.3, ticks: 37, pas: 0.1, cote: 'tp', sens: 'achat' }), 2654)
  assert.equal(prixDepuisTicks({ entree: 71.23, ticks: 15, pas: 0.01, cote: 'stop', sens: 'vente' }), 71.38)
  assert.equal(prixDepuisTicks({ entree: 1.08505, ticks: 7, pas: 0.00005, cote: 'tp', sens: 'vente' }), 1.0847)
  // Il manque quelque chose : null, jamais un prix deviné.
  assert.equal(prixDepuisTicks({ entree: 27287, ticks: 166, pas: nq, cote: 'stop', sens: null }), null)
  assert.equal(prixDepuisTicks({ entree: null, ticks: 166, pas: nq, cote: 'stop', sens: 'achat' }), null)
  assert.equal(prixDepuisTicks({ entree: 27287, ticks: -3, pas: nq, cote: 'stop', sens: 'achat' }), null)
  assert.equal(prixDepuisTicks({ entree: 10, ticks: 100, pas: nq, cote: 'stop', sens: 'achat' }), null, 'un prix négatif n existe pas')
})

test('prix vers ticks : la distance à l entrée en pas, entière quand elle tombe juste', () => {
  assert.equal(ticksDepuisPrix(7611.25, 7674.75, 0.25), 254)
  assert.equal(ticksDepuisPrix(27287, 27245.5, 0.25), 166)
  assert.equal(ticksDepuisPrix(2650.3, 2654, 0.1), 37)
  assert.equal(ticksDepuisPrix(27287, 27287.1, 0.25), 0.4)
  assert.equal(ticksDepuisPrix(null, 27287, 0.25), null)
  // Aller-retour : le prix revient à l'identique.
  const stop = prixDepuisTicks({ entree: 21000.25, ticks: ticksDepuisPrix(21000.25, 20980.75, 0.25)!, pas: 0.25, cote: 'stop', sens: 'achat' })
  assert.equal(stop, 20980.75)
})

test('sens : le sens CHOISI prime sur le sens déduit du stop, puis du TP', () => {
  assert.deepEqual(sensDuPrix({ entree: 100, stop: 95 }), { sens: 'achat', origine: 'deduit' })
  assert.deepEqual(sensDuPrix({ entree: 100, stop: 105 }), { sens: 'vente', origine: 'deduit' })
  assert.deepEqual(sensDuPrix({ entree: 100, tp: 90 }), { sens: 'vente', origine: 'deduit' })
  assert.deepEqual(sensDuPrix({ entree: 100, stop: 95, sens: 'vente' }), { sens: 'vente', origine: 'choisi' })
  assert.deepEqual(sensDuPrix({ sens: 'achat' }), { sens: 'achat', origine: 'choisi' })
  assert.equal(sensDuPrix({ entree: 100 }), null)
  assert.equal(sensDuPrix({ entree: 100, stop: 100 }), null)
  assert.equal(sensDuPrix(undefined), null)
})

test('R : (sortie - entrée) x sens / risque, avec le sens choisi, partiels pondérés', () => {
  assert.equal(rDuPrix({ entree: 100, stop: 95, sortie: 110 }), 2)
  assert.equal(rDuPrix({ entree: 100, stop: 105, sortie: 110 }), -2)
  // Le sens choisi gagne : même stop sous l'entrée, mais le membre dit « vente ».
  assert.equal(rDuPrix({ entree: 100, stop: 95, sortie: 110, sens: 'vente' }), -2)
  assert.equal(rDuPrix({ entree: 100, stop: 95, sortie: 100 }), 0)
  // Partiels : 1 à 105, 1 à 110, taille 2 : sortie moyenne 107,5, soit 1,5 R.
  assert.equal(rDuPrix({ entree: 100, stop: 95, taille: 2, partiels: [{ prix: 105, taille: 1 }], sortie: 110 }), 1.5)
  assert.equal(rDuPrix({ entree: 100, stop: 95, taille: 2, partiels: [{ prix: 105, taille: 1 }, { prix: 110, taille: 1 }] }), 1.5)
  assert.equal(rDuPrix({ entree: 100, stop: 95, partiels: [{ prix: 105 }], sortie: 110 }), null, 'partiel sans taille : rien à pondérer')
  assert.equal(rDuPrix({ entree: 100, sortie: 110 }), null)
  assert.equal(rDuPrix({ entree: 100, stop: 100, sortie: 110 }), null)
})

test('risque en USD déduit : ticks de stop x valeur du tick x taille', () => {
  // NQ, 6 contrats, 166 ticks : 166 x 5 x 6 = 4 980 USD.
  assert.equal(risqueDeduitUSD({ entree: 27287, stop: 27245.5, taille: 6 }, contratDe('NQ1!')), 4980)
  // MES, 2 contrats, 10 points (40 ticks) : 40 x 1,25 x 2 = 100.
  assert.equal(risqueDeduitUSD({ entree: 6000, stop: 5990, taille: 2 }, contratDe('MES')), 100)
  assert.equal(risqueDeduitUSD({ entree: 6000, stop: 5990 }, contratDe('MES')), null)
  assert.equal(risqueDeduitUSD({ entree: 1.1, stop: 1.09, taille: 1 }, contratDe('EURUSD')), null)
})

test('« Lier » : le sens du trade passe devant, rien n est masqué', () => {
  const pos = (positionId: string, direction: string | null): PositionImportee => ({
    positionId, compteId: positionId, compte: null, symbole: 'NQZ5', direction, devise: 'USD', entreLe: '2026-11-05T15:00:00Z',
    sortiLe: null, quantite: 1, pnl: 0, prixEntree: 20000, prixSortie: null, segmentRef: null, fuseau: 'Z',
  })
  const groupes = [[pos('a', 'long')], [pos('b', 'short')], [pos('c', null)], [pos('d', 'short')], [pos('e', 'long')]]
  assert.deepEqual(trierParSens(groupes, 'vente').map(g => g[0].positionId), ['b', 'd', 'c', 'a', 'e'])
  assert.deepEqual(trierParSens(groupes, 'achat').map(g => g[0].positionId), ['a', 'e', 'c', 'b', 'd'])
  assert.equal(trierParSens(groupes, null), groupes)
  assert.equal(sensDePosition({ direction: 'short' }), 'vente')
  // Le sens choisi de la carte (vente) l'emporte sur celui que le stop dirait (achat).
  const s = sensDuPrix({ entree: 20000, stop: 19990, sens: 'vente' })!.sens
  assert.equal(trierParSens(groupes, s)[0][0].direction, 'short')
})

test('lecture du journal nettoyée : une valeur douteuse devient null, jamais devinée', () => {
  const l = normaliseLectureOrdre({
    sens: 'achat', typeOrdre: 'limite', entree: 27287, stop: null, tp: 'x', taille: 6, risque: { montant: 100, unite: 'USD' },
    partiels: [{ prix: 27300, taille: 2 }, { prix: -1 }, 'x', { prix: 27320 }], instrument: '  NQ1!  ', confiance: 3, remarque: '  ok  ', inconnu: 1,
  })
  assert.deepEqual(l, {
    sens: 'achat', typeOrdre: 'limite', entree: 27287, stop: null, tp: null, taille: 6, risque: { montant: 100, unite: 'USD' },
    partiels: [{ prix: 27300, taille: 2 }, { prix: 27320 }], instrument: 'NQ1!', confiance: 1, remarque: 'ok',
  })
  const vide = normaliseLectureOrdre('pas un objet')
  assert.equal(lectureVide(vide), true)
  assert.equal(vide.confiance, 0)
  assert.equal(normaliseLectureOrdre({ sens: 'long', typeOrdre: 'market', risque: { montant: 150, unite: '%' } }).risque, null)
  assert.equal(normaliseLectureOrdre({ sens: 'long' }).sens, null)
  assert.equal(normaliseLectureOrdre({ entree: Number.POSITIVE_INFINITY }).entree, null)
})

const saisieVide = (): Saisie => ({
  entree: '', stop: '', tp: '', taille: '', sortie: '', risque: '', uniteRisque: 'USD', sens: null, typeOrdre: null, partiels: [],
})
const lecture = (champs: Partial<LectureOrdre> = {}): LectureOrdre => ({
  sens: 'vente', typeOrdre: null, entree: 7611.25, stop: 7674.75, tp: 7547.75, taille: 1, risque: { montant: 100, unite: 'USD' },
  partiels: [], instrument: 'ES1!', confiance: 0.9, remarque: null, ...champs,
})

test('fusion : une carte vide se remplit, chaque champ rempli est dit (pour le surligner)', () => {
  const r = fusionnerLecture(saisieVide(), lecture(), { ecrire })
  assert.deepEqual(r.remplis, ['sens', 'entree', 'stop', 'tp', 'taille', 'risque'])
  assert.deepEqual(r.conflits, [])
  assert.equal(r.saisie.entree, '7611,25')
  assert.equal(r.saisie.stop, '7674,75')
  assert.equal(r.saisie.sens, 'vente')
  assert.equal(r.saisie.risque, '100')
  assert.equal(r.saisie.uniteRisque, 'USD')
  assert.equal(r.saisie.sortie, '', 'un ticket d ordre ne dit jamais la sortie')
})

test('fusion : ce que le membre a tapé n est pas écrasé, sauf s il accepte', () => {
  const tape: Saisie = { ...saisieVide(), entree: '7611,25', stop: '7680', sens: 'achat', taille: '2', sortie: '7600', partiels: [{ prix: '7590', taille: '1' }] }
  const l = lecture({ partiels: [{ prix: 7580, taille: 1 }] })
  const r = fusionnerLecture(tape, l, { ecrire })
  // L'entrée tapée est la même : rien à dire. Stop, sens, taille, partiels différents : conflits.
  assert.deepEqual(r.remplis, ['tp', 'risque'])
  assert.deepEqual(r.conflits, ['sens', 'stop', 'taille', 'partiels'])
  assert.equal(r.saisie.stop, '7680')
  assert.equal(r.saisie.sens, 'achat')
  assert.equal(r.saisie.taille, '2')
  assert.equal(r.saisie.partiels[0].prix, '7590')
  assert.equal(tape.stop, '7680', 'la saisie d origine n est jamais modifiée')
  // Il accepte : les valeurs lues remplacent les siennes, la sortie reste.
  const ok = fusionnerLecture(tape, l, { ecrire, remplacer: true })
  assert.deepEqual(ok.conflits, [])
  assert.deepEqual(ok.remplis, ['sens', 'stop', 'tp', 'taille', 'risque', 'partiels'])
  assert.equal(ok.saisie.stop, '7674,75')
  assert.equal(ok.saisie.sens, 'vente')
  assert.equal(ok.saisie.sortie, '7600')
  assert.deepEqual(ok.saisie.partiels, [{ prix: '7580', taille: '1' }])
})

test('fusion : le risque compare montant ET unité ; un champ illisible compte comme tapé', () => {
  const pourcent: Saisie = { ...saisieVide(), risque: '100', uniteRisque: '%', entree: 'abc' }
  const r = fusionnerLecture(pourcent, lecture({ stop: null, tp: null, taille: null, sens: null }), { ecrire })
  assert.deepEqual(r.conflits, ['entree', 'risque'])
  assert.deepEqual(r.remplis, [])
  const meme = fusionnerLecture({ ...saisieVide(), risque: '100' }, lecture({ entree: null, stop: null, tp: null, taille: null, sens: null }), { ecrire })
  assert.deepEqual([meme.remplis, meme.conflits], [[], []])
})

test('capture envoyée : réduite comme la capture automatique quand elle est lourde, plus fort après un 413', () => {
  assert.equal(reductionAvantEnvoi({ longueurBase64: 200_000, type: 'image/png', essai: 0 }), null)
  assert.deepEqual(reductionAvantEnvoi({ longueurBase64: BASE64_A_REDUIRE + 1, type: 'image/png', essai: 0 }), { maxWidth: REDUCTION_CAPTURE.largeur, quality: REDUCTION_CAPTURE.qualite })
  assert.deepEqual(reductionAvantEnvoi({ longueurBase64: 10_000, type: 'image/bmp', essai: 0 }), { maxWidth: 1600, quality: 0.75 })
  assert.deepEqual(reductionAvantEnvoi({ longueurBase64: 10_000, type: 'image/jpeg', essai: 1 }), { maxWidth: 1200, quality: 0.6 })
})

test('nombres tapés : virgule ou point, espaces, vide ou illisible', () => {
  assert.equal(lireNombre(' 27 287,25 '), 27287.25)
  assert.equal(lireNombre(''), undefined)
  assert.equal(lireNombre('abc'), null)
  assert.equal(lireNombre('-3'), null)
})
