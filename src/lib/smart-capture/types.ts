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
  /** Porte ouverte (1.10.0) : les trades lus DIRECTEMENT dans le tableau de
   *  la page, sans IA, comme `lireTableau` de SimpleFX. Forme des trades :
   *  `TradeNormalise` (lib/documents-lecture.ts), instants en ISO. Aucune
   *  stratégie ne la remplit encore : TopStepX et Tradovate demandent de
   *  relever leurs tableaux sur de vraies pages connectées. Sans elle, les
   *  trades de la page sont lus sur la capture d'écran par la lecture de
   *  Pilotage. Autonome comme `func`. */
  lireTrades?: () => { trades: unknown[] } | Promise<{ trades: unknown[] }>
}
