import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleSlash, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

export type Tone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'brand'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  good: 'bg-[color-mix(in_srgb,var(--status-good)_14%,transparent)] text-[var(--status-good)] border-[color-mix(in_srgb,var(--status-good)_35%,transparent)]',
  warning:
    'bg-[color-mix(in_srgb,var(--status-warning)_18%,transparent)] text-[var(--text-primary)] border-[color-mix(in_srgb,var(--status-warning)_45%,transparent)]',
  serious:
    'bg-[color-mix(in_srgb,var(--status-serious)_16%,transparent)] text-[var(--text-primary)] border-[color-mix(in_srgb,var(--status-serious)_42%,transparent)]',
  critical:
    'bg-[color-mix(in_srgb,var(--status-critical)_14%,transparent)] text-[var(--status-critical)] border-[color-mix(in_srgb,var(--status-critical)_38%,transparent)]',
  brand: 'bg-brand-soft text-brand border-[color-mix(in_srgb,var(--brand)_35%,transparent)]',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * Stock state always ships an icon plus a word — the color alone never
 * carries the meaning.
 */
export function StockBadge({ level }: { level: 'out' | 'low' | 'ok' }) {
  if (level === 'out') {
    return (
      <Badge tone="critical" icon={<CircleSlash size={12} aria-hidden />}>
        Out of stock
      </Badge>
    )
  }
  if (level === 'low') {
    return (
      <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden />}>
        Low stock
      </Badge>
    )
  }
  return (
    <Badge tone="good" icon={<CheckCircle2 size={12} aria-hidden />}>
      In stock
    </Badge>
  )
}

export function InfoBadge({ children }: { children: ReactNode }) {
  return (
    <Badge tone="brand" icon={<Info size={12} aria-hidden />}>
      {children}
    </Badge>
  )
}
