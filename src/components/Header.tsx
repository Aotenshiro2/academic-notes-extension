import React, { useState, useRef, useEffect } from 'react'
import { Upload, Maximize2, Clock, Plus, Loader2, Sparkles, FileText, FileDown } from 'lucide-react'

interface HeaderProps {
  onShowHistory?: () => void
  onHome?: () => void
  onFullscreen?: () => void
  onExportPDF?: () => void
  onExportDocx?: () => void
  onAnalyze?: () => void
  isExporting?: boolean
}

function Header({ onShowHistory, onHome, onFullscreen, onExportPDF, onExportDocx, onAnalyze, isExporting = false }: HeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const canExport = !!(onExportPDF || onExportDocx)

  // Fermer le menu sur clic extérieur
  useEffect(() => {
    if (!showExportMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

  const handleExportClick = () => {
    if (!canExport || isExporting) return
    setShowExportMenu(prev => !prev)
  }

  const handlePDF = () => {
    setShowExportMenu(false)
    onExportPDF?.()
  }

  const handleDocx = () => {
    setShowExportMenu(false)
    onExportDocx?.()
  }

  return (
    <div className="header-section px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Titre */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Trading Notes <span className="text-sm font-normal text-muted-foreground">by AOK</span>
          </h1>
        </div>

        {/* Icônes */}
        <div className="flex items-center space-x-1">

          {/* Bouton export avec dropdown */}
          <div ref={menuRef} className="relative">
            <button
              onClick={handleExportClick}
              disabled={!canExport || isExporting}
              className={`p-2 rounded-md transition-colors ${
                canExport && !isExporting
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
              title={
                isExporting ? 'Export en cours…'
                  : canExport ? 'Exporter la note'
                  : 'Sélectionnez une note pour exporter'
              }
              aria-label="Exporter la note"
            >
              {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1">
                <button
                  onClick={handlePDF}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <FileDown size={14} className="text-red-500 flex-shrink-0" />
                  Exporter en PDF
                </button>
                <button
                  onClick={handleDocx}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <FileText size={14} className="text-blue-500 flex-shrink-0" />
                  Google Docs (.docx)
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onAnalyze}
            disabled={!onAnalyze}
            className={`p-2 rounded-md transition-colors ${
              onAnalyze
                ? 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10'
                : 'text-muted-foreground/40 cursor-not-allowed'
            }`}
            title={onAnalyze ? 'Analyser avec une IA' : 'Sélectionnez une note pour analyser'}
            aria-label="Analyser avec une IA"
          >
            <Sparkles size={18} />
          </button>

          <button
            onClick={onFullscreen}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Ouvrir dans Journal d'Études"
            aria-label="Ouvrir dans Journal d'Études"
          >
            <Maximize2 size={18} />
          </button>

          <button
            onClick={onShowHistory}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Historique des notes"
            aria-label="Historique des notes"
          >
            <Clock size={18} />
          </button>

          <button
            onClick={onHome}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Nouvelle capture"
            aria-label="Nouvelle capture"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header
