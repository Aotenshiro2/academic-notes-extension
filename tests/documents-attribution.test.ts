import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseLecture, normaliseQuota, lecturesRestantes } from '../src/lib/documents-lecture.ts'
import {
  rapprocherCompte, devinerCompte, comptesProposes, lotsParCompte, adresseNouveauCompte, lectureDemo, libelleCompte, abregerIdentifiant,
} from '../src/lib/documents-attribution.ts'
import type { CompteConnu } from '../src/lib/pilotage-comptes.ts'

const apex2: CompteConnu = { id: 'a2', nom: 'APEX-123456-0002', kind: 'prop', firmName: 'Apex', brokerName: 'Rithmic', identifiants: ['APEX-123456-0002', 'Apex 50K'], actif: true, sansIdentifiant: false }
const apex3: CompteConnu = { ...apex2, id: 'a3', nom: 'APEX-123456-0003', identifiants: ['APEX-123456-0003', 'Apex 50K b'] }
const topstep: CompteConnu = { id: 't1', nom: 'Topstep 50K', kind: 'prop', firmName: 'Topstep', brokerName: 'ProjectX', identifiants: ['Topstep 50K'], actif: true, sansIdentifiant: true }
const propre: CompteConnu = { id: 'o1', nom: 'IBKR', kind: 'own', firmName: '', brokerName: 'Interactive Brokers', identifiants: ['U1234567', 'IBKR'], actif: true, sansIdentifiant: false }
const demo: CompteConnu = { id: 'd1', nom: 'Paper', kind: 'demo', firmName: '', brokerName: 'Rithmic', identifiants: ['Paper'], actif: true, sansIdentifiant: true }
const comptes = [apex2, apex3, topstep, propre, demo]

const trade = (compte: string | null, i = 0) => ({
  source: 'tradovate-performance', idExterne: `f${i}`, compte, symbole: 'NQZ5', direction: 'long', quantite: 2, prixEntree: 20100, prixSortie: 20131,
  entreLe: `2026-10-28T09:40:${String(i).padStart(2, '0')}Z`, sortiLe: null, pnl: 1240, devise: 'USD', frais: null, dureeSec: null,
})

const lecture = (champs: Record<string, unknown>) => normaliseLecture({ type: 'trades', methode: 'csv', confiance: 1, ...champs })

test('normaliseLecture : les empreintes à côté de la lecture se lisent aussi', () => {
  const l = normaliseLecture({ type: 'trades', methode: 'csv', confiance: 1, trades: [trade('x')] }, ['e1'])
  assert.deepEqual(l.empreintes, ['e1'])
  assert.equal(normaliseLecture({ type: 'bidule' }).type, 'autre')
  assert.equal(normaliseLecture(null).confiance, 0)
})

test("rapprocher : le journal, puis l'identifiant, puis la firme seule, puis le broker", () => {
  assert.deepEqual(rapprocherCompte(lecture({ compteId: 'a3' }), comptes), { compteId: 'a3', par: 'journal' })
  assert.deepEqual(rapprocherCompte(lecture({ trades: [trade('APEX-123456-0002')] }), comptes), { compteId: 'a2', par: 'identifiant' })
  assert.deepEqual(rapprocherCompte(lecture({ firme: 'Topstep' }), comptes), { compteId: 't1', par: 'firme' })
  assert.deepEqual(rapprocherCompte(lecture({ broker: 'Interactive Brokers' }), comptes), { compteId: 'o1', par: 'broker' })
  // Deux comptes Apex actifs : la firme seule ne tranche pas.
  assert.deepEqual(rapprocherCompte(lecture({ firme: 'Apex' }), comptes), { compteId: null, par: null })
})

test('jamais démo vers réel, ni réel vers démo', () => {
  // Le journal propose le compte démo pour un document réel : refusé.
  assert.equal(rapprocherCompte(lecture({ compteId: 'd1' }), comptes).compteId, null)
  // Un document démo du broker Rithmic va sur le compte démo, pas sur les Apex réels.
  const l = lecture({ broker: 'Rithmic', typeCompte: 'demo' })
  assert.ok(lectureDemo(l))
  assert.deepEqual(rapprocherCompte(l, comptes), { compteId: 'd1', par: 'broker' })
})

test('deviner : compte sûr, doute, compte inconnu', () => {
  const sur = devinerCompte(lecture({ trades: [trade('APEX-123456-0002')] }), comptes)
  assert.equal(sur.compteId, 'a2')
  assert.equal(sur.doute, false)
  assert.equal(sur.inconnu, null)

  const peuSur = devinerCompte(normaliseLecture({ type: 'trades', methode: 'texte', confiance: 0.4, compteId: 'a2' }), comptes)
  assert.equal(peuSur.compteId, 'a2')
  assert.equal(peuSur.doute, true)

  const rien = devinerCompte(normaliseLecture({ type: 'trades', methode: 'vision', confiance: 0.9 }), comptes)
  assert.equal(rien.compteId, null)
  assert.equal(rien.doute, true)
  assert.equal(rien.inconnu, null)
})

