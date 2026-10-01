import { useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { uid } from '../../lib/utils'
import type { SaleItem } from '../../types'

/**
 * Adds something that is not in Inventory: a name and a price typed in by
 * hand. It goes on the sale like any item but never touches stock, and its
 * cost is its price, so no profit is counted on it.
 */
export function CustomItemForm({ onAdd }: { onAdd: (item: SaleItem) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [errors, setErrors] = useState<{ name?: string; price?: string; qty?: string }>({})

  function reset() {
    setOpen(false)
    setName('')
    setPrice('')
    setQty('1')
    setErrors({})
  }

  function add() {
    const unitPrice = Math.round(Number(price) * 100) / 100
    const count = Number(qty)
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Say what it is.'
    if (!(unitPrice > 0)) next.price = 'Enter a price.'
    if (!Number.isInteger(count) || count < 1) next.qty = 'At least 1.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    onAdd({
      productId: uid('custom_'),
      name: name.trim(),
      qty: count,
      unitPrice,
      unitCost: unitPrice,
      custom: true,
    })
    reset()
  }

  const submitOnEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
      >
        <Plus size={13} aria-hidden />
        Add an item not in inventory
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <p className="mb-2 text-[12.5px] text-ink-2">
        Not in inventory: type what it is and its price. Stock is not touched.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_5rem]">
        <Field label="Item" error={errors.name} className="col-span-2 sm:col-span-1">
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="e.g. Ice, Load, Rice 1 kilo"
            />
          )}
        </Field>
        <Field label="Price each" error={errors.price}>
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="0.25"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={submitOnEnter}
              placeholder="0.00"
            />
          )}
        </Field>
        <Field label="Qty" error={errors.qty}>
          {(id) => (
            <NumberInput
              id={id}
              min={1}
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={submitOnEnter}
            />
          )}
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" onClick={reset}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={add}>
          Add item
        </Button>
      </div>
    </div>
  )
}
