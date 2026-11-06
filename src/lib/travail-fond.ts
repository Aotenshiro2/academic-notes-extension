// Le travail de fond du Carnet (1.8.15) : ce qu'une vue fait seule, sans
// geste de l'élève, quand elle s'ouvre ou quand ses notes se relisent :
//   - le rattrapage de la synchronisation (notes restées « à synchroniser ») ;
//   - les compteurs d'activité vers le journal (au plus un essai par 15 min) ;
//   - la note « Mentorat AOK » créée, ou désépinglée, selon le droit du compte.
// Avant la 1.8.15, seul le panneau latéral le faisait : un plein écran ouvert
// seul ne rattrapait rien. Maintenant les deux vues savent le faire, mais UNE
// SEULE le fait à la fois : deux vues ouvertes ensemble auraient synchronisé
// deux fois les mêmes notes et pu créer deux notes « Mentorat AOK ».
//
// Le verrou : navigator.locks (Web Locks), partagé par toutes les pages de
// l'extension (même origine). La première vue ouverte le prend ; la suivante
// attend, sans minuterie ; quand la première se ferme, le navigateur lâche son
// verrou et la suivante le reçoit, puis fait le travail à son tour. Rien à
// nettoyer : un verrou ne survit pas à la page qui le tient (un drapeau dans
// chrome.storage, lui, resterait posé après un plantage).
//
// Règle pure, testée dans tests/travail-fond.test.ts avec un faux LockManager.
// Le branchement dans les vues : lib/use-travail-fond.ts.

export const VERROU_TRAVAIL_FOND = 'carnet-travail-de-fond'

/** Ce qu'il faut de navigator.locks (LockManager), pour pouvoir le remplacer dans les tests. */
export interface Verrous {
  request(nom: string, options: { signal?: AbortSignal }, rappel: () => Promise<void>): Promise<unknown>
}

/**
 * Prend le verrou du travail de fond pour cette vue. Libre : `quandAcquis`
 * aussitôt. Tenu par une autre vue : la demande attend son tour et passe quand
 * l'autre vue se ferme. Rend la fonction qui lâche le verrou, ou retire la
 * demande pas encore servie (vue démontée).
 *
 * Sans Web Locks (navigateur trop ancien) : la vue travaille, comme le panneau
 * le faisait avant la 1.8.15.
 */
export function prendreTravailDeFond(verrous: Verrous | null | undefined, quandAcquis: () => void): () => void {
  if (!verrous) {
    quandAcquis()
    return () => {}
  }
  const arret = new AbortController()
  let lacher: () => void = () => {}
  const tenu = new Promise<void>(resoudre => { lacher = resoudre })
  verrous
    .request(VERROU_TRAVAIL_FOND, { signal: arret.signal }, async () => {
      quandAcquis()
      // Tenu tant que la vue vit : la page qui se ferme le lâche d'elle-même.
      await tenu
    })
    .catch(() => { /* demande retirée avant d'être servie */ })
  return () => {
    arret.abort()
    lacher()
  }
}
