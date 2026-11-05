import type { ExtensionMessage } from '@/types/academic'

/**
 * Un message du panneau au content script d'un onglet (1.8.13), avec un délai
 * au bout duquel on renonce. Jamais d'exception : un onglet sans content script
 * (ouvert avant l'installation ou la mise à jour de l'extension, page interne
 * de Chrome) ou qui ne répond pas donne null.
 */
export function messageAOnglet<T>(tabId: number, message: ExtensionMessage, delaiMs = 800): Promise<T | null> {
  return new Promise(resolve => {
    let fini = false
    const finir = (valeur: T | null) => { if (!fini) { fini = true; resolve(valeur) } }
    const minuteur = setTimeout(() => finir(null), delaiMs)
    try {
      chrome.tabs.sendMessage(tabId, message, (reponse: T | undefined) => {
        clearTimeout(minuteur)
        // Lire lastError le marque comme traité (sinon Chrome l'écrit en console).
        if (chrome.runtime.lastError || reponse === undefined) finir(null)
        else finir(reponse ?? null)
      })
    } catch {
      clearTimeout(minuteur)
      finir(null)
    }
  })
}
