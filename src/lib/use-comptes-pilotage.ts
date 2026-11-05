import { useEffect, useState } from 'react'
import type { ListeComptesPilotage } from './pilotage-comptes'
import { ecouterListeComptes, etatComptes, lireListeComptes, userIdCarnet, type EtatComptesPilotage } from './pilotage-api'

/**
 * Les comptes de Pilotage lus par le content script (1.8.13), pour le compte
 * AOK connecté au Carnet. Se met à jour tout seul quand Pilotage, ouvert dans
 * un autre onglet, change sa liste (un compte vient d'y être créé).
 */
export function useComptesPilotage(): EtatComptesPilotage {
  const [liste, setListe] = useState<ListeComptesPilotage | null | undefined>(undefined)
  const [userId, setUserId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let vivant = true
    void lireListeComptes().then(l => { if (vivant) setListe(l) })
    void userIdCarnet().then(u => { if (vivant) setUserId(u) })
    const arreter = ecouterListeComptes(l => { if (vivant) setListe(l) })
    return () => { vivant = false; arreter() }
  }, [])

  if (liste === undefined || userId === undefined) return { etat: 'chargement' }
  return etatComptes(liste, userId)
}
