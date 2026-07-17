// Réglage « afficher les métadonnées de capture » (blocs type 'meta').
// OFF par défaut (décision Brice 17/07) — le réglage vit dans les paramètres
// globaux de l'extension, et la vue note réagit en direct via l'event.
const KEY = 'carnet-show-meta'
const EVT = 'carnet-show-meta-change'

export function getShowMeta(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setShowMeta(value: boolean): void {
  try { localStorage.setItem(KEY, value ? '1' : '0') } catch { /* best-effort */ }
  window.dispatchEvent(new Event(EVT))
}

export function subscribeShowMeta(cb: (value: boolean) => void): () => void {
  const handler = () => cb(getShowMeta())
  window.addEventListener(EVT, handler)
  return () => window.removeEventListener(EVT, handler)
}
