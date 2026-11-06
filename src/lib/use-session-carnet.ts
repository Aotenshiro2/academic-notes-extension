import { useCallback, useEffect, useState } from 'react'
import { getSession } from './auth'
import { fetchAccesCaptureIA } from './sync'

/**
 * Qui est connecté, pour le pied et le menu de la roue (1.8.15 : partagé par
 * le panneau latéral et le plein écran). Rien ne tourne en fond : la vue relit
 * la session quand elle recharge ses notes et au retour de l'écran Compte.
 * Sans ça, on se connectait et le pied continuait d'afficher « Visiteur »
 * jusqu'à la prochaine ouverture.
 *
 * `connecte` vaut null tant que la session n'a pas été lue.
 */
export function useSessionCarnet() {
  const [connecte, setConnecte] = useState<boolean | null>(null)
  // L'email du compte connecté, en tête du menu de la roue : plusieurs emails
  // coexistent (perso, aoknowledge, celui du Skool), et se tromper de compte
  // veut dire synchroniser dans le mauvais journal.
  const [email, setEmail] = useState<string | null>(null)

  const relireSession = useCallback(() => {
    getSession()
      .then(s => { setConnecte(!!s); setEmail(s?.user?.email ?? null) })
      .catch(() => { setConnecte(false); setEmail(null) })
  }, [])

  return { connecte, email, relireSession }
}

export interface AccesCompte {
  /** Le serveur a répondu pour cette connexion (sinon : rien n'est décidé sur la note du mentorat). */
  lu: boolean
  /** « Approfondir » et le mentorat sont ouverts. */
  etude: boolean
  /** La capture intelligente passe par l'IA ET il reste du budget : l'aura s'allume. */
  captureIa: boolean
}

/**
 * Ce à quoi le compte a droit (1.8.0), une question au serveur à chaque
 * connexion lue, pas plus. Ces drapeaux ne servent QU'À AFFICHER (aura,
 * cadenas) et à décider de la note « Mentorat AOK » : le serveur re-vérifie le
 * droit et le budget à chaque appel. Partagé par les deux vues depuis la 1.8.15.
 */
export function useAccesCompte(connecte: boolean | null, modeleEtude: string | null | undefined): AccesCompte {
  const [acces, setAcces] = useState<AccesCompte>({ lu: false, etude: false, captureIa: false })
  useEffect(() => {
    if (connecte !== true) {
      setAcces({ lu: false, etude: false, captureIa: false })
      return
    }
    let vivant = true
    setAcces(a => ({ ...a, lu: false }))
    fetchAccesCaptureIA(modeleEtude ?? null)
      .then(({ acces: reponse }) => {
        if (!vivant || !reponse) return
        setAcces({ lu: true, etude: Boolean(reponse.etude), captureIa: Boolean(reponse.capture && reponse.autorise) })
      })
      .catch(() => { /* hors ligne : rien ne change, le serveur tranchera */ })
    return () => { vivant = false }
    // La préférence de modèle ne relance pas la question : seule la connexion le fait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecte])
  return acces
}
