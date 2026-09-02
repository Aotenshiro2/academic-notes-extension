// Journal d'Études (journal.aoknowledge.com) — la famille « maison » LIT le
// journal au lieu de le gratter (correction Brice du 01/09, chantier lancé le
// 02/09). Le canvas est NOTRE contenu : chaque carte React Flow porte l'id de
// la vraie note en `data-id` (NoteMapCanvas ~l.940). On relève les ids des
// cartes visibles et les liens tracés, le serveur les résout en notes DE CE
// COMPTE et donne leur contenu réel au modèle — au lieu d'un DOM de titres
// tronqués qui produisait un sommaire (capture de Brice du 02/09 : « la
// plupart des notes sont des titres sans contenu détaillé visible »).
import type { SiteStrategy, SiteExtractResult } from '../types'

function extractJournalAok(): SiteExtractResult {
  try {
    const title = document.title || "Journal d'Études"
    const bodyText = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 4000)

    // Les cartes visibles du canvas → ids des vraies notes
    const noteIds = Array.from(document.querySelectorAll('.react-flow__node'))
      .map(n => n.getAttribute('data-id'))
      .filter((id): id is string => Boolean(id))

    // Les liens tracés par l'élève. React Flow pose par défaut
    // aria-label="Edge from {source} to {target}" sur chaque arête.
    const liens: [string, string][] = []
    for (const e of Array.from(document.querySelectorAll('.react-flow__edge'))) {
      const label = e.getAttribute('aria-label') ?? ''
      const m = label.match(/Edge from (\S+) to (\S+)/)
      if (m) liens.push([m[1], m[2]])
    }

    return {
      success: true,
      pageTitle: title,
      // Repli : si le serveur ne résout pas les ids (hors ligne, vieille
      // version du journal), le texte de page reste exploitable
      content: bodyText,
      siteName: "Journal d'Études",
      extras: noteIds.length > 0
        ? {
            journalNoteIds: noteIds.slice(0, 40),
            journalLiens: liens.slice(0, 60),
          }
        : undefined,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export const journalAokStrategy: SiteStrategy = {
  id: 'journal-aok',
  label: "Journal d'Études (canvas)",
  match: url => /journal\.aoknowledge\.com|journal-d-etude[^/]*\.vercel\.app/i.test(url),
  priority: 30,
  func: extractJournalAok,
}
