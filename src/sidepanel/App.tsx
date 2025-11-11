import React, { useState, useEffect } from 'react'
import { 
  BookOpen, 
  Plus, 
  Search, 
  Settings, 
  Download, 
  Upload,
  Camera,
  FileText,
  Video,
  Globe,
  Filter,
  BarChart3,
  ArrowRight
} from 'lucide-react'

import Header from '@/components/Header'
import NotesList from '@/components/NotesList'
import StatsView from '@/components/StatsView'
import SettingsView from '@/components/SettingsView'
import CaptureControls from '@/components/CaptureControls'
import SearchBar from '@/components/SearchBar'

import storage from '@/lib/storage'
import type { AcademicNote, Settings as SettingsType } from '@/types/academic'

type View = 'notes' | 'stats' | 'settings'

function App() {
  const [currentView, setCurrentView] = useState<View>('notes')
  const [notes, setNotes] = useState<AcademicNote[]>([])
  const [filteredNotes, setFilteredNotes] = useState<AcademicNote[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    total: { notes: 0, screenshots: 0, extracts: 0 },
    recent: { notes: 0 }
  })

  // Charger les données initiales
  useEffect(() => {
    loadData()
  }, [])

  // Filtrer les notes selon la recherche
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredNotes(notes)
    } else {
      const filtered = notes.filter(note =>
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        note.metadata.domain.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredNotes(filtered)
    }
  }, [searchQuery, notes])

  async function loadData() {
    try {
      setIsLoading(true)
      
      const [loadedNotes, loadedSettings, loadedStats] = await Promise.all([
        storage.getNotes(50),
        storage.getSettings(),
        storage.getStats()
      ])

      setNotes(loadedNotes)
      setSettings(loadedSettings)
      setStats(loadedStats)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCapture = async (type: 'page' | 'selection' | 'screenshot') => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tabs[0]?.id) return

      const messageMap = {
        page: 'CAPTURE_CURRENT_PAGE',
        selection: 'CAPTURE_SELECTION',
        screenshot: 'CAPTURE_SCREENSHOT'
      }

      const response = await chrome.runtime.sendMessage({
        type: messageMap[type],
        tabId: tabs[0].id
      })

      if (response?.success) {
        await loadData() // Recharger les notes
      }
    } catch (error) {
      console.error('Error capturing:', error)
    }
  }

  const handleSettingsChange = async (newSettings: Partial<SettingsType>) => {
    try {
      await storage.saveSettings(newSettings)
      setSettings(prev => prev ? { ...prev, ...newSettings } : null)
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }

  const handleExport = async () => {
    try {
      const data = await storage.exportData()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `academic-notes-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting:', error)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return

      const text = await file.text()
      const result = await storage.importData(text)
      
      if (result.success) {
        await loadData()
      } else {
        alert('Erreur lors de l\'import: ' + result.error)
      }
    } catch (error) {
      console.error('Error importing:', error)
    }
  }

  const handleSyncToJournal = async () => {
    try {
      // TODO: Implémenter la synchronisation avec Journal d'Études
      console.log('Sync to journal not implemented yet')
    } catch (error) {
      console.error('Error syncing:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="sidebar-container">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-container">
      <Header />
      
      {/* Navigation */}
      <div className="border-b bg-gray-50 px-4 py-3">
        <div className="flex space-x-1">
          <button
            onClick={() => setCurrentView('notes')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currentView === 'notes' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <BookOpen size={16} />
            <span>Notes</span>
          </button>
          
          <button
            onClick={() => setCurrentView('stats')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currentView === 'stats' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <BarChart3 size={16} />
            <span>Stats</span>
          </button>
          
          <button
            onClick={() => setCurrentView('settings')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currentView === 'settings' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Settings size={16} />
            <span>Config</span>
          </button>
        </div>
      </div>

      {/* Contrôles de capture */}
      {currentView === 'notes' && (
        <CaptureControls onCapture={handleCapture} />
      )}

      {/* Zone de recherche */}
      {currentView === 'notes' && (
        <div className="px-4 py-3 border-b">
          <SearchBar 
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher dans vos notes..."
          />
        </div>
      )}

      {/* Contenu principal */}
      <div className="content-section">
        {currentView === 'notes' && (
          <NotesList 
            notes={filteredNotes}
            onRefresh={loadData}
          />
        )}
        
        {currentView === 'stats' && (
          <StatsView 
            stats={stats}
            notes={notes}
          />
        )}
        
        {currentView === 'settings' && settings && (
          <SettingsView 
            settings={settings}
            onChange={handleSettingsChange}
            onExport={handleExport}
            onImport={handleImport}
            onSyncToJournal={handleSyncToJournal}
          />
        )}
      </div>

      {/* Bouton de synchronisation flottant */}
      {settings?.journalSync.syncEnabled && currentView === 'notes' && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={handleSyncToJournal}
            className="bg-green-500 hover:bg-green-600 text-white p-3 rounded-full shadow-lg transition-colors"
            title="Synchroniser avec Journal d'Études"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      )}
    </div>
  )
}

export default App