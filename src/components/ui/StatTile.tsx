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
    // Tiles sit two across on a phone, so the figure steps down a size there
    // rather than squeezing a long amount out of its card.
    <div className="min-w-0 rounded-3xl border border-(--edge) bg-surface p-4 shadow-(--shadow-card) backdrop-blur-xl sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-[12.5px] font-medium text-ink-2 sm:text-[13px]">{label}</p>
        {icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-brand shadow-(--shadow-control)">
            {icon}
          </span>
        ) : null}
      </div>

      <p className="font-display mt-3 text-[20px] leading-none font-semibold tracking-tight wrap-anywhere text-ink sm:text-[24px]">
        {value}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {hasDelta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
              flat ? 'text-ink-2' : good ? 'bg-up/10 text-up' : 'bg-down/10 text-down',
              'shadow-(--shadow-inset-sm)',
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
