import { cn } from '../../lib/utils'

export interface BarRow {
  id: string
  label: string
  value: number
  /** Optional secondary text shown under the label. */
  meta?: string
}

/**
 * Horizontal magnitude bars. Single series, so one hue; every bar carries a
 * visible value label, which is why no tooltip layer is needed here.
 */
export function BarList({
  rows,
  formatValue,
  color = 'var(--series-1)',
  onSelect,
  emptyMessage = 'No data for this period.',
}: {
  rows: BarRow[]
  formatValue: (v: number) => string
  color?: string
  onSelect?: (id: string) => void
  emptyMessage?: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)

  if (rows.length === 0) {
    return <p className="py-8 text-center text-[13px] text-ink-2">{emptyMessage}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const pct = max === 0 ? 0 : (row.value / max) * 100
        const Wrapper = onSelect ? 'button' : 'div'
        return (
          <li key={row.id}>
            <Wrapper
              {...(onSelect
                ? { onClick: () => onSelect(row.id), type: 'button' as const }
                : {})}
              className={cn(
                'block w-full text-left',
                onSelect && 'group cursor-pointer rounded-md',
              )}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-4">
                <span className="min-w-0 truncate text-[13px] text-ink group-hover:text-brand">
                  {row.label}
                  {row.meta ? (
                    <span className="ml-1.5 text-[11.5px] text-muted">{row.meta}</span>
                  ) : null}
                </span>
                <span className="tnum shrink-0 text-[12.5px] font-semibold text-ink">
                  {formatValue(row.value)}
                </span>
              </div>
              {/* A groove pressed into the card, anchored to the baseline at left. */}
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface shadow-(--shadow-inset-sm)">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.max(pct, 1.5)}%`, background: color }}
                />
              </div>
            </Wrapper>
          </li>
        )
      })}
    </ul>
  )
}
