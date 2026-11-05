import type { ProviderConfig } from '@/lib/analysis-providers'
import { compterFichiers, normaliserTrace, typePage, type TraceInjection } from '@/lib/diagnostic-pur'
import { noterEnvoiIA } from '@/lib/diagnostic-traces'

/** Un fichier à joindre à la conversation (note en PDF, doctrine en markdown…). */
export interface InjectedFile {
  base64: string
  name: string
  mime: string
}

export interface InjectionResult {
  tabId: number
  pdfUploaded: boolean
  promptFilled: boolean
  /** Fichiers non joints parce que la page n'accepte que des images (ChatGPT sans compte). */
  imageOnly: boolean
  /** Fichiers confiés à la page (champ fichier, dépôt, collage) mais aucune
   *  pièce jointe n'est apparue dans la zone de saisie (bug de Flow, 1.8.12). */
  pdfNonVu: boolean
}

/** Ce que rend la fonction injectée : le résultat, et son déroulé pour le diagnostic (1.8.14). */
type ResultatInjection = { pdfUploaded: boolean; promptFilled: boolean; imageOnly: boolean; pdfNonVu: boolean; trace: TraceInjection }

/**
 * Fonction autonome injectée dans la page du provider.
 * Reçoit les sélecteurs en paramètres → provider-agnostique.
 * DOIT être 100% autonome — pas d'imports, pas de closures externes.
 *
 * Plusieurs fichiers peuvent partir ensemble (ex. la note ET la doctrine) : ils sont
 * déposés dans un seul DataTransfer, comme le ferait un glisser-déposer multiple.
 *
 * `trace` (1.8.14, bug de Flow : le PDF ne passe qu'une fois sur 5) : le délai
 * avant stabilité, les champs fichier vus (id, accept) et chaque voie essayée
 * avec son résultat. Rien de la page ni des fichiers : pas de texte, pas de nom.
 */
