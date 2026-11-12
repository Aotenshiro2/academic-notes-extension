/**
 * Le relevé des tableaux de trades d'une page (1.10.0), exécuté DANS la page
 * par chrome.scripting.executeScript juste après la stratégie du site : il
 * doit rester AUTONOME (aucun import, aucune closure), comme les stratégies.
 *
 * Il ne lit pas les trades : il rend les en-têtes et quelques lignes des
 * tableaux visibles (vrais <table> et grilles ARIA, la norme des webapps de
 * trading), les mots qui peuvent être un numéro de compte, et le texte des
 * zones « compte » de la page. C'est le Carnet qui décide ensuite
 * (lib/trades-page.ts) s'il y a un tableau de trades fermés et quel compte la
 * page montre. Rien de ce relevé ne quitte le Carnet : seule la capture
 * d'écran part à la lecture de Pilotage, et seulement s'il y a des trades.
 */
export function releverTradesDeLaPage(): {
  tableaux: { entetes: string[]; lignes: string[][] }[]
  jetons: string[]
  jetonsSelection: string[]
  texteCompte: string
} {
  const propre = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const visible = (el: Element) => {
    try {
      if ((el as HTMLElement).closest?.('[aria-hidden="true"], [hidden]')) return false
      return el.getClientRects().length > 0
    } catch {
      return true
    }
  }
  const LIGNES_MAX = 60
  const CELLULES_MAX = 24

  const tableaux: { entetes: string[]; lignes: string[][] }[] = []

  // ── Les vrais <table> ──────────────────────────────────────────────────
  for (const table of Array.from(document.querySelectorAll('table')).slice(0, 30)) {
    if (!visible(table)) continue
    let entetes = Array.from(table.querySelectorAll('thead th, thead td')).map(c => propre(c.textContent)).slice(0, CELLULES_MAX)
    const rangees = Array.from(table.querySelectorAll('tr'))
    let corps = Array.from(table.querySelectorAll('tbody tr'))
    if (!entetes.length && rangees.length) {
      // Sans <thead> : la première rangée en <th> sert d'en-tête.
      const premiere = rangees[0]
      if (premiere.querySelector('th')) {
        entetes = Array.from(premiere.querySelectorAll('th, td')).map(c => propre(c.textContent)).slice(0, CELLULES_MAX)
        corps = rangees.slice(1)
      }
    }
    if (!corps.length) corps = rangees.filter(r => !r.closest('thead'))
    const lignes = corps
      .filter(r => !r.querySelector('th') || r.querySelector('td'))
      .slice(0, LIGNES_MAX)
      .map(r => Array.from(r.querySelectorAll('td, th')).map(c => propre(c.textContent)).slice(0, CELLULES_MAX))
      .filter(l => l.some(c => c.length > 0))
    if (entetes.some(Boolean) && lignes.length) tableaux.push({ entetes, lignes })
  }

  // ── Les grilles ARIA (role="grid", "treegrid", "table") ────────────────
  for (const grille of Array.from(document.querySelectorAll('[role="grid"], [role="treegrid"], [role="table"]')).slice(0, 30)) {
    if (grille.tagName === 'TABLE' || !visible(grille)) continue
    const entetes = Array.from(grille.querySelectorAll('[role="columnheader"]')).map(c => propre(c.textContent)).slice(0, CELLULES_MAX)
    const lignes = Array.from(grille.querySelectorAll('[role="row"]'))
      .filter(r => !r.querySelector('[role="columnheader"]'))
      .slice(0, LIGNES_MAX)
      .map(r => Array.from(r.querySelectorAll('[role="gridcell"], [role="cell"], [role="rowheader"]')).map(c => propre(c.textContent)).slice(0, CELLULES_MAX))
      .filter(l => l.some(c => c.length > 0))
    if (entetes.some(Boolean) && lignes.length) tableaux.push({ entetes, lignes })
  }

  // ── Les mots qui peuvent être un compte ────────────────────────────────
  // Des mots entiers, coupés aux espaces et à la ponctuation, mais pas au
  // point ni au tiret : « PA-APEX-12345-01 » reste un mot, et un prix
  // « 51,423.90 » ne donne jamais « 514239 ».
  const decouper = (texte: string): string[] => texte
    .split(/[\s,;|()[\]{}<>:"'«»/\\]+/)
    .map(m => m.replace(/^[.\-_#]+|[.\-_#]+$/g, ''))
    .filter(m => m.length >= 4 && m.length <= 40 && /\d/.test(m) && (/[A-Za-z]/.test(m) || m.replace(/\D/g, '').length >= 5))
  const unique = (liste: string[], max: number) => [...new Set(liste)].slice(0, max)

  const texteEntier = (document.body?.innerText ?? '').slice(0, 200_000)
  const jetons = unique(decouper(texteEntier), 600)

  const selection: string[] = []
  for (const option of Array.from(document.querySelectorAll('select')).map(s => (s as HTMLSelectElement).selectedOptions?.[0]).filter(Boolean)) {
    selection.push(option!.textContent ?? '')
  }
  for (const el of Array.from(document.querySelectorAll('[aria-selected="true"], [aria-current]:not([aria-current="false"]), [data-selected="true"], [role="combobox"], button[aria-haspopup]')).slice(0, 80)) {
    selection.push(el.textContent ?? '')
  }
  const jetonsSelection = unique(decouper(selection.join(' ').slice(0, 4000)), 120)

  const zones = Array.from(document.querySelectorAll('header, nav, [role="banner"], [class*="account" i], [id*="account" i], [class*="compte" i]')).slice(0, 40)
  const texteCompte = zones.map(z => (z as HTMLElement).innerText ?? z.textContent ?? '').join(' ').replace(/\s+/g, ' ').slice(0, 3000)

  return { tableaux: tableaux.slice(0, 12), jetons, jetonsSelection, texteCompte }
}
