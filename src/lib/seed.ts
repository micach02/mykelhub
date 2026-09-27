import type {
  Customer,
  Payment,
  Product,
  Sale,
  SaleItem,
  StockMovement,
  VaultEntry,
} from '../types'
import { addDays, uid } from './utils'

/** Mulberry32 — a seeded PRNG so the demo store is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

type Spec = [name: string, category: string, unit: string, cost: number, price: number]

const PRODUCT_SEED: Spec[] = [
  // Snacks
  ['Piattos Cheese 40g', 'Snacks', 'pack', 20, 25],
  ['Nova Multigrain 40g', 'Snacks', 'pack', 20, 25],
  ['V-Cut Spicy BBQ 30g', 'Snacks', 'pack', 20, 25],
  ['Chippy BBQ 27g', 'Snacks', 'pack', 11, 15],
  ['Boy Bawang Cornick 100g', 'Snacks', 'pack', 21, 27],
  ['Sky Flakes Crackers', 'Snacks', 'pc', 7, 10],
  ['Fita Crackers', 'Snacks', 'pc', 7, 10],
  ['Rebisco Sandwich', 'Snacks', 'pc', 6, 8],
  ['Mik-Mik Powdered Milk', 'Snacks', 'pc', 5, 7],

  // Coffee
  ['Nescafé Original 3-in-1', 'Coffee', 'sachet', 8, 11],
  ['Nescafé Creamy White', 'Coffee', 'sachet', 8.5, 12],
  ['Kopiko Black 3-in-1', 'Coffee', 'sachet', 8, 11],
  ['Great Taste White', 'Coffee', 'sachet', 8, 11],
  ['Milo Activ-Go 22g', 'Coffee', 'sachet', 9, 13],
  ['Nescafé Classic 25g Refill', 'Coffee', 'pack', 30, 40],

  // Canned goods
  ['Century Tuna Flakes in Oil 155g', 'Canned Goods', 'can', 38, 48],
  ['Argentina Corned Beef 150g', 'Canned Goods', 'can', 32, 42],
  ['CDO Karne Norte 150g', 'Canned Goods', 'can', 30, 38],
  ['555 Sardines in Tomato 155g', 'Canned Goods', 'can', 22, 28],
  ['Ligo Sardines 155g', 'Canned Goods', 'can', 21, 27],
  ['Mega Sardines 155g', 'Canned Goods', 'can', 22, 28],
  ['Del Monte Fruit Cocktail 234g', 'Canned Goods', 'can', 40, 52],

  // Noodles
  ['Lucky Me Beef na Beef 55g', 'Noodles', 'pack', 11, 15],
  ['Lucky Me Chicken na Chicken 55g', 'Noodles', 'pack', 11, 15],
  ['Lucky Me Instant Mami Beef', 'Noodles', 'pack', 11, 15],
  ['Payless Xtra Big Beef', 'Noodles', 'pack', 12, 16],
  ['Nissin Cup Noodles Seafood', 'Noodles', 'cup', 26, 33],

  // Pancit canton
  ['Lucky Me Pancit Canton Original', 'Pancit Canton', 'pack', 13, 17],
  ['Lucky Me Pancit Canton Chilimansi', 'Pancit Canton', 'pack', 13, 17],
  ['Lucky Me Pancit Canton Kalamansi', 'Pancit Canton', 'pack', 13, 17],
  ['Lucky Me Pancit Canton Sweet & Spicy', 'Pancit Canton', 'pack', 13, 17],
  ['Lucky Me Pancit Canton Extra Hot Chili', 'Pancit Canton', 'pack', 13, 17],
  ['Payless Pancit Canton', 'Pancit Canton', 'pack', 11, 15],
]

/** Regulars who buy on credit. The weight is how often they do. */
const CUSTOMER_SEED: Array<[name: string, phone: string, weight: number]> = [
  ['Aling Nena', '0917 220 1184', 5],
  ['Mang Tonio', '0918 441 7720', 4],
  ['Ate Grace', '0932 118 4409', 4],
  ['Kuya Jun', '0927 663 2210', 3],
  ['Lola Pacing', '0915 908 3376', 3],
  ['Marites', '0906 332 7719', 3],
  ['Boy Tricycle', '0936 880 2214', 2],
  ['Jenny', '0928 663 1120', 2],
]

/** Who also rents a parking space: customer index, monthly rate, months so far. */
const PARKING_SEED: Array<[customerIndex: number, rate: number, months: number]> = [
  [0, 350, 7], // Aling Nena
  [1, 500, 9], // Mang Tonio, tricycle
  [3, 350, 5], // Kuya Jun
  [5, 300, 4], // Marites
  [6, 400, 6], // Boy Tricycle
]

export interface SeedData {
  products: Product[]
  customers: Customer[]
  sales: Sale[]
  payments: Payment[]
  movements: StockMovement[]
  vault: VaultEntry[]
}

/**
 * Builds about two months of trading: mostly small cash sales, a steady trickle
 * of credit, and payments landing around the 15th and month-end paydays.
 */
