import type { AcademicNote } from '@/types/academic'

/**
 * Toutes les images d'une note, dans l'ordre d'affichage, pour la visionneuse.
 *
 * Partagé entre le panneau et la vue plein écran : le panneau transmettait
 * autrefois le tableau complet des base64 via chrome.storage.session pour ouvrir
 * la visionneuse en grand — une copie intégrale des images de la note dans un
 * stockage plafonné à 10 Mo. Désormais on ne transmet que l'identifiant de la
 * note et l'index, et chaque vue recompose la liste de son côté.
 */
export function collectNoteImages(note: AcademicNote): string[] {
  const imgs: string[] = []

  note.messages?.forEach(msg => {
    if (msg.type === 'image' || msg.type === 'screenshot' || msg.type === 'capture') {
      imgs.push(msg.content)
    } else if (msg.type === 'text') {
      const matches = msg.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
      for (const m of matches) {
        if (m[1]) imgs.push(m[1])
      }
    }
  })

  note.screenshots?.forEach(s => {
    if (s.dataUrl && !imgs.includes(s.dataUrl)) imgs.push(s.dataUrl)
  })

  // Notes d'avant les blocs : les images ne vivent que dans le HTML historique
  if ((!note.messages || note.messages.length === 0) && note.content) {
    const matches = note.content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
    for (const m of matches) {
      if (m[1] && !imgs.includes(m[1])) imgs.push(m[1])
    }
  }

  return imgs
}
