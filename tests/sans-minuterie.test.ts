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

test('aucune minuterie périodique dans le code de la 1.8.13 et de la 1.8.14', () => {
  for (const chemin of [...FICHIERS_1813, ...FICHIERS_1814]) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bsetInterval\s*\(/, `${chemin} relance une minuterie`)
  }
})
