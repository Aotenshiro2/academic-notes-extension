export interface SiteExtractResult {
  success: boolean
  error?: string
  pageTitle?: string
  content?: string
  summary?: string
  keyPoints?: string[]
  concepts?: string[]
  tags?: string[]
  description?: string
  author?: string
  ogImage?: string
  siteName?: string
  extras?: Record<string, unknown>
}

export interface SiteStrategy {
  id: string
  label: string
  match: (url: string) => boolean
  priority?: number
  /** Exécutée dans la page via chrome.scripting.executeScript, qui résout les
   *  promesses : une stratégie peut être async (ex. YouTube télécharge la
   *  piste de sous-titres). Elle doit rester AUTONOME (pas de closure). */
  func: () => SiteExtractResult | Promise<SiteExtractResult>
}
