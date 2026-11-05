import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recouvrements, sansLesFaitsDeja, nombreDeFaits } from '../src/lib/documents-doublons.ts'
import { normaliseLecture } from '../src/lib/documents-lecture.ts'

test('le CSV et le PDF du même rapport : le second est « même contenu que » le premier', () => {
  const r = recouvrements([
    { id: 'csv', nom: 'Performance.csv', empreintes: ['a', 'b', 'c'] },
    { id: 'pdf', nom: 'Performance.pdf', empreintes: ['a', 'b', 'c'] },
  ])
  assert.equal(r.get('csv')?.memeContenuQue, null)
  assert.deepEqual(r.get('pdf')?.memeContenuQue, { id: 'csv', nom: 'Performance.csv' })
})

test('le plus complet reste, même déposé après', () => {
  const r = recouvrements([
    { id: 'court', nom: 'Semaine.pdf', empreintes: ['a', 'b'] },
    { id: 'long', nom: 'Mois.csv', empreintes: ['a', 'b', 'c', 'd'] },
  ])
  assert.deepEqual(r.get('court')?.memeContenuQue, { id: 'long', nom: 'Mois.csv' })
  assert.equal(r.get('long')?.memeContenuQue, null)
})

test('recouvrement partiel : « 2 déjà dans » le premier, le reste se range', () => {
  const r = recouvrements([
    { id: 'lundi', nom: 'Lundi.csv', empreintes: ['a', 'b', 'c'] },
    { id: 'mardi', nom: 'LundiMardi.csv', empreintes: ['b', 'c', 'd', 'e'] },
  ])
  const mardi = r.get('mardi')!
  assert.equal(mardi.memeContenuQue, null)
  assert.deepEqual([...mardi.deja], ['b', 'c'])
  assert.deepEqual(mardi.dejaDans, ['Lundi.csv'])
})

test('sans empreintes : ni doublon ni recouvrement', () => {
  const r = recouvrements([{ id: 'x', nom: 'x.png', empreintes: [] }, { id: 'y', nom: 'y.png', empreintes: [] }])
  assert.equal(r.get('x')?.memeContenuQue, null)
  assert.equal(r.get('y')?.deja.size, 0)
})

const trade = (i: number) => ({ source: 's', idExterne: `f${i}`, compte: null, symbole: 'NQZ5', direction: 'long', quantite: 1, prixEntree: 1, prixSortie: 2, entreLe: `2026-10-28T09:4${i}:00Z`, sortiLe: null, pnl: 5, devise: 'USD', frais: null, dureeSec: null })

test('sansLesFaitsDeja : retire les trades déjà portés, garde le reste', () => {
  const l = normaliseLecture({ type: 'trades', methode: 'csv', confiance: 1, empreintes: ['a', 'b', 'c'], trades: [trade(0), trade(1), trade(2)] })
  assert.equal(nombreDeFaits(l), 3)
  const reste = sansLesFaitsDeja(l, new Set(['a', 'c']))
  assert.deepEqual(reste.trades?.map(t => t.idExterne), ['f1'])
  assert.deepEqual(reste.empreintes, ['b'])
  // Empreintes mal alignées : la lecture reste entière.
  const mal = normaliseLecture({ type: 'trades', methode: 'csv', confiance: 1, empreintes: ['a'], trades: [trade(0), trade(1)] })
  assert.equal(sansLesFaitsDeja(mal, new Set(['a'])), mal)
})
