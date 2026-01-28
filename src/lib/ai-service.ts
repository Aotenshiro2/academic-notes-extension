import type { AIConfig, AIProvider } from '@/types/academic'

export interface SmartCaptureResult {
  summary: string
  keyPoints: string[]
  concepts: string[]
  tags: string[]
}

interface AIProviderAdapter {
  process(content: string, systemPrompt: string): Promise<string>
}

// --- Chrome AI Provider ---

class ChromeAIAdapter implements AIProviderAdapter {
  private session: any = null

  async isAvailable(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && 'ai' in window) {
        const ai = (window as any).ai
        if (ai && ai.canCreateTextSession) {
          const canCreate = await ai.canCreateTextSession()
          return canCreate === 'readily'
        }
      }
      return false
    } catch {
      return false
    }
  }

  async process(content: string, systemPrompt: string): Promise<string> {
    if (!this.session) {
      const ai = (window as any).ai
      this.session = await ai.createTextSession()
    }
    const prompt = `${systemPrompt}\n\nContenu:\n${content}`
    const response = await this.session.prompt(prompt)
    return response.trim()
  }

  destroy() {
    if (this.session) {
      this.session.destroy()
      this.session = null
    }
  }
}

// --- External API Provider ---

class ExternalAPIAdapter implements AIProviderAdapter {
  private config: AIConfig

  constructor(config: AIConfig) {
    this.config = config
  }

  async process(content: string, systemPrompt: string): Promise<string> {
    const { provider, apiKey, model } = this.config

    switch (provider) {
      case 'openai':
        return this.callOpenAI(content, systemPrompt, apiKey, model)
      case 'anthropic':
        return this.callAnthropic(content, systemPrompt, apiKey, model)
      case 'gemini':
        return this.callGemini(content, systemPrompt, apiKey, model)
      default:
        throw new Error(`Fournisseur IA non supporté: ${provider}`)
    }
  }

  private async callOpenAI(content: string, systemPrompt: string, apiKey: string, model: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${err.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content.trim()
  }

  private async callAnthropic(content: string, systemPrompt: string, apiKey: string, model: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model || 'claude-3-haiku-20240307',
        system: systemPrompt,
        messages: [
          { role: 'user', content }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Anthropic API error: ${err.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return data.content[0].text.trim()
  }

  private async callGemini(content: string, systemPrompt: string, apiKey: string, model: string): Promise<string> {
    const modelId = model || 'gemini-2.0-flash'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\n${content}` }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000
          }
        })
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Gemini API error: ${err.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text.trim()
  }
}

// --- Main AI Service ---

const SMART_CAPTURE_PROMPT = `Tu es un assistant d'analyse de contenu web. Analyse le contenu fourni et retourne un JSON avec exactement cette structure :

{
  "summary": "Un résumé concis en 2-3 phrases du contenu principal",
  "keyPoints": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4", "Point clé 5"],
  "concepts": ["Concept 1", "Concept 2", "Concept 3", "Concept 4"],
  "tags": ["tag1", "tag2", "tag3"]
}

Règles :
- Le résumé doit capturer l'essentiel en français
- 3 à 7 points clés, chacun en une phrase courte
- 3 à 6 concepts/termes importants
- 3 à 5 tags de classification courts
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après
- Si le contenu est une transcription vidéo, identifie les enseignements principaux`

export class AIService {
  private chromeAI: ChromeAIAdapter
  private config: AIConfig | null

  constructor(config?: AIConfig) {
    this.chromeAI = new ChromeAIAdapter()
    this.config = config || null
  }

  async smartCapture(content: string): Promise<SmartCaptureResult> {
    const truncatedContent = content.substring(0, 6000)
    let rawResponse: string

    // Try Chrome AI first
    try {
      const chromeAvailable = await this.chromeAI.isAvailable()
      if (chromeAvailable) {
        rawResponse = await this.chromeAI.process(truncatedContent, SMART_CAPTURE_PROMPT)
        return this.parseResponse(rawResponse)
      }
    } catch (error) {
      console.warn('Chrome AI failed, trying external API:', error)
    }

    // Fallback to external API
    if (this.config?.apiKey) {
      try {
        const external = new ExternalAPIAdapter(this.config)
        rawResponse = await external.process(truncatedContent, SMART_CAPTURE_PROMPT)
        return this.parseResponse(rawResponse)
      } catch (error) {
        console.error('External API failed:', error)
        throw new Error(`Erreur API ${this.config.provider}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
      }
    }

    throw new Error('Aucun service IA disponible. Configurez une clé API dans les paramètres.')
  }

  private parseResponse(raw: string): SmartCaptureResult {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim()

    try {
      const parsed = JSON.parse(cleaned)
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter((p: any) => typeof p === 'string') : [],
        concepts: Array.isArray(parsed.concepts) ? parsed.concepts.filter((c: any) => typeof c === 'string') : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.toLowerCase()) : []
      }
    } catch {
      // Fallback: extract what we can from non-JSON response
      return {
        summary: raw.substring(0, 500),
        keyPoints: [],
        concepts: [],
        tags: []
      }
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.apiKey) {
      return { success: false, error: 'Aucune clé API configurée' }
    }

    try {
      const external = new ExternalAPIAdapter(this.config)
      await external.process('Test de connexion.', 'Réponds simplement "OK".')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de connexion'
      }
    }
  }

  destroy() {
    this.chromeAI.destroy()
  }
}

// Model options per provider
export const AI_MODELS: Record<AIProvider, { label: string; value: string }[]> = {
  openai: [
    { label: 'GPT-4o Mini (Recommandé)', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' }
  ],
  anthropic: [
    { label: 'Claude 3 Haiku (Recommandé)', value: 'claude-3-haiku-20240307' },
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' }
  ],
  gemini: [
    { label: 'Gemini 2.0 Flash (Recommandé)', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
    { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' }
  ]
}

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini'
}
