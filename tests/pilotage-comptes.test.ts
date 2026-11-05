import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compteConnu, comptesDepuisStockage, userIdDepuisCookies, memeListe } from '../src/lib/pilotage-comptes.ts'

const prop = {
  id: 'p1', kind: 'prop', name: 'Apex 50K', balance: 50000, status: 'active', brokerName: 'Rithmic',
  firmName: 'Apex', challengeIdentifier: 'APEX-123456-0002', performanceIdentifier: '', currentStage: 'evaluation-1',
  ledger: [{ id: 'l', type: 'purchase', amount: 167, label: 'Achat', date: '2026-10-01' }],
}

test('compte propfirm : la forme de compteConnu(), aucun montant', () => {
  const c = compteConnu(prop, ['own', 'prop'])
  assert.deepEqual(c, {
    id: 'p1', kind: 'prop', brokerName: 'Rithmic', actif: true, nom: 'APEX-123456-0002', firmName: 'Apex',
    identifiants: ['APEX-123456-0002', 'Apex 50K'], sansIdentifiant: false,
  })
  assert.ok(!JSON.stringify(c).includes('50000'))
  assert.ok(!JSON.stringify(c).includes('167'))
})

test('compte propfirm financé : le nom est son identifiant de performance', () => {
  const c = compteConnu({ ...prop, currentStage: 'funded', performanceIdentifier: 'PA-APEX-0002' }, ['prop'])
  assert.equal(c?.nom, 'PA-APEX-0002')
})

test("compte propfirm sans identifiant : celui du challenge vaut le nom, comme normalizeAccount", () => {
  const c = compteConnu({ ...prop, challengeIdentifier: '' }, ['prop'])
  assert.equal(c?.sansIdentifiant, true)
  assert.equal(c?.nom, 'Apex 50K')
  assert.equal(compteConnu({ ...prop, firmName: '' }, ['prop'])?.firmName, 'PropFirm')
})

test('compte propre et démo ; genres filtrés par clé', () => {
  const propre = { id: 'o1', kind: 'own', name: 'IBKR', identifier: 'U1234567', status: 'inactive', brokerName: 'Interactive Brokers', balance: 12000 }
  assert.deepEqual(compteConnu(propre, ['own', 'prop']), {
    id: 'o1', kind: 'own', brokerName: 'Interactive Brokers', actif: false, nom: 'IBKR', firmName: '', identifiants: ['U1234567', 'IBKR'], sansIdentifiant: false,
  })
  const demo = { id: 'd1', kind: 'demo', name: 'Paper TV', status: 'active', brokerName: '' }
  assert.equal(compteConnu(demo, ['own', 'prop']), null)
  const liste = comptesDepuisStockage(JSON.stringify([prop, propre, demo, { id: 3 }]), JSON.stringify([demo, prop]))
  assert.deepEqual(liste.map(c => c.id), ['p1', 'o1', 'd1'])
  assert.deepEqual(comptesDepuisStockage('pas du json', null), [])
  assert.deepEqual(comptesDepuisStockage(null, null), [])
})

const b64url = (texte: string) => Buffer.from(texte, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const session = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', user: { id: 'u-123', email: 'x@example.com' } })

test('cookie de @supabase/ssr : base64, en un morceau', () => {
  const cookies = `autre=1; sb-ujdqrtjanmmwidnfhkxg-auth-token=base64-${b64url(session)}; theme=dark`
  assert.equal(userIdDepuisCookies(cookies), 'u-123')
})

test('cookie de @supabase/ssr : coupé en morceaux .0 .1 .2', () => {
  const valeur = `base64-${b64url(session)}`
  const tiers = Math.ceil(valeur.length / 3)
  const cookies = [0, 1, 2].map(i => `sb-ujdqrtjanmmwidnfhkxg-auth-token.${i}=${valeur.slice(i * tiers, (i + 1) * tiers)}`).join('; ')
  assert.equal(userIdDepuisCookies(cookies), 'u-123')
})

test('cookie en JSON encodé (ancienne forme) et repli sur le sub du jeton', () => {
  assert.equal(userIdDepuisCookies(`sb-ujdqrtjanmmwidnfhkxg-auth-token=${encodeURIComponent(session)}`), 'u-123')
  const jeton = `${b64url('{"alg":"HS256"}')}.${b64url('{"sub":"u-456"}')}.sig`
  assert.equal(userIdDepuisCookies(`sb-ujdqrtjanmmwidnfhkxg-auth-token=${encodeURIComponent(JSON.stringify([jeton, 'r']))}`), 'u-456')
})

test('cookie absent ou illisible : null', () => {
  assert.equal(userIdDepuisCookies(''), null)
  assert.equal(userIdDepuisCookies('theme=dark'), null)
  assert.equal(userIdDepuisCookies('sb-ujdqrtjanmmwidnfhkxg-auth-token=base64-@@@'), null)
})

test('même liste : sans regarder luLe', () => {
  const a = { comptes: comptesDepuisStockage(JSON.stringify([prop]), null), userId: 'u', luLe: 1 }
  assert.ok(memeListe(a, { ...a, luLe: 2 }))
  assert.ok(!memeListe(a, { ...a, userId: 'v' }))
  assert.ok(!memeListe(a, null))
})
