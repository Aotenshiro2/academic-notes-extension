import React from 'react'
import { createRoot } from 'react-dom/client'
import FullscreenApp from './FullscreenApp'
import ErrorBoundary, { installUnhandledRejectionLogger } from '@/components/ErrorBoundary'
import '@/sidepanel/index.css'

installUnhandledRejectionLogger()

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <ErrorBoundary>
      <FullscreenApp />
    </ErrorBoundary>
  )
}
