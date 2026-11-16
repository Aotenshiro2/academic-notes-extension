// Le lien de connexion de l'email connecte le Carnet (1.10.1, 16/11/2026) :
// la page de retour du journal passe le jeton au service worker
// (externally_connectable). La garde est pure : origine, forme, attente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLE_SESSION_CARNET, DUREE_ATTENTE_MS, MESSAGE_LIEN, ORIGINES_LIEN, PAGE_RETOUR_LIEN,
  attenteValide, lireDemandeLien, memeAdresse, origineLienPermise,
} from '../src/lib/connexion-lien.ts'
import { URL_RETOUR_REPLI } from '../src/lib/connexion-adresse.ts'

const JETON = 'pkce_0123456789abcdef0123456789abcdef'

test('seule la page du journal peut passer un lien au Carnet', () => {
  assert.equal(origineLienPermise('https://journal.aoknowledge.com'), true)
  assert.equal(origineLienPermise(undefined, 'https://journal.aoknowledge.com/auth/carnet#token_hash=x'), true)
  assert.equal(origineLienPermise('https://journal.aoknowledge.com.evil.com'), false)
  assert.equal(origineLienPermise('http://journal.aoknowledge.com'), false)
  assert.equal(origineLienPermise('https://aoknowledge.com'), false)
  assert.equal(origineLienPermise(null, 'pas une adresse'), false)
  assert.equal(origineLienPermise(null, null), false)
})

test('le manifest ouvre externally_connectable à la seule origine du journal, sans autre extension', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.externally_connectable, { matches: ORIGINES_LIEN.map(o => `${o}/*`) })
  assert.equal('ids' in manifest.externally_connectable, false)
  // Aucune permission nouvelle (la liste de la 1.10.0)
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'unlimitedStorage', 'activeTab', 'tabs', 'contextMenus', 'scripting', 'identity', 'notifications', 'alarms'])
})

test('message de la page : jeton du lien, type permis, ou code PKCE du repli ; le reste est ignoré', () => {
  assert.deepEqual(lireDemandeLien({ type: MESSAGE_LIEN, token_hash: JETON, otpType: 'signup' }), { t: 'jeton', tokenHash: JETON, type: 'signup' })
  assert.deepEqual(lireDemandeLien({ type: MESSAGE_LIEN, token_hash: JETON, otpType: 'recovery' }), { t: 'jeton', tokenHash: JETON, type: 'magiclink' })
  assert.deepEqual(lireDemandeLien({ type: MESSAGE_LIEN, token_hash: JETON }), { t: 'jeton', tokenHash: JETON, type: 'magiclink' })
  assert.deepEqual(lireDemandeLien({ type: MESSAGE_LIEN, code: '6f1c2a90-1b2c-4d5e-8f90-123456789abc' }), { t: 'code', code: '6f1c2a90-1b2c-4d5e-8f90-123456789abc' })
  assert.equal(lireDemandeLien({ type: 'autre', token_hash: JETON }), null)
  assert.equal(lireDemandeLien({ type: MESSAGE_LIEN, token_hash: 'court' }), null)
  assert.equal(lireDemandeLien({ type: MESSAGE_LIEN, token_hash: 'a b c <script>0123456789' }), null)
  assert.equal(lireDemandeLien(null), null)
  assert.equal(lireDemandeLien('carnet:connexion-lien'), null)
})

test('le Carnet n\'accepte un lien que s\'il en attend un, depuis moins d\'une heure', () => {
  const t0 = 1_700_000_000_000
  assert.deepEqual(attenteValide({ email: 'a@b.fr', a: t0 }, t0 + 1000), { email: 'a@b.fr', a: t0 })
  assert.equal(attenteValide({ email: 'a@b.fr', a: t0 }, t0 + DUREE_ATTENTE_MS + 1), null)
  assert.equal(attenteValide({ email: 'a@b.fr', a: t0 + 5000 }, t0), null) // horloge à rebours
  assert.equal(attenteValide({ email: '', a: t0 }, t0), null)
  assert.equal(attenteValide(undefined, t0), null)
})

test('le compte ouvert doit être celui qui attendait', () => {
  assert.equal(memeAdresse(' Marie@Exemple.FR ', 'marie@exemple.fr'), true)
  assert.equal(memeAdresse('marie@exemple.fr', 'autre@exemple.fr'), false)
  assert.equal(memeAdresse('', ''), false)
  assert.equal(memeAdresse(undefined, 'a@b.fr'), false)
})

test('la clé de session regardée par l\'écran est celle de supabase.ts ; le repli revient sur la page du journal', () => {
  const supabase = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(supabase)?.[1]
  assert.equal(CLE_SESSION_CARNET, `sb_sb-${ref}-auth-token`)
  assert.match(supabase, /\[`sb_\$\{key\}`\]/)
  assert.equal(URL_RETOUR_REPLI, PAGE_RETOUR_LIEN)
})

test('le service worker écoute les liens au premier niveau ; aucune minuterie dans le lien', () => {
  const sw = readFileSync(new URL('../src/background/service-worker.ts', import.meta.url), 'utf8')
  assert.match(sw, /^ecouterLiensDeConnexion\(\)$/m)
  for (const chemin of ['src/lib/connexion-lien.ts', 'src/lib/connexion-lien-extension.ts']) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bset(Interval|Timeout)\s*\(/, `${chemin} lance une minuterie`)
  }
  const ext = readFileSync(new URL('../src/lib/connexion-lien-extension.ts', import.meta.url), 'utf8')
  // Le jeton est vérifié par le client de l'extension, qui garde SA session ; un autre compte est déconnecté.
  assert.match(ext, /verifyOtp\(\{ token_hash/)
  assert.match(ext, /signOut\(\{ scope: 'local' \}\)/)
})
