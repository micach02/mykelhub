import type { ReactNode, ThHTMLAttributes } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'

/** Wide tables scroll inside their own container; the page never does. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full overflow-x-auto', className)}>{children}</div>
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>
      {children}
    </table>
  )
}

export function Th({
  children,
  align = 'left',
  sortable,
  active,
  direction,
  onSort,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  active?: boolean
  direction?: 'asc' | 'desc'
  onSort?: () => void
}) {
  const alignment =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(
        'sticky top-0 z-10 border-b border-line bg-surface px-3 py-3 first:pl-5 last:pr-5 text-[11.5px] font-semibold tracking-wider whitespace-nowrap text-muted uppercase',
        alignment,
        className,
      )}
      {...rest}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          // Buttons reset text-transform, so the heading's capitals are restated
          // here or sortable columns read differently from the rest.
          className={cn(
            'inline-flex items-center gap-1 rounded tracking-wider uppercase transition-colors hover:text-ink',
            align === 'right' && 'flex-row-reverse',
            active && 'text-ink',
          )}
        >
          {children}
          {active ? (
            direction === 'asc' ? (
              <ChevronUp size={13} aria-hidden />
            ) : (
              <ChevronDown size={13} aria-hidden />
            )
          ) : (
            <ChevronDown size={13} className="opacity-25" aria-hidden />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className,
  numeric,
  colSpan,
}: {
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  numeric?: boolean
  colSpan?: number
}) {
  const alignment =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-line px-3 py-3.5 align-middle text-ink first:pl-5 last:pr-5',
        alignment,
        numeric && 'tnum',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors last:[&>td]:border-b-0',
        onClick && 'cursor-pointer hover:bg-surface-2/80',
        className,
      )}
    >
      {children}
    </tr>
  )
}