export async function injectIntoProvider(
  files: { base64: string; name: string; mime: string }[],
  promptText: string,
  fileInputSelectors: string[],
  textareaSelectors: string[],
  uploadTriggerSteps: string[][] | null
): Promise<ResultatInjection> {

  const trace: ResultatInjection['trace'] = { stabiliteMs: null, stabiliteAtteinte: false, declencheurs: null, champsVus: [], voies: [] }

  function findEl(selectors: string[]): HTMLElement | null {
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s)
      if (el) return el
    }
    return null
  }

  function waitFor(selectors: string[], maxAttempts = 10, interval = 800): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      let attempts = 0
      const check = () => {
        const el = findEl(selectors)
        if (el) return resolve(el)
        if (++attempts >= maxAttempts) return resolve(null)
        setTimeout(check, interval)
      }
      check()
    })
  }

  /**
   * Choisit un champ fichier qui accepte RÉELLEMENT un PDF.
   * Les pages IA exposent souvent plusieurs input[type=file], dont un réservé aux
   * images (accept="image/*"). Y déposer un PDF déclenche « le fichier doit être
   * GIF, WebP, PNG ou JPEG » — c'est ce que voyaient les élèves. On préfère donc un
   * input qui mentionne le PDF, sinon un input sans restriction ; jamais un
   * input image-only (dans ce cas on renvoie null → repli sur le glisser-déposer).
   */
  function findFileInput(selectors: string[]): HTMLInputElement | null {
    const seen = new Set<HTMLInputElement>()
    const candidates: HTMLInputElement[] = []
    for (const s of selectors) {
      for (const el of Array.from(document.querySelectorAll(s))) {
        if (el instanceof HTMLInputElement && el.type === 'file' && !seen.has(el)) {
          seen.add(el)
          candidates.push(el)
        }
      }
    }
    const acceptsPdf = candidates.find(i => /pdf/i.test(i.accept || ''))
    if (acceptsPdf) return acceptsPdf
    const unrestricted = candidates.find(i => !(i.accept || '').trim())
    if (unrestricted) return unrestricted
    return null
  }

  /**
   * Vrai quand la page n'expose QUE des champs fichier réservés aux images.
   * C'est ChatGPT sans compte connecté (mode invité, constaté le 08/10/2026) :
   * seules les photos passent, « Ajouter des fichiers » demande une connexion.
   * Le PDF ne peut pas partir, et l'élève doit savoir pourquoi.
   */
  function onlyImageInputs(selectors: string[]): boolean {
    const inputs = selectors
      .flatMap(s => Array.from(document.querySelectorAll(s)))
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'file')
    return inputs.length > 0 && inputs.every(i => {
      const types = (i.accept || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      return types.length > 0 && types.every(t => t.startsWith('image/') || /^\.(png|jpe?g|gif|webp|avif|bmp|heic|heif|svg)$/.test(t))
    })
  }

  function waitForFileInput(selectors: string[], maxAttempts = 10, interval = 800): Promise<HTMLInputElement | null> {
    return new Promise((resolve) => {
      let attempts = 0
      const check = () => {
        const el = findFileInput(selectors)
        if (el) return resolve(el)
        if (++attempts >= maxAttempts) return resolve(null)
        setTimeout(check, interval)
      }
      check()
    })
  }

  function b64ToFile(b64: string, name: string, mime: string): File {
    const raw = atob(b64)
    const arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    return new File([arr], name, { type: mime })
  }

  async function clickTriggerSteps(steps: string[][]): Promise<boolean> {
    for (const stepSelectors of steps) {
      const btn = await waitFor(stepSelectors, 8, 400)
      if (!btn) return false
      btn.click()
      await new Promise(r => setTimeout(r, 600))
    }
    return true
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  /**
   * Attend que la page soit PRÊTE, pas seulement chargée (bug de Flow, 1.8.12).
   * Sur une conversation existante (/c/...), ChatGPT affiche d'abord une zone
   * de saisie, puis recharge le fil et REMPLACE la zone et son champ fichier :
   * un PDF déposé dans le premier champ part dans le vide. On attend donc que
   * la zone de saisie et le champ fichier soient les MÊMES nœuds pendant
   * 1,5 s d'affilée (20 s au plus).
   */
  async function waitUntilSettled(): Promise<boolean> {
    let prevComposer: HTMLElement | null = null
    let prevInput: HTMLInputElement | null = null
    let stableSince = 0
    const start = Date.now()
    while (Date.now() - start < 20000) {
      const composer = findEl(textareaSelectors)
      const input = findFileInput(fileInputSelectors)
      if (composer && composer === prevComposer && input === prevInput) {
        if (stableSince && Date.now() - stableSince >= 1500) return true
        if (!stableSince) stableSince = Date.now()
      } else {
        stableSince = 0
      }
      prevComposer = composer
      prevInput = input
      await sleep(300)
    }
    return false
  }

  /** Les champs fichier de la page, pour le diagnostic : id et accept seulement, 8 au plus. */
  function champsFichier(): { id: string; accept: string }[] {
    const vus: { id: string; accept: string }[] = []
    const deja = new Set<Element>()
    for (const s of fileInputSelectors) {
      for (const el of Array.from(document.querySelectorAll(s))) {
        if (!(el instanceof HTMLInputElement) || el.type !== 'file' || deja.has(el) || vus.length >= 8) continue
        deja.add(el)
        vus.push({ id: (el.id || '').slice(0, 60), accept: (el.accept || '').slice(0, 120) })
      }
    }
    return vus
  }

  /**
   * Compte les endroits de la page qui montrent le nom du fichier (texte, title,
   * aria-label), hors zone de saisie. Une pièce jointe acceptée s'affiche avec son
   * nom ; sur une conversation existante, le même nom peut déjà figurer dans
   * l'historique : on compare donc avant / après.
   */
  function countNameMarks(name: string): number {
    const stem = name.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
    const needle = stem.slice(0, Math.min(stem.length, 16))
    if (!needle) return 0
    const composer = findEl(textareaSelectors)
    let n = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!parent || (composer && composer.contains(parent))) continue
      if (parent.closest('script,style,noscript')) continue
      if ((node.nodeValue || '').toLowerCase().includes(needle)) n++
    }
    for (const el of Array.from(document.querySelectorAll('[title],[aria-label]'))) {
      const v = ((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase()
      if (v.includes(needle)) n++
    }
    return n
  }

  async function waitForAttachment(name: string, baseline: number, ms: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (countNameMarks(name) > baseline) return true
      await sleep(300)
    }
    return false
  }

  function makeTransfer(): DataTransfer {
    const dt = new DataTransfer()
    for (const f of files) dt.items.add(b64ToFile(f.base64, f.name, f.mime))
    return dt
  }

  // --- Upload des fichiers joints ---

  let pdfUploaded = false
  let imageOnly = false
  let pdfNonVu = false
  if (files.length > 0) {
    const debutStabilite = Date.now()
    trace.stabiliteAtteinte = await waitUntilSettled()
    trace.stabiliteMs = Date.now() - debutStabilite

    // Cliquer les triggers pour révéler le file input (Gemini, Claude, Grok…)
    if (uploadTriggerSteps && uploadTriggerSteps.length > 0 && !findFileInput(fileInputSelectors)) {
      trace.declencheurs = await clickTriggerSteps(uploadTriggerSteps)
      await sleep(800)
    }
    trace.champsVus = champsFichier()

    const watched = files[0].name
    const baseline = countNameMarks(watched)
    let handed = false

    // Trois manières de donner le fichier, dans l'ordre, et on s'arrête dès
    // que la pièce jointe se VOIT : (1) le champ fichier qu'on trouve, (2) le
    // même geste sur le champ du moment s'il a été remplacé, (3) un dépôt
    // (glisser-déposer) puis un collage sur la zone de saisie, que ChatGPT
    // écoute aussi. « PDF envoyé » ne s'affiche que si la pièce est visible.
    const attempts: (() => Promise<boolean>)[] = [
      async () => {
        const input = await waitForFileInput(fileInputSelectors)
        if (!input) return false
        input.files = makeTransfer().files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      },
      async () => {
        const input = findFileInput(fileInputSelectors)
        if (!input) return false
        input.value = ''
        input.files = makeTransfer().files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      },
      async () => {
        const composer = findEl(textareaSelectors)
        const target = (composer?.closest('form') as HTMLElement | null) || composer
        if (!target) return false
        const dt = makeTransfer()
        for (const type of ['dragenter', 'dragover', 'drop']) {
          target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
          await sleep(60)
        }
        return true
      },
      async () => {
        const composer = findEl(textareaSelectors)
        if (!composer) return false
        composer.focus()
        composer.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: makeTransfer() }))
        return true
      },
    ]

    // ChatGPT sans compte : champs image seulement, aucun geste ne fera passer
    // le PDF (et un dépôt afficherait une erreur dans la page). On le dit.
    const imagesSeules = !findFileInput(fileInputSelectors) && onlyImageInputs(fileInputSelectors)
    if (imagesSeules) imageOnly = true

    const nomsVoies = ['champ', 'champ-remplace', 'depot', 'collage'] as const
    for (let i = 0; i < attempts.length && !pdfUploaded && !imagesSeules; i++) {
      const debutVoie = Date.now()
      let donne = false
      let erreur = false
      try {
        if (await attempts[i]()) {
          handed = true
          donne = true
          pdfUploaded = await waitForAttachment(watched, baseline, i === 0 ? 6000 : 4000)
        }
      } catch { erreur = true /* manière suivante */ }
      trace.voies.push({ voie: nomsVoies[i], donne, vu: pdfUploaded, ms: Date.now() - debutVoie, ...(erreur ? { erreur: true } : {}) })
    }

    if (!pdfUploaded) pdfNonVu = handed
  }

  // --- Pré-remplir le prompt ---

  let promptFilled = false
  if (promptText) {
    const textarea = await waitFor(textareaSelectors)

    if (textarea) {
      try {
        if (textarea.tagName === 'TEXTAREA') {
          const ta = textarea as HTMLTextAreaElement
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set
          if (setter) setter.call(ta, promptText)
          else ta.value = promptText
          ta.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          // contenteditable div (ProseMirror, React, etc.)
          textarea.focus()
          document.execCommand('selectAll', false)
          document.execCommand('insertText', false, promptText)
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        }
        promptFilled = true
      } catch { /* fallback handled by caller */ }
    }
  }

  return { pdfUploaded, promptFilled, imageOnly, pdfNonVu, trace }
}

