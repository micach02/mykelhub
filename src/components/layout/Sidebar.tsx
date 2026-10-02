import { Link, NavLink } from 'react-router-dom'
import {
  BarChart3,
  Banknote,
  Boxes,
  CarFront,
  HardDrive,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { cn, plural } from '../../lib/utils'
import { useStore } from '../../store/useStore'
import { ageBucket, buildAccounts, lowStock } from '../../lib/analytics'
import { useCloudSync, type CloudState } from '../../lib/cloudSync'
import { toast } from '../ui/Toast'
import { BrandMark } from './BrandMark'

interface NavItem {
  to: string
  label: string
  sublabel: string
  icon: typeof Boxes
  badge?: 'credit' | 'lowStock' | 'parking'
}

/** How the account's sync reads at a glance, and the colour of its dot. */
const SYNC_STATUS: Partial<Record<CloudState, [string, string]>> = {
  ready: ['In sync', 'var(--status-good)'],
  syncing: ['Syncing…', 'var(--brand)'],
  offline: ['Offline, saved here', 'var(--status-warning)'],
  conflict: ['Needs a decision in Settings', 'var(--status-warning)'],
  error: ['Sync problem, see Settings', 'var(--status-critical)'],
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
  const dueDay = useStore((s) => s.settings.collectionDay)
  const storeName = useStore((s) => s.settings.storeName)
  const email = useCloudSync((s) => s.email)
  const cloudState = useCloudSync((s) => s.state)
  const signOut = useCloudSync((s) => s.signOut)
  const [syncLabel, syncColor] = SYNC_STATUS[cloudState] ?? ['Signed in', 'var(--text-muted)']

  const accounts = [...buildAccounts(customers, sales, payments, { dueDay }).values()]
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
          'no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-(--edge) bg-surface shadow-[8px_0_24px_-12px_var(--neu-dark)] backdrop-blur-xl transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark />
            <div className="min-w-0">
              <p className="truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">
                MykelHub
              </p>
              <p className="truncate text-[11.5px] text-muted">{storeName}</p>
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

        <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Main">
          <p className="px-3 pt-2 pb-2 text-[11px] font-medium tracking-wider text-muted uppercase">
            Menu
          </p>
          <ul className="flex flex-col gap-1.5">
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
                    title={item.sublabel}
                    className={({ isActive }) =>
                      cn(
                        'flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[13.5px] font-medium transition-[color,box-shadow] duration-200',
                        isActive
                          ? 'text-brand shadow-(--shadow-inset-sm)'
                          : 'text-ink-2 hover:text-ink hover:shadow-(--shadow-control)',
                      )
                    }
                  >
                    <item.icon size={18} strokeWidth={1.9} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 ? (
                      <span
                        className="tnum grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold"
                        style={{
                          background:
                            item.badge === 'credit'
                              ? 'color-mix(in srgb, var(--status-critical) 16%, transparent)'
                              : 'color-mix(in srgb, var(--status-warning) 24%, transparent)',
                          color:
                            item.badge === 'credit'
                              ? 'var(--status-critical)'
                              : 'var(--text-primary)',
                        }}
                        title={
                          item.badge === 'credit'
                            ? `${plural(count, 'customer')} owing for over a month`
                            : item.badge === 'parking'
                              ? `${plural(count, 'parker')} behind on the fee`
                              : `${plural(count, 'product')} running low`
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

        <div className="p-3">
          {email ? (
            // Who is signed in and whether the store is in step with the cloud.
            <div className="flex items-center gap-2.5 rounded-2xl p-3 shadow-(--shadow-inset-sm)">
              <span
                className="font-display grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand uppercase"
                aria-hidden
              >
                {email.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-ink" title={email}>
                  {email}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: syncColor }} />
                  {syncLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut()
                  toast.info('Signed out. The data stays on this device.')
                }}
                aria-label="Sign out"
                title="Sign out"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-[color,box-shadow] hover:text-ink hover:shadow-(--shadow-control)"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-2xl p-3.5 shadow-(--shadow-inset-sm)">
              <HardDrive size={15} className="mt-px shrink-0 text-muted" aria-hidden />
              <p className="text-[11.5px] leading-relaxed text-ink-2">
                Data is stored in this browser.{' '}
                <Link to="/login" onClick={onClose} className="font-medium text-brand hover:underline">
                  Sign in to sync it across devices.
                </Link>
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
