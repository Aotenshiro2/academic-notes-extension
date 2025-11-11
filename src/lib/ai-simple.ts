/**
 * Version simplifiée du processeur IA pour corriger les erreurs de build
 */

export class SimpleAIProcessor {
  static async isAvailable(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && 'ai' in window) {
        const ai = (window as any).ai
        return ai && ai.canCreateTextSession
      }
    } catch {
      // Ignore errors
    }
    return false
  }

  static async generateSummary(content: string): Promise<string> {
    try {
      if (await this.isAvailable()) {
        const ai = (window as any).ai
        const session = await ai.createTextSession()
        const response = await session.prompt(`Résume en français : ${content.substring(0, 1000)}`)
        session.destroy()
        return response.trim()
      }
    } catch {
      // Ignore errors
    }
    return ''
  }

  static async extractConcepts(content: string): Promise<string[]> {
    try {
      if (await this.isAvailable()) {
        const ai = (window as any).ai
        const session = await ai.createTextSession()
        const response = await session.prompt(`Extrais 3 concepts clés : ${content.substring(0, 500)}`)
        session.destroy()
        return response.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 2).slice(0, 3)
      }
    } catch {
      // Ignore errors
    }
    return []
  }
}