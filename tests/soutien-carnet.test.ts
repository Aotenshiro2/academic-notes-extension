// « Soutenir le Carnet » (1.9.0) : quand la ligne se propose, quand le merci la
// remplace, et quand rien ne se montre. Règles pures de lib/soutien-carnet.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleRefusSoutien, ligneSoutien, lireEtatSoutien, urlPaiementSure, type EtatSoutien } from '../src/lib/soutien-carnet.ts'

const etat = (o: Partial<EtatSoutien> = {}): EtatSoutien => ({
  compris: true, ouvert: true, soutien: false, actif: false, portail: null, offres: { mois: 5.99, an: 57.5 }, ...o,
})

test('la ligne se propose : Premium compris par une formule, vente ouverte, aucun abonnement Carnet', () => {
  assert.equal(ligneSoutien('club', etat()), 'proposer')
})

test("le merci remplace la ligne quand un soutien est actif, même si la formule s'est arrêtée", () => {
  assert.equal(ligneSoutien('club', etat({ soutien: true, actif: true })), 'merci')
  assert.equal(ligneSoutien('premium', etat({ soutien: true, actif: true, compris: false })), 'merci')
})

test('rien : pas compris, vente fermée, abonnement ordinaire en cours, Stripe illisible, hors ligne', () => {
  assert.equal(ligneSoutien('libre', etat()), 'rien')
  assert.equal(ligneSoutien('premium', etat({ compris: false, actif: true })), 'rien')
  assert.equal(ligneSoutien('club', etat({ compris: false })), 'rien')
  assert.equal(ligneSoutien('club', etat({ ouvert: false })), 'rien')
  assert.equal(ligneSoutien('club', etat({ actif: true })), 'rien')
  assert.equal(ligneSoutien('club', etat({ actif: null, soutien: null })), 'rien')
  assert.equal(ligneSoutien('club', null), 'rien')
  assert.equal(ligneSoutien(null, etat()), 'rien')
})

test('la réponse du journal : lue telle quelle, prix par défaut, portail https seulement', () => {
  assert.deepEqual(
    lireEtatSoutien({ ok: true, compris: true, ouvert: true, soutien: false, actif: false, portail: null, offres: { mois: 5.99, an: 57.5 } }),
    etat(),
  )
  const sans = lireEtatSoutien({ ok: true, compris: true, ouvert: false, soutien: null, actif: null, portail: 'javascript:alert(1)' })
  assert.deepEqual(sans, { compris: true, ouvert: false, soutien: null, actif: null, portail: null, offres: { mois: 5.99, an: 57.5 } })
  assert.equal(lireEtatSoutien({ ok: false, erreur: 'compte' }), null)
  assert.equal(lireEtatSoutien(null), null)
  assert.equal(lireEtatSoutien({ ok: true, portail: 'https://billing.stripe.com/p/session/x' })?.portail, 'https://billing.stripe.com/p/session/x')
})

test('les refus du journal disent une phrase, et seule une page Stripe s ouvre', () => {
  assert.equal(cleRefusSoutien('deja'), 'soutien.deja')
  assert.equal(cleRefusSoutien('ferme'), 'soutien.ferme')
  assert.equal(cleRefusSoutien('pas_compris'), 'soutien.ferme')
  assert.equal(cleRefusSoutien('compte'), 'soutien.compte')
  assert.equal(cleRefusSoutien('stripe'), 'soutien.erreur')
  assert.equal(cleRefusSoutien(undefined), 'soutien.erreur')
  assert.equal(urlPaiementSure('https://checkout.stripe.com/c/pay/cs_test_1'), 'https://checkout.stripe.com/c/pay/cs_test_1')
  assert.equal(urlPaiementSure('https://exemple.fr/checkout.stripe.com/'), null)
  assert.equal(urlPaiementSure(null), null)
})
