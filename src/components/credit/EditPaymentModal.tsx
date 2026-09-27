import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/SegmentedControl'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { dayKey } from '../../lib/utils'
import type { Payment, PaymentMethod } from '../../types'

/** Correcting a payment that was written down wrong. */
export function EditPaymentModal({
  payment,
  onClose,
}: {
  payment: Payment | null
  onClose: () => void
}) {
  const fmt = useFormat()
  const updatePayment = useStore((s) => s.updatePayment)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidOn, setPaidOn] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!payment) return
    setAmount(String(payment.amount))
    setMethod(payment.method)
    setPaidOn(dayKey(payment.createdAt))
    setNote(payment.note ?? '')
  }, [payment])

  if (!payment) return null

  const value = Math.max(0, Number(amount) || 0)
  const changed =
    value !== payment.amount ||
    method !== payment.method ||
    paidOn !== dayKey(payment.createdAt) ||
    (note.trim() || undefined) !== payment.note

  function save() {
    if (!payment || value <= 0) return

    // Keep the original time of day unless the day itself moved.
    const original = new Date(payment.createdAt)
    const [y, m, d] = paidOn.split('-').map(Number)
    const when =
      paidOn === dayKey(payment.createdAt)
        ? payment.createdAt
        : new Date(
            y,
            m - 1,
            d,
            original.getHours(),
            original.getMinutes(),
            0,
            0,
          ).toISOString()

    updatePayment(payment.id, {
      amount: value,
      method,
      note: note.trim() || undefined,
      paidAt: when,
    })
    toast.success(`Payment corrected to ${fmt.money(value)}.`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Edit payment"
      description="Fix a payment that was recorded wrong. The balance updates to match."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={value <= 0 || !changed}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Amount"
            required
            hint={
              value !== payment.amount
                ? `Was ${fmt.money(payment.amount)}`
                : undefined
            }
          >
            {(id) => (
              <NumberInput
                id={id}
                min={0}
                step="0.01"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>

          <Field label="Date paid">
            {(id) => (
              <TextInput
                id={id}
                type="date"
                max={dayKey(new Date())}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Paid with</p>
          <SegmentedControl
            ariaLabel="Payment method"
            value={method}
            onChange={setMethod}
            segments={[
              { value: 'cash', label: 'Cash' },
              { value: 'maya', label: 'Maya' },
              { value: 'transfer', label: 'Bank transfer' },
            ]}
          />
          {method !== payment.method ? (
            <p className="mt-1.5 text-[12px] text-muted">
              {method === 'cash'
                ? 'This money now counts as being in the vault.'
                : 'This never reaches the drawer, so it comes back out of the vault.'}
            </p>
          ) : null}
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
      </div>
    </Modal>
  )
}
