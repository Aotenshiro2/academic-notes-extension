import React, { useState } from 'react'
import { Filter, X, ChevronDown } from 'lucide-react'
import type { ContentType } from '@/types/academic'

interface NotesFilterProps {
  onFilterChange: (filters: FilterOptions) => void
  availableTags: string[]
}

export interface FilterOptions {
  contentType?: ContentType | 'all'
  dateRange?: 'today' | 'week' | 'month' | 'all'
  tags?: string[]
}

function NotesFilter({ onFilterChange, availableTags }: NotesFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filters, setFilters] = useState<FilterOptions>({
    contentType: 'all',
    dateRange: 'all',
    tags: []
  })

  const contentTypes = [
    { value: 'all', label: 'Tous les types' },
    { value: 'article', label: 'Articles' },
    { value: 'research-paper', label: 'Recherche' },
    { value: 'video', label: 'Vidéos' },
    { value: 'pdf', label: 'PDF' },
    { value: 'documentation', label: 'Documentation' },
    { value: 'webpage', label: 'Pages web' },
    { value: 'manual', label: 'Notes manuelles' }
  ]

  const dateRanges = [
    { value: 'all', label: 'Toutes les dates' },
    { value: 'today', label: 'Aujourd\'hui' },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' }
  ]

  const updateFilters = (newFilters: Partial<FilterOptions>) => {
    const updatedFilters = { ...filters, ...newFilters }
    setFilters(updatedFilters)
    onFilterChange(updatedFilters)
  }

  const resetFilters = () => {
    const resetFilters = {
      contentType: 'all' as const,
      dateRange: 'all' as const,
      tags: []
    }
    setFilters(resetFilters)
    onFilterChange(resetFilters)
  }

  const hasActiveFilters = 
    filters.contentType !== 'all' || 
    filters.dateRange !== 'all' || 
    filters.tags && filters.tags.length > 0

  const toggleTag = (tag: string) => {
    const currentTags = filters.tags || []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag]
    
    updateFilters({ tags: newTags })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
          hasActiveFilters
            ? 'bg-blue-100 text-blue-700 border border-blue-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
        }`}
      >
        <Filter size={16} />
        <span className="text-sm">Filtres</span>
        {hasActiveFilters && (
          <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {(filters.contentType !== 'all' ? 1 : 0) + 
             (filters.dateRange !== 'all' ? 1 : 0) + 
             (filters.tags?.length || 0)}
          </span>
        )}
        <ChevronDown size={14} className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <div className="p-4">
            {/* En-tête */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Filtres</h3>
              <div className="flex items-center space-x-2">
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Réinitialiser
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Type de contenu */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de contenu
              </label>
              <select
                value={filters.contentType}
                onChange={(e) => updateFilters({ contentType: e.target.value as ContentType | 'all' })}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {contentTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Période */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Période
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => updateFilters({ dateRange: e.target.value as FilterOptions['dateRange'] })}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {dateRanges.map(range => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            {availableTags.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags ({filters.tags?.length || 0} sélectionné{(filters.tags?.length || 0) > 1 ? 's' : ''})
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {availableTags.map(tag => (
                    <label key={tag} className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={filters.tags?.includes(tag) || false}
                        onChange={() => toggleTag(tag)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{tag}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotesFilter