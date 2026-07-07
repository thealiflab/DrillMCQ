import { useCallback, useEffect, useState } from 'react'
import { loadTheme, saveTheme, type Theme } from '../services/storage'

/**
 * Dark/light mode. Priority: saved preference > OS preference > light.
 * The theme is applied by toggling the `dark` class on <html>, which the
 * Tailwind `dark:` variant is configured to key off.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = loadTheme()
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    saveTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
