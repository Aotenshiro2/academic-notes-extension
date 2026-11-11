// La bulle « Ouvrir le Carnet » (1.9.2) et la question par cause du point
// d'attention.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SITES_BULLE_DEFAUT, reglagesBulleDefaut, normaliserHote, hoteDansListe, lireReglagesBulle,
  ajouterSite, retirerSite, nomSite, departComplet, remettreDepart, ongletDejaPropose, marquerOnglet,
} from '../src/lib/bulle-carnet.ts'
import { surUnSiteDeLaListe } from '../src/content/bulle-carnet-ui.ts'

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

test('par défaut : les plateformes que le Carnet sait lire, bulle allumée', () => {
  assert.deepEqual(reglagesBulleDefaut(), {
    actif: true,
    sites: ['topstepx.com', 'dashboard.topstep.com', 'trader.tradovate.com', 'app.simplefx.com', 'tradingview.com'],
  })
  assert.deepEqual(lireReglagesBulle(undefined), reglagesBulleDefaut())
  assert.deepEqual(lireReglagesBulle(null), reglagesBulleDefaut())
})

test('un site couvre ses sous-domaines, sans « www. », et rien d\'autre', () => {
  const sites = reglagesBulleDefaut().sites
  for (const h of ['topstepx.com', 'www.topstepx.com', 'fr.tradingview.com', 'www.tradingview.com', 'dashboard.topstep.com', 'trader.tradovate.com', 'app.simplefx.com', 'TopStepX.com']) {
    assert.ok(hoteDansListe(h, sites), h)
  }
  for (const h of ['topstep.com', 'www.topstep.com', 'tradovate.com', 'simplefx.com', 'faketradingview.com', 'tradingview.com.evil.io', 'google.com', '']) {
    assert.ok(!hoteDansListe(h, sites), h)
  }
})

test('la copie du content script dit la même chose que l\'original', () => {
  const sites = [...reglagesBulleDefaut().sites, '127.0.0.1']
  const cas = ['topstepx.com', 'www.topstepx.com', 'fr.tradingview.com', 'TradingView.com', 'topstep.com', 'faketradingview.com',
    'tradingview.com.evil.io', '127.0.0.1', 'app.simplefx.com.', 'simplefx.com', '', 'localhost']
  for (const h of cas) assert.equal(surUnSiteDeLaListe(h, sites), hoteDansListe(h, sites), h)
  assert.equal(surUnSiteDeLaListe('topstepx.com', undefined), false)
})

test('normaliser : un hôte ou une adresse http(s), rien d\'autre', () => {
  assert.equal(normaliserHote('https://www.TradingView.com/chart/abc'), 'tradingview.com')
  assert.equal(normaliserHote('http://127.0.0.1:9391/trade'), '127.0.0.1')
  assert.equal(normaliserHote('  Fr.TradingView.com. '), 'fr.tradingview.com')
  assert.equal(normaliserHote('chrome-extension://abc/src/sidepanel/index.html'), null)
  assert.equal(normaliserHote('chrome://extensions'), null)
  assert.equal(normaliserHote('file:///C:/x.html'), null)
  assert.equal(normaliserHote(''), null)
  assert.equal(normaliserHote('pas un site'), null)
})

test('relire ce qui est stocké : interrupteur, liste nettoyée, doublons retirés', () => {
  assert.deepEqual(lireReglagesBulle({ actif: false, sites: ['www.topstepx.com', 'TopStepX.com', 42, 'pas un site'] }), { actif: false, sites: ['topstepx.com'] })
  assert.deepEqual(lireReglagesBulle({ actif: true, sites: [] }), { actif: true, sites: [] })
  assert.deepEqual(lireReglagesBulle({ sites: 'x' }), { actif: true, sites: reglagesBulleDefaut().sites })
})

test('« Ajouter ce site » : le site de l\'onglet, une seule fois', () => {
  const r = reglagesBulleDefaut()
  const avec = ajouterSite(r, 'https://www.ninjatrader.com/fr/')
  assert.deepEqual(avec.sites.slice(-1), ['ninjatrader.com'])
  assert.equal(ajouterSite(avec, 'ninjatrader.com'), avec)
  assert.equal(ajouterSite(r, 'https://fr.tradingview.com/chart/'), r, 'déjà couvert par tradingview.com')
  assert.equal(ajouterSite(r, 'chrome-extension://abc/'), r)
})

