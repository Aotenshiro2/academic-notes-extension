import React, { useState } from 'react'
import { 
  Settings, 
  Download, 
  Upload, 
  ArrowRight,
  Zap,
  Brain,
  Camera,
  FileText,
  Globe,
  CheckCircle,
  XCircle,
  Info,
  ExternalLink
} from 'lucide-react'
import type { Settings as SettingsType } from '@/types/academic'

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
        alert('✅ Connexion réussie avec Journal d\'Études')
      } else {
        alert('❌ Impossible de se connecter à Journal d\'Études')
      }
    } catch (error) {
      alert('❌ Erreur de connexion : ' + error)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
        <Settings size={20} className="mr-2" />
        Configuration
      </h2>
      
      {/* Capture automatique */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <Zap size={16} className="mr-2" />
          Capture automatique
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Capture automatique</p>
              <p className="text-sm text-gray-600">Capturer automatiquement les pages visitées</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoCapture}
                onChange={(e) => handleToggle('autoCapture', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Captures d'écran</p>
              <p className="text-sm text-gray-600">Inclure des captures d'écran dans les notes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.captureScreenshots}
                onChange={(e) => handleToggle('captureScreenshots', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Extraction intelligente</p>
              <p className="text-sm text-gray-600">Extraire uniquement le contenu principal</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.extractMainContent}
                onChange={(e) => handleToggle('extractMainContent', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* IA et résumés */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <Brain size={16} className="mr-2" />
          Intelligence artificielle
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Résumés automatiques</p>
              <p className="text-sm text-gray-600">Générer des résumés avec l'IA locale (Chrome AI)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.aiSummaryEnabled}
                onChange={(e) => handleToggle('aiSummaryEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">Fonctionnalités IA disponibles :</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Résumés automatiques du contenu</li>
                  <li>Extraction de concepts clés</li>
                  <li>Génération de structure mindmap</li>
                  <li>Traitement local (privacy-first)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Synchronisation avec Journal d'Études */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <ArrowRight size={16} className="mr-2" />
          Journal d'Études
        </h3>
        
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-gray-900">Synchronisation automatique</p>
                <p className="text-sm text-gray-600">Envoyer les notes vers Journal d'Études</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.journalSync.syncEnabled}
                  onChange={(e) => handleSyncSettingChange('syncEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de l'application
                </label>
                <div className="flex space-x-2">
                  <input
                    type="url"
                    value={settings.journalSync.journalAppUrl}
                    onChange={(e) => handleSyncSettingChange('journalAppUrl', e.target.value)}
                    className="input-field flex-1"
                    placeholder="https://trading-journal.app"
                  />
                  <button
                    onClick={testJournalConnection}
                    className="btn-secondary flex items-center space-x-1"
                  >
                    <ExternalLink size={14} />
                    <span>Test</span>
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Notes en attente : {settings.journalSync.pendingNotes.length}
                </span>
                <button
                  onClick={onSyncToJournal}
                  className="btn-primary text-sm"
                  disabled={!settings.journalSync.syncEnabled || settings.journalSync.pendingNotes.length === 0}
                >
                  Synchroniser maintenant
                </button>
              </div>
              
              {settings.journalSync.lastSync > 0 && (
                <p className="text-xs text-gray-500">
                  Dernière sync : {new Date(settings.journalSync.lastSync).toLocaleString('fr-FR')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Import/Export */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <FileText size={16} className="mr-2" />
          Sauvegarde des données
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExport}
            className="flex items-center justify-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Download size={16} className="text-blue-600" />
            <span className="text-blue-700 font-medium">Exporter</span>
          </button>
          
          <button
            onClick={handleImportClick}
            className="flex items-center justify-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            <Upload size={16} className="text-green-600" />
            <span className="text-green-700 font-medium">Importer</span>
          </button>
        </div>
        
        <input
          ref={setImportFileRef}
          type="file"
          accept=".json"
          onChange={onImport}
          className="hidden"
        />
        
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Note :</strong> L'export inclut toutes vos notes, captures et paramètres. 
            L'import remplacera les données existantes.
          </p>
        </div>
      </div>

      {/* Langues et préférences */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <Globe size={16} className="mr-2" />
          Préférences
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags par défaut
            </label>
            <input
              type="text"
              value={settings.defaultTags.join(', ')}
              onChange={(e) => onChange({ 
                defaultTags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
              })}
              className="input-field"
              placeholder="Séparer les tags par des virgules"
            />
            <p className="text-xs text-gray-500 mt-1">
              Ces tags seront automatiquement ajoutés à chaque nouvelle note
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsView