import React, { useState } from 'react'
import { X, ExternalLink } from 'lucide-react'

function SkoolBanner() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  const handleJoinCommunity = () => {
    chrome.tabs.create({ 
      url: 'https://www.skool.com/aoknowledge-trading/about' 
    })
  }

  return (
    <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-b border-orange-200/50 px-3 py-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-orange-800 font-medium">
          Entourez-vous des meilleurs
        </span>
        
        <button
          onClick={handleJoinCommunity}
          className="px-2 py-0.5 bg-orange-600 text-white text-xs font-medium rounded hover:bg-orange-700 transition-colors"
        >
          Rejoins-nous
        </button>
      </div>
    </div>
  )
}

export default SkoolBanner