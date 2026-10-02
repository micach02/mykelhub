import { useMemo, useState } from 'react'
import { Banknote, CarFront, CircleSlash, Download, Pencil, Play, Plus, X } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/SearchInput'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'
import { ConfirmDialog } from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'
import { BarList } from '../components/charts/BarList'
import { ParkingPlanModal } from '../components/parking/ParkingPlanModal'
import { PaymentModal } from '../components/credit/PaymentModal'
import { PaymentReceiptModal } from '../components/credit/PaymentReceiptModal'
import { useStore } from '../store/useStore'
import { useFormat } from '../lib/useFormat'
import { buildAccounts, parkingSummary, paymentsBetween, type Account } from '../lib/analytics'
import { downloadCsv, ordinal, plural, startOfDay } from '../lib/utils'
import { paymentMethodLabel } from '../lib/labels'
import type { Customer, Payment } from '../types'

type Filter = 'all' | 'behind' | 'stopped'

export function Parking() {
  const fmt = useFormat()
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const dueDay = useStore((s) => s.settings.collectionDay)
  const stopParking = useStore((s) => s.stopParking)
  const resumeParking = useStore((s) => s.resumeParking)
  const clearParkingPlan = useStore((s) => s.clearParkingPlan)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [planFor, setPlanFor] = useState<Customer | 'any' | null>(null)
  const [payFor, setPayFor] = useState<Account | null>(null)
  const [receiptFor, setReceiptFor] = useState<Payment | null>(null)
  const [pendingStop, setPendingStop] = useState<Customer | null>(null)
  const [pendingClear, setPendingClear] = useState<Customer | null>(null)

  const accounts = useMemo(
    () => buildAccounts(customers, sales, payments, { dueDay }),
    [customers, sales, payments, dueDay],
  )

  const parkers = useMemo(
    () => customers.filter((c) => accounts.get(c.id)?.parks),
    [customers, accounts],
  )

  const summary = useMemo(
    () => parkingSummary([...accounts.values()]),
    [accounts],
  )

  /** Payments are one stream, so "collected" here is everything taken in. */
  const collectedThisMonth = useMemo(() => {
    const now = new Date()
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
    return paymentsBetween(payments, monthStart, now).reduce((s, p) => s + p.amount, 0)
  }, [payments])

  const behind = useMemo(
    () =>
      [...accounts.values()]
        .filter((a) => a.parks && a.parkingOwed > 0)
        .sort((a, b) => b.parkingOwed - a.parkingOwed)
        .slice(0, 6),
    [accounts],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return parkers
      .filter((c) => {
        const a = accounts.get(c.id)!
        if (filter === 'behind' && a.parkingBehind === 0) return false
        if (filter === 'stopped' && a.parkingActive) return false
        if (!q) return true
        return c.name.toLowerCase().includes(q) || c.phone.includes(q)
      })
      .sort((a, b) => {
        const accA = accounts.get(a.id)!
        const accB = accounts.get(b.id)!
        return accB.parkingOwed - accA.parkingOwed || a.name.localeCompare(b.name)
      })
  }, [parkers, accounts, query, filter])

  /** Recent payments from anyone who parks, newest first. */
  const recentPayments = useMemo(() => {
    const parkerIds = new Set(parkers.map((c) => c.id))
    return payments.filter((p) => parkerIds.has(p.customerId)).slice(0, 12)
  }, [payments, parkers])

  const monthLabel = (d: Date | null) =>
    d ? d.toLocaleDateString(fmt.locale, { month: 'short', year: 'numeric' }) : 'Nothing yet'

  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? 'Unknown'

  function exportCsv() {
    downloadCsv(
      `mykelhub-parking-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((c) => {
        const a = accounts.get(c.id)!
        return {
          Name: c.name,
          'Monthly fee': a.parkingRate,
          'Months billed': a.parkingBilled,
          'Months paid': a.parkingCovered,
          'Months behind': a.parkingBehind,
          'Paid through': a.parkingPaidThrough ? monthLabel(a.parkingPaidThrough) : '',
          'Parking owed': Math.round(a.parkingOwed * 100) / 100,
          'Total owed': Math.round(a.balance * 100) / 100,
          Status: a.parkingActive ? 'active' : 'stopped',
        }
      }),
    )
    toast.success(`Exported ${plural(rows.length, 'parker')}.`)
  }

  if (parkers.length === 0) {
    return (
      <>
        <PageHeader
          title="Parking"
          subtitle={`A monthly fee, due on the ${ordinal(dueDay)} of each month. Unpaid months join what they owe you.`}
          actions={
            <Button variant="primary" onClick={() => setPlanFor('any')}>
              <Plus size={16} aria-hidden />
              Add parking fee
            </Button>
          }
        />
        <Card>
          <EmptyState
            title="Nobody is on a parking fee yet"
            message={
              customers.length === 0
                ? 'Add a customer on the Credit page first, then put them on a monthly parking fee here.'
                : 'Pick a customer and set their monthly fee. It is added to what they owe at the start of every month, and unpaid months show up on their credit balance.'
            }
            icon={<CarFront size={20} aria-hidden />}
            action={
              customers.length > 0 ? (
                <Button variant="primary" size="sm" onClick={() => setPlanFor('any')}>
                  <Plus size={15} aria-hidden />
                  Add parking fee
                </Button>
              ) : undefined
            }
          />
        </Card>
        <ParkingPlanModal open={planFor !== null} onClose={() => setPlanFor(null)} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Parking"
        subtitle={`A monthly fee, due on the ${ordinal(dueDay)} of each month. Unpaid months join what they owe you.`}
        actions={
          <>
            <Button onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={15} aria-hidden />
              Export
            </Button>
            <Button variant="primary" onClick={() => setPlanFor('any')}>
              <Plus size={16} aria-hidden />
              Add parking fee
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Expected each month"
          value={fmt.money(summary.monthlyExpected)}
          deltaLabel={`${summary.activeParkers} paying monthly`}
          icon={<CarFront size={16} aria-hidden />}
        />
        <StatTile
          label="Unpaid parking"
          value={fmt.money(summary.unpaid)}
          deltaLabel={
            summary.behindCount === 0
              ? 'everyone is up to date'
              : `${summary.behindCount} behind, already on their credit`
          }
        />
        <StatTile
          label="Collected this month"
          value={fmt.money(collectedThisMonth)}
          deltaLabel="all payments, parking and goods"
          icon={<Banknote size={16} aria-hidden />}
        />
        <StatTile
          label="On a parking fee"
          value={fmt.number(parkers.length)}
          deltaLabel={`${parkers.length - summary.activeParkers} stopped`}
        />
      </div>

      {behind.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Behind on parking" subtitle="Unpaid months, largest first" />
          <CardBody>
            <BarList
              rows={behind.map((a) => ({
                id: a.customerId,
                label: a.name,
                value: a.parkingOwed,
                meta:
                  a.parkingBehind > 0
                    ? `${a.parkingBehind} month${a.parkingBehind === 1 ? '' : 's'}`
                    : 'part paid',
              }))}
              formatValue={fmt.money}
              onSelect={(id) => {
                const account = accounts.get(id)
                if (account) setPayFor(account)
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a name"
            className="lg:max-w-xs lg:flex-1"
          />
          <SegmentedControl
            ariaLabel="Filter"
            value={filter}
            onChange={setFilter}
            size="sm"
            segments={[
              { value: 'all', label: 'All' },
              { value: 'behind', label: 'Behind' },
              { value: 'stopped', label: 'Stopped' },
            ]}
          />
          <p className="text-[12.5px] text-muted lg:ml-auto">{plural(rows.length, 'parker')}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No matches"
            message="Try a different filter, or clear the search."
            icon={<CarFront size={20} aria-hidden />}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                Show all
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[820px]">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th align="right">Monthly fee</Th>
                  <Th>Paid through</Th>
                  <Th>Standing</Th>
                  <Th align="right">Parking owed</Th>
                  <Th align="right">Total owed</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const a = accounts.get(c.id)!
                  return (
                    <Tr key={c.id}>
                      <Td>
                        <span className="font-medium">{c.name}</span>
                        {c.phone ? (
                          <span className="block text-[12px] text-muted">{c.phone}</span>
                        ) : null}
                      </Td>
                      <Td align="right" numeric>
                        {fmt.money(a.parkingRate)}
                        <span className="block text-[11px] text-muted">per month</span>
                      </Td>
                      <Td className="text-ink-2">
                        <span className="text-[12.5px]">{monthLabel(a.parkingPaidThrough)}</span>
                        <span className="block text-[11.5px] text-muted">
                          {a.parkingCovered} of {plural(a.parkingBilled, 'month')}
                        </span>
                      </Td>
                      <Td>
                        {!a.parkingActive ? (
                          <Badge tone="neutral">Stopped</Badge>
                        ) : a.parkingBehind === 0 ? (
                          <Badge tone="good">Up to date</Badge>
                        ) : (
                          <Badge tone={a.parkingBehind >= 2 ? 'critical' : 'warning'}>
                            {a.parkingBehind} month{a.parkingBehind === 1 ? '' : 's'} behind
                          </Badge>
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {a.parkingOwed > 0 ? (
                          <span className="font-semibold">{fmt.money(a.parkingOwed)}</span>
                        ) : (
                          <span className="text-muted">&ndash;</span>
                        )}
                      </Td>
                      <Td align="right" numeric className="text-ink-2">
                        {fmt.money(a.balance)}
                        {a.goodsOwed > 0 ? (
                          <span className="block text-[11px] text-muted">
                            incl. {fmt.money(a.goodsOwed)} goods
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right">
                        <span className="flex items-center justify-end gap-0.5">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={a.balance <= 0}
                            onClick={() => setPayFor(a)}
                          >
                            <Banknote size={14} aria-hidden />
                            Pay
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit fee"
                            aria-label={`Edit parking fee for ${c.name}`}
                            onClick={() => setPlanFor(c)}
                          >
                            <Pencil size={15} />
                          </Button>
                          {a.parkingActive ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Stop charging"
                              aria-label={`Stop charging ${c.name}`}
                              onClick={() => setPendingStop(c)}
                            >
                              <CircleSlash size={15} />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Resume"
                              aria-label={`Resume ${c.name}`}
                              onClick={() => {
                                resumeParking(c.id)
                                toast.info(`${c.name} is parking again. The fee resumes.`)
                              }}
                            >
                              <Play size={15} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remove parking fee"
                            aria-label={`Remove parking fee for ${c.name}`}
                            onClick={() => setPendingClear(c)}
                          >
                            <X size={15} />
                          </Button>
                        </span>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Recent payments"
          subtitle="From people who park. One payment clears the oldest thing owed, parking or goods."
        />
        {recentPayments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            message="Record a payment when somebody settles up."
            icon={<Banknote size={20} aria-hidden />}
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[520px]">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Date paid</Th>
                  <Th>Note</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <Tr key={payment.id}>
                    <Td className="font-medium">{nameOf(payment.customerId)}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{fmt.date(payment.createdAt)}</Td>
                    <Td className="text-ink-2">
                      <span className="text-[12.5px]">{payment.note ?? '–'}</span>
                      <span className="block text-[11.5px] text-muted">
                        {paymentMethodLabel(payment.method)}
                      </span>
                    </Td>
                    <Td align="right" numeric className="font-semibold">
                      {fmt.money(payment.amount)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <ParkingPlanModal
        open={planFor !== null}
        customer={planFor && planFor !== 'any' ? planFor : null}
        onClose={() => setPlanFor(null)}
      />

      <PaymentModal
        open={payFor !== null}
        account={payFor ? (accounts.get(payFor.customerId) ?? payFor) : null}
        onClose={() => setPayFor(null)}
        onRecorded={setReceiptFor}
      />

      <PaymentReceiptModal
        payment={receiptFor}
        customer={
          receiptFor ? (customers.find((c) => c.id === receiptFor.customerId) ?? null) : null
        }
        onClose={() => setReceiptFor(null)}
      />

      <ConfirmDialog
        open={pendingStop !== null}
        onClose={() => setPendingStop(null)}
        onConfirm={() => {
          if (!pendingStop) return
          stopParking(pendingStop.id)
          toast.info(`${pendingStop.name} stopped parking. No new monthly fee.`)
        }}
        title="Stop charging for parking?"
        message={`${pendingStop?.name ?? ''} keeps whatever parking they still owe, but no new monthly fee will be added from now on. You can resume them later.`}
        confirmLabel="Stop charging"
      />

      <ConfirmDialog
        open={pendingClear !== null}
        onClose={() => setPendingClear(null)}
        onConfirm={() => {
          if (!pendingClear) return
          clearParkingPlan(pendingClear.id)
          toast.info(`Parking fee removed for ${pendingClear.name}.`)
        }}
        title="Remove the parking fee?"
        message={`Every parking month charged to ${pendingClear?.name ?? ''} disappears from their balance, including any still unpaid. If they simply stopped parking, use "Stop charging" instead so what they owe survives.`}
        confirmLabel="Remove parking fee"
        destructive
      />
    </>
  )
}
