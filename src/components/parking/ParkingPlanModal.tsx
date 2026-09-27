import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, Select, TextInput } from '../ui/Field'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { dayKey } from '../../lib/utils'
import type { Customer } from '../../types'

/**
 * Puts a customer on a monthly parking fee. There is no separate parker
 * record: parking is a fee a customer owes, so it lands on their balance.
 */
export function ParkingPlanModal({
  open,
  onClose,
  customer,
}: {
  open: boolean
  onClose: () => void
  /** Omit to pick a customer inside the dialog. */
  customer?: Customer | null
}) {
  const fmt = useFormat()
  const customers = useStore((s) => s.customers)
  const defaultRate = useStore((s) => s.settings.defaultParkingRate)
  const setParkingPlan = useStore((s) => s.setParkingPlan)

  const [customerId, setCustomerId] = useState('')
  const [rate, setRate] = useState('')
  const [since, setSince] = useState('')
  const [errors, setErrors] = useState<{ customerId?: string; rate?: string; since?: string }>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setCustomerId(customer?.id ?? '')
    setRate(String(customer?.parkingRate ?? defaultRate))
    const start = customer?.parkingSince ? new Date(customer.parkingSince) : new Date()
    setSince(dayKey(new Date(start.getFullYear(), start.getMonth(), 1)))
  }, [open, customer, defaultRate])

  const value = Number(rate) || 0
  const target = customers.find((c) => c.id === customerId)
  const editing = Boolean(customer?.parkingRate)

  function submit() {
    const next: typeof errors = {}
    if (!customerId) next.customerId = 'Pick a customer.'
    if (value <= 0) next.rate = 'A monthly fee is required.'
    if (!since) next.since = 'Pick the month they started.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const [y, m] = since.split('-').map(Number)
    // Always the first of the chosen month: billing is by calendar month.
    const start = new Date(y, m - 1, 1, 8, 0, 0, 0)

    setParkingPlan(customerId, value, start.toISOString())
    toast.success(`${target?.name ?? 'Customer'} pays ${fmt.money(value)} a month for parking.`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={editing ? 'Edit parking fee' : 'Add parking fee'}
      description="The fee is added to what they owe at the start of every month."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {editing ? 'Save changes' : 'Add parking fee'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {customer ? (
          <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
            <p className="text-[12px] text-ink-2">Customer</p>
            <p className="text-[14px] font-semibold text-ink">{customer.name}</p>
          </div>
        ) : (
          <Field label="Who parks?" required error={errors.customerId}>
            {(id) => (
              <Select id={id} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Choose a customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.parkingRate ? ' (already parking)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field
          label="Monthly fee"
          required
          error={errors.rate}
          hint={value > 0 ? `${fmt.money(value * 12)} over a year` : undefined}
        >
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="50"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Started"
          required
          error={errors.since}
          hint="Charged in whole months from here. No half months."
        >
          {(id) => (
            <TextInput
              id={id}
              type="month"
              value={since.slice(0, 7)}
              onChange={(e) => setSince(`${e.target.value}-01`)}
            />
          )}
        </Field>

        {customers.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-ink-2">
            Add a customer on the Credit page first. Parking is a fee a customer owes, so it needs
            someone to belong to.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
