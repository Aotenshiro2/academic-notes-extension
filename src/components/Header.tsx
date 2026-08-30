import React, { useState, useRef, useEffect } from 'react'
import { Upload, Maximize2, Clock, Plus, Loader2, Sparkles, FileText, FileDown } from 'lucide-react'

function GoogleDriveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  )
}

interface HeaderProps {
  onShowHistory?: () => void
  onHome?: () => void
  onFullscreen?: () => void
  onExportPDF?: () => void
  onExportDocx?: () => void
  onExportDrive?: () => void
  onAnalyze?: () => void
  isExporting?: boolean
}

function Header({ onShowHistory, onHome, onFullscreen, onExportPDF, onExportDocx, onExportDrive, onAnalyze, isExporting = false }: HeaderProps) {
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

  const handleDrive = () => {
    setShowExportMenu(false)
    onExportDrive?.()
  }

  return (
    <div className="header-section px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Titre */}
        <div>
          <h1 className="text-lg font-semibold text-foreground whitespace-nowrap">
            Le Carnet du Trader
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
                {onExportDrive && (
                  <button
                    onClick={handleDrive}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <GoogleDriveIcon size={14} />
                    Google Drive
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Le warmup a quitté le header en 1.8.0 : « Lancer un warmup » est
              déjà docké au-dessus de la barre de capture, là où on l'utilise
              vraiment. Deux entrées pour la même action encombraient une barre
              qui n'a pas de place à perdre. */}

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

          {/* L'approfondissement n'est PAS ici : il vit dans la note, juste
              sous le résumé que la capture vient d'écrire. C'est là qu'on a
              envie d'aller plus loin, pas dans une barre d'outils globale. */}

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
