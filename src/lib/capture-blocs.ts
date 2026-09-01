// Les blocs qu'une capture intelligente pose dans la note (01/09/2026).
//
// AVANT : les deux chemins de capture — note vide et note existante — étaient
// écrits deux fois, séparément, et ne faisaient pas la même chose. L'un
// écrivait le résumé sur la NOTE (ce qui l'affichait en carte) PUIS le
// recopiait dans le bloc texte ; l'autre posait le bloc texte AVANT l'image et
// ne touchait jamais aux champs de la note.
//
// D'où les quatre défauts remontés par Brice le 01/09, qui n'en font qu'un :
//   - deux résumés l'un sous l'autre (la carte et sa copie dans le texte) ;
//   - le texte avant l'image à la deuxième capture ;
//   - aucun nouveau point clé quand on recapture dans une note ouverte ;
//   - « Approfondir » qui n'existait que si la note avait DÉMARRÉ par une
//     capture, puisqu'il pendait au résumé de la note.
//
// MAINTENANT : une seule fonction pose la même séquence, à chaque fois.
//
//   1. l'image         — ce qu'on a capturé
//   2. les points clés — ce qu'il y a à retenir
//   3. le résumé       — la substance, en prose
//   4. le texte        — la page elle-même
//
// Ordre voulu par Brice : « image, points clés, résumé ». On voit d'abord ce
// qu'on a pris, puis ce qu'il faut en garder, puis le développé. Quatre
// captures dans une note donnent donc quatre fois la même mise en page,
// séparées par ce que l'élève a écrit entre-temps.
//
// Tout est en blocs `text` (sauf les images) : ils restent donc MODIFIABLES,
// exportables et synchronisés comme n'importe quel bloc. Brice demandait à
// pouvoir corriger les points clés ; ils le deviennent sans machinerie neuve.
//
// Ce que cette fonction NE FAIT PAS : recopier le résumé et les points clés
// dans le bloc de texte. Ils vivent UNE fois, dans leur bloc. Le bloc de texte
// porte la page, c'est son seul travail — et c'est lui que l'élève retouche.
import storage from './storage'
import type { CaptureEnrichie } from './capture-ia'

/** Les champs du modèle sont du texte, pas du HTML : on les échappe avant de
 *  les coudre dans un bloc. Le contenu de la page, lui, EST du HTML et passe
 *  tel quel — il est assaini à l'affichage. */
function echapper(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Ce que la stratégie a tiré de la page, au-delà de ce que le modèle en a lu. */
export interface ContenuPage {
  content?: string
  url?: string
  extras?: { images?: { src: string; alt: string }[] }
}

export async function poserBlocsDeCapture(
  noteId: string,
  enrichi: CaptureEnrichie,
  page: ContenuPage,
  screenshotDataUrl: string | null,
  options: { premiere: boolean }
): Promise<void> {
  // Un séparateur uniquement quand la capture s'ajoute à une note déjà écrite.
  // En tête de note il ne séparerait rien, et le titre est déjà affiché.
  if (!options.premiere && enrichi.pageTitle) {
    await storage.addMessageToNote(noteId, {
      type: 'text',
      content: `<hr><p><strong>Capture : ${echapper(enrichi.pageTitle)}</strong></p>`,
    })
  }

  // 1. L'écran.
  if (screenshotDataUrl) {
    await storage.addMessageToNote(noteId, {
      type: 'image',
      content: screenshotDataUrl,
      metadata: { alt: 'Capture de la page' },
    })
  }

  // Les images que la stratégie a extraites (ex. post Skool) font partie de ce
  // qu'on a capturé : elles suivent l'écran, avant la lecture.
  for (const img of page.extras?.images ?? []) {
    await storage.addMessageToNote(noteId, {
      type: 'image',
      content: img.src,
      metadata: { alt: img.alt, sourceUrl: page.url },
    })
  }

  // 2. Ce qu'il y a à retenir, avant le développé.
  if (enrichi.keyPoints.length > 0) {
    const items = enrichi.keyPoints.map(p => `<li>${echapper(p)}</li>`).join('')
    // Pas de titre dans le HTML : c'est le rendu qui le pose, via `bloc`.
    // L'écrire ici l'afficherait deux fois.
    await storage.addMessageToNote(noteId, {
      type: 'text',
      content: `<ul>${items}</ul>`,
      metadata: { bloc: 'points-cles' },
    })
  }

  // 3. La substance en prose.
  if (enrichi.summary) {
    await storage.addMessageToNote(noteId, {
      type: 'text',
      content: `<p>${echapper(enrichi.summary)}</p>`,
      metadata: { bloc: 'resume' },
    })
  }

  // Ce que la lecture n'a pas couvert se dit, il ne se cache pas : c'est la
  // règle du secrétaire depuis la 1.8.0.
  if (enrichi.manquant) {
    await storage.addMessageToNote(noteId, {
      type: 'text',
      content: `<p><em>Non capturé : ${echapper(enrichi.manquant)}</em></p>`,
    })
  }

  // 4. La page. Bloc à part, donc retouchable sans toucher au reste.
  if (page.content?.trim()) {
    await storage.addMessageToNote(noteId, { type: 'text', content: page.content })
  }
}