test("identifiant inconnu : jamais rangé sur l'autre compte de la même firme", () => {
  // Un seul compte Topstep connu, sans identifiant : la firme suffit, le document lui apporte le sien.
  const topstepLu = devinerCompte(lecture({ firme: 'Topstep', trades: [trade('S1OCT2812345')] }), comptes)
  assert.equal(topstepLu.compteId, 't1')
  // Apex ...0009 : Pilotage ne le connaît pas. Même avec un seul compte Apex, ce n'est pas lui.
  const seulApex = devinerCompte(lecture({ firme: 'Apex', trades: [trade('APEX-123456-0009')] }), [apex2])
  assert.equal(seulApex.compteId, null)
  assert.deepEqual(seulApex.inconnu, { kind: 'prop', firme: 'Apex', identifiant: 'APEX-123456-0009', broker: '' })
  assert.equal(adresseNouveauCompte(seulApex.inconnu!), 'https://pilotage.aoknowledge.com/comptes?add=prop&firme=Apex&identifiant=APEX-123456-0009')
  const proprePlateforme = devinerCompte(lecture({ broker: 'Interactive Brokers', trades: [trade('U7654321')] }), [])
  assert.equal(proprePlateforme.inconnu?.kind, 'own')
})

test('« Quel compte ? » : les démo seulement pour un document démo', () => {
  assert.deepEqual(comptesProposes(comptes, false).map(c => c.id), ['a2', 'a3', 't1', 'o1'])
  assert.deepEqual(comptesProposes(comptes, true).map(c => c.id), ['a2', 'a3', 't1', 'o1', 'd1'])
})

test('copy trading : un lot par compte du fichier, chacun garde ses trades', () => {
  const l = lecture({ compteId: 'a2', empreintes: ['e0', 'e1', 'e2', 'e3'], trades: [trade('APEX-123456-0002', 0), trade('APEX-123456-0003', 1), trade('APEX-123456-0002', 2), trade('APEX-123456-0009', 3)] })
  const lots = lotsParCompte(l)
  assert.deepEqual(lots.map(lot => [lot.compteLu, lot.lecture.trades?.length]), [['APEX-123456-0002', 2], ['APEX-123456-0003', 1], ['APEX-123456-0009', 1]])
  // Le compte rapproché par le journal vaut pour le fichier entier : plus pour un lot.
  assert.ok(lots.every(lot => lot.lecture.compteId === null))
  assert.deepEqual(lots.map(lot => devinerCompte(lot.lecture, comptes).compteId), ['a2', 'a3', null])
  // Un seul compte : la lecture telle quelle.
  const seul = lotsParCompte(lecture({ trades: [trade('APEX-123456-0002', 0), trade('APEX-123456-0002', 1)] }))
  assert.equal(seul.length, 1)
  assert.equal(seul[0].compteLu, 'APEX-123456-0002')
})

test("libellés : la firme et la fin de l'identifiant", () => {
  assert.equal(libelleCompte(apex2), 'Apex ...0002')
  assert.equal(libelleCompte(topstep), 'Topstep 50K')
  assert.equal(libelleCompte({ ...topstep, nom: 'Compte du matin' }), 'Topstep Compte du matin')
  assert.equal(libelleCompte(propre), 'IBKR')
  assert.equal(abregerIdentifiant('0002'), '0002')
})

test('quota : nouvelle forme, ancienne forme, restantes', () => {
  const q = normaliseQuota({ utilisees: 3, limite: 10, offertes: 0, jusquAu: null, palier: 'libre' })
  assert.deepEqual(q, { utilisees: 3, limite: 10, offertes: 0, jusquAu: null, palier: 'libre' })
  assert.equal(lecturesRestantes(q!), 7)
  assert.equal(normaliseQuota({ utilisees: 50, palier: 'equipe' })?.limite, null)
  assert.equal(normaliseQuota({ lusParIaAujourdhui: 2, limite: 5 })?.utilisees, 2)
  const offertes = normaliseQuota({ utilisees: 10, limite: 10, offertes: 4, jusquAu: '2026-11-12T00:00:00Z', palier: 'libre' })!
  assert.equal(lecturesRestantes(offertes, Date.parse('2026-11-05T00:00:00Z')), 4)
  assert.equal(lecturesRestantes(offertes, Date.parse('2026-11-20T00:00:00Z')), 0)
  assert.equal(normaliseQuota('rien'), null)
})
