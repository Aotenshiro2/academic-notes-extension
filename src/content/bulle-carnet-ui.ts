// La bulle « Ouvrir le Carnet » dans la page (1.9.2). Les règles, la liste
// de départ et le rôle de chacun : lib/bulle-carnet.ts.
//
// Importé par le SEUL content script (script classique) : Vite le fond dedans.
// Aucun import runtime ici, seulement des `import type`.
//
// La bulle vit dans un Shadow DOM fermé : la page ne la style pas et ne la lit
// pas. En bas à droite, petite, sans animation. Elle s'efface quand une
// fenêtre de la plateforme (dialogue, modale) passe sur sa place, et revient
// quand la fenêtre se ferme : vérifié au geste (clic, touche), sans minuterie.
import type { TextesBulle } from '@/lib/bulle-carnet'

/**
 * Copie de `hoteDansListe` (lib/bulle-carnet.ts), comparée à l'original dans
 * tests/bulle-carnet.test.ts. Les entrées sont déjà normalisées à l'écriture.
 */
export function surUnSiteDeLaListe(hostname: string, sites: unknown): boolean {
  if (!Array.isArray(sites)) return false
  const h = String(hostname ?? '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  if (!h) return false
  return sites.some(s => typeof s === 'string' && (h === s || h.endsWith('.' + s)))
}

/** Au chargement de la page : lire la liste, demander, afficher. */
export async function proposerLaBulle(): Promise<void> {
  if (window.top !== window) return
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  let reglages: { actif?: boolean; sites?: unknown } | undefined
  try {
    reglages = (await chrome.storage.local.get('bulleCarnet')).bulleCarnet
  } catch { return }
  if (!reglages || reglages.actif === false || !surUnSiteDeLaListe(location.hostname, reglages.sites)) return
  let reponse: { proposer?: boolean; textes?: TextesBulle } | undefined
  try {
    reponse = await chrome.runtime.sendMessage({ type: 'BULLE_CARNET_DEMANDE' })
  } catch { return }
  if (reponse?.proposer && reponse.textes) afficherBulle(reponse.textes)
}

const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'

// Aux couleurs du Carnet (sidepanel/index.css, boutons bleus du warmup),
// clair ou sombre selon le système.
const CSS = `
.bulle { box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; max-width: 300px;
  padding: 10px 8px 10px 12px; border-radius: 10px; border: 1px solid #bdc2c7;
  background: #f1f3f4; color: #22252a; box-shadow: 0 4px 14px rgba(0, 0, 0, .12);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left; }
.bulle[hidden] { display: none; }
.icone { flex: none; width: 18px; height: 18px; margin-top: 1px; color: #2563eb; }
.corps { flex: 1; min-width: 0; }
.titre { margin: 0 0 7px; font-size: 12px; font-weight: 600; color: #6c737e; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.texte { margin: 0; }
.texte[hidden], .actions[hidden] { display: none; }
button { all: unset; box-sizing: border-box; cursor: pointer; font: inherit; }
.ouvrir { display: inline-block; padding: 5px 10px; border-radius: 6px; background: #2563eb; color: #fff;
  font-size: 12.5px; font-weight: 600; }
.ouvrir:hover { background: #1d4ed8; }
.lien { font-size: 12px; color: #6c737e; text-decoration: underline; text-underline-offset: 2px; }
.lien:hover { color: #22252a; }
.fermer { flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin-top: -3px;
  border-radius: 5px; color: #6c737e; font-size: 17px; line-height: 1; }
.fermer:hover { background: rgba(0, 0, 0, .06); color: #22252a; }
button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .bulle { background: #202124; color: #f1f2f4; border-color: #3a3c41; box-shadow: 0 4px 14px rgba(0, 0, 0, .45); }
  .icone { color: #60a5fa; }
  .titre, .lien, .fermer { color: #9ea4ad; }
  .lien:hover, .fermer:hover { color: #f1f2f4; }
  .fermer:hover { background: rgba(255, 255, 255, .08); }
  .ouvrir { background: #60a5fa; color: #0f172a; }
  .ouvrir:hover { background: #93c5fd; }
  button:focus-visible { outline-color: #60a5fa; }
}`

// Les fenêtres de la plateforme : la bulle ne passe jamais par-dessus.
const FENETRES = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'

function sousUneFenetre(place: DOMRect): boolean {
  for (const el of Array.from(document.querySelectorAll(FENETRES))) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.left < place.right && r.right > place.left && r.top < place.bottom && r.bottom > place.top) return true
  }
  return false
}

