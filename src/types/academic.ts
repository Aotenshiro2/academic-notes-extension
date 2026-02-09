// Message types for individual note entries
export type NoteMessageType = 'text' | 'image' | 'capture' | 'screenshot'

export interface NoteMessage {
  id: string
  type: NoteMessageType
  content: string
  timestamp: number
  metadata?: {
    sourceUrl?: string
    sourceTitle?: string
    dimensions?: { width: number; height: number }
    alt?: string
  }
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
  syncedAt?: number
  type: ContentType
  metadata: ContentMetadata
  tags: string[]
  concepts: string[]
  screenshots?: Screenshot[]
  mindmapStructure?: MindmapNode[]
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

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model: string
}

export interface Settings {
  autoCapture: boolean
  aiSummaryEnabled: boolean
  aiConfig?: AIConfig
  defaultTags: string[]
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