type ProgressPhase = 'opening' | 'loading' | 'injecting'

/** Les durées d'un envoi (ms), pour le diagnostic. */
type Durees = { chargement: number | null; attente: number | null; injection: number | null }

/**
 * Ouvre un onglet sur `url`, attend le chargement, puis injecte le contenu.
 * Helper interne partagé entre le mode "nouvelle conversation" et "thread cible".
 * Appelle `onProgress` à chaque phase pour permettre un feedback visuel dans l'UI.
 */
async function openAndInject(
  provider: ProviderConfig,
  files: InjectedFile[],
  promptText: string,
  url: string,
  onProgress?: (phase: ProgressPhase) => void,
  durees?: Durees,
): Promise<InjectionResult & { trace: TraceInjection | null }> {
  const debut = Date.now()
  onProgress?.('opening')
  const tab = await chrome.tabs.create({ url, active: true })
  if (!tab.id) throw new Error(`Failed to create ${provider.label} tab`)
  const tabId = tab.id

  onProgress?.('loading')
  await new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
  if (durees) durees.chargement = Date.now() - debut

  await new Promise(r => setTimeout(r, provider.spaDelay))
  if (durees) durees.attente = provider.spaDelay

  onProgress?.('injecting')
  const debutInjection = Date.now()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectIntoProvider,
    args: [
      files,
      promptText,
      provider.fileInputSelectors,
      provider.textareaSelectors,
      provider.uploadTriggerSteps ?? null,
    ],
  })
  if (durees) durees.injection = Date.now() - debutInjection

  const result = results[0]?.result as Partial<ResultatInjection> | undefined

  return {
    tabId,
    pdfUploaded: result?.pdfUploaded ?? false,
    promptFilled: result?.promptFilled ?? false,
    imageOnly: result?.imageOnly ?? false,
    pdfNonVu: result?.pdfNonVu ?? false,
    trace: result?.trace ?? null,
  }
}

