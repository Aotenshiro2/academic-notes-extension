// Le point d'attention avant la séance et le rappel du warmup (1.9.2).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculerPointAttention, warmupAttendUnPoint, rappelWarmupAMontrer, ajouterNoteVue,
  DUREE_SEANCE_MS, NOTE_NOUVELLE_MS,
} from '../src/lib/point-attention.ts'

const JOUR = 24 * 60 * 60 * 1000
const DEBUT = Date.UTC(2026, 10, 11, 8, 0)
const j = (grade: string, cause: string | undefined, ilYaJours: number, phrase = '') =>
  ({ grade, causeCategory: cause, createdAt: DEBUT - ilYaJours * JOUR, phrase }) as any

test('sous le seuil, rien ne s\'affiche', () => {
  assert.equal(calculerPointAttention([], DEBUT), null)
  assert.equal(calculerPointAttention([j('C', 'emotionnel', 1), j('C-', 'emotionnel', 2)], DEBUT), null)
})

test('3 jugements de la même cause en B− ou moins : la cause et la phrase la plus récente', () => {
  const r = calculerPointAttention([
    j('C', 'emotionnel', 9, 'Ancienne phrase'),
    j('B-', 'emotionnel', 1, 'Je suis rentré pour me refaire'),
    j('D', 'emotionnel', 4, 'Entre les deux'),
    j('C', 'technique', 2, 'Stop trop près'),
  ], DEBUT)
  assert.deepEqual(r, [{ cause: 'emotionnel', nombre: 3, phrase: 'Je suis rentré pour me refaire' }])
})

test('seuls B− et en dessous comptent : un A+ ou un B ne disent pas la même chose', () => {
  const hauts = ['A+', 'A', 'A-', 'B+', 'B'].map((g, i) => j(g, 'technique', i + 1, 'bien'))
  assert.equal(calculerPointAttention([...hauts, j('C', 'technique', 1), j('C', 'technique', 2)], DEBUT), null)
  assert.equal(calculerPointAttention([j('C+', 'technique', 1), j('D-', 'technique', 2), j('B-', 'technique', 3)], DEBUT)?.[0].nombre, 3)
})

test('la fenêtre : 14 jours avant le début de la séance, rien après', () => {
  const base = [j('C', 'connaissance', 1), j('C', 'connaissance', 2)]
  assert.equal(calculerPointAttention([...base, j('C', 'connaissance', 14)], DEBUT), null) // pile 14 jours : dehors
  assert.equal(calculerPointAttention([...base, j('C', 'connaissance', 13.9)], DEBUT)?.[0].cause, 'connaissance')
  assert.equal(calculerPointAttention([...base, j('C', 'connaissance', -0.1)], DEBUT), null) // posé pendant la séance
})

test('sans cause, ou cause inconnue : ignoré', () => {
  assert.equal(calculerPointAttention([j('C', undefined, 1), j('C', undefined, 2), j('C', undefined, 3)], DEBUT), null)
  assert.equal(calculerPointAttention([j('C', 'autre', 1), j('C', 'autre', 2), j('C', 'autre', 3)], DEBUT), null)
})

test('à égalité, toutes les causes à égalité, dans l\'ordre de la notation', () => {
  const r = calculerPointAttention([
    j('C', 'emotionnel', 1, 'Me refaire'), j('C', 'emotionnel', 2), j('C', 'emotionnel', 3),
    j('C-', 'technique', 1, 'Stop trop près'), j('C', 'technique', 5), j('B-', 'technique', 6),
    j('C', 'connaissance', 1), j('C', 'connaissance', 2),
  ], DEBUT)
  assert.deepEqual(r, [
    { cause: 'technique', nombre: 3, phrase: 'Stop trop près' },
    { cause: 'emotionnel', nombre: 3, phrase: 'Me refaire' },
  ])
})

test('la plus fréquente l\'emporte, même si une autre passe le seuil', () => {
  const r = calculerPointAttention([
    j('C', 'technique', 1), j('C', 'technique', 2), j('C', 'technique', 3), j('C', 'technique', 4),
    j('C', 'emotionnel', 1), j('C', 'emotionnel', 2), j('C', 'emotionnel', 3),
  ], DEBUT)
  assert.deepEqual(r?.map(c => [c.cause, c.nombre]), [['technique', 4]])
})

test('la phrase : celle du plus récent qui en a une ; vide si aucune', () => {
  const r = calculerPointAttention([j('C', 'technique', 1, '  '), j('C', 'technique', 2, 'Écrite'), j('C', 'technique', 3)], DEBUT)
  assert.equal(r?.[0].phrase, 'Écrite')
  assert.equal(calculerPointAttention([j('C', 'technique', 1), j('C', 'technique', 2), j('C', 'technique', 3)], DEBUT)?.[0].phrase, '')
})

test('le warmup de la séance en cours seulement, et une seule décision', () => {
  const w = { id: 'w1', startedAt: DEBUT }
  assert.equal(warmupAttendUnPoint(w, DEBUT + 60e3), true)
  assert.equal(warmupAttendUnPoint(w, DEBUT + DUREE_SEANCE_MS), false) // ancienne séance
  assert.equal(warmupAttendUnPoint({ startedAt: DEBUT }, DEBUT), false) // warmup legacy, sans id
  assert.equal(warmupAttendUnPoint({ ...w, attention: { fermeLe: DEBUT } }, DEBUT), false)
  assert.equal(warmupAttendUnPoint({ ...w, attention: { garde: { cause: 'technique', phrase: 'x', le: DEBUT } } }, DEBUT), false)
  assert.equal(warmupAttendUnPoint(undefined, DEBUT), false)
})

test('le rappel : nouvelle note sans warmup, pas déjà écarté, pas le mentorat', () => {
  const note = { id: 'n1', timestamp: DEBUT, title: 'Séance', tags: [] as string[] }
  assert.equal(rappelWarmupAMontrer(note, DEBUT + 60e3, []), true)
  assert.equal(rappelWarmupAMontrer(note, DEBUT + NOTE_NOUVELLE_MS, []), false) // plus nouvelle
  assert.equal(rappelWarmupAMontrer(note, DEBUT + 60e3, ['n1']), false) // fermé ou lancé ici
  assert.equal(rappelWarmupAMontrer({ ...note, warmups: [{ id: 'w', startedAt: DEBUT }] }, DEBUT, []), false)
  assert.equal(rappelWarmupAMontrer({ ...note, warmup: { objective: 'x' } }, DEBUT, []), false)
  assert.equal(rappelWarmupAMontrer({ ...note, title: 'Mentorat AOK', tags: ['mentorat'] }, DEBUT, []), false)
  assert.equal(rappelWarmupAMontrer(undefined, DEBUT, []), false)
})

test('les notes vues : sans doublon, bornées aux plus récentes', () => {
  assert.deepEqual(ajouterNoteVue(['a', 'b'], 'a'), ['b', 'a'])
  assert.deepEqual(ajouterNoteVue(['a', 'b', 'c'], 'd', 3), ['b', 'c', 'd'])
})
