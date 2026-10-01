import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, Select, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/SegmentedControl'
import { toast } from '../ui/Toast'
import { CustomItemForm } from './CustomItemForm'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { buildAccounts, vaultBalance } from '../../lib/analytics'
import { cn } from '../../lib/utils'
import type { ID, SaleItem, Settlement } from '../../types'

export function RecordSaleModal({
  open,
  onClose,
  presetCustomerId,
  presetSettlement = 'cash',
}: {
  open: boolean
  onClose: () => void
  presetCustomerId?: ID | null
  /** `credit` opens the dialog as "put this on an account". */
  presetSettlement?: Settlement
}) {
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const recordSale = useStore((s) => s.recordSale)
  const adjustVault = useStore((s) => s.adjustVault)
  const vault = useStore((s) => s.vault)

  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<SaleItem[]>([])
  const [settlement, setSettlement] = useState<Settlement>(presetSettlement)
  const [customerId, setCustomerId] = useState<string>(presetCustomerId ?? '')
  const [note, setNote] = useState('')
  const [vaultTopUp, setVaultTopUp] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setLines([])
    setNote('')
    setSettlement(presetSettlement)
    setCustomerId(presetCustomerId ?? '')
    setVaultTopUp('')
  }, [open, presetSettlement, presetCustomerId])

  const accounts = useMemo(
    () => buildAccounts(customers, sales, payments),
    [customers, sales, payments],
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const active = products.filter((p) => p.status === 'active')
    const pool = q
      ? active.filter(
          (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
        )
      : active
    return pool.sort((a, b) => a.name.localeCompare(b.name)).slice(0, q ? 30 : 12)
  }, [products, query])

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)

  // Only a cash sale puts notes in the drawer. Maya never reaches it, and a
  // credit sale has not been paid for yet.
  const vaultNow = vaultBalance(vault)
  const extraToVault = Math.max(0, Number(vaultTopUp) || 0)
  const fromThisSale = settlement === 'cash' ? total : 0
  const vaultAfter = vaultNow + fromThisSale + extraToVault

  // Putting cash in without selling anything is a plain vault entry, not a
  // sale of nothing, so the dialog accepts it on its own.
  const hasLines = lines.length > 0
  const vaultOnly = !hasLines && extraToVault > 0
  const canSubmit = hasLines || vaultOnly

  const customer = customers.find((c) => c.id === customerId)
  const account = customer ? accounts.get(customer.id) : undefined
  const projected = (account?.balance ?? 0) + total

  // Goods on credit can go out before the shelf count says they exist. Stock
  // drops below zero and the next restock or count settles it.
  const onCredit = settlement === 'credit'
  const stockOf = (productId: ID) => products.find((p) => p.id === productId)?.stock ?? 0
  // Items typed in by hand are not on the shelf, so no count holds them back.
  const overStock = lines.find((l) => !l.custom && l.qty > stockOf(l.productId))

  function addLine(productId: ID) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    if (!onCredit && product.stock <= 0) {
      toast.error(`${product.name} is out of stock.`)
      return
    }
    setLines((current) => {
      const existing = current.find((l) => l.productId === productId)
      if (existing) {
        if (!onCredit && existing.qty >= product.stock) {
          toast.error(`Only ${product.stock} ${product.unit} of ${product.name} left.`)
          return current
        }
        return current.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          qty: 1,
          unitPrice: product.price,
          unitCost: product.cost,
        },
      ]
    })
  }

  function setQty(productId: ID, qty: number) {
    const unlimited = onCredit || lines.find((l) => l.productId === productId)?.custom
    const capped = unlimited ? Math.max(1, qty) : Math.max(1, Math.min(qty, stockOf(productId)))
    setLines((current) =>
      current.map((l) => (l.productId === productId ? { ...l, qty: capped } : l)),
    )
  }

  function save() {
    if (vaultOnly) {
      adjustVault(extraToVault, note.trim() || 'Cash added to vault')
      toast.success(`${fmt.money(extraToVault)} added to the vault.`)
      onClose()
      return
    }
    if (!hasLines) return
    if (settlement === 'credit' && !customerId) {
      toast.error('Pick which customer this goes to.')
      return
    }
    if (!onCredit && overStock) {
      const left = Math.max(0, stockOf(overStock.productId))
      toast.error(
        left === 0
          ? `${overStock.name} is out of stock. Put it on credit, or take it off.`
          : `Only ${left} of ${overStock.name} left. Put it on credit, or take fewer.`,
      )
      return
    }
    const sale = recordSale({
      items: lines,
      settlement,
      customerId: customerId || null,
      note: note.trim() || undefined,
      vaultTopUp: extraToVault,
    })
    toast.success(
      settlement === 'credit'
        ? `${fmt.money(sale.total)} added to ${customer?.name ?? 'the account'}.`
        : `Sale recorded, ${fmt.money(sale.total)}.`,
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={presetSettlement === 'credit' ? 'Add credit sale' : 'Record a sale'}
      description="Pick what was taken. Stock goes down straight away."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSubmit}>
            {vaultOnly
              ? `Add ${fmt.money(extraToVault)} to vault`
              : `${settlement === 'credit' ? 'Add to account' : 'Record sale'} ${fmt.money(total)}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a product"
              aria-label="Search a product"
              className="h-10 w-full rounded-xl border-0 bg-surface pr-3 pl-9.5 text-sm text-ink shadow-(--shadow-inset-sm) placeholder:text-muted focus:ring-2 focus:ring-brand/45 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
          </div>

          {products.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-6 text-center text-[13px] text-ink-2">
              No products yet. Add them in Inventory, or add an item not in inventory below.
            </p>
          ) : (
            <div className="-mx-1.5 mt-1 flex max-h-48 flex-wrap content-start gap-2 overflow-y-auto p-1.5">
              {matches.map((p) => {
                const taken = lines.find((l) => l.productId === p.id)?.qty ?? 0
                const out = p.stock <= 0
                return (
                  <button
                    key={p.id}
                    onClick={() => addLine(p.id)}
                    disabled={out && !onCredit}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-[color,box-shadow]',
                      taken > 0
                        ? 'text-brand shadow-(--shadow-inset-sm)'
                        : 'text-ink-2 shadow-(--shadow-control) hover:text-ink',
                      out && !onCredit && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="tnum text-muted">{fmt.money(p.price)}</span>
                    {out && onCredit ? (
                      <span className="text-[10.5px] font-medium text-critical">
                        Out
                      </span>
                    ) : null}
                    {taken > 0 ? (
                      <span className="tnum rounded bg-brand px-1 text-[10.5px] font-bold text-white">
                        {taken}
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {matches.length === 0 ? (
                <p className="px-1 py-2 text-[13px] text-ink-2">No product matches that.</p>
              ) : null}
            </div>
          )}

          <div className="mt-2">
            <CustomItemForm onAdd={(item) => setLines((current) => [...current, item])} />
          </div>
        </div>

        {lines.length > 0 ? (
          <ul className="divide-y divide-line rounded-2xl shadow-(--shadow-inset-sm)">
            {lines.map((line) => {
              const stock = stockOf(line.productId)
              const short = !line.custom && line.qty > stock
              return (
                <li key={line.productId} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {line.name}
                    </span>
                    <span
                      className={cn('tnum text-[11.5px]', short ? 'text-critical' : 'text-muted')}
                    >
                      {fmt.money(line.unitPrice)} each,{' '}
                      {line.custom
                        ? 'not in inventory'
                        : stock <= 0
                          ? 'out of stock'
                          : short
                            ? `only ${stock} left`
                            : `${stock} left`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(line.productId, line.qty - 1)}
                      disabled={line.qty <= 1}
                      aria-label={`Less ${line.name}`}
                      className="grid size-6 place-items-center rounded border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="tnum w-7 text-center text-[13px] font-semibold text-ink">
                      {line.qty}
                    </span>
                    <button
                      onClick={() => setQty(line.productId, line.qty + 1)}
                      disabled={!onCredit && !line.custom && line.qty >= stock}
                      aria-label={`More ${line.name}`}
                      className="grid size-6 place-items-center rounded border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                    >
                      <Plus size={12} />
                    </button>
                  </span>
                  <span className="tnum w-20 text-right text-[13px] font-semibold text-ink">
                    {fmt.money(line.qty * line.unitPrice)}
                  </span>
                  <button
                    onClick={() => setLines((c) => c.filter((l) => l.productId !== line.productId))}
                    aria-label={`Remove ${line.name}`}
                    className="text-muted transition-colors hover:text-[var(--status-critical)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Paid now, or on credit?</p>
            <SegmentedControl
              ariaLabel="How the sale was settled"
              value={settlement}
              onChange={setSettlement}
              segments={[
                { value: 'cash', label: 'Cash' },
                { value: 'maya', label: 'Maya' },
                { value: 'credit', label: 'Credit' },
              ]}
            />
          </div>

          {settlement === 'credit' ? (
            <Field label="Which customer?" required>
              {(id) => (
                <Select id={id} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Choose a customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Note">
              {(id) => (
                <TextInput
                  id={id}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                />
              )}
            </Field>
          )}
        </div>

        {settlement === 'credit' && customer ? (
          <div className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-3.5 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-ink">
              {customer.name} currently owes{' '}
              <span className="tnum font-semibold">{fmt.money(account?.balance ?? 0)}</span>. After
              this it becomes <span className="tnum font-semibold">{fmt.money(projected)}</span>.
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] text-ink-2">Money in the vault</p>
              <p className="tnum text-[17px] font-semibold text-ink">{fmt.money(vaultNow)}</p>
            </div>
            <span className="text-muted" aria-hidden>
              &rarr;
            </span>
            <div className="text-right">
              <p className="text-[12px] text-ink-2">After this sale</p>
              <p className="tnum text-[17px] font-semibold text-ink">{fmt.money(vaultAfter)}</p>
            </div>
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            {!hasLines
              ? 'No items picked. Put an amount in below to add cash to the vault on its own.'
              : settlement === 'cash'
                ? `${fmt.money(total)} in cash goes into the vault.`
                : settlement === 'maya'
                  ? 'Maya does not reach the drawer, so the vault is unchanged.'
                  : 'Nothing has been paid yet, so the vault is unchanged.'}
          </p>

          <div className="mt-3 border-t border-line pt-3">
            <Field
              label="Also put money in"
              hint="Any extra cash going into the drawer right now, such as a change fund."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  min={0}
                  step="50"
                  value={vaultTopUp}
                  onChange={(e) => setVaultTopUp(e.target.value)}
                  placeholder="0.00"
                />
              )}
            </Field>
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[14px] font-semibold text-ink">Total</span>
          <span className="tnum text-[22px] font-semibold text-ink">{fmt.money(total)}</span>
        </div>
      </div>
    </Modal>
  )
}
