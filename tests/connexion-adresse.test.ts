// La connexion du Carnet (1.10.1, 16/11/2026) : le parcours de
// aoknowledge.com/connexion. Les règles pures : lecture des routes du journal,
// portes, code, refus de Supabase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CODE_SUPABASE, DELAI_RENVOI_S, ROUTE_ADRESSE, ROUTE_ENVOI, SUPPORT,
  adresseValide, cleAdresse, codeSaisi, codeSurDansEmail, ecranApresEnvoi, envoiDuRepli, estGmail,
  issueCode, issueEnvoi, lienEcrisNous, lireEnvoiRoute, lireReconnaissance, motDePasseRefuse,
  suiteCreation, suiteReconnaissance,
} from '../src/lib/connexion-adresse.ts'

test('les routes sont celles du journal, contrat du site', () => {
  assert.equal(ROUTE_ADRESSE, 'https://journal.aoknowledge.com/api/connexion/adresse')
  assert.equal(ROUTE_ENVOI, 'https://journal.aoknowledge.com/api/connexion/envoi')
})

test('reconnaissance : une des quatre portes, sinon simple (route absente, 403, réponse inattendue)', () => {
  for (const p of ['google', 'connue', 'inconnue', 'rattachee'] as const) {
    assert.equal(lireReconnaissance({ reponse: p }), p)
  }
  assert.equal(lireReconnaissance({ reponse: 'simple' }), 'simple')
  assert.equal(lireReconnaissance(null), 'simple') // 403 de l'origine pas encore sur la liste : poster() rend null
  assert.equal(lireReconnaissance({ reponse: 'admin' }), 'simple')
  assert.equal(lireReconnaissance('google'), 'simple')
})

test('après « Continuer » : la porte, ou le code part (connue, ou la route ne répond pas)', () => {
  assert.equal(suiteReconnaissance('google'), 'google')
  assert.equal(suiteReconnaissance('inconnue'), 'inconnue')
  assert.equal(suiteReconnaissance('rattachee'), 'rattachee')
  assert.equal(suiteReconnaissance('connue'), 'envoi')
  assert.equal(suiteReconnaissance('simple'), 'envoi')
})

test('créer un compte : un Gmail passe par Google en un clic, une autre adresse reçoit le lien', () => {
  assert.equal(suiteCreation('marie@gmail.com'), 'google')
  assert.equal(suiteCreation(' Marie@GoogleMail.com '), 'google')
  assert.equal(suiteCreation('marie@proton.me'), 'envoi')
  assert.equal(estGmail('gmail.com'), false)
})

test('envoi par la route : ok, délai borné, refus ; tout le reste = repli (null)', () => {
  assert.deepEqual(lireEnvoiRoute({ envoi: 'ok' }), { t: 'ok', voie: 'aok' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'delai', secondes: 47 }), { t: 'delai', secondes: 47, voie: 'aok' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'delai' }), { t: 'delai', secondes: DELAI_RENVOI_S, voie: 'aok' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'delai', secondes: 99999 }), { t: 'delai', secondes: 3600, voie: 'aok' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'limite' }), { t: 'plafond' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'plafond' }), { t: 'plafond' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'rattachee' }), { t: 'rattachee' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'inconnue' }), { t: 'inconnue' })
  assert.deepEqual(lireEnvoiRoute({ envoi: 'invalide' }), { t: 'erreur', message: 'invalide' })
  assert.equal(lireEnvoiRoute({ envoi: 'indisponible' }), null)
  assert.equal(lireEnvoiRoute(null), null)
})

test('après un envoi : la route peut encore renvoyer vers une porte', () => {
  assert.equal(ecranApresEnvoi({ t: 'rattachee' }), 'rattachee')
  assert.equal(ecranApresEnvoi({ t: 'inconnue' }), 'inconnue')
  assert.equal(ecranApresEnvoi({ t: 'ok', voie: 'aok' }), 'boite')
  assert.equal(ecranApresEnvoi({ t: 'plafond' }), 'boite')
})

