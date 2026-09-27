import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { buildLedger, paymentAllocation } from '../../lib/analytics'
import { amountInWords } from '../../lib/words'
import { paymentMethodLabel } from '../../lib/labels'
import { downloadReceiptPdf } from '../../lib/pdf'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import { toast } from '../ui/Toast'
import type { Customer, Payment } from '../../types'

/** Receipts need a number a customer can quote back at you. */
function receiptNumber(payment: Payment): string {
  return `RCPT-${payment.id.slice(-6).toUpperCase()}`
}

/**
 * The slip handed over when someone pays. Printed narrow so it suits a
 * thermal roll, and cuts cleanly out of A4 otherwise.
 */
export function PaymentReceiptModal({
  payment,
  customer,
  onClose,
}: {
  payment: Payment | null
  customer: Customer | null
  onClose: () => void
}) {
  const fmt = useFormat()
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const storeName = useStore((s) => s.settings.storeName)
  const meta = useDocumentMeta()
  const [saving, setSaving] = useState(false)

  // The ledger already works out the balance after every entry, so the
  // receipt reads the same figures whether it is saved now or months later.
  // What this payment actually cleared, so the slip can itemise it.
  const settled = useMemo(
    () =>
      customer && payment ? paymentAllocation(customer, sales, payments, payment.id) : [],
    [customer, payment, sales, payments],
  )

  /** Parking months and goods, each together, so the slip reads in sections. */
  const groups = useMemo(() => {
    const order = [
      { kind: 'parking' as const, label: 'Parking' },
      { kind: 'goods' as const, label: 'Goods' },
    ]
    return order
      .map(({ kind, label }) => {
        const rows = settled.filter((row) => row.kind === kind)
        return { kind, label, rows, total: rows.reduce((t, r) => t + r.applied, 0) }
      })
      .filter((group) => group.rows.length > 0)
  }, [settled])

  // With only one kind on the slip, a heading over it says nothing.
  const showGroupHeadings = groups.length > 1

  const balances = useMemo(() => {
    if (!customer || !payment) return { before: 0, after: 0 }
    const entry = buildLedger(customer, sales, payments).find((e) => e.id === payment.id)
    const after = Math.max(0, entry?.runningBalance ?? 0)
    return { before: after + payment.amount, after }
  }, [customer, payment, sales, payments])

  if (!payment || !customer) return null

  const method = paymentMethodLabel(payment.method)
  const number = receiptNumber(payment)

  async function download() {
    if (!payment || !customer) return
    setSaving(true)
    try {
      await downloadReceiptPdf({
        payment,
        customer,
        balanceBefore: balances.before,
        balanceAfter: balances.after,
        settled,
        meta,
      })
    } catch {
      toast.error('The receipt could not be prepared.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Payment receipt"
      description={`${number} · ${customer.name}`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={download} disabled={saving}>
            <Download size={15} aria-hidden />
            {saving ? 'Preparing…' : 'Download PDF'}
          </Button>
        </>
      }
    >
      {/* On screen: the same figures, laid out for reading rather than paper. */}
      <div className="rounded-lg border border-line bg-surface-2 px-4 py-4 text-center">
        <p className="text-[13px] font-semibold text-ink">{storeName}</p>
        <p className="text-[11.5px] tracking-wide text-muted uppercase">Payment receipt</p>

        <p className="tnum mt-3 text-[30px] leading-none font-semibold text-ink">
          {fmt.money(payment.amount)}
        </p>
        <p className="mx-auto mt-1.5 max-w-xs text-[11.5px] text-ink-2">
          {amountInWords(payment.amount, fmt.currency)}
        </p>

        <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-left text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Received from</dt>
            <dd className="font-medium text-ink">{customer.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Date paid</dt>
            <dd className="text-ink">{fmt.date(payment.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Paid with</dt>
            <dd className="text-ink">{method}</dd>
          </div>
          {payment.note ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">For</dt>
              <dd className="max-w-[60%] text-right text-ink">{payment.note}</dd>
            </div>
          ) : null}
        </dl>

        {settled.length > 0 ? (
          <div className="mt-3 border-t border-line pt-3 text-left">
            <p className="text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
              This payment settled
            </p>

            {groups.map((group) => (
              <div key={group.kind} className="mt-2.5">
                {showGroupHeadings ? (
                  <p className="flex items-baseline justify-between gap-3 border-b border-line pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                    {group.label}
                    <span className="tnum font-medium text-ink-2">{fmt.money(group.total)}</span>
                  </p>
                ) : null}

                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {group.rows.map((row) => (
                    <li key={row.chargeId} className="text-[12px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-ink">
                          {row.kind === 'parking' ? row.description : fmt.date(row.at)}
                        </span>
                        <span className="tnum shrink-0 font-medium text-ink">
                          {fmt.money(row.applied)}
                        </span>
                      </div>

                      {row.items.length > 0 ? (
                        <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                          {row.items.map((line, i) => (
                            <li key={i} className="flex gap-1.5 text-[11.5px] text-ink-2">
                              <span className="tnum shrink-0 text-muted">{line.qty}&times;</span>
                              <span className="min-w-0">{line.name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {!row.cleared ? (
                        <p className="mt-0.5 text-[11px] text-muted">
                          Part of {fmt.money(row.chargeAmount)}, the rest is still owed.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-left text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Balance before</dt>
            <dd className="tnum text-ink">{fmt.money(balances.before)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">This payment</dt>
            <dd className="tnum text-ink">&minus;{fmt.money(payment.amount)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-1.5">
            <dt className="font-semibold text-ink">Balance now</dt>
            <dd className="tnum font-semibold text-ink">{fmt.money(balances.after)}</dd>
          </div>
        </dl>

        {balances.after > 0 && meta.collectionDue ? (
          <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-2">
            Next collection on or before{' '}
            <span className="font-semibold text-ink">{meta.collectionDue}</span>.
          </p>
        ) : null}
      </div>

    </Modal>
  )
}
