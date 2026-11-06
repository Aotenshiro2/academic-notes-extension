// Les écrans, le pied et l'accueil du Carnet (1.8.15) : les règles pures
// partagées par le panneau latéral et le plein écran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AUCUN_ECRAN, LIGNES_FRICTION, basculerEcran, etatPastilleSync, noteLaPlusRecente,
  notesEnAttenteDeSync, ouvrirEcran,
} from '../src/lib/ecrans-carnet.ts'

test('ouvrir un écran : lui seul, sans Support pré-rempli ni réglage visé par défaut', () => {
  assert.deepEqual(ouvrirEcran('compte'), { ecran: 'compte', supportBesoin: false })
  assert.deepEqual(ouvrirEcran('mentorat'), { ecran: 'mentorat', supportBesoin: false })
})

test('« Il me manque quelque chose » : seulement sur le Support', () => {
  assert.deepEqual(ouvrirEcran('support', { supportBesoin: true }), { ecran: 'support', supportBesoin: true })
  assert.equal(ouvrirEcran('compte', { supportBesoin: true }).supportBesoin, false)
})

test('le diagnostic ouvre les Paramètres sur l\'affichage de secours, et seulement les Paramètres', () => {
  assert.deepEqual(ouvrirEcran('reglages', { focusReglage: 'affichageSecours' }), {
    ecran: 'reglages', supportBesoin: false, focusReglage: 'affichageSecours',
  })
  assert.equal('focusReglage' in ouvrirEcran('compte', { focusReglage: 'affichageSecours' }), false)
})

test('boutons du pied : un clic ouvre, le second referme, un autre écran est remplacé', () => {
  const support = basculerEcran(AUCUN_ECRAN, 'support')
  assert.deepEqual(support, { ecran: 'support', supportBesoin: false })
  assert.deepEqual(basculerEcran(support, 'support'), AUCUN_ECRAN)
  // Le Support ouvert sur le formulaire se referme aussi d'un clic sur « Aide et idées »
  assert.deepEqual(basculerEcran(ouvrirEcran('support', { supportBesoin: true }), 'support'), AUCUN_ECRAN)
  // Mentorat par-dessus le Compte : une seule vue à la fois
  assert.deepEqual(basculerEcran(ouvrirEcran('compte'), 'mentorat'), { ecran: 'mentorat', supportBesoin: false })
})

test('pastille de synchronisation : hors ligne, à faire, ou tout est là', () => {
  assert.equal(etatPastilleSync(false, 3), 'horsLigne')
  assert.equal(etatPastilleSync(true, 2), 'aFaire')
  assert.equal(etatPastilleSync(true, 0), 'ok')
  // Session pas encore lue : pas d'alerte « hors ligne » au premier affichage
  assert.equal(etatPastilleSync(null, 0), 'ok')
  assert.equal(etatPastilleSync(null, 1), 'aFaire')
})

test('notes en attente : jamais synchronisées, hors exclues volontairement', () => {
  assert.equal(notesEnAttenteDeSync([
    { lastSyncAt: undefined, syncExcluded: false },
    { lastSyncAt: 10, syncExcluded: false },
    { lastSyncAt: undefined, syncExcluded: true },
    { lastSyncAt: undefined },
  ]), 2)
  assert.equal(notesEnAttenteDeSync([]), 0)
})

test('accueil : la note la plus récente, rien sans note', () => {
  assert.equal(noteLaPlusRecente([]), undefined)
  const notes = [{ id: 'a', timestamp: 5 }, { id: 'b', timestamp: 9 }, { id: 'c', timestamp: 7 }]
  assert.equal(noteLaPlusRecente(notes)?.id, 'b')
})

test('chaque ligne de friction a sa phrase et son texte pré-rempli, en français et en anglais', () => {
  const source = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8')
  const fr = source.slice(source.indexOf('const FR = {'), source.indexOf('export type CleI18n'))
  const en = source.slice(source.indexOf('const EN:'), source.indexOf('const DICO'))
  for (const { phrase, prerempli } of Object.values(LIGNES_FRICTION)) {
    for (const cle of [phrase, prerempli]) {
      assert.ok(fr.includes(`'${cle}'`), `${cle} manque en français`)
      assert.ok(en.includes(`'${cle}'`), `${cle} manque en anglais`)
    }
  }
})

// Le partage lui-même : le panneau et le plein écran rendent les MÊMES
// composants. Une copie qui divergerait en silence est exactement ce que la
// 1.8.15 répare.
test('le panneau et le plein écran rendent les mêmes écrans, le même pied et le même accueil', () => {
  const vues = ['src/sidepanel/App.tsx', 'src/fullscreen/FullscreenApp.tsx']
    .map(chemin => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
  for (const source of vues) {
    for (const piece of ['<EcransCarnet', '<PiedCarnet', '<EmptyNoteView', '<OutilsNoteRangee', 'useEcransCarnet()', 'onScreenshotToNote=', 'onEtudeReservee=']) {
      assert.ok(source.includes(piece), `${piece} manque dans une des deux vues`)
    }
    // Les écrans ne se rendent plus à la main dans une vue
    for (const ecran of ['<AccountView', '<SettingsView', '<MentoratView', '<SupportView', '<PlansView']) {
      assert.ok(!source.includes(ecran), `${ecran} rendu en direct dans une vue au lieu d'EcransCarnet`)
    }
  }
})
