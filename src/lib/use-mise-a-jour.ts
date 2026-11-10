import { useCallback, useEffect, useState } from 'react'

/**
 * Un Carnet en retard sur le Store (1.8.17, retour de Cédric du 10/11/2026).
 *
 * En séance, le mentor de Cédric s'est arrêté sans rien dire ; il est reparti
 * après « Mettre à jour » dans la page des extensions. Le journal n'annonce
 * aucune version minimale et ses routes ne répondent jamais « version trop
 * ancienne » : le Carnet ne peut pas savoir que sa version est en cause. Ce
 * qu'il peut savoir avec ce qui existe, c'est si le Store a plus récent que
 * lui : `chrome.runtime.requestUpdateCheck`.
 *
 * - On ne le demande qu'après un échec (règle de Brice : au geste, jamais par
 *   minuterie ; Chrome freine de toute façon les demandes répétées).
 * - On écoute `onUpdateAvailable` : Chrome le lève quand la nouvelle version
 *   est téléchargée et n'attend plus que le redémarrage du Carnet, que
 *   `chrome.runtime.reload()` déclenche.
 * - Un Carnet chargé à la main (sans Store) répond « no_update » : rien ne
 *   s'affiche.
 *
 * `version` : null tant que rien n'est disponible ; la version annoncée (ou
 * '' si Chrome ne la donne pas) dès qu'une mise à jour l'est.
 */
export function useMiseAJourCarnet() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    const ecoute = (d: chrome.runtime.UpdateAvailableDetails) => setVersion(d?.version ?? '')
    try { chrome.runtime.onUpdateAvailable.addListener(ecoute) } catch { /* hors extension */ }
    return () => {
      try { chrome.runtime.onUpdateAvailable.removeListener(ecoute) } catch { /* hors extension */ }
    }
  }, [])

  const verifier = useCallback(async () => {
    try {
      const r = await chrome.runtime.requestUpdateCheck()
      if (r?.status === 'update_available') setVersion(r.version ?? '')
    } catch { /* hors extension, ou Chrome refuse : rien à dire */ }
  }, [])

  return { version, verifier }
}

/** Installe la mise à jour téléchargée : le Carnet redémarre, les notes restent. */
export function installerMiseAJour() {
  chrome.runtime.reload()
}
