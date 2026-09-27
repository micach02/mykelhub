import type { ReactNode } from 'react'

export interface TooltipRow {
  label: string
  value: string
  color?: string
}

/** Shared tooltip shell — surface, hairline ring, rows in text tokens with a
 *  colored swatch carrying series identity. */
export function ChartTooltip({
  title,
  rows,
  footer,
}: {
  title: string
  rows: TooltipRow[]
  footer?: ReactNode
}) {
  return (
    <div className="pointer-events-none min-w-44 rounded-lg border border-line bg-surface p-2.5 shadow-[var(--shadow-pop)]">
      <p className="mb-1.5 text-[12px] font-semibold text-ink">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="flex items-center gap-1.5 text-ink-2">
              {row.color ? (
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: row.color }}
                  aria-hidden
                />
              ) : null}
              {row.label}
            </span>
            <span className="tnum font-semibold text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-1.5 text-[11px] text-muted">{footer}</div> : null}
    </div>
  )
}
