import React from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Filet de dernier recours autour d'une racine React.
 *
 * Sans lui, la moindre exception pendant un rendu démonte tout l'arbre et
 * l'utilisateur se retrouve devant un panneau BLANC — c'est ce qu'a vécu Brice
 * pendant un renommage de note (04/08). Les notes vivent dans IndexedDB, donc
 * elles survivent : il suffit de recharger. Cet écran le dit, et garde la trace
 * de l'erreur sous la main pour le diagnostic.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Rendu interrompu:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[280px] p-6 text-center">
        <AlertTriangle size={28} className="text-amber-500" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Le carnet s'est interrompu</p>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            Tes notes sont intactes, elles sont enregistrées en local. Recharge
            pour repartir là où tu en étais.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RotateCw size={12} />
          Recharger
        </button>
        <details className="w-full max-w-[320px] text-left">
          <summary className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
            Détail technique
          </summary>
          <pre className="mt-1.5 p-2 text-[10px] text-muted-foreground/70 bg-muted/40 rounded overflow-auto max-h-32 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        </details>
      </div>
    )
  }
}

/**
 * Les rejets de promesse non gérés ne déclenchent PAS l'ErrorBoundary (React ne
 * voit que les erreurs de rendu). On les journalise au moins, sinon un échec
 * d'écriture disparaît sans laisser de trace.
 */
export function installUnhandledRejectionLogger() {
  window.addEventListener('unhandledrejection', event => {
    console.error('[Carnet] Promesse rejetée sans traitement:', event.reason)
  })
}

export default ErrorBoundary
