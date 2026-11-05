// Le fuseau du membre : Paris (UTC+1 en novembre, UTC+2 l'été). Posé avant
// toute date ; Node relit TZ à la volée.
process.env.TZ = 'Europe/Paris'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bornesJours, dansLesJours, instantPosition, jourPosition, regrouperCopies, filtrerParInstrument,
  trierParEcart, ecartMinutes, nomCompteDePosition, resumeBroker, type PositionImportee,
} from '../src/lib/positions-jour.ts'
import type { CompteConnu } from '../src/lib/pilotage-comptes.ts'

const pos = (champs: Partial<PositionImportee> & { positionId: string; entreLe: string }): PositionImportee => ({
  compteId: null, compte: null, symbole: 'NQZ5', direction: 'long', devise: 'USD', sortiLe: null, quantite: 2, pnl: 100,
  prixEntree: 20100, prixSortie: 20131, stopPrix: null, executions: 2, segmentRef: null, fuseau: 'Europe/Paris', ...champs,
})

// Trade du mardi 28/10/2026 à 09:40, heure de Paris (UTC+1 depuis le 25/10).
const t0 = new Date(2026, 9, 28, 9, 40).getTime()

test('bornes : le jour local ET le jour « tel qu affiché » (UTC)', () => {
  const { depuis, jusqu } = bornesJours(t0)
  assert.equal(new Date(depuis).toISOString(), '2026-10-27T23:00:00.000Z') // minuit à Paris
  assert.equal(new Date(jusqu).toISOString(), '2026-10-29T00:00:00.000Z') // minuit UTC du lendemain
  const large = bornesJours(t0, 3)
  assert.equal(new Date(large.depuis).toISOString(), '2026-10-24T22:00:00.000Z') // le 25 à minuit, encore à l'heure d'été
  assert.equal(new Date(large.jusqu).toISOString(), '2026-11-01T00:00:00.000Z')
})

test('jour et instant : avec fuseau, l instant écrit ; sans, l heure affichée', () => {
  const avec = pos({ positionId: 'a', entreLe: '2026-10-28T08:40:30Z', fuseau: 'Europe/Paris' })
  const sans = pos({ positionId: 's', entreLe: '2026-10-28T09:40:30Z', fuseau: null })
  assert.equal(instantPosition(avec), instantPosition(sans))
  assert.equal(jourPosition(sans), '2026-10-28')
  // 23:30 affichées le 28 : stockées 23:30Z, c'est bien le 28 (et pas le 29 de Paris).
  assert.equal(jourPosition(pos({ positionId: 'tard', entreLe: '2026-10-28T23:30:00Z', fuseau: null })), '2026-10-28')
  // Le même instant AVEC fuseau tombe le 29 à Paris.
  assert.equal(jourPosition(pos({ positionId: 'tard2', entreLe: '2026-10-28T23:30:00Z' })), '2026-10-29')
  assert.ok(dansLesJours(sans, t0))
  assert.ok(!dansLesJours(pos({ positionId: 'veille', entreLe: '2026-10-27T22:00:00Z', fuseau: null }), t0))
  assert.ok(dansLesJours(pos({ positionId: 'veille', entreLe: '2026-10-27T22:00:00Z', fuseau: null }), t0, 3))
  assert.equal(ecartMinutes(sans, t0), 1)
})

