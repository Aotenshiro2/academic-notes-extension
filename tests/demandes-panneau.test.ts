// Le menu du clic droit confie son geste au panneau (1.9.1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  demandeValide, cleDemande, selectionEnHtml, ligneSource, DUREE_DEMANDE_MS,
} from '../src/lib/demandes-panneau.ts'

const base = { tabId: 7, windowId: 3, at: 1_000_000 }

test('une demande fraîche de la bonne fenêtre passe', () => {
  assert.deepEqual(
    demandeValide({ type: 'capture-intelligente', ...base }, base.at + 500, 3),
    { type: 'capture-intelligente', ...base },
  )
  assert.deepEqual(
    demandeValide({ type: 'capture-ecran', ...base }, base.at, null),
    { type: 'capture-ecran', ...base },
  )
})

test('une demande trop vieille, du futur ou d\'une autre fenêtre est ignorée', () => {
  assert.equal(demandeValide({ type: 'capture-ecran', ...base }, base.at + DUREE_DEMANDE_MS + 1, 3), null)
  assert.equal(demandeValide({ type: 'capture-ecran', ...base }, base.at - 1, 3), null)
  assert.equal(demandeValide({ type: 'capture-ecran', ...base }, base.at, 4), null)
})

test('une forme inattendue est ignorée', () => {
  assert.equal(demandeValide(null, base.at, 3), null)
  assert.equal(demandeValide('capture', base.at, 3), null)
  assert.equal(demandeValide({ type: 'supprimer-tout', ...base }, base.at, 3), null)
  assert.equal(demandeValide({ type: 'capture-ecran', tabId: '7', windowId: 3, at: base.at }, base.at, 3), null)
  assert.equal(demandeValide({ type: 'selection', ...base, texte: '   ' }, base.at, 3), null)
})

test('la sélection garde son texte, sa page et son titre', () => {
  const d = demandeValide({ type: 'selection', ...base, texte: 'Le FVG tient', url: 'https://ex.com/a', titre: 'Cours' }, base.at, 3)
  assert.deepEqual(d, { type: 'selection', ...base, texte: 'Le FVG tient', url: 'https://ex.com/a', titre: 'Cours' })
  const sansPage = demandeValide({ type: 'selection', ...base, texte: 'x' }, base.at, 3)
  assert.equal(sansPage && sansPage.type === 'selection' && sansPage.url, '')
})

test('une même demande a toujours la même clé, deux clics deux clés', () => {
  const a = { type: 'capture-ecran' as const, ...base }
  assert.equal(cleDemande(a), cleDemande({ ...a }))
  assert.notEqual(cleDemande(a), cleDemande({ ...a, at: base.at + 1 }))
})

test('la sélection devient du HTML sûr, un paragraphe par bloc', () => {
  assert.equal(selectionEnHtml('Un\nDeux\n\nTrois'), '<p>Un<br>Deux</p><p>Trois</p>')
  assert.equal(selectionEnHtml('<img src=x onerror=alert(1)> & "ok"'), '<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;ok&quot;</p>')
  assert.equal(selectionEnHtml('\r\n  a  \r\n\r\n\r\n b '), '<p>a</p><p>b</p>')
  assert.equal(selectionEnHtml('   '), '')
})

test('la ligne de source : titre et adresse, ou l\'un des deux', () => {
  assert.equal(ligneSource('Cours', 'https://ex.com', '11/11'), '📅 11/11 • 🌐 Cours (https://ex.com)')
  assert.equal(ligneSource('', 'https://ex.com', '11/11'), '📅 11/11 • 🌐 https://ex.com')
  assert.equal(ligneSource('Cours', '', '11/11'), '📅 11/11 • 🌐 Cours')
})
