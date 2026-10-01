import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useStore } from '../../store/useStore'
import { DEFAULT_UI_STYLE } from '../../types'

/** Resolves the theme preference onto <html data-theme>, tracking the OS
 *  setting while the preference is "system", and the look onto data-style. */
function useAppliedTheme() {
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

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()
  useAppliedTheme()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    // No background here: the body carries the plane, and in the futuristic
    // style its glows, which a fill on this wrapper would paint over.
    <div className="min-h-full">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-64">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
