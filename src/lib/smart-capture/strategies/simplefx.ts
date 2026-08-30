import type { SiteStrategy, SiteExtractResult } from '../types'

/**
 * SimpleFX WebTrader — 5e site le plus capturé du carnet (11 captures dans la
 * base au 30/08/2026) et, jusqu'ici, AUCUNE stratégie : les captures tombaient
 * sur le fallback générique, qui exige un <article> ou un <main> qu'une webapp
 * de trading n'a pas. Résultat, du déchet.
 *
 * Ce qui compte sur cette page : l'état du compte, l'instrument affiché, et
 * surtout les TABLEAUX de positions (ouvertes, en attente, clôturées) que
 * l'élève consulte en séance. Ces tableaux se lisent dans le DOM ; inutile de
 * déclencher l'export CSV du site, qui partirait sur le disque et demanderait
 * la permission `downloads` plus l'accès aux URL de fichier.
 *
 * Le lecteur de tableaux ci-dessous est volontairement générique : il servira
 * aussi à Tradovate, TopStepX et aux plateformes suivantes. Tout doit rester
 * dans cette fonction : chrome.scripting.executeScript injecte le corps, pas
 * les imports.
 */
function extractSimpleFX(): SiteExtractResult {
  try {
    const propre = (s: string | null | undefined): string =>
      (s ?? '').replace(/\s+/g, ' ').trim()

    // ── Lecteur de tableaux générique ────────────────────────────────────
    // Rend { entetes, lignes, total, lues }. Gère les vrais <table> et les
    // grilles ARIA (role="grid"), qui sont la norme sur les webapps de
    // trading. `total` vient d'un compteur d'onglet quand on en trouve un :
    // c'est ce qui permet de dire « 2 lignes lues sur 10 » au lieu de laisser
    // croire qu'on a tout vu.
    const lireTableau = (racine: Element): { entetes: string[]; lignes: string[][] } | null => {
      const table = racine.querySelector('table') ?? (racine.matches('table') ? racine : null)
      if (table) {
        const entetes = Array.from(table.querySelectorAll('thead th, thead td'))
          .map(c => propre(c.textContent))
          .filter(Boolean)
        const lignes = Array.from(table.querySelectorAll('tbody tr'))
          .map(tr => Array.from(tr.querySelectorAll('td, th')).map(c => propre(c.textContent)))
          .filter(l => l.some(c => c.length > 0))
        if (lignes.length) return { entetes, lignes }
      }

      // Grille ARIA
      const grille = racine.querySelector('[role="grid"], [role="table"]')
      if (grille) {
        const rangees = Array.from(grille.querySelectorAll('[role="row"]'))
        const cellules = (r: Element) =>
          Array.from(r.querySelectorAll('[role="gridcell"], [role="cell"], [role="columnheader"]'))
            .map(c => propre(c.textContent))
        const premieres = rangees[0] ? cellules(rangees[0]) : []
        const estEntete = rangees[0]?.querySelector('[role="columnheader"]') !== null
        const lignes = rangees
          .slice(estEntete ? 1 : 0)
          .map(cellules)
          .filter(l => l.some(c => c.length > 0))
        if (lignes.length) return { entetes: estEntete ? premieres : [], lignes }
      }
      return null
    }

    // ── Compteurs d'onglets : OUVRIR (0) · EN ATTENTE (0) · CLÔTURÉ (10) ──
    const compteurs: Record<string, number> = {}
    const texteEntier = document.body?.innerText ?? ''
    const motifsOnglets: [string, RegExp][] = [
      ['ouvertes', /OUVRIR\s*\(?\s*(\d+)/i],
      ['en_attente', /EN\s+ATTENTE\s*\(?\s*(\d+)/i],
      ['cloturees', /CL[ÔO]TUR[ÉE]E?S?\s*\(?\s*(\d+)/i],
    ]
    for (const [cle, motif] of motifsOnglets) {
      const m = texteEntier.match(motif)
      if (m) compteurs[cle] = Number(m[1])
    }

    // ── État du compte ───────────────────────────────────────────────────
    const compte = propre(texteEntier.match(/Compte\s+([\w#]+(?:\s+#\w+)?)/i)?.[1] ?? '')
    const solde = propre(texteEntier.match(/(?:R[ÉE]EL|DEMO)\s+([\d\s.,]+\s*[A-Z]{3})/i)?.[1] ?? '')
    const pieces = propre(texteEntier.match(/([\d.]{6,})\s*(?:\n|\s)*Pi[èe]ces\s+SFX/i)?.[1] ?? '')

    // ── Instrument affiché ───────────────────────────────────────────────
    const titre = document.title || 'SimpleFX'
    let instrument = propre(
      document.querySelector('[class*="instrument"], [class*="symbol"], [data-symbol]')?.textContent ?? ''
    )
    if (!instrument) {
      const m = texteEntier.match(/\b(US(?:A)?\s?\d{2,3}|NAS\d+|GER\d+|EUR\/USD|GBP\/USD|XAU\/USD|BTC\/USD|[A-Z]{3}\/[A-Z]{3})\b/)
      if (m) instrument = propre(m[1])
    }
    const ferme = /\bFERM[ÉE]\b/i.test(texteEntier)

    // ── Période filtrée ──────────────────────────────────────────────────
    const periode = propre(
      texteEntier.match(/Depuis\s+([\d/.]+)\s*\n?\s*[ÀA]\s+([\d/.]+)/i)?.slice(1, 3).join(' au ') ?? ''
    )

    // ── Le tableau de positions ──────────────────────────────────────────
    // On cherche le conteneur qui porte les en-têtes attendues plutôt que de
    // prendre le premier tableau venu : la page en contient plusieurs.
    let tableau: { entetes: string[]; lignes: string[][] } | null = null
    const candidats = Array.from(document.querySelectorAll('table, [role="grid"], [role="table"]'))
    for (const c of candidats) {
      const lu = lireTableau(c)
      if (!lu) continue
      const enTexte = lu.entetes.join(' ').toLowerCase()
      if (/instrument|direction|taille|ouverture|profit/.test(enTexte)) {
        tableau = lu
        break
      }
      // Sinon on garde le plus fourni, faute de mieux.
      if (!tableau || lu.lignes.length > tableau.lignes.length) tableau = lu
    }

    // ── Rendu ────────────────────────────────────────────────────────────
    const bloc: string[] = []
    bloc.push('[DONNÉES EXTRAITES MÉCANIQUEMENT — ne pas recalculer]')
    if (compte) bloc.push(`Compte : ${compte}${solde ? ` — solde ${solde}` : ''}`)
    if (pieces) bloc.push(`Pièces SFX : ${pieces}`)
    if (instrument) bloc.push(`Instrument affiché : ${instrument}${ferme ? ' — marché FERMÉ' : ''}`)
    if (periode) bloc.push(`Période filtrée : ${periode}`)

    const onglets = Object.entries(compteurs).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ')
    if (onglets) bloc.push(`Onglets de positions : ${onglets}`)

    let lues = 0
    if (tableau && tableau.lignes.length) {
      lues = tableau.lignes.length
      bloc.push('')
      if (tableau.entetes.length) bloc.push(`| ${tableau.entetes.join(' | ')} |`)
      for (const l of tableau.lignes.slice(0, 60)) bloc.push(`| ${l.join(' | ')} |`)
      const annonce = compteurs.cloturees ?? 0
      if (annonce && annonce > lues) {
        bloc.push('')
        bloc.push(`${lues} lignes lues sur ${annonce} annoncées : les autres sont hors de la zone visible et n'ont pas été extraites.`)
      }
    } else {
      bloc.push('')
      bloc.push("Aucun tableau de positions lisible dans la page au moment de la capture.")
    }

    const content = bloc.join('\n')
    const keyPoints: string[] = []
    if (instrument) keyPoints.push(`Instrument : ${instrument}${ferme ? ' (marché fermé)' : ''}`)
    if (solde) keyPoints.push(`Solde du compte : ${solde}`)
    if (onglets) keyPoints.push(`Positions : ${onglets}`)
    if (lues) keyPoints.push(`${lues} ligne${lues > 1 ? 's' : ''} de position extraite${lues > 1 ? 's' : ''}`)

    return {
      success: true,
      pageTitle: instrument ? `SimpleFX — ${instrument}` : titre,
      content,
      summary: [compte && `Compte ${compte}`, solde && `solde ${solde}`, instrument, periode && `période ${periode}`]
        .filter(Boolean)
        .join(' · '),
      keyPoints,
      concepts: [],
      tags: ['simplefx', instrument ? instrument.toLowerCase().replace(/\s+/g, '') : 'plateforme'].filter(Boolean),
      siteName: 'SimpleFX',
      extras: { compteurs, lignesLues: lues, entetes: tableau?.entetes ?? [] },
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export const simpleFxStrategy: SiteStrategy = {
  id: 'simplefx',
  label: 'SimpleFX',
  match: (url: string) => /simplefx\.com/i.test(url),
  priority: 20,
  func: extractSimpleFX,
}
