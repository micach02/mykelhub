import type { PaymentMethod } from '../types'

/** How each way of paying is written wherever it is shown. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  maya: 'Maya',
  transfer: 'Bank transfer',
}

/**
 * Methods that existed under an older name. A restored backup skips the store
 * migration, so these can still arrive from a file even after the rename.
 */
const RETIRED_METHODS: Record<string, PaymentMethod> = {
  gcash: 'maya',
}

/** The stored value, brought up to date if it predates a rename. */
export function normalisePaymentMethod(method: string): PaymentMethod {
  if (method in PAYMENT_METHOD_LABELS) return method as PaymentMethod
  return RETIRED_METHODS[method] ?? 'cash'
}

/**
 * Total, unlike a bare index into the record: an unrecognised method must
 * read oddly rather than crash the page it appears on.
 */
export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[normalisePaymentMethod(method)]
}
