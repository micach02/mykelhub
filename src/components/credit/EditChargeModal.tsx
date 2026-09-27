import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Select, TextInput } from '../ui/Field'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { dayKey } from '../../lib/utils'
import type { ID, Sale, SaleItem } from '../../types'

/**
 * Correcting a credit sale after it was rung up. Changing the lines moves
 * stock by the difference, so the shelf stays honest.
 */
export function EditChargeModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const updateSale = useStore((s) => s.updateSale)

  const [lines, setLines] = useState<SaleItem[]>([])
  const [customerId, setCustomerId] = useState('')
  const [occurredOn, setOccurredOn] = useState('')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!sale) return
    setLines(sale.items.map((i) => ({ ...i })))
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

  /** Stock free to take, counting back what this sale already holds. */
  function availableFor(productId: ID): number {
    const product = products.find((p) => p.id === productId)
    const heldByThisSale = sale?.items.find((i) => i.productId === productId)?.qty ?? 0
    return (product?.stock ?? 0) + heldByThisSale
  }

  function setQty(productId: ID, qty: number) {
    const capped = Math.min(Math.max(1, qty), availableFor(productId))
    setLines((cur) => cur.map((l) => (l.productId === productId ? { ...l, qty: capped } : l)))
  }

  function addLine(productId: ID) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setQuery('')
    setLines((cur) => {
      const existing = cur.find((l) => l.productId === productId)
      if (existing) {
        if (existing.qty >= availableFor(productId)) {
          toast.error('No more ' + product.name + ' in stock.')
          return cur
        }
        return cur.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l))
      }
      if (availableFor(productId) < 1) {
        toast.error(product.name + ' is out of stock.')
        return cur
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

    // Keep the original time of day unless the day itself moved.
    const original = new Date(sale.createdAt)
    const [y, m, d] = occurredOn.split('-').map(Number)
    const when =
      occurredOn === dayKey(sale.createdAt)
        ? sale.createdAt
        : new Date(y, m - 1, d, original.getHours(), original.getMinutes(), 0, 0).toISOString()

    updateSale(sale.id, {
      items: lines,
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
      description="Correcting what was taken. Stock moves by the difference."
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
          {lines.map((line) => (
            <li key={line.productId} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{line.name}</span>
                <span className="tnum text-[11.5px] text-muted">
                  {fmt.money(line.unitPrice)} each
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
                  disabled={line.qty >= availableFor(line.productId)}
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
                onClick={() => setLines((c) => c.filter((l) => l.productId !== line.productId))}
                aria-label={'Remove ' + line.name}
                className="text-muted transition-colors hover:text-critical"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
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
