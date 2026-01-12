import React from 'react'
import { Download, Maximize2, Clock, Plus } from 'lucide-react'

interface HeaderProps {
  onShowHistory?: () => void
  onNewNote?: () => void
}

function Header({ onShowHistory, onNewNote }: HeaderProps) {
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
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Exporter en PDF"
          >
            <Download size={18} />
          </button>
          
          <button
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Plein écran"
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
            onClick={onNewNote}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title="Nouvelle note"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default Header