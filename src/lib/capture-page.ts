// « Capturer cette page », la carte de l'accueil : une note neuve avec le
// titre, l'adresse et la capture de l'onglet. Sorti de sidepanel/App.tsx en
// 1.8.15 pour que le plein écran pose EXACTEMENT la même note : le panneau
// capture l'onglet actif, le plein écran l'onglet choisi dans le sélecteur.
// Règle pure, testée dans tests/capture-page.test.ts ; l'optimisation de
// l'image et l'enregistrement : enregistrerNoteDeLaPage (capture-blocs.ts).
import type { AcademicNote } from '../types/academic'

/** Ce qu'il faut de l'onglet (chrome.tabs.Tab en a plus). */
export interface OngletCapture {
  url?: string
  title?: string
  favIconUrl?: string
}

/** Le domaine affiché, sans « www. » ; vide si l'adresse ne se lit pas. */
export function domaineDe(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return ''
  }
}

/** La note de la page, image déjà optimisée (ou rien si la capture a échoué). */
export function noteDeLaPage(onglet: OngletCapture, image: string | null, id: string, maintenant: number): AcademicNote {
  const domaine = domaineDe(onglet.url)
  const titrePage = onglet.title || 'Page sans titre'
  let content = `<p><strong>${titrePage}</strong></p><p><a href="${onglet.url}" target="_blank">${onglet.url}</a></p>`
  if (image) {
    content += `<p><img src="${image}" alt="Capture de ${domaine}" style="max-width:100%; border-radius:8px; margin-top:8px;"/></p>`
  }
  content += '<p></p>'

  return {
    id,
    title: titrePage.slice(0, 50) + (titrePage.length > 50 ? '...' : ''),
    content,
    url: onglet.url || '',
    favicon: onglet.favIconUrl || '',
    timestamp: maintenant,
    type: 'webpage',
    tags: [],
    concepts: [],
    screenshots: [],
    metadata: {
      domain: domaine,
      title: titrePage,
      language: 'fr',
    },
  }
}
