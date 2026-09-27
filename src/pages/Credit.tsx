import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Banknote, Download, FileText, NotebookPen, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/SearchInput'
import { Select } from '../components/ui/Field'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'
import { ConfirmDialog } from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'
import { BarList } from '../components/charts/BarList'
import { CustomerFormModal } from '../components/credit/CustomerFormModal'
import { PaymentModal } from '../components/credit/PaymentModal'
import { PaymentReceiptModal } from '../components/credit/PaymentReceiptModal'
import { LedgerModal } from '../components/credit/LedgerModal'
import { RecordSaleModal } from '../components/sales/RecordSaleModal'
import { useStore } from '../store/useStore'
import { useFormat } from '../lib/useFormat'
import {
  AGE_LABELS,
  ageBucket,
  agingBreakdown,
  buildAccounts,
  outstandingCharges,
  paymentsBetween,
  type Account,
} from '../lib/analytics'
import { downloadAllStatementsPdf } from '../lib/pdf'
import { useDocumentMeta } from '../lib/useDocumentMeta'
import { downloadCsv, startOfDay } from '../lib/utils'
import type { Customer, Payment } from '../types'

type Filter = 'owing' | 'all' | 'overdue' | 'settled'
type SortKey = 'balance' | 'name' | 'age'

export function Credit() {
  const fmt = useFormat()
  const [params, setParams] = useSearchParams()
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const deleteCustomer = useStore((s) => s.deleteCustomer)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('owing')
  const [sort, setSort] = useState<SortKey>('balance')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [payingFor, setPayingFor] = useState<Account | null>(null)
  const [receiptFor, setReceiptFor] = useState<Payment | null>(null)
  const [ledgerFor, setLedgerFor] = useState<Customer | null>(null)
  /** A customer preselects the account; 'any' opens the picker unset. */
  const [chargeFor, setChargeFor] = useState<Customer | 'any' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const meta = useDocumentMeta()

  const accounts = useMemo(
    () => buildAccounts(customers, sales, payments),
    [customers, sales, payments],
  )
  const allAccounts = useMemo(() => [...accounts.values()], [accounts])

  useEffect(() => {
    const focus = params.get('customer')
    if (!focus) return
    const match = customers.find((c) => c.id === focus)
    if (match) setLedgerFor(match)
    setParams({}, { replace: true })
  }, [params, customers, setParams])

  const summary = useMemo(() => {
    const owing = allAccounts.filter((a) => a.balance > 0)
    const overdue = owing.filter((a) => ageBucket(a.daysOutstanding) === 'overdue')
    const now = new Date()
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
    return {
      outstanding: owing.reduce((sum, a) => sum + a.balance, 0),
      parkingOwed: owing.reduce((sum, a) => sum + a.parkingOwed, 0),
      owingCount: owing.length,
      overdueAmount: overdue.reduce((sum, a) => sum + a.balance, 0),
      overdueCount: overdue.length,
      collected: paymentsBetween(payments, monthStart, now).reduce((sum, p) => sum + p.amount, 0),
      biggest: [...owing].sort((a, b) => b.balance - a.balance).slice(0, 6),
    }
  }, [allAccounts, payments])

  const aging = useMemo(() => agingBreakdown(allAccounts), [allAccounts])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = customers.filter((c) => {
      const account = accounts.get(c.id)
      if (!account) return false
      if (filter === 'owing' && account.balance <= 0) return false
      if (filter === 'settled' && account.balance > 0) return false
      if (filter === 'overdue') {
        if (account.balance <= 0) return false
        if (ageBucket(account.daysOutstanding) !== 'overdue') return false
      }
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.phone.includes(q)
    })

    return list.sort((a, b) => {
      const accA = accounts.get(a.id)!
      const accB = accounts.get(b.id)!
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'age') return accB.daysOutstanding - accA.daysOutstanding
      return accB.balance - accA.balance
    })
  }, [customers, accounts, query, filter, sort])

  /** One PDF holding a statement for everyone who owes something. */
  async function downloadEveryStatement() {
    const owing = customers
      .map((c) => ({ customer: c, account: accounts.get(c.id)! }))
      .filter(({ account }) => account && account.balance > 0)
      .sort((a, b) => b.account.balance - a.account.balance)

    if (owing.length === 0) {
      toast.info('Nobody owes anything, so there is nothing to send out.')
      return
    }

    setSavingAll(true)
    try {
      await downloadAllStatementsPdf(
        owing.map(({ customer, account }) => ({
          customer,
          account,
          outstanding: outstandingCharges(customer, sales, payments),
          meta,
        })),
      )
      toast.success(`${owing.length} statements downloaded as one PDF.`)
    } catch {
      toast.error('The statements could not be prepared.')
    } finally {
      setSavingAll(false)
    }
  }

  function exportCsv() {
    downloadCsv(
      `mykelhub-credit-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((c) => {
        const a = accounts.get(c.id)!
        return {
          Customer: c.name,
          Mobile: c.phone,
          Balance: Math.round(a.balance * 100) / 100,
          'Goods owed': Math.round(a.goodsOwed * 100) / 100,
          'Parking owed': Math.round(a.parkingOwed * 100) / 100,
          'Total charged': Math.round(a.totalCharged * 100) / 100,
          'Total paid': Math.round(a.totalPaid * 100) / 100,
          'Days outstanding': a.daysOutstanding,
          'Last activity': a.lastActivityAt ? new Date(a.lastActivityAt).toISOString() : '',
        }
      }),
    )
    toast.success(`Exported ${rows.length} accounts.`)
  }

  if (customers.length === 0) {
    return (
      <>
        <PageHeader
          title="Credit"
          subtitle="Who owes you, how much, and for how long."
          actions={
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <UserPlus size={16} aria-hidden />
              Add customer
            </Button>
          }
        />
        <Card>
          <EmptyState
            title="No customers on credit yet"
            message="Add the customers who buy on credit. Cash buyers do not need a record here, only the ones you have to keep track of."
            icon={<NotebookPen size={20} aria-hidden />}
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <UserPlus size={15} aria-hidden />
                Add your first customer
              </Button>
            }
          />
        </Card>
        <CustomerFormModal
          open={formOpen}
          customer={editing}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Credit"
        subtitle="Who owes you, how much, and for how long."
        actions={
          <>
            <Button onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={15} aria-hidden />
              Export
            </Button>
            <Button onClick={downloadEveryStatement} disabled={savingAll}>
              <FileText size={15} aria-hidden />
              {savingAll ? 'Preparing…' : 'All statements'}
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <UserPlus size={15} aria-hidden />
              Add customer
            </Button>
            <Button variant="primary" onClick={() => setChargeFor('any')}>
              <Plus size={16} aria-hidden />
              Add credit sale
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total outstanding"
          value={fmt.money(summary.outstanding)}
          deltaLabel={
            summary.parkingOwed > 0
              ? `${fmt.money(summary.parkingOwed)} of it is parking`
              : `${summary.owingCount} customers owe you`
          }
        />
        <StatTile
          label="Over a month old"
          value={fmt.money(summary.overdueAmount)}
          deltaLabel={
            summary.overdueCount === 0
              ? 'nothing overdue'
              : `${summary.overdueCount} customers, still unpaid`
          }
        />
        <StatTile
          label="Collected this month"
          value={fmt.money(summary.collected)}
          deltaLabel="payments received"
        />
        <StatTile
          label="Customers on file"
          value={fmt.number(customers.length)}
          deltaLabel={`${customers.length - summary.owingCount} fully settled`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="How long it has been owed" subtitle="Balances grouped by age" />
          <CardBody>
            <BarList
              rows={aging
                .filter((a) => a.amount > 0)
                .map((a) => ({
                  id: a.bucket,
                  label: a.label,
                  value: a.amount,
                  meta: `${a.customers} customers`,
                }))}
              formatValue={fmt.money}
              emptyMessage="Nothing owed right now. Everyone is settled."
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Largest balances" subtitle="Who owes the most right now" />
          <CardBody>
            <BarList
              rows={summary.biggest.map((a) => ({
                id: a.customerId,
                label: a.name,
                value: a.balance,
                meta: a.daysOutstanding > 0 ? `${a.daysOutstanding} days` : 'just today',
              }))}
              formatValue={fmt.money}
              onSelect={(id) => {
                const match = customers.find((c) => c.id === id)
                if (match) setLedgerFor(match)
              }}
              emptyMessage="Nobody owes anything right now."
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name or number"
            className="lg:max-w-xs lg:flex-1"
          />
          <SegmentedControl
            ariaLabel="Filter accounts"
            value={filter}
            onChange={setFilter}
            size="sm"
            segments={[
              { value: 'owing', label: 'Owing' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'settled', label: 'Settled' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort by"
            className="w-auto min-w-36"
          >
            <option value="balance">Largest first</option>
            <option value="age">Oldest first</option>
            <option value="name">Name (A&ndash;Z)</option>
          </Select>
          <p className="text-[12.5px] text-muted lg:ml-auto">{rows.length} customers</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No matches"
            message="Try a different filter, or clear the search."
            icon={<NotebookPen size={20} aria-hidden />}
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
            <Table className="min-w-[860px]">
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th align="right">Balance</Th>
                  <Th>Age</Th>
                  <Th align="right">Total charged</Th>
                  <Th align="right">Total paid</Th>
                  <Th>Last activity</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const account = accounts.get(c.id)!
                  const bucket = ageBucket(account.daysOutstanding)
                  return (
                    <Tr key={c.id} onClick={() => setLedgerFor(c)}>
                      <Td>
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-[12px] text-muted">
                          {c.phone || 'No number'}
                        </span>
                      </Td>
                      <Td align="right" numeric>
                        {account.balance > 0 ? (
                          <>
                            <span className="text-[14px] font-semibold">
                              {fmt.money(account.balance)}
                            </span>
                            {account.parkingOwed > 0 && account.goodsOwed > 0 ? (
                              <span className="block text-[11px] text-muted">
                                {fmt.money(account.goodsOwed)} goods +{' '}
                                {fmt.money(account.parkingOwed)} parking
                              </span>
                            ) : account.parkingOwed > 0 ? (
                              <span className="block text-[11px] text-muted">parking</span>
                            ) : null}
                          </>
                        ) : account.credit > 0 ? (
                          <span className="text-ink-2">{fmt.money(account.credit)} in credit</span>
                        ) : (
                          <span className="text-muted">&ndash;</span>
                        )}
                      </Td>
                      <Td>
                        {account.balance <= 0 ? (
                          <Badge tone="good">Settled</Badge>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
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
                          </span>
                        )}
                      </Td>
                      <Td align="right" numeric className="text-ink-2">
                        {fmt.money(account.totalCharged)}
                      </Td>
                      <Td align="right" numeric className="text-ink-2">
                        {fmt.money(account.totalPaid)}
                      </Td>
                      <Td className="text-ink-2">
                        {account.lastActivityAt ? fmt.date(account.lastActivityAt) : 'Never'}
                      </Td>
                      <Td align="right">
                        <span
                          className="flex items-center justify-end gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={account.balance <= 0}
                            onClick={() => setPayingFor(account)}
                          >
                            <Banknote size={14} aria-hidden />
                            Payment
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Add credit sale"
                            aria-label={`Add credit sale for ${c.name}`}
                            onClick={() => setChargeFor(c)}
                          >
                            <Plus size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            aria-label={`Edit ${c.name}`}
                            onClick={() => {
                              setEditing(c)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete"
                            aria-label={`Delete ${c.name}`}
                            onClick={() => setPendingDelete(c)}
                          >
                            <Trash2 size={15} />
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

      <CustomerFormModal
        open={formOpen}
        customer={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
      />

      <PaymentModal
        open={payingFor !== null}
        account={payingFor ? (accounts.get(payingFor.customerId) ?? payingFor) : null}
        onClose={() => setPayingFor(null)}
        onRecorded={setReceiptFor}
      />

      <PaymentReceiptModal
        payment={receiptFor}
        customer={
          receiptFor ? (customers.find((c) => c.id === receiptFor.customerId) ?? null) : null
        }
        onClose={() => setReceiptFor(null)}
      />

      <RecordSaleModal
        open={chargeFor !== null}
        presetSettlement="credit"
        presetCustomerId={chargeFor && chargeFor !== 'any' ? chargeFor.id : null}
        onClose={() => setChargeFor(null)}
      />

      <LedgerModal
        customer={ledgerFor}
        account={ledgerFor ? (accounts.get(ledgerFor.id) ?? null) : null}
        onClose={() => setLedgerFor(null)}
        onAddCharge={(c) => {
          setLedgerFor(null)
          setChargeFor(c)
        }}
        onRecordPayment={(a) => {
          setLedgerFor(null)
          setPayingFor(a)
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteCustomer(pendingDelete.id)
          toast.info(`${pendingDelete.name} removed.`)
        }}
        title="Delete this customer?"
        message={`${pendingDelete?.name ?? ''} will be removed along with their credit history and every payment recorded against it. Settle the balance first if it is still owed.`}
        confirmLabel="Delete customer"
        destructive
      />
    </>
  )
}
