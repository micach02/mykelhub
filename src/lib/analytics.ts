import type { Customer, ID, Payment, Product, Sale, SaleItem, VaultEntry } from '../types'
import { dayKey } from './utils'
import { paymentMethodLabel } from './labels'

/** Voided sales stay in the log but count for nothing. */
export const isLive = (s: Sale) => !s.voided

// ---------------------------------------------------------------------------
// What a customer owes
//
// Two things put a customer in debt: goods taken on credit, and the monthly
// parking fee. They share one balance and one payment stream, because that is
// how it works across the counter — money handed over clears the oldest thing
// owed, whatever it was for.
// ---------------------------------------------------------------------------

/** Calendar months since year zero, so month maths never touches day-of-month. */
function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth()
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export type ChargeKind = 'goods' | 'parking'

export interface Charge {
  id: string
  kind: ChargeKind
  at: string
  amount: number
  label: string
  sale?: Sale
}

/**
 * The monthly parking fees a customer has run up. Derived on read rather than
 * written down, so a new month starts owing the moment it arrives — no
 * scheduled job, nothing to forget.
 *
 * Billing is by calendar month with no proration: someone who starts on the
 * 20th still owes for that month, which is how a space is actually let.
 */
export function parkingCharges(customer: Customer, asOf: Date = new Date()): Charge[] {
  if (!customer.parkingRate || customer.parkingRate <= 0 || !customer.parkingSince) return []

  const start = new Date(customer.parkingSince)
  const stopped = customer.parkingUntil ? new Date(customer.parkingUntil) : null
  const end = stopped && stopped < asOf ? stopped : asOf

  const months = monthIndex(end) - monthIndex(start)
  if (months < 0) return []

  const charges: Charge[] = []
  for (let i = 0; i <= months; i++) {
    const month = new Date(start.getFullYear(), start.getMonth() + i, 1)
    // The first month is dated from the day they started, so it sorts sensibly
    // against any goods taken that same month.
    const at = i === 0 ? start : month
    charges.push({
      id: `park_${customer.id}_${month.getFullYear()}_${month.getMonth()}`,
      kind: 'parking',
      at: at.toISOString(),
      amount: customer.parkingRate,
      label: `Parking for ${month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`,
    })
  }
  return charges
}

function goodsCharges(customerId: ID, sales: Sale[]): Charge[] {
  const out: Charge[] = []
  for (const sale of sales) {
    if (!isLive(sale) || sale.settlement !== 'credit' || sale.customerId !== customerId) continue
    out.push({
      id: sale.id,
      kind: 'goods',
      at: sale.createdAt,
      amount: sale.total,
      label: sale.items.map((i) => `${i.qty} x ${i.name}`).join(', ') || 'Credit sale',
      sale,
    })
  }
  return out
}

/** Every charge against a customer, goods and parking, oldest first. */
export function chargesFor(
  customer: Customer,
  sales: Sale[],
  asOf: Date = new Date(),
): Charge[] {
  return [...goodsCharges(customer.id, sales), ...parkingCharges(customer, asOf)].sort((a, b) =>
    a.at.localeCompare(b.at),
  )
}

/** How much of each charge the payments have covered, oldest charge first. */
function allocate(charges: Charge[], totalPaid: number): number[] {
  let remaining = totalPaid
  return charges.map((charge) => {
    const covered = Math.min(charge.amount, Math.max(0, remaining))
    remaining -= covered
    return covered
  })
}

export interface Account {
  customerId: ID
  name: string
  /** Everything still owed: goods plus parking. */
  balance: number
  /** Paid beyond what is owed. */
  credit: number
  totalCharged: number
  totalPaid: number
  /** The part of the balance that is goods taken on credit. */
  goodsOwed: number
  /** The part of the balance that is unpaid monthly parking. */
  parkingOwed: number
  /** Date of the oldest charge the payments have not covered. */
  oldestUnpaidAt: string | null
  daysOutstanding: number
  lastActivityAt: string | null
  chargeCount: number

  // Parking, when the customer rents a space -------------------------------
  parks: boolean
  parkingRate: number
  /** False once they have stopped parking. */
  parkingActive: boolean
  parkingBilled: number
  parkingCovered: number
  parkingBehind: number
  /** Last month whose parking fee is fully covered. */
  parkingPaidThrough: Date | null
}

