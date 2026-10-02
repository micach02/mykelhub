import { useMemo, useState } from 'react'
import { Banknote, Download, Pencil, Phone, Plus, Printer, Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Table, TableWrap, Td, Th, Tr } from '../ui/Table'
import { Pagination, usePagination } from '../ui/Pagination'
import { EditChargeModal } from './EditChargeModal'
import { EditPaymentModal } from './EditPaymentModal'
import { PaymentReceiptModal } from './PaymentReceiptModal'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import {
  AGE_LABELS,
  ageBucket,
  buildLedger,
  outstandingCharges,
  type Account,
} from '../../lib/analytics'
import { downloadStatementPdf } from '../../lib/pdf'
import { useDocumentMeta } from '../../lib/useDocumentMeta'
import type { Customer, Payment, Sale } from '../../types'

/** One customer's ledger: every charge and payment, newest first. */
export function LedgerModal({
  customer,
  account,
  onClose,
  onAddCharge,
  onRecordPayment,
}: {
  customer: Customer | null
  account: Account | null
  onClose: () => void
  onAddCharge: (customer: Customer) => void
  onRecordPayment: (account: Account) => void
}) {
  const fmt = useFormat()
  const sales = useStore((s) => s.sales)
  const payments = useStore((s) => s.payments)
  const dueDay = useStore((s) => s.settings.collectionDay)
  const deletePayment = useStore((s) => s.deletePayment)
  const meta = useDocumentMeta()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [editCharge, setEditCharge] = useState<Sale | null>(null)
  const [editPayment, setEditPayment] = useState<Payment | null>(null)
  const [receiptFor, setReceiptFor] = useState<Payment | null>(null)
  const [saving, setSaving] = useState(false)

  const entries = useMemo(
    () => (customer ? buildLedger(customer, sales, payments, { dueDay }) : []),
    [customer, sales, payments, dueDay],
  )

  // The statement asks for payment, so it lists only what is still owed —
  // unlike the ledger on screen, which is the whole history.
  const unpaid = useMemo(
    () => (customer ? outstandingCharges(customer, sales, payments, { dueDay }) : []),
    [customer, sales, payments, dueDay],
  )

  // Newest first, ten at a time, so a long history does not turn the dialog
  // into a scroll. Another customer starts back on the first page.
  const pager = usePagination(entries, 10, [customer?.id])

  if (!customer || !account) return null

  const bucket = ageBucket(account.daysOutstanding)

  async function download() {
    if (!customer || !account) return
    setSaving(true)
    try {
      await downloadStatementPdf({
        customer,
        account,
        outstanding: unpaid,
        meta,
      })
    } catch {
      toast.error('The statement could not be prepared.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={customer.name}
        description={customer.phone ? `Credit ledger, ${customer.phone}` : 'Credit ledger'}
        footer={
          <>
            <Button onClick={download} disabled={saving}>
              <Download size={15} aria-hidden />
              {saving ? 'Preparing…' : 'Download PDF'}
            </Button>
            <Button onClick={() => onAddCharge(customer)}>
              <Plus size={15} aria-hidden />
              Add credit sale
            </Button>
            <Button
              variant="primary"
              onClick={() => onRecordPayment(account)}
              disabled={account.balance <= 0}
            >
              <Banknote size={15} aria-hidden />
              Record payment
            </Button>
          </>
        }
      >
        <div className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-ink-2">Outstanding balance</p>
              <p className="tnum text-[28px] leading-none font-semibold text-ink">
                {fmt.money(account.balance)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {account.balance > 0 ? (
                <Badge
                  tone={
                    bucket === 'overdue' ? 'critical' : bucket === 'fortnight' ? 'warning' : 'neutral'
                  }
                >
                  {AGE_LABELS[bucket]}
                  {account.daysOutstanding > 0 ? `, ${account.daysOutstanding} days` : ''}
                </Badge>
              ) : (
                <Badge tone="good">Settled</Badge>
              )}
              {account.credit > 0 ? (
                <Badge tone="brand">{fmt.money(account.credit)} in credit</Badge>
              ) : null}
              {account.parks ? (
                <Badge tone="neutral">Parking {fmt.money(account.parkingRate)}/month</Badge>
              ) : null}
            </div>
          </div>

          {account.balance > 0 && account.parks ? (
            <p className="mt-3 text-[12.5px] text-ink-2">
              <span className="tnum font-semibold text-ink">{fmt.money(account.goodsOwed)}</span>{' '}
              for goods and{' '}
              <span className="tnum font-semibold text-ink">{fmt.money(account.parkingOwed)}</span>{' '}
              for parking
              {account.parkingBehind > 0
                ? ` (${account.parkingBehind} month${account.parkingBehind === 1 ? '' : 's'} behind)`
                : ''}
              .
            </p>
          ) : null}

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-[12.5px]">
            <div>
              <dt className="text-ink-2">Total charged</dt>
              <dd className="tnum font-semibold text-ink">{fmt.money(account.totalCharged)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Total paid</dt>
              <dd className="tnum font-semibold text-ink">{fmt.money(account.totalPaid)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Entries</dt>
              <dd className="tnum font-semibold text-ink">{account.chargeCount}</dd>
            </div>
          </dl>

          {customer.notes ? (
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-2">
              {customer.notes}
            </p>
          ) : null}
          {customer.phone ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <Phone size={12} aria-hidden />
              {customer.phone}
            </p>
          ) : null}
        </div>

        <h3 className="mt-5 mb-2 text-[13px] font-semibold text-ink">Entries</h3>
        {entries.length === 0 ? (
          <p className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-8 text-center text-[13px] text-ink-2">
            {customer.name} has never bought on credit or been charged for parking.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            <TableWrap>
              <Table className="min-w-[520px]">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Details</Th>
                    <Th align="right">Charged</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Balance</Th>
                    <Th align="right" className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {pager.visible.map((entry) => (
                    <Tr key={entry.id}>
                      <Td className="whitespace-nowrap text-ink-2">
                        {/* A month's parking falls due on a day, not at a time. */}
                        {entry.kind === 'parking' ? fmt.date(entry.at) : fmt.dateTime(entry.at)}
                      </Td>
                      <Td>
                        <span className="flex items-start gap-1.5">
                          {entry.kind === 'parking' ? (
                            <Badge tone="neutral" className="mt-px shrink-0">
                              Parking
                            </Badge>
                          ) : null}
                          <span className="line-clamp-2 text-[12.5px]">{entry.description}</span>
                        </span>
                      </Td>
                      <Td align="right" numeric>
                        {entry.kind !== 'payment' ? (
                          <span className="font-semibold">{fmt.money(entry.amount)}</span>
                        ) : (
                          <span className="text-muted">&ndash;</span>
                        )}
                      </Td>
                      <Td align="right" numeric>
                        {entry.kind === 'payment' ? (
                          <span className="font-semibold" style={{ color: 'var(--delta-up)' }}>
                            {fmt.money(entry.amount)}
                          </span>
                        ) : (
                          <span className="text-muted">&ndash;</span>
                        )}
                      </Td>
                      <Td align="right" numeric className="font-semibold">
                        {fmt.money(Math.max(0, entry.runningBalance))}
                      </Td>
                      <Td align="right">
                        <span className="flex items-center justify-end gap-1.5">
                          {entry.kind === 'goods' && entry.sale && !entry.sale.voided ? (
                            <button
                              onClick={() => setEditCharge(entry.sale ?? null)}
                              aria-label="Edit this charge"
                              title="Edit this charge"
                              className="text-muted transition-colors hover:text-brand"
                            >
                              <Pencil size={14} />
                            </button>
                          ) : null}
                          {entry.kind === 'payment' && entry.payment ? (
                            <>
                              <button
                                onClick={() => setReceiptFor(entry.payment ?? null)}
                                aria-label="Get the receipt for this payment"
                                title="Receipt"
                                className="text-muted transition-colors hover:text-brand"
                              >
                                <Printer size={14} />
                              </button>
                              <button
                                onClick={() => setEditPayment(entry.payment ?? null)}
                                aria-label="Edit this payment"
                                title="Edit this payment"
                                className="text-muted transition-colors hover:text-brand"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => setPendingDelete(entry.id)}
                                aria-label="Delete this payment"
                                title="Delete this payment"
                                className="text-muted transition-colors hover:text-critical"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : null}
                          {entry.kind === 'parking' ? (
                            <span
                              className="text-[11px] text-muted"
                              title="Parking months come from the monthly fee, so they are changed on the Parking page rather than one at a time."
                            >
                              auto
                            </span>
                          ) : null}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination {...pager} onPage={pager.setPage} noun="entry" many="entries" />
          </div>
        )}
      </Modal>

      <EditChargeModal sale={editCharge} onClose={() => setEditCharge(null)} />
      <EditPaymentModal payment={editPayment} onClose={() => setEditPayment(null)} />
      <PaymentReceiptModal
        payment={receiptFor}
        customer={customer}
        onClose={() => setReceiptFor(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deletePayment(pendingDelete)
          toast.info('Payment deleted. The balance goes back up.')
        }}
        title="Delete this payment?"
        message="Use this only if the payment was recorded by mistake. The balance will go back up by that amount."
        confirmLabel="Delete payment"
        destructive
      />
    </>
  )
}
