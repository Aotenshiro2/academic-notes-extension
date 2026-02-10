import React, { useState, useEffect } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Récupérer le thème sauvegardé ou utiliser 'system' par défaut
    const savedTheme = (localStorage.getItem('theme') as Theme) || 'system'
    setTheme(savedTheme)
    applyTheme(savedTheme)
  }, [])

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement
    
    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else if (newTheme === 'light') {
      root.classList.remove('dark')
    } else {
      // System theme
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (systemPrefersDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextTheme = themes[(currentIndex + 1) % themes.length]
    
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
    applyTheme(nextTheme)
  }

  const iconSize = compact ? 14 : 16

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun size={iconSize} />
      case 'dark':
        return <Moon size={iconSize} />
      case 'system':
        return <Monitor size={iconSize} />
      default:
        return <Monitor size={iconSize} />
    }
  }

  const getThemeLabel = () => {
    switch (theme) {
      case 'light':
        return 'Clair'
      case 'dark':
        return 'Sombre'
      case 'system':
        return 'Système'
      default:
        return 'Système'
    }
  }

  if (!mounted) {
    return null
  }

  if (compact) {
    return (
      <button
        onClick={cycleTheme}
        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
        title={`Thème: ${getThemeLabel()}`}
        aria-label={`Changer le thème (${getThemeLabel()})`}
      >
        {getThemeIcon()}
      </button>
    )
  }

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium aoknowledge-transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
      title={`Changer de thème (actuellement: ${getThemeLabel()})`}
      aria-label={`Changer de thème, actuellement ${getThemeLabel()}`}
    >
      <span className="text-muted-foreground" aria-hidden="true">{getThemeIcon()}</span>
      <span className="text-muted-foreground">{getThemeLabel()}</span>
    </button>
  )
}

export default ThemeToggle