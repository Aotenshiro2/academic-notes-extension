import type { NoteMessage } from '@/types/academic'

export type DraftMessage = Pick<NoteMessage, 'type' | 'content' | 'metadata'>

/**
 * Découpe le HTML sortant de la barre de capture en blocs typés.
 *
 * Sans ce découpage, une image collée/glissée dans la barre partait dans un
 * message `text` (elle n'était qu'un `<img>` au milieu du HTML) : le bloc
 * n'affichait donc aucune poubelle au survol, et s'il ne contenait QUE l'image,
 * le clic ouvrait la lightbox au lieu de passer en édition — le bloc devenait
 * impossible à supprimer (retour utilisateur 04/08).
 *
 * Même logique de séparation texte/image que les exports PDF et Word.
 */
export function splitHtmlIntoMessages(html: string): DraftMessage[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const messages: DraftMessage[] = []
  let buffer = ''

  // Sérialise un nœud sans casser les entités HTML (un textContent brut
  // réinjecterait « & » ou « < » tels quels dans le HTML du bloc)
  const serialize = (node: Node): string => {
    const holder = doc.createElement('div')
    holder.appendChild(node.cloneNode(true))
    return holder.innerHTML
  }

  const hasVisibleText = (fragment: string): boolean => {
    const holder = doc.createElement('div')
    holder.innerHTML = fragment
    return (holder.textContent || '').trim().length > 0
  }

  const flushText = () => {
    // On jette les fragments sans texte visible (balises vides, <br> orphelins
    // laissés entre deux images par le contentEditable)
    if (hasVisibleText(buffer)) messages.push({ type: 'text', content: buffer })
    buffer = ''
  }

  const walk = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement

        if (element.tagName === 'IMG') {
          flushText()
          const src = element.getAttribute('src')
          if (src) {
            const alt = element.getAttribute('alt')
            messages.push({
              type: 'image',
              content: src,
              ...(alt ? { metadata: { alt } } : {})
            })
          }
          continue
        }

        // Conteneur mixte : on descend pour isoler les images, quitte à aplatir
        // le wrapper — la mise en forme du texte qu'il contient est conservée
        if (element.querySelector('img')) {
          walk(element)
          continue
        }
      }

      buffer += serialize(child)
    }
  }

  walk(doc.body)
  flushText()

  return messages
}

/**
 * Titre d'une note créée depuis la barre de capture : le début du premier bloc
 * texte. Avant le découpage en blocs, le titre était taillé dans le HTML brut —
 * une note ouverte sur une image collée s'appelait « <img src="data:image/png… ».
 */
export function titleFromMessages(messages: DraftMessage[], fallback: string): string {
  const firstText = messages.find(m => m.type === 'text')
  if (!firstText) return fallback

  const holder = document.createElement('div')
  holder.innerHTML = firstText.content
  const plain = (holder.textContent || '').replace(/\s+/g, ' ').trim()
  if (!plain) return fallback

  return plain.length > 50 ? `${plain.slice(0, 50)}...` : plain
}