export function buildAccounts(
  customers: Customer[],
  sales: Sale[],
  payments: Payment[],
  asOf: Date = new Date(),
): Map<ID, Account> {
  const paidByCustomer = new Map<ID, Payment[]>()
  for (const payment of payments) {
    const list = paidByCustomer.get(payment.customerId) ?? []
    list.push(payment)
    paidByCustomer.set(payment.customerId, list)
  }

  const accounts = new Map<ID, Account>()

  for (const customer of customers) {
    const charges = chargesFor(customer, sales, asOf)
    const paid = paidByCustomer.get(customer.id) ?? []

    const totalCharged = charges.reduce((sum, c) => sum + c.amount, 0)
    const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0)
    const covered = allocate(charges, totalPaid)

    let goodsOwed = 0
    let parkingOwed = 0
    let parkingBilled = 0
    let parkingCovered = 0
    let parkingPaidThrough: Date | null = null
    let oldestUnpaidAt: string | null = null

    charges.forEach((charge, i) => {
      const short = charge.amount - covered[i]
      if (short > 0.0001 && oldestUnpaidAt === null) oldestUnpaidAt = charge.at

      if (charge.kind === 'parking') {
        parkingBilled++
        parkingOwed += short
        if (short <= 0.0001) {
          parkingCovered++
          parkingPaidThrough = new Date(charge.at)
        }
      } else {
        goodsOwed += short
      }
    })

    // paidThrough should name the month, not the day the space was taken.
    if (parkingPaidThrough) {
      const d: Date = parkingPaidThrough
      parkingPaidThrough = new Date(d.getFullYear(), d.getMonth(), 1)
    }

    const stamps = [...charges.map((c) => c.at), ...paid.map((p) => p.createdAt)].sort()

    accounts.set(customer.id, {
      customerId: customer.id,
      name: customer.name,
      balance: Math.max(0, totalCharged - totalPaid),
      credit: Math.max(0, totalPaid - totalCharged),
      totalCharged,
      totalPaid,
      goodsOwed,
      parkingOwed,
      oldestUnpaidAt,
      daysOutstanding: oldestUnpaidAt ? daysSince(oldestUnpaidAt) : 0,
      lastActivityAt: stamps.length > 0 ? stamps[stamps.length - 1] : null,
      chargeCount: charges.length,

      parks: Boolean(customer.parkingRate && customer.parkingSince),
      parkingRate: customer.parkingRate ?? 0,
      parkingActive: Boolean(customer.parkingRate && customer.parkingSince && !customer.parkingUntil),
      parkingBilled,
      parkingCovered,
      parkingBehind: parkingBilled - parkingCovered,
      parkingPaidThrough,
    })
  }

  return accounts
}

export interface OutstandingCharge {
  id: string
  kind: ChargeKind
  at: string
  description: string
  /** What the charge was for in full. */
  amount: number
  /** How much of it payments have already covered. */
  paid: number
  /** What is still owed on it. */
  due: number
  /** The goods on it, line by line. Empty for parking. */
  items: Array<{ qty: number; name: string; unitPrice: number }>
}

/**
 * Only the charges still owed, oldest first, with the part-paid one showing
 * its remainder. This is what a statement asks for: not the whole history,
 * just what is left to settle.
 */
export function outstandingCharges(
  customer: Customer,
  sales: Sale[],
  payments: Payment[],
  asOf: Date = new Date(),
): OutstandingCharge[] {
  const charges = chargesFor(customer, sales, asOf)
  const totalPaid = payments
    .filter((p) => p.customerId === customer.id)
    .reduce((sum, p) => sum + p.amount, 0)
  const covered = allocate(charges, totalPaid)

  return charges
    .map((charge, i) => ({
      id: charge.id,
      kind: charge.kind,
      at: charge.at,
      description: charge.label,
      amount: charge.amount,
      paid: covered[i],
      due: charge.amount - covered[i],
      items: (charge.sale?.items ?? []).map((line) => ({
        qty: line.qty,
        name: line.name,
        unitPrice: line.unitPrice,
      })),
    }))
    .filter((row) => row.due > 0.001)
}

export interface Repricing {
  /** The credit sales whose lines for the product move to the new price. */
  saleIds: Set<ID>
  /** How many customers those sales belong to. */
  customers: number
  /** How much what they owe goes up in total; negative when it goes down. */
  change: number
  /** Unpaid charges left alone because their price was set by hand. */
  kept: number
}

