import type { ProviderConfig } from '@/lib/analysis-providers'

/**
 * Fonction autonome injectée dans la page du provider.
 * Reçoit les sélecteurs en paramètres → provider-agnostique.
 * DOIT être 100% autonome — pas d'imports, pas de closures externes.
 */
async function injectIntoProvider(
  pdfBase64: string | null,
  fileName: string,
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

  // --- Upload PDF ---

  let pdfUploaded = false
  if (pdfBase64) {
    // Cliquer les triggers pour révéler le file input (Gemini, Claude, Grok…)
    if (uploadTriggerSteps && uploadTriggerSteps.length > 0 && !findEl(fileInputSelectors)) {
      await clickTriggerSteps(uploadTriggerSteps)
      await new Promise(r => setTimeout(r, 800))
    }

    const fileInput = await waitFor(fileInputSelectors) as HTMLInputElement | null

    if (fileInput) {
      try {
        const file = b64ToFile(pdfBase64, fileName, 'application/pdf')
        const dt = new DataTransfer()
        dt.items.add(file)
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

/**
 * Ouvre un provider IA et injecte le contenu.
 * Gère prefill URL, injection DOM, et fallback clipboard.
 */
export async function openProviderWithContent(options: {
  provider: ProviderConfig
  pdfBase64: string | null
  fileName: string
  promptText: string
}): Promise<{ tabId: number; pdfUploaded: boolean; promptFilled: boolean }> {
  const { provider, pdfBase64, fileName, promptText } = options

  // Chemin prefill URL (texte seul + provider supporte ?q=)
  if (!pdfBase64 && provider.prefillParam && promptText) {
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

  // Chemin injection DOM (PDF ou texte long ou provider sans prefill)
  const tab = await chrome.tabs.create({ url: provider.url, active: true })
  if (!tab.id) throw new Error(`Failed to create ${provider.label} tab`)
  const tabId = tab.id

  // Attendre le chargement complet
  await new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })

  // Délai SPA spécifique au provider
  await new Promise(r => setTimeout(r, provider.spaDelay))

  // Injecter la fonction autonome avec les sélecteurs du provider
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: injectIntoProvider,
    args: [
      pdfBase64,
      fileName,
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
