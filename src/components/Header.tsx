import React from 'react'
import { Upload, Maximize2, Clock, Plus, Loader2, Sparkles } from 'lucide-react'

interface HeaderProps {
  onShowHistory?: () => void
  onHome?: () => void
  onFullscreen?: () => void
  onExportPDF?: () => void
  onAnalyze?: () => void
  isExporting?: boolean
}

function Header({ onShowHistory, onHome, onFullscreen, onExportPDF, onAnalyze, isExporting = false }: HeaderProps) {
  return (
    <div className="header-section px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Titre style Claude */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Trading Notes <span className="text-sm font-normal text-muted-foreground">by AOK</span>
          </h1>
        </div>

        {/* 4 icônes style Claude */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onExportPDF}
            disabled={!onExportPDF || isExporting}
            className={`p-2 rounded-md transition-colors ${
              onExportPDF && !isExporting
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                : 'text-muted-foreground/40 cursor-not-allowed'
            }`}
            title={isExporting ? "Export en cours..." : onExportPDF ? "Exporter en PDF" : "Sélectionnez une note pour exporter"}
            aria-label="Exporter en PDF"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          </button>

          <button
            onClick={onAnalyze}
            disabled={!onAnalyze}
            className={`p-2 rounded-md transition-colors ${
              onAnalyze
                ? 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10'
                : 'text-muted-foreground/40 cursor-not-allowed'
            }`}
            title={onAnalyze ? "Analyser avec une IA" : "Sélectionnez une note pour analyser"}
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