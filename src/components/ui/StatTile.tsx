import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn, formatPercent } from '../../lib/utils'

/**
 * A headline figure. The delta ships an arrow plus the sign, so direction is
 * never carried by color alone.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  /** Some measures (cost, refunds) are better when they fall. */
  invertDelta = false,
  footer,
}: {
  label: string
  value: ReactNode
  delta?: number
  deltaLabel?: string
  icon?: ReactNode
  invertDelta?: boolean
  footer?: ReactNode
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const flat = hasDelta && Math.abs(delta) < 0.05
  const rising = hasDelta && delta > 0
  const good = invertDelta ? !rising : rising
  const Arrow = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-2">{label}</p>
        {icon ? <span className="text-muted">{icon}</span> : null}
      </div>

      <p className="mt-2.5 text-[26px] leading-none font-semibold tracking-tight text-ink">
        {value}
      </p>

      <div className="mt-2.5 flex items-center gap-2 text-[12px]">
        {hasDelta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              flat ? 'text-ink-2' : good ? 'text-up' : 'text-down',
            )}
          >
            <Arrow size={13} aria-hidden />
            {formatPercent(delta)}
          </span>
        ) : null}
        {deltaLabel ? <span className="text-muted">{deltaLabel}</span> : null}
        {footer}
      </div>
    </div>
  )
}
