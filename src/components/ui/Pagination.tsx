import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, plural } from '../../lib/utils'

/**
 * One page of a long list at a time. `resetOn` lists whatever narrows the list
 * (search, filters, sort): changing any of them goes back to the first page,
 * while an edit to a row keeps you on the page you were reading.
 */
export function usePagination<T>(rows: T[], pageSize: number, resetOn: unknown[]) {
  const [page, setPage] = useState(1)
  // The caller's filters are the dependencies, whatever they are.
  useEffect(() => setPage(1), resetOn)

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  // A row removed from the last page can leave it empty; step back a page.
  const current = Math.min(page, pageCount)
  const start = (current - 1) * pageSize

  return {
    page: current,
    setPage,
    pageCount,
    pageSize,
    start,
    total: rows.length,
    visible: rows.slice(start, start + pageSize),
  }
}

/** Page numbers to show: the ends, and the pages either side of the current one. */
function pageNumbers(current: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const keep = new Set([1, count, current - 1, current, current + 1])
  if (current <= 4) [2, 3, 4, 5].forEach((n) => keep.add(n))
  if (current >= count - 3) [count - 4, count - 3, count - 2, count - 1].forEach((n) => keep.add(n))
  const sorted = [...keep].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b)

  const out: Array<number | 'gap'> = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap')
    out.push(n)
  })
  return out
}

function PageButton({
  children,
  active,
  ...rest
}: { children: ReactNode; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'tnum grid h-8 min-w-8 place-items-center rounded-full px-2 text-[13px] font-medium transition-[color,box-shadow]',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'text-brand shadow-(--shadow-inset-sm)'
          : 'text-ink-2 shadow-(--shadow-control) hover:text-ink',
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * Sits at the foot of a card, as its direct child. Hidden when everything
 * fits on one page.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  start,
  total,
  onPage,
  noun,
  many,
}: {
  page: number
  pageCount: number
  pageSize: number
  start: number
  total: number
  onPage: (page: number) => void
  /** What is being counted, singular: "sale", "product". */
  noun: string
  /** The plural, when adding an s will not do: "entries". */
  many?: string
}) {
  const ref = useRef<HTMLElement>(null)
  if (total <= pageSize) return null

  function go(next: number) {
    onPage(Math.min(Math.max(1, next), pageCount))
    // Back to the top of the list if it has scrolled away. Inside a dialog it
    // is the dialog's overlay that scrolls; on a page it is the window, and
    // the list has to clear the sticky top bar.
    const list = ref.current?.parentElement
    if (!list) return
    const top = list.getBoundingClientRect().top
    const overlay = list.closest('[role="dialog"]')?.parentElement
    if (overlay) {
      const edge = overlay.getBoundingClientRect().top + 16
      if (top < edge) overlay.scrollBy({ top: top - edge, behavior: 'smooth' })
    } else if (top < 72) {
      window.scrollBy({ top: top - 72, behavior: 'smooth' })
    }
  }

  return (
    <nav
      ref={ref}
      aria-label="Pages"
      className="flex flex-col items-center gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-between"
    >
      <p className="tnum text-[12.5px] text-muted">
        {start + 1}&ndash;{Math.min(start + pageSize, total)} of {plural(total, noun, many)}
      </p>
      <div className="flex items-center gap-1">
        <PageButton onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page">
          <ChevronLeft size={15} aria-hidden />
        </PageButton>
        <span className="hidden items-center gap-1 sm:flex">
          {pageNumbers(page, pageCount).map((n, i) =>
            n === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-[13px] text-muted" aria-hidden>
                &hellip;
              </span>
            ) : (
              <PageButton
                key={n}
                active={n === page}
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Page ${n}`}
                onClick={() => go(n)}
              >
                {n}
              </PageButton>
            ),
          )}
        </span>
        <span className="tnum px-2 text-[12.5px] text-ink-2 sm:hidden">
          Page {page} of {pageCount}
        </span>
        <PageButton
          onClick={() => go(page + 1)}
          disabled={page === pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={15} aria-hidden />
        </PageButton>
      </div>
    </nav>
  )
}
