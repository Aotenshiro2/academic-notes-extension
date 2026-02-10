import React, { useState, useEffect, useCallback } from 'react'
import { X, Globe, Loader2 } from 'lucide-react'

interface TabInfo {
  id: number
  title: string
  url: string
  favIconUrl?: string
}

interface TabPickerProps {
  isOpen: boolean
  onSelect: (tabId: number) => void
  onCancel: () => void
  title?: string
  description?: string
}

function TabPicker({
  isOpen,
  onSelect,
  onCancel,
  title = 'Choisir un onglet',
  description = "S\u00e9lectionnez l'onglet \u00e0 capturer"
}: TabPickerProps) {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)

    chrome.tabs.query({}).then(allTabs => {
      const filteredTabs = allTabs
        .filter(tab =>
          tab.id !== undefined &&
          tab.url &&
          !tab.url.startsWith('chrome-extension://') &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('edge://') &&
          !tab.url.startsWith('about:')
        )
        .map(tab => ({
          id: tab.id!,
          title: tab.title || 'Sans titre',
          url: tab.url!,
          favIconUrl: tab.favIconUrl
        }))

      setTabs(filteredTabs)
      setIsLoading(false)
    }).catch(err => {
      console.error('Error loading tabs:', err)
      setIsLoading(false)
    })
  }, [isOpen])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }, [onCancel])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-popover border border-border rounded-xl shadow-xl w-[420px] max-h-[500px] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Liste des onglets */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tabs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Aucun onglet disponible
            </div>
          ) : (
            tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onSelect(tab.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-muted/50 transition-colors"
              >
                {tab.favIconUrl ? (
                  <img
                    src={tab.favIconUrl}
                    alt=""
                    className="w-5 h-5 rounded flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <Globe size={18} className="text-muted-foreground flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {tab.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getDomain(tab.url)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            {tabs.length} onglet{tabs.length > 1 ? 's' : ''} disponible{tabs.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

export default TabPicker
