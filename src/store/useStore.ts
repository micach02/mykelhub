import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Customer,
  ID,
  Payment,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  Settings,
  Settlement,
  StockMovement,
  StoreSnapshot,
  VaultEntry,
} from '../types'
import { buildSeedData } from '../lib/seed'
import { cashLent, unpaidRepricing } from '../lib/analytics'
import { uid } from '../lib/utils'

const DEFAULT_SETTINGS: Settings = {
  storeName: 'MykelHub Sari-Sari Store',
  ownerName: 'Mykel',
  currency: 'PHP',
  locale: 'en-PH',
  defaultReorderLevel: 12,
  overdueAfterDays: 30,
  defaultParkingRate: 350,
  collectionDay: 15,
  theme: 'system',
}

export interface RecordSaleInput {
  items: SaleItem[]
  settlement: Settlement
  /** Required when settlement is `credit`. */
  customerId: ID | null
  note?: string
  /** Extra cash put into the vault at the same time, beyond the sale itself. */
  vaultTopUp?: number
}

interface StoreState {
  products: Product[]
  customers: Customer[]
  sales: Sale[]
  payments: Payment[]
  movements: StockMovement[]
  vault: VaultEntry[]
  settings: Settings

  // Products -------------------------------------------------------------
  addProduct: (input: Omit<Product, 'id' | 'createdAt'>) => Product
  /** Setting the price also moves any credit still owed for it to that price. */
  updateProduct: (id: ID, patch: Partial<Product>) => void
  deleteProduct: (id: ID) => void
  setProductStatus: (id: ID, status: Product['status']) => void
  /** Adds stock and records the movement. */
  restock: (id: ID, qty: number, note?: string) => void
  /** Applies a signed delta and records the movement. */
  adjustStock: (id: ID, delta: number, reason: string) => void

  // Customers ------------------------------------------------------------
  addCustomer: (input: Omit<Customer, 'id' | 'createdAt'>) => Customer
  updateCustomer: (id: ID, patch: Partial<Customer>) => void
  deleteCustomer: (id: ID) => void

  // Sales & credit -------------------------------------------------------
  recordSale: (input: RecordSaleInput) => Sale
  voidSale: (id: ID) => void
  /**
   * Corrects a sale after the fact. Changing the lines moves stock by the
   * difference and records why, so the shelf still matches the audit trail.
   * A voided sale cannot be edited: its stock has already gone back.
   */
  updateSale: (
    id: ID,
    patch: { items?: SaleItem[]; customerId?: ID | null; note?: string; occurredAt?: string },
  ) => void
  recordPayment: (input: {
    customerId: ID
    amount: number
    method: PaymentMethod
    note?: string
    /** The day the money changed hands; defaults to now. */
    paidAt?: string
  }) => Payment
  updatePayment: (
    id: ID,
    patch: { amount?: number; method?: PaymentMethod; note?: string; paidAt?: string },
  ) => void
  deletePayment: (id: ID) => void

  // Vault ----------------------------------------------------------------
  /** Puts money in (positive) or takes it out (negative) by hand. */
  adjustVault: (amount: number, reason: string) => void
  /** Sets the vault to a counted figure, recording the difference. */
  countVault: (counted: number, reason?: string) => void
  deleteVaultEntry: (id: ID) => void

  // Parking --------------------------------------------------------------
  /** Puts a customer on a monthly parking fee, or changes the rate. */
  setParkingPlan: (id: ID, rate: number, since: string) => void
  /** Stops the fee accruing from now, keeping everything already owed. */
  stopParking: (id: ID) => void
  resumeParking: (id: ID) => void
  /** Takes the customer off parking entirely, wiping the accrued fees. */
  clearParkingPlan: (id: ID) => void

