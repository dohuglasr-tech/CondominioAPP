import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light'

interface ThemeContextType {
  theme: ThemeMode
  isLight: boolean
  isDark: boolean
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

const THEME_STORAGE_KEY = 'condominio_theme_mode'

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  isLight: false,
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
})

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') {
        return stored
      }
    } catch (_) {
      // localStorage inaccesible
    }
    return 'dark' // Modo nativo por defecto
  })

  // Sincronizar clases y atributos en el DOM cada vez que cambie el tema
  const applyThemeToDOM = useCallback((currentTheme: ThemeMode) => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const body = document.body

    if (currentTheme === 'light') {
      root.classList.add('theme-light')
      root.classList.remove('theme-dark')
      root.setAttribute('data-theme', 'light')

      body.classList.add('theme-light')
      body.classList.remove('theme-dark')
      body.setAttribute('data-theme', 'light')

      // Meta theme-color para navegadores móviles (Safari iOS y Chrome Android)
      let metaTheme = document.querySelector('meta[name="theme-color"]')
      if (!metaTheme) {
        metaTheme = document.createElement('meta')
        metaTheme.setAttribute('name', 'theme-color')
        document.head.appendChild(metaTheme)
      }
      metaTheme.setAttribute('content', '#f8fafc')
    } else {
      root.classList.add('theme-dark')
      root.classList.remove('theme-light')
      root.setAttribute('data-theme', 'dark')

      body.classList.add('theme-dark')
      body.classList.remove('theme-light')
      body.setAttribute('data-theme', 'dark')

      let metaTheme = document.querySelector('meta[name="theme-color"]')
      if (metaTheme) {
        metaTheme.setAttribute('content', '#070b14')
      }
    }
  }, [])

  useEffect(() => {
    applyThemeToDOM(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch (_) {
      // ignorar
    }
  }, [theme, applyThemeToDOM])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme)
  }, [])

  const isLight = theme === 'light'
  const isDark = theme === 'dark'

  return (
    <ThemeContext.Provider value={{ theme, isLight, isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
