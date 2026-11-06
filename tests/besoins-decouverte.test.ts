// Besoins des membres, suite du 06/11/2026 : les signaux de friction du Carnet
// (envoi unique, contexte borné, jamais d'adresse visitée, rien sans compte,
// échec silencieux), la bulle une seule fois, les besoins livrés. Sans réseau :
// fetch simulé, aucune route de production appelée.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLE_BULLE, CONTEXTE_MAX, bulleDejaVue, codeDeSync, composerPrerempli, contexteBorne, envoyerSignal, lireLivres,
  marquerBulleVue, oublierSignauxEnvoyes, plateformeDe,
} from '../src/lib/besoins-decouverte.ts'

type Appel = [string, RequestInit | undefined]

function client(jeton: string | null = 'jeton-test') {
  const appels: Appel[] = []
  const envoi = (async (url: string, init?: RequestInit) => {
    appels.push([url, init])
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
  return { appels, options: { api: 'https://journal.exemple.test', jeton: async () => jeton, envoi } }
}

beforeEach(() => oublierSignauxEnvoyes())

test('signal : une seule fois pour la même clé et le même contexte', async () => {
  const { appels, options } = client()
  assert.equal(await envoyerSignal('carnet.export_echec', { format: 'pdf' }, options), 'envoye')
  assert.equal(await envoyerSignal('carnet.export_echec', { format: 'pdf' }, options), 'deja')
  assert.equal(await envoyerSignal('carnet.export_echec', { format: 'pdf', titre: 'Ma note' }, options), 'deja')
  assert.equal(appels.length, 1)
  assert.equal(await envoyerSignal('carnet.export_echec', { format: 'drive' }, options), 'envoye')
  assert.equal(appels.length, 2)
})

test('signal : app extension, clé, contexte permis seulement, Bearer', async () => {
  const { appels, options } = client()
  await envoyerSignal('carnet.capture_impossible', { plateforme: 'tradingview', raison: 'extraction', url: 'https://secret.example/x', texte: 'note' }, options)
  const [url, init] = appels[0]
  assert.equal(url, 'https://journal.exemple.test/api/besoins/signal')
  assert.equal(init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(init?.body)), {
    app: 'extension',
    cle: 'carnet.capture_impossible',
    contexte: { plateforme: 'tradingview', raison: 'extraction' },
  })
  assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer jeton-test')
})

test('signal : rien ne part sans compte connecté', async () => {
  const { appels, options } = client(null)
  assert.equal(await envoyerSignal('carnet.sync_echec', { code: '413' }, options), 'ignore')
  assert.equal(appels.length, 0)
  // Connecté plus tard, le même événement peut partir.
  const connecte = client()
  assert.equal(await envoyerSignal('carnet.sync_echec', { code: '413' }, connecte.options), 'envoye')
})

test('signal : un échec est ignoré en silence et jamais relancé', async () => {
  const appels: Appel[] = []
  const panne = (async (url: string, init?: RequestInit) => { appels.push([url, init]); throw new TypeError('réseau coupé') }) as unknown as typeof fetch
  const options = { api: 'https://journal.exemple.test', jeton: async () => 'j', envoi: panne }
  assert.equal(await envoyerSignal('carnet.sync_echec', { code: 'reseau' }, options), 'ignore')
  assert.equal(await envoyerSignal('carnet.sync_echec', { code: 'reseau' }, options), 'deja')
  assert.equal(appels.length, 1)
})

test('signal : une clé hors de la liste fermée ne part pas', async () => {
  const { appels, options } = client()
  // @ts-expect-error clé volontairement hors liste
  assert.equal(await envoyerSignal('carnet.autre_chose', {}, options), 'ignore')
  assert.equal(appels.length, 0)
})

test(`contexte borné : noms permis, ${CONTEXTE_MAX} caractères, une ligne`, () => {
  assert.deepEqual(contexteBorne('carnet.sync_echec', { code: '  413\n', erreur: 'HTTP 413: payload' }), { code: '413' })
  assert.equal(contexteBorne('carnet.export_echec', { format: 'x'.repeat(200) })?.format.length, CONTEXTE_MAX)
  assert.equal(contexteBorne('carnet.export_echec', { format: '   ' }), undefined)
  assert.equal(contexteBorne('carnet.export_echec'), undefined)
})

test('plateforme : liste connue, sinon « autre », jamais l\'adresse', () => {
  assert.equal(plateformeDe('https://www.tradingview.com/chart/abc/?symbol=NQ'), 'tradingview')
  assert.equal(plateformeDe('https://topstepx.com/trade'), 'topstepx')
  assert.equal(plateformeDe('https://app.topstep.com/dashboard'), 'topstep')
  assert.equal(plateformeDe('https://m.youtube.com/watch?v=x'), 'youtube')
  assert.equal(plateformeDe('https://mail.google.com/mail/u/0/'), 'gmail')
  assert.equal(plateformeDe('https://mon-site-perso.fr/page-privee'), 'autre')
  assert.equal(plateformeDe('https://faux-tradingview.com.pirate.net/'), 'autre')
  assert.equal(plateformeDe('chrome://extensions'), 'autre')
  assert.equal(plateformeDe(undefined), 'autre')
  assert.equal(plateformeDe('pas une adresse'), 'autre')
})

test('code de synchronisation : le statut seul, jamais le texte', () => {
  assert.equal(codeDeSync('HTTP 413: {"error":"payload too large","title":"Ma note"}'), '413')
  assert.equal(codeDeSync('Erreur journal : HTTP 500'), '500')
  assert.equal(codeDeSync('Erreur serveur (502)'), '502')
  assert.equal(codeDeSync('Unauthorized — session expired'), 'session')
  assert.equal(codeDeSync('Network error'), 'reseau')
  assert.equal(codeDeSync('Note introuvable en base'), 'autre')
  assert.equal(codeDeSync(undefined), 'autre')
})

test('ligne C : la phrase pré-remplie ne perd ni ne double le brouillon', () => {
  assert.equal(composerPrerempli('A : ', ''), 'A : ')
  assert.equal(composerPrerempli('A : ', 'B'), 'A : \n\nB')
  assert.equal(composerPrerempli('A : ', 'A : suite'), 'A : suite')
})

test('bulle : visible tant qu\'elle n\'est ni fermée ni cliquée, puis plus jamais', () => {
  const valeurs = new Map<string, string>()
  const s = { getItem: (k: string) => valeurs.get(k) ?? null, setItem: (k: string, v: string) => { valeurs.set(k, v) } }
  assert.equal(bulleDejaVue(s), false)
  marquerBulleVue(s)
  assert.equal(valeurs.get(CLE_BULLE), '1')
  assert.equal(bulleDejaVue(s), true)
})

test('bulle : stockage refusé, le panneau marche et la bulle ne revient pas en boucle', () => {
  const refuse = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } }
  assert.equal(bulleDejaVue(refuse), true)
  assert.doesNotThrow(() => marquerBulleVue(refuse))
  assert.equal(bulleDejaVue(null), true)
})