  // Settings & data ------------------------------------------------------
  /** Everything worth saving, in the shape a data file holds. */
  snapshot: () => StoreSnapshot
  /** Replaces the lot. Used when loading from a data file. */
  replaceAll: (data: StoreSnapshot) => void
  updateSettings: (patch: Partial<Settings>) => void
  loadDemoData: () => void
  clearAllData: () => void
  importData: (
    data: Partial<
      Pick<StoreState, 'products' | 'customers' | 'sales' | 'payments' | 'movements' | 'vault'>
    >,
  ) => void
}

/** Bumped whenever the stored shape changes; see the persist migrate below. */
export const SCHEMA_VERSION = 8

const round2 = (n: number) => Math.round(n * 100) / 100

function nextReference(sales: Sale[]): string {
  const highest = sales.reduce((max, s) => {
    const n = Number.parseInt(s.reference.replace(/\D/g, ''), 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 1000)
  return `S-${highest + 1}`
}

const EMPTY = {
  products: [] as Product[],
  customers: [] as Customer[],
  sales: [] as Sale[],
  payments: [] as Payment[],
  movements: [] as StockMovement[],
  vault: [] as VaultEntry[],
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // A fresh workspace starts empty. Demo data is loadable from Settings.
      ...EMPTY,
      settings: DEFAULT_SETTINGS,

      addProduct: (input) => {
        const product: Product = { ...input, id: uid('prd_'), createdAt: new Date().toISOString() }
        set((s) => ({
          products: [product, ...s.products],
          movements:
            product.stock > 0
              ? [
                  {
                    id: uid('mov_'),
                    productId: product.id,
                    type: 'in' as const,
                    qty: product.stock,
                    reason: 'Opening stock',
                    createdAt: product.createdAt,
                  },
                  ...s.movements,
                ]
              : s.movements,
        }))
        return product
      },

      updateProduct: (id, patch) =>
        set((s) => {
          const products = s.products.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p))
          const price = patch.price
          if (price === undefined) return { products }

          // Credit still owed moves to the new price. Charges already paid off,
          // prices set by hand on a charge, and every cash and Maya sale keep
          // what they were sold at.
          const { saleIds } = unpaidRepricing(id, price, s.customers, s.sales, s.payments)
          if (saleIds.size === 0) return { products }
          return {
            products,
            sales: s.sales.map((sale) => {
              if (!saleIds.has(sale.id)) return sale
              const items = sale.items.map((line) =>
                line.productId === id && !line.priceSetByHand ? { ...line, unitPrice: price } : line,
              )
              const total = round2(items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0))
              return { ...sale, items, total }
            }),
          }
        }),

      deleteProduct: (id) =>
        set((s) => ({
          products: s.products.filter((p) => p.id !== id),
          movements: s.movements.filter((m) => m.productId !== id),
        })),

      setProductStatus: (id, status) =>
        set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, status } : p)) })),

      restock: (id, qty, note) => {
        if (qty <= 0) return
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, stock: p.stock + qty } : p)),
          movements: [
            {
              id: uid('mov_'),
              productId: id,
              type: 'in',
              qty,
              reason: note?.trim() || 'Restock from wholesaler',
              createdAt: new Date().toISOString(),
            },
            ...s.movements,
          ],
        }))
      },

      adjustStock: (id, delta, reason) => {
        if (delta === 0) return
        set((s) => ({
          // Never takes stock below zero, and never lifts a count that a
          // credit sale already took below zero.
          products: s.products.map((p) =>
            p.id === id ? { ...p, stock: Math.max(Math.min(0, p.stock), p.stock + delta) } : p,
          ),
          movements: [
            {
              id: uid('mov_'),
              productId: id,
              type: 'adjustment',
              qty: delta,
              reason: reason || 'Manual adjustment',
              createdAt: new Date().toISOString(),
            },
            ...s.movements,
          ],
        }))
      },

      addCustomer: (input) => {
        const customer: Customer = { ...input, id: uid('cus_'), createdAt: new Date().toISOString() }
        set((s) => ({ customers: [customer, ...s.customers] }))
        return customer
      },

      updateCustomer: (id, patch) =>
        set((s) => ({
          customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
        })),

      deleteCustomer: (id) =>
        set((s) => ({
          customers: s.customers.filter((c) => c.id !== id),
          // Their credit history goes with them, along with any payments.
          sales: s.sales.filter(
            (sale) => !(sale.settlement === 'credit' && sale.customerId === id),
          ),
          payments: s.payments.filter((p) => p.customerId !== id),
        })),

      recordSale: ({ items, settlement, customerId, note, vaultTopUp }) => {
        const total = round2(items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0))
        const createdAt = new Date().toISOString()

        const sale: Sale = {
          id: uid('sal_'),
          reference: nextReference(get().sales),
          items,
          total,
          settlement,
          customerId,
          note,
          voided: false,
          createdAt,
        }

        // Cash borrowed on a credit sale leaves the drawer as it is lent.
        const lent = settlement === 'credit' ? cashLent(sale) : 0
        const borrower = get().customers.find((c) => c.id === customerId)?.name

        set((s) => ({
          sales: [sale, ...s.sales],
          // Not floored at zero: a credit sale may take goods the count says
          // are gone, and voiding it has to put back exactly what it took.
          products: s.products.map((p) => {
            const line = items.find((i) => i.productId === p.id)
            return line ? { ...p, stock: p.stock - line.qty } : p
          }),
          // Items typed in by hand are not on the shelf, so they move no stock.
          movements: [
            ...items.filter((line) => !line.custom).map<StockMovement>((line) => ({
              id: uid('mov_'),
              productId: line.productId,
              type: 'out',
              qty: -line.qty,
              reason: settlement === 'credit' ? 'Credit sale' : 'Sale',
              reference: sale.reference,
              createdAt,
            })),
            ...s.movements,
          ],
          // Only notes and coins reach the drawer: Maya does not, and a
          // credit sale has not been paid for yet.
          vault: [
            ...(settlement === 'cash'
              ? [
                  {
                    id: uid('vlt_'),
                    amount: total,
                    reason: 'Cash sale',
                    reference: sale.reference,
                    createdAt,
                  },
                ]
              : []),
            ...(vaultTopUp && vaultTopUp > 0
              ? [
                  {
                    id: uid('vlt_'),
                    amount: round2(vaultTopUp),
                    reason: 'Cash added to vault',
                    reference: sale.reference,
                    createdAt,
                  },
                ]
              : []),
            ...(lent > 0
              ? [
                  {
                    id: uid('vlt_'),
                    amount: -lent,
                    reason: borrower ? `Cash lent to ${borrower}` : 'Cash lent',
                    reference: sale.reference,
                    createdAt,
                  },
                ]
              : []),
            ...s.vault,
          ],
        }))

        return sale
      },

      voidSale: (id) => {
        const sale = get().sales.find((s) => s.id === id)
        if (!sale || sale.voided) return
        const createdAt = new Date().toISOString()

        set((s) => ({
          sales: s.sales.map((x) => (x.id === id ? { ...x, voided: true } : x)),
          // Voiding puts the goods back on the shelf and drops the charge.
          products: s.products.map((p) => {
            const line = sale.items.find((i) => i.productId === p.id)
            return line ? { ...p, stock: p.stock + line.qty } : p
          }),
          movements: [
            ...sale.items.filter((line) => !line.custom).map<StockMovement>((line) => ({
              id: uid('mov_'),
              productId: line.productId,
              type: 'in',
              qty: line.qty,
              reason: 'Sale voided',
              reference: sale.reference,
              createdAt,
            })),
            ...s.movements,
          ],
          // Cash taken for this sale comes back out of the drawer, and cash
          // lent on it goes back in.
          vault: [
            ...(sale.settlement === 'cash'
              ? [
                  {
                    id: uid('vlt_'),
                    amount: -sale.total,
                    reason: 'Sale voided',
                    reference: sale.reference,
                    createdAt,
                  },
                ]
              : []),
            ...(cashLent(sale) > 0
              ? [
                  {
                    id: uid('vlt_'),
                    amount: cashLent(sale),
                    reason: 'Cash loan voided',
                    reference: sale.reference,
                    createdAt,
                  },
                ]
              : []),
            ...s.vault,
          ],
        }))
      },

      updateSale: (id, patch) => {
        const sale = get().sales.find((s) => s.id === id)
        if (!sale || sale.voided) return

        const items = patch.items ?? sale.items
        const total = round2(items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0))
        const editedAt = new Date().toISOString()

        // What the shelf owes back, per product, comparing before with after.
        // Items typed in by hand were never on the shelf.
        const before = new Map<ID, number>()
        for (const line of sale.items) {
          if (!line.custom) before.set(line.productId, (before.get(line.productId) ?? 0) + line.qty)
        }
        const after = new Map<ID, number>()
        for (const line of items) {
          if (!line.custom) after.set(line.productId, (after.get(line.productId) ?? 0) + line.qty)
        }

        const deltas = new Map<ID, number>()
        for (const productId of new Set([...before.keys(), ...after.keys()])) {
          const delta = (before.get(productId) ?? 0) - (after.get(productId) ?? 0)
          if (delta !== 0) deltas.set(productId, delta)
        }

        const lentBack = round2(cashLent(sale) - cashLent({ items }))

        const updated: Sale = {
          ...sale,
          items,
          total,
          customerId: patch.customerId !== undefined ? patch.customerId : sale.customerId,
          note: patch.note !== undefined ? patch.note : sale.note,
          createdAt: patch.occurredAt ?? sale.createdAt,
        }

        set((s) => ({
          sales: s.sales
            .map((x) => (x.id === id ? updated : x))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          products: s.products.map((product) => {
            const delta = deltas.get(product.id)
            return delta ? { ...product, stock: product.stock + delta } : product
          }),
          movements: [
            ...[...deltas].map<StockMovement>(([productId, delta]) => ({
              id: uid('mov_'),
              productId,
              type: 'adjustment',
              qty: delta,
              reason: 'Sale edited',
              reference: sale.reference,
              createdAt: editedAt,
            })),
            ...s.movements,
          ],
          // A cash sale that changed value changes what is in the drawer too,
          // and so does a change to cash lent: less lent puts money back.
          vault: [
            ...(sale.settlement === 'cash' && total !== sale.total
              ? [
                  {
                    id: uid('vlt_'),
                    amount: round2(total - sale.total),
                    reason: 'Sale edited',
                    reference: sale.reference,
                    createdAt: editedAt,
                  },
                ]
              : []),
            ...(lentBack !== 0
              ? [
                  {
                    id: uid('vlt_'),
                    amount: lentBack,
                    reason: lentBack > 0 ? 'Cash loan reduced' : 'Cash loan increased',
                    reference: sale.reference,
                    createdAt: editedAt,
                  },
                ]
              : []),
            ...s.vault,
          ],
        }))
      },

      recordPayment: ({ customerId, amount, method, note, paidAt }) => {
        const payment: Payment = {
          id: uid('pay_'),
          customerId,
          amount: round2(amount),
          method,
          note,
          createdAt: paidAt ?? new Date().toISOString(),
        }
        set((s) => ({
          // Kept newest-first so the log reads right even when backdated.
          payments: [payment, ...s.payments].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          ),
          vault:
            method === 'cash'
              ? [
                  {
                    id: uid('vlt_'),
                    amount: payment.amount,
                    reason: 'Payment received',
                    createdAt: payment.createdAt,
                  },
                  ...s.vault,
                ]
              : s.vault,
        }))
        return payment
      },

      updatePayment: (id, patch) => {
        const payment = get().payments.find((p) => p.id === id)
        if (!payment) return

        const amount = patch.amount !== undefined ? round2(patch.amount) : payment.amount
        const method = patch.method ?? payment.method
        const updated: Payment = {
          ...payment,
          amount,
          method,
          note: patch.note !== undefined ? patch.note : payment.note,
          createdAt: patch.paidAt ?? payment.createdAt,
        }

        // The drawer followed the original payment, so it follows the edit:
        // the difference goes in or out, and switching off cash takes it all out.
        const wasCash = payment.method === 'cash'
        const isCash = method === 'cash'
        const vaultDelta = (isCash ? amount : 0) - (wasCash ? payment.amount : 0)

        set((s) => ({
          payments: s.payments
            .map((x) => (x.id === id ? updated : x))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          vault:
            vaultDelta !== 0
              ? [
                  {
                    id: uid('vlt_'),
                    amount: round2(vaultDelta),
                    reason: 'Payment edited',
                    createdAt: new Date().toISOString(),
                  },
                  ...s.vault,
                ]
              : s.vault,
        }))
      },

      deletePayment: (id) => {
        const payment = get().payments.find((p) => p.id === id)
        set((s) => ({
          payments: s.payments.filter((p) => p.id !== id),
          // Cash that came in with the payment goes back out of the drawer.
          vault:
            payment && payment.method === 'cash'
              ? [
                  {
                    id: uid('vlt_'),
                    amount: -payment.amount,
                    reason: 'Payment deleted',
                    createdAt: new Date().toISOString(),
                  },
                  ...s.vault,
                ]
              : s.vault,
        }))
      },

      adjustVault: (amount, reason) => {
        if (amount === 0) return
        set((s) => ({
          vault: [
            {
              id: uid('vlt_'),
              amount: round2(amount),
              reason: reason || (amount > 0 ? 'Cash added' : 'Cash taken out'),
              createdAt: new Date().toISOString(),
            },
            ...s.vault,
          ],
        }))
      },

      countVault: (counted, reason) => {
        const current = get().vault.reduce((sum, e) => sum + e.amount, 0)
        const difference = round2(counted - current)
        if (difference === 0) return
        set((s) => ({
          vault: [
            {
              id: uid('vlt_'),
              amount: difference,
              reason: reason?.trim() || 'Counted the drawer',
              createdAt: new Date().toISOString(),
            },
            ...s.vault,
          ],
        }))
      },

      deleteVaultEntry: (id) => set((s) => ({ vault: s.vault.filter((e) => e.id !== id) })),

      setParkingPlan: (id, rate, since) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id
              ? { ...c, parkingRate: rate, parkingSince: since, parkingUntil: null }
              : c,
          ),
        })),

      stopParking: (id) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id ? { ...c, parkingUntil: new Date().toISOString() } : c,
          ),
        })),

      resumeParking: (id) =>
        set((s) => ({
          customers: s.customers.map((c) => (c.id === id ? { ...c, parkingUntil: null } : c)),
        })),

      clearParkingPlan: (id) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id
              ? { ...c, parkingRate: null, parkingSince: null, parkingUntil: null }
              : c,
          ),
        })),

      snapshot: () => {
        const s = get()
        return {
          version: SCHEMA_VERSION,
          savedAt: new Date().toISOString(),
          products: s.products,
          customers: s.customers,
          sales: s.sales,
          payments: s.payments,
          movements: s.movements,
          vault: s.vault,
          settings: s.settings,
        }
      },

      replaceAll: (data) =>
        set({
          products: data.products ?? [],
          customers: data.customers ?? [],
          sales: data.sales ?? [],
          payments: data.payments ?? [],
          movements: data.movements ?? [],
          vault: data.vault ?? [],
          // Defaults fill anything a file written by an older build lacks.
          settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
        }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      loadDemoData: () => set({ ...buildSeedData() }),

      clearAllData: () => set({ ...EMPTY }),

      importData: (data) => set((s) => ({ ...s, ...data })),
    }),
    {
      name: 'mykelhub.store',
      // v3 introduced the credit-account model; v4 renamed the `utang`
      // settlement value to `credit`; v5 added a separate parking register;
      // v6 folded parking onto the customer so unpaid fees join their balance;
      // v7 added the vault and dropped per-customer credit limits; v8 renamed
      // the GCash method to Maya and added bank transfer.
      version: SCHEMA_VERSION,
      migrate: (persisted, from) => {
        const state = (persisted ?? {}) as Partial<StoreState> & {
          parkers?: Array<{ name: string; rate: number; startedAt: string; endedAt: string | null }>
          parkingPayments?: Array<{ parkerId: string | null; amount: number; createdAt: string }>
        }
        // Settings gain fields over time, so defaults fill whatever a stored
        // copy predates rather than the stored copy blanking them.
        const settings = { ...DEFAULT_SETTINGS, ...(state.settings ?? {}) }

        // Anything older than v3 predates the credit model and cannot be
        // mapped onto it, so its records are dropped rather than guessed at.
        if (from < 3) return { ...state, ...EMPTY, settings } as StoreState

        let sales = state.sales ?? []
        let movements = state.movements ?? []
        let customers = state.customers ?? []
        let payments = state.payments ?? []

        if (from < 4) {
          sales = sales.map((sale) =>
            (sale.settlement as string) === 'utang'
              ? { ...sale, settlement: 'credit' as const }
              : sale,
          )
          movements = movements.map((m) =>
            m.reason === 'Sale (utang)' ? { ...m, reason: 'Credit sale' } : m,
          )
        }

        // v5's parkers were their own register. Fold each onto the customer of
        // the same name where there is one, and carry their payments over into
        // the single payment stream so nothing collected is lost.
        if (from < 6) {
          const byName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c]))
          const parkerToCustomer = new Map<string, string>()

          for (const parker of state.parkers ?? []) {
            const match = byName.get(parker.name.trim().toLowerCase())
            if (!match) continue
            parkerToCustomer.set((parker as { id?: string }).id ?? '', match.id)
            customers = customers.map((c) =>
              c.id === match.id
                ? {
                    ...c,
                    parkingRate: parker.rate,
                    parkingSince: parker.startedAt,
                    parkingUntil: parker.endedAt,
                  }
                : c,
            )
          }

          const carried: Payment[] = []
          for (const p of state.parkingPayments ?? []) {
            const customerId = p.parkerId ? parkerToCustomer.get(p.parkerId) : undefined
            if (!customerId) continue
            carried.push({
              id: uid('pay_'),
              customerId,
              amount: p.amount,
              method: 'cash',
              note: 'Parking (carried over)',
              createdAt: p.createdAt,
            })
          }

          payments = [...payments, ...carried].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
        }

        // Customers predating parking need the fields present, not undefined.
        customers = customers.map((c) => ({
          ...c,
          parkingRate: c.parkingRate ?? null,
          parkingSince: c.parkingSince ?? null,
          parkingUntil: c.parkingUntil ?? null,
        }))

        // The vault starts empty on upgrade: there is no way to know what was
        // in the drawer before it was being tracked. Count it in to set it.
        const vault = state.vault ?? []

        // v8: the GCash option became Maya. Anything recorded against the old
        // value is rewritten so history keeps the same meaning.
        if (from < 8) {
          payments = payments.map((x) =>
            (x.method as string) === 'gcash' ? { ...x, method: 'maya' as const } : x,
          )
          sales = sales.map((x) =>
            (x.settlement as string) === 'gcash' ? { ...x, settlement: 'maya' as const } : x,
          )
        }

        return {
          ...state,
          customers,
          sales,
          payments,
          movements,
          vault,
          settings,
        } as StoreState
      },
      partialize: (s) => ({
        products: s.products,
        customers: s.customers,
        sales: s.sales,
        payments: s.payments,
        movements: s.movements,
        vault: s.vault,
        settings: s.settings,
      }),
    },
  ),
)

export const useSettings = () => useStore((s) => s.settings)
