// Rangée d'outils de la note (1.8.15) : les règles pures partagées par le
// panneau latéral et le plein écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocEtude, contenuAEtudier, noteAvecDol, noteAvecWarmup, noteEnrichieParEtude } from '../src/lib/outils-note.ts'
import type { AcademicNote } from '../src/types/academic.ts'

const note = (champs: Partial<AcademicNote> = {}): AcademicNote => ({
  id: 'n1', title: 'Séance', content: '', url: 'https://example.com', timestamp: 1, type: 'manual',
  tags: ['manuel'], concepts: ['FVG'], screenshots: [], metadata: { domain: '', title: 'Séance', language: 'fr' },
  ...champs,
} as AcademicNote)

test('poser un DOL : ajouté actif, les autres niveaux restent', () => {
  const avant = note({ dols: [{ id: 'd0', price: '100', bias: 'haussier', status: 'atteint', createdAt: 0 }] as AcademicNote['dols'] })
  const apres = noteAvecDol(avant, { price: '120', bias: 'baissier' } as never, 'd1', 42)
  assert.equal(apres.dols?.length, 2)
  assert.deepEqual(apres.dols?.[0], avant.dols?.[0])
  assert.equal(apres.dols?.[1].id, 'd1')
  assert.equal(apres.dols?.[1].status, 'actif')
  assert.equal(apres.dols?.[1].createdAt, 42)
  assert.equal(avant.dols?.length, 1, 'la note de départ n\'est pas modifiée')
})

test('lancer un warmup : ajouté au fil au moment du clic', () => {
  const apres = noteAvecWarmup(note(), 'w1', 7)
  assert.deepEqual(apres.warmups, [{ id: 'w1', startedAt: 7, doneAt: 7 }])
  const encore = noteAvecWarmup(apres, 'w2', 8)
  assert.equal(encore.warmups?.length, 2)
})

test('bloc d\'étude : même HTML qu\'avant la 1.8.15', () => {
  assert.equal(
    blocEtude({ resume: 'R', pointsCles: ['a', 'b'], pourToi: 'P' }),
    '<hr><p><strong>Étude de la note</strong></p><p><em>R</em></p><p><strong>Ce qu’il faut en retenir :</strong></p><ul><li>a</li><li>b</li></ul><p><strong>Pour toi :</strong> P</p>'
  )
  assert.equal(blocEtude({}), '<hr><p><strong>Étude de la note</strong></p>')
})

test('étude : concepts et tags ajoutés sans écraser ceux de l\'élève, bornés', () => {
  assert.equal(noteEnrichieParEtude(note(), {}), null)
  const n = noteEnrichieParEtude(note(), { concepts: ['FVG', 'OB'], tags: ['ict'] })
  assert.deepEqual(n?.concepts, ['FVG', 'OB'])
  assert.deepEqual(n?.tags, ['manuel', 'ict'])
  const beaucoup = Array.from({ length: 20 }, (_, i) => `c${i}`)
  assert.equal(noteEnrichieParEtude(note(), { concepts: beaucoup, tags: beaucoup })?.concepts?.length, 12)
  assert.equal(noteEnrichieParEtude(note(), { concepts: beaucoup, tags: beaucoup })?.tags?.length, 10)
})

test('étude : l\'enrichissement garde le fil de la note (le bloc d\'étude posé juste avant)', () => {
  const avecBloc = note({ messages: [{ id: 'm1', type: 'text', content: blocEtude({ resume: 'R' }), timestamp: 2 }] as AcademicNote['messages'] })
  const n = noteEnrichieParEtude(avecBloc, { tags: ['ict'] })
  assert.equal(n?.messages?.length, 1)
})

test('contenu à étudier : le contenu, sinon les blocs texte du fil', () => {
  assert.equal(contenuAEtudier(note({ content: 'brut' })), 'brut')
  const fil = note({ messages: [
    { id: 'a', type: 'text', content: 'un', timestamp: 1 },
    { id: 'b', type: 'image', content: 'data:', timestamp: 2 },
    { id: 'c', type: 'text', content: 'deux', timestamp: 3 },
  ] as AcademicNote['messages'] })
  assert.equal(contenuAEtudier(fil), 'un\ndeux')
  assert.equal(contenuAEtudier(note()), '')
})
