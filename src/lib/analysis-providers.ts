import type { AnalysisProvider } from '@/types/academic'

export interface ProviderConfig {
  id: AnalysisProvider
  label: string
  url: string
  prefillParam?: string
  prefillMaxLength?: number
  fileInputSelectors: string[]
  textareaSelectors: string[]
  spaDelay: number
  /** Clics séquentiels pour révéler le file input. Chaque string[] = fallbacks pour un même bouton. */
  uploadTriggerSteps?: string[][]
}

export const PROVIDERS: Record<AnalysisProvider, ProviderConfig> = {
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    prefillParam: 'q',
    prefillMaxLength: 7000,
    fileInputSelectors: [
      'input[type="file"]',
      'input[accept*="pdf"]',
      'input[accept*="image"]',
    ],
    textareaSelectors: [
      '#prompt-textarea',
      'div[contenteditable="true"][id*="prompt"]',
      'div[contenteditable="true"]',
      'textarea',
    ],
    spaDelay: 2500,
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai/new',
    fileInputSelectors: [
      'input[type="file"]',
    ],
    textareaSelectors: [
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"]',
      'textarea',
    ],
    spaDelay: 3000,
    uploadTriggerSteps: [
      [
        'button[aria-label="Attach files"]',
        'button[aria-label="Joindre des fichiers"]',
        'button[data-testid="file-upload"]',
      ],
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    fileInputSelectors: [
      'input[type="file"]',
    ],
    textareaSelectors: [
      'div[contenteditable="true"]',
      'rich-textarea textarea',
      'textarea',
    ],
    spaDelay: 3000,
    uploadTriggerSteps: [
      [
        'button[aria-label="Open upload file menu"]',
        'button[aria-label="Ajouter des fichiers"]',
        'button[aria-label="Add files"]',
      ],
      [
        'button[data-test-id="local-image-file-uploader-button"]',
        'button[aria-label="Upload file"]',
        'button[aria-label="Importer un fichier"]',
      ],
    ],
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    prefillParam: 'q',
    prefillMaxLength: 4000,
    fileInputSelectors: [
      'input[type="file"]',
    ],
    textareaSelectors: [
      'textarea[placeholder]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    spaDelay: 2000,
  },
  grok: {
    id: 'grok',
    label: 'Grok',
    url: 'https://grok.com/',
    fileInputSelectors: [
      'input[type="file"]',
    ],
    textareaSelectors: [
      'div[contenteditable="true"]',
      'textarea',
    ],
    spaDelay: 2500,
    uploadTriggerSteps: [
      [
        'button[aria-label="Attach"]',
        'button[aria-label="Upload"]',
      ],
    ],
  },
}

export const PROVIDER_LIST: ProviderConfig[] = Object.values(PROVIDERS)
