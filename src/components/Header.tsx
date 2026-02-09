import React from 'react'
import { Upload, Maximize2, Clock, Plus } from 'lucide-react'

interface HeaderProps {
  onShowHistory?: () => void
  onHome?: () => void
  onFullscreen?: () => void
  onExportPDF?: () => void
}

function Header({ onShowHistory, onHome, onFullscreen, onExportPDF }: HeaderProps) {
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
            disabled={!onExportPDF}
            className={`p-2 rounded-md transition-colors ${
              onExportPDF
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                : 'text-muted-foreground/40 cursor-not-allowed'
            }`}
            title={onExportPDF ? "Exporter en PDF" : "Sélectionnez une note pour exporter"}
          >
            <Upload size={18} />
          </button>

          <button
            onClick={onFullscreen}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Ouvrir dans Journal d'Études"
          >
            <Maximize2 size={18} />
          </button>

          <button
            onClick={onShowHistory}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Historique des notes"
          >
            <Clock size={18} />
          </button>

          <button
            onClick={onHome}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Nouvelle capture"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header