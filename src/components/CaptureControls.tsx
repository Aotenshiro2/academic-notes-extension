import React from 'react'
import { Camera, FileText, MousePointer, Globe, Zap } from 'lucide-react'

interface CaptureControlsProps {
  onCapture: (type: 'page' | 'selection' | 'screenshot') => void
}

function CaptureControls({ onCapture }: CaptureControlsProps) {
  return (
    <div className="px-4 py-3 bg-gray-50 border-b">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Capture rapide</h3>
      
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onCapture('page')}
          className="flex flex-col items-center p-3 bg-white border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          title="Capturer le contenu principal de la page"
        >
          <Globe size={20} className="text-gray-600 group-hover:text-blue-600 mb-1" />
          <span className="text-xs text-gray-600 group-hover:text-blue-600 font-medium">Page</span>
        </button>
        
        <button
          onClick={() => onCapture('selection')}
          className="flex flex-col items-center p-3 bg-white border rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors group"
          title="Capturer une sélection de texte"
        >
          <MousePointer size={20} className="text-gray-600 group-hover:text-green-600 mb-1" />
          <span className="text-xs text-gray-600 group-hover:text-green-600 font-medium">Sélection</span>
        </button>
        
        <button
          onClick={() => onCapture('screenshot')}
          className="flex flex-col items-center p-3 bg-white border rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
          title="Prendre une capture d'écran"
        >
          <Camera size={20} className="text-gray-600 group-hover:text-purple-600 mb-1" />
          <span className="text-xs text-gray-600 group-hover:text-purple-600 font-medium">Capture</span>
        </button>
      </div>

      <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
        <div className="flex items-start space-x-2">
          <Zap size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700">
            <p className="font-medium mb-1">Raccourcis clavier :</p>
            <p>• <kbd className="bg-white px-1 rounded">Ctrl+Shift+A</kbd> : Ouvrir panneau</p>
            <p>• <kbd className="bg-white px-1 rounded">Ctrl+Shift+C</kbd> : Capture rapide</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CaptureControls