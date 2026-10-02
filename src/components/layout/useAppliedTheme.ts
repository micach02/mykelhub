import { useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { DEFAULT_UI_STYLE } from '../../types'

/**
 * Resolves the theme preference onto <html data-theme>, tracking the OS
 * setting while the preference is "system", and the look onto data-style.
 * Used once at the top of the app, so the login page follows them too.
 */
export function useAppliedTheme() {
  const theme = useStore((s) => s.settings.theme)
  const style = useStore((s) => s.settings.style ?? DEFAULT_UI_STYLE)

  useEffect(() => {
    document.documentElement.dataset.style = style
  }, [style])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
