import type { AcademicNote, MindmapNode } from '@/types/academic'

export interface AIProcessingResult {
  success: boolean
  summary?: string
  concepts?: string[]
  tags?: string[]
  mindmapStructure?: MindmapNode[]
  error?: string
}

/**
 * Module de traitement IA pour l'enrichissement des notes académiques
 */
export class AIProcessor {
  private static session: any = null
  private static isAvailable: boolean | null = null

  /**
   * Vérifier la disponibilité de Chrome AI
   */
  static async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable
    }

    try {
      if (typeof window !== 'undefined' && 'ai' in window) {
        const ai = (window as any).ai
        
        if (ai && ai.canCreateTextSession) {
          const canCreate = await ai.canCreateTextSession()
          this.isAvailable = canCreate === 'readily'
        } else {
          this.isAvailable = false
        }
      } else {
        this.isAvailable = false
      }
    } catch (error) {
      this.isAvailable = false
    }

    return this.isAvailable
  }

  /**
   * Initialiser une session IA
   */
  private static async initSession() {
    if (this.session) return this.session

    const isAvailable = await this.checkAvailability()
    if (!isAvailable) {
      throw new Error('Chrome AI non disponible')
    }

    const ai = (window as any).ai
    this.session = await ai.createTextSession()
    return this.session
  }

  /**
   * Fermer la session IA
   */
  static async closeSession() {
    if (this.session) {
      this.session.destroy()
      this.session = null
    }
  }

  /**
   * Traitement complet d'une note académique avec IA
   */
  static async processNote(note: AcademicNote): Promise<AIProcessingResult> {
    try {
      const session = await this.initSession()
      const result: AIProcessingResult = { success: true }

      // Traitement en parallèle des différentes tâches
      const tasks = []

      // Génération de résumé
      if (!note.summary && note.content.length > 300) {
        tasks.push(this.generateSummary(note.content))
      }

      // Extraction de concepts
      if (note.concepts.length === 0) {
        tasks.push(this.extractConcepts(note.content, note.type))
      }

      // Génération de tags
      if (note.tags.length === 0) {
        tasks.push(this.generateTags(note.title, note.content, note.metadata.description))
      }

      // Génération de structure mindmap
      if (!note.mindmapStructure && note.content.length > 500) {
        tasks.push(this.generateMindmapStructure(note.title, note.content, note.type))
      }

      // Exécuter toutes les tâches
      const results = await Promise.allSettled(tasks)
      
      // Traiter les résultats
      let taskIndex = 0
      
      if (!note.summary && note.content.length > 300) {
        const summaryResult = results[taskIndex++]
        if (summaryResult.status === 'fulfilled') {
          result.summary = summaryResult.value as string
        }
      }

      if (note.concepts.length === 0) {
        const conceptsResult = results[taskIndex++]
        if (conceptsResult.status === 'fulfilled') {
          result.concepts = summaryResult.value as string[]
        }
      }

      if (note.tags.length === 0) {
        const tagsResult = results[taskIndex++]
        if (tagsResult.status === 'fulfilled') {
          result.tags = tagsResult.value as string[]
        }
      }

      if (!note.mindmapStructure && note.content.length > 500) {
        const mindmapResult = results[taskIndex++]
        if (mindmapResult.status === 'fulfilled') {
          result.mindmapStructure = mindmapResult.value as MindmapNode[]
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur traitement IA'
      }
    }
  }

  /**
   * Générer un résumé intelligent
   */
  static async generateSummary(content: string): Promise<string> {
    const session = await this.initSession()
    
    const prompt = `Résume ce contenu académique en français en 2-3 phrases clés et concises. Focus sur les points essentiels :

${content.substring(0, 2000)}

Résumé :`

    const response = await session.prompt(prompt)
    return response.trim()
  }

  /**
   * Extraire des concepts académiques clés
   */
  static async extractConcepts(content: string, contentType: string): Promise<string[]> {
    const session = await this.initSession()
    
    const typeContext = this.getTypeContext(contentType)
    
    const prompt = `Extrais 4-6 concepts académiques clés de ce ${typeContext} en français. Concepts pertinents et spécialisés uniquement.

Contenu :
${content.substring(0, 1500)}

Liste les concepts séparés par des virgules :`

    const response = await session.prompt(prompt)
    return response.split(',')
      .map((concept: string) => concept.trim())
      .filter((concept: string) => concept.length > 2 && concept.length < 40)
      .slice(0, 6)
  }

  /**
   * Générer des tags de classification
   */
  static async generateTags(title: string, content: string, description?: string): Promise<string[]> {
    const session = await this.initSession()
    
    const prompt = `Génère 3-4 tags de classification pour ce contenu académique. Tags courts et précis en français.

Titre : ${title}
${description ? `Description : ${description}` : ''}
Contenu : ${content.substring(0, 800)}

Tags (séparés par des virgules) :`

    const response = await session.prompt(prompt)
    return response.split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 2 && tag.length < 25)
      .slice(0, 4)
  }

  /**
   * Générer une structure de mindmap
   */
  static async generateMindmapStructure(
    title: string, 
    content: string, 
    contentType: string
  ): Promise<MindmapNode[]> {
    const session = await this.initSession()
    
    const typeContext = this.getTypeContext(contentType)
    
    const prompt = `Crée une structure de mindmap hiérarchique pour ce ${typeContext}. Format JSON avec id, text, type, level, parentId.

Titre : ${title}
Contenu : ${content.substring(0, 2000)}

Structure (niveau 0 = nœud principal, 1-3 = sous-niveaux) :
Format : [{"id": "1", "text": "Concept principal", "type": "concept", "level": 0}, {"id": "2", "text": "Sous-concept", "type": "topic", "level": 1, "parentId": "1"}]

JSON :`

    try {
      const response = await session.prompt(prompt)
      const cleanedResponse = response.replace(/```json|```/g, '').trim()
      const mindmapData = JSON.parse(cleanedResponse)
      
      return this.validateMindmapStructure(mindmapData)
    } catch (error) {
      // Fallback : structure simple basée sur le titre
      return this.createFallbackMindmap(title)
    }
  }

  /**
   * Analyser la lisibilité et la complexité d'un texte
   */
  static async analyzeReadability(content: string): Promise<{
    level: 'facile' | 'moyen' | 'difficile'
    score: number
    suggestions: string[]
  }> {
    const session = await this.initSession()
    
    const prompt = `Analyse la complexité et lisibilité de ce texte académique. Évalue de 1-10 et donne des suggestions.

Texte : ${content.substring(0, 1000)}

Analyse (format JSON) :
{"level": "moyen", "score": 6, "suggestions": ["Suggestion 1", "Suggestion 2"]}

JSON :`

    try {
      const response = await session.prompt(prompt)
      const cleanedResponse = response.replace(/```json|```/g, '').trim()
      return JSON.parse(cleanedResponse)
    } catch (error) {
      return {
        level: 'moyen',
        score: 5,
        suggestions: ['Analyse automatique non disponible']
      }
    }
  }

  /**
   * Détecter la langue principale du contenu
   */
  static async detectLanguage(content: string): Promise<string> {
    const session = await this.initSession()
    
    const prompt = `Détecte la langue principale de ce contenu. Réponds par le code langue (fr, en, es, de, etc.) :

${content.substring(0, 500)}

Langue :`

    try {
      const response = await session.prompt(prompt)
      return response.trim().toLowerCase()
    } catch (error) {
      return 'fr' // Fallback
    }
  }

  /**
   * Obtenir le contexte selon le type de contenu
   */
  private static getTypeContext(contentType: string): string {
    const contexts = {
      'article': 'article de blog ou d\'actualité',
      'research-paper': 'article de recherche académique',
      'video': 'contenu vidéo éducatif',
      'pdf': 'document PDF académique',
      'documentation': 'documentation technique',
      'webpage': 'page web informative'
    }
    
    return contexts[contentType as keyof typeof contexts] || 'contenu académique'
  }

  /**
   * Valider et nettoyer la structure de mindmap générée par l'IA
   */
  private static validateMindmapStructure(rawData: any[]): MindmapNode[] {
    if (!Array.isArray(rawData)) return []

    const validatedNodes: MindmapNode[] = []
    
    rawData.forEach((node, index) => {
      if (node.text && typeof node.text === 'string') {
        validatedNodes.push({
          id: node.id || String(index + 1),
          text: node.text.substring(0, 100), // Limiter la longueur
          type: ['concept', 'topic', 'detail', 'connection'].includes(node.type) 
            ? node.type 
            : 'concept',
          level: Math.max(0, Math.min(3, parseInt(node.level) || 0)),
          parentId: node.parentId || undefined,
          children: []
        })
      }
    })

    // Construire les relations parent-enfant
    validatedNodes.forEach(node => {
      if (node.parentId) {
        const parent = validatedNodes.find(n => n.id === node.parentId)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(node.id)
        }
      }
    })

    return validatedNodes.slice(0, 10) // Limiter à 10 nœuds maximum
  }

  /**
   * Créer une structure de mindmap simple en cas d'échec de l'IA
   */
  private static createFallbackMindmap(title: string): MindmapNode[] {
    return [
      {
        id: '1',
        text: title,
        type: 'concept',
        level: 0,
        children: ['2', '3']
      },
      {
        id: '2',
        text: 'Points clés',
        type: 'topic',
        level: 1,
        parentId: '1'
      },
      {
        id: '3',
        text: 'Applications',
        type: 'topic',
        level: 1,
        parentId: '1'
      }
    ]
  }

  /**
   * Générer des questions d'étude basées sur le contenu
   */
  static async generateStudyQuestions(content: string): Promise<string[]> {
    const session = await this.initSession()
    
    const prompt = `Génère 3-5 questions d'étude pertinentes basées sur ce contenu académique :

${content.substring(0, 1500)}

Questions (une par ligne) :`

    try {
      const response = await session.prompt(prompt)
      return response.split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 10)
        .slice(0, 5)
    } catch (error) {
      return []
    }
  }
}