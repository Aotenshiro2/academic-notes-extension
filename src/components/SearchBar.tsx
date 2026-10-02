import React from 'react'
import { Search, X } from 'lucide-react'
import { t } from '@/lib/i18n'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function SearchBar({ value, onChange, placeholder = t('recherche.placeholder') }: SearchBarProps) {
  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search size={16} className="text-muted-foreground group-focus-within:text-primary aoknowledge-transition" />
      </div>
      
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field pl-10 pr-10 h-10"
        placeholder={placeholder}
      />
      
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center group hover:bg-muted/50 rounded-r-md aoknowledge-transition"
          title={t('recherche.effacer')}
        >
          <X size={16} className="text-muted-foreground hover:text-foreground aoknowledge-transition" />
        </button>
      )}
    </div>
  )
}

export default SearchBar