/**
 * Credit still owed follows the shelf price. Finds the credit sales holding a
 * product at anything other than `price` that payments have not fully covered,
 * part paid included. A charge already paid off keeps the price it was paid at,
 * and so does a line whose price was set by hand on the charge.
 */
export function unpaidRepricing(
  productId: ID,
  price: number,
  customers: Customer[],
  sales: Sale[],
  payments: Payment[],
): Repricing {
  const differs = (line: SaleItem) => line.productId === productId && line.unitPrice !== price

  const holding = new Map<ID, Sale>()
  const owners = new Set<ID>()
  for (const sale of sales) {
    if (!isLive(sale) || sale.settlement !== 'credit' || !sale.customerId) continue
    if (!sale.items.some(differs)) continue
    holding.set(sale.id, sale)
    owners.add(sale.customerId)
  }

  const saleIds = new Set<ID>()
  const affected = new Set<ID>()
  let change = 0
  let kept = 0
  for (const customer of customers) {
    if (!owners.has(customer.id)) continue
    for (const row of outstandingCharges(customer, sales, payments)) {
      const sale = holding.get(row.id)
      if (!sale) continue
      const moving = sale.items.filter((line) => differs(line) && !line.priceSetByHand)
      if (moving.length === 0) {
        kept++
        continue
      }
      saleIds.add(sale.id)
      affected.add(customer.id)
      for (const line of moving) change += line.qty * (price - line.unitPrice)
    }
  }

  return { saleIds, customers: affected.size, change: Math.round(change * 100) / 100, kept }
}

export interface AppliedTo {
  chargeId: string
  kind: ChargeKind
  at: string
  description: string
  /** The goods themselves, so a receipt can list them rather than run them together. */
  items: Array<{ qty: number; name: string }>
  chargeAmount: number
  /** How much of this payment went to this charge. */
  applied: number
  /** Whether this payment finished the charge off. */
  cleared: boolean
}

/**
 * What one payment actually settled. Payments clear the oldest charge first,
 * so a receipt can say which months and which goods the money went to rather
 * than only quoting a balance.
 */
