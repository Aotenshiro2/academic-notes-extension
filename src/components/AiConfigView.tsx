// « Configurer son IA » — extrait des Paramètres (retour Brice 28/08 : le
// rouage devient un hub, chaque sujet a son écran court au lieu d'un
// écran-fleuve). On y règle les threads d'analyse : l'URL d'une conversation
// ouverte (Claude, ChatGPT…) où l'extension envoie les notes directement.
import React, { useState } from 'react'
import { ArrowLeft, Link2, Info } from 'lucide-react'
import type { Settings as SettingsType, AnalysisProvider } from '@/types/academic'
import { PROVIDER_LIST } from '@/lib/analysis-providers'

interface AiConfigViewProps {
  settings: SettingsType
  onChange: (newSettings: Partial<SettingsType>) => void
  onBack: () => void
}

function AiConfigView({ settings, onChange, onBack }: AiConfigViewProps) {
  const [tabUrlErrors, setTabUrlErrors] = useState<Partial<Record<AnalysisProvider, boolean>>>({})

  const setThreadUrlFromCurrentTab = async (providerId: AnalysisProvider, baseUrl: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const domain = new URL(baseUrl).hostname
      if (tab?.url?.includes(domain)) {
        onChange({ providerThreadUrls: { ...settings.providerThreadUrls, [providerId]: tab.url } })
        setTabUrlErrors(prev => ({ ...prev, [providerId]: false }))
      } else {
        setTabUrlErrors(prev => ({ ...prev, [providerId]: true }))
      }
    } catch {
      setTabUrlErrors(prev => ({ ...prev, [providerId]: true }))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>
        <Link2 size={16} className="text-purple-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">Configurer son IA</h2>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg mb-3">
        <div className="flex items-start space-x-2">
          <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Colle ici l'URL d'une conversation ouverte — tes notes y seront envoyées directement au lieu d'ouvrir une nouvelle fenêtre. Astuce : ouvre ta conversation dans un onglet, puis clique 📎.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {PROVIDER_LIST.map(p => (
          <div key={p.id} className="p-3 border rounded-lg">
            <p className="text-sm font-medium text-foreground mb-2">{p.label}</p>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder={`URL d'une conversation ${p.label}`}
                value={settings.providerThreadUrls?.[p.id] || ''}
                onChange={e => onChange({ providerThreadUrls: { ...settings.providerThreadUrls, [p.id]: e.target.value } })}
                className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/20 placeholder:text-muted-foreground"
              />
              <button
                title={`Définir depuis l'onglet ${p.label} actif`}
                onClick={() => setThreadUrlFromCurrentTab(p.id, p.url)}
                className="px-2 py-1.5 rounded border border-border bg-muted hover:bg-muted/80 text-sm transition-colors"
              >
                📎
              </button>
              {settings.providerThreadUrls?.[p.id] && (
                <button
                  onClick={() => onChange({ providerThreadUrls: { ...settings.providerThreadUrls, [p.id]: '' } })}
                  className="px-2 py-1.5 rounded border border-border bg-muted hover:bg-muted/80 text-muted-foreground text-xs transition-colors"
                  title="Effacer"
                >
                  ✕
                </button>
              )}
            </div>
            {tabUrlErrors[p.id] && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Ouvre d'abord une conversation {p.label} dans le navigateur.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AiConfigView
