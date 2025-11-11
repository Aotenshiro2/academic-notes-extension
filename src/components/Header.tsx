import React from 'react'
import { GraduationCap, BookOpen } from 'lucide-react'

function Header() {
  return (
    <div className="header-section px-4 py-3">
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-lg">
          <GraduationCap size={20} className="text-white" />
        </div>
        
        <div>
          <h1 className="font-semibold text-lg">Academic Notes</h1>
          <p className="text-blue-100 text-sm">Collecteur académique</p>
        </div>
      </div>
    </div>
  )
}

export default Header