export function buildSeedData(): SeedData {
  const rand = rng(20260926)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const between = (min: number, max: number) => min + rand() * (max - min)
  const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))

  const now = new Date()
  const DAYS = 60
  /** Times are rolled at random, so today's can overshoot the clock. */
  const notFuture = (d: Date) => (d > now ? new Date(now) : d)

  const products: Product[] = PRODUCT_SEED.map(([name, category, unit, cost, price]) => {
    const reorderLevel = unit === 'sachet' || unit === 'pc' ? intBetween(12, 24) : intBetween(6, 14)
    return {
      id: uid('prd_'),
      name,
      category,
      unit,
      cost,
      price,
      // Opening stock; sales and restocks below settle it to a closing figure.
      stock: intBetween(reorderLevel * 2, reorderLevel * 7),
      reorderLevel,
      status: 'active',
      createdAt: addDays(now, -intBetween(70, 120)).toISOString(),
    }
  })

  const customers: Customer[] = CUSTOMER_SEED.map(([name, phone]) => ({
    id: uid('cus_'),
    name,
    phone,
    parkingRate: null,
    parkingSince: null,
    parkingUntil: null,
    createdAt: addDays(now, -intBetween(60, 150)).toISOString(),
  }))

  // Some of them also rent a parking space by the month.
  for (const [index, rate, months] of PARKING_SEED) {
    const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1, 8, 0, 0, 0)
    customers[index].parkingRate = rate
    customers[index].parkingSince = since.toISOString()
  }

  // A weighted bag so the same few regulars account for most of the credit.
  const creditBag: Customer[] = []
  CUSTOMER_SEED.forEach(([, , weight], i) => {
    for (let n = 0; n < weight; n++) creditBag.push(customers[i])
  })

  const sales: Sale[] = []
  const payments: Payment[] = []
  const movements: StockMovement[] = []
  const stockByProduct = new Map(products.map((p) => [p.id, p.stock]))

  let refSeq = 1000

  for (let d = DAYS - 1; d >= 0; d--) {
    const date = addDays(now, -d)
    const dow = date.getDay()
    const weekendLift = dow === 0 || dow === 6 ? 1.35 : 1
    const txCount = Math.max(2, Math.round(intBetween(6, 14) * weekendLift))

    for (let t = 0; t < txCount; t++) {
      const when = new Date(date)
      when.setHours(intBetween(6, 20), intBetween(0, 59), intBetween(0, 59), 0)
      const at = notFuture(when).toISOString()

      const lineCount = rand() < 0.55 ? 1 : intBetween(2, 3)
      const chosen = new Set<string>()
      const items: SaleItem[] = []

      for (let l = 0; l < lineCount; l++) {
        const product = pick(products)
        if (chosen.has(product.id)) continue
        chosen.add(product.id)
        items.push({
          productId: product.id,
          name: product.name,
          qty: product.price > 30 ? intBetween(1, 2) : intBetween(1, 4),
          unitPrice: product.price,
          unitCost: product.cost,
        })
      }
      if (items.length === 0) continue

      const total = round2(items.reduce((s, i) => s + i.qty * i.unitPrice, 0))
      const onCredit = rand() < 0.28
      const customer = onCredit ? pick(creditBag) : null

      const sale: Sale = {
        id: uid('sal_'),
        reference: `S-${refSeq++}`,
        items,
        total,
        settlement: onCredit ? 'credit' : rand() < 0.15 ? 'maya' : 'cash',
        customerId: customer ? customer.id : null,
        voided: false,
        createdAt: at,
      }
      sales.push(sale)

      for (const item of items) {
        stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) - item.qty)
        movements.push({
          id: uid('mov_'),
          productId: item.productId,
          type: 'out',
          qty: -item.qty,
          reason: onCredit ? 'Credit sale' : 'Sale',
          reference: sale.reference,
          createdAt: at,
        })
      }
    }

    // Restock run from the wholesaler, roughly twice a week.
    if (dow === 1 || dow === 4) {
      const restockCount = intBetween(4, 9)
      for (let r = 0; r < restockCount; r++) {
        const product = pick(products)
        const qty = intBetween(product.reorderLevel, product.reorderLevel * 4)
        const when = new Date(date)
        when.setHours(6, intBetween(0, 45), 0, 0)
        stockByProduct.set(product.id, (stockByProduct.get(product.id) ?? 0) + qty)
        movements.push({
          id: uid('mov_'),
          productId: product.id,
          type: 'in',
          qty,
          reason: 'Restock from wholesaler',
          createdAt: notFuture(when).toISOString(),
        })
      }
    }
  }

  // Most regulars settle part of their balance around payday. What they owe is
  // goods taken on credit plus the monthly parking fee, in one pot.
  for (const customer of customers) {
    const charges: Array<{ at: Date; amount: number }> = sales
      .filter((s) => s.settlement === 'credit' && s.customerId === customer.id)
      .map((s) => ({ at: new Date(s.createdAt), amount: s.total }))

    if (customer.parkingRate && customer.parkingSince) {
      const start = new Date(customer.parkingSince)
      const months =
        (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
      for (let m = 0; m <= months; m++) {
        charges.push({
          at: m === 0 ? start : new Date(start.getFullYear(), start.getMonth() + m, 1, 8),
          amount: customer.parkingRate,
        })
      }
    }

    if (charges.length === 0) continue
    charges.sort((a, b) => a.at.getTime() - b.at.getTime())

    const firstAt = charges[0].at
    // Parking can predate the sales window, so walk from the earliest charge.
    const span = Math.ceil((now.getTime() - firstAt.getTime()) / 86_400_000)
    let owed = 0
    let cursor = 0

    for (let d = span; d >= 0; d--) {
      const date = addDays(now, -d)
      if (date < firstAt) continue

      while (cursor < charges.length && charges[cursor].at <= date) {
        owed += charges[cursor].amount
        cursor++
      }

      const payday = date.getDate() === 15 || date.getDate() === 30
      if (!payday || owed <= 0) continue

      // Jenny is the reliable one; Boy Tricycle keeps letting it ride.
      const share =
        customer.name === 'Jenny'
          ? 1
          : customer.name === 'Boy Tricycle'
            ? between(0.1, 0.3)
            : between(0.45, 0.9)

      const amount = Math.round(owed * share)
      if (amount < 20) continue

      const when = new Date(date)
      when.setHours(intBetween(9, 18), intBetween(0, 59), 0, 0)
      payments.push({
        id: uid('pay_'),
        customerId: customer.id,
        amount,
        method: rand() < 0.25 ? (rand() < 0.5 ? 'maya' : 'transfer') : 'cash',
        createdAt: notFuture(when).toISOString(),
      })
      owed -= amount
    }
  }

  // Settle closing stock, keeping a few products genuinely low.
  for (const product of products) {
    product.stock = Math.max(0, stockByProduct.get(product.id) ?? 0)
  }
  const lowCandidates = [...products].sort(() => rand() - 0.5).slice(0, 5)
  lowCandidates.forEach((p, i) => {
    p.stock = i === 0 ? 0 : intBetween(1, Math.max(2, p.reorderLevel - 1))
  })

  // The vault: cash actually in the drawer. Cash sales and cash payments put
  // money in; buying stock and the owner's own draw take it out again. Money
  // is walked in order so an outflow can only ever take what is really there,
  // which is what stops the drawer going negative.
  const costById = new Map(products.map((p) => [p.id, p.cost]))

  type Pending = { at: string; amount: number; reason: string; reference?: string }
  const pending: Pending[] = []

  const opening = addDays(now, -DAYS)
  opening.setHours(7, 0, 0, 0)
  pending.push({ at: opening.toISOString(), amount: 2000, reason: 'Opening float' })

  for (const sale of sales) {
    if (sale.settlement !== 'cash' || sale.voided) continue
    pending.push({
      at: sale.createdAt,
      amount: sale.total,
      reason: 'Cash sale',
      reference: sale.reference,
    })
  }

  for (const payment of payments) {
    if (payment.method !== 'cash') continue
    pending.push({ at: payment.createdAt, amount: payment.amount, reason: 'Payment received' })
  }

  // Paying the wholesaler on each delivery day, out of the drawer.
  const restockByDay = new Map<string, { cost: number; at: string }>()
  for (const m of movements) {
    if (m.type !== 'in' || m.reason !== 'Restock from wholesaler') continue
    const day = m.createdAt.slice(0, 10)
    const row = restockByDay.get(day) ?? { cost: 0, at: m.createdAt }
    row.cost += m.qty * (costById.get(m.productId) ?? 0)
    restockByDay.set(day, row)
  }
  for (const [, row] of restockByDay) {
    pending.push({ at: row.at, amount: -Math.round(row.cost), reason: 'Paid the wholesaler' })
  }

  // The owner takes something out every Sunday evening.
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = addDays(now, -d)
    if (date.getDay() !== 0) continue
    date.setHours(20, 0, 0, 0)
    if (date > now) continue
    pending.push({ at: date.toISOString(), amount: -intBetween(800, 2000), reason: 'Owner withdrawal' })
  }

  pending.sort((a, b) => a.at.localeCompare(b.at))

  const FLOAT = 500
  const vault: VaultEntry[] = []
  let onHand = 0
  for (const item of pending) {
    let amount = item.amount
    if (amount < 0) {
      // Never pay out more than is in the box, and always leave a float behind.
      const available = Math.max(0, onHand - FLOAT)
      amount = -Math.min(-amount, available)
      if (amount > -50) continue
    }
    onHand += amount
    vault.push({
      id: uid('vlt_'),
      amount: Math.round(amount * 100) / 100,
      reason: item.reason,
      reference: item.reference,
      createdAt: item.at,
    })
  }

  sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  vault.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return { products, customers, sales, payments, movements, vault }
}
