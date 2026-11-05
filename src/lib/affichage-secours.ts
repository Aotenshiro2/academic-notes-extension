// « Affichage de secours » (1.8.14), réglage de Paramètres, éteint par défaut.
//
// Le fantôme au survol d'une image revient chez Franky malgré les correctifs
// de la 1.8.11 et de la 1.8.12, et on ne le reproduit pas : une image se peint
// une seconde fois plus haut, par-dessus le texte. C'est sans doute la
// composition de l'affichage sur sa machine (carte graphique, navigateur,
// zoom). Allumé, ce mode pose la classe `affichage-secours` sur <html> du
// panneau, du plein écran et du Guide ; index.css y coupe les transitions et
// les animations, les flous, `will-change`, les transformations au survol et
// les ombres lourdes. Le reste de l'affichage ne change pas.
//
// localStorage, comme show-meta et la langue : la classe se pose AVANT le
// premier rendu (pas d'éclair), et les autres pages de l'extension suivent par
// l'événement `storage`, sans rechargement.
const CLE = 'carnet-affichage-secours'
const EVT = 'carnet-affichage-secours-change'
export const CLASSE_AFFICHAGE_SECOURS = 'affichage-secours'

export function getAffichageSecours(): boolean {
  try { return localStorage.getItem(CLE) === '1' } catch { return false }
}

export function setAffichageSecours(actif: boolean): void {
  try { localStorage.setItem(CLE, actif ? '1' : '0') } catch { /* best-effort */ }
  window.dispatchEvent(new Event(EVT))
}

function poser(): void {
  try { document.documentElement.classList.toggle(CLASSE_AFFICHAGE_SECOURS, getAffichageSecours()) } catch { /* sans DOM */ }
}

/** Pose la classe tout de suite et la tient à jour (ce document et les autres pages de l'extension). */
export function appliquerAffichageSecours(): () => void {
  poser()
  const surStockage = (e: StorageEvent) => { if (e.key === CLE) poser() }
  window.addEventListener(EVT, poser)
  window.addEventListener('storage', surStockage)
  return () => {
    window.removeEventListener(EVT, poser)
    window.removeEventListener('storage', surStockage)
  }
}
