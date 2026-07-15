// Message types for individual note entries
export type NoteMessageType = 'text' | 'image' | 'capture' | 'screenshot'

export interface NoteMessage {
  id: string
  type: NoteMessageType
  content: string
  timestamp: number
  tags?: string[]
  tradeRef?: string // segment de trade auquel ce bloc appartient (réassignable)
  metadata?: {
    sourceUrl?: string
    sourceTitle?: string
    dimensions?: { width: number; height: number }
    alt?: string
  }
}

export interface NoteFolder {
  id: string
  name: string
  createdAt: number
}

// ── Notation (masterclass edge) ───────────────────────────────────────────────
// Un jugement posé en 2e temps, découplé du résultat : grade + une phrase + cause.
// Miroir du modèle Annotation du journal (apps/journal-d-etude, /api/annotations).
export type AnnotationGrade = 'A' | 'B' | 'C'
export type AnnotationCause = 'technique' | 'connaissance' | 'emotionnel'

export interface Annotation {
  id: string
  noteId?: string        // id de la note extension (résolu via extensionNoteId côté journal)
  messageRef?: string    // NoteMessage.id si le jugement porte sur un message précis
  tradeRef?: string      // TradeSegment.id si le jugement porte sur un trade
  grade: AnnotationGrade
  phrase: string         // « pourquoi ce trade/cette note mérite cette note »
  causeCategory?: AnnotationCause // MC1/Tendler — LE jugement des SL (mis en avant sur perte)
  createdAt: number
  reviewDueAt?: number   // échéance de relecture (~2 semaines)
  reviewedAt?: number    // relue le (absent = pas encore relue)
}

export interface AcademicNote {
  id: string
  title: string
  content: string // Keep for backward compatibility with legacy notes
  messages?: NoteMessage[] // NEW: Individual messages
  summary?: string
  keyPoints?: string[]
  url: string
  favicon?: string
  timestamp: number
  lastSyncAt?: number
  syncExcluded?: boolean // true = exclue du journal (ne sera pas re-synquée automatiquement)
  folderId?: string // undefined = note libre (sans dossier)
  type: ContentType
  metadata: ContentMetadata
  tags: string[]
  concepts: string[]
  annotations?: Annotation[] // notation A/B/C (note entière : messageRef/tradeRef absents)
  trades?: TradeSegment[] // segments de trade de la séance (threads dans la note)
  warmup?: NoteWarmup // legacy : premier warmup (affiché en haut de note) — plus alimenté
  warmups?: NoteWarmup[] // warmups de séance, ancrés dans le fil au moment du lancement
  dols?: DolLevel[] // niveaux DOL (Draw on Liquidity) épinglés en haut de la note
  screenshots?: Screenshot[]
  mindmapStructure?: MindmapNode[]
}

// ── Segments de trade ─────────────────────────────────────────────────────────
// Un trade = une IDÉE de trade (A → B, invalidation SL / validation TP) ; il peut
// contenir plusieurs positions (clôtures partielles). Un seul segment actif à la
// fois : en démarrer un nouveau clôt le précédent ; les blocs restent réassignables.
export type TradeOutcome = 'gain' | 'perte' | 'be'

export interface TradeSegment {
  id: string
  startedAt: number
  closedAt?: number
  outcome?: TradeOutcome // saisi à la clôture (3 chips), modifiable ensuite
  cooldown?: TradeCooldown // débrief mental de fin de trade (mental game)
}

// Cooldown par trade (Tendler) : le débrief court après chaque trade fermé —
// distinct de la note A/B/C (jugement) : ici l'émotion, l'erreur, la leçon.
export interface TradeCooldown {
  emotion?: string
  error?: string
  lesson?: string
  doneAt?: number
}

