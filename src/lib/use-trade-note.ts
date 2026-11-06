import { useEffect, useRef } from 'react'
import storage from './storage'
import { toast } from './toast'
import { capturerGraphiqueDuTrade } from './capture-graphique-trade'
import { lancerTrade, noteQuittee } from './trade-note'

/**
 * Le trade de la note, partagé par le panneau latéral et le plein écran (1.8.15).
 * - quitter une note (en ouvrir une autre, revenir à l'accueil) clôt
 *   silencieusement son trade actif ;
 * - `lancer()` démarre un trade dans la note ouverte, ou dans une note de
 *   séance créée à la volée, et capture le graphique sans attendre.
 * Tout part d'un geste : aucune minuterie.
 */
export function useTradeNote(
  noteOuverte: string | null,
  options: {
    /** Une note de séance vient d'être créée pour le trade : la vue l'ouvre. */
    ouvrirNote: (id: string) => void
    /** Relire les notes et rafraîchir la vue de la note. */
    rafraichir: () => void | Promise<void>
  }
) {
  const precedente = useRef<string | null>(null)
  useEffect(() => {
    const quittee = noteQuittee(precedente.current, noteOuverte)
    if (quittee) storage.closeActiveTrade(quittee).catch(() => {})
    precedente.current = noteOuverte
  }, [noteOuverte])

  const lancer = async (): Promise<string | null> => {
    try {
      const { noteId, creee } = await lancerTrade(noteOuverte, {
        maintenant: Date.now,
        enregistrerNote: (note) => storage.saveNote(note),
        demarrerTrade: (id) => storage.startTrade(id),
        // Capture du graphique au lancement (1.8.13) : sans attendre. Pas de
        // capture (réglage coupé, rien qui montre l'actif) : rien, ou un message discret.
        capturerAuLancement: (id, tradeId) => {
          void capturerGraphiqueDuTrade(id, tradeId, 'lancement').then(resultat => {
            if (!resultat) return
            if (resultat.message) toast.info(resultat.message)
            if (resultat.faites > 0) void options.rafraichir()
          })
        },
      })
      if (creee) options.ouvrirNote(noteId)
      await options.rafraichir()
      return noteId
    } catch (error) {
      console.error('Error starting trade:', error)
      return null
    }
  }

  return { lancer }
}
