// Le panneau prend les demandes du menu du clic droit (1.9.1). Les règles :
// demandes-panneau.ts. Un panneau déjà ouvert les voit arriver, un panneau
// qui s'ouvre (le service worker vient de l'ouvrir sur le clic) lit celle qui
// l'attend. Chaque demande n'est traitée qu'une fois, par le panneau de sa
// fenêtre.
import { useEffect, useRef } from 'react'
import { CLE_DEMANDE_PANNEAU, cleDemande, demandeValide, type DemandePanneau } from './demandes-panneau'

export function useDemandesPanneau(traiter: (demande: DemandePanneau) => Promise<void> | void): void {
  // Toujours la dernière version du traitement : il lit la note ouverte
  const traiterRef = useRef(traiter)
  traiterRef.current = traiter

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return
    let actif = true
    let fenetre: number | null = null
    const dejaTraitees = new Set<string>()

    const prendre = async (valeur: unknown) => {
      const demande = demandeValide(valeur, Date.now(), fenetre)
      if (!demande || !actif) return
      const cle = cleDemande(demande)
      if (dejaTraitees.has(cle)) return
      dejaTraitees.add(cle)
      try {
        await chrome.storage.session.remove(CLE_DEMANDE_PANNEAU)
      } catch { /* la demande expirera d'elle-même */ }
      try {
        await traiterRef.current(demande)
      } catch (error) {
        console.error('[Panneau] Demande du menu non traitée :', error)
      }
    }

    const surChangement = (changes: Record<string, chrome.storage.StorageChange>, zone: string) => {
      if (zone !== 'session') return
      const nouvelle = changes[CLE_DEMANDE_PANNEAU]?.newValue
      if (nouvelle) void prendre(nouvelle)
    }

    void (async () => {
      try {
        fenetre = (await chrome.windows.getCurrent()).id ?? null
      } catch { /* fenêtre inconnue : on ne filtre pas */ }
      if (!actif) return
      chrome.storage.onChanged.addListener(surChangement)
      try {
        const lu = await chrome.storage.session.get(CLE_DEMANDE_PANNEAU)
        void prendre(lu[CLE_DEMANDE_PANNEAU])
      } catch { /* rien en attente */ }
    })()

    return () => {
      actif = false
      chrome.storage.onChanged.removeListener(surChangement)
    }
  }, [])
}
