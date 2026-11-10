// Le fuseau du membre : Paris (UTC+1 en novembre). Posé avant toute date.
process.env.TZ = 'Europe/Paris'

// Le lien d'un trade de la note avec un trade importé de Pilotage (1.8.16) :
// la fenêtre de lecture des liens d'une note, les liens d'un trade, la liste
// des candidats (jour, instrument, sens, heure la plus proche), le R du broker ;
// et le R tapé dans « Prix » (lireR, rAEnregistrer).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bornesDesTrades, candidatsALier, complementPastillePrix, liesAuTrade, rDuBroker, ECART_LIENS, LISTE_COURTE } from '../src/lib/lien-trade.ts'
import { bornesJours, type PositionImportee } from '../src/lib/positions-jour.ts'
import { lireR, rAEnregistrer, rDuPrix, R_MAX } from '../src/lib/prix-trade.ts'

const pos = (champs: Partial<PositionImportee> & { positionId: string; entreLe: string }): PositionImportee => ({
  compteId: 'c1', compte: null, symbole: 'NQZ6', direction: 'long', devise: 'USD', sortiLe: null, quantite: 2, pnl: 100,
  prixEntree: 21450, prixSortie: 21480, stopPrix: null, executions: 2, segmentRef: null, fuseau: 'Europe/Paris', ...champs,
})

// Le trade 2 de Cédric : mardi 10/11/2026 à 15:14, heure de Paris.
const t0 = new Date(2026, 10, 10, 15, 14).getTime()

test('fenêtre des liens : les jours des trades CLOS de la note, 3 jours de chaque côté, une seule requête', () => {
  assert.equal(bornesDesTrades([]), null)
  assert.equal(bornesDesTrades(undefined), null)
  // Un trade en cours n'a pas d'icône lien : rien à lire.
  assert.equal(bornesDesTrades([{ startedAt: t0 }]), null)
  const veille = new Date(2026, 10, 9, 22, 0).getTime()
  const b = bornesDesTrades([{ startedAt: t0, closedAt: t0 + 6e5 }, { startedAt: veille, closedAt: veille + 6e5 }, { startedAt: t0 + 864e5 * 9 }])!
  assert.equal(b.depuis, bornesJours(veille, ECART_LIENS).depuis)
  assert.equal(b.jusqu, bornesJours(t0, ECART_LIENS).jusqu)
  assert.equal(new Date(b.depuis).toISOString(), '2026-11-05T23:00:00.000Z') // le 6 à minuit, Paris
  assert.equal(new Date(b.jusqu).toISOString(), '2026-11-14T00:00:00.000Z') // le 14 à minuit UTC (heure « telle qu'affichée »)
})

test('liens d un trade : ses positions (copies comprises), de la plus ancienne à la plus récente', () => {
  const liste = [
    pos({ positionId: 'b', compteId: 'c2', entreLe: '2026-11-10T14:14:40Z', segmentRef: 't2' }),
    pos({ positionId: 'a', compteId: 'c1', entreLe: '2026-11-10T14:14:20Z', segmentRef: 't2' }),
    pos({ positionId: 'x', entreLe: '2026-11-10T14:30:00Z', segmentRef: 't3' }),
    pos({ positionId: 'libre', entreLe: '2026-11-10T14:40:00Z' }),
  ]
  assert.deepEqual(liesAuTrade(liste, 't2').map(p => p.positionId), ['a', 'b'])
  assert.deepEqual(liesAuTrade(liste, 'tX'), [])
  assert.deepEqual(liesAuTrade(null, 't2'), [])
})