/**
 * Garde le déroulé de l'envoi pour « Envoyer un diagnostic » (1.8.14) : le
 * fournisseur, le genre de page (jamais l'identifiant de la conversation),
 * les fichiers comptés (jamais leur nom), la trace de la page, les durées.
 */
function noterEnvoi(
  provider: ProviderConfig,
  files: InjectedFile[],
  mode: 'prefill' | 'injection' | 'fil',
  adresse: string,
  debut: number,
  durees: Durees,
  r: (Partial<InjectionResult> & { trace?: TraceInjection | null }) | null,
  erreur: string | null,
): void {
  const { page, projet } = typePage(adresse)
  const t = r?.trace ?? null
  const trace = normaliserTrace({
    le: Date.now(),
    fournisseur: provider.id,
    mode,
    page,
    projet,
    fichiers: compterFichiers(files),
    stabilite: t && t.stabiliteMs !== null ? { ms: t.stabiliteMs, atteinte: t.stabiliteAtteinte } : null,
    declencheurs: t?.declencheurs ?? null,
    champsVus: t?.champsVus ?? [],
    voies: t?.voies ?? [],
    pdfUploaded: r?.pdfUploaded ?? false,
    pdfNonVu: r?.pdfNonVu ?? false,
    imageOnly: r?.imageOnly ?? false,
    promptFilled: r?.promptFilled ?? false,
    durees: { ...durees, total: Date.now() - debut },
    erreur,
    repli: false,
  })
  if (trace) void noterEnvoiIA(trace)
}

/** Le résultat rendu à l'appelant, sans la trace. */
function sansTrace(r: InjectionResult & { trace?: unknown }): InjectionResult {
  return { tabId: r.tabId, pdfUploaded: r.pdfUploaded, promptFilled: r.promptFilled, imageOnly: r.imageOnly, pdfNonVu: r.pdfNonVu }
}

/**
 * Ouvre un provider IA et injecte le contenu.
 * Gère prefill URL, injection DOM, et fallback clipboard.
 * Si `threadUrl` est fourni, ouvre cet onglet existant (mode thread) — toujours par injection DOM.
 * En cas d'échec thread, lance THREAD_INJECTION_FAILED pour que l'appelant gère le fallback.
 * `onProgress` permet à l'UI de suivre les phases : 'opening' | 'loading' | 'injecting'.
 */
export async function openProviderWithContent(options: {
  provider: ProviderConfig
  /** Fichiers à joindre, dans l'ordre. Peut contenir la note ET la doctrine. */
  files?: InjectedFile[]
  promptText: string
  threadUrl?: string
  onProgress?: (phase: ProgressPhase) => void
}): Promise<InjectionResult> {
  const { provider, files = [], promptText, threadUrl, onProgress } = options
  const debut = Date.now()
  const durees: Durees = { chargement: null, attente: null, injection: null }

  // Mode thread cible — toujours injection DOM (pas de prefill ?q= sur un thread existant)
  if (threadUrl) {
    try {
      const r = await openAndInject(provider, files, promptText, threadUrl, onProgress, durees)
      noterEnvoi(provider, files, 'fil', threadUrl, debut, durees, r, null)
      return sansTrace(r)
    } catch {
      noterEnvoi(provider, files, 'fil', threadUrl, debut, durees, null, 'fil')
      throw new Error('THREAD_INJECTION_FAILED')
    }
  }

  // Chemin prefill URL (texte seul + provider supporte ?q=)
  if (files.length === 0 && provider.prefillParam && promptText) {
    const encoded = encodeURIComponent(promptText)
    if (provider.prefillMaxLength && encoded.length < provider.prefillMaxLength) {
      const url = `${provider.url}?${provider.prefillParam}=${encoded}`
      const tab = await chrome.tabs.create({ url, active: true })
      const r: InjectionResult = {
        tabId: tab.id ?? 0,
        pdfUploaded: false,
        promptFilled: true,
        imageOnly: false,
        pdfNonVu: false,
      }
      // L'adresse du fournisseur, pas celle qui porte le texte du prompt.
      noterEnvoi(provider, files, 'prefill', provider.url, debut, durees, r, null)
      return r
    }
  }

  // Chemin injection DOM (fichiers joints ou texte long ou provider sans prefill)
  try {
    const r = await openAndInject(provider, files, promptText, provider.url, onProgress, durees)
    noterEnvoi(provider, files, 'injection', provider.url, debut, durees, r, null)
    return sansTrace(r)
  } catch (err) {
    noterEnvoi(provider, files, 'injection', provider.url, debut, durees, null, 'injection')
    throw err
  }
}
