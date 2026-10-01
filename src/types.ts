export type ID = string

export type ProductStatus = 'active' | 'archived'

export interface Product {
  id: ID
  name: string
  category: string
  /** How it is sold over the counter: piece, sachet, pack, bottle. */
  unit: string
  /** What the store pays the wholesaler per unit. */
  cost: number
  /** Tingi price the customer pays. */
  price: number
  stock: number
  /** Stock at or below this level flags the product for restocking. */
  reorderLevel: number
  status: ProductStatus
  createdAt: string
}

export interface Customer {
  id: ID
  name: string
  phone: string
  notes?: string
  createdAt: string

  /**
   * Parking is a monthly fee owed by a customer, so it lives on the customer
   * rather than in a register of its own. `null` means they do not park.
   * The fee accrues every calendar month and, when unpaid, simply forms part
   * of what they owe — there is one balance, not two.
   */
  parkingRate: number | null
  /** Month they started parking; charges accrue from here. */
  parkingSince: string | null
  /** Set when they stop; charges stop accruing from that month. */
  parkingUntil: string | null
}

export interface SaleItem {
  productId: ID
  /** Name copied onto the sale so history survives product edits. */
  name: string
  qty: number
  unitPrice: number
  unitCost: number
  /**
   * Set by hand on a credit charge. Other credit still owed follows the shelf
   * price when it changes; this line keeps the price it was given.
   */
  priceSetByHand?: boolean
  /**
   * Something not in Inventory, typed in with its own name and price. Its
   * productId is made up for it, so it matches no product and never moves
   * stock. Its cost is its price: no profit is counted on it.
   */
  custom?: boolean
}

/** How a sale was settled. `credit` means it went on the customer's account. */
export type Settlement = 'cash' | 'maya' | 'credit'

export interface Sale {
  id: ID
  reference: string
  items: SaleItem[]
  total: number
  settlement: Settlement
  /** Required when settlement is `credit`, otherwise optional. */
  customerId: ID | null
  note?: string
  voided: boolean
  createdAt: string
}

export type PaymentMethod = 'cash' | 'maya' | 'transfer'

/**
 * Money a customer pays against their balance. One stream: it clears whatever
 * they owe, oldest first, whether that is goods or parking.
 */
export interface Payment {
  id: ID
  customerId: ID
  amount: number
  method: PaymentMethod
  note?: string
  /** The day the money changed hands, which may not be the day it was typed in. */
  createdAt: string
}

/**
 * Cash physically in the drawer. Cash sales and cash payments push money in,
 * and the shopkeeper can put money in or take it out by hand. Maya and bank
 * transfers never touch the vault: that money never reaches the box.
 */
export interface VaultEntry {
  id: ID
  /** Signed: positive puts money in, negative takes it out. */
  amount: number
  reason: string
  /** The sale or payment that moved the cash, when it was not done by hand. */
  reference?: string
  createdAt: string
}

export type MovementType = 'in' | 'out' | 'adjustment'

export interface StockMovement {
  id: ID
  productId: ID
  type: MovementType
  /** Signed: positive adds to stock, negative removes. */
  qty: number
  reason: string
  reference?: string
  createdAt: string
}

/**
 * Everything the store holds, as written to a data file or a backup. The
 * version lets an older file be migrated rather than misread.
 */
export interface StoreSnapshot {
  version: number
  savedAt: string
  products: Product[]
  customers: Customer[]
  sales: Sale[]
  payments: Payment[]
  movements: StockMovement[]
  vault: VaultEntry[]
  settings: Settings
}

export type ThemePreference = 'light' | 'dark' | 'system'

/** The look, separate from light or dark: either works in both. */
export type UiStyle = 'futuristic' | 'soft'

export const DEFAULT_UI_STYLE: UiStyle = 'futuristic'

export interface Settings {
  storeName: string
  ownerName: string
  currency: string
  locale: string
  defaultReorderLevel: number
  /** Credit older than this many days is flagged as overdue. */
  overdueAfterDays: number
  /** Pre-filled monthly rate when adding a parker. */
  defaultParkingRate: number
  /** Money is collected on or before this day of the month. */
  collectionDay: number
  theme: ThemePreference
  /** Missing on settings saved before styles existed; read it with a fallback. */
  style?: UiStyle
}