test('copies : même famille, même sens, 60 s près, comptes différents', () => {
  const liste = [
    pos({ positionId: 'a', compteId: 'a2', entreLe: '2026-10-28T08:40:40Z' }),
    pos({ positionId: 'b', compteId: 'a3', symbole: 'MNQZ5', entreLe: '2026-10-28T08:40:44Z' }),
    pos({ positionId: 'c', compte: 'APEX-123456-0004', entreLe: '2026-10-28T08:41:30Z' }),
    // Même compte que a : une autre entrée, pas une copie.
    pos({ positionId: 'd', compteId: 'a2', entreLe: '2026-10-28T08:40:50Z' }),
    // Sens contraire.
    pos({ positionId: 'e', compteId: 'a4', direction: 'short', entreLe: '2026-10-28T08:40:41Z' }),
    // Plus d'une minute après la première.
    pos({ positionId: 'f', compteId: 'a5', entreLe: '2026-10-28T08:42:00Z' }),
    // Autre instrument.
    pos({ positionId: 'g', compteId: 'a6', symbole: 'ESZ5', entreLe: '2026-10-28T08:40:42Z' }),
  ]
  const groupes = regrouperCopies(liste).map(g => g.map(p => p.positionId))
  assert.deepEqual(groupes, [['a', 'b', 'c'], ['e'], ['g'], ['d'], ['f']])
})

test('instrument : le reste du jour compté et masqué, une copie compte pour un trade', () => {
  const liste = [
    pos({ positionId: 'a', compteId: 'a2', entreLe: '2026-10-28T08:40:40Z' }),
    pos({ positionId: 'es1', compteId: 'a2', symbole: 'ESZ5', entreLe: '2026-10-28T08:00:00Z' }),
    pos({ positionId: 'es2', compteId: 'a3', symbole: 'MESZ5', entreLe: '2026-10-28T08:00:10Z' }),
    pos({ positionId: 'cl', compteId: 'a2', symbole: 'CLZ5', entreLe: '2026-10-28T13:00:00Z' }),
  ]
  const { gardees, masques } = filtrerParInstrument(liste, 'NQ')
  assert.deepEqual(gardees.map(p => p.positionId), ['a'])
  assert.deepEqual(masques, [{ famille: 'CL', n: 1 }, { famille: 'ES', n: 1 }])
  assert.equal(filtrerParInstrument(liste, '').gardees.length, 4)
  assert.equal(filtrerParInstrument(liste, null).masques.length, 0)
})

test("tri par écart à l'heure du trade", () => {
  const loin = [pos({ positionId: 'loin', entreLe: '2026-10-28T10:15:00Z' })]
  const pres = [pos({ positionId: 'pres', entreLe: '2026-10-28T08:41:00Z' })]
  const avant = [pos({ positionId: 'avant', entreLe: '2026-10-28T08:00:00Z' })]
  assert.deepEqual(trierParEcart([loin, avant, pres], t0).map(g => g[0].positionId), ['pres', 'avant', 'loin'])
})

test('nom du compte : Pilotage, sinon le numéro du fichier abrégé', () => {
  const comptes: CompteConnu[] = [{ id: 'a2', nom: 'APEX-123456-0002', kind: 'prop', firmName: 'Apex', brokerName: '', identifiants: [], actif: true }]
  assert.equal(nomCompteDePosition({ compteId: 'a2', compte: 'x' }, comptes), 'Apex ...0002')
  assert.equal(nomCompteDePosition({ compteId: 'inconnu', compte: 'APEX-123456-0003' }, comptes), '...0003')
  assert.equal(nomCompteDePosition({ compteId: null, compte: null }, comptes), null)
})

test('colonne broker : la première position, la taille d un compte, le nombre de comptes', () => {
  const lies = [
    pos({ positionId: 'b', compteId: 'a3', entreLe: '2026-10-28T08:40:44Z', prixEntree: 20100.5, quantite: 2 }),
    pos({ positionId: 'a', compteId: 'a2', entreLe: '2026-10-28T08:40:40Z', prixEntree: 20100.25, stopPrix: 20080, quantite: 2, executions: 4 }),
    pos({ positionId: 'c', compteId: 'a4', entreLe: '2026-10-28T08:40:47Z', prixEntree: 20100.5, quantite: 2 }),
  ]
  assert.deepEqual(resumeBroker(lies), { entree: 20100.25, sortie: 20131, stop: 20080, taille: 2, comptes: 3, executions: 4 })
  assert.equal(resumeBroker([]), null)
})
