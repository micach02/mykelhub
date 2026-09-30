import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { useStore } from '../../store/useStore'
import { toast } from '../ui/Toast'
import { marginPct, unpaidRepricing } from '../../lib/analytics'
import { useFormat } from '../../lib/useFormat'
import type { Product } from '../../types'

interface FormState {
  name: string
  category: string
  unit: string
  cost: string
  price: string
  stock: string
  reorderLevel: string
}

const EMPTY: FormState = {
  name: '',
  category: '',
  unit: 'pc',
  cost: '',
  price: '',
  stock: '0',
  reorderLevel: '',
}

const COMMON_UNITS = ['pc', 'pack', 'sachet', 'can', 'bottle', 'cup', 'kilo']

export function ProductFormModal({
  open,
  onClose,
  product,
}: {
  open: boolean
  onClose: () => void
  /** Omit to create a new product. */
  product?: Product | null
}) {
  const fmt = useFormat()
  const products = useStore((s) => s.products)
  const customers = useStore((s) => s.customers)
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const defaultReorderLevel = useStore((s) => s.settings.defaultReorderLevel)
  const addProduct = useStore((s) => s.addProduct)
  const updateProduct = useStore((s) => s.updateProduct)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      product
        ? {
            name: product.name,
            category: product.category,
            unit: product.unit,
            cost: String(product.cost),
            price: String(product.price),
            stock: String(product.stock),
            reorderLevel: String(product.reorderLevel),
          }
        : { ...EMPTY, reorderLevel: String(defaultReorderLevel) },
    )
  }, [open, product, defaultReorderLevel])

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [products],
  )

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const cost = Number(form.cost) || 0
  const price = Number(form.price) || 0

  // Credit still owed for this product moves to the price saved here.
  const repricing = useMemo(
    () =>
      product && price > 0
        ? unpaidRepricing(product.id, price, customers, sales, payments)
        : null,
    [product, price, customers, sales, payments],
  )
  const repriced = repricing?.saleIds.size ?? 0

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) next.name = 'A product name is required.'
    else if (
      products.some(
        (p) =>
          p.name.trim().toLowerCase() === form.name.trim().toLowerCase() && p.id !== product?.id,
      )
    ) {
      next.name = 'You already have this product.'
    }
    if (!form.category.trim()) next.category = 'Pick or type a category.'
    if (price <= 0) next.price = 'A selling price is required.'
    if (cost < 0) next.cost = 'Cannot be negative.'
    // Only opening stock is typed in. An existing product's count can sit
    // below zero after a credit sale, and this form does not change it.
    if (!product && Number(form.stock) < 0) next.stock = 'Cannot be negative.'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submit() {
    if (!validate()) return

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit.trim() || 'pc',
      cost,
      price,
      stock: Math.max(0, Math.round(Number(form.stock) || 0)),
      reorderLevel: Math.max(0, Math.round(Number(form.reorderLevel) || 0)),
      status: product?.status ?? ('active' as const),
    }

    if (product) {
      // Stock moves through restock and adjustment, never rewritten here.
      const { stock: _ignored, ...rest } = payload
      updateProduct(product.id, rest)
      toast.success(
        repriced > 0
          ? `${payload.name} updated, and ${repriced} unpaid credit ${repriced === 1 ? 'charge' : 'charges'} moved to ${fmt.money(price)}.`
          : `${payload.name} updated.`,
      )
    } else {
      addProduct(payload)
      toast.success(`${payload.name} added.`)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Edit product' : 'Add product'}
      description={
        product
          ? 'Past sales keep the price they were sold at, except credit not yet paid, which follows the price here.'
          : 'Add what you sell, and how many you have right now.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name} className="sm:col-span-2">
          {(id) => (
            <TextInput
              id={id}
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="e.g. Lucky Me Pancit Canton Original"
            />
          )}
        </Field>

        <Field label="Category" required error={errors.category}>
          {(id) => (
            <>
              <TextInput
                id={id}
                list="mh-categories"
                value={form.category}
                onChange={(e) => set('category')(e.target.value)}
                placeholder="Snacks, Coffee, Noodles"
              />
              <datalist id="mh-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="Unit" hint="How you count it over the counter.">
          {(id) => (
            <>
              <TextInput
                id={id}
                list="mh-units"
                value={form.unit}
                onChange={(e) => set('unit')(e.target.value)}
                placeholder="pc, pack, sachet"
              />
              <datalist id="mh-units">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="Cost" error={errors.cost} hint="What you pay the wholesaler.">
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="0.25"
              value={form.cost}
              onChange={(e) => set('cost')(e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field
          label="Selling price"
          required
          error={errors.price}
          hint={
            price > 0 && cost > 0
              ? `Profit: ${fmt.money(price - cost)} per ${form.unit || 'pc'} (${marginPct(price, cost).toFixed(0)}%)`
              : 'What the customer pays.'
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="0.25"
              value={form.price}
              onChange={(e) => set('price')(e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field
          label={product ? 'Stock on hand' : 'Opening stock'}
          error={errors.stock}
          hint={product ? 'Use Restock or Count to change this.' : 'How many you have right now.'}
        >
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="1"
              disabled={Boolean(product)}
              value={form.stock}
              onChange={(e) => set('stock')(e.target.value)}
            />
          )}
        </Field>

        <Field label="Reorder level" hint="You are warned when stock reaches this.">
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="1"
              value={form.reorderLevel}
              onChange={(e) => set('reorderLevel')(e.target.value)}
            />
          )}
        </Field>

        {repricing && repriced > 0 ? (
          <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 sm:col-span-2">
            <p className="text-[12.5px] leading-relaxed text-ink">
              {repriced} unpaid credit {repriced === 1 ? 'charge' : 'charges'}
              {repricing.customers > 1 ? ` across ${repricing.customers} customers` : ''} will
              move to <span className="tnum font-semibold">{fmt.money(price)}</span>. What{' '}
              {repricing.customers > 1 ? 'they owe' : 'the customer owes'} goes{' '}
              {repricing.change >= 0 ? 'up' : 'down'} by{' '}
              <span className="tnum font-semibold">{fmt.money(Math.abs(repricing.change))}</span>.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
