// Règle de Brice du 05/11 : des relectures à la demande, au geste, jamais une
// minuterie qui recalcule en continu. Garde-fou sur le code de la 1.8.13
// (comptes de Pilotage, import, « Lier », Prévu / Broker, capture du graphique).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FICHIERS_1813 = [
  'src/content/content-script.ts',
  'src/lib/pilotage-comptes.ts',
  'src/lib/pilotage-api.ts',
  'src/lib/use-comptes-pilotage.ts',
  'src/lib/message-onglet.ts',
  'src/lib/documents-attribution.ts',
  'src/lib/documents-doublons.ts',
  'src/lib/documents-lecture.ts',
  'src/lib/positions-jour.ts',
  'src/lib/instrument.ts',
  'src/lib/capture-graphique.ts',
  'src/lib/capture-graphique-trade.ts',
  'src/components/ImportTradesDialog.tsx',
  'src/components/TradePrixPopover.tsx',
  'src/components/TradePrevuBroker.tsx',
]

// 1.8.14 : le diagnostic se rassemble au geste (ouvrir l'écran), l'affichage
// de secours suit un événement, rien ne tourne en fond.
const FICHIERS_1814 = [
  'src/lib/diagnostic-pur.ts',
  'src/lib/diagnostic-traces.ts',
  'src/lib/diagnostic.ts',
  'src/lib/affichage-secours.ts',
  'src/lib/provider-injector.ts',
  'src/components/DiagnosticView.tsx',
]

// 1.8.15 : la rangée d'outils de la note, partagée par le panneau et le plein
// écran. Tout part d'un clic ; l'accès à l'étude est demandé une fois, à l'ouverture.
const FICHIERS_1815 = [
  'src/lib/outils-note.ts',
  'src/components/OutilsNoteRangee.tsx',
  'src/fullscreen/FullscreenApp.tsx',
  'src/lib/trade-note.ts',
  'src/lib/use-trade-note.ts',
  'src/lib/theme.ts',
  'src/lib/ouvrir-compte.ts',
]

test('aucune minuterie périodique dans le code de la 1.8.13, de la 1.8.14 et de la 1.8.15', () => {
  for (const chemin of [...FICHIERS_1813, ...FICHIERS_1814, ...FICHIERS_1815]) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bsetInterval\s*\(/, `${chemin} relance une minuterie`)
  }
})

// Besoins des membres, lot 2 (06/11/2026) : « Déjà prévu » se lit à
// l'ouverture du formulaire, au geste. Ni relecture ni délai.
// Suite du 06/11 : signaux de friction, bulle et besoins livrés, au geste aussi.
const FICHIERS_BESOINS = [
  'src/lib/besoins-pur.ts',
  'src/lib/besoins.ts',
  'src/lib/besoins-decouverte.ts',
  'src/components/BesoinForm.tsx',
  'src/components/SupportView.tsx',
]

test('aucune minuterie dans le bouton « Il me manque quelque chose »', () => {
  for (const chemin of FICHIERS_BESOINS) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bset(Interval|Timeout)\s*\(/, `${chemin} lance une minuterie`)
  }
})