// Warmup de séance (Tendler) : se situer AVANT d'ouvrir les graphiques. Vit sur la
// note (comme le cooldown vit sur le trade), lancé quand on se sent prêt à trader —
// jamais imposé (une note de cours n'en a pas). Le cooldown, lui, est par trade.
// Une même note peut contenir PLUSIEURS warmups (plusieurs séances dans la journée) :
// chacun s'ancre dans le fil au moment où il est lancé (startedAt).
export interface NoteWarmup {
  id?: string              // absent sur le warmup legacy unique (note.warmup)
  startedAt?: number       // ancrage chronologique dans le fil (absent = legacy, affiché en haut)
  physical?: string        // état physique
  emotional?: string       // état émotionnel
  dominantThought?: string // pensée dominante
  objective?: string       // objectif du jour (qualitatif)
  emotionLevel?: number    // émotion accumulée au démarrage (0–100)
  doneAt?: number
}

// ── DOL — Draw on Liquidity (ICT / Smart Money) ──────────────────────────────
// Le niveau/la zone de liquidité qui attire le prix, défini pendant l'analyse HTF
// AVANT la séance. Épinglé en haut de la note pour ne jamais perdre la vision HTF
// une fois plongé dans les LTF. Statut mis à jour au fil de la séance.
export type DolStatus = 'actif' | 'atteint' | 'invalide'
export type DolBias = 'haussier' | 'baissier'

export interface DolLevel {
  id: string
  price: string        // saisie libre (« 23 450 », « 1.0850 »…) — pas de parsing imposé
  bias: DolBias        // direction vers laquelle le prix est attiré
  instrument?: string  // « NQ », « EURUSD »…
  comment?: string     // « sous les equal lows d'hier »…
  status: DolStatus
  createdAt: number
  updatedAt?: number
}

export type ContentType =
  | 'article' 
  | 'pdf' 
  | 'video' 
  | 'webpage' 
  | 'research-paper'
  | 'documentation'
  | 'manual'

export interface ContentMetadata {
  // Métadonnées communes
  title?: string
  description?: string
  author?: string
  publishDate?: string
  domain: string
  language?: string
  
  // Métadonnées spécifiques aux articles académiques
  journal?: string
  doi?: string
  citations?: number
  keywords?: string[]
  
  // Métadonnées vidéo
  duration?: number
  transcript?: string
  
  // Métadonnées PDF
  pages?: number
  fileSize?: number
  
  // Métadonnées web
  ogImage?: string
  siteName?: string
}

export interface MindmapNode {
  id: string
  text: string
  type: 'concept' | 'topic' | 'detail' | 'connection'
  level: number // Hiérarchie (0 = racine)
  parentId?: string
  children?: string[]
  position?: { x: number; y: number }
}

export interface Screenshot {
  id: string
  noteId: string
  url: string
  dataUrl: string
  timestamp: number
  area?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface ExtractedText {
  id: string
  noteId: string
  text: string
  timestamp: number
  source: 'selection' | 'full-page' | 'ai-summary'
}

export interface SyncStatus {
  lastSync: number
  pendingNotes: string[]
  syncEnabled: boolean
  journalAppUrl: string
  apiKey?: string
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini'

export type AnalysisProvider = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | 'other'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model: string
}

export interface Settings {
  autoCapture: boolean
  aiSummaryEnabled: boolean
  aiConfig?: AIConfig
  analysisProvider?: AnalysisProvider
  providerThreadUrls?: Partial<Record<AnalysisProvider, string>>
  defaultTags: string[]
  folders: NoteFolder[]
  journalSync: SyncStatus
  captureScreenshots: boolean
  extractMainContent: boolean
  language: 'fr' | 'en'
}

// Messages pour communication entre composants
export type MessageType =
  | 'CAPTURE_CURRENT_PAGE'
  | 'CAPTURE_SELECTION'
  | 'CAPTURE_SCREENSHOT'
  | 'SMART_CAPTURE'
  | 'OPEN_SIDEBAR'
  | 'CLOSE_SIDEPANEL'
  | 'SAVE_NOTE'
  | 'SYNC_TO_JOURNAL'
  | 'EXTRACT_CONTENT'

export interface ExtensionMessage {
  type: MessageType
  payload?: any
  tabId?: number
  responseRequired?: boolean
  options?: any
}

export interface CaptureResult {
  success: boolean
  note?: AcademicNote
  error?: string
}