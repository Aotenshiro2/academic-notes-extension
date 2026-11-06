// Le trade de la note (1.8.15), partagé par le panneau et le plein écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lancerTrade, noteDeSeance, noteQuittee, type DependancesTrade } from '../src/lib/trade-note.ts'
import type { AcademicNote } from '../src/types/academic.ts'

function faux(tradeId: string | null = 't1') {
  const journal: string[] = []
  const notes: AcademicNote[] = []
  const dep: DependancesTrade = {
    maintenant: () => Date.UTC(2026, 10, 6, 9, 30),
    enregistrerNote: async (n) => { notes.push(n); journal.push('note ' + n.id) },
    demarrerTrade: async (id) => { journal.push('trade ' + id); return tradeId },
    capturerAuLancement: (id, t) => { journal.push('capture ' + id + ' ' + t) },
  }
  return { dep, journal, notes }
}

test('note ouverte : le trade démarre dedans, sans créer de note, et le graphique est capturé', async () => {
  const { dep, journal, notes } = faux()
  const r = await lancerTrade('n1', dep)
  assert.deepEqual(r, { noteId: 'n1', creee: false, tradeId: 't1' })
  assert.equal(notes.length, 0)
  assert.deepEqual(journal, ['trade n1', 'capture n1 t1'])
})

test('aucune note : une note de séance est créée, puis le trade y démarre', async () => {
  const { dep, journal, notes } = faux()
  const r = await lancerTrade(null, dep)
  const id = String(dep.maintenant())
  assert.deepEqual(r, { noteId: id, creee: true, tradeId: 't1' })
  assert.equal(notes[0].title, 'Séance du 06/11')
  assert.equal(notes[0].type, 'manual')
  assert.deepEqual(journal, ['note ' + id, 'trade ' + id, 'capture ' + id + ' t1'])
})

test('trade refusé (note introuvable) : pas de capture', async () => {
  const { dep, journal } = faux(null)
  await lancerTrade('n1', dep)
  assert.deepEqual(journal, ['trade n1'])
})

test('la capture part sans être attendue', async () => {
  const { dep } = faux()
  let fini = false
  dep.capturerAuLancement = () => { void new Promise(r => setTimeout(r, 50)).then(() => { fini = true }) }
  await lancerTrade('n1', dep)
  assert.equal(fini, false)
})

test('note quittée : le trade actif de l\'ancienne note se clôt, pas celui de la même note', () => {
  assert.equal(noteQuittee('a', 'b'), 'a')
  assert.equal(noteQuittee('a', null), 'a')
  assert.equal(noteQuittee('a', 'a'), null)
  assert.equal(noteQuittee(null, 'b'), null)
})

test('note de séance : titre et métadonnées du jour', () => {
  const n = noteDeSeance('42', Date.UTC(2026, 0, 2, 12))
  assert.equal(n.id, '42')
  assert.equal(n.title, 'Séance du 02/01')
  assert.equal(n.metadata.title, 'Séance du 02/01')
  assert.deepEqual(n.tags, [])
})
