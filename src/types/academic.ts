export interface AcademicNote {
  id: string
  title: string
  content: string
  summary?: string
  url: string
  favicon?: string
  timestamp: number
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

export interface Settings {
  autoCapture: boolean
  aiSummaryEnabled: boolean
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