export function paymentAllocation(
  customer: Customer,
  sales: Sale[],
  payments: Payment[],
  paymentId: ID,
  asOf: Date = new Date(),
): AppliedTo[] {
  const charges = chargesFor(customer, sales, asOf)
  const theirs = payments
    .filter((p) => p.customerId === customer.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const remaining = charges.map((c) => c.amount)
  const out: AppliedTo[] = []

  for (const payment of theirs) {
    let left = payment.amount
    for (let i = 0; i < charges.length && left > 0.001; i++) {
      if (remaining[i] <= 0.001) continue
      const take = Math.min(remaining[i], left)
      remaining[i] -= take
      left -= take
      if (payment.id === paymentId) {
        out.push({
          chargeId: charges[i].id,
          kind: charges[i].kind,
          at: charges[i].at,
          description: charges[i].label,
          items: (charges[i].sale?.items ?? []).map((line) => ({
            qty: line.qty,
            name: line.name,
          })),
          chargeAmount: charges[i].amount,
          applied: take,
          cleared: remaining[i] <= 0.001,
        })
      }
    }
    // Later payments cannot change what this one settled.
    if (payment.id === paymentId) break
  }

  return out
}

/**
 * The next collection date. Money is collected on or before this day of the
 * month; once it has passed, the next one is a month out. Clamped to the 28th
 * so the date exists in every month.
 */
export function nextCollectionDate(day: number, from: Date = new Date()): Date {
  const target = Math.min(Math.max(1, Math.round(day)), 28)
  return from.getDate() <= target
    ? new Date(from.getFullYear(), from.getMonth(), target)
    : new Date(from.getFullYear(), from.getMonth() + 1, target)
}

export type LedgerKind = 'goods' | 'parking' | 'payment'

export interface LedgerEntry {
  id: ID
  kind: LedgerKind
  at: string
  amount: number
  description: string
  /** Balance after this entry, counting from the oldest. */
  runningBalance: number
  sale?: Sale
  payment?: Payment
}

/** One customer's ledger, newest entry first. */
export function buildLedger(
  customer: Customer,
  sales: Sale[],
  payments: Payment[],
  asOf: Date = new Date(),
): LedgerEntry[] {
  const rows: Array<Omit<LedgerEntry, 'runningBalance'>> = chargesFor(customer, sales, asOf).map(
    (charge) => ({
      id: charge.id,
      kind: charge.kind,
      at: charge.at,
      amount: charge.amount,
      description: charge.label,
      sale: charge.sale,
    }),
  )

  for (const payment of payments) {
    if (payment.customerId !== customer.id) continue
    rows.push({
      id: payment.id,
      kind: 'payment',
      at: payment.createdAt,
      amount: payment.amount,
      description: payment.note?.trim()
        ? `Payment, ${payment.note.trim()}`
        : `Payment (${paymentMethodLabel(payment.method).toLowerCase()})`,
      payment,
    })
  }

  rows.sort((a, b) => a.at.localeCompare(b.at))

  let running = 0
  return rows
    .map((row) => {
      running += row.kind === 'payment' ? -row.amount : row.amount
      return { ...row, runningBalance: running }
    })
    .reverse()
}

export type AgeBucket = 'current' | 'week' | 'fortnight' | 'overdue'

export const AGE_LABELS: Record<AgeBucket, string> = {
  current: 'This week',
  week: '1–2 weeks',
  fortnight: '2–4 weeks',
  overdue: 'Over a month',
}

export function ageBucket(days: number): AgeBucket {
  if (days <= 7) return 'current'
  if (days <= 14) return 'week'
  if (days <= 30) return 'fortnight'
  return 'overdue'
}

export interface AgingRow {
  bucket: AgeBucket
  label: string
  amount: number
  customers: number
}

export function agingBreakdown(accounts: Account[]): AgingRow[] {
  const buckets: AgeBucket[] = ['current', 'week', 'fortnight', 'overdue']
  const rows = buckets.map<AgingRow>((bucket) => ({
    bucket,
    label: AGE_LABELS[bucket],
    amount: 0,
    customers: 0,
  }))
  const index = new Map(rows.map((r) => [r.bucket, r]))

  for (const account of accounts) {
    if (account.balance <= 0) continue
    const row = index.get(ageBucket(account.daysOutstanding))
    if (!row) continue
    row.amount += account.balance
    row.customers += 1
  }

  return rows
}

// ---------------------------------------------------------------------------
// Parking, viewed on its own
// ---------------------------------------------------------------------------

export interface ParkingSummary {
  /** What the active spaces should bring in every month. */
  monthlyExpected: number
  /** Unpaid parking across everyone, part of their credit balance. */
  unpaid: number
  behindCount: number
  activeParkers: number
}

export function parkingSummary(accounts: Account[]): ParkingSummary {
  const parkers = accounts.filter((a) => a.parks)
  return {
    monthlyExpected: parkers
      .filter((a) => a.parkingActive)
      .reduce((sum, a) => sum + a.parkingRate, 0),
    unpaid: parkers.reduce((sum, a) => sum + a.parkingOwed, 0),
    behindCount: parkers.filter((a) => a.parkingBehind > 0).length,
    activeParkers: parkers.filter((a) => a.parkingActive).length,
  }
}

export function paymentsBetween(payments: Payment[], from: Date, to: Date): Payment[] {
  const start = from.getTime()
  const end = to.getTime()
  return payments.filter((p) => {
    const t = new Date(p.createdAt).getTime()
    return t >= start && t <= end
  })
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

/** Cash that should be in the drawer right now. */
export function vaultBalance(entries: VaultEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

export interface VaultFlow {
  inflow: number
  outflow: number
  net: number
}

/** What went in and out over a period, for the cash-movement summary. */
export function vaultFlow(entries: VaultEntry[], from: Date, to: Date): VaultFlow {
  const start = from.getTime()
  const end = to.getTime()
  let inflow = 0
  let outflow = 0
  for (const entry of entries) {
    const t = new Date(entry.createdAt).getTime()
    if (t < start || t > end) continue
    if (entry.amount >= 0) inflow += entry.amount
    else outflow += -entry.amount
  }
  return { inflow, outflow, net: inflow - outflow }
}

// ---------------------------------------------------------------------------
// Sales & inventory
// ---------------------------------------------------------------------------

export interface Totals {
  revenue: number
  profit: number
  sales: number
  units: number
  cashRevenue: number
  creditRevenue: number
}

export function totals(sales: Sale[]): Totals {
  let revenue = 0
  let cost = 0
  let units = 0
  let count = 0
  let cashRevenue = 0
  let creditRevenue = 0

  for (const sale of sales) {
    if (!isLive(sale)) continue
    count++
    revenue += sale.total
    if (sale.settlement === 'credit') creditRevenue += sale.total
    else cashRevenue += sale.total
    for (const item of sale.items) {
      cost += item.qty * item.unitCost
      units += item.qty
    }
  }

  return { revenue, profit: revenue - cost, sales: count, units, cashRevenue, creditRevenue }
}

export function salesBetween(sales: Sale[], from: Date, to: Date): Sale[] {
  const start = from.getTime()
  const end = to.getTime()
  return sales.filter((s) => {
    const t = new Date(s.createdAt).getTime()
    return t >= start && t <= end
  })
}

export interface DayPoint {
  day: string
  revenue: number
  profit: number
  /** Revenue that went onto customer accounts rather than being paid. */
  credit: number
  /** Payments received against balances. */
  collected: number
}

/** One row per day, including quiet days (zeros, not gaps). */
export function seriesByDay(sales: Sale[], payments: Payment[], days: string[]): DayPoint[] {
  const index = new Map<string, DayPoint>(
    days.map((day) => [day, { day, revenue: 0, profit: 0, credit: 0, collected: 0 }]),
  )

  for (const sale of sales) {
    if (!isLive(sale)) continue
    const row = index.get(dayKey(sale.createdAt))
    if (!row) continue
    row.revenue += sale.total
    row.profit += sale.items.reduce((sum, i) => sum + i.qty * (i.unitPrice - i.unitCost), 0)
    if (sale.settlement === 'credit') row.credit += sale.total
  }

  for (const payment of payments) {
    const row = index.get(dayKey(payment.createdAt))
    if (row) row.collected += payment.amount
  }

  return days.map((d) => index.get(d)!)
}

export interface ProductPerformance {
  productId: ID
  name: string
  units: number
  revenue: number
  profit: number
}

export function productPerformance(sales: Sale[]): ProductPerformance[] {
  const map = new Map<ID, ProductPerformance>()

  for (const sale of sales) {
    if (!isLive(sale)) continue
    for (const item of sale.items) {
      const row = map.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        units: 0,
        revenue: 0,
        profit: 0,
      }
      row.units += item.qty
      row.revenue += item.qty * item.unitPrice
      row.profit += item.qty * (item.unitPrice - item.unitCost)
      map.set(item.productId, row)
    }
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export interface CategoryPerformance {
  category: string
  revenue: number
  units: number
}

export function categoryPerformance(sales: Sale[], products: Product[]): CategoryPerformance[] {
  const categoryOf = new Map(products.map((p) => [p.id, p.category]))
  const map = new Map<string, CategoryPerformance>()

  for (const sale of sales) {
    if (!isLive(sale)) continue
    for (const item of sale.items) {
      const category = categoryOf.get(item.productId) ?? 'Uncategorized'
      const row = map.get(category) ?? { category, revenue: 0, units: 0 }
      row.revenue += item.qty * item.unitPrice
      row.units += item.qty
      map.set(category, row)
    }
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export interface InventoryValue {
  atCost: number
  atRetail: number
  units: number
  skus: number
}

export function inventoryValue(products: Product[]): InventoryValue {
  return products.reduce<InventoryValue>(
    (acc, p) => {
      if (p.status !== 'active') return acc
      acc.atCost += p.stock * p.cost
      acc.atRetail += p.stock * p.price
      acc.units += p.stock
      acc.skus += 1
      return acc
    },
    { atCost: 0, atRetail: 0, units: 0, skus: 0 },
  )
}

export type StockLevel = 'out' | 'low' | 'ok'

export function stockLevel(product: Product): StockLevel {
  if (product.stock <= 0) return 'out'
  if (product.stock <= product.reorderLevel) return 'low'
  return 'ok'
}

export function lowStock(products: Product[]): Product[] {
  return products
    .filter((p) => p.status === 'active' && stockLevel(p) !== 'ok')
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
}

export function marginPct(price: number, cost: number): number {
  if (price <= 0) return 0
  return ((price - cost) / price) * 100
}