test('candidats : libres, du jour du trade, même instrument, le sens du trade devant puis l heure la plus proche', () => {
  const liste = [
    pos({ positionId: 'loin', entreLe: '2026-11-10T09:00:00Z' }),
    pos({ positionId: 'proche', entreLe: '2026-11-10T14:16:00Z' }),
    pos({ positionId: 'short', direction: 'short', entreLe: '2026-11-10T14:14:30Z' }),
    pos({ positionId: 'es', symbole: 'ESZ6', entreLe: '2026-11-10T14:14:00Z' }),
    pos({ positionId: 'deja', entreLe: '2026-11-10T14:14:10Z', segmentRef: 'autre' }),
    pos({ positionId: 'lendemain', entreLe: '2026-11-11T14:14:00Z' }),
    // Une copie de « proche » sur un autre compte : une seule ligne.
    pos({ positionId: 'proche-copie', compteId: 'c2', entreLe: '2026-11-10T14:16:20Z' }),
  ]
  const jour = candidatsALier(liste, { startedAt: t0, instrument: 'NQ', sens: null, portee: 0 })
  assert.deepEqual(jour.groupes.map(g => g.map(p => p.positionId)), [['short'], ['proche', 'proche-copie'], ['loin']])
  assert.deepEqual(jour.masques, [{ famille: 'ES', n: 1 }])
  // Le sens choisi (achat) passe devant, l'autre sens reste montré.
  const achat = candidatsALier(liste, { startedAt: t0, instrument: 'NQ', sens: 'achat', portee: 0 })
  assert.deepEqual(achat.groupes.map(g => g[0].positionId), ['proche', 'loin', 'short'])
  // Trois jours autour : le lendemain entre.
  const autour = candidatsALier(liste, { startedAt: t0, instrument: 'NQ', sens: null, portee: 3 })
  assert.ok(autour.groupes.some(g => g[0].positionId === 'lendemain'))
  // Sans instrument : tout passe, rien n'est masqué.
  assert.equal(candidatsALier(liste, { startedAt: t0, instrument: null, sens: null, portee: 0 }).masques.length, 0)
  assert.ok(LISTE_COURTE >= 3)
})

test('R du broker : seulement quand son export donne le stop et le sens', () => {
  assert.equal(rDuBroker([]), null)
  assert.equal(rDuBroker([pos({ positionId: 'a', entreLe: '2026-11-10T14:14:00Z' })]), null) // pas de stop
  const avecStop = pos({ positionId: 'a', entreLe: '2026-11-10T14:14:00Z', prixEntree: 21450, prixSortie: 21480, stopPrix: 21435 })
  assert.equal(rDuBroker([avecStop]), 2)
  const short = pos({ positionId: 's', direction: 'short', entreLe: '2026-11-10T14:14:00Z', prixEntree: 21450, prixSortie: 21480, stopPrix: 21465 })
  assert.equal(rDuBroker([short]), -2)
  assert.equal(rDuBroker([{ ...avecStop, direction: null }]), null)
})

test('R tapé : signé, virgule ou point, le vrai signe moins, « R » final toléré', () => {
  assert.equal(lireR(''), undefined)
  assert.equal(lireR('  '), undefined)
  assert.equal(lireR('+1,5'), 1.5)
  assert.equal(lireR('-1'), -1)
  assert.equal(lireR('−0,5'), -0.5)
  assert.equal(lireR('2 R'), 2)
  assert.equal(lireR('0'), 0)
  assert.equal(lireR('deux'), null)
  assert.equal(lireR('1,2,3'), null)
})

test('R enregistré : le tapé prime, le champ vide garde le calcul des prix, rien sinon', () => {
  assert.deepEqual(rAEnregistrer(1.5, 2), { r: 1.5, invalide: false })
  assert.deepEqual(rAEnregistrer(undefined, 2), { r: 2, invalide: false })
  assert.deepEqual(rAEnregistrer(undefined, null), { r: undefined, invalide: false })
  assert.deepEqual(rAEnregistrer(0, 2), { r: 0, invalide: false })
  assert.deepEqual(rAEnregistrer(-0, null), { r: 0, invalide: false })
  assert.deepEqual(rAEnregistrer(null, 2), { r: undefined, invalide: true })
  assert.deepEqual(rAEnregistrer(R_MAX + 1, null), { r: undefined, invalide: true })
  assert.deepEqual(rAEnregistrer(-R_MAX, null), { r: -R_MAX, invalide: false })
  // Le calcul vient de la carte : achat 21 450, stop 21 435, sortie 21 480 = +2 R.
  assert.equal(rAEnregistrer(undefined, rDuPrix({ entree: 21450, stop: 21435, sortie: 21480 })).r, 2)
})

// 1.8.17 (Cédric, 10/11 : « il y a pas le prix d'entrée ») : la pastille
// « Prix » garde le R quand il est connu, sinon montre l'entrée.
test("pastille Prix : le R d'abord, sinon l'entrée tapée, sinon celle du broker lié", () => {
  const lie = pos({ positionId: 'p1', entreLe: '2026-11-10T14:14:00Z', segmentRef: 't2' })
  assert.deepEqual(complementPastillePrix(2, 21400, [lie]), { r: 2 })
  assert.deepEqual(complementPastillePrix(undefined, 21400, [lie]), { entree: 21400 })
  assert.deepEqual(complementPastillePrix(undefined, undefined, [lie]), { entree: 21450 })
  assert.deepEqual(complementPastillePrix(undefined, undefined, [pos({ positionId: 'p2', entreLe: '2026-11-10T14:14:00Z', prixEntree: null })]), null)
  assert.equal(complementPastillePrix(undefined, undefined, []), null)
})