function afficherBulle(textes: TextesBulle): void {
  if (document.querySelector('[data-carnet-bulle]')) return
  const hote = document.createElement('div')
  hote.setAttribute('data-carnet-bulle', '')
  for (const [propriete, valeur] of [
    ['all', 'initial'], ['position', 'fixed'], ['right', '16px'], ['bottom', '16px'],
    ['z-index', '2147483000'], ['display', 'block'],
  ]) hote.style.setProperty(propriete, valeur, 'important')
  const racine = hote.attachShadow({ mode: 'closed' })
  racine.innerHTML = `<style>${CSS}</style>
<div class="bulle" role="region">
  <span class="icone">${ICONE}</span>
  <div class="corps">
    <p class="titre"></p>
    <div class="actions">
      <button type="button" class="ouvrir" data-geste="ouvrir"></button>
      <button type="button" class="lien" data-geste="retirer"></button>
    </div>
    <p class="texte" hidden></p>
  </div>
  <button type="button" class="fermer" data-geste="fermer">&times;</button>
</div>`
  // Les textes passent par textContent : rien n'est interprété
  const q = <T extends Element>(s: string) => racine.querySelector(s) as T
  const bulle = q<HTMLDivElement>('.bulle')
  const actions = q<HTMLDivElement>('.actions')
  const texte = q<HTMLParagraphElement>('.texte')
  bulle.setAttribute('aria-label', textes.titre)
  q<HTMLParagraphElement>('.titre').textContent = textes.titre
  q<HTMLButtonElement>('.ouvrir').textContent = textes.ouvrir
  q<HTMLButtonElement>('.lien').textContent = textes.nePlusProposer
  const fermer = q<HTMLButtonElement>('.fermer')
  fermer.setAttribute('aria-label', textes.fermer)
  fermer.title = textes.fermer

  const montrerTexte = (contenu: string) => {
    actions.hidden = true
    texte.textContent = contenu
    texte.hidden = false
  }

  // Une fenêtre de la plateforme sur la place de la bulle : elle s'efface.
  // Relu à l'image suivant un clic ou une touche, le temps que la plateforme
  // ouvre ou ferme sa fenêtre.
  const replacer = () => { bulle.hidden = false; bulle.hidden = sousUneFenetre(hote.getBoundingClientRect()) }
  const auGeste = (e: Event) => { if (e.target !== hote) requestAnimationFrame(replacer) }
  const retirer = () => {
    hote.remove()
    window.removeEventListener('click', auGeste, true)
    window.removeEventListener('keyup', auGeste, true)
  }

  racine.addEventListener('click', (e) => {
    // Seul un vrai clic du membre compte : la page ne peut pas le simuler
    if (!e.isTrusted) return
    const geste = (e.target as Element | null)?.closest?.('[data-geste]')?.getAttribute('data-geste')
    if (geste === 'fermer') { retirer(); return }
    if (geste === 'ouvrir') {
      // Envoyé tout de suite, dans le geste : le service worker ouvre le panneau
      chrome.runtime.sendMessage({ type: 'BULLE_CARNET_OUVRIR' })
        .then((r: { ok?: boolean } | undefined) => { if (r?.ok) retirer(); else montrerTexte(textes.cliqueIcone) })
        .catch(() => montrerTexte(textes.cliqueIcone))
      return
    }
    if (geste === 'retirer') {
      chrome.runtime.sendMessage({ type: 'BULLE_CARNET_RETIRER' }).catch(() => { /* Carnet rechargé */ })
      montrerTexte(textes.retire)
    }
  })

  ;(document.body ?? document.documentElement).appendChild(hote)
  replacer()
  window.addEventListener('click', auGeste, { capture: true, passive: true })
  window.addEventListener('keyup', auGeste, { capture: true, passive: true })
}
