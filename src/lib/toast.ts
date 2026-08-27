// Notifications in-app qui remplacent les alert() natifs. Chrome permet de
// supprimer les boîtes de dialogue d'une page (« ne plus afficher ce type de
// boîte ») : chez un élève qui a coché ça, tous les alert() deviennent
// silencieux — le message d'erreur n'existe plus. Même racine que le bug des
// confirm() (réglé par ConfirmDialog). Ici pas d'action à bloquer, un toast
// suffit. Module impératif sans provider : utilisable depuis le sidepanel ET
// le fullscreen sans câblage React.

type ToastKind = 'success' | 'error' | 'info'

let container: HTMLDivElement | null = null

function getContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container
  container = document.createElement('div')
  container.className =
    'fixed bottom-16 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none'
  document.body.appendChild(container)
  return container
}

function show(kind: ToastKind, message: string, durationMs: number) {
  const tone =
    kind === 'error'
      ? 'border-red-500/40 text-red-600 dark:text-red-400'
      : kind === 'success'
        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
        : 'border-border text-foreground'

  const el = document.createElement('div')
  el.className = `pointer-events-auto max-w-[320px] px-3 py-2 rounded-lg border bg-card shadow-lg text-sm leading-snug cursor-pointer transition-opacity duration-300 ${tone}`
  el.textContent = message
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  getContainer().appendChild(el)

  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 300)
  }
  const timer = setTimeout(remove, durationMs)
  el.addEventListener('click', () => {
    clearTimeout(timer)
    remove()
  })
}

export const toast = {
  success: (message: string) => show('success', message, 4000),
  info: (message: string) => show('info', message, 4000),
  // Les erreurs restent plus longtemps : c'est le seul canal restant
  error: (message: string) => show('error', message, 7000),
}
