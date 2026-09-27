import { cn } from '../../lib/utils'

export interface Segment<T extends string> {
  value: T
  label: string
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  segments: Array<Segment<T>>
  value: T
  onChange: (next: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
    >
      {segments.map((segment) => {
        const active = segment.value === value
        return (
          <button
            key={segment.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              'rounded-[6px] font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
              active
                ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                : 'text-ink-2 hover:text-ink',
            )}
          >
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}
