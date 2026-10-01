import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/SegmentedControl'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { dayKey } from '../../lib/utils'
import type { Account } from '../../lib/analytics'
import type { Payment, PaymentMethod } from '../../types'

/**
 * Records a payment against a customer's balance. One payment clears whatever
 * they owe, oldest first, whether that was goods or parking.
 */
export function PaymentModal({
  open,
  onClose,
  account,
  onRecorded,
}: {
  open: boolean
  onClose: () => void
  account: Account | null
  /** Fires with the saved payment, so the caller can offer a receipt. */
  onRecorded?: (payment: Payment) => void
}) {
  const fmt = useFormat()
  const recordPayment = useStore((s) => s.recordPayment)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidOn, setPaidOn] = useState(dayKey(new Date()))
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount('')
    setMethod('cash')
    setPaidOn(dayKey(new Date()))
    setNote('')
  }, [open, account])

  if (!account) return null

  const value = Math.max(0, Number(amount) || 0)
  const remaining = Math.max(0, account.balance - value)
  const overpay = value > account.balance

  const presets = [account.balance, account.parkingOwed, account.parkingRate].filter(
    (v, i, arr) => v > 0 && arr.indexOf(v) === i,
  )

  function save() {
    if (!account || value <= 0) return

    // Keep the time-of-day when it is today, so same-day entries stay ordered.
    const today = dayKey(new Date())
    const [y, m, d] = paidOn.split('-').map(Number)
    const when =
      paidOn === today ? new Date() : new Date(y, m - 1, d, 12, 0, 0, 0)

    const payment = recordPayment({
      customerId: account.customerId,
      amount: value,
      method,
      note: note.trim() || undefined,
      paidAt: when.toISOString(),
    })

    toast.success(
      remaining === 0
        ? `${account.name} is fully paid up.`
        : `${fmt.money(value)} received, ${fmt.money(remaining)} still owed.`,
    )
    onClose()
    onRecorded?.(payment)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`Payment from ${account.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={value <= 0}>
            Record {fmt.money(value)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-ink-2">Currently owes</p>
              <p className="tnum text-lg font-semibold text-ink">{fmt.money(account.balance)}</p>
            </div>
            <span className="text-muted" aria-hidden>
              &rarr;
            </span>
            <div className="text-right">
              <p className="text-[12px] text-ink-2">After payment</p>
              <p className="tnum text-lg font-semibold text-ink">{fmt.money(remaining)}</p>
            </div>
          </div>

          {account.parkingOwed > 0 ? (
            <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] text-ink-2">
              That includes{' '}
              <span className="tnum font-semibold text-ink">
                {fmt.money(account.parkingOwed)}
              </span>{' '}
              of unpaid parking
              {account.parkingBehind > 0
                ? ` (${account.parkingBehind} month${account.parkingBehind === 1 ? '' : 's'})`
                : ''}
              . Payments clear the oldest thing owed first.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="How much?"
            required
            hint={overpay ? 'More than owed. The extra is kept as credit.' : undefined}
          >
            {(id) => (
              <NumberInput
                id={id}
                min={0}
                step="0.01"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            )}
          </Field>

          <Field label="Date paid" hint="Change this if they paid on an earlier day.">
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

        {presets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(Math.round(preset * 100) / 100))}
                className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand hover:text-ink"
              >
                {preset === account.balance
                  ? `Everything, ${fmt.money(preset)}`
                  : preset === account.parkingOwed
                    ? `Parking owed, ${fmt.money(preset)}`
                    : `One month parking, ${fmt.money(preset)}`}
              </button>
            ))}
          </div>
        ) : null}

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
        </div>

        <Field label="Note">
          {(id) => (
            <TextInput
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional, e.g. for March parking"
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
