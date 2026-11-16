import { useCallback, useEffect, useState } from 'react'
import { envoyerCode, type OptionsEnvoi } from './auth'
import { cleAdresse, DELAI_RENVOI_S, type Envoi } from './connexion-adresse'

// L'envoi du code de connexion et son décompte (16/11/2026, repris du site :
// hooks/useEnvoiCode.ts et useDecompteRenvoi.ts). Un nouvel email annule le
// code du précédent : après un envoi réussi, ou un refus « un email vient de
// partir », « Renvoyer » attend le temps demandé (60 s par défaut) pour CETTE
// adresse.

/**
 * Décompte avant de pouvoir redemander un email. La minuterie d'une seconde
 * ne tourne QUE pendant le décompte (60 s au plus d'ordinaire), puis s'arrête :
 * c'est un affichage au geste, pas une relecture en fond. `cle` : l'adresse
 * concernée (l'écran débloque le bouton si l'adresse tapée change).
 */
export function useDecompteRenvoi() {
  const [fin, setFin] = useState<{ a: number; cle: string } | null>(null)
  const [maintenant, setMaintenant] = useState(0)

  useEffect(() => {
    if (!fin) return
    const id = window.setInterval(() => {
      const t = Date.now()
      if (t >= fin.a) setFin(null)
      else setMaintenant(t)
    }, 1000)
    return () => window.clearInterval(id)
  }, [fin])

  const lancer = useCallback((secondes: number, cle = '') => {
    const t = Date.now()
    setMaintenant(t)
    setFin({ a: t + secondes * 1000, cle })
  }, [])

  const restant = fin ? Math.max(0, Math.ceil((fin.a - maintenant) / 1000)) : 0
  return { restant, cle: fin && restant > 0 ? fin.cle : null, lancer }
}

export type EtatEnvoi = { email: string; envoi: 'attente' | Envoi }

export function useEnvoiCode() {
  const decompte = useDecompteRenvoi()
  const lancer = decompte.lancer
  const [etat, setEtat] = useState<EtatEnvoi | null>(null)

  const envoyer = useCallback(async (email: string, o?: OptionsEnvoi): Promise<Envoi> => {
    const adresse = email.trim()
    setEtat({ email: adresse, envoi: 'attente' })
    const r = await envoyerCode(adresse, o)
    setEtat({ email: adresse, envoi: r })
    if (r.t === 'ok') lancer(DELAI_RENVOI_S, cleAdresse(adresse))
    else if (r.t === 'delai') lancer(r.secondes, cleAdresse(adresse))
    return r
  }, [lancer])

  /** Secondes avant de pouvoir renvoyer à cette adresse (0 : tout de suite). */
  const restant = (email: string) => (decompte.cle === cleAdresse(email) ? decompte.restant : 0)

  /** Un email est-il déjà parti à cette adresse il y a moins d'une minute ? (Revenir sur l'adresse ne renvoie rien.) */
  const dejaParti = (email: string) =>
    restant(email) > 0 && etat !== null && cleAdresse(etat.email) === cleAdresse(email) && etat.envoi !== 'attente'

  return { etat, envoyer, restant, dejaParti }
}
