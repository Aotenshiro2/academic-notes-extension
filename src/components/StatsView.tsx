import React from 'react'
import { 
  BookOpen, 
  Camera, 
  FileText, 
  TrendingUp, 
  Calendar,
  PieChart,
  BarChart3,
  Globe
} from 'lucide-react'
import type { AcademicNote } from '@/types/academic'

interface StatsViewProps {
  stats: {
    total: { notes: number; screenshots: number; extracts: number }
    recent: { notes: number }
  }
  notes: AcademicNote[]
}

function StatsView({ stats, notes }: StatsViewProps) {
  // Calculs statistiques
  const notesByType = notes.reduce((acc, note) => {
    acc[note.type] = (acc[note.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const notesByDomain = notes.reduce((acc, note) => {
    const domain = note.metadata.domain
    acc[domain] = (acc[domain] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const topDomains = Object.entries(notesByDomain)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)

  const recentActivity = notes
    .filter(note => note.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000)
    .length

  const typeLabels = {
    article: 'Articles',
    'research-paper': 'Recherche',
    video: 'Vidéos',
    pdf: 'PDF',
    documentation: 'Documentation',
    webpage: 'Pages web'
  }

  const typeColors = {
    article: 'bg-blue-500',
    'research-paper': 'bg-green-500',
    video: 'bg-red-500',
    pdf: 'bg-orange-500',
    documentation: 'bg-purple-500',
    webpage: 'bg-gray-500'
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Statistiques</h2>
      
      {/* Métriques principales */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BookOpen size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stats.total.notes}</p>
              <p className="text-sm text-blue-800">Notes totales</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{recentActivity}</p>
              <p className="text-sm text-green-800">Cette semaine</p>
            </div>
          </div>
        </div>
      </div>

      {/* Répartition par type */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <PieChart size={16} className="mr-2" />
          Répartition par type
        </h3>
        
        <div className="space-y-2">
          {Object.entries(notesByType).map(([type, count]) => (
            <div key={type} className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${typeColors[type as keyof typeof typeColors] || 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-700 flex-1">
                {typeLabels[type as keyof typeof typeLabels] || type}
              </span>
              <span className="text-sm font-medium text-gray-900">{count}</span>
              <div className="w-20 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${typeColors[type as keyof typeof typeColors] || 'bg-gray-400'}`}
                  style={{ width: `${(count / stats.total.notes) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top domaines */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <Globe size={16} className="mr-2" />
          Sites les plus capturés
        </h3>
        
        <div className="space-y-2">
          {topDomains.map(([domain, count]) => (
            <div key={domain} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
              <span className="text-sm text-gray-700 truncate" title={domain}>
                {domain}
              </span>
              <span className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activité récente */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <Calendar size={16} className="mr-2" />
          Activité récente
        </h3>
        
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
            <span className="text-sm text-gray-700">Dernières 24h</span>
            <span className="text-sm font-medium text-gray-900">
              {notes.filter(note => note.timestamp > Date.now() - 24 * 60 * 60 * 1000).length}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
            <span className="text-sm text-gray-700">Dernière semaine</span>
            <span className="text-sm font-medium text-gray-900">
              {recentActivity}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
            <span className="text-sm text-gray-700">Ce mois</span>
            <span className="text-sm font-medium text-gray-900">
              {notes.filter(note => note.timestamp > Date.now() - 30 * 24 * 60 * 60 * 1000).length}
            </span>
          </div>
        </div>
      </div>

      {/* Métadonnées de stockage */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h3 className="text-md font-medium text-gray-900 mb-3 flex items-center">
          <BarChart3 size={16} className="mr-2" />
          Stockage local
        </h3>
        
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-gray-900">{stats.total.notes}</p>
            <p className="text-xs text-gray-600">Notes</p>
          </div>
          
          <div>
            <p className="text-lg font-bold text-gray-900">{stats.total.screenshots}</p>
            <p className="text-xs text-gray-600">Captures</p>
          </div>
          
          <div>
            <p className="text-lg font-bold text-gray-900">{stats.total.extracts}</p>
            <p className="text-xs text-gray-600">Extraits</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatsView