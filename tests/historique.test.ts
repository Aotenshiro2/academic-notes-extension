// L'Historique des notes (1.8.15, option A de Brice) : le même contenu dans
// le tiroir du panneau et la barre latérale du plein écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TAGS_VISIBLES, dossiersRacines, estATrier, filtrerNotes, filtresActifs, nouveauDossier, porteLeTag, sousDossiers, tagsParUsage,
} from '../src/lib/historique.ts'

const note = (id: string, champs: Partial<{ title: string; tags: string[]; messageTags: string[]; searchText: string; annotationCount: number; folderId: string }> = {}) => ({
  id, title: id, tags: [], messageTags: [], searchText: '', annotationCount: 0, ...champs,
})

const AUCUN = { recherche: '', tag: null, aTrierSeulement: false }

test('« à trier » : ni tag ni jugement', () => {
  assert.equal(estATrier(note('a')), true)
  assert.equal(estATrier(note('b', { tags: ['NQ'] })), false)
  assert.equal(estATrier(note('c', { annotationCount: 1 })), false)
})

test('tag : sur la note ou sur un de ses blocs', () => {
  assert.equal(porteLeTag(note('a', { messageTags: ['FVG'] }), 'FVG'), true)
  assert.equal(porteLeTag(note('a', { tags: ['FVG'] }), 'FVG'), true)
  assert.equal(porteLeTag(note('a'), 'FVG'), false)
})

test('recherche : titre, tags, tags des blocs et texte, sans casse ni espaces autour', () => {
  const notes = [
    note('Séance NQ'),
    note('b', { tags: ['Killzone'] }),
    note('c', { messageTags: ['killzone-londres'] }),
    note('d', { searchText: 'le prix revient dans la killzone' }),
    note('e'),
  ]
  assert.deepEqual(filtrerNotes(notes, { ...AUCUN, recherche: '  KILLZONE ' }).map(n => n.id), ['b', 'c', 'd'])
  assert.deepEqual(filtrerNotes(notes, { ...AUCUN, recherche: 'séance' }).map(n => n.id), ['Séance NQ'])
})

test('filtres cumulés : recherche, tag et « à trier »', () => {
  const notes = [note('a', { tags: ['NQ'] }), note('b', { messageTags: ['NQ'] }), note('c')]
  assert.deepEqual(filtrerNotes(notes, { ...AUCUN, tag: 'NQ' }).map(n => n.id), ['a', 'b'])
  assert.deepEqual(filtrerNotes(notes, { ...AUCUN, aTrierSeulement: true }).map(n => n.id), ['b', 'c'])
  assert.deepEqual(filtrerNotes(notes, { recherche: 'b', tag: 'NQ', aTrierSeulement: true }).map(n => n.id), ['b'])
  assert.equal(filtresActifs(AUCUN), false)
  assert.equal(filtresActifs({ ...AUCUN, recherche: '   ' }), false)
  assert.equal(filtresActifs({ ...AUCUN, tag: 'NQ' }), true)
})

test('tags : du plus utilisé au moins utilisé, une fois par note', () => {
  const notes = [
    note('a', { tags: ['NQ', 'FVG'], messageTags: ['NQ'] }),
    note('b', { tags: ['NQ'] }),
    note('c', { messageTags: ['OB'] }),
  ]
  const tags = tagsParUsage(notes)
  assert.equal(tags[0], 'NQ')
  assert.deepEqual([...tags].sort(), ['FVG', 'NQ', 'OB'])
  assert.equal(TAGS_VISIBLES, 6)
})

test('dossiers : racines et sous-dossiers d\'un niveau', () => {
  const dossiers = [
    { id: 'r1', name: 'Séances', createdAt: 1 },
    { id: 's1', name: 'Londres', createdAt: 2, parentId: 'r1' },
    { id: 'r2', name: 'Masterclass', createdAt: 3 },
  ]
  assert.deepEqual(dossiersRacines(dossiers).map(d => d.id), ['r1', 'r2'])
  assert.deepEqual(sousDossiers(dossiers, 'r1').map(d => d.id), ['s1'])
  assert.deepEqual(sousDossiers(dossiers, 'r2'), [])
})

test('nouveau dossier : nom nettoyé, parent seulement pour un sous-dossier, rien sans nom', () => {
  assert.deepEqual(nouveauDossier('  Séances  ', 'd1', 7), { id: 'd1', name: 'Séances', createdAt: 7 })
  assert.deepEqual(nouveauDossier('Londres', 'd2', 8, 'd1'), { id: 'd2', name: 'Londres', createdAt: 8, parentId: 'd1' })
  assert.equal(nouveauDossier('   ', 'd3', 9), null)
})

test('le tiroir du panneau et la barre du plein écran rendent le même Historique, qui seul écrit les dossiers', () => {
  const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
  assert.ok(lire('src/components/HistoryDropdown.tsx').includes('<HistoriqueNotes'), 'le tiroir ne passe pas par HistoriqueNotes')
  const pleinEcran = lire('src/fullscreen/FullscreenApp.tsx')
  assert.ok(pleinEcran.includes('<HistoriqueNotes'), 'la barre du plein écran ne passe pas par HistoriqueNotes')
  assert.ok(!pleinEcran.includes('activeFolderId'), 'les pastilles de dossiers du plein écran sont encore là')
  for (const chemin of ['src/sidepanel/App.tsx', 'src/fullscreen/FullscreenApp.tsx', 'src/components/HistoryDropdown.tsx']) {
    const source = lire(chemin)
    for (const geste of ['saveFolder(', 'deleteFolder(', 'moveNoteToFolder(']) {
      assert.ok(!source.includes(geste), `${chemin} écrit encore les dossiers (${geste})`)
    }
  }
  const historique = lire('src/components/HistoriqueNotes.tsx')
  for (const geste of ['saveFolder(', 'deleteFolder(', 'moveNoteToFolder(', 'draggable', 'onDrop']) {
    assert.ok(historique.includes(geste), `HistoriqueNotes ne sait plus faire ${geste}`)
  }
})
