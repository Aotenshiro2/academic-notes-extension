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

// 1.8.15 : la rangée d'outils de la note, les écrans, le pied, le menu de la
// roue et l'accueil, partagés par le panneau et le plein écran. Tout part d'un
// clic ; la session et l'accès à l'étude se relisent au geste, jamais en fond.
const FICHIERS_1815 = [
  'src/lib/outils-note.ts',
  'src/components/OutilsNoteRangee.tsx',
  'src/fullscreen/FullscreenApp.tsx',
  'src/lib/trade-note.ts',
  'src/lib/use-trade-note.ts',
  'src/lib/theme.ts',
  'src/lib/historique.ts',
  'src/components/HistoriqueNotes.tsx',
  'src/components/HistoryDropdown.tsx',
  'src/lib/travail-fond.ts',
  'src/lib/use-travail-fond.ts',
  'src/lib/use-ecrans-carnet.ts',
  'src/lib/use-session-carnet.ts',
  'src/lib/ecrans-carnet.ts',
  'src/lib/capture-page.ts',
  'src/components/EcransCarnet.tsx',
  'src/components/PiedCarnet.tsx',
  'src/components/EmptyNoteView.tsx',
  'src/sidepanel/App.tsx',
]

// 1.8.16 : les liens des trades avec Pilotage se lisent à l'ouverture de la
// note, puis après un lien posé ou retiré. Ni relecture ni délai.
const FICHIERS_1816 = [
  'src/lib/lien-trade.ts',
  'src/lib/use-liens-trades.ts',
  'src/components/TradeLienPopover.tsx',
  'src/components/CadrePopoverTrade.tsx',
  'src/components/PastilleInstrument.tsx',
]

test('aucune minuterie périodique dans le code de la 1.8.13, de la 1.8.14 et de la 1.8.15', () => {
  for (const chemin of [...FICHIERS_1813, ...FICHIERS_1814, ...FICHIERS_1815]) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bsetInterval\s*\(/, `${chemin} relance une minuterie`)
  }
})

test('aucune minuterie dans le lien des trades avec Pilotage (1.8.16)', () => {
  for (const chemin of FICHIERS_1816) {
    const source = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bset(Interval|Timeout)\s*\(/, `${chemin} lance une minuterie`)
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
