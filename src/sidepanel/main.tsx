import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary, { installUnhandledRejectionLogger } from '@/components/ErrorBoundary'
import { appliquerAffichageSecours } from '@/lib/affichage-secours'
import { installerCaptureErreurs } from '@/lib/diagnostic-traces'
import './index.css'

installUnhandledRejectionLogger()
// 1.8.14 : l'anneau des erreurs du diagnostic, et l'affichage de secours posé avant le premier rendu.
installerCaptureErreurs('panneau')
appliquerAffichageSecours()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
