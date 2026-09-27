import { useEffect, useState } from 'react'

const ROLES = [
  'surface-1',
  'text-primary',
  'text-secondary',
  'text-muted',
  'grid',
  'baseline',
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
  'status-good',
  'status-warning',
  'status-critical',
] as const

type Role = (typeof ROLES)[number]
export type ChartTheme = Record<Role, string>

function read(): ChartTheme {
  const styles = getComputedStyle(document.documentElement)
  const out = {} as ChartTheme
  for (const role of ROLES) out[role] = styles.getPropertyValue(`--${role}`).trim()
  return out
}

/**
 * Resolves the palette to concrete colors for Recharts (which needs values,
 * not custom properties) and re-reads them whenever the theme is restamped.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(read)

  useEffect(() => {
    const update = () => setTheme(read())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

/** Categorical slots in their fixed validated order — never cycled. */
export function categoricalSeries(theme: ChartTheme): string[] {
  return [
    theme['series-1'],
    theme['series-2'],
    theme['series-3'],
    theme['series-4'],
    theme['series-5'],
    theme['series-6'],
    theme['series-7'],
    theme['series-8'],
  ]
}
