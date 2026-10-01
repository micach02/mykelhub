import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { StatTile } from '../components/ui/StatTile'
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { toast } from '../components/ui/Toast'
import { TrendChart } from '../components/charts/TrendChart'
import { ColumnChart } from '../components/charts/ColumnChart'
import { BarList } from '../components/charts/BarList'
import { useStore } from '../store/useStore'
import { useFormat } from '../lib/useFormat'
import {
  AGE_LABELS,
  ageBucket,
  agingBreakdown,
  buildAccounts,
  categoryPerformance,
  inventoryValue,
  isLive,
  lowStock,
  parkingSummary,
  paymentsBetween,
  productPerformance,
  salesBetween,
  seriesByDay,
  totals,
} from '../lib/analytics'
import { addDays, downloadCsv, lastNDays, pctChange, plural, startOfDay } from '../lib/utils'

type RangeKey = '7' | '30' | '60'
type Metric = 'revenue' | 'profit' | 'credit' | 'collected'
type Tab = 'sales' | 'credit' | 'parking' | 'stock'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Reports() {
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)

  const [tab, setTab] = useState<Tab>('sales')
  const [range, setRange] = useState<RangeKey>('30')
  const [metric, setMetric] = useState<Metric>('revenue')
  const days = Number(range)

  const data = useMemo(() => {
    const now = new Date()
    const from = startOfDay(addDays(now, -(days - 1)))
    const previousFrom = startOfDay(addDays(now, -(days * 2 - 1)))
    const previousTo = addDays(from, -1)
    previousTo.setHours(23, 59, 59, 999)

    const current = salesBetween(sales, from, now)
    const previous = salesBetween(sales, previousFrom, previousTo)
    const currentPayments = paymentsBetween(payments, from, now)
    const previousPayments = paymentsBetween(payments, previousFrom, previousTo)

    const byWeekday = WEEKDAYS.map((label) => ({ label, value: 0 }))
    const byHour = Array.from({ length: 15 }, (_, i) => ({ label: `${i + 6}`, value: 0 }))

    for (const sale of current) {
      if (!isLive(sale)) continue
      const when = new Date(sale.createdAt)
      byWeekday[when.getDay()].value += sale.total
      const slot = when.getHours() - 6
      if (slot >= 0 && slot < byHour.length) byHour[slot].value += sale.total
    }

    return {
      current: totals(current),
      previous: totals(previous),
      collected: currentPayments.reduce((s, p) => s + p.amount, 0),
      collectedPrevious: previousPayments.reduce((s, p) => s + p.amount, 0),
      trend: seriesByDay(current, currentPayments, lastNDays(days, now)),
      products: productPerformance(current),
      categories: categoryPerformance(current, products),
      byWeekday,
      byHour,
    }
  }, [sales, payments, products, days])

  const accounts = useMemo(
    () => [...buildAccounts(customers, sales, payments).values()],
    [customers, sales, payments],
  )
  const aging = useMemo(() => agingBreakdown(accounts), [accounts])
  const owing = useMemo(
    () => accounts.filter((a) => a.balance > 0).sort((a, b) => b.balance - a.balance),
    [accounts],
  )
  const stock = useMemo(() => inventoryValue(products), [products])
  const restockList = useMemo(() => lowStock(products), [products])

  const parking = useMemo(() => {
    const parkers = accounts.filter((a) => a.parks)
    const now = new Date()

    // What the spaces should have billed each of the last six months.
    const byMonth: Array<{ label: string; value: number }> = []
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const index = month.getFullYear() * 12 + month.getMonth()
      const value = customers.reduce((sum, c) => {
        if (!c.parkingRate || !c.parkingSince) return sum
        const start = new Date(c.parkingSince)
        const startIndex = start.getFullYear() * 12 + start.getMonth()
        const stop = c.parkingUntil ? new Date(c.parkingUntil) : null
        const stopIndex = stop ? stop.getFullYear() * 12 + stop.getMonth() : Infinity
        return index >= startIndex && index <= stopIndex ? sum + c.parkingRate : sum
      }, 0)
      byMonth.push({ label: month.toLocaleDateString(fmt.locale, { month: 'short' }), value })
    }

    return {
      parkers,
      summary: parkingSummary(accounts),
      byMonth,
    }
  }, [accounts, customers, fmt.locale])

  const { current, previous } = data

  const METRICS: Record<Metric, { name: string; slot: 1 | 2 | 3 }> = {
    revenue: { name: 'Sales', slot: 1 },
    profit: { name: 'Profit', slot: 1 },
    credit: { name: 'Went on credit', slot: 2 },
    collected: { name: 'Payments collected', slot: 3 },
  }

  function exportCurrent() {
    if (tab === 'credit') {
      downloadCsv(
        `mykelhub-credit-report-${new Date().toISOString().slice(0, 10)}.csv`,
        owing.map((a) => ({
          Customer: a.name,
          Balance: Math.round(a.balance * 100) / 100,
          'Total charged': Math.round(a.totalCharged * 100) / 100,
          'Total paid': Math.round(a.totalPaid * 100) / 100,
          'Days outstanding': a.daysOutstanding,
          Age: AGE_LABELS[ageBucket(a.daysOutstanding)],
        })),
      )
    } else if (tab === 'parking') {
      downloadCsv(
        `mykelhub-parking-report-${new Date().toISOString().slice(0, 10)}.csv`,
        parking.parkers.map((a) => ({
          Name: a.name,
          'Monthly fee': a.parkingRate,
          'Months billed': a.parkingBilled,
          'Months paid': a.parkingCovered,
          'Months behind': a.parkingBehind,
          'Parking owed': Math.round(a.parkingOwed * 100) / 100,
          'Total owed': Math.round(a.balance * 100) / 100,
          Status: a.parkingActive ? 'active' : 'stopped',
        })),
      )
    } else if (tab === 'stock') {
      downloadCsv(
        `mykelhub-stock-report-${new Date().toISOString().slice(0, 10)}.csv`,
        products.map((p) => ({
          Product: p.name,
          Category: p.category,
          Stock: p.stock,
          Unit: p.unit,
          'Reorder level': p.reorderLevel,
          Cost: p.cost,
          'Selling price': p.price,
          'Stock value': Math.round(p.stock * p.cost * 100) / 100,
        })),
      )
    } else {
      downloadCsv(
        `mykelhub-sales-report-${new Date().toISOString().slice(0, 10)}.csv`,
        data.products.map((p) => ({
          Product: p.name,
          'Units sold': p.units,
          Sales: Math.round(p.revenue * 100) / 100,
          Profit: Math.round(p.profit * 100) / 100,
          'Margin %': p.revenue === 0 ? 0 : Math.round((p.profit / p.revenue) * 1000) / 10,
        })),
      )
    }
    toast.success('Report exported.')
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="How the store is doing: sales, credit, and stock."
        actions={
          <>
            {tab === 'sales' ? (
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
            ) : null}
            <Button onClick={exportCurrent}>
              <Download size={15} aria-hidden />
              Export
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <SegmentedControl
          ariaLabel="Report"
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'sales', label: 'Sales and profit' },
            { value: 'credit', label: 'Credit' },
            { value: 'parking', label: 'Parking' },
            { value: 'stock', label: 'Stock' },
          ]}
        />
      </div>

      {tab === 'sales' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile
              label="Total sales"
              value={fmt.money(current.revenue)}
              delta={pctChange(current.revenue, previous.revenue)}
              deltaLabel={`vs ${fmt.money(previous.revenue)}`}
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
            />
            <StatTile
              label="Went on credit"
              value={fmt.money(current.creditRevenue)}
              deltaLabel={
                current.revenue > 0
                  ? `${((current.creditRevenue / current.revenue) * 100).toFixed(0)}% of sales`
                  : 'no sales yet'
              }
            />
            <StatTile
              label="Payments collected"
              value={fmt.money(data.collected)}
              delta={pctChange(data.collected, data.collectedPrevious)}
              deltaLabel={`vs ${fmt.money(data.collectedPrevious)}`}
            />
          </div>

          <Card className="mt-4">
            <CardHeader
              title={`${METRICS[metric].name} by day`}
              subtitle={`The last ${days} days`}
              action={
                <SegmentedControl
                  ariaLabel="Metric"
                  size="sm"
                  value={metric}
                  onChange={setMetric}
                  segments={[
                    { value: 'revenue', label: 'Sales' },
                    { value: 'profit', label: 'Profit' },
                    { value: 'credit', label: 'Credit' },
                    { value: 'collected', label: 'Collected' },
                  ]}
                />
              }
            />
            <CardBody>
              <TrendChart
                data={data.trend}
                locale={fmt.locale}
                series={[{ key: metric, name: METRICS[metric].name, slot: METRICS[metric].slot }]}
                formatValue={fmt.money}
                formatTick={(v) => fmt.compactMoney(v)}
                height={300}
              />
            </CardBody>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Sales by day of week" subtitle="Which days carry the week" />
              <CardBody>
                <ColumnChart
                  rows={data.byWeekday}
                  valueName="Sales"
                  formatValue={fmt.money}
                  formatTick={(v) => fmt.compactMoney(v)}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Sales by hour" subtitle="From 6am to 8pm" />
              <CardBody>
                <ColumnChart
                  rows={data.byHour}
                  valueName="Sales"
                  formatValue={fmt.money}
                  formatTick={(v) => fmt.compactMoney(v)}
                />
              </CardBody>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Sales by category" subtitle="Where the money comes from" />
              <CardBody>
                <BarList
                  rows={data.categories.map((c) => ({
                    id: c.category,
                    label: c.category,
                    value: c.revenue,
                    meta: plural(c.units, 'item'),
                  }))}
                  formatValue={fmt.money}
                  emptyMessage="No sales in this period."
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Best sellers" subtitle="Ranked by sales" />
              <CardBody>
                <BarList
                  rows={data.products.slice(0, 8).map((p) => ({
                    id: p.productId,
                    label: p.name,
                    value: p.revenue,
                    meta: `${p.units} sold`,
                  }))}
                  formatValue={fmt.money}
                  emptyMessage="No sales in this period."
                />
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Every product" subtitle={`The last ${days} days`} />
            {data.products.length === 0 ? (
              <EmptyState
                title="No sales yet"
                message="Pick a longer period, or record a sale."
              />
            ) : (
              <TableWrap>
                <Table className="min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Units</Th>
                      <Th align="right">Sales</Th>
                      <Th align="right">Profit</Th>
                      <Th align="right">Margin</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.slice(0, 30).map((p) => (
                      <Tr key={p.productId}>
                        <Td className="font-medium">{p.name}</Td>
                        <Td align="right" numeric>
                          {fmt.number(p.units)}
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          {fmt.money(p.revenue)}
                        </Td>
                        <Td align="right" numeric>
                          {fmt.money(p.profit)}
                        </Td>
                        <Td align="right" numeric className="text-ink-2">
                          {p.revenue === 0
                            ? '–'
                            : `${((p.profit / p.revenue) * 100).toFixed(1)}%`}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'credit' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile
              label="Total owed to you"
              value={fmt.money(accounts.reduce((s, a) => s + a.balance, 0))}
              deltaLabel={`${plural(owing.length, 'customer')} ${owing.length === 1 ? 'owes' : 'owe'} you`}
            />
            <StatTile
              label="Over a month old"
              value={fmt.money(
                owing
                  .filter((a) => ageBucket(a.daysOutstanding) === 'overdue')
                  .reduce((s, a) => s + a.balance, 0),
              )}
              deltaLabel={plural(owing.filter((a) => ageBucket(a.daysOutstanding) === 'overdue').length, 'customer')}
            />
            <StatTile
              label="Largest balance"
              value={fmt.money(owing[0]?.balance ?? 0)}
              deltaLabel={owing[0]?.name ?? 'nobody owes anything'}
            />
            <StatTile
              label="Average balance"
              value={fmt.money(
                owing.length === 0 ? 0 : owing.reduce((s, a) => s + a.balance, 0) / owing.length,
              )}
              deltaLabel="per customer owing"
            />
          </div>

          <Card className="mt-4">
            <CardHeader title="How long it has been owed" subtitle="Balances grouped by age" />
            <CardBody>
              <BarList
                rows={aging
                  .filter((a) => a.amount > 0)
                  .map((a) => ({
                    id: a.bucket,
                    label: a.label,
                    value: a.amount,
                    meta: plural(a.customers, 'customer'),
                  }))}
                formatValue={fmt.money}
                emptyMessage="Nothing owed. Everyone is settled."
              />
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardHeader title="Every customer" subtitle="Who owes, and for how long" />
            {owing.length === 0 ? (
              <EmptyState
                title="Nobody owes anything"
                message="Every account is settled."
              />
            ) : (
              <TableWrap>
                <Table className="min-w-[700px]">
                  <thead>
                    <tr>
                      <Th>Customer</Th>
                      <Th align="right">Balance</Th>
                      <Th>Age</Th>
                      <Th align="right">Total charged</Th>
                      <Th align="right">Total paid</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {owing.map((a) => {
                      const bucket = ageBucket(a.daysOutstanding)
                      return (
                        <Tr key={a.customerId}>
                          <Td className="font-medium">{a.name}</Td>
                          <Td align="right" numeric className="font-semibold">
                            {fmt.money(a.balance)}
                          </Td>
                          <Td>
                            <Badge
                              tone={
                                bucket === 'overdue'
                                  ? 'critical'
                                  : bucket === 'fortnight'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {AGE_LABELS[bucket]}
                            </Badge>
                          </Td>
                          <Td align="right" numeric className="text-ink-2">
                            {fmt.money(a.totalCharged)}
                          </Td>
                          <Td align="right" numeric className="text-ink-2">
                            {fmt.money(a.totalPaid)}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'parking' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile
              label="Expected each month"
              value={fmt.money(parking.summary.monthlyExpected)}
              deltaLabel={`${parking.summary.activeParkers} spaces let`}
            />
            <StatTile
              label="Unpaid parking"
              value={fmt.money(parking.summary.unpaid)}
              deltaLabel={
                parking.summary.behindCount === 0
                  ? 'everyone is up to date'
                  : `${parking.summary.behindCount} behind`
              }
            />
            <StatTile
              label="On a parking fee"
              value={fmt.number(parking.parkers.length)}
              deltaLabel={`${parking.parkers.length - parking.summary.activeParkers} stopped`}
            />
            <StatTile
              label="Billed over 6 months"
              value={fmt.money(parking.byMonth.reduce((s, m) => s + m.value, 0))}
              deltaLabel="what the spaces should have brought in"
            />
          </div>

          <Card className="mt-4">
            <CardHeader
              title="Parking billed by month"
              subtitle="What the spaces should bring in, over the last six months"
            />
            <CardBody>
              <ColumnChart
                rows={parking.byMonth}
                valueName="Billed"
                formatValue={fmt.money}
                formatTick={(v) => fmt.compactMoney(v)}
              />
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardHeader
              title="Everyone on a parking fee"
              subtitle="Unpaid months count toward what they owe"
            />
            {parking.parkers.length === 0 ? (
              <EmptyState
                title="Nobody is on a parking fee"
                message="Set a monthly fee for a customer on the Parking page to see this."
              />
            ) : (
              <TableWrap>
                <Table className="min-w-[760px]">
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th align="right">Monthly fee</Th>
                      <Th align="right">Months billed</Th>
                      <Th align="right">Months paid</Th>
                      <Th align="right">Parking owed</Th>
                      <Th align="right">Total owed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {parking.parkers.map((a) => (
                      <Tr key={a.customerId}>
                        <Td className="font-medium">
                          {a.name}
                          {!a.parkingActive ? (
                            <Badge tone="neutral" className="ml-2">
                              Stopped
                            </Badge>
                          ) : null}
                        </Td>
                        <Td align="right" numeric>
                          {fmt.money(a.parkingRate)}
                        </Td>
                        <Td align="right" numeric className="text-ink-2">
                          {a.parkingBilled}
                        </Td>
                        <Td align="right" numeric className="text-ink-2">
                          {a.parkingCovered}
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          {a.parkingOwed > 0 ? fmt.money(a.parkingOwed) : '–'}
                        </Td>
                        <Td align="right" numeric className="text-ink-2">
                          {fmt.money(a.balance)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'stock' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile
              label="Tied up in stock"
              value={fmt.money(stock.atCost)}
              deltaLabel={plural(stock.skus, 'product')}
            />
            <StatTile
              label="Worth if all sold"
              value={fmt.money(stock.atRetail)}
              deltaLabel={`${fmt.money(stock.atRetail - stock.atCost)} profit`}
            />
            <StatTile
              label="Items on the shelf"
              value={fmt.number(stock.units)}
              deltaLabel="across all products"
            />
            <StatTile
              label="Needs restocking"
              value={fmt.number(restockList.length)}
              deltaLabel={restockList.length === 0 ? 'everything is stocked' : 'running low or out'}
            />
          </div>

          <Card className="mt-4">
            <CardHeader title="Stock value by category" subtitle="Where your money is sitting" />
            <CardBody>
              <BarList
                rows={Object.entries(
                  products.reduce<Record<string, number>>((acc, p) => {
                    if (p.status !== 'active') return acc
                    acc[p.category] = (acc[p.category] ?? 0) + p.stock * p.cost
                    return acc
                  }, {}),
                )
                  .map(([category, value]) => ({ id: category, label: category, value }))
                  .sort((a, b) => b.value - a.value)}
                formatValue={fmt.money}
                emptyMessage="No products yet."
              />
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardHeader title="What to buy" subtitle="At or below the reorder level" />
            {restockList.length === 0 ? (
              <EmptyState title="Everything is stocked" message="No product is running low." />
            ) : (
              <TableWrap>
                <Table className="min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th>Category</Th>
                      <Th align="right">Left</Th>
                      <Th align="right">Reorder at</Th>
                      <Th align="right">Cost to refill</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {restockList.map((p) => {
                      const suggested = Math.max(p.reorderLevel * 2 - p.stock, 0)
                      return (
                        <Tr key={p.id}>
                          <Td className="font-medium">{p.name}</Td>
                          <Td className="text-ink-2">{p.category}</Td>
                          <Td align="right" numeric>
                            {p.stock} {p.unit}
                          </Td>
                          <Td align="right" numeric className="text-ink-2">
                            {p.reorderLevel}
                          </Td>
                          <Td align="right" numeric className="font-semibold">
                            {fmt.money(suggested * p.cost)}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      ) : null}
    </>
  )
}