test('repli (signInWithOtp) : délai par adresse et plafond du projet distingués par le message', () => {
  assert.deepEqual(envoiDuRepli(null), { t: 'ok', voie: 'supabase' })
  assert.deepEqual(
    envoiDuRepli({ status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 47 seconds.' }),
    { t: 'delai', secondes: 47, voie: 'supabase' },
  )
  assert.deepEqual(envoiDuRepli({ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), { t: 'plafond' })
  assert.deepEqual(issueEnvoi({ message: 'For security purposes, please wait.' }), { t: 'delai', secondes: DELAI_RENVOI_S })
  assert.deepEqual(issueEnvoi({ status: 500, message: 'boom' }), { t: 'erreur', message: 'boom' })
})

test('le code : les chiffres seuls, 6 au plus, collé avec des espaces', () => {
  assert.equal(codeSaisi('Ton code : 123 456'), '123456')
  assert.equal(codeSaisi('12345678'), '123456')
  assert.equal(codeSaisi('abc'), '')
})

test('refus de verifyOtp : faux ou expiré, trop d\'essais, autre', () => {
  assert.deepEqual(issueCode(null), { t: 'ok' })
  assert.deepEqual(issueCode({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }), { t: 'faux' })
  assert.deepEqual(issueCode({ status: 429, message: 'Request rate limit reached' }), { t: 'trop' })
  assert.deepEqual(issueCode({ status: 500, message: 'Database error' }), { t: 'erreur' })
})

test('le code est sûr dans l\'email de la route ; dans celui du repli seulement si les modèles l\'ont', () => {
  assert.equal(codeSurDansEmail('aok'), true)
  assert.equal(codeSurDansEmail('supabase'), CODE_SUPABASE)
})

test('mot de passe refusé : compte Google ou par code, ou mot de passe faux', () => {
  assert.equal(motDePasseRefuse({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }), true)
  assert.equal(motDePasseRefuse({ message: 'Invalid login credentials' }), true)
  assert.equal(motDePasseRefuse({ status: 500, message: 'boom' }), false)
  assert.equal(motDePasseRefuse(null), false)
})

test('adresse : validité minimale, même clé quelle que soit la casse', () => {
  assert.equal(adresseValide('a@b.co'), true)
  assert.equal(adresseValide('pas une adresse'), false)
  assert.equal(adresseValide('a@b'), false)
  assert.equal(cleAdresse(' Marie@Exemple.FR '), 'marie@exemple.fr')
})

test('« Écris-nous » : le support, l\'objet prérempli, jamais l\'adresse du membre', () => {
  const lien = lienEcrisNous()
  assert.ok(lien.startsWith(`mailto:${SUPPORT}?subject=`))
  assert.equal(lien.includes('@', `mailto:${SUPPORT}`.length), false)
})

test('aucune minuterie dans les règles, les appels et l\'écran de la connexion ; le décompte s\'arrête', () => {
  for (const chemin of ['src/lib/connexion-adresse.ts', 'src/lib/auth.ts', 'src/components/ConnexionCarnet.tsx']) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bset(Interval|Timeout)\s*\(/, `${chemin} lance une minuterie`)
  }
  // Le seul décompte (« Renvoyer dans 47 s ») ne tourne que pendant le délai, puis s'efface.
  const decompte = readFileSync(new URL('../src/lib/use-envoi-code.ts', import.meta.url), 'utf8')
  assert.match(decompte, /if \(!fin\) return/)
  assert.match(decompte, /clearInterval/)
})

test('la synchronisation et la session ne bougent pas : auth.ts garde ses fonctions et la déconnexion locale', () => {
  const auth = readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8')
  for (const nom of ['getSession', 'getUser', 'getBearerToken', 'signOut', 'signInWithGoogle']) {
    assert.match(auth, new RegExp(`export async function ${nom}\\(`), `${nom} a disparu`)
  }
  assert.match(auth, /signOut\(\{ scope: 'local' \}\)/)
  assert.match(auth, /launchWebAuthFlow/)
  const supabase = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
  assert.match(supabase, /ujdqrtjanmmwidnfhkxg/)
})
