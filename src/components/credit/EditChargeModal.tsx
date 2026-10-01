import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Select, TextInput } from '../ui/Field'
import { toast } from '../ui/Toast'
import { CustomItemForm } from '../sales/CustomItemForm'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { cn, dayKey } from '../../lib/utils'
import type { ID, Sale, SaleItem } from '../../types'

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Correcting a credit sale after it was rung up. Changing the lines moves
 * stock by the difference, so the shelf stays honest. A price changed here is
 * the customer's own: it stays put when the product's shelf price changes.
 */
export function EditChargeModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const updateSale = useStore((s) => s.updateSale)

  const [lines, setLines] = useState<SaleItem[]>([])
  /** Each line's price as typed, so a half-typed number is not thrown away. */
  const [prices, setPrices] = useState<Record<ID, string>>({})
  /** Lines whose price was changed in this edit. */
  const [repriced, setRepriced] = useState<Set<ID>>(new Set())
  const [customerId, setCustomerId] = useState('')
  const [occurredOn, setOccurredOn] = useState('')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!sale) return
    setLines(sale.items.map((i) => ({ ...i })))
    setPrices(Object.fromEntries(sale.items.map((i) => [i.productId, String(i.unitPrice)])))
    setRepriced(new Set())
    setCustomerId(sale.customerId ?? '')
    setOccurredOn(dayKey(sale.createdAt))
    setNote(sale.note ?? '')
    setQuery('')
  }, [sale])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return products
      .filter((p) => p.status === 'active' && p.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [products, query])

  if (!sale) return null

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const difference = total - sale.total

  // Like adding a credit sale, a charge is not held to the shelf count: stock
  // can go below zero until the next restock or count.
  function setQty(productId: ID, qty: number) {
    const capped = Math.max(1, qty)
    setLines((cur) => cur.map((l) => (l.productId === productId ? { ...l, qty: capped } : l)))
  }

  const shelfPrice = (productId: ID) => products.find((p) => p.id === productId)?.price

  function setPrice(productId: ID, text: string) {
    setPrices((cur) => ({ ...cur, [productId]: text }))
    setRepriced((cur) => new Set(cur).add(productId))
    const value = Number(text)
    if (text.trim() === '' || !Number.isFinite(value) || value < 0) return
    setLines((cur) =>
      cur.map((l) => (l.productId === productId ? { ...l, unitPrice: round2(value) } : l)),
    )
  }

  function removeLine(productId: ID) {
    setLines((cur) => cur.filter((l) => l.productId !== productId))
    setPrices(({ [productId]: _removed, ...rest }) => rest)
    setRepriced((cur) => {
      const next = new Set(cur)
      next.delete(productId)
      return next
    })
  }

  function addLine(productId: ID) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setQuery('')
    setPrices((cur) =>
      product.id in cur ? cur : { ...cur, [product.id]: String(product.price) },
    )
    setLines((cur) => {
      const existing = cur.find((l) => l.productId === productId)
      if (existing) {
        return cur.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...cur,
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

  function save() {
    if (!sale || lines.length === 0) return

    const unpriced = lines.find((l) => !(Number(prices[l.productId]) > 0))
    if (unpriced) {
      toast.error('Enter a price for ' + unpriced.name + '.')
      return
    }

    // A price changed here stays put when the shelf price changes. Typed back
    // to the shelf price, the line follows the shelf again.
    const items = lines.map((line) => {
      // An item not in inventory has no shelf price to follow.
      if (line.custom || !repriced.has(line.productId)) return line
      const { priceSetByHand: _was, ...rest } = line
      return line.unitPrice === shelfPrice(line.productId)
        ? rest
        : { ...rest, priceSetByHand: true }
    })

    // Keep the original time of day unless the day itself moved.
    const original = new Date(sale.createdAt)
    const [y, m, d] = occurredOn.split('-').map(Number)
    const when =
      occurredOn === dayKey(sale.createdAt)
        ? sale.createdAt
        : new Date(y, m - 1, d, original.getHours(), original.getMinutes(), 0, 0).toISOString()

    updateSale(sale.id, {
      items,
      customerId: customerId || null,
      note: note.trim() || undefined,
      occurredAt: when,
    })
    toast.success(sale.reference + ' corrected to ' + fmt.money(total) + '.')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={'Edit ' + sale.reference}
      description="Correct what was taken and what it cost. Stock moves by any change in quantity."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={lines.length === 0}>
            Save changes {fmt.money(total)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lines.map((line) => {
            const shelf = shelfPrice(line.productId)
            const typed = prices[line.productId] ?? String(line.unitPrice)
            return (
              <li key={line.productId} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{line.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.25"
                      value={typed}
                      onChange={(e) => setPrice(line.productId, e.target.value)}
                      aria-label={'Price of ' + line.name}
                      className={cn(
                        'tnum h-7 w-22 [appearance:textfield] rounded-md border bg-surface px-2 text-[12.5px] text-ink hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-(--brand)/25 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                        Number(typed) > 0 ? 'border-line' : 'border-critical',
                      )}
                    />
                    <span>each</span>
                    {line.custom ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>not in inventory</span>
                      </>
                    ) : null}
                    {shelf !== undefined && line.unitPrice !== shelf ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="tnum">shelf {fmt.money(shelf)}</span>
                        <button
                          onClick={() => setPrice(line.productId, String(shelf))}
                          className="font-medium text-brand hover:underline"
                        >
                          Use shelf price
                        </button>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => setQty(line.productId, line.qty - 1)}
                    disabled={line.qty <= 1}
                    aria-label={'Less ' + line.name}
                    className="grid size-6 place-items-center rounded border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="tnum w-7 text-center text-[13px] font-semibold text-ink">
                    {line.qty}
                  </span>
                  <button
                    onClick={() => setQty(line.productId, line.qty + 1)}
                    aria-label={'More ' + line.name}
                    className="grid size-6 place-items-center rounded border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"
                  >
                    <Plus size={12} />
                  </button>
                </span>
                <span className="tnum w-20 text-right text-[13px] font-semibold text-ink">
                  {fmt.money(line.qty * line.unitPrice)}
                </span>
                <button
                  onClick={() => removeLine(line.productId)}
                  aria-label={'Remove ' + line.name}
                  className="text-muted transition-colors hover:text-critical"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
          {lines.length === 0 ? (
            <li className="px-3 py-4 text-center text-[12.5px] text-ink-2">
              Nothing left on this charge. Add an item, or cancel and void it instead.
            </li>
          ) : null}
        </ul>

        <div>
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add another item"
              aria-label="Add another item"
              className="h-9.5 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-muted hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-(--brand)/25 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
          {matches.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addLine(p.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-brand hover:text-ink"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="tnum text-muted">{fmt.money(p.price)}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2">
            <CustomItemForm
              onAdd={(item) => {
                setLines((cur) => [...cur, item])
                setPrices((cur) => ({ ...cur, [item.productId]: String(item.unitPrice) }))
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Whose charge is this?"
            hint="Move it if it went on the wrong name."
          >
            {(id) => (
              <Select id={id} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                max={dayKey(new Date())}
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            )}
          </Field>
        </div>

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

        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[14px] font-semibold text-ink">
            Total
            {difference !== 0 ? (
              <span className="ml-2 text-[12px] font-normal text-muted">
                was {fmt.money(sale.total)}, {difference > 0 ? 'up' : 'down'}{' '}
                {fmt.money(Math.abs(difference))}
              </span>
            ) : null}
          </span>
          <span className="tnum text-[22px] font-semibold text-ink">{fmt.money(total)}</span>
        </div>
      </div>
    </Modal>
  )
}
