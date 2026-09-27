import { Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={15}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9.5 w-full rounded-lg border border-line bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-muted transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/25 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded text-muted transition-colors hover:text-ink"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  )
}
