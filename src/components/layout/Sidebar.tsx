import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Banknote,
  Boxes,
  CarFront,
  LayoutDashboard,
  NotebookPen,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useStore } from '../../store/useStore'
import { ageBucket, buildAccounts, lowStock } from '../../lib/analytics'

interface NavItem {
  to: string
  label: string
  sublabel: string
  icon: typeof Boxes
  badge?: 'credit' | 'lowStock' | 'parking'
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', sublabel: 'How the store is doing', icon: LayoutDashboard },
  { to: '/credit', label: 'Credit', sublabel: 'Who owes you', icon: NotebookPen, badge: 'credit' },
  { to: '/parking', label: 'Parking', sublabel: 'Spaces and fees', icon: CarFront, badge: 'parking' },
  { to: '/inventory', label: 'Inventory', sublabel: 'What is on the shelf', icon: Boxes, badge: 'lowStock' },
  { to: '/sales', label: 'Sales', sublabel: 'Recorded transactions', icon: Banknote },
  { to: '/reports', label: 'Reports', sublabel: 'Profit, credit, stock', icon: BarChart3 },
  { to: '/settings', label: 'Settings', sublabel: 'Store and data', icon: SettingsIcon },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const storeName = useStore((s) => s.settings.storeName)

  const accounts = [...buildAccounts(customers, sales, payments).values()]
  const lowCount = lowStock(products).length
  const overdueCount = accounts.filter(
    (a) => a.balance > 0 && ageBucket(a.daysOutstanding) === 'overdue',
  ).length
  const parkingBehind = accounts.filter((a) => a.parkingActive && a.parkingBehind > 0).length

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={onClose} aria-hidden />
      ) : null}

      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg text-[15px] font-bold text-white"
              style={{ background: 'var(--brand)' }}
              aria-hidden
            >
              M
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] leading-tight font-semibold text-ink">MykelHub</p>
              <p className="truncate text-[11px] text-muted">{storeName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-ink lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          <ul className="flex flex-col gap-0.5">
            {ITEMS.map((item) => {
              const count =
                item.badge === 'credit'
                  ? overdueCount
                  : item.badge === 'lowStock'
                    ? lowCount
                    : item.badge === 'parking'
                      ? parkingBehind
                      : 0
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                        isActive
                          ? 'bg-brand-soft text-brand'
                          : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                      )
                    }
                  >
                    <item.icon size={18} aria-hidden />
                    <span className="flex-1">
                      <span className="block text-[13.5px] leading-tight font-medium">
                        {item.label}
                      </span>
                      <span className="block text-[11px] text-muted">{item.sublabel}</span>
                    </span>
                    {count > 0 ? (
                      <span
                        className="tnum rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background:
                            item.badge === 'credit'
                              ? 'color-mix(in srgb, var(--status-critical) 18%, transparent)'
                              : 'color-mix(in srgb, var(--status-warning) 22%, transparent)',
                          color: 'var(--text-primary)',
                        }}
                        title={
                          item.badge === 'credit'
                            ? `${count} customers owing for over a month`
                            : item.badge === 'parking'
                              ? `${count} parkers behind on their fee`
                              : `${count} products running low`
                        }
                      >
                        {count}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-line px-4 py-3">
          <p className="text-[11px] leading-relaxed text-muted">
            Data is stored in this browser. Export a backup from Settings.
          </p>
        </div>
      </aside>
    </>
  )
}
