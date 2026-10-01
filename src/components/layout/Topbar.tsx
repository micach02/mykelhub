import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CarFront,
  CheckCircle2,
  Menu,
  Monitor,
  Moon,
  NotebookPen,
  Plus,
  Sun,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { RecordSaleModal } from '../sales/RecordSaleModal'
import { useStore } from '../../store/useStore'
import { ageBucket, buildAccounts, lowStock, stockLevel } from '../../lib/analytics'
import { useFormat } from '../../lib/useFormat'
import { cn, plural } from '../../lib/utils'
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
  const parkingBehind = useMemo(
    () =>
      [...accounts.values()]
        .filter((a) => a.parkingActive && a.parkingBehind > 0)
        .sort((a, b) => b.parkingOwed - a.parkingOwed),
    [accounts],
  )
  const low = useMemo(() => lowStock(products), [products])
  const alertCount = overdue.length + parkingBehind.length + low.length

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAlerts(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  /** Close the panel and go where the notification points. */
  const openFromAlert = (to: string) => {
    setShowAlerts(false)
    navigate(to)
  }

  const ThemeIcon = THEME_ICON[theme]
  const cycleTheme = () =>
    updateSettings({ theme: THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length] })

  return (
    <>
      <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 bg-surface/85 px-4 backdrop-blur-xl sm:px-6">
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
            <div className="animate-fade-up absolute top-12 left-0 z-30 w-full overflow-hidden rounded-2xl border border-(--edge) bg-surface-pop shadow-(--shadow-pop)">
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
              aria-label={`Notifications (${alertCount})`}
              aria-expanded={showAlerts}
              aria-haspopup="dialog"
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
              // Full width under the top bar on a phone, where a panel hung off
              // the bell would run past the screen edge.
              <div
                role="dialog"
                aria-label="Notifications"
                className="animate-fade-up fixed inset-x-3 top-[4.25rem] z-30 overflow-hidden rounded-2xl border border-(--edge) bg-surface-pop shadow-(--shadow-pop) sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-[23rem]"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="font-display text-[15px] font-semibold text-ink">Notifications</p>
                  <p className="text-[12px] text-muted">
                    {alertCount === 0
                      ? 'All clear'
                      : `${plural(alertCount, 'thing')} ${alertCount === 1 ? 'needs' : 'need'} attention`}
                  </p>
                </div>

                <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
                  {alertCount === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                      <CheckCircle2 size={22} style={{ color: 'var(--status-good)' }} aria-hidden />
                      <p className="text-[13px] text-ink-2">
                        Nobody is overdue, parking is paid up, and the shelves are stocked.
                      </p>
                    </div>
                  ) : null}

                  {overdue.length > 0 ? (
                    <AlertSection
                      tone="critical"
                      icon={<AlertTriangle size={13} aria-hidden />}
                      title="Owing over a month"
                      count={overdue.length}
                      moreLabel="See all on Credit"
                      onMore={() => openFromAlert('/credit')}
                    >
                      {overdue.slice(0, 4).map((a) => (
                        <AlertRow
                          key={a.customerId}
                          title={a.name}
                          detail={plural(a.daysOutstanding, 'day')}
                          value={fmt.money(a.balance)}
                          critical
                          onClick={() => openFromAlert(`/credit?customer=${a.customerId}`)}
                        />
                      ))}
                    </AlertSection>
                  ) : null}

                  {parkingBehind.length > 0 ? (
                    <AlertSection
                      tone="warning"
                      icon={<CarFront size={13} aria-hidden />}
                      title="Behind on parking"
                      count={parkingBehind.length}
                      moreLabel="See all on Parking"
                      onMore={() => openFromAlert('/parking')}
                    >
                      {parkingBehind.slice(0, 4).map((a) => (
                        <AlertRow
                          key={a.customerId}
                          title={a.name}
                          detail={`${plural(a.parkingBehind, 'month')} behind`}
                          value={fmt.money(a.parkingOwed)}
                          onClick={() => openFromAlert('/parking')}
                        />
                      ))}
                    </AlertSection>
                  ) : null}

                  {low.length > 0 ? (
                    <AlertSection
                      tone="warning"
                      icon={<Boxes size={13} aria-hidden />}
                      title="Running low"
                      count={low.length}
                      moreLabel="See what to buy"
                      onMore={() => openFromAlert('/inventory?filter=low')}
                    >
                      {low.slice(0, 5).map((p) => (
                        <AlertRow
                          key={p.id}
                          title={p.name}
                          detail={`Reorder at ${p.reorderLevel} ${p.unit}`}
                          value={p.stock <= 0 ? 'Out of stock' : `${p.stock} ${p.unit} left`}
                          critical={p.stock <= 0}
                          onClick={() => openFromAlert(`/inventory?focus=${p.id}`)}
                        />
                      ))}
                    </AlertSection>
                  ) : null}
                </div>
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

/** One kind of notification: a heading with a count, a few rows, and the rest. */
function AlertSection({
  tone,
  icon,
  title,
  count,
  moreLabel,
  onMore,
  children,
}: {
  tone: 'critical' | 'warning'
  icon: ReactNode
  title: string
  count: number
  moreLabel: string
  onMore: () => void
  children: ReactNode
}) {
  const color = tone === 'critical' ? 'var(--status-critical)' : 'var(--status-warning)'
  return (
    <section className="border-b border-line py-2 last:border-b-0">
      <div className="flex items-center gap-2 px-4 pt-1 pb-1.5">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full"
          style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
        >
          {icon}
        </span>
        <p className="flex-1 text-[11.5px] font-semibold tracking-wider text-ink-2 uppercase">
          {title}
        </p>
        <span className="tnum text-[12px] font-semibold text-muted">{count}</span>
      </div>
      <ul>{children}</ul>
      <button
        type="button"
        onClick={onMore}
        className="mt-0.5 flex items-center gap-1 px-4 py-1.5 text-[12.5px] font-medium text-brand hover:underline"
      >
        {moreLabel}
        <ArrowRight size={13} aria-hidden />
      </button>
    </section>
  )
}

function AlertRow({
  title,
  detail,
  value,
  critical,
  onClick,
}: {
  title: string
  detail: string
  value: string
  critical?: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{title}</span>
          <span className="block text-[11.5px] text-muted">{detail}</span>
        </span>
        <span
          className="tnum shrink-0 text-[12.5px] font-semibold"
          style={{ color: critical ? 'var(--status-critical)' : 'var(--text-primary)' }}
        >
          {value}
        </span>
      </button>
    </li>
  )
}
