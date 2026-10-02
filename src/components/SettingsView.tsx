import { toast } from '../lib/toast'
import React, { useState, useEffect } from 'react'
import {
  Settings,
  Download,
  Upload,
  Zap,
  FileText,
  Globe,
  Mic
} from 'lucide-react'
import { micPermissionState, listMicrophones, openMicPermissionPage } from '@/lib/dictation'
import type { Settings as SettingsType } from '@/types/academic'
import { getShowMeta, setShowMeta } from '@/lib/show-meta'
import { t, LANGUES, getLangue, setLangue, type Langue } from '@/lib/i18n'
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

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center">
        <Settings size={20} className="mr-2" />
        {t('reglages.titre')}
      </h2>

      {/* Capture automatique */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <Zap size={16} className="mr-2" />
          {t('reglages.captureAuto')}
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">{t('reglages.captureAuto')}</p>
              <p className="text-sm text-muted-foreground">{t('reglages.captureAutoDesc')}</p>
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
              <p className="font-medium text-foreground">{t('reglages.captures')}</p>
              <p className="text-sm text-muted-foreground">{t('reglages.capturesDesc')}</p>
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
              <p className="font-medium text-foreground">{t('reglages.meta')}</p>
              <p className="text-sm text-muted-foreground">{t('reglages.metaDesc')}</p>
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
              <p className="font-medium text-foreground">{t('reglages.extraction')}</p>
              <p className="text-sm text-muted-foreground">{t('reglages.extractionDesc')}</p>
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
          {t('reglages.dictee')}
        </h3>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          {micGranted ? (
            <>
              <p className="font-medium text-foreground">{t('reglages.micro')}</p>
              <select
                value={settings.dictationDeviceId ?? ''}
                onChange={e => onChange({ dictationDeviceId: e.target.value || undefined })}
                className="w-full text-sm bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">{t('reglages.microDefaut')}</option>
                {microphones.map(m => (
                  <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                {t('reglages.whisper')}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">{t('reglages.microRefuse')}</p>
              <p className="text-sm text-muted-foreground">
                {t('reglages.microOnglet')}
              </p>
              <button
                onClick={() => openMicPermissionPage()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Mic size={14} />
                {t('reglages.autoriserMicro')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Les threads d'analyse IA ont leur propre écran désormais :
          « Configurer son IA » dans le menu du rouage (AiConfigView) */}

      <StorageHealth />

      {/* Import/Export */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <FileText size={16} className="mr-2" />
          {t('reglages.sauvegarde')}
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExport}
            className="flex items-center justify-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <Upload size={16} className="text-blue-600 dark:text-blue-400" />
            <span className="text-blue-700 dark:text-blue-300 font-medium">{t('reglages.exporter')}</span>
          </button>

          <button
            onClick={handleImportClick}
            className="flex items-center justify-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            <Download size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-300 font-medium">{t('reglages.importer')}</span>
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
            <strong>{t('reglages.noteLabel')}</strong> {t('reglages.noteImport')}
          </p>
        </div>
      </div>

      {/* Langues et préférences */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-foreground mb-3 flex items-center">
          <Globe size={16} className="mr-2" />
          {t('reglages.preferences')}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t('reglages.langue')}
            </label>
            {/* Ce sélecteur écrivait `settings.language`, que rien ne lit : il
                ne changeait pas la langue (01/10/2026). Il pilote maintenant la
                même langue que le globe du pied de panneau, et garde le réglage
                à jour pour ne rien casser chez qui le lirait un jour. */}
            <select
              value={getLangue()}
              onChange={(e) => {
                const langue = e.target.value as Langue
                setLangue(langue)
                onChange({ language: langue })
              }}
              className="input-field"
            >
              {LANGUES.map(l => (
                <option key={l.code} value={l.code}>{l.nom}</option>
              ))}
            </select>
          </div>

          {/* Grade D opt-in (24/09/2026, entretien Brice avec Florent) : éteint
              par défaut, trois lettres suffisent à la plupart des élèves. Un D
              déjà posé reste affiché même interrupteur coupé. */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">{t('reglages.noterD')}</p>
              <p className="text-sm text-muted-foreground">{t('reglages.noterDDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.notationJusquaD}
                onChange={(e) => handleToggle('notationJusquaD', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsView