import type { ProviderConfig } from '@/lib/analysis-providers'

/** Un fichier à joindre à la conversation (note en PDF, doctrine en markdown…). */
export interface InjectedFile {
  base64: string
  name: string
  mime: string
}

/**
 * Fonction autonome injectée dans la page du provider.
 * Reçoit les sélecteurs en paramètres → provider-agnostique.
 * DOIT être 100% autonome — pas d'imports, pas de closures externes.
 *
 * Plusieurs fichiers peuvent partir ensemble (ex. la note ET la doctrine) : ils sont
 * déposés dans un seul DataTransfer, comme le ferait un glisser-déposer multiple.
 */
async function injectIntoProvider(
  files: { base64: string; name: string; mime: string }[],
  promptText: string,
  fileInputSelectors: string[],
  textareaSelectors: string[],
  uploadTriggerSteps: string[][] | null
): Promise<{ pdfUploaded: boolean; promptFilled: boolean }> {

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

  // --- Upload des fichiers joints ---

  let pdfUploaded = false
  if (files.length > 0) {
    // Cliquer les triggers pour révéler le file input (Gemini, Claude, Grok…)
    if (uploadTriggerSteps && uploadTriggerSteps.length > 0 && !findFileInput(fileInputSelectors)) {
      await clickTriggerSteps(uploadTriggerSteps)
      await new Promise(r => setTimeout(r, 800))
    }

    const fileInput = await waitForFileInput(fileInputSelectors)

    if (fileInput) {
      try {
        const dt = new DataTransfer()
        for (const f of files) dt.items.add(b64ToFile(f.base64, f.name, f.mime))
        fileInput.files = dt.files
        fileInput.dispatchEvent(new Event('change', { bubbles: true }))
        fileInput.dispatchEvent(new Event('input', { bubbles: true }))
        pdfUploaded = true
      } catch { /* fallback handled by caller */ }
    }
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

  return { pdfUploaded, promptFilled }
}

type ProgressPhase = 'opening' | 'loading' | 'injecting'

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
  onProgress?: (phase: ProgressPhase) => void
): Promise<{ tabId: number; pdfUploaded: boolean; promptFilled: boolean }> {
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

  await new Promise(r => setTimeout(r, provider.spaDelay))

  onProgress?.('injecting')
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

  const result = results[0]?.result as { pdfUploaded: boolean; promptFilled: boolean } | undefined

  return {
    tabId,
    pdfUploaded: result?.pdfUploaded ?? false,
    promptFilled: result?.promptFilled ?? false,
  }
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
}): Promise<{ tabId: number; pdfUploaded: boolean; promptFilled: boolean }> {
  const { provider, files = [], promptText, threadUrl, onProgress } = options

  // Mode thread cible — toujours injection DOM (pas de prefill ?q= sur un thread existant)
  if (threadUrl) {
    try {
      return await openAndInject(provider, files, promptText, threadUrl, onProgress)
    } catch {
      throw new Error('THREAD_INJECTION_FAILED')
    }
  }

  // Chemin prefill URL (texte seul + provider supporte ?q=)
  if (files.length === 0 && provider.prefillParam && promptText) {
    const encoded = encodeURIComponent(promptText)
    if (provider.prefillMaxLength && encoded.length < provider.prefillMaxLength) {
      const url = `${provider.url}?${provider.prefillParam}=${encoded}`
      const tab = await chrome.tabs.create({ url, active: true })
      return {
        tabId: tab.id ?? 0,
        pdfUploaded: false,
        promptFilled: true,
      }
    }
  }

  // Chemin injection DOM (fichiers joints ou texte long ou provider sans prefill)
  return await openAndInject(provider, files, promptText, provider.url, onProgress)
}
