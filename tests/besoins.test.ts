// Besoins des membres, lot 2 (06/11/2026) : les règles pures du bouton « Il me
// manque quelque chose » (texte envoyable, cartes prévues, messages, capture).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  APP_BESOIN, cleMessageSignalement, dimensionsCible, lireBesoins, phraseDuServeur, texteEnvoyable, TEXTE_MAX,
} from '../src/lib/besoins-pur.ts'

test("l'app du Carnet est « extension » (contrat d'API)", () => {
  assert.equal(APP_BESOIN, 'extension')
})

test('texte envoyable : 5 caractères utiles au moins, 4000 au plus, rien de retouché', () => {
  assert.equal(texteEnvoyable('abcd'), false)
  assert.equal(texteEnvoyable('   abcd   '), false)
  assert.equal(texteEnvoyable('abcde'), true)
  assert.equal(texteEnvoyable('a'.repeat(TEXTE_MAX)), true)
  assert.equal(texteEnvoyable('a'.repeat(TEXTE_MAX + 1)), false)
})

test('cartes prévues : lues, complétées, 8 au plus, le reste écarté', () => {
  const brut = {
    besoins: [
      { id: 'a', titre: 'Un', statut: 'en_cours', votes: 3, aVote: true },
      { id: 'b', titre: 'Deux', statut: 'inconnu' },
      { titre: 'sans id' },
      null,
      ...Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, titre: `T${i}`, statut: 'planifie', votes: 1, aVote: false })),
    ],
  }
  const lus = lireBesoins(brut)
  assert.equal(lus.length, 8)
  assert.deepEqual(lus[0], { id: 'a', titre: 'Un', statut: 'en_cours', votes: 3, aVote: true })
  assert.deepEqual(lus[1], { id: 'b', titre: 'Deux', statut: 'planifie', votes: 0, aVote: false })
  assert.deepEqual(lireBesoins(null), [])
  assert.deepEqual(lireBesoins({ besoins: 'non' }), [])
})

test('un message par réponse du serveur, réseau coupé compris', () => {
  assert.equal(cleMessageSignalement(null), 'besoin.erreurReseau')
  assert.equal(cleMessageSignalement(400), 'besoin.erreur400')
  assert.equal(cleMessageSignalement(401), 'besoin.erreur401')
  assert.equal(cleMessageSignalement(404), 'besoin.erreur404')
  assert.equal(cleMessageSignalement(413), 'besoin.erreur413')
  assert.equal(cleMessageSignalement(429), 'besoin.erreur429')
  assert.equal(cleMessageSignalement(503), 'besoin.erreur503')
  assert.equal(cleMessageSignalement(500), 'besoin.erreurAutre')
})

test('la phrase du serveur est rendue telle quelle', () => {
  const phrase = "Merci, c'est noté. Ton besoin rejoint ceux que l'équipe passe en revue."
  assert.equal(phraseDuServeur({ ok: true, phrase }), phrase)
  assert.equal(phraseDuServeur({ ok: true }), null)
  assert.equal(phraseDuServeur({ ok: true, phrase: '  ' }), null)
  assert.equal(phraseDuServeur(null), null)
})

test('capture : 1600 px au plus grand côté, jamais agrandie', () => {
  assert.deepEqual(dimensionsCible(3200, 1800), { largeur: 1600, hauteur: 900 })
  assert.deepEqual(dimensionsCible(1080, 2400), { largeur: 720, hauteur: 1600 })
  assert.deepEqual(dimensionsCible(800, 600), { largeur: 800, hauteur: 600 })
  assert.deepEqual(dimensionsCible(3200, 1800, 0.75), { largeur: 1200, hauteur: 675 })
})

test('chaque clé du bouton existe en français et en anglais', () => {
  const source = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8')
  const fr = source.slice(source.indexOf('const FR = {'), source.indexOf('export type CleI18n'))
  const en = source.slice(source.indexOf('const EN:'), source.indexOf('const DICO'))
  const cles = [...fr.matchAll(/'(besoin\.[A-Za-z0-9]+|menu\.besoin)'/g)].map(m => m[1])
  assert.ok(cles.length > 30)
  for (const cle of cles) assert.ok(en.includes(`'${cle}'`), `${cle} manque en anglais`)
})
