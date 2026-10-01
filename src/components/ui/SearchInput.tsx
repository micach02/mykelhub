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
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border-0 bg-surface pr-9 pl-9.5 text-sm text-ink shadow-(--shadow-inset-sm) transition-shadow placeholder:text-muted focus:ring-2 focus:ring-brand/45 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
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
