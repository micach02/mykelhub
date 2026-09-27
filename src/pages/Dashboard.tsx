import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CarFront,
  NotebookPen,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { StatTile } from '../components/ui/StatTile'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { StockBadge, Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'
import { TrendChart } from '../components/charts/TrendChart'
import { BarList } from '../components/charts/BarList'
import { RecordSaleModal } from '../components/sales/RecordSaleModal'
import { useStore } from '../store/useStore'
import { useFormat } from '../lib/useFormat'
import {
  ageBucket,
  buildAccounts,
  inventoryValue,
  lowStock,
  parkingSummary,
  paymentsBetween,
  salesBetween,
  seriesByDay,
  stockLevel,
  totals,
  vaultBalance,
} from '../lib/analytics'
import { addDays, lastNDays, pctChange, startOfDay } from '../lib/utils'
import type { Settlement } from '../types'

type RangeKey = '7' | '30' | '60'

export function Dashboard() {
  const navigate = useNavigate()
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const vault = useStore((s) => s.vault)
  const storeName = useStore((s) => s.settings.storeName)
  const loadDemoData = useStore((s) => s.loadDemoData)

  const [range, setRange] = useState<RangeKey>('30')
  const [saleOpen, setSaleOpen] = useState<Settlement | null>(null)
  const days = Number(range)

  const accounts = useMemo(
    () => buildAccounts(customers, sales, payments),
    [customers, sales, payments],
  )

  const view = useMemo(() => {
    const now = new Date()
    const currentFrom = startOfDay(addDays(now, -(days - 1)))
    const previousFrom = startOfDay(addDays(now, -(days * 2 - 1)))
    const previousTo = addDays(currentFrom, -1)
    previousTo.setHours(23, 59, 59, 999)

    const current = salesBetween(sales, currentFrom, now)
    const previous = salesBetween(sales, previousFrom, previousTo)
    const currentPayments = paymentsBetween(payments, currentFrom, now)

    return {
      current: totals(current),
      previous: totals(previous),
      trend: seriesByDay(current, currentPayments, lastNDays(days, now)),
      recent: current.slice(0, 6),
    }
  }, [sales, payments, days])

  const credit = useMemo(() => {
    const owing = [...accounts.values()].filter((a) => a.balance > 0)
    return {
      outstanding: owing.reduce((sum, a) => sum + a.balance, 0),
      owingCount: owing.length,
      overdue: owing.filter((a) => ageBucket(a.daysOutstanding) === 'overdue'),
      biggest: [...owing].sort((a, b) => b.balance - a.balance).slice(0, 5),
    }
  }, [accounts])

  const parking = useMemo(() => {
    const list = [...accounts.values()]
    return {
      summary: parkingSummary(list),
      behind: list.filter((a) => a.parkingActive && a.parkingBehind > 0),
    }
  }, [accounts])

  const stock = useMemo(() => inventoryValue(products), [products])
  const needsRestock = useMemo(() => lowStock(products), [products])
  const { current, previous } = view

  if (products.length === 0 && customers.length === 0) {
    return (
      <>
        <PageHeader
          title={`Welcome to ${storeName}`}
          subtitle="Nothing here yet. Start with what you sell, then add the customers who buy on credit."
        />
        <Card>
          <CardBody className="flex flex-col items-center gap-5 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
              <Boxes size={22} aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-ink">Set up your store</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-2">
                Add the products on your shelves and the customers who buy on credit. This page
                then tracks what you are owed, what is running out, and how the store is doing.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => navigate('/inventory')}>
                <Boxes size={16} aria-hidden />
                Add products
              </Button>
              <Button onClick={() => navigate('/credit')}>
                <NotebookPen size={15} aria-hidden />
                Add customers
              </Button>
              <Button
                onClick={() => {
                  loadDemoData()
                  toast.success('Demo store loaded.')
                }}
              >
                Load demo data
              </Button>
            </div>
            <p className="text-[12px] text-muted">
              Demo data is a sample store you can clear again from Settings.
            </p>
          </CardBody>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={`Good day, ${storeName}`}
        subtitle={`The last ${days} days, compared with the ${days} days before.`}
        actions={
          <>
            <SegmentedControl
              ariaLabel="Period"
              value={range}
              onChange={setRange}
              segments={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '60', label: '60 days' },
              ]}
            />
            <Button onClick={() => setSaleOpen('credit')}>
              <NotebookPen size={15} aria-hidden />
              Credit sale
            </Button>
            <Button variant="primary" onClick={() => setSaleOpen('cash')}>
              <Plus size={16} aria-hidden />
              Record sale
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Owed to you"
          value={fmt.money(credit.outstanding)}
          deltaLabel={`${credit.owingCount} customers on credit`}
          icon={<NotebookPen size={16} aria-hidden />}
        />
        <StatTile
          label="Parking each month"
          value={fmt.money(parking.summary.monthlyExpected)}
          deltaLabel={
            parking.summary.unpaid > 0
              ? `${fmt.money(parking.summary.unpaid)} unpaid, on their credit`
              : `${parking.summary.activeParkers} paying monthly`
          }
          icon={<CarFront size={16} aria-hidden />}
        />
        <StatTile
          label="Sales"
          value={fmt.money(current.revenue)}
          delta={pctChange(current.revenue, previous.revenue)}
          deltaLabel={`vs ${fmt.money(previous.revenue)}`}
          icon={<Banknote size={16} aria-hidden />}
        />
        <StatTile
          label="Profit"
          value={fmt.money(current.profit)}
          delta={pctChange(current.profit, previous.profit)}
          deltaLabel={
            current.revenue > 0
              ? `${((current.profit / current.revenue) * 100).toFixed(1)}% margin`
              : 'no sales yet'
          }
          icon={<TrendingUp size={16} aria-hidden />}
        />
        <StatTile
          label="Stock value"
          value={fmt.money(stock.atCost)}
          deltaLabel={`${fmt.number(stock.units)} items, ${stock.skus} products`}
          icon={<Boxes size={16} aria-hidden />}
        />
        <StatTile
          label="In the vault"
          value={fmt.money(vaultBalance(vault))}
          deltaLabel="cash in the drawer"
          icon={<Wallet size={16} aria-hidden />}
        />
      </div>

      {credit.overdue.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--status-critical) 40%, transparent)',
            background: 'color-mix(in srgb, var(--status-critical) 10%, transparent)',
          }}
        >
          <AlertTriangle size={17} style={{ color: 'var(--status-critical)' }} aria-hidden />
          <p className="flex-1 text-[13px] text-ink">
            <span className="font-semibold">{credit.overdue.length} customers</span> have owed for
            over a month, totalling{' '}
            <span className="font-semibold">
              {fmt.money(credit.overdue.reduce((s, a) => s + a.balance, 0))}
            </span>
            .
          </p>
          <Button size="sm" onClick={() => navigate('/credit')}>
            See who owes
            <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      ) : null}

      {parking.behind.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--status-warning) 45%, transparent)',
            background: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
          }}
        >
          <CarFront size={17} style={{ color: 'var(--status-warning)' }} aria-hidden />
          <p className="flex-1 text-[13px] text-ink">
            <span className="font-semibold">{parking.behind.length} parkers</span> are behind on
            their monthly fee, totalling{' '}
            <span className="font-semibold">
              {fmt.money(parking.behind.reduce((s, a) => s + a.parkingOwed, 0))}
            </span>
            , already counted in what they owe.
          </p>
          <Button size="sm" onClick={() => navigate('/parking')}>
            Collect parking
            <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      ) : null}

      {needsRestock.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--status-warning) 45%, transparent)',
            background: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
          }}
        >
          <AlertTriangle size={17} style={{ color: 'var(--status-warning)' }} aria-hidden />
          <p className="flex-1 text-[13px] text-ink">
            <span className="font-semibold">{needsRestock.length} products</span> are running low
            {needsRestock.filter((p) => p.stock <= 0).length > 0
              ? `, and ${needsRestock.filter((p) => p.stock <= 0).length} are already out.`
              : '.'}
          </p>
          <Button size="sm" onClick={() => navigate('/inventory?filter=low')}>
            See what to buy
            <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Sales and collections"
            subtitle={`Daily totals over the last ${days} days`}
          />
          <CardBody>
            <TrendChart
              data={view.trend}
              locale={fmt.locale}
              series={[
                { key: 'revenue', name: 'Sales', slot: 1 },
                { key: 'collected', name: 'Payments collected', slot: 2 },
              ]}
              formatValue={fmt.money}
              formatTick={(v) => fmt.compactMoney(v)}
              height={300}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Largest balances"
            subtitle="Who owes the most right now"
            action={
              <Link to="/credit" className="text-[12.5px] font-medium text-brand hover:underline">
                Credit
              </Link>
            }
          />
          <CardBody>
            <BarList
              rows={credit.biggest.map((a) => ({
                id: a.customerId,
                label: a.name,
                value: a.balance,
                meta: a.daysOutstanding > 0 ? `${a.daysOutstanding} days` : 'just today',
              }))}
              formatValue={fmt.money}
              onSelect={(id) => navigate(`/credit?customer=${id}`)}
              emptyMessage="Nobody owes anything. Everyone is settled."
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent sales"
            subtitle="The transactions you have recorded"
            action={
              <Link to="/sales" className="text-[12.5px] font-medium text-brand hover:underline">
                All sales
              </Link>
            }
          />
          {view.recent.length === 0 ? (
            <EmptyState
              title="No sales recorded yet"
              message="Recording a sale is optional, but it keeps stock and reports accurate."
              icon={<Banknote size={20} aria-hidden />}
              action={
                <Button variant="primary" size="sm" onClick={() => setSaleOpen('cash')}>
                  Record a sale
                </Button>
              }
            />
          ) : (
            <TableWrap>
              <Table className="min-w-[540px]">
                <thead>
                  <tr>
                    <Th>Ref</Th>
                    <Th>What was taken</Th>
                    <Th>Settled</Th>
                    <Th align="right">Amount</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.recent.map((sale) => {
                    const customer = customers.find((c) => c.id === sale.customerId)
                    return (
                      <Tr key={sale.id} onClick={() => navigate(`/sales?open=${sale.id}`)}>
                        <Td className="font-medium">{sale.reference}</Td>
                        <Td className="text-ink-2">
                          <span className="line-clamp-1 text-[12.5px]">
                            {sale.items.map((i) => `${i.qty} x ${i.name}`).join(', ')}
                          </span>
                        </Td>
                        <Td>
                          {sale.settlement === 'credit' ? (
                            <Badge tone="warning">
                              Credit: {customer?.name ?? 'no customer'}
                            </Badge>
                          ) : (
                            <Badge tone="good">
                              {sale.settlement === 'maya' ? 'Maya' : 'Cash'}
                            </Badge>
                          )}
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          {fmt.money(sale.total)}
                        </Td>
                        <Td className="text-ink-2">{fmt.dateTime(sale.createdAt)}</Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Running low"
            subtitle="What needs restocking"
            action={
              <Link
                to="/inventory?filter=low"
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                Inventory
              </Link>
            }
          />
          {needsRestock.length === 0 ? (
            <EmptyState
              title="Everything is stocked"
              message="No product is at or below its reorder level."
              icon={<Boxes size={20} aria-hidden />}
            />
          ) : (
            <ul className="divide-y divide-line">
              {needsRestock.slice(0, 7).map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => navigate(`/inventory?focus=${p.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">{p.name}</span>
                      <span className="block text-[11.5px] text-muted">
                        Reorder at {p.reorderLevel} {p.unit}
                      </span>
                    </span>
                    <StockBadge level={stockLevel(p)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RecordSaleModal
        open={saleOpen !== null}
        presetSettlement={saleOpen ?? 'cash'}
        onClose={() => setSaleOpen(null)}
      />
    </>
  )
}
