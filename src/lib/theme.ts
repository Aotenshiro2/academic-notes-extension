// Thème de l'interface (clair, sombre, système), partagé par le panneau latéral
// et le plein écran (1.8.15). Un seul réglage stocké (localStorage « theme »,
// le même depuis toujours) : le plein écran reprend donc le thème du panneau.
// Avant la 1.8.15, seul le bouton du pied du panneau l'appliquait, et le plein
// écran, qui n'a pas ce bouton, restait clair.

export type Theme = 'light' | 'dark' | 'system'

export const CLE_THEME = 'theme'

/** Valeur stockée, ramenée à un thème connu ; 'system' par défaut, comme le panneau. */
export function themeDepuis(valeur: string | null | undefined): Theme {
  return valeur === 'light' || valeur === 'dark' || valeur === 'system' ? valeur : 'system'
}

/** Le thème donne-t-il un affichage sombre ? 'system' suit la préférence de l'appareil. */
export function estSombre(theme: Theme, systemeSombre: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemeSombre)
}

export function themeEnregistre(): Theme {
  try { return themeDepuis(localStorage.getItem(CLE_THEME)) } catch { return 'system' }
}

export function appliquerTheme(theme: Theme): void {
  const systemeSombre = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', estSombre(theme, systemeSombre))
}

/**
 * Applique le thème enregistré, puis suit ses changements faits dans une autre
 * vue (l'événement « storage » arrive quand le panneau change le réglage).
 * Rend la fonction qui arrête l'écoute.
 */
export function suivreTheme(): () => void {
  appliquerTheme(themeEnregistre())
  const surChangement = (e: StorageEvent) => {
    if (e.key === CLE_THEME) appliquerTheme(themeDepuis(e.newValue))
  }
  window.addEventListener('storage', surChangement)
  return () => window.removeEventListener('storage', surChangement)
}