test('besoins livrés : lus, 10 au plus, le reste écarté', () => {
  const livres = lireLivres({
    besoins: [
      { id: 'a', titre: 'Capturer TopstepX', livre_le: '2026-11-05T10:00:00Z', personnes: 3 },
      { id: 'b', titre: 'Sans date', livre_le: 'non', personnes: -1 },
      { id: 'c', titre: ' ' },
      null,
      ...Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, titre: `T${i}` })),
    ],
  })
  assert.equal(livres.length, 10)
  assert.deepEqual(livres[0], { id: 'a', titre: 'Capturer TopstepX', livreLe: '2026-11-05T10:00:00Z', personnes: 3 })
  assert.deepEqual(livres[1], { id: 'b', titre: 'Sans date', livreLe: null, personnes: 0 })
  assert.deepEqual(lireLivres(null), [])
})

test('chaque texte de la découverte existe en français et en anglais', () => {
  const source = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8')
  const fr = source.slice(source.indexOf('const FR = {'), source.indexOf('export type CleI18n'))
  const en = source.slice(source.indexOf('const EN:'), source.indexOf('const DICO'))
  const cles = [...fr.matchAll(/'(besoin\.(?:aide|ligne|friction|livres)[A-Za-z0-9]*)'/g)].map(m => m[1])
  assert.ok(cles.length >= 14)
  for (const cle of cles) assert.ok(en.includes(`'${cle}'`), `${cle} manque en anglais`)
})
