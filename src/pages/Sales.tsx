import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Banknote, Download, Plus, Trash2, Wallet } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/SearchInput'
import { Select } from '../components/ui/Field'
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { StatTile } from '../components/ui/StatTile'
import { ConfirmDialog } from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'
import { RecordSaleModal } from '../components/sales/RecordSaleModal'
import { VaultAdjustModal } from '../components/vault/VaultAdjustModal'
import { useStore } from '../store/useStore'
import { useFormat } from '../lib/useFormat'
import { totals, vaultBalance, vaultFlow } from '../lib/analytics'
import { addDays, downloadCsv, startOfDay } from '../lib/utils'
import type { Sale, Settlement } from '../types'

type RangeKey = 'today' | '7' | '30' | '60' | 'all'

const RANGE_DAYS: Record<RangeKey, number | null> = {
  today: 1,
  '7': 7,
  '30': 30,
  '60': 60,
  all: null,
}

const SETTLEMENT_LABEL: Record<Settlement, string> = {
  cash: 'Cash',
  maya: 'Maya',
  credit: 'Credit',
}

export function Sales() {
  const fmt = useFormat()
  const [params, setParams] = useSearchParams()
  const sales = useStore((s) => s.sales)
  const customers = useStore((s) => s.customers)
  const voidSale = useStore((s) => s.voidSale)
  const vault = useStore((s) => s.vault)
  const deleteVaultEntry = useStore((s) => s.deleteVaultEntry)

  const [query, setQuery] = useState('')
  const [range, setRange] = useState<RangeKey>('30')
  const [settlement, setSettlement] = useState<'all' | Settlement>('all')
  const [recordOpen, setRecordOpen] = useState(false)
  const [pendingVoid, setPendingVoid] = useState<Sale | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [pendingVaultDelete, setPendingVaultDelete] = useState<string | null>(null)

  useEffect(() => {
    const id = params.get('open')
    if (!id) return
    // Deep links from the dashboard land on the row; highlight by searching it.
    const match = sales.find((s) => s.id === id)
    if (match) setQuery(match.reference)
    setParams({}, { replace: true })
  }, [params, sales, setParams])

  const rows = useMemo(() => {
    const days = RANGE_DAYS[range]
    const from = days === null ? null : startOfDay(addDays(new Date(), -(days - 1)))
    const q = query.trim().toLowerCase()
    const nameById = new Map(customers.map((c) => [c.id, c.name.toLowerCase()]))

    return sales.filter((sale) => {
      if (from && new Date(sale.createdAt) < from) return false
      if (settlement !== 'all' && sale.settlement !== settlement) return false
      if (!q) return true
      return (
        sale.reference.toLowerCase().includes(q) ||
        (sale.customerId ? (nameById.get(sale.customerId) ?? '').includes(q) : false) ||
        sale.items.some((i) => i.name.toLowerCase().includes(q))
      )
    })
  }, [sales, customers, query, range, settlement])

  const summary = useMemo(() => totals(rows), [rows])

  const cash = useMemo(() => {
    const now = new Date()
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
    return {
      balance: vaultBalance(vault),
      month: vaultFlow(vault, monthStart, now),
      recent: vault.slice(0, 8),
    }
  }, [vault])

  function exportCsv() {
    downloadCsv(
      `mykelhub-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((s) => ({
        Ref: s.reference,
        Date: new Date(s.createdAt).toISOString(),
        Items: s.items.map((i) => `${i.qty} x ${i.name}`).join('; '),
        Settled: SETTLEMENT_LABEL[s.settlement],
        Customer: customers.find((c) => c.id === s.customerId)?.name ?? '',
        Amount: s.total,
        Voided: s.voided ? 'yes' : 'no',
      })),
    )
    toast.success(`Exported ${rows.length} sales.`)
  }

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="The record of what you sold. Logging cash sales is optional, but it keeps stock and reports accurate."
        actions={
          <>
            <Button onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={15} aria-hidden />
              Export
            </Button>
            <Button onClick={() => setVaultOpen(true)}>
              <Wallet size={15} aria-hidden />
              Adjust vault
            </Button>
            <Button variant="primary" onClick={() => setRecordOpen(true)}>
              <Plus size={16} aria-hidden />
              Record sale
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total sales"
          value={fmt.money(summary.revenue)}
          deltaLabel={`${summary.sales} transactions`}
        />
        <StatTile
          label="Profit"
          value={fmt.money(summary.profit)}
          deltaLabel={`${summary.units} items sold`}
        />
        <StatTile
          label="In the vault"
          value={fmt.money(cash.balance)}
          deltaLabel={`${fmt.money(cash.month.inflow)} in, ${fmt.money(cash.month.outflow)} out this month`}
        />
        <StatTile
          label="Went on credit"
          value={fmt.money(summary.creditRevenue)}
          deltaLabel="added to accounts"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search ref, customer, or product"
            className="lg:max-w-xs lg:flex-1"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              aria-label="Period"
              className="w-auto min-w-32"
            >
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
              <option value="all">All time</option>
            </Select>
            <Select
              value={settlement}
              onChange={(e) => setSettlement(e.target.value as 'all' | Settlement)}
              aria-label="Settlement"
              className="w-auto min-w-32"
            >
              <option value="all">Any settlement</option>
              <option value="cash">Cash</option>
              <option value="maya">Maya</option>
              <option value="credit">Credit</option>
            </Select>
          </div>
          <p className="text-[12.5px] text-muted lg:ml-auto">{rows.length} transactions</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No sales recorded"
            message="Record a sale to keep stock accurate, or widen the filters if you expected to see something here."
            icon={<Banknote size={20} aria-hidden />}
            action={
              <Button variant="primary" size="sm" onClick={() => setRecordOpen(true)}>
                Record a sale
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[820px]">
              <thead>
                <tr>
                  <Th>Ref</Th>
                  <Th>When</Th>
                  <Th>What was taken</Th>
                  <Th>Settled</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((sale) => {
                  const customer = customers.find((c) => c.id === sale.customerId)
                  return (
                    <Tr key={sale.id} className={sale.voided ? 'opacity-55' : undefined}>
                      <Td>
                        <span className="font-medium">{sale.reference}</span>
                        {sale.voided ? (
                          <Badge tone="critical" className="ml-2">
                            Voided
                          </Badge>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-2">
                        {fmt.dateTime(sale.createdAt)}
                      </Td>
                      <Td className="text-ink-2">
                        <span className="line-clamp-2 max-w-xs text-[12.5px]">
                          {sale.items.map((i) => `${i.qty} x ${i.name}`).join(', ')}
                        </span>
                        {sale.note ? (
                          <span className="block text-[11.5px] text-muted">{sale.note}</span>
                        ) : null}
                      </Td>
                      <Td>
                        {sale.settlement === 'credit' ? (
                          <Badge tone="warning">Credit: {customer?.name ?? 'no customer'}</Badge>
                        ) : (
                          <Badge tone="good">{SETTLEMENT_LABEL[sale.settlement]}</Badge>
                        )}
                      </Td>
                      <Td align="right" numeric className="font-semibold">
                        {fmt.money(sale.total)}
                      </Td>
                      <Td align="right">
                        {sale.voided ? (
                          <span className="text-[12px] text-muted">Returned</span>
                        ) : (
                          <Button size="sm" onClick={() => setPendingVoid(sale)}>
                            Void
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        {rows.length > 200 ? (
          <p className="border-t border-line px-4 py-3 text-center text-[12.5px] text-muted">
            Showing the 200 most recent of {rows.length}. Narrow the period, or export to CSV.
          </p>
        ) : null}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Vault"
          subtitle="Cash in the drawer. Cash sales and cash payments go in on their own."
          action={
            <Button size="sm" onClick={() => setVaultOpen(true)}>
              <Wallet size={14} aria-hidden />
              Adjust
            </Button>
          }
        />
        <CardBody className="border-b border-line">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
              <p className="text-[12px] text-ink-2">In the drawer now</p>
              <p className="tnum mt-0.5 text-[20px] font-semibold text-ink">
                {fmt.money(cash.balance)}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
              <p className="text-[12px] text-ink-2">Money in this month</p>
              <p className="tnum mt-0.5 text-[20px] font-semibold" style={{ color: 'var(--delta-up)' }}>
                {fmt.money(cash.month.inflow)}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
              <p className="text-[12px] text-ink-2">Money out this month</p>
              <p
                className="tnum mt-0.5 text-[20px] font-semibold"
                style={{ color: 'var(--status-critical)' }}
              >
                {fmt.money(cash.month.outflow)}
              </p>
            </div>
          </div>
        </CardBody>

        {cash.recent.length === 0 ? (
          <EmptyState
            title="Nothing in the vault yet"
            message="Record a cash sale, or put money in by hand to set your opening float."
            icon={<Wallet size={20} aria-hidden />}
            action={
              <Button variant="primary" size="sm" onClick={() => setVaultOpen(true)}>
                Put money in
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[520px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Reason</Th>
                  <Th>Reference</Th>
                  <Th align="right">Change</Th>
                  <Th align="right" className="w-10" />
                </tr>
              </thead>
              <tbody>
                {cash.recent.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap text-ink-2">
                      {fmt.dateTime(entry.createdAt)}
                    </Td>
                    <Td>{entry.reason}</Td>
                    <Td className="text-ink-2">{entry.reference ?? '–'}</Td>
                    <Td align="right" numeric>
                      <span
                        className="font-semibold"
                        style={{
                          color: entry.amount >= 0 ? 'var(--delta-up)' : 'var(--status-critical)',
                        }}
                      >
                        {entry.amount >= 0 ? '+' : '−'}
                        {fmt.money(Math.abs(entry.amount))}
                      </span>
                    </Td>
                    <Td align="right">
                      <button
                        onClick={() => setPendingVaultDelete(entry.id)}
                        aria-label="Delete this vault entry"
                        title="Delete this vault entry"
                        className="text-muted transition-colors hover:text-critical"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <VaultAdjustModal open={vaultOpen} onClose={() => setVaultOpen(false)} />

      <ConfirmDialog
        open={pendingVaultDelete !== null}
        onClose={() => setPendingVaultDelete(null)}
        onConfirm={() => {
          if (!pendingVaultDelete) return
          deleteVaultEntry(pendingVaultDelete)
          toast.info('Vault entry deleted.')
        }}
        title="Delete this vault entry?"
        message="Use this only if it was recorded by mistake. The vault balance changes by that amount."
        confirmLabel="Delete entry"
        destructive
      />

      <RecordSaleModal open={recordOpen} onClose={() => setRecordOpen(false)} />

      <ConfirmDialog
        open={pendingVoid !== null}
        onClose={() => setPendingVoid(null)}
        onConfirm={() => {
          if (!pendingVoid) return
          voidSale(pendingVoid.id)
          toast.info(`${pendingVoid.reference} voided. Stock returned.`)
        }}
        title="Void this sale?"
        message={
          pendingVoid?.settlement === 'credit'
            ? `${pendingVoid.reference} will be cancelled, the items put back on the shelf, and the amount taken off the customer's balance.`
            : `${pendingVoid?.reference ?? ''} will be cancelled and the items put back on the shelf.`
        }
        confirmLabel="Void sale"
        destructive
      />
    </>
  )
}