test('« Ne plus proposer ici » retire toutes les entrées qui couvrent la page', () => {
  const r = { actif: true, sites: ['tradingview.com', 'fr.tradingview.com', 'topstepx.com'] }
  assert.deepEqual(retirerSite(r, 'fr.tradingview.com').sites, ['topstepx.com'])
  assert.deepEqual(retirerSite(r, 'www.topstepx.com').sites, ['tradingview.com', 'fr.tradingview.com'])
  // Depuis les réglages : l'entrée elle-même
  assert.deepEqual(retirerSite(r, 'tradingview.com').sites, ['fr.tradingview.com', 'topstepx.com'])
})

test('les noms des plateformes, et les plateformes de départ remises sans perdre les ajouts', () => {
  assert.equal(nomSite('topstepx.com'), 'TopStepX')
  assert.equal(nomSite('ninjatrader.com'), 'ninjatrader.com')
  assert.equal(SITES_BULLE_DEFAUT.length, 5)
  const r = { actif: true, sites: ['ninjatrader.com', 'tradingview.com'] }
  assert.equal(departComplet(r.sites), false)
  const remis = remettreDepart(r)
  assert.equal(departComplet(remis.sites), true)
  assert.deepEqual(remis.sites.slice(0, 2), ['ninjatrader.com', 'tradingview.com'])
  assert.equal(remis.sites.length, 6)
})

test('une fois par onglet, liste bornée', () => {
  assert.equal(ongletDejaPropose(undefined, 3), false)
  const l = marquerOnglet(undefined, 3)
  assert.deepEqual(l, [3])
  assert.equal(ongletDejaPropose(l, 3), true)
  assert.equal(ongletDejaPropose(l, 4), false)
  assert.deepEqual(marquerOnglet([1, 2, 3], 4, 3), [2, 3, 4])
  assert.deepEqual(marquerOnglet([1, 'x', 2], 1), [2, 1])
})

test('aucune minuterie dans la bulle ; aucune permission nouvelle au manifest', () => {
  for (const chemin of ['src/lib/bulle-carnet.ts', 'src/content/bulle-carnet-ui.ts', 'src/components/BulleReglages.tsx']) {
    assert.doesNotMatch(lire(chemin), /\bset(Interval|Timeout)\s*\(/, `${chemin} lance une minuterie`)
  }
  const manifest = JSON.parse(lire('public/manifest.json'))
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'unlimitedStorage', 'activeTab', 'tabs', 'contextMenus', 'scripting', 'identity', 'notifications', 'alarms'])
  assert.deepEqual(manifest.host_permissions, ['<all_urls>'])
})

test('le content script n\'importe de la bulle que des types partagés', () => {
  const ui = lire('src/content/bulle-carnet-ui.ts')
  for (const m of ui.matchAll(/^import\s.*$/gm)) assert.match(m[0], /^import type /, m[0])
})

test('une question par cause, et chaque texte de la bulle en français et en anglais', () => {
  const source = lire('src/lib/i18n.ts')
  const fr = source.slice(source.indexOf('const FR = {'), source.indexOf('export type CleI18n'))
  const en = source.slice(source.indexOf('const EN:'), source.indexOf('const DICO'))
  assert.match(fr, /'attention\.question\.technique': 'Qu’est-ce que tu vérifies avant d’entrer aujourd’hui \?'/)
  assert.match(fr, /'attention\.question\.connaissance': 'Qu’est-ce que tu veux revoir avant ta séance \?'/)
  assert.match(fr, /'attention\.question\.emotionnel': 'Qu’est-ce que tu fais différemment aujourd’hui \?'/)
  const cles = [...fr.matchAll(/'((?:attention\.question|bulle|reglages\.bulle)[.A-Za-z0-9]*)'/g)].map(m => m[1])
  assert.ok(cles.length >= 18, String(cles.length))
  for (const cle of cles) {
    assert.ok(en.includes(`'${cle}'`), `${cle} manque en anglais`)
    const ligne = fr.slice(fr.indexOf(`'${cle}'`)).split('\n')[0] + en.slice(en.indexOf(`'${cle}'`)).split('\n')[0]
    assert.doesNotMatch(ligne, /\u2014/, `${cle} : tiret cadratin`)
  }
  // L'ancienne question unique a disparu
  assert.doesNotMatch(source, /'attention\.question':/)
})
