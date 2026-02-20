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
  func: () => SiteExtractResult
}
