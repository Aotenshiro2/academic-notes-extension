import React from 'react'
import { createRoot } from 'react-dom/client'
import FullscreenApp from './FullscreenApp'
import ErrorBoundary, { installUnhandledRejectionLogger } from '@/components/ErrorBoundary'
import { appliquerAffichageSecours } from '@/lib/affichage-secours'
import { installerCaptureErreurs } from '@/lib/diagnostic-traces'
import '@/sidepanel/index.css'

installUnhandledRejectionLogger()
// 1.8.14 : l'anneau des erreurs du diagnostic, et l'affichage de secours posé avant le premier rendu.
installerCaptureErreurs('pleinEcran')
appliquerAffichageSecours()

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <ErrorBoundary>
      <FullscreenApp />
    </ErrorBoundary>
  )
}
