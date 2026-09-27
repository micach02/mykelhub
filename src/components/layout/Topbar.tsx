import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Menu, Monitor, Moon, NotebookPen, Plus, Sun } from 'lucide-react'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { RecordSaleModal } from '../sales/RecordSaleModal'
import { useStore } from '../../store/useStore'
import { ageBucket, buildAccounts, lowStock, stockLevel } from '../../lib/analytics'
import { useFormat } from '../../lib/useFormat'
import { cn } from '../../lib/utils'
import type { Settlement, ThemePreference } from '../../types'

const THEME_CYCLE: ThemePreference[] = ['light', 'dark', 'system']
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor }

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const navigate = useNavigate()
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const theme = useStore((s) => s.settings.theme)
  const updateSettings = useStore((s) => s.updateSettings)

  const [query, setQuery] = useState('')
  const [showAlerts, setShowAlerts] = useState(false)
  const [saleOpen, setSaleOpen] = useState<Settlement | null>(null)
  const alertsRef = useRef<HTMLDivElement>(null)

  const accounts = useMemo(
    () => buildAccounts(customers, sales, payments),
    [customers, sales, payments],
  )

  const overdue = useMemo(
    () =>
      [...accounts.values()]
        .filter((a) => a.balance > 0 && ageBucket(a.daysOutstanding) === 'overdue')
        .sort((a, b) => b.balance - a.balance),
    [accounts],
  )
  const low = useMemo(() => lowStock(products), [products])
  const alertCount = overdue.length + low.length

  /** One search box across both the customer list and the shelves. */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return { customers: [], products: [] }
    return {
      customers: customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4),
      products: products
        .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
        .slice(0, 5),
    }
  }, [customers, products, query])

  const hasResults = results.customers.length + results.products.length > 0

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) setShowAlerts(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const ThemeIcon = THEME_ICON[theme]
  const cycleTheme = () =>
    updateSettings({ theme: THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length] })

  return (
    <>
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenNav}
          className="lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={19} />
        </Button>

        <div className="relative hidden max-w-md flex-1 sm:block">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a customer or product"
          />
          {hasResults ? (
            <div className="animate-fade-up absolute top-11 left-0 z-30 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-pop)]">
              {results.customers.length > 0 ? (
                <>
                  <p className="border-b border-line px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                    Customers
                  </p>
                  <ul>
                    {results.customers.map((c) => {
                      const account = accounts.get(c.id)
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => {
                              setQuery('')
                              navigate(`/credit?customer=${c.id}`)
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                          >
                            <span className="truncate text-[13px] font-medium text-ink">
                              {c.name}
                            </span>
                            <span className="tnum shrink-0 text-[12px] font-semibold text-ink">
                              {fmt.money(account?.balance ?? 0)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : null}

              {results.products.length > 0 ? (
                <>
                  <p className="border-y border-line px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
                    Products
                  </p>
                  <ul>
                    {results.products.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => {
                            setQuery('')
                            navigate(`/inventory?focus=${p.id}`)
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {p.name}
                            </span>
                            <span className="block text-[11.5px] text-muted">{p.category}</span>
                          </span>
                          <span
                            className={cn(
                              'tnum shrink-0 text-[12px]',
                              stockLevel(p) === 'ok' ? 'text-ink-2' : 'font-semibold text-ink',
                            )}
                          >
                            {p.stock} {p.unit}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" onClick={() => setSaleOpen('credit')}>
            <NotebookPen size={15} aria-hidden />
            <span className="hidden sm:inline">Credit sale</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setSaleOpen('cash')}>
            <Plus size={15} aria-hidden />
            <span className="hidden sm:inline">Record sale</span>
          </Button>

          <div className="relative" ref={alertsRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAlerts((v) => !v)}
              aria-label={`Alerts (${alertCount})`}
              aria-expanded={showAlerts}
            >
              <span className="relative">
                <Bell size={18} />
                {alertCount > 0 ? (
                  <span
                    className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[9.5px] font-bold text-white"
                    style={{ background: 'var(--status-critical)' }}
                  >
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                ) : null}
              </span>
            </Button>

            {showAlerts ? (
              <div className="animate-fade-up absolute top-11 right-0 z-30 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-pop)]">
                {alertCount === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[13px] text-ink-2">
                    Nothing needs attention.
                  </p>
                ) : null}

                {overdue.length > 0 ? (
                  <>
                    <p className="border-b border-line px-3.5 py-2 text-[12px] font-semibold text-ink">
                      Owing over a month
                    </p>
                    <ul>
                      {overdue.slice(0, 4).map((a) => (
                        <li key={a.customerId} className="border-b border-line last:border-b-0">
                          <button
                            onClick={() => {
                              setShowAlerts(false)
                              navigate(`/credit?customer=${a.customerId}`)
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] text-ink">{a.name}</span>
                              <span className="block text-[11.5px] text-muted">
                                {a.daysOutstanding} days
                              </span>
                            </span>
                            <span
                              className="tnum shrink-0 text-[12px] font-semibold"
                              style={{ color: 'var(--status-critical)' }}
                            >
                              {fmt.money(a.balance)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {low.length > 0 ? (
                  <>
                    <p className="border-y border-line px-3.5 py-2 text-[12px] font-semibold text-ink">
                      Running low
                    </p>
                    <ul>
                      {low.slice(0, 4).map((p) => (
                        <li key={p.id} className="border-b border-line last:border-b-0">
                          <button
                            onClick={() => {
                              setShowAlerts(false)
                              navigate(`/inventory?focus=${p.id}`)
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                          >
                            <span className="truncate text-[13px] text-ink">{p.name}</span>
                            <span
                              className="tnum shrink-0 text-[12px] font-semibold"
                              style={{
                                color:
                                  p.stock <= 0 ? 'var(--status-critical)' : 'var(--text-primary)',
                              }}
                            >
                              {p.stock} left
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            aria-label={`Theme: ${theme}. Change theme.`}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon size={18} />
          </Button>
        </div>
      </header>

      <RecordSaleModal
        open={saleOpen !== null}
        presetSettlement={saleOpen ?? 'cash'}
        onClose={() => setSaleOpen(null)}
      />
    </>
  )
}
