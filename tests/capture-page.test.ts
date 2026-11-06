// « Capturer cette page » (1.8.15) : la même note dans le panneau et le plein écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domaineDe, noteDeLaPage } from '../src/lib/capture-page.ts'

test('domaine : sans « www. », vide si l\'adresse ne se lit pas', () => {
  assert.equal(domaineDe('https://www.tradingview.com/chart/abc'), 'tradingview.com')
  assert.equal(domaineDe('https://fr.tradingview.com/'), 'fr.tradingview.com')
  assert.equal(domaineDe('pas une adresse'), '')
  assert.equal(domaineDe(undefined), '')
})

test('la note de la page : titre, adresse et capture, comme avant la 1.8.15', () => {
  const onglet = { url: 'https://www.example.com/a', title: 'Ma page', favIconUrl: 'https://www.example.com/f.ico' }
  const note = noteDeLaPage(onglet, 'data:image/jpeg;base64,AAA', '42', 42)
  assert.equal(note.id, '42')
  assert.equal(note.timestamp, 42)
  assert.equal(note.title, 'Ma page')
  assert.equal(note.url, onglet.url)
  assert.equal(note.favicon, onglet.favIconUrl)
  assert.equal(note.type, 'webpage')
  assert.deepEqual(note.metadata, { domain: 'example.com', title: 'Ma page', language: 'fr' })
  assert.equal(
    note.content,
    '<p><strong>Ma page</strong></p><p><a href="https://www.example.com/a" target="_blank">https://www.example.com/a</a></p>'
      + '<p><img src="data:image/jpeg;base64,AAA" alt="Capture de example.com" style="max-width:100%; border-radius:8px; margin-top:8px;"/></p>'
      + '<p></p>'
  )
})

test('sans capture : la note se fait quand même, sans image', () => {
  const note = noteDeLaPage({ url: 'https://example.com' }, null, '1', 1)
  assert.equal(note.title, 'Page sans titre')
  assert.ok(!note.content.includes('<img'))
})

test('titre long : coupé à 50 caractères dans la liste, entier dans la métadonnée', () => {
  const titre = 'x'.repeat(60)
  const note = noteDeLaPage({ url: 'https://example.com', title: titre }, null, '1', 1)
  assert.equal(note.title, 'x'.repeat(50) + '...')
  assert.equal(note.metadata.title, titre)
})
