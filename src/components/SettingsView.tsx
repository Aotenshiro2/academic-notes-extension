import { toast } from '../lib/toast'
import React, { useState, useEffect } from 'react'
import {
  Settings,
  Download,
  Upload,
  Zap,
  FileText,
  Globe,
  Info,
  Link2,
  Mic,
  BookOpen,
  Star
} from 'lucide-react'
import { micPermissionState, listMicrophones, openMicPermissionPage } from '@/lib/dictation'
import type { Settings as SettingsType, AnalysisProvider } from '@/types/academic'
import { getShowMeta, setShowMeta } from '@/lib/show-meta'
import { PROVIDER_LIST } from '@/lib/analysis-providers'
import StorageHealth from './StorageHealth'

interface SettingsViewProps {
  settings: SettingsType
  onChange: (newSettings: Partial<SettingsType>) => void
  onExport: () => void
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSyncToJournal: () => void
}

function SettingsView({ 
  settings, 
  onChange, 
  onExport, 
  onImport,
  onSyncToJournal 
}: SettingsViewProps) {
  const [importFileRef, setImportFileRef] = useState<HTMLInputElement | null>(null)
  // Métadonnées de capture : réglage global (localStorage), OFF par défaut
  const [showMeta, setShowMetaState] = useState(getShowMeta)

  // Dictée vocale : état de la permission micro + micros disponibles.
  // Re-vérifié quand le panneau reprend le focus (retour de l'onglet
  // d'autorisation) — la permission a pu changer entre-temps.
  const [micGranted, setMicGranted] = useState(false)
  const [microphones, setMicrophones] = useState<{ deviceId: string; label: string }[]>([])
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const state = await micPermissionState()
      if (!alive) return
      setMicGranted(state === 'granted')
      if (state === 'granted') {
        try { setMicrophones(await listMicrophones()) } catch { /* liste indisponible */ }
      }
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener('focus', refresh) }
  }, [])
  const [tabUrlErrors, setTabUrlErrors] = useState<Partial<Record<AnalysisProvider, boolean>>>({})

  const handleToggle = (key: keyof SettingsType, value: boolean) => {
    onChange({ [key]: value })
  }

  const handleSyncSettingChange = (key: keyof SettingsType['journalSync'], value: any) => {
    onChange({
      journalSync: {
        ...settings.journalSync,
        [key]: value
      }
    })
  }

  const handleImportClick = () => {
    importFileRef?.click()
  }

  const testJournalConnection = async () => {
    try {
      const response = await fetch(settings.journalSync.journalAppUrl + '/api/health')
      if (response.ok) {
        toast.success('Connexion réussie avec Journal d\'Études')
      } else {
        toast.error('Impossible de se connecter à Journal d\'Études')
      }
    } catch (error) {
      toast.error('Erreur de connexion : ' + error)
    }
  }

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
      <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center">
        <Settings size={20} className="mr-2" />
        Configuration
      </h2>
      
      {/* Capture automatique */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <Zap size={16} className="mr-2" />
          Capture automatique
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Capture automatique</p>
              <p className="text-sm text-muted-foreground">Capturer automatiquement les pages visitées</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoCapture}
                onChange={(e) => handleToggle('autoCapture', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Captures d'écran</p>
              <p className="text-sm text-muted-foreground">Inclure des captures d'écran dans les notes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.captureScreenshots}
                onChange={(e) => handleToggle('captureScreenshots', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Afficher les métadonnées de capture</p>
              <p className="text-sm text-muted-foreground">Montrer la ligne date • page • URL dans les notes (masquée par défaut)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showMeta}
                onChange={(e) => { setShowMeta(e.target.checked); setShowMetaState(e.target.checked) }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Extraction intelligente</p>
              <p className="text-sm text-muted-foreground">Extraire uniquement le contenu principal</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.extractMainContent}
                onChange={(e) => handleToggle('extractMainContent', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Dictée vocale */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <Mic size={16} className="mr-2" />
          Dictée vocale
        </h3>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          {micGranted ? (
            <>
              <p className="font-medium text-foreground">Microphone utilisé</p>
              <select
                value={settings.dictationDeviceId ?? ''}
                onChange={e => onChange({ dictationDeviceId: e.target.value || undefined })}
                className="w-full text-sm bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Micro par défaut du système</option>
                {microphones.map(m => (
                  <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Whisper tourne 100 % en local : ta voix ne quitte jamais ta machine.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">Micro non autorisé</p>
              <p className="text-sm text-muted-foreground">
                Chrome ne peut demander la permission que depuis un onglet, pas depuis ce panneau.
              </p>
              <button
                onClick={() => openMicPermissionPage()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Mic size={14} />
                Autoriser le micro
              </button>
            </>
          )}
        </div>
      </div>

      {/* Aide — déménagé du footer (allègement, 28/08) */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <BookOpen size={16} className="mr-2" />
          Aide
        </h3>
        <div className="space-y-2">
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/guide/index.html') })}
            className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors text-left"
          >
            <BookOpen size={16} className="text-muted-foreground flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground text-sm">Ouvrir le guide</p>
              <p className="text-xs text-muted-foreground">Prise en main et nouveautés de chaque version</p>
            </div>
          </button>
          <button
            onClick={() => chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/trading-notes-by-aoknowle/phajegonlmgnjkkfdooedoddnmgpheic/reviews' })}
            className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors text-left"
          >
            <Star size={16} className="text-muted-foreground flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground text-sm">Évaluer l'extension</p>
              <p className="text-xs text-muted-foreground">Un avis sur le Chrome Web Store nous aide beaucoup</p>
            </div>
          </button>
        </div>
      </div>

      {/* Threads d'analyse IA */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <Link2 size={16} className="mr-2" />
          Threads d'analyse IA
        </h3>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg mb-3">
          <div className="flex items-start space-x-2">
            <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Collez ici l'URL d'une conversation ouverte — vos notes y seront envoyées directement au lieu d'ouvrir une nouvelle fenêtre.
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
                  Ouvrez d'abord une conversation {p.label} dans le navigateur.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <StorageHealth />

      {/* Import/Export */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <FileText size={16} className="mr-2" />
          Sauvegarde des données
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExport}
            className="flex items-center justify-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <Upload size={16} className="text-blue-600 dark:text-blue-400" />
            <span className="text-blue-700 dark:text-blue-300 font-medium">Exporter</span>
          </button>

          <button
            onClick={handleImportClick}
            className="flex items-center justify-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            <Download size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-300 font-medium">Importer</span>
          </button>
        </div>
        
        <input
          ref={setImportFileRef}
          type="file"
          accept=".json"
          onChange={onImport}
          className="hidden"
        />
        
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            <strong>Note :</strong> L'export inclut toutes vos notes, captures et paramètres. 
            L'import remplacera les données existantes.
          </p>
        </div>
      </div>

      {/* Langues et préférences */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <Globe size={16} className="mr-2" />
          Préférences
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Langue de l'interface
            </label>
            <select
              value={settings.language}
              onChange={(e) => onChange({ language: e.target.value as 'fr' | 'en' })}
              className="input-field"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          
        </div>
      </div>
    </div>
  )
}

export default SettingsView