import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, Select, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useStore } from '../../store/useStore'
import { toast } from '../ui/Toast'
import { useFormat } from '../../lib/useFormat'
import type { Product } from '../../types'

type Mode = 'restock' | 'remove' | 'count'

const REMOVE_REASONS = [
  'Damaged',
  'Expired',
  'Lost',
  'Taken for the house',
  'Returned to wholesaler',
]

export function StockAdjustModal({
  open,
  onClose,
  product,
}: {
  open: boolean
  onClose: () => void
  product: Product | null
}) {
  const fmt = useFormat()
  const restock = useStore((s) => s.restock)
  const adjustStock = useStore((s) => s.adjustStock)

  const [mode, setMode] = useState<Mode>('restock')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState(REMOVE_REASONS[0])
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setMode('restock')
    setQty('')
    setReason(REMOVE_REASONS[0])
    setNote('')
  }, [open, product])

  if (!product) return null

  const amount = Math.max(0, Math.round(Number(qty) || 0))
  const resulting =
    mode === 'restock'
      ? product.stock + amount
      : mode === 'remove'
        ? Math.max(0, product.stock - amount)
        : amount

  const valid = qty !== '' && (mode === 'count' ? amount !== product.stock : amount > 0)

  function apply() {
    if (!valid || !product) return

    if (mode === 'restock') {
      restock(product.id, amount, note.trim() || undefined)
      toast.success(`Added ${amount} ${product.unit} of ${product.name}.`)
    } else if (mode === 'remove') {
      adjustStock(product.id, -amount, reason)
      toast.success(`Removed ${amount} ${product.unit}: ${reason.toLowerCase()}.`)
    } else {
      adjustStock(product.id, amount - product.stock, 'Stock count')
      toast.success(`${product.name} is now ${amount} ${product.unit}.`)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust stock"
      description={`${product.name} (${product.category})`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={!valid}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="Type of adjustment"
          value={mode}
          onChange={setMode}
          segments={[
            { value: 'restock', label: 'Restock' },
            { value: 'remove', label: 'Remove' },
            { value: 'count', label: 'Count' },
          ]}
        />

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3">
          <div>
            <p className="text-[12px] text-ink-2">Stock now</p>
            <p className="tnum text-lg font-semibold text-ink">
              {product.stock} {product.unit}
            </p>
          </div>
          <span className="text-muted" aria-hidden>
            &rarr;
          </span>
          <div className="text-right">
            <p className="text-[12px] text-ink-2">After</p>
            <p className="tnum text-lg font-semibold text-ink">
              {resulting} {product.unit}
            </p>
          </div>
        </div>

        <Field
          label={mode === 'count' ? 'How many did you count?' : 'How many?'}
          required
          hint={
            mode === 'count'
              ? 'Enter the actual number on the shelf.'
              : mode === 'restock'
                ? `Cost to buy: ${fmt.money(amount * product.cost)}`
                : `In ${product.unit}.`
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="1"
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          )}
        </Field>

        {mode === 'remove' ? (
          <Field label="Reason" required>
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REMOVE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        {mode === 'restock' ? (
          <Field label="Note" hint="Where you bought it, or any reminder.">
            {(id) => (
              <TextInput
                id={id}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Restock from wholesaler"
              />
            )}
          </Field>
        ) : null}
      </div>
    </Modal>
  